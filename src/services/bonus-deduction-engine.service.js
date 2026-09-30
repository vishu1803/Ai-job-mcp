/**
 * @file Bonus & Deduction Engine Service (Phase 13)
 *
 * Evaluates deterministic positive and negative modifiers with strict auditing:
 * - Positive modifiers capped at <= +10.0%
 * - Negative modifiers capped at <= -20.0%
 * - Net modifier strictly bounded between -20.0% and +10.0%
 * - Every modifier requires verifiable evidence and audit rationale.
 */

import { BonusDeductionReportSchema } from '../domain/career/bonus-deduction.schemas.js';

export class BonusDeductionEngineService {
  /**
   * Evaluates candidate profile and documents for bonus and deduction modifiers.
   *
   * @param {object} params
   * @param {object} params.candidateProfile Canonical candidate profile
   * @param {Array<object>} [params.experiences=[]] Work experience records
   * @param {Array<object>} [params.openSourceReport] Open source intelligence report
   * @param {Array<object>} [params.parseabilityAudit] ATS parseability audit
   * @param {Array<object>} [params.projectEvaluations] Project quality evaluations
   * @returns {object} Validated BonusDeductionReport
   */
  evaluateModifiers({
    candidateProfile = {},
    experiences = [],
    openSourceReport = null,
    parseabilityAudit = null,
    projectEvaluations = [],
  }) {
    const bonuses = [];
    const deductions = [];

    const exps = experiences.length > 0 ? experiences : candidateProfile.experience || [];
    const certs = candidateProfile.certifications || [];

    // ── 1. POSITIVE MODIFIERS (BONUSES) ───────────────────────────────────

    // Bonus: Professional Cloud & Engineering Certifications
    const validCerts = certs.filter((c) => {
      const name = (typeof c === 'string' ? c : c.name || '').toLowerCase();
      return /aws|azure|gcp|google cloud|cka|kubernetes|terraform|cisa|cissp|red hat/i.test(name);
    });

    if (validCerts.length > 0) {
      const bonusAmount = Math.min(5.0, validCerts.length * 2.5);
      bonuses.push({
        ruleId: 'BONUS_CERTIFICATION',
        name: 'Recognized Cloud / Engineering Certifications',
        type: 'BONUS',
        amount: bonusAmount,
        evidence: validCerts.map((c) => (typeof c === 'string' ? c : c.name)),
        reason: `Candidate holds ${validCerts.length} verified cloud/architecture certifications.`,
      });
    }

    // Bonus: Verifiable Production Scale Signals
    const allBullets = exps.flatMap((e) =>
      (e.bullets || []).map((b) => (typeof b === 'string' ? b : b.text))
    );
    const scaleMatches = allBullets.filter((b) =>
      /\b(\d+M\+?\s*(?:users|requests|events)|\d+k\+?\s*(?:qps|rps|req\/s)|>\s*\d+\s*tb|\$?\d+M\+?\s*(?:revenue|savings))\b/i.test(
        b
      )
    );

    if (scaleMatches.length > 0) {
      bonuses.push({
        ruleId: 'BONUS_PRODUCTION_SCALE',
        name: 'High-Volume Production Scale Achievements',
        type: 'BONUS',
        amount: 3.5,
        evidence: scaleMatches.slice(0, 3),
        reason: `Candidate proved high-volume scale metrics in ${scaleMatches.length} production bullets.`,
      });
    }

    // Bonus: External Open Source Contributions
    if (
      openSourceReport &&
      (openSourceReport.totalExternalContributionsCount > 0 || openSourceReport.externalPrCount > 0)
    ) {
      const extCount =
        openSourceReport.totalExternalContributionsCount || openSourceReport.externalPrCount || 0;
      const ossAmount = Math.min(4.0, 2.0 + extCount * 0.5);
      const evidence = (openSourceReport.activities || openSourceReport.externalPrs || [])
        .slice(0, 3)
        .map((a) => a.repository || a.repo || 'External PR');

      bonuses.push({
        ruleId: 'BONUS_OPEN_SOURCE',
        name: 'External Open-Source Contributions',
        type: 'BONUS',
        amount: ossAmount,
        evidence: evidence.length > 0 ? evidence : [`${extCount} external contributions`],
        reason: `Candidate has ${extCount} merged/submitted contributions to external open-source repos.`,
      });
    }

    // Bonus: Production Grade Architecture
    const hasProductionProject = projectEvaluations.some(
      (p) => p.tier === 'PRODUCTION_GRADE' || p.complexityTier === 'PRODUCTION_GRADE'
    );
    if (hasProductionProject) {
      bonuses.push({
        ruleId: 'BONUS_PRODUCTION_PROJECT',
        name: 'Production-Grade Project Implementation',
        type: 'BONUS',
        amount: 2.5,
        evidence: projectEvaluations
          .filter((p) => p.tier === 'PRODUCTION_GRADE' || p.complexityTier === 'PRODUCTION_GRADE')
          .map((p) => p.projectName),
        reason: 'Candidate developed a verified production-grade project with robust architecture.',
      });
    }

    // ── 2. NEGATIVE MODIFIERS (DEDUCTIONS) ─────────────────────────────────

    // Deduction: Short Tenure / High Job-Hopping Rate
    if (exps.length >= 3) {
      const tenures = exps
        .map((e) => {
          if (!e.startDate || !e.endDate) return null;
          const start = new Date(e.startDate).getTime();
          const end = /present|current/i.test(e.endDate)
            ? Date.now()
            : new Date(e.endDate).getTime();
          if (isNaN(start) || isNaN(end) || end <= start) return null;
          return (end - start) / (1000 * 60 * 60 * 24 * 30.44); // months
        })
        .filter((m) => m !== null);

      const shortTenures = tenures.filter((m) => m < 6);
      if (shortTenures.length >= 3 && shortTenures.length === tenures.length) {
        deductions.push({
          ruleId: 'DEDUCTION_JOB_HOPPING',
          name: 'Persistent Short-Tenure (<6 Months) Pattern',
          type: 'DEDUCTION',
          amount: -5.0,
          evidence: [`${shortTenures.length} consecutive roles under 6 months`],
          reason:
            'Multiple consecutive employment stints under 6 months without demonstrated transition.',
        });
      }
    }

    // Deduction: Significant ATS Parseability Flaws
    if (parseabilityAudit) {
      const criticalFlaws = (parseabilityAudit.issues || []).filter(
        (i) => i.severity === 'CRITICAL'
      );
      if (criticalFlaws.length > 0) {
        deductions.push({
          ruleId: 'DEDUCTION_UNPARSEABLE_FORMAT',
          name: 'Critical ATS Parseability Obstacles',
          type: 'DEDUCTION',
          amount: -4.0,
          evidence: criticalFlaws.map(
            (f) => f.message || f.description || 'Critical ATS formatting issue'
          ),
          reason: `Document contains ${criticalFlaws.length} critical layout flaws that break automated ATS extraction.`,
        });
      }
    }

    // Deduction: Keyword Stuffing in Projects
    const stuffedProjects = projectEvaluations.filter(
      (p) =>
        p.keywordDensityWarning ||
        (Array.isArray(p.penalties) && p.penalties.some((pen) => /keyword/i.test(pen)))
    );
    if (stuffedProjects.length > 0) {
      deductions.push({
        ruleId: 'DEDUCTION_KEYWORD_STUFFING',
        name: 'Unsubstantiated Keyword Stuffing',
        type: 'DEDUCTION',
        amount: -3.5,
        evidence: stuffedProjects.map((p) => p.projectName),
        reason: `Detected unnatural keyword-density inflation without supporting implementation details.`,
      });
    }

    // ── 3. STRICT BOUNDING & AUDIT SUMMARY ─────────────────────────────────
    const rawBonusSum = bonuses.reduce((sum, b) => sum + b.amount, 0);
    const rawDeductionSum = Math.abs(deductions.reduce((sum, d) => sum + d.amount, 0));

    // Cap bonuses at <= 10.0, deductions at <= 20.0
    const totalBonus = Math.min(10.0, Math.round(rawBonusSum * 10) / 10);
    const totalDeduction = Math.min(20.0, Math.round(rawDeductionSum * 10) / 10);

    const netModifier = Math.round((totalBonus - totalDeduction) * 10) / 10;
    const netModifierPercentage = Math.min(10.0, Math.max(-20.0, netModifier));

    const summary = `Applied ${bonuses.length} bonuses (+${totalBonus}%) and ${deductions.length} deductions (-${totalDeduction}%), resulting in a net modifier of ${netModifierPercentage >= 0 ? '+' : ''}${netModifierPercentage}%.`;

    return BonusDeductionReportSchema.parse({
      netModifierPercentage,
      totalBonus,
      totalDeduction,
      bonuses,
      deductions,
      summary,
      evaluatedAt: new Date().toISOString(),
    });
  }
}

export const bonusDeductionEngineService = new BonusDeductionEngineService();
