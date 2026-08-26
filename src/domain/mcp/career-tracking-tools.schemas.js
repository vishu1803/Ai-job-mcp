/**
 * @file Schema Definitions for MCP Application Tracking Tools (Phase 12 / P12-003 / ARCH-044)
 *
 * Implements strict Zod validation contracts for the 7 job application tracking MCP tools:
 * 1. track_job_application (career:write / MEMBER)
 * 2. update_application_status (career:write / MEMBER)
 * 3. add_application_stage (career:write / MEMBER)
 * 4. update_application_stage_outcome (career:write / MEMBER)
 * 5. attach_application_document (career:write / MEMBER)
 * 6. get_job_application (career:read / READONLY)
 * 7. list_active_applications (career:read / READONLY)
 *
 * Enforces output budget constraints, advisory annotations, and safe response envelopes.
 */

import { z } from 'zod';
import { McpRoleEnum } from './mcp.schemas.js';

// =============================================================================
// Output Budget & Pagination Constants
// =============================================================================

export const MAX_GET_APPLICATION_BYTES = 25600; // 25 KB
export const MAX_LIST_APPLICATIONS_BYTES = 15360; // 15 KB
export const MAX_RAW_JD_CHARS_IN_GET = 2000;
export const MAX_TRACKING_PAGE_SIZE = 50;
export const DEFAULT_TRACKING_PAGE_SIZE = 10;
export const MAX_STAGES_PER_GET = 20;
export const MAX_DOCUMENTS_PER_GET = 10;

// =============================================================================
// Enums
// =============================================================================

export const ApplicationStatusEnum = z.enum([
  'SAVED',
  'APPLIED',
  'SCREENING',
  'INTERVIEWING',
  'OFFER_RECEIVED',
  'OFFER_ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'ARCHIVED',
]);

export const ActiveApplicationStatusEnum = z.enum([
  'SAVED',
  'APPLIED',
  'SCREENING',
  'INTERVIEWING',
  'OFFER_RECEIVED',
]);

export const StageTypeEnum = z.enum([
  'DISCOVERY',
  'RESUME_SUBMITTED',
  'RECRUITER_SCREEN',
  'TECHNICAL_ASSESSMENT',
  'SYSTEM_DESIGN',
  'BEHAVIORAL',
  'ONSITE_LOOP',
  'OFFER_NEGOTIATION',
  'POST_OFFER',
  'OTHER',
]);

export const StageOutcomeEnum = z.enum(['PENDING', 'PASSED', 'FAILED', 'SKIPPED', 'RESCHEDULED']);

export const TailoredDocumentTypeEnum = z.enum([
  'TAILORED_RESUME',
  'TAILORED_COVER_LETTER',
  'PORTFOLIO_RECOMMENDATION',
  'CUSTOM_NOTE',
]);

export const ApplicationSourceEnum = z.enum([
  'LINKEDIN',
  'INDEED',
  'COMPANY_CAREERS',
  'REFERRAL',
  'RECRUITER',
  'MANUAL',
  'OTHER',
]);

export const WorkplaceTypeEnum = z.enum(['REMOTE', 'HYBRID', 'ON_SITE']);

export const EmploymentTypeEnum = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP']);

// =============================================================================
// Advisory Tool Annotations (MCP 2026-07-28 Standard)
// =============================================================================

export const CAREER_TRACKING_TOOL_ANNOTATIONS = Object.freeze({
  track_job_application: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  update_application_status: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  add_application_stage: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  update_application_stage_outcome: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  attach_application_document: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  get_job_application: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  list_active_applications: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
});

export const CAREER_TRACKING_TOOL_COST_METADATA = Object.freeze({
  track_job_application: {
    estimatedCost: 'medium',
    expectedLatencyMs: 45,
    externalApiCalls: 0,
    maximumOutputBytes: 4096,
  },
  update_application_status: {
    estimatedCost: 'low',
    expectedLatencyMs: 30,
    externalApiCalls: 0,
    maximumOutputBytes: 4096,
  },
  add_application_stage: {
    estimatedCost: 'low',
    expectedLatencyMs: 30,
    externalApiCalls: 0,
    maximumOutputBytes: 4096,
  },
  update_application_stage_outcome: {
    estimatedCost: 'low',
    expectedLatencyMs: 30,
    externalApiCalls: 0,
    maximumOutputBytes: 4096,
  },
  attach_application_document: {
    estimatedCost: 'medium',
    expectedLatencyMs: 50,
    externalApiCalls: 0,
    maximumOutputBytes: 4096,
  },
  get_job_application: {
    estimatedCost: 'low',
    expectedLatencyMs: 35,
    externalApiCalls: 0,
    maximumOutputBytes: MAX_GET_APPLICATION_BYTES,
  },
  list_active_applications: {
    estimatedCost: 'low',
    expectedLatencyMs: 25,
    externalApiCalls: 0,
    maximumOutputBytes: MAX_LIST_APPLICATIONS_BYTES,
  },
});

// =============================================================================
// 1. track_job_application Schemas
// =============================================================================

export const TrackJobApplicationInputSchema = z
  .object({
    candidateId: z
      .string()
      .uuid('candidateId must be a valid UUIDv4')
      .optional()
      .describe('Optional candidate UUID. If omitted, defaults to authenticated user candidate.'),
    companyName: z
      .string()
      .min(1, 'companyName is required')
      .max(200, 'companyName must be at most 200 characters')
      .describe('Name of the hiring company or organization.'),
    jobTitle: z
      .string()
      .min(1, 'jobTitle is required')
      .max(200, 'jobTitle must be at most 200 characters')
      .describe('Target role or job position title.'),
    jobUrl: z
      .string()
      .url('jobUrl must be a valid URL')
      .max(2048, 'jobUrl must be at most 2048 characters')
      .optional()
      .nullable()
      .describe('Direct link to job posting or careers page.'),
    source: ApplicationSourceEnum.default('MANUAL').describe('Origin of the job lead.'),
    location: z
      .string()
      .max(200, 'location must be at most 200 characters')
      .optional()
      .nullable()
      .describe('Geographical job location (e.g. San Francisco, CA).'),
    workplaceType: WorkplaceTypeEnum.optional()
      .nullable()
      .describe('Work arrangement: REMOTE, HYBRID, or ON_SITE.'),
    employmentType: EmploymentTypeEnum.optional()
      .nullable()
      .describe('Employment terms: FULL_TIME, PART_TIME, CONTRACT, or INTERNSHIP.'),
    rawJobDescription: z
      .string()
      .max(20000, 'rawJobDescription must be at most 20,000 characters')
      .optional()
      .nullable()
      .describe('Full job description text for historical snapshotting.'),
    compensation: z
      .object({
        currency: z.string().length(3).default('USD'),
        minSalary: z.number().nonnegative().optional().nullable(),
        maxSalary: z.number().nonnegative().optional().nullable(),
        targetSalary: z.number().nonnegative().optional().nullable(),
        equity: z.string().max(100).optional().nullable(),
        period: z.enum(['YEARLY', 'MONTHLY', 'HOURLY']).default('YEARLY'),
      })
      .default({})
      .describe('Expected or posted compensation range.'),
    notes: z
      .string()
      .max(5000, 'notes must be at most 5,000 characters')
      .optional()
      .nullable()
      .describe('Candidate private notes regarding the opportunity.'),
    status: z
      .enum(['SAVED', 'APPLIED'])
      .default('SAVED')
      .describe('Initial application state. Default is SAVED.'),
  })
  .strict();

export const TrackJobApplicationOutputSchema = z.object({
  application: z.object({
    id: z.string().uuid(),
    candidateId: z.string().uuid(),
    companyName: z.string(),
    jobTitle: z.string(),
    status: ApplicationStatusEnum,
    appliedAt: z.string().nullable().optional(),
    source: ApplicationSourceEnum,
    location: z.string().nullable().optional(),
    workplaceType: WorkplaceTypeEnum.nullable().optional(),
    employmentType: EmploymentTypeEnum.nullable().optional(),
    createdAt: z.string(),
  }),
  message: z.string(),
  _meta: z.record(z.unknown()).optional(),
});

// =============================================================================
// 2. update_application_status Schemas
// =============================================================================

export const UpdateApplicationStatusInputSchema = z
  .object({
    applicationId: z.string().uuid('applicationId must be a valid UUIDv4'),
    status: ApplicationStatusEnum.describe('Target lifecycle status for the application.'),
    reason: z
      .string()
      .max(500, 'reason must be at most 500 characters')
      .optional()
      .nullable()
      .describe('Optional reason or context for the status update.'),
  })
  .strict();

export const UpdateApplicationStatusOutputSchema = z.object({
  application: z.object({
    id: z.string().uuid(),
    companyName: z.string(),
    jobTitle: z.string(),
    status: ApplicationStatusEnum,
    appliedAt: z.string().nullable().optional(),
    closedAt: z.string().nullable().optional(),
    updatedAt: z.string(),
  }),
  message: z.string(),
  _meta: z.record(z.unknown()).optional(),
});

// =============================================================================
// 3. add_application_stage Schemas
// =============================================================================

export const AddApplicationStageInputSchema = z
  .object({
    applicationId: z.string().uuid('applicationId must be a valid UUIDv4'),
    stageType: StageTypeEnum.describe('Category of the interview or screening stage.'),
    title: z
      .string()
      .min(1, 'title is required')
      .max(200, 'title must be at most 200 characters')
      .describe('Descriptive title for the stage (e.g. Recruiter Phone Screen, System Design).'),
    scheduledAt: z
      .string()
      .datetime({ offset: true })
      .optional()
      .nullable()
      .describe('ISO 8601 timestamp for scheduled interview date/time.'),
    interviewerNames: z
      .array(z.string().max(100))
      .max(10, 'At most 10 interviewers allowed')
      .default([])
      .describe('List of interviewer names or titles.'),
  })
  .strict();

export const AddApplicationStageOutputSchema = z.object({
  stage: z.object({
    id: z.string().uuid(),
    applicationId: z.string().uuid(),
    stageType: StageTypeEnum,
    title: z.string(),
    orderIndex: z.number().int().nonnegative(),
    outcome: StageOutcomeEnum,
    scheduledAt: z.string().nullable().optional(),
    createdAt: z.string(),
  }),
  message: z.string(),
  _meta: z.record(z.unknown()).optional(),
});

// =============================================================================
// 4. update_application_stage_outcome Schemas
// =============================================================================

export const UpdateApplicationStageOutcomeInputSchema = z
  .object({
    stageId: z.string().uuid('stageId must be a valid UUIDv4'),
    outcome: StageOutcomeEnum.describe(
      'Outcome of the stage: PENDING, PASSED, FAILED, SKIPPED, RESCHEDULED.'
    ),
    feedback: z
      .string()
      .max(5000, 'feedback must be at most 5,000 characters')
      .optional()
      .nullable()
      .describe('Candidate reflection, interview feedback notes, or questions asked.'),
    rescheduledAt: z
      .string()
      .datetime({ offset: true })
      .optional()
      .nullable()
      .describe('New ISO 8601 scheduled timestamp if stage outcome is RESCHEDULED.'),
  })
  .strict();

export const UpdateApplicationStageOutcomeOutputSchema = z.object({
  stage: z.object({
    id: z.string().uuid(),
    applicationId: z.string().uuid(),
    stageType: StageTypeEnum,
    title: z.string(),
    orderIndex: z.number().int().nonnegative(),
    outcome: StageOutcomeEnum,
    completedAt: z.string().nullable().optional(),
    scheduledAt: z.string().nullable().optional(),
    hasFeedback: z.boolean(),
    updatedAt: z.string(),
  }),
  message: z.string(),
  _meta: z.record(z.unknown()).optional(),
});

// =============================================================================
// 5. attach_application_document Schemas
// =============================================================================

export const AttachApplicationDocumentInputSchema = z
  .object({
    applicationId: z.string().uuid('applicationId must be a valid UUIDv4'),
    candidateId: z
      .string()
      .uuid('candidateId must be a valid UUIDv4')
      .optional()
      .describe('Optional candidate UUID. If omitted, resolved from application context.'),
    documentType: TailoredDocumentTypeEnum.describe('Type of artifact attached.'),
    title: z
      .string()
      .min(1, 'title is required')
      .max(200, 'title must be at most 200 characters')
      .describe('Artifact title (e.g. Tailored Resume for Stripe).'),
    content: z.record(z.unknown()).describe('Structured JSON document payload.'),
    renderedMarkdown: z
      .string()
      .max(50000, 'renderedMarkdown must be at most 50,000 characters')
      .optional()
      .nullable(),
    renderedPlainText: z
      .string()
      .max(50000, 'renderedPlainText must be at most 50,000 characters')
      .optional()
      .nullable(),
    citationRefs: z
      .array(
        z.object({
          evidenceId: z.string().uuid().optional(),
          filePath: z.string().optional(),
          commitSha: z.string().optional(),
          lineRange: z
            .object({
              start: z.number().optional(),
              end: z.number().optional(),
            })
            .optional(),
        })
      )
      .default([]),
    integrityScore: z.number().min(0.0).max(1.0).optional().nullable(),
    atsFitScore: z.number().min(0.0).max(100.0).optional().nullable(),
    metadata: z.record(z.unknown()).default({}),
  })
  .strict();

export const AttachApplicationDocumentOutputSchema = z.object({
  document: z.object({
    id: z.string().uuid(),
    applicationId: z.string().uuid(),
    candidateId: z.string().uuid(),
    documentType: TailoredDocumentTypeEnum,
    version: z.number().int().positive(),
    contentHash: z.string().length(64),
    citationRefsCount: z.number().int().nonnegative(),
    integrityScore: z.number().nullable().optional(),
    atsFitScore: z.number().nullable().optional(),
    createdAt: z.string(),
  }),
  message: z.string(),
  _meta: z.record(z.unknown()).optional(),
});

// =============================================================================
// 6. get_job_application Schemas
// =============================================================================

export const GetJobApplicationInputSchema = z
  .object({
    applicationId: z.string().uuid('applicationId must be a valid UUIDv4'),
    includeFullJd: z
      .boolean()
      .default(false)
      .describe('Whether to include raw job description text (truncated to 2,000 chars).'),
  })
  .strict();

export const GetJobApplicationOutputSchema = z.object({
  application: z.object({
    id: z.string().uuid(),
    candidateId: z.string().uuid(),
    companyName: z.string(),
    jobTitle: z.string(),
    jobUrl: z.string().nullable().optional(),
    source: ApplicationSourceEnum,
    location: z.string().nullable().optional(),
    workplaceType: WorkplaceTypeEnum.nullable().optional(),
    employmentType: EmploymentTypeEnum.nullable().optional(),
    status: ApplicationStatusEnum,
    appliedAt: z.string().nullable().optional(),
    closedAt: z.string().nullable().optional(),
    compensation: z.record(z.unknown()).optional(),
    notes: z.string().nullable().optional(),
    rawJobDescription: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  stages: z.array(
    z.object({
      id: z.string().uuid(),
      stageType: StageTypeEnum,
      title: z.string(),
      orderIndex: z.number().int().nonnegative(),
      outcome: StageOutcomeEnum,
      scheduledAt: z.string().nullable().optional(),
      completedAt: z.string().nullable().optional(),
      interviewerNames: z.array(z.string()).optional(),
      feedback: z.string().nullable().optional(),
      createdAt: z.string(),
    })
  ),
  tailoredDocuments: z.array(
    z.object({
      id: z.string().uuid(),
      documentType: TailoredDocumentTypeEnum,
      version: z.number().int().positive(),
      title: z.string(),
      contentHash: z.string().length(64),
      citationRefsCount: z.number().int().nonnegative(),
      integrityScore: z.number().nullable().optional(),
      atsFitScore: z.number().nullable().optional(),
      createdAt: z.string(),
    })
  ),
  _meta: z.record(z.unknown()).optional(),
});

// =============================================================================
// 7. list_active_applications Schemas
// =============================================================================

export const ListActiveApplicationsInputSchema = z
  .object({
    candidateId: z
      .string()
      .uuid('candidateId must be a valid UUIDv4')
      .optional()
      .describe('Optional candidate UUID. If omitted, resolved from authenticated context.'),
    status: z
      .union([ApplicationStatusEnum, z.array(ApplicationStatusEnum)])
      .optional()
      .describe('Filter by specific status or list of statuses. Default is active funnel.'),
    companyName: z
      .string()
      .max(100, 'companyName filter must be at most 100 characters')
      .optional()
      .describe('Filter applications by company name substring.'),
    source: ApplicationSourceEnum.optional().describe('Filter by application origin.'),
    workplaceType: WorkplaceTypeEnum.optional().describe('Filter by workplace type.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_TRACKING_PAGE_SIZE)
      .default(DEFAULT_TRACKING_PAGE_SIZE)
      .describe('Maximum number of applications to return (1-50, default 10).'),
    offset: z.number().int().nonnegative().default(0).describe('Pagination offset.'),
  })
  .strict();

export const ListActiveApplicationsOutputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      companyName: z.string(),
      jobTitle: z.string(),
      status: ApplicationStatusEnum,
      source: ApplicationSourceEnum,
      workplaceType: WorkplaceTypeEnum.nullable().optional(),
      location: z.string().nullable().optional(),
      appliedAt: z.string().nullable().optional(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
  ),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  _meta: z.record(z.unknown()).optional(),
});

// =============================================================================
// Master Tool Definitions Registry
// =============================================================================

export const CAREER_TRACKING_TOOL_DEFINITIONS = Object.freeze({
  track_job_application: {
    name: 'track_job_application',
    description:
      'Creates and tracks a new job application aggregate with target company, title, workplace type, and JD snapshot.',
    inputSchema: TrackJobApplicationInputSchema,
    outputSchema: TrackJobApplicationOutputSchema,
    requiredRole: McpRoleEnum.enum.MEMBER,
    requiredScopes: ['career:write'],
    annotations: CAREER_TRACKING_TOOL_ANNOTATIONS.track_job_application,
  },
  update_application_status: {
    name: 'update_application_status',
    description:
      'Updates the lifecycle status of a tracked job application with strict state machine validation.',
    inputSchema: UpdateApplicationStatusInputSchema,
    outputSchema: UpdateApplicationStatusOutputSchema,
    requiredRole: McpRoleEnum.enum.MEMBER,
    requiredScopes: ['career:write'],
    annotations: CAREER_TRACKING_TOOL_ANNOTATIONS.update_application_status,
  },
  add_application_stage: {
    name: 'add_application_stage',
    description:
      'Appends a chronological interview or screening stage event to a job application with server-controlled ordering.',
    inputSchema: AddApplicationStageInputSchema,
    outputSchema: AddApplicationStageOutputSchema,
    requiredRole: McpRoleEnum.enum.MEMBER,
    requiredScopes: ['career:write'],
    annotations: CAREER_TRACKING_TOOL_ANNOTATIONS.add_application_stage,
  },
  update_application_stage_outcome: {
    name: 'update_application_stage_outcome',
    description:
      'Updates the outcome and feedback for an interview stage (e.g. PASSED, FAILED, RESCHEDULED).',
    inputSchema: UpdateApplicationStageOutcomeInputSchema,
    outputSchema: UpdateApplicationStageOutcomeOutputSchema,
    requiredRole: McpRoleEnum.enum.MEMBER,
    requiredScopes: ['career:write'],
    annotations: CAREER_TRACKING_TOOL_ANNOTATIONS.update_application_stage_outcome,
  },
  attach_application_document: {
    name: 'attach_application_document',
    description:
      'Attaches an immutable tailored artifact snapshot (resume, cover letter) with server-computed SHA-256 hash.',
    inputSchema: AttachApplicationDocumentInputSchema,
    outputSchema: AttachApplicationDocumentOutputSchema,
    requiredRole: McpRoleEnum.enum.MEMBER,
    requiredScopes: ['career:write'],
    annotations: CAREER_TRACKING_TOOL_ANNOTATIONS.attach_application_document,
  },
  get_job_application: {
    name: 'get_job_application',
    description:
      'Retrieves complete job application details, chronological interview stages, and tailored document summaries.',
    inputSchema: GetJobApplicationInputSchema,
    outputSchema: GetJobApplicationOutputSchema,
    requiredRole: McpRoleEnum.enum.READONLY,
    requiredScopes: ['career:read'],
    annotations: CAREER_TRACKING_TOOL_ANNOTATIONS.get_job_application,
  },
  list_active_applications: {
    name: 'list_active_applications',
    description:
      'Lists active tracked job applications for the candidate with status filtering and bounded pagination.',
    inputSchema: ListActiveApplicationsInputSchema,
    outputSchema: ListActiveApplicationsOutputSchema,
    requiredRole: McpRoleEnum.enum.READONLY,
    requiredScopes: ['career:read'],
    annotations: CAREER_TRACKING_TOOL_ANNOTATIONS.list_active_applications,
  },
});
