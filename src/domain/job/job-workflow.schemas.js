/**
 * @file Job Workflow & Application Domain Schemas (P14-004B / ARCH-055).
 *
 * Defines Zod schemas and validation rules for:
 * 1. Provider-neutral Job Search and Normalized Postings
 * 2. Multi-tier Application Packages with Truth Labels (VERIFIED, CLAIMED, USER_PROVIDED)
 * 3. Pre-Submission Application Validation & Duplicate Detection
 * 4. Cryptographic Application Approval Tickets
 * 5. Application Submission Payloads & Status
 */

import { z } from 'zod';
import {
  StructuredResumeDocumentSchema,
  ResumeTailoringPlanSchema,
  EvidenceValidationReceiptSchema,
  RESUME_GENERATION_CONTRACT_VERSION,
  LEGACY_GENERATION_CONTRACT_VERSION,
  DEFAULT_STRUCTURED_RESUME_SCHEMA_VERSION,
} from '../career/resume.schemas.js';

export {
  RESUME_GENERATION_CONTRACT_VERSION,
  LEGACY_GENERATION_CONTRACT_VERSION,
  DEFAULT_STRUCTURED_RESUME_SCHEMA_VERSION,
};

// -----------------------------------------------------------------------------
// 1. Job Discovery & Posting Schemas
// -----------------------------------------------------------------------------

export const WorkplaceTypeEnum = z.enum(['REMOTE', 'HYBRID', 'ON_SITE']);
export const EmploymentTypeEnum = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP']);
export const JobSourceEnum = z.enum([
  'GREENHOUSE',
  'LEVER',
  'REMOTE_OK',
  'STRUCTURED_FEED',
  'MANUAL',
  // P16-001F-5: Indian job-board providers detected by the extension.
  'NAUKRI',
  'IIMJOBS',
  'SHINE',
  'FOUNDIT',
  'TIMESJOBS',
  'HIRECT',
  'CUTSHORT',
  'INSTAHYRE',
]);

export const SearchJobsInputSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(200),
  location: z.string().max(100).optional(),
  remoteOnly: z.boolean().optional().default(false),
  workplaceType: WorkplaceTypeEnum.optional(),
  employmentType: EmploymentTypeEnum.optional(),
  skills: z.array(z.string()).max(20).optional(),
  minSalary: z.number().nonnegative().optional(),
  maxSalary: z.number().positive().optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
});

export const NormalizedJobPostingSchema = z.object({
  id: z.string().min(1, 'id is required'),
  canonicalJobId: z.string().optional().describe('Canonical job identifier'),
  source: JobSourceEnum,
  provider: JobSourceEnum.optional().describe('Provider that supplied the job'),
  externalJobId: z
    .string()
    .optional()
    .describe('Provider-specific external job identifier (e.g. gh-vercel-5430088004)'),
  company: z.string().min(1),
  title: z.string().min(1),
  location: z.string().default('Remote'),
  workplaceType: WorkplaceTypeEnum.default('REMOTE'),
  employmentType: EmploymentTypeEnum.default('FULL_TIME'),
  description: z.string().min(1),
  responsibilities: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  salary: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      currency: z.string().default('USD'),
      period: z.enum(['YEARLY', 'MONTHLY', 'HOURLY']).default('YEARLY'),
    })
    .optional(),
  applicationUrl: z.string().url(),
  directPortalUrl: z.string().optional().describe('Direct portal application URL'),
  sourceUrl: z.string().url().optional(),
  postedAt: z.string().optional(),
  retrievedAt: z.string(),
});

export const GetJobPostingInputSchema = z.object({
  jobId: z.string().min(1, 'jobId is required'),
  source: JobSourceEnum.optional().default('STRUCTURED_FEED'),
  sourceUrl: z.string().url().optional(),
});

// -----------------------------------------------------------------------------
// 2. Truth Labels & Application Package Schemas
// -----------------------------------------------------------------------------

export const TruthCategoryEnum = z.enum([
  'VERIFIED',
  'CORROBORATED',
  'CLAIMED',
  'USER_PROVIDED',
  'INFERRED',
]);

export const ApplicationSkillItemSchema = z.object({
  name: z.string(),
  truthCategory: TruthCategoryEnum,
  evidenceId: z.string().uuid().optional(),
  repositoryName: z.string().optional(),
  filePath: z.string().optional(),
  notes: z.string().optional(),
});

export const ApplicationDocumentArtifactSchema = z
  .object({
    artifactReference: z.string().optional(),
    filename: z.string(),
    mimeType: z.string(),
    fileSizeBytes: z.number().int().positive().optional(),
    contentHash: z.string().length(64).optional(),
    pdfContentHash: z.string().length(64).optional(),
    availabilityStatus: z.enum(['READY', 'BLOCKED']),
    viewUrl: z.string().optional(),
    downloadUrl: z.string().optional(),
    qaScore: z.number().min(0).max(100).optional(),
    qaPassed: z.boolean().optional(),
    resumeQuality: z.record(z.unknown()).optional(),
    layoutDiagnostics: z.record(z.unknown()).optional(),
    generationContractVersion: z.string().optional(),
    structuredResumeSchemaVersion: z.string().nullable().optional(),
  })
  .passthrough();

export const ApplicationPackageSchema = z
  .object({
    candidateId: z.string().uuid(),
    candidateName: z.string(),
    candidateEmail: z.string().email(),
    candidatePhone: z.string().optional(),
    targetJob: NormalizedJobPostingSchema,
    tailoredResume: z.object({
      documentId: z.string().optional(),
      title: z.string(),
      markdownContent: z.string(),
      contentHash: z.string(),
      fitScore: z.number().min(0).max(100),
      selectedProjects: z.array(z.any()).optional(),
      selectedSections: z.array(z.string()).optional(),
      sectionSnapshots: z.record(z.string(), z.any()).optional(),
      artifact: ApplicationDocumentArtifactSchema.optional(),
      structuredResume: StructuredResumeDocumentSchema.optional().nullable(),
      tailoringPlan: ResumeTailoringPlanSchema.optional().nullable(),
      evidenceValidationReceipt: EvidenceValidationReceiptSchema.optional().nullable(),
      generationContractVersion: z.string().optional(),
      structuredResumeSchemaVersion: z.string().nullable().optional(),
    }),
    coverLetter: z.object({
      documentId: z.string().optional(),
      title: z.string(),
      markdownContent: z.string(),
      contentHash: z.string(),
      artifact: ApplicationDocumentArtifactSchema.optional(),
    }),
    verifiedSkills: z.array(ApplicationSkillItemSchema),
    claimedSkills: z.array(ApplicationSkillItemSchema),
    portfolioLinks: z.array(
      z.object({
        projectName: z.string(),
        repositoryUrl: z.string().url().optional(),
        highlights: z.array(z.string()),
      })
    ),
    selectedSections: z.array(z.string()).optional(),
    sectionSnapshots: z.record(z.string(), z.any()).optional(),
    answers: z.record(z.string(), z.any()).default({}),
    packageHash: z.string(), // SHA-256 of canonical JSON package
    preparedAt: z.string(),
    // Application linkage populated by prepare_job_application persistence
    // (P14-005BA). Optional so packages prepared without persistence (or echoed
    // back through validate/submit) remain valid.
    applicationId: z.string().uuid().optional(),
    jobId: z.string().optional(),
    packageVersion: z.number().int().positive().optional(),
    packageStatus: z.string().optional(),
    artifactStatus: z.string().optional(),
    lifecycleAction: z.enum(['CREATED', 'REUSED', 'UPDATED']).optional(),
    resumeQuality: z.record(z.unknown()).optional(),
    layoutDiagnostics: z.record(z.unknown()).optional(),
    documentsStatus: z
      .enum(['DOCUMENTS_READY', 'DOCUMENTS_BLOCKED', 'DOCUMENTS_PENDING'])
      .optional(),
    artifactsReady: z.boolean().optional(),
    artifactFailureReason: z.string().optional(),
    jobFitAnalysis: z.record(z.unknown()).optional(),
    atsFitSnapshot: z.record(z.unknown()).optional(),
    structuredResume: StructuredResumeDocumentSchema.optional().nullable(),
    tailoringPlan: ResumeTailoringPlanSchema.optional().nullable(),
    evidenceValidationReceipt: EvidenceValidationReceiptSchema.optional().nullable(),
    generationContractVersion: z.string().optional(),
    structuredResumeSchemaVersion: z.string().nullable().optional(),
    candidate: z.record(z.unknown()).optional(),
    artifacts: z.record(z.unknown()).optional(),
  })
  .passthrough();

// -----------------------------------------------------------------------------
// 3. Application Validation Schemas
// -----------------------------------------------------------------------------

export const ApplicationValidationStatusEnum = z.enum([
  'READY_TO_APPLY',
  'NEEDS_USER_INPUT',
  'DUPLICATE',
  'UNSUPPORTED_PORTAL',
  'BLOCKED',
]);

export const ValidateJobApplicationInputSchema = z.object({
  applicationPackage: ApplicationPackageSchema,
  destinationUrl: z.string().url().optional(),
});

export const ApplicationValidationResultSchema = z.object({
  status: ApplicationValidationStatusEnum,
  overallStatus: ApplicationValidationStatusEnum.optional(),
  packageHash: z.string().optional(),
  isReady: z.boolean(),
  errors: z.array(z.string()).default([]),
  missingFields: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  duplicateWarning: z
    .object({
      existingApplicationId: z.string().uuid(),
      status: z.string(),
      appliedAt: z.string().optional(),
    })
    .optional(),
  resumeValidation: z
    .object({
      hasMarkdown: z.boolean(),
      hasPdfArtifact: z.boolean(),
      qaScore: z.number().nullable().optional(),
      qaPassed: z.boolean(),
      contentHash: z.string().optional(),
      pdfContentHash: z.string().nullable().optional(),
      issues: z.array(z.string()).default([]),
    })
    .optional(),
  documentValidation: z
    .object({
      documentsStatus: z.string(),
      artifactsReady: z.boolean(),
      coverLetterReady: z.boolean(),
      issues: z.array(z.string()).default([]),
    })
    .optional(),
  jobConsistency: z
    .object({
      isConsistent: z.boolean(),
      targetCompany: z.string(),
      targetTitle: z.string(),
      applicationId: z.string().nullable().optional(),
      packageVersion: z.number().nullable().optional(),
      issues: z.array(z.string()).default([]),
    })
    .optional(),
  provenanceIssues: z
    .object({
      unsubstantiatedSkillsCount: z.number(),
      unsubstantiatedSkills: z.array(z.string()),
      unverifiedProjects: z.array(z.string()),
      issues: z.array(z.string()).default([]),
    })
    .optional(),
  // P16-001F-5: Indian job boards recognized as browser-handoff portals.
  portalType: z.enum([
    'GREENHOUSE',
    'LEVER',
    'WORKDAY',
    'GENERIC_WEB',
    'UNSUPPORTED',
    'NAUKRI',
    'SHINE',
    'FOUNDIT',
    'IIMJOBS',
    'TIMESJOBS',
    'HIRECT',
    'CUTSHORT',
    'INSTAHYRE',
  ]),
  submissionMethod: z.enum(['API_DIRECT', 'BROWSER_HANDOFF_REQUIRED']),
  validatedAt: z.string(),
});

// -----------------------------------------------------------------------------
// 4. Cryptographic Application Approval Ticket Schemas
// -----------------------------------------------------------------------------

export const ApplicationApprovalTicketStatusEnum = z.enum([
  'ISSUED',
  'PENDING',
  'APPROVED',
  'CONSUMED',
  'EXPIRED',
  'REVOKED',
  'REJECTED',
]);

export const RequestApplicationApprovalInputSchema = z.object({
  jobId: z.string().min(1),
  destinationUrl: z.string().url(),
  packageHash: z.string().length(64, 'packageHash must be a valid 64-char SHA-256 hex string'),
  notes: z.string().max(1000).optional(),
});

export const ApplicationApprovalTicketSchema = z.object({
  ticketId: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  candidateId: z.string().uuid(),
  applicationId: z.string().uuid().nullable().optional(),
  clientId: z.string().optional(),
  jobId: z.string(),
  destinationUrl: z.string().url(),
  packageHash: z.string(),
  packageVersion: z.number().int().positive().optional(),
  signature: z.string(),
  status: ApplicationApprovalTicketStatusEnum,
  issuedAt: z.string().optional(),
  expiresAt: z.string(),
  createdAt: z.string(),
  consumedAt: z.string().optional(),
  revokedAt: z.string().optional(),
});

// -----------------------------------------------------------------------------
// 5. Submission Schemas
// -----------------------------------------------------------------------------

export const SubmitJobApplicationInputSchema = z.object({
  approvalTicketId: z.string().uuid('Valid approval ticket UUID is required'),
  packageHash: z.string().length(64, 'packageHash must match the approved package hash'),
  destinationUrl: z.string().url(),
  answers: z.record(z.string(), z.string()).optional().default({}),
});

export const SubmissionStatusEnum = z.enum([
  'SUBMITTED',
  'HANDOFF_READY',
  'READY_FOR_FINAL_REVIEW',
  'REJECTED_APPROVAL_REQUIRED',
  'FAILED',
]);

/**
 * Explicit application workflow states (Phase 9.5).
 */
export const JobApplicationWorkflowStateEnum = z.enum([
  'PREPARED',
  'APPROVAL_PENDING',
  'APPROVED',
  'HANDOFF_READY',
  'READY_FOR_FINAL_REVIEW',
  'SUBMITTED',
  'APPLIED',
  'FAILED',
]);

/**
 * Enforces legal state machine transitions across job application lifecycles.
 * Hard Invariant: READY_FOR_FINAL_REVIEW -> SUBMITTED (or APPLIED) is strictly prohibited
 * unless an authorized submission event was explicitly executed.
 */
export class JobApplicationWorkflowStateMachine {
  constructor(initialState = 'PREPARED') {
    this.currentState = JobApplicationWorkflowStateEnum.parse(initialState);
    this.history = [{ state: this.currentState, timestamp: new Date().toISOString() }];
  }

  get state() {
    return this.currentState;
  }

  transition(targetState, options = {}) {
    const validatedTarget = JobApplicationWorkflowStateEnum.parse(targetState);
    const { authorizedSubmissionExecuted = false, reason = '' } = options;

    // Hard Invariant: NEVER allow automated transition from READY_FOR_FINAL_REVIEW to SUBMITTED or APPLIED
    if (
      this.currentState === 'READY_FOR_FINAL_REVIEW' &&
      (validatedTarget === 'SUBMITTED' || validatedTarget === 'APPLIED')
    ) {
      if (!authorizedSubmissionExecuted) {
        const err = new Error(
          'Automated final submission is disabled. Transition from READY_FOR_FINAL_REVIEW to SUBMITTED/APPLIED requires explicit authorized user execution.'
        );
        err.name = 'ValidationError';
        err.code = 'FORBIDDEN_AUTOMATED_SUBMIT';
        err.statusCode = 400;
        throw err;
      }
    }

    const validTransitions = {
      PREPARED: ['APPROVAL_PENDING', 'HANDOFF_READY', 'FAILED'],
      APPROVAL_PENDING: ['APPROVED', 'FAILED'],
      APPROVED: ['HANDOFF_READY', 'READY_FOR_FINAL_REVIEW', 'FAILED'],
      HANDOFF_READY: ['READY_FOR_FINAL_REVIEW', 'FAILED'],
      READY_FOR_FINAL_REVIEW: ['SUBMITTED', 'APPLIED', 'FAILED', 'HANDOFF_READY'],
      SUBMITTED: [], // Terminal
      APPLIED: [], // Terminal
      FAILED: ['PREPARED'], // Retry
    };

    const allowed = validTransitions[this.currentState] || [];
    if (!allowed.includes(validatedTarget)) {
      const err = new Error(
        `Invalid workflow state transition from "${this.currentState}" to "${validatedTarget}". Allowed: [${allowed.join(', ')}]`
      );
      err.name = 'ValidationError';
      err.code = 'INVALID_STATE_TRANSITION';
      err.statusCode = 400;
      throw err;
    }

    this.currentState = validatedTarget;
    this.history.push({ state: this.currentState, reason, timestamp: new Date().toISOString() });
    return this.currentState;
  }
}

export const SubmissionResultSchema = z.object({
  status: SubmissionStatusEnum,
  applicationId: z.string().uuid().optional(),
  externalReference: z.string().nullable().optional(),
  destinationUrl: z.string(),
  portalType: z.string(),
  message: z.string(),
  submittedAt: z.string().optional(),
  stagedAt: z.string().optional(),
  handoffKit: z.record(z.any()).optional(),
  manualHandoffKit: z
    .object({
      resumeMarkdown: z.string().optional(),
      coverLetterMarkdown: z.string().optional(),
      suggestedAnswers: z.record(z.string(), z.string()).optional(),
      directPortalUrl: z.string().optional(),
      checklist: z.array(z.string()).optional(),
    })
    .passthrough()
    .optional(),
});

// -----------------------------------------------------------------------------
// 6. Action Safety Taxonomy & Application Snapshot (Phase 7)
// -----------------------------------------------------------------------------

export const ActionSafetyLevelEnum = z.enum([
  'READ_ONLY',
  'PREPARE',
  'PREFILL',
  'REVIEW',
  'SUBMIT',
]);

export const FieldProvenanceEnum = z.enum([
  'USER_PROVIDED',
  'VERIFIED_PROFILE',
  'VERIFIED_EVIDENCE',
  'INFERRED',
  'GENERATED',
  'UNKNOWN',
]);

export const SubmissionRetryStateEnum = z.enum([
  'NOT_SENT',
  'SENT_UNKNOWN',
  'CONFIRMED',
  'FAILED',
]);

export const ACTION_TAXONOMY = Object.freeze({
  search_jobs: { level: 'READ_ONLY', requiresApproval: false, mutatesState: false, externalConsequences: false },
  get_job_posting: { level: 'READ_ONLY', requiresApproval: false, mutatesState: false, externalConsequences: false },
  get_candidate_profile: { level: 'READ_ONLY', requiresApproval: false, mutatesState: false, externalConsequences: false },
  analyze_job_fit: { level: 'READ_ONLY', requiresApproval: false, mutatesState: false, externalConsequences: false },
  get_application_package: { level: 'READ_ONLY', requiresApproval: false, mutatesState: false, externalConsequences: false },
  get_application_submission_status: { level: 'READ_ONLY', requiresApproval: false, mutatesState: false, externalConsequences: false },

  prepare_job_application: { level: 'PREPARE', requiresApproval: false, mutatesState: true, externalConsequences: false },
  generate_tailored_resume: { level: 'PREPARE', requiresApproval: false, mutatesState: true, externalConsequences: false },
  draft_cover_letter: { level: 'PREPARE', requiresApproval: false, mutatesState: true, externalConsequences: false },
  'prepare-handoff': { level: 'PREPARE', requiresApproval: false, mutatesState: true, externalConsequences: false },

  'assistant/autofill-plan': { level: 'PREFILL', requiresApproval: false, mutatesState: false, externalConsequences: false },
  autofill_form_fields: { level: 'PREFILL', requiresApproval: false, mutatesState: false, externalConsequences: false },

  create_application_preview: { level: 'REVIEW', requiresApproval: false, mutatesState: false, externalConsequences: false },
  validate_job_application: { level: 'REVIEW', requiresApproval: false, mutatesState: false, externalConsequences: false },

  request_application_approval: { level: 'REVIEW', requiresApproval: true, mutatesState: true, externalConsequences: false },
  submit_job_application: { level: 'SUBMIT', requiresApproval: true, mutatesState: true, externalConsequences: true },
});

export const ApplicationAnswerSchema = z.object({
  question: z.string(),
  answer: z.any().nullable(),
  confidence: z.number().min(0).max(1),
  source: FieldProvenanceEnum,
  evidence: z.string(),
  requiresReview: z.boolean(),
});

export const ApplicationSnapshotSchema = z.object({
  snapshotId: z.string().uuid(),
  applicationId: z.string().uuid().optional(),
  packageHash: z.string(),
  packageVersion: z.number().int().positive().optional(),
  job: z.object({
    id: z.string().optional(),
    canonicalJobId: z.string().optional(),
    company: z.string(),
    title: z.string(),
    targetUrl: z.string(),
  }),
  candidate: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    phone: z.string().nullable().optional(),
  }),
  contactInformation: z.record(z.any()).default({}),
  workAuthorization: z.any().nullable().optional(),
  location: z.string().nullable().optional(),
  resume: z.object({
    contentHash: z.string(),
    markdownContent: z.string(),
    artifactFilename: z.string().optional(),
  }),
  coverLetter: z.object({
    contentHash: z.string(),
    markdownContent: z.string(),
    artifactFilename: z.string().optional(),
  }),
  applicationAnswers: z.record(z.any()).default({}),
  attachments: z.array(z.any()).default([]),
  targetUrl: z.string(),
  createdAt: z.string(),
});
