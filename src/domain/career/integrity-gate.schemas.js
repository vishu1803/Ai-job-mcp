/**
 * @file Canonical Domain Zod Schemas for Zero-Hallucination Career Integrity Gate
 *
 * Implements the domain contracts approved in P5-006A (ARCH-016 / ADR-036):
 * - CareerAssertionTypeEnum
 * - CareerAssertionStatusEnum
 * - IntegrityStatusEnum
 * - AuditReasonCodeEnum
 * - CareerAssertionSchema
 * - IntegrityCheckedAssertionSchema
 * - IntegrityCheckedCareerSummarySchema
 */

import { z } from 'zod';
import {
  ConfidenceScoreSchema,
  SafeSlugSchema,
  DateOrIsoStringSchema,
} from '../candidate/candidate.schemas.js';
import { EvidenceRefSchema } from './evidence-matching.schemas.js';

// ---------------------------------------------------------------------------
// 1. Enumerations
// ---------------------------------------------------------------------------

export const CareerAssertionTypeEnum = z.enum([
  'SKILL',
  'PROJECT',
  'EXPERIENCE',
  'EDUCATION',
  'DOMAIN',
  'LOCATION',
  'ACHIEVEMENT',
  'SUMMARY',
]);

export const CareerAssertionStatusEnum = z.enum([
  'VERIFIED',
  'INFERRED',
  'CLAIMED',
  'MISSING_EVIDENCE',
  'UNKNOWN',
]);

export const IntegrityStatusEnum = z.enum(['PASS', 'PARTIAL', 'BLOCKED']);

export const AuditReasonCodeEnum = z.enum([
  'VALID_EVIDENCE',
  'VALID_INFERENCE',
  'LABELED_USER_CLAIM',
  'MISSING_EVIDENCE',
  'UNKNOWN',
  'UNBACKED_VERIFIED_CLAIM',
  'INVALID_EVIDENCE_ID',
  'TENANT_MISMATCH',
  'CANDIDATE_MISMATCH',
  'RESOURCE_MISMATCH',
  'PROJECT_MISMATCH',
  'PROVENANCE_MISMATCH',
  'UNSUPPORTED_TENURE',
  'UNSUPPORTED_ACHIEVEMENT',
  'FABRICATED_CITATION',
  'TYPE_EVIDENCE_MISMATCH',
  'INVALID_STATUS',
  'INSUFFICIENT_EVIDENCE',
]);

// ---------------------------------------------------------------------------
// 2. Input Career Assertion Schema
// ---------------------------------------------------------------------------

export const CareerAssertionSchema = z
  .object({
    assertionId: z.string().uuid({ message: 'Assertion ID must be a valid UUID' }),
    tenantId: z.string().uuid({ message: 'Tenant ID must be a valid UUID' }),
    candidateId: z.string().uuid({ message: 'Candidate ID must be a valid UUID' }),
    assertionType: CareerAssertionTypeEnum,
    statement: z.string().trim().min(1).max(2000),
    subjectSlug: SafeSlugSchema.nullable().optional(),
    status: CareerAssertionStatusEnum,
    confidenceScore: ConfidenceScoreSchema.default(1.0),
    evidenceRefs: z.array(EvidenceRefSchema).default([]),
    claimLabel: z.string().trim().nullable().optional(),
    childAssertionIds: z.array(z.string().uuid()).default([]),
    metadata: z.record(z.unknown()).default({}),
    createdAt: DateOrIsoStringSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 3. Output Integrity Checked Assertion Schema
// ---------------------------------------------------------------------------

export const IntegrityCheckedAssertionSchema = z
  .object({
    assertionId: z.string().uuid({ message: 'Assertion ID must be a valid UUID' }),
    candidateId: z.string().uuid({ message: 'Candidate ID must be a valid UUID' }),
    assertionType: CareerAssertionTypeEnum,
    statement: z.string().trim().min(1).max(2000),
    subjectSlug: SafeSlugSchema.nullable().optional(),
    status: CareerAssertionStatusEnum,
    confidenceScore: ConfidenceScoreSchema,
    evidenceRefs: z.array(EvidenceRefSchema).max(5).default([]),
    claimLabel: z.string().trim().nullable().optional(),
    auditReasonCode: AuditReasonCodeEnum.default('VALID_EVIDENCE'),
    isAudited: z.boolean().default(true),
    auditMessage: z.string().trim().min(1).max(1000),
  })
  .strict();

// ---------------------------------------------------------------------------
// 4. Output Integrity Checked Career Summary Schema
// ---------------------------------------------------------------------------

export const IntegrityCheckedCareerSummarySchema = z
  .object({
    summaryId: z.string().uuid({ message: 'Summary ID must be a valid UUID' }),
    candidateId: z.string().uuid({ message: 'Candidate ID must be a valid UUID' }),
    tenantId: z.string().uuid({ message: 'Tenant ID must be a valid UUID' }),
    integrityStatus: IntegrityStatusEnum,
    totalAssertions: z.number().int().nonnegative(),
    verifiedCount: z.number().int().nonnegative(),
    inferredCount: z.number().int().nonnegative(),
    claimedCount: z.number().int().nonnegative(),
    missingCount: z.number().int().nonnegative(),
    blockedCount: z.number().int().nonnegative(),
    assertions: z.array(IntegrityCheckedAssertionSchema),
    blockedReasons: z.array(z.string()).default([]),
    evaluatedAt: DateOrIsoStringSchema,
  })
  .strict();
