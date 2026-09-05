/**
 * @file Unit & Contract Tests: Job Application Workflow CORROBORATED Provenance & Package Email Integrity (P14-005AX)
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import { candidates, users } from '../../src/db/schema.js';
import {
  TruthCategoryEnum,
  ApplicationSkillItemSchema,
  ApplicationPackageSchema,
  ValidateJobApplicationInputSchema,
} from '../../src/domain/job/job-workflow.schemas.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { createCareerMcpServer } from '../../src/mcp/server.js';
import { isSyntheticEmail } from '../../src/utils/candidate-email-resolver.js';

describe('Job Application Workflow CORROBORATED Provenance & Package Email Integrity (P14-005AX)', () => {
  const sampleJob = {
    id: 'test-job-uuid-1',
    title: 'Senior Backend Engineer',
    company: 'Stripe',
    location: 'Remote - US',
    description: 'Looking for a Senior Backend Engineer with Node.js and PostgreSQL expertise.',
    source: 'GREENHOUSE',
    applicationUrl: 'https://boards.greenhouse.io/stripe/jobs/12345',
    requiredSkills: ['Node.js', 'PostgreSQL'],
    preferredSkills: ['Fastify'],
    retrievedAt: new Date().toISOString(),
  };

  const sampleCorroboratedSkill = {
    name: 'Node.js',
    truthCategory: 'CORROBORATED',
    evidenceId: 'e8e04b4c-9f0e-4340-9a25-e51c8901b0f1',
    repositoryName: 'Ai-career-agent',
    filePath: 'src/index.js',
    notes: 'Corroborated by authenticated repository code inspection and resume claim',
  };

  const sampleVerifiedSkill = {
    name: 'PostgreSQL',
    truthCategory: 'VERIFIED',
    evidenceId: 'c1b2c3d4-0000-4000-8000-000000000001',
    notes: 'Supported by authenticated repository code inspection',
  };

  const sampleClaimedSkill = {
    name: 'Python',
    truthCategory: 'CLAIMED',
    notes: 'Self-reported in candidate resume / profile',
  };

  function buildSamplePackage(overrides = {}) {
    const pkgWithoutHash = {
      candidateId: '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
      candidateName: 'Vishwanath Nishad',
      candidateEmail: 'authorized.user@example.org',
      targetJob: sampleJob,
      tailoredResume: {
        documentId: 'doc-resume-1',
        title: 'Vishwanath Nishad - Tailored Resume',
        markdownContent: '# Vishwanath Nishad\n\nExperienced Backend Engineer',
        contentHash: 'hash-resume-1',
        fitScore: 88,
      },
      coverLetter: {
        documentId: 'doc-cover-1',
        title: 'Vishwanath Nishad - Cover Letter',
        markdownContent: 'Dear Hiring Team,\n\nI am excited to apply.',
        contentHash: 'hash-cover-1',
      },
      verifiedSkills: [sampleVerifiedSkill, sampleCorroboratedSkill],
      claimedSkills: [sampleClaimedSkill],
      portfolioLinks: [
        {
          projectName: 'Ai-career-agent',
          repositoryUrl: 'https://github.com/vishu1803/Ai-career-agent',
          highlights: ['Evidence-backed career MCP'],
        },
      ],
      answers: {
        workAuthorization: 'Authorized',
      },
      preparedAt: new Date().toISOString(),
      ...overrides,
    };

    const packageHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(pkgWithoutHash))
      .digest('hex');

    return {
      ...pkgWithoutHash,
      packageHash,
    };
  }

  // ---------------------------------------------------------------------------
  // PART A: TruthCategoryEnum & Contract Validation
  // ---------------------------------------------------------------------------
  describe('PART A: validate_job_application Provenance Contract', () => {
    it('accepts CORROBORATED in TruthCategoryEnum', () => {
      assert.strictEqual(TruthCategoryEnum.parse('CORROBORATED'), 'CORROBORATED');
      assert.strictEqual(TruthCategoryEnum.parse('VERIFIED'), 'VERIFIED');
      assert.strictEqual(TruthCategoryEnum.parse('CLAIMED'), 'CLAIMED');
      assert.strictEqual(TruthCategoryEnum.parse('USER_PROVIDED'), 'USER_PROVIDED');
      assert.strictEqual(TruthCategoryEnum.parse('INFERRED'), 'INFERRED');
      assert.throws(() => TruthCategoryEnum.parse('INVALID_STATUS'));
    });

    it('accepts CORROBORATED in ApplicationSkillItemSchema', () => {
      const parsed = ApplicationSkillItemSchema.parse(sampleCorroboratedSkill);
      assert.strictEqual(parsed.truthCategory, 'CORROBORATED');
      assert.strictEqual(parsed.name, 'Node.js');
    });

    it('accepts package with CORROBORATED verifiedSkills in ApplicationPackageSchema', () => {
      const pkg = buildSamplePackage();
      const parsed = ApplicationPackageSchema.parse(pkg);
      assert.strictEqual(parsed.verifiedSkills[1].truthCategory, 'CORROBORATED');
      assert.strictEqual(parsed.verifiedSkills[1].name, 'Node.js');
    });

    it('accepts package with CORROBORATED verifiedSkills in ValidateJobApplicationInputSchema', () => {
      const pkg = buildSamplePackage();
      const input = {
        applicationPackage: pkg,
        destinationUrl: 'https://boards.greenhouse.io/stripe/jobs/12345',
      };
      const parsed = ValidateJobApplicationInputSchema.parse(input);
      assert.strictEqual(parsed.applicationPackage.verifiedSkills[1].truthCategory, 'CORROBORATED');
    });

    it('JobApplicationWorkflowService.validateJobApplication accepts package with CORROBORATED skills without error', async () => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [],
            }),
          }),
        }),
      };

      const workflowService = new JobApplicationWorkflowService({ db: mockDb });
      const pkg = buildSamplePackage();

      const result = await workflowService.validateJobApplication({
        tenantId: '24d53f53-780e-4431-b065-32180c354175',
        candidateId: '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
        applicationPackage: pkg,
      });

      assert.strictEqual(result.isReady, true);
      assert.strictEqual(result.status, 'READY_TO_APPLY');
      assert.strictEqual(result.portalType, 'GREENHOUSE');
      assert.strictEqual(result.submissionMethod, 'API_DIRECT');
    });

    it('JobApplicationWorkflowService.createApplicationPreview renders *(CORROBORATED)* badge truthfully', () => {
      const workflowService = new JobApplicationWorkflowService({ db: {} });
      const pkg = buildSamplePackage();

      const preview = workflowService.createApplicationPreview(pkg);
      assert.ok(
        preview.includes('- ✅ **Node.js** *(CORROBORATED)*'),
        'Preview must include CORROBORATED badge'
      );
      assert.ok(
        preview.includes('- ✅ **PostgreSQL** *(VERIFIED)*'),
        'Preview must include VERIFIED badge'
      );
      assert.ok(
        preview.includes('- 📋 **Python** *(CLAIMED)*'),
        'Preview must include CLAIMED badge'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // PART B: Package Email Integrity & Fresh Generation
  // ---------------------------------------------------------------------------
  describe('PART B: Package Email Integrity & Non-Stale Generation', () => {
    it('packageHash sensitively changes when candidateEmail changes from synthetic to authentic', () => {
      const pkgSynthetic = buildSamplePackage({ candidateEmail: 'vishw@example.com' });
      const pkgAuthentic = buildSamplePackage({ candidateEmail: 'authorized.user@example.org' });

      assert.notStrictEqual(
        pkgSynthetic.packageHash,
        pkgAuthentic.packageHash,
        'Hash must differ when email changes'
      );
    });

    it('real/local MCP prepare_job_application tool generates package matching authoritative email and never synthetic', async () => {
      const server = createCareerMcpServer({ deps: { database: db } });

      const context = {
        tenantId: '24d53f53-780e-4431-b065-32180c354175',
        userId: '9dd8e4fb-456b-4104-9cb1-c839a544b721',
        tokenScopes: ['career:read', 'career:write'],
        role: 'MEMBER',
      };

      const tool = server.registeredTools.get('prepare_job_application');
      assert.ok(tool, 'prepare_job_application tool must be registered');

      const pkg = await tool.handler(context, {
        candidateId: '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
        jobPosting: sampleJob,
      });

      // 1. Must have valid packageHash
      assert.ok(pkg.packageHash, 'Prepared package must have packageHash');
      assert.strictEqual(pkg.packageHash.length, 64);
      // Historical stale package hash from old ChatGPT session must not be returned
      assert.notStrictEqual(
        pkg.packageHash,
        '85641297f80a38bfcfb318e392d0288191d467acbf97daa8b8269c5c52109b7b',
        'Must not return stale historical package hash'
      );

      // 2. Candidate email must be non-synthetic and not vishw@example.com
      assert.notStrictEqual(
        pkg.candidateEmail,
        'vishw@example.com',
        'Prepared package must never contain synthetic vishw@example.com'
      );
      assert.strictEqual(
        isSyntheticEmail(pkg.candidateEmail),
        false,
        'Prepared package email must be authentic'
      );

      // 3. Candidate email must match the authentic email from users table
      const [userRow] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, '9dd8e4fb-456b-4104-9cb1-c839a544b721'))
        .limit(1);

      assert.strictEqual(
        pkg.candidateEmail,
        userRow.email,
        'Prepared package email must match authentic users.email'
      );
    });

    it('preserves database integrity with zero mutations to candidates or users records', async () => {
      const [cand] = await db
        .select()
        .from(candidates)
        .where(eq(candidates.id, '10a2b51b-09bf-4090-8040-1f60ebeb89c9'))
        .limit(1);

      assert.strictEqual(
        cand.canonicalEmail,
        'vishw@example.com',
        'Underlying database row must remain completely unmutated'
      );
      assert.strictEqual(
        cand.displayName,
        'Vishwanath Nishad',
        'Candidate displayName must remain intact'
      );
    });
  });

  after(async () => {
    await closeDatabase();
  });
});
