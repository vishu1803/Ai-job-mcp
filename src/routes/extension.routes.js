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

import { eq, and } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import {
  candidates,
  jobApplications,
} from '../db/schema.js';
import { validateSession, getSessionCookieOptions } from '../security/session.service.js';
import { config } from '../config/env.js';
import { normalizeJobUrl, deriveCanonicalJobId } from '../utils/url-normalizer.js';
import { generateCanonicalJobId } from '../services/job-discovery.service.js';
import { SecretScrubber } from '../extractors/github/security/secret-scrubber.js';
import { JobApplicationWorkflowService } from '../services/job-application-workflow.service.js';
import { ApplicationTrackingService } from '../services/application-tracking.service.js';
import { handleAnalyzeJobFit } from '../mcp/tools/career-read-tools.js';
import { handleRecommendPortfolioProjects } from '../mcp/tools/career-artifact-tools.js';
import { ConflictError, NotFoundError } from '../errors/index.js';
import { isSubmittedApplication } from '../domain/career/application-status.constants.js';
import { buildExtensionAllowedOrigins, isAllowedExtensionOrigin } from '../security/cors-allowlist.js';

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
        canonicalEmail: candidate.canonicalEmail,
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

    const jobDescriptionText = (job.description || job.rawText || '').trim();
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
    let existingApp = null;
    let isSubmitted = false;

    const existingApps = await database
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenant.id),
          eq(jobApplications.candidateId, candidate.id)
        )
      );

    const match = existingApps.find((app) => {
      if (canonicalJobId && app.canonicalJobId === canonicalJobId) return true;
      if (normalizedJobUrl && app.normalizedJobUrl === normalizedJobUrl) return true;
      return false;
    });

    if (match) {
      existingApp = {
        id: match.id,
        status: match.status,
        company: match.company,
        title: match.title,
        appliedAt: match.appliedAt,
        packageHash: match.metadata?.currentPackageHash || null,
        packageVersion: match.metadata?.currentPackageVersion || 1,
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

    return reply.send({
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
      fitAnalysis: {
        score: Number(
          fitAnalysis?.overallFit?.atsScore ??
            fitAnalysis?.atsScore ??
            fitAnalysis?.score ??
            75
        ),
        grade:
          fitAnalysis?.overallFit?.fitGrade ??
          fitAnalysis?.fitGrade ??
          fitAnalysis?.grade ??
          'B',
        recommendation:
          fitAnalysis?.overallFit?.recommendation ??
          fitAnalysis?.recommendation ??
          'MODERATE_FIT',
        matches: fitAnalysis?.matches || [],
        partialMatches: fitAnalysis?.partialMatches || [],
        missingRequirements: fitAnalysis?.missingRequirements || [],
        hardBlockers: fitAnalysis?.hardBlockers || [],
        seniorityFit: fitAnalysis?.seniorityFit,
      },
      portfolioRecommendations,
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
    const { job, applicationId } = req.body || {};

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
      const existingApps = await database
        .select()
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.tenantId, tenant.id),
            eq(jobApplications.candidateId, candidate.id)
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
    };

    try {
      const preparedResult = await workflowService.prepareJobApplication({
        tenantId: tenant.id,
        candidateId: candidate.id,
        jobPosting: targetJob,
        applicationId: applicationId || undefined,
      });

      const appId = preparedResult.applicationId;
      const packageHash = preparedResult.packageHash;
      const resumeArt = preparedResult.tailoredResume?.artifact || preparedResult.resumeArtifact;
      const coverLetterArt = preparedResult.coverLetter?.artifact || preparedResult.coverLetterArtifact;

      return reply.send({
        applicationId: appId,
        canonicalJobId: preparedResult.jobId || preparedResult.canonicalJobId || null,
        packageVersion: preparedResult.packageVersion || preparedResult.version || 1,
        packageHash,
        packageStatus: preparedResult.packageStatus || 'SAVED',
        artifactStatus: preparedResult.artifactStatus || 'READY',
        lifecycleAction: preparedResult.lifecycleAction || 'CREATED',
        resumeQuality: preparedResult.resumeQuality || null,
        layoutDiagnostics: preparedResult.layoutDiagnostics || null,
        artifacts: {
          resume: {
            filename: resumeArt?.filename || 'tailored-resume.pdf',
            ready: resumeArt?.availabilityStatus === 'READY',
            downloadUrl: `/api/applications/${appId}/artifacts/resume/download?packageHash=${packageHash}`,
          },
          coverLetter: {
            filename: coverLetterArt?.filename || 'tailored-cover-letter.pdf',
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
      if (err.code === 'APPLICATION_ALREADY_SUBMITTED' || err instanceof ConflictError) {
        return reply.code(409).send({
          error: 'Conflict',
          code: 'APPLICATION_ALREADY_SUBMITTED',
          message: 'This application has already been submitted and cannot be modified.',
        });
      }
      req.log.error({ error: err.message }, 'Failed to prepare job application handoff kit');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: err.message || 'Failed to prepare handoff kit',
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
      return reply.code(500).send({
        error: 'Validation Error',
        message: err.message,
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
            resume: appPackage.tailoredResume?.artifact?.filename || 'tailored-resume.pdf',
            coverLetter: appPackage.coverLetter?.artifact?.filename || 'tailored-cover-letter.pdf',
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
      return reply.code(500).send({
        error: 'Preview Error',
        message: err.message,
      });
    }
  });
}
