/**
 * @file Unit Tests: P16-001F-4 DSA Restoration + One-Page Layout Quality
 *
 * Background: the real-flow candidate snapshot carries candidate-owned DSA under the
 * top-level `problemSolving` alias. The structured snapshot builder maps that alias
 * into structuredResume.dsa, but deriveSectionOrdering() only read meta.dsa/profile.dsa,
 * so sectionOrder omitted DSA and the structured renderer silently dropped the built
 * DSA block — producing a PDF with no Problem Solving section and a large unused
 * lower-page area.
 *
 * Covered:
 * A. Candidate with DSA (real-flow problemSolving alias) → structuredResume.dsa populated.
 * B. DSA survives controlled LaTeX generation (structured renderer).
 * C. DSA appears in the final compiled PDF text.
 * D. Dynamic project selection remains unchanged (authoritative ranking order).
 * E. Candidate-owned Experience remains unchanged.
 * F. Candidate-owned Education remains unchanged.
 * G. No unsupported DSA claims: without candidate DSA, no DSA section is emitted.
 * H. Renderer safety net: dsa present in snapshot but missing from sectionOrder is
 *    still rendered (no silent drop).
 * I. deriveSectionOrdering still omits DSA when candidate has none.
 * J. TOO_SPARSE layout expansion is bounded and keeps spacing hierarchy.
 * K. Balanced/DENSE layouts keep prior spacing behavior (no regression).
 * L. Candidate source data is not mutated by ordering/builder/renderer steps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveSectionOrdering,
} from '../../src/services/resume-content-strategy.service.js';
import {
  buildStructuredResumeDocument,
} from '../../src/services/structured-resume.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { PdfGeometryAnalyzer } from '../../src/services/pdf-geometry-analyzer.service.js';
import { ResumeParserService } from '../../src/services/resume-parser.service.js';
import {
  BASE_SPACING_TOKENS,
  DENSITY_CLASSIFICATION,
  SPACING_RELATIONSHIPS,
} from '../../src/services/resume-layout-engine.service.js';

const PDE_ID = '95a13c93-a198-4473-bf64-5b8a50cbd3b9';
const CTM_ID = '389d1357-156a-4296-a1bb-603140897bc3';

/** Real-flow candidate shape: DSA lives under top-level `problemSolving` (snapshot alias). */
const candidateWithProblemSolvingAlias = {
  id: 'cand-dsa-001',
  displayName: 'Vishwanath Nishad',
  canonicalEmail: 'vishwanatnishad@gmail.com',
  email: 'vishwanatnishad@gmail.com',
  headline: 'Full-Stack & Backend Developer',
  skills: [
    { name: 'Node.js', slug: 'nodejs', provenanceStatus: 'VERIFIED' },
    { name: 'PostgreSQL', slug: 'postgresql', provenanceStatus: 'VERIFIED' },
    { name: 'React', slug: 'react', provenanceStatus: 'VERIFIED' },
    { name: 'Data Structures', slug: 'data-structures', provenanceStatus: 'CLAIMED' },
  ],
  projects: [
    {
      id: PDE_ID,
      name: 'Product Data Explorer',
      technologies: ['Node.js', 'PostgreSQL', 'React'],
      bullets: ['Built CSV ingestion pipeline with streaming validation.'],
      repositoryUrl: 'https://github.com/vishu1803/Product-Data-Explorer',
    },
    {
      id: CTM_ID,
      name: 'Collaborative Task Manager',
      technologies: ['Socket.io', 'React'],
      bullets: ['Implemented live task synchronization across clients.'],
      repositoryUrl: 'https://github.com/vishu1803/Collaborative-task-manager',
    },
  ],
  experience: [
    {
      id: 'exp-1',
      company: 'Freelance',
      title: 'Full-Stack Developer',
      startDate: '2024-01-01',
      endDate: null,
      isCurrent: true,
      bullets: ['Delivered client web applications end to end.'],
    },
  ],
  education: [
    {
      id: 'edu-1',
      institution: 'RGTU Bhopal',
      degree: 'B.Tech',
      fieldOfStudy: 'Computer Science',
      startDate: '2019-08-01',
      endDate: '2023-06-30',
    },
  ],
  // The exact alias shape the real flow emits (candidate-artifact-content snapshot):
  problemSolving: {
    hasSection: true,
    profileUrl: 'https://leetcode.com/vishu1803',
    bullets: [
      'Solved algorithmic challenges covering dynamic programming, graph traversal, trees, arrays, and binary search.',
      'Engaged in problem solving and algorithmic practice to build foundational analytical complexity and optimization skills.',
    ],
    provenanceStatus: 'CLAIMED',
  },
};

/** Same candidate but with NO DSA anywhere (control). */
const candidateWithoutDsa = (() => {
  const c = JSON.parse(JSON.stringify(candidateWithProblemSolvingAlias));
  delete c.problemSolving;
  return c;
})();

/** Authoritative ranking as produced by the analysis snapshot (PDE #1). */
const authoritativeRankings = [
  { projectId: PDE_ID, projectName: 'Product Data Explorer', relevanceScore: 53.31, relevanceRank: 1 },
  { projectId: CTM_ID, projectName: 'Collaborative Task Manager', relevanceScore: 44.11, relevanceRank: 2 },
];

const jobPosting = {
  id: 'd14f0683-a8ec-4230-8836-91157ecc87e9',
  canonicalJobId: 'd14f0683-a8ec-4230-8836-91157ecc87e9',
  title: 'Principal Software Engineer, Data',
  company: 'Cloudflare',
  description:
    'Design and build scalable data platforms, APIs, and analytics pipelines. ' +
    'Experience with Node.js, PostgreSQL, distributed systems, and real-time systems required.',
  applicationUrl: 'https://job-boards.greenhouse.io/cloudflare/jobs/8102350',
  source: 'GREENHOUSE',
  provider: 'GREENHOUSE',
};

const buildDoc = (candidate) =>
  buildStructuredResumeDocument({
    candidateProfile: candidate,
    jobPosting: { ...jobPosting, projectRankings: authoritativeRankings },
    options: { projectRankings: authoritativeRankings },
  });

const renderTex = (doc) => {
  const latexGen = new LatexDocumentGenerator();
  return latexGen.generateTailoredResumeLatex({
    applicationPackage: {
      candidateName: doc.candidateIdentity.displayName,
      candidateEmail: doc.candidateIdentity.email,
      structuredResume: doc,
      tailoringPlan: doc.tailoringPlan,
    },
    candidateProfile: null,
  });
};

describe('P16-001F-4: DSA Restoration + One-Page Layout Quality', () => {
  it('Test A: candidate DSA (problemSolving alias) populates structuredResume.dsa', () => {
    const doc = buildDoc(candidateWithProblemSolvingAlias);

    assert.ok(doc.dsa, 'structuredResume.dsa must be non-null when candidate DSA exists');
    assert.equal(doc.dsa.hasSection, true);
    assert.equal(
      doc.dsa.profileUrl,
      'https://leetcode.com/vishu1803',
      'LeetCode URL must be carried through unchanged'
    );
    assert.equal(doc.dsa.bullets.length, 2, 'candidate-owned bullets must be carried through');
    assert.deepEqual(
      doc.dsa.bullets,
      candidateWithProblemSolvingAlias.problemSolving.bullets,
      'DSA bullets must be byte-identical to candidate-owned content (no synthesis)'
    );
  });

  it('Test B: DSA survives controlled LaTeX generation (structured renderer)', () => {
    const doc = buildDoc(candidateWithProblemSolvingAlias);
    const { texContent } = renderTex(doc);

    assert.match(
      texContent,
      /\\atssection\{Problem Solving \\& Algorithmic Practice\}/,
      'DSA section heading must be rendered in LaTeX'
    );
    assert.match(texContent, /leetcode\.com\/vishu1803/, 'LeetCode link must render');
    assert.match(
      texContent,
      /dynamic programming, graph traversal/,
      'candidate-owned DSA bullet text must render verbatim'
    );

    // DSA must appear after PROJECTS and before EDUCATION (EXPERIENCED archetype ordering)
    const dsaIdx = texContent.indexOf('Problem Solving \\& Algorithmic Practice');
    const projIdx = texContent.indexOf('Technical Projects');
    const eduIdx = texContent.indexOf('\\atssection{Education}');
    assert.ok(dsaIdx > projIdx, 'DSA must follow PROJECTS');
    assert.ok(dsaIdx < eduIdx, 'DSA must precede EDUCATION');
  });

  it('Test C: DSA appears in the final compiled PDF text', async () => {
    const doc = buildDoc(candidateWithProblemSolvingAlias);
    const { texContent } = renderTex(doc);

    const compiler = new LatexCompilerService();
    const compileResult = await compiler.compileLatexToPdf({
      texContent,
      jobName: 'p16f4-dsa-restoration-verify',
    });
    assert.ok(compileResult.pdfBuffer && compileResult.pdfBuffer.length > 0, 'PDF must compile');

    // Inject the resume parser exactly as ApplicationHandoffService does in production
    const analyzer = new PdfGeometryAnalyzer({ resumeParser: new ResumeParserService() });
    const report = analyzer.analyze({
      pdfBuffer: compileResult.pdfBuffer,
      expectedSections: doc.sectionOrder.filter((s) => s !== 'HEADER'),
      expectedSectionOrder: doc.sectionOrder,
    });

    assert.equal(report.success, true, `geometry analysis must succeed: ${report.failureReason || ''}`);
    const sectionTypes = (report.sections || []).map((s) => s.type);
    assert.ok(
      sectionTypes.includes('DSA'),
      `DSA section must be detected in the compiled PDF (detected: ${sectionTypes.join(',')})`
    );
    assert.equal(report.dsaVerification?.status, 'PASS', 'DSA dual-check must PASS');
    assert.equal(report.pageCount ?? report.layoutDiagnostics?.pageCount, 1, 'must remain one page');
  });

  it('Test D: dynamic project selection remains unchanged (authoritative rank order)', () => {
    const doc = buildDoc(candidateWithProblemSolvingAlias);

    assert.equal(doc.tailoringPlan.selectedProjectIds[0], PDE_ID, 'PDE must remain rank 1');
    assert.match(
      doc.projects[0].name.toLowerCase(),
      /product[- ]?data[- ]?explorer/,
      'first structured project must remain Product-Data-Explorer'
    );
    assert.equal(doc.projects[0].rank, 1);
  });

  it('Test E: candidate-owned Experience is preserved verbatim', () => {
    const doc = buildDoc(candidateWithProblemSolvingAlias);

    assert.equal(doc.experience.length, 1);
    assert.equal(doc.experience[0].title, 'Full-Stack Developer');
    assert.equal(doc.experience[0].company, 'Freelance');
    assert.deepEqual(doc.experience[0].bullets, ['Delivered client web applications end to end.']);
  });

  it('Test F: candidate-owned Education is preserved verbatim', () => {
    const doc = buildDoc(candidateWithProblemSolvingAlias);

    assert.equal(doc.education.length, 1);
    assert.equal(doc.education[0].institution, 'RGTU Bhopal');
    assert.equal(doc.education[0].degree, 'B.Tech');
  });

  it('Test G: no unsupported DSA claims — absent candidate DSA produces no DSA section', () => {
    const { sectionOrder } = deriveSectionOrdering({
      candidateProfile: candidateWithoutDsa,
      jobPosting,
    });
    assert.ok(!sectionOrder.includes('DSA'), 'DSA must not be in sectionOrder without candidate DSA');

    const doc = buildDoc(candidateWithoutDsa);
    const { texContent } = renderTex(doc);

    assert.doesNotMatch(texContent, /\\atssection\{Problem Solving/i);
    assert.ok(!doc.dsa?.hasSection, 'structuredResume.dsa must be null/empty without candidate DSA');
  });

  it('Test H: renderer safety net renders snapshot DSA even when sectionOrder omits it', () => {
    const doc = buildDoc(candidateWithProblemSolvingAlias);
    // Simulate the historical defect: sectionOrder missing DSA while dsa is populated.
    const defective = JSON.parse(JSON.stringify(doc));
    defective.sectionOrder = defective.sectionOrder.filter((s) => s !== 'DSA');
    defective.tailoringPlan.sectionOrder = defective.tailoringPlan.sectionOrder.filter(
      (s) => s !== 'DSA'
    );

    const { texContent } = renderTex(defective);

    assert.match(
      texContent,
      /\\atssection\{Problem Solving \\& Algorithmic Practice\}/,
      'renderer safety net must not silently drop populated DSA'
    );
  });

  it('Test I: deriveSectionOrdering includes DSA via the problemSolving alias (root-cause fix)', () => {
    const { sectionOrder } = deriveSectionOrdering({
      candidateProfile: candidateWithProblemSolvingAlias,
      jobPosting,
    });
    assert.ok(sectionOrder.includes('DSA'), 'DSA must be included via the problemSolving alias');
    const projIdx = sectionOrder.indexOf('PROJECTS');
    const dsaIdx = sectionOrder.indexOf('DSA');
    const eduIdx = sectionOrder.indexOf('EDUCATION');
    assert.ok(projIdx < dsaIdx && dsaIdx < eduIdx, 'DSA must sit after PROJECTS and before EDUCATION');
  });

  it('Test J: TOO_SPARSE expansion is bounded and preserves the spacing hierarchy', () => {
    return import('../../src/services/resume-layout-engine.service.js').then(({ ResumeLayoutEngine }) => {
      const engine = new ResumeLayoutEngine();

      // Craft a sparse model: minimal content, generous remaining budget
      const sparseModel = {
        header: { type: 'HEADER', estimatedLines: 2, hasContent: true, linkCount: 2, hasHeadline: true },
        summary: { type: 'SUMMARY', estimatedLines: 2, hasContent: true, charCount: 150, wordCount: 25 },
        skills: { type: 'SKILLS', hasContent: true, totalLines: 2, categoryCount: 2 },
        projects: { type: 'PROJECTS', hasContent: true, count: 1, components: [{ bulletCount: 1, bulletLengths: [80], techCount: 3, techStringLength: 30 }] },
        optionalSections: { dsa: null, certifications: null },
        experience: { hasContent: false, count: 0, components: [] },
        education: { type: 'EDUCATION', hasContent: true, count: 1, components: [{ hasCoursework: false }] },
      };
      const budget = engine.calculatePageBudget(sparseModel);
      const layout = engine.calculateAdaptiveSpacing(
        sparseModel,
        budget,
        'ONE_PAGE_TARGET',
        { density: DENSITY_CLASSIFICATION.TOO_SPARSE }
      );
      const spacing = layout.spacing ?? layout;
      const S = SPACING_RELATIONSHIPS;
      const base = BASE_SPACING_TOKENS;

      // Bounded expansion checks
      assert.ok(
        spacing[S.SECTION_TO_SECTION] <= base[S.SECTION_TO_SECTION] + 6.5,
        'section gap expansion must stay bounded'
      );
      assert.ok(spacing[S.ENTRY_TO_ENTRY] < spacing[S.SECTION_TO_SECTION], 'entry gap < section gap');
      assert.ok(spacing[S.HEADING_TO_CONTENT] < spacing[S.ENTRY_TO_ENTRY], 'heading gap < entry gap');
      assert.ok(spacing[S.BULLET_TO_BULLET] < spacing[S.HEADING_TO_CONTENT], 'bullet gap < heading gap');
    });
  });

  it('Test K: BALANCED density keeps base spacing (no over-expansion regression)', () => {
    return import('../../src/services/resume-layout-engine.service.js').then(({ ResumeLayoutEngine }) => {
      const engine = new ResumeLayoutEngine();
      const model = {
        header: { type: 'HEADER', estimatedLines: 2, hasContent: true, linkCount: 2, hasHeadline: true },
        summary: { type: 'SUMMARY', estimatedLines: 3, hasContent: true, charCount: 260, wordCount: 45 },
        skills: { type: 'SKILLS', hasContent: true, totalLines: 4, categoryCount: 4 },
        projects: { type: 'PROJECTS', hasContent: true, count: 2, components: [
          { bulletCount: 3, bulletLengths: [110, 120, 100], techCount: 5, techStringLength: 60 },
          { bulletCount: 2, bulletLengths: [90, 95], techCount: 3, techStringLength: 35 },
        ] },
        optionalSections: { dsa: { hasContent: true, estimatedLines: 5 }, certifications: null },
        experience: { type: 'EXPERIENCE', hasContent: true, count: 1, components: [{ bulletCount: 2, bulletLengths: [120, 130] }] },
        education: { type: 'EDUCATION', hasContent: true, count: 1, components: [{ hasCoursework: true }] },
      };
      const budget = engine.calculatePageBudget(model);
      const layout = engine.calculateAdaptiveSpacing(model, budget, 'ONE_PAGE_TARGET', {
        density: DENSITY_CLASSIFICATION.BALANCED,
      });
      const spacing = layout.spacing ?? layout;

      for (const [key, value] of Object.entries(BASE_SPACING_TOKENS)) {
        assert.equal(
          spacing[key],
          value,
          `BALANCED must keep base spacing token ${key}`
        );
      }
    });
  });

  it('Test L: source candidate data is not mutated by the ordering/build/render pipeline', () => {
    const original = JSON.parse(JSON.stringify(candidateWithProblemSolvingAlias));
    const doc = buildDoc(candidateWithProblemSolvingAlias);
    renderTex(doc);

    assert.deepEqual(
      candidateWithProblemSolvingAlias,
      original,
      'candidate source object must remain byte-identical through the full pipeline'
    );
  });
});
