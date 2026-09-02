/**
 * @file ATS Fit Score Calculator Domain Schemas (P5-005)
 * Defines canonical strict Zod contracts for composite candidate-job fit analysis,
 * transparent score breakdowns, structured fit strengths, fit bands, and multi-tenant envelopes.
 */

import { z } from 'zod';
import { DateOrIsoStringSchema } from '../candidate/candidate.schemas.js';
import { EvidenceRefSchema, SkillGapSchema } from './evidence-matching.schemas.js';
import { ProjectRelevanceSchema } from './project-relevance.schemas.js';

// ---------------------------------------------------------------------------
// 1. Fit Score Band Enum
// ---------------------------------------------------------------------------

export const FitScoreBandEnum = z.enum([
  'EXCELLENT',
  'STRONG',
  'GOOD',
  'MODERATE',
  'WEAK',
  'LOW',
  'INSUFFICIENT_DATA',
]);

// ---------------------------------------------------------------------------
// 2. Fit Strength Category Enum
// ---------------------------------------------------------------------------

export const FitStrengthCategoryEnum = z.enum([
  'REQUIRED_SKILL_COVERAGE',
  'PROJECT_RELEVANCE',
  'ARCHITECTURAL_DENSITY',
  'EVIDENCE_INTEGRITY',
  'PREFERRED_SKILL_COVERAGE',
  'EXPERIENCE_TENURE',
]);

// ---------------------------------------------------------------------------
// 3. Fit Score Breakdown Schema
// ---------------------------------------------------------------------------

export const FitScoreBreakdownSchema = z.strictObject({
  requiredSkillsScore: z
    .number()
    .min(0.0, { message: 'requiredSkillsScore must be >= 0.0' })
    .max(40.0, { message: 'requiredSkillsScore cannot exceed 40.0' }),
  preferredSkillsScore: z
    .number()
    .min(0.0, { message: 'preferredSkillsScore must be >= 0.0' })
    .max(15.0, { message: 'preferredSkillsScore cannot exceed 15.0' }),
  projectRelevanceScore: z
    .number()
    .min(0.0, { message: 'projectRelevanceScore must be >= 0.0' })
    .max(20.0, { message: 'projectRelevanceScore cannot exceed 20.0' }),
  experienceFitScore: z
    .number()
    .min(0.0, { message: 'experienceFitScore must be >= 0.0' })
    .max(10.0, { message: 'experienceFitScore cannot exceed 10.0' }),
  educationFitScore: z
    .number()
    .min(0.0, { message: 'educationFitScore must be >= 0.0' })
    .max(5.0, { message: 'educationFitScore cannot exceed 5.0' }),
  locationFitScore: z
    .number()
    .min(0.0, { message: 'locationFitScore must be >= 0.0' })
    .max(5.0, { message: 'locationFitScore cannot exceed 5.0' }),
  evidenceConfidenceScore: z
    .number()
    .min(0.0, { message: 'evidenceConfidenceScore must be >= 0.0' })
    .max(5.0, { message: 'evidenceConfidenceScore cannot exceed 5.0' }),
  rawScore: z
    .number()
    .min(0.0, { message: 'rawScore must be >= 0.0' })
    .max(100.0, { message: 'rawScore cannot exceed 100.0' }),
  scoreCap: z
    .number()
    .min(0.0, { message: 'scoreCap must be >= 0.0' })
    .max(100.0, { message: 'scoreCap cannot exceed 100.0' })
    .nullable()
    .optional(),
  overallScore: z
    .number()
    .min(0.0, { message: 'overallScore must be >= 0.0' })
    .max(100.0, { message: 'overallScore cannot exceed 100.0' })
    .nullable(),
});

// ---------------------------------------------------------------------------
// 4. Fit Strength Schema
// ---------------------------------------------------------------------------

export const FitStrengthSchema = z.strictObject({
  category: FitStrengthCategoryEnum,
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(1000),
  contributionScore: z.number().min(0.0).max(40.0),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
});

// ---------------------------------------------------------------------------
// 5. Fit Score Explanation Schema
// ---------------------------------------------------------------------------

export const FitScoreExplanationSchema = z.strictObject({
  overallReason: z.string().trim().min(1).max(2000),
  strengthsSummary: z.string().trim().min(1).max(1000),
  gapsSummary: z.string().trim().min(1).max(1000),
  cappingReason: z.string().trim().min(1).max(1000).nullable().optional(),
});

// ---------------------------------------------------------------------------
// 6. Candidate Job Fit Analysis (Top-Level Envelope)
// ---------------------------------------------------------------------------

export const CandidateJobFitAnalysisSchema = z.strictObject({
  jobDescriptionId: z.string().uuid({ message: 'JobDescription ID must be a valid UUID' }),
  candidateId: z.string().uuid({ message: 'Candidate ID must be a valid UUID' }),
  tenantId: z.string().uuid({ message: 'Tenant ID must be a valid UUID' }),
  analysisStatus: z.enum(['COMPLETE', 'INSUFFICIENT_DATA']).default('COMPLETE'),
  isFallbackScore: z.boolean().default(false),
  zeroRequirementWarning: z.string().nullable().optional().default(null),
  overallScore: z
    .number()
    .min(0.0, { message: 'overallScore must be >= 0.0' })
    .max(100.0, { message: 'overallScore cannot exceed 100.0' })
    .nullable(),
  fitBand: FitScoreBandEnum,
  scoreBreakdown: FitScoreBreakdownSchema,
  criticalGapCount: z.number().int().nonnegative(),
  highGapCount: z.number().int().nonnegative(),
  isCapped: z.boolean(),
  keyStrengths: z.array(FitStrengthSchema).default([]),
  skillGaps: z.array(SkillGapSchema).default([]),
  topRelevantProjects: z.array(ProjectRelevanceSchema).max(3).default([]),
  explanations: FitScoreExplanationSchema.optional(),
  explanation: z.string().trim().min(1).max(2000),
  confidence: z
    .number()
    .min(0.0, { message: 'confidence must be >= 0.0' })
    .max(1.0, { message: 'confidence cannot exceed 1.0' }),
  analyzedAt: DateOrIsoStringSchema.default(() => new Date()),
});
