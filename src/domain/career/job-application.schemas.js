/**
 * @file Job & Application Tracking Domain Schemas (Phase 12 / ARCH-043 / ADR-064)
 *
 * Strict Zod validation schemas for:
 * 1. ApplicationStatus, StageType, StageOutcome, TailoredDocumentType enums
 * 2. JobApplication entity, input, output, and update schemas
 * 3. ApplicationStage entity, input, and outcome update schemas
 * 4. TailoredDocument snapshot entity and citation schemas
 * 5. Compensation & salary expectation schemas
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// 1. Enums
// ---------------------------------------------------------------------------

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

export const WorkplaceTypeEnum = z.enum(['REMOTE', 'HYBRID', 'ONSITE']);

export const EmploymentTypeEnum = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP']);

export const ApplicationSourceEnum = z.enum([
  'MANUAL',
  'LINKEDIN',
  'INDEED',
  'COMPANY_CAREERS',
  'REFERRAL',
  'RECRUITER',
  'OTHER',
]);

// ---------------------------------------------------------------------------
// 2. Compensation Schema
// ---------------------------------------------------------------------------

export const CompensationSchema = z.object({
  currency: z.string().min(3).max(3).default('USD'),
  minSalary: z.number().nonnegative().optional(),
  maxSalary: z.number().nonnegative().optional(),
  targetSalary: z.number().nonnegative().optional(),
  equity: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// 3. Citation Reference Schema (Document Snapshots)
// ---------------------------------------------------------------------------

export const DocumentCitationRefSchema = z.object({
  evidenceId: z.string().uuid(),
  commitSha: z
    .string()
    .regex(/^[0-9a-fA-F]{40}$/)
    .optional()
    .nullable(),
  filePath: z.string().min(1).max(1000),
  lineRange: z
    .object({
      start: z.number().int().positive(),
      end: z.number().int().positive(),
    })
    .optional()
    .nullable(),
});

// ---------------------------------------------------------------------------
// 4. Job Application Schemas
// ---------------------------------------------------------------------------

export const CreateJobApplicationInputSchema = z.object({
  candidateId: z.string().uuid(),
  companyName: z.string().min(1).max(200),
  jobTitle: z.string().min(1).max(200),
  jobUrl: z.string().url().max(2048).optional().nullable(),
  source: ApplicationSourceEnum.default('MANUAL'),
  location: z.string().max(200).optional().nullable(),
  workplaceType: WorkplaceTypeEnum.optional().nullable(),
  employmentType: EmploymentTypeEnum.optional().nullable(),
  rawJobDescription: z.string().max(102400).optional().nullable(), // 100 KB max
  parsedJobDescription: z.record(z.unknown()).optional().nullable(),
  atsFitSnapshot: z.record(z.unknown()).optional().nullable(),
  status: ApplicationStatusEnum.default('SAVED'),
  appliedAt: z.coerce.date().optional().nullable(),
  compensation: CompensationSchema.default({}),
  notes: z.string().max(10240).optional().nullable(), // 10 KB max
  metadata: z.record(z.unknown()).default({}),
});

export const UpdateJobApplicationInputSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  jobTitle: z.string().min(1).max(200).optional(),
  jobUrl: z.string().url().max(2048).optional().nullable(),
  source: ApplicationSourceEnum.optional(),
  location: z.string().max(200).optional().nullable(),
  workplaceType: WorkplaceTypeEnum.optional().nullable(),
  employmentType: EmploymentTypeEnum.optional().nullable(),
  status: ApplicationStatusEnum.optional(),
  appliedAt: z.coerce.date().optional().nullable(),
  closedAt: z.coerce.date().optional().nullable(),
  compensation: CompensationSchema.optional(),
  notes: z.string().max(10240).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

export const JobApplicationSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  candidateId: z.string().uuid(),
  companyName: z.string().min(1).max(200),
  jobTitle: z.string().min(1).max(200),
  jobUrl: z.string().url().nullable().optional(),
  source: z.string(),
  location: z.string().nullable().optional(),
  workplaceType: z.string().nullable().optional(),
  employmentType: z.string().nullable().optional(),
  rawJobDescription: z.string().nullable().optional(),
  parsedJobDescription: z.record(z.unknown()).nullable().optional(),
  atsFitSnapshot: z.record(z.unknown()).nullable().optional(),
  status: ApplicationStatusEnum,
  appliedAt: z.coerce.date().nullable().optional(),
  closedAt: z.coerce.date().nullable().optional(),
  compensation: z.record(z.unknown()).default({}),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ---------------------------------------------------------------------------
// 5. Application Stage Schemas
// ---------------------------------------------------------------------------

export const CreateApplicationStageInputSchema = z.object({
  stageType: StageTypeEnum,
  title: z.string().min(1).max(200),
  scheduledAt: z.coerce.date().optional().nullable(),
  completedAt: z.coerce.date().optional().nullable(),
  outcome: StageOutcomeEnum.default('PENDING'),
  interviewerNames: z.array(z.string().max(100)).max(20).default([]),
  feedback: z.string().max(10240).optional().nullable(),
  orderIndex: z.number().int().nonnegative().default(0),
  metadata: z.record(z.unknown()).default({}),
});

export const UpdateApplicationStageInputSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  scheduledAt: z.coerce.date().optional().nullable(),
  completedAt: z.coerce.date().optional().nullable(),
  outcome: StageOutcomeEnum.optional(),
  interviewerNames: z.array(z.string().max(100)).max(20).optional(),
  feedback: z.string().max(10240).optional().nullable(),
  orderIndex: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ApplicationStageSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  applicationId: z.string().uuid(),
  stageType: StageTypeEnum,
  title: z.string(),
  scheduledAt: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
  outcome: StageOutcomeEnum,
  interviewerNames: z.array(z.string()).default([]),
  feedback: z.string().nullable().optional(),
  orderIndex: z.number().int(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ---------------------------------------------------------------------------
// 6. Tailored Document Snapshot Schemas
// ---------------------------------------------------------------------------

export const CreateTailoredDocumentInputSchema = z.object({
  candidateId: z.string().uuid(),
  documentType: TailoredDocumentTypeEnum,
  version: z.number().int().positive().default(1),
  title: z.string().min(1).max(200),
  content: z.record(z.unknown()),
  renderedMarkdown: z.string().max(102400).optional().nullable(),
  renderedPlainText: z.string().max(102400).optional().nullable(),
  citationRefs: z.array(DocumentCitationRefSchema).default([]),
  integrityScore: z.number().min(0).max(1).optional().nullable(),
  atsFitScore: z.number().min(0).max(100).optional().nullable(),
  metadata: z.record(z.unknown()).default({}),
});

export const TailoredDocumentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  applicationId: z.string().uuid(),
  candidateId: z.string().uuid(),
  documentType: TailoredDocumentTypeEnum,
  version: z.number().int().positive(),
  title: z.string(),
  content: z.record(z.unknown()),
  renderedMarkdown: z.string().nullable().optional(),
  renderedPlainText: z.string().nullable().optional(),
  contentHash: z.string().length(64),
  citationRefs: z.array(DocumentCitationRefSchema).default([]),
  integrityScore: z.number().nullable().optional(),
  atsFitScore: z.number().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.coerce.date(),
});
