import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateResumeContent } from '../../src/services/resume-generation-content.service.js';
import {
  buildStructuredResumeSnapshot,
  assertSemanticEquivalence,
} from '../../src/services/structured-resume.service.js';
import { defaultAiResumeContentGenerator } from '../../src/services/ai-resume-content-generator.service.js';
import { fitOnePageResume } from '../../src/services/one-page-resume.service.js';
import { resumeQualityProfileByKey } from '../fixtures/prd002-resume-profiles.js';

// This verifies orchestration contracts, not actual PDF rendering or font quality.
const renderer = {
  generator: { generateTailoredResumeLatex: () => ({ texContent: 'contract fixture' }) },
  compiler: { compileLatexToPdf: async () => ({ pageCount: 1 }) },
};
const request = (key) => {
  const fixture = structuredClone(resumeQualityProfileByKey[key]);
  return {
    candidateProfile: fixture.profile,
    jobPosting: fixture.jobPosting,
    selectedProjects: fixture.profile.projects.slice(0, 2),
    selectedSkills: fixture.profile.skills,
    projectRankings: [],
    factInventory: [],
    aiProvider: false,
    ...renderer,
  };
};

for (const key of ['fresher', 'long-history']) {
  test(`${key}: shared composition preserves pre-extraction semantics and source`, async () => {
    const input = request(key);
    const before = structuredClone(input.candidateProfile);
    const aiContent = await defaultAiResumeContentGenerator.generateResumeAiContent({
      ...input,
      targetJobPosting: input.jobPosting,
    });
    const expected = buildStructuredResumeSnapshot({
      candidateProfile: input.candidateProfile,
      jobPosting: input.jobPosting,
      options: { projectRankings: input.projectRankings, aiContent },
    });
    const fitted = await fitOnePageResume(
      JSON.parse(JSON.stringify(expected.structuredResume)),
      input.jobPosting,
      renderer
    );
    const actual = await generateResumeContent(input);
    assertSemanticEquivalence(fitted, actual.safeStructuredResume);
    assert.deepEqual(fitted.presentation, actual.safeStructuredResume.presentation);
    assert.equal(actual.safeEvidenceReceipt.overallStatus, 'PASS');
    assert.deepEqual(input.candidateProfile, before);
  });
}

test('compiler failure propagates without returning a successful generated resume', async () => {
  const failure = new Error('Compiler unavailable');
  await assert.rejects(
    generateResumeContent({
      ...request('fresher'),
      compiler: {
        compileLatexToPdf: async () => {
          throw failure;
        },
      },
    }),
    (error) => error === failure
  );
});

test('unknown page count cannot become successful generation', async () => {
  await assert.rejects(
    generateResumeContent({
      ...request('fresher'),
      compiler: { compileLatexToPdf: async () => ({ success: true }) },
    }),
    (error) => error.code === 'ONE_PAGE_UNVERIFIABLE'
  );
});
