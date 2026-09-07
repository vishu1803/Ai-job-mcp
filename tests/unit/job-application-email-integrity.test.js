/**
 * @file Regression test: Candidate email integrity & test/demo email leakage prevention in prepare_job_application.
 *
 * Verifies:
 * 1. isSyntheticEmail correctly identifies RFC 2606 and test/fixture domains.
 * 2. resolveCandidateEmail prioritizes authentic candidate emails (user account email, parsed resume email)
 *    and strictly prevents test/demo fixture emails (such as vishw@example.com or candidate@example.com)
 *    from shadowing genuine candidate emails.
 * 3. In pure synthetic test environments, resolveCandidateEmail falls back gracefully to available test fixture emails.
 * 4. When no email is available anywhere, resolveCandidateEmail throws a clean ValidationError instead of inventing a dummy email.
 * 5. JobApplicationWorkflowService.prepareJobApplication correctly propagates the authentic stored candidate email
 *    and prevents vishw@example.com leakage in candidateEmail and tailored resume markdown.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSyntheticEmail,
  resolveCandidateEmail,
  JobApplicationWorkflowService,
} from '../../src/services/job-application-workflow.service.js';
import { ValidationError } from '../../src/errors/index.js';
import { db, pool, closeDatabase } from '../../src/db/index.js';
import { users } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('Job Application Email Integrity & Demo Leakage Prevention', () => {
  after(async () => {
    await closeDatabase(pool);
  });
  describe('isSyntheticEmail helper', () => {
    it('identifies RFC 2606 reserved example domains as synthetic', () => {
      assert.strictEqual(isSyntheticEmail('vishw@example.com'), true);
      assert.strictEqual(isSyntheticEmail('user@example.org'), true);
      assert.strictEqual(isSyntheticEmail('test@example.net'), true);
      assert.strictEqual(isSyntheticEmail('student@example.edu'), true);
      assert.strictEqual(isSyntheticEmail('someone@sub.example'), true);
    });

    it('identifies test and mock fixture domains as synthetic', () => {
      assert.strictEqual(isSyntheticEmail('candidate@example.com'), true);
      assert.strictEqual(isSyntheticEmail('e2e@careerhub.test'), true);
      assert.strictEqual(isSyntheticEmail('user@test'), true);
      assert.strictEqual(isSyntheticEmail('fixture@domain.test'), true);
    });

    it('identifies invalid or empty email values as synthetic', () => {
      assert.strictEqual(isSyntheticEmail(''), true);
      assert.strictEqual(isSyntheticEmail(null), true);
      assert.strictEqual(isSyntheticEmail(undefined), true);
      assert.strictEqual(isSyntheticEmail('invalid-no-at-sign'), true);
    });

    it('recognizes authentic non-synthetic emails as legitimate', () => {
      assert.strictEqual(isSyntheticEmail('alex.developer@gmail.com'), false);
      assert.strictEqual(isSyntheticEmail('sarah@outlook.com'), false);
      assert.strictEqual(isSyntheticEmail('engineer@company.co.uk'), false);
      assert.strictEqual(isSyntheticEmail('lead@startup.io'), false);
    });
  });

  describe('resolveCandidateEmail precedence & anti-leakage logic', () => {
    it('prevents synthetic canonicalEmail (vishw@example.com) from shadowing authentic linked user email', () => {
      const cand = {
        canonicalEmail: 'vishw@example.com',
        profileMetadata: {
          resumeData: {
            identity: {
              email: 'candidate-from-resume@careerhub-user.com',
            },
          },
        },
      };
      const userEmail = 'genuine-user@account-domain.org';

      const resolved = resolveCandidateEmail(cand, userEmail);
      assert.strictEqual(resolved, 'genuine-user@account-domain.org');
    });

    it('prevents synthetic canonicalEmail from shadowing authentic parsed resume email when user email is absent', () => {
      const cand = {
        canonicalEmail: 'vishw@example.com',
        profileMetadata: {
          resumeData: {
            identity: {
              email: 'genuine-resume-contact@workmail.io',
            },
          },
        },
      };

      const resolved = resolveCandidateEmail(cand, null);
      assert.strictEqual(resolved, 'genuine-resume-contact@workmail.io');
    });

    it('preserves genuine non-synthetic canonicalEmail when explicitly set', () => {
      const cand = {
        canonicalEmail: 'candidate-direct@techcompany.com',
        profileMetadata: {
          resumeData: {
            identity: {
              email: 'old-email@othercompany.com',
            },
          },
        },
      };
      const userEmail = 'user-login@techcompany.com';

      const resolved = resolveCandidateEmail(cand, userEmail);
      assert.strictEqual(resolved, 'candidate-direct@techcompany.com');
    });

    it('gracefully falls back to available test fixture email in pure synthetic test environments', () => {
      const cand = {
        canonicalEmail: 'mock-candidate@example.test',
        profileMetadata: {},
      };
      const userEmail = 'mock-user@example.test';

      const resolved = resolveCandidateEmail(cand, userEmail);
      assert.strictEqual(resolved, 'mock-candidate@example.test');
    });

    it('throws ValidationError if no candidate email exists in any source', () => {
      const cand = {
        canonicalEmail: null,
        profileMetadata: {},
      };

      assert.throws(
        () => resolveCandidateEmail(cand, null),
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.strictEqual(err.code, 'MISSING_CANDIDATE_EMAIL');
          return true;
        }
      );
    });
  });

  describe('Live Candidate Regression (candidate 10a2b51b-09bf-4090-8040-1f60ebeb89c9)', () => {
    it('sources authentic candidate profile email and excludes vishw@example.com', async () => {
      const candidateId = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
      const tenantId = '24d53f53-780e-4431-b065-32180c354175';

      // Verify authentic user email exists in database
      const [u] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, '9dd8e4fb-456b-4104-9cb1-c839a544b721'))
        .limit(1);

      assert.ok(u?.email, 'User record must exist in db');
      assert.notStrictEqual(u.email, 'vishw@example.com');
      assert.strictEqual(isSyntheticEmail(u.email), false, 'User email must not be synthetic');

      const jobPosting = {
        id: '70ce5b11-0cca-4c6e-8b85-f7b6e8c8321f',
        title: 'Senior Backend Engineer',
        company: 'Platform Systems Inc',
        description: 'Building robust microservices using Node.js, TypeScript, and PostgreSQL.',
        applicationUrl: 'https://platform-systems.example-corp.com/apply',
        source: 'MANUAL',
        retrievedAt: new Date().toISOString(),
      };

      const workflowService = new JobApplicationWorkflowService({ database: db });
      const pkg = await workflowService.prepareJobApplication({
        tenantId,
        candidateId,
        jobPosting,
      });

      // 1. Candidate email must match authentic stored user email
      assert.strictEqual(pkg.candidateEmail, u.email);
      assert.notStrictEqual(pkg.candidateEmail, 'vishw@example.com');
      assert.notStrictEqual(pkg.candidateEmail, 'candidate@example.com');
      assert.strictEqual(pkg.candidateEmail.includes('example.com'), false);

      // 2. Tailored resume markdown must use the authentic email
      assert.ok(pkg.tailoredResume.markdownContent.includes(`**Email:** ${u.email}`));
      assert.strictEqual(pkg.tailoredResume.markdownContent.includes('vishw@example.com'), false);

      // 3. Application preview format
      const preview = workflowService.createApplicationPreview(pkg);
      assert.ok(preview.includes(`(${u.email})`));
      assert.strictEqual(preview.includes('vishw@example.com'), false);
    });
  });
});
