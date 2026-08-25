/**
 * @file Canonical Domain Zod Schemas for Two-Phase Action Approval Tickets (P9-002 / ARCH-032 / ADR-053)
 *
 * Enforces strict runtime validation for:
 * 1. Approval ticket status lifecycle
 * 2. Cryptographic binding parameters
 * 3. Human approval / rejection / cancellation payloads
 * 4. Execution consumption and result tracking
 */

import { z } from 'zod';
import { DateOrIsoStringSchema } from '../candidate/candidate.schemas.js';

export const UuidSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// 1. Enums
// ---------------------------------------------------------------------------

export const ApprovalTicketStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'EXECUTING',
  'EXECUTED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
]);

export const ApprovalActionTypeEnum = z.enum(['PROJECT_IMPROVEMENT_PR']);

// ---------------------------------------------------------------------------
// 2. Patch Summary Schema
// ---------------------------------------------------------------------------

export const TicketPatchSummarySchema = z
  .object({
    fileCount: z.number().int().min(1).max(10),
    totalDiffLines: z.number().int().min(1).max(500),
    expectedFiles: z.array(z.string().min(1)).min(1).max(10),
  })
  .strict();

// ---------------------------------------------------------------------------
// 3. Execution Result Schema
// ---------------------------------------------------------------------------

export const ExecutionResultSchema = z
  .object({
    prUrl: z.string().url().optional(),
    prNumber: z.number().int().positive().optional(),
    branchName: z.string().min(1).optional(),
    commitSha: z
      .string()
      .regex(/^[a-f0-9]{40}$/i, 'Commit SHA must be 40-char hex')
      .optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 4. Create Approval Ticket Input Schema
// ---------------------------------------------------------------------------

export const CreateApprovalTicketInputSchema = z
  .object({
    candidateProfile: z
      .object({
        id: UuidSchema,
        tenantId: UuidSchema,
        candidate: z
          .object({
            id: UuidSchema,
            tenantId: UuidSchema,
          })
          .passthrough(),
      })
      .passthrough(),
    proposal: z
      .object({
        proposalId: UuidSchema,
        tenantId: UuidSchema,
        candidateId: UuidSchema,
        resourceId: UuidSchema,
        repositoryName: z.string().min(1).max(255),
        targetBranch: z
          .string()
          .regex(/^feat\/career-hub-[a-z0-9-]+$/, 'Branch must match feat/career-hub-*'),
        patch: z.object({
          fileCount: z.number().int().min(1).max(10),
          totalDiffLines: z.number().int().min(1).max(500),
          patchFingerprint: z
            .string()
            .regex(/^[a-f0-9]{64}$/, 'Fingerprint must be 64-char SHA-256 hex'),
          files: z.array(z.object({ path: z.string() }).passthrough()),
        }),
        status: z.enum(['PROPOSED', 'BLOCKED', 'INVALID']),
      })
      .passthrough(),
    expectedHeadSha: z.string().regex(/^[a-f0-9]{40}$/i, 'Expected HEAD SHA must be 40-char hex'),
    baseBranch: z.string().min(1).max(100).default('main'),
  })
  .strict();

// ---------------------------------------------------------------------------
// 5. Canonical Approval Ticket Schema
// ---------------------------------------------------------------------------

export const ApprovalTicketSchema = z
  .object({
    id: UuidSchema,
    tenantId: UuidSchema,
    userId: UuidSchema,
    candidateId: UuidSchema,
    resourceId: UuidSchema,
    proposalId: UuidSchema,
    actionType: ApprovalActionTypeEnum.default('PROJECT_IMPROVEMENT_PR'),
    repositoryName: z.string().min(1).max(255),
    baseBranch: z.string().min(1).max(100),
    targetBranch: z
      .string()
      .regex(/^feat\/career-hub-[a-z0-9-]+$/, 'Branch must match feat/career-hub-*'),
    expectedHeadSha: z.string().regex(/^[a-f0-9]{40}$/i, 'Expected HEAD SHA must be 40-char hex'),
    patchFingerprint: z.string().regex(/^[a-f0-9]{64}$/, 'Fingerprint must be 64-char SHA-256 hex'),
    patchSummary: TicketPatchSummarySchema,
    hmacSignature: z.string().regex(/^[a-f0-9]{64}$/, 'HMAC signature must be 64-char hex'),
    status: ApprovalTicketStatusEnum,
    rejectionReason: z.string().nullable().optional(),
    failureReason: z.string().nullable().optional(),
    approvedByUserId: UuidSchema.nullable().optional(),
    approvedAt: DateOrIsoStringSchema.nullable().optional(),
    consumedAt: DateOrIsoStringSchema.nullable().optional(),
    executedAt: DateOrIsoStringSchema.nullable().optional(),
    idempotencyKey: z.string().nullable().optional(),
    executionResult: ExecutionResultSchema.nullable().optional(),
    createdAt: DateOrIsoStringSchema,
    updatedAt: DateOrIsoStringSchema,
    expiresAt: DateOrIsoStringSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// 6. Action Input Schemas
// ---------------------------------------------------------------------------

export const ApproveTicketInputSchema = z
  .object({
    ticketId: UuidSchema,
  })
  .strict();

export const RejectTicketInputSchema = z
  .object({
    ticketId: UuidSchema,
    rejectionReason: z.string().min(3).max(1000),
  })
  .strict();

export const CancelTicketInputSchema = z
  .object({
    ticketId: UuidSchema,
    reason: z.string().max(1000).optional(),
  })
  .strict();

export const ConsumeTicketInputSchema = z
  .object({
    ticketId: UuidSchema,
    idempotencyKey: z.string().min(8).max(128),
  })
  .strict();

export const CompleteExecutionInputSchema = z
  .object({
    ticketId: UuidSchema,
    executionResult: ExecutionResultSchema,
  })
  .strict();

export const FailExecutionInputSchema = z
  .object({
    ticketId: UuidSchema,
    failureReason: z.string().min(3).max(1000),
  })
  .strict();
