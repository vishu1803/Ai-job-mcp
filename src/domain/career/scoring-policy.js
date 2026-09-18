/**
 * @file Scoring Policy Domain Model & Version Registry (P82)
 *
 * Enforces explicit versioning of resume evaluation scoring policies:
 * - scoreVersion: "p82.0" (Empirically calibrated scoring policy)
 * - scoreVersion: "p81.0" (Legacy hardened baseline policy)
 *
 * Every evaluation report retains its scoring-policy version to ensure
 * score changes from policy updates are distinguished from applicant resume changes.
 */

import { z } from 'zod';

export const ScoringWeightsSchema = z
  .object({
    atsParseability: z.number().min(0).max(1),
    jobMatch: z.number().min(0).max(1),
    contentQuality: z.number().min(0).max(1),
    keywordCoverage: z.number().min(0).max(1).default(0.0),
  })
  .refine(
    (w) => Math.abs(w.atsParseability + w.jobMatch + w.contentQuality + w.keywordCoverage - 1.0) < 0.001,
    { message: 'Scoring weights must sum exactly to 1.0' }
  );

export const ScoringThresholdsSchema = z.object({
  qualificationCutoff: z.number().min(0).max(100).default(70),
  integrityGateRequired: z.boolean().default(true),
  minConfidenceCutoff: z.number().min(0).max(1).default(0.70),
});

export const ScoringPolicySchema = z.object({
  version: z.string().regex(/^p\d+\.\d+$/, 'Version must follow format pXX.X (e.g. p82.0)'),
  name: z.string().min(1),
  description: z.string().min(1),
  weights: ScoringWeightsSchema,
  thresholds: ScoringThresholdsSchema,
  confidenceWeights: z.object({
    pdfExtraction: z.number().min(0).max(1).default(0.35),
    reqExtraction: z.number().min(0).max(1).default(0.25),
    taxonomyResolution: z.number().min(0).max(1).default(0.20),
    evidenceCoverage: z.number().min(0).max(1).default(0.20),
  }),
});

/**
 * Immutable Registry of Frozen Scoring Policies.
 * Once a version is published, its weights MUST NEVER be silently changed.
 */
export const SCORING_POLICIES = Object.freeze({
  'p81.0': Object.freeze({
    version: 'p81.0',
    name: 'P81 Hardened Baseline Policy',
    description: 'Baseline 35/35/30 model with fail-closed evidence integrity gate and Rule 36 monotonicity.',
    weights: Object.freeze({
      atsParseability: 0.35,
      jobMatch: 0.35,
      contentQuality: 0.30,
      keywordCoverage: 0.0,
    }),
    thresholds: Object.freeze({
      qualificationCutoff: 70,
      integrityGateRequired: true,
      minConfidenceCutoff: 0.70,
    }),
    confidenceWeights: Object.freeze({
      pdfExtraction: 0.35,
      reqExtraction: 0.25,
      taxonomyResolution: 0.20,
      evidenceCoverage: 0.20,
    }),
  }),

  'p82.0': Object.freeze({
    version: 'p82.0',
    name: 'P82 Empirically Calibrated Policy',
    description:
      'Empirically calibrated 30/40/30 model prioritizing job match to eliminate formatting-over-content false positives while preserving zero fraud tolerance.',
    weights: Object.freeze({
      atsParseability: 0.30,
      jobMatch: 0.40,
      contentQuality: 0.30,
      keywordCoverage: 0.0,
    }),
    thresholds: Object.freeze({
      qualificationCutoff: 70,
      integrityGateRequired: true,
      minConfidenceCutoff: 0.70,
    }),
    confidenceWeights: Object.freeze({
      pdfExtraction: 0.35,
      reqExtraction: 0.25,
      taxonomyResolution: 0.20,
      evidenceCoverage: 0.20,
    }),
  }),
});

export const DEFAULT_SCORE_VERSION = 'p82.0';

/**
 * Retrieves a frozen scoring policy by version tag.
 *
 * @param {string} [version=DEFAULT_SCORE_VERSION]
 * @returns {object} Frozen scoring policy
 */
export function getScoringPolicy(version = DEFAULT_SCORE_VERSION) {
  const policy = SCORING_POLICIES[version];
  if (!policy) {
    const available = Object.keys(SCORING_POLICIES).join(', ');
    throw new Error(`Unknown scoreVersion "${version}". Available policies: ${available}`);
  }
  return policy;
}

/**
 * Lists all registered scoring policy metadata.
 *
 * @returns {Array<object>}
 */
export function listScoringPolicies() {
  return Object.values(SCORING_POLICIES).map((p) => ({
    version: p.version,
    name: p.name,
    description: p.description,
    weights: { ...p.weights },
  }));
}
