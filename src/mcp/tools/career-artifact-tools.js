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
import { candidates } from '../../db/schema.js';
import { NotFoundError, ValidationError } from '../../errors/index.js';
import { CandidateProfileService } from '../../services/candidate-profile.service.js';
import { JobDescriptionParser } from '../../domain/career/job-parser.js';
import { EvidenceMatchingService } from '../../services/evidence-matching.service.js';
import { ProjectRelevanceService } from '../../services/project-relevance.service.js';
import { AtsFitScoreService } from '../../services/ats-fit-score.service.js';
import { PortfolioRecommendationService } from '../../services/portfolio-recommendation.service.js';
import { CoverLetterDraftingService } from '../../services/cover-letter-drafting.service.js';
import { ResumeTailoringService } from '../../services/resume-tailoring.service.js';
import { ZeroHallucinationIntegrityService } from '../../services/zero-hallucination-integrity.service.js';
import { ResumeIntegrityAuditService } from '../../services/resume-integrity-audit.service.js';
import { SecretScrubber } from '../../extractors/github/security/secret-scrubber.js';
import { defaultMcpRateLimiter } from '../../security/mcp-rate-limiter.js';
import { assertToolPermission } from '../../security/mcp-auth.js';
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
    evidence: Array.isArray(p.evidence) ? p.evidence.map(normalizeEvidenceRef).filter(Boolean) : [],
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
 * @param {object} dbClient Database client
 * @returns {Promise<object>} Canonical JobDescription object
 */
async function resolveJobDescription(context, args, _dbClient) {
  if (args.jobDescriptionText) {
    const classification = await JobDescriptionParser.parse(
      {
        rawText: args.jobDescriptionText,
        title: args.jobTitle || 'Target Role',
        company: args.companyName || 'Target Company',
        source: 'API',
      },
      {
        tenantId: context.tenantId,
        userId: context.userId,
      }
    );

    const normalizedRequirements = (classification.requirements || []).map((r) => {
      const title = r.title || r.extractedValue || r.rawSnippet || 'Requirement';
      const importance = r.importance || r.priority || 'REQUIRED';
      return {
        id: r.id || crypto.randomUUID(),
        tenantId: context.tenantId,
        jobDescriptionId: classification.jobDescription.id,
        title,
        extractedValue: r.extractedValue || title,
        importance,
        priority: importance,
        requirementType: importance,
        isRequired: importance === 'REQUIRED',
        weight: typeof r.weight === 'number' ? r.weight : 1.0,
        category: r.category || 'SKILL',
        skillSlug: r.skillSlug || null,
        rawSnippet: r.rawSnippet || title,
        normalizedCriteria: r.normalizedCriteria || {},
        confidenceScore: r.confidenceScore || 0.9,
        sourceSpan: r.sourceSpan || {
          section: 'requirements',
          snippet: title,
        },
      };
    });

    return {
      id: classification.jobDescription.id,
      tenantId: context.tenantId,
      title: args.jobTitle || classification.jobDescription.title || 'Target Role',
      companyName: args.companyName || classification.jobDescription.company || 'Target Company',
      level: classification.jobDescription.level || 'MID',
      requirements: normalizedRequirements,
    };
  }

  if (args.jobId) {
    // If jobId is provided, in Phase 7 we ensure tenant isolation
    // (If not stored in DB, we throw NotFoundError)
    throw new NotFoundError(`Job description not found for ID: ${args.jobId}`);
  }

  throw new ValidationError('Either jobDescriptionText or jobId must be provided.');
}

/**
 * Builds candidate career assertions from profile skills and experience for integrity gating.
 *
 * @param {object} candidateProfileObj Canonical candidate profile
 * @returns {Array<object>} Array of CareerAssertion objects
 */
function buildCandidateAssertions(candidateProfileObj) {
  const assertions = [];

  for (const skill of candidateProfileObj.skills || []) {
    assertions.push({
      assertionId: crypto.randomUUID(),
      candidateId: candidateProfileObj.id,
      tenantId: candidateProfileObj.tenantId,
      assertionType: 'SKILL',
      statement: `Candidate possesses technical skill: ${skill.name || skill.slug}`,
      subjectSlug: skill.slug,
      status: skill.provenanceStatus || 'VERIFIED',
      confidenceScore: typeof skill.confidenceScore === 'number' ? skill.confidenceScore : 1.0,
      evidenceRefs: skill.primaryEvidence
        ? [skill.primaryEvidence]
        : Array.isArray(skill.evidenceItems)
          ? skill.evidenceItems
          : [],
    });
  }

  for (const proj of candidateProfileObj.projects || []) {
    if (Array.isArray(proj.evidence) && proj.evidence.length > 0) {
      assertions.push({
        assertionId: crypto.randomUUID(),
        candidateId: candidateProfileObj.id,
        tenantId: candidateProfileObj.tenantId,
        assertionType: 'PROJECT',
        statement: `Candidate developed project: ${proj.name}`,
        subjectSlug: proj.slug || proj.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        status: 'VERIFIED',
        confidenceScore: 1.0,
        evidenceRefs: proj.evidence.slice(0, 5),
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
  const jobDescription = await resolveJobDescription(context, args, dbClient);

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
  const jobDescription = await resolveJobDescription(context, args, dbClient);

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
  const profileService = deps.candidateProfileService || new CandidateProfileService();
  const resumeService = deps.resumeService || new ResumeTailoringService();
  const auditService = deps.auditService || new ResumeIntegrityAuditService();
  const integrityService = deps.integrityService || new ZeroHallucinationIntegrityService();

  // 1. Rate Limiting Check
  rateLimiter.checkTenantLimit(context.tenantId);
  rateLimiter.checkToolLimit(context.tenantId, 'generate_tailored_resume');

  // 2. Validate Tool Inputs
  const args = GenerateTailoredResumeInputSchema.parse(rawArgs || {});

  // 3. Resolve Candidate Profile & Job Description
  const candidateId = await resolveTargetCandidateId(context, args.candidateId, dbClient);
  const profileView = await profileService.getProfile(context, candidateId);
  const candidateProfileObj = buildCandidateProfileDomainObject(profileView, context);
  const jobDescription = await resolveJobDescription(context, args, dbClient);

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
    throw new ValidationError('Resume tailoring blocked by Zero-Hallucination Integrity Gate.', {
      findings: integritySummary.blockedReasons || [],
    });
  }

  // 6. Execute Resume Tailoring Service
  const tailoringOptions = {
    presentationMode: args.presentationMode,
    existingResumeText: args.existingResumeText,
    existingResumeFormat: args.existingResumeFormat,
    templateId: args.templateId,
    ...(args.targetOptions || {}),
  };

  if (args.presentationMode === 'PRESERVE_EXISTING') {
    const docId = crypto.randomUUID();
    tailoringOptions.sourceDocumentId = docId;
    tailoringOptions.sourceDocument = {
      id: docId,
      format: args.existingResumeFormat || 'MARKDOWN',
      rawContent: args.existingResumeText || '',
    };
  }

  const tailoredResume = await resumeService.tailorResume(
    context,
    candidateProfileObj,
    jobDescription,
    matchAnalysis,
    projectAnalysis,
    integritySummary.auditedAssertions || [],
    tailoringOptions
  );

  // 7. Post-Generation Resume Integrity Audit Gate
  const auditReport = auditService.auditResume(
    context,
    tailoredResume,
    integritySummary.auditedAssertions || [],
    candidateProfileObj,
    {
      presentationMode: args.presentationMode,
    }
  );

  if (auditReport.overallStatus === 'BLOCK') {
    throw new ValidationError('Resume tailoring blocked by Resume Integrity Audit Service.', {
      findings: auditReport.findings || [],
    });
  }

  // 8. Assemble Output Structure
  const warnings = [...(tailoredResume.presentationAudit?.warnings || [])];
  if (auditReport.overallStatus === 'WARN') {
    warnings.push(
      'Resume contains unverified user claims audited and labeled with warning badges.'
    );
  }

  const output = {
    resumeId: tailoredResume.resumeId,
    candidateId: candidateProfileObj.id,
    jobTitle: jobDescription.title || 'Target Role',
    presentationMode: tailoredResume.presentationMode || args.presentationMode || 'GENERATE_NEW',
    templateId: tailoredResume.templateId || args.templateId || 'ATS_FOCUSED',
    presentationAudit: {
      status:
        tailoredResume.presentationAudit?.status ||
        tailoredResume.presentationIntegrityStatus ||
        'PASS',
      preservedAttributes: tailoredResume.presentationAudit?.preservedAttributes || {},
      modifiedAttributes: tailoredResume.presentationAudit?.modifiedAttributes || {},
      warnings: tailoredResume.presentationAudit?.warnings || [],
    },
    integrityReport: {
      overallStatus: integritySummary.overallStatus === 'PASS' ? 'PASS' : 'PARTIAL',
      verifiedAssertionsCount: tailoredResume.metadata?.verifiedBullets || 0,
      inferredAssertionsCount: tailoredResume.metadata?.inferredBullets || 0,
      claimedAssertionsCount: tailoredResume.metadata?.claimedBullets || 0,
      evidenceItemsCitedCount: (tailoredResume.projects || []).reduce(
        (acc, p) =>
          acc + (p.bullets || []).reduce((bAcc, b) => bAcc + (b.evidenceRefs?.length || 0), 0),
        0
      ),
    },
    auditReport: {
      status:
        auditReport.overallStatus === 'BLOCK'
          ? 'BLOCK'
          : auditReport.overallStatus === 'WARN'
            ? 'WARN'
            : 'PASS',
      totalClaimsChecked: auditReport.summary?.totalClaimsChecked || 0,
      verifiedClaimsCount: auditReport.summary?.verifiedClaimsCount || 0,
      warningsCount: auditReport.findings?.filter((f) => f.status === 'WARN').length || 0,
    },
    resume: {
      basics: {
        name: candidateProfileObj.displayName || 'Candidate',
        headline: candidateProfileObj.headline || null,
        summary: tailoredResume.summary || candidateProfileObj.summary || null,
        email: candidateProfileObj.canonicalEmail || null,
        location: candidateProfileObj.location || null,
      },
      summaryBullets: (tailoredResume.summaryBullets || []).map((b) =>
        typeof b === 'string' ? b : b.text || ''
      ),
      skills: (tailoredResume.skills || []).map((cat) => ({
        category: cat.category || 'Core Technical Skills',
        skills: (cat.skills || []).map((s) => ({
          skillSlug: s.canonicalSlug || s.skillSlug || s.slug || 'skill',
          skillName: s.skillName || s.name || 'Skill',
          provenance: s.provenance || s.provenanceStatus || s.status || 'VERIFIED',
          confidenceScore: typeof s.confidenceScore === 'number' ? s.confidenceScore : 1.0,
          evidenceCount: s.evidenceCount || (s.evidenceRefs ? s.evidenceRefs.length : 0),
          claimLabel: s.claimLabel || null,
        })),
      })),
      experience: (tailoredResume.experience || []).map((exp) => ({
        company: exp.company,
        title: exp.title,
        location: exp.location || null,
        startDate: String(exp.startDate),
        endDate: exp.endDate ? String(exp.endDate) : null,
        isCurrent: Boolean(exp.isCurrent),
        bullets: (exp.bullets || []).map((b) => ({
          bulletId: b.bulletId || b.id || crypto.randomUUID(),
          text: SecretScrubber.scrub(b.text || ''),
          status: b.status || 'VERIFIED',
          confidenceScore: typeof b.confidenceScore === 'number' ? b.confidenceScore : 1.0,
          evidenceRefs: (b.evidenceRefs || []).map(normalizeEvidenceRef).filter(Boolean),
          assertionIds: b.assertionIds || [],
          matchedKeywords: b.matchedKeywords || [],
          claimLabel: b.claimLabel || null,
        })),
      })),
      projects: (tailoredResume.projects || []).slice(0, 5).map((p) => ({
        projectId: p.projectId || p.id,
        name: p.name,
        displayName: p.displayName,
        description: p.description || null,
        relevanceScore: p.relevanceScore || 0,
        relevanceBand: p.relevanceBand,
        bullets: (p.bullets || []).map((b) => ({
          bulletId: b.bulletId || b.id || crypto.randomUUID(),
          text: SecretScrubber.scrub(b.text || ''),
          status: b.status || 'VERIFIED',
          confidenceScore: typeof b.confidenceScore === 'number' ? b.confidenceScore : 1.0,
          evidenceRefs: (b.evidenceRefs || []).map(normalizeEvidenceRef).filter(Boolean),
          assertionIds: b.assertionIds || [],
          matchedKeywords: b.matchedKeywords || [],
          claimLabel: b.claimLabel || null,
        })),
      })),
      education: (tailoredResume.education || []).map((edu) => ({
        institution: edu.institution || edu.school,
        degree: edu.degree,
        fieldOfStudy: edu.fieldOfStudy || edu.field,
        startDate: edu.startDate ? String(edu.startDate) : undefined,
        endDate: edu.endDate ? String(edu.endDate) : undefined,
      })),
      certifications: (tailoredResume.certifications || []).map((cert) => ({
        name: cert.name || cert.title,
        issuer: cert.issuer,
        issuedDate: cert.issuedDate ? String(cert.issuedDate) : undefined,
      })),
    },
    warnings,
    _meta: {
      cacheControl: DEFAULT_CACHE_CONTROL,
    },
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
