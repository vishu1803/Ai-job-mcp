/**
 * @file Canonical Domain Schemas for PR Diff Preview & Test Execution Reporting (P9-006 / ARCH-036)
 *
 * Implements the domain contracts for the Pre-Confirmation Safety & Verification Layer:
 * 1. TestStatusEnum ('NOT_RUN', 'PLANNED', 'RUNNING', 'PASSED', 'FAILED', 'SKIPPED', 'BLOCKED')
 * 2. VerificationTierEnum ('STATIC_GATE', 'EPHEMERAL_SANDBOX', 'REMOTE_CI')
 * 3. SecurityWarningCodeEnum ('WARN_TESTS_NOT_RUN', 'WARN_DEPENDENCY_ADDED', 'WARN_CONFIG_MODIFIED', 'WARN_LARGE_DIFF', 'WARN_EXPIRATION_IMMINENT', 'WARN_UNVERIFIED_GAP')
 * 4. SecurityWarningSchema
 * 5. DiffPreviewFileSchema
 * 6. TestResultSchema & TestExecutionReportSchema
 * 7. RiskAssessmentSchema
 * 8. ProjectImprovementReviewSchema
 */

import { z } from 'zod';
import { SafePosixFilePathSchema } from '../candidate/candidate.schemas.js';
import { EvidenceRefSchema } from './evidence-matching.schemas.js';
import { VerificationPlanSchema } from './project-improvement.schemas.js';

// ---------------------------------------------------------------------------
// 1. Enums
// ---------------------------------------------------------------------------

export const TestStatusEnum = z.enum([
  'NOT_RUN',
  'PLANNED',
  'RUNNING',
  'PASSED',
  'FAILED',
  'SKIPPED',
  'BLOCKED',
]);

export const VerificationTierEnum = z.enum(['STATIC_GATE', 'EPHEMERAL_SANDBOX', 'REMOTE_CI']);

export const SecurityWarningCodeEnum = z.enum([
  'WARN_TESTS_NOT_RUN',
  'WARN_DEPENDENCY_ADDED',
  'WARN_CONFIG_MODIFIED',
  'WARN_LARGE_DIFF',
  'WARN_EXPIRATION_IMMINENT',
  'WARN_UNVERIFIED_GAP',
]);

export const WarningSeverityEnum = z.enum(['INFO', 'WARNING', 'CRITICAL']);

// ---------------------------------------------------------------------------
// 2. Sub-Schemas
// ---------------------------------------------------------------------------

export const SecurityWarningSchema = z
  .object({
    code: SecurityWarningCodeEnum,
    severity: WarningSeverityEnum,
    message: z.string().trim().min(1).max(500),
    details: z.string().trim().max(1000).optional(),
  })
  .strict();

export const DiffPreviewFileSchema = z
  .object({
    path: SafePosixFilePathSchema,
    changeType: z.enum(['CREATE', 'MODIFY', 'DELETE']),
    additions: z.number().int().nonnegative().default(0),
    deletions: z.number().int().nonnegative().default(0),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/, { message: 'sha256 must be a 64-character lowercase hex string' }),
    diffPreview: z
      .string()
      .max(4000, { message: 'File diff preview cannot exceed 4,000 characters' }),
  })
  .strict();

export const TestResultSchema = z
  .object({
    suite: z.string().trim().min(1).max(100),
    status: TestStatusEnum,
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    testCount: z.number().int().nonnegative().default(0),
    passed: z.number().int().nonnegative().default(0),
    failed: z.number().int().nonnegative().default(0),
    skipped: z.number().int().nonnegative().default(0),
    environment: z.string().trim().max(100).optional(),
    sandboxTier: VerificationTierEnum.optional(),
    errorSummary: z.string().trim().max(1000).optional(),
  })
  .strict();

export const TestExecutionReportSchema = z
  .object({
    status: TestStatusEnum.default('NOT_RUN'),
    executionTier: VerificationTierEnum.default('STATIC_GATE'),
    staticChecksPassed: z.boolean().default(true),
    staticChecksSummary: z
      .string()
      .max(500)
      .default('Syntax, AST, Secret Scrubber, and Path Policy verified clean.'),
    executedSuites: z.array(TestResultSchema).default([]),
    totalTests: z.number().int().nonnegative().default(0),
    passedCount: z.number().int().nonnegative().default(0),
    failedCount: z.number().int().nonnegative().default(0),
    executedAt: z.string().datetime().optional(),
  })
  .strict();

export const RiskAssessmentSchema = z
  .object({
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('LOW'),
    riskFactors: z.array(z.string().trim().max(200)).default([]),
    securityWarnings: z.array(SecurityWarningSchema).default([]),
  })
  .strict();

// ---------------------------------------------------------------------------
// 3. Canonical Review Object Schema
// ---------------------------------------------------------------------------

export const ProjectImprovementReviewSchema = z
  .object({
    proposalId: z.string().uuid({ message: 'proposalId must be a valid UUID' }),
    ticketId: z.string().uuid({ message: 'ticketId must be a valid UUID' }),
    status: z.literal('PENDING_HUMAN_APPROVAL'),
    actionType: z.literal('PROJECT_IMPROVEMENT_PR'),
    title: z.string().trim().min(5).max(256),
    rationale: z.string().trim().min(10).max(2000),
    targetSkill: z.object({
      slug: z.string().trim().min(1).max(64),
      name: z.string().trim().min(1).max(100),
      gapStatus: z.enum([
        'MISSING',
        'PARTIAL',
        'INSUFFICIENT_EVIDENCE',
        'ADJACENT_COVERAGE',
        'UNKNOWN',
      ]),
      confidenceScore: z.number().min(0).max(1),
    }),
    repository: z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(255),
      defaultBranch: z.string().trim().min(1).max(100),
      baseBranch: z.string().trim().min(1).max(100),
      targetBranch: z.string().regex(/^feat\/career-hub-[a-z0-9-]+$/),
      expectedHeadSha: z.string().length(40),
    }),
    patchSummary: z.object({
      fileCount: z.number().int().min(1).max(10),
      additionsCount: z.number().int().nonnegative().default(0),
      deletionsCount: z.number().int().nonnegative().default(0),
      totalDiffLines: z.number().int().min(1).max(500),
      patchFingerprint: z
        .string()
        .regex(/^[a-f0-9]{64}$/, { message: 'patchFingerprint must be a 64-char hex string' }),
      files: z.array(DiffPreviewFileSchema).min(1).max(10),
    }),
    evidenceRefs: z.array(EvidenceRefSchema).max(10).default([]),
    verificationPlan: VerificationPlanSchema,
    testExecutionReport: TestExecutionReportSchema,
    riskAssessment: RiskAssessmentSchema,
    approvalRequirements: z.object({
      requiredRole: z.literal('MEMBER'),
      expiresAt: z.string().datetime(),
      ttlSeconds: z.number().int().positive(),
      confirmationInstructions: z.string(),
    }),
  })
  .strict();
