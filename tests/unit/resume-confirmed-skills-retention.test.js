import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CandidateArtifactContentService } from '../../src/services/candidate-artifact-content.service.js';
import { buildGenerationProfile } from '../../src/services/resume-generation.service.js';

const source = () => ({
  skills: [
    'Python',
    'FastAPI',
    'Flask',
    'Django',
    'NestJS',
    'PostgreSQL',
    'Redis',
    'TypeScript',
  ].map((name) => ({ name, provenanceStatus: 'CLAIMED', evidenceCount: 0 })),
});
test('confirmed backend skills do not require GitHub evidence or stop at two self-declared skills', () => {
  const candidate = source();
  candidate.skills.forEach((skill) => {
    skill.provenanceStatus = 'USER_PROVIDED';
  });
  const original = structuredClone(candidate);
  const selected = new CandidateArtifactContentService().selectAndCategorizeSkillsForJob(
    candidate,
    { title: 'Backend Engineer', description: 'Build and test backend APIs.' }
  );
  const names = selected.selectedSkills.map((skill) => skill.name);
  for (const name of ['Python', 'FastAPI', 'Flask', 'Django', 'NestJS', 'PostgreSQL', 'Redis'])
    assert.ok(names.includes(name), name);
  assert.ok(
    selected.selectedSkills.every(
      (skill) => !['VERIFIED', 'CORROBORATED'].includes(skill.provenanceStatus)
    )
  );
  assert.deepEqual(candidate, original);
});
test('inferred and project-associated technologies do not become affirmative skills', () => {
  const candidate = source();
  candidate.skills.push(
    { name: 'Go', provenanceStatus: 'INFERRED' },
    { name: 'Rust', provenanceStatus: 'MISSING_EVIDENCE' }
  );
  candidate.projects = [
    { name: 'Repository', technologies: ['Kubernetes', 'Go'], provenanceStatus: 'INFERRED' },
  ];
  const selected = new CandidateArtifactContentService().selectAndCategorizeSkillsForJob(
    candidate,
    {
      title: 'Backend Engineer',
      description: 'Go, Rust and Kubernetes required.',
      skills: ['Go', 'Rust', 'Kubernetes'],
    }
  );
  const names = selected.selectedSkills.map((skill) => skill.name);
  for (const name of ['Go', 'Rust', 'Kubernetes']) assert.ok(!names.includes(name), name);
});
test('source projects without UUIDs receive scoped stable identities independent of array order', () => {
  const owner = { id: '00000000-0000-4000-8000-000000000001', profileMetadata: {} };
  const canonical = {
    projects: [
      { id: 'source-api', name: 'API', bullets: ['Built lending endpoints.'] },
      {
        name: 'Forms',
        repositoryUrl: 'https://github.com/example/forms',
        bullets: ['Created event registration forms.'],
      },
    ],
    skills: [],
  };
  const original = structuredClone(canonical);
  const view = { candidate: owner, skills: [], projects: [], resumeSections: [] };
  const first = buildGenerationProfile({ owner, canonical }, view);
  const second = buildGenerationProfile(
    { owner, canonical: { ...canonical, projects: [...canonical.projects].reverse() } },
    view
  );
  assert.deepEqual(
    first.projects.map((p) => [p.name, p.id]).sort(),
    second.projects.map((p) => [p.name, p.id]).sort()
  );
  assert.ok(first.projects.every((p) => /^[a-f0-9]{8}-[a-f0-9-]{27}$/.test(p.id)));
  assert.ok(first.projects.find((p) => p.name === 'API').metadata.sourceProjectId === 'source-api');
  assert.deepEqual(canonical, original);
});

test('repository verification labels never upgrade candidate-confirmed skills or invent skill evidence', () => {
  const candidate = {
    skills: [
      {
        name: 'PostgreSQL',
        provenanceStatus: 'VERIFIED',
        resumeClaim: true,
        evidenceId: 'source-reference',
        evidenceCount: 4,
      },
      { name: 'Go', provenanceStatus: 'VERIFIED', evidenceCount: 8 },
      { name: 'Redis', provenanceStatus: 'CLAIMED', evidenceCount: 0 },
    ],
    projects: [{ name: 'API', technologies: ['Redis'], provenanceStatus: 'VERIFIED' }],
  };
  const original = structuredClone(candidate);
  const result = new CandidateArtifactContentService().selectAndCategorizeSkillsForJob(candidate, {
    title: 'Backend Engineer',
    description: 'PostgreSQL, Go and Redis backend APIs.',
  });
  assert.equal(
    result.selectedSkills.find((s) => s.name === 'PostgreSQL').provenanceStatus,
    'CLAIMED'
  );
  assert.ok(!result.selectedSkills.some((s) => s.name === 'Go'));
  const redis = result.selectedSkills.find((s) => s.name === 'Redis');
  assert.equal(redis.provenanceStatus, 'CLAIMED');
  assert.equal(redis.evidenceCount, 0);
  assert.equal(result.skillAudit.find((s) => s.skill === 'Go').status, 'OMITTED');
  assert.deepEqual(candidate, original);
});
