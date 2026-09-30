/**
 * @file Open Source Contribution Intelligence Schemas (Phase 7)
 *
 * Implements first-class Open Source Contribution scoring and provenance tracking.
 * STRICT INVARIANT: Distinguishes personal repositories from external open-source contributions.
 * Avoids rewarding vanity stars or forked repo counts without evidence of external contribution.
 */

import { z } from 'zod';
import { ConfidenceScoreSchema } from '../candidate/candidate.schemas.js';

export const OpenSourceContributionTypeEnum = z.enum([
  'PERSONAL_PROJECT',
  'EXTERNAL_OPEN_SOURCE_CONTRIBUTION',
  'MAINTAINER',
  'ORGANIZATION_CONTRIBUTOR',
]);

export const OpenSourceActivityItemSchema = z
  .object({
    id: z.string().uuid(),
    repository: z.string().trim().min(1),
    organization: z.string().trim().nullable().optional(),
    isFork: z.boolean().default(false),
    isExternal: z.boolean().default(false),
    role: OpenSourceContributionTypeEnum,
    mergedPullRequestsCount: z.number().int().nonnegative().default(0),
    openPullRequestsCount: z.number().int().nonnegative().default(0),
    acceptedCommitsCount: z.number().int().nonnegative().default(0),
    codeReviewsCount: z.number().int().nonnegative().default(0),
    issuesResolvedCount: z.number().int().nonnegative().default(0),
    repositoryStars: z.number().int().nonnegative().default(0),
    technologies: z.array(z.string().trim()).default([]),
    evidenceUrl: z.string().trim().url().nullable().optional(),
    provenanceConfidence: ConfidenceScoreSchema.default(1.0),
    contributionSummary: z.string().trim().min(1),
  })
  .strict();

export const OpenSourceScoreBreakdownSchema = z
  .object({
    externalMergedPrsScore: z.number().min(0).max(35),
    codeQualityAndReviewsScore: z.number().min(0).max(25),
    maintainerLeadershipScore: z.number().min(0).max(20),
    contributionConsistencyScore: z.number().min(0).max(10),
    repositoryAdoptionScore: z.number().min(0).max(10),
    rawScore: z.number().min(0).max(100),
    finalScore: z.number().min(0).max(100),
  })
  .strict();

export const OpenSourceIntelligenceReportSchema = z
  .object({
    score: z.number().min(0).max(100),
    confidence: ConfidenceScoreSchema,
    contributionTier: z.enum(['PROLIFIC_CONTRIBUTOR', 'ACTIVE_CONTRIBUTOR', 'OCCASIONAL_CONTRIBUTOR', 'PERSONAL_ONLY', 'NO_EVIDENCE']),
    scoreBreakdown: OpenSourceScoreBreakdownSchema,
    totalExternalContributionsCount: z.number().int().nonnegative().default(0),
    totalPersonalReposCount: z.number().int().nonnegative().default(0),
    activities: z.array(OpenSourceActivityItemSchema).default([]),
    keyAchievements: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
  })
  .strict();
