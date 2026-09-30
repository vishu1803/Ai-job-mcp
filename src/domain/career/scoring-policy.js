/**
 * @file Canonical Scoring Policy Domain Model & Policy Specification (P83 / Industry Upgrade)
 *
 * Implements the single canonical scoring specification governing candidate-job fit,
 * component weights, match state values, UNKNOWN handling, safety gates, and invariant validation.
 *
 * All scoring engines, documentation, and invariant tests must adhere to this specification.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// 1. Match States & Canonical Value Factors
// ---------------------------------------------------------------------------

export const MATCH_STATUS_ENUM = Object.freeze([
  'MATCHED',
  'PARTIAL',
  'MISSING',
  'UNKNOWN',
  'UNSUPPORTED_CANDIDATE',
]);

export const PARTIAL_MATCH_FACTORS = Object.freeze({
  BUILT_ON: 0.75, // Verified adjacent framework (e.g. Next.js for React)
  LOCATION_COMMUTABLE: 0.75, // Commutable hybrid or relocation candidate
  EDUCATION_STEM_ADJACENT: 0.6, // Adjacent STEM degree
  ECOSYSTEM_OF: 0.5, // Ecosystem driver / library (e.g. Drizzle for PostgreSQL)
  IMPLEMENTS: 0.5, // Engine abstraction / dialect (e.g. PostgreSQL for SQL)
  EXPERIENCE_PARTIAL: 0.5, // Partial tenure match or related experience
  DEFAULT_PARTIAL: 0.5, // Default partial factor
  CLAIMED_WITHOUT_EVIDENCE: 0.25, // Unverified user claim [Unverified User Claim]
});

export const MATCH_STATUS_VALUES = Object.freeze({
  MATCHED: 1.0,
  PARTIAL: PARTIAL_MATCH_FACTORS,
  MISSING: 0.0,
  UNKNOWN: {
    TECHNICAL_SKILL: 0.0, // Rule 23: Unknown technical skill earns 0.0 (insufficient evidence)
    JD_UNSTATED: null, // Neutral: Excluded from denominator when not required by JD
    PROFILE_UNSTATED_REQUIRED: 0.0, // Required by JD but unstated in profile
  },
  UNSUPPORTED_CANDIDATE: 0.0, // Claim on resume without candidate evidence
});

// ---------------------------------------------------------------------------
// 2. Default Component Weights (Canonical 100-Point Model)
// ---------------------------------------------------------------------------

export const DEFAULT_COMPONENT_WEIGHTS = Object.freeze({
  REQUIRED_SKILLS: 40.0,
  PREFERRED_SKILLS: 15.0,
  PROJECT_RELEVANCE: 20.0,
  EXPERIENCE_FIT: 10.0,
  EDUCATION_FIT: 5.0,
  LOCATION_FIT: 5.0,
  EVIDENCE_CONFIDENCE: 5.0,
});

export const ATS_SCORE_WEIGHTS = DEFAULT_COMPONENT_WEIGHTS;

// ---------------------------------------------------------------------------
// 3. Evidence Quality Weights (Evidentiary Hierarchy)
// ---------------------------------------------------------------------------

export const EVIDENCE_TYPE_QUALITY_WEIGHTS = Object.freeze({
  CODE_USAGE: 1.0,
  CODE_IMPORT_USAGE: 0.95,
  CONFIG_SYNTAX_DECLARATION: 0.85,
  PACKAGE_MANIFEST_DEPENDENCY: 0.75,
  COMMIT_CONTRIBUTION: 0.7,
  FILE_PATTERN_MATCH: 0.6,
  DIRECTORY_STRUCTURE: 0.5,
  README_SPECIFICATION: 0.3,
  DOCUMENT_CLAIM: 0.0,
});

// ---------------------------------------------------------------------------
// 4. Safety Gates & Score Caps
// ---------------------------------------------------------------------------

export const SAFETY_GATE_CAPS = Object.freeze({
  ZERO_GAPS: null, // No cap applied (eligible for up to 100.0)
  ONE_CRITICAL_GAP: 74.9, // Hard cap: MODERATE fit maximum
  TWO_CRITICAL_GAPS: 49.9, // Hard cap: WEAK fit maximum
  THREE_PLUS_CRITICAL_GAPS: 24.9, // Hard cap: LOW fit maximum
});

// ---------------------------------------------------------------------------
// 5. Fit Bands
// ---------------------------------------------------------------------------

export const FIT_SCORE_BANDS = Object.freeze({
  EXCELLENT: Object.freeze({ min: 90.0, max: 100.0, band: 'EXCELLENT' }),
  STRONG: Object.freeze({ min: 75.0, max: 89.99, band: 'STRONG' }),
  MODERATE: Object.freeze({ min: 50.0, max: 74.99, band: 'MODERATE' }),
  WEAK: Object.freeze({ min: 25.0, max: 49.99, band: 'WEAK' }),
  LOW: Object.freeze({ min: 0.0, max: 24.99, band: 'LOW' }),
});

// ---------------------------------------------------------------------------
// 6. Mathematical Helper Functions
// ---------------------------------------------------------------------------

/**
 * Rounds a decimal number to a specified precision (default 2 decimals).
 *
 * @param {number} num
 * @param {number} [precision=2]
 * @returns {number}
 */
export function roundScore(num, precision = 2) {
  if (num === null || num === undefined || Number.isNaN(num)) return 0.0;
  const factor = 10 ** precision;
  return Math.round((Number(num) + Number.EPSILON) * factor) / factor;
}

/**
 * Resolves the hard score cap based on the count of critical missing required skills.
 *
 * @param {number} criticalGapCount
 * @returns {number|null} Hard score ceiling or null if eligible for 100.0
 */
export function resolveScoreCap(criticalGapCount) {
  const count = Math.max(0, parseInt(criticalGapCount, 10) || 0);
  if (count === 0) return SAFETY_GATE_CAPS.ZERO_GAPS;
  if (count === 1) return SAFETY_GATE_CAPS.ONE_CRITICAL_GAP;
  if (count === 2) return SAFETY_GATE_CAPS.TWO_CRITICAL_GAPS;
  return SAFETY_GATE_CAPS.THREE_PLUS_CRITICAL_GAPS;
}

/**
 * Resolves the deterministic match value factor for a requirement match.
 *
 * @param {string} matchStatus
 * @param {object} [options={}]
 * @param {string} [options.relationshipType]
 * @param {boolean} [options.isUserClaim]
 * @param {string} [options.claimLabel]
 * @param {string} [options.category]
 * @param {number} [options.observedTenureMonths]
 * @param {number} [options.requiredTenureMonths]
 * @returns {number} Value factor in [0.0, 1.0]
 */
export function resolveMatchFactor(matchStatus, options = {}) {
  const status = String(matchStatus || '').toUpperCase();

  if (status === 'MATCHED') {
    return 1.0;
  }

  if (status === 'PARTIAL') {
    if (options.isUserClaim || options.claimLabel === '[Unverified User Claim]') {
      return PARTIAL_MATCH_FACTORS.CLAIMED_WITHOUT_EVIDENCE;
    }
    if (options.relationshipType === 'BUILT_ON') {
      return PARTIAL_MATCH_FACTORS.BUILT_ON;
    }
    if (
      options.category === 'LOCATION' ||
      options.relationshipType === 'COMMUTABLE' ||
      options.relationshipType === 'RELOCATION'
    ) {
      return PARTIAL_MATCH_FACTORS.LOCATION_COMMUTABLE;
    }
    if (options.category === 'EDUCATION' || options.relationshipType === 'STEM_ADJACENT') {
      return PARTIAL_MATCH_FACTORS.EDUCATION_STEM_ADJACENT;
    }
    if (
      options.category === 'EXPERIENCE' &&
      options.observedTenureMonths &&
      options.requiredTenureMonths
    ) {
      return roundScore(
        Math.min(
          1.0,
          Math.max(0.0, options.observedTenureMonths / Math.max(1, options.requiredTenureMonths))
        ),
        2
      );
    }
    if (options.relationshipType === 'ECOSYSTEM_OF' || options.relationshipType === 'IMPLEMENTS') {
      return PARTIAL_MATCH_FACTORS.ECOSYSTEM_OF;
    }
    return PARTIAL_MATCH_FACTORS.DEFAULT_PARTIAL;
  }

  if (status === 'UNKNOWN') {
    return MATCH_STATUS_VALUES.UNKNOWN.TECHNICAL_SKILL;
  }

  if (status === 'MISSING' || status === 'UNSUPPORTED_CANDIDATE') {
    return 0.0;
  }

  return 0.0;
}

/**
 * Computes raw composite score from 7 individual components.
 *
 * @param {object} components
 * @param {number} components.requiredSkillsScore
 * @param {number} components.preferredSkillsScore
 * @param {number} components.projectRelevanceScore
 * @param {number} components.experienceFitScore
 * @param {number} components.educationFitScore
 * @param {number} components.locationFitScore
 * @param {number} components.evidenceConfidenceScore
 * @returns {number} Bounded raw score in [0.0, 100.0]
 */
export function computeRawScore(components) {
  const req = Number(components?.requiredSkillsScore) || 0.0;
  const pref = Number(components?.preferredSkillsScore) || 0.0;
  const proj = Number(components?.projectRelevanceScore) || 0.0;
  const exp = Number(components?.experienceFitScore) || 0.0;
  const edu = Number(components?.educationFitScore) || 0.0;
  const loc = Number(components?.locationFitScore) || 0.0;
  const ev = Number(components?.evidenceConfidenceScore) || 0.0;

  const rawSum = req + pref + proj + exp + edu + loc + ev;
  return roundScore(Math.min(100.0, Math.max(0.0, rawSum)), 2);
}

/**
 * Computes overall score by applying applicable safety cap to raw score.
 *
 * @param {number} rawScore
 * @param {number} criticalGapCount
 * @returns {{ overallScore: number, scoreCap: number|null, isCapped: boolean }}
 */
export function computeFinalScore(rawScore, criticalGapCount) {
  const cap = resolveScoreCap(criticalGapCount);
  const boundedRaw = roundScore(Math.min(100.0, Math.max(0.0, rawScore)), 2);
  const isCapped = cap !== null && boundedRaw > cap;
  const overallScore = isCapped ? cap : boundedRaw;
  return {
    overallScore: roundScore(overallScore, 2),
    scoreCap: cap,
    isCapped,
  };
}

/**
 * Maps an overall score in [0.0, 100.0] into a canonical FitScoreBand.
 *
 * @param {number} score
 * @returns {'EXCELLENT' | 'STRONG' | 'MODERATE' | 'WEAK' | 'LOW'}
 */
export function resolveFitBand(score) {
  const s = Number(score) || 0.0;
  if (s >= 90.0) return 'EXCELLENT';
  if (s >= 75.0) return 'STRONG';
  if (s >= 50.0) return 'MODERATE';
  if (s >= 25.0) return 'WEAK';
  return 'LOW';
}

/**
 * Validates mathematical invariants for candidate job fit score breakdowns.
 * Throws an Error if any invariant is violated.
 *
 * Invariants Enforced:
 * 1. 0.0 <= every component <= component maximum
 * 2. 0.0 <= overallScore <= 100.0
 * 3. sum(component scores) == rawScore (within 0.01 tolerance)
 * 4. finalScore == min(rawScore, applicableCap)
 *
 * @param {object} breakdown
 * @param {object} [options={}]
 * @param {number} [options.criticalGapCount=0]
 * @param {object} [options.weights=DEFAULT_COMPONENT_WEIGHTS]
 * @returns {boolean} true if all invariants hold
 */
export function validateScoringInvariants(breakdown, options = {}) {
  const weights = options.weights || DEFAULT_COMPONENT_WEIGHTS;
  const criticalGapCount = options.criticalGapCount ?? breakdown.criticalGapCount ?? 0;

  if (!breakdown || typeof breakdown !== 'object') {
    throw new Error('validateScoringInvariants: breakdown must be a non-null object');
  }

  const {
    requiredSkillsScore = 0.0,
    preferredSkillsScore = 0.0,
    projectRelevanceScore = 0.0,
    experienceFitScore = 0.0,
    educationFitScore = 0.0,
    locationFitScore = 0.0,
    evidenceConfidenceScore = 0.0,
    rawScore = 0.0,
    overallScore = 0.0,
    denominatorAudit = null,
  } = breakdown;

  // Invariant 1: Component boundaries [0.0, Max]
  const componentChecks = [
    { name: 'requiredSkillsScore', value: requiredSkillsScore, max: weights.REQUIRED_SKILLS },
    { name: 'preferredSkillsScore', value: preferredSkillsScore, max: weights.PREFERRED_SKILLS },
    { name: 'projectRelevanceScore', value: projectRelevanceScore, max: weights.PROJECT_RELEVANCE },
    { name: 'experienceFitScore', value: experienceFitScore, max: weights.EXPERIENCE_FIT },
    { name: 'educationFitScore', value: educationFitScore, max: weights.EDUCATION_FIT },
    { name: 'locationFitScore', value: locationFitScore, max: weights.LOCATION_FIT },
    {
      name: 'evidenceConfidenceScore',
      value: evidenceConfidenceScore,
      max: weights.EVIDENCE_CONFIDENCE,
    },
  ];

  for (const c of componentChecks) {
    if (c.value < -0.001 || c.value > c.max + 0.001) {
      throw new Error(
        `Invariant violation: component ${c.name} (${c.value}) exceeds bounds [0.0, ${c.max}]`
      );
    }
  }

  // Invariant 2: Overall score bounds [0.0, 100.0]
  if (overallScore < -0.001 || overallScore > 100.001) {
    throw new Error(
      `Invariant violation: overallScore (${overallScore}) exceeds bounds [0.0, 100.0]`
    );
  }

  // Invariant 3: Additive decomposition sum(components) == rawScore (or scaled via totalPossiblePoints)
  const sumComponents = roundScore(
    requiredSkillsScore +
      preferredSkillsScore +
      projectRelevanceScore +
      experienceFitScore +
      educationFitScore +
      locationFitScore +
      evidenceConfidenceScore,
    2
  );

  const totalPossible =
    denominatorAudit?.totalPossiblePoints ?? options.totalPossiblePoints ?? 100.0;
  const expectedRaw =
    totalPossible > 0
      ? roundScore(Math.min(100.0, Math.max(0.0, (sumComponents / totalPossible) * 100.0)), 2)
      : 0.0;

  if (Math.abs(expectedRaw - rawScore) > 0.05) {
    throw new Error(
      `Invariant violation: calculated raw score (${expectedRaw}) != rawScore (${rawScore}) for component sum (${sumComponents}) and possible points (${totalPossible})`
    );
  }

  // Invariant 4: Final score == min(rawScore, applicableCap)
  const cap = resolveScoreCap(criticalGapCount);
  const expectedFinal = cap !== null ? roundScore(Math.min(rawScore, cap), 2) : rawScore;

  if (Math.abs(expectedFinal - overallScore) > 0.05) {
    throw new Error(
      `Invariant violation: finalScore (${overallScore}) != min(rawScore, cap) (${expectedFinal}) with cap ${cap}`
    );
  }

  return true;
}

// ---------------------------------------------------------------------------
// 7. Zod Policy Schemas & Policy Version Registry (P81, P82, P83)
// ---------------------------------------------------------------------------

export const ScoringWeightsSchema = z
  .object({
    atsParseability: z.number().min(0).max(1),
    jobMatch: z.number().min(0).max(1),
    contentQuality: z.number().min(0).max(1),
    keywordCoverage: z.number().min(0).max(1).default(0.0),
  })
  .refine(
    (w) =>
      Math.abs(w.atsParseability + w.jobMatch + w.contentQuality + w.keywordCoverage - 1.0) < 0.001,
    { message: 'Scoring weights must sum exactly to 1.0' }
  );

export const ScoringThresholdsSchema = z.object({
  qualificationCutoff: z.number().min(0).max(100).default(70),
  integrityGateRequired: z.boolean().default(true),
  minConfidenceCutoff: z.number().min(0).max(1).default(0.7),
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
    taxonomyResolution: z.number().min(0).max(1).default(0.2),
    evidenceCoverage: z.number().min(0).max(1).default(0.2),
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
    description:
      'Baseline 35/35/30 model with fail-closed evidence integrity gate and Rule 36 monotonicity.',
    weights: Object.freeze({
      atsParseability: 0.35,
      jobMatch: 0.35,
      contentQuality: 0.3,
      keywordCoverage: 0.0,
    }),
    thresholds: Object.freeze({
      qualificationCutoff: 70,
      integrityGateRequired: true,
      minConfidenceCutoff: 0.7,
    }),
    confidenceWeights: Object.freeze({
      pdfExtraction: 0.35,
      reqExtraction: 0.25,
      taxonomyResolution: 0.2,
      evidenceCoverage: 0.2,
    }),
  }),

  'p82.0': Object.freeze({
    version: 'p82.0',
    name: 'P82 Empirically Calibrated Policy',
    description:
      'Empirically calibrated 30/40/30 model prioritizing job match to eliminate formatting-over-content false positives while preserving zero fraud tolerance.',
    weights: Object.freeze({
      atsParseability: 0.3,
      jobMatch: 0.4,
      contentQuality: 0.3,
      keywordCoverage: 0.0,
    }),
    thresholds: Object.freeze({
      qualificationCutoff: 70,
      integrityGateRequired: true,
      minConfidenceCutoff: 0.7,
    }),
    confidenceWeights: Object.freeze({
      pdfExtraction: 0.35,
      reqExtraction: 0.25,
      taxonomyResolution: 0.2,
      evidenceCoverage: 0.2,
    }),
  }),

  'p83.0': Object.freeze({
    version: 'p83.0',
    name: 'P83 Industry-Grade Multi-Dimensional Policy',
    description:
      'Industry-grade multi-dimensional policy separating parseability, keyword match, content quality, and job fit with deterministic safety gates.',
    weights: Object.freeze({
      atsParseability: 0.2,
      jobMatch: 0.4,
      contentQuality: 0.25,
      keywordCoverage: 0.15,
    }),
    thresholds: Object.freeze({
      qualificationCutoff: 70,
      integrityGateRequired: true,
      minConfidenceCutoff: 0.7,
    }),
    confidenceWeights: Object.freeze({
      pdfExtraction: 0.3,
      reqExtraction: 0.3,
      taxonomyResolution: 0.2,
      evidenceCoverage: 0.2,
    }),
  }),
});

export const DEFAULT_SCORE_VERSION = 'p83.0';

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
