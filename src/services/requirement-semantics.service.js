/**
 * @file Requirement Semantics Service (Phase 10)
 *
 * Implements advanced Boolean and semantic requirement evaluations:
 * 1. Evaluates logical operators (AND, OR, EQUIVALENT):
 *    - "React AND JavaScript": requires both to be satisfied.
 *    - "React OR Vue": satisfied if candidate knows either React or Vue.
 *    - "EQUIVALENT": permits approved taxonomy substitutes only when explicitly declared.
 * 2. Enforces hard safety gating (LOCATION_GATED, AUTHORIZATION_GATED, EXPERIENCE_GATED).
 * 3. Strictly adheres to: RELATED != EXACT REQUIREMENT unless explicitly permitted.
 */

import { GroupMatchEvaluationSchema } from '../domain/career/requirement-semantics.schemas.js';

export class RequirementSemanticsService {
  /**
   * Evaluates a RequirementGroup against candidate profile / matched skills.
   *
   * @param {object} group Validated RequirementGroup
   * @param {Array<string>} candidateSkills Array of candidate skill names/slugs
   * @param {object} [candidateContext={}] Candidate context (location, workAuth, tenureYears, degree)
   * @returns {object} Validated GroupMatchEvaluation
   */
  evaluateRequirementGroup(group, candidateSkills = [], candidateContext = {}) {
    const skillsLower = candidateSkills.map((s) => String(s).toLowerCase().trim());
    const matchedRequirements = [];
    const missingRequirements = [];

    let isGateFailed = false;
    let gateFailureReason = '';

    for (const req of group.requirements) {
      const reqName = req.name.toLowerCase().trim();

      // ── Check Gated Requirements First ───────────────────────────────────
      if (req.importance === 'LOCATION_GATED') {
        const candLoc = String(candidateContext.location || '').toLowerCase();
        if (candLoc && !candLoc.includes(reqName) && !candLoc.includes('remote')) {
          isGateFailed = true;
          gateFailureReason = `Location gate unsatisfied: candidate located in '${candidateContext.location}', required '${req.name}'`;
          missingRequirements.push(req.name);
          continue;
        }
      }

      if (req.importance === 'AUTHORIZATION_GATED') {
        const candAuth = String(candidateContext.workAuthorization || '').toUpperCase();
        if (
          candAuth === 'WORK_VISA_OR_SPONSORSHIP' &&
          /no\s+sponsorship|us\s+citizen\s+only/i.test(req.name)
        ) {
          isGateFailed = true;
          gateFailureReason = `Work authorization gate unsatisfied: candidate requires sponsorship but role requires '${req.name}'`;
          missingRequirements.push(req.name);
          continue;
        }
      }

      if (req.importance === 'EXPERIENCE_GATED') {
        const candYears = Number(candidateContext.tenureYears) || 0;
        const reqYearsMatch = req.name.match(/(\d+)\+?\s*years/i);
        const reqYears = reqYearsMatch ? parseInt(reqYearsMatch[1], 10) : 0;
        if (candYears < reqYears) {
          isGateFailed = true;
          gateFailureReason = `Experience gate unsatisfied: candidate has ${candYears} years, minimum required is ${reqYears} years`;
          missingRequirements.push(req.name);
          continue;
        }
      }

      // ── Direct Match or Equivalent Match ─────────────────────────────────
      const exactMatch = skillsLower.includes(reqName);
      if (exactMatch) {
        matchedRequirements.push(req.name);
        continue;
      }

      // Check Equivalent only if explicitly allowed
      if (req.allowsEquivalent && Array.isArray(req.approvedEquivalents)) {
        const hasEquivalent = req.approvedEquivalents.some((eq) =>
          skillsLower.includes(eq.toLowerCase().trim())
        );
        if (hasEquivalent) {
          matchedRequirements.push(`${req.name} (via equivalent)`);
          continue;
        }
      }

      missingRequirements.push(req.name);
    }

    if (isGateFailed) {
      return GroupMatchEvaluationSchema.parse({
        groupId: group.id,
        groupName: group.name,
        operator: group.operator,
        status: 'UNSATISFIED_GATE',
        earnedScoreRatio: 0.0,
        matchedRequirements,
        missingRequirements,
        reason: gateFailureReason,
      });
    }

    // ── Evaluate Operator Logic ───────────────────────────────────────────
    const totalReqs = group.requirements.length;
    const matchCount = matchedRequirements.length;

    if (group.operator === 'OR' || group.operator === 'EQUIVALENT') {
      const passed = matchCount >= 1;
      return GroupMatchEvaluationSchema.parse({
        groupId: group.id,
        groupName: group.name,
        operator: group.operator,
        status: passed ? 'MATCHED' : 'MISSING',
        earnedScoreRatio: passed ? 1.0 : 0.0,
        matchedRequirements,
        missingRequirements,
        reason: passed
          ? `Satisfied OR condition: matched ${matchedRequirements.join(', ')}`
          : `Unsatisfied OR condition: none of [${group.requirements.map((r) => r.name).join(', ')}] matched`,
      });
    }

    if (group.operator === 'OPTIONAL') {
      const passed = matchCount >= 1;
      return GroupMatchEvaluationSchema.parse({
        groupId: group.id,
        groupName: group.name,
        operator: 'OPTIONAL',
        status: passed ? (matchCount === totalReqs ? 'MATCHED' : 'PARTIAL') : 'MISSING',
        earnedScoreRatio: totalReqs > 0 ? Math.round((matchCount / totalReqs) * 100) / 100 : 1.0,
        matchedRequirements,
        missingRequirements,
        reason: passed
          ? `Satisfied optional group (${matchCount}/${totalReqs}): matched ${matchedRequirements.join(', ')}`
          : `Optional group not matched; no penalty applied`,
      });
    }

    // Default: 'AND' Operator
    if (matchCount === totalReqs) {
      return GroupMatchEvaluationSchema.parse({
        groupId: group.id,
        groupName: group.name,
        operator: 'AND',
        status: 'MATCHED',
        earnedScoreRatio: 1.0,
        matchedRequirements,
        missingRequirements: [],
        reason: `Satisfied all ${totalReqs} requirements in group '${group.name}'`,
      });
    }

    if (matchCount > 0) {
      const ratio = Math.round((matchCount / totalReqs) * 100) / 100;
      return GroupMatchEvaluationSchema.parse({
        groupId: group.id,
        groupName: group.name,
        operator: 'AND',
        status: 'PARTIAL',
        earnedScoreRatio: ratio,
        matchedRequirements,
        missingRequirements,
        reason: `Partially satisfied AND group (${matchCount}/${totalReqs}): missing ${missingRequirements.join(', ')}`,
      });
    }

    return GroupMatchEvaluationSchema.parse({
      groupId: group.id,
      groupName: group.name,
      operator: 'AND',
      status: 'MISSING',
      earnedScoreRatio: 0.0,
      matchedRequirements: [],
      missingRequirements,
      reason: `Completely missing all requirements in group '${group.name}'`,
    });
  }
}

export const requirementSemanticsService = new RequirementSemanticsService();
