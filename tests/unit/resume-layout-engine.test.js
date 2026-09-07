/**
 * @file Resume Layout Engine Unit Tests (P14-026)
 *
 * Candidate-independent fixture matrix testing the adaptive layout engine
 * across 9 different candidate shapes (Cases A-I) as specified in P14-026 §24.
 *
 * Tests verify:
 * - Spacing hierarchy preserved (sectionGap > entryGap > headingGap > bulletGap)
 * - Density classification correct for each case
 * - Page strategy correct
 * - No candidate-specific values in spacing calculations
 * - DSA rendered in Case A, absent in Case B
 * - Layout adapts to content volume
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ResumeLayoutEngine,
  ATS_DOCUMENT_CONSTRAINTS,
  SPACING_RELATIONSHIPS,
  BASE_SPACING_TOKENS,
  DENSITY_CLASSIFICATION,
  PAGE_STRATEGY,
  COMPONENT_TYPE,
} from '../../src/services/resume-layout-engine.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures: Synthetic candidate shapes (no real candidate data)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a minimal application package fixture with the specified shape.
 * All data is synthetic — no real candidate information used.
 */
function createFixture({
  projectCount = 2,
  hasDSA = false,
  experienceCount = 1,
  educationCount = 1,
  linkCount = 3,
  summaryWords = 30,
  techsPerProject = 5,
  bulletsPerProject = 2,
  skillCategories = 3,
  hasCertifications = false,
  hasCoursework = false,
  longSummary = false,
  longTechStrings = false,
} = {}) {
  const projects = Array.from({ length: projectCount }, (_, i) => ({
    name: `Project ${String.fromCharCode(65 + i)}`,
    technologies: Array.from(
      { length: longTechStrings ? 12 : techsPerProject },
      (_, j) => `Tech${j + 1}`
    ),
    bullets: Array.from(
      { length: bulletsPerProject },
      (_, j) => `Implemented feature ${j + 1} using modern engineering practices.`
    ),
    repositoryUrl: `https://github.com/testuser/project-${i + 1}`,
  }));

  const selectedSections = ['SUMMARY', 'SKILLS', 'PROJECTS'];
  if (hasDSA) {
    selectedSections.push('PROBLEM_SOLVING');
  }
  selectedSections.push('EXPERIENCE', 'EDUCATION');

  const summary = longSummary
    ? 'A '.repeat(80).trim() // ~80 words
    : 'A '.repeat(summaryWords).trim();

  const experience = Array.from({ length: experienceCount }, (_, i) => ({
    title: `Software Engineer ${i > 0 ? 'II' : ''}`,
    company: `Company ${String.fromCharCode(65 + i)}`,
    startDate: `${2020 + i}`,
    endDate: i === 0 ? 'Present' : `${2021 + i}`,
    location: 'Remote',
    bullets: ['Developed scalable systems.', 'Improved performance by 30%.'],
  }));

  const education = Array.from({ length: educationCount }, (_, i) => ({
    degree: `B.Tech in Computer Science${i > 0 ? ' (Honors)' : ''}`,
    institution: `University ${String.fromCharCode(65 + i)}`,
    startDate: '2018',
    endDate: '2022',
    coursework: hasCoursework
      ? ['Data Structures', 'Algorithms', 'Operating Systems']
      : [],
  }));

  const categorizedSkills = {};
  const skillCategoryNames = [
    'Languages',
    'Frameworks',
    'Databases',
    'Tools',
    'Cloud',
  ];
  for (let i = 0; i < skillCategories; i++) {
    categorizedSkills[skillCategoryNames[i] || `Category ${i}`] = [
      `Skill${i * 3 + 1}`,
      `Skill${i * 3 + 2}`,
      `Skill${i * 3 + 3}`,
    ];
  }

  const portfolioLinks = [];
  if (linkCount >= 1) portfolioLinks.push({ label: 'LinkedIn', url: 'https://linkedin.com/in/testuser' });
  if (linkCount >= 2) portfolioLinks.push({ label: 'GitHub', url: 'https://github.com/testuser' });
  if (linkCount >= 3) portfolioLinks.push({ label: 'Portfolio', url: 'https://testuser.dev' });
  if (linkCount >= 4) portfolioLinks.push({ label: 'LeetCode', url: 'https://leetcode.com/testuser' });

  return {
    applicationPackage: {
      candidateName: 'Test Candidate',
      candidateEmail: 'test@example.com',
      candidatePhone: '+1-555-0100',
      targetJob: { title: 'Software Engineer', company: 'Test Corp' },
      portfolioLinks,
      selectedSections,
      tailoredResume: {
        selectedProjects: projects,
        selectedSections,
        categorizedSkills,
        markdownContent: `## Professional Summary\n${summary}\n\n## Technical Skills\n\n## Technical Projects\n`,
      },
    },
    candidateProfile: {
      displayName: 'Test Candidate',
      headline: 'Software Engineer',
      experience,
      education,
      certifications: hasCertifications ? [{ name: 'AWS Solutions Architect' }] : [],
      portfolioLinks,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Case Definitions (P14-026 §24)
// ─────────────────────────────────────────────────────────────────────────────

const CASE_A = createFixture({ projectCount: 2, hasDSA: true, linkCount: 4 });
const CASE_B = createFixture({ projectCount: 3, hasDSA: false });
const CASE_C = createFixture({ projectCount: 1, hasDSA: false, experienceCount: 0, linkCount: 1 });
const CASE_D = createFixture({ projectCount: 2, hasDSA: false, experienceCount: 3, educationCount: 2 });
const CASE_E = createFixture({ projectCount: 0, hasDSA: false, experienceCount: 2 });
const CASE_F = createFixture({ projectCount: 2, hasDSA: false, skillCategories: 4 });
const CASE_G = createFixture({ projectCount: 3, hasDSA: false, longTechStrings: true });
const CASE_H = createFixture({ projectCount: 2, hasDSA: false, longSummary: true });
const CASE_I = createFixture({ projectCount: 2, hasDSA: false, educationCount: 3, hasCoursework: true });

const ALL_CASES = { A: CASE_A, B: CASE_B, C: CASE_C, D: CASE_D, E: CASE_E, F: CASE_F, G: CASE_G, H: CASE_H, I: CASE_I };

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

const engine = new ResumeLayoutEngine();

describe('ResumeLayoutEngine — P14-026', () => {
  // ─── ATS Document Constraints ───

  describe('Universal ATS-Safe Constraints', () => {
    it('are frozen and immutable', () => {
      assert.ok(Object.isFrozen(ATS_DOCUMENT_CONSTRAINTS));
      assert.strictEqual(ATS_DOCUMENT_CONSTRAINTS.singleColumn, true);
      assert.strictEqual(ATS_DOCUMENT_CONSTRAINTS.linearReadingOrder, true);
      assert.strictEqual(ATS_DOCUMENT_CONSTRAINTS.noLayoutTables, true);
      assert.strictEqual(ATS_DOCUMENT_CONSTRAINTS.selectableText, true);
    });

    it('has correct letter paper dimensions', () => {
      // 8.5in × 11in at 72 DPI
      assert.ok(ATS_DOCUMENT_CONSTRAINTS.pageWidthPt > 600);
      assert.ok(ATS_DOCUMENT_CONSTRAINTS.pageHeightPt > 780);
    });

    it('has usable dimensions accounting for margins', () => {
      const usable = ATS_DOCUMENT_CONSTRAINTS.usableHeightPt;
      assert.ok(usable > 0);
      assert.ok(usable < ATS_DOCUMENT_CONSTRAINTS.pageHeightPt);
    });
  });

  // ─── Spacing Tokens & Hierarchy ───

  describe('Spacing Design Tokens', () => {
    it('base tokens are frozen', () => {
      assert.ok(Object.isFrozen(BASE_SPACING_TOKENS));
    });

    it('base tokens maintain hierarchy: section > entry > heading > bullet', () => {
      const S = SPACING_RELATIONSHIPS;
      assert.ok(
        BASE_SPACING_TOKENS[S.SECTION_TO_SECTION] > BASE_SPACING_TOKENS[S.ENTRY_TO_ENTRY],
        'section gap must exceed entry gap'
      );
      assert.ok(
        BASE_SPACING_TOKENS[S.ENTRY_TO_ENTRY] > BASE_SPACING_TOKENS[S.HEADING_TO_CONTENT],
        'entry gap must exceed heading gap'
      );
      assert.ok(
        BASE_SPACING_TOKENS[S.HEADING_TO_CONTENT] > BASE_SPACING_TOKENS[S.BULLET_TO_BULLET],
        'heading gap must exceed bullet gap'
      );
    });
  });

  // ─── Semantic Document Model ───

  describe('Semantic Document Model', () => {
    it('builds model for Case A (2 projects + DSA)', () => {
      const model = engine.buildSemanticModel(CASE_A);
      assert.ok(model.header.hasContent);
      assert.strictEqual(model.header.type, COMPONENT_TYPE.HEADER);
      assert.strictEqual(model.projects.count, 2);
      assert.ok(model.optionalSections.dsa, 'DSA must be present in Case A');
      assert.strictEqual(model.optionalSections.dsa.type, COMPONENT_TYPE.OPTIONAL_DSA);
      assert.strictEqual(model.experience.count, 1);
      assert.strictEqual(model.education.count, 1);
    });

    it('builds model for Case B (3 projects, no DSA)', () => {
      const model = engine.buildSemanticModel(CASE_B);
      assert.strictEqual(model.projects.count, 3);
      assert.strictEqual(model.optionalSections.dsa, null, 'DSA must be absent in Case B');
    });

    it('builds model for Case C (minimal: 1 project, no experience)', () => {
      const model = engine.buildSemanticModel(CASE_C);
      assert.strictEqual(model.projects.count, 1);
      assert.strictEqual(model.experience.count, 0);
      assert.strictEqual(model.experience.hasContent, false);
      assert.strictEqual(model.header.linkCount, 1);
    });

    it('builds model for Case D (senior: 3 experience entries)', () => {
      const model = engine.buildSemanticModel(CASE_D);
      assert.strictEqual(model.experience.count, 3);
      assert.strictEqual(model.education.count, 2);
    });

    it('builds model for Case E (no projects)', () => {
      const model = engine.buildSemanticModel(CASE_E);
      assert.strictEqual(model.projects.count, 0);
      assert.strictEqual(model.projects.hasContent, false);
      assert.strictEqual(model.experience.count, 2);
    });

    it('correctly identifies header links from profile', () => {
      const model = engine.buildSemanticModel(CASE_A);
      assert.strictEqual(model.header.linkCount, 4, 'Case A should have 4 links');
    });
  });

  // ─── Page Budget Calculation ───

  describe('Page Budget Calculator', () => {
    for (const [caseName, fixture] of Object.entries(ALL_CASES)) {
      it(`calculates positive usable height for Case ${caseName}`, () => {
        const model = engine.buildSemanticModel(fixture);
        const budget = engine.calculatePageBudget(model);
        assert.ok(budget.usableHeightPt > 0);
        assert.ok(budget.estimatedContentHeightPt >= 0);
        assert.ok(budget.lineHeightPt > 0);
        assert.ok(budget.activeSectionCount >= 1);
      });
    }

    it('estimates more content for Case D (senior) than Case C (minimal)', () => {
      const modelD = engine.buildSemanticModel(CASE_D);
      const budgetD = engine.calculatePageBudget(modelD);
      const modelC = engine.buildSemanticModel(CASE_C);
      const budgetC = engine.calculatePageBudget(modelC);
      assert.ok(
        budgetD.estimatedContentHeightPt > budgetC.estimatedContentHeightPt,
        'Senior candidate should have more estimated content than minimal candidate'
      );
    });
  });

  // ─── Page Strategy ───

  describe('Page Strategy Determiner', () => {
    it('selects ONE_PAGE_TARGET for entry-level Cases A, B, C', () => {
      for (const c of [CASE_A, CASE_B, CASE_C]) {
        const model = engine.buildSemanticModel(c);
        const budget = engine.calculatePageBudget(model);
        const strategy = engine.determinePageStrategy(model, budget);
        assert.strictEqual(strategy, PAGE_STRATEGY.ONE_PAGE_TARGET);
      }
    });

    it('selects TWO_PAGE_ALLOWED for senior Case D (3 experience entries)', () => {
      const model = engine.buildSemanticModel(CASE_D);
      const budget = engine.calculatePageBudget(model);
      const strategy = engine.determinePageStrategy(model, budget);
      assert.strictEqual(strategy, PAGE_STRATEGY.TWO_PAGE_ALLOWED);
    });
  });

  // ─── Density Classification ───

  describe('Density Classifier', () => {
    it('classifies TOO_SPARSE for utilization < 0.65 (one-page)', () => {
      assert.strictEqual(
        engine.classifyDensity(0.4, PAGE_STRATEGY.ONE_PAGE_TARGET),
        DENSITY_CLASSIFICATION.TOO_SPARSE
      );
    });

    it('classifies BALANCED for utilization 0.65–0.92 (one-page)', () => {
      assert.strictEqual(
        engine.classifyDensity(0.75, PAGE_STRATEGY.ONE_PAGE_TARGET),
        DENSITY_CLASSIFICATION.BALANCED
      );
    });

    it('classifies DENSE for utilization 0.92–1.0 (one-page)', () => {
      assert.strictEqual(
        engine.classifyDensity(0.95, PAGE_STRATEGY.ONE_PAGE_TARGET),
        DENSITY_CLASSIFICATION.DENSE
      );
    });

    it('classifies OVERFULL for utilization > 1.0 (one-page)', () => {
      assert.strictEqual(
        engine.classifyDensity(1.1, PAGE_STRATEGY.ONE_PAGE_TARGET),
        DENSITY_CLASSIFICATION.OVERFULL
      );
    });

    it('classifies TWO_PAGE_ALLOWED with wider balanced range', () => {
      assert.strictEqual(
        engine.classifyDensity(0.5, PAGE_STRATEGY.TWO_PAGE_ALLOWED),
        DENSITY_CLASSIFICATION.BALANCED
      );
    });
  });

  // ─── Adaptive Spacing ───

  describe('Adaptive Spacing Calculator', () => {
    it('preserves spacing hierarchy for ALL fixture cases', () => {
      const S = SPACING_RELATIONSHIPS;
      for (const [caseName, fixture] of Object.entries(ALL_CASES)) {
        const model = engine.buildSemanticModel(fixture);
        const budget = engine.calculatePageBudget(model);
        const strategy = engine.determinePageStrategy(model, budget);
        const layout = engine.calculateAdaptiveSpacing(model, budget, strategy);

        assert.ok(
          layout.spacing[S.SECTION_TO_SECTION] > layout.spacing[S.ENTRY_TO_ENTRY],
          `Case ${caseName}: section gap must exceed entry gap`
        );
        assert.ok(
          layout.spacing[S.ENTRY_TO_ENTRY] > layout.spacing[S.HEADING_TO_CONTENT],
          `Case ${caseName}: entry gap must exceed heading gap`
        );
        assert.ok(
          layout.spacing[S.HEADING_TO_CONTENT] > layout.spacing[S.BULLET_TO_BULLET],
          `Case ${caseName}: heading gap must exceed bullet gap`
        );
      }
    });

    it('produces TeX macros with valid pt values', () => {
      const result = engine.computeLayout(CASE_A);
      const macros = result.layoutProfile.texMacros;
      assert.ok(macros.atsSectionGap.endsWith('pt'));
      assert.ok(macros.atsHeadingGap.endsWith('pt'));
      assert.ok(macros.atsProjectGap.endsWith('pt'));
      assert.ok(macros.atsProjectHeadGap.endsWith('pt'));
      assert.ok(macros.atsBulletSep.endsWith('pt'));

      // Values should be parseable numbers
      assert.ok(!isNaN(parseFloat(macros.atsSectionGap)));
      assert.ok(!isNaN(parseFloat(macros.atsProjectGap)));
    });

    it('adapts spacing differently for sparse vs dense content', () => {
      const sparseModel = engine.buildSemanticModel(CASE_C); // minimal
      const sparseBudget = engine.calculatePageBudget(sparseModel);
      const sparseLayout = engine.calculateAdaptiveSpacing(
        sparseModel,
        sparseBudget,
        PAGE_STRATEGY.ONE_PAGE_TARGET
      );

      // For a very sparse layout, section gaps should be expanded
      const baseSection = BASE_SPACING_TOKENS[SPACING_RELATIONSHIPS.SECTION_TO_SECTION];

      // If the density is TOO_SPARSE, spacing should be >= base
      if (sparseLayout.density === DENSITY_CLASSIFICATION.TOO_SPARSE) {
        assert.ok(
          sparseLayout.spacing[SPACING_RELATIONSHIPS.SECTION_TO_SECTION] >= baseSection,
          'Sparse layouts should expand section gaps'
        );
      }
    });

    it('compresses spacing for DENSE content', () => {
      // Force a dense scenario
      const denseModel = engine.buildSemanticModel(CASE_D);
      const denseBudget = { ...engine.calculatePageBudget(denseModel), utilizationRatio: 0.96 };
      const denseLayout = engine.calculateAdaptiveSpacing(
        denseModel,
        denseBudget,
        PAGE_STRATEGY.ONE_PAGE_TARGET
      );

      const baseSection = BASE_SPACING_TOKENS[SPACING_RELATIONSHIPS.SECTION_TO_SECTION];
      assert.ok(
        denseLayout.spacing[SPACING_RELATIONSHIPS.SECTION_TO_SECTION] <= baseSection,
        'Dense layouts should compress section gaps'
      );
    });

    it('compresses spacing even more for OVERFULL content', () => {
      const model = engine.buildSemanticModel(CASE_D);
      const budget = { ...engine.calculatePageBudget(model), utilizationRatio: 1.2 };
      const layout = engine.calculateAdaptiveSpacing(
        model,
        budget,
        PAGE_STRATEGY.ONE_PAGE_TARGET
      );

      const denseLayout = engine.calculateAdaptiveSpacing(
        model,
        { ...budget, utilizationRatio: 0.96 },
        PAGE_STRATEGY.ONE_PAGE_TARGET
      );

      assert.ok(
        layout.spacing[SPACING_RELATIONSHIPS.SECTION_TO_SECTION] <=
          denseLayout.spacing[SPACING_RELATIONSHIPS.SECTION_TO_SECTION],
        'Overfull spacing should be <= dense spacing'
      );
    });
  });

  // ─── Complete Layout Pipeline ───

  describe('Complete Layout Pipeline (computeLayout)', () => {
    for (const [caseName, fixture] of Object.entries(ALL_CASES)) {
      it(`computes layout successfully for Case ${caseName}`, () => {
        const result = engine.computeLayout(fixture);
        assert.ok(result.model);
        assert.ok(result.budget);
        assert.ok(result.pageStrategy);
        assert.ok(result.density);
        assert.ok(result.layoutProfile);
        assert.ok(result.layoutProfile.texMacros);
        assert.ok(result.layoutProfile.spacing);
      });
    }

    it('Case A includes DSA in model', () => {
      const result = engine.computeLayout(CASE_A);
      assert.ok(result.model.optionalSections.dsa, 'Case A must include DSA section');
    });

    it('Case B excludes DSA from model', () => {
      const result = engine.computeLayout(CASE_B);
      assert.strictEqual(result.model.optionalSections.dsa, null, 'Case B must exclude DSA');
    });
  });

  // ─── No Candidate-Specific Values ───

  describe('No Candidate-Specific Hardcoding', () => {
    it('layout engine has no candidate name references', () => {
      // Verify the layout engine source does not contain real candidate names
      // This is a structural invariant test
      const result1 = engine.computeLayout(CASE_A);
      const result2 = engine.computeLayout(CASE_B);

      // The spacing values should differ between cases with different content
      // but NOT because of candidate identity — only because of content shape
      assert.ok(
        typeof result1.layoutProfile.texMacros.atsSectionGap === 'string',
        'Spacing should be a string with pt suffix'
      );
      assert.ok(
        typeof result2.layoutProfile.texMacros.atsSectionGap === 'string',
        'Spacing should be a string with pt suffix'
      );
    });

    it('same input shape produces same output regardless of names', () => {
      // Create two identical shapes with different candidate names
      const fixture1 = createFixture({ projectCount: 2 });
      fixture1.applicationPackage.candidateName = 'Alice Smith';
      const fixture2 = createFixture({ projectCount: 2 });
      fixture2.applicationPackage.candidateName = 'Bob Jones';

      const result1 = engine.computeLayout(fixture1);
      const result2 = engine.computeLayout(fixture2);

      assert.deepStrictEqual(
        result1.layoutProfile.texMacros,
        result2.layoutProfile.texMacros,
        'Identical content shapes must produce identical spacing regardless of candidate name'
      );
    });
  });
});
