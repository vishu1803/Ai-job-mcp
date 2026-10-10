import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStructuredResumeSnapshot,
  validateStructuredResumeIntegrity,
} from '../../src/services/structured-resume.service.js';
import { profile } from '../fixtures/prd003-resume-profile.js';

const summary = 'I build production-ready and scalable interfaces.';
const jobPosting = {
  title: 'Engineer',
  company: 'Fixture',
  description: 'Document accessible interfaces.',
};

for (const nested of [false, true]) {
  test(`snapshot validates candidate-authored summary without promoting trust (${nested ? 'legacy profile metadata' : 'canonical profile'})`, () => {
    const candidateProfile = structuredClone(profile);
    if (nested) {
      delete candidateProfile.summary;
      candidateProfile.profileMetadata = { userCustom: { summary } };
    } else candidateProfile.summary = summary;
    const original = structuredClone(candidateProfile);
    const result = buildStructuredResumeSnapshot({ candidateProfile, jobPosting });
    assert.equal(result.structuredResume.summary.text, summary);
    assert.equal(result.structuredResume.summary.provenanceStatus, 'CLAIMED');
    assert.equal(
      result.evidenceValidationReceipt.overallStatus,
      'PASS',
      JSON.stringify(result.evidenceValidationReceipt.violations)
    );
    assert.deepEqual(candidateProfile, original);
  });
}

test('unbacked generated wording still fails when absent from candidate sources', () => {
  const candidateProfile = structuredClone(profile);
  const result = buildStructuredResumeSnapshot({ candidateProfile, jobPosting });
  result.structuredResume.summary.text = summary;
  const receipt = validateStructuredResumeIntegrity(result.structuredResume, { candidateProfile });
  assert.equal(receipt.overallStatus, 'FAIL');
  assert.deepEqual(
    receipt.violations
      .filter((v) => v.violationType === 'UNBACKED_CLAIM')
      .map((v) => v.claimText)
      .sort(),
    ['production-ready', 'scalable']
  );
});

test('candidate claims cannot authorize invented numerical achievements', () => {
  const candidateProfile = { ...structuredClone(profile), summary };
  const result = buildStructuredResumeSnapshot({ candidateProfile, jobPosting });
  result.structuredResume.summary.text += ' Improved throughput by 90%.';
  const receipt = validateStructuredResumeIntegrity(result.structuredResume, { candidateProfile });
  assert.equal(receipt.overallStatus, 'FAIL');
  assert.ok(receipt.violations.some((v) => v.violationType === 'UNSUPPORTED_METRIC'));
});

test('snapshot still rejects model-supplied claims absent from candidate sources', () => {
  const candidateProfile = structuredClone(profile);
  delete candidateProfile.summary;
  const result = buildStructuredResumeSnapshot({
    candidateProfile,
    jobPosting,
    options: { aiContent: { summary: { text: summary } } },
  });
  assert.equal(result.evidenceValidationReceipt.overallStatus, 'FAIL');
  assert.deepEqual(
    result.evidenceValidationReceipt.violations
      .filter((v) => v.violationType === 'UNBACKED_CLAIM')
      .map((v) => v.claimText)
      .sort(),
    ['production-ready', 'scalable']
  );
});
