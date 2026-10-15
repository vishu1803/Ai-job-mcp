import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResumeContentOptimizer } from '../../src/services/resume-content-optimizer.service.js';
import { assertSemanticEquivalence } from '../../src/services/structured-resume.service.js';

const resume = () => ({
  summary: { text: 'Accepted candidate wording.' },
  projects: [{ projectId: 'project-1', name: 'API', bullets: [{ text: 'Built endpoints.' }] }],
});

test('layout passes retain exact accepted content despite unused source facts and changed master', async () => {
  const original = resume();
  const observed = [];
  let iterations = 0;
  const optimizer = new ResumeContentOptimizer({
    latexGenerator: {
      generateTailoredResumeLatex: ({ applicationPackage }) => {
        observed.push(structuredClone(applicationPackage.structuredResume));
        return { texContent: 'fixture' };
      },
    },
    latexCompiler: {
      compileLatexToPdf: async () => {
        iterations++;
        return { pdfBuffer: Buffer.from('fixture') };
      },
    },
    geometryAnalyzer: {
      _detectPageCount: () => (iterations === 1 ? 2 : 1),
      measurePdfBottom: () => ({ bottomWhitespacePt: 80, pageOccupancyRatio: 0.8 }),
      computeAcceptanceMetrics: () => ({ factUtilization: {} }),
    },
    qaValidator: { validatePdfResume: async () => ({ score: 100, passed: true }) },
  });
  const result = await optimizer.optimize({
    structuredResume: original,
    candidateProfile: {
      summary: 'Changed master summary.',
      projects: [
        {
          id: 'project-1',
          name: 'API',
          bullets: ['Built endpoints.', 'Added authentication.', 'Added tests.'],
        },
      ],
    },
    jobPosting: { title: 'Backend Engineer' },
  });
  assert.equal(result.success, true);
  assert.equal(iterations, 2);
  assert.deepEqual(result.structuredResume, original);
  assert.ok(observed.every((value) => JSON.stringify(value) === JSON.stringify(original)));
  assert.deepEqual(original, resume());
});

test('semantic assertion rejects adding, removing or reordering selected bullets', () => {
  const baseline = resume();
  for (const bullets of [
    [],
    [{ text: 'Built endpoints.' }, { text: 'Added tests.' }],
    [{ text: 'Changed wording.' }],
  ]) {
    const changed = resume();
    changed.projects[0].bullets = bullets;
    assert.throws(() => assertSemanticEquivalence(baseline, changed), /semantic violation/);
  }
});

test('compact overflow cannot prune accepted bullets', () => {
  const optimizer = new ResumeContentOptimizer();
  const original = resume();
  original.projects[0].bullets.push(...['Two', 'Three', 'Four'].map((text) => ({ text })));
  const expected = structuredClone(original);
  assert.equal(optimizer._applyDeterministicCompression(original, { profile: 'COMPACT' }), null);
  assert.deepEqual(original, expected);
});
