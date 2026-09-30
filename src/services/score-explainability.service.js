/**
 * @file Score Explainability Service (Phases 14 & 15)
 *
 * Implements deterministic score explainability, lost-point attribution,
 * and target score comparative diagnostics ("Why 82 instead of 91?").
 *
 * Strictly zero-hallucination: every lost point is bound to explicit component rules.
 */

import {
  ScoreExplainabilityReportSchema,
  ScoreComparisonExplanationSchema,
} from '../domain/career/score-explainability.schemas.js';

export class ScoreExplainabilityService {
  /**
   * Generates a complete lost-point explainability report for a candidate fit score.
   *
   * @param {object} params
   * @param {object} params.fitReport Result from AtsFitScoreService
   * @param {object} [params.candidateProfile] Parsed candidate profile
   * @param {object} [params.jobPosting] Target job posting
   * @returns {object} Validated ScoreExplainabilityReport
   */
  explainScore({ fitReport, candidateProfile = {}, jobPosting = {} }) {
    const rawScore = Number(fitReport.rawScore ?? fitReport.overallScore ?? 0);
    const finalScore = Number(fitReport.finalScore ?? fitReport.score ?? rawScore);
    const componentScores = fitReport.componentScores || fitReport.scoreBreakdown || {};

    const safetyCapApplied =
      fitReport.safetyCapApplied ?? (rawScore > finalScore ? finalScore : null);
    const safetyCapReason =
      fitReport.safetyCapReason ??
      (safetyCapApplied
        ? `Score capped at ${safetyCapApplied} due to critical requirements gap`
        : null);

    const lostPointsBreakdown = [];

    const isLegacySevenComponent =
      componentScores.coreTechnicalScore !== undefined ||
      componentScores.frameworkDomainScore !== undefined;

    // Component configurations supporting both 7-component model and canonical fit model
    const componentConfigs = isLegacySevenComponent
      ? [
          {
            key: 'coreTechnicalScore',
            label: 'Core Technical Skills',
            max: 30.0,
            recovery: 'SHORT_TERM_PORTFOLIO',
            defaultReason:
              'Missing or unverified core programming languages or primary stack requirements.',
            fix: 'Add verifiable implementations or open-source evidence for missing core technologies.',
          },
          {
            key: 'frameworkDomainScore',
            label: 'Frameworks & Domain Expertise',
            max: 20.0,
            recovery: 'IMMEDIATE_RESUME_FIX',
            defaultReason: 'Target framework or domain technologies not prominently evidenced.',
            fix: 'Explicitly highlight relevant framework usage and domain libraries in recent roles.',
          },
          {
            key: 'toolsPlatformsScore',
            label: 'Tools & Cloud Infrastructure',
            max: 15.0,
            recovery: 'IMMEDIATE_RESUME_FIX',
            defaultReason:
              'Secondary tooling, CI/CD, or cloud platform infrastructure missing from tech stack.',
            fix: 'Include specific cloud providers (AWS, GCP), container tools (Docker, K8s), and CI/CD pipelines.',
          },
          {
            key: 'experienceTenureScore',
            label: 'Professional Experience & Tenure',
            max: 15.0,
            recovery: 'LONG_TERM_EXPERIENCE',
            defaultReason:
              'Total verified production experience years falls short of role requirements.',
            fix: 'Acquire additional professional full-time engineering experience.',
          },
          {
            key: 'projectRelevanceScore',
            label: 'Project Architectural Relevance',
            max: 10.0,
            recovery: 'SHORT_TERM_PORTFOLIO',
            defaultReason:
              'Technical projects lack architectural alignment or production complexity.',
            fix: 'Build or contribute to a production-grade project matching the employer tech stack.',
          },
          {
            key: 'roleSeniorityScore',
            label: 'Seniority & Leadership Scope',
            max: 5.0,
            recovery: 'LONG_TERM_EXPERIENCE',
            defaultReason:
              'Insufficient evidence of system ownership, team leadership, or architectural scope.',
            fix: 'Demonstrate leadership through code reviews, mentorship, and system design authorship.',
          },
          {
            key: 'educationCertScore',
            label: 'Education & Certifications',
            max: 5.0,
            recovery: 'SHORT_TERM_PORTFOLIO',
            defaultReason: 'Lacks specialized cloud or industry certifications matching the role.',
            fix: 'Complete relevant vendor certifications (e.g. AWS Solutions Architect, CKA).',
          },
        ]
      : [
          {
            key: 'requiredSkillsScore',
            label: 'Core Technical Skills',
            max: 40.0,
            recovery: 'SHORT_TERM_PORTFOLIO',
            defaultReason:
              'Missing or unverified core programming languages or primary stack requirements.',
            fix: 'Add verifiable implementations or open-source evidence for missing core technologies.',
          },
          {
            key: 'projectRelevanceScore',
            label: 'Project Architectural Relevance',
            max: 20.0,
            recovery: 'SHORT_TERM_PORTFOLIO',
            defaultReason:
              'Technical projects lack architectural alignment or production complexity.',
            fix: 'Build or contribute to a production-grade project matching the employer tech stack.',
          },
          {
            key: 'preferredSkillsScore',
            label: 'Frameworks & Domain Expertise',
            max: 15.0,
            recovery: 'IMMEDIATE_RESUME_FIX',
            defaultReason: 'Target framework or domain technologies not prominently evidenced.',
            fix: 'Explicitly highlight relevant framework usage and domain libraries in recent roles.',
          },
          {
            key: 'experienceFitScore',
            label: 'Professional Experience & Tenure',
            max: 10.0,
            recovery: 'LONG_TERM_EXPERIENCE',
            defaultReason:
              'Total verified production experience years falls short of role requirements.',
            fix: 'Acquire additional professional full-time engineering experience.',
          },
          {
            key: 'educationFitScore',
            label: 'Education & Certifications',
            max: 5.0,
            recovery: 'SHORT_TERM_PORTFOLIO',
            defaultReason: 'Lacks specialized cloud or industry certifications matching the role.',
            fix: 'Complete relevant vendor certifications (e.g. AWS Solutions Architect, CKA).',
          },
          {
            key: 'locationFitScore',
            label: 'Location & Work Authorization',
            max: 5.0,
            recovery: 'IMMEDIATE_RESUME_FIX',
            defaultReason:
              'Location or remote alignment not explicitly stated or partially matched.',
            fix: 'Clarify current location, relocation willingness, or remote eligibility.',
          },
          {
            key: 'evidenceConfidenceScore',
            label: 'Evidence Confidence & Rigor',
            max: 5.0,
            recovery: 'IMMEDIATE_RESUME_FIX',
            defaultReason:
              'Evidence backing claims lacks code usage, commit citations, or architectural proof.',
            fix: 'Connect verifiable GitHub repositories or include detailed technical bullet points.',
          },
        ];

    for (const conf of componentConfigs) {
      const earned = Number(componentScores[conf.key] ?? 0);
      const lost = Math.round((conf.max - earned) * 10) / 10;

      if (lost > 0) {
        lostPointsBreakdown.push({
          component: conf.label,
          lostPoints: lost,
          maxComponentScore: conf.max,
          earnedComponentScore: earned,
          reason: conf.defaultReason,
          evidenceAudit: this._extractEvidenceAudit(conf.key, fitReport),
          howToRecover: conf.fix,
          recoveryPotential: conf.recovery,
        });
      }
    }

    // Sort by lost points descending
    lostPointsBreakdown.sort((a, b) => b.lostPoints - a.lostPoints);

    const lostPointsTotal = Math.round((100.0 - finalScore) * 10) / 10;

    const topRemediationActions = lostPointsBreakdown
      .filter((item) => item.recoveryPotential !== 'LONG_TERM_EXPERIENCE')
      .slice(0, 3)
      .map((item) => `${item.component} (+${item.lostPoints} pts): ${item.howToRecover}`);

    return ScoreExplainabilityReportSchema.parse({
      finalScore,
      rawScore,
      safetyCapApplied,
      safetyCapReason,
      lostPointsTotal,
      lostPointsBreakdown,
      topRemediationActions,
      analyzedAt: new Date().toISOString(),
    });
  }

  /**
   * Compares achieved score against a target score (e.g. "Why 82 instead of 91?").
   *
   * @param {object} params
   * @param {object} params.fitReport Candidate fit report
   * @param {number} params.targetScore Desired target score (e.g. 91)
   * @returns {object} Validated ScoreComparisonExplanation
   */
  explainScoreComparison({ fitReport, targetScore }) {
    const achievedScore = Number(
      fitReport.finalScore ?? fitReport.score ?? fitReport.rawScore ?? 0
    );
    const scoreDelta = Math.round((targetScore - achievedScore) * 10) / 10;

    if (scoreDelta <= 0) {
      return ScoreComparisonExplanationSchema.parse({
        achievedScore,
        targetScore,
        scoreDelta,
        marginalGaps: [],
        narrativeExplanation: `Candidate already achieved or exceeded the target score (${achievedScore} >= ${targetScore}).`,
      });
    }

    const explainReport = this.explainScore({ fitReport });
    const gaps = [];
    let accumulatedPoints = 0;

    for (const item of explainReport.lostPointsBreakdown) {
      if (accumulatedPoints >= scoreDelta) break;

      const needed = Math.min(
        item.lostPoints,
        Math.round((scoreDelta - accumulatedPoints) * 10) / 10
      );
      gaps.push({
        component: item.component,
        neededPoints: needed,
        actionableFix: item.howToRecover,
        expectedScoreGain: needed,
      });

      accumulatedPoints += needed;
    }

    const gapSummaries = gaps.map(
      (g) => `${g.component} (-${g.neededPoints} pts: ${g.actionableFix})`
    );
    const narrativeExplanation = `Candidate scored ${achievedScore}/100, which is ${scoreDelta} points below the target score of ${targetScore}/100. The ${scoreDelta}-point gap is attributed to: ${gapSummaries.join('; ')}.`;

    return ScoreComparisonExplanationSchema.parse({
      achievedScore,
      targetScore,
      scoreDelta,
      marginalGaps: gaps,
      narrativeExplanation,
    });
  }

  _extractEvidenceAudit(componentKey, fitReport) {
    const evidence = [];
    if (componentKey === 'coreTechnicalScore' && fitReport.missingSkills) {
      evidence.push(...fitReport.missingSkills.map((s) => `Missing skill: ${s}`));
    }
    if (componentKey === 'experienceTenureScore' && fitReport.tenureGaps) {
      evidence.push(...fitReport.tenureGaps);
    }
    return evidence;
  }
}

export const scoreExplainabilityService = new ScoreExplainabilityService();
