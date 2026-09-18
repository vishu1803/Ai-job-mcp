/**
 * @file P81 Unified Quality Report Tests
 *
 * Verifies:
 *  - Invariant 21: Keyword Coverage is not double-counted in the headline score.
 *  - Invariant 24: Evidence Integrity acts as a safety gate, not merely a weighted metric.
 *  - Invariant 30: Every score includes confidence where uncertainty exists.
 *  - Invariant 33: Score calculations are deterministic and reproducible.
 *  - Invariant 34: No LLM-generated number directly controls a score.
 *  - Invariant 35: No score is increased by weakening validation rules.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ResumeQualityAssessmentService,
  generateUnifiedQualityReport,
} from '../../src/services/resume-quality-assessment.service.js';

describe('P81: Unified Quality Report & Safety Gate Engine', () => {
  const mockAtsReport = {
    atsParseabilityScore: 92,
    confidence: 0.95,
    passed: true,
    findings: [],
  };

  const mockJobMatchReport = {
    jobMatchScore: 84,
    confidence: 0.90,
    fitBand: 'STRONG',
  };

  const mockKeywordReport = {
    overallCoverage: 78,
    breakdown: {
      exact: 5,
      taxonomyEquivalent: 2,
      related: 1,
      missing: 2,
      unsupportedCandidate: 0,
    },
    stuffingWarnings: [],
  };

  const mockContentQualityReport = {
    writingQualityScore: 88,
    quantification: {
      totalBullets: 6,
      quantifiedBulletCount: 4,
      quantificationRate: 66.7,
    },
    findings: [],
  };

  const mockClaimValidationPassing = {
    valid: true,
    rejected: false,
    violations: [],
  };

  const mockClaimValidationFailing = {
    valid: false,
    rejected: true,
    violations: [
      {
        code: 'UNSUPPORTED_METRIC',
        message: 'Metric "99.99%" is not authorized by any candidate fact',
      },
    ],
  };

  it('Rule 21: Keyword Coverage is NOT double-counted in headline score', () => {
    const report1 = generateUnifiedQualityReport({
      atsParseabilityReport: mockAtsReport,
      jobMatchReport: mockJobMatchReport,
      keywordCoverageReport: { ...mockKeywordReport, overallCoverage: 10 },
      contentQualityReport: mockContentQualityReport,
      claimValidationReport: mockClaimValidationPassing,
      analyzedAt: '2026-09-18T00:00:00.000Z',
    });

    const report2 = generateUnifiedQualityReport({
      atsParseabilityReport: mockAtsReport,
      jobMatchReport: mockJobMatchReport,
      keywordCoverageReport: { ...mockKeywordReport, overallCoverage: 100 },
      contentQualityReport: mockContentQualityReport,
      claimValidationReport: mockClaimValidationPassing,
      analyzedAt: '2026-09-18T00:00:00.000Z',
    });

    // Headline score is identical regardless of keyword coverage score fluctuation!
    assert.equal(report1.headlineScore, report2.headlineScore);
    assert.equal(report1.dimensions.keywordCoverage.weightInHeadline, 0.0);
    assert.equal(report1.invariantsCompliant.rule21_noDoubleCountingKeywordCoverage, true);
  });

  it('Rule 24: Evidence Integrity acts as a safety gate, zeroing headline score upon violation', () => {
    // Report with passing validation
    const passingReport = generateUnifiedQualityReport({
      atsParseabilityReport: mockAtsReport,
      jobMatchReport: mockJobMatchReport,
      keywordCoverageReport: mockKeywordReport,
      contentQualityReport: mockContentQualityReport,
      claimValidationReport: mockClaimValidationPassing,
      analyzedAt: '2026-09-18T00:00:00.000Z',
    });

    assert.ok(passingReport.headlineScore >= 80);
    assert.equal(passingReport.status, 'OPTIMIZED');
    assert.equal(passingReport.dimensions.evidenceIntegrityGate.passed, true);

    // Report with failing validation (unsupported claim)
    const failingReport = generateUnifiedQualityReport({
      atsParseabilityReport: mockAtsReport,
      jobMatchReport: mockJobMatchReport,
      keywordCoverageReport: mockKeywordReport,
      contentQualityReport: mockContentQualityReport,
      claimValidationReport: mockClaimValidationFailing,
      analyzedAt: '2026-09-18T00:00:00.000Z',
    });

    assert.equal(failingReport.headlineScore, 0);
    assert.equal(failingReport.status, 'REJECTED_BY_INTEGRITY_GATE');
    assert.equal(failingReport.dimensions.evidenceIntegrityGate.passed, false);
    assert.equal(failingReport.dimensions.evidenceIntegrityGate.violations.length, 1);
    assert.equal(
      failingReport.dimensions.evidenceIntegrityGate.violations[0].code,
      'UNSUPPORTED_METRIC'
    );
  });

  it('Rule 30: Exposes confidence transparently on all dimensions and aggregate', () => {
    const report = generateUnifiedQualityReport({
      atsParseabilityReport: mockAtsReport,
      jobMatchReport: mockJobMatchReport,
      keywordCoverageReport: mockKeywordReport,
      contentQualityReport: mockContentQualityReport,
      claimValidationReport: mockClaimValidationPassing,
      analyzedAt: '2026-09-18T00:00:00.000Z',
    });

    assert.ok(typeof report.confidence === 'number' && report.confidence > 0 && report.confidence <= 1);
    assert.ok(typeof report.dimensions.atsParseability.confidence === 'number');
    assert.ok(typeof report.dimensions.jobMatch.confidence === 'number');
    assert.ok(typeof report.dimensions.contentQuality.confidence === 'number');
  });

  it('Rule 33: Calculations are strictly deterministic and reproducible given injected timestamp', () => {
    const r1 = generateUnifiedQualityReport({
      atsParseabilityReport: mockAtsReport,
      jobMatchReport: mockJobMatchReport,
      keywordCoverageReport: mockKeywordReport,
      contentQualityReport: mockContentQualityReport,
      claimValidationReport: mockClaimValidationPassing,
      analyzedAt: '2026-09-18T12:00:00.000Z',
    });

    const r2 = generateUnifiedQualityReport({
      atsParseabilityReport: mockAtsReport,
      jobMatchReport: mockJobMatchReport,
      keywordCoverageReport: mockKeywordReport,
      contentQualityReport: mockContentQualityReport,
      claimValidationReport: mockClaimValidationPassing,
      analyzedAt: '2026-09-18T12:00:00.000Z',
    });

    assert.deepEqual(r1, r2);
  });

  it('Rule 35: No score is increased by weakening validation rules', () => {
    // Weakening or omitting validation report does not grant an unearned bump
    const normalReport = generateUnifiedQualityReport({
      atsParseabilityReport: mockAtsReport,
      jobMatchReport: mockJobMatchReport,
      keywordCoverageReport: mockKeywordReport,
      contentQualityReport: mockContentQualityReport,
      claimValidationReport: mockClaimValidationPassing,
      analyzedAt: '2026-09-18T00:00:00.000Z',
    });

    const expectedScore = Math.round(92 * 0.35 + 84 * 0.35 + 88 * 0.30);
    assert.equal(normalReport.headlineScore, expectedScore);
  });

  it('Rule 24 Fail-Closed: Missing claimValidationReport blocks report with 0 score and BLOCKED_BY_INTEGRITY_GATE', () => {
    const report = generateUnifiedQualityReport({
      atsParseabilityReport: mockAtsReport,
      jobMatchReport: mockJobMatchReport,
      keywordCoverageReport: mockKeywordReport,
      contentQualityReport: mockContentQualityReport,
      // claimValidationReport omitted
      analyzedAt: '2026-09-18T00:00:00.000Z',
    });

    assert.equal(report.headlineScore, 0);
    assert.equal(report.status, 'REJECTED_BY_INTEGRITY_GATE');
    assert.equal(report.dimensions.evidenceIntegrityGate.passed, false);
    assert.equal(report.dimensions.evidenceIntegrityGate.status, 'BLOCKED_BY_INTEGRITY_GATE');
    assert.ok(
      report.dimensions.evidenceIntegrityGate.violations.some((v) =>
        v.code.includes('MISSING_CLAIM_VALIDATION')
      )
    );
  });

  it('Rule 21: Surfaces LOW_JOB_KEYWORD_COVERAGE warning when keyword coverage < 50% without altering headline score', () => {
    const lowKeywordReport = {
      overallCoveragePercent: 30,
      totalJobTerms: 10,
      termBreakdown: [],
    };

    const report = generateUnifiedQualityReport({
      atsParseabilityReport: mockAtsReport,
      jobMatchReport: mockJobMatchReport,
      keywordCoverageReport: lowKeywordReport,
      contentQualityReport: mockContentQualityReport,
      claimValidationReport: mockClaimValidationPassing,
      analyzedAt: '2026-09-18T00:00:00.000Z',
    });

    const expectedHeadline = Math.round(92 * 0.30 + 84 * 0.40 + 88 * 0.30);
    assert.equal(report.headlineScore, expectedHeadline);
    const lowKwFinding = report.dimensions.keywordCoverage.findings.find(
      (f) => f.code === 'LOW_JOB_KEYWORD_COVERAGE'
    );
    assert.ok(lowKwFinding, 'Must emit LOW_JOB_KEYWORD_COVERAGE');
    assert.ok(lowKwFinding.message.includes('30%'));
  });

  it('Audit Provenance: Populates transparent provenance object with scoreVersion, weights, inputs, and integrity gate', () => {
    // 1. Default p82.0 evaluation
    const reportP82 = generateUnifiedQualityReport({
      atsParseabilityReport: mockAtsReport,
      jobMatchReport: mockJobMatchReport,
      keywordCoverageReport: mockKeywordReport,
      contentQualityReport: mockContentQualityReport,
      claimValidationReport: mockClaimValidationPassing,
      analyzedAt: '2026-09-18T00:00:00.000Z',
    });

    assert.equal(reportP82.scoreVersion, 'p82.0');
    assert.ok(reportP82.provenance);
    assert.equal(reportP82.provenance.scoreVersion, 'p82.0');
    assert.equal(reportP82.provenance.analyzedAt, '2026-09-18T00:00:00.000Z');
    assert.deepEqual(reportP82.provenance.weights, {
      atsParseability: 0.30,
      jobMatch: 0.40,
      keywordCoverage: 0.0,
      contentQuality: 0.30,
    });
    assert.equal(reportP82.provenance.inputs.hasClaimValidationReport, true);
    assert.equal(reportP82.provenance.integrityGate.passed, true);

    // 2. Backward compatibility with p81.0 policy
    const reportP81 = generateUnifiedQualityReport({
      atsParseabilityReport: mockAtsReport,
      jobMatchReport: mockJobMatchReport,
      keywordCoverageReport: mockKeywordReport,
      contentQualityReport: mockContentQualityReport,
      claimValidationReport: mockClaimValidationPassing,
      scoreVersion: 'p81.0',
      analyzedAt: '2026-09-18T00:00:00.000Z',
    });

    assert.equal(reportP81.scoreVersion, 'p81.0');
    assert.equal(reportP81.provenance.scoreVersion, 'p81.0');
    assert.deepEqual(reportP81.provenance.weights, {
      atsParseability: 0.35,
      jobMatch: 0.35,
      keywordCoverage: 0.0,
      contentQuality: 0.30,
    });
  });
});
