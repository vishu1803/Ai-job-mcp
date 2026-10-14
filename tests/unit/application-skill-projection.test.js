import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectApplicationSkills } from '../../src/services/application-skill-projection.js';
import { ApplicationSkillItemSchema } from '../../src/domain/job/job-workflow.schemas.js';
import { CandidateArtifactContentService } from '../../src/services/candidate-artifact-content.service.js';
import { buildStructuredResumeDocument } from '../../src/services/structured-resume.service.js';
import { profile } from '../fixtures/prd003-resume-profile.js';
import { buildResumeAiContext } from '../../src/services/ai-context-sanitizer.service.js';

test('missing and unknown statuses are separate availability gaps without mutating source records', () => {
  const input = ['MISSING', 'MISSING_EVIDENCE', 'UNKNOWN', 'invalid', null].map(
    (provenanceStatus, i) => ({ skillName: `Gap ${i}`, provenanceStatus })
  );
  const saved = structuredClone(input);
  const projected = projectApplicationSkills(input);
  assert.deepEqual(projected.verifiedSkills, []);
  assert.deepEqual(projected.claimedSkills, []);
  assert.deepEqual(
    projected.skillGaps.map((gap) => gap.availability),
    ['MISSING_EVIDENCE', 'MISSING_EVIDENCE', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN']
  );
  assert.deepEqual(input, saved);
});
test('persisted rollup labels do not independently verify candidate proficiency', () => {
  const statuses = [
    'VERIFIED',
    'CORROBORATED',
    'INFERRED',
    'CLAIMED',
    'SELF_DECLARED',
    'LEARNING',
    'USER_PROVIDED',
  ];
  const projected = projectApplicationSkills(
    statuses.map((provenanceStatus) => ({ skillName: provenanceStatus, provenanceStatus }))
  );
  assert.deepEqual(projected.verifiedSkills, []);
  assert.deepEqual(projected.skillGaps, []);
  assert.deepEqual(
    projected.claimedSkills.map((s) => s.truthCategory),
    ['INFERRED', 'INFERRED', 'INFERRED', 'CLAIMED', 'CLAIMED', 'CLAIMED', 'USER_PROVIDED']
  );
  for (const skill of projected.claimedSkills) ApplicationSkillItemSchema.parse(skill);
  assert.match(projected.claimedSkills[0].notes, /Inferred signal/);
});
test('an explicit authoritative candidate claim remains distinct from a missing evidence entry', () => {
  const projected = projectApplicationSkills([
    { skillName: 'Declared', provenanceStatus: 'MISSING', metadata: { isUserClaim: true } },
  ]);
  assert.equal(projected.claimedSkills[0].truthCategory, 'CLAIMED');
  assert.deepEqual(projected.skillGaps, []);
});
test('a job requirement cannot turn a missing candidate inventory skill into rendered competence', () => {
  const service = new CandidateArtifactContentService({});
  const selected = service.selectAndCategorizeSkillsForJob(
    {
      skills: [
        { name: 'JavaScript', provenanceStatus: 'MISSING' },
        { name: 'Python', provenanceStatus: 'CLAIMED' },
      ],
      projects: [],
    },
    {
      title: 'JavaScript Python Developer',
      description: 'JavaScript and Python',
      skills: ['JavaScript', 'Python'],
      requirements: [],
    }
  );
  assert.ok(!selected.selectedSkills.some((s) => s.name === 'JavaScript'));
  assert.ok(selected.selectedSkills.some((s) => s.name === 'Python'));
});
test('master resume fallback also excludes availability gaps while retaining legitimate user skills', () => {
  const result = buildStructuredResumeDocument({
    candidateProfile: {
      ...profile,
      projects: [],
      skills: [
        { name: 'JavaScript', provenanceStatus: 'MISSING' },
        { name: 'Python', provenanceStatus: 'CLAIMED' },
      ],
    },
  });
  const names = result.skills.categories.flatMap((category) =>
    category.skills.map((skill) => skill.name)
  );
  assert.ok(!names.includes('JavaScript'));
  assert.ok(names.includes('Python'));
});
test('AI context fallback cannot authorize missing-only inventory as skills', () => {
  const { context, atsOptimizationTarget } = buildResumeAiContext({
    candidateProfile: { skills: [{ name: 'JavaScript', provenanceStatus: 'MISSING' }] },
    selectedSkills: [],
    selectedProjects: [],
    factInventory: [],
    targetJobPosting: {
      title: 'Developer',
      description: 'JavaScript',
      requirements: ['JavaScript'],
    },
  });
  assert.deepEqual(context.skills, []);
  assert.ok(!atsOptimizationTarget.authorizedTechnologies.includes('JavaScript'));
});
