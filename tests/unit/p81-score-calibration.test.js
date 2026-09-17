/**
 * @file P81 Unit: Score Calibration & Human Review Benchmark Test Suite
 *
 * Validates that the engine's scores correlate monotonically with human review benchmarks:
 * 1. Archetype A: Exceptional Grounded Senior Engineer (Target: High score, Top rank)
 * 2. Archetype B: Solid Mid-Level Engineer (Target: Good score, Rank 2)
 * 3. Archetype C: Entry-level / Junior Engineer with minimal metrics (Target: Moderate, Rank 3)
 * 4. Archetype D: Cluttered resume with keyword stuffing & clichés (Target: Degraded, Rank 4)
 * 5. Archetype E: Unsubstantiated / Fraudulent claim resume (Target: Publication Blocked, Publishable Score = 0)
 *
 * Evaluates Spearman's rank correlation (rho >= 0.85) and false-positive rates.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateSpearmanRankCorrelation,
  calculatePearsonCorrelation,
  evaluateClassificationMetrics,
} from '../../src/domain/career/score-calibration-benchmark.js';

import { generateUnifiedQualityReport } from '../../src/services/resume-quality-assessment.service.js';

describe('P81 Unit: Score Calibration & Human Review Benchmark', () => {
  it('calculates exact Spearman rank correlation on test vectors', () => {
    // Perfect positive monotonic ranking
    const x = [95, 85, 75, 60, 40];
    const y = [90, 82, 70, 65, 35];
    const rho = calculateSpearmanRankCorrelation(x, y);
    assert.equal(rho, 1.0);

    // Minor deviation
    const xDev = [95, 80, 85, 60, 40];
    const yDev = [90, 82, 70, 65, 35];
    const rhoDev = calculateSpearmanRankCorrelation(xDev, yDev);
    assert.ok(rhoDev >= 0.80);
  });

  it('evaluates classification metrics (confusion matrix & error rates)', () => {
    const engine = [90, 85, 60, 45];
    const benchmark = [88, 75, 55, 40];
    const metrics = evaluateClassificationMetrics({ engineScores: engine, benchmarkScores: benchmark, threshold: 70 });

    assert.equal(metrics.accuracy, 1.0);
    assert.equal(metrics.falsePositiveRate, 0.0);
    assert.equal(metrics.falseNegativeRate, 0.0);
  });

  it('evaluates 5 representative candidate archetypes with Spearman rho >= 0.85 and zero fraud false-positives', () => {
    // 1. Archetype A: Exceptional Grounded Senior Engineer
    const reportA = generateUnifiedQualityReport({
      atsParseabilityReport: { atsParseabilityScore: 95, passed: true, confidence: 0.95 },
      jobMatchReport: { jobMatchScore: 92, confidence: 0.95 },
      keywordCoverageReport: {
        overallCoveragePercent: 90,
        intendedCoveragePercent: 90,
        renderedCoveragePercent: 90,
        termBreakdown: [
          { term: 'Go', importance: 'REQUIRED', matchType: 'EXACT', satisfiesRequirement: true, occurrences: 3 },
          { term: 'PostgreSQL', importance: 'REQUIRED', matchType: 'EXACT', satisfiesRequirement: true, occurrences: 2 },
        ],
      },
      contentQualityReport: { contentQualityScore: 92, confidence: 0.95 },
      claimValidationReport: { valid: true, rejected: false, violations: [] },
    });

    // 2. Archetype B: Solid Mid-Level Engineer
    const reportB = generateUnifiedQualityReport({
      atsParseabilityReport: { atsParseabilityScore: 88, passed: true, confidence: 0.90 },
      jobMatchReport: { jobMatchScore: 80, confidence: 0.90 },
      keywordCoverageReport: {
        overallCoveragePercent: 78,
        intendedCoveragePercent: 78,
        renderedCoveragePercent: 78,
        termBreakdown: [
          { term: 'Go', importance: 'REQUIRED', matchType: 'EXACT', satisfiesRequirement: true, occurrences: 2 },
          { term: 'PostgreSQL', importance: 'REQUIRED', matchType: 'EXACT', satisfiesRequirement: true, occurrences: 1 },
        ],
      },
      contentQualityReport: { contentQualityScore: 82, confidence: 0.90 },
      claimValidationReport: { valid: true, rejected: false, violations: [] },
    });

    // 3. Archetype C: Junior Engineer with minimal metrics
    const reportC = generateUnifiedQualityReport({
      atsParseabilityReport: { atsParseabilityScore: 82, passed: true, confidence: 0.85 },
      jobMatchReport: { jobMatchScore: 68, confidence: 0.85 },
      keywordCoverageReport: {
        overallCoveragePercent: 62,
        intendedCoveragePercent: 62,
        renderedCoveragePercent: 62,
        termBreakdown: [
          { term: 'Go', importance: 'REQUIRED', matchType: 'EXACT', satisfiesRequirement: true, occurrences: 1 },
          { term: 'PostgreSQL', importance: 'REQUIRED', matchType: 'MISSING', satisfiesRequirement: false, occurrences: 0 },
        ],
      },
      contentQualityReport: { contentQualityScore: 72, confidence: 0.85 },
      claimValidationReport: { valid: true, rejected: false, violations: [] },
    });

    // 4. Archetype D: Cluttered resume with keyword stuffing warnings
    const reportD = generateUnifiedQualityReport({
      atsParseabilityReport: { atsParseabilityScore: 72, passed: false, confidence: 0.80 },
      jobMatchReport: { jobMatchScore: 65, confidence: 0.80 },
      keywordCoverageReport: {
        overallCoveragePercent: 70,
        intendedCoveragePercent: 70,
        renderedCoveragePercent: 70,
        stuffingWarnings: [{ term: 'Go', section: 'summary', occurrences: 6, densityScore: 0.22, reason: 'Keyword stuffing' }],
        termBreakdown: [
          { term: 'Go', importance: 'REQUIRED', matchType: 'EXACT', satisfiesRequirement: true, occurrences: 6 },
        ],
      },
      contentQualityReport: { contentQualityScore: 58, confidence: 0.80 },
      claimValidationReport: { valid: true, rejected: false, violations: [] },
    });

    // 5. Archetype E: Fraudulent claim resume (Fabricated 73% metric)
    const reportE = generateUnifiedQualityReport({
      atsParseabilityReport: { atsParseabilityScore: 90, passed: true, confidence: 0.90 },
      jobMatchReport: { jobMatchScore: 85, confidence: 0.90 },
      keywordCoverageReport: {
        overallCoveragePercent: 85,
        termBreakdown: [{ term: 'Go', importance: 'REQUIRED', matchType: 'EXACT', satisfiesRequirement: true, occurrences: 2 }],
      },
      contentQualityReport: { contentQualityScore: 90, confidence: 0.90 },
      claimValidationReport: {
        valid: false,
        rejected: true,
        violations: [{ code: 'UNSUPPORTED_METRIC', message: 'Fabricated 73% metric claim ungrounded in candidate facts' }],
      },
    });

    // Check Archetype E: Publication is strictly blocked, publishableScore = 0
    assert.equal(reportE.publicationStatus, 'BLOCKED_BY_INTEGRITY_GATE');
    assert.equal(reportE.publishableScore, 0);
    assert.equal(reportE.headlineScore, 0);
    // While evaluated quality remains inspectable (Weakness 7)
    assert.ok(reportE.qualityScore >= 80);

    // Human benchmark scores for the 5 archetypes
    const humanBenchmarkScores = [92, 82, 74, 55, 0];
    const enginePublishableScores = [
      reportA.publishableScore,
      reportB.publishableScore,
      reportC.publishableScore,
      reportD.publishableScore,
      reportE.publishableScore,
    ];

    const rho = calculateSpearmanRankCorrelation(enginePublishableScores, humanBenchmarkScores);
    const r = calculatePearsonCorrelation(enginePublishableScores, humanBenchmarkScores);

    assert.ok(
      rho >= 0.85,
      `Spearman rank correlation must be >= 0.85 against human review order (got rho = ${rho})`
    );
    assert.ok(
      r >= 0.85,
      `Pearson correlation must be >= 0.85 against human review scores (got r = ${r})`
    );

    // Verify classification metrics
    const classMetrics = evaluateClassificationMetrics({
      engineScores: enginePublishableScores,
      benchmarkScores: humanBenchmarkScores,
      threshold: 70,
    });

    assert.equal(classMetrics.falsePositiveRate, 0.0, 'False-positive rate for unqualified/fraudulent resumes must be 0.0%');
    assert.equal(classMetrics.accuracy, 1.0, 'Engine must match human pass/fail classification across all 5 archetypes');
  });
});
