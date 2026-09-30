/**
 * @file Application Readiness Score Schemas (Phase 16)
 *
 * Schemas for the blended Application Readiness Score, safety gating,
 * readiness checklist, and formal submission recommendations.
 */

import { z } from 'zod';

export const ReadinessBandEnum = z.enum(['READY_TO_APPLY', 'APPLY_WITH_CAUTION', 'NOT_READY']);

export const SubmissionRecommendationEnum = z.enum([
  'RECOMMENDED',
  'NEEDS_POLISHING',
  'DO_NOT_SUBMIT',
]);

export const ReadinessChecklistItemSchema = z
  .object({
    check: z.string(),
    passed: z.boolean(),
    severity: z.enum(['CRITICAL', 'WARNING', 'INFO']),
    recommendation: z.string(),
  })
  .strict();

export const ApplicationReadinessScoreReportSchema = z
  .object({
    readinessScore: z.number().min(0).max(100),
    rawScore: z.number().min(0).max(100),
    readinessBand: ReadinessBandEnum,
    recommendation: SubmissionRecommendationEnum,
    safetyGateApplied: z.boolean(),
    safetyGateReason: z.string().nullable().default(null),
    scoreBreakdown: z
      .object({
        atsParseabilityScore: z.number().min(0).max(100),
        jobFitScore: z.number().min(0).max(100),
        recruiterCoverageScore: z.number().min(0).max(100),
        contentQualityScore: z.number().min(0).max(100),
        candidateQualityScore: z.number().min(0).max(100),
        evidenceConfidenceScore: z.number().min(0).max(100),
        bonusDeductionModifier: z.number(),
      })
      .strict(),
    checklist: z.array(ReadinessChecklistItemSchema),
    summary: z.string(),
    analyzedAt: z.string().datetime(),
  })
  .strict();
