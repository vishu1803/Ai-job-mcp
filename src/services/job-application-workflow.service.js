/**
 * @file Job Application Workflow & Human-in-the-Loop Submission Service (P14-004B / ARCH-055).
 *
 * Implements the complete end-to-end job application workflow:
 * 1. Application Package Preparation with Sovereign Truth Categories (VERIFIED vs CLAIMED vs USER_PROVIDED).
 * 2. Pre-Submission Application Validation & Duplicate Detection.
 * 3. Human Review Application Preview Generation.
 * 4. Cryptographic Application Approval Ticket Minting (15-min TTL, bound to package hash).
 * 5. High-Risk Submission Gateway: Requires valid, single-use, hash-matched approval ticket.
 * 6. Graceful Manual Handoff for Unsupported External Portals.
 */

import crypto from 'node:crypto';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { candidates, users, jobApplications, applicationPackages, candidateSkills, skills, applicationApprovalTickets } from '../db/schema.js';
import {
  createApplicationApprovalTicketRecord,
  getApplicationApprovalTicketById,
  updateApplicationApprovalTicketStatus,
  revokeApplicationApprovalTicket as revokeApprovalTicketRepo,
} from '../db/repositories/application-approval-ticket.repository.js';
import { CandidateArtifactContentService } from './candidate-artifact-content.service.js';
import { CandidateProfileService } from './candidate-profile.service.js';
import { ApplicationTrackingService } from './application-tracking.service.js';
import { ApplicationHandoffService } from './application-handoff.service.js';
import { AtsFitScoreService } from './ats-fit-score.service.js';
import { EvidenceMatchingService } from './evidence-matching.service.js';
import { ProjectRelevanceService } from './project-relevance.service.js';
import { normalizeJobInput } from './job-normalization.service.js';
import { SkillTaxonomyEngine } from '../domain/career/skill-taxonomy.js';
import { boundRequirementText } from '../domain/career/job-requirement.schemas.js';
import { normalizeTruthCategory } from '../domain/career/truth-category.js';
import { normalizeJobUrl, deriveCanonicalJobId } from '../utils/url-normalizer.js';
import {
  ApplicationPackageSchema,
  ApplicationValidationResultSchema,
  ApplicationApprovalTicketSchema,
  SubmissionResultSchema,
  RESUME_GENERATION_CONTRACT_VERSION,
  LEGACY_GENERATION_CONTRACT_VERSION,
  DEFAULT_STRUCTURED_RESUME_SCHEMA_VERSION,
  ApplicationSnapshotSchema,
  ActionSafetyLevelEnum,
  ACTION_TAXONOMY,
  SubmissionRetryStateEnum,
  JobApplicationWorkflowStateEnum,
  JobApplicationWorkflowStateMachine,
} from '../domain/job/job-workflow.schemas.js';
import { buildStructuredResumeSnapshot } from './structured-resume.service.js';
import { defaultAiResumeContentGenerator } from './ai-resume-content-generator.service.js';
import {
  StructuredResumeDocumentSchema,
  ResumeTailoringPlanSchema,
  EvidenceValidationReceiptSchema,
} from '../domain/career/resume.schemas.js';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ConflictError,
  InvalidTicketSignatureError,
} from '../errors/index.js';
import { logger as defaultLogger } from '../utils/logger.js';
import {
  PortalAdapterRegistry,
  portalAdapterRegistry as defaultPortalAdapterRegistry,
} from '../domain/portal/portal-adapter-registry.js';

/**
 * Best-effort package persistence for prepare_job_application (P14-005BA).
 *
 * Persists the freshly prepared package as the authoritative CURRENT version
 * for the application resolved for the candidate + job target. Failures are
 * logged and swallowed so preparation itself never fails due to persistence:
 * the package is still returned to the caller with its packageHash intact.
 * A failed persistence attempt therefore never replaces a previously valid
 * package (the previous CURRENT version simply remains).
 *
 * @param {JobApplicationWorkflowService} service
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.userId
 * @param {string} params.candidateId
 * @param {string} [params.applicationId]
 * @param {string} [params.canonicalJobId]
 * @param {string} [params.jobId]
 * @param {object} params.preparedPackage Validated ApplicationPackage
 * @param {import('pino').Logger} params.logger
 * @returns {Promise<object|null>} Persisted CURRENT package row, or null
 */
async function persistPreparedPackage({
  service,
  tenantId,
  userId,
  candidateId,
  applicationId,
  canonicalJobId,
  jobId,
  preparedPackage,
  logger,
}) {
  try {
    const context = { tenantId, userId, role: 'MEMBER' };
    const targetJob = preparedPackage.targetJob || {};
    const directUrl =
      targetJob.directPortalUrl || targetJob.applicationUrl || targetJob.sourceUrl || null;
    const normalizedUrl = directUrl ? normalizeJobUrl(directUrl) : null;
    const resolvedCanonicalJobId =
      canonicalJobId ||
      targetJob.canonicalJobId ||
      deriveCanonicalJobId({
        canonicalJobId: targetJob.canonicalJobId,
        jobId: targetJob.id || jobId,
        source: targetJob.source,
        directPortalUrl: directUrl,
        applicationUrl: directUrl,
      });

    const appSource = [
      'LINKEDIN',
      'INDEED',
      'COMPANY_CAREERS',
      'REFERRAL',
      'RECRUITER',
      'MANUAL',
      'OTHER',
      // P16-001F-5: Indian job-board providers detected by the extension.
      'GREENHOUSE',
      'LEVER',
      'WORKDAY',
      'NAUKRI',
      'IIMJOBS',
      'SHINE',
      'FOUNDIT',
      'TIMESJOBS',
      'HIRECT',
      'CUTSHORT',
      'INSTAHYRE',
    ].includes(String(targetJob.source || '').toUpperCase())
      ? String(targetJob.source).toUpperCase()
      : 'COMPANY_CAREERS';

    const application = await service.applicationTrackingService.resolveOrCreateApplication(
      context,
      candidateId,
      {
        applicationId: applicationId || preparedPackage.applicationId,
        canonicalJobId: resolvedCanonicalJobId,
        normalizedJobUrl: normalizedUrl,
        company: targetJob.company,
        title: targetJob.title,
        jobUrl: directUrl,
        source: appSource,
        packageHash: preparedPackage.packageHash,
      }
    );

    // Keep get_job_application.tailoredDocuments consistent with the CURRENT
    // package even before any handoff kit exists: attach idempotent, hash-
    // tagged document snapshots for this package version (P14-005BA).
    // This happens before the package ledger promotion. If snapshot
    // persistence fails, the existing CURRENT package remains untouched.
    await service.applicationTrackingService.attachPackageDocumentSnapshots(
      context,
      application.id,
      preparedPackage
    );

    const current = await service.applicationTrackingService.recordApplicationPackage(
      context,
      application.id,
      preparedPackage,
      { source: 'PREPARE_JOB_APPLICATION' }
    );

    let lifecycleAction = 'CREATED';
    if (application.isReused) {
      if (current.version > 1 && !current.isReused) {
        lifecycleAction = 'UPDATED';
      } else {
        lifecycleAction = 'REUSED';
      }
    }

    logger.info(
      {
        tenantId,
        applicationId: application.id,
        packageHash: current.packageHash,
        packageVersion: current.version,
        lifecycleAction,
      },
      'Prepared application package persisted as CURRENT version'
    );
    return {
      applicationId: application.id,
      canonicalJobId: application.canonicalJobId || resolvedCanonicalJobId || null,
      lifecycleAction,
      packageStatus: application.status || 'SAVED',
      ...current,
    };
  } catch (err) {
    if (
      err.code === 'APPLICATION_ALREADY_SUBMITTED' ||
      err.code === 'APPLICATION_JOB_MISMATCH' ||
      err instanceof ConflictError ||
      err instanceof NotFoundError ||
      err instanceof AuthorizationError
    ) {
      throw err;
    }
    logger.warn(
      {
        error: err.message,
        cause: err.cause?.message || String(err.cause || ''),
        stack: err.stack,
        packageHash: preparedPackage.packageHash,
        candidateId,
      },
      'Best-effort package persistence failed; preparation result returned unpersisted'
    );
    return null;
  }
}

// In-memory single-use approval tickets registry (state machine)
const APPROVAL_TICKETS_STORE = new Map();

/**
 * Computes deterministic canonical SHA-256 hash of an application package payload.
 * Canonical hash input includes generation contract version and structured resume schema version
 * (P16-001F-3A).
 *
 * @param {object} pkg Raw application package
 * @returns {string} 64-character hex hash
 */
export function computeApplicationPackageHash(pkg) {
  const structuredResume = pkg?.structuredResume || pkg?.tailoredResume?.structuredResume || null;
  const generationContractVersion =
    pkg?.generationContractVersion ||
    pkg?.tailoredResume?.generationContractVersion ||
    (structuredResume ? RESUME_GENERATION_CONTRACT_VERSION : LEGACY_GENERATION_CONTRACT_VERSION);

  let structuredResumeSchemaVersion;
  if (pkg?.structuredResumeSchemaVersion !== undefined) {
    structuredResumeSchemaVersion = pkg.structuredResumeSchemaVersion;
  } else if (pkg?.tailoredResume?.structuredResumeSchemaVersion !== undefined) {
    structuredResumeSchemaVersion = pkg.tailoredResume.structuredResumeSchemaVersion;
  } else if (structuredResume?.schemaVersion) {
    structuredResumeSchemaVersion = structuredResume.schemaVersion;
  } else if (generationContractVersion === LEGACY_GENERATION_CONTRACT_VERSION) {
    structuredResumeSchemaVersion = null;
  } else {
    structuredResumeSchemaVersion = DEFAULT_STRUCTURED_RESUME_SCHEMA_VERSION;
  }

  const canonical = {
    candidateId: pkg?.candidateId,
    candidateName: pkg?.candidateName,
    candidateEmail: pkg?.candidateEmail,
    jobId: pkg?.targetJob?.id !== undefined ? pkg.targetJob.id : pkg?.jobId,
    jobTitle: pkg?.targetJob?.title !== undefined ? pkg.targetJob.title : pkg?.jobTitle,
    company: pkg?.targetJob?.company !== undefined ? pkg.targetJob.company : pkg?.company,
    resumeContent: pkg?.tailoredResume?.markdownContent,
    coverLetterContent: pkg?.coverLetter?.markdownContent,
    answers: pkg?.answers || {},
    generationContractVersion,
    structuredResumeSchemaVersion,
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

/**
 * Signs an approval ticket payload using an HMAC-SHA256 key.
 * Binds ticketId, tenantId, userId, candidateId, applicationId, jobId, packageHash, destinationUrl, and expiresAt.
 *
 * @param {object} ticketData
 * @param {string} [secretKey]
 * @returns {string}
 */
export function signApplicationTicket(
  ticketData,
  secretKey = process.env.CAREER_HUB_APPROVAL_SECRET || 'career-hub-approval-hmac-key'
) {
  const payload = `${ticketData.ticketId || ticketData.id}:${ticketData.tenantId}:${ticketData.userId}:${ticketData.candidateId || ''}:${ticketData.applicationId || ''}:${ticketData.jobId || ''}:${ticketData.packageHash}:${ticketData.destinationUrl}:${ticketData.expiresAt}`;
  return crypto.createHmac('sha256', secretKey).update(payload).digest('hex');
}

/**
 * Validates cryptographic signature of an approval ticket using timing-safe comparison.
 * Supports both canonical multi-bound payloads and legacy payloads.
 *
 * @param {object} ticketData
 * @param {string} signature
 * @param {string} [secretKey]
 * @returns {boolean}
 */
export function verifyApplicationTicketSignature(
  ticketData,
  signature,
  secretKey = process.env.CAREER_HUB_APPROVAL_SECRET || 'career-hub-approval-hmac-key'
) {
  if (!signature || typeof signature !== 'string') return false;

  const payloadCanonical = `${ticketData.ticketId || ticketData.id}:${ticketData.tenantId}:${ticketData.userId}:${ticketData.candidateId || ''}:${ticketData.applicationId || ''}:${ticketData.jobId || ''}:${ticketData.packageHash}:${ticketData.destinationUrl}:${ticketData.expiresAt}`;
  const expectedCanonical = crypto.createHmac('sha256', secretKey).update(payloadCanonical).digest('hex');

  const payloadLegacy = `${ticketData.ticketId || ticketData.id}:${ticketData.tenantId}:${ticketData.userId}:${ticketData.packageHash}:${ticketData.destinationUrl}:${ticketData.expiresAt}`;
  const expectedLegacy = crypto.createHmac('sha256', secretKey).update(payloadLegacy).digest('hex');

  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBufCanonical = Buffer.from(expectedCanonical, 'hex');
    const expBufLegacy = Buffer.from(expectedLegacy, 'hex');

    const matchCanonical =
      sigBuf.length === expBufCanonical.length &&
      crypto.timingSafeEqual(sigBuf, expBufCanonical);
    const matchLegacy =
      sigBuf.length === expBufLegacy.length &&
      crypto.timingSafeEqual(sigBuf, expBufLegacy);

    return matchCanonical || matchLegacy;
  } catch {
    return false;
  }
}

import {
  isSyntheticEmail,
  resolveCandidateEmail,
  evaluateCandidateEmailStatus,
  isValidEmailFormat,
} from '../utils/candidate-email-resolver.js';

export {
  isSyntheticEmail,
  resolveCandidateEmail,
  evaluateCandidateEmailStatus,
  isValidEmailFormat,
};

/**
 * Detects the ATS/portal provider from destination URL.
 *
 * @param {string} url Destination job URL
 * @returns {string} Normalized portal type
 */
export function detectPortalType(url) {
  const u = (url || '').toLowerCase();
  if (u.includes('greenhouse.io') || u.includes('boards.greenhouse.io')) return 'GREENHOUSE';
  if (u.includes('lever.co')) return 'LEVER';
  if (u.includes('myworkdayjobs.com') || u.includes('workday.com')) return 'WORKDAY';
  if (u.includes('taleo.net')) return 'TALEO';
  if (u.includes('icims.com')) return 'ICIMS';
  return 'EXTERNAL_PORTAL';
}

export class JobApplicationWorkflowService {
  /**
   * @param {object} [options={}]
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.database=defaultDb]
   * @param {CandidateArtifactContentService} [options.candidateArtifactContentService]
   * @param {ApplicationTrackingService} [options.applicationTrackingService]
   * @param {Array<object>|Map<string, object>} [options.submissionAdapters] Real external ATS submission adapters
   * @param {import('./mcp-audit.service.js').McpAuditService} [options.mcpAuditService]
   * @param {import('pino').Logger} [options.logger=defaultLogger]
   */
  constructor(options = {}) {
    this.db = options.database || defaultDb;
    this.candidateProfileService =
      options.candidateProfileService || new CandidateProfileService(this.db);
    this.candidateArtifactContentService =
      options.candidateArtifactContentService ||
      new CandidateArtifactContentService({
        database: this.db,
        candidateProfileService: this.candidateProfileService,
      });
    this.applicationTrackingService =
      options.applicationTrackingService || new ApplicationTrackingService({ database: this.db });
    const documentStorage =
      options.documentStorageService ||
      options.documentStorage ||
      this.applicationTrackingService.documentStorage;
    this.applicationHandoffService =
      options.applicationHandoffService ||
      new ApplicationHandoffService({
        applicationTrackingService: this.applicationTrackingService,
        documentStorage,
        candidateProfileService: new CandidateProfileService(this.db),
      });
    this.portalAdapterRegistry =
      options.portalAdapterRegistry || new PortalAdapterRegistry();
    this.submissionAdapters = Array.isArray(options.submissionAdapters)
      ? options.submissionAdapters
      : options.submissionAdapters instanceof Map
        ? Array.from(options.submissionAdapters.values())
        : [];
    for (const ad of this.submissionAdapters) {
      try {
        this.portalAdapterRegistry.register(ad);
      } catch {
        if (typeof ad?.canSubmit === 'function') {
          this.portalAdapterRegistry.register({
            id: ad.id || `adapter-${Math.random().toString(36).slice(2, 8)}`,
            name: ad.name || 'Submission Adapter',
            canHandle: (dest) => ad.canSubmit(typeof dest === 'string' ? dest : dest?.url),
            canSubmit: (dest) => ad.canSubmit(typeof dest === 'string' ? dest : dest?.url),
            submit: (p) =>
              typeof ad.submit === 'function'
                ? ad.submit(p)
                : ad.submitOrHandoff(p),
            submitOrHandoff: async (p) =>
              typeof ad.submitOrHandoff === 'function'
                ? ad.submitOrHandoff(p)
                : ad.submit(p),
          });
        }
      }
    }
    this.mcpAuditService = options.mcpAuditService || null;
    this.aiProvider = options.aiProvider;
    this.logger = options.logger || defaultLogger;
  }

  /**
   * Resolves or computes candidate-job fit analysis (Option A: analyze_job_fit passthrough).
   *
   * @private
   * @param {object} params
   * @param {object} params.context
   * @param {string} params.candidateId
   * @param {object} params.targetJobPosting
   * @param {object} [params.answers]
   * @returns {Promise<object|null>}
   */
  async _resolveOrComputeJobFit({ context, candidateId, targetJobPosting, answers }) {
    // 0. Authoritative incoming analysis passthrough (P16-001F-3B Protocol Guard)
    // If targetJobPosting.jobFitAnalysis contains authoritative projectRankings,
    // matchAnalysis, or topRelevantProjects, USE IT DIRECTLY.
    // It MUST NOT fall through to recomputation.
    if (targetJobPosting?.jobFitAnalysis) {
      const candidateFit = targetJobPosting.jobFitAnalysis;
      const hasRankings =
        (Array.isArray(candidateFit.projectRankings) && candidateFit.projectRankings.length > 0) ||
        (Array.isArray(candidateFit.topRelevantProjects) &&
          candidateFit.topRelevantProjects.length > 0);
      if (hasRankings) {
        return {
          ...candidateFit,
          projectRankings: candidateFit.projectRankings || candidateFit.topRelevantProjects || [],
          topRelevantProjects:
            candidateFit.topRelevantProjects || candidateFit.projectRankings || [],
          source: candidateFit.source || 'authoritative_analyze_snapshot',
        };
      }
    }

    let resolvedFit = null;

    // 1. Direct properties on targetJobPosting
    if (
      targetJobPosting?.jobFitAnalysis &&
      typeof targetJobPosting.jobFitAnalysis.overallFit?.atsScore === 'number'
    ) {
      resolvedFit = targetJobPosting.jobFitAnalysis;
    } else if (
      targetJobPosting?.jobFit &&
      typeof targetJobPosting.jobFit.overallFit?.atsScore === 'number'
    ) {
      resolvedFit = targetJobPosting.jobFit;
    } else if (
      targetJobPosting?.overallFit &&
      typeof targetJobPosting.overallFit.atsScore === 'number'
    ) {
      resolvedFit = { overallFit: targetJobPosting.overallFit, source: 'analyze_job_fit' };
    } else if (
      targetJobPosting?.atsFitSnapshot &&
      typeof targetJobPosting.atsFitSnapshot === 'object'
    ) {
      const atsScore =
        targetJobPosting.atsFitSnapshot.overallScore ?? targetJobPosting.atsFitSnapshot.atsScore;
      if (typeof atsScore === 'number') {
        resolvedFit = {
          overallFit: {
            atsScore,
            fitBand: targetJobPosting.atsFitSnapshot.fitBand || 'MODERATE',
          },
          source: 'analyze_job_fit',
        };
      }
    }

    // 2. Answers payload overrides
    if (!resolvedFit) {
      if (
        answers?.jobFitAnalysis &&
        typeof answers.jobFitAnalysis.overallFit?.atsScore === 'number'
      ) {
        resolvedFit = answers.jobFitAnalysis;
      } else if (answers?.atsFitSnapshot && typeof answers.atsFitSnapshot === 'object') {
        const atsScore = answers.atsFitSnapshot.overallScore ?? answers.atsFitSnapshot.atsScore;
        if (typeof atsScore === 'number') {
          resolvedFit = {
            overallFit: {
              atsScore,
              fitBand: answers.atsFitSnapshot.fitBand || 'MODERATE',
            },
            source: 'analyze_job_fit',
          };
        }
      }
    }

    // 3. Check existing application for atsFitSnapshot
    if (!resolvedFit) {
      try {
        const [existingApp] = await this.db
          .select({
            atsFitSnapshot: jobApplications.atsFitSnapshot,
          })
          .from(jobApplications)
          .where(
            and(
              eq(jobApplications.tenantId, context.tenantId),
              eq(jobApplications.candidateId, candidateId),
              sql`${jobApplications.status} NOT IN ('REJECTED', 'WITHDRAWN', 'ARCHIVED')`
            )
          )
          .limit(1);

        if (existingApp?.atsFitSnapshot && typeof existingApp.atsFitSnapshot === 'object') {
          const atsScore =
            existingApp.atsFitSnapshot.overallScore ?? existingApp.atsFitSnapshot.atsScore;
          if (typeof atsScore === 'number') {
            resolvedFit = {
              overallFit: {
                atsScore,
                fitBand: existingApp.atsFitSnapshot.fitBand || 'MODERATE',
              },
              source: 'analyze_job_fit',
            };
          }
        }
      } catch {
        // Best-effort check
      }
    }

    // If resolvedFit already has projectRankings or topRelevantProjects, return it directly
    if (
      resolvedFit &&
      ((Array.isArray(resolvedFit.projectRankings) && resolvedFit.projectRankings.length > 0) ||
        (Array.isArray(resolvedFit.topRelevantProjects) &&
          resolvedFit.topRelevantProjects.length > 0))
    ) {
      return resolvedFit;
    }

    // 4. In-flight computation via AtsFitScoreService and ProjectRelevanceService
    try {
      const profileView = await this.candidateProfileService.getProfile(context, candidateId);
      if (profileView) {
        const normalizedSkills = (profileView.skills || []).map((s) => ({
          ...s,
          primaryEvidence: s.primaryEvidence || null,
          evidenceItems: Array.isArray(s.evidenceItems) ? s.evidenceItems : [],
        }));
        const normalizedProjects = (profileView.projects || []).map((p) => ({
          ...p,
          evidence: Array.isArray(p.evidence) ? p.evidence : [],
        }));
        const candidateProfileObj = {
          ...profileView.candidate,
          skills: normalizedSkills,
          projects: normalizedProjects,
          experience: profileView.experience || [],
          education: profileView.education || [],
        };

        const descriptionText = (
          targetJobPosting.description ||
          targetJobPosting.rawJobDescription ||
          targetJobPosting.rawText ||
          ''
        ).trim();

        let extractedRequirements = [];
        let jobDescription = null;

        const canonical = normalizeJobInput(targetJobPosting);
        const isJobIdUuid =
          targetJobPosting.id &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            targetJobPosting.id
          );
        const jobId = isJobIdUuid ? targetJobPosting.id : crypto.randomUUID();

        extractedRequirements = canonical.normalizedRequirements.map((r) => {
          const isTech = r.class === 'TECHNOLOGY' || r.category === 'SKILL';
          const normSkill =
            isTech && r.normalizedConcept
              ? SkillTaxonomyEngine.normalizeSkill(r.normalizedConcept)
              : null;
          const safeSlug =
            normSkill && !normSkill.isNoise
              ? normSkill.canonicalSlug
              : isTech && r.normalizedConcept && r.normalizedConcept.split(/\s+/).length <= 4
                ? SkillTaxonomyEngine.generateSafeSlug(r.normalizedConcept)
                : null;
          return {
            id: r.id,
            requirementId: r.id,
            tenantId: context.tenantId,
            jobDescriptionId: jobId,
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
            skillSlug: safeSlug,
            rawSnippet: boundRequirementText(r.text),
            extractedValue: r.normalizedConcept || r.text,
            originalText: boundRequirementText(r.text),
            normalizedCriteria: {
              skillSlug: safeSlug,
              skillName: r.text,
            },
            confidenceScore: r.confidence ?? 0.9,
            sourceSpan: { section: 'REQUIREMENTS', snippet: boundRequirementText(r.text) },
            createdAt: new Date().toISOString(),
          };
        });

        jobDescription = {
          id: jobId,
          tenantId: context.tenantId,
          title: targetJobPosting.title || canonical.role?.rawTitle || 'Target Role',
          companyName: targetJobPosting.company || targetJobPosting.companyName || 'Target Company',
          level: targetJobPosting.level || 'MID',
          requirements: extractedRequirements,
          skills:
            targetJobPosting.skills ||
            canonical.normalizedRequirements
              .filter((r) => r.class === 'TECHNOLOGY')
              .map((r) => r.text),
          description: descriptionText || targetJobPosting.rawText || '',
          provider: targetJobPosting.provider || targetJobPosting.source || 'EXTERNAL',
          sourceUrl: targetJobPosting.sourceUrl || null,
          applicationUrl: targetJobPosting.applicationUrl || null,
          jobFingerprint: canonical.jobFingerprint,
          role: canonical.role,
          normalizedRequirements: canonical.normalizedRequirements,
        };

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
        const fitScoreAnalysis = AtsFitScoreService.calculateCandidateJobFit(
          context,
          jobDescription,
          matchAnalysis,
          projectAnalysis,
          candidateProfileObj
        );

        const projectRankings = projectAnalysis.projectRankings || [];
        const topRelevantProjects = projectRankings.map((p, idx) => ({
          projectId: p.projectId,
          projectName: p.projectName,
          relevanceScore: p.relevanceScore,
          relevanceRank: idx + 1,
          matchedRequirements: p.matchedRequirementIds || [],
          matchedArchitecturalDimensions: p.architecturalSignals || [],
          scoreBreakdown: p.scoreBreakdown || null,
          supportingEvidence: p.supportingEvidence || [],
        }));

        const atsScore =
          fitScoreAnalysis && typeof fitScoreAnalysis.overallScore === 'number'
            ? fitScoreAnalysis.overallScore
            : (resolvedFit?.overallFit?.atsScore ?? 85);
        const fitBand =
          fitScoreAnalysis && fitScoreAnalysis.fitBand
            ? fitScoreAnalysis.fitBand
            : (resolvedFit?.overallFit?.fitBand ?? 'MODERATE');

        return {
          overallFit: {
            atsScore,
            fitBand,
          },
          projectRankings,
          topRelevantProjects,
          matchAnalysis,
          source: 'analyze_job_fit',
        };
      }
    } catch (err) {
      this.logger.debug({ error: err.message }, 'In-flight ATS fit score calculation skipped');
    }

    return resolvedFit;
  }

  /**
   * Retrieves the exact immutable package snapshot for round-tripping.
   *
   * @param {object} context
   * @param {string} applicationId
   * @param {number} [packageVersion]
   * @returns {Promise<object>}
   */
  async getApplicationPackage(context, applicationId, packageVersion = null) {
    return await this.applicationTrackingService.getApplicationPackage(
      context,
      applicationId,
      packageVersion
    );
  }

  /**
   * Orchestrates candidate profile, verified evidence, tailored resume, cover letter, and portfolio recommendations.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @param {string} [params.applicationId]
   * @param {object} params.jobPosting Normalized job posting
   * @param {object} [params.answers={}] User-provided questions/answers
   * @returns {Promise<object>} Complete Application Package
   */
  async prepareJobApplication({
    tenantId,
    candidateId,
    applicationId,
    jobPosting,
    answers = {},
    userId = null,
    role = null,
  }) {
    if (!tenantId || !candidateId || !jobPosting) {
      throw new ValidationError(
        'tenantId, candidateId, and jobPosting are required.',
        'INVALID_PARAMETERS'
      );
    }

    if (applicationId) {
      const [appRow] = await this.db
        .select({ id: jobApplications.id, candidateId: jobApplications.candidateId })
        .from(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .limit(1);

      if (!appRow) {
        throw new NotFoundError(`Job application not found: ${applicationId}`);
      }
      if (appRow.candidateId !== candidateId) {
        throw new AuthorizationError(
          `Application ${applicationId} does not belong to candidate ${candidateId}`,
          'FORBIDDEN'
        );
      }
    }

    // 1. Fetch Candidate Profile and Linked User
    const [candRow] = await this.db
      .select({
        candidate: candidates,
        userEmail: users.email,
      })
      .from(candidates)
      .leftJoin(users, eq(candidates.userId, users.id))
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
      .limit(1);

    if (!candRow || (!candRow.candidate && !candRow.id)) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`, 'CANDIDATE_NOT_FOUND');
    }

    const cand = candRow.candidate || candRow;

    if (userId && cand.userId && cand.userId !== userId && role !== 'OWNER') {
      throw new AuthorizationError(
        'Forbidden: You do not have permission to prepare applications for this candidate',
        'FORBIDDEN'
      );
    }

    const userEmail = candRow.userEmail || null;
    const candidateEmail = resolveCandidateEmail(cand, userEmail);

    // Canonical Identity & URL resolution for target job
    const directUrl =
      jobPosting?.directPortalUrl || jobPosting?.applicationUrl || jobPosting?.sourceUrl || null;
    const normalizedJobUrl = directUrl ? normalizeJobUrl(directUrl) : null;
    const resolvedCanonicalJobId =
      jobPosting?.canonicalJobId ||
      deriveCanonicalJobId({
        canonicalJobId: jobPosting?.canonicalJobId,
        jobId: jobPosting?.id,
        source: jobPosting?.source,
        provider: jobPosting?.provider,
        externalJobId: jobPosting?.externalJobId,
        directPortalUrl: directUrl,
        applicationUrl: directUrl,
        sourceUrl: jobPosting?.sourceUrl,
        company: jobPosting?.company || jobPosting?.companyName,
        title: jobPosting?.title,
        jobPosting,
      });

    // Check if an active application with a CURRENT package already exists for this candidate & job target
    let existingAppRow = null;
    if (applicationId) {
      const [appRow] = await this.db
        .select()
        .from(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .limit(1);
      existingAppRow = appRow;
    } else if (resolvedCanonicalJobId || normalizedJobUrl) {
      const activeRows = await this.db
        .select()
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.tenantId, tenantId),
            eq(jobApplications.candidateId, candidateId),
            sql`${jobApplications.status} NOT IN ('REJECTED', 'WITHDRAWN', 'ARCHIVED')`
          )
        )
        .orderBy(desc(jobApplications.updatedAt));

      existingAppRow = activeRows.find(
        (row) =>
          (resolvedCanonicalJobId &&
            (row.canonicalJobId === resolvedCanonicalJobId ||
              row.metadata?.canonicalJobId === resolvedCanonicalJobId)) ||
          (normalizedJobUrl &&
            (row.normalizedJobUrl === normalizedJobUrl ||
              normalizeJobUrl(row.jobUrl) === normalizedJobUrl))
      );
    }

    if (existingAppRow && !answers?.forceRegenerate) {
      const [currentPkgRow] = await this.db
        .select()
        .from(applicationPackages)
        .where(
          and(
            eq(applicationPackages.tenantId, tenantId),
            eq(applicationPackages.applicationId, existingAppRow.id),
            eq(applicationPackages.lifecycleState, 'CURRENT')
          )
        )
        .limit(1);

      if (currentPkgRow && currentPkgRow.packagePayload) {
        const payload = currentPkgRow.packagePayload;
        const existingKit =
          existingAppRow.metadata?.handoffKit || existingAppRow.metadata?.handoffPackage || null;
        const mergedAnswers = {
          ...(payload.answers || {}),
          ...(answers || {}),
        };
        return {
          ...payload,
          answers: mergedAnswers,
          applicationId: existingAppRow.id,
          canonicalJobId:
            resolvedCanonicalJobId || existingAppRow.canonicalJobId || payload.canonicalJobId,
          jobId: payload.targetJob?.id || resolvedCanonicalJobId || existingAppRow.canonicalJobId,
          packageVersion: currentPkgRow.version,
          packageHash: currentPkgRow.packageHash || payload.packageHash,
          packageStatus: existingAppRow.status || 'SAVED',
          artifactStatus:
            existingKit?.status === 'HANDOFF_READY' || payload.artifactsReady ? 'READY' : 'BLOCKED',
          lifecycleAction: 'REUSED',
          documentsStatus:
            payload.documentsStatus ||
            (existingKit?.status === 'HANDOFF_READY' ? 'DOCUMENTS_READY' : 'DOCUMENTS_BLOCKED'),
          artifactsReady:
            payload.artifactsReady !== undefined
              ? payload.artifactsReady
              : Boolean(existingKit?.status === 'HANDOFF_READY'),
        };
      }
    }

    // 2. Fetch candidate skills & verified evidence
    const candidateSkillsList = await this.db
      .select({
        skillName: skills.name,
        provenanceStatus: candidateSkills.provenanceStatus,
        evidenceId: candidateSkills.primaryEvidenceId,
      })
      .from(candidateSkills)
      .innerJoin(skills, eq(candidateSkills.skillId, skills.id))
      .where(
        and(eq(candidateSkills.tenantId, tenantId), eq(candidateSkills.candidateId, candidateId))
      );

    const verifiedSkills = candidateSkillsList
      .filter((s) => s.provenanceStatus === 'VERIFIED' || s.provenanceStatus === 'CORROBORATED')
      .map((s) => ({
        name: s.skillName,
        truthCategory: s.provenanceStatus === 'CORROBORATED' ? 'CORROBORATED' : 'VERIFIED',
        evidenceId: s.evidenceId || undefined,
        notes:
          s.provenanceStatus === 'CORROBORATED'
            ? 'Corroborated by authenticated repository code inspection and resume claim'
            : 'Supported by authenticated repository code inspection',
      }));

    const claimedSkills = candidateSkillsList
      .filter((s) => s.provenanceStatus !== 'VERIFIED' && s.provenanceStatus !== 'CORROBORATED')
      .map((s) => ({
        name: s.skillName,
        truthCategory: normalizeTruthCategory(s.provenanceStatus),
        notes: 'Self-reported in candidate resume / profile',
      }));

    // 2b. Fetch candidate profile view for canonical ranking and document generation
    let candidateProfileInput = null;
    let profileView = null;
    try {
      profileView = await this.candidateProfileService.getProfile(
        { tenantId, userId: cand.userId, role: 'MEMBER' },
        candidateId
      );
      if (profileView) {
        candidateProfileInput = {
          ...profileView.candidate,
          phone:
            profileView.candidate?.profileMetadata?.userCustom?.phone ||
            profileView.candidate?.profileMetadata?.phone ||
            profileView.candidate?.phone ||
            cand.profileMetadata?.userCustom?.phone ||
            cand.profileMetadata?.phone ||
            cand.phone ||
            cand.profileMetadata?.identity?.phone ||
            null,
          location:
            profileView.candidate?.location ||
            profileView.candidate?.profileMetadata?.identity?.location ||
            profileView.candidate?.profileMetadata?.location ||
            cand.location ||
            cand.profileMetadata?.identity?.location ||
            null,
          skills: profileView.skills || [],
          projects: profileView.projects || [],
          experience:
            profileView.candidate?.profileMetadata?.experience || profileView.experience || [],
          education:
            profileView.candidate?.profileMetadata?.education || profileView.education || [],
          certifications:
            profileView.candidate?.profileMetadata?.certifications ||
            profileView.certifications ||
            [],
          dsa: profileView.dsa || profileView.candidate?.profileMetadata?.dsa || null,
          links: profileView.links || profileView.candidate?.profileMetadata?.portfolioLinks || [],
          portfolioLinks:
            profileView.portfolioLinks ||
            profileView.candidate?.profileMetadata?.portfolioLinks ||
            [],
          resumeSections: profileView.resumeSections || [],
          profileMetadata: profileView.candidate?.profileMetadata || cand.profileMetadata || {},
        };
      }
    } catch (err) {
      // Fail closed. Synthesizing a profile here silently drops the projects, experience,
      // education and certifications that document generation reads, so the candidate would
      // receive an application package assembled from a degraded profile. Mirrors
      // ApplicationHandoffService, which already refuses to build a kit without a loadable
      // canonical profile.
      this.logger.error(
        { err, tenantId, candidateId },
        'Candidate profile load failed; refusing to generate application documents from a degraded profile'
      );
      throw err;
    }

    if (!candidateProfileInput) {
      // Unreachable while CandidateProfileService.getProfile throws NotFoundError instead of
      // resolving null, but kept as an explicit refusal rather than the degraded synthesis this
      // used to perform. That synthesis hard-coded `projects: []` and carried no experience,
      // education or certifications, so document generation would misrepresent the candidate.
      throw new NotFoundError('Canonical candidate profile could not be resolved');
    }

    // Resolve or compute Job Fit Analysis upfront (strictly analyze_job_fit passthrough)
    const jobFitAnalysis = await this._resolveOrComputeJobFit({
      context: { tenantId, userId: cand.userId, role: 'MEMBER' },
      candidateId,
      targetJobPosting: jobPosting,
      answers,
    });

    const canonicalJob = normalizeJobInput(jobPosting);
    const targetJobPosting = {
      id: resolvedCanonicalJobId || jobPosting?.id || jobPosting?.canonicalJobId || canonicalJob?.canonicalJobId || crypto.randomUUID(),
      canonicalJobId: resolvedCanonicalJobId || jobPosting?.canonicalJobId || jobPosting?.id || canonicalJob?.canonicalJobId,
      source: jobPosting?.source || 'MANUAL',
      provider: jobPosting?.provider || jobPosting?.source || 'MANUAL',
      applicationUrl:
        jobPosting?.applicationUrl || jobPosting?.sourceUrl || 'https://example.com/apply',
      retrievedAt: jobPosting?.retrievedAt || new Date().toISOString(),
      location: jobPosting?.location || 'Remote',
      workplaceType: jobPosting?.workplaceType || jobPosting?.workplace || 'REMOTE',
      employmentType: jobPosting?.employmentType || 'FULL_TIME',
      ...jobPosting,
      ...canonicalJob,
      requirements:
        Array.isArray(jobPosting?.requirements) && jobPosting.requirements.length > 0
          ? jobPosting.requirements
          : canonicalJob.requirements,
      responsibilities:
        Array.isArray(jobPosting?.responsibilities) && jobPosting.responsibilities.length > 0
          ? jobPosting.responsibilities
          : canonicalJob.responsibilities,
      skills:
        Array.isArray(jobPosting?.skills) && jobPosting.skills.length > 0
          ? jobPosting.skills
              .map((s) => (typeof s === 'string' ? s : s.name || s.slug || ''))
              .filter(Boolean)
          : canonicalJob.normalizedRequirements
              .filter((r) => r.class === 'TECHNOLOGY')
              .map((r) => r.text),
    };

    // Authoritative project rankings from ProjectRelevanceService
    let authoritativeRankings =
      jobFitAnalysis?.projectRankings || targetJobPosting?.projectRankings || [];

    if (
      (!authoritativeRankings || authoritativeRankings.length === 0) &&
      Array.isArray(candidateProfileInput?.projects) &&
      candidateProfileInput.projects.length > 0
    ) {
      try {
        const projAnalysis = ProjectRelevanceService.computeProjectsRelevance(
          { tenantId },
          {
            id:
              targetJobPosting.id &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                targetJobPosting.id
              )
                ? targetJobPosting.id
                : crypto.randomUUID(),
            tenantId,
            title: targetJobPosting.title || 'Target Role',
            requirements: targetJobPosting.requirements || [],
            skills: targetJobPosting.skills || [],
            description: targetJobPosting.description || '',
            normalizedRequirements: targetJobPosting.normalizedRequirements || [],
          },
          candidateProfileInput.projects,
          { candidateId, skills: candidateProfileInput.skills }
        );
        authoritativeRankings = projAnalysis.projectRankings || [];
      } catch (e) {
        this.logger.debug(
          { error: e.message },
          'Failed to compute project rankings via ProjectRelevanceService'
        );
      }
    }

    if (jobFitAnalysis) {
      jobFitAnalysis.projectRankings = authoritativeRankings;
      jobFitAnalysis.topRelevantProjects = authoritativeRankings;
    }

    // Preserve user-provided recommendedProjects strictly as advisory metadata; never mutate with derived selections
    targetJobPosting.recommendedProjects =
      jobPosting?.recommendedProjects || answers?.recommendedProjects || null;
    targetJobPosting.projectRankings = authoritativeRankings;
    targetJobPosting.jobFitAnalysis = jobFitAnalysis;

    // 3-5. Generate real document content from canonical candidate data.
    // Fail-closed: if real data cannot support documents, the operation fails
    // rather than silently degrading to placeholder templates.
    const documentContent = await this.candidateArtifactContentService.generateApplicationDocuments(
      {
        tenantId,
        userId: cand.userId,
        candidateId,
        jobPosting: targetJobPosting,
        candidateEmail,
        candidatePhone:
          candidateProfileInput?.phone ||
          profileView?.candidate?.profileMetadata?.userCustom?.phone ||
          profileView?.candidate?.profileMetadata?.phone ||
          cand.profileMetadata?.userCustom?.phone ||
          cand.profileMetadata?.phone ||
          cand.phone ||
          cand.profileMetadata?.identity?.phone ||
          undefined,
        options: {
          projectRankings: authoritativeRankings,
          matchAnalysis: jobFitAnalysis?.matchAnalysis,
        },
      }
    );

    const tailoredResumeResult = documentContent.resume;
    const coverLetterResult = documentContent.coverLetter;

    // Real stored projects (ranked by job relevance) with authentic technical bullets as portfolio evidence
    const selectedProjectsList =
      documentContent.resume?.selectedProjects || documentContent.selectedProjects || [];

    const portfolioLinks = (
      selectedProjectsList.length > 0
        ? selectedProjectsList
        : (documentContent.evidence.projectNamesUsed || []).map((name) => ({
            name,
            bullets: [],
          }))
    ).map((project) => {
      const projName = project.name || project.projectName;
      const stored =
        documentContent.projectUrlByName?.[projName] || project.repositoryUrl || project.url;
      const rawHighlights =
        Array.isArray(project.bullets) && project.bullets.length > 0
          ? project.bullets
          : project.summary
            ? [project.summary]
            : [];
      const cleanHighlights = rawHighlights.filter(
        (h) => !/Evidence-backed project referenced in tailored documents/i.test(h)
      );
      return {
        projectName: projName,
        repositoryUrl: stored || undefined,
        highlights: cleanHighlights,
      };
    });

    // Final content audit: real-data tokens present, generic placeholders absent
    const contentAudit = CandidateArtifactContentService.auditDocumentContent(
      tailoredResumeResult.markdownContent + '\n' + coverLetterResult.markdownContent,
      {
        requiredTokens: [cand.displayName, candidateEmail].filter(Boolean),
        forbiddenTokens: [
          /Dedicated software engineer with verified technical skills/i,
          /Software Development Experience Verified/i,
          /Independent \/ Open Source Engineering/i,
          /Academic \/ Technical Foundation/i,
          /Accredited Institution/i,
          /Evidence-backed project referenced in tailored documents/i,
        ],
      }
    );
    if (!contentAudit.passed) {
      throw new ValidationError(
        `Application document content audit failed: ${contentAudit.violations.join('; ')}`
      );
    }

    const effectiveFitScore =
      jobFitAnalysis && typeof jobFitAnalysis.overallFit?.atsScore === 'number'
        ? jobFitAnalysis.overallFit.atsScore
        : tailoredResumeResult.fitScore || 85;

    // 5b. Build and Validate Structured Resume Snapshot (P16-001F-1)
    if (documentContent.candidateData) {
      candidateProfileInput = {
        ...candidateProfileInput,
        ...documentContent.candidateData,
        phone:
          documentContent.candidateData.phone ||
          candidateProfileInput.phone ||
          cand.phone ||
          cand.profileMetadata?.identity?.phone ||
          null,
        location:
          documentContent.candidateData.location ||
          candidateProfileInput.location ||
          cand.location ||
          cand.profileMetadata?.identity?.location ||
          null,
      };
    }

    // Generate AI-conditioned Professional Summary and Project Bullets (Content Generation Quality)
    const candidateProjects = candidateProfileInput.projects || cand.projects || [];
    const topProjectIdentifiers = (
      authoritativeRankings.length > 0 ? authoritativeRankings : selectedProjectsList
    ).slice(0, 2);
    const topSelectedProjects = topProjectIdentifiers.map((item) => {
      const pId = item.id || item.projectId;
      const pName = item.name || item.projectName || item.title;
      const matched = candidateProjects.find(
        (cp) =>
          (pId && (cp.id === pId || cp.projectId === pId)) ||
          (pName && (cp.name === pName || cp.title === pName))
      );
      return matched || item;
    });

    let aiContent = null;
    try {
      aiContent = await defaultAiResumeContentGenerator.generateResumeAiContent({
        candidateProfile: candidateProfileInput,
        targetJobPosting,
        selectedProjects: topSelectedProjects,
        selectedSkills: verifiedSkills.concat(claimedSkills),
        factInventory: candidateProfileInput.facts || cand.profileMetadata?.factInventory || [],
        aiProvider: this.aiProvider,
      });
    } catch (aiErr) {
      this.logger.warn(
        { error: aiErr.message },
        'AI resume content generation failed; falling back to deterministic baseline'
      );
      aiContent = null;
    }

    const structuredSnapshot = buildStructuredResumeSnapshot({
      candidateProfile: candidateProfileInput,
      jobPosting: targetJobPosting,
      options: {
        projectRankings: authoritativeRankings,
        matchAnalysis: jobFitAnalysis?.matchAnalysis,
        aiContent,
      },
    });

    // Integrity Validation Gate (Fail-Closed)
    StructuredResumeDocumentSchema.parse(structuredSnapshot.structuredResume);
    ResumeTailoringPlanSchema.parse(structuredSnapshot.tailoringPlan);
    EvidenceValidationReceiptSchema.parse(structuredSnapshot.evidenceValidationReceipt);

    if (structuredSnapshot.evidenceValidationReceipt.overallStatus !== 'PASS') {
      const violations = (structuredSnapshot.evidenceValidationReceipt.violations || [])
        .map((v) => `${v.section || 'DOCUMENT'}: ${v.message || v.violationType}`)
        .join('; ');
      throw new ValidationError(
        `Structured resume document failed evidence integrity validation: ${violations || 'receipt status is not PASS'}`,
        'STRUCTURED_RESUME_INTEGRITY_FAILED'
      );
    }

    const safeStructuredResume = JSON.parse(JSON.stringify(structuredSnapshot.structuredResume));
    const safeTailoringPlan = JSON.parse(JSON.stringify(structuredSnapshot.tailoringPlan));
    const safeEvidenceReceipt = JSON.parse(
      JSON.stringify(structuredSnapshot.evidenceValidationReceipt)
    );

    // 6. Build Unhashed Package
    const preparedPackage = {
      candidateId,
      candidateName: cand.displayName || 'Candidate',
      candidateEmail,
      candidatePhone:
        candidateProfileInput?.phone ||
        profileView?.candidate?.profileMetadata?.userCustom?.phone ||
        profileView?.candidate?.profileMetadata?.phone ||
        cand.profileMetadata?.userCustom?.phone ||
        cand.profileMetadata?.phone ||
        cand.phone ||
        cand.profileMetadata?.identity?.phone ||
        undefined,
      targetJob: targetJobPosting,
      tailoredResume: {
        documentId: tailoredResumeResult.documentId || undefined,
        title: tailoredResumeResult.title || `Resume - ${jobPosting.company}`,
        markdownContent:
          tailoredResumeResult.markdownContent || tailoredResumeResult.renderedMarkdown || '',
        contentHash: tailoredResumeResult.contentHash || crypto.randomBytes(16).toString('hex'),
        fitScore: effectiveFitScore,
        selectedProjects: selectedProjectsList,
        selectedSections:
          tailoredResumeResult.selectedSections || tailoredResumeResult.sections || undefined,
        sectionSnapshots: tailoredResumeResult.sectionSnapshots || undefined,
        structuredResume: safeStructuredResume,
        tailoringPlan: safeTailoringPlan,
        evidenceValidationReceipt: safeEvidenceReceipt,
        generationContractVersion: RESUME_GENERATION_CONTRACT_VERSION,
        structuredResumeSchemaVersion:
          safeStructuredResume?.schemaVersion || DEFAULT_STRUCTURED_RESUME_SCHEMA_VERSION,
      },
      coverLetter: {
        documentId: coverLetterResult.documentId || undefined,
        title: coverLetterResult.title || `Cover Letter - ${jobPosting.company}`,
        markdownContent:
          coverLetterResult.markdownContent || coverLetterResult.renderedMarkdown || '',
        contentHash: coverLetterResult.contentHash || crypto.randomBytes(16).toString('hex'),
      },
      verifiedSkills,
      claimedSkills,
      portfolioLinks,
      candidate: {
        id: candidateId,
        firstName:
          cand.firstName ||
          (cand.displayName ? cand.displayName.split(' ')[0] : 'Candidate'),
        lastName:
          cand.lastName ||
          (cand.displayName ? cand.displayName.split(' ').slice(1).join(' ') : ''),
        fullName: cand.displayName || 'Candidate',
        displayName: cand.displayName || 'Candidate',
        email: candidateEmail,
        canonicalEmail: candidateEmail,
        phone:
          candidateProfileInput?.phone ||
          profileView?.candidate?.profileMetadata?.userCustom?.phone ||
          profileView?.candidate?.profileMetadata?.phone ||
          cand.profileMetadata?.userCustom?.phone ||
          cand.profileMetadata?.phone ||
          cand.phone ||
          cand.profileMetadata?.identity?.phone ||
          undefined,
        location:
          candidateProfileInput?.location ||
          cand.location ||
          cand.profileMetadata?.identity?.location ||
          undefined,
        contact: {
          email: candidateEmail,
          phone:
            candidateProfileInput?.phone ||
            cand.phone ||
            undefined,
          address:
            candidateProfileInput?.location ||
            cand.location ||
            undefined,
        },
        socialLinks: {
          linkedin:
            candidateProfileInput?.linkedinUrl ||
            cand.linkedinUrl ||
            undefined,
          github:
            candidateProfileInput?.githubUrl ||
            cand.githubUrl ||
            undefined,
          portfolio:
            candidateProfileInput?.portfolioUrl ||
            cand.portfolioUrl ||
            undefined,
        },
      },
      artifacts: {
        resume: {
          filename: `Resume - ${jobPosting.company || 'Job'}.pdf`,
          text:
            tailoredResumeResult.markdownContent || tailoredResumeResult.renderedMarkdown || '',
          ready: false,
        },
        coverLetter: {
          filename: `Cover Letter - ${jobPosting.company || 'Job'}.pdf`,
          text:
            coverLetterResult.markdownContent || coverLetterResult.renderedMarkdown || '',
          ready: false,
        },
      },
      selectedSections:
        tailoredResumeResult.selectedSections || tailoredResumeResult.sections || undefined,
      sectionSnapshots: tailoredResumeResult.sectionSnapshots || undefined,
      answers: answers || {},
      jobFitAnalysis: jobFitAnalysis || undefined,
      structuredResume: safeStructuredResume,
      tailoringPlan: safeTailoringPlan,
      evidenceValidationReceipt: safeEvidenceReceipt,
      generationContractVersion: RESUME_GENERATION_CONTRACT_VERSION,
      structuredResumeSchemaVersion:
        safeStructuredResume?.schemaVersion || DEFAULT_STRUCTURED_RESUME_SCHEMA_VERSION,
      packageHash: '',
      preparedAt: new Date().toISOString(),
    };

    // 7. Compute Deterministic Package Hash
    preparedPackage.packageHash = computeApplicationPackageHash(preparedPackage);

    const validatedPackage = ApplicationPackageSchema.parse(preparedPackage);

    // 8. Persist as the authoritative CURRENT package version (P14-005BA).
    // Best-effort: persistence failures never fail preparation, but a
    // successful persist guarantees the invariant
    // prepare().packageHash === get_job_application().currentPackage.packageHash.
    const persisted = await persistPreparedPackage({
      service: this,
      tenantId,
      userId: cand.userId,
      candidateId,
      applicationId,
      canonicalJobId: targetJobPosting.canonicalJobId,
      jobId: targetJobPosting.id,
      preparedPackage: validatedPackage,
      logger: this.logger,
    });

    // 9. End-to-End PDF Compilation, Pre-Exposure QA, Encrypted Storage, and Metadata Attachment.
    // Invariant: Documents are NEVER reported as READY until:
    // Markdown generation -> LaTeX compilation -> PDF QA -> Encrypted artifact storage -> Metadata persistence
    // all succeed.
    let handoffKit = null;
    let artifactsReady = false;
    let documentsStatus = 'DOCUMENTS_BLOCKED';
    let artifactFailureReason = null;
    let resumeArtifact = undefined;
    let coverLetterArtifact = undefined;

    if (persisted?.applicationId) {
      try {
        handoffKit = await this.applicationHandoffService.buildApplicationHandoffKit({
          tenantId,
          userId: cand.userId,
          candidateId,
          applicationPackage: validatedPackage,
          applicationId: persisted.applicationId,
        });

        const resumeQaPassed = Boolean(handoffKit?.resume?.qaAudit?.passed);
        const clQaPassed = Boolean(handoffKit?.coverLetter?.qaAudit?.passed);
        const hasStorageKeys = Boolean(
          handoffKit?.resume?.storageKey && handoffKit?.coverLetter?.storageKey
        );

        if (handoffKit && resumeQaPassed && clQaPassed && hasStorageKeys) {
          artifactsReady = true;
          documentsStatus = 'DOCUMENTS_READY';
        } else {
          artifactsReady = false;
          documentsStatus = 'DOCUMENTS_BLOCKED';
          artifactFailureReason = [
            !resumeQaPassed
              ? `Resume QA failed: ${handoffKit?.resume?.qaAudit?.findings?.join(', ') || 'QA not passed'}`
              : null,
            !clQaPassed
              ? `Cover letter QA failed: ${handoffKit?.coverLetter?.qaAudit?.findings?.join(', ') || 'QA not passed'}`
              : null,
            !hasStorageKeys ? 'Encrypted artifact storage keys missing' : null,
          ]
            .filter(Boolean)
            .join('; ');
        }

        if (handoffKit?.resume) {
          resumeArtifact = {
            filename: handoffKit.resume.filename || 'tailored-resume.pdf',
            mimeType: handoffKit.resume.mimeType || 'application/pdf',
            fileSizeBytes: handoffKit.resume.fileSizeBytes,
            contentHash: validatedPackage.tailoredResume.contentHash,
            pdfContentHash: handoffKit.resume.contentHash,
            availabilityStatus: resumeQaPassed && hasStorageKeys ? 'READY' : 'BLOCKED',
            viewUrl: handoffKit.resume.viewUrl,
            downloadUrl: handoffKit.resume.downloadUrl,
            qaScore: handoffKit.resume.qaAudit?.score,
            qaPassed: resumeQaPassed,
            resumeQuality: handoffKit.resume.resumeQuality || undefined,
            layoutDiagnostics: handoffKit.resume.layoutDiagnostics || undefined,
            generationContractVersion:
              handoffKit.generationContractVersion ||
              handoffKit.resume.generationContractVersion ||
              undefined,
            structuredResumeSchemaVersion:
              handoffKit.structuredResumeSchemaVersion ||
              handoffKit.resume.structuredResumeSchemaVersion ||
              undefined,
          };
        }

        if (handoffKit?.coverLetter) {
          coverLetterArtifact = {
            filename: handoffKit.coverLetter.filename || 'tailored-cover-letter.pdf',
            mimeType: handoffKit.coverLetter.mimeType || 'application/pdf',
            fileSizeBytes: handoffKit.coverLetter.fileSizeBytes,
            contentHash: validatedPackage.coverLetter.contentHash,
            pdfContentHash: handoffKit.coverLetter.contentHash,
            availabilityStatus: clQaPassed && hasStorageKeys ? 'READY' : 'BLOCKED',
            viewUrl: handoffKit.coverLetter.viewUrl,
            downloadUrl: handoffKit.coverLetter.downloadUrl,
            qaScore: handoffKit.coverLetter.qaAudit?.score,
            qaPassed: clQaPassed,
            generationContractVersion:
              handoffKit.generationContractVersion ||
              handoffKit.coverLetter.generationContractVersion ||
              undefined,
            structuredResumeSchemaVersion:
              handoffKit.structuredResumeSchemaVersion ||
              handoffKit.coverLetter.structuredResumeSchemaVersion ||
              undefined,
          };
        }
      } catch (err) {
        this.logger.error(
          { error: err.message, candidateId, packageHash: validatedPackage.packageHash },
          'Failed to compile, QA, or store PDF artifacts for prepared application'
        );
        artifactsReady = false;
        documentsStatus = 'DOCUMENTS_BLOCKED';
        artifactFailureReason = `PDF artifact generation error: ${err.message}`;
      }
    } else {
      artifactsReady = false;
      documentsStatus = 'DOCUMENTS_BLOCKED';
      artifactFailureReason = 'Application package could not be persisted in database ledger';
    }

    const finalArtifacts = {
      resume: resumeArtifact
        ? {
            ...resumeArtifact,
            url: resumeArtifact.downloadUrl || resumeArtifact.viewUrl,
            text: validatedPackage.tailoredResume.markdownContent,
            ready: artifactsReady,
          }
        : {
            filename: validatedPackage.tailoredResume.title || 'tailored-resume.pdf',
            text: validatedPackage.tailoredResume.markdownContent,
            ready: false,
          },
      coverLetter: coverLetterArtifact
        ? {
            ...coverLetterArtifact,
            url: coverLetterArtifact.downloadUrl || coverLetterArtifact.viewUrl,
            text: validatedPackage.coverLetter.markdownContent,
            ready: artifactsReady,
          }
        : {
            filename: validatedPackage.coverLetter.title || 'tailored-cover-letter.pdf',
            text: validatedPackage.coverLetter.markdownContent,
            ready: false,
          },
    };

    return {
      ...validatedPackage,
      applicationId: persisted?.applicationId ?? applicationId ?? undefined,
      jobId: validatedPackage.targetJob?.id || persisted?.canonicalJobId || undefined,
      packageVersion: persisted?.version ?? undefined,
      packageHash: validatedPackage.packageHash,
      packageStatus: persisted?.packageStatus ?? 'SAVED',
      artifactStatus: artifactsReady ? 'READY' : 'BLOCKED',
      lifecycleAction: persisted?.lifecycleAction ?? 'CREATED',
      generationContractVersion: validatedPackage.generationContractVersion,
      structuredResumeSchemaVersion: validatedPackage.structuredResumeSchemaVersion,
      resumeQuality: handoffKit?.resume?.resumeQuality || undefined,
      layoutDiagnostics: handoffKit?.resume?.layoutDiagnostics || undefined,
      tailoredResume: {
        ...validatedPackage.tailoredResume,
        ...(resumeArtifact ? { artifact: resumeArtifact } : {}),
      },
      coverLetter: {
        ...validatedPackage.coverLetter,
        ...(coverLetterArtifact ? { artifact: coverLetterArtifact } : {}),
      },
      artifacts: finalArtifacts,
      documentsStatus,
      artifactsReady,
      ...(artifactFailureReason ? { artifactFailureReason } : {}),
    };
  }

  /**
   * Regenerates tailored documents and creates a new application package version (Issue 3 / P14-005BA).
   *
   * Capabilities:
   * - Supports scope: 'BOTH' (default), 'RESUME', or 'COVER_LETTER'.
   * - Optional user reason tag stored in package answers for audit and history tracking.
   * - Monotonically increments version (v_n -> v_{n+1}), archiving the previous version.
   * - Runs full end-to-end PDF compilation, QA audit, and encrypted storage.
   * - Fail-closed: If compilation or QA fails, existing CURRENT package remains untouched.
   * - Never duplicates applications or runs on already submitted applications.
   *
   * @param {object} params
   * @param {string} params.tenantId Tenant UUID
   * @param {string} [params.userId] User UUID
   * @param {string} params.candidateId Candidate UUID
   * @param {string} params.applicationId Application UUID
   * @param {'BOTH'|'RESUME'|'COVER_LETTER'} [params.scope='BOTH'] Scope of regeneration
   * @param {string} [params.reason=''] Reason description (e.g. 'Updated portfolio links')
   * @returns {Promise<object>} Regenerated package result and handoff kit
   */
  async regenerateApplicationPackage({
    tenantId,
    userId,
    candidateId,
    applicationId,
    scope = 'BOTH',
    reason = '',
    role = 'MEMBER',
  }) {
    if (!tenantId || !candidateId || !applicationId) {
      throw new ValidationError(
        'tenantId, candidateId, and applicationId are required for package regeneration.',
        'INVALID_PARAMETERS'
      );
    }

    const context = {
      tenantId,
      userId: userId || null,
      candidateId,
      role: role || 'MEMBER',
    };

    // 1. Fetch Application & verify state
    const appDetails = await this.applicationTrackingService.getApplicationDetails(
      context,
      applicationId
    );
    const application = appDetails.application;

    if (application.candidateId !== candidateId) {
      throw new AuthorizationError(
        `Application ${applicationId} does not belong to candidate ${candidateId}`,
        'FORBIDDEN'
      );
    }

    if (
      application.status !== 'SAVED' ||
      application.appliedAt ||
      application.metadata?.externalSubmissionState === 'SUBMITTED'
    ) {
      throw new ConflictError(
        `Cannot regenerate package: application ${applicationId} has submission history or status ${application.status}. Packages cannot be regenerated once an application is submitted.`,
        'APPLICATION_ALREADY_SUBMITTED'
      );
    }

    // 2. Fetch Candidate Profile and Linked User
    const [candRow] = await this.db
      .select({
        candidate: candidates,
        userEmail: users.email,
      })
      .from(candidates)
      .leftJoin(users, eq(candidates.userId, users.id))
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
      .limit(1);

    if (!candRow || (!candRow.candidate && !candRow.id)) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`, 'CANDIDATE_NOT_FOUND');
    }

    const cand = candRow.candidate || candRow;

    if (userId && cand.userId && cand.userId !== userId && role !== 'OWNER') {
      throw new AuthorizationError(
        'Forbidden: You do not have permission to regenerate packages for this candidate',
        'FORBIDDEN'
      );
    }

    const userEmail = candRow.userEmail || null;
    const candidateEmail = resolveCandidateEmail(cand, userEmail);

    // 3. Fetch candidate skills & verified evidence
    const candidateSkillsList = await this.db
      .select({
        skillName: skills.name,
        provenanceStatus: candidateSkills.provenanceStatus,
        evidenceId: candidateSkills.primaryEvidenceId,
      })
      .from(candidateSkills)
      .innerJoin(skills, eq(candidateSkills.skillId, skills.id))
      .where(
        and(eq(candidateSkills.tenantId, tenantId), eq(candidateSkills.candidateId, candidateId))
      );

    const verifiedSkills = candidateSkillsList
      .filter((s) => s.provenanceStatus === 'VERIFIED' || s.provenanceStatus === 'CORROBORATED')
      .map((s) => ({
        name: s.skillName,
        truthCategory: s.provenanceStatus === 'CORROBORATED' ? 'CORROBORATED' : 'VERIFIED',
        evidenceId: s.evidenceId || undefined,
        notes:
          s.provenanceStatus === 'CORROBORATED'
            ? 'Corroborated by authenticated repository code inspection and resume claim'
            : 'Supported by authenticated repository code inspection',
      }));

    const claimedSkills = candidateSkillsList
      .filter((s) => s.provenanceStatus !== 'VERIFIED' && s.provenanceStatus !== 'CORROBORATED')
      .map((s) => ({
        name: s.skillName,
        truthCategory: normalizeTruthCategory(s.provenanceStatus),
        notes: 'Self-reported in candidate resume / profile',
      }));

    // 4. Construct normalized job posting
    // P16-001F-5: accept provider sources detected by the extension's
    // job-board adapters; unknown sources fall back to MANUAL.
    const validSources = [
      'GREENHOUSE',
      'LEVER',
      'REMOTE_OK',
      'STRUCTURED_FEED',
      'MANUAL',
      'NAUKRI',
      'IIMJOBS',
      'SHINE',
      'FOUNDIT',
      'TIMESJOBS',
      'HIRECT',
      'CUTSHORT',
      'INSTAHYRE',
    ];
    const jobSource = validSources.includes(application.source) ? application.source : 'MANUAL';

    const jobPosting = {
      id: application.id,
      source: jobSource,
      company: application.companyName,
      title: application.jobTitle,
      location: application.location || 'Remote',
      description:
        application.rawJobDescription ||
        application.metadata?.jobDescription ||
        application.jobTitle,
      responsibilities: application.parsedJobDescription?.responsibilities || [],
      requirements: application.parsedJobDescription?.requirements || [],
      skills: application.parsedJobDescription?.skills || [],
      applicationUrl:
        application.jobUrl ||
        application.metadata?.destinationUrl ||
        'https://boards.greenhouse.io',
      retrievedAt: new Date().toISOString(),
    };

    // 4b. Authoritative project rankings from ProjectRelevanceService for current job
    try {
      const profileView = await this.candidateProfileService.getProfile(context, candidateId);
      if (profileView && Array.isArray(profileView.projects) && profileView.projects.length > 0) {
        const projAnalysis = ProjectRelevanceService.computeProjectsRelevance(
          context,
          {
            id:
              jobPosting.id &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobPosting.id)
                ? jobPosting.id
                : crypto.randomUUID(),
            tenantId,
            title: jobPosting.title || 'Target Role',
            requirements: jobPosting.requirements || [],
            skills: jobPosting.skills || [],
            description: jobPosting.description || '',
          },
          profileView.projects,
          { candidateId, skills: profileView.skills }
        );
        jobPosting.projectRankings = projAnalysis.projectRankings || [];
      }
    } catch (err) {
      this.logger.debug(
        { error: err.message },
        'Failed to compute fresh project rankings during package regeneration'
      );
    }

    // 5. Generate fresh document content from canonical candidate data
    const documentContent = await this.candidateArtifactContentService.generateApplicationDocuments(
      {
        tenantId,
        userId: cand.userId,
        candidateId,
        jobPosting,
        candidateEmail,
        candidatePhone:
          cand.profileMetadata?.userCustom?.phone ||
          cand.profileMetadata?.phone ||
          cand.phone ||
          cand.profileMetadata?.identity?.phone ||
          undefined,
      }
    );

    // 6. Handle scope: allow selective reuse if scope is RESUME or COVER_LETTER
    const currentPkg = appDetails.currentPackage;
    const currentSnapshots = appDetails.tailoredDocuments || [];

    let tailoredResumeResult = documentContent.resume;
    let coverLetterResult = documentContent.coverLetter;

    if (scope === 'COVER_LETTER') {
      const existingResumeDoc = currentSnapshots.find(
        (d) =>
          d.documentType === 'TAILORED_RESUME' &&
          (!currentPkg ||
            d.metadata?.packageHash === currentPkg.packageHash ||
            d.metadata?.artifact?.packageHash === currentPkg.packageHash)
      );
      if (existingResumeDoc?.renderedMarkdown || currentPkg?.resumeContentHash) {
        tailoredResumeResult = {
          title:
            existingResumeDoc?.title ||
            currentPkg?.tailoredResume?.title ||
            documentContent.resume.title,
          markdownContent:
            existingResumeDoc?.renderedMarkdown ||
            existingResumeDoc?.content?.markdownContent ||
            documentContent.resume.markdownContent,
          contentHash:
            existingResumeDoc?.metadata?.markdownContentHash ||
            currentPkg?.resumeContentHash ||
            documentContent.resume.contentHash,
          fitScore:
            existingResumeDoc?.atsFitScore ??
            currentPkg?.fitScore ??
            documentContent.resume.fitScore,
        };
      }
    } else if (scope === 'RESUME') {
      const existingClDoc = currentSnapshots.find(
        (d) =>
          d.documentType === 'TAILORED_COVER_LETTER' &&
          (!currentPkg ||
            d.metadata?.packageHash === currentPkg.packageHash ||
            d.metadata?.artifact?.packageHash === currentPkg.packageHash)
      );
      if (existingClDoc?.renderedMarkdown || currentPkg?.coverLetterContentHash) {
        coverLetterResult = {
          title:
            existingClDoc?.title ||
            currentPkg?.coverLetter?.title ||
            documentContent.coverLetter.title,
          markdownContent:
            existingClDoc?.renderedMarkdown ||
            existingClDoc?.content?.markdownContent ||
            documentContent.coverLetter.markdownContent,
          contentHash:
            existingClDoc?.metadata?.markdownContentHash ||
            currentPkg?.coverLetterContentHash ||
            documentContent.coverLetter.contentHash,
        };
      }
    }

    // Portfolio links
    const selectedProjectsList =
      documentContent.resume?.selectedProjects || documentContent.selectedProjects || [];

    const portfolioLinks = (
      selectedProjectsList.length > 0
        ? selectedProjectsList
        : (documentContent.evidence.projectNamesUsed || []).map((name) => ({
            name,
            bullets: [],
          }))
    ).map((project) => {
      const projName = project.name || project.projectName;
      const stored =
        documentContent.projectUrlByName?.[projName] || project.repositoryUrl || project.url;
      const rawHighlights =
        Array.isArray(project.bullets) && project.bullets.length > 0
          ? project.bullets
          : project.summary
            ? [project.summary]
            : [];
      const cleanHighlights = rawHighlights.filter(
        (h) => !/Evidence-backed project referenced in tailored documents/i.test(h)
      );
      return {
        projectName: projName,
        repositoryUrl: stored || undefined,
        highlights: cleanHighlights,
      };
    });

    // Final content audit
    const contentAudit = CandidateArtifactContentService.auditDocumentContent(
      tailoredResumeResult.markdownContent + '\n' + coverLetterResult.markdownContent,
      {
        requiredTokens: [cand.displayName, candidateEmail].filter(Boolean),
        forbiddenTokens: [
          /Dedicated software engineer with verified technical skills/i,
          /Software Development Experience Verified/i,
          /Independent \/ Open Source Engineering/i,
          /Academic \/ Technical Foundation/i,
          /Accredited Institution/i,
          /Evidence-backed project referenced in tailored documents/i,
        ],
      }
    );
    if (!contentAudit.passed) {
      throw new ValidationError(
        `Application document content audit failed during regeneration: ${contentAudit.violations.join('; ')}`
      );
    }

    // 7. Build package with regeneration metadata in answers
    const previousAnswers =
      currentPkg?.answers && typeof currentPkg.answers === 'object' ? currentPkg.answers : {};
    const answers = {
      ...previousAnswers,
      ...(reason ? { regenerationReason: String(reason).trim() } : {}),
      ...(scope ? { regenerationScope: scope } : {}),
      regenerationTimestamp: new Date().toISOString(),
    };

    // 7b. Build and Validate Structured Resume Snapshot for Draft (P16-001F-1)
    let candidateProfileInput = documentContent.candidateData;
    if (!candidateProfileInput) {
      try {
        const profileView = await this.candidateProfileService.getProfile(
          { tenantId, userId: cand.userId, role: 'MEMBER' },
          candidateId
        );
        if (profileView) {
          candidateProfileInput = {
            ...profileView.candidate,
            skills: profileView.skills || [],
            projects: profileView.projects || [],
            experience:
              profileView.candidate?.profileMetadata?.experience || profileView.experience || [],
            education:
              profileView.candidate?.profileMetadata?.education || profileView.education || [],
            certifications:
              profileView.candidate?.profileMetadata?.certifications ||
              profileView.certifications ||
              [],
            dsa: profileView.dsa || profileView.candidate?.profileMetadata?.dsa || null,
            links:
              profileView.links || profileView.candidate?.profileMetadata?.portfolioLinks || [],
            portfolioLinks:
              profileView.portfolioLinks ||
              profileView.candidate?.profileMetadata?.portfolioLinks ||
              [],
            resumeSections: profileView.resumeSections || [],
            profileMetadata: profileView.candidate?.profileMetadata || cand.profileMetadata || {},
          };
        }
      } catch (err) {
        // Fail closed for the same reason as prepareJobApplication: document generation must
        // never run against a profile that failed to load, because the fabricated fallback
        // omits education, experience and certifications entirely.
        this.logger.error(
          { err, tenantId, candidateId },
          'Candidate profile load failed during package regeneration; refusing to generate documents from a degraded profile'
        );
        throw err;
      }
    }

    if (!candidateProfileInput) {
      // Same refusal as prepareJobApplication: a package regenerated from a profile that never
      // loaded would ship documents with no projects, experience, education or certifications.
      throw new NotFoundError('Canonical candidate profile could not be resolved');
    }

    const authoritativeDraftRankings =
      currentPkg?.jobFitAnalysis?.projectRankings ||
      currentPkg?.jobFitAnalysis?.topRelevantProjects ||
      [];

    const candidateProjectsForRegen = candidateProfileInput.projects || cand.projects || [];
    const topDraftIdentifiers = (
      authoritativeDraftRankings.length > 0 ? authoritativeDraftRankings : selectedProjectsList
    ).slice(0, 2);
    const topDraftSelectedProjects = topDraftIdentifiers.map((item) => {
      const pId = item.id || item.projectId;
      const pName = item.name || item.projectName || item.title;
      const matched = candidateProjectsForRegen.find(
        (cp) =>
          (pId && (cp.id === pId || cp.projectId === pId)) ||
          (pName && (cp.name === pName || cp.title === pName))
      );
      return matched || item;
    });

    let aiContent = null;
    try {
      aiContent = await defaultAiResumeContentGenerator.generateResumeAiContent({
        candidateProfile: candidateProfileInput,
        targetJobPosting: jobPosting,
        selectedProjects: topDraftSelectedProjects,
        selectedSkills: verifiedSkills.concat(claimedSkills),
        factInventory: candidateProfileInput.facts || cand.profileMetadata?.factInventory || [],
        aiProvider: this.aiProvider,
      });
    } catch (aiErr) {
      this.logger.warn(
        { error: aiErr.message },
        'AI resume content generation failed during regeneration; falling back to deterministic baseline'
      );
      aiContent = null;
    }

    const structuredSnapshot = buildStructuredResumeSnapshot({
      candidateProfile: candidateProfileInput,
      jobPosting,
      options: {
        projectRankings: authoritativeDraftRankings,
        matchAnalysis: currentPkg?.jobFitAnalysis?.matchAnalysis,
        aiContent,
      },
    });

    StructuredResumeDocumentSchema.parse(structuredSnapshot.structuredResume);
    ResumeTailoringPlanSchema.parse(structuredSnapshot.tailoringPlan);
    EvidenceValidationReceiptSchema.parse(structuredSnapshot.evidenceValidationReceipt);

    if (structuredSnapshot.evidenceValidationReceipt.overallStatus !== 'PASS') {
      const violations = (structuredSnapshot.evidenceValidationReceipt.violations || [])
        .map((v) => `${v.section || 'DOCUMENT'}: ${v.message || v.violationType}`)
        .join('; ');
      throw new ValidationError(
        `Structured resume document failed evidence integrity validation during regeneration: ${violations || 'receipt status is not PASS'}`,
        'STRUCTURED_RESUME_INTEGRITY_FAILED'
      );
    }

    const safeStructuredResume = JSON.parse(JSON.stringify(structuredSnapshot.structuredResume));
    const safeTailoringPlan = JSON.parse(JSON.stringify(structuredSnapshot.tailoringPlan));
    const safeEvidenceReceipt = JSON.parse(
      JSON.stringify(structuredSnapshot.evidenceValidationReceipt)
    );

    const preparedPackage = {
      candidateId,
      candidateName: cand.displayName || 'Candidate',
      candidateEmail,
      candidatePhone: cand.phone || undefined,
      targetJob: jobPosting,
      tailoredResume: {
        documentId: tailoredResumeResult.documentId || undefined,
        title: tailoredResumeResult.title || `Resume - ${jobPosting.company}`,
        markdownContent:
          tailoredResumeResult.markdownContent || tailoredResumeResult.renderedMarkdown || '',
        contentHash: tailoredResumeResult.contentHash || crypto.randomBytes(16).toString('hex'),
        fitScore: tailoredResumeResult.fitScore || 85,
        selectedProjects: selectedProjectsList,
        selectedSections:
          tailoredResumeResult.selectedSections || tailoredResumeResult.sections || undefined,
        sectionSnapshots: tailoredResumeResult.sectionSnapshots || undefined,
        structuredResume: safeStructuredResume,
        tailoringPlan: safeTailoringPlan,
        evidenceValidationReceipt: safeEvidenceReceipt,
        generationContractVersion: RESUME_GENERATION_CONTRACT_VERSION,
        structuredResumeSchemaVersion:
          safeStructuredResume?.schemaVersion || DEFAULT_STRUCTURED_RESUME_SCHEMA_VERSION,
      },
      coverLetter: {
        documentId: coverLetterResult.documentId || undefined,
        title: coverLetterResult.title || `Cover Letter - ${jobPosting.company}`,
        markdownContent:
          coverLetterResult.markdownContent || coverLetterResult.renderedMarkdown || '',
        contentHash: coverLetterResult.contentHash || crypto.randomBytes(16).toString('hex'),
      },
      verifiedSkills,
      claimedSkills,
      portfolioLinks,
      candidate: {
        id: candidateId,
        firstName:
          cand.firstName ||
          (cand.displayName ? cand.displayName.split(' ')[0] : 'Candidate'),
        lastName:
          cand.lastName ||
          (cand.displayName ? cand.displayName.split(' ').slice(1).join(' ') : ''),
        fullName: cand.displayName || 'Candidate',
        displayName: cand.displayName || 'Candidate',
        email: candidateEmail,
        canonicalEmail: candidateEmail,
        phone: cand.phone || undefined,
        location: cand.location || undefined,
        contact: {
          email: candidateEmail,
          phone: cand.phone || undefined,
          address: cand.location || undefined,
        },
      },
      artifacts: {
        resume: {
          filename: `Resume - ${jobPosting.company || 'Job'}.pdf`,
          text:
            tailoredResumeResult.markdownContent || tailoredResumeResult.renderedMarkdown || '',
          ready: false,
        },
        coverLetter: {
          filename: `Cover Letter - ${jobPosting.company || 'Job'}.pdf`,
          text:
            coverLetterResult.markdownContent || coverLetterResult.renderedMarkdown || '',
          ready: false,
        },
      },
      selectedSections:
        tailoredResumeResult.selectedSections || tailoredResumeResult.sections || undefined,
      sectionSnapshots: tailoredResumeResult.sectionSnapshots || undefined,
      answers,
      structuredResume: safeStructuredResume,
      tailoringPlan: safeTailoringPlan,
      evidenceValidationReceipt: safeEvidenceReceipt,
      generationContractVersion: RESUME_GENERATION_CONTRACT_VERSION,
      structuredResumeSchemaVersion:
        safeStructuredResume?.schemaVersion || DEFAULT_STRUCTURED_RESUME_SCHEMA_VERSION,
      packageHash: '',
      preparedAt: new Date().toISOString(),
    };

    preparedPackage.packageHash = computeApplicationPackageHash(preparedPackage);
    const validatedPackage = ApplicationPackageSchema.parse(preparedPackage);

    // 8. Pre-Exposure PDF Compilation and QA Audit BEFORE Ledger Mutation (Fail-Closed)
    const handoffKit = await this.applicationHandoffService.buildApplicationHandoffKit({
      tenantId,
      userId: cand.userId,
      candidateId,
      applicationPackage: validatedPackage,
      applicationId: application.id,
      destinationUrl: jobPosting.applicationUrl,
    });

    const resumeQaPassed = Boolean(handoffKit?.resume?.qaAudit?.passed);
    const clQaPassed = Boolean(handoffKit?.coverLetter?.qaAudit?.passed);
    const hasStorageKeys = Boolean(
      handoffKit?.resume?.storageKey && handoffKit?.coverLetter?.storageKey
    );

    if (!resumeQaPassed || !clQaPassed || !hasStorageKeys) {
      const failureReason = [
        !resumeQaPassed
          ? `Resume QA failed: ${handoffKit?.resume?.qaAudit?.findings?.join(', ') || 'QA not passed'}`
          : null,
        !clQaPassed
          ? `Cover letter QA failed: ${handoffKit?.coverLetter?.qaAudit?.findings?.join(', ') || 'QA not passed'}`
          : null,
        !hasStorageKeys ? 'Encrypted artifact storage keys missing' : null,
      ]
        .filter(Boolean)
        .join('; ');

      throw new ValidationError(
        `Regeneration aborted: pre-exposure QA check failed (${failureReason}). Current package preserved.`,
        'PRE_EXPOSURE_QA_FAILED'
      );
    }

    // 9. Attach snapshots and commit the new package version as CURRENT
    await this.applicationTrackingService.attachPackageDocumentSnapshots(
      context,
      application.id,
      validatedPackage
    );

    const current = await this.applicationTrackingService.recordApplicationPackage(
      context,
      application.id,
      validatedPackage,
      { source: 'REGENERATE_PACKAGE' }
    );

    await this.applicationTrackingService.setApplicationHandoffKit(
      context,
      application.id,
      handoffKit
    );

    this.logger.info(
      {
        tenantId,
        applicationId: application.id,
        newPackageVersion: current.version,
        newPackageHash: current.packageHash,
        scope,
        reason,
      },
      'Application package regenerated and promoted as CURRENT version'
    );

    return {
      package: current,
      handoffKit,
      documentsStatus: 'DOCUMENTS_READY',
      artifactsReady: true,
    };
  }

  /**
   * Validates application completeness, portal capability, and duplicate submission risk.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @param {object} params.applicationPackage
   * @param {string} [params.destinationUrl]
   * @returns {Promise<object>} Validation result
   */
  async validateJobApplication({ tenantId, candidateId, applicationPackage, destinationUrl }) {
    const validatedPkg = ApplicationPackageSchema.parse(applicationPackage);
    const targetJob = validatedPkg.targetJob || {};
    const targetUrl = destinationUrl || targetJob.applicationUrl || targetJob.directPortalUrl || '';

    const missingFields = [];
    const warnings = [];
    const errors = [];

    const emailStatus = evaluateCandidateEmailStatus(
      { canonicalEmail: validatedPkg.candidateEmail, applicationPackage: validatedPkg },
      null,
      { applicationPackage: validatedPkg }
    );
    if (emailStatus.state === 'MISSING_EMAIL' || !validatedPkg.candidateEmail) {
      missingFields.push('candidateEmail');
    } else if (emailStatus.state === 'INVALID_EMAIL') {
      errors.push(`Candidate email "${validatedPkg.candidateEmail}" has an invalid format.`);
    } else if (isSyntheticEmail(validatedPkg.candidateEmail)) {
      warnings.push(
        `Candidate email "${validatedPkg.candidateEmail}" uses a synthetic or placeholder domain.`
      );
    }
    if (!validatedPkg.candidateName) {
      missingFields.push('candidateName');
    }

    const hasCompany = Boolean(targetJob.company?.trim());
    const hasTitle = Boolean(targetJob.title?.trim());
    if (!hasCompany) missingFields.push('targetJob.company');
    if (!hasTitle) missingFields.push('targetJob.title');

    // Canonical identity resolution for duplicate check
    const targetCanonicalJobId =
      targetJob.canonicalJobId ||
      deriveCanonicalJobId({
        canonicalJobId: targetJob.canonicalJobId,
        jobId: targetJob.id,
        source: targetJob.source,
        directPortalUrl: targetUrl,
        applicationUrl: targetUrl,
      });
    const targetNormalizedUrl = targetUrl ? normalizeJobUrl(targetUrl) : null;

    // Active applications query
    const activeRows = await this.db
      .select({
        id: jobApplications.id,
        status: jobApplications.status,
        appliedAt: jobApplications.appliedAt,
        canonicalJobId: jobApplications.canonicalJobId,
        normalizedJobUrl: jobApplications.normalizedJobUrl,
        companyName: jobApplications.companyName,
        jobTitle: jobApplications.jobTitle,
        jobUrl: jobApplications.jobUrl,
        metadata: jobApplications.metadata,
      })
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenantId),
          eq(jobApplications.candidateId, candidateId),
          sql`${jobApplications.status} NOT IN ('REJECTED', 'WITHDRAWN', 'ARCHIVED')`
        )
      );

    let matchedApp = null;
    // Priority 1: Match by canonicalJobId
    if (targetCanonicalJobId) {
      matchedApp = activeRows.find(
        (row) =>
          row.canonicalJobId === targetCanonicalJobId ||
          row.metadata?.canonicalJobId === targetCanonicalJobId ||
          row.metadata?.jobId === targetCanonicalJobId ||
          row.id === targetCanonicalJobId
      );
    }

    // Priority 2: Match by normalizedJobUrl
    if (!matchedApp && targetNormalizedUrl) {
      matchedApp = activeRows.find((row) => {
        if (row.normalizedJobUrl && row.normalizedJobUrl === targetNormalizedUrl) return true;
        if (row.jobUrl && normalizeJobUrl(row.jobUrl) === targetNormalizedUrl) return true;
        return false;
      });
    }

    // Priority 3: Guarded legacy fallback by (company, title)
    if (!matchedApp && hasCompany && hasTitle) {
      const companyMatches = activeRows.filter(
        (row) =>
          row.companyName.trim().toLowerCase() === targetJob.company.trim().toLowerCase() &&
          row.jobTitle.trim().toLowerCase() === targetJob.title.trim().toLowerCase()
      );
      matchedApp = companyMatches.find((row) => {
        const rowCanonical =
          row.canonicalJobId || row.metadata?.canonicalJobId || row.metadata?.jobId;
        if (rowCanonical && targetCanonicalJobId && rowCanonical !== targetCanonicalJobId) {
          return false;
        }
        const rowNormUrl =
          row.normalizedJobUrl || (row.jobUrl ? normalizeJobUrl(row.jobUrl) : null);
        if (rowNormUrl && targetNormalizedUrl && rowNormUrl !== targetNormalizedUrl) {
          return false;
        }
        return true;
      });
    }

    let duplicateWarning;
    if (matchedApp) {
      const isSelf = validatedPkg.applicationId && matchedApp.id === validatedPkg.applicationId;
      if (!isSelf || matchedApp.status === 'APPLIED' || matchedApp.status === 'INTERVIEWING') {
        if (matchedApp.status === 'APPLIED' || matchedApp.status === 'INTERVIEWING') {
          duplicateWarning = {
            existingApplicationId: matchedApp.id,
            status: matchedApp.status,
            appliedAt: matchedApp.appliedAt ? matchedApp.appliedAt.toISOString() : undefined,
          };
          warnings.push(
            `You already have a submitted application recorded for "${targetJob.title}" at ${targetJob.company} (Status: ${matchedApp.status}).`
          );
        } else if (!isSelf) {
          warnings.push(
            `An existing active application (${matchedApp.id}) is already tracked for "${targetJob.title}" at ${targetJob.company} (Status: ${matchedApp.status}).`
          );
        }
      }
    }

    // Portal Type Identification
    // P16-001F-5: Indian job boards are recognized portals with browser
    // handoff (no API submission path); URL patterns match the extension's
    // adapter host coverage.
    const INDIAN_PORTAL_PATTERNS = [
      ['naukri.com', 'NAUKRI'],
      ['shine.com', 'SHINE'],
      ['foundit.in', 'FOUNDIT'],
      ['monsterindia.com', 'FOUNDIT'],
      ['iimjobs.com', 'IIMJOBS'],
      ['timesjobs.com', 'TIMESJOBS'],
      ['hirect.in', 'HIRECT'],
      ['hirect.com', 'HIRECT'],
      ['cutshort.io', 'CUTSHORT'],
      ['instahyre.com', 'INSTAHYRE'],
    ];

    let portalType = 'GENERIC_WEB';
    let submissionMethod = 'BROWSER_HANDOFF_REQUIRED';

    const urlLower = targetUrl.toLowerCase();
    if (urlLower.includes('greenhouse.io') || urlLower.includes('boards.greenhouse.io')) {
      portalType = 'GREENHOUSE';
      submissionMethod = 'API_DIRECT';
    } else if (urlLower.includes('lever.co') || urlLower.includes('jobs.lever.co')) {
      portalType = 'LEVER';
      submissionMethod = 'API_DIRECT';
    } else if (urlLower.includes('workday.com') || urlLower.includes('myworkdayjobs.com')) {
      portalType = 'WORKDAY';
      submissionMethod = 'BROWSER_HANDOFF_REQUIRED';
      warnings.push(
        'Workday portals enforce corporate SSO/CAPTCHA; Career Hub provides prepared submission assets for manual handoff.'
      );
    } else {
      const indianPortal = INDIAN_PORTAL_PATTERNS.find(([pattern]) => urlLower.includes(pattern));
      if (indianPortal) {
        portalType = indianPortal[1];
      }
    }

    // Resume Validation
    const resumeIssues = [];
    const hasMarkdown = Boolean(validatedPkg.tailoredResume?.markdownContent?.trim());
    const hasPdfArtifact = Boolean(
      validatedPkg.tailoredResume?.artifact?.downloadUrl ||
      validatedPkg.tailoredResume?.artifact?.viewUrl
    );
    const qaPassed = Boolean(validatedPkg.tailoredResume?.artifact?.qaPassed ?? false);

    if (!hasMarkdown) {
      resumeIssues.push('Resume markdown content is empty');
      missingFields.push('tailoredResume');
    }
    if (!hasPdfArtifact) {
      resumeIssues.push('Resume compiled PDF artifact is not ready');
    }
    if (!qaPassed && validatedPkg.tailoredResume?.artifact) {
      resumeIssues.push('Resume pre-exposure QA did not pass');
    }

    const resumeValidation = {
      hasMarkdown,
      hasPdfArtifact,
      qaScore: validatedPkg.tailoredResume?.artifact?.qaScore ?? null,
      qaPassed,
      contentHash: validatedPkg.tailoredResume?.contentHash,
      pdfContentHash: validatedPkg.tailoredResume?.artifact?.pdfContentHash ?? null,
      issues: resumeIssues,
    };

    // Document Validation
    const docIssues = [];
    if (validatedPkg.artifactFailureReason) {
      docIssues.push(validatedPkg.artifactFailureReason);
    }
    const documentValidation = {
      documentsStatus:
        validatedPkg.documentsStatus ||
        (validatedPkg.artifactsReady ? 'DOCUMENTS_READY' : 'DOCUMENTS_PENDING'),
      artifactsReady: Boolean(validatedPkg.artifactsReady),
      coverLetterReady: Boolean(validatedPkg.coverLetter?.markdownContent?.trim()),
      issues: docIssues,
    };

    // Job Consistency
    const jobIssues = [];
    if (!hasCompany) jobIssues.push('Target company name is missing');
    if (!hasTitle) jobIssues.push('Target job title is missing');
    const jobConsistency = {
      isConsistent: hasCompany && hasTitle,
      targetCompany: targetJob.company || '',
      targetTitle: targetJob.title || '',
      applicationId: validatedPkg.applicationId || null,
      packageVersion: validatedPkg.packageVersion || null,
      issues: jobIssues,
    };

    // Provenance Issues
    const provIssues = [];
    const unsubstantiatedSkills = (validatedPkg.claimedSkills || [])
      .map((s) => s.name)
      .filter(Boolean);
    const unverifiedProjects = (validatedPkg.portfolioLinks || [])
      .filter((p) => !p.repositoryUrl)
      .map((p) => p.projectName);

    if (unsubstantiatedSkills.length > 0) {
      provIssues.push(
        `${unsubstantiatedSkills.length} claimed skills lack repository verification: ${unsubstantiatedSkills.join(', ')}`
      );
    }
    if (unverifiedProjects.length > 0) {
      provIssues.push(
        `${unverifiedProjects.length} portfolio projects lack repository URLs: ${unverifiedProjects.join(', ')}`
      );
    }

    const provenanceIssues = {
      unsubstantiatedSkillsCount: unsubstantiatedSkills.length,
      unsubstantiatedSkills,
      unverifiedProjects,
      issues: provIssues,
    };

    if (resumeIssues.length > 0 && !hasMarkdown) {
      errors.push(...resumeIssues);
    }
    if (jobIssues.length > 0) {
      errors.push(...jobIssues);
    }

    let status = 'READY_TO_APPLY';
    if (missingFields.length > 0) {
      status = 'NEEDS_USER_INPUT';
    } else if (
      duplicateWarning &&
      (duplicateWarning.status === 'APPLIED' || duplicateWarning.status === 'INTERVIEWING')
    ) {
      status = 'DUPLICATE';
    } else if (errors.length > 0) {
      status = 'BLOCKED';
    } else if (submissionMethod === 'BROWSER_HANDOFF_REQUIRED') {
      status = 'UNSUPPORTED_PORTAL';
    }

    const result = {
      status,
      overallStatus: status,
      packageHash: validatedPkg.packageHash,
      isReady: status === 'READY_TO_APPLY' || status === 'UNSUPPORTED_PORTAL',
      errors,
      missingFields,
      warnings,
      duplicateWarning,
      resumeValidation,
      documentValidation,
      jobConsistency,
      provenanceIssues,
      portalType,
      submissionMethod,
      validatedAt: new Date().toISOString(),
    };

    return ApplicationValidationResultSchema.parse(result);
  }

  /**
   * Generates formatted human-reviewable application preview markdown.
   *
   * @param {object} applicationPackage
   * @returns {string} Formatted markdown preview
   */
  createApplicationPreview(applicationPackage) {
    const pkg = ApplicationPackageSchema.parse(applicationPackage);

    return `
# Application Package Preview: ${pkg.targetJob.title} @ ${pkg.targetJob.company}

**Candidate:** ${pkg.candidateName} (${pkg.candidateEmail})
**Target Destination:** ${pkg.targetJob.applicationUrl}
**Package Integrity Hash:** \`${pkg.packageHash}\`

---

## 1. Verified Evidence & Skills
${pkg.verifiedSkills.map((s) => `- ✅ **${s.name}** *(${s.truthCategory || 'VERIFIED'})* — ${s.notes || ''}`).join('\n') || '- None'}

## 2. Claimed Profile Skills
${pkg.claimedSkills.map((s) => `- 📋 **${s.name}** *(${s.truthCategory || 'CLAIMED'})* — ${s.notes || ''}`).join('\n') || '- None'}

---

## 3. Tailored Resume Preview (ATS Fit: ${pkg.tailoredResume.fitScore}%)
\`\`\`markdown
${pkg.tailoredResume.markdownContent}
\`\`\`

---

## 4. Cover Letter Preview
\`\`\`markdown
${pkg.coverLetter.markdownContent}
\`\`\`

---

## 5. Portfolio Project Highlights
${pkg.portfolioLinks.map((p) => `- 🚀 **${p.projectName}** ${p.repositoryUrl ? `([Code](${p.repositoryUrl}))` : ''}: ${p.highlights.join('; ')}`).join('\n') || '- None'}

---

> [!IMPORTANT]
> **Human Approval Boundary**: Career Hub does not autonomously submit job applications.
> To proceed with submission, approve the package below to generate a single-use approval ticket.
`.trim();
  }

  /**
   * Generates a canonical, immutable application snapshot representation for review and submission.
   *
   * @param {object} applicationPackage
   * @returns {object} Validated ApplicationSnapshot
   */
  createApplicationSnapshot(applicationPackage) {
    const pkg = ApplicationPackageSchema.parse(applicationPackage);
    const targetJob = pkg.targetJob || {};
    const targetUrl = targetJob.directPortalUrl || targetJob.applicationUrl || targetJob.sourceUrl || '';

    const snapshot = {
      snapshotId: crypto.randomUUID(),
      applicationId: pkg.applicationId,
      packageHash: pkg.packageHash,
      packageVersion: pkg.packageVersion,
      job: {
        id: targetJob.id,
        canonicalJobId: targetJob.canonicalJobId,
        company: targetJob.company,
        title: targetJob.title,
        targetUrl,
      },
      candidate: {
        id: pkg.candidateId,
        name: pkg.candidateName,
        email: pkg.candidateEmail,
        phone: pkg.candidatePhone || null,
      },
      contactInformation: {
        name: pkg.candidateName,
        email: pkg.candidateEmail,
        phone: pkg.candidatePhone || null,
      },
      workAuthorization: pkg.answers?.workAuthorization || pkg.answers?.workAuth || null,
      location: targetJob.location || null,
      resume: {
        contentHash: pkg.tailoredResume?.contentHash || '',
        markdownContent: pkg.tailoredResume?.markdownContent || '',
        artifactFilename: pkg.tailoredResume?.artifact?.filename,
      },
      coverLetter: {
        contentHash: pkg.coverLetter?.contentHash || '',
        markdownContent: pkg.coverLetter?.markdownContent || '',
        artifactFilename: pkg.coverLetter?.artifact?.filename,
      },
      applicationAnswers: pkg.answers || {},
      attachments: pkg.tailoredResume?.artifact ? [pkg.tailoredResume.artifact] : [],
      targetUrl,
      createdAt: new Date().toISOString(),
    };

    return ApplicationSnapshotSchema.parse(snapshot);
  }

  /**
   * Validates that the active external browser page matches the approved job target.
   *
   * @param {object} params
   * @param {object} params.approvedJob Approved job definition from package
   * @param {object} params.currentPage Current external browser page details
   * @returns {{ matched: boolean, reason?: string }}
   */
  static validateExternalPageMatch({ approvedJob, currentPage }) {
    if (!approvedJob || !currentPage) {
      return { matched: false, reason: 'Approved job and current page must both be provided' };
    }

    if (
      approvedJob.company &&
      currentPage.company &&
      approvedJob.company.trim().toLowerCase() !== currentPage.company.trim().toLowerCase()
    ) {
      return {
        matched: false,
        reason: `Target company mismatch: expected "${approvedJob.company}", found "${currentPage.company}"`,
      };
    }

    if (
      approvedJob.title &&
      currentPage.title &&
      approvedJob.title.trim().toLowerCase() !== currentPage.title.trim().toLowerCase()
    ) {
      return {
        matched: false,
        reason: `Target title mismatch: expected "${approvedJob.title}", found "${currentPage.title}"`,
      };
    }

    if (
      approvedJob.jobId &&
      currentPage.jobId &&
      approvedJob.jobId !== currentPage.jobId
    ) {
      return {
        matched: false,
        reason: `Target jobId mismatch: expected "${approvedJob.jobId}", found "${currentPage.jobId}"`,
      };
    }

    const appUrl = approvedJob.applicationUrl || approvedJob.directPortalUrl || approvedJob.targetUrl;
    const pageUrl = currentPage.url || currentPage.applicationUrl;
    if (appUrl && pageUrl) {
      try {
        const u1 = new URL(appUrl);
        const u2 = new URL(pageUrl);
        if (u1.hostname !== u2.hostname) {
          return {
            matched: false,
            reason: `Target host mismatch: expected "${u1.hostname}", found "${u2.hostname}"`,
          };
        }
      } catch {
        // Fall back to direct normalization check
        if (normalizeJobUrl(appUrl) !== normalizeJobUrl(pageUrl)) {
          return {
            matched: false,
            reason: `Target URL mismatch: expected "${appUrl}", found "${pageUrl}"`,
          };
        }
      }
    }

    return { matched: true };
  }

  /**
   * Resolves the retry safety state for submission failures.
   * Distinguishes NOT_SENT, SENT_UNKNOWN, CONFIRMED, and FAILED.
   *
   * @param {Error|object|string} error
   * @returns {'NOT_SENT' | 'SENT_UNKNOWN' | 'CONFIRMED' | 'FAILED'}
   */
  static resolveSubmissionRetryState(error) {
    if (!error) return 'CONFIRMED';
    const msg = typeof error === 'string' ? error : error?.message || '';
    const code = error?.code || '';

    // Network / socket / timeout errors occurring mid-flight: state is SENT_UNKNOWN
    if (
      /timeout|timed? out|econnreset|socket hang up|etimedout|502|503|504|gateway/i.test(msg) ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET'
    ) {
      return 'SENT_UNKNOWN';
    }

    // Pre-flight / validation / DNS resolution errors before request transmission: NOT_SENT
    if (
      /enotfound|validation|invalid|missing|ticket|tamper|expired|econnrefused/i.test(msg) ||
      code === 'ENOTFOUND' ||
      code === 'ECONNREFUSED' ||
      code === 'VALIDATION_ERROR' ||
      code === 'APPROVAL_TICKET_REQUIRED'
    ) {
      return 'NOT_SENT';
    }

    // Definitive server rejection: FAILED
    return 'FAILED';
  }

  /**
   * Creates a single-use, 15-minute TTL cryptographic approval ticket bound to the application package hash.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.userId
   * @param {string} params.candidateId
   * @param {string} params.clientId
   * @param {string} params.jobId
   * @param {string} params.destinationUrl
   * @param {string} params.packageHash
   * @param {number} [params.packageVersion]
   * @returns {Promise<object>} Approval ticket
   */
  async _saveApprovalTicket(ticketData) {
    APPROVAL_TICKETS_STORE.set(ticketData.ticketId, { ...ticketData });
    if (this.db && typeof this.db.insert === 'function') {
      try {
        await createApplicationApprovalTicketRecord(this.db, ticketData);
      } catch (err) {
        this.logger.warn(
          { ticketId: ticketData.ticketId, error: err.message },
          'Failed to persist approval ticket record in database'
        );
      }
    }
  }

  async _getApprovalTicket(tenantId, ticketId) {
    if (this.db && typeof this.db.select === 'function') {
      try {
        const row = await getApplicationApprovalTicketById(this.db, tenantId, ticketId);
        if (row) {
          return {
            ticketId: row.id,
            tenantId: row.tenantId,
            userId: row.userId,
            candidateId: row.candidateId,
            applicationId: row.applicationId || undefined,
            jobId: row.jobId,
            destinationUrl: row.destinationUrl,
            packageHash: row.packageHash,
            packageVersion: row.packageVersion ?? undefined,
            signature: row.signature,
            status: row.status,
            issuedAt: row.issuedAt?.toISOString ? row.issuedAt.toISOString() : row.issuedAt,
            expiresAt: row.expiresAt?.toISOString ? row.expiresAt.toISOString() : row.expiresAt,
            consumedAt: row.consumedAt?.toISOString ? row.consumedAt.toISOString() : row.consumedAt,
            revokedAt: row.revokedAt?.toISOString ? row.revokedAt.toISOString() : row.revokedAt,
            createdAt: row.createdAt?.toISOString ? row.createdAt.toISOString() : row.createdAt,
          };
        }
      } catch (err) {
        this.logger.warn(
          { ticketId, error: err.message },
          'Failed to query database for approval ticket; trying in-memory store'
        );
      }
    }
    const memTicket = APPROVAL_TICKETS_STORE.get(ticketId);
    if (memTicket && memTicket.tenantId === tenantId) {
      return { ...memTicket };
    }
    return null;
  }

  async _updateApprovalTicketStatus(tenantId, ticketId, toStatus, updates = {}) {
    const mem = APPROVAL_TICKETS_STORE.get(ticketId);
    if (mem) {
      mem.status = toStatus;
      Object.assign(mem, updates);
      APPROVAL_TICKETS_STORE.set(ticketId, mem);
    }
    if (this.db && typeof this.db.update === 'function') {
      try {
        await updateApplicationApprovalTicketStatus(
          this.db,
          tenantId,
          ticketId,
          null,
          toStatus,
          updates
        );
      } catch (err) {
        this.logger.warn(
          { ticketId, toStatus, error: err.message },
          'Failed to update approval ticket status in database'
        );
      }
    }
  }

  async revokeApplicationApprovalTicket({ tenantId, userId, ticketId, reason = null }) {
    if (!tenantId || !ticketId) {
      throw new ValidationError('tenantId and ticketId are required', 'INVALID_REVOKE_REQUEST');
    }
    const ticket = await this._getApprovalTicket(tenantId, ticketId);
    if (!ticket) {
      throw new NotFoundError(`Approval ticket not found: ${ticketId}`);
    }
    await this._updateApprovalTicketStatus(tenantId, ticketId, 'REVOKED', {
      revokedAt: new Date(),
      metadata: reason ? { revocationReason: reason } : {},
    });
    return { ticketId, status: 'REVOKED', revokedAt: new Date().toISOString() };
  }

  async getApprovalTicket({ tenantId, ticketId }) {
    if (!tenantId || !ticketId) {
      throw new ValidationError('tenantId and ticketId are required', 'INVALID_GET_TICKET_REQUEST');
    }
    const ticket = await this._getApprovalTicket(tenantId, ticketId);
    if (!ticket) {
      throw new NotFoundError(`Approval ticket not found: ${ticketId}`, 'TICKET_NOT_FOUND');
    }
    return ticket;
  }

  /**
   * Creates a single-use, 15-minute TTL cryptographic approval ticket bound to the application package hash.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.userId
   * @param {string} params.candidateId
   * @param {string} [params.applicationId]
   * @param {string} params.clientId
   * @param {string} params.jobId
   * @param {string} params.destinationUrl
   * @param {string} params.packageHash
   * @param {number} [params.packageVersion]
   * @param {string} [params.status]
   * @param {string} [params.role]
   * @returns {Promise<object>} Approval ticket
   */
  async requestApplicationApproval({
    tenantId,
    userId,
    candidateId,
    applicationId,
    clientId,
    jobId,
    destinationUrl,
    packageHash,
    packageVersion,
    status = 'ISSUED',
    role = 'MEMBER',
  }) {
    if (!tenantId || !userId || !candidateId || !packageHash || !destinationUrl) {
      throw new ValidationError(
        'All context parameters and packageHash are required.',
        'INVALID_APPROVAL_REQUEST'
      );
    }

    const [cand] = await this.db
      .select({ id: candidates.id, userId: candidates.userId })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
      .limit(1);

    if (!cand) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }
    if (cand.userId && cand.userId !== userId && role !== 'OWNER') {
      throw new AuthorizationError(
        'Forbidden: You do not have permission to request approvals for this candidate',
        'FORBIDDEN'
      );
    }

    const ticketId = crypto.randomUUID();
    const issuedAt = new Date().toISOString();
    const createdAt = issuedAt;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15-minute TTL

    const ticketData = {
      ticketId,
      tenantId,
      userId,
      candidateId,
      applicationId: applicationId || null,
      clientId: clientId || 'career-hub-client',
      jobId: String(jobId),
      destinationUrl,
      packageHash,
      packageVersion: packageVersion ?? undefined,
      signature: '',
      status: status || 'ISSUED',
      issuedAt,
      expiresAt,
      createdAt,
    };

    ticketData.signature = signApplicationTicket(ticketData);

    // Save to durable PostgreSQL database and memory cache
    await this._saveApprovalTicket(ticketData);

    if (this.mcpAuditService) {
      await this.mcpAuditService.logEvent({
        tenantId,
        userId,
        eventType: 'application.approval_requested',
        resourceType: 'application_approval_ticket',
        resourceId: ticketId,
        clientIp: '127.0.0.1',
        metadata: { jobId, destinationUrl, packageHash },
      });
    }

    return ApplicationApprovalTicketSchema.parse(ticketData);
  }

  /**
   * Executes the final submission action across the security boundary.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.userId
   * @param {string} params.candidateId
   * @param {string} params.approvalTicketId
   * @param {string} [params.applicationId]
   * @param {string} [params.jobId]
   * @param {string} params.packageHash
   * @param {string} params.destinationUrl
   * @param {object} params.applicationPackage
   * @returns {Promise<object>} Submission result
   */
  async submitJobApplication({
    tenantId,
    userId,
    candidateId,
    approvalTicketId,
    applicationId,
    jobId,
    packageHash,
    destinationUrl,
    applicationPackage,
  }) {
    packageHash = packageHash || applicationPackage?.packageHash;

    if (!approvalTicketId) {
      throw new AuthorizationError(
        'APPLICATION_APPROVAL_REQUIRED: External job submission requires a valid, pre-approved application ticket.',
        'APPROVAL_TICKET_REQUIRED'
      );
    }

    const ticket = await this._getApprovalTicket(tenantId, approvalTicketId);
    if (!ticket) {
      throw new NotFoundError(
        `Approval ticket "${approvalTicketId}" not found or has been purged.`,
        'TICKET_NOT_FOUND'
      );
    }

    // 1. Sovereign Tenant & User Isolation
    if (
      ticket.tenantId !== tenantId ||
      ticket.userId !== userId ||
      ticket.candidateId !== candidateId
    ) {
      throw new AuthorizationError(
        'Cross-tenant or cross-user approval ticket misuse detected.',
        'FORBIDDEN_TICKET_MISMATCH'
      );
    }

    // 2. Application binding check
    const reqAppId = applicationId || applicationPackage?.applicationId;
    if (ticket.applicationId && reqAppId && ticket.applicationId !== reqAppId) {
      throw new ValidationError(
        'Approval ticket applicationId does not match requested application.',
        'APPLICATION_ID_MISMATCH'
      );
    }

    // 3. Job binding check
    const reqJobId = jobId || applicationPackage?.targetJob?.id;
    if (ticket.jobId && reqJobId && ticket.jobId !== String(reqJobId)) {
      throw new ValidationError(
        'Approval ticket jobId does not match target job.',
        'JOB_ID_MISMATCH'
      );
    }

    // 4. Destination URL Match
    if (ticket.destinationUrl !== destinationUrl) {
      throw new ValidationError(
        'Target destination URL does not match approved ticket destination.',
        'DESTINATION_MISMATCH'
      );
    }

    // 5. Package Hash Bit-for-Bit Integrity Check
    const resolvedPackageHash = packageHash || applicationPackage?.packageHash;
    if (ticket.packageHash !== resolvedPackageHash) {
      throw new ValidationError(
        'Application package has been altered after approval ticket generation (hash mismatch).',
        'PACKAGE_HASH_TAMPERED'
      );
    }

    // 6. Application Version Stale Approval Check
    if (
      ticket.packageVersion !== undefined &&
      applicationPackage?.packageVersion !== undefined &&
      ticket.packageVersion !== applicationPackage.packageVersion
    ) {
      throw new ValidationError(
        `Approval ticket was issued for version ${ticket.packageVersion}, but current application package is version ${applicationPackage.packageVersion}. Please re-request approval for the latest version.`,
        'STALE_APPROVAL_VERSION'
      );
    }

    // 7. Revocation Check
    if (ticket.status === 'REVOKED') {
      throw new AuthorizationError(
        'Approval ticket has been revoked.',
        'TICKET_REVOKED'
      );
    }

    // 8. Single-Use Check (Replay Prevention)
    if (ticket.status === 'CONSUMED') {
      throw new ConflictError(
        'Approval ticket has already been consumed (single-use replay rejected).',
        'TICKET_ALREADY_CONSUMED'
      );
    }

    // 9. Expiration Check
    if (new Date(ticket.expiresAt).getTime() < Date.now()) {
      ticket.status = 'EXPIRED';
      await this._updateApprovalTicketStatus(tenantId, approvalTicketId, 'EXPIRED');
      throw new ValidationError(
        'Approval ticket has expired. Please re-request approval.',
        'TICKET_EXPIRED'
      );
    }

    // 10. Cryptographic Signature Verification
    const isValidSig = verifyApplicationTicketSignature(ticket, ticket.signature);
    if (!isValidSig) {
      throw new InvalidTicketSignatureError(
        'Invalid approval ticket cryptographic signature or tampered ticket data.',
        'INVALID_TICKET_SIGNATURE'
      );
    }

    // Mark Ticket Consumed Immediately (Replay Prevention)
    ticket.status = 'CONSUMED';
    ticket.consumedAt = new Date().toISOString();
    await this._updateApprovalTicketStatus(tenantId, approvalTicketId, 'CONSUMED', {
      consumedAt: new Date(),
    });

    const portalType = detectPortalType(destinationUrl);

    // 6. Check for Real External Submission Adapter via Centralized Registry
    const activeAdapter =
      this.portalAdapterRegistry?.resolve(destinationUrl) ||
      this.submissionAdapters.find((adapter) => {
        if (typeof adapter?.canSubmit === 'function') {
          return adapter.canSubmit(destinationUrl);
        }
        return false;
      });

    if (
      activeAdapter &&
      (typeof activeAdapter.submit === 'function' ||
        typeof activeAdapter.submitOrHandoff === 'function')
    ) {
      // Real External Integration Execution
      let adapterResult;
      try {
        if (typeof activeAdapter.submitOrHandoff === 'function') {
          adapterResult = await activeAdapter.submitOrHandoff({
            destinationUrl,
            applicationPackage,
            tenantId,
            userId,
            candidateId,
            packageHash,
          });
        } else {
          adapterResult = await activeAdapter.submit({
            destinationUrl,
            applicationPackage,
            tenantId,
            userId,
            candidateId,
            packageHash,
          });
        }
      } catch (err) {
        if (this.mcpAuditService) {
          await this.mcpAuditService.logEvent({
            tenantId,
            userId,
            eventType: 'application.submission_failed',
            resourceType: 'job_application',
            resourceId: 'external-submission-failed',
            clientIp: '127.0.0.1',
            metadata: { destinationUrl, error: err.message, packageHash },
          });
        }
        throw err;
      }

      // Check if actual external submission was executed or if final submission was blocked/staged
      const isActualSubmission =
        adapterResult.status === 'SUBMITTED' &&
        !adapterResult.finalSubmitBlocked &&
        !adapterResult.handoffKit?.finalSubmitBlocked &&
        adapterResult.authorizedSubmissionExecuted === true;

      // In current automation, automatic final submission is strictly disabled.
      // Therefore, the terminal state for automated staging is READY_FOR_FINAL_REVIEW (or HANDOFF_READY).
      // Hard invariant: READY_FOR_FINAL_REVIEW must NEVER be represented as APPLIED or SUBMITTED
      // in the database or result unless an actual authorized submission event has occurred.
      const targetDbStatus = isActualSubmission
        ? 'SUBMITTED'
        : adapterResult.status === 'HANDOFF_READY'
          ? 'HANDOFF_READY'
          : 'READY_FOR_FINAL_REVIEW';

      const appliedAt = isActualSubmission ? new Date() : null;
      const resultStatus = isActualSubmission
        ? 'SUBMITTED'
        : adapterResult.status === 'HANDOFF_READY'
          ? 'HANDOFF_READY'
          : 'READY_FOR_FINAL_REVIEW';

      let trackedApp;
      try {
        trackedApp = await this.applicationTrackingService.resolveOrCreateApplication(
          { tenantId, userId, role: 'MEMBER' },
          candidateId,
          {
            companyName: applicationPackage.targetJob.company,
            jobTitle: applicationPackage.targetJob.title,
            jobUrl: destinationUrl,
            source: 'COMPANY_CAREERS',
            packageHash,
            status: targetDbStatus,
            metadata: {
              destinationUrl,
              externalReference: adapterResult.externalReference,
              externalSubmissionState: targetDbStatus,
              packageHash,
              finalSubmitBlocked: !isActualSubmission,
            },
          }
        );

        await this.applicationTrackingService.recordApplicationPackage(
          { tenantId, userId, role: 'MEMBER' },
          trackedApp.id,
          applicationPackage,
          { source: 'SUBMIT_JOB_APPLICATION' }
        );

        await this.db
          .update(jobApplications)
          .set({
            status: targetDbStatus,
            appliedAt,
            updatedAt: new Date(),
            metadata: {
              ...(trackedApp.metadata || {}),
              destinationUrl,
              externalReference: adapterResult.externalReference,
              externalSubmissionState: targetDbStatus,
              externalSubmissionStatus: targetDbStatus,
              packageHash,
              finalSubmitBlocked: !isActualSubmission,
            },
          })
          .where(
            and(eq(jobApplications.id, trackedApp.id), eq(jobApplications.tenantId, tenantId))
          );
      } catch (err) {
        // Tracking failures must not fail the external submission itself
        this.logger.warn(
          { error: err.message },
          'Failed to resolve/track application for external submission'
        );
      }

      if (this.mcpAuditService) {
        await this.mcpAuditService.logEvent({
          tenantId,
          userId,
          eventType: isActualSubmission ? 'application.submitted' : 'application.ready_for_final_review',
          resourceType: 'job_application',
          resourceId: trackedApp?.id || adapterResult.externalReference || 'ready-for-review',
          clientIp: '127.0.0.1',
          metadata: {
            destinationUrl,
            externalReference: adapterResult.externalReference,
            packageHash,
            status: targetDbStatus,
          },
        });
      }

      return SubmissionResultSchema.parse({
        status: resultStatus,
        applicationId: trackedApp?.id,
        externalReference: adapterResult.externalReference,
        destinationUrl,
        portalType: adapterResult.portalType || portalType,
        message:
          adapterResult.message ||
          (isActualSubmission
            ? `Job application successfully submitted to ${applicationPackage.targetJob.company} via verified integration.`
            : `Job application staged and verified for ${applicationPackage.targetJob.company}. Ready for final user review prior to submission.`),
        submittedAt: isActualSubmission ? new Date().toISOString() : undefined,
        stagedAt: !isActualSubmission ? new Date().toISOString() : undefined,
        handoffKit: adapterResult.handoffKit || undefined,
      });
    }

    // 7. Truthful Manual Handoff for Portals Without Direct Automated API Transmission
    // Zero fake submissions, zero simulated SUB-* references, zero fabricated external IDs.
    let trackedApp;
    try {
      trackedApp = await this.applicationTrackingService.resolveOrCreateApplication(
        { tenantId, userId, role: 'MEMBER' },
        candidateId,
        {
          companyName: applicationPackage.targetJob.company,
          jobTitle: applicationPackage.targetJob.title,
          jobUrl: destinationUrl,
          source: 'COMPANY_CAREERS',
          packageHash,
          status: 'HANDOFF_READY',
          metadata: {
            destinationUrl,
            externalSubmissionState: 'HANDOFF_READY',
            packageHash,
            finalSubmitBlocked: true,
          },
        }
      );

      await this.applicationTrackingService.recordApplicationPackage(
        { tenantId, userId, role: 'MEMBER' },
        trackedApp.id,
        applicationPackage,
        { source: 'SUBMIT_JOB_APPLICATION' }
      );

      await this.db
        .update(jobApplications)
        .set({
          status: 'HANDOFF_READY',
          appliedAt: null,
          updatedAt: new Date(),
          metadata: {
            ...(trackedApp.metadata || {}),
            destinationUrl,
            externalSubmissionState: 'HANDOFF_READY',
            externalSubmissionStatus: 'HANDOFF_READY',
            packageHash,
            finalSubmitBlocked: true,
          },
        })
        .where(
          and(eq(jobApplications.id, trackedApp.id), eq(jobApplications.tenantId, tenantId))
        );
    } catch (err) {
      this.logger.warn(
        { error: err.message },
        'Failed to resolve/track application for manual handoff'
      );
    }

    let realHandoffKit = null;
    try {
      realHandoffKit = await this.applicationHandoffService.buildApplicationHandoffKit({
        tenantId,
        userId,
        candidateId,
        applicationPackage,
        applicationId: trackedApp?.id,
        destinationUrl,
      });

      // Persist the kit atomically onto the application (P14-005BA). The kit's
      // packageHash must match the application's authoritative CURRENT package.
      if (trackedApp?.id && realHandoffKit) {
        try {
          await this.applicationTrackingService.setApplicationHandoffKit(
            { tenantId, userId, role: 'MEMBER' },
            trackedApp.id,
            realHandoffKit
          );
        } catch (updateErr) {
          this.logger.warn(
            { error: updateErr.message },
            'Failed to persist handoffKit onto tracked application'
          );
        }
      }
    } catch (err) {
      this.logger.warn(
        { error: err.message },
        'Real document handoff kit generation failed, falling back to basic payload'
      );
    }

    const handoffKit = {
      resumeMarkdown:
        applicationPackage.tailoredResume?.markdownContent ||
        applicationPackage.tailoredResume?.markdown ||
        applicationPackage.tailoredResume?.renderedMarkdown ||
        '',
      coverLetterMarkdown:
        applicationPackage.coverLetter?.markdownContent ||
        applicationPackage.coverLetter?.markdown ||
        applicationPackage.coverLetter?.renderedMarkdown ||
        '',
      suggestedAnswers: applicationPackage.answers || {},
      directPortalUrl: destinationUrl,
      checklist: [
        'Open direct employer portal in browser.',
        'Review candidate readiness items.',
        'Download and review tailored ATS resume and cover letter.',
        'Submit directly to employer ATS.',
      ],
      ...(realHandoffKit
        ? {
            artifacts: {
              resume: realHandoffKit.resume,
              coverLetter: realHandoffKit.coverLetter,
            },
            readiness: realHandoffKit.readiness,
            applicationId: realHandoffKit.applicationId,
            packageHash: realHandoffKit.packageHash,
            submissionNotice: realHandoffKit.submissionNotice,
          }
        : {}),
    };

    if (this.mcpAuditService) {
      await this.mcpAuditService.logEvent({
        tenantId,
        userId,
        eventType: 'application.submission_attempted',
        resourceType: 'job_application',
        resourceId: trackedApp?.id || 'manual-handoff',
        clientIp: '127.0.0.1',
        metadata: { destinationUrl, status: 'HANDOFF_READY', packageHash },
      });
    }

    return SubmissionResultSchema.parse({
      status: 'HANDOFF_READY',
      applicationId: trackedApp?.id,
      destinationUrl,
      portalType,
      message: `Direct automated API submission is not configured for ${portalType}. Career Hub has prepared your complete submission kit for instant manual handoff at the official employer portal.`,
      submittedAt: new Date().toISOString(),
      manualHandoffKit: handoffKit,
    });
  }

  /**
   * Transitions an application's workflow state enforcing strict state machine invariants (Phase 9.5).
   * Hard Invariant: Transitions from READY_FOR_FINAL_REVIEW to SUBMITTED or APPLIED are strictly
   * forbidden unless authorizedSubmissionExecuted is explicitly true.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.userId
   * @param {string} params.applicationId
   * @param {string} params.targetState
   * @param {boolean} [params.authorizedSubmissionExecuted=false]
   * @param {string} [params.reason='']
   * @returns {Promise<object>} Updated application row
   */
  async transitionApplicationState({
    tenantId,
    userId,
    applicationId,
    targetState,
    authorizedSubmissionExecuted = false,
    reason = '',
  }) {
    if (!tenantId || !applicationId || !targetState) {
      throw new ValidationError(
        'tenantId, applicationId, and targetState are required.',
        'INVALID_STATE_TRANSITION_REQUEST'
      );
    }

    const [app] = await this.db
      .select()
      .from(jobApplications)
      .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
      .limit(1);

    if (!app) {
      throw new NotFoundError(
        `Application ${applicationId} not found in tenant ${tenantId}.`,
        'APPLICATION_NOT_FOUND'
      );
    }

    const sm = new JobApplicationWorkflowStateMachine(app.status || 'PREPARED');
    const newState = sm.transition(targetState, { authorizedSubmissionExecuted, reason });

    const appliedAt =
      (newState === 'SUBMITTED' || newState === 'APPLIED') && authorizedSubmissionExecuted
        ? new Date()
        : null;

    const [updated] = await this.db
      .update(jobApplications)
      .set({
        status: newState,
        appliedAt,
        updatedAt: new Date(),
        metadata: {
          ...(app.metadata || {}),
          workflowStateHistory: sm.history,
          lastWorkflowTransition: {
            from: app.status,
            to: newState,
            reason,
            timestamp: new Date().toISOString(),
          },
        },
      })
      .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
      .returning();

    if (this.mcpAuditService) {
      await this.mcpAuditService.logEvent({
        tenantId,
        userId: userId || app.userId,
        eventType: 'application.state_transition',
        resourceType: 'job_application',
        resourceId: applicationId,
        clientIp: '127.0.0.1',
        metadata: {
          fromState: app.status,
          toState: newState,
          authorizedSubmissionExecuted,
          reason,
        },
      });
    }

    return updated;
  }
}
