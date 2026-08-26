/**
 * @file Strict Domain Schemas for Application Analytics (Phase 12 / P12-004 / ARCH-045)
 *
 * Defines canonical strict Zod contracts for:
 * - Time window filters (ALL_TIME, LAST_30_DAYS, LAST_90_DAYS, LAST_180_DAYS, LAST_365_DAYS)
 * - Funnel progression metrics (tracked, submitted, responded, withdrawn, interview, offer, accepted)
 * - Match score vs. response rate correlation bands (85-100, 70-84.9, 50-69.9, 0-49.9, UNSCORED)
 * - Normalized skill-gap frequency distributions (target demand, overall gap rate, conditional gap rate)
 * - Small-sample privacy and suppression guardrails (N < 5 -> null rate + INSUFFICIENT_DATA)
 * - Non-causal descriptive statistical disclaimers
 */

import { z } from 'zod';
import { ApplicationSourceEnum, WorkplaceTypeEnum } from './job-application.schemas.js';

// =============================================================================
// Constants & Enums
// =============================================================================

export const MIN_SAMPLE_SIZE_FOR_RATES = 5;

export const NON_CAUSAL_DISCLAIMER =
  'Descriptive summary of historical application tracking data. Correlation does not imply causation.';

export const TimeWindowEnum = z.enum([
  'ALL_TIME',
  'LAST_30_DAYS',
  'LAST_90_DAYS',
  'LAST_180_DAYS',
  'LAST_365_DAYS',
]);

export const ScoreBandLabelEnum = z.enum(['EXCELLENT', 'STRONG', 'MODERATE', 'LOW', 'UNSCORED']);

// =============================================================================
// 1. Filter Options Schema
// =============================================================================

export const AnalyticsFilterOptionsSchema = z
  .object({
    timeWindow: TimeWindowEnum.default('ALL_TIME'),
    source: ApplicationSourceEnum.optional().nullable(),
    workplaceType: WorkplaceTypeEnum.optional().nullable(),
  })
  .strict();

// =============================================================================
// 2. Score Band Metrics Schema
// =============================================================================

export const ScoreBandMetricSchema = z
  .object({
    scoreBand: z.string(),
    bandLabel: ScoreBandLabelEnum,
    minScore: z.number().min(0).max(100).nullable(),
    maxScore: z.number().min(0).max(100).nullable(),
    totalApplications: z.number().int().nonnegative(),
    respondedCount: z.number().int().nonnegative(),
    observedResponseRate: z.number().min(0).max(100).nullable(),
    interviewCount: z.number().int().nonnegative(),
    offerCount: z.number().int().nonnegative(),
    sampleSizeAdequate: z.boolean(),
    statisticalWarning: z.string().nullable().optional(),
  })
  .strict();

export const ScoreProgressionCorrelationOutputSchema = z
  .object({
    candidateId: z.string().uuid(),
    timeWindow: TimeWindowEnum,
    filters: z.object({
      source: z.string().nullable().optional(),
      workplaceType: z.string().nullable().optional(),
    }),
    scoreBands: z.array(ScoreBandMetricSchema),
    totalScoredApplications: z.number().int().nonnegative(),
    totalUnscoredApplications: z.number().int().nonnegative(),
    disclaimer: z.string(),
  })
  .strict();

// =============================================================================
// 3. Skill Gap Frequency Metrics Schema
// =============================================================================

export const SkillGapFrequencyItemSchema = z
  .object({
    skillSlug: z.string(),
    skillName: z.string(),
    category: z.string(),
    demandedInJobsCount: z.number().int().nonnegative(),
    gapInJobsCount: z.number().int().nonnegative(),
    totalAnalyzedJobsCount: z.number().int().nonnegative(),
    targetDemandFrequency: z.number().min(0).max(100).nullable(),
    overallGapRate: z.number().min(0).max(100).nullable(),
    conditionalGapRate: z.number().min(0).max(100).nullable(),
    sampleSizeAdequate: z.boolean(),
    statisticalWarning: z.string().nullable().optional(),
  })
  .strict();

export const SkillGapFrequencyOutputSchema = z
  .object({
    candidateId: z.string().uuid(),
    timeWindow: TimeWindowEnum,
    totalAnalyzedApplications: z.number().int().nonnegative(),
    items: z.array(SkillGapFrequencyItemSchema),
    disclaimer: z.string(),
  })
  .strict();

// =============================================================================
// 4. Candidate Funnel Analytics Summary Schema
// =============================================================================

export const CandidateFunnelMetricsSchema = z
  .object({
    trackedPortfolioTotal: z.number().int().nonnegative(),
    submittedCount: z.number().int().nonnegative(),
    respondedCount: z.number().int().nonnegative(),
    withdrawnBeforeResponseCount: z.number().int().nonnegative(),
    withdrawnCount: z.number().int().nonnegative(),
    interviewCount: z.number().int().nonnegative(),
    offerCount: z.number().int().nonnegative(),
    acceptedCount: z.number().int().nonnegative(),
    observedResponseRate: z.number().min(0).max(100).nullable(),
    sampleSizeAdequate: z.boolean(),
    statisticalWarning: z.string().nullable().optional(),
  })
  .strict();

export const CandidateAnalyticsSummaryOutputSchema = z
  .object({
    candidateId: z.string().uuid(),
    timeWindow: TimeWindowEnum,
    filters: z.object({
      source: z.string().nullable().optional(),
      workplaceType: z.string().nullable().optional(),
    }),
    funnel: CandidateFunnelMetricsSchema,
    scoreCorrelation: ScoreProgressionCorrelationOutputSchema,
    topSkillGaps: z.array(SkillGapFrequencyItemSchema),
    disclaimer: z.string(),
  })
  .strict();
