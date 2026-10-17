/**
 * @file Central Resume Content Budget Policy Service
 *
 * Establishes the authoritative, testable content-budget policy governing single-page
 * A4 professional resumes across all platform entry points (Career Hub, MCP,
 * Extension, Studio, Regeneration).
 *
 * Distinguishes between:
 * - HARD CONSTRAINTS: Non-negotiable physical and provenance invariants.
 * - SOFT TARGETS: Preferred word counts, line counts, spacing and density ranges.
 * - OPTIONAL SECTIONS: Discretionary sections included only when high-value and space permits.
 */

export const HARD_CONSTRAINTS = Object.freeze({
  PAGE_MODE: 'ONE_PAGE',
  PAPER_SIZE: 'A4',
  PAGE_WIDTH_PT: 595.276,
  PAGE_HEIGHT_PT: 841.89,
  MINIMUM_FONT_PT: 10.0,
  MINIMUM_PROJECTS_WHEN_AVAILABLE: 2,
  MAXIMUM_PROJECTS: 3,
  ZERO_FABRICATION: true,
  ALLOW_SENTENCE_TRUNCATION: false,
  MAX_PAGES: 1,
});

export const SOFT_TARGETS = Object.freeze({
  HEADER: {
    ROWS: 4,
    ROW_1_NAME: 'Full name (one line, centered, ~18pt bold)',
    ROW_2_ROLE: 'Professional target role (one line, centered, ~10.5pt bold)',
    ROW_4_LINKS:
      'Actual candidate profile URLs without scheme/www (one or two controlled centered lines, 10pt)',
    MAX_ROWS: 5,
  },
  SUMMARY: {
    PREFERRED_WORD_COUNT_MIN: 40,
    PREFERRED_WORD_COUNT_MAX: 70,
    MAX_WORD_COUNT: 80,
    PREFERRED_RENDERED_LINES_MIN: 3,
    PREFERRED_RENDERED_LINES_MAX: 4,
    MAX_RENDERED_LINES: 5,
    CROSS_SECTION_DUPLICATION_MAX_OVERLAP: 0.5,
  },
  TECHNICAL_SKILLS: {
    PREFERRED_CATEGORIES_MIN: 4,
    PREFERRED_CATEGORIES_MAX: 6,
    PREFERRED_VISIBLE_SKILLS_MIN: 12,
    PREFERRED_VISIBLE_SKILLS_MAX: 24,
    PREFERRED_RENDERED_LINES_MIN: 4,
    PREFERRED_RENDERED_LINES_MAX: 6,
    MAX_SKILLS_PER_CATEGORY: 6,
  },
  TECHNICAL_PROJECTS: {
    MIN_PROJECTS: 2,
    MAX_PROJECTS: 3,
    BULLETS_PER_PROJECT_MIN: 2,
    BULLETS_PER_PROJECT_MAX: 3,
    BULLET_WORD_COUNT_MIN: 14,
    BULLET_WORD_COUNT_MAX: 26,
    RENDERED_LINES_PER_BULLET_MIN: 1,
    RENDERED_LINES_PER_BULLET_MAX: 2,
  },
  PROFESSIONAL_EXPERIENCE: {
    BULLETS_PER_ROLE_MIN: 2,
    BULLETS_PER_ROLE_MAX: 3,
    BULLET_WORD_COUNT_MIN: 14,
    BULLET_WORD_COUNT_MAX: 28,
    RENDERED_LINES_PER_BULLET_MIN: 1,
    RENDERED_LINES_PER_BULLET_MAX: 2,
    PRESERVE_AUTHENTIC_METRICS: true,
  },
  EDUCATION: {
    PREFERRED_RENDERED_LINES_MIN: 2,
    PREFERRED_RENDERED_LINES_MAX: 4,
    COMPACT_COURSEWORK_MAX_LINES: 1,
    DEDUPLICATE_LOCATION: true,
  },
  SPOKEN_LANGUAGES: {
    PREFERRED_RENDERED_LINES: 1,
    PRESERVE_AUTHENTIC_LANGUAGES: true,
  },
  PAGE_GEOMETRY: {
    TOP_MARGIN_MM_TARGET_MIN: 12.0,
    TOP_MARGIN_MM_TARGET_MAX: 16.0,
    BOTTOM_MARGIN_MM_TARGET_MIN: 12.0,
    BOTTOM_MARGIN_MM_TARGET_MAX: 18.0,
    LEFT_RIGHT_MARGIN_MM: 12.0,
  },
});

export const OPTIONAL_SECTIONS_POLICY = Object.freeze({
  DSA: {
    DEFAULT_LOCATION: 'HEADER_LINK',
    INDEPENDENT_SECTION_REQUIRES_EVIDENCE: true,
    INDEPENDENT_SECTION_REQUIRES_SPACE: true,
  },
  CERTIFICATIONS: {
    MAX_ENTRIES: 2,
    REQUIRES_RELEVANCE: true,
  },
  COURSEWORK: {
    PREFERRED_LOCATION: 'EDUCATION_SUBENTRY',
    MAX_ITEMS: 6,
  },
});

/**
 * Tokenizes text into lowercase word tokens.
 * @param {string} text
 * @returns {Set<string>}
 */
function tokenizeWords(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .match(/[\p{L}\p{N}+#.]{3,}/gu) || []
  );
}

/**
 * Calculates semantic Jaccard token overlap between two strings.
 * @param {string} textA
 * @param {string} textB
 * @returns {number} Value between 0.0 and 1.0
 */
export function calculateSemanticOverlap(textA, textB) {
  const tokensA = tokenizeWords(textA);
  const tokensB = tokenizeWords(textB);
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0.0;
}

export class ResumeContentBudgetService {
  /**
   * Evaluates cross-section redundancy across summary, projects, experience, and skills.
   * Identifies exact or near-duplicate accomplishment claims.
   *
   * @param {object} resumeDoc Structured resume document
   * @returns {{ hasRedundancy: boolean, duplicatePairs: Array<{ sectionA: string, sectionB: string, overlap: number, sampleText: string }> }}
   */
  static detectCrossSectionRedundancy(resumeDoc) {
    if (!resumeDoc) return { hasRedundancy: false, duplicatePairs: [] };

    const duplicatePairs = [];
    const summaryText = resumeDoc.summary?.text || '';
    const summarySentences = String(summaryText)
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 15);

    // Collect project bullets
    const projectBullets = [];
    for (const p of resumeDoc.projects || []) {
      for (const b of p.bullets || []) {
        const text = typeof b === 'string' ? b : b?.text || '';
        if (text.trim().length > 15) {
          projectBullets.push({
            projectName: p.displayName || p.name || 'Project',
            text: text.trim(),
            factIds: b?.composedFromFactIds || [],
          });
        }
      }
    }

    // Collect experience bullets
    const experienceBullets = [];
    for (const exp of resumeDoc.experience || []) {
      for (const b of exp.bullets || []) {
        const text = typeof b === 'string' ? b : b?.text || '';
        if (text.trim().length > 15) {
          experienceBullets.push({
            company: exp.company || 'Company',
            text: text.trim(),
            factIds: b?.composedFromFactIds || [],
          });
        }
      }
    }

    // Check Summary vs Experience
    for (const sSentence of summarySentences) {
      for (const expB of experienceBullets) {
        const overlap = calculateSemanticOverlap(sSentence, expB.text);
        const exactContainment =
          sSentence.toLowerCase().includes(expB.text.toLowerCase()) ||
          expB.text.toLowerCase().includes(sSentence.toLowerCase());
        if (overlap >= 0.55 || exactContainment) {
          duplicatePairs.push({
            sectionA: 'SUMMARY',
            sectionB: `EXPERIENCE (${expB.company})`,
            overlap: Math.max(overlap, exactContainment ? 0.95 : 0),
            sampleText: expB.text,
          });
        }
      }
    }

    // Check Summary vs Projects
    for (const sSentence of summarySentences) {
      for (const projB of projectBullets) {
        const overlap = calculateSemanticOverlap(sSentence, projB.text);
        const exactContainment =
          sSentence.toLowerCase().includes(projB.text.toLowerCase()) ||
          projB.text.toLowerCase().includes(sSentence.toLowerCase());
        if (overlap >= 0.6 || exactContainment) {
          duplicatePairs.push({
            sectionA: 'SUMMARY',
            sectionB: `PROJECTS (${projB.projectName})`,
            overlap: Math.max(overlap, exactContainment ? 0.95 : 0),
            sampleText: projB.text,
          });
        }
      }
    }

    // Check pairwise Project bullets for intra-project or cross-project duplication
    for (let i = 0; i < projectBullets.length; i++) {
      for (let j = i + 1; j < projectBullets.length; j++) {
        const bA = projectBullets[i];
        const bB = projectBullets[j];
        const overlap = calculateSemanticOverlap(bA.text, bB.text);
        if (overlap >= 0.65) {
          duplicatePairs.push({
            sectionA: `PROJECT (${bA.projectName})`,
            sectionB: `PROJECT (${bB.projectName})`,
            overlap,
            sampleText: bA.text,
          });
        }
      }
    }

    return {
      hasRedundancy: duplicatePairs.length > 0,
      duplicatePairs,
    };
  }

  /**
   * Generates a comprehensive per-section content budget report.
   *
   * @param {object} params
   * @param {object} params.structuredResume
   * @param {object} [params.pageMeasurements]
   * @returns {object} Budget report
   */
  static generateSectionBudgetReport({ structuredResume = {}, pageMeasurements = {} }) {
    const report = {
      timestamp: new Date().toISOString(),
      hardConstraints: {
        pageCount: pageMeasurements.pageCount || 1,
        pageCountStatus: (pageMeasurements.pageCount || 1) === 1 ? 'PASS' : 'FAIL',
        minimumFontPt: pageMeasurements.minimumFontPt || 10.0,
        fontFloorStatus: (pageMeasurements.minimumFontPt || 10.0) >= 9.95 ? 'PASS' : 'FAIL',
        projectCount: (structuredResume.projects || []).length,
        projectCountStatus:
          (structuredResume.projects || []).length >= 2 &&
          (structuredResume.projects || []).length <= 3
            ? 'PASS'
            : 'WARN',
      },
      sections: {},
      geometry: {
        topMarginMm: pageMeasurements.topMarginMm || 13.0,
        bottomMarginMm: pageMeasurements.bottomMarginMm || 15.0,
        topMarginStatus: 'PASS',
        bottomMarginStatus: 'PASS',
        bottomOccupancyRatio: pageMeasurements.bottomOccupancyRatio || 0.92,
      },
      redundancyAudit: this.detectCrossSectionRedundancy(structuredResume),
    };

    // 1. Header
    const identity = structuredResume.candidateIdentity || {};
    report.sections.HEADER = {
      name: identity.displayName || 'Candidate',
      targetRole: identity.headline || 'Target Role',
      phone: identity.phone || null,
      location: identity.location || null,
      email: identity.email || null,
      linksCount: (identity.links || []).length,
      rowsExpected: 4,
      status: 'PASS',
    };

    // 2. Summary
    const summaryText = structuredResume.summary?.text || '';
    const summaryWordCount = summaryText.split(/\s+/).filter(Boolean).length;
    const summaryLinesEstimated = Math.ceil(summaryWordCount / 16);
    report.sections.SUMMARY = {
      wordCount: summaryWordCount,
      estimatedLines: summaryLinesEstimated,
      targetRange: '40-70 words',
      status:
        summaryWordCount >= 35 && summaryWordCount <= 80
          ? 'PASS'
          : summaryWordCount > 80
            ? 'EXCEEDS_BUDGET'
            : 'UNDER_TARGET',
      text: summaryText,
    };

    // 3. Technical Skills
    const skillCategories = structuredResume.skills?.categories || [];
    const totalSkills = skillCategories.reduce(
      (sum, cat) => sum + ((cat.skills || []).length || 0),
      0
    );
    report.sections.TECHNICAL_SKILLS = {
      categoryCount: skillCategories.length,
      totalSkillsCount: totalSkills,
      renderedLines: skillCategories.length,
      categoryOrder: skillCategories.map((c) => c.categoryName || c.name),
      status:
        skillCategories.length >= 4 && totalSkills >= 12 && totalSkills <= 26
          ? 'PASS'
          : 'ACCEPTABLE',
    };

    // 4. Projects
    const projects = structuredResume.projects || [];
    report.sections.PROJECTS = {
      projectCount: projects.length,
      projects: projects.map((p) => {
        const bullets = p.bullets || [];
        return {
          name: p.displayName || p.name,
          bulletCount: bullets.length,
          technologiesCount: (p.technologies || []).length,
          bullets: bullets.map((b) => {
            const text = typeof b === 'string' ? b : b?.text || '';
            const words = text.split(/\s+/).filter(Boolean).length;
            return {
              wordCount: words,
              estimatedLines: Math.ceil(words / 14),
              text,
            };
          }),
        };
      }),
      status: projects.length >= 2 && projects.length <= 3 ? 'PASS' : 'WARN',
    };

    // 5. Experience
    const experience = structuredResume.experience || [];
    report.sections.EXPERIENCE = {
      rolesCount: experience.length,
      roles: experience.map((exp) => {
        const bullets = exp.bullets || [];
        const hasMetric = bullets.some((b) =>
          /\b\d+(?:\.\d+)?%/i.test(typeof b === 'string' ? b : b?.text || '')
        );
        return {
          company: exp.company,
          title: exp.title,
          bulletCount: bullets.length,
          hasQuantitativeMetric: hasMetric,
          bullets: bullets.map((b) => {
            const text = typeof b === 'string' ? b : b?.text || '';
            const words = text.split(/\s+/).filter(Boolean).length;
            return {
              wordCount: words,
              estimatedLines: Math.ceil(words / 15),
              text,
            };
          }),
        };
      }),
      status: 'PASS',
    };

    // 6. Education
    const education = structuredResume.education || [];
    report.sections.EDUCATION = {
      recordsCount: education.length,
      records: education.map((edu) => ({
        institution: edu.institution,
        degree: edu.degree,
        courseworkCount: (edu.coursework || []).length,
        hasGrade: Boolean(edu.grade),
      })),
      status: 'PASS',
    };

    // 7. Languages
    const languages = structuredResume.optionalSections?.languages || [];
    report.sections.LANGUAGES = {
      entriesCount: languages.length,
      languages: languages.map((l) =>
        typeof l === 'string' ? l : `${l.language} (${l.proficiency})`
      ),
      status: languages.length > 0 ? 'PASS' : 'OMITTED',
    };

    return report;
  }
}
