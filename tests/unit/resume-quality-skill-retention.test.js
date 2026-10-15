/** Candidate-authored synthetic facts only. No private acceptance data. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildStructuredResumeDocument,
  buildStructuredResumeSnapshot,
} from '../../src/services/structured-resume.service.js';
import {
  onePageResumeView,
  planOnePagePresentation,
} from '../../src/services/one-page-resume.service.js';

import {
  retainedMasterSkills as masterSkills,
  resumeSkillRetentionProfile as source,
  resumeSkillRetentionJob as job,
} from '../fixtures/resume-quality-skill-retention.js';
const view = (profile, target = job()) => {
  const full = buildStructuredResumeDocument({ candidateProfile: profile, jobPosting: target });
  return {
    full,
    selected: onePageResumeView({ ...full, presentation: planOnePagePresentation(full, target) }),
  };
};
const names = (doc) => doc.skills.categories.flatMap((c) => c.skills.map((s) => s.name));

for (const variant of ['backend', 'full-stack'])
  test(`${variant}: canonical master claims survive an incomplete indexed skill inventory`, () => {
    const profile = source(),
      before = structuredClone(profile);
    const { selected } = view(profile, job(variant));
    for (const name of masterSkills) assert.ok(names(selected).includes(name), name);
    assert.deepEqual(profile, before);
    for (const category of selected.skills.categories)
      for (const skill of category.skills) assert.equal(skill.provenanceStatus, 'CLAIMED');
  });

test('project mentions and requested keywords cannot confirm inferred or missing skills', () => {
  const { selected } = view(source());
  assert.ok(!names(selected).includes('Rust'));
  assert.ok(!names(selected).includes('Kubernetes'));
});

test('explicit profile skill overrides, including clears, prevent master backfill', () => {
  for (const skills of [[], [{ name: 'Flask', provenanceStatus: 'CLAIMED' }]]) {
    const profile = source();
    profile.profileMetadata.userCustom = { skills };
    assert.deepEqual(
      names(view(profile).selected),
      skills.map((s) => s.name)
    );
  }
});

test('an inferred object in the master is not converted into a candidate assertion', () => {
  const profile = source();
  profile.profileMetadata.resumeData.skills.push({ name: 'Rust', provenanceStatus: 'INFERRED' });
  assert.ok(!names(view(profile).selected).includes('Rust'));
});

test('a snapshot without canonical master identity does not create extra claims', () => {
  const profile = source();
  delete profile.profileMetadata.resumeData.sourceResumeId;
  assert.ok(!names(view(profile).selected).includes('TypeScript'));
});

test('normal integrity receipts accept retained master claims without verifying them', () => {
  const snapshot = buildStructuredResumeSnapshot({ candidateProfile: source(), jobPosting: job() });
  assert.equal(snapshot.evidenceValidationReceipt.overallStatus, 'PASS');
  assert.ok(
    snapshot.tailoringPlan.selectedSkills.some(
      (s) => s.name === 'TypeScript' && s.provenanceStatus === 'CLAIMED'
    )
  );
});

test('learning and gap states are not resurrected from a stale master', () => {
  for (const status of ['LEARNING', 'MISSING_EVIDENCE', 'UNKNOWN']) {
    const profile = source();
    profile.skills.find((s) => s.name === 'PostgreSQL').provenanceStatus = status;
    assert.ok(!names(view(profile).selected).includes('PostgreSQL'));
  }
});
