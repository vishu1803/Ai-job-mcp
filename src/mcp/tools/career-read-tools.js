/**
 * @file Implementation of MCP Career Read Tools (P7-004 / ARCH-023)
 *
 * Implements the 4 core read-only MCP career tools:
 * 1. get_candidate_profile
 * 2. list_verified_skills
 * 3. inspect_project_evidence
 * 4. analyze_job_fit
 *
 * Adheres to:
 * - ARCH-022 / ARCH-023 (docs/mcp-career-read-tools-architecture.md)
 * - ADR-042 / ADR-044 (docs/decisions.md)
 * - Pure In-Memory Service Delegation: Zero duplicated matching, scoring, or integrity logic.
 * - Sovereign Multi-Tenant Isolation: 404 default-deny on cross-tenant requests.
 * - RBAC Scope Enforcement: Requires 'career:read'.
 * - Strict Output Budgets & Sanitization via SecretScrubber.
 * - Zero Database Mutations: Read-only queries only.
 */

import { randomUUID } from 'node:crypto';
import { eq, and, or, desc, asc, count, ilike, gte, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../db/index.js';
import {
  candidates,
  projects,
  projectResources,
  resources,
  skills,
  candidateSkills,
  evidenceItems,
} from '../../db/schema.js';
import { NotFoundError, ValidationError } from '../../errors/index.js';
import { CandidateProfileService } from '../../services/candidate-profile.service.js';
import { JobDescriptionParser } from '../../domain/career/job-parser.js';
import { EvidenceMatchingService } from '../../services/evidence-matching.service.js';
import { ProjectRelevanceService } from '../../services/project-relevance.service.js';
import { AtsFitScoreService } from '../../services/ats-fit-score.service.js';
import { SkillTaxonomyEngine } from '../../domain/career/skill-taxonomy.js';
import { SecretScrubber } from '../../extractors/github/security/secret-scrubber.js';
import { JobDiscoveryService } from '../../services/job-discovery.service.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import {
  GetCandidateProfileInputSchema,
  GetCandidateProfileOutputSchema,
  ListVerifiedSkillsInputSchema,
  ListVerifiedSkillsOutputSchema,
  InspectProjectEvidenceInputSchema,
  InspectProjectEvidenceOutputSchema,
  AnalyzeJobFitInputSchema,
  AnalyzeJobFitOutputSchema,
  CAREER_READ_TOOL_DEFINITIONS,
  MAX_PROFILE_OUTPUT_BYTES,
  MAX_EVIDENCE_EXCERPT_CHARS,
} from '../../domain/mcp/career-read-tools.schemas.js';
import { CareerPreferencesSchema } from '../../domain/candidate/career-preferences.schemas.js';
import { TenureCalculator } from '../../utils/tenure-calculator.js';
import { CareerStatusDerivation } from '../../utils/career-status-derivation.js';
import { decodeHtmlEntities } from '../../services/job-board-adapters/greenhouse.adapter.js';

/**
 * Splits a compound requirement sentence into atomic skill/competency names.
 * Handles: comma-separated lists, "X, Y, and Z", slash-separated, parenthetical examples,
 * "such as", "including", conjunctions, and technology aliases.
 * Returns individual atomic skill names.
 * @private
 */
function _splitIntoAtomicSkills(text) {
  if (!text || typeof text !== 'string') return [];

  const cleaned = text.replace(/\s+/g, ' ').trim();

  // If the text is very short (single word or short phrase), return as-is
  if (cleaned.length < 40) {
    const norm = cleaned.replace(/^[\s•\-*\d.)]+/, '').trim();
    if (norm) return [norm];
    return [];
  }

  // Strip common prefix patterns that aren't actual skills
  const stripped = cleaned
    .replace(
      /^(?:proficiency\s+in|experience\s+(?:with|in|using)|knowledge\s+of|familiarity\s+with|skills?\s+(?:in|with)|understanding\s+of|background\s+in|exposure\s+to|working\s+(?:knowledge\s+of|with)|hands[- ]on\s+(?:experience\s+with|knowledge\s+of)|practical\s+experience\s+(?:developing\s+and\s+improving|with|in)|strong\s+(?:knowledge\s+of|understanding\s+of|background\s+in)|good\s+(?:knowledge\s+of|understanding\s+of)|solid\s+(?:knowledge\s+of|understanding\s+of|experience\s+with)|demonstrated\s+(?:experience\s+with|knowledge\s+of)|proven\s+(?:experience\s+with|track\s+record\s+in))\s*/i,
      ''
    )
    .replace(/$/i, '');

  // Split by commas, semicolons, "and" conjunctions, and slashes
  // But preserve things like "Next.js" which contain dots
  const candidates = stripped
    .split(/\s*[,;]\s*|\s+and\s+|\s+or\s+/)
    .flatMap((s) => s.split(/\s*[/]\s*/))
    .map((s) => s.replace(/^[\s•\-*\d.)]+/, '').trim())
    .map((s) => s.replace(/^(?:and|or|,|and\s+|or\s+)\s*/i, '').trim())
    .filter((s) => s.length >= 2 && s.length <= 80);

  const results = [];
  for (const candidate of candidates) {
    // Skip filler words and non-skill patterns
    const lower = candidate.toLowerCase();
    if (
      /^(?:the|our|a|an|in|of|for|with|to|and|or|etc|e\.g|i\.e|such as|including|related|equivalent|similar|etc\.)$/.test(
        lower
      )
    )
      continue;
    if (lower.length < 2) continue;
    // Skip standalone generic English words that are not defensible skill names
    if (
      /^(?:access|authorization|control|security|management|models?|tools?|systems?|platforms?|solutions?|services?|resources?)$/.test(
        lower
      )
    )
      continue;
    // Skip pure verb/adjective fragments
    if (
      /^(?:building|developing|creating|designing|implementing|managing|leading|writing|building and|maintaining|deploying)$/.test(
        lower
      )
    )
      continue;
    // Strip internal connecting phrases like "such as", "including"
    const cleaned2 = candidate
      .replace(/\bsuch\s+as\s+/gi, '')
      .replace(/\bincluding\s+/gi, '')
      .replace(/\bfor\s+(?:example|instance)\s*/gi, '')
      .trim();
    if (cleaned2.length >= 2) {
      results.push(cleaned2);
    }
  }

  return results.length > 0 ? results : [cleaned.slice(0, 80)];
}

/**
 * Creates a URL-safe slug from a skill name.
 * @private
 */
function _slugify(name) {
  if (!name) return 'unknown-skill';
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'unknown-skill'
  );
}

// Default Cache Control Metadata for Read Tools
const DEFAULT_CACHE_CONTROL = Object.freeze({
  cacheScope: 'tenant-private',
  ttlMs: 300000, // 5 minutes
});

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

// =============================================================================
// Tool 1: get_candidate_profile
// =============================================================================

/**
 * Handles the get_candidate_profile MCP tool.
 *
 * @param {import('../../domain/mcp/mcp.schemas.js').McpRequestContext} context
 * @param {object} rawArgs
 * @param {object} [deps={}]
 * @returns {Promise<object>} Validated GetCandidateProfileOutputSchema
 */
export async function handleGetCandidateProfile(context, rawArgs, deps = {}) {
  const dbClient = deps.db || defaultDb;
  const profileService = deps.candidateProfileService || new CandidateProfileService(deps);
  const args = GetCandidateProfileInputSchema.parse(rawArgs || {});

  const candidateId = await resolveTargetCandidateId(context, args.candidateId, dbClient);
  const profileView = await profileService.getProfile(context, candidateId);
  const careerProfile =
    typeof profileService.getCareerProfile === 'function'
      ? await profileService.getCareerProfile(context, candidateId)
      : null;

  // 1. Resolve job preferences & eligibility
  const rawPreferences = profileView.candidate.profileMetadata?.careerPreferences || {};
  const jobPreferences =
    careerProfile?.jobPreferences || CareerPreferencesSchema.parse(rawPreferences);
  const eligibility = careerProfile?.eligibility || {
    workAuthorization: Array.isArray(rawPreferences.workAuthorization)
      ? rawPreferences.workAuthorization
      : [],
    visaSponsorshipRequired: Boolean(rawPreferences.visaSponsorshipRequired),
    availabilityDate: rawPreferences.availabilityDate
      ? String(rawPreferences.availabilityDate)
      : null,
  };

  const rawUserCustom = profileView.candidate.profileMetadata?.userCustom || {};
  const rawExperiences =
    rawUserCustom.experience || profileView.candidate.profileMetadata?.experience || [];
  const tenureMetrics =
    careerProfile?.tenureMetrics || TenureCalculator.calculateTenure(rawExperiences);
  const currentEmployment =
    careerProfile?.currentEmployment ||
    CareerStatusDerivation.deriveCurrentEmployment(rawExperiences);
  const currentRole =
    careerProfile?.currentRole ||
    CareerStatusDerivation.resolveCurrentRole({
      userCustomRole:
        rawUserCustom.currentRole || profileView.candidate.profileMetadata?.currentRole,
      headline: profileView.candidate.headline,
      currentEmployment,
    });
  const seniority =
    careerProfile?.seniority ||
    CareerStatusDerivation.deriveSeniority({
      experiences: rawExperiences,
      education: rawUserCustom.education || profileView.candidate.profileMetadata?.education || [],
      professionalTenureYears: tenureMetrics.professionalTenureYears,
    });
  const careerStatus =
    careerProfile?.careerStatus ||
    CareerStatusDerivation.deriveCareerStatus({
      experiences: rawExperiences,
      education: rawUserCustom.education || profileView.candidate.profileMetadata?.education || [],
      professionalTenureMonths: tenureMetrics.professionalTenureMonths,
    });
  const yearsOfExperience =
    careerProfile?.yearsOfExperience ??
    (tenureMetrics.professionalTenureYears > 0
      ? tenureMetrics.professionalTenureYears
      : tenureMetrics.totalExperienceYears > 0
        ? tenureMetrics.totalExperienceYears
        : null);

  const rawCompleteness =
    careerProfile?.completeness || profileService.calculateCompleteness?.(profileView);
  const completenessScore =
    typeof rawCompleteness?.score === 'number'
      ? rawCompleteness.score
      : typeof rawCompleteness?.percentage === 'number'
        ? rawCompleteness.percentage
        : 100;

  const jobSearchReadiness = {
    score: completenessScore,
    status:
      rawCompleteness?.status ||
      (completenessScore >= 70 ? 'STRONG' : completenessScore >= 40 ? 'MODERATE' : 'INCOMPLETE'),
    isReadyForJobSearch: Boolean(
      rawCompleteness?.isReadyForJobSearch ??
      rawCompleteness?.isReadyForMatching ??
      completenessScore >= 60
    ),
    missingRequiredForSearch: Array.isArray(rawCompleteness?.missingRequiredForSearch)
      ? rawCompleteness.missingRequiredForSearch
      : Array.isArray(rawCompleteness?.missingFields)
        ? rawCompleteness.missingFields
        : [],
    missingOptional: Array.isArray(rawCompleteness?.missingOptional)
      ? rawCompleteness.missingOptional
      : [],
    actionableFeedback:
      rawCompleteness?.actionableFeedback ||
      (Array.isArray(rawCompleteness?.recommendations) && rawCompleteness.recommendations.length > 0
        ? rawCompleteness.recommendations.join('; ')
        : 'Profile is complete and ready.'),
  };

  // Backward-compatibility: profileCompleteness mirrors jobSearchReadiness
  const profileCompleteness = jobSearchReadiness;

  const rawProfileReadiness = careerProfile?.profileReadiness;
  const profileReadiness = {
    score: typeof rawProfileReadiness?.score === 'number' ? rawProfileReadiness.score : 100,
    status: rawProfileReadiness?.status || 'PROFILE POPULATED',
    isComplete: Boolean(rawProfileReadiness?.isComplete ?? true),
    missingFields: Array.isArray(rawProfileReadiness?.missingFields)
      ? rawProfileReadiness.missingFields
      : [],
    actionableFeedback:
      rawProfileReadiness?.actionableFeedback ||
      'Career profile contains comprehensive professional identity and verified qualifications.',
  };

  const structuredExperienceDuration =
    careerProfile?.experienceDuration ||
    (tenureMetrics
      ? {
          totalMonths: tenureMetrics.totalExperienceMonths || 0,
          totalYears: tenureMetrics.totalExperienceYears || 0,
          professionalMonths: tenureMetrics.professionalTenureMonths || 0,
          professionalYears: tenureMetrics.professionalTenureYears || 0,
        }
      : undefined);

  // 2. Format top verified skills (max 15) with preserved truth & provenance
  let topSkills = undefined;
  if (args.includeSkillsSummary !== false) {
    const rawSkills = careerProfile?.topSkills || profileView.skills || [];
    topSkills = rawSkills.slice(0, 15).map((s) => ({
      slug: s.slug,
      name: s.name,
      category: s.category || 'TOOL',
      tier: s.tier || 'PRIMARY',
      confidenceScore: typeof s.confidenceScore === 'number' ? s.confidenceScore : 0.0,
      evidenceCount: s.evidenceCount || 0,
      provenanceStatus:
        s.provenanceStatus === 'VERIFIED'
          ? 'VERIFIED'
          : s.provenanceStatus === 'CORROBORATED'
            ? 'CORROBORATED'
            : s.provenanceStatus === 'SELF_DECLARED'
              ? 'SELF_DECLARED'
              : s.provenanceStatus === 'LEARNING'
                ? 'LEARNING'
                : s.provenanceStatus === 'USER_PROVIDED'
                  ? 'USER_PROVIDED'
                  : s.provenanceStatus === 'INFERRED'
                    ? 'INFERRED'
                    : 'CLAIMED',
    }));
  }

  // 3. Format highlighted projects (max 5) with technologies, repositoryUrl, and summary bullets
  let highlightedProjects = undefined;
  if (args.includeProjects !== false) {
    const rawProjects = careerProfile?.highlightedProjects || profileView.projects || [];
    highlightedProjects = rawProjects.slice(0, 5).map((p) => {
      let repositoryUrl =
        p.repositoryUrl ||
        (Array.isArray(p.urls) && p.urls.length > 0 ? p.urls[0] : null) ||
        p.metadata?.repoUrl ||
        p.metadata?.repositoryUrl ||
        null;
      if (
        !repositoryUrl &&
        typeof p.summary === 'string' &&
        p.summary.startsWith('Repository: http')
      ) {
        repositoryUrl = p.summary.replace('Repository: ', '').trim();
      } else if (
        !repositoryUrl &&
        typeof p.name === 'string' &&
        p.name.includes('/') &&
        !p.name.includes(' ')
      ) {
        repositoryUrl = `https://github.com/${p.name}`;
      }
      return {
        id: p.id ? String(p.id) : undefined,
        name: p.name,
        headline: p.headline || null,
        role: p.role || null,
        summary: p.summary || null,
        technologies: Array.isArray(p.technologies) ? p.technologies.slice(0, 15) : [],
        repositoryUrl: repositoryUrl ? String(repositoryUrl) : null,
        bullets: Array.isArray(p.bullets) ? p.bullets.slice(0, 3) : p.summary ? [p.summary] : [],
        startDate: p.startDate ? String(p.startDate) : null,
        endDate: p.endDate ? String(p.endDate) : null,
        linkedResourceCount: p.linkedResourceCount || (Array.isArray(p.evidence) ? 1 : 0),
        verifiedSignalCount:
          p.verifiedSignalCount || (Array.isArray(p.evidence) ? p.evidence.length : 0),
        provenanceStatus: p.provenanceStatus || 'CLAIMED',
      };
    });
  }

  // 4. Format recent experience (max 5) with bullets, technologies, and provenance
  let recentExperience = undefined;
  if (args.includeExperience !== false) {
    const rawExpList = careerProfile?.recentExperience || rawExperiences || [];
    recentExperience = rawExpList.slice(0, 5).map((exp) => ({
      company: exp.company || 'Company',
      title: exp.title || exp.role || 'Role',
      employmentType: exp.employmentType || 'FULL_TIME',
      location: exp.location || null,
      startDate: exp.startDate ? String(exp.startDate) : null,
      endDate: exp.endDate ? String(exp.endDate) : null,
      isCurrent: Boolean(exp.isCurrent),
      rawDateRange: exp.rawDateRange || null,
      bullets: Array.isArray(exp.bullets) ? exp.bullets.slice(0, 3) : [],
      technologies: Array.isArray(exp.technologies)
        ? exp.technologies.slice(0, 15)
        : Array.isArray(exp.skills)
          ? exp.skills.slice(0, 15)
          : [],
      verifiedSkillsUsed: Array.isArray(exp.verifiedSkillsUsed)
        ? exp.verifiedSkillsUsed.slice(0, 10)
        : Array.isArray(exp.skills)
          ? exp.skills.slice(0, 10)
          : [],
      provenanceStatus: exp.provenanceStatus || 'CLAIMED',
    }));
  }

  // 5. Format structured education (max 5)
  let education = undefined;
  if (args.includeEducation !== false) {
    const rawEduList =
      careerProfile?.education ||
      rawUserCustom.education ||
      profileView.candidate.profileMetadata?.education ||
      [];
    education = rawEduList.slice(0, 5).map((edu) => ({
      institution: edu.institution || 'Educational Institution',
      degree: edu.degree || null,
      fieldOfStudy: edu.fieldOfStudy || null,
      degreeType: edu.degreeType || 'OTHER',
      location: edu.location || null,
      startDate: edu.startDate ? String(edu.startDate) : null,
      endDate: edu.endDate ? String(edu.endDate) : null,
      isCurrent: Boolean(edu.isCurrent),
      rawDateRange: edu.rawDateRange || null,
      coursework: Array.isArray(edu.coursework) ? edu.coursework.slice(0, 15) : [],
      gradeOrGpa: edu.gradeOrGpa || null,
      provenanceStatus: edu.provenanceStatus || 'CLAIMED',
    }));
  }

  // 6. Format certifications (max 5)
  let certifications = undefined;
  if (args.includeCertifications !== false) {
    const rawCerts =
      careerProfile?.certifications ||
      rawUserCustom.certifications ||
      profileView.candidate.profileMetadata?.certifications ||
      [];
    certifications = rawCerts.slice(0, 5).map((c) => {
      if (typeof c === 'string') {
        return {
          name: c,
          issuer: null,
          issueDate: null,
          expiryDate: null,
          credentialId: null,
          credentialUrl: null,
          provenanceStatus: 'CLAIMED',
        };
      }
      return {
        name: c.name || 'Certification',
        issuer: c.issuer || null,
        issueDate: c.issueDate ? String(c.issueDate) : null,
        expiryDate: c.expiryDate ? String(c.expiryDate) : null,
        credentialId: c.credentialId || null,
        credentialUrl: c.credentialUrl || null,
        provenanceStatus: c.provenanceStatus || 'CLAIMED',
      };
    });
  }

  // 7. Format languages (max 5)
  let languages = undefined;
  if (args.includeLanguages !== false) {
    const rawLangs =
      careerProfile?.languages ||
      rawUserCustom.languages ||
      profileView.candidate.profileMetadata?.languages ||
      [];
    languages = rawLangs.slice(0, 5).map((l) => {
      if (typeof l === 'string') {
        return {
          language: l,
          proficiency: null,
          provenanceStatus: 'CLAIMED',
        };
      }
      return {
        language: l.language || 'Language',
        proficiency: l.proficiency || null,
        provenanceStatus: l.provenanceStatus || 'CLAIMED',
      };
    });
  }

  // 8. Build connected resources summary & portfolio links
  const resourceList = profileView.resources || [];
  const connectedResourcesSummary = {
    totalConnected: resourceList.length,
    publicRepositories: resourceList.filter((r) => !r.isPrivate).length,
    privateRepositories: resourceList.filter((r) => r.isPrivate).length,
  };

  const rawPortfolioLinks =
    careerProfile?.portfolioLinks ||
    rawUserCustom.portfolioLinks ||
    profileView.candidate.profileMetadata?.portfolioLinks ||
    [];
  const portfolioLinks = rawPortfolioLinks.slice(0, 10).map((link) => ({
    label: link.label || 'Link',
    url: link.url,
  }));

  const output = {
    candidate: {
      id: profileView.candidate.id,
      displayName: profileView.candidate.displayName,
      headline: careerProfile?.headline || profileView.candidate.headline || null,
      summary: careerProfile?.summary || profileView.candidate.summary || null,
      currentRole: currentRole || null,
      currentEmployment: currentEmployment || null,
      careerStatus: careerStatus || 'UNKNOWN',
      seniority: seniority || null,
      yearsOfExperience: yearsOfExperience || null,
      experienceDuration: structuredExperienceDuration,
      location: careerProfile?.location || profileView.candidate.profileMetadata?.location || null,
      canonicalEmail: careerProfile?.canonicalEmail || profileView.candidate.canonicalEmail || null,
      status: profileView.candidate.status,
      createdAt: profileView.candidate.createdAt,
      updatedAt: profileView.candidate.updatedAt,
      portfolioLinks,
    },
    profileCompletenessScore: completenessScore,
    profileCompleteness,
    profileReadiness,
    jobSearchReadiness,
    jobPreferences,
    eligibility,
    identities: (profileView.identities || []).map((i) => ({
      provider: i.provider,
      externalUsername: i.externalUsername || null,
      verified: Boolean(i.verified),
    })),
    connectedResourcesSummary,
    portfolioLinks,
    topSkills,
    highlightedProjects,
    recentExperience,
    education,
    certifications,
    languages,
    _meta: {
      cacheControl: DEFAULT_CACHE_CONTROL,
    },
  };

  // Enforce output size budget
  const serialized = JSON.stringify(output);
  if (serialized.length > MAX_PROFILE_OUTPUT_BYTES) {
    if (output.topSkills && output.topSkills.length > 10) {
      output.topSkills = output.topSkills.slice(0, 10);
    }
    if (output.highlightedProjects && output.highlightedProjects.length > 3) {
      output.highlightedProjects = output.highlightedProjects.slice(0, 3);
    }
    if (output.recentExperience) {
      output.recentExperience = output.recentExperience.map((exp) => ({
        ...exp,
        bullets: exp.bullets ? exp.bullets.slice(0, 2) : [],
      }));
    }
    if (output.education) {
      output.education = output.education.map((edu) => ({
        ...edu,
        coursework: edu.coursework ? edu.coursework.slice(0, 5) : [],
      }));
    }
  }

  return GetCandidateProfileOutputSchema.parse(output);
}

// =============================================================================
// Tool 2: list_verified_skills
// =============================================================================

/**
 * Handles the list_verified_skills MCP tool.
 *
 * @param {import('../../domain/mcp/mcp.schemas.js').McpRequestContext} context
 * @param {object} rawArgs
 * @param {object} [deps={}]
 * @returns {Promise<object>} Validated ListVerifiedSkillsOutputSchema
 */
export async function handleListVerifiedSkills(context, rawArgs, deps = {}) {
  const dbClient = deps.db || defaultDb;
  const args = ListVerifiedSkillsInputSchema.parse(rawArgs || {});

  const candidateId = await resolveTargetCandidateId(context, args.candidateId, dbClient);

  // Load resume skill names for provenance cross-reference
  // This determines whether a VERIFIED skill is also corroborated by a resume claim
  const resumeSkillNames = new Set();
  try {
    const [candidateRow] = await dbClient
      .select({ profileMetadata: candidates.profileMetadata })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, context.tenantId)))
      .limit(1);

    const resumeData = candidateRow?.profileMetadata?.resumeData || null;
    if (resumeData?.skills && Array.isArray(resumeData.skills)) {
      for (const s of resumeData.skills) {
        const name = String(s).toLowerCase().trim();
        if (name) resumeSkillNames.add(name);
      }
    }
  } catch {
    // Resume data loading is best-effort; missing data means no CORROBORATED promotion
  }

  // Build query conditions
  // Default: return all skills (VERIFIED + CORROBORATED + CLAIMED + SELF_DECLARED + LEARNING)
  // The 'status' filter allows MCP clients to narrow to specific provenance levels
  const conditions = [
    eq(candidateSkills.tenantId, context.tenantId),
    eq(candidateSkills.candidateId, candidateId),
  ];

  // If a specific provenance status is requested, filter by it
  // Otherwise return all skills (including additional/declared skills)
  if (args.provenanceStatus) {
    conditions.push(eq(candidateSkills.provenanceStatus, args.provenanceStatus));
  }

  if (args.category) {
    conditions.push(sql`${candidateSkills.category}::text ILIKE ${`%${args.category}%`}`);
  }

  if (typeof args.minConfidence === 'number' && args.minConfidence > 0) {
    conditions.push(gte(candidateSkills.confidenceScore, args.minConfidence));
  }

  // 1. Total matching count
  const [{ total }] = await dbClient
    .select({ total: count() })
    .from(candidateSkills)
    .where(and(...conditions));

  const totalCount = Number(total);
  const totalPages = Math.max(1, Math.ceil(totalCount / args.pageSize));
  const offset = (args.page - 1) * args.pageSize;

  // 2. Fetch paginated records with stable sort
  const skillRows = await dbClient
    .select({
      cs: candidateSkills,
      skillSlug: skills.slug,
      skillName: skills.name,
    })
    .from(candidateSkills)
    .innerJoin(skills, eq(candidateSkills.skillId, skills.id))
    .where(and(...conditions))
    .orderBy(
      desc(candidateSkills.confidenceScore),
      desc(candidateSkills.evidenceCount),
      asc(skills.name)
    )
    .offset(offset)
    .limit(args.pageSize);

  // 3. Map items and resolve primary evidence if requested
  const items = [];
  for (const { cs, skillSlug, skillName } of skillRows) {
    let primaryEvidence = null;

    if (args.includeEvidenceRefs && cs.primaryEvidenceId) {
      const [evRow] = await dbClient
        .select()
        .from(evidenceItems)
        .where(
          and(
            eq(evidenceItems.id, cs.primaryEvidenceId),
            eq(evidenceItems.tenantId, context.tenantId),
            eq(evidenceItems.candidateId, candidateId)
          )
        )
        .limit(1);

      if (evRow) {
        const loc = evRow.sourceLocation || {};
        primaryEvidence = {
          evidenceId: evRow.id,
          evidenceType: evRow.evidenceType,
          sourceProvider: evRow.sourceProvider,
          resourceId: evRow.resourceId || null,
          filePath: loc.filePath || evRow.filePath || null,
          commitSha: loc.commitSha || evRow.commitSha || null,
        };
      }
    }

    // Resolve canonical provenance: VERIFIED (GitHub only) or CORROBORATED (GitHub + resume)
    const resolvedProvenance = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: cs.provenanceStatus,
      skillName: skillName,
      canonicalSlug: skillSlug,
      resumeSkillNames,
      metadata: cs.metadata || {},
    });

    items.push({
      skillId: cs.skillId,
      slug: skillSlug,
      name: skillName,
      category: cs.category || 'TOOL',
      provenanceStatus: resolvedProvenance,
      confidenceScore: typeof cs.confidenceScore === 'number' ? cs.confidenceScore : 0.0,
      evidenceCount: cs.evidenceCount || 0,
      firstObservedAt: cs.firstObservedAt ? new Date(cs.firstObservedAt).toISOString() : null,
      lastObservedAt: cs.lastObservedAt ? new Date(cs.lastObservedAt).toISOString() : null,
      primaryEvidence,
    });
  }

  const output = {
    items,
    pagination: {
      page: args.page,
      pageSize: args.pageSize,
      totalCount,
      totalPages,
      hasNextPage: args.page < totalPages,
    },
    _meta: {
      cacheControl: DEFAULT_CACHE_CONTROL,
    },
  };

  return ListVerifiedSkillsOutputSchema.parse(output);
}

// =============================================================================
// Tool 3: inspect_project_evidence
// =============================================================================

/**
 * Handles the inspect_project_evidence MCP tool.
 *
 * @param {import('../../domain/mcp/mcp.schemas.js').McpRequestContext} context
 * @param {object} rawArgs
 * @param {object} [deps={}]
 * @returns {Promise<object>} Validated InspectProjectEvidenceOutputSchema
 */
export async function handleInspectProjectEvidence(context, rawArgs, deps = {}) {
  const dbClient = deps.db || defaultDb;
  const args = InspectProjectEvidenceInputSchema.parse(rawArgs || {});

  // 1. Fetch Project ensuring strict multi-tenant isolation
  const [proj] = await dbClient
    .select()
    .from(projects)
    .where(and(eq(projects.id, args.projectId), eq(projects.tenantId, context.tenantId)))
    .limit(1);

  if (!proj) {
    throw new NotFoundError(`Project not found: ${args.projectId}`);
  }

  if (args.candidateId && proj.candidateId !== args.candidateId) {
    throw new NotFoundError(`Project not found: ${args.projectId}`);
  }

  // 2. Fetch linked resources
  const linkedResRows = await dbClient
    .select({
      res: resources,
    })
    .from(projectResources)
    .innerJoin(resources, eq(projectResources.resourceId, resources.id))
    .where(
      and(
        eq(projectResources.projectId, args.projectId),
        eq(projectResources.tenantId, context.tenantId)
      )
    );

  const linkedResources = linkedResRows.map(({ res }) => ({
    id: res.id,
    provider: res.provider,
    name: res.name,
    url: res.url || null,
    isPrivate: Boolean(res.isPrivate),
  }));

  // 3. Build evidence query conditions
  const conditions = [
    eq(evidenceItems.tenantId, context.tenantId),
    eq(evidenceItems.projectId, args.projectId),
  ];

  if (args.evidenceType) {
    conditions.push(eq(evidenceItems.evidenceType, args.evidenceType));
  }

  if (args.skillSlug) {
    const safeSlug = SkillTaxonomyEngine.generateSafeSlug(args.skillSlug);
    conditions.push(or(ilike(skills.slug, args.skillSlug), ilike(skills.slug, safeSlug)));
  }

  // 4. Count total matching evidence
  const [{ total }] = await dbClient
    .select({ total: count() })
    .from(evidenceItems)
    .leftJoin(skills, eq(evidenceItems.skillId, skills.id))
    .where(and(...conditions));

  const totalCount = Number(total);
  const totalPages = Math.max(1, Math.ceil(totalCount / args.pageSize));
  const offset = (args.page - 1) * args.pageSize;

  // 5. Fetch paginated evidence with stable sort
  const evidenceRows = await dbClient
    .select({
      ev: evidenceItems,
      skillSlug: skills.slug,
      skillName: skills.name,
    })
    .from(evidenceItems)
    .leftJoin(skills, eq(evidenceItems.skillId, skills.id))
    .where(and(...conditions))
    .orderBy(
      desc(evidenceItems.confidenceScore),
      desc(evidenceItems.detectedAt),
      asc(evidenceItems.id)
    )
    .offset(offset)
    .limit(args.pageSize);

  // 6. Map evidence items with secret scrubbing and excerpt bounding
  const items = evidenceRows.map(({ ev, skillSlug, skillName }) => {
    const loc = ev.sourceLocation || {};
    let lineRangeStr = null;
    const rawLineRange = loc.lineRange || ev.lineRange;
    if (rawLineRange) {
      if (typeof rawLineRange === 'object') {
        const start = rawLineRange.start ?? rawLineRange.startLine;
        const end = rawLineRange.end ?? rawLineRange.endLine;
        if (start != null && end != null) {
          lineRangeStr = `${start}-${end}`;
        }
      } else if (typeof rawLineRange === 'string') {
        lineRangeStr = rawLineRange;
      }
    }

    const sanitized = SecretScrubber.sanitizeExcerpt(ev.excerpt || '', MAX_EVIDENCE_EXCERPT_CHARS);

    return {
      evidenceId: ev.id,
      skillSlug: skillSlug || null,
      skillName: skillName || null,
      evidenceType: ev.evidenceType,
      confidenceScore: typeof ev.confidenceScore === 'number' ? ev.confidenceScore : 0.0,
      sourceLocation: {
        filePath: loc.filePath || ev.filePath || null,
        commitSha: loc.commitSha || ev.commitSha || null,
        lineRange: lineRangeStr,
      },
      sanitizedExcerpt: sanitized,
      detectedAt: ev.detectedAt ? new Date(ev.detectedAt).toISOString() : new Date().toISOString(),
    };
  });

  const output = {
    project: {
      id: proj.id,
      name: proj.name,
      slug: proj.slug,
      headline: proj.headline || null,
      summary: proj.summary || null,
      role: proj.role || null,
      startDate: proj.startDate ? String(proj.startDate) : null,
      endDate: proj.endDate ? String(proj.endDate) : null,
      createdAt: proj.createdAt ? new Date(proj.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: proj.updatedAt ? new Date(proj.updatedAt).toISOString() : new Date().toISOString(),
    },
    linkedResources,
    evidenceItems: items,
    pagination: {
      page: args.page,
      pageSize: args.pageSize,
      totalCount,
      totalPages,
      hasNextPage: args.page < totalPages,
    },
    _meta: {
      cacheControl: DEFAULT_CACHE_CONTROL,
    },
  };

  return InspectProjectEvidenceOutputSchema.parse(output);
}

// =============================================================================
// Tool 4: analyze_job_fit
// =============================================================================

/**
 * Handles the analyze_job_fit MCP tool.
 *
 * @param {import('../../domain/mcp/mcp.schemas.js').McpRequestContext} context
 * @param {object} rawArgs
 * @param {object} [deps={}]
 * @returns {Promise<object>} Validated AnalyzeJobFitOutputSchema
 */
export async function handleAnalyzeJobFit(context, rawArgs, deps = {}) {
  const dbClient = deps.db || defaultDb;
  const profileService = deps.candidateProfileService || new CandidateProfileService();
  const args = AnalyzeJobFitInputSchema.parse(rawArgs || {});

  const candidateId = await resolveTargetCandidateId(context, args.candidateId, dbClient);

  // 1. Fetch Candidate Profile View & Career Profile
  const profileView = await profileService.getProfile(context, candidateId);
  const careerProfile =
    typeof profileService.getCareerProfile === 'function'
      ? await profileService.getCareerProfile(context, candidateId)
      : null;

  const rawUserCustom = profileView.candidate.profileMetadata?.userCustom || {};
  const rawExperiences =
    rawUserCustom.experience || profileView.candidate.profileMetadata?.experience || [];
  const tenureMetrics =
    careerProfile?.tenureMetrics || TenureCalculator.calculateTenure(rawExperiences);
  const currentEmployment =
    careerProfile?.currentEmployment ||
    CareerStatusDerivation.deriveCurrentEmployment(rawExperiences);
  const currentRole =
    careerProfile?.currentRole ||
    CareerStatusDerivation.resolveCurrentRole({
      userCustomRole:
        rawUserCustom.currentRole || profileView.candidate.profileMetadata?.currentRole,
      headline: profileView.candidate.headline,
      currentEmployment,
    });
  const seniority =
    careerProfile?.seniority ||
    CareerStatusDerivation.deriveSeniority({
      experiences: rawExperiences,
      education: rawUserCustom.education || profileView.candidate.profileMetadata?.education || [],
      professionalTenureYears: tenureMetrics.professionalTenureYears,
    });
  const careerStatus =
    careerProfile?.careerStatus ||
    CareerStatusDerivation.deriveCareerStatus({
      experiences: rawExperiences,
      education: rawUserCustom.education || profileView.candidate.profileMetadata?.education || [],
      professionalTenureMonths: tenureMetrics.professionalTenureMonths,
    });

  // Reconcile candidate skills with authoritative career profile evaluation (e.g. CORROBORATED status)
  const reconciledSkillsMap = new Map();
  if (careerProfile && Array.isArray(careerProfile.topSkills)) {
    for (const skill of careerProfile.topSkills) {
      if (skill.slug) {
        reconciledSkillsMap.set(skill.slug, skill);
      }
    }
  }

  const reconciledCandidateSkills = (profileView.skills || []).map((s) => {
    const cpSkill = reconciledSkillsMap.get(s.slug);
    if (cpSkill && cpSkill.provenanceStatus) {
      return {
        ...s,
        provenanceStatus: cpSkill.provenanceStatus,
        truthStatus: cpSkill.truthStatus || cpSkill.provenanceStatus,
        source: cpSkill.source || s.source,
      };
    }
    return s;
  });

  // Convert profile view to standard CandidateProfile entity for career engines
  const candidateProfileObj = {
    id: profileView.candidate.id,
    tenantId: context.tenantId,
    userId: profileView.candidate.userId,
    displayName: profileView.candidate.displayName,
    headline: profileView.candidate.headline,
    summary: profileView.candidate.summary,
    canonicalEmail: profileView.candidate.canonicalEmail,
    skills: reconciledCandidateSkills,
    projects: profileView.projects || [],
    resources: profileView.resources || [],
    identities: profileView.identities || [],
    profileMetadata: profileView.candidate.profileMetadata || {},
    careerStatus,
    seniority,
    currentRole,
    currentEmployment,
    tenureMetrics,
    workHistory: rawExperiences,
    education: rawUserCustom.education || profileView.candidate.profileMetadata?.education || [],
    jobPreferences:
      careerProfile?.jobPreferences ||
      profileView.candidate.profileMetadata?.careerPreferences ||
      {},
    location:
      profileView.candidate.location ||
      rawUserCustom.location ||
      profileView.candidate.profileMetadata?.location ||
      null,
  };

  // 2. Parse or resolve Job Description
  let jobDescription;
  let rawRequirements;

  if (args.jobId) {
    // Resolve job from canonical UUID via JobDiscoveryService
    const boards = (config.GREENHOUSE_BOARDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((boardToken) => ({ boardToken }));
    const sites = (config.LEVER_SITES || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((site) => ({ site }));
    const discoveryService =
      deps.discoveryService ||
      new JobDiscoveryService({
        greenhouseBoards: boards,
        leverSites: sites,
        fetchTimeoutMs: config.JOB_BOARD_FETCH_TIMEOUT_MS,
      });
    const job = await discoveryService.findJobById(args.jobId);
    if (!job) {
      throw new NotFoundError(`Job posting not found for ID "${args.jobId}".`, 'JOB_NOT_FOUND');
    }

    // ALWAYS use JobDescriptionParser on the full description text to extract
    // atomic requirements (individual skills, experience, education, domain).
    // Raw adapter requirements are full sentences that create compound pseudo-skills.
    let extractedRequirements = [];
    const descriptionText = job.description || '';
    if (descriptionText.trim().length >= 30) {
      const cleanDesc = decodeHtmlEntities(descriptionText);
      try {
        const parserInput = {
            rawText: cleanDesc,
            title: job.title || args.jobTitle || 'Target Role',
            company: job.company || args.companyName || 'Target Company',
            workplaceType: job.workplaceType || 'UNSPECIFIED',
            source: 'API',
          };
          if (job.location) parserInput.location = job.location;
          const classification = await JobDescriptionParser.parse(
            parserInput,
          {
            tenantId: context.tenantId,
            userId: context.userId,
          }
        );
        extractedRequirements = classification.requirements || [];
      } catch {
        // Leave extractedRequirements empty if parser genuinely fails
        extractedRequirements = [];
      }
    }

    // Fallback: if parser produced nothing, use raw adapter requirements
    // but split compound sentences into atomic requirements
    if (
      extractedRequirements.length === 0 &&
      Array.isArray(job.requirements) &&
      job.requirements.length > 0
    ) {
      extractedRequirements = [];
      const seenKeys = new Set();
      for (const rawReq of job.requirements) {
        if (!rawReq || typeof rawReq !== 'string' || rawReq.trim().length < 3) continue;
        // Split compound sentences by comma, 'and', slash to extract atomic skills
        const atomicSkills = _splitIntoAtomicSkills(rawReq);
        for (const skill of atomicSkills) {
          const dedupKey = skill.toLowerCase().trim();
          if (dedupKey && !seenKeys.has(dedupKey)) {
            seenKeys.add(dedupKey);
            extractedRequirements.push({
              id: randomUUID(),
              category: 'SKILL',
              importance: 'REQUIRED',
              weight: 1.0,
              skillSlug: null,
              rawSnippet: rawReq.slice(0, 450),
              extractedValue: skill,
              originalText: rawReq,
              normalizedCriteria: {},
              confidenceScore: 0.85,
              sourceSpan: { section: 'RAW_REQUIREMENT', snippet: rawReq.slice(0, 450) },
              createdAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    // Construct job description from resolved posting
    jobDescription = {
      id: args.jobId,
      tenantId: context.tenantId,
      title: args.jobTitle || job.title || 'Target Role',
      companyName: args.companyName || job.company || 'Target Company',
      level: args.targetRoleLevel || 'MID',
      requirements: extractedRequirements,
      skills: job.skills || [],
      description: descriptionText,
      externalJobId: job.externalJobId || null,
      provider: job.provider || job.source || 'EXTERNAL',
      sourceUrl: job.sourceUrl || null,
      applicationUrl: job.applicationUrl || null,
    };
    rawRequirements = extractedRequirements;
  } else if (args.jobDescriptionText) {
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

    jobDescription = {
      id: classification.jobDescription.id,
      tenantId: context.tenantId,
      title: args.jobTitle || classification.jobDescription.title || 'Target Role',
      companyName: args.companyName || classification.jobDescription.company || 'Target Company',
      level: args.targetRoleLevel || classification.jobDescription.level || 'MID',
      requirements: classification.requirements || [],
      description: args.jobDescriptionText,
      externalJobId: null,
      provider: 'PASTE',
      sourceUrl: null,
      applicationUrl: null,
    };
    rawRequirements = classification.requirements || [];
  } else {
    throw new ValidationError('Either jobId or jobDescriptionText must be provided.');
  }

  // 3. Delegate to existing domain services
  // A. Requirement Match Analysis
  const matchAnalysis = EvidenceMatchingService.matchJobToCandidate(
    context,
    jobDescription,
    candidateProfileObj
  );

  // B. Project Relevance Analysis
  const projectAnalysis = ProjectRelevanceService.computeProjectsRelevance(
    context,
    jobDescription,
    candidateProfileObj.projects,
    { candidateId: candidateProfileObj.id, skills: candidateProfileObj.skills }
  );

  // C. ATS Fit Score Calculation
  const fitScoreAnalysis = AtsFitScoreService.calculateCandidateJobFit(
    context,
    jobDescription,
    matchAnalysis,
    projectAnalysis,
    candidateProfileObj
  );

  // 4. Assemble Bounded Output
  const requirementSummary = {
    matchedCount: matchAnalysis.summary.matchedCount || 0,
    partialCount: matchAnalysis.summary.partialCount || 0,
    missingCount: matchAnalysis.summary.missingCount || 0,
    unknownCount: matchAnalysis.summary.unknownCount || 0,
    keyMatchedSkills: (matchAnalysis.requirementMatches || [])
      .filter(
        (m) =>
          m.matchStatus === 'MATCHED' &&
          (m.normalizedRequirement || m.extractedValue || m.skillSlug)
      )
      .slice(0, 10)
      .map((m) => m.normalizedRequirement || m.extractedValue || m.skillSlug),
    keyMissingSkills: (matchAnalysis.requirementMatches || [])
      .filter(
        (m) =>
          m.matchStatus === 'MISSING' &&
          (m.normalizedRequirement || m.extractedValue || m.skillSlug)
      )
      .slice(0, 10)
      .map((m) => m.normalizedRequirement || m.extractedValue || m.skillSlug),
  };

  const topRelevantProjects = (projectAnalysis.projectRankings || [])
    .slice(0, args.maxRecommendedProjects || 3)
    .map((p, idx) => {
      // Task 5: Explainable project-requirement linkage with full provenance & evidence
      const matchedRequirements = (p.matchedRequirementIds || []).slice(0, 5).map((reqId) => {
        const reqMatch = (matchAnalysis.requirementMatches || []).find(
          (m) => m.requirementId === reqId
        );
        if (reqMatch) {
          return {
            requirementId: reqId,
            normalizedRequirement:
              reqMatch.normalizedRequirement || reqMatch.extractedValue || reqId,
            matchStatus: reqMatch.matchStatus || 'UNKNOWN',
            candidateSkills: Array.isArray(reqMatch.candidateSkills)
              ? reqMatch.candidateSkills
              : [],
            candidateProvenance: reqMatch.candidateProvenance || 'NONE',
            provenanceTrustClass:
              reqMatch.provenanceTrustClass ||
              (reqMatch.primaryEvidence?.filePath &&
              /node_modules|vendor|dist/i.test(reqMatch.primaryEvidence.filePath)
                ? 'LOW_TRUST'
                : 'HIGH_TRUST'),
            supportingEvidence: Array.isArray(reqMatch.supportingEvidence)
              ? reqMatch.supportingEvidence
              : reqMatch.primaryEvidence
                ? [reqMatch.primaryEvidence]
                : [],
            explanation: reqMatch.explanation || '',
          };
        }
        return {
          requirementId: reqId,
          normalizedRequirement: reqId,
          matchStatus: 'UNKNOWN',
          candidateSkills: [],
          candidateProvenance: 'NONE',
          provenanceTrustClass: 'NO_EVIDENCE',
          supportingEvidence: [],
          explanation: '',
        };
      });

      return {
        projectId: p.projectId,
        projectName: p.projectName || 'Project',
        relevanceScore: typeof p.relevanceScore === 'number' ? p.relevanceScore : 0.0,
        relevanceRank: idx + 1,
        matchedRequirements,
        matchedArchitecturalDimensions: (
          p.architecturalSignals ||
          p.matchedArchitecturalDimensions ||
          []
        ).slice(0, 10),
        // Task 6: Traceable project relevance score breakdown
        scoreBreakdown: p.scoreBreakdown || null,
        summary: p.summary || null,
        supportingEvidence: Array.isArray(p.supportingEvidence) ? p.supportingEvidence : [],
      };
    });

  // Build requirement-level matches for output
  const requirementLevelMatches = (matchAnalysis.requirementMatches || []).map((m) => {
    const rawSupporting = Array.isArray(m.supportingEvidence) ? m.supportingEvidence : [];
    const supportingEvidence =
      rawSupporting.length > 0 ? rawSupporting : m.primaryEvidence ? [m.primaryEvidence] : [];

    return {
      requirementId: m.requirementId,
      originalRequirement: m.originalRequirement || m.extractedValue || '',
      normalizedRequirement: m.normalizedRequirement || m.extractedValue || '',
      category: m.category || 'SKILL',
      required: m.importance === 'REQUIRED',
      matchStatus: m.matchStatus || 'UNKNOWN',
      matchConfidence: typeof m.matchConfidence === 'number' ? m.matchConfidence : 0,
      candidateSkills: Array.isArray(m.candidateSkills) ? m.candidateSkills : [],
      candidateProvenance: m.candidateProvenance || 'NONE',
      provenanceTrustClass:
        m.provenanceTrustClass ||
        (m.primaryEvidence?.filePath &&
        /node_modules|vendor|dist/i.test(m.primaryEvidence.filePath)
          ? 'LOW_TRUST'
          : m.candidateProvenance === 'NONE'
            ? 'NO_EVIDENCE'
            : 'HIGH_TRUST'),
      primaryEvidence: m.primaryEvidence || null,
      supportingEvidence,
      explanation: m.explanation || '',
    };
  });

  // Build prioritized skill gaps with atomic skill names (not compound slugs)
  const prioritizedSkillGaps = (matchAnalysis.skillGaps || [])
    .slice(0, args.maxSkillGaps || 5)
    .map((gap) => {
      // `priority` is derived exclusively from the canonical gap priority axis.
      // Gap `severity` (reason category) and `evidenceTrust` are separate axes
      // and are surfaced verbatim below — never collapsed into `priority`.
      let priority = 'IMPORTANT';
      if (gap.priority === 'CRITICAL') {
        priority = 'CRITICAL';
      } else if (gap.priority === 'LOW') {
        priority = 'NICE_TO_HAVE';
      }
      // Ensure skill name is atomic — not a compound sentence slug
      const rawName = gap.skillName || gap.skillSlug || 'Unknown Skill';
      // If the name looks like a compound slug (contains spaces and multiple words),
      // try to extract the core technology name
      let atomicName = rawName;
      if (
        rawName.length > 40 ||
        /\b(?:proficiency|knowledge|experience|familiarity|strong|practical|hands)\b/i.test(rawName)
      ) {
        // This is a compound requirement text, not an atomic skill name
        // Use the extracted value from the original requirement if available
        const atomicSkills = _splitIntoAtomicSkills(rawName);
        if (atomicSkills.length > 0) {
          atomicName = atomicSkills[0];
        }
      }
      return {
        skillSlug: gap.skillSlug || _slugify(atomicName),
        skillName: atomicName,
        category: gap.category || 'TOOL',
        priority,
        severity: gap.severity,
        evidenceTrust: gap.evidenceTrust || 'NO_EVIDENCE',
        remediationAdvice:
          gap.recommendation ||
          gap.remediationAdvice ||
          `Build a repository project demonstrating ${atomicName}.`,
      };
    });

  // Deduplicate skill gaps by skillSlug
  const seenGaps = new Set();
  const dedupedGaps = [];
  for (const gap of prioritizedSkillGaps) {
    if (!seenGaps.has(gap.skillSlug)) {
      seenGaps.add(gap.skillSlug);
      dedupedGaps.push(gap);
    }
  }

  const verifiedSkillsCount = (profileView.skills || []).filter(
    (s) => s.provenanceStatus === 'VERIFIED'
  ).length;

  // Authoritative Evidence Citation Map across requirements and top projects
  const authoritativeEvidenceMap = new Map();
  for (const m of matchAnalysis.requirementMatches || []) {
    if (m.primaryEvidence && m.primaryEvidence.id) {
      authoritativeEvidenceMap.set(m.primaryEvidence.id, m.primaryEvidence);
    }
    if (Array.isArray(m.supportingEvidence)) {
      for (const ev of m.supportingEvidence) {
        if (ev && ev.id) authoritativeEvidenceMap.set(ev.id, ev);
      }
    }
  }
  for (const p of (projectAnalysis.projectRankings || []).slice(0, 3)) {
    if (Array.isArray(p.supportingEvidence)) {
      for (const ev of p.supportingEvidence) {
        if (ev && ev.id) authoritativeEvidenceMap.set(ev.id, ev);
      }
    }
  }
  const totalEvidenceCited = authoritativeEvidenceMap.size;

  const output = {
    jobContext: {
      jobId: args.jobId || (jobDescription.id ? jobDescription.id : null),
      externalJobId: jobDescription.externalJobId || null,
      provider: jobDescription.provider || null,
      company: jobDescription.companyName || null,
      extractedTitle: jobDescription.title,
      extractedLevel: jobDescription.level,
      totalRequirementsIdentified: rawRequirements.length,
      sourceUrl: jobDescription.sourceUrl || null,
      applicationUrl: jobDescription.applicationUrl || null,
    },
    overallFit: {
      atsScore: fitScoreAnalysis.overallScore,
      matchGrade: fitScoreAnalysis.fitBand,
      // Task 8: Analysis status semantics — comprehensive completeness check
      analysisStatus: (() => {
        if (fitScoreAnalysis.analysisStatus) return fitScoreAnalysis.analysisStatus;
        if (rawRequirements.length < 20) return 'DEGRADED';
        // Verify that experience and location requirements were captured
        const hasExpReq = requirementLevelMatches.some((m) => m.category === 'EXPERIENCE');
        const hasLocReq = requirementLevelMatches.some((m) => m.category === 'LOCATION');
        if (!hasExpReq || !hasLocReq) return 'DEGRADED';

        // Verify data integrity: counts should be consistent
        const totalMatches = requirementLevelMatches.length;
        const countSum =
          (requirementSummary.matchedCount || 0) +
          (requirementSummary.partialCount || 0) +
          (requirementSummary.missingCount || 0) +
          (requirementSummary.unknownCount || 0);
        if (totalMatches !== countSum) return 'DEGRADED';

        // If matched items lack evidence or explanation, flag as DEGRADED
        const matchedWithoutEvidence = requirementLevelMatches.filter(
          (m) =>
            m.matchStatus === 'MATCHED' &&
            !m.primaryEvidence &&
            (!m.supportingEvidence || m.supportingEvidence.length === 0) &&
            !m.explanation
        );
        if (matchedWithoutEvidence.length > 0) {
          return 'DEGRADED';
        }
        return 'COMPLETE';
      })(),
      isFallbackScore: Boolean(fitScoreAnalysis.isFallbackScore),
      zeroRequirementWarning:
        fitScoreAnalysis.zeroRequirementWarning ||
        (rawRequirements.length === 0
          ? 'Insufficient structured requirements extracted from job description to perform reliable ATS scoring.'
          : null),
      fitSummary:
        fitScoreAnalysis.explanation ||
        fitScoreAnalysis.verdictSummary ||
        `Candidate has a ${fitScoreAnalysis.fitBand} fit with an ATS score of ${fitScoreAnalysis.overallScore !== null ? `${fitScoreAnalysis.overallScore}/100` : 'N/A'}.`,
      // Task 7: Reproducible score breakdown with trace and semantic fit objects
      scoreBreakdown: (() => {
        const expReqMatch = requirementLevelMatches.find((m) => m.category === 'EXPERIENCE');
        const eduReqMatch = requirementLevelMatches.find((m) => m.category === 'EDUCATION');
        const locReqMatch = requirementLevelMatches.find((m) => m.category === 'LOCATION');

        const experienceFit = expReqMatch
          ? {
              status: expReqMatch.matchStatus,
              explanation: expReqMatch.explanation,
            }
          : {
              status: 'NOT_APPLICABLE',
              explanation:
                'No explicit experience duration or development requirements specified in posting.',
            };

        const educationFit = eduReqMatch
          ? {
              status: eduReqMatch.matchStatus,
              explanation: eduReqMatch.explanation,
            }
          : {
              status: 'NOT_APPLICABLE',
              explanation:
                'No explicit formal education or academic degree requirements specified in posting.',
            };

        const locationFit = locReqMatch
          ? {
              status: locReqMatch.explanation?.toLowerCase().includes('mismatch')
                ? 'MISMATCH'
                : locReqMatch.matchStatus,
              explanation: locReqMatch.explanation,
            }
          : {
              status: 'NOT_APPLICABLE',
              explanation: 'No explicit geographical location constraints specified in posting.',
            };

        return {
          requiredSkillsScore: fitScoreAnalysis.scoreBreakdown?.requiredSkillsScore ?? 0,
          preferredSkillsScore: fitScoreAnalysis.scoreBreakdown?.preferredSkillsScore ?? 0,
          projectRelevanceScore: fitScoreAnalysis.scoreBreakdown?.projectRelevanceScore ?? 0,
          experienceFitScore: fitScoreAnalysis.scoreBreakdown?.experienceFitScore ?? 0,
          educationFitScore: fitScoreAnalysis.scoreBreakdown?.educationFitScore ?? 0,
          locationFitScore: fitScoreAnalysis.scoreBreakdown?.locationFitScore ?? 0,
          evidenceConfidenceScore: fitScoreAnalysis.scoreBreakdown?.evidenceConfidenceScore ?? 0,
          rawScore: fitScoreAnalysis.scoreBreakdown?.rawScore ?? 0,
          scoreCap: fitScoreAnalysis.scoreBreakdown?.scoreCap ?? null,
          isCapped: fitScoreAnalysis.isCapped ?? false,
          criticalGapCount: fitScoreAnalysis.criticalGapCount ?? 0,
          highGapCount: fitScoreAnalysis.highGapCount ?? 0,
          explanation: fitScoreAnalysis.explanations || null,
          experienceFit,
          educationFit,
          locationFit,
        };
      })(),
    },
    requirementSummary,
    requirementMatches: requirementLevelMatches,
    topRelevantProjects,
    prioritizedSkillGaps: dedupedGaps,
    evidenceBacking: {
      verifiedSkillsCount,
      totalEvidenceItemsCited: totalEvidenceCited,
    },
    _meta: {
      cacheControl: DEFAULT_CACHE_CONTROL,
      ui: {
        resourceUri: 'ui://career-hub/job-fit-radar/v1',
      },
    },
  };

  // INVARIANT GATE: verify count consistency before returning.
  // If requirementMatches.length !== rawRequirements.length, log diagnostic data
  // so the discrepancy can be traced to its source.
  const matchesLength = requirementLevelMatches.length;
  const reqsLength = rawRequirements.length;
  const statusSum =
    (requirementSummary.matchedCount || 0) +
    (requirementSummary.partialCount || 0) +
    (requirementSummary.missingCount || 0) +
    (requirementSummary.unknownCount || 0);
  if (matchesLength !== reqsLength || statusSum !== matchesLength) {
    const catCounts = {};
    for (const m of requirementLevelMatches) {
      catCounts[m.category] = (catCounts[m.category] || 0) + 1;
    }
    const statusCounts = {};
    for (const m of requirementLevelMatches) {
      statusCounts[m.matchStatus] = (statusCounts[m.matchStatus] || 0) + 1;
    }
    logger.warn({
      operation: 'analyze_job_fit.count_mismatch',
      jobId: args.jobId,
      candidateId,
      rawRequirementsLength: reqsLength,
      requirementMatchesLength: matchesLength,
      statusSum,
      categoryCounts: catCounts,
      statusCounts,
      requirementSummary,
      msg: `Count invariant violated: rawRequirements=${reqsLength}, requirementMatches=${matchesLength}, statusSum=${statusSum}`,
    });
  }

  // FINAL CONTRACT GATE: validate the COMPLETE assembled response against the
  // strict output schema before it leaves the handler for the MCP transport.
  // No partial/unvalidated payload may be returned, and no unknown or invalid
  // enum value may escape — `.strict()` rejects drift instead of stripping it.
  return AnalyzeJobFitOutputSchema.parse(output);
}

// =============================================================================
// Registration Helper for McpServerWrapper
// =============================================================================

/**
 * Registers all 4 career read tools onto an McpServerWrapper instance.
 *
 * @param {import('../server.js').McpServerWrapper} mcpServer - Server wrapper instance.
 * @param {object} [deps={}] - Optional service dependencies.
 */
export function registerCareerReadTools(mcpServer, deps = {}) {
  // 1. get_candidate_profile
  mcpServer.registerTool(
    CAREER_READ_TOOL_DEFINITIONS.get_candidate_profile,
    async (context, args) => handleGetCandidateProfile(context, args, deps)
  );

  // 2. list_verified_skills
  mcpServer.registerTool(CAREER_READ_TOOL_DEFINITIONS.list_verified_skills, async (context, args) =>
    handleListVerifiedSkills(context, args, deps)
  );

  // 3. inspect_project_evidence
  mcpServer.registerTool(
    CAREER_READ_TOOL_DEFINITIONS.inspect_project_evidence,
    async (context, args) => handleInspectProjectEvidence(context, args, deps)
  );

  // 4. analyze_job_fit
  mcpServer.registerTool(CAREER_READ_TOOL_DEFINITIONS.analyze_job_fit, async (context, args) =>
    handleAnalyzeJobFit(context, args, deps)
  );
}
