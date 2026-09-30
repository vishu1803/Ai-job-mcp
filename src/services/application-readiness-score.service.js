/**
 * @file Application Readiness Score Service (Phase 16)
 *
 * Implements the industry-grade blended Application Readiness Score,
 * safety gating, automated submission checklists, and go/no-go recommendations.
 */

import { ApplicationReadinessScoreReportSchema } from '../domain/career/application-readiness-score.schemas.js';

export class ApplicationReadinessScoreService {
  /**
   * Computes the blended Application Readiness Score.
   *
   * @param {object} params
   * @param {object} [params.atsParseabilityReport] From AtsParseabilityService
   * @param {object} [params.jobFitReport] From AtsFitScoreService
   * @param {object} [params.recruiterCoverageReport] From RecruiterSearchSimulationService
   * @param {object} [params.contentQualityReport] From ResumeWritingQualityService
   * @param {object} [params.candidateQualityReport] From CandidateQualityRubricService
   * @param {object} [params.evidenceConfidenceReport] Evidence confidence analysis
   * @param {object} [params.bonusDeductionReport] From BonusDeductionEngineService
   * @returns {object} Validated ApplicationReadinessScoreReport
   */
  computeReadiness({
    atsParseabilityReport = null,
    jobFitReport = null,
    recruiterCoverageReport = null,
    contentQualityReport = null,
    candidateQualityReport = null,
    evidenceConfidenceReport = null,
    bonusDeductionReport = null,
  }) {
    const pScore = Number(
      atsParseabilityReport?.score ?? atsParseabilityReport?.overallScore ?? 80.0
    );
    const jScore = Number(
      jobFitReport?.finalScore ?? jobFitReport?.score ?? jobFitReport?.overallScore ?? 75.0
    );
    const rScore = Number(recruiterCoverageReport?.coverage ?? 80.0);
    const cScore = Number(
      contentQualityReport?.overallQualityScore ?? contentQualityReport?.score ?? 75.0
    );
    const qScore = Number(candidateQualityReport?.overallQualityScore ?? 70.0);
    const eScore = Number(
      evidenceConfidenceReport?.score ?? evidenceConfidenceReport?.confidenceScore ?? 80.0
    );
    const modifier = Number(bonusDeductionReport?.netModifierPercentage ?? 0.0);

    // Weighted blend: 20% + 35% + 15% + 10% + 10% + 10% = 100%
    const weightedBase =
      0.2 * pScore + 0.35 * jScore + 0.15 * rScore + 0.1 * cScore + 0.1 * qScore + 0.1 * eScore;

    const rawScore = Math.min(
      100.0,
      Math.max(0.0, Math.round((weightedBase + modifier) * 10) / 10)
    );

    // ── Safety Gates & Checklist ───────────────────────────────────────────
    const checklist = [];
    let safetyCap = null;
    let safetyCapReason = null;

    // 1. Critical ATS Parseability Check
    const parseIssues = atsParseabilityReport?.issues || [];
    const hasCriticalParseIssue = parseIssues.some((i) => i.severity === 'CRITICAL');
    checklist.push({
      check: 'ATS Document Parseability',
      passed: !hasCriticalParseIssue && pScore >= 70.0,
      severity: 'CRITICAL',
      recommendation: hasCriticalParseIssue
        ? 'Eliminate multi-column tables, complex text boxes, or non-standard fonts.'
        : 'Resume structure complies with standard ATS document parsing.',
    });

    if (hasCriticalParseIssue) {
      safetyCap = Math.min(safetyCap ?? 100.0, 50.0);
      safetyCapReason = 'Score capped at 50.0 due to critical ATS layout parsing issues.';
    }

    // 2. Hard Requirements & Critical Skills Gate
    const criticalGapCount = Number(jobFitReport?.criticalGapCount ?? 0);
    const isJobFitCapped = Boolean(jobFitReport?.isCapped);
    checklist.push({
      check: 'Required Core Skills Match',
      passed: criticalGapCount === 0 && jScore >= 65.0,
      severity: 'CRITICAL',
      recommendation:
        criticalGapCount > 0
          ? `Missing ${criticalGapCount} core mandatory skill requirements for this role.`
          : 'All mandatory skill requirements are satisfied.',
    });

    if (
      criticalGapCount >= 2 ||
      (isJobFitCapped && (jobFitReport?.scoreBreakdown?.scoreCap || 100) <= 49.9)
    ) {
      safetyCap = Math.min(safetyCap ?? 100.0, 40.0);
      safetyCapReason =
        'Score capped at 40.0 due to multiple unsatisfied mandatory skill requirements.';
    } else if (
      criticalGapCount === 1 ||
      (isJobFitCapped && (jobFitReport?.scoreBreakdown?.scoreCap || 100) <= 74.9)
    ) {
      safetyCap = Math.min(safetyCap ?? 100.0, 74.9);
      safetyCapReason =
        safetyCapReason || 'Score capped at 74.9 due to a missing core technical requirement.';
    }

    // 3. Recruiter Boolean Filter Check
    const recruiterFound = recruiterCoverageReport?.searchFound ?? true;
    checklist.push({
      check: 'Recruiter Boolean Filter',
      passed: recruiterFound && rScore >= 70.0,
      severity: 'WARNING',
      recommendation: recruiterFound
        ? 'Resume satisfies primary recruiter Boolean search criteria.'
        : `Resume omitted key search terms: ${(recruiterCoverageReport?.missingKeywords || []).join(', ')}.`,
    });

    // 4. Content Writing Quality Check
    checklist.push({
      check: 'Writing Quality & Action Verbs',
      passed: cScore >= 65.0,
      severity: 'INFO',
      recommendation:
        cScore >= 65.0
          ? 'Strong bullet structure and quantified outcomes.'
          : 'Refactor bullets to start with active verbs and include measurable results.',
    });

    // ── Compute Final Readiness Score ──────────────────────────────────────
    let readinessScore = rawScore;
    let safetyGateApplied = false;

    if (safetyCap !== null && rawScore > safetyCap) {
      readinessScore = safetyCap;
      safetyGateApplied = true;
    }

    readinessScore = Math.min(100.0, Math.max(0.0, Math.round(readinessScore * 10) / 10));

    let readinessBand = 'NOT_READY';
    let recommendation = 'DO_NOT_SUBMIT';

    if (readinessScore >= 80.0) {
      readinessBand = 'READY_TO_APPLY';
      recommendation = 'RECOMMENDED';
    } else if (readinessScore >= 65.0) {
      readinessBand = 'APPLY_WITH_CAUTION';
      recommendation = 'NEEDS_POLISHING';
    }

    const summary = `Application Readiness scored ${readinessScore}/100 (${readinessBand}) with recommendation '${recommendation}'.${safetyGateApplied ? ` [${safetyCapReason}]` : ''}`;

    return ApplicationReadinessScoreReportSchema.parse({
      readinessScore,
      rawScore,
      readinessBand,
      recommendation,
      safetyGateApplied,
      safetyGateReason: safetyGateApplied ? safetyCapReason : null,
      scoreBreakdown: {
        atsParseabilityScore: pScore,
        jobFitScore: jScore,
        recruiterCoverageScore: rScore,
        contentQualityScore: cScore,
        candidateQualityScore: qScore,
        evidenceConfidenceScore: eScore,
        bonusDeductionModifier: modifier,
      },
      checklist,
      summary,
      analyzedAt: new Date().toISOString(),
    });
  }
}

export const applicationReadinessScoreService = new ApplicationReadinessScoreService();
