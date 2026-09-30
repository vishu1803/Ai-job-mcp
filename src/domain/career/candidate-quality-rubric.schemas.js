/**
 * @file Candidate Quality Rubric Schemas (Phase 12)
 *
 * Schemas for evaluating candidate quality across 10 deterministic dimensions,
 * independent of any specific job description fit.
 */

import { z } from 'zod';

export const RubricDimensionKeySchema = z.enum([
  'TECHNICAL_DEPTH',
  'EXPERIENCE_SENIORITY',
  'PRODUCTION_IMPACT',
  'PROJECT_AUTHENTICITY',
  'OPEN_SOURCE_CREDIBILITY',
  'WRITING_COMMUNICATION',
  'EDUCATION_LEARNING',
  'ENGINEERING_RIGOR',
  'LEADERSHIP_COLLABORATION',
  'CAREER_TRAJECTORY',
]);

export const RubricLevelSchema = z.enum([
  'EXCEPTIONAL',
  'STRONG',
  'COMPETENT',
  'DEVELOPING',
  'NEEDS_IMPROVEMENT',
]);

export const RubricDimensionScoreSchema = z
  .object({
    dimension: RubricDimensionKeySchema,
    score: z.number().min(0).max(10),
    maxScore: z.literal(10),
    level: RubricLevelSchema,
    evidence: z.array(z.string()),
    reasoning: z.string(),
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
  })
  .strict();

export const CandidateQualityRubricReportSchema = z
  .object({
    overallQualityScore: z.number().min(0).max(100),
    overallLevel: RubricLevelSchema,
    dimensions: z.record(RubricDimensionKeySchema, RubricDimensionScoreSchema),
    summary: z.string(),
    keyStrengths: z.array(z.string()),
    criticalGaps: z.array(z.string()),
    analyzedAt: z.string().datetime(),
  })
  .strict();

export const CandidateQualityAnalysisSchema = CandidateQualityRubricReportSchema;
