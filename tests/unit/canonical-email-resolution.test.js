/**
 * @file Unit & Integration Tests: Canonical Candidate Email Resolution & State Audit
 *
 * Verifies:
 * - Scenario A: Email stored in canonical profile field -> READY (VALID_EMAIL).
 * - Scenario B: Email stored in nested profile paths (resumeData, userCustom, identities) -> READY (VALID_EMAIL).
 * - Scenario C: No email anywhere -> MISSING (MISSING_EMAIL).
 * - Scenario D: Malformed email syntax -> INVALID (INVALID_EMAIL) marked as MISSING.
 * - Scenario E: Candidate 10a2b51b-09bf-4090-8040-1f60ebeb89c9 resolves to vishwanatnishad@gmail.com across all services.
 * - Scenario F: Authentic non-synthetic emails always supersede synthetic placeholders (no fake substitution).
 * - Scenario G: Candidate source-of-truth remains 100% unchanged in the database.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, pool, closeDatabase } from '../../src/db/index.js';
import { candidates, users } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  isValidEmailFormat,
  resolveCandidateEmail,
  evaluateCandidateEmailStatus,
  CandidateEmailState,
} from '../../src/utils/candidate-email-resolver.js';
import { ApplicationReadinessService } from '../../src/services/application-readiness.service.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { handleGetCandidateProfile } from '../../src/mcp/tools/career-read-tools.js';

describe('Canonical Candidate Email Resolution & State Audit', () => {
  const readinessService = new ApplicationReadinessService();

  after(async () => {
    await closeDatabase(pool);
  });

  // ---------------------------------------------------------------------------
  // Scenario A: Email stored in canonical profile field -> READY (VALID_EMAIL)
  // ---------------------------------------------------------------------------
  it('Scenario A: resolves canonical profile email to READY / VALID_EMAIL', () => {
    const candidate = {
      displayName: 'Alice Developer',
      canonicalEmail: 'alice.dev@company.org',
    };

    const resolved = resolveCandidateEmail(candidate);
    assert.equal(resolved, 'alice.dev@company.org');

    const status = evaluateCandidateEmailStatus(candidate);
    assert.equal(status.state, CandidateEmailState.VALID_EMAIL);
    assert.equal(status.status, 'READY');
    assert.equal(status.presence, 'PRESENT');
    assert.equal(status.email, 'alice.dev@company.org');

    const evalResult = readinessService.evaluateReadiness({ candidate });
    const emailItem = evalResult.items.find((i) => i.field === 'email');
    assert.equal(emailItem.status, 'READY');
    assert.equal(emailItem.value, 'alice.dev@company.org');
    assert.equal(emailItem.presence, 'PRESENT');
  });

  // ---------------------------------------------------------------------------
  // Scenario B: Email stored in nested profile paths -> READY (VALID_EMAIL)
  // ---------------------------------------------------------------------------
  it('Scenario B1: resolves email from resumeData.identity.email when canonical is missing', () => {
    const candidate = {
      displayName: 'Bob Engineer',
      profileMetadata: {
        resumeData: {
          identity: {
            email: 'bob.engineer@protonmail.com',
          },
        },
      },
    };

    const resolved = resolveCandidateEmail(candidate);
    assert.equal(resolved, 'bob.engineer@protonmail.com');

    const status = evaluateCandidateEmailStatus(candidate);
    assert.equal(status.state, CandidateEmailState.VALID_EMAIL);
    assert.equal(status.status, 'READY');
    assert.equal(status.email, 'bob.engineer@protonmail.com');
    assert.equal(status.source, 'RESUME_DATA');

    const evalResult = readinessService.evaluateReadiness({ candidate });
    const emailItem = evalResult.items.find((i) => i.field === 'email');
    assert.equal(emailItem.status, 'READY');
    assert.equal(emailItem.value, 'bob.engineer@protonmail.com');
  });

  it('Scenario B2: resolves email from userCustom.email when canonical is missing', () => {
    const candidate = {
      displayName: 'Charlie Coder',
      profileMetadata: {
        userCustom: {
          email: 'charlie.custom@domain.io',
        },
      },
    };

    const resolved = resolveCandidateEmail(candidate);
    assert.equal(resolved, 'charlie.custom@domain.io');

    const status = evaluateCandidateEmailStatus(candidate);
    assert.equal(status.state, CandidateEmailState.VALID_EMAIL);
    assert.equal(status.status, 'READY');
    assert.equal(status.email, 'charlie.custom@domain.io');
    assert.equal(status.source, 'USER_CUSTOM');
  });

  it('Scenario B3: resolves email from identities externalEmail', () => {
    const candidate = {
      displayName: 'Diana Hacker',
      identities: [
        { provider: 'GITHUB', externalEmail: 'diana.github@gmail.com' },
      ],
    };

    const resolved = resolveCandidateEmail(candidate);
    assert.equal(resolved, 'diana.github@gmail.com');

    const status = evaluateCandidateEmailStatus(candidate);
    assert.equal(status.state, CandidateEmailState.VALID_EMAIL);
    assert.equal(status.status, 'READY');
    assert.equal(status.email, 'diana.github@gmail.com');
  });

  // ---------------------------------------------------------------------------
  // Scenario C: No email anywhere -> MISSING (MISSING_EMAIL)
  // ---------------------------------------------------------------------------
  it('Scenario C: reports MISSING / MISSING_EMAIL when no email is provided', () => {
    const emptyCandidate = {
      displayName: 'No Email Candidate',
      profileMetadata: { userCustom: {} },
    };

    const resolvedNull = resolveCandidateEmail(emptyCandidate, null, { allowNullable: true });
    assert.equal(resolvedNull, null);

    assert.throws(
      () => {
        resolveCandidateEmail(emptyCandidate, null);
      },
      (err) => err.name === 'ValidationError' && err.message.includes('required')
    );

    const status = evaluateCandidateEmailStatus(emptyCandidate);
    assert.equal(status.state, CandidateEmailState.MISSING_EMAIL);
    assert.equal(status.status, 'MISSING');
    assert.equal(status.presence, 'MISSING');
    assert.equal(status.email, null);
    assert.equal(status.notes, 'Valid candidate email required in Profile');

    const evalResult = readinessService.evaluateReadiness({ candidate: emptyCandidate });
    const emailItem = evalResult.items.find((i) => i.field === 'email');
    assert.equal(emailItem.status, 'MISSING');
    assert.equal(emailItem.value, null);
    assert.equal(emailItem.presence, 'MISSING');
    assert.ok(evalResult.semantics.missingProfileFields.includes('email'));
  });

  // ---------------------------------------------------------------------------
  // Scenario D: Malformed email -> INVALID (INVALID_EMAIL)
  // ---------------------------------------------------------------------------
  it('Scenario D: detects malformed email syntax as INVALID_EMAIL and marks MISSING in readiness', () => {
    const malformedInputs = [
      'not-an-email',
      'user@',
      '@domain.com',
      'user @domain.com',
      'user@domain..com',
    ];

    for (const badEmail of malformedInputs) {
      assert.equal(isValidEmailFormat(badEmail), false, `Expected ${badEmail} to fail isValidEmailFormat`);

      const candidate = {
        displayName: 'Malformed Test',
        canonicalEmail: badEmail,
      };

      const status = evaluateCandidateEmailStatus(candidate);
      assert.equal(status.state, CandidateEmailState.INVALID_EMAIL, `Expected INVALID_EMAIL for ${badEmail}`);
      assert.equal(status.status, 'MISSING');
      assert.equal(status.presence, 'MISSING');
      assert.ok(status.notes.includes('malformed email format'));

      const evalResult = readinessService.evaluateReadiness({ candidate });
      const emailItem = evalResult.items.find((i) => i.field === 'email');
      assert.equal(emailItem.status, 'MISSING');
      assert.equal(emailItem.value, null);
    }
  });

  // ---------------------------------------------------------------------------
  // Scenario E: Live candidate 10a2b51b-09bf-4090-8040-1f60ebeb89c9 agreement
  // ---------------------------------------------------------------------------
  it('Scenario E: candidate 10a2b51b-09bf-4090-8040-1f60ebeb89c9 resolves to authentic vishwanatnishad@gmail.com across all services', async () => {
    const candidateId = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
    const [candRow] = await db
      .select({
        candidate: candidates,
        user: users,
      })
      .from(candidates)
      .leftJoin(users, eq(candidates.userId, users.id))
      .where(eq(candidates.id, candidateId));

    assert.ok(candRow, 'Candidate row must exist in database');
    const expectedEmail = 'vishwanatnishad@gmail.com';

    // 1. Direct candidate-email-resolver
    const resolvedDirect = resolveCandidateEmail(candRow.candidate, candRow.user?.email);
    assert.equal(resolvedDirect, expectedEmail);

    // 2. CandidateProfileService getProfile & getCareerProfile
    const profileService = new CandidateProfileService(db);
    const context = {
      tenantId: candRow.candidate.tenantId,
      userId: candRow.candidate.userId,
      role: 'MEMBER',
    };
    const profileView = await profileService.getProfile(context, candidateId);
    assert.equal(profileView.candidate.canonicalEmail, expectedEmail);

    const careerProfile = await profileService.getCareerProfile(context, candidateId, { profileView });
    assert.equal(careerProfile.canonicalEmail, expectedEmail);

    // 2b. Live MCP Tool handleGetCandidateProfile
    const mcpProfile = await handleGetCandidateProfile(context, { candidateId }, { db, candidateProfileService: profileService });
    assert.equal(mcpProfile.candidate.canonicalEmail, expectedEmail);

    // 3. ApplicationReadinessService: evaluates directly from candidate record
    const readinessFromCand = readinessService.evaluateReadiness({
      candidate: candRow.candidate,
    });
    const emailFromCand = readinessFromCand.items.find((i) => i.field === 'email');
    assert.equal(emailFromCand.status, 'READY');
    assert.equal(emailFromCand.value, expectedEmail);
    assert.equal(emailFromCand.presence, 'PRESENT');

    // 4. ApplicationReadinessService: evaluates from careerProfile
    const readinessFromProfile = readinessService.evaluateReadiness({
      candidateProfile: careerProfile,
      candidate: candRow.candidate,
    });
    const emailFromProfile = readinessFromProfile.items.find((i) => i.field === 'email');
    assert.equal(emailFromProfile.status, 'READY');
    assert.equal(emailFromProfile.value, expectedEmail);
    assert.equal(emailFromProfile.presence, 'PRESENT');

    // 5. Application validation: package with this email must not flag candidateEmail as missing
    const workflowService = new JobApplicationWorkflowService({ database: db });
    const mockPackage = {
      candidateId,
      candidateName: 'Vishwanath Nishad',
      candidateEmail: expectedEmail,
      candidatePhone: '7905087928',
      targetJob: {
        id: 'job-1',
        canonicalJobId: 'greenhouse:vercel:998877',
        source: 'GREENHOUSE',
        company: 'Vercel',
        title: 'Senior Software Engineer',
        location: 'Remote',
        workplaceType: 'REMOTE',
        employmentType: 'FULL_TIME',
        description: 'Build fast cloud infrastructure using Node.js and TypeScript.',
        responsibilities: ['Architect serverless systems'],
        requirements: ['Node.js', 'TypeScript'],
        skills: ['Node.js', 'TypeScript'],
        applicationUrl: 'https://boards.greenhouse.io/vercel/jobs/998877',
        directPortalUrl: 'https://boards.greenhouse.io/vercel/jobs/998877',
        retrievedAt: new Date().toISOString(),
      },
      tailoredResume: {
        title: 'Tailored Resume',
        markdownContent: '# Resume\n\nContent',
        contentHash: 'hash123',
        fitScore: 85,
      },
      coverLetter: {
        title: 'Cover Letter',
        markdownContent: 'Dear Hiring Manager,\n\nI am excited to apply.',
        contentHash: 'cl_hash_123',
      },
      verifiedSkills: [],
      claimedSkills: [],
      portfolioLinks: [],
      packageHash: 'pkg_hash_test_123',
      preparedAt: new Date().toISOString(),
      answers: {},
    };

    const validation = await workflowService.validateJobApplication({
      tenantId: candRow.candidate.tenantId,
      candidateId,
      applicationPackage: mockPackage,
    });
    assert.ok(!validation.missingFields.includes('candidateEmail'), 'candidateEmail must not appear in missingFields');
  });

  // ---------------------------------------------------------------------------
  // Scenario F: Anti-leakage / authentic email supersedes synthetic placeholder
  // ---------------------------------------------------------------------------
  it('Scenario F: authentic non-synthetic email always supersedes synthetic seeds without false conflict', () => {
    const candidateWithSyntheticSeed = {
      displayName: 'Vishwanath Nishad',
      canonicalEmail: 'vishw@example.com', // synthetic seed
      profileMetadata: {
        resumeData: {
          identity: {
            email: 'vishwanatnishad@gmail.com', // authentic candidate email
          },
        },
      },
    };

    const resolved = resolveCandidateEmail(candidateWithSyntheticSeed);
    assert.equal(resolved, 'vishwanatnishad@gmail.com');
    assert.notEqual(resolved, 'vishw@example.com');

    const status = evaluateCandidateEmailStatus(candidateWithSyntheticSeed);
    assert.equal(status.state, CandidateEmailState.VALID_EMAIL);
    assert.equal(status.status, 'READY');
    assert.equal(status.hasConflict, false, 'Synthetic seed must not trigger false conflict with authentic email');
    assert.equal(status.email, 'vishwanatnishad@gmail.com');
  });

  // ---------------------------------------------------------------------------
  // Scenario G: Candidate source-of-truth remains 100% unchanged in the database
  // ---------------------------------------------------------------------------
  it('Scenario G: candidate database row remains completely unmodified and authentic', async () => {
    const candidateId = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
    const [cand] = await db.select().from(candidates).where(eq(candidates.id, candidateId));

    assert.ok(cand, 'Candidate record must exist');
    assert.equal(cand.id, candidateId);
    assert.equal(cand.displayName, 'Vishwanath Nishad');
    // The DB row's raw values are preserved; the system resolves authenticity dynamically without destructive writes
    assert.equal(cand.canonicalEmail, 'vishw@example.com');
    assert.equal(cand.profileMetadata?.resumeData?.identity?.email, 'vishwanatnishad@gmail.com');
  });
});
