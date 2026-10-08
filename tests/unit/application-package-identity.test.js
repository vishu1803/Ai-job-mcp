import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationExecutionPayload,
  canonicalPackageJson,
  computeApplicationPackageHash,
} from '../../src/domain/job/application-package-identity.js';

describe('ISSUE-02 canonical application package identity', () => {
  const pkg = {
    candidateId: 'candidate',
    candidateName: 'Reviewed',
    targetJob: { id: 'job', company: 'Employer', applicationUrl: 'https://example.test/apply' },
    tailoredResume: { markdownContent: 'Resume A' },
    coverLetter: { markdownContent: 'Letter A' },
    answers: { b: 'second', a: 'first' },
  };

  it('orders nested object keys lexically, including numeric keys', () => {
    assert.equal(
      canonicalPackageJson({ z: { b: 2, a: 1 }, 2: 2, 10: 10 }),
      '{"10":10,"2":2,"z":{"a":1,"b":2}}'
    );
    const reordered = {
      answers: { a: 'first', b: 'second' },
      coverLetter: pkg.coverLetter,
      tailoredResume: pkg.tailoredResume,
      targetJob: { applicationUrl: pkg.targetJob.applicationUrl, company: 'Employer', id: 'job' },
      candidateName: 'Reviewed',
      candidateId: 'candidate',
    };
    assert.equal(computeApplicationPackageHash(pkg), computeApplicationPackageHash(reordered));
  });

  for (const [label, change] of Object.entries({
    candidate: (p) => {
      p.candidateName = 'B';
    },
    contact: (p) => {
      p.candidatePhone = '123';
    },
    profile: (p) => {
      p.candidate = { contact: { email: 'b@example.test' } };
    },
    job: (p) => {
      p.targetJob.id = 'other';
    },
    employer: (p) => {
      p.targetJob.company = 'Other';
    },
    destination: (p) => {
      p.targetJob.applicationUrl += '/other';
    },
    portal: (p) => {
      p.portalFields = { consent: true };
    },
    resume: (p) => {
      p.tailoredResume.markdownContent = 'B';
    },
    structuredResume: (p) => {
      p.structuredResume = { experience: ['B'] };
    },
    coverLetter: (p) => {
      p.coverLetter.markdownContent = 'B';
    },
    answers: (p) => {
      p.answers.a = 'B';
    },
    screening: (p) => {
      p.screeningResponses = { eligibility: true };
    },
    attachments: (p) => {
      p.attachments = [{ contentHash: 'b'.repeat(64) }];
    },
    artifacts: (p) => {
      p.artifacts = { resume: { url: 'https://example.test/b.pdf' } };
    },
    metadata: (p) => {
      p.metadata = { submissionMode: 'other' };
    },
    extension: (p) => {
      p.futureAdapterField = { b: ['B'] };
    },
  })) {
    it(`binds approval-sensitive ${label}`, () => {
      const changed = structuredClone(pkg);
      change(changed);
      assert.notEqual(computeApplicationPackageHash(pkg), computeApplicationPackageHash(changed));
    });
  }

  it('preserves array order and distinguishes null from missing', () => {
    assert.notEqual(
      computeApplicationPackageHash({ ...pkg, attachments: ['a', 'b'] }),
      computeApplicationPackageHash({ ...pkg, attachments: ['b', 'a'] })
    );
    assert.notEqual(
      computeApplicationPackageHash(pkg),
      computeApplicationPackageHash({ ...pkg, candidatePhone: null })
    );
  });
  it('strips only explicit bookkeeping and never passes unhashed bookkeeping to execution', () => {
    const augmented = {
      ...pkg,
      packageHash: 'untrusted',
      preparedAt: 'tomorrow',
      applicationId: 'untrusted',
      packageVersion: 99,
      packageStatus: 'SUBMITTED',
      lifecycleAction: 'REUSED',
    };
    assert.equal(computeApplicationPackageHash(pkg), computeApplicationPackageHash(augmented));
    assert.deepEqual(applicationExecutionPayload(augmented), pkg);
  });
  it('matches JSONB omission of undefined object fields', () => {
    assert.equal(
      computeApplicationPackageHash(pkg),
      computeApplicationPackageHash({ ...pkg, omitted: undefined })
    );
  });
  for (const [label, value] of [
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['BigInt', 1n],
    ['Date', new Date()],
    ['undefined array entry', [undefined]],
    ['sparse array', new Array(1)],
    ['function', () => {}],
  ]) {
    it(`rejects non-JSON ${label} rather than hashing lossy content`, () => {
      assert.throws(() => computeApplicationPackageHash({ ...pkg, invalid: value }), {
        code: 'INVALID_PACKAGE_CONTENT',
      });
    });
  }
});
