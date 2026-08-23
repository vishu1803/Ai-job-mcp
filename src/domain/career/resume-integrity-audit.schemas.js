/**
 * @file Canonical Domain Zod Schemas for Resume Integrity Audit Tool (P6-005)
 *
 * Implements the domain contracts approved in P6-005A (ARCH-021 / ADR-041):
 * - IntegrityAuditStatusEnum (PASS, WARN, BLOCK)
 * - IntegrityAuditSeverityEnum (INFO, WARN, BLOCK)
 * - ClaimTypeEnum (SKILL, METRIC, EXPERIENCE, TENURE, EMPLOYER, EDUCATION, ACHIEVEMENT, PROJECT, DOMAIN, OTHER)
 * - ContentDriftEnum (NONE, WORDING_ONLY, SEMANTIC_CHANGE, FACTUAL_CHANGE)
 * - AuditInputFormatEnum (STRUCTURED_RESUME, JSON_RESUME, MARKDOWN, PLAIN_TEXT, UNSUPPORTED)
 * - IntegrityAuditReasonCodeEnum
 * - IntegrityAuditFindingSchema
 * - ClaimAuditSchema
 * - EvidenceCoverageSchema
 * - ResumeIntegrityAuditStatisticsSchema
 * - ResumeIntegrityAuditSchema
 */

import { z } from 'zod';
import { DateOrIsoStringSchema } from '../candidate/candidate.schemas.js';
import { EvidenceRefSchema } from './evidence-matching.schemas.js';
import { CareerAssertionStatusEnum } from './integrity-gate.schemas.js';

// ---------------------------------------------------------------------------
// 1. Enumerations
// ---------------------------------------------------------------------------

export const IntegrityAuditStatusEnum = z.enum(['PASS', 'WARN', 'BLOCK']);

export const IntegrityAuditSeverityEnum = z.enum(['INFO', 'WARN', 'BLOCK']);

export const ClaimTypeEnum = z.enum([
  'SKILL',
  'METRIC',
  'EXPERIENCE',
  'TENURE',
  'EMPLOYER',
  'EDUCATION',
  'ACHIEVEMENT',
  'PROJECT',
  'DOMAIN',
  'OTHER',
]);

export const ContentDriftEnum = z.enum([
  'NONE',
  'WORDING_ONLY',
  'SEMANTIC_CHANGE',
  'FACTUAL_CHANGE',
]);

export const AuditInputFormatEnum = z.enum([
  'STRUCTURED_RESUME',
  'JSON_RESUME',
  'MARKDOWN',
  'PLAIN_TEXT',
  'UNSUPPORTED',
]);

export const IntegrityAuditReasonCodeEnum = z.enum([
  'VALID_EVIDENCE',
  'VALID_INFERENCE',
  'LABELED_USER_CLAIM',
  'MISSING_EVIDENCE',
  'INVALID_EVIDENCE_ID',
  'TENANT_MISMATCH',
  'CANDIDATE_MISMATCH',
  'RESOURCE_MISMATCH',
  'PROJECT_MISMATCH',
  'PROVENANCE_MISMATCH',
  'UNSUPPORTED_SKILL',
  'UNSUPPORTED_METRIC',
  'UNSUPPORTED_ACHIEVEMENT',
  'UNSUPPORTED_EMPLOYER',
  'UNSUPPORTED_DATE',
  'UNSUPPORTED_TENURE',
  'UNSUPPORTED_EDUCATION',
  'CONTRADICTORY_FACT',
  'FABRICATED_CITATION',
  'STATUS_INFLATION',
  'CONTENT_DRIFT',
]);

// ---------------------------------------------------------------------------
// 2. Audit Finding & Claim Models
// ---------------------------------------------------------------------------

export const AuditLocationSchema = z
  .object({
    section: z.string().trim().min(1).max(255),
    itemIndex: z.number().int().nonnegative().optional(),
    lineNumber: z.number().int().positive().optional(),
    field: z.string().trim().optional(),
  })
  .strict();

export const IntegrityAuditFindingSchema = z
  .object({
    findingId: z.string().uuid({ message: 'Finding ID must be a valid UUID' }),
    code: IntegrityAuditReasonCodeEnum,
    severity: IntegrityAuditSeverityEnum,
    message: z.string().trim().min(1).max(1000),
    claimText: z.string().trim().min(1).max(1000),
    claimType: ClaimTypeEnum,
    location: AuditLocationSchema,
    assertionId: z.string().uuid().nullable().optional(),
    evidenceRefs: z.array(EvidenceRefSchema).default([]),
    remediation: z.string().trim().min(1).max(1000),
  })
  .strict();

export const ClaimAuditSchema = z
  .object({
    claimId: z.string().uuid({ message: 'Claim ID must be a valid UUID' }),
    claimText: z.string().trim().min(1).max(1000),
    claimType: ClaimTypeEnum,
    status: CareerAssertionStatusEnum,
    canonicalSlug: z.string().trim().nullable().optional(),
    location: AuditLocationSchema,
    assertionId: z.string().uuid().nullable().optional(),
    evidenceRefs: z.array(EvidenceRefSchema).default([]),
    isGrounded: z.boolean(),
    isContradiction: z.boolean().default(false),
    isStatusInflated: z.boolean().default(false),
  })
  .strict();

// ---------------------------------------------------------------------------
// 3. Evidence Coverage & Statistics Schemas
// ---------------------------------------------------------------------------

export const EvidenceCoverageSchema = z
  .object({
    totalClaims: z.number().int().nonnegative(),
    groundedClaims: z.number().int().nonnegative(),
    inferredClaims: z.number().int().nonnegative(),
    claimedClaims: z.number().int().nonnegative(),
    unsupportedClaims: z.number().int().nonnegative(),
    coveragePercentage: z.number().min(0).max(100),
  })
  .strict();

export const ResumeIntegrityAuditStatisticsSchema = z
  .object({
    totalClaimsAudited: z.number().int().nonnegative(),
    verifiedCount: z.number().int().nonnegative(),
    inferredCount: z.number().int().nonnegative(),
    claimedCount: z.number().int().nonnegative(),
    unsupportedCount: z.number().int().nonnegative(),
    metricClaimsCount: z.number().int().nonnegative(),
    blockedFindingsCount: z.number().int().nonnegative(),
    warnFindingsCount: z.number().int().nonnegative(),
    infoFindingsCount: z.number().int().nonnegative(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 4. Root Resume Integrity Audit Envelope
// ---------------------------------------------------------------------------

export const ResumeIntegrityAuditSchema = z
  .object({
    auditId: z.string().uuid({ message: 'Audit ID must be a valid UUID' }),
    tenantId: z.string().uuid({ message: 'Tenant ID must be a valid UUID' }),
    candidateId: z.string().uuid({ message: 'Candidate ID must be a valid UUID' }),
    artifactType: z.literal('RESUME').default('RESUME'),
    inputFormat: AuditInputFormatEnum,
    overallStatus: IntegrityAuditStatusEnum,
    contentDrift: ContentDriftEnum.default('NONE'),
    evidenceCoverage: EvidenceCoverageSchema,
    statistics: ResumeIntegrityAuditStatisticsSchema,
    findings: z.array(IntegrityAuditFindingSchema).default([]),
    claims: z.array(ClaimAuditSchema).default([]),
    integrityVersion: z.string().default('v1.0.0'),
    auditedAt: DateOrIsoStringSchema,
  })
  .strict();
