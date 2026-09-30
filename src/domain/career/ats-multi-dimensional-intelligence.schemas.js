/**
 * @file Multi-Dimensional ATS Intelligence Domain Schemas (Phase 2)
 *
 * Defines the 8 distinct measurable dimensions of ATS intelligence:
 * 1. ATS_PARSEABILITY_SCORE (Document structure & format extractability)
 * 2. ATS_EXTRACTION_SCORE (Field extraction completeness & accuracy)
 * 3. KEYWORD_COVERAGE_SCORE (Exact & semantic keyword representation)
 * 4. CONTENT_QUALITY_SCORE (Information density, specificity, impact)
 * 5. JOB_FIT_SCORE (Candidate qualifications vs job requirements)
 * 6. EVIDENCE_CONFIDENCE_SCORE (Cryptographic verification depth)
 * 7. CANDIDATE_QUALITY_SCORE (Role-independent engineering excellence)
 * 8. APPLICATION_READINESS_SCORE (End-to-end readiness with safety gates)
 *
 * Every dimension adheres to a strict contract with score, max, confidence,
 * explanation, contributing factors, warnings, evidence references, and deterministic trace.
 */

import { z } from 'zod';

export const ScoreFactorSchema = z.strictObject({
  name: z.string().min(1).max(255),
  contribution: z.number(),
  max: z.number().optional(),
  description: z.string().max(1000).optional(),
});

export const ScoreDimensionSchema = z.strictObject({
  score: z.number().min(0.0).max(100.0),
  max: z.number().default(100.0),
  confidence: z.number().min(0.0).max(1.0),
  explanation: z.string().min(1).max(2000),
  factors: z.array(ScoreFactorSchema).default([]),
  warnings: z.array(z.string().max(1000)).default([]),
  evidence: z.array(z.any()).default([]),
  calculation: z.record(z.any()).default({}),
});

export const MultiDimensionalAtsReportSchema = z.strictObject({
  reportVersion: z.string().default('1.0.0'),
  analyzedAt: z.string().datetime(),
  candidateId: z.string().uuid().optional().nullable(),
  jobDescriptionId: z.string().uuid().optional().nullable(),
  tenantId: z.string().uuid().optional().nullable(),
  dimensions: z.strictObject({
    atsParseability: ScoreDimensionSchema,
    atsExtraction: ScoreDimensionSchema,
    keywordCoverage: ScoreDimensionSchema,
    contentQuality: ScoreDimensionSchema,
    jobFit: ScoreDimensionSchema,
    evidenceConfidence: ScoreDimensionSchema,
    candidateQuality: ScoreDimensionSchema,
    applicationReadiness: ScoreDimensionSchema,
  }),
  summary: z.strictObject({
    primaryStrengths: z.array(z.string()).default([]),
    criticalGaps: z.array(z.string()).default([]),
    safetyGateApplied: z.boolean().default(false),
    overallAssessment: z.string().max(2000),
  }),
});
