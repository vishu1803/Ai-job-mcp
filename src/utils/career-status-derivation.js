/**
 * @file Deterministic Seniority, Career Status, and Current Employment Derivation Engine
 *
 * Implements ARCH-058 Invariants:
 * 1. currentRole does NOT imply current active employment automatically.
 * 2. Historical internships NEVER overwrite currentRole merely because they appear in a resume.
 * 3. currentEmployment is surfaced separately iff an active role exists with isCurrent === true.
 * 4. Seniority is derived from verified professional tenure, project depth, and role hierarchy.
 * 5. Career status differentiates EMPLOYED, UNEMPLOYED, STUDENT, FRESHER, FREELANCE, CONTRACTOR, and UNKNOWN.
 */

import { TenureCalculator } from './tenure-calculator.js';

export const SENIORITY_LEVELS = Object.freeze([
  'INTERN',
  'ENTRY_LEVEL',
  'JUNIOR',
  'MID_LEVEL',
  'SENIOR',
  'LEAD',
  'STAFF',
  'PRINCIPAL',
  'UNKNOWN',
]);

export const CAREER_STATUSES = Object.freeze([
  'EMPLOYED',
  'UNEMPLOYED',
  'STUDENT',
  'FRESHER',
  'FREELANCE',
  'CONTRACTOR',
  'UNKNOWN',
]);

export class CareerStatusDerivation {
  /**
   * Derives candidate seniority tier from tenure, experience, and education signals.
   *
   * @param {object} params
   * @param {Array<object>} [params.experiences=[]]
   * @param {Array<object>} [params.education=[]]
   * @param {number} [params.professionalTenureYears=0]
   * @param {string} [params.declaredSeniority=null]
   * @returns {'INTERN' | 'ENTRY_LEVEL' | 'JUNIOR' | 'MID_LEVEL' | 'SENIOR' | 'LEAD' | 'STAFF' | 'PRINCIPAL' | 'UNKNOWN'}
   */
  static deriveSeniority({
    experiences = [],
    education = [],
    professionalTenureYears = 0,
    declaredSeniority = null,
  }) {
    if (declaredSeniority && SENIORITY_LEVELS.includes(declaredSeniority)) {
      return declaredSeniority;
    }

    const hasActiveInternship = experiences.some(
      (e) =>
        e.isCurrent &&
        TenureCalculator.inferEmploymentType({ title: e.title || e.role, company: e.company }) ===
          'INTERNSHIP'
    );

    const isStudent = education.some((ed) => ed.isCurrent);

    if (hasActiveInternship || (isStudent && professionalTenureYears === 0)) {
      return 'INTERN';
    }

    if (professionalTenureYears === 0) {
      return 'ENTRY_LEVEL';
    }

    if (professionalTenureYears < 2) {
      return 'JUNIOR';
    }

    if (professionalTenureYears < 4) {
      return 'MID_LEVEL';
    }

    if (professionalTenureYears < 8) {
      return 'SENIOR';
    }

    if (professionalTenureYears < 12) {
      return 'LEAD';
    }

    return 'STAFF';
  }

  /**
   * Derives career status (EMPLOYED, UNEMPLOYED, STUDENT, FRESHER, FREELANCE, CONTRACTOR, UNKNOWN).
   *
   * @param {object} params
   * @param {Array<object>} [params.experiences=[]]
   * @param {Array<object>} [params.education=[]]
   * @param {number} [params.professionalTenureMonths=0]
   * @param {string} [params.declaredStatus=null]
   * @returns {'EMPLOYED' | 'UNEMPLOYED' | 'STUDENT' | 'FRESHER' | 'FREELANCE' | 'CONTRACTOR' | 'UNKNOWN'}
   */
  static deriveCareerStatus({
    experiences = [],
    education = [],
    professionalTenureMonths = 0,
    declaredStatus = null,
  }) {
    if (declaredStatus && CAREER_STATUSES.includes(declaredStatus)) {
      return declaredStatus;
    }

    const activeExp = experiences.find((e) => Boolean(e.isCurrent));
    const activeEdu = education.find((ed) => Boolean(ed.isCurrent));

    if (activeExp) {
      const empType =
        activeExp.employmentType ||
        TenureCalculator.inferEmploymentType({
          title: activeExp.title || activeExp.role,
          company: activeExp.company,
        });

      if (empType === 'FREELANCE') return 'FREELANCE';
      if (empType === 'CONTRACT') return 'CONTRACTOR';
      if (empType === 'INTERNSHIP') {
        return activeEdu ? 'STUDENT' : 'STUDENT';
      }
      return 'EMPLOYED';
    }

    if (activeEdu) {
      return 'STUDENT';
    }

    // No active role & no active education
    if (experiences.length === 0 || professionalTenureMonths === 0) {
      return 'FRESHER';
    }

    // Has past professional experience but no active employment
    return 'UNEMPLOYED';
  }

  /**
   * Slices current active employment from experiences if and only if isCurrent === true.
   *
   * @param {Array<object>} experiences
   * @returns {{
   *   title: string,
   *   company: string,
   *   employmentType: string,
   *   startDate: string | null,
   *   location: string | null
   * } | null}
   */
  static deriveCurrentEmployment(experiences = []) {
    if (!Array.isArray(experiences)) return null;

    const active = experiences.find((e) => Boolean(e.isCurrent));
    if (!active) return null;

    const empType =
      active.employmentType ||
      TenureCalculator.inferEmploymentType({
        title: active.title || active.role,
        company: active.company,
      });

    return {
      title: active.title || active.role || 'Current Role',
      company: active.company || 'Company',
      employmentType: empType,
      startDate: active.startDate || null,
      location: active.location || null,
    };
  }

  /**
   * Resolves canonical currentRole (professional identity) respecting precedence:
   * 1. Explicit userCustom.currentRole
   * 2. candidate.headline
   * 3. Current active employment title (if isCurrent === true and not an internship)
   * 4. null
   *
   * STRICT GUARANTEE: A past or internship role NEVER overwrites currentRole.
   *
   * @param {object} params
   * @param {string} [params.userCustomRole]
   * @param {string} [params.headline]
   * @param {object} [params.currentEmployment]
   * @returns {string | null}
   */
  static resolveCurrentRole({ userCustomRole = null, headline = null, currentEmployment = null }) {
    if (userCustomRole && typeof userCustomRole === 'string' && userCustomRole.trim()) {
      return userCustomRole.trim();
    }

    if (headline && typeof headline === 'string' && headline.trim()) {
      return headline.trim();
    }

    if (
      currentEmployment &&
      currentEmployment.title &&
      currentEmployment.employmentType !== 'INTERNSHIP'
    ) {
      return currentEmployment.title.trim();
    }

    return null;
  }
}
