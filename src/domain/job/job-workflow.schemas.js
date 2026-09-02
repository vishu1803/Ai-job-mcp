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

export const TruthCategoryEnum = z.enum(['VERIFIED', 'CLAIMED', 'USER_PROVIDED', 'INFERRED']);

export const ApplicationSkillItemSchema = z.object({
  name: z.string(),
  truthCategory: TruthCategoryEnum,
  evidenceId: z.string().uuid().optional(),
  repositoryName: z.string().optional(),
  filePath: z.string().optional(),
  notes: z.string().optional(),
});

export const ApplicationPackageSchema = z.object({
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
  }),
  coverLetter: z.object({
    documentId: z.string().optional(),
    title: z.string(),
    markdownContent: z.string(),
    contentHash: z.string(),
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
  answers: z.record(z.string(), z.string()).default({}),
  packageHash: z.string(), // SHA-256 of canonical JSON package
  preparedAt: z.string(),
});

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
  isReady: z.boolean(),
  missingFields: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  duplicateWarning: z
    .object({
      existingApplicationId: z.string().uuid(),
      status: z.string(),
      appliedAt: z.string().optional(),
    })
    .optional(),
  portalType: z.enum(['GREENHOUSE', 'LEVER', 'WORKDAY', 'GENERIC_WEB', 'UNSUPPORTED']),
  submissionMethod: z.enum(['API_DIRECT', 'BROWSER_HANDOFF_REQUIRED']),
  validatedAt: z.string(),
});

// -----------------------------------------------------------------------------
// 4. Cryptographic Application Approval Ticket Schemas
// -----------------------------------------------------------------------------

export const ApplicationApprovalTicketStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'CONSUMED',
  'EXPIRED',
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
  clientId: z.string(),
  jobId: z.string(),
  destinationUrl: z.string().url(),
  packageHash: z.string(),
  signature: z.string(),
  status: ApplicationApprovalTicketStatusEnum,
  expiresAt: z.string(),
  createdAt: z.string(),
  consumedAt: z.string().optional(),
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
  'REJECTED_APPROVAL_REQUIRED',
  'FAILED',
]);

export const SubmissionResultSchema = z.object({
  status: SubmissionStatusEnum,
  applicationId: z.string().uuid().optional(),
  externalReference: z.string().optional(),
  destinationUrl: z.string(),
  portalType: z.string(),
  message: z.string(),
  submittedAt: z.string(),
  manualHandoffKit: z
    .object({
      resumeMarkdown: z.string(),
      coverLetterMarkdown: z.string(),
      suggestedAnswers: z.record(z.string(), z.string()),
      directPortalUrl: z.string(),
      checklist: z.array(z.string()),
    })
    .optional(),
});
