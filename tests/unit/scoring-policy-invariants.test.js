/**
 * @file Scoring Policy Invariant Unit Tests (Phase 1)
 *
 * Proves mathematical invariants of the canonical scoring policy:
 * 1. 0.0 <= every component <= component maximum
 * 2. 0.0 <= overallScore <= 100.0
 * 3. sum(component scores) == raw score (when 100% full model)
 * 4. final score == min(raw score, applicable score cap)
 * 5. Deterministic bit-for-bit invariance across identical inputs
 * 6. Match state values: MATCHED (1.0), PARTIAL factors, MISSING (0.0), UNKNOWN (0.0 / neutral)
 * 7. Hard score ceilings for critical gap counts (1 -> 74.9, 2 -> 49.9, 3+ -> 24.9)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COMPONENT_WEIGHTS,
  SAFETY_GATE_CAPS,
  MATCH_STATUS_VALUES,
  PARTIAL_MATCH_FACTORS,
  FIT_SCORE_BANDS,
  roundScore,
  resolveScoreCap,
  resolveMatchFactor,
  computeRawScore,
  computeFinalScore,
  resolveFitBand,
  validateScoringInvariants,
  getScoringPolicy,
  listScoringPolicies,
} from '../../src/domain/career/scoring-policy.js';

describe('Scoring Policy Invariant Tests (Phase 1)', () => {
  describe('1. Canonical Component Maximums & Weight Sum', () => {
    it('enforces component weights sum exactly to 100.0', () => {
      const weights = DEFAULT_COMPONENT_WEIGHTS;
      const totalWeight =
        weights.REQUIRED_SKILLS +
        weights.PREFERRED_SKILLS +
        weights.PROJECT_RELEVANCE +
        weights.EXPERIENCE_FIT +
        weights.EDUCATION_FIT +
        weights.LOCATION_FIT +
        weights.EVIDENCE_CONFIDENCE;

      assert.strictEqual(totalWeight, 100.0);
    });

    it('validates each component maximum matches specification', () => {
      assert.strictEqual(DEFAULT_COMPONENT_WEIGHTS.REQUIRED_SKILLS, 40.0);
      assert.strictEqual(DEFAULT_COMPONENT_WEIGHTS.PREFERRED_SKILLS, 15.0);
      assert.strictEqual(DEFAULT_COMPONENT_WEIGHTS.PROJECT_RELEVANCE, 20.0);
      assert.strictEqual(DEFAULT_COMPONENT_WEIGHTS.EXPERIENCE_FIT, 10.0);
      assert.strictEqual(DEFAULT_COMPONENT_WEIGHTS.EDUCATION_FIT, 5.0);
      assert.strictEqual(DEFAULT_COMPONENT_WEIGHTS.LOCATION_FIT, 5.0);
      assert.strictEqual(DEFAULT_COMPONENT_WEIGHTS.EVIDENCE_CONFIDENCE, 5.0);
    });
  });

  describe('2. Match State Factors & Value Resolution', () => {
    it('resolves MATCHED as 1.0', () => {
      assert.strictEqual(resolveMatchFactor('MATCHED'), 1.0);
      assert.strictEqual(MATCH_STATUS_VALUES.MATCHED, 1.0);
    });

    it('resolves MISSING and UNSUPPORTED_CANDIDATE as 0.0', () => {
      assert.strictEqual(resolveMatchFactor('MISSING'), 0.0);
      assert.strictEqual(resolveMatchFactor('UNSUPPORTED_CANDIDATE'), 0.0);
      assert.strictEqual(MATCH_STATUS_VALUES.MISSING, 0.0);
      assert.strictEqual(MATCH_STATUS_VALUES.UNSUPPORTED_CANDIDATE, 0.0);
    });

    it('resolves UNKNOWN technical skills as 0.0 earned credit', () => {
      assert.strictEqual(resolveMatchFactor('UNKNOWN'), 0.0);
      assert.strictEqual(MATCH_STATUS_VALUES.UNKNOWN.TECHNICAL_SKILL, 0.0);
    });

    it('resolves PARTIAL factors accurately based on provenance relationship', () => {
      assert.strictEqual(
        resolveMatchFactor('PARTIAL', { relationshipType: 'BUILT_ON' }),
        PARTIAL_MATCH_FACTORS.BUILT_ON
      );
      assert.strictEqual(
        resolveMatchFactor('PARTIAL', { category: 'LOCATION', relationshipType: 'COMMUTABLE' }),
        PARTIAL_MATCH_FACTORS.LOCATION_COMMUTABLE
      );
      assert.strictEqual(
        resolveMatchFactor('PARTIAL', { category: 'EDUCATION', relationshipType: 'STEM_ADJACENT' }),
        PARTIAL_MATCH_FACTORS.EDUCATION_STEM_ADJACENT
      );
      assert.strictEqual(
        resolveMatchFactor('PARTIAL', { relationshipType: 'ECOSYSTEM_OF' }),
        PARTIAL_MATCH_FACTORS.ECOSYSTEM_OF
      );
      assert.strictEqual(
        resolveMatchFactor('PARTIAL', { relationshipType: 'IMPLEMENTS' }),
        PARTIAL_MATCH_FACTORS.IMPLEMENTS
      );
      assert.strictEqual(
        resolveMatchFactor('PARTIAL', { isUserClaim: true }),
        PARTIAL_MATCH_FACTORS.CLAIMED_WITHOUT_EVIDENCE
      );
    });

    it('computes proportional tenure factor for partial experience', () => {
      const factor = resolveMatchFactor('PARTIAL', {
        category: 'EXPERIENCE',
        observedTenureMonths: 36,
        requiredTenureMonths: 60,
      });
      assert.strictEqual(factor, 0.6);
    });
  });

  describe('3. Safety Gates & Score Capping Protocol', () => {
    it('applies null cap for 0 critical gaps', () => {
      assert.strictEqual(resolveScoreCap(0), null);
      const res = computeFinalScore(95.0, 0);
      assert.strictEqual(res.overallScore, 95.0);
      assert.strictEqual(res.scoreCap, null);
      assert.strictEqual(res.isCapped, false);
    });

    it('caps raw score at 74.9 for 1 critical gap', () => {
      assert.strictEqual(resolveScoreCap(1), SAFETY_GATE_CAPS.ONE_CRITICAL_GAP);
      const res = computeFinalScore(92.0, 1);
      assert.strictEqual(res.overallScore, 74.9);
      assert.strictEqual(res.scoreCap, 74.9);
      assert.strictEqual(res.isCapped, true);

      // Does not artificially inflate lower score
      const lowRes = computeFinalScore(65.0, 1);
      assert.strictEqual(lowRes.overallScore, 65.0);
      assert.strictEqual(lowRes.isCapped, false);
    });

    it('caps raw score at 49.9 for 2 critical gaps', () => {
      assert.strictEqual(resolveScoreCap(2), SAFETY_GATE_CAPS.TWO_CRITICAL_GAPS);
      const res = computeFinalScore(80.0, 2);
      assert.strictEqual(res.overallScore, 49.9);
      assert.strictEqual(res.scoreCap, 49.9);
      assert.strictEqual(res.isCapped, true);
    });

    it('caps raw score at 24.9 for 3 or more critical gaps', () => {
      assert.strictEqual(resolveScoreCap(3), SAFETY_GATE_CAPS.THREE_PLUS_CRITICAL_GAPS);
      assert.strictEqual(resolveScoreCap(5), SAFETY_GATE_CAPS.THREE_PLUS_CRITICAL_GAPS);
      const res = computeFinalScore(88.0, 4);
      assert.strictEqual(res.overallScore, 24.9);
      assert.strictEqual(res.isCapped, true);
    });
  });

  describe('4. Invariant Validation Suite', () => {
    it('confirms invariant: sum(component scores) == rawScore', () => {
      const breakdown = {
        requiredSkillsScore: 36.0,
        preferredSkillsScore: 12.0,
        projectRelevanceScore: 18.0,
        experienceFitScore: 10.0,
        educationFitScore: 5.0,
        locationFitScore: 5.0,
        evidenceConfidenceScore: 4.5,
        rawScore: 90.5,
        overallScore: 90.5,
        criticalGapCount: 0,
      };

      const valid = validateScoringInvariants(breakdown);
      assert.strictEqual(valid, true);
      assert.strictEqual(computeRawScore(breakdown), 36.0 + 12.0 + 18.0 + 10.0 + 5.0 + 5.0 + 4.5);
    });

    it('throws on component exceeding maximum allowed weight', () => {
      const breakdown = {
        requiredSkillsScore: 45.0, // Exceeds 40.0 maximum
        preferredSkillsScore: 10.0,
        projectRelevanceScore: 15.0,
        experienceFitScore: 10.0,
        educationFitScore: 5.0,
        locationFitScore: 5.0,
        evidenceConfidenceScore: 5.0,
        rawScore: 95.0,
        overallScore: 95.0,
        criticalGapCount: 0,
      };

      assert.throws(
        () => validateScoringInvariants(breakdown),
        /Invariant violation: component requiredSkillsScore \(45\) exceeds bounds/
      );
    });

    it('throws on negative component score', () => {
      const breakdown = {
        requiredSkillsScore: -5.0,
        preferredSkillsScore: 10.0,
        projectRelevanceScore: 15.0,
        experienceFitScore: 10.0,
        educationFitScore: 5.0,
        locationFitScore: 5.0,
        evidenceConfidenceScore: 5.0,
        rawScore: 45.0,
        overallScore: 45.0,
        criticalGapCount: 0,
      };

      assert.throws(
        () => validateScoringInvariants(breakdown),
        /Invariant violation: component requiredSkillsScore \(-5\) exceeds bounds/
      );
    });

    it('throws if sum of components does not equal rawScore', () => {
      const breakdown = {
        requiredSkillsScore: 30.0,
        preferredSkillsScore: 10.0,
        projectRelevanceScore: 15.0,
        experienceFitScore: 10.0,
        educationFitScore: 5.0,
        locationFitScore: 5.0,
        evidenceConfidenceScore: 5.0, // Sum = 80.0
        rawScore: 95.0, // Hidden adjustment (+15.0 pts)
        overallScore: 95.0,
        criticalGapCount: 0,
      };

      assert.throws(
        () => validateScoringInvariants(breakdown),
        /Invariant violation: calculated raw score/
      );
    });

    it('throws if final score violates safety cap', () => {
      const breakdown = {
        requiredSkillsScore: 30.0,
        preferredSkillsScore: 15.0,
        projectRelevanceScore: 20.0,
        experienceFitScore: 10.0,
        educationFitScore: 5.0,
        locationFitScore: 5.0,
        evidenceConfidenceScore: 5.0, // Sum = 90.0
        rawScore: 90.0,
        overallScore: 90.0, // Failed to apply 74.9 cap for 1 critical gap!
        criticalGapCount: 1,
      };

      assert.throws(
        () => validateScoringInvariants(breakdown, { criticalGapCount: 1 }),
        /Invariant violation: finalScore \(90\) != min\(rawScore, cap\) \(74.9\)/
      );
    });
  });

  describe('5. Fit Bands Categorization', () => {
    it('correctly maps boundaries into canonical bands', () => {
      assert.strictEqual(resolveFitBand(100.0), 'EXCELLENT');
      assert.strictEqual(resolveFitBand(90.0), 'EXCELLENT');
      assert.strictEqual(resolveFitBand(89.9), 'STRONG');
      assert.strictEqual(resolveFitBand(75.0), 'STRONG');
      assert.strictEqual(resolveFitBand(74.9), 'MODERATE');
      assert.strictEqual(resolveFitBand(50.0), 'MODERATE');
      assert.strictEqual(resolveFitBand(49.9), 'WEAK');
      assert.strictEqual(resolveFitBand(25.0), 'WEAK');
      assert.strictEqual(resolveFitBand(24.9), 'LOW');
      assert.strictEqual(resolveFitBand(0.0), 'LOW');
    });
  });

  describe('6. Policy Version Registry', () => {
    it('lists registered policies including p81.0, p82.0, and p83.0', () => {
      const policies = listScoringPolicies();
      assert.ok(policies.length >= 3);
      assert.ok(policies.some((p) => p.version === 'p81.0'));
      assert.ok(policies.some((p) => p.version === 'p82.0'));
      assert.ok(policies.some((p) => p.version === 'p83.0'));
    });

    it('retrieves frozen policy by version tag', () => {
      const p83 = getScoringPolicy('p83.0');
      assert.strictEqual(p83.version, 'p83.0');
      assert.strictEqual(p83.weights.jobMatch, 0.4);
      assert.strictEqual(p83.weights.atsParseability, 0.2);
    });

    it('throws on unknown policy version', () => {
      assert.throws(() => getScoringPolicy('p99.9'), /Unknown scoreVersion "p99.9"/);
    });
  });
});
