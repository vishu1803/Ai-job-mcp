import { fixtureProvider } from '../fixtures/resume-writing-provider.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiResumeContentGeneratorService } from '../../src/services/ai-resume-content-generator.service.js';
import { generateResumeContent } from '../../src/services/resume-generation-content.service.js';
import { resumeQualityProfileByKey } from '../fixtures/prd002-resume-profiles.js';
import { buildCanonicalFactInventory } from '../../src/services/candidate-fact-inventory.service.js';
import { onePageResumeView } from '../../src/services/one-page-resume.service.js';

const profile = () => structuredClone(resumeQualityProfileByKey.student.profile);
const job = (title = 'Backend Engineer') => ({
  title,
  description: title.includes('Full')
    ? 'React event registration forms and Node.js integration.'
    : 'Node.js lending endpoints and PostgreSQL migrations.',
  requirements: title.includes('Full') ? ['React', 'Node.js'] : ['Node.js', 'PostgreSQL'],
});
async function generate(target, provider = fixtureProvider()) {
  const candidate = profile();
  return new AiResumeContentGeneratorService({ aiProvider: provider }).generateResumeAiContent({
    candidateProfile: candidate,
    targetJobPosting: target,
    selectedProjects: candidate.projects,
    selectedSkills: candidate.skills,
  });
}

test('valid Vertex fixture prose is used and Backend/Full-Stack summaries differ on the same master', async () => {
  const backend = await generate(job());
  const fullstack = await generate(job('Full-Stack Engineer'));
  assert.equal(backend.summary.text, 'Developed book search and lending endpoints in Node.js.');
  assert.equal(fullstack.summary.text, 'Created event registration forms using React.');
  assert.equal(backend.writing.providerUsed, true);
  assert.equal(backend.writing.provider, 'gemini-vertex');
  assert.equal(backend.writing.summaryStatus, 'ACCEPTED');
  assert.equal(backend.summary.provenanceStatus, 'CLAIMED');
  assert.ok(backend.summary.composedFromFactIds.length);
  assert.ok(backend.projectBullets[profile().projects[0].id].length <= 2);
});

test('accepted provider summary and two supported bullets survive shared structured generation', async () => {
  const candidate = profile();
  candidate.summary = 'Original candidate summary retained in the master.';
  const original = structuredClone(candidate);
  const result = await generateResumeContent({
    candidateProfile: candidate,
    jobPosting: job(),
    selectedProjects: candidate.projects,
    selectedSkills: candidate.skills,
    projectRankings: candidate.projects.map((p, index) => ({
      projectId: p.id,
      projectName: p.name,
      status: 'SELECTED',
      relevanceScore: 100 - index,
      rank: index + 1,
    })),
    aiProvider: fixtureProvider(),
    generator: { generateTailoredResumeLatex: () => ({ texContent: 'contract fixture' }) },
    compiler: { compileLatexToPdf: async () => ({ pageCount: 1 }) },
  });
  assert.equal(
    result.safeStructuredResume.summary.text,
    'Developed book search and lending endpoints in Node.js.'
  );
  assert.equal(
    onePageResumeView(result.safeStructuredResume).summary.text,
    result.safeStructuredResume.summary.text
  );
  const project = result.safeStructuredResume.projects.find(
    (p) => p.projectId === candidate.projects[0].id || p.id === candidate.projects[0].id
  );
  assert.ok(
    project,
    JSON.stringify(
      result.safeStructuredResume.projects.map((p) => ({
        id: p.projectId,
        name: p.name,
        displayName: p.displayName,
      }))
    )
  );
  assert.equal(project.bullets.length, 2);
  assert.ok(project.bullets.some((b) => /Developed book search/.test(b.text)));
  assert.ok(project.bullets.every((b) => b.provenanceStatus === 'CLAIMED'));
  assert.equal(result.safeEvidenceReceipt.overallStatus, 'PASS');
  assert.deepEqual(candidate, original);
});

for (const [label, text] of [
  ['technology', 'Developed book search with Kubernetes and Node.js.'],
  ['metric', 'Developed book search endpoints for 50000 users in Node.js.'],
  ['qualification', 'Developed book search endpoints with a medical doctorate.'],
  ['seniority', 'Senior engineer with 12 years of Node.js lending experience.'],
  ['negation', 'Developed book search endpoints without Node.js.'],
]) {
  test(`unsupported ${label} is rejected and deterministic source content is retained`, async () => {
    const result = await generate(
      job(),
      fixtureProvider((data) =>
        data.summaryText ? { ...data, summaryText: text } : { bullets: [] }
      )
    );
    assert.equal(result.writing.providerUsed, false);
    assert.equal(result.writing.summaryStatus, 'REJECTED');
    assert.notEqual(result.summary.text, text);
    assert.equal(result.writing.method, 'SOURCE_GROUNDED_DETERMINISTIC');
  });
}
test('configured Developer adapter can supply valid prose without an implicit cross-provider retry', async () => {
  const result = await generate(
    job(),
    fixtureProvider((data) => data, 'gemini-developer')
  );
  assert.equal(result.writing.provider, 'gemini-developer');
  assert.equal(result.writing.providerUsed, true);
});
test('timeout and malformed responses retain factual fallback with honest status', async () => {
  for (const provider of [
    { generateStructured: () => new Promise(() => {}) },
    { generateStructured: async () => ({ data: { unexpected: true } }) },
  ]) {
    const result = await new AiResumeContentGeneratorService({
      aiProvider: provider,
      writingTimeoutMs: 10,
    }).generateResumeAiContent({ candidateProfile: profile(), targetJobPosting: job() });
    assert.equal(result.writing.providerUsed, false);
    assert.ok(['FAILED', 'REJECTED'].includes(result.writing.providerStatus));
  }
});
test('foreign and inferred facts are removed before provider transmission', async () => {
  let calls = 0;
  const candidate = profile();
  const inventory = buildCanonicalFactInventory(candidate, job()).facts.map((f) => ({
    ...f,
    candidateId: 'foreign-candidate',
  }));
  await new AiResumeContentGeneratorService({
    aiProvider: {
      generateStructured: async () => {
        calls++;
        throw Error();
      },
    },
  }).generateResumeAiContent({
    candidateProfile: candidate,
    targetJobPosting: job(),
    factInventory: inventory,
  });
  assert.equal(calls, 0);
});

test('experience highlights become source facts and accepted wording preserves employment identity', async () => {
  const candidate = structuredClone(resumeQualityProfileByKey.backend.profile);
  const original = structuredClone(candidate);
  const regular = fixtureProvider();
  const provider = {
    id: 'gemini-vertex',
    generateStructured: async (request) => {
      if (request.candidateFacts.projectName === 'Professional contribution') {
        const fact = request.candidateFacts.facts.find((f) =>
          /Implemented API validation/.test(f.text)
        );
        return {
          provider: 'gemini-vertex',
          data: {
            bullets: [
              {
                text: 'Developed API validation and documented error responses.',
                factIds: [fact.factId],
              },
            ],
          },
        };
      }
      return regular.generateStructured(request);
    },
  };
  const result = await generateResumeContent({
    candidateProfile: candidate,
    jobPosting: job(),
    selectedProjects: candidate.projects,
    selectedSkills: candidate.skills,
    aiProvider: provider,
    generator: { generateTailoredResumeLatex: () => ({ texContent: 'contract fixture' }) },
    compiler: { compileLatexToPdf: async () => ({ pageCount: 1 }) },
  });
  const experience = result.safeStructuredResume.experience[0];
  assert.equal(experience.bullets[0], 'Developed API validation and documented error responses.');
  for (const field of ['id', 'title', 'company', 'startDate', 'endDate', 'location'])
    assert.equal(experience[field], candidate.experience[0][field]);
  assert.equal(experience.legacyFields.aiTransformations[0].provenanceStatus, 'CLAIMED');
  assert.deepEqual(candidate, original);
});

test('an explicit experience clear excludes historical master responsibilities from AI facts', () => {
  const candidate = structuredClone(resumeQualityProfileByKey.backend.profile);
  candidate.profileMetadata = {
    userCustom: { experience: [] },
    resumeData: { experience: candidate.experience },
  };
  const inventory = buildCanonicalFactInventory(candidate, job());
  assert.equal(inventory.facts.filter((f) => f.ownerType === 'EXPERIENCE').length, 0);
});
