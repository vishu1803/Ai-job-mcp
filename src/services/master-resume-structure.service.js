/**
 * @file Master Resume Structure Service (P43 / Structural Authority).
 *
 * Sits at the root of the resume generation pipeline to establish the invariant
 * information architecture of the candidate's resume.
 *
 * Core Invariant:
 * - The candidate's master resume structure is the structural contract.
 * - Section order, section headings, and project capacity are STRUCTURAL decisions.
 * - Target job requirements and relevance scores determine CONTENT, NEVER structure.
 */

import {
  DEFAULT_MASTER_SECTION_ORDER,
  DEFAULT_MASTER_SECTION_TITLES,
  DEFAULT_SECTION_POLICY,
  MasterResumeStructureSchema,
} from '../domain/career/master-resume-structure.schemas.js';
import { isMeaningfulDsa } from './resume-content-strategy.service.js';
import { OPTIONAL_RESUME_SECTIONS } from '../domain/career/resume-source-fields.js';

/**
 * Normalizes raw section type string into canonical section key.
 *
 * @param {string} rawType
 * @returns {string}
 */
export function normalizeSectionType(rawType) {
  if (!rawType || typeof rawType !== 'string') return 'UNKNOWN';
  const upper = rawType.toUpperCase().trim();
  switch (upper) {
    case 'HEADER':
    case 'CONTACT':
    case 'IDENTITY':
      return 'HEADER';
    case 'SUMMARY':
    case 'PROFESSIONAL_SUMMARY':
    case 'OBJECTIVE':
    case 'ABOUT':
      return 'SUMMARY';
    case 'SKILLS':
    case 'TECHNICAL_SKILLS':
    case 'CORE_COMPETENCIES':
    case 'SKILLSET':
      return 'SKILLS';
    case 'PROJECTS':
    case 'TECHNICAL_PROJECTS':
    case 'KEY_PROJECTS':
    case 'ACADEMIC_PROJECTS':
      return 'PROJECTS';
    case 'DSA':
    case 'PROBLEM_SOLVING':
    case 'ALGORITHMIC_PRACTICE':
    case 'CODING_PROFILES':
      return 'DSA';
    case 'EXPERIENCE':
    case 'WORK_EXPERIENCE':
    case 'PROFESSIONAL_EXPERIENCE':
    case 'EMPLOYMENT':
    case 'INTERNSHIP':
      return 'EXPERIENCE';
    case 'EDUCATION':
    case 'ACADEMICS':
      return 'EDUCATION';
    case 'CERTIFICATIONS':
    case 'CERTIFICATES':
      return 'CERTIFICATIONS';
    case 'COURSEWORK':
    case 'RELEVANT_COURSEWORK':
      return 'COURSEWORK';
    case 'PUBLICATIONS':
    case 'RESEARCH':
      return 'PUBLICATIONS';
    case 'ACHIEVEMENTS':
    case 'HONORS':
      return 'ACHIEVEMENTS';
    default:
      return upper;
  }
}

export class MasterResumeStructureService {
  /**
   * Resolves the candidate's master resume structure contract.
   *
   * @param {object} candidateProfile Candidate domain object
   * @param {object} [options]
   * @returns {object} Validated MasterResumeStructure object
   */
  static resolveMasterStructure(candidateProfile = {}, options = {}) {
    const meta = candidateProfile?.profileMetadata || {};

    // 1. Explicit resumeStructure on profile or options
    const explicit =
      options.masterStructure || candidateProfile.resumeStructure || meta.resumeStructure;
    if (explicit && Array.isArray(explicit.sectionOrder) && explicit.sectionOrder.length > 0) {
      return MasterResumeStructureSchema.parse({
        sections: explicit.sections || explicit.sectionOrder,
        sectionOrder: explicit.sectionOrder,
        sectionTitles: { ...DEFAULT_MASTER_SECTION_TITLES, ...(explicit.sectionTitles || {}) },
        sectionPolicy: { ...DEFAULT_SECTION_POLICY, ...(explicit.sectionPolicy || {}) },
        projectSlotCapacity: explicit.projectSlotCapacity || 2,
        source: 'PROFILE_METADATA',
        metadata: explicit.metadata || {},
      });
    }

    // 2. Derive from candidate base resume sections if available
    const rawSections =
      candidateProfile.resumeSections || meta.resumeSections || meta.resumeData?.sections || null;

    if (Array.isArray(rawSections) && rawSections.length > 0) {
      const derivedOrder = [];
      const derivedTitles = { ...DEFAULT_MASTER_SECTION_TITLES };
      const seenCanonical = new Set();

      // Sort by order_index / order if available
      const sortedSections = [...rawSections].sort(
        (a, b) =>
          (a.orderIndex ?? a.order ?? a.section_order ?? 0) -
          (b.orderIndex ?? b.order ?? b.section_order ?? 0)
      );

      for (const sec of sortedSections) {
        let rawType = sec.sectionType || sec.section_type || sec.type;
        const rawText = String(sec.rawText || sec.raw_text || '').toLowerCase();
        const rawTitle = String(
          sec.sectionTitle || sec.section_title || sec.title || sec.heading || ''
        ).toLowerCase();
        if (
          rawTitle.includes('problem solving') ||
          rawTitle.includes('dsa') ||
          rawTitle.includes('leetcode') ||
          rawText.includes('leetcode') ||
          rawText.includes('problem solving')
        ) {
          rawType = 'DSA';
        }
        const canonicalKey = normalizeSectionType(rawType);
        if (!seenCanonical.has(canonicalKey) && canonicalKey !== 'UNKNOWN') {
          seenCanonical.add(canonicalKey);
          derivedOrder.push(canonicalKey);
          const rawTitleStr = sec.sectionTitle || sec.section_title || sec.title || sec.heading;
          if (rawTitleStr && typeof rawTitleStr === 'string' && rawTitleStr.trim()) {
            derivedTitles[canonicalKey] = rawTitleStr.trim();
          }
        }
      }

      // Ensure HEADER is first if not present
      if (!seenCanonical.has('HEADER')) {
        derivedOrder.unshift('HEADER');
        seenCanonical.add('HEADER');
      }

      // Ensure DSA is positioned after PROJECTS per canonical master structure only when present
      if (seenCanonical.has('DSA') && seenCanonical.has('PROJECTS')) {
        const dsaIdx = derivedOrder.indexOf('DSA');
        derivedOrder.splice(dsaIdx, 1);
        const projIdx = derivedOrder.indexOf('PROJECTS');
        derivedOrder.splice(projIdx + 1, 0, 'DSA');
      }

      // Ensure EDUCATION is positioned after PROJECTS/EXPERIENCE per career stage ordering
      if (seenCanonical.has('EDUCATION')) {
        const eduIdx = derivedOrder.indexOf('EDUCATION');
        if (eduIdx !== -1) {
          const lastCoreIdx = Math.max(
            derivedOrder.indexOf('EXPERIENCE'),
            derivedOrder.indexOf('PROJECTS'),
            derivedOrder.indexOf('DSA'),
            derivedOrder.indexOf('SKILLS')
          );
          if (lastCoreIdx > eduIdx) {
            derivedOrder.splice(eduIdx, 1);
            derivedOrder.splice(lastCoreIdx, 0, 'EDUCATION');
          }
        }
      }

      // If core sections were missing from parse, append them in standard order
      const CORE_MASTER_SECTIONS = [
        'HEADER',
        'SUMMARY',
        'SKILLS',
        'PROJECTS',
        'DSA',
        'EXPERIENCE',
        'EDUCATION',
        'CERTIFICATIONS',
      ];
      for (const stdKey of CORE_MASTER_SECTIONS) {
        if (!seenCanonical.has(stdKey)) {
          derivedOrder.push(stdKey);
          seenCanonical.add(stdKey);
        }
      }

      return MasterResumeStructureSchema.parse({
        sections: derivedOrder,
        sectionOrder: derivedOrder,
        sectionTitles: derivedTitles,
        sectionPolicy: DEFAULT_SECTION_POLICY,
        projectSlotCapacity: options.projectSlotCapacity || 2,
        source: 'CANDIDATE_BASE_RESUME',
      });
    }

    // 3. Canonical default master structure
    return MasterResumeStructureSchema.parse({
      sections: [...DEFAULT_MASTER_SECTION_ORDER],
      sectionOrder: [...DEFAULT_MASTER_SECTION_ORDER],
      sectionTitles: { ...DEFAULT_MASTER_SECTION_TITLES },
      sectionPolicy: DEFAULT_SECTION_POLICY,
      projectSlotCapacity: options.projectSlotCapacity || 2,
      source: 'DEFAULT_CONTRACT',
    });
  }

  /**
   * Applies the Section Presence Rule (Req 13):
   * A section exists in the generated resume IF:
   * 1. The master resume structure includes it, AND
   * 2. The candidate possesses usable, non-empty data for that section.
   *
   * Content within the section is job-conditioned; the section existence is data-conditioned.
   *
   * @param {object} masterStructure MasterResumeStructure object
   * @param {object} candidateData Normalized candidate data
   * @returns {string[]} Ordered array of active section keys
   */
  static deriveActiveSectionOrder(masterStructure, candidateData = {}) {
    const rawOrder = masterStructure?.sectionOrder || DEFAULT_MASTER_SECTION_ORDER;
    const policies = masterStructure?.sectionPolicy || DEFAULT_SECTION_POLICY;

    const activeOrder = [];

    for (const key of rawOrder) {
      const canonicalKey = normalizeSectionType(key);
      const policy = policies[canonicalKey] || 'REQUIRED_IF_DATA';

      if (policy === 'REQUIRED') {
        activeOrder.push(canonicalKey);
        continue;
      }

      let hasData = false;
      switch (canonicalKey) {
        case 'HEADER':
          hasData = true;
          break;
        case 'SUMMARY':
          hasData = Boolean(
            candidateData.summary ||
            candidateData.headline ||
            candidateData.profileMetadata?.userCustom?.summary
          );
          break;
        case 'SKILLS':
          hasData = Boolean(Array.isArray(candidateData.skills) && candidateData.skills.length > 0);
          break;
        case 'PROJECTS':
          // Technical projects section exists if candidate has projects (Req 6 & 13)
          hasData = Boolean(
            (Array.isArray(candidateData.projects) && candidateData.projects.length > 0) ||
            (Array.isArray(candidateData.profileMetadata?.projects) &&
              candidateData.profileMetadata.projects.length > 0)
          );
          break;
        case 'DSA':
          // DSA section exists ONLY if candidate has meaningful, source-supported accomplishments or authentic statistics (Req 2).
          // A bare LeetCode/Codeforces URL alone is preserved in header links and must NOT force an independent section.
          hasData = Boolean(isMeaningfulDsa(candidateData.dsa));
          break;
        case 'EXPERIENCE':
          hasData = Boolean(
            (Array.isArray(candidateData.experience) && candidateData.experience.length > 0) ||
            (Array.isArray(candidateData.workExperience) && candidateData.workExperience.length > 0)
          );
          break;
        case 'EDUCATION':
          hasData = Boolean(
            Array.isArray(candidateData.education) && candidateData.education.length > 0
          );
          break;
        case 'CERTIFICATIONS':
          hasData = Boolean(
            (Array.isArray(candidateData.certifications) &&
              candidateData.certifications.length > 0) ||
            (Array.isArray(candidateData.profileMetadata?.certifications) &&
              candidateData.profileMetadata.certifications.length > 0) ||
            (Array.isArray(candidateData.profileMetadata?.userCustom?.certifications) &&
              candidateData.profileMetadata.userCustom.certifications.length > 0) ||
            (Array.isArray(candidateData.profileMetadata?.resumeData?.certifications) &&
              candidateData.profileMetadata.resumeData.certifications.length > 0) ||
            (Array.isArray(candidateData.optionalSections?.certifications) &&
              candidateData.optionalSections.certifications.length > 0)
          );
          break;
        case 'COURSEWORK':
          hasData = Boolean(
            Array.isArray(candidateData.coursework) && candidateData.coursework.length > 0
          );
          break;
        case 'PUBLICATIONS':
          hasData = Boolean(
            Array.isArray(candidateData.publications) && candidateData.publications.length > 0
          );
          break;
        case 'ACHIEVEMENTS':
          hasData = Boolean(
            Array.isArray(candidateData.achievements) && candidateData.achievements.length > 0
          );
          break;
        default:
          hasData = Object.entries(OPTIONAL_RESUME_SECTIONS).some(
            ([field, section]) => section === canonicalKey && candidateData[field]?.length > 0
          );
          break;
      }

      if (hasData) {
        activeOrder.push(canonicalKey);
      }
    }

    return activeOrder;
  }
}
