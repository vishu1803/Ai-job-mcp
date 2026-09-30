/**
 * @file Score Explainability Schemas (Phases 14 & 15)
 *
 * Schemas for evidence-backed score decomposition, lost-point attribution,
 * and deterministic score comparison ("Why did I get 82 instead of 91?").
 */

import { z } from 'zod';

export const RecoveryPotentialEnum = z.enum([
  'IMMEDIATE_RESUME_FIX',
  'SHORT_TERM_PORTFOLIO',
  'LONG_TERM_EXPERIENCE',
]);

export const LostPointItemSchema = z
  .object({
    component: z.string(),
    lostPoints: z.number().min(0),
    maxComponentScore: z.number().min(0),
    earnedComponentScore: z.number().min(0),
    reason: z.string(),
    evidenceAudit: z.array(z.string()).default([]),
    howToRecover: z.string(),
    recoveryPotential: RecoveryPotentialEnum,
  })
  .strict();

export const MarginalGapSchema = z
  .object({
    component: z.string(),
    neededPoints: z.number(),
    actionableFix: z.string(),
    expectedScoreGain: z.number(),
  })
  .strict();

export const ScoreComparisonExplanationSchema = z
  .object({
    achievedScore: z.number().min(0).max(100),
    targetScore: z.number().min(0).max(100),
    scoreDelta: z.number(),
    marginalGaps: z.array(MarginalGapSchema),
    narrativeExplanation: z.string(),
  })
  .strict();

export const ScoreExplainabilityReportSchema = z
  .object({
    finalScore: z.number().min(0).max(100),
    rawScore: z.number().min(0).max(100),
    safetyCapApplied: z.number().nullable().default(null),
    safetyCapReason: z.string().nullable().default(null),
    lostPointsTotal: z.number().min(0).max(100),
    lostPointsBreakdown: z.array(LostPointItemSchema),
    topRemediationActions: z.array(z.string()),
    analyzedAt: z.string().datetime(),
  })
  .strict();
