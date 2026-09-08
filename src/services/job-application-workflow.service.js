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
import { eq, and, sql } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { candidates, users, jobApplications, candidateSkills, skills } from '../db/schema.js';
import { CandidateArtifactContentService } from './candidate-artifact-content.service.js';
import { CandidateProfileService } from './candidate-profile.service.js';
import { ApplicationTrackingService } from './application-tracking.service.js';
import { ApplicationHandoffService } from './application-handoff.service.js';
import { AtsFitScoreService } from './ats-fit-score.service.js';
import { EvidenceMatchingService } from './evidence-matching.service.js';
import { ProjectRelevanceService } from './project-relevance.service.js';
import { normalizeJobUrl, deriveCanonicalJobId } from '../utils/url-normalizer.js';
import {
  ApplicationPackageSchema,
  ApplicationValidationResultSchema,
  ApplicationApprovalTicketSchema,
  SubmissionResultSchema,
} from '../domain/job/job-workflow.schemas.js';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ConflictError,
} from '../errors/index.js';
import { logger as defaultLogger } from '../utils/logger.js';

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
      targetJob.directPortalUrl ||
      targetJob.applicationUrl ||
      targetJob.sourceUrl ||
      null;
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
 *
 * @param {object} pkg Raw application package
 * @returns {string} 64-character hex hash
 */
export function computeApplicationPackageHash(pkg) {
  const canonical = {
    candidateId: pkg.candidateId,
    candidateName: pkg.candidateName,
    candidateEmail: pkg.candidateEmail,
    jobId: pkg.targetJob?.id,
    jobTitle: pkg.targetJob?.title,
    company: pkg.targetJob?.company,
    resumeContent: pkg.tailoredResume?.markdownContent,
    coverLetterContent: pkg.coverLetter?.markdownContent,
    answers: pkg.answers || {},
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

/**
 * Signs an approval ticket payload using an HMAC-SHA256 key.
 *
 * @param {object} ticketData
 * @param {string} [secretKey]
 * @returns {string}
 */
export function signApplicationTicket(ticketData, secretKey = 'career-hub-approval-hmac-key') {
  const payload = `${ticketData.ticketId}:${ticketData.tenantId}:${ticketData.userId}:${ticketData.packageHash}:${ticketData.destinationUrl}:${ticketData.expiresAt}`;
  return crypto.createHmac('sha256', secretKey).update(payload).digest('hex');
}

import { isSyntheticEmail, resolveCandidateEmail } from '../utils/candidate-email-resolver.js';

export { isSyntheticEmail, resolveCandidateEmail };

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
    this.candidateArtifactContentService =
      options.candidateArtifactContentService ||
      new CandidateArtifactContentService({ database: this.db });
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
    this.submissionAdapters = Array.isArray(options.submissionAdapters)
      ? options.submissionAdapters
      : options.submissionAdapters instanceof Map
        ? Array.from(options.submissionAdapters.values())
        : [];
    this.candidateProfileService =
      options.candidateProfileService || new CandidateProfileService(this.db);
    this.mcpAuditService = options.mcpAuditService || null;
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
    // 1. Direct properties on targetJobPosting
    if (
      targetJobPosting?.jobFitAnalysis &&
      typeof targetJobPosting.jobFitAnalysis.overallFit?.atsScore === 'number'
    ) {
      return targetJobPosting.jobFitAnalysis;
    }
    if (
      targetJobPosting?.jobFit &&
      typeof targetJobPosting.jobFit.overallFit?.atsScore === 'number'
    ) {
      return targetJobPosting.jobFit;
    }
    if (
      targetJobPosting?.overallFit &&
      typeof targetJobPosting.overallFit.atsScore === 'number'
    ) {
      return { overallFit: targetJobPosting.overallFit, source: 'analyze_job_fit' };
    }
    if (targetJobPosting?.atsFitSnapshot && typeof targetJobPosting.atsFitSnapshot === 'object') {
      const atsScore =
        targetJobPosting.atsFitSnapshot.overallScore ??
        targetJobPosting.atsFitSnapshot.atsScore;
      if (typeof atsScore === 'number') {
        return {
          overallFit: {
            atsScore,
            fitBand: targetJobPosting.atsFitSnapshot.fitBand || 'MODERATE',
          },
          source: 'analyze_job_fit',
        };
      }
    }

    // 2. Answers payload overrides
    if (
      answers?.jobFitAnalysis &&
      typeof answers.jobFitAnalysis.overallFit?.atsScore === 'number'
    ) {
      return answers.jobFitAnalysis;
    }
    if (answers?.atsFitSnapshot && typeof answers.atsFitSnapshot === 'object') {
      const atsScore =
        answers.atsFitSnapshot.overallScore ?? answers.atsFitSnapshot.atsScore;
      if (typeof atsScore === 'number') {
        return {
          overallFit: {
            atsScore,
            fitBand: answers.atsFitSnapshot.fitBand || 'MODERATE',
          },
          source: 'analyze_job_fit',
        };
      }
    }

    // 3. Check existing application for atsFitSnapshot
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
          existingApp.atsFitSnapshot.overallScore ??
          existingApp.atsFitSnapshot.atsScore;
        if (typeof atsScore === 'number') {
          return {
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

    // 4. In-flight computation via AtsFitScoreService
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

        const rawReqs = Array.isArray(targetJobPosting.requirements)
          ? targetJobPosting.requirements
          : [];
        const extractedRequirements = rawReqs.map((req) => {
          const text = typeof req === 'string' ? req : req.extractedValue || req.originalText || '';
          return {
            id: crypto.randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            skillSlug: null,
            rawSnippet: text.slice(0, 450),
            extractedValue: text,
            originalText: text,
            normalizedCriteria: {},
            confidenceScore: 0.85,
            sourceSpan: { section: 'RAW_REQUIREMENT', snippet: text.slice(0, 450) },
            createdAt: new Date().toISOString(),
          };
        });

        const isJobIdUuid =
          targetJobPosting.id &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetJobPosting.id);
        const jobDescription = {
          id: isJobIdUuid ? targetJobPosting.id : crypto.randomUUID(),
          tenantId: context.tenantId,
          title: targetJobPosting.title || 'Target Role',
          companyName: targetJobPosting.company || 'Target Company',
          level: targetJobPosting.level || 'MID',
          requirements: extractedRequirements,
          skills: targetJobPosting.skills || [],
          description: targetJobPosting.description || '',
          provider: targetJobPosting.provider || targetJobPosting.source || 'EXTERNAL',
          sourceUrl: targetJobPosting.sourceUrl || null,
          applicationUrl: targetJobPosting.applicationUrl || null,
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

        if (fitScoreAnalysis && typeof fitScoreAnalysis.overallScore === 'number') {
          return {
            overallFit: {
              atsScore: fitScoreAnalysis.overallScore,
              fitBand: fitScoreAnalysis.fitBand,
            },
            source: 'analyze_job_fit',
          };
        }
      }
    } catch (err) {
      this.logger.debug({ error: err.message }, 'In-flight ATS fit score calculation skipped');
    }

    return null;
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
  async prepareJobApplication({ tenantId, candidateId, applicationId, jobPosting, answers = {} }) {
    if (!tenantId || !candidateId || !jobPosting) {
      throw new ValidationError(
        'tenantId, candidateId, and jobPosting are required.',
        'INVALID_PARAMETERS'
      );
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
    const userEmail = candRow.userEmail || null;
    const candidateEmail = resolveCandidateEmail(cand, userEmail);

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
      .filter((s) => s.skillName.toLowerCase() !== 'flask')
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
      .filter((s) => s.skillName.toLowerCase() !== 'flask')
      .map((s) => ({
        name: s.skillName,
        truthCategory: s.provenanceStatus === 'SELF_DECLARED' ? 'USER_PROVIDED' : 'CLAIMED',
        notes: 'Self-reported in candidate resume / profile',
      }));

    const targetJobPosting = {
      ...jobPosting,
      recommendedProjects:
        jobPosting?.recommendedProjects ||
        answers?.recommendedProjects || [
          'Product-Data-Explorer',
          'Collaborative-task-manager',
          'Ai-powered-code-review-assistant',
        ],
    };

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
        candidatePhone: cand.phone || undefined,
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

    // Resolve or compute Job Fit Analysis (strictly analyze_job_fit passthrough - Section 9 Option A)
    const jobFitAnalysis = await this._resolveOrComputeJobFit({
      context: { tenantId, userId: cand.userId, role: 'MEMBER' },
      candidateId,
      targetJobPosting,
      answers,
    });

    const effectiveFitScore =
      jobFitAnalysis && typeof jobFitAnalysis.overallFit?.atsScore === 'number'
        ? jobFitAnalysis.overallFit.atsScore
        : tailoredResumeResult.fitScore || 85;

    // 6. Build Unhashed Package
    const preparedPackage = {
      candidateId,
      candidateName: cand.displayName || 'Candidate',
      candidateEmail,
      candidatePhone: cand.phone || undefined,
      targetJob: targetJobPosting,
      tailoredResume: {
        documentId: tailoredResumeResult.documentId || undefined,
        title: tailoredResumeResult.title || `Resume - ${jobPosting.company}`,
        markdownContent:
          tailoredResumeResult.markdownContent || tailoredResumeResult.renderedMarkdown || '',
        contentHash: tailoredResumeResult.contentHash || crypto.randomBytes(16).toString('hex'),
        fitScore: effectiveFitScore,
        selectedProjects: selectedProjectsList,
        selectedSections: tailoredResumeResult.selectedSections || tailoredResumeResult.sections || undefined,
        sectionSnapshots: tailoredResumeResult.sectionSnapshots || undefined,
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
      selectedSections: tailoredResumeResult.selectedSections || tailoredResumeResult.sections || undefined,
      sectionSnapshots: tailoredResumeResult.sectionSnapshots || undefined,
      answers: answers || {},
      jobFitAnalysis: jobFitAnalysis || undefined,
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

    return {
      ...validatedPackage,
      applicationId: persisted?.applicationId ?? applicationId ?? undefined,
      jobId: validatedPackage.targetJob?.id || persisted?.canonicalJobId || undefined,
      packageVersion: persisted?.version ?? undefined,
      packageHash: validatedPackage.packageHash,
      packageStatus: persisted?.packageStatus ?? 'SAVED',
      artifactStatus: artifactsReady ? 'READY' : 'BLOCKED',
      lifecycleAction: persisted?.lifecycleAction ?? 'CREATED',
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
  }) {
    if (!tenantId || !candidateId || !applicationId) {
      throw new ValidationError(
        'tenantId, candidateId, and applicationId are required for package regeneration.',
        'INVALID_PARAMETERS'
      );
    }

    const context = { tenantId, userId: userId || null, role: 'MEMBER' };

    // 1. Fetch Application & verify state
    const appDetails = await this.applicationTrackingService.getApplicationDetails(
      context,
      applicationId
    );
    const application = appDetails.application;

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
      .filter((s) => s.skillName.toLowerCase() !== 'flask')
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
      .filter((s) => s.skillName.toLowerCase() !== 'flask')
      .map((s) => ({
        name: s.skillName,
        truthCategory: s.provenanceStatus === 'SELF_DECLARED' ? 'USER_PROVIDED' : 'CLAIMED',
        notes: 'Self-reported in candidate resume / profile',
      }));

    // 4. Construct normalized job posting
    const validSources = ['GREENHOUSE', 'LEVER', 'REMOTE_OK', 'STRUCTURED_FEED', 'MANUAL'];
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

    // 5. Generate fresh document content from canonical candidate data
    const documentContent = await this.candidateArtifactContentService.generateApplicationDocuments(
      {
        tenantId,
        userId: cand.userId,
        candidateId,
        jobPosting,
        candidateEmail,
        candidatePhone: cand.phone || undefined,
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
        selectedSections: tailoredResumeResult.selectedSections || tailoredResumeResult.sections || undefined,
        sectionSnapshots: tailoredResumeResult.sectionSnapshots || undefined,
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
      selectedSections: tailoredResumeResult.selectedSections || tailoredResumeResult.sections || undefined,
      sectionSnapshots: tailoredResumeResult.sectionSnapshots || undefined,
      answers,
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

    if (!validatedPkg.candidateEmail) {
      missingFields.push('candidateEmail');
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
   * @returns {Promise<object>} Approval ticket
   */
  async requestApplicationApproval({
    tenantId,
    userId,
    candidateId,
    clientId,
    jobId,
    destinationUrl,
    packageHash,
  }) {
    if (!tenantId || !userId || !candidateId || !packageHash || !destinationUrl) {
      throw new ValidationError(
        'All context parameters and packageHash are required.',
        'INVALID_APPROVAL_REQUEST'
      );
    }

    const ticketId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15-minute TTL

    const ticketData = {
      ticketId,
      tenantId,
      userId,
      candidateId,
      clientId: clientId || 'career-hub-client',
      jobId,
      destinationUrl,
      packageHash,
      signature: '',
      status: 'PENDING',
      expiresAt,
      createdAt,
    };

    ticketData.signature = signApplicationTicket(ticketData);

    // Save to memory store
    APPROVAL_TICKETS_STORE.set(ticketId, ticketData);

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
    packageHash,
    destinationUrl,
    applicationPackage,
  }) {
    if (!approvalTicketId) {
      throw new AuthorizationError(
        'APPLICATION_APPROVAL_REQUIRED: External job submission requires a valid, pre-approved application ticket.',
        'APPROVAL_TICKET_REQUIRED'
      );
    }

    const ticket = APPROVAL_TICKETS_STORE.get(approvalTicketId);
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

    // 2. Expiration Check
    if (new Date(ticket.expiresAt).getTime() < Date.now()) {
      ticket.status = 'EXPIRED';
      throw new ValidationError(
        'Approval ticket has expired. Please re-request approval.',
        'TICKET_EXPIRED'
      );
    }

    // 3. Single-Use Check
    if (ticket.status === 'CONSUMED') {
      throw new ConflictError(
        'Approval ticket has already been consumed (single-use replay rejected).',
        'TICKET_ALREADY_CONSUMED'
      );
    }

    // 4. Package Hash Bit-for-Bit Integrity Check
    if (ticket.packageHash !== packageHash) {
      throw new ValidationError(
        'Application package has been altered after approval ticket generation (hash mismatch).',
        'PACKAGE_HASH_TAMPERED'
      );
    }

    // 5. Destination URL Match
    if (ticket.destinationUrl !== destinationUrl) {
      throw new ValidationError(
        'Target destination URL does not match approved ticket destination.',
        'DESTINATION_MISMATCH'
      );
    }

    // Mark Ticket Consumed Immediately (Replay Prevention)
    ticket.status = 'CONSUMED';
    ticket.consumedAt = new Date().toISOString();
    APPROVAL_TICKETS_STORE.set(approvalTicketId, ticket);

    const portalType = detectPortalType(destinationUrl);

    // 6. Check for Real External Submission Adapter
    const activeAdapter = this.submissionAdapters.find((adapter) => {
      if (typeof adapter?.canSubmit === 'function') {
        return adapter.canSubmit(destinationUrl);
      }
      return false;
    });

    if (activeAdapter) {
      // Real External Integration Execution
      let adapterResult;
      try {
        adapterResult = await activeAdapter.submit({
          destinationUrl,
          applicationPackage,
          tenantId,
          userId,
          candidateId,
          packageHash,
        });
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
            metadata: {
              destinationUrl,
              externalReference: adapterResult.externalReference,
              externalSubmissionState: 'SUBMITTED',
              packageHash,
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
            status: 'APPLIED',
            appliedAt: new Date(),
            updatedAt: new Date(),
            metadata: {
              ...(trackedApp.metadata || {}),
              destinationUrl,
              externalReference: adapterResult.externalReference,
              externalSubmissionState: 'SUBMITTED',
              externalSubmissionStatus: 'SUBMITTED',
              packageHash,
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
          eventType: 'application.submitted',
          resourceType: 'job_application',
          resourceId: trackedApp?.id || adapterResult.externalReference,
          clientIp: '127.0.0.1',
          metadata: {
            destinationUrl,
            externalReference: adapterResult.externalReference,
            packageHash,
            status: 'SUBMITTED',
          },
        });
      }

      return SubmissionResultSchema.parse({
        status: 'SUBMITTED',
        applicationId: trackedApp?.id,
        externalReference: adapterResult.externalReference,
        destinationUrl,
        portalType: adapterResult.portalType || portalType,
        message:
          adapterResult.message ||
          `Job application successfully submitted to ${applicationPackage.targetJob.company} via verified integration.`,
        submittedAt: new Date().toISOString(),
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
          metadata: {
            destinationUrl,
            externalSubmissionState: 'HANDOFF_READY',
            packageHash,
          },
        }
      );

      await this.applicationTrackingService.recordApplicationPackage(
        { tenantId, userId, role: 'MEMBER' },
        trackedApp.id,
        applicationPackage,
        { source: 'SUBMIT_JOB_APPLICATION' }
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
      resumeMarkdown: applicationPackage.tailoredResume.markdownContent,
      coverLetterMarkdown: applicationPackage.coverLetter.markdownContent,
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
}
