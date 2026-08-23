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

import { eq, and, desc, asc, count, ilike, gte, sql } from 'drizzle-orm';
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
import { SecretScrubber } from '../../extractors/github/security/secret-scrubber.js';
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
  const profileService = deps.candidateProfileService || new CandidateProfileService();
  const args = GetCandidateProfileInputSchema.parse(rawArgs || {});

  const candidateId = await resolveTargetCandidateId(context, args.candidateId, dbClient);
  const profileView = await profileService.getProfile(context, candidateId);

  // 1. Calculate profile completeness score
  let completenessScore = 20; // Base existence score
  if (profileView.candidate.headline) completenessScore += 20;
  if (profileView.candidate.summary) completenessScore += 20;
  if (Array.isArray(profileView.skills) && profileView.skills.length > 0) completenessScore += 20;
  if (Array.isArray(profileView.projects) && profileView.projects.length > 0)
    completenessScore += 20;

  // 2. Format top verified skills (max 15)
  let topSkills = undefined;
  if (args.includeSkillsSummary !== false) {
    const verifiedSkills = (profileView.skills || [])
      .filter((s) => s.provenanceStatus === 'VERIFIED')
      .sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0))
      .slice(0, 15)
      .map((s) => ({
        slug: s.slug,
        name: s.name,
        category: s.category || 'TOOL',
        confidenceScore: typeof s.confidenceScore === 'number' ? s.confidenceScore : 0.0,
        evidenceCount: s.evidenceCount || 0,
        provenanceStatus: 'VERIFIED',
      }));
    topSkills = verifiedSkills;
  }

  // 3. Format highlighted projects (max 5)
  let highlightedProjects = undefined;
  if (args.includeProjects !== false) {
    const rawProjects = profileView.projects || [];
    // Prioritize highlighted projects, then order by creation date
    const sortedProjects = [...rawProjects].sort((a, b) => {
      if (a.isHighlighted && !b.isHighlighted) return -1;
      if (!a.isHighlighted && b.isHighlighted) return 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    highlightedProjects = sortedProjects.slice(0, 5).map((p) => ({
      id: p.id,
      name: p.name,
      headline: p.headline || null,
      role: p.role || null,
      startDate: p.startDate ? String(p.startDate) : null,
      endDate: p.endDate ? String(p.endDate) : null,
      linkedResourceCount: p.linkedResourceCount || 0,
      verifiedSignalCount: Array.isArray(p.evidence) ? p.evidence.length : 0,
    }));
  }

  // 4. Format recent experience (max 5)
  let recentExperience = undefined;
  if (args.includeExperience !== false) {
    const userCustomExp =
      profileView.candidate.profileMetadata?.userCustom?.experience ||
      profileView.candidate.profileMetadata?.experience ||
      [];

    if (Array.isArray(userCustomExp)) {
      recentExperience = userCustomExp.slice(0, 5).map((exp) => ({
        company: exp.company || 'Company',
        title: exp.title || 'Role',
        startDate: exp.startDate ? String(exp.startDate) : null,
        endDate: exp.endDate ? String(exp.endDate) : null,
        isCurrent: Boolean(exp.isCurrent),
        verifiedSkillsUsed: Array.isArray(exp.skills) ? exp.skills.slice(0, 10) : [],
      }));
    } else {
      recentExperience = [];
    }
  }

  // 5. Build connected resources summary
  const resourceList = profileView.resources || [];
  const connectedResourcesSummary = {
    totalConnected: resourceList.length,
    publicRepositories: resourceList.filter((r) => !r.isPrivate).length,
    privateRepositories: resourceList.filter((r) => r.isPrivate).length,
  };

  const output = {
    candidate: {
      id: profileView.candidate.id,
      displayName: profileView.candidate.displayName,
      headline: profileView.candidate.headline || null,
      summary: profileView.candidate.summary || null,
      canonicalEmail: profileView.candidate.canonicalEmail || null,
      status: profileView.candidate.status,
      createdAt: profileView.candidate.createdAt,
      updatedAt: profileView.candidate.updatedAt,
    },
    profileCompletenessScore: completenessScore,
    identities: (profileView.identities || []).map((i) => ({
      provider: i.provider,
      externalUsername: i.externalUsername || null,
      verified: Boolean(i.verified),
    })),
    connectedResourcesSummary,
    topSkills,
    highlightedProjects,
    recentExperience,
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

  // Build query conditions (strictly VERIFIED skills only)
  const conditions = [
    eq(candidateSkills.tenantId, context.tenantId),
    eq(candidateSkills.candidateId, candidateId),
    eq(candidateSkills.provenanceStatus, 'VERIFIED'),
  ];

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

    items.push({
      skillId: cs.skillId,
      slug: skillSlug,
      name: skillName,
      category: cs.category || 'TOOL',
      provenanceStatus: 'VERIFIED',
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
    conditions.push(ilike(skills.slug, args.skillSlug));
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

  // 1. Fetch Candidate Profile View
  const profileView = await profileService.getProfile(context, candidateId);

  // Convert profile view to standard CandidateProfile entity for career engines
  const candidateProfileObj = {
    id: profileView.candidate.id,
    tenantId: context.tenantId,
    userId: profileView.candidate.userId,
    displayName: profileView.candidate.displayName,
    headline: profileView.candidate.headline,
    summary: profileView.candidate.summary,
    canonicalEmail: profileView.candidate.canonicalEmail,
    skills: profileView.skills || [],
    projects: profileView.projects || [],
    resources: profileView.resources || [],
    identities: profileView.identities || [],
    workHistory: profileView.candidate.profileMetadata?.userCustom?.experience || [],
    education: profileView.candidate.profileMetadata?.userCustom?.education || [],
  };

  // 2. Parse or resolve Job Description
  let jobDescription;
  let rawRequirements;

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

    jobDescription = {
      id: classification.jobDescription.id,
      tenantId: context.tenantId,
      title: args.jobTitle || classification.jobDescription.title || 'Target Role',
      companyName: args.companyName || classification.jobDescription.company || 'Target Company',
      level: args.targetRoleLevel || classification.jobDescription.level || 'MID',
      requirements: classification.requirements || [],
    };
    rawRequirements = classification.requirements || [];
  } else {
    throw new ValidationError('Job description text is required.');
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
    { candidateId: candidateProfileObj.id }
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
      .filter((m) => m.matchStatus === 'MATCHED' && m.skillSlug)
      .slice(0, 10)
      .map((m) => m.skillSlug),
    keyMissingSkills: (matchAnalysis.skillGaps || [])
      .slice(0, 10)
      .map((g) => g.skillSlug || g.requirementName || 'unknown'),
  };

  const topRelevantProjects = (projectAnalysis.projectRankings || [])
    .slice(0, args.maxRecommendedProjects || 3)
    .map((p, idx) => ({
      projectId: p.projectId,
      projectName: p.projectName || 'Project',
      relevanceScore: typeof p.relevanceScore === 'number' ? p.relevanceScore : 0.0,
      relevanceRank: idx + 1,
      matchedRequirements: (p.matchedRequirementIds || []).slice(0, 5),
      matchedArchitecturalDimensions: (p.matchedArchitecturalDimensions || []).slice(0, 5),
      summary: p.summary || null,
    }));

  const prioritizedSkillGaps = (matchAnalysis.skillGaps || [])
    .slice(0, args.maxSkillGaps || 5)
    .map((gap) => {
      let priority = 'IMPORTANT';
      if (gap.priority === 'CRITICAL' || gap.severity === 'CRITICAL') {
        priority = 'CRITICAL';
      } else if (gap.priority === 'LOW' || gap.severity === 'LOW') {
        priority = 'NICE_TO_HAVE';
      } else if (gap.priority === 'HIGH' || gap.priority === 'MEDIUM') {
        priority = 'IMPORTANT';
      }
      return {
        skillSlug: gap.skillSlug || 'unknown-skill',
        skillName: gap.skillName || gap.skillSlug || 'Unknown Skill',
        category: gap.category || 'TOOL',
        priority,
        remediationAdvice:
          gap.recommendation ||
          gap.remediationAdvice ||
          'Build a repository project demonstrating this technology.',
      };
    });

  const verifiedSkillsCount = (profileView.skills || []).filter(
    (s) => s.provenanceStatus === 'VERIFIED'
  ).length;

  let totalEvidenceCited = 0;
  for (const m of matchAnalysis.requirementMatches || []) {
    if (m.primaryEvidence) totalEvidenceCited++;
    if (Array.isArray(m.supportingEvidence)) totalEvidenceCited += m.supportingEvidence.length;
  }

  const output = {
    jobContext: {
      extractedTitle: jobDescription.title,
      extractedLevel: jobDescription.level,
      totalRequirementsIdentified: rawRequirements.length,
    },
    overallFit: {
      atsScore: fitScoreAnalysis.overallScore,
      matchGrade: fitScoreAnalysis.fitBand,
      fitSummary:
        fitScoreAnalysis.verdictSummary ||
        `Candidate has a ${fitScoreAnalysis.fitBand} fit with an ATS score of ${fitScoreAnalysis.overallScore}/100.`,
      scoreBreakdown: {
        requiredSkillsScore: fitScoreAnalysis.scoreBreakdown?.requiredSkillsScore ?? 0,
        preferredSkillsScore: fitScoreAnalysis.scoreBreakdown?.preferredSkillsScore ?? 0,
        projectRelevanceScore: fitScoreAnalysis.scoreBreakdown?.projectRelevanceScore ?? 0,
        experienceFitScore: fitScoreAnalysis.scoreBreakdown?.experienceFitScore ?? 0,
        educationFitScore: fitScoreAnalysis.scoreBreakdown?.educationFitScore ?? 0,
        locationFitScore: fitScoreAnalysis.scoreBreakdown?.locationFitScore ?? 0,
        evidenceConfidenceScore: fitScoreAnalysis.scoreBreakdown?.evidenceConfidenceScore ?? 0,
      },
    },
    requirementSummary,
    topRelevantProjects,
    prioritizedSkillGaps,
    evidenceBacking: {
      verifiedSkillsCount,
      totalEvidenceItemsCited: totalEvidenceCited,
    },
    _meta: {
      cacheControl: DEFAULT_CACHE_CONTROL,
    },
  };

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
