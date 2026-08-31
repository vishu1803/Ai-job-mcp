/**
 * @file Deterministic Experience Tenure & Employment Duration Calculator
 *
 * Requirements (ARCH-057):
 * 1. Merges overlapping calendar month intervals to prevent double counting.
 * 2. Distinguishes internships and co-ops from professional full-time engineering tenure.
 * 3. Supports current active roles evaluated through current reference date.
 * 4. Yields structured duration metrics:
 *    - totalExperienceMonths
 *    - totalExperienceYears (rounded to 1 decimal place)
 *    - professionalTenureMonths (excluding internships, co-ops, volunteer)
 *    - professionalTenureYears
 *    - softwareEngineeringMonths
 * 5. Infers employmentType deterministically when unstated.
 */

import { DateRangeNormalizer } from './date-range-normalizer.js';

export const EMPLOYMENT_TYPES = Object.freeze([
  'FULL_TIME',
  'PART_TIME',
  'INTERNSHIP',
  'CONTRACT',
  'FREELANCE',
  'CO_OP',
  'VOLUNTEER',
  'OTHER',
]);

const SWE_TITLE_KEYWORDS = [
  'engineer',
  'developer',
  'architect',
  'programmer',
  'full stack',
  'full-stack',
  'frontend',
  'front-end',
  'backend',
  'back-end',
  'devops',
  'sre',
  'data scientist',
  'data engineer',
  'machine learning',
  'ai ',
  'cloud',
  'software',
  'tech lead',
];

export class TenureCalculator {
  /**
   * Infers employmentType from title, company, or text context.
   *
   * @param {object|string} titleOrParams
   * @param {string} [companyParam='']
   * @returns {'FULL_TIME' | 'PART_TIME' | 'INTERNSHIP' | 'CONTRACT' | 'FREELANCE' | 'CO_OP' | 'VOLUNTEER' | 'OTHER'}
   */
  static inferEmploymentType(titleOrParams, companyParam = '') {
    let title = '';
    let company = '';
    let declaredType = null;

    if (typeof titleOrParams === 'string') {
      title = titleOrParams;
      company = String(companyParam || '');
    } else if (titleOrParams && typeof titleOrParams === 'object') {
      title = titleOrParams.title || titleOrParams.role || '';
      company = titleOrParams.company || '';
      declaredType = titleOrParams.declaredType || titleOrParams.employmentType || null;
    }

    if (declaredType && EMPLOYMENT_TYPES.includes(declaredType)) {
      return declaredType;
    }

    const combined = `${title} ${company}`.toLowerCase();

    if (/\b(?:intern|internship|trainee)\b/i.test(combined)) {
      return 'INTERNSHIP';
    }
    if (/\b(?:co-op|coop)\b/i.test(combined)) {
      return 'CO_OP';
    }
    if (/\b(?:contract|contractor|consultant)\b/i.test(combined)) {
      return 'CONTRACT';
    }
    if (/\b(?:freelance|freelancer|self-employed)\b/i.test(combined)) {
      return 'FREELANCE';
    }
    if (/\b(?:part-time|part time)\b/i.test(combined)) {
      return 'PART_TIME';
    }
    if (/\b(?:volunteer|pro bono)\b/i.test(combined)) {
      return 'VOLUNTEER';
    }

    return 'FULL_TIME';
  }

  /**
   * Checks whether a role is software engineering / technical.
   *
   * @param {string} title
   * @returns {boolean}
   */
  static isSoftwareEngineeringRole(title) {
    if (!title || typeof title !== 'string') return false;
    const lower = title.toLowerCase();
    return SWE_TITLE_KEYWORDS.some((kw) => lower.includes(kw));
  }

  /**
   * Converts a year-month pair into a discrete integer month index (year * 12 + month).
   *
   * @private
   * @param {number} year
   * @param {number} month (1-12)
   * @returns {number}
   */
  static _toMonthIndex(year, month) {
    return year * 12 + (month - 1);
  }

  /**
   * Merges an array of discrete [startMonthIndex, endMonthIndex] intervals.
   *
   * @param {Array<[number, number]>} intervals
   * @returns {number} Total distinct months spanned
   */
  static _calculateMergedSpanMonths(intervals) {
    if (!intervals || intervals.length === 0) return 0;

    // Filter valid intervals
    const valid = intervals.filter(
      ([s, e]) => typeof s === 'number' && typeof e === 'number' && s <= e
    );
    if (valid.length === 0) return 0;

    // Sort by start ascending
    valid.sort((a, b) => a[0] - b[0]);

    const merged = [valid[0]];
    for (let i = 1; i < valid.length; i++) {
      const current = valid[i];
      const last = merged[merged.length - 1];

      if (current[0] <= last[1] + 1) {
        // Overlapping or contiguous
        last[1] = Math.max(last[1], current[1]);
      } else {
        merged.push(current);
      }
    }

    let totalMonths = 0;
    for (const [start, end] of merged) {
      // Inclusive difference: e.g. June (index 5) to Sept (index 8) is 4 months (June, July, August, Sept)
      totalMonths += end - start + 1;
    }

    return totalMonths;
  }

  /**
   * Calculates comprehensive tenure metrics from an array of normalized experience records.
   *
   * @param {Array<object>} experiences
   * @param {object} [options={}]
   * @param {Date} [options.referenceDate=new Date()]
   * @returns {{
   *   totalExperienceMonths: number,
   *   totalExperienceYears: number,
   *   professionalTenureMonths: number,
   *   professionalTenureYears: number,
   *   softwareEngineeringMonths: number,
   *   softwareEngineeringYears: number,
   *   hasCurrentEmployment: boolean,
   *   activeRoleCount: number
   * }}
   */
  static calculateTenure(experiences, options = {}) {
    if (!Array.isArray(experiences) || experiences.length === 0) {
      return {
        totalExperienceMonths: 0,
        totalExperienceYears: 0,
        professionalTenureMonths: 0,
        professionalTenureYears: 0,
        softwareEngineeringMonths: 0,
        softwareEngineeringYears: 0,
        hasCurrentEmployment: false,
        activeRoleCount: 0,
      };
    }

    const refDate = options.referenceDate || new Date();
    const currentYear = refDate.getFullYear();
    const currentMonth = refDate.getMonth() + 1;
    const currentMonthIndex = TenureCalculator._toMonthIndex(currentYear, currentMonth);

    const allIntervals = [];
    const professionalIntervals = [];
    const sweIntervals = [];
    let activeRoleCount = 0;

    for (const exp of experiences) {
      if (!exp) continue;

      let dateInfo;
      if (exp.rawDateRange) {
        dateInfo = DateRangeNormalizer.normalize(exp.rawDateRange);
      } else if (exp.startDate && exp.endDate) {
        const startNorm = DateRangeNormalizer.normalize(exp.startDate);
        const endNorm = DateRangeNormalizer.normalize(exp.endDate);
        dateInfo = {
          startDate: startNorm.startDate,
          endDate: endNorm.startDate || endNorm.endDate,
          startYear: startNorm.startYear,
          startMonth: startNorm.startMonth,
          endYear: endNorm.startYear || endNorm.endYear,
          endMonth: endNorm.startMonth || endNorm.endMonth,
          isCurrent: Boolean(exp.isCurrent || endNorm.isCurrent),
        };
      } else if (exp.startDate) {
        const startNorm = DateRangeNormalizer.normalize(exp.startDate);
        dateInfo = {
          startDate: startNorm.startDate,
          endDate: null,
          startYear: startNorm.startYear,
          startMonth: startNorm.startMonth,
          endYear: null,
          endMonth: null,
          isCurrent: Boolean(exp.isCurrent),
        };
      } else {
        dateInfo = { isCurrent: false };
      }

      const isCurrent = Boolean(exp.isCurrent || dateInfo.isCurrent);
      if (isCurrent) {
        activeRoleCount++;
      }

      let startMonthIdx = null;
      let endMonthIdx = null;

      if (dateInfo.startYear) {
        const sMonth = dateInfo.startMonth || 1;
        startMonthIdx = TenureCalculator._toMonthIndex(dateInfo.startYear, sMonth);
      }

      if (isCurrent) {
        endMonthIdx = currentMonthIndex;
      } else if (dateInfo.endYear) {
        const eMonth = dateInfo.endMonth || 12;
        endMonthIdx = TenureCalculator._toMonthIndex(dateInfo.endYear, eMonth);
      } else if (dateInfo.startYear) {
        // Single year provided without explicit end -> 12 months for that year
        const eMonth = dateInfo.startMonth || 12;
        endMonthIdx = TenureCalculator._toMonthIndex(dateInfo.startYear, eMonth);
      }

      if (startMonthIdx !== null && endMonthIdx !== null) {
        // Safety guard: ensure start <= end
        if (startMonthIdx > endMonthIdx) {
          endMonthIdx = startMonthIdx;
        }

        const interval = [startMonthIdx, endMonthIdx];
        allIntervals.push(interval);

        const empType =
          exp.employmentType ||
          TenureCalculator.inferEmploymentType({
            title: exp.title || exp.role,
            company: exp.company,
          });

        const isInternship =
          empType === 'INTERNSHIP' || empType === 'CO_OP' || empType === 'VOLUNTEER';
        if (!isInternship) {
          professionalIntervals.push(interval);
        }

        if (TenureCalculator.isSoftwareEngineeringRole(exp.title || exp.role)) {
          sweIntervals.push(interval);
        }
      }
    }

    const totalExperienceMonths = TenureCalculator._calculateMergedSpanMonths(allIntervals);
    const professionalTenureMonths =
      TenureCalculator._calculateMergedSpanMonths(professionalIntervals);
    const softwareEngineeringMonths = TenureCalculator._calculateMergedSpanMonths(sweIntervals);

    const totalExperienceYears = Math.round((totalExperienceMonths / 12) * 10) / 10;
    const professionalTenureYears = Math.round((professionalTenureMonths / 12) * 10) / 10;
    const softwareEngineeringYears = Math.round((softwareEngineeringMonths / 12) * 10) / 10;

    return {
      totalExperienceMonths,
      totalExperienceYears,
      professionalTenureMonths,
      professionalTenureYears,
      softwareEngineeringMonths,
      softwareEngineeringYears,
      hasCurrentEmployment: activeRoleCount > 0,
      activeRoleCount,
    };
  }
}
