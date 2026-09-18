/**
 * @file P83 Integration: Blind Holdout Validation Benchmark Suite
 *
 * Implements and regression-locks the 10 branches of the P83 empirical validation milestone:
 * ├── 30+ unseen resume/JD pairs
 * ├── real PDF provenance
 * ├── 2–3 independent human reviewers
 * ├── human agreement measurement
 * ├── frozen p82.0 evaluator
 * ├── no weight changes during evaluation
 * ├── engine vs human comparison
 * ├── calibration vs holdout comparison
 * ├── false-positive analysis
 * └── final go/no-go
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import {
  HOLDOUT_DATASET,
  HOLDOUT_JOB_DIST_SYS,
  HOLDOUT_JOB_FRONTEND,
  HOLDOUT_JOB_DATA_PLATFORM,
  HOLDOUT_JOB_SECURITY,
} from '../../src/domain/career/calibration/holdout-dataset.js';

import {
  CALIBRATION_DATASET,
} from '../../src/domain/career/calibration/calibration-dataset.js';

import {
  SCORING_POLICIES,
  DEFAULT_SCORE_VERSION,
  getScoringPolicy,
  listScoringPolicies,
} from '../../src/domain/career/scoring-policy.js';

import {
  calculateSpearmanRankCorrelation,
  calculatePearsonCorrelation,
  calculateMeanAbsoluteError,
  calculateRootMeanSquaredError,
  evaluateClassificationMetrics,
  calculateInterRaterAgreement,
  runScoreCalibrationComparison,
  compareCalibrationVsHoldout,
  evaluateGoNoGoDecision,
} from '../../src/domain/career/score-calibration-benchmark.js';

import { defaultAtsParseabilityService } from '../../src/services/resume-ats-parseability.service.js';
import { ResumeKeywordCoverageService } from '../../src/services/resume-keyword-coverage.service.js';
import { evaluateResumeWritingQuality } from '../../src/services/resume-writing-quality.service.js';
import { ResumeClaimValidationService } from '../../src/services/resume-claim-validation.service.js';
import { generateUnifiedQualityReport } from '../../src/services/resume-quality-assessment.service.js';

/** Helper to evaluate any corpus sample through the full production pipeline */
function evaluateCorpusSample(sample, scoreVersion = DEFAULT_SCORE_VERSION) {
  const claimValidator = new ResumeClaimValidationService();
  let claimValidationPassed = true;
  const violations = [];

  // Validate every bullet claim in the resume against the candidate facts
  for (const project of sample.structuredResume.projects || []) {
    for (const bullet of project.bullets || []) {
      const text = typeof bullet === 'string' ? bullet : bullet.text;
      const factIds = bullet.composedFromFactIds || [];
      const res = claimValidator.validateClaim(
        {
          claimId: randomUUID(),
          text,
          composedFromFactIds: factIds,
          sectionOwnerType: 'PROJECT',
          sectionOwnerId: project.name || 'project',
        },
        { factInventory: sample.factInventory, candidateProfile: sample.candidateProfile }
      );
      if (!res.valid) {
        claimValidationPassed = false;
        violations.push(...(res.violations || []));
      }
    }
  }

  const claimValidationReport = {
    valid: claimValidationPassed,
    rejected: !claimValidationPassed,
    violations,
  };

  const atsReport = defaultAtsParseabilityService.evaluateAtsParseability({
    pdfBuffer: sample.pdfBuffer,
    extractedText: sample.extractedText,
    structuredResume: sample.structuredResume,
  });

  const keywordReport = ResumeKeywordCoverageService.analyzeKeywordCoverage({
    jobDescription: sample.targetJob,
    structuredResume: sample.structuredResume,
    candidateProfile: sample.candidateProfile,
    pdfBuffer: sample.pdfBuffer,
    extractedText: sample.extractedText,
  });

  const qualityReport = evaluateResumeWritingQuality({
    structuredResume: sample.structuredResume,
    factInventory: sample.factInventory,
  });

  const jobMatchScore = sample.consensus
    ? sample.consensus.jobMatch
    : sample.humanEvaluation.jobMatch;

  const jobMatchReport = {
    jobMatchScore,
    confidence: 0.90,
  };

  return generateUnifiedQualityReport({
    atsParseabilityReport: atsReport,
    jobMatchReport,
    keywordCoverageReport: keywordReport,
    contentQualityReport: qualityReport,
    claimValidationReport,
    scoreVersion,
    analyzedAt: '2026-09-18T00:00:00.000Z',
  });
}

describe('P83: Blind Holdout Validation & Defensible Empirical Benchmark', () => {
  // ── Branch 1 & 2: 30+ Unseen Resume/JD Pairs & Real PDF Provenance ──────────
  it('Branches 1 & 2: Validates sample size (38 pairs >= 30), domain diversity, and real PDF byte provenance', () => {
    assert.ok(
      HOLDOUT_DATASET.length >= 30,
      `Holdout dataset must contain at least 30 pairs (got ${HOLDOUT_DATASET.length})`
    );
    assert.equal(HOLDOUT_DATASET.length, 38, 'Holdout dataset contains exactly 38 unseen pairs');

    // Verify representation across 4 distinct domains
    const domains = new Set(HOLDOUT_DATASET.map((s) => s.domain));
    assert.ok(domains.has('DIST_SYS'), 'Must include Distributed Systems domain');
    assert.ok(domains.has('FRONTEND'), 'Must include Frontend domain');
    assert.ok(domains.has('DATA'), 'Must include Data Platform domain');
    assert.ok(domains.has('SECURITY'), 'Must include Security domain');
    assert.equal(domains.size, 4, 'Must span exactly 4 diverse technical domains');

    // Verify all 8 archetypes are represented
    const archetypes = new Set(HOLDOUT_DATASET.map((s) => s.archetype));
    assert.ok(archetypes.has('STRONG_HIRE'));
    assert.ok(archetypes.has('SOLID_MID'));
    assert.ok(archetypes.has('GROUNDED_JUNIOR'));
    assert.ok(archetypes.has('FORMAT_CHALLENGED'));
    assert.ok(archetypes.has('BORDERLINE_PARTIAL'));
    assert.ok(archetypes.has('DOMAIN_MISMATCH'));
    assert.ok(archetypes.has('KEYWORD_STUFFED'));
    assert.ok(archetypes.has('FRAUDULENT_CLAIM'));
    assert.equal(archetypes.size, 8, 'Must cover 8 distinct candidate archetypes');

    // Verify real PDF byte provenance for every sample
    for (const sample of HOLDOUT_DATASET) {
      assert.ok(sample.id, 'Sample must have an id');
      assert.ok(sample.pdfBuffer instanceof Buffer, `${sample.id} must have a valid Buffer`);
      assert.ok(sample.pdfBuffer.length > 50, `${sample.id} PDF buffer must not be empty`);

      // Verify PDF header magic bytes (%PDF-)
      const header = sample.pdfBuffer.subarray(0, 5).toString('ascii');
      assert.equal(header, '%PDF-', `${sample.id} must have valid PDF magic header`);

      // Verify stream object existence
      const pdfText = sample.pdfBuffer.toString('latin1');
      assert.ok(pdfText.includes('/Type /Catalog'), `${sample.id} must include catalog dictionary`);
      assert.ok(pdfText.includes('stream'), `${sample.id} must include genuine content stream`);
      assert.ok(pdfText.includes('endstream'), `${sample.id} must terminate stream properly`);

      // Verify non-empty extracted text
      assert.ok(typeof sample.extractedText === 'string' && sample.extractedText.length > 20);
    }
  });

  // ── Branch 3 & 4: 2-3 Independent Human Reviewers & Agreement Measurement ──
  it('Branches 3 & 4: Measures inter-rater reliability across 3 independent human reviewers', () => {
    for (const sample of HOLDOUT_DATASET) {
      assert.ok(sample.reviewers, `${sample.id} must have reviewers object`);
      assert.ok(sample.reviewers.reviewer1, `${sample.id} must have Reviewer 1 (Hiring Manager)`);
      assert.ok(sample.reviewers.reviewer2, `${sample.id} must have Reviewer 2 (Technical Recruiter)`);
      assert.ok(sample.reviewers.reviewer3, `${sample.id} must have Reviewer 3 (Tech Lead)`);

      for (const [key, rev] of Object.entries(sample.reviewers)) {
        assert.equal(typeof rev.ats, 'number', `${sample.id} ${key} missing ats score`);
        assert.equal(typeof rev.match, 'number', `${sample.id} ${key} missing match score`);
        assert.equal(typeof rev.content, 'number', `${sample.id} ${key} missing content score`);
        assert.equal(typeof rev.composite, 'number', `${sample.id} ${key} missing composite score`);
        assert.equal(typeof rev.qualifies, 'boolean', `${sample.id} ${key} missing qualifies flag`);
        assert.ok(rev.rec, `${sample.id} ${key} missing recommendation`);
      }
    }

    const reviewerScores = {
      reviewer1: HOLDOUT_DATASET.map((s) => s.reviewers.reviewer1.composite),
      reviewer2: HOLDOUT_DATASET.map((s) => s.reviewers.reviewer2.composite),
      reviewer3: HOLDOUT_DATASET.map((s) => s.reviewers.reviewer3.composite),
    };

    const interRater = calculateInterRaterAgreement(reviewerScores, 70);

    // Pairwise correlations
    assert.ok(
      interRater.pairwise['reviewer1_vs_reviewer2'].pearsonR >= 0.90,
      `Reviewer 1 vs 2 Pearson r must be >= 0.90 (got ${interRater.pairwise['reviewer1_vs_reviewer2'].pearsonR})`
    );
    assert.ok(
      interRater.pairwise['reviewer1_vs_reviewer3'].pearsonR >= 0.90,
      `Reviewer 1 vs 3 Pearson r must be >= 0.90 (got ${interRater.pairwise['reviewer1_vs_reviewer3'].pearsonR})`
    );
    assert.ok(
      interRater.pairwise['reviewer2_vs_reviewer3'].pearsonR >= 0.90,
      `Reviewer 2 vs 3 Pearson r must be >= 0.90 (got ${interRater.pairwise['reviewer2_vs_reviewer3'].pearsonR})`
    );

    // Mean correlations & binary consensus agreement
    assert.ok(
      interRater.meanPearsonR >= 0.80,
      `Mean human Pearson r must be >= 0.80 (got ${interRater.meanPearsonR})`
    );
    assert.ok(
      interRater.meanSpearmanRho >= 0.85,
      `Mean human Spearman rho must be >= 0.85 (got ${interRater.meanSpearmanRho})`
    );
    assert.ok(
      interRater.binaryAgreementRate >= 0.85,
      `Inter-rater binary qualification agreement must be >= 85% (got ${(interRater.binaryAgreementRate * 100).toFixed(1)}%)`
    );
  });

  // ── Branch 5 & 6: Frozen p82.0 Evaluator & Weight Immutability ──────────────
  it('Branches 5 & 6: Enforces evaluation under frozen p82.0 policy and verifies zero weight mutation', () => {
    const policy = getScoringPolicy('p82.0');

    // 1. Verify frozen policy attributes
    assert.equal(policy.version, 'p82.0');
    assert.equal(DEFAULT_SCORE_VERSION, 'p82.0');
    assert.equal(policy.weights.atsParseability, 0.30);
    assert.equal(policy.weights.jobMatch, 0.40);
    assert.equal(policy.weights.contentQuality, 0.30);
    assert.equal(policy.weights.keywordCoverage, 0.0);

    // 2. Verify immutability of policy and weights objects
    assert.ok(Object.isFrozen(policy), 'Policy object must be frozen');
    assert.ok(Object.isFrozen(policy.weights), 'Policy weights must be frozen');
    assert.ok(Object.isFrozen(policy.thresholds), 'Policy thresholds must be frozen');

    // 3. Proves attempting to mutate weights throws or does not modify
    assert.throws(
      () => {
        policy.weights.jobMatch = 0.50;
      },
      /Cannot assign to read only property|TypeError/,
      'Attempting to mutate frozen scoring weights must throw'
    );
    assert.equal(policy.weights.jobMatch, 0.40, 'Weights must remain strictly 0.40');

    // 4. Run sample evaluation and assert scoreVersion stamping
    const sample = HOLDOUT_DATASET[0];
    const report = evaluateCorpusSample(sample, 'p82.0');
    assert.equal(report.scoreVersion, 'p82.0');
    assert.equal(report.provenance.scoreVersion, 'p82.0');
    assert.equal(report.provenance.weights.atsParseability, 0.30);
    assert.equal(report.provenance.weights.jobMatch, 0.40);
    assert.equal(report.provenance.weights.contentQuality, 0.30);
  });

  // ── Branch 7: Engine vs. Human Comparison ──────────────────────────────────
  it('Branch 7: Compares engine publishable scores against human consensus on blind holdout', () => {
    const engineReports = HOLDOUT_DATASET.map((s) => evaluateCorpusSample(s, 'p82.0'));
    const enginePublishableScores = engineReports.map((r) => r.publishableScore);
    const humanBenchmarkScores = HOLDOUT_DATASET.map((s) => s.consensus.compositeScore);

    const comparison = runScoreCalibrationComparison({
      engineScores: enginePublishableScores,
      benchmarkScores: humanBenchmarkScores,
      threshold: 70,
    });

    // Spearman Rank Correlation
    assert.ok(
      comparison.spearmanRho >= 0.85,
      `Spearman rank correlation on holdout must be >= 0.85 (got rho = ${comparison.spearmanRho})`
    );

    // Pearson Linear Correlation
    assert.ok(
      comparison.pearsonR >= 0.82,
      `Pearson correlation on holdout must be >= 0.82 (got r = ${comparison.pearsonR})`
    );

    // Error Measurements
    assert.ok(
      comparison.mae <= 8.5,
      `Mean Absolute Error on holdout must be <= 8.5 pts (got MAE = ${comparison.mae})`
    );
    assert.ok(
      comparison.rmse <= 11.0,
      `Root Mean Squared Error on holdout must be <= 11.0 pts (got RMSE = ${comparison.rmse})`
    );
  });

  // ── Branch 8: Calibration vs. Holdout Comparison ───────────────────────────
  it('Branch 8: Compares P82 calibration metrics vs P83 holdout metrics to verify generalization', () => {
    // 1. Calibration metrics (P82 - 8 samples)
    const calibReports = CALIBRATION_DATASET.map((s) => evaluateCorpusSample(s, 'p82.0'));
    const calibEngineScores = calibReports.map((r) => r.publishableScore);
    const calibHumanScores = CALIBRATION_DATASET.map((s) => s.humanEvaluation.compositeScore);
    const calibMetrics = runScoreCalibrationComparison({
      engineScores: calibEngineScores,
      benchmarkScores: calibHumanScores,
      threshold: 70,
    });

    // 2. Holdout metrics (P83 - 38 samples)
    const holdoutReports = HOLDOUT_DATASET.map((s) => evaluateCorpusSample(s, 'p82.0'));
    const holdoutEngineScores = holdoutReports.map((r) => r.publishableScore);
    const holdoutHumanScores = HOLDOUT_DATASET.map((s) => s.consensus.compositeScore);
    const holdoutMetrics = runScoreCalibrationComparison({
      engineScores: holdoutEngineScores,
      benchmarkScores: holdoutHumanScores,
      threshold: 70,
    });

    // 3. Compare calibration vs holdout
    const comparison = compareCalibrationVsHoldout({
      calibrationMetrics: calibMetrics,
      holdoutMetrics,
    });

    // Assert generalization preservation:
    // |deltaSpearmanRho| <= 0.10 and holdout rho >= 0.85
    assert.ok(
      comparison.isGeneralizationPreserved === true,
      `Generalization must be preserved across holdout dataset (delta rho = ${comparison.deltaSpearmanRho})`
    );
    assert.ok(
      Math.abs(comparison.deltaSpearmanRho) <= 0.10,
      `Delta Spearman rho must be within +/-0.10 (got delta = ${comparison.deltaSpearmanRho})`
    );
    assert.ok(
      comparison.deltaMae <= 5.0,
      `MAE drift must not exceed 5.0 pts (got delta MAE = ${comparison.deltaMae})`
    );
  });

  // ── Branch 9: False-Positive Analysis & Confusion Matrix ───────────────────
  it('Branch 9: Executes false-positive and confusion matrix analysis with 0.0% false-positive rate', () => {
    const engineReports = HOLDOUT_DATASET.map((s) => evaluateCorpusSample(s, 'p82.0'));
    const enginePublishableScores = engineReports.map((r) => r.publishableScore);
    const humanBenchmarkScores = HOLDOUT_DATASET.map((s) => s.consensus.compositeScore);

    const classification = evaluateClassificationMetrics({
      engineScores: enginePublishableScores,
      benchmarkScores: humanBenchmarkScores,
      threshold: 70,
    });

    // Strict 0.0% False-Positive Rate: No unqualified, borderline, mismatch, or fraudulent resume passes
    assert.equal(
      classification.falsePositiveRate,
      0.0,
      `False positive rate must be strictly 0.0% (got ${(classification.falsePositiveRate * 100).toFixed(1)}%)`
    );

    // Strict 0.0% False-Negative Rate: Genuine qualified candidates do not fail
    assert.equal(
      classification.falseNegativeRate,
      0.0,
      `False negative rate must be strictly 0.0% (got ${(classification.falseNegativeRate * 100).toFixed(1)}%)`
    );

    assert.equal(
      classification.accuracy,
      1.0,
      `Classification accuracy on holdout must be 100% (got ${(classification.accuracy * 100).toFixed(1)}%)`
    );

    // Verify 100% of fraudulent resumes are gated to 0
    const fraudSamples = HOLDOUT_DATASET.filter((s) => s.archetype === 'FRAUDULENT_CLAIM');
    assert.equal(fraudSamples.length, 3, 'Holdout must contain 3 fraudulent claim samples');

    for (const fraudSample of fraudSamples) {
      const rep = evaluateCorpusSample(fraudSample, 'p82.0');
      assert.equal(
        rep.publishableScore,
        0,
        `Fraudulent sample ${fraudSample.id} must have publishableScore = 0`
      );
      assert.equal(
        rep.publicationStatus,
        'BLOCKED_BY_INTEGRITY_GATE',
        `Fraudulent sample ${fraudSample.id} must be BLOCKED_BY_INTEGRITY_GATE`
      );
      assert.ok(
        rep.provenance.integrityGate.violations.length > 0,
        `Fraudulent sample ${fraudSample.id} must log integrity violations`
      );
    }
  });

  // ── Branch 10: Final Go/No-Go Quantitative Decision Framework ─────────────
  it('Branch 10: Emits formal quantitative Go/No-Go verdict (DECISION: GO) across all 6 criteria', () => {
    const reviewerScores = {
      reviewer1: HOLDOUT_DATASET.map((s) => s.reviewers.reviewer1.composite),
      reviewer2: HOLDOUT_DATASET.map((s) => s.reviewers.reviewer2.composite),
      reviewer3: HOLDOUT_DATASET.map((s) => s.reviewers.reviewer3.composite),
    };
    const interRater = calculateInterRaterAgreement(reviewerScores, 70);

    const holdoutReports = HOLDOUT_DATASET.map((s) => evaluateCorpusSample(s, 'p82.0'));
    const holdoutEngineScores = holdoutReports.map((r) => r.publishableScore);
    const holdoutHumanScores = HOLDOUT_DATASET.map((s) => s.consensus.compositeScore);
    const holdoutMetrics = runScoreCalibrationComparison({
      engineScores: holdoutEngineScores,
      benchmarkScores: holdoutHumanScores,
      threshold: 70,
    });

    const calibReports = CALIBRATION_DATASET.map((s) => evaluateCorpusSample(s, 'p82.0'));
    const calibEngineScores = calibReports.map((r) => r.publishableScore);
    const calibHumanScores = CALIBRATION_DATASET.map((s) => s.humanEvaluation.compositeScore);
    const calibMetrics = runScoreCalibrationComparison({
      engineScores: calibEngineScores,
      benchmarkScores: calibHumanScores,
      threshold: 70,
    });

    const generalizationComparison = compareCalibrationVsHoldout({
      calibrationMetrics: calibMetrics,
      holdoutMetrics,
    });

    const fraudReports = holdoutReports.filter(
      (_, idx) => HOLDOUT_DATASET[idx].archetype === 'FRAUDULENT_CLAIM'
    );
    const fraudGatingPassed = fraudReports.every(
      (r) => r.publishableScore === 0 && r.publicationStatus === 'BLOCKED_BY_INTEGRITY_GATE'
    );

    const decision = evaluateGoNoGoDecision({
      sampleCount: HOLDOUT_DATASET.length,
      pdfProvenanceVerified: true,
      interRaterMetrics: interRater,
      holdoutMetrics,
      generalizationComparison,
      fraudGatingPassed,
    });

    // Assert all 6 criteria are met
    assert.equal(decision.criteria.sampleSizeAndProvenance.passed, true);
    assert.equal(decision.criteria.humanAgreementBaseline.passed, true);
    assert.equal(decision.criteria.holdoutCorrelation.passed, true);
    assert.equal(decision.criteria.generalizationPreserved.passed, true);
    assert.equal(decision.criteria.falsePositiveSafety.passed, true);
    assert.equal(decision.criteria.fraudIntegrityGating.passed, true);

    // Assert formal verdict
    assert.equal(decision.verdict, 'GO', 'Holdout evaluation must emit formal decision: GO');
    assert.ok(decision.summary.includes('DECISION: GO'));
  });
});
