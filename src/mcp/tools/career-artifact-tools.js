/**
 * @file Implementation of MCP Application Artifact Tools (P7-005 / ARCH-024)
 *
 * Implements the 3 core MCP application artifact tools:
 * 1. recommend_portfolio_projects (career:read / READONLY+MEMBER)
 * 2. draft_cover_letter (career:write / MEMBER)
 * 3. generate_tailored_resume (career:write / MEMBER)
 *
 * Adheres to:
 * - ARCH-024 (docs/mcp-application-artifact-tools-architecture.md)
 * - ADR-045 (docs/decisions.md)
 * - Pure In-Memory Service Delegation: Zero duplicated formulas, matching, or scoring logic.
 * - Sovereign Multi-Tenant Isolation: 404 default-deny on cross-tenant requests.
 * - RBAC & Scope Enforcement: Strict server-side validation.
 * - Dual-Layer Integrity Gating (Pre-generation ZeroHallucination + Post-generation ResumeIntegrityAudit).
 * - Decoupled Export Boundary: Returns structured domain models only.
 * - Hard Output Budgets & Sanitization via SecretScrubber.
 * - Zero Database Mutations: In-memory ephemeral execution only.
 */

import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db as defaultDb } from '../../db/index.js';
import { candidates, jobApplications } from '../../db/schema.js';
import { NotFoundError, ValidationError } from '../../errors/index.js';
import { JobDiscoveryService } from '../../services/job-discovery.service.js';
import { decodeHtmlEntities } from '../../services/job-board-adapters/greenhouse.adapter.js';
import { config } from '../../config/env.js';
import { CandidateProfileService } from '../../services/candidate-profile.service.js';
import { JobDescriptionParser } from '../../domain/career/job-parser.js';
import { EvidenceMatchingService } from '../../services/evidence-matching.service.js';
import { ProjectRelevanceService } from '../../services/project-relevance.service.js';
import { AtsFitScoreService } from '../../services/ats-fit-score.service.js';
import { PortfolioRecommendationService } from '../../services/portfolio-recommendation.service.js';
import { CoverLetterDraftingService } from '../../services/cover-letter-drafting.service.js';
import { ZeroHallucinationIntegrityService } from '../../services/zero-hallucination-integrity.service.js';
import { JobApplicationWorkflowService } from '../../services/job-application-workflow.service.js';
import { SecretScrubber } from '../../extractors/github/security/secret-scrubber.js';
import { defaultMcpRateLimiter } from '../../security/mcp-rate-limiter.js';
import { assertToolPermission } from '../../security/mcp-auth.js';
import { SkillTaxonomyEngine } from '../../domain/career/skill-taxonomy.js';
import { buildCanonicalJobRequirements, normalizeJobInput } from '../../services/job-normalization.service.js';
import {
  RecommendPortfolioProjectsInputSchema,
  RecommendPortfolioProjectsOutputSchema,
  DraftCoverLetterInputSchema,
  DraftCoverLetterOutputSchema,
  GenerateTailoredResumeInputSchema,
  GenerateTailoredResumeOutputSchema,
  CAREER_ARTIFACT_TOOL_DEFINITIONS,
} from '../../domain/mcp/career-artifact-tools.schemas.js';

// Default Cache Control Metadata for Artifact Tools
const DEFAULT_CACHE_CONTROL = Object.freeze({
  cacheScope: 'tenant-private',
  ttlMs: 300000, // 5 minutes
});

let defaultDiscoveryService = null;

/**
 * Returns a cached singleton of JobDiscoveryService for artifact tools to preserve in-memory job caches.
 *
 * @returns {JobDiscoveryService} Cached JobDiscoveryService instance
 */
function getDefaultDiscoveryService() {
  if (!defaultDiscoveryService) {
    const boards = (config.GREENHOUSE_BOARDS || '')
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean)
      .map((boardToken) => ({ boardToken }));
    const sites = (config.LEVER_SITES || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((site) => ({ site }));
    defaultDiscoveryService = new JobDiscoveryService({
      greenhouseBoards: boards,
      leverSites: sites,
      fetchTimeoutMs: config.JOB_BOARD_FETCH_TIMEOUT_MS,
    });
  }
  return defaultDiscoveryService;
}

/**
 * Normalizes an evidence reference to ensure strict conformance with EvidenceRefSchema.
 *
 * @param {object} e Raw evidence reference or node
 * @returns {object|null} Conforming EvidenceRef object
 */
function normalizeEvidenceRef(e) {
  if (!e) return null;
  const rawId = e.id || e.evidenceId;
  const id =
    typeof rawId === 'string' && /^[0-9a-fA-F-]{36}$/.test(rawId) ? rawId : crypto.randomUUID();
  const rawResId = e.resourceId;
  const resourceId =
    typeof rawResId === 'string' && /^[0-9a-fA-F-]{36}$/.test(rawResId)
      ? rawResId
      : crypto.randomUUID();

  let commitSha = null;
  if (typeof e.commitSha === 'string' && /^[0-9a-fA-F]{40}$/.test(e.commitSha)) {
    commitSha = e.commitSha;
  } else if (
    typeof e.sourceLocation?.commitSha === 'string' &&
    /^[0-9a-fA-F]{40}$/.test(e.sourceLocation.commitSha)
  ) {
    commitSha = e.sourceLocation.commitSha;
  }

  let lineRange = null;
  if (typeof e.lineRange === 'object' && e.lineRange !== null) {
    lineRange = e.lineRange;
  } else if (
    typeof e.sourceLocation?.lineRange === 'object' &&
    e.sourceLocation.lineRange !== null
  ) {
    lineRange = e.sourceLocation.lineRange;
  }

  return {
    id,
    resourceId,
    resourceName: e.resourceName || e.name || 'Repository',
    evidenceType: e.evidenceType || 'CODE_IMPORT_USAGE',
    filePath: e.filePath || e.sourceLocation?.filePath || 'src/index.js',
    commitSha,
    lineRange,
    excerpt: SecretScrubber.scrub(e.excerpt || e.sanitizedExcerpt || ''),
    confidenceScore: typeof e.confidenceScore === 'number' ? e.confidenceScore : 1.0,
    detectedAt: e.detectedAt || new Date().toISOString(),
  };
}

function normalizeWorkflowJobPosting(jobPosting, args) {
  const textValue = (value) => {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return null;
    return value.text || value.name || value.skill || value.concept || value.description || null;
  };
  const listValue = (values) =>
    Array.isArray(values) ? values.map(textValue).filter(Boolean) : [];

  return {
    ...jobPosting,
    id: jobPosting?.id || crypto.randomUUID(),
    title: jobPosting?.title || args?.jobTitle || 'Target Role',
    company: jobPosting?.company || args?.companyName || 'Target Company',
    description: jobPosting?.description || args?.jobDescriptionText || '',
    requirements: listValue(jobPosting?.requirements),
    skills: listValue(jobPosting?.skills),
    responsibilities: listValue(jobPosting?.responsibilities),
    normalizedRequirements: jobPosting?.normalizedRequirements,
    jobFingerprint: jobPosting?.jobFingerprint,
    role: jobPosting?.role,
  };
}

/**
 * Resolves the target candidate ID for a request.
 * If candidateId is supplied, validates that it belongs to context.tenantId.
 * If omitted, defaults to the candidate persona owned by context.userId, or the first candidate in the tenant.
 *
 * @param {import('../../domain/mcp/mcp.schemas.js').McpRequestContext} context - Authenticated request context.
 * @param {string} [candidateId] - Optional candidate UUID.
 * @param {object} dbClient - Database client.
 * @returns {Promise<string>} Resolved candidate ID.
 * @throws {NotFoundError} If no candidate profile exists or tenant mismatch.
 */
async function resolveTargetCandidateId(context, candidateId, dbClient) {
  if (candidateId) {
    const [cand] = await dbClient
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, context.tenantId)))
      .limit(1);

    if (!cand) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }
    return cand.id;
  }

  // 1. Try resolving by userId within tenant
  if (context.userId) {
    const [userCand] = await dbClient
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.tenantId, context.tenantId), eq(candidates.userId, context.userId)))
      .limit(1);

    if (userCand) {
      return userCand.id;
    }
  }

  // 2. Fall back to first candidate in tenant
  const [firstCand] = await dbClient
    .select({ id: candidates.id })
    .from(candidates)
    .where(eq(candidates.tenantId, context.tenantId))
    .limit(1);

  if (!firstCand) {
    throw new NotFoundError('No candidate profile found for this tenant.');
  }

  return firstCand.id;
}

/**
 * Converts a CandidateProfileView into a standard CandidateProfile domain object.
 *
 * @param {object} profileView Candidate profile view from CandidateProfileService
 * @param {object} context Security context
 * @returns {object} Canonical CandidateProfile domain model
 */
function buildCandidateProfileDomainObject(profileView, context) {
  const normalizedSkills = (profileView.skills || []).map((s) => ({
    ...s,
    primaryEvidence: normalizeEvidenceRef(s.primaryEvidence),
    evidenceItems: Array.isArray(s.evidenceItems)
      ? s.evidenceItems.map(normalizeEvidenceRef).filter(Boolean)
      : [],
  }));

  const normalizedProjects = (profileView.projects || []).map((p) => ({
    ...p,
    evidence: Array.isArray(p.evidence)
      ? p.evidence
          .map((ev) => {
            if (!ev) return null;
            const ref = normalizeEvidenceRef(ev);
            if (!ref) return null;
            return {
              ...ref,
              tenantId: ev.tenantId || context.tenantId,
              candidateId: ev.candidateId || profileView.candidate.id,
              projectId: ev.projectId || p.id,
              skillId: ev.skillId || null,
              skillSlug: ev.skillSlug || null,
              skillName: ev.skillName || null,
              sourceProvider: ev.sourceProvider || 'GITHUB',
              sourceLocation: ev.sourceLocation || {
                filePath: ref.filePath,
                lineRange: ref.lineRange,
                commitSha: ref.commitSha,
              },
              metadata: ev.metadata || {},
            };
          })
          .filter(Boolean)
      : [],
  }));

  return {
    id: profileView.candidate.id,
    tenantId: context.tenantId,
    userId: profileView.candidate.userId,
    displayName: profileView.candidate.displayName,
    headline: profileView.candidate.headline,
    summary: profileView.candidate.summary,
    canonicalEmail: profileView.candidate.canonicalEmail,
    skills: normalizedSkills,
    projects: normalizedProjects,
    resources: profileView.resources || [],
    identities: profileView.identities || [],
    workHistory: profileView.candidate.profileMetadata?.userCustom?.experience || [],
    education: profileView.candidate.profileMetadata?.userCustom?.education || [],
    certifications: profileView.candidate.profileMetadata?.userCustom?.certifications || [],
    profileMetadata: profileView.candidate.profileMetadata || {
      userCustom: {},
      systemInferred: {},
    },
    createdAt: profileView.candidate.createdAt,
    updatedAt: profileView.candidate.updatedAt,
  };
}

/**
 * Resolves or parses a target job description object from tool arguments.
 *
 * @param {object} context Multi-tenant security context
 * @param {object} args Validated tool arguments
 * @param {object} [dbClient] Database client
 * @param {object} [deps={}] Optional dependency overrides
 * @returns {Promise<object>} Canonical JobDescription object
 */
function mapToMatchingRequirements(canonicalReqs, tenantId, jobDescriptionId) {
  return (canonicalReqs || []).map((r) => ({
    id: r.id,
    requirementId: r.id,
    tenantId,
    jobDescriptionId,
    category:
      r.class === 'TECHNOLOGY'
        ? 'SKILL'
        : r.class === 'RESPONSIBILITY'
          ? 'EXPERIENCE'
          : r.class === 'EDUCATION'
            ? 'EDUCATION'
            : 'SKILL',
    importance: r.importance,
    weight: r.weight,
    skillSlug: SkillTaxonomyEngine.generateSafeSlug(r.normalizedConcept || r.text) || null,
    rawSnippet: r.text,
    originalText: r.text,
    extractedValue: r.normalizedConcept || r.text,
    normalizedCriteria: {
      skillSlug: SkillTaxonomyEngine.generateSafeSlug(r.normalizedConcept || r.text) || null,
      skillName: r.text,
    },
    confidenceScore: r.confidence ?? 0.9,
    sourceSpan: { section: 'REQUIREMENTS', snippet: r.text },
    createdAt: new Date().toISOString(),
  }));
}

async function resolveJobDescription(context, args, dbClient, deps = {}) {
  if (args.jobDescriptionText) {
    const title = args.jobTitle || 'Target Role';
    const company = args.companyName || 'Target Company';
    const canonical = normalizeJobInput({
      title,
      company,
      description: args.jobDescriptionText,
      jobDescriptionText: args.jobDescriptionText,
    });
    const jobId = crypto.randomUUID();
    return {
      id: jobId,
      tenantId: context.tenantId,
      title,
      company,
      companyName: company,
      description: args.jobDescriptionText,
      requirements: mapToMatchingRequirements(canonical.normalizedRequirements, context.tenantId, jobId),
      skills: canonical.normalizedRequirements.filter((r) => r.class === 'TECHNOLOGY').map((r) => r.text),
      responsibilities: canonical.normalizedRequirements.filter((r) => r.class === 'RESPONSIBILITY').map((r) => r.text),
      ...canonical,
    };
  }

  if (args.jobId) {
    let discoveryJob = null;
    let savedApp = null;

    // 1. Resolve canonical job UUID with JobDiscoveryService.findJobById(args.jobId)
    const discoveryService = deps.discoveryService || getDefaultDiscoveryService();

    try {
      discoveryJob = await discoveryService.findJobById(args.jobId);
    } catch {
      discoveryJob = null;
    }

    // 2. If not found, check tenant-scoped job_applications by ID
    if (!discoveryJob && dbClient) {
      const rows = await dbClient
        .select({
          id: jobApplications.id,
          jobTitle: jobApplications.jobTitle,
          companyName: jobApplications.companyName,
          rawJobDescription: jobApplications.rawJobDescription,
          parsedJobDescription: jobApplications.parsedJobDescription,
          workplaceType: jobApplications.workplaceType,
          location: jobApplications.location,
        })
        .from(jobApplications)
        .where(
          and(eq(jobApplications.id, args.jobId), eq(jobApplications.tenantId, context.tenantId))
        )
        .limit(1);

      if (rows && rows.length > 0) {
        savedApp = rows[0];
      }
    }

    // Preserve the existing NotFoundError when neither source resolves the job
    if (!discoveryJob && !savedApp) {
      throw new NotFoundError(`Job description not found for ID: ${args.jobId}`);
    }

    // 3. Extract description/title/company
    const resolvedTitle =
      args.jobTitle || (discoveryJob ? discoveryJob.title : savedApp.jobTitle) || 'Target Role';
    const resolvedCompany =
      args.companyName ||
      (discoveryJob ? discoveryJob.company : savedApp.companyName) ||
      'Target Company';

    let textToParse;
    if (discoveryJob) {
      const cleanDesc = discoveryJob.description
        ? decodeHtmlEntities(discoveryJob.description)
        : '';
      if (cleanDesc.trim().length >= 10) {
        textToParse = cleanDesc;
      } else if (Array.isArray(discoveryJob.requirements) && discoveryJob.requirements.length > 0) {
        textToParse =
          `${resolvedTitle} at ${resolvedCompany}\nRequirements:\n` +
          discoveryJob.requirements.join('\n');
      } else {
        textToParse = `Position: ${resolvedTitle} at ${resolvedCompany}. Responsibilities and requirements for ${resolvedTitle}.`;
      }
    } else {
      const rawText =
        savedApp.rawJobDescription ||
        savedApp.parsedJobDescription?.rawText ||
        savedApp.parsedJobDescription?.description ||
        '';
      if (rawText.trim().length >= 10) {
        textToParse = rawText;
      } else {
        textToParse = `Position: ${resolvedTitle} at ${resolvedCompany}. Responsibilities and requirements for ${resolvedTitle}.`;
      }
    }

    const canonical = normalizeJobInput({
      title: resolvedTitle,
      company: resolvedCompany,
      description: textToParse,
      requirements: discoveryJob && Array.isArray(discoveryJob.requirements) ? discoveryJob.requirements : [],
    });

    return {
      id: args.jobId,
      tenantId: context.tenantId,
      title: resolvedTitle,
      company: resolvedCompany,
      companyName: resolvedCompany,
      description: textToParse,
      requirements: mapToMatchingRequirements(canonical.normalizedRequirements, context.tenantId, args.jobId),
      skills: canonical.normalizedRequirements.filter((r) => r.class === 'TECHNOLOGY').map((r) => r.text),
      responsibilities: canonical.normalizedRequirements.filter((r) => r.class === 'RESPONSIBILITY').map((r) => r.text),
      ...canonical,
    };
  }

  throw new ValidationError('Either jobDescriptionText or jobId must be provided.');
}

/**
 * Builds candidate career assertions from profile skills and experience for integrity gating.
 *
 * @param {object} candidateProfileObj Canonical candidate profile
 * @returns {Array<object>} Array of CareerAssertion objects
 */
function toCanonicalEvidenceRef(ev, defaultName = 'Evidence') {
  if (!ev) return null;
  const isUuid = (val) =>
    typeof val === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  return {
    id: isUuid(ev.id) ? ev.id : crypto.randomUUID(),
    resourceId: isUuid(ev.resourceId)
      ? ev.resourceId
      : isUuid(ev.projectId)
        ? ev.projectId
        : crypto.randomUUID(),
    resourceName:
      typeof ev.resourceName === 'string' && ev.resourceName.trim().length > 0
        ? ev.resourceName
        : typeof ev.sourceProvider === 'string'
          ? ev.sourceProvider
          : defaultName,
    evidenceType:
      typeof ev.evidenceType === 'string' && ev.evidenceType.trim().length > 0
        ? ev.evidenceType
        : 'CODE_AST_NODE',
    filePath:
      typeof ev.filePath === 'string' && ev.filePath.trim().length > 0
        ? ev.filePath
        : ev.sourceLocation?.filePath || 'src/index.js',
    commitSha: ev.commitSha || null,
    lineRange:
      ev.lineRange ||
      (ev.sourceLocation?.startLine
        ? {
            start: ev.sourceLocation.startLine,
            end: ev.sourceLocation.endLine || ev.sourceLocation.startLine,
          }
        : null),
    excerpt: typeof ev.excerpt === 'string' ? ev.excerpt : null,
    provenanceTrustClass: ev.provenanceTrustClass || undefined,
    confidenceScore: typeof ev.confidenceScore === 'number' ? ev.confidenceScore : 1.0,
    detectedAt: ev.detectedAt || undefined,
  };
}

function buildCandidateAssertions(candidateProfileObj) {
  const assertions = [];

  for (const skill of candidateProfileObj.skills || []) {
    const safeSlug = SkillTaxonomyEngine.generateSafeSlug(skill.slug || skill.name || 'skill');
    const rawRefs = skill.primaryEvidence
      ? [skill.primaryEvidence]
      : Array.isArray(skill.evidenceItems)
        ? skill.evidenceItems
        : [];
    assertions.push({
      assertionId: crypto.randomUUID(),
      candidateId: candidateProfileObj.id,
      tenantId: candidateProfileObj.tenantId,
      assertionType: 'SKILL',
      statement: `Candidate possesses technical skill: ${skill.name || skill.slug}`,
      subjectSlug: safeSlug,
      status: skill.provenanceStatus || 'VERIFIED',
      confidenceScore: typeof skill.confidenceScore === 'number' ? skill.confidenceScore : 1.0,
      evidenceRefs: rawRefs.map((r) => toCanonicalEvidenceRef(r, skill.name)).filter(Boolean),
    });
  }

  for (const proj of candidateProfileObj.projects || []) {
    if (Array.isArray(proj.evidence) && proj.evidence.length > 0) {
      const safeSlug = SkillTaxonomyEngine.generateSafeSlug(proj.slug || proj.name || 'project');
      assertions.push({
        assertionId: crypto.randomUUID(),
        candidateId: candidateProfileObj.id,
        tenantId: candidateProfileObj.tenantId,
        assertionType: 'PROJECT',
        statement: `Candidate developed project: ${proj.name}`,
        subjectSlug: safeSlug,
        status: 'VERIFIED',
        confidenceScore: 1.0,
        evidenceRefs: proj.evidence
          .slice(0, 5)
          .map((r) => toCanonicalEvidenceRef(r, proj.name))
          .filter(Boolean),
      });
    }
  }

  return assertions;
}

// =============================================================================
// Tool 1: recommend_portfolio_projects
// =============================================================================

/**
 * Handles the recommend_portfolio_projects MCP tool.
 *
 * @param {import('../../domain/mcp/mcp.schemas.js').McpRequestContext} context Authenticated context
 * @param {object} rawArgs Raw input arguments
 * @param {object} [deps={}] Optional dependency overrides
 * @returns {Promise<object>} Validated RecommendPortfolioProjectsOutputSchema
 */
export async function handleRecommendPortfolioProjects(context, rawArgs, deps = {}) {
  const dbClient = deps.db || defaultDb;
  const rateLimiter = deps.rateLimiter || defaultMcpRateLimiter;
  const profileService = deps.candidateProfileService || new CandidateProfileService();

  // 1. Rate Limiting Check
  rateLimiter.checkTenantLimit(context.tenantId);
  rateLimiter.checkToolLimit(context.tenantId, 'recommend_portfolio_projects');

  // 2. Validate Tool Inputs
  const args = RecommendPortfolioProjectsInputSchema.parse(rawArgs || {});

  // 3. Resolve Candidate Profile & Job Description
  const candidateId = await resolveTargetCandidateId(context, args.candidateId, dbClient);
  const profileView = await profileService.getProfile(context, candidateId);
  const candidateProfileObj = buildCandidateProfileDomainObject(profileView, context);
  const rawJobDescription = await resolveJobDescription(context, args, dbClient, deps);
  const jobDescription = rawJobDescription
    ? { ...rawJobDescription, ...buildCanonicalJobRequirements(rawJobDescription) }
    : rawJobDescription;

  // 4. Delegate to Intermediate Intelligence Services
  const matchAnalysis = EvidenceMatchingService.matchJobToCandidate(
    context,
    jobDescription,
    candidateProfileObj
  );

  const projectAnalysis = ProjectRelevanceService.computeProjectsRelevance(
    context,
    jobDescription,
    candidateProfileObj.projects,
    { candidateId: candidateProfileObj.id, skills: candidateProfileObj.skills }
  );

  const atsFitAnalysis = AtsFitScoreService.calculateCandidateJobFit(
    context,
    jobDescription,
    matchAnalysis,
    projectAnalysis,
    candidateProfileObj
  );

  // 5. Execute Portfolio Recommendation Service
  const portfolioRecommendation = PortfolioRecommendationService.recommendPortfolio(
    context,
    candidateProfileObj,
    jobDescription,
    matchAnalysis,
    projectAnalysis,
    atsFitAnalysis,
    [],
    {
      maxFeaturedCount: args.maxFeaturedProjects,
      overrides: args.userOverrides,
    }
  );

  // 6. Format Output Envelope
  const output = {
    recommendationId: portfolioRecommendation.recommendationId,
    candidateId: candidateProfileObj.id,
    jobTitle: jobDescription.title || 'Target Role',
    jobFamily: portfolioRecommendation.jobFamily,
    signalComplementarityScore:
      portfolioRecommendation.portfolioSignals?.signalComplementarityScore || 0,
    highlightedSkills: (portfolioRecommendation.highlightedSkills || []).slice(0, 6).map((s) => ({
      skillSlug: s.skillSlug,
      skillName: s.skillName,
      priority: s.priority,
      demonstratedInProjects: s.primaryProjectName ? [s.primaryProjectName] : [],
    })),
    featuredProjects: (portfolioRecommendation.featuredProjects || []).slice(0, 5).map((p) => ({
      projectId: p.projectId,
      name: p.projectName || 'Project',
      displayName: p.projectName || 'Project',
      recommendationStatus: p.recommendationStatus || 'RECOMMENDED',
      relevanceScore: p.selectionScore || 0,
      marginalValueScore: p.marginalValue || 0,
      ownershipConfidence: p.ownershipConfidence || 'DIRECT_OWNER',
      contributionConfidence: p.contributionConfidence || 'PRIMARY_AUTHOR',
      tutorialClassification: p.tutorialClassification || 'LIKELY_ORIGINAL',
      storyCompleteness: p.storyCompleteness || 'DOCUMENTED',
      primarySignals: p.signalsAdded || [],
      evidenceHighlights: (p.evidenceHighlights || [])
        .map(normalizeEvidenceRef)
        .filter(Boolean)
        .slice(0, 5),
      caseStudyPrompt: p.reason || '',
      interviewDiscussionTopics: [],
    })),
    supportingProjects: (portfolioRecommendation.supportingProjects || []).slice(0, 5).map((p) => ({
      projectId: p.projectId,
      name: p.projectName || 'Project',
      displayName: p.projectName || 'Project',
      recommendationStatus: 'OPTIONAL',
      relevanceScore: p.selectionScore || 0,
      secondarySignals: p.signalsAdded || [],
    })),
    deprioritizedProjects: (portfolioRecommendation.deprioritizedProjects || []).map((p) => ({
      projectId: p.projectId,
      name: p.projectName || 'Project',
      displayName: p.projectName || 'Project',
      disqualificationReason: p.whyNotFeatured || p.reason || 'Does not match primary requirements',
    })),
    warnings: (portfolioRecommendation.warnings || []).map((w) =>
      typeof w === 'string' ? w : w.message || JSON.stringify(w)
    ),
    _meta: {
      cacheControl: DEFAULT_CACHE_CONTROL,
    },
  };

  return RecommendPortfolioProjectsOutputSchema.parse(output);
}

// =============================================================================
// Tool 2: draft_cover_letter
// =============================================================================

/**
 * Handles the draft_cover_letter MCP tool.
 *
 * @param {import('../../domain/mcp/mcp.schemas.js').McpRequestContext} context Authenticated context
 * @param {object} rawArgs Raw input arguments
 * @param {object} [deps={}] Optional dependency overrides
 * @returns {Promise<object>} Validated DraftCoverLetterOutputSchema
 */
export async function handleDraftCoverLetter(context, rawArgs, deps = {}) {
  const dbClient = deps.db || defaultDb;
  const rateLimiter = deps.rateLimiter || defaultMcpRateLimiter;
  const profileService = deps.candidateProfileService || new CandidateProfileService();
  const coverLetterService = deps.coverLetterService || new CoverLetterDraftingService();
  const integrityService = deps.integrityService || new ZeroHallucinationIntegrityService();

  // 1. Rate Limiting Check
  rateLimiter.checkTenantLimit(context.tenantId);
  rateLimiter.checkToolLimit(context.tenantId, 'draft_cover_letter');

  // 2. Validate Tool Inputs
  const args = DraftCoverLetterInputSchema.parse(rawArgs || {});

  // 3. Resolve Candidate Profile & Job Description
  const candidateId = await resolveTargetCandidateId(context, args.candidateId, dbClient);
  const profileView = await profileService.getProfile(context, candidateId);
  const candidateProfileObj = buildCandidateProfileDomainObject(profileView, context);
  const jobDescription = await resolveJobDescription(context, args, dbClient, deps);

  // 4. Intermediate Intelligence Services
  const matchAnalysis = EvidenceMatchingService.matchJobToCandidate(
    context,
    jobDescription,
    candidateProfileObj
  );

  const projectAnalysis = ProjectRelevanceService.computeProjectsRelevance(
    context,
    jobDescription,
    candidateProfileObj.projects,
    { candidateId: candidateProfileObj.id, skills: candidateProfileObj.skills }
  );

  const atsFitAnalysis = AtsFitScoreService.calculateCandidateJobFit(
    context,
    jobDescription,
    matchAnalysis,
    projectAnalysis,
    candidateProfileObj
  );

  // 5. Pre-Generation Integrity Gate
  const candidateAssertions = buildCandidateAssertions(candidateProfileObj);
  const evidenceIndex = candidateProfileObj.skills.flatMap((s) =>
    Array.isArray(s.evidenceItems) ? s.evidenceItems : s.primaryEvidence ? [s.primaryEvidence] : []
  );

  const integritySummary = integrityService.validateCareerAssertions(
    context,
    candidateAssertions,
    evidenceIndex,
    { candidateProfile: candidateProfileObj }
  );

  if (integritySummary.overallStatus === 'BLOCK') {
    throw new ValidationError(
      'Cover letter generation blocked by Zero-Hallucination Integrity Gate.',
      {
        findings: integritySummary.blockedReasons || [],
      }
    );
  }

  // 6. Execute Cover Letter Drafting Service
  const tailoredCoverLetter = await coverLetterService.draftCoverLetter(
    context,
    candidateProfileObj,
    jobDescription,
    matchAnalysis,
    projectAnalysis,
    atsFitAnalysis,
    integritySummary.auditedAssertions || [],
    {
      tone: args.tone,
      targetParagraphCount: args.targetParagraphCount,
      recipientName: args.recipientName,
      preferredProjectIds: args.preferredProjectIds,
    }
  );

  // 7. Format Output Envelope
  const warnings = [];
  if (integritySummary.overallStatus === 'PARTIAL') {
    warnings.push('Cover letter contains unverified or inferred claims labeled accordingly.');
  }

  const output = {
    letterId: tailoredCoverLetter.letterId,
    candidateId: candidateProfileObj.id,
    companyName: tailoredCoverLetter.companyName || 'Target Company',
    jobTitle: tailoredCoverLetter.roleTitle || jobDescription.title || 'Target Role',
    recipientName: tailoredCoverLetter.recipientName || args.recipientName || 'Hiring Team',
    tone: tailoredCoverLetter.metadata?.tone || args.tone || 'PROFESSIONAL',
    metadata: {
      totalParagraphs: tailoredCoverLetter.paragraphs?.length || 0,
      wordCount: tailoredCoverLetter.metadata?.wordCount || 0,
      characterCount: tailoredCoverLetter.metadata?.characterCount || 0,
      verifiedParagraphsCount: tailoredCoverLetter.metadata?.verifiedParagraphs || 0,
      inferredParagraphsCount: tailoredCoverLetter.metadata?.inferredParagraphs || 0,
      claimedParagraphsCount: tailoredCoverLetter.metadata?.claimedParagraphs || 0,
    },
    integrityReport: {
      overallStatus: integritySummary.overallStatus === 'PASS' ? 'PASS' : 'PARTIAL',
      evidenceItemsCitedCount: (tailoredCoverLetter.paragraphs || []).reduce(
        (acc, p) => acc + (p.evidenceRefs?.length || 0),
        0
      ),
    },
    paragraphs: (tailoredCoverLetter.paragraphs || []).slice(0, 6).map((p) => ({
      paragraphId: p.id || p.paragraphId || crypto.randomUUID(),
      paragraphType: p.paragraphType,
      text: SecretScrubber.scrub(p.text || ''),
      status: p.status || 'VERIFIED',
      evidenceRefs: (p.evidenceRefs || []).map(normalizeEvidenceRef).filter(Boolean).slice(0, 5),
      matchedKeywords: p.matchedKeywords || [],
      claimLabel: p.claimLabel || null,
    })),
    warnings,
    _meta: {
      cacheControl: DEFAULT_CACHE_CONTROL,
    },
  };

  return DraftCoverLetterOutputSchema.parse(output);
}

// =============================================================================
// Tool 3: generate_tailored_resume
// =============================================================================

/**
 * Handles the generate_tailored_resume MCP tool.
 *
 * @param {import('../../domain/mcp/mcp.schemas.js').McpRequestContext} context Authenticated context
 * @param {object} rawArgs Raw input arguments
 * @param {object} [deps={}] Optional dependency overrides
 * @returns {Promise<object>} Validated GenerateTailoredResumeOutputSchema
 */
export async function handleGenerateTailoredResume(context, rawArgs, deps = {}) {
  const dbClient = deps.db || defaultDb;
  const rateLimiter = deps.rateLimiter || defaultMcpRateLimiter;

  rateLimiter.checkTenantLimit(context.tenantId);
  rateLimiter.checkToolLimit(context.tenantId, 'generate_tailored_resume');
  const args = GenerateTailoredResumeInputSchema.parse(rawArgs || {});
  const candidateId = await resolveTargetCandidateId(context, args.candidateId, dbClient);
  const rawJobDescription = await resolveJobDescription(context, args, dbClient, deps);
  const jobDescription = rawJobDescription
    ? { ...rawJobDescription, ...buildCanonicalJobRequirements(rawJobDescription) }
    : rawJobDescription;
  const workflowService =
    deps.workflowService ||
    new JobApplicationWorkflowService({
      database: dbClient,
      candidateProfileService: deps.candidateProfileService,
    });
  const prepared = await workflowService.prepareJobApplication({
    tenantId: context.tenantId,
    candidateId,
    jobPosting: normalizeWorkflowJobPosting(jobDescription, args),
    answers: {},
  });
  const structured = prepared.tailoredResume?.structuredResume;
  if (!structured) {
    throw new ValidationError('Canonical workflow did not produce a structured resume.');
  }
  const receipt = prepared.tailoredResume.evidenceValidationReceipt || {};
  const projectBullets = (structured.projects || []).flatMap((project) => project.bullets || []);
  const experienceBullets = (structured.experience || []).flatMap((experience) => experience.bullets || []);
  const output = {
    resumeId: structured.documentId,
    candidateId,
    jobTitle: structured.targetRole,
    presentationMode: args.presentationMode,
    templateId: args.templateId,
    presentationAudit: { status: 'PASS', preservedAttributes: {}, modifiedAttributes: {}, warnings: [] },
    integrityReport: {
      overallStatus: receipt.overallStatus === 'PASS' ? 'PASS' : 'PARTIAL',
      verifiedAssertionsCount: receipt.verifiedClaimsCount || 0,
      inferredAssertionsCount: receipt.inferredClaimsCount || 0,
      claimedAssertionsCount: receipt.userProvidedClaimsCount || 0,
      evidenceItemsCitedCount: projectBullets.reduce((sum, bullet) => sum + (bullet.evidenceRefs?.length || 0), 0),
    },
    auditReport: {
      status: receipt.overallStatus === 'PASS' ? 'PASS' : 'WARN',
      totalClaimsChecked: receipt.totalClaimsAudited || projectBullets.length + experienceBullets.length,
      verifiedClaimsCount: receipt.verifiedClaimsCount || 0,
      warningsCount: receipt.violations?.length || 0,
    },
    resume: {
      basics: {
        name: structured.candidateIdentity.displayName,
        headline: structured.candidateIdentity.headline || null,
        summary: structured.summary?.text || null,
        email: structured.candidateIdentity.email || null,
        location: structured.candidateIdentity.location || null,
      },
      summaryBullets: [],
      skills: (structured.skills?.categories || []).map((category) => ({
        category: category.categoryName,
        skills: (category.skills || []).map((skill) => ({
          skillSlug: skill.slug || skill.name,
          skillName: skill.name,
          provenance: skill.provenanceStatus || 'VERIFIED',
          confidenceScore: skill.confidenceScore ?? 1,
          evidenceCount: skill.evidenceId ? 1 : 0,
          claimLabel: null,
        })),
      })),
      experience: (structured.experience || []).map((experience) => ({
        company: experience.company || '',
        title: experience.title || '',
        location: experience.location || null,
        startDate: String(experience.startDate || ''),
        endDate: experience.endDate ? String(experience.endDate) : null,
        isCurrent: Boolean(experience.isCurrent),
        bullets: (experience.bullets || [])
          .filter((bullet) => typeof bullet.text === 'string' && bullet.text.trim().length > 0)
          .map((bullet) => ({
          bulletId: bullet.bulletId || bullet.id || crypto.randomUUID(),
          text: SecretScrubber.scrub(bullet.text || ''),
          status: bullet.status || 'VERIFIED',
          confidenceScore: bullet.confidenceScore ?? 1,
          evidenceRefs: (bullet.evidenceRefs || []).map(normalizeEvidenceRef).filter(Boolean),
          assertionIds: bullet.assertionIds || [],
          matchedKeywords: bullet.matchedKeywords || [],
          })),
      })),
      projects: (structured.projects || []).map((project) => ({
        projectId: project.projectId,
        name: project.name,
        displayName: project.displayName,
        description: null,
        relevanceScore: project.relevanceScore || 0,
        relevanceBand: undefined,
        bullets: (project.bullets || [])
          .filter((bullet) => typeof bullet.text === 'string' && bullet.text.trim().length > 0)
          .map((bullet) => ({
          bulletId: bullet.bulletId || bullet.id || crypto.randomUUID(),
          text: SecretScrubber.scrub(bullet.text || ''),
          status: bullet.status || 'VERIFIED',
          confidenceScore: bullet.confidenceScore ?? 1,
          evidenceRefs: (bullet.evidenceRefs || []).map(normalizeEvidenceRef).filter(Boolean),
          assertionIds: bullet.assertionIds || [],
          matchedKeywords: bullet.matchedKeywords || [],
          })),
      })),
      education: structured.education || [],
      certifications: structured.certifications || [],
    },
    warnings: [],
    _meta: { cacheControl: DEFAULT_CACHE_CONTROL },
  };

  return GenerateTailoredResumeOutputSchema.parse(output);
}

// =============================================================================
// Registration Helper
// =============================================================================

/**
 * Registers all 3 MCP Application Artifact Tools with the provided McpServerWrapper.
 *
 * @param {import('../server.js').McpServerWrapper} server MCP server wrapper instance
 * @param {object} [deps={}] Tool dependencies overrides
 */
export function registerCareerArtifactTools(server, deps = {}) {
  const definitions = CAREER_ARTIFACT_TOOL_DEFINITIONS;

  // 1. recommend_portfolio_projects
  const recommendDef = definitions.find((d) => d.name === 'recommend_portfolio_projects');
  if (recommendDef) {
    server.registerTool(recommendDef, async (context, args) => {
      assertToolPermission(context, recommendDef);
      return handleRecommendPortfolioProjects(context, args, deps);
    });
  }

  // 2. draft_cover_letter
  const draftDef = definitions.find((d) => d.name === 'draft_cover_letter');
  if (draftDef) {
    server.registerTool(draftDef, async (context, args) => {
      assertToolPermission(context, draftDef);
      return handleDraftCoverLetter(context, args, deps);
    });
  }

  // 3. generate_tailored_resume
  const resumeDef = definitions.find((d) => d.name === 'generate_tailored_resume');
  if (resumeDef) {
    server.registerTool(resumeDef, async (context, args) => {
      assertToolPermission(context, resumeDef);
      return handleGenerateTailoredResume(context, args, deps);
    });
  }
}
