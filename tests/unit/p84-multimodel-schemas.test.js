/**
 * @file Unit Tests: P84 Multi-Model Evaluation Schemas & Calibration Engine
 *
 * Verifies:
 * 1. Schema validation: valid, missing dimensions, out-of-range scores, invalid enums.
 * 2. Blindness: fixtures contain zero engine scores or expected scores.
 * 3. Deterministic engine isolation: external evaluations cannot alter engine scores.
 * 4. Consensus & conflict tiers: CONSENSUS (3/3), MAJORITY (2/3), MINORITY (1/3), CONFLICTING.
 * 5. Disagreement classification: LOW (<= 5), MODERATE (6-10), HIGH (> 10).
 * 6. Evidence integrity & claim provenance audits: NestJS (UNSUPPORTED), 40% metric (PARTIALLY_SUPPORTED).
 * 7. Safe vs. Unsafe vs. Conditional optimization taxonomy.
 * 8. Descriptive statistics: mean = 76.67, median = 78, range = 12.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MultiModelEvaluationRecordSchema,
  MultiModelScoresSchema,
  MultiModelCalibrationReportSchema,
  FindingConsensusLevelEnum,
  DisagreementLevelEnum,
  SafeOptimizationCategoryEnum,
} from '../../src/domain/career/calibration/multimodel-evaluation.schemas.js';

import {
  P84_CLAUDE_EVALUATION,
  P84_GEMINI_EVALUATION,
  P84_GROK_EVALUATION,
  P84_EVALUATIONS,
  P84_TARGET_JOB,
  P84_RESUME_TEXT,
  P84_JOB_SHA256,
  P84_RESUME_SHA256,
} from '../../src/domain/career/calibration/fixtures/p84-multimodel-fixtures.js';

import {
  calculateMultiModelStatistics,
  classifyDimensionDisagreement,
  extractFindingConsensus,
  auditClaimEvidenceProvenance,
  evaluateMultiModelCalibrationReport,
} from '../../src/domain/career/calibration/multimodel-calibration-engine.js';

describe('P84: Multi-Model Evaluation Schemas & Calibration Engine', () => {
  // ── 1. Schema Validation Tests ──────────────────────────────────────────────
  it('1. Validates schema conformance for Claude, Gemini, and Grok fixtures', () => {
    for (const ev of P84_EVALUATIONS) {
      const parsed = MultiModelEvaluationRecordSchema.parse(ev);
      assert.ok(parsed.evaluator.provider);
      assert.ok(parsed.evaluator.model);
      assert.equal(parsed.evaluationVersion, 'p84.0');
      assert.equal(parsed.resumeArtifactSha256.length, 64);
      assert.equal(parsed.jobDescriptionSha256.length, 64);
      assert.ok(parsed.criticalWeaknesses.length >= 4);
      assert.ok(parsed.strongestEvidence.length >= 4);
      assert.ok(parsed.atsRiskFlags.length >= 4);
      assert.ok(parsed.unsupportedOrSuspicious.length >= 2);
    }
  });

  it('2. Rejects evaluation records with missing dimensions or out-of-range scores', () => {
    // Missing dimension
    assert.throws(
      () =>
        MultiModelScoresSchema.parse({
          ats_parseability: 82,
          job_match: 70,
          keyword_coverage: 60,
          // content_quality omitted
          evidence_integrity: 66,
          human_recruiter_strength: 72,
          overall_resume_quality: 70,
        }),
      /content_quality/
    );

    // Out-of-range score (> 100)
    assert.throws(
      () =>
        MultiModelScoresSchema.parse({
          ats_parseability: 105,
          job_match: 70,
          keyword_coverage: 60,
          content_quality: 75,
          evidence_integrity: 66,
          human_recruiter_strength: 72,
          overall_resume_quality: 70,
        }),
      /Number must be less than or equal to 100/
    );

    // Negative score
    assert.throws(
      () =>
        MultiModelScoresSchema.parse({
          ats_parseability: -10,
          job_match: 70,
          keyword_coverage: 60,
          content_quality: 75,
          evidence_integrity: 66,
          human_recruiter_strength: 72,
          overall_resume_quality: 70,
        }),
      /Number must be greater than or equal to 0/
    );
  });

  // ── 2. Blindness & Anti-Anchoring Verification ─────────────────────────────
  it('3. Blindness Verification: Fixtures contain zero engine scores or expected thresholds', () => {
    for (const ev of P84_EVALUATIONS) {
      assert.equal(ev.engineScore, undefined, 'Evaluator must not contain engineScore');
      assert.equal(ev.expectedScore, undefined, 'Evaluator must not contain expectedScore');
      assert.equal(ev.targetThreshold, undefined, 'Evaluator must not contain targetThreshold');
      assert.equal(ev.benchmarkTarget, undefined, 'Evaluator must not contain benchmarkTarget');
    }
  });

  // ── 3. Deterministic Engine Isolation ──────────────────────────────────────
  it('4. Deterministic Engine Isolation: Importing external evaluations cannot alter engine scores', () => {
    const mockEngineReport = {
      publishableScore: 81,
      headlineScore: 81,
      atsParseabilityScore: 88,
      jobMatchScore: 78,
      contentQualityScore: 76,
      scoreVersion: 'p82.0',
    };

    const frozenOriginalScore = mockEngineReport.publishableScore;
    const calReport = evaluateMultiModelCalibrationReport({
      engineReport: mockEngineReport,
      evaluations: P84_EVALUATIONS,
    });

    assert.equal(
      mockEngineReport.publishableScore,
      frozenOriginalScore,
      'Deterministic engine score must remain strictly unchanged'
    );
    assert.equal(calReport.engineVsBenchmark.enginePublishableScore, frozenOriginalScore);
  });

  // ── 4. Descriptive Statistics & Disagreement Classification ───────────────
  it('5. Computes exact multi-model statistics: mean = 76.67, median = 78, range = 12', () => {
    const stats = calculateMultiModelStatistics(P84_EVALUATIONS);
    assert.equal(stats.claude, 70);
    assert.equal(stats.gemini, 82);
    assert.equal(stats.grok, 78);
    assert.equal(stats.external_model_mean, 76.67);
    assert.equal(stats.external_model_median, 78);
    assert.equal(stats.external_model_range, 12);
    assert.equal(stats.disagreementLevel, 'HIGH');
  });

  it('6. Classifies dimension disagreement accurately (LOW <= 5, MODERATE 6-10, HIGH > 10)', () => {
    const dimAgreement = classifyDimensionDisagreement(P84_EVALUATIONS);
    assert.equal(dimAgreement.length, 7);

    // ATS Parseability: 82, 88, 88 -> range = 6 (MODERATE)
    const parseability = dimAgreement.find((d) => d.dimension === 'ATS Parseability');
    assert.ok(parseability);
    assert.equal(parseability.range, 6);
    assert.equal(parseability.disagreementLevel, 'MODERATE');

    // Job Match: 70, 86, 78 -> range = 16 (HIGH)
    const jobMatch = dimAgreement.find((d) => d.dimension === 'Job Match');
    assert.ok(jobMatch);
    assert.equal(jobMatch.range, 16);
    assert.equal(jobMatch.disagreementLevel, 'HIGH');

    // Keyword Coverage: 60, 80, 72 -> range = 20 (HIGH)
    const keywordCov = dimAgreement.find((d) => d.dimension === 'Keyword Coverage');
    assert.ok(keywordCov);
    assert.equal(keywordCov.range, 20);
    assert.equal(keywordCov.disagreementLevel, 'HIGH');

    // Content Quality: 75, 75, 76 -> range = 1 (LOW)
    const contentQual = dimAgreement.find((d) => d.dimension === 'Content Quality');
    assert.ok(contentQual);
    assert.equal(contentQual.range, 1);
    assert.equal(contentQual.disagreementLevel, 'LOW');

    // Evidence Integrity: 66, 80, 82 -> range = 16 (HIGH)
    const evidenceInteg = dimAgreement.find((d) => d.dimension === 'Evidence Integrity');
    assert.ok(evidenceInteg);
    assert.equal(evidenceInteg.range, 16);
    assert.equal(evidenceInteg.disagreementLevel, 'HIGH');

    // Recruiter Strength: 72, 85, 80 -> range = 13 (HIGH)
    const recruiterStr = dimAgreement.find((d) => d.dimension === 'Recruiter Strength');
    assert.ok(recruiterStr);
    assert.equal(recruiterStr.range, 13);
    assert.equal(recruiterStr.disagreementLevel, 'HIGH');
  });

  // ── 5. Consensus & Conflict Extraction ─────────────────────────────────────
  it('7. Extracts finding consensus levels and blocks auto-optimizing on CONFLICTING findings', () => {
    const findings = extractFindingConsensus(P84_EVALUATIONS);

    // 3/3 agreement -> CONSENSUS
    const nestFinding = findings.find((f) => f.finding === 'NESTJS_UNSUPPORTED');
    assert.ok(nestFinding);
    assert.equal(nestFinding.agreementRate, 1.0);
    assert.equal(nestFinding.consensus, 'CONSENSUS');
    assert.equal(nestFinding.actionableForOptimizer, true);

    const metricFinding = findings.find(
      (f) => f.finding === 'METRIC_40_PERCENT_INSUFFICIENT_EVIDENCE'
    );
    assert.ok(metricFinding);
    assert.equal(metricFinding.agreementRate, 1.0);
    assert.equal(metricFinding.consensus, 'CONSENSUS');
    assert.equal(metricFinding.actionableForOptimizer, true);

    const degreeFinding = findings.find((f) => f.finding === 'DEGREE_FIELD_MISMATCH');
    assert.ok(degreeFinding);
    assert.equal(degreeFinding.agreementRate, 1.0);
    assert.equal(degreeFinding.consensus, 'CONSENSUS');

    // 2/3 agreement -> MAJORITY
    const flaskFinding = findings.find((f) => f.finding === 'FLASK_FASTAPI_AMBIGUOUS');
    assert.ok(flaskFinding);
    assert.equal(flaskFinding.agreementRate, 0.67);
    assert.equal(flaskFinding.consensus, 'MAJORITY');

    // 1/3 agreement -> MINORITY
    const drizzleFinding = findings.find((f) => f.finding === 'DRIZZLE_SOCKETIO_INSUFFICIENT');
    assert.ok(drizzleFinding);
    assert.equal(drizzleFinding.agreementRate, 0.33);
    assert.equal(drizzleFinding.consensus, 'MINORITY');
    assert.equal(drizzleFinding.actionableForOptimizer, false);

    // Contradicting models -> CONFLICTING (Redis satisfies NoSQL: Claude NO, Gemini YES, Grok RELATED)
    const redisFinding = findings.find((f) => f.finding === 'REDIS_SATISFIES_NOSQL');
    assert.ok(redisFinding);
    assert.equal(redisFinding.consensus, 'CONFLICTING');
    assert.equal(
      redisFinding.actionableForOptimizer,
      false,
      'Optimizer must NEVER automatically act on conflicting findings'
    );
  });

  // ── 6. Claim Evidence Provenance Auditing ──────────────────────────────────
  it('8. Audits claim evidence provenance: NestJS (UNSUPPORTED) and 40% metric (PARTIALLY_SUPPORTED)', () => {
    const mockStructuredResume = {
      summary: { text: 'Full stack engineer with Node.js and NestJS.' },
      skills: { categories: [{ categoryName: 'Backend', skills: ['Node.js', 'Express.js'] }] },
      projects: [{ name: 'Collaborative Task Manager', technologies: ['Node.js', 'Express.js'] }],
      experience: [
        {
          title: 'Intern',
          bullets: ['Optimized database queries, resulting in a 40% reduction in page load time.'],
        },
      ],
    };

    const mockCandidateProfile = {
      facts: [
        { text: 'Engineered RESTful APIs with Node.js and Express.' },
        { text: 'Reduced page load time during internship by 40%.' },
      ],
    };

    // NestJS audit
    const nestAudit = auditClaimEvidenceProvenance('NestJS', {
      candidateProfile: mockCandidateProfile,
      structuredResume: mockStructuredResume,
    });
    assert.equal(nestAudit.status, 'UNSUPPORTED');
    assert.equal(nestAudit.evidence.inSummary, true);
    assert.equal(nestAudit.evidence.inSkills, false);
    assert.equal(nestAudit.evidence.inProjects, false);
    assert.equal(nestAudit.optimizationSafety, 'UNSAFE');
    assert.ok(nestAudit.decision.includes('Prune NestJS'));

    // 40% metric audit
    const metricAudit = auditClaimEvidenceProvenance('40% page-load reduction', {
      candidateProfile: mockCandidateProfile,
      structuredResume: mockStructuredResume,
    });
    assert.equal(metricAudit.status, 'PARTIALLY_SUPPORTED');
    assert.equal(metricAudit.evidence.hasBaseline, false);
    assert.equal(metricAudit.evidence.hasMeasurementMethod, false);
    assert.equal(metricAudit.optimizationSafety, 'CONDITIONAL');

    // AWS audit
    const awsAudit = auditClaimEvidenceProvenance('AWS', {
      candidateProfile: mockCandidateProfile,
      structuredResume: mockStructuredResume,
    });
    assert.equal(awsAudit.status, 'UNSUPPORTED');
    assert.equal(awsAudit.optimizationSafety, 'UNSAFE');
    assert.ok(awsAudit.decision.includes('DO NOT add AWS'));
  });

  // ── 7. Multi-Model Calibration Report & Production Verdict ────────────────
  it('9. Emits complete MultiModelCalibrationReport with honest production verdict', () => {
    const mockEngineReport = {
      publishableScore: 81,
      headlineScore: 81,
      atsParseabilityScore: 88,
      jobMatchScore: 78,
      contentQualityScore: 76,
      scoreVersion: 'p82.0',
    };

    const report = evaluateMultiModelCalibrationReport({
      engineReport: mockEngineReport,
      evaluations: P84_EVALUATIONS,
    });

    assert.equal(report.benchmarkVersion, 'p84.0');
    assert.equal(report.scoreNaming, 'ATS Compatibility & Job Match Score');
    assert.equal(report.sampleSize, 1);
    assert.equal(report.isStatisticallySufficient, false);
    assert.equal(report.calibrationType, 'CASE_STUDY');
    assert.equal(
      report.productionVerdict,
      'IMPLEMENTATION COMPLETE / CALIBRATION EVIDENCE INSUFFICIENT FOR REAL-WORLD RECRUITER / ATS MARKET CLAIM'
    );
    assert.equal(report.overallStatistics.external_model_mean, 76.67);
    assert.equal(report.overallStatistics.external_model_median, 78);
    assert.equal(report.overallStatistics.external_model_range, 12);
  });
});
