/**
 * @file Canonical Domain Zod Schemas for Evidence Matching & Skill Gap Analysis
 *
 * Implements the domain contracts approved in P5-003A (ARCH-013 / ADR-033):
 * - MatchStatusEnum & MatchRelationshipTypeEnum
 * - EvidenceRefSchema
 * - CandidateRequirementMatchSchema
 * - SkillGapSchema & SkillGapPriorityEnum & SkillGapSeverityEnum
 * - MatchExplanationSchema
 * - CandidateMatchSummarySchema
 * - CandidateMatchAnalysisSchema
 */

import { z } from 'zod';
import {
  ConfidenceScoreSchema,
  SafeSlugSchema,
  SafePosixFilePathSchema,
  GitCommitShaSchema,
  EvidenceLineRangeSchema,
  EvidenceExcerptSchema,
  DateOrIsoStringSchema,
} from '../candidate/candidate.schemas.js';
import { RequirementCategoryEnum, RequirementImportanceEnum } from './job-requirement.schemas.js';

// ---------------------------------------------------------------------------
// 1. Enumerations
// ---------------------------------------------------------------------------

export const MatchStatusEnum = z.enum(['MATCHED', 'PARTIAL', 'MISSING', 'UNKNOWN']);

export const MatchRelationshipTypeEnum = z.enum([
  'EXACT',
  'BUILT_ON',
  'ECOSYSTEM_OF',
  'IMPLEMENTS',
  'PARENT_OF',
  'NONE',
]);

export const SkillGapPriorityEnum = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

/**
 * CANONICAL gap severity — the *reason category* explaining why a gap exists.
 *
 * These are mutually exclusive causal classifications, NOT trust states:
 * - EXPLICITLY_MISSING    : zero evidence and zero claims for the requirement.
 * - UNVERIFIED_CLAIM      : candidate self-claims it; no repository evidence exists.
 * - INSUFFICIENT_EVIDENCE : evidence exists but does not establish proficiency.
 * - PARTIAL_TENURE        : quantitative tenure/duration falls short of the requirement.
 *
 * Evidence-trust states (HIGH_TRUST / LOW_TRUST / NO_EVIDENCE) are a SEPARATE
 * orthogonal axis and MUST NOT be added here — see SkillGapEvidenceTrustEnum.
 * In particular `LOW_TRUST_EVIDENCE` is not a severity: low-trust evidence is
 * modelled as severity=INSUFFICIENT_EVIDENCE + evidenceTrust=LOW_TRUST.
 */
export const SkillGapSeverityEnum = z.enum([
  'EXPLICITLY_MISSING',
  'UNVERIFIED_CLAIM',
  'INSUFFICIENT_EVIDENCE',
  'PARTIAL_TENURE',
]);

/**
 * CANONICAL provenance trust class for a single evidence item.
 * HIGH_TRUST = candidate-authored source. LOW_TRUST = vendored, generated,
 * transitive-dependency or lockfile paths (node_modules, dist, vendor, ...).
 */
export const EvidenceTrustClassEnum = z.enum(['HIGH_TRUST', 'LOW_TRUST']);

/**
 * CANONICAL evidence-trust state of the evidence backing a skill gap.
 * Extends EvidenceTrustClassEnum with NO_EVIDENCE for gaps that have no
 * backing evidence at all (explicit absences and unverified self-claims).
 */
export const SkillGapEvidenceTrustEnum = z.enum([...EvidenceTrustClassEnum.options, 'NO_EVIDENCE']);

// ---------------------------------------------------------------------------
// 2. Evidence Reference Schema
// ---------------------------------------------------------------------------

export const EvidenceRefSchema = z
  .object({
    id: z.string().uuid({ message: 'Evidence ID must be a valid UUID' }),
    resourceId: z.string().uuid({ message: 'Resource ID must be a valid UUID' }),
    resourceName: z.string().trim().min(1).max(255),
    evidenceType: z.string().trim().min(1).max(100),
    filePath: SafePosixFilePathSchema,
    commitSha: GitCommitShaSchema.optional().nullable(),
    lineRange: EvidenceLineRangeSchema.optional().nullable(),
    excerpt: EvidenceExcerptSchema.optional().nullable(),
    provenanceTrustClass: EvidenceTrustClassEnum.optional(),
    confidenceScore: ConfidenceScoreSchema.default(1.0),
    detectedAt: DateOrIsoStringSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 3. Candidate Requirement Match Schema
// ---------------------------------------------------------------------------

export const CandidateRequirementMatchSchema = z
  .object({
    requirementId: z.string().uuid({ message: 'Requirement ID must be a valid UUID' }),
    category: RequirementCategoryEnum,
    importance: RequirementImportanceEnum,
    required: z.boolean().optional(),
    originalRequirement: z.string().trim().max(1000).optional(),
    normalizedRequirement: z.string().trim().max(255).optional(),
    weight: z
      .number()
      .min(0.1, { message: 'Weight must be at least 0.1' })
      .max(1.0, { message: 'Weight must not exceed 1.0' })
      .default(1.0),
    skillSlug: SafeSlugSchema.nullable().optional(),
    extractedValue: z.string().trim().min(1).max(500),
    matchStatus: MatchStatusEnum,
    matchConfidence: ConfidenceScoreSchema,
    isUserClaim: z.boolean().default(false),
    claimLabel: z.string().trim().max(100).nullable().optional(),
    candidateSkills: z.array(z.string()).default([]).optional(),
    candidateProvenance: z
      .enum(['VERIFIED', 'CORROBORATED', 'CLAIMED', 'NONE', 'INFERRED', 'USER_PROVIDED'])
      .default('NONE')
      .optional(),
    matchedSkillSlug: SafeSlugSchema.nullable().optional(),
    relationshipType: MatchRelationshipTypeEnum.default('NONE'),
    primaryEvidence: EvidenceRefSchema.nullable().optional(),
    supportingEvidence: z.array(EvidenceRefSchema).max(3).default([]),
    explanation: z.string().trim().min(1).max(1000),
  })
  .strict();

// ---------------------------------------------------------------------------
// 4. Skill Gap Schema
// ---------------------------------------------------------------------------

export const SkillGapSchema = z
  .object({
    requirementId: z.string().uuid({ message: 'Requirement ID must be a valid UUID' }),
    skillSlug: SafeSlugSchema.nullable().optional(),
    skillName: z.string().trim().min(1).max(100),
    category: RequirementCategoryEnum,
    priority: SkillGapPriorityEnum,
    severity: SkillGapSeverityEnum,
    // Orthogonal to `severity`: the trust state of the evidence backing this
    // requirement. Never fold a trust state into `severity` — a gap can be
    // INSUFFICIENT_EVIDENCE because evidence is absent (NO_EVIDENCE) or because
    // the only evidence found is vendored/generated (LOW_TRUST).
    evidenceTrust: SkillGapEvidenceTrustEnum.default('NO_EVIDENCE'),
    status: z.enum(['MISSING', 'PARTIAL']),
    reason: z.string().trim().min(1).max(500),
    recommendation: z.string().trim().min(1).max(500),
  })
  .strict();

// ---------------------------------------------------------------------------
// 5. Match Explanation Schema
// ---------------------------------------------------------------------------

export const MatchExplanationSchema = z
  .object({
    requirementId: z.string().uuid({ message: 'Requirement ID must be a valid UUID' }),
    status: MatchStatusEnum,
    reason: z.string().trim().min(1).max(1000),
    evidenceRefs: z.array(EvidenceRefSchema).max(3).default([]),
    matchConfidence: ConfidenceScoreSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// 6. Candidate Match Summary Schema
// ---------------------------------------------------------------------------

export const CandidateMatchSummarySchema = z
  .object({
    totalRequirements: z.number().int().nonnegative(),
    matchedCount: z.number().int().nonnegative(),
    partialCount: z.number().int().nonnegative(),
    missingCount: z.number().int().nonnegative(),
    unknownCount: z.number().int().nonnegative(),
    criticalGapsCount: z.number().int().nonnegative(),
    highGapsCount: z.number().int().nonnegative(),
    mediumGapsCount: z.number().int().nonnegative(),
    lowGapsCount: z.number().int().nonnegative(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 7. Candidate Match Analysis Schema
// ---------------------------------------------------------------------------

export const CandidateMatchAnalysisSchema = z
  .object({
    jobDescriptionId: z.string().uuid({ message: 'JobDescription ID must be a valid UUID' }),
    candidateId: z.string().uuid({ message: 'Candidate ID must be a valid UUID' }),
    tenantId: z.string().uuid({ message: 'Tenant ID must be a valid UUID' }),
    summary: CandidateMatchSummarySchema,
    requirementMatches: z.array(CandidateRequirementMatchSchema),
    skillGaps: z.array(SkillGapSchema),
    explanations: z.array(MatchExplanationSchema),
    analyzedAt: DateOrIsoStringSchema.default(() => new Date()),
  })
  .strict();
