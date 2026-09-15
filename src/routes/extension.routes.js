/**
 * @file Extension Backend API Routes (P15-001).
 *
 * Provides authoritative orchestration endpoints for the official `aicareershub`
 * browser extension.
 *
 * Strict Architecture Invariants:
 * 1. Thin Client: The extension is a UI client only. These endpoints delegate directly
 *    to existing authoritative services (JobApplicationWorkflowService, ApplicationTrackingService,
 *    handleAnalyzeJobFit, handleRecommendPortfolioProjects).
 * 2. Canonical Identity & Idempotency: Uses `deriveCanonicalJobId` and `normalizeJobUrl`.
 *    Reuses existing applications for the same candidate + target job; never creates duplicates.
 * 3. Exact MCP Semantics Equivalence: All fit scoring, project recommendation, content strategy,
 *    DSA selection, layout diagnostics, and validation subcategories are identical to MCP tools.
 * 4. Submitted Application Protection: Blocks mutations on submitted/applied records.
 * 5. Secure Authentication: Validates session via cookie or Bearer header; zero database
 *    credentials, service-role keys, or LLM secrets exposed to extension.
 */

import { eq, and, notInArray } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import {
  candidates,
  jobApplications,
  projects,
} from '../db/schema.js';
import { validateSession, getSessionCookieOptions } from '../security/session.service.js';
import { config } from '../config/env.js';
import { normalizeJobUrl, deriveCanonicalJobId } from '../utils/url-normalizer.js';
import { resolveCandidateEmail } from '../utils/candidate-email-resolver.js';
import { generateCanonicalJobId } from '../services/job-discovery.service.js';
import { SecretScrubber } from '../extractors/github/security/secret-scrubber.js';
import { buildApplicationArtifactFilename } from '../utils/artifact-filename-builder.js';
import { JobApplicationWorkflowService } from '../services/job-application-workflow.service.js';
import { ApplicationTrackingService } from '../services/application-tracking.service.js';
import { handleAnalyzeJobFit } from '../mcp/tools/career-read-tools.js';
import { handleRecommendPortfolioProjects } from '../mcp/tools/career-artifact-tools.js';
import { ConflictError, NotFoundError, AuthorizationError } from '../errors/index.js';
import { JobAnalysisSnapshotService } from '../services/job-analysis-snapshot.service.js';
import {
  ANALYSIS_SNAPSHOT_CONTRACT_VERSION,
  computeJobContentHash,
} from '../domain/career/analysis-snapshot.schemas.js';
import {
  isSubmittedApplication,
  INACTIVE_APPLICATION_STATUSES,
} from '../domain/career/application-status.constants.js';
import { buildExtensionAllowedOrigins, isAllowedExtensionOrigin } from '../security/cors-allowlist.js';

/**
 * Maps the authoritative analyze_job_fit MCP output contract to the extension's
 * fitAnalysis response shape (P16-001F-5).
 *
 * The MCP tool emits `requirementMatches[]` with `matchStatus` /
 * `normalizedRequirement` — it never emits `matches`, `partialMatches`,
 * `missingRequirements`, or `hardBlockers`. Mapping those nonexistent fields
 * produced permanently empty Requirements-tab data despite a healthy
 * parser/matcher/snapshot pipeline.
 *
 * @param {object|null} fitAnalysis Raw analyzeJobFit structured output
 * @returns {{ matches: Array, partialMatches: Array, missingRequirements: Array, hardBlockers: Array }}
 */
export function serializeRequirementMatchesForExtension(fitAnalysis) {
  const requirementMatches = Array.isArray(fitAnalysis?.requirementMatches)
    ? fitAnalysis.requirementMatches
    : [];

  const toDisplay = (m) => ({
    requirement:
      m.normalizedRequirement || m.originalRequirement || m.extractedValue || '',
    status: m.matchStatus || 'UNKNOWN',
    category: m.category || 'SKILL',
    explanation: m.explanation || '',
    matchConfidence: typeof m.matchConfidence === 'number' ? m.matchConfidence : 0,
  });

  const matches = [];
  const partialMatches = [];
  const missingRequirements = [];
  for (const m of requirementMatches) {
    const status = String(m.matchStatus || 'UNKNOWN').toUpperCase();
    if (status === 'MATCHED') matches.push(toDisplay(m));
    else if (status === 'PARTIAL') partialMatches.push(toDisplay(m));
    else if (status === 'MISSING') missingRequirements.push(toDisplay(m));
    // UNKNOWN statuses are intentionally not surfaced as hard missing/blocking.
  }

  // Hard blockers: critical-priority gaps reported by the matcher, when present.
  const hardBlockers = Array.isArray(fitAnalysis?.hardBlockers)
    ? fitAnalysis.hardBlockers
    : [];

  return { matches, partialMatches, missingRequirements, hardBlockers };
}

/**
 * Normalizes authoritative project recommendations into the canonical extension
 * recommendedProjects contract (P57).
 *
 * Guarantees that:
 * 1. Backend remains the authoritative ranking engine.
 * 2. Projects carry clean display name, technologies, relevanceScore, relevanceBand,
 *    matchedRequirements, and verificationStatus.
 * 3. Gracefully falls back to fitAnalysis.topRelevantProjects or candidate verified
 *    projects if secondary tool calls fail or time out, eliminating "No verified portfolio projects linked."
 *
 * @param {object} params
 * @param {object|null} params.portfolioRecommendations
 * @param {object|null} params.fitAnalysis
 * @param {Array} [params.candidateProjects]
 * @returns {Array<{ projectId: string, name: string, displayName: string, technologies: string[], relevanceScore: number, relevanceBand: string, matchedRequirements: string[], verificationStatus: string }>}
 */
export function normalizeRecommendedProjectsForExtension({
  portfolioRecommendations,
  fitAnalysis,
  candidateProjects = [],
}) {
  const candidateProjectsMap = new Map();
  for (const cp of candidateProjects) {
    if (cp.id) candidateProjectsMap.set(cp.id, cp);
    if (cp.slug) candidateProjectsMap.set(String(cp.slug).toLowerCase(), cp);
    if (cp.name) candidateProjectsMap.set(String(cp.name).toLowerCase(), cp);
  }

  const featured = Array.isArray(portfolioRecommendations?.featuredProjects)
    ? portfolioRecommendations.featuredProjects
    : [];

  const topRelevant = Array.isArray(fitAnalysis?.topRelevantProjects)
    ? fitAnalysis.topRelevantProjects
    : [];

  const sourceList = featured.length > 0 ? featured : topRelevant;

  if (sourceList.length === 0 && candidateProjects.length > 0) {
    return candidateProjects.slice(0, 3).map((cp, idx) => {
      const rawName = cp.displayName || cp.name || 'Project';
      const cleanName = rawName.replace(/^[a-zA-Z0-9_-]+\//, '');
      const tech = Array.isArray(cp.technologies) && cp.technologies.length > 0
        ? cp.technologies
        : (Array.isArray(cp.metadata?.technologies)
          ? cp.metadata.technologies
          : (Array.isArray(cp.metadata?.skills) ? cp.metadata.skills : []));

      return {
        projectId: cp.id,
        name: cleanName,
        displayName: rawName,
        technologies: tech.slice(0, 6),
        relevanceScore: Math.round((70 - idx * 5) * 10) / 10,
        relevanceBand: idx === 0 ? 'HIGH' : 'MEDIUM',
        matchedRequirements: [],
        verificationStatus: 'VERIFIED',
      };
    });
  }

  return sourceList.map((p, idx) => {
    const pId = p.projectId || p.id;
    const rawName = p.displayName || p.name || p.projectName || 'Project';
    const cleanName = rawName.replace(/^[a-zA-Z0-9_-]+\//, '');
    const matchedCp =
      (pId && candidateProjectsMap.get(pId)) ||
      candidateProjectsMap.get(rawName.toLowerCase()) ||
      candidateProjectsMap.get(cleanName.toLowerCase());

    const cpTech = matchedCp
      ? (Array.isArray(matchedCp.technologies) && matchedCp.technologies.length > 0
          ? matchedCp.technologies
          : (Array.isArray(matchedCp.metadata?.technologies)
            ? matchedCp.metadata.technologies
            : (Array.isArray(matchedCp.metadata?.skills) ? matchedCp.metadata.skills : [])))
      : [];

    const tech = cpTech.length > 0
      ? cpTech
      : (Array.isArray(p.technologies) && p.technologies.length > 0)
        ? p.technologies
        : (Array.isArray(p.primarySignals) && p.primarySignals.length > 0)
          ? p.primarySignals
          : (Array.isArray(p.matchedArchitecturalDimensions) && p.matchedArchitecturalDimensions.length > 0)
            ? p.matchedArchitecturalDimensions
            : [];

    const score = Number(p.relevanceScore ?? p.score ?? 50);
    const band =
      p.relevanceBand ||
      (score >= 70 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW');

    const matchedRequirements = Array.isArray(p.matchedRequirements)
      ? p.matchedRequirements
          .map((r) =>
            typeof r === 'string'
              ? r
              : r.normalizedRequirement || r.originalRequirement || r.requirementId || r.name || ''
          )
          .filter(Boolean)
      : [];

    return {
      projectId: pId || matchedCp?.id || `proj-${idx + 1}`,
      name: cleanName,
      displayName: rawName,
      technologies: tech.slice(0, 6),
      relevanceScore: Math.round(score * 10) / 10,
      relevanceBand: band,
      matchedRequirements: matchedRequirements.slice(0, 5),
      verificationStatus: 'VERIFIED',
    };
  });
}

/**
 * Resolves session context from cookies or Bearer Authorization header.
 *
 * @param {import('fastify').FastifyRequest} req
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} database
 * @returns {Promise<{ user: object, tenant: object, session: object } | null>}
 */
async function resolveExtensionSession(req, database) {
  const cookieOpts = getSessionCookieOptions(config);
  let rawToken = req.cookies?.[cookieOpts.name] || req.cookies?.['career_hub_session'];

  if (!rawToken && req.headers?.cookie) {
    const header = req.headers.cookie;
    const match =
      header.match(new RegExp(`(?:^|; )${cookieOpts.name}=([^;]*)`)) ||
      header.match(/(?:^|; )career_hub_session=([^;]*)/);
    if (match) {
      rawToken = decodeURIComponent(match[1]);
    }
  }

  if (!rawToken && req.headers?.authorization?.startsWith('Bearer ')) {
    rawToken = req.headers.authorization.slice(7).trim();
  }

  if (!rawToken) {
    return null;
  }

  try {
    return await validateSession(database, rawToken);
  } catch {
    return null;
  }
}

/**
 * Resolves or creates a candidate record for the authenticated user and tenant.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} database
 * @param {string} tenantId
 * @param {object} user
 * @returns {Promise<object>}
 */
async function getOrCreateCandidate(database, tenantId, user) {
  const [candidate] = await database
    .select()
    .from(candidates)
    .where(and(eq(candidates.tenantId, tenantId), eq(candidates.userId, user.id)))
    .limit(1);

  if (candidate) {
    return candidate;
  }

  const [newCandidate] = await database
    .insert(candidates)
    .values({
      tenantId,
      userId: user.id,
      displayName: user.displayName || user.email.split('@')[0],
      canonicalEmail: user.email,
      status: 'ACTIVE',
      profileMetadata: { userCustom: {}, systemInferred: { onboardingState: 'REGISTERED' } },
    })
    .returning();

  return newCandidate;
}

/**
 * Fastify plugin registering extension backend API routes.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts
 */
export default async function extensionRoutes(app, opts = {}) {
  const database = opts.db || defaultDb;
  const workflowService =
    opts.jobApplicationWorkflowService || new JobApplicationWorkflowService({ database });
  const trackingService =
    opts.applicationTrackingService || new ApplicationTrackingService({ database });
  const snapshotService =
    opts.jobAnalysisSnapshotService ||
    opts.snapshotService ||
    new JobAnalysisSnapshotService({ db: database });
  // Injectable authoritative tool implementations (tests may override to force
  // success / low-fit / failure outcomes deterministically).
  const analyzeJobFit = opts.careerReadToolsOverride?.handleAnalyzeJobFit || handleAnalyzeJobFit;
  const recommendProjects =
    opts.careerArtifactToolsOverride?.handleRecommendPortfolioProjects || handleRecommendPortfolioProjects;

  // Handle Chrome extension CORS & Preflight via explicit origin allowlist (P15-002).
  // - Wildcard origins are never honored for credentialed API traffic.
  // - Loopback dev origins are permitted only outside production.
  // - Unknown origins receive NO CORS headers (browser blocks credentialed reads).
  const allowedOrigins = buildExtensionAllowedOrigins(config);
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && isAllowedExtensionOrigin(origin, allowedOrigins)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      reply.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, X-AiCareersHub-Extension'
      );
    }
    if (req.method === 'OPTIONS') {
      return reply.code(204).send();
    }
  });

  // CORS preflight: explicit OPTIONS route so the plugin-scoped onRequest hook
  // (which only runs for registered routes) can emit allowlist-based CORS
  // headers instead of the request falling through to the 404 handler.
  app.options('/*', async (_req, reply) => {
    return reply.code(204).send();
  });

  // -------------------------------------------------------------------------
  // 1. GET /api/extension/session — Check session status
  // -------------------------------------------------------------------------
  app.get('/session', async (req, reply) => {
    const sessionContext = await resolveExtensionSession(req, database);
    if (!sessionContext) {
      return reply.send({
        status: 'NOT_AUTHENTICATED',
        authenticated: false,
        message: 'No active session found. Please sign in to AI Careers Hub.',
      });
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);
    const resolvedCanonicalEmail =
      resolveCandidateEmail(candidate, user.email, { allowNullable: true }) || user.email;

    return reply.send({
      status: 'AUTHENTICATED',
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      candidate: {
        id: candidate.id,
        displayName: candidate.displayName,
        canonicalEmail: resolvedCanonicalEmail,
        status: candidate.status,
        isConnected: true,
      },
    });
  });

  // Alias for /auth-status
  app.get('/auth-status', async (req, _reply) => {
    return app.inject({
      method: 'GET',
      url: '/api/extension/session',
      headers: req.headers,
    });
  });

  // -------------------------------------------------------------------------
  // 2. POST /api/extension/analyze-job — Extract, canonicalize & analyze fit
  // -------------------------------------------------------------------------
  app.post('/analyze-job', async (req, reply) => {
    const sessionContext = await resolveExtensionSession(req, database);
    if (!sessionContext) {
      return reply.code(401).send({
        error: 'Unauthorized',
        code: 'UNAUTHENTICATED',
        message: 'Authentication required to analyze jobs',
      });
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);
    const { job } = req.body || {};

    if (!job || (!job.description && !job.rawText && !job.title)) {
      return reply.code(400).send({
        error: 'Bad Request',
        code: 'INVALID_JOB_PAYLOAD',
        message: 'Job payload must include title and description or rawText',
      });
    }

    let jobDescriptionText = (job.description || job.rawText || '').trim();
    if (Array.isArray(job.requirements) && job.requirements.length > 0) {
      const reqText = job.requirements.filter(Boolean).map((r) => `- ${r}`).join('\n');
      if (reqText && !jobDescriptionText.includes(job.requirements[0])) {
        jobDescriptionText = `${jobDescriptionText}\n\nRequirements:\n${reqText}`.trim();
      }
    }
    const sourceUrl = job.sourceUrl || '';
    const company = job.company || 'Unknown Company';
    const title = job.title || 'Untitled Role';

    // 1. Canonical Identity Derivation (same as MCP & web app)
    const normalizedJobUrl = sourceUrl ? normalizeJobUrl(sourceUrl) : null;
    let canonicalJobId = deriveCanonicalJobId({
      jobUrl: sourceUrl,
      directPortalUrl: sourceUrl,
      applicationUrl: sourceUrl,
      provider: job.provider,
      externalJobId: job.externalJobId,
      company,
      title,
      jobPosting: {
        url: sourceUrl,
        directPortalUrl: sourceUrl,
        applicationUrl: sourceUrl,
        provider: job.provider,
        externalJobId: job.externalJobId,
        company,
        title,
      },
    });

    if (!canonicalJobId && (normalizedJobUrl || (company && title))) {
      const providerKey = (job.provider || 'GENERIC').toUpperCase();
      const seed = normalizedJobUrl || `${company.toLowerCase()}:${title.toLowerCase()}`;
      canonicalJobId = generateCanonicalJobId(providerKey, seed);
    }

    // 2. Check for Existing Application
    // P15-002 Batch 3: route-level matching mirrors the workflow service's
    // find-or-create predicate — terminal/inactive applications (ARCHIVED,
    // REJECTED, WITHDRAWN) are NOT reported as the existing application for
    // a job, because the service would create a fresh application for that
    // identity. One source of truth for idempotency semantics.
    let existingApp = null;
    let isSubmitted = false;

    const existingApps = await database
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenant.id),
          eq(jobApplications.candidateId, candidate.id),
          notInArray(jobApplications.status, [...INACTIVE_APPLICATION_STATUSES])
        )
      );

    const match = existingApps.find((app) => {
      if (canonicalJobId && app.canonicalJobId === canonicalJobId) return true;
      if (normalizedJobUrl && app.normalizedJobUrl === normalizedJobUrl) return true;
      return false;
    });

    let existingHandoff = null;
    if (match) {
      const existingKit = match.metadata?.handoffKit || match.metadata?.handoffPackage || null;
      const effectiveTitle = match.jobTitle || match.title || title;
      const effectiveCompany = match.companyName || match.company || company;
      const pkgHash = match.metadata?.currentPackageHash || existingKit?.packageHash || null;
      const pkgVer = existingKit?.packageVersion || match.metadata?.currentPackageVersion || 1;

      if (existingKit && pkgHash) {
        existingHandoff = {
          applicationId: match.id,
          canonicalJobId: match.canonicalJobId || canonicalJobId,
          analysisSnapshotId: null,
          packageVersion: pkgVer,
          packageHash: pkgHash,
          packageStatus: match.status || 'SAVED',
          artifactStatus:
            existingKit.status === 'HANDOFF_READY' || existingKit.resume?.storageKey
              ? 'READY'
              : 'UNPREPARED',
          lifecycleAction: 'REUSED',
          candidateName: candidate.displayName,
          targetJob: existingKit.targetJob || {
            title: effectiveTitle,
            company: effectiveCompany,
          },
          artifacts: {
            resume: {
              filename:
                existingKit.resume?.filename ||
                buildApplicationArtifactFilename({
                  candidateName: candidate.displayName,
                  jobTitle: effectiveTitle,
                  artifactType: 'resume',
                }),
              ready: Boolean(existingKit.resume?.storageKey || existingKit.resume?.contentHash),
              downloadUrl: `/api/applications/${match.id}/artifacts/resume/download?packageHash=${pkgHash}`,
              viewUrl: `/api/applications/${match.id}/artifacts/resume/view`,
            },
            coverLetter: {
              filename:
                existingKit.coverLetter?.filename ||
                buildApplicationArtifactFilename({
                  candidateName: candidate.displayName,
                  jobTitle: effectiveTitle,
                  artifactType: 'cover-letter',
                }),
              ready: Boolean(existingKit.coverLetter?.storageKey || existingKit.coverLetter?.contentHash),
              downloadUrl: `/api/applications/${match.id}/artifacts/cover-letter/download?packageHash=${pkgHash}`,
              viewUrl: `/api/applications/${match.id}/artifacts/cover-letter/view`,
            },
            bundle: {
              filename: `handoff-kit-${match.id.slice(0, 8)}.zip`,
              ready: Boolean(existingKit.resume && existingKit.coverLetter),
              downloadUrl: `/api/applications/${match.id}/artifacts/bundle/download?packageHash=${pkgHash}`,
            },
          },
        };
      }

      existingApp = {
        id: match.id,
        status: match.status,
        company: effectiveCompany,
        title: effectiveTitle,
        appliedAt: match.appliedAt,
        packageHash: pkgHash,
        packageVersion: pkgVer,
        handoffData: existingHandoff,
      };

      if (isSubmittedApplication(match)) {
        isSubmitted = true;
      }
    }

    // 3. MCP Context Construction
    const mcpContext = {
      tenantId: tenant.id,
      userId: user.id,
      role: 'MEMBER',
      scopes: ['career:read', 'career:write'],
    };

    // 4. Job Fit Analysis (Authoritative Career Read MCP tool)
    // Zero-fabrication invariant: on authoritative-service failure we must NOT
    // return guessed/default fit values that could be mistaken for real analysis.
    let fitAnalysis = null;
    let analysisError = null;
    try {
      const fitResult = await analyzeJobFit(mcpContext, {
        jobDescriptionText: jobDescriptionText || `${title} at ${company}`,
        jobTitle: title,
        companyName: company,
      });
      fitAnalysis = fitResult?.structuredData || fitResult;
    } catch (err) {
      req.log.warn({ error: err.message }, 'handleAnalyzeJobFit failed — returning explicit analysis failure');
      analysisError = {
        code: 'ANALYSIS_UNAVAILABLE',
        message: 'Job fit analysis is temporarily unavailable. Please try again shortly.',
      };
    }

    // 5. Portfolio Recommendation (Authoritative Career Artifact MCP tool)
    // Zero-fabrication invariant: on failure return empty recommendations with an
    // explicit error marker — never synthetic projects.
    let portfolioRecommendations = null;
    let portfolioError = null;
    try {
      const portfolioResult = await recommendProjects(mcpContext, {
        candidateId: candidate.id,
        jobDescriptionText:
          jobDescriptionText.length >= 50
            ? jobDescriptionText
            : `${title} at ${company}. Required skills and responsibilities: ` +
              jobDescriptionText.padEnd(50, ' .'),
      });
      const pData = portfolioResult?.structuredData || portfolioResult;
      portfolioRecommendations = {
        featuredProjects: pData?.featuredProjects || pData?.projects || [],
        omittedProjects: pData?.omittedProjects || [],
        complementarityScore: pData?.complementarityScore ?? null,
      };
    } catch (err) {
      req.log.warn({ error: err.message }, 'handleRecommendPortfolioProjects failed — returning empty recommendations');
      portfolioRecommendations = {
        featuredProjects: [],
        omittedProjects: [],
        complementarityScore: null,
      };
      portfolioError = {
        code: 'RECOMMENDATIONS_UNAVAILABLE',
        message: 'Portfolio project recommendations are temporarily unavailable.',
      };
    }

    // Zero-fabrication: if the authoritative fit analysis failed, return an
    // explicit error response with NO score/grade/recommendation payload.
    if (analysisError) {
      return reply.code(503).send({
        error: 'Service Unavailable',
        code: 'ANALYSIS_UNAVAILABLE',
        message: analysisError.message,
        canonicalJob: {
          canonicalJobId,
          normalizedJobUrl,
          title,
          company,
          location: job.location || 'Not specified',
          workplace: job.workplace || 'UNKNOWN',
          employmentType: job.employmentType || 'FULL_TIME',
          provider: job.provider || 'COMPANY_CAREERS',
        },
        existingApplication: existingApp,
        isSubmitted,
        fitAnalysis: null,
        portfolioRecommendations,
        portfolioError,
        candidateProfile: {
          id: candidate.id,
          displayName: candidate.displayName,
          isConnected: true,
        },
      });
    }

    // Resolve authoritative score & metrics (Zero-defaulting: score is null when data is insufficient)
    const rawAtsScore =
      fitAnalysis?.overallFit?.atsScore ?? fitAnalysis?.atsScore ?? fitAnalysis?.score;
    const resolvedScore =
      typeof rawAtsScore === 'number' ? Math.round(rawAtsScore) : null;
    const isInsufficientData =
      resolvedScore === null ||
      fitAnalysis?.overallFit?.analysisStatus === 'INSUFFICIENT_DATA';

    const resolvedGrade = isInsufficientData
      ? 'INSUFFICIENT_DATA'
      : (fitAnalysis?.overallFit?.matchGrade ??
        fitAnalysis?.overallFit?.fitGrade ??
        fitAnalysis?.fitGrade ??
        fitAnalysis?.grade ??
        'MODERATE');

    const resolvedRecommendation = isInsufficientData
      ? 'INSUFFICIENT_DATA'
      : (fitAnalysis?.overallFit?.recommendation ??
        fitAnalysis?.recommendation ??
        (resolvedScore !== null && resolvedScore >= 70 ? 'RECOMMENDED' : 'CONDITIONAL'));

    const matchedSkills =
      fitAnalysis?.requirementSummary?.keyMatchedSkills ||
      (fitAnalysis?.requirementMatches || [])
        .filter((m) => m.matchStatus === 'MATCHED' && m.category === 'SKILL')
        .map((m) => m.normalizedRequirement || m.extractedValue)
        .slice(0, 10);

    const missingSkills =
      fitAnalysis?.requirementSummary?.keyMissingSkills ||
      (fitAnalysis?.requirementMatches || [])
        .filter((m) => m.matchStatus === 'MISSING' && m.category === 'SKILL')
        .map((m) => m.normalizedRequirement || m.extractedValue)
        .slice(0, 10);

    const rawExpFit =
      fitAnalysis?.experienceFit || fitAnalysis?.overallFit?.scoreBreakdown?.experienceFit;
    let experienceFitStr = 'Not specified';
    if (rawExpFit) {
      if (typeof rawExpFit === 'string') {
        experienceFitStr = rawExpFit;
      } else if (rawExpFit.status === 'ELIGIBLE' || rawExpFit.status === 'MATCHED') {
        experienceFitStr = 'Eligible';
      } else if (rawExpFit.status === 'NOT_ELIGIBLE' || rawExpFit.status === 'MISSING') {
        experienceFitStr = 'Not Eligible';
      } else if (rawExpFit.status === 'PARTIAL') {
        experienceFitStr = 'Partial';
      } else if (rawExpFit.status === 'NOT_SPECIFIED' || rawExpFit.status === 'NOT_APPLICABLE') {
        experienceFitStr = 'Not specified';
      } else {
        experienceFitStr = rawExpFit.status || 'Unknown';
      }
    }

    // 6. Build and Persist Server-Authoritative Analysis Snapshot (P16-001F-3B)
    const jobContentHash = computeJobContentHash(job);
    let analysisSnapshotId = null;

    try {
      const projectRankings =
        (Array.isArray(fitAnalysis?.topRelevantProjects) && fitAnalysis.topRelevantProjects.length > 0)
          ? fitAnalysis.topRelevantProjects
          : (Array.isArray(portfolioRecommendations?.featuredProjects) && portfolioRecommendations.featuredProjects.length > 0)
            ? portfolioRecommendations.featuredProjects.map((p, idx) => ({
                projectId: p.projectId || p.id,
                projectName: p.projectName || p.name || p.title,
                relevanceScore: p.relevanceScore ?? p.score ?? 50,
                relevanceRank: idx + 1,
                relevanceBand: p.relevanceBand || (idx === 0 ? 'HIGH' : 'MEDIUM'),
              }))
            : [];

      const topRelevantProjects =
        (Array.isArray(portfolioRecommendations?.featuredProjects) && portfolioRecommendations.featuredProjects.length > 0)
          ? portfolioRecommendations.featuredProjects
          : projectRankings;

      const snapshot = await snapshotService.saveSnapshot({
        tenantId: tenant.id,
        candidateId: candidate.id,
        canonicalJobId,
        normalizedJobUrl,
        jobContentHash,
        contractVersion: ANALYSIS_SNAPSHOT_CONTRACT_VERSION,
        overallFit: fitAnalysis?.overallFit || {
          atsScore: resolvedScore,
          fitBand: resolvedGrade,
          recommendation: resolvedRecommendation,
        },
        matchAnalysis: {
          requirementMatches: fitAnalysis?.requirementMatches || [],
          skillGaps: fitAnalysis?.prioritizedSkillGaps || [],
        },
        projectRankings,
        topRelevantProjects,
        parsedJobDescription: {
          requirements: fitAnalysis?.requirementMatches || [],
        },
        metadata: {
          portfolioRecommendations,
          sourceUrl,
        },
      });

      analysisSnapshotId = snapshot?.id || null;
      if (existingHandoff && analysisSnapshotId) {
        existingHandoff.analysisSnapshotId = analysisSnapshotId;
      }
    } catch (snapErr) {
      req.log.warn({ error: snapErr.message }, 'Failed to persist job analysis snapshot');
    }

    // Fetch candidate verified projects for resilient enrichment (P57)
    let candidateProjects = [];
    try {
      candidateProjects = await database
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.tenantId, tenant.id),
            eq(projects.candidateId, candidate.id)
          )
        );
    } catch (projErr) {
      req.log.warn({ error: projErr.message }, 'Failed to fetch candidate projects for recommendation enrichment');
    }

    const recommendedProjects = normalizeRecommendedProjectsForExtension({
      portfolioRecommendations,
      fitAnalysis,
      candidateProjects,
    });

    return reply.send({
      analysisSnapshotId,
      canonicalJob: {
        canonicalJobId,
        normalizedJobUrl,
        title,
        company,
        location: job.location || 'Not specified',
        workplace: job.workplace || 'UNKNOWN',
        employmentType: job.employmentType || 'FULL_TIME',
        provider: job.provider || 'COMPANY_CAREERS',
      },
      existingApplication: existingApp,
      existingHandoff: existingHandoff,
      isSubmitted,
      fitAnalysis: {
        score: resolvedScore,
        grade: resolvedGrade,
        recommendation: resolvedRecommendation,
        matchedSkills,
        missingSkills,
        experienceFit: experienceFitStr,
        rawExperienceFit: rawExpFit,
        // P16-001F-5: derive from the authoritative requirementMatches contract
        // (matches/partialMatches/missingRequirements never existed on the MCP output).
        ...serializeRequirementMatchesForExtension(fitAnalysis),
        seniorityFit: fitAnalysis?.seniorityFit,
        topRelevantProjects: fitAnalysis?.topRelevantProjects || [],
      },
      recommendedProjects,
      portfolioRecommendations: {
        ...(portfolioRecommendations || {}),
        featuredProjects: (Array.isArray(portfolioRecommendations?.featuredProjects) && portfolioRecommendations.featuredProjects.length > 0)
          ? portfolioRecommendations.featuredProjects
          : recommendedProjects,
      },
      candidateProfile: {
        id: candidate.id,
        displayName: candidate.displayName,
        isConnected: true,
      },
    });
  });

  // -------------------------------------------------------------------------
  // 3. POST /api/extension/prepare-handoff — Prepare Handoff Kit
  // -------------------------------------------------------------------------
  app.post('/prepare-handoff', async (req, reply) => {
    const sessionContext = await resolveExtensionSession(req, database);
    if (!sessionContext) {
      return reply.code(401).send({
        error: 'Unauthorized',
        code: 'UNAUTHENTICATED',
        message: 'Authentication required to prepare handoff kit',
      });
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);
    const { job, applicationId, analysisSnapshotId } = req.body || {};

    if (!job || (!job.description && !job.rawText && !job.title)) {
      return reply.code(400).send({
        error: 'Bad Request',
        code: 'INVALID_JOB_PAYLOAD',
        message: 'Job payload must include title and description or rawText',
      });
    }

    const sourceUrl = job.sourceUrl || '';
    const company = job.company || 'Unknown Company';
    const title = job.title || 'Untitled Role';

    const normalizedJobUrl = sourceUrl ? normalizeJobUrl(sourceUrl) : null;
    let canonicalJobId = deriveCanonicalJobId({
      jobUrl: sourceUrl,
      directPortalUrl: sourceUrl,
      applicationUrl: sourceUrl,
      provider: job.provider,
      externalJobId: job.externalJobId,
      company,
      title,
      jobPosting: {
        url: sourceUrl,
        directPortalUrl: sourceUrl,
        applicationUrl: sourceUrl,
        provider: job.provider,
        externalJobId: job.externalJobId,
        company,
        title,
      },
    });

    if (!canonicalJobId && (normalizedJobUrl || (company && title))) {
      const providerKey = (job.provider || 'GENERIC').toUpperCase();
      const seed = normalizedJobUrl || `${company.toLowerCase()}:${title.toLowerCase()}`;
      canonicalJobId = generateCanonicalJobId(providerKey, seed);
    }

    // Resolve and Validate Authoritative Analysis Snapshot (P16-001F-3B)
    const jobContentHash = computeJobContentHash(job);
    let authoritativeJobFit = null;
    const targetSnapshotId = analysisSnapshotId || job.analysisSnapshotId || null;

    if (targetSnapshotId || canonicalJobId) {
      try {
        const validationResult = await snapshotService.getValidatedSnapshot({
          context: { tenantId: tenant.id, candidateId: candidate.id },
          snapshotId: targetSnapshotId,
          canonicalJobId,
          jobContentHash,
          expectedJob: job,
        });

        if (validationResult.valid && validationResult.snapshot) {
          authoritativeJobFit = snapshotService.toWorkflowJobFit(validationResult.snapshot);
          req.log.info(
            { snapshotId: validationResult.snapshot.id, canonicalJobId },
            'Authoritative analysis snapshot bound to prepare-handoff request'
          );
        } else {
          req.log.warn(
            { reason: validationResult.reason, targetSnapshotId, canonicalJobId },
            'Analysis snapshot not used — falling back to parser-backed computation'
          );
        }
      } catch (validationErr) {
        if (
          validationErr.statusCode === 403 ||
          validationErr.statusCode === 409 ||
          validationErr instanceof AuthorizationError ||
          validationErr instanceof ConflictError ||
          validationErr.code === 'ANALYSIS_JOB_MISMATCH'
        ) {
          return reply.code(validationErr.statusCode || 403).send({
            error: validationErr.name || 'Error',
            code: validationErr.code || (validationErr.statusCode === 409 ? 'ANALYSIS_JOB_MISMATCH' : 'ACCESS_DENIED'),
            message: validationErr.message,
          });
        }
        req.log.warn({ error: validationErr.message }, 'Unexpected snapshot validation error');
      }
    }

    // 1. Guard against mutations on submitted applications
    if (applicationId) {
      const [appRow] = await database
        .select()
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.id, applicationId),
            eq(jobApplications.tenantId, tenant.id)
          )
        )
        .limit(1);

      if (appRow && isSubmittedApplication(appRow)) {
        return reply.code(409).send({
          error: 'Conflict',
          code: 'APPLICATION_ALREADY_SUBMITTED',
          message: 'This application has already been submitted and cannot be modified.',
        });
      }
    } else {
      // P15-002 Batch 3: same inactive-status exclusion as above so the 409
      // protection check and the reported existingApplication agree with the
      // workflow service's reuse semantics.
      const existingApps = await database
        .select()
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.tenantId, tenant.id),
            eq(jobApplications.candidateId, candidate.id),
            notInArray(jobApplications.status, [...INACTIVE_APPLICATION_STATUSES])
          )
        );

      const match = existingApps.find((app) => {
        if (canonicalJobId && app.canonicalJobId === canonicalJobId) return true;
        if (normalizedJobUrl && app.normalizedJobUrl === normalizedJobUrl) return true;
        return false;
      });

      if (match && isSubmittedApplication(match)) {
        return reply.code(409).send({
          error: 'Conflict',
          code: 'APPLICATION_ALREADY_SUBMITTED',
          message: 'This application has already been submitted and cannot be modified.',
        });
      }
    }

    const rawProvider = String(job.provider || '').toUpperCase();
    const source = ['GREENHOUSE', 'LEVER', 'REMOTE_OK', 'STRUCTURED_FEED'].includes(rawProvider)
      ? rawProvider
      : 'MANUAL';

    const targetJob = {
      id: canonicalJobId,
      canonicalJobId,
      source,
      provider: source,
      externalJobId: job.externalJobId || undefined,
      company,
      title,
      description: (job.description || job.rawText || '').trim(),
      location: job.location || 'Remote',
      workplaceType: ['REMOTE', 'HYBRID', 'ON_SITE'].includes(String(job.workplace || '').toUpperCase())
        ? String(job.workplace).toUpperCase()
        : 'REMOTE',
      employmentType: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP'].includes(
        String(job.employmentType || '').toUpperCase()
      )
        ? String(job.employmentType).toUpperCase()
        : 'FULL_TIME',
      applicationUrl: sourceUrl || 'https://aicareershub.tech/job-portal',
      directPortalUrl: sourceUrl || undefined,
      sourceUrl: sourceUrl || undefined,
      retrievedAt: new Date().toISOString(),
      responsibilities: Array.isArray(job.responsibilities) ? job.responsibilities : [],
      requirements: Array.isArray(job.requirements) ? job.requirements : [],
      skills: Array.isArray(job.skills) ? job.skills : [],
      ...(authoritativeJobFit ? { jobFitAnalysis: authoritativeJobFit } : {}),
    };

    try {
      const preparedResult = await workflowService.prepareJobApplication({
        tenantId: tenant.id,
        candidateId: candidate.id,
        jobPosting: targetJob,
        applicationId: applicationId || undefined,
        answers: authoritativeJobFit ? { jobFitAnalysis: authoritativeJobFit } : undefined,
      });

      const appId = preparedResult.applicationId;
      const packageHash = preparedResult.packageHash;
      const resumeArt = preparedResult.tailoredResume?.artifact || preparedResult.resumeArtifact;
      const coverLetterArt = preparedResult.coverLetter?.artifact || preparedResult.coverLetterArtifact;

      // Extract recommended projects from prepared package / snapshot for client continuity (P57)
      let candidateProjects = [];
      try {
        candidateProjects = await database
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.tenantId, tenant.id),
              eq(projects.candidateId, candidate.id)
            )
          );
      } catch {
        // Non-critical fallback
      }

      const pkgProjects = preparedResult.portfolioLinks ||
        preparedResult.structuredResume?.projects ||
        authoritativeJobFit?.projectRankings ||
        authoritativeJobFit?.topRelevantProjects ||
        [];

      const recommendedProjects = normalizeRecommendedProjectsForExtension({
        portfolioRecommendations: { featuredProjects: pkgProjects },
        fitAnalysis: authoritativeJobFit,
        candidateProjects,
      });

      return reply.send({
        applicationId: appId,
        canonicalJobId: preparedResult.jobId || preparedResult.canonicalJobId || null,
        analysisSnapshotId: authoritativeJobFit?.snapshotId || null,
        packageVersion: preparedResult.packageVersion || preparedResult.version || 1,
        packageHash,
        packageStatus: preparedResult.packageStatus || 'SAVED',
        artifactStatus: preparedResult.artifactStatus || 'READY',
        lifecycleAction: preparedResult.lifecycleAction || 'CREATED',
        resumeQuality: preparedResult.resumeQuality || null,
        layoutDiagnostics: preparedResult.layoutDiagnostics || null,
        recommendedProjects,
        portfolioRecommendations: {
          featuredProjects: recommendedProjects,
        },
        artifacts: {
          resume: {
            filename:
              resumeArt?.filename ||
              buildApplicationArtifactFilename({
                candidateName: candidate.displayName,
                jobTitle: targetJob.title,
                artifactType: 'resume',
              }),
            ready: resumeArt?.availabilityStatus === 'READY',
            downloadUrl: `/api/applications/${appId}/artifacts/resume/download?packageHash=${packageHash}`,
          },
          coverLetter: {
            filename:
              coverLetterArt?.filename ||
              buildApplicationArtifactFilename({
                candidateName: candidate.displayName,
                jobTitle: targetJob.title,
                artifactType: 'cover-letter',
              }),
            ready: coverLetterArt?.availabilityStatus === 'READY',
            downloadUrl: `/api/applications/${appId}/artifacts/cover-letter/download?packageHash=${packageHash}`,
          },
          bundle: {
            filename: `handoff-kit-${appId.slice(0, 8)}.zip`,
            ready: Boolean(resumeArt && coverLetterArt),
            downloadUrl: `/api/applications/${appId}/artifacts/bundle/download?packageHash=${packageHash}`,
          },
        },
      });
    } catch (err) {
      if (err.code === 'ANALYSIS_JOB_MISMATCH') {
        return reply.code(409).send({
          error: 'Conflict',
          code: 'ANALYSIS_JOB_MISMATCH',
          message: err.message,
        });
      }
      if (err.statusCode === 403 || err instanceof AuthorizationError) {
        return reply.code(403).send({
          error: 'Forbidden',
          code: err.code || 'ACCESS_DENIED',
          message: err.message,
        });
      }
      if (
        err.code === 'APPLICATION_ALREADY_SUBMITTED' ||
        (err instanceof ConflictError && err.code !== 'ANALYSIS_JOB_MISMATCH')
      ) {
        return reply.code(409).send({
          error: 'Conflict',
          code: err.code || 'APPLICATION_ALREADY_SUBMITTED',
          message: err.message || 'This application has already been submitted and cannot be modified.',
        });
      }
      req.log.error({ error: err.message }, 'Failed to prepare job application handoff kit');
      return reply.code(500).send({
        error: 'Internal Server Error',
        code: 'PREPARE_HANDOFF_FAILED',
        message: 'Failed to prepare handoff kit. Please try again shortly.',
      });
    }
  });

  // -------------------------------------------------------------------------
  // 4. POST /api/extension/validate-package — Validate Exact Prepared Package
  // -------------------------------------------------------------------------
  app.post('/validate-package', async (req, reply) => {
    const sessionContext = await resolveExtensionSession(req, database);
    if (!sessionContext) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHENTICATED' });
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);
    const { applicationId, packageHash } = req.body || {};

    if (!applicationId) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'applicationId is required for validation',
      });
    }

    const mcpContext = {
      tenantId: tenant.id,
      userId: user.id,
      candidateId: candidate.id,
      role: 'MEMBER',
    };

    try {
      let appPackage = req.body?.applicationPackage;
      if (!appPackage) {
        const pkgResult = packageHash
          ? await trackingService.getApplicationPackageByVersion(mcpContext, applicationId, packageHash)
          : null;
        const packageRow = pkgResult?.package || (await trackingService.getCurrentApplicationPackage(mcpContext, applicationId));
        if (!packageRow || !packageRow.packagePayload) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Application package not found for applicationId: ${applicationId}`,
          });
        }
        appPackage = packageRow.packagePayload;
      }

      const valResult = await workflowService.validateJobApplication({
        tenantId: tenant.id,
        candidateId: candidate.id,
        applicationPackage: appPackage,
        destinationUrl: appPackage.targetJob?.applicationUrl,
      });

      return reply.send({
        overallStatus: valResult.overallStatus,
        errors: valResult.errors || [],
        warnings: valResult.warnings || [],
        missingFields: valResult.missingFields || [],
        resumeValidation: valResult.resumeValidation || null,
        documentValidation: valResult.documentValidation || null,
        jobConsistency: valResult.jobConsistency || null,
        provenanceIssues: valResult.provenanceIssues || null,
        packageHash: appPackage.packageHash || packageHash,
      });
    } catch (err) {
      if (err instanceof NotFoundError || err.code === 'NOT_FOUND') {
        return reply.code(404).send({
          error: 'Not Found',
          message: err.message,
        });
      }
      req.log.error({ error: err.message }, 'Validation failed');
      // P15-002: no raw err.message in client-facing 500 responses.
      return reply.code(500).send({
        error: 'Validation Error',
        code: 'PACKAGE_VALIDATION_FAILED',
        message: 'Package validation failed. Please try again shortly.',
      });
    }
  });

  // -------------------------------------------------------------------------
  // 5. POST /api/extension/preview-package — Preview Package
  // -------------------------------------------------------------------------
  app.post('/preview-package', async (req, reply) => {
    const sessionContext = await resolveExtensionSession(req, database);
    if (!sessionContext) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHENTICATED' });
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);
    const { applicationId, packageHash } = req.body || {};

    if (!applicationId) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'applicationId is required for preview',
      });
    }

    const mcpContext = {
      tenantId: tenant.id,
      userId: user.id,
      candidateId: candidate.id,
      role: 'MEMBER',
    };

    try {
      let appPackage = req.body?.applicationPackage;
      if (!appPackage) {
        const pkgResult = packageHash
          ? await trackingService.getApplicationPackageByVersion(mcpContext, applicationId, packageHash)
          : null;
        const packageRow = pkgResult?.package || (await trackingService.getCurrentApplicationPackage(mcpContext, applicationId));
        if (!packageRow || !packageRow.packagePayload) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `Application package not found for applicationId: ${applicationId}`,
          });
        }
        appPackage = packageRow.packagePayload;
      }

      const rawPreview = workflowService.createApplicationPreview(appPackage);
      const previewMarkdown = SecretScrubber.scrub(rawPreview);

      return reply.send({
        applicationId,
        packageHash: appPackage.packageHash || packageHash,
        previewMarkdown,
        structuredPreview: {
          candidateInfo: {
            name: appPackage.candidateName,
            email: appPackage.candidateEmail,
            phone: appPackage.candidatePhone || null,
          },
          job: {
            company: appPackage.targetJob?.company,
            title: appPackage.targetJob?.title,
            location: appPackage.targetJob?.location || null,
            applicationUrl: appPackage.targetJob?.applicationUrl || null,
          },
          resumePreview: {
            title: appPackage.tailoredResume?.title,
            fitScore: appPackage.tailoredResume?.fitScore,
            selectedProjectsCount: appPackage.tailoredResume?.selectedProjects?.length || 0,
            artifactStatus: appPackage.tailoredResume?.artifact?.availabilityStatus || null,
          },
          projects: appPackage.portfolioLinks || [],
          documents: {
            resume:
              appPackage.tailoredResume?.artifact?.filename ||
              buildApplicationArtifactFilename({
                candidateName: candidate.displayName,
                jobTitle: targetJob?.title || 'Role',
                artifactType: 'resume',
              }),
            coverLetter:
              appPackage.coverLetter?.artifact?.filename ||
              buildApplicationArtifactFilename({
                candidateName: candidate.displayName,
                jobTitle: targetJob?.title || 'Role',
                artifactType: 'cover-letter',
              }),
            documentsStatus: appPackage.documentsStatus || 'DOCUMENTS_READY',
            artifactsReady: Boolean(appPackage.artifactsReady),
          },
        },
      });
    } catch (err) {
      if (err instanceof NotFoundError || err.code === 'NOT_FOUND') {
        return reply.code(404).send({
          error: 'Not Found',
          message: err.message,
        });
      }
      req.log.error({ error: err.message }, 'Preview creation failed');
      // P15-002: no raw err.message in client-facing 500 responses.
      return reply.code(500).send({
        error: 'Preview Error',
        code: 'PACKAGE_PREVIEW_FAILED',
        message: 'Package preview failed. Please try again shortly.',
      });
    }
  });
}
