import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreExplainabilityService } from '../../src/services/score-explainability.service.js';
import { applicationReadinessScoreService } from '../../src/services/application-readiness-score.service.js';

describe('Score Explainability & Application Readiness Score (Phases 14, 15 & 16)', () => {
  describe('Phases 14 & 15: ScoreExplainabilityService', () => {
    it('decomposes lost points accurately across canonical components', () => {
      const fitReport = {
        overallScore: 78.5,
        rawScore: 78.5,
        finalScore: 78.5,
        componentScores: {
          coreTechnicalScore: 24.0, // Max 30.0 (lost 6.0)
          frameworkDomainScore: 16.0, // Max 20.0 (lost 4.0)
          toolsPlatformsScore: 11.0, // Max 15.0 (lost 4.0)
          experienceTenureScore: 12.0, // Max 15.0 (lost 3.0)
          projectRelevanceScore: 7.5, // Max 10.0 (lost 2.5)
          roleSeniorityScore: 4.0, // Max 5.0 (lost 1.0)
          educationCertScore: 4.0, // Max 5.0 (lost 1.0)
        },
        missingSkills: ['Kubernetes', 'gRPC'],
      };

      const explain = scoreExplainabilityService.explainScore({ fitReport });

      assert.equal(explain.finalScore, 78.5);
      assert.equal(explain.lostPointsTotal, 21.5);
      assert.ok(explain.lostPointsBreakdown.length >= 5);

      // Verify top lost points item is Core Technical Skills (lost 6.0)
      const topLost = explain.lostPointsBreakdown[0];
      assert.equal(topLost.component, 'Core Technical Skills');
      assert.equal(topLost.lostPoints, 6.0);
      assert.ok(topLost.evidenceAudit.some((e) => e.includes('Kubernetes')));
      assert.ok(explain.topRemediationActions.length > 0);
    });

    it('explains the exact gap between achieved score and target score ("Why 82 instead of 91?")', () => {
      const fitReport = {
        overallScore: 82.0,
        rawScore: 82.0,
        finalScore: 82.0,
        componentScores: {
          coreTechnicalScore: 26.0, // Max 30.0 (lost 4.0)
          frameworkDomainScore: 17.0, // Max 20.0 (lost 3.0)
          toolsPlatformsScore: 11.0, // Max 15.0 (lost 4.0)
          experienceTenureScore: 14.0, // Max 15.0 (lost 1.0)
          projectRelevanceScore: 8.0, // Max 10.0 (lost 2.0)
          roleSeniorityScore: 3.0, // Max 5.0 (lost 2.0)
          educationCertScore: 3.0, // Max 5.0 (lost 2.0)
        },
      };

      const comparison = scoreExplainabilityService.explainScoreComparison({
        fitReport,
        targetScore: 91.0,
      });

      assert.equal(comparison.achievedScore, 82.0);
      assert.equal(comparison.targetScore, 91.0);
      assert.equal(comparison.scoreDelta, 9.0);
      assert.ok(comparison.marginalGaps.length >= 2);

      const totalNeeded = comparison.marginalGaps.reduce((sum, g) => sum + g.neededPoints, 0);
      assert.equal(totalNeeded, 9.0);

      assert.match(
        comparison.narrativeExplanation,
        /Candidate scored 82\/100, which is 9 points below the target score of 91\/100/
      );
    });
  });

  describe('Phase 16: ApplicationReadinessScoreService', () => {
    it('computes blended readiness score for a well-prepared candidate', () => {
      const report = applicationReadinessScoreService.computeReadiness({
        atsParseabilityReport: { score: 95.0, issues: [] },
        jobFitReport: { finalScore: 88.0, criticalGapCount: 0 },
        recruiterCoverageReport: { coverage: 90.0, searchFound: true },
        contentQualityReport: { overallQualityScore: 85.0 },
        candidateQualityReport: { overallQualityScore: 80.0 },
        evidenceConfidenceReport: { score: 85.0 },
        bonusDeductionReport: { netModifierPercentage: 2.5 },
      });

      assert.ok(report.readinessScore >= 80.0);
      assert.equal(report.readinessBand, 'READY_TO_APPLY');
      assert.equal(report.recommendation, 'RECOMMENDED');
      assert.equal(report.safetyGateApplied, false);
      assert.ok(report.checklist.every((item) => item.severity !== 'CRITICAL' || item.passed));
    });

    it('enforces safety cap when candidate has critical ATS parseability failure', () => {
      const report = applicationReadinessScoreService.computeReadiness({
        atsParseabilityReport: {
          score: 40.0,
          issues: [
            { severity: 'CRITICAL', message: 'Multi-column table layout breaks text parser' },
          ],
        },
        jobFitReport: { finalScore: 92.0, criticalGapCount: 0 },
        recruiterCoverageReport: { coverage: 95.0, searchFound: true },
        contentQualityReport: { overallQualityScore: 90.0 },
        candidateQualityReport: { overallQualityScore: 85.0 },
        evidenceConfidenceReport: { score: 90.0 },
        bonusDeductionReport: { netModifierPercentage: 0.0 },
      });

      // Even though other scores are >90%, critical parseability caps readiness at <= 50.0
      assert.equal(report.safetyGateApplied, true);
      assert.ok(report.readinessScore <= 50.0);
      assert.equal(report.readinessBand, 'NOT_READY');
      assert.equal(report.recommendation, 'DO_NOT_SUBMIT');
    });

    it('enforces safety cap when candidate has multiple critical skills gaps', () => {
      const report = applicationReadinessScoreService.computeReadiness({
        atsParseabilityReport: { score: 95.0, issues: [] },
        jobFitReport: { finalScore: 45.0, criticalGapCount: 2, isCapped: true },
        recruiterCoverageReport: { coverage: 60.0, searchFound: false },
        contentQualityReport: { overallQualityScore: 80.0 },
        candidateQualityReport: { overallQualityScore: 70.0 },
        evidenceConfidenceReport: { score: 50.0 },
      });

      assert.equal(report.safetyGateApplied, true);
      assert.ok(report.readinessScore <= 40.0);
      assert.equal(report.readinessBand, 'NOT_READY');
      assert.equal(report.recommendation, 'DO_NOT_SUBMIT');
    });
  });
});
