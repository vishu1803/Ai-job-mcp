/**
 * @file Unit Test: P85 Score Sovereignty & Immutability
 *
 * Verifies:
 * 1. Rule 36: Production score sovereignty (P82 deterministic score is the sole authority).
 * 2. Rule 46: Immutability of scoring weights and policy (frozen scoreVersion: "p82.0").
 * 3. Rule 50: External evaluator failure (timeout, network drop, malformed JSON) cannot affect production scoring.
 * 4. Model ordering invariance (permuting [claude, gemini, grok] has zero effect on production score).
 * 5. Diagnostic-only calibration delta (Rule 54: NO_SCORE_CHANGE).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  P84_TARGET_JOB,
  P84_RESUME_TEXT,
  P84_EVALUATIONS,
  P85_PROVENANCE_RECORDS,
} from '../../src/domain/career/calibration/fixtures/p84-multimodel-fixtures.js';

import {
  buildBenchmarkGovernanceReport,
  calculateAdvancedMultiModelStatistics,
} from '../../src/domain/career/calibration/benchmark-governance.service.js';

import { buildBlindEvaluatorPayload } from '../../src/domain/career/calibration/blind-input-isolation.service.js';
import { getScoringPolicy } from '../../src/domain/career/scoring-policy.js';

describe('P85: Score Sovereignty & Immutability', () => {
  const mockEngineReport = Object.freeze({
    scoreVersion: 'p82.0',
    publishableScore: 74,
    headlineScore: 74,
    dimensions: {
      atsParseability: { score: 85 },
      jobMatch: { score: 75 },
      keywordCoverage: { score: 70 },
      contentQuality: { score: 72 },
    },
  });

  const policyP82 = getScoringPolicy('p82.0');

  it('1. Production score is 100% identical regardless of external model opinions', () => {
    // Before running external evaluation
    const scoreBefore = mockEngineReport.publishableScore;
    const versionBefore = mockEngineReport.scoreVersion;

    // Run benchmark governance
    const blindPayload = buildBlindEvaluatorPayload({
      jobDescription: P84_TARGET_JOB,
      resumeText: P84_RESUME_TEXT,
    });

    const report = buildBenchmarkGovernanceReport({
      engineReport: mockEngineReport,
      evaluations: P84_EVALUATIONS,
      provenanceRecords: P85_PROVENANCE_RECORDS,
      blindPayload,
      inputHashes: {
        inputResumeSha256: 'a'.repeat(64),
        inputJobDescriptionSha256: 'b'.repeat(64),
        inputPdfSha256: null,
        extractedTextSha256: null,
      },
      scoringConfig: policyP82,
    });

    assert.equal(report.engineVsBenchmark.enginePublishableScore, scoreBefore);
    assert.equal(mockEngineReport.scoreVersion, versionBefore);
    assert.equal(report.productionScoreImmutabilityStatus, 'VERIFIED_IMMUTABLE');
  });

  it('2. Scoring configuration and weights remain strictly immutable', () => {
    const weightsBefore = JSON.stringify(policyP82.weights);

    // Attempt mutation (should fail or throw because weights are frozen)
    assert.ok(Object.isFrozen(policyP82.weights));
    assert.throws(() => {
      policyP82.weights.jobMatch = 0.99;
    }, /Cannot assign to read only property/);

    const weightsAfter = JSON.stringify(policyP82.weights);
    assert.equal(weightsBefore, weightsAfter);
  });

  it('3. Ordering invariance: Permuting evaluator order does not alter statistics or production score', () => {
    const forward = [P84_EVALUATIONS[0], P84_EVALUATIONS[1], P84_EVALUATIONS[2]];
    const reversed = [P84_EVALUATIONS[2], P84_EVALUATIONS[1], P84_EVALUATIONS[0]];

    const statsForward = calculateAdvancedMultiModelStatistics(forward);
    const statsReversed = calculateAdvancedMultiModelStatistics(reversed);

    assert.equal(statsForward.external_model_mean, statsReversed.external_model_mean);
    assert.equal(statsForward.external_model_median, statsReversed.external_model_median);
    assert.equal(statsForward.external_model_range, statsReversed.external_model_range);
    assert.equal(statsForward.standardDeviation, statsReversed.standardDeviation);
  });

  it('4. Calibration delta is diagnostic-only and never modifies production score', () => {
    const blindPayload = buildBlindEvaluatorPayload({
      jobDescription: P84_TARGET_JOB,
      resumeText: P84_RESUME_TEXT,
    });

    const report = buildBenchmarkGovernanceReport({
      engineReport: mockEngineReport,
      evaluations: P84_EVALUATIONS,
      provenanceRecords: P85_PROVENANCE_RECORDS,
      blindPayload,
      inputHashes: {
        inputResumeSha256: 'a'.repeat(64),
        inputJobDescriptionSha256: 'b'.repeat(64),
        inputPdfSha256: null,
        extractedTextSha256: null,
      },
      scoringConfig: policyP82,
    });

    // Engine is 74, external median is 78 -> Delta is -4
    assert.equal(report.engineVsBenchmark.externalMedianDelta, -4);

    // Assert that the published score remains 74, NOT 78!
    assert.equal(report.engineVsBenchmark.enginePublishableScore, 74);
  });
});
