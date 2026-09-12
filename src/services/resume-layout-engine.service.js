/**
 * @file Adaptive ATS-Safe Resume Layout Engine (P14-026)
 *
 * Separates UNIVERSAL ATS-SAFE CONSTRAINTS from ADAPTIVE LAYOUT DECISIONS.
 *
 * The engine reasons in semantic document components (Header, Summary, Skills,
 * Projects, Experience, Education, etc.) and dynamically adapts spacing based
 * on actual content volume, section count, and page geometry.
 *
 * Key principles:
 * - NO candidate-specific or job-specific hardcoding
 * - Spacing decisions computed from semantic document model
 * - Hierarchy preserved: sectionGap > entryGap > headingGap > bulletGap
 * - Page budget calculated before rendering
 * - Density classified from estimated content utilization
 *
 * Invariants:
 * - Universal ATS constraints (single-column, linear order, selectable text,
 *   conventional headings, no layout tables) are fixed and never modified.
 * - Adaptive decisions (spacing values, compression, page strategy) are
 *   computed per-document from actual content.
 * - This service NEVER changes candidate data, evidence, or content strategy.
 */

import { countDistinctCanonicalFacts } from './candidate-artifact-content.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. UNIVERSAL ATS-SAFE CONSTRAINTS (stable, never candidate-dependent)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fixed document constraints that define ATS-safe layout boundaries.
 * These are NOT tuning knobs — they represent invariant ATS requirements.
 */
export const ATS_DOCUMENT_CONSTRAINTS = Object.freeze({
  // Page geometry (letter paper)
  pageWidthPt: 614,         // 8.5in at 72dpi
  pageHeightPt: 794,        // 11in at 72dpi
  marginPt: 39.6,            // 0.55in margins (P16-006: matching geometry package)

  // Typography
  baseFontSizePt: 10,
  minFontSizePt: 9,         // Never go below for readability
  maxFontSizePt: 12,
  lineHeightMultiplier: 1.2, // Standard TeX baselineskip ratio

  // Layout rules
  singleColumn: true,
  linearReadingOrder: true,
  noLayoutTables: true,
  noTextBoxes: true,
  selectableText: true,
  conventionalHeadings: true,

  // Derived
  get usableWidthPt() { return this.pageWidthPt - (2 * this.marginPt); },
  get usableHeightPt() { return this.pageHeightPt - (2 * this.marginPt); },
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SEMANTIC SPACING RELATIONSHIPS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Semantic spacing relationship types.
 * The layout engine adjusts these adaptively but always preserves their hierarchy.
 */
export const SPACING_RELATIONSHIPS = Object.freeze({
  HEADER_TO_SECTION: 'HEADER_TO_SECTION',             // Document header → first section
  SECTION_TO_SECTION: 'SECTION_TO_SECTION',           // Between major sections (Summary → Skills → Projects...)
  HEADING_TO_CONTENT: 'HEADING_TO_CONTENT',           // Section heading rule → first content line
  ENTRY_TO_ENTRY: 'ENTRY_TO_ENTRY',                   // Between entries within a section (Project 1 → Project 2)
  PROJECT_TITLE_TO_TECH: 'PROJECT_TITLE_TO_TECH',     // Project title line → technologies line
  PROJECT_TECH_TO_BULLETS: 'PROJECT_TECH_TO_BULLETS', // Technologies line → bullet list
  ROLE_TO_METADATA: 'ROLE_TO_METADATA',               // Role/degree → location/institution
  METADATA_TO_BULLETS: 'METADATA_TO_BULLETS',         // Location/subtitle → bullet list
  BULLET_TO_BULLET: 'BULLET_TO_BULLET',               // Between consecutive bullets
  // Backward-compatibility aliases:
  SECTION_TO_CONTENT: 'SECTION_TO_CONTENT',
  TITLE_TO_TECHNOLOGY: 'TITLE_TO_TECHNOLOGY',
  TECHNOLOGY_TO_BULLETS: 'TECHNOLOGY_TO_BULLETS',
  HEADER_TO_BODY: 'HEADER_TO_BODY',
});

/**
 * Base spacing design tokens (in pt).
 * Invariant hierarchy: SECTION_TO_SECTION > ENTRY_TO_ENTRY > HEADING_TO_CONTENT > BULLET_TO_BULLET
 */
export const BASE_SPACING_TOKENS = Object.freeze({
  [SPACING_RELATIONSHIPS.HEADER_TO_SECTION]: 10,
  [SPACING_RELATIONSHIPS.SECTION_TO_SECTION]: 9,
  [SPACING_RELATIONSHIPS.ENTRY_TO_ENTRY]: 5,
  [SPACING_RELATIONSHIPS.HEADING_TO_CONTENT]: 3,
  [SPACING_RELATIONSHIPS.PROJECT_TITLE_TO_TECH]: 1.5,
  [SPACING_RELATIONSHIPS.PROJECT_TECH_TO_BULLETS]: 2.5,
  [SPACING_RELATIONSHIPS.ROLE_TO_METADATA]: 1.5,
  [SPACING_RELATIONSHIPS.METADATA_TO_BULLETS]: 2.5,
  [SPACING_RELATIONSHIPS.BULLET_TO_BULLET]: 1.2,
  // Backward-compatibility aliases:
  [SPACING_RELATIONSHIPS.SECTION_TO_CONTENT]: 3,
  [SPACING_RELATIONSHIPS.TITLE_TO_TECHNOLOGY]: 1.5,
  [SPACING_RELATIONSHIPS.TECHNOLOGY_TO_BULLETS]: 2.5,
  [SPACING_RELATIONSHIPS.HEADER_TO_BODY]: 10,
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. DENSITY CLASSIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Layout density classification.
 * These are internal layout classifications, NOT ATS or employer-facing scores.
 */
export const DENSITY_CLASSIFICATION = Object.freeze({
  TOO_SPARSE: 'TOO_SPARSE',   // Content utilization < 65% for 1-page target
  BALANCED: 'BALANCED',       // Content utilization 65-92%
  DENSE: 'DENSE',             // Content utilization 92-100% (fits, but tight)
  OVERFULL: 'OVERFULL',       // Content exceeds available page budget
});

/**
 * Page strategy policies.
 */
export const PAGE_STRATEGY = Object.freeze({
  ONE_PAGE_TARGET: 'ONE_PAGE_TARGET',
  TWO_PAGE_ALLOWED: 'TWO_PAGE_ALLOWED',
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SEMANTIC DOCUMENT MODEL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Semantic component types.
 */
export const COMPONENT_TYPE = Object.freeze({
  HEADER: 'HEADER',
  SUMMARY: 'SUMMARY',
  SKILLS: 'SKILLS',
  PROJECTS: 'PROJECTS',
  PROJECT: 'PROJECT',
  OPTIONAL_DSA: 'OPTIONAL_DSA',
  OPTIONAL_CERTIFICATIONS: 'OPTIONAL_CERTIFICATIONS',
  EXPERIENCE: 'EXPERIENCE',
  EXPERIENCE_ENTRY: 'EXPERIENCE_ENTRY',
  EDUCATION: 'EDUCATION',
  EDUCATION_ENTRY: 'EDUCATION_ENTRY',
});

// --
// 5. ENGINE SERVICE
// --

export class ResumeLayoutEngine {
  /**
   * Builds a semantic model of the document from profile and package data.
   * Reasons in components, not raw lines.
   *
   * @param {Object} [profileOrParams={}] Candidate profile or { applicationPackage, candidateProfile }
   * @param {Object} [pkg={}] Resume package / tailored resume data
   * @returns {Object} Semantic document model
   */
  buildSemanticModel(profileOrParams = {}, pkg = {}) {
    let profile, actualPkg;
    if (profileOrParams?.applicationPackage || profileOrParams?.candidateProfile) {
      profile = profileOrParams.candidateProfile || {};
      actualPkg = profileOrParams.applicationPackage || {};
    } else {
      profile = profileOrParams || {};
      actualPkg = pkg || {};
    }
    const resume = actualPkg.tailoredResume || actualPkg.resume || actualPkg;
    const structuredResume = resume.structuredResume || actualPkg.structuredResume || null;
    const selectedSections = resume.selectedSections || actualPkg.selectedSections || [];

    // -- Header --
    const linkCount = structuredResume
      ? (Array.isArray(structuredResume.candidateIdentity?.links) ? structuredResume.candidateIdentity.links.length : 0)
      : this._countProfileLinks(actualPkg, profile);
    const hasHeadline = structuredResume
      ? Boolean(structuredResume.candidateIdentity?.headline)
      : Boolean(profile.headline || actualPkg.headline);
    const headerLines = 1 + (hasHeadline ? 1 : 0) + (linkCount > 0 ? 1 : 0);

    // -- Summary --
    const summaryText = structuredResume
      ? (structuredResume.summary?.text || '')
      : this._extractSummaryText(actualPkg, profile);
    const summaryCharCount = summaryText ? summaryText.length : 0;
    const summaryWordCount = summaryText ? summaryText.split(/\s+/).length : 0;
    const summaryLines = summaryWordCount > 0
      ? Math.max(1, Math.ceil(summaryCharCount / 85)) + 1
      : 0;

    // ── Skills ──
    let skillCategoryCount = 0;
    let totalSkillLines = 0;
    if (structuredResume && Array.isArray(structuredResume.skills?.categories)) {
      const cats = structuredResume.skills.categories;
      skillCategoryCount = cats.length;
      totalSkillLines = skillCategoryCount;
      for (const cat of cats) {
        const catName = cat.categoryName || cat.name || cat.category || '';
        const items = Array.isArray(cat.skills) ? cat.skills : [];
        const names = items
          .map(s => (typeof s === 'string' ? s : s.displayName || s.name || s.slug))
          .filter(Boolean);
        if (names.length > 0) {
          const lineStr = `${catName}: ${names.join(', ')}`;
          if (lineStr.length > 85) totalSkillLines += Math.ceil(lineStr.length / 85) - 1;
        }
      }
    } else {
      const categorizedSkills = resume.categorizedSkills || actualPkg.categorizedSkills || {};
      skillCategoryCount = Object.keys(categorizedSkills).filter(
        k => Array.isArray(categorizedSkills[k]) && categorizedSkills[k].length > 0
      ).length;
      totalSkillLines = skillCategoryCount;
      for (const [catName, list] of Object.entries(categorizedSkills)) {
        if (Array.isArray(list) && list.length > 0) {
          const lineStr = `${catName}: ${list.join(', ')}`;
          if (lineStr.length > 85) totalSkillLines += Math.ceil(lineStr.length / 85) - 1;
        }
      }
    }
    const skillsLines = skillCategoryCount > 0 ? totalSkillLines + 1 : 0;

    // ── Projects ──
    const selectedProjects = structuredResume
      ? (Array.isArray(structuredResume.projects) ? structuredResume.projects : [])
      : (resume.selectedProjects || actualPkg.selectedProjects || []);
    const projectComponents = selectedProjects.map(p => {
      const rawBullets = Array.isArray(p.bullets) ? p.bullets : (Array.isArray(p.highlights) ? p.highlights : []);
      const bulletStrings = rawBullets.map(b => typeof b === 'string' ? b : (b?.text || '')).filter(Boolean);
      const bulletLengths = bulletStrings.map(b => b.length);
      const bulletCount = Math.min(bulletStrings.length, 3);
      const rawTechs = Array.isArray(p.technologies) ? p.technologies : [];
      const techString = rawTechs.join(', ');
      const techCount = rawTechs.length;
      const techLines = techString.length > 0 ? Math.max(1, Math.ceil(techString.length / 85)) : 0;
      const bulletLines = bulletLengths.slice(0, 3).reduce((sum, len) => sum + Math.max(1, Math.ceil(len / 85)), 0) || (bulletCount * 1.5);
      const estimatedLines = 1 + techLines + bulletLines;
      return {
        type: COMPONENT_TYPE.PROJECT,
        name: p.name || p.displayName || p.projectName || p.title || 'Project',
        bulletCount,
        bulletLengths: bulletLengths.slice(0, 3),
        techCount,
        techStringLength: techString.length,
        estimatedLines,
        hasContent: true,
      };
    });

    // ── Optional: DSA ──
    let hasDSA = false;
    if (structuredResume) {
      hasDSA = Boolean(structuredResume.dsa?.hasSection);
    } else if (Array.isArray(selectedSections) && selectedSections.length > 0) {
      hasDSA = selectedSections.some(s =>
        ['PROBLEM_SOLVING', 'DSA', 'LEETCODE', 'ALGORITHMIC_PRACTICE'].includes(String(s).toUpperCase())
      );
    } else if (resume.markdownContent) {
      hasDSA = /## (?:Problem Solving|Algorithmic Practice|LeetCode)/i.test(resume.markdownContent);
    }
    const dsaComponent = hasDSA ? {
      type: COMPONENT_TYPE.OPTIONAL_DSA,
      estimatedLines: 5,
      bulletCount: 2,
      hasContent: true,
    } : null;

    // ── Experience ──
    const experienceRecords = structuredResume
      ? (Array.isArray(structuredResume.experience) ? structuredResume.experience : [])
      : this._resolveExperience(profile);
    const experienceComponents = experienceRecords.map(exp => {
      const rawBullets = Array.isArray(exp.bullets || exp.highlights)
        ? (Array.isArray(exp.bullets) ? exp.bullets : exp.highlights)
        : (typeof (exp.description || exp.bullets) === 'string' ? exp.description.split('\n') : []);
      const bulletStrings = rawBullets.map(b => typeof b === 'string' ? b : (b?.text || '')).filter(Boolean);
      const bulletLengths = bulletStrings.map(b => b.length);
      const bulletCount = Math.max(bulletStrings.length, 1);
      const bulletLines = bulletLengths.reduce((sum, len) => sum + Math.max(1, Math.ceil(len / 85)), 0) || (bulletCount * 1.5);
      const estimatedLines = 2 + bulletLines;
      return {
        type: COMPONENT_TYPE.EXPERIENCE_ENTRY,
        estimatedLines,
        bulletCount,
        bulletLengths,
        hasContent: true,
      };
    });

    // ── Education ──
    const educationRecords = structuredResume
      ? (Array.isArray(structuredResume.education) ? structuredResume.education : [])
      : this._resolveEducation(profile);
    const educationComponents = educationRecords.map(edu => {
      const hasCoursework = Array.isArray(edu.coursework) && edu.coursework.length > 0;
      const estimatedLines = 2 + (hasCoursework ? 1 : 0);
      return {
        type: COMPONENT_TYPE.EDUCATION_ENTRY,
        estimatedLines,
        hasCoursework,
        hasContent: true,
      };
    });

    // ── Certifications ──
    const certRecords = structuredResume
      ? (Array.isArray(structuredResume.certifications) ? structuredResume.certifications : [])
      : this._resolveCertifications(profile, resume);
    const hasCertifications = certRecords.length > 0 && (
      structuredResume
        ? true
        : (Array.isArray(selectedSections) && selectedSections.length > 0)
          ? selectedSections.some(s => ['CERTIFICATIONS', 'CERTIFICATION'].includes(String(s).toUpperCase()))
          : /## (?:Certifications|Certificates)/i.test(resume.markdownContent || '')
    );

    // ── Assemble Model ──
    const model = {
      header: {
        type: COMPONENT_TYPE.HEADER,
        estimatedLines: headerLines,
        linkCount,
        hasHeadline,
        hasContent: true,
      },
      summary: {
        type: COMPONENT_TYPE.SUMMARY,
        estimatedLines: summaryLines,
        wordCount: summaryWordCount,
        charCount: summaryCharCount,
        hasContent: summaryLines > 0,
      },
      skills: {
        type: COMPONENT_TYPE.SKILLS,
        estimatedLines: skillsLines,
        categoryCount: skillCategoryCount,
        totalLines: totalSkillLines,
        hasContent: skillsLines > 0,
      },
      projects: {
        type: COMPONENT_TYPE.PROJECTS,
        components: projectComponents,
        count: projectComponents.length,
        estimatedLines: projectComponents.length > 0
          ? 1 + projectComponents.reduce((sum, p) => sum + p.estimatedLines, 0)
          : 0,
        hasContent: projectComponents.length > 0,
      },
      optionalSections: {
        dsa: dsaComponent,
        certifications: hasCertifications ? {
          type: COMPONENT_TYPE.OPTIONAL_CERTIFICATIONS,
          estimatedLines: 1 + certRecords.length,
          count: certRecords.length,
          hasContent: true,
        } : null,
      },
      experience: {
        type: COMPONENT_TYPE.EXPERIENCE,
        components: experienceComponents,
        count: experienceComponents.length,
        estimatedLines: experienceComponents.length > 0
          ? 1 + experienceComponents.reduce((sum, e) => sum + e.estimatedLines, 0)
          : 0,
        hasContent: experienceComponents.length > 0,
      },
      education: {
        type: COMPONENT_TYPE.EDUCATION,
        components: educationComponents,
        count: educationComponents.length,
        estimatedLines: educationComponents.length > 0
          ? 1 + educationComponents.reduce((sum, e) => sum + e.estimatedLines, 0)
          : 0,
        hasContent: educationComponents.length > 0,
      },
    };

    return model;
  }

  /**
   * Calculates realistic vertical page budget from semantic document model.
   *
   * FORMULA SPECIFICATION:
   * Total Estimated Content Height (pt) =
   *   headerHeightPt (name 24pt + baseline + headline + contact lines + gap)
   *   + sectionHeadingsTotalHeightPt (count * [sectionGap + headingText + rule + headingGap])
   *   + summaryHeightPt (char-based wrapped lines * lineHeight)
   *   + skillsHeightPt (category-wrapped lines * lineHeight)
   *   + projectsHeightPt (sum of: title line + wrapped tech lines + headGap + itemizeGlue + wrapped bullets + bulletSep + entryGap)
   *   + dsaHeightPt (if selected: title + subtitle + headGap + itemizeGlue + wrapped bullets + entryGap)
   *   + experienceHeightPt (sum of: title/dates + location + itemizeGlue + wrapped bullets + bulletSep + entryGap)
   *   + educationHeightPt (sum of: degree/dates + institution + optional coursework + entryGap)
   *   + certsHeightPt (if selected: count * line + gap)
   *   + SAFETY_MARGIN_PT (15pt buffer for TeX font rendering/glue variability)
   *
   * @param {object} model SemanticDocumentModel
   * @param {object} [constraints] Override document constraints
   * @returns {object} PageBudget
   */
  calculatePageBudget(model, constraints = ATS_DOCUMENT_CONSTRAINTS) {
    const usableHeightPt = constraints.usableHeightPt;
    const lineHeightPt = constraints.baseFontSizePt * constraints.lineHeightMultiplier;

    // Track total estimated lines and breakdown for diagnostic compatibility
    let totalEstimatedLines = 0;
    const sectionBreakdown = {};
    const activeSections = [];

    // Header lines
    const headerLines = model.header?.estimatedLines || 3;
    totalEstimatedLines += headerLines;
    sectionBreakdown.header = headerLines;

    if (model.summary?.hasContent) {
      totalEstimatedLines += model.summary.estimatedLines;
      sectionBreakdown.summary = model.summary.estimatedLines;
      activeSections.push('SUMMARY');
    }
    if (model.skills?.hasContent) {
      totalEstimatedLines += model.skills.estimatedLines;
      sectionBreakdown.skills = model.skills.estimatedLines;
      activeSections.push('SKILLS');
    }
    if (model.projects?.hasContent) {
      totalEstimatedLines += model.projects.estimatedLines;
      sectionBreakdown.projects = model.projects.estimatedLines;
      activeSections.push('PROJECTS');
    }
    if (model.optionalSections?.dsa?.hasContent) {
      totalEstimatedLines += model.optionalSections.dsa.estimatedLines;
      sectionBreakdown.dsa = model.optionalSections.dsa.estimatedLines;
      activeSections.push('DSA');
    }
    if (model.experience?.hasContent) {
      totalEstimatedLines += model.experience.estimatedLines;
      sectionBreakdown.experience = model.experience.estimatedLines;
      activeSections.push('EXPERIENCE');
    }
    if (model.education?.hasContent) {
      totalEstimatedLines += model.education.estimatedLines;
      sectionBreakdown.education = model.education.estimatedLines;
      activeSections.push('EDUCATION');
    }
    if (model.optionalSections?.certifications?.hasContent) {
      totalEstimatedLines += model.optionalSections.certifications.estimatedLines;
      sectionBreakdown.certifications = model.optionalSections.certifications.estimatedLines;
      activeSections.push('CERTIFICATIONS');
    }

    // ── CALIBRATED VERTICAL HEIGHT CONTRIBUTIONS (in TeX points) ──

    // 1. Header Block Height
    // Name (24pt font + baseline ~6pt) + headline (~13pt) + contact details (~13pt each) + header-body gap (~6pt)
    const headerHeightPt = 24 + (headerLines * 13) + 6;

    // 2. Section Headings Overhead
    // Each section heading: \atsSectionGap (~10pt) + Heading text (~14pt) + \hrule (1.5pt) + \atsHeadingGap (~3.5pt) = ~29pt
    const SECTION_HEADING_HEIGHT_PT = 29;
    const sectionHeadingsTotalHeightPt = activeSections.length * SECTION_HEADING_HEIGHT_PT;

    // 3. Summary Content Height
    let summaryHeightPt = 0;
    if (model.summary?.hasContent) {
      const summaryChars = model.summary.charCount || (model.summary.wordCount * 6) || 200;
      const lines = Math.max(1, Math.ceil(summaryChars / 85));
      summaryHeightPt = lines * lineHeightPt;
    }

    // 4. Skills Content Height
    let skillsHeightPt = 0;
    if (model.skills?.hasContent) {
      const lines = model.skills.totalLines || model.skills.categoryCount || 1;
      skillsHeightPt = lines * lineHeightPt;
    }

    // 5. Projects Content Height
    let projectsHeightPt = 0;
    if (model.projects?.hasContent && Array.isArray(model.projects.components)) {
      for (const p of model.projects.components) {
        let pH = 14; // Title & action links line
        const techChars = p.techStringLength || (p.techCount * 12);
        const techLines = techChars > 0 ? Math.max(1, Math.ceil(techChars / 85)) : 0;
        pH += (techLines * 12) + 2; // Technology line(s) + head gap
        pH += 6; // itemize baseline glue overhead
        const bullets = (p.bulletLengths && p.bulletLengths.length > 0)
          ? p.bulletLengths
          : Array(p.bulletCount || 2).fill(120);
        for (const bLen of bullets) {
          const bLines = Math.max(1, Math.ceil(bLen / 85));
          pH += (bLines * lineHeightPt) + 1; // line height + bulletSep
        }
        pH += 4.5; // entry gap
        projectsHeightPt += pH;
      }
    }

    // 6. Optional DSA Content Height (only if selected by Content Strategy)
    let dsaHeightPt = 0;
    if (model.optionalSections?.dsa?.hasContent) {
      // Profile line (14pt) + Subtitle (12pt) + headGap (2pt) + itemize glue (6pt) + 2 bullets (50pt) + entryGap (4.5pt)
      dsaHeightPt = 14 + 12 + 2 + 6 + 50 + 4.5;
    }

    // 7. Experience Content Height
    let experienceHeightPt = 0;
    if (model.experience?.hasContent && Array.isArray(model.experience.components)) {
      for (const exp of model.experience.components) {
        let expH = 14 + 12 + 6; // Title & dates + location + itemize glue
        const bullets = (exp.bulletLengths && exp.bulletLengths.length > 0)
          ? exp.bulletLengths
          : Array(exp.bulletCount || 2).fill(120);
        for (const bLen of bullets) {
          const bLines = Math.max(1, Math.ceil(bLen / 85));
          expH += (bLines * lineHeightPt) + 1;
        }
        expH += 4.5; // entry gap
        experienceHeightPt += expH;
      }
    }

    // 8. Education Content Height
    let educationHeightPt = 0;
    if (model.education?.hasContent && Array.isArray(model.education.components)) {
      for (const edu of model.education.components) {
        const eduH = 14 + 12 + (edu.hasCoursework ? 12 : 0) + 4;
        educationHeightPt += eduH;
      }
    }

    // 9. Optional Certifications Content Height
    let certsHeightPt = 0;
    if (model.optionalSections?.certifications?.hasContent) {
      const count = model.optionalSections.certifications.count || 1;
      certsHeightPt = (count * 13) + 4;
    }

    // 10. Conservative TeX Safety Margin
    const SAFETY_MARGIN_PT = 15;

    const estimatedContentHeightPt =
      headerHeightPt +
      sectionHeadingsTotalHeightPt +
      summaryHeightPt +
      skillsHeightPt +
      projectsHeightPt +
      dsaHeightPt +
      experienceHeightPt +
      educationHeightPt +
      certsHeightPt +
      SAFETY_MARGIN_PT;

    const remainingBudgetPt = usableHeightPt - estimatedContentHeightPt;
    const utilizationRatio = estimatedContentHeightPt / usableHeightPt;

    return {
      usableHeightPt,
      estimatedContentHeightPt,
      remainingBudgetPt,
      utilizationRatio,
      lineHeightPt,
      totalEstimatedLines,
      activeSectionCount: activeSections.length,
      activeSections,
      sectionBreakdown,
      spacingOverheadPt: sectionHeadingsTotalHeightPt,
    };
  }

  /**
   * Determines page strategy based on content volume and candidate profile.
   *
   * @param {object} model SemanticDocumentModel
   * @param {object} budget PageBudget
   * @returns {string} PAGE_STRATEGY value
   */
  determinePageStrategy(model, budget) {
    const experienceCount = model.experience?.count || 0;
    const projectCount = model.projects?.count || 0;
    const educationCount = model.education?.count || 0;

    // Senior candidate indicators: multiple jobs, substantial content
    const isSeniorContent =
      experienceCount >= 3 ||
      (experienceCount >= 2 && projectCount >= 3 && educationCount >= 2);

    // Content would significantly overflow one page
    const wouldOverflow = budget.utilizationRatio > 1.3;

    if (isSeniorContent || wouldOverflow) {
      return PAGE_STRATEGY.TWO_PAGE_ALLOWED;
    }

    return PAGE_STRATEGY.ONE_PAGE_TARGET;
  }

  /**
   * Classifies layout density from calibrated content utilization.
   *
   * @param {number} utilizationRatio Content height / usable page height
   * @param {string} pageStrategy Current page strategy
   * @returns {string} DENSITY_CLASSIFICATION value
   */
  classifyDensity(utilizationRatio, pageStrategy) {
    if (pageStrategy === PAGE_STRATEGY.TWO_PAGE_ALLOWED) {
      if (utilizationRatio < 0.45) return DENSITY_CLASSIFICATION.TOO_SPARSE;
      if (utilizationRatio <= 1.0) return DENSITY_CLASSIFICATION.BALANCED;
      if (utilizationRatio <= 2.0) return DENSITY_CLASSIFICATION.DENSE;
      return DENSITY_CLASSIFICATION.OVERFULL;
    }

    // One-page target (calibrated thresholds)
    if (utilizationRatio < 0.65) return DENSITY_CLASSIFICATION.TOO_SPARSE;
    if (utilizationRatio <= 0.88) return DENSITY_CLASSIFICATION.BALANCED;
    if (utilizationRatio <= 1.0) return DENSITY_CLASSIFICATION.DENSE;
    return DENSITY_CLASSIFICATION.OVERFULL;
  }

  /**
   * Calculates adaptive spacing values based on semantic model and page budget.
   *
   * @param {object} model SemanticDocumentModel
   * @param {object} budget PageBudget
   * @param {string} pageStrategy PAGE_STRATEGY value
   * @param {object} [overrides={}] Calibration overrides
   * @returns {object} LayoutProfile with adapted spacing values
   */
  calculateAdaptiveSpacing(model, budget, pageStrategy, overrides = {}) {
    const density = overrides.density || this.classifyDensity(budget.utilizationRatio, pageStrategy);
    const base = { ...BASE_SPACING_TOKENS };
    const adapted = { ...base };
    let scaleFactor = 1.0;

    switch (density) {
      case DENSITY_CLASSIFICATION.TOO_SPARSE: {
        // Bounded expansion: distribute unused page space into vertical rhythm so the
        // page fills naturally from top to bottom. Caps keep the result professional
        // (no ballooned gaps) and the spacing-hierarchy invariant still holds below.
        const expansionRoom = Math.min(budget.remainingBudgetPt, 110);
        const sectionCount = budget.activeSectionCount;
        if (sectionCount > 0 && expansionRoom > 0) {
          const extraPerSection = Math.min(expansionRoom / sectionCount, 6.0);
          adapted[SPACING_RELATIONSHIPS.SECTION_TO_SECTION] += extraPerSection;
          adapted[SPACING_RELATIONSHIPS.ENTRY_TO_ENTRY] += Math.min(extraPerSection * 0.6, 3.0);
          adapted[SPACING_RELATIONSHIPS.HEADING_TO_CONTENT] += Math.min(extraPerSection * 0.4, 2.0);
          adapted[SPACING_RELATIONSHIPS.HEADER_TO_SECTION] += Math.min(extraPerSection * 0.6, 3.0);
          adapted[SPACING_RELATIONSHIPS.PROJECT_TITLE_TO_TECH] += Math.min(extraPerSection * 0.15, 0.8);
          adapted[SPACING_RELATIONSHIPS.PROJECT_TECH_TO_BULLETS] += Math.min(extraPerSection * 0.25, 1.2);
          adapted[SPACING_RELATIONSHIPS.BULLET_TO_BULLET] += Math.min(extraPerSection * 0.18, 1.0);
        }
        break;
      }

      case DENSITY_CLASSIFICATION.BALANCED:
        scaleFactor = 1.0;
        break;

      case DENSITY_CLASSIFICATION.DENSE: {
        scaleFactor = 0.85;
        adapted[SPACING_RELATIONSHIPS.SECTION_TO_SECTION] = Math.max(6.5, base[SPACING_RELATIONSHIPS.SECTION_TO_SECTION] * scaleFactor);
        adapted[SPACING_RELATIONSHIPS.ENTRY_TO_ENTRY] = Math.max(3.5, base[SPACING_RELATIONSHIPS.ENTRY_TO_ENTRY] * scaleFactor);
        adapted[SPACING_RELATIONSHIPS.HEADING_TO_CONTENT] = Math.max(2.5, base[SPACING_RELATIONSHIPS.HEADING_TO_CONTENT] * scaleFactor);
        adapted[SPACING_RELATIONSHIPS.BULLET_TO_BULLET] = Math.max(0.8, base[SPACING_RELATIONSHIPS.BULLET_TO_BULLET] * scaleFactor);
        adapted[SPACING_RELATIONSHIPS.PROJECT_TITLE_TO_TECH] = 1.2;
        adapted[SPACING_RELATIONSHIPS.PROJECT_TECH_TO_BULLETS] = 2.0;
        adapted[SPACING_RELATIONSHIPS.ROLE_TO_METADATA] = 1.2;
        adapted[SPACING_RELATIONSHIPS.METADATA_TO_BULLETS] = 2.0;
        adapted[SPACING_RELATIONSHIPS.HEADER_TO_SECTION] = 8.0;
        break;
      }

      case DENSITY_CLASSIFICATION.OVERFULL: {
        scaleFactor = 0.68;
        adapted[SPACING_RELATIONSHIPS.SECTION_TO_SECTION] = Math.max(5.0, base[SPACING_RELATIONSHIPS.SECTION_TO_SECTION] * scaleFactor);
        adapted[SPACING_RELATIONSHIPS.ENTRY_TO_ENTRY] = Math.max(2.5, base[SPACING_RELATIONSHIPS.ENTRY_TO_ENTRY] * scaleFactor);
        adapted[SPACING_RELATIONSHIPS.HEADING_TO_CONTENT] = Math.max(1.8, base[SPACING_RELATIONSHIPS.HEADING_TO_CONTENT] * scaleFactor);
        adapted[SPACING_RELATIONSHIPS.BULLET_TO_BULLET] = Math.max(0.5, base[SPACING_RELATIONSHIPS.BULLET_TO_BULLET] * 0.5);
        adapted[SPACING_RELATIONSHIPS.PROJECT_TITLE_TO_TECH] = 1.0;
        adapted[SPACING_RELATIONSHIPS.PROJECT_TECH_TO_BULLETS] = 1.5;
        adapted[SPACING_RELATIONSHIPS.ROLE_TO_METADATA] = 1.0;
        adapted[SPACING_RELATIONSHIPS.METADATA_TO_BULLETS] = 1.5;
        adapted[SPACING_RELATIONSHIPS.HEADER_TO_SECTION] = 6.5;
        break;
      }
    }

    // INVARIANT: Enforce spacing hierarchy regardless of adaptation
    this._enforceSpacingHierarchy(adapted);

    const maxBulletsPerProject = overrides.maxBulletsPerProject !== undefined
      ? overrides.maxBulletsPerProject
      : (density === DENSITY_CLASSIFICATION.DENSE || density === DENSITY_CLASSIFICATION.OVERFULL ? 2 : 3);

    return {
      spacing: adapted,
      density,
      pageStrategy,
      scaleFactor,
      maxBulletsPerProject,
      texMacros: {
        atsHeaderToSection: `${this._round(adapted[SPACING_RELATIONSHIPS.HEADER_TO_SECTION])}pt`,
        atsSectionToSection: `${this._round(adapted[SPACING_RELATIONSHIPS.SECTION_TO_SECTION])}pt`,
        atsHeadingToContent: `${this._round(adapted[SPACING_RELATIONSHIPS.HEADING_TO_CONTENT])}pt`,
        atsEntryToEntry: `${this._round(adapted[SPACING_RELATIONSHIPS.ENTRY_TO_ENTRY])}pt`,
        atsProjectTitleToTech: `${this._round(adapted[SPACING_RELATIONSHIPS.PROJECT_TITLE_TO_TECH])}pt`,
        atsProjectTechToBullets: `${this._round(adapted[SPACING_RELATIONSHIPS.PROJECT_TECH_TO_BULLETS])}pt`,
        atsRoleToMetadata: `${this._round(adapted[SPACING_RELATIONSHIPS.ROLE_TO_METADATA])}pt`,
        atsMetadataToBullets: `${this._round(adapted[SPACING_RELATIONSHIPS.METADATA_TO_BULLETS])}pt`,
        atsBulletToBullet: `${this._round(adapted[SPACING_RELATIONSHIPS.BULLET_TO_BULLET])}pt`,
        // Backward-compatibility aliases:
        atsSectionGap: `${this._round(adapted[SPACING_RELATIONSHIPS.SECTION_TO_SECTION])}pt`,
        atsHeadingGap: `${this._round(adapted[SPACING_RELATIONSHIPS.HEADING_TO_CONTENT])}pt`,
        atsProjectGap: `${this._round(adapted[SPACING_RELATIONSHIPS.ENTRY_TO_ENTRY])}pt`,
        atsProjectHeadGap: `${this._round(adapted[SPACING_RELATIONSHIPS.PROJECT_TECH_TO_BULLETS])}pt`,
        atsBulletSep: `${this._round(adapted[SPACING_RELATIONSHIPS.BULLET_TO_BULLET])}pt`,
        headerBodyGap: `${this._round(adapted[SPACING_RELATIONSHIPS.HEADER_TO_SECTION])}pt`,
      },
    };
  }

  /**
   * Bounded Calibration: Calibrates layout profile based on actual compiled PDF measurement.
   *
   * @param {object} params
   * @param {object} params.model SemanticDocumentModel
   * @param {object} params.budget PageBudget
   * @param {object} params.currentLayout LayoutResult
   * @param {number} params.actualPageCount Physical page count measured from compiled PDF
   * @param {number} [params.targetPageCount=1] Expected page count target
   * @param {number} [params.iteration=1] Current calibration iteration (max 2-3)
   * @returns {object} Calibrated LayoutProfile
   */
  calibrateLayoutFromMeasurement({ model, budget, currentLayout, actualPageCount, targetPageCount = 1, iteration = 1 }) {
    if (actualPageCount <= targetPageCount || iteration >= 3) {
      return currentLayout.layoutProfile;
    }

    let nextDensity = DENSITY_CLASSIFICATION.DENSE;
    if (currentLayout.density === DENSITY_CLASSIFICATION.BALANCED) {
      nextDensity = DENSITY_CLASSIFICATION.DENSE;
    } else {
      nextDensity = DENSITY_CLASSIFICATION.OVERFULL;
    }

    return this.calculateAdaptiveSpacing(model, budget, currentLayout.pageStrategy, {
      density: nextDensity,
      maxBulletsPerProject: 2,
    });
  }

  /**
   * Full layout pipeline: build model → calculate budget → determine strategy
   * → classify density → compute adaptive spacing.
   *
   * @param {object} params
   * @param {object} params.applicationPackage
   * @param {object} [params.candidateProfile]
   * @param {object} [params.overrides] Optional layout overrides
   * @returns {object} Complete layout result
   */
  computeLayout({ applicationPackage, candidateProfile = null, overrides = {} }) {
    const model = this.buildSemanticModel({ applicationPackage, candidateProfile });
    const budget = this.calculatePageBudget(model);
    const pageStrategy = this.determinePageStrategy(model, budget);
    const density = overrides.density || this.classifyDensity(budget.utilizationRatio, pageStrategy);
    const layoutProfile = this.calculateAdaptiveSpacing(model, budget, pageStrategy, overrides);

    return {
      model,
      budget,
      pageStrategy,
      density,
      layoutProfile,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Enforces that spacing hierarchy is maintained:
   *   SECTION_TO_SECTION > ENTRY_TO_ENTRY > HEADING_TO_CONTENT > BULLET_TO_BULLET
   *
   * @private
   * @param {object} spacing Mutable spacing tokens
   */
  _enforceSpacingHierarchy(spacing) {
    const S = SPACING_RELATIONSHIPS;

    // Ensure section gap > entry gap
    if (spacing[S.ENTRY_TO_ENTRY] >= spacing[S.SECTION_TO_SECTION]) {
      spacing[S.ENTRY_TO_ENTRY] = spacing[S.SECTION_TO_SECTION] * 0.6;
    }

    // Ensure entry gap > heading gap
    if (spacing[S.HEADING_TO_CONTENT] >= spacing[S.ENTRY_TO_ENTRY]) {
      spacing[S.HEADING_TO_CONTENT] = spacing[S.ENTRY_TO_ENTRY] * 0.6;
    }

    // Ensure heading gap > bullet gap
    if (spacing[S.BULLET_TO_BULLET] >= spacing[S.HEADING_TO_CONTENT]) {
      spacing[S.BULLET_TO_BULLET] = Math.max(0.4, spacing[S.HEADING_TO_CONTENT] * 0.45);
    }

    // Synchronize legacy aliases
    spacing[S.SECTION_TO_CONTENT] = spacing[S.HEADING_TO_CONTENT];
    spacing[S.TITLE_TO_TECHNOLOGY] = spacing[S.PROJECT_TITLE_TO_TECH];
    spacing[S.TECHNOLOGY_TO_BULLETS] = spacing[S.PROJECT_TECH_TO_BULLETS];
    spacing[S.HEADER_TO_BODY] = spacing[S.HEADER_TO_SECTION];
  }

  /**
   * Counts profile links available for the header.
   * @private
   */
  _countProfileLinks(pkg, profile) {
    let count = 0;
    const links = Array.isArray(profile?.portfolioLinks) && profile.portfolioLinks.length > 0
      ? profile.portfolioLinks
      : (Array.isArray(pkg?.portfolioLinks) ? pkg.portfolioLinks : []);

    if (links.some(l => /linkedin/i.test(l.label || l.platform || l.url || ''))) count++;
    if (profile?.githubUsername || profile?.candidate?.githubUsername ||
        links.some(l => /github/i.test(l.label || l.platform || l.url || ''))) count++;
    if (links.some(l => /portfolio/i.test(l.label || l.platform || l.url || ''))) count++;
    if (links.some(l => /leetcode/i.test(l.label || l.platform || l.url || ''))) count++;
    return count;
  }

  /**
   * Extracts summary text from package/profile.
   * @private
   */
  _extractSummaryText(pkg, profile) {
    const mdMatch = pkg?.tailoredResume?.markdownContent?.match(
      /## Professional Summary\n+([\s\S]*?)(?=\n+##(?!#)\s+[^\n]+|$)/
    );
    if (mdMatch?.[1]?.trim()) return mdMatch[1].trim();
    return profile?.summary ||
      profile?.candidate?.summary ||
      profile?.candidate?.profileMetadata?.userCustom?.summary ||
      profile?.profileMetadata?.userCustom?.summary ||
      '';
  }

  /**
   * Resolves experience records from candidate profile.
   * @private
   */
  _resolveExperience(profile) {
    return profile?.experience ||
      profile?.profileMetadata?.experience ||
      profile?.candidate?.profileMetadata?.userCustom?.experience ||
      profile?.candidate?.profileMetadata?.experience ||
      [];
  }

  /**
   * Resolves education records from candidate profile.
   * @private
   */
  _resolveEducation(profile) {
    return profile?.education ||
      profile?.profileMetadata?.education ||
      profile?.candidate?.profileMetadata?.userCustom?.education ||
      profile?.candidate?.profileMetadata?.education ||
      [];
  }

  /**
   * Resolves certifications from profile and resume.
   * @private
   */
  _resolveCertifications(profile, resume) {
    const certs = profile?.certifications ||
      profile?.profileMetadata?.userCustom?.certifications ||
      profile?.candidate?.profileMetadata?.userCustom?.certifications ||
      [];
    if (Array.isArray(certs) && certs.length > 0) return certs;

    // Fallback: parse from markdown
    const mdMatch = resume?.markdownContent?.match(
      /## Certifications\n+([\s\S]*?)(?=\n+##(?!#)\s+[^\n]+|$)/
    );
    if (mdMatch) {
      return mdMatch[1].split('\n')
        .map(l => l.trim().replace(/^[-*]\s*/, ''))
        .filter(Boolean);
    }
    return [];
  }

  /**
   * Round to 1 decimal place.
   * @private
   */
  _round(val) {
    return Math.round(val * 10) / 10;
  }
}

/**
 * Evaluates candidate-owned content utilization and reference quality.
 * Implements Non-Negotiable Rule 8:
 * "Final PDF page count alone is insufficient for acceptance.
 * The system must demonstrate that available high-value candidate-owned
 * content was considered before accepting a sparse one-page result."
 *
 * @param {object} params
 * @param {object} params.structuredResume Structured resume document
 * @param {object} [params.budget] Page budget
 * @param {object} [params.layoutProfile] Layout profile
 * @returns {object} ReferenceQualityContentReport
 */
export function generateReferenceQualityContentReport({
  structuredResume,
  budget = null,
  layoutProfile = null,
}) {
  if (!structuredResume) {
    return {
      passed: false,
      score: 0,
      candidateFactsAvailable: 0,
      factsRendered: 0,
      utilizationRatio: 0,
      summarySentenceCount: 0,
      summaryChars: 0,
      skillsCategoryCount: 0,
      findings: ['No structured resume provided'],
    };
  }

  const findings = [];
  const projects = Array.isArray(structuredResume.projects) ? structuredResume.projects : [];
  let candidateFactsAvailable = 0;
  let factsRendered = 0;

  for (const p of projects) {
    const pBullets = Array.isArray(p.bullets) ? p.bullets : [];
    factsRendered += pBullets.length;
    const candidateItems = [
      ...pBullets,
      ...(Array.isArray(p.highlights) ? p.highlights : []),
      ...(Array.isArray(p.features) ? p.features : []),
      ...(Array.isArray(p.responsibilities) ? p.responsibilities : []),
      ...(p.description ? [p.description] : []),
    ];
    const distinctFacts = countDistinctCanonicalFacts(candidateItems);
    candidateFactsAvailable += Math.max(pBullets.length, distinctFacts);
  }

  const summaryText = structuredResume.summary?.text || '';
  const summaryChars = summaryText.length;
  const summarySentenceCount = (summaryText.match(/[^.!?]+[.!?]+/g) || []).length;

  const skillCategories = Array.isArray(structuredResume.skills?.categories)
    ? structuredResume.skills.categories
    : [];
  const skillsCategoryCount = skillCategories.length;

  const maxRealisticBullets = projects.length * 3;
  const targetFactCount = Math.min(candidateFactsAvailable, maxRealisticBullets);
  const factUtilizationRatio = targetFactCount > 0 ? factsRendered / targetFactCount : 1.0;

  if (targetFactCount > 0 && factsRendered < Math.min(targetFactCount, 2 * projects.length)) {
    findings.push(`Available candidate project facts were underutilized: rendered ${factsRendered} of ${targetFactCount} available`);
  }

  if (summarySentenceCount > 0 && summarySentenceCount < 2) {
    findings.push(`Summary sentence count (${summarySentenceCount}) is below standard 2-3 sentences`);
  }

  if (skillsCategoryCount < 3) {
    findings.push(`Skills categories (${skillsCategoryCount}) below standard 4-6 categories`);
  }

  let score = 100;
  if (factUtilizationRatio < 0.7) score -= 20;
  else if (factUtilizationRatio < 0.85) score -= 10;
  if (summarySentenceCount < 2 && summaryChars < 150) score -= 10;
  if (skillsCategoryCount < 3) score -= 10;

  return {
    passed: score >= 80 && findings.length === 0,
    score: Math.max(0, score),
    candidateFactsAvailable,
    factsRendered,
    utilizationRatio: Math.min(1.0, factUtilizationRatio),
    summarySentenceCount,
    summaryChars,
    skillsCategoryCount,
    findings,
  };
}

export const ResumeLayoutEngineService = ResumeLayoutEngine;
export const resumeLayoutEngine = new ResumeLayoutEngine();
export default resumeLayoutEngine;
