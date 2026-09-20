/**
 * @file Object-Level Authorization & IDOR Defense Integration Test Suite (Phase 2 / ARCH-056).
 *
 * Validates strict object-level authorization and IDOR prevention across:
 * 1. Source Resumes (read, download, approve, delete)
 * 2. Job Applications (read, update, status, delete, restore, archive)
 * 3. Application Packages & Regeneration
 * 4. Application Handoff Kits & Lifecycle
 * 5. Candidate Profiles, Preferences, and Skills/Evidence
 * 6. Web Routes (HTTP boundaries, session binding, non-leakage 404/403)
 * 7. Verification that authorization occurs BEFORE storage access, PDF compilation, AI/LLM calls, or mutations.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  sessions,
  candidates,
  skills,
  candidateSkills,
  resumes,
  resumeSections,
  candidateClaims,
  jobApplications,
  applicationStages,
  applicationPackages,
} from '../../src/db/schema.js';
import {
  createSession,
  getSessionCookieOptions,
  generateCsrfToken,
} from '../../src/security/session.service.js';
import { SourceResumeIngestionService } from '../../src/services/source-resume-ingestion.service.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { documentStorageService } from '../../src/services/document-storage.service.js';
import { NotFoundError, AuthorizationError } from '../../src/errors/index.js';

describe('Object-Level Authorization & IDOR Defense Integration Suite (Phase 2)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');

  // Topology Setup
  // Tenant A:
  // - User A1 (MEMBER) -> Candidate A1
  // - User A2 (MEMBER) -> Candidate A2
  // - User AdminA (OWNER)
  const tenantIdA = crypto.randomUUID();
  const userIdA1 = crypto.randomUUID();
  const candidateIdA1 = crypto.randomUUID();

  const userIdA2 = crypto.randomUUID();
  const candidateIdA2 = crypto.randomUUID();

  const userIdAdminA = crypto.randomUUID();

  // Tenant B (Attacker / Foreign Tenant):
  // - User B1 (MEMBER) -> Candidate B1
  const tenantIdB = crypto.randomUUID();
  const userIdB1 = crypto.randomUUID();
  const candidateIdB1 = crypto.randomUUID();

  let app;
  let rawSessionTokenA1;
  let rawSessionTokenA2;
  let sessionIdA1;
  let sessionIdA2;
  const cookieOpts = getSessionCookieOptions({
    NODE_ENV: 'test',
    SESSION_COOKIE_NAME: 'career_hub_session',
  });
  const cookieName = cookieOpts.name;

  // Services under test
  const resumeService = new SourceResumeIngestionService({ database: db });
  const appTrackingService = new ApplicationTrackingService({ database: db });
  const profileService = new CandidateProfileService(db);

  // Fixtures
  let resumeA1;
  let applicationA1;
  let skillA1;

  before(async () => {
    app = buildApp({ logger: false, db });
    await app.ready();

    // 1. Create Tenant A & Users
    await db.insert(tenants).values({
      id: tenantIdA,
      name: `Tenant A Auth Test ${testRunId}`,
      slug: `tenant-a-${testRunId}`,
      tier: 'PRO',
    });

    await db.insert(users).values([
      {
        id: userIdA1,
        tenantId: tenantIdA,
        email: `user-a1-${testRunId}@example.test`,
        displayName: `Alice A1 ${testRunId}`,
        role: 'MEMBER',
        status: 'ACTIVE',
      },
      {
        id: userIdA2,
        tenantId: tenantIdA,
        email: `user-a2-${testRunId}@example.test`,
        displayName: `Bob A2 ${testRunId}`,
        role: 'MEMBER',
        status: 'ACTIVE',
      },
      {
        id: userIdAdminA,
        tenantId: tenantIdA,
        email: `admin-a-${testRunId}@example.test`,
        displayName: `Admin Alpha ${testRunId}`,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    ]);

    await db.insert(candidates).values([
      {
        id: candidateIdA1,
        tenantId: tenantIdA,
        userId: userIdA1,
        displayName: `Candidate Alice ${testRunId}`,
        canonicalEmail: `user-a1-${testRunId}@example.test`,
        status: 'ACTIVE',
        profileMetadata: {
          careerPreferences: {
            targetRoles: ['Backend Engineer'],
            preferredLocations: ['San Francisco, CA'],
            remotePreference: 'HYBRID',
            salaryFloor: 120000,
            salaryCurrency: 'USD',
            compensationPeriod: 'YEARLY',
            noticePeriod: '30_DAYS',
          },
        },
      },
      {
        id: candidateIdA2,
        tenantId: tenantIdA,
        userId: userIdA2,
        displayName: `Candidate Bob ${testRunId}`,
        canonicalEmail: `user-a2-${testRunId}@example.test`,
        status: 'ACTIVE',
        profileMetadata: {
          careerPreferences: {
            targetRoles: ['Frontend Engineer'],
            preferredLocations: ['New York, NY'],
            remotePreference: 'REMOTE_ONLY',
            salaryFloor: 110000,
            salaryCurrency: 'USD',
            compensationPeriod: 'YEARLY',
            noticePeriod: 'IMMEDIATE',
          },
        },
      },
    ]);

    // 2. Create Tenant B & User B1 & Candidate B1
    await db.insert(tenants).values({
      id: tenantIdB,
      name: `Tenant B Foreign ${testRunId}`,
      slug: `tenant-b-${testRunId}`,
      tier: 'FREE',
    });

    await db.insert(users).values({
      id: userIdB1,
      tenantId: tenantIdB,
      email: `user-b1-${testRunId}@example.test`,
      displayName: `Eve Foreign ${testRunId}`,
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    await db.insert(candidates).values({
      id: candidateIdB1,
      tenantId: tenantIdB,
      userId: userIdB1,
      displayName: `Candidate Eve ${testRunId}`,
      canonicalEmail: `user-b1-${testRunId}@example.test`,
      status: 'ACTIVE',
    });

    // 3. Create Sessions for web tests
    const sessionA1 = await createSession(db, {
      userId: userIdA1,
      tenantId: tenantIdA,
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 TestBrowserA1',
    });
    rawSessionTokenA1 = sessionA1.rawToken;
    sessionIdA1 = sessionA1.sessionId;

    const sessionA2 = await createSession(db, {
      userId: userIdA2,
      tenantId: tenantIdA,
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 TestBrowserA2',
    });
    rawSessionTokenA2 = sessionA2.rawToken;
    sessionIdA2 = sessionA2.sessionId;

    // 4. Create Skills & Candidate A1 Skill Evidence
    const [sk] = await db
      .insert(skills)
      .values({
        slug: `rust-auth-${testRunId}`,
        name: 'Rust Auth',
        category: 'LANGUAGE',
      })
      .returning();
    skillA1 = sk;

    await db.insert(candidateSkills).values({
      tenantId: tenantIdA,
      candidateId: candidateIdA1,
      skillId: skillA1.id,
      category: 'LANGUAGE',
      provenanceStatus: 'VERIFIED',
      confidenceScore: 0.95,
      evidenceCount: 2,
    });

    // 5. Seed Candidate A1 Source Resume & Encrypted Document
    const dummyPdf = Buffer.from(
      '%PDF-1.4 Fake encrypted test PDF content for authorization tests'
    );
    const storageResult = await documentStorageService.storeEncryptedDocument({
      tenantId: tenantIdA,
      candidateId: candidateIdA1,
      buffer: dummyPdf,
      originalFileName: 'alice-resume.pdf',
    });

    [resumeA1] = await db
      .insert(resumes)
      .values({
        tenantId: tenantIdA,
        candidateId: candidateIdA1,
        version: 1,
        fileName: 'alice-resume.pdf',
        fileSizeBytes: dummyPdf.length,
        mimeType: 'application/pdf',
        contentHash: crypto.createHash('sha256').update(dummyPdf).digest('hex'),
        storageKey: storageResult.storageKey,
        lifecycleState: 'SOURCE',
        isBaseResume: false,
        metadata: { format: 'PDF', declaredMimeType: 'application/pdf' },
      })
      .returning();

    await db.insert(resumeSections).values({
      tenantId: tenantIdA,
      candidateId: candidateIdA1,
      resumeId: resumeA1.id,
      sectionType: 'WORK_EXPERIENCE',
      rawText: 'Staff Systems Engineer at Alpha Corp',
      structuredData: { title: 'Staff Systems Engineer' },
      orderIndex: 0,
    });

    await db.insert(candidateClaims).values({
      tenantId: tenantIdA,
      candidateId: candidateIdA1,
      claimType: 'SKILL',
      statement: 'Rust Systems Programming',
      provenance: 'CLAIMED',
      status: 'PENDING_REVIEW',
      resumeId: resumeA1.id,
    });

    // 6. Seed Candidate A1 Job Application & Package
    [applicationA1] = await db
      .insert(jobApplications)
      .values({
        tenantId: tenantIdA,
        candidateId: candidateIdA1,
        companyName: 'Acme Security Corp',
        jobTitle: 'Senior Security Architect',
        jobUrl: 'https://acme.example.test/jobs/sec-101',
        status: 'SAVED',
        source: 'COMPANY_CAREERS',
        notes: 'Target application for Alice',
        metadata: {
          handoffKit: {
            packageHash: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
            resume: {
              filename: 'alice-tailored-resume.pdf',
              storageKey: storageResult.storageKey,
              availabilityStatus: 'READY',
            },
            coverLetter: {
              filename: 'alice-tailored-cover-letter.pdf',
              storageKey: storageResult.storageKey,
              availabilityStatus: 'READY',
            },
          },
        },
      })
      .returning();

    await db
      .insert(applicationPackages)
      .values({
        tenantId: tenantIdA,
        applicationId: applicationA1.id,
        candidateId: candidateIdA1,
        version: 1,
        isCurrent: true,
        packageHash: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
        generationContractVersion: 'p16.0-contract-v1',
        packagePayload: {
          targetJob: {
            company: 'Acme Security Corp',
            title: 'Senior Security Architect',
          },
          tailoredResume: { markdownContent: '# Alice Resume' },
        },
      })
      .returning();
  });

  after(async () => {
    // Clean up test data
    try {
      await db.delete(applicationPackages).where(eq(applicationPackages.tenantId, tenantIdA));
      await db.delete(applicationStages).where(eq(applicationStages.tenantId, tenantIdA));
      await db.delete(jobApplications).where(eq(jobApplications.tenantId, tenantIdA));
      await db.delete(candidateClaims).where(eq(candidateClaims.tenantId, tenantIdA));
      await db.delete(resumeSections).where(eq(resumeSections.tenantId, tenantIdA));
      await db.delete(resumes).where(eq(resumes.tenantId, tenantIdA));
      await db.delete(candidateSkills).where(eq(candidateSkills.tenantId, tenantIdA));
      await db.delete(skills).where(eq(skills.id, skillA1.id));
      await db.delete(sessions).where(eq(sessions.tenantId, tenantIdA));
      await db.delete(candidates).where(eq(candidates.tenantId, tenantIdA));
      await db.delete(users).where(eq(users.tenantId, tenantIdA));
      await db.delete(tenants).where(eq(tenants.id, tenantIdA));

      await db.delete(candidates).where(eq(candidates.tenantId, tenantIdB));
      await db.delete(users).where(eq(users.tenantId, tenantIdB));
      await db.delete(tenants).where(eq(tenants.id, tenantIdB));
    } catch {
      // Best-effort cleanup
    }
    await app.close();
    await closeDatabase();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 1. SOURCE RESUME OBJECT-LEVEL AUTHORIZATION & PRE-OP EXECUTION CHECKS
  // ══════════════════════════════════════════════════════════════════════════
  describe('1. Source Resume Object-Level Authorization & IDOR Defense', () => {
    it('Cross-tenant attack: Foreign tenant B cannot read resume of candidate A1 (404 Not Found)', async () => {
      const foreignContext = { tenantId: tenantIdB, userId: userIdB1, role: 'MEMBER' };
      await assert.rejects(
        async () => {
          await resumeService.getResumeDetails({
            context: foreignContext,
            resumeId: resumeA1.id,
            candidateId: candidateIdA1,
          });
        },
        (err) => err instanceof NotFoundError
      );
    });

    it('Cross-candidate attack (same tenant): User A2 cannot read resume of candidate A1 (403 Forbidden)', async () => {
      const attackerContext = { tenantId: tenantIdA, userId: userIdA2, role: 'MEMBER' };
      await assert.rejects(
        async () => {
          await resumeService.getResumeDetails({
            context: attackerContext,
            resumeId: resumeA1.id,
            candidateId: candidateIdA1,
          });
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );
    });

    it('Cross-candidate attack (same tenant): User A2 cannot download candidate A1 resume; storage read is BLOCKED before invocation', async () => {
      let storageReadCalled = false;
      const originalGetDecrypted = documentStorageService.getDecryptedDocument;
      documentStorageService.getDecryptedDocument = async (...args) => {
        storageReadCalled = true;
        return originalGetDecrypted.apply(documentStorageService, args);
      };

      try {
        const attackerContext = { tenantId: tenantIdA, userId: userIdA2, role: 'MEMBER' };
        await assert.rejects(
          async () => {
            await resumeService.downloadSourceResume({
              context: attackerContext,
              resumeId: resumeA1.id,
              candidateId: candidateIdA1,
            });
          },
          (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
        );

        // Pre-operation invariant verification: storage read MUST NOT have been called!
        assert.equal(
          storageReadCalled,
          false,
          'Authorization MUST fail BEFORE storage decryption / download occurs'
        );
      } finally {
        documentStorageService.getDecryptedDocument = originalGetDecrypted;
      }
    });

    it('Cross-candidate attack (same tenant): User A2 cannot approve candidate A1 claims; database is NOT mutated', async () => {
      const attackerContext = { tenantId: tenantIdA, userId: userIdA2, role: 'MEMBER' };
      await assert.rejects(
        async () => {
          await resumeService.reviewAndApproveResume({
            context: attackerContext,
            resumeId: resumeA1.id,
            candidateId: candidateIdA1,
            approvedSkillClaims: ['Rust Systems Programming'],
            promoteToBase: true,
          });
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );

      // Verify no state mutation occurred in database
      const [freshResume] = await db.select().from(resumes).where(eq(resumes.id, resumeA1.id));
      assert.equal(
        freshResume.isBaseResume,
        false,
        'Resume must not be promoted to base by unauthorized user'
      );
    });

    it('Cross-candidate attack (same tenant): User A2 cannot delete candidate A1 resume; storage delete is BLOCKED before invocation', async () => {
      let storageDeleteCalled = false;
      const originalDeleteEncrypted = documentStorageService.deleteEncryptedDocument;
      documentStorageService.deleteEncryptedDocument = async (...args) => {
        storageDeleteCalled = true;
        return originalDeleteEncrypted.apply(documentStorageService, args);
      };

      try {
        const attackerContext = { tenantId: tenantIdA, userId: userIdA2, role: 'MEMBER' };
        await assert.rejects(
          async () => {
            await resumeService.deleteResumeVersion({
              context: attackerContext,
              resumeId: resumeA1.id,
              candidateId: candidateIdA1,
            });
          },
          (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
        );

        assert.equal(
          storageDeleteCalled,
          false,
          'Authorization MUST fail BEFORE storage delete occurs'
        );

        // Verify database record still exists
        const [stillExists] = await db.select().from(resumes).where(eq(resumes.id, resumeA1.id));
        assert.ok(stillExists, 'Resume record must not be deleted on unauthorized request');
      } finally {
        documentStorageService.deleteEncryptedDocument = originalDeleteEncrypted;
      }
    });

    it('Legitimate operation: Candidate A1 can read and download own resume', async () => {
      const ownerContext = { tenantId: tenantIdA, userId: userIdA1, role: 'MEMBER' };
      const details = await resumeService.getResumeDetails({
        context: ownerContext,
        resumeId: resumeA1.id,
        candidateId: candidateIdA1,
      });

      assert.ok(details);
      assert.equal(details.resume.id, resumeA1.id);
      assert.equal(details.sections.length, 1);
      assert.equal(details.claims.length, 1);

      const download = await resumeService.downloadSourceResume({
        context: ownerContext,
        resumeId: resumeA1.id,
        candidateId: candidateIdA1,
      });
      assert.ok(download.buffer);
      assert.equal(download.fileName, 'alice-resume.pdf');
    });

    it('Admin/Owner operation: Tenant OWNER can read candidate A1 resume', async () => {
      const adminContext = { tenantId: tenantIdA, userId: userIdAdminA, role: 'OWNER' };
      const details = await resumeService.getResumeDetails({
        context: adminContext,
        resumeId: resumeA1.id,
        candidateId: candidateIdA1,
      });

      assert.ok(details);
      assert.equal(details.resume.id, resumeA1.id);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. JOB APPLICATION OBJECT-LEVEL AUTHORIZATION & SAFE MUTATION CHECKS
  // ══════════════════════════════════════════════════════════════════════════
  describe('2. Job Application Object-Level Authorization & Safe Deletion Checks', () => {
    it('Cross-tenant attack: Foreign tenant B cannot get application details of candidate A1 (404 Not Found)', async () => {
      const foreignContext = { tenantId: tenantIdB, userId: userIdB1, role: 'MEMBER' };
      await assert.rejects(
        async () => {
          await appTrackingService.getApplicationDetails(foreignContext, applicationA1.id);
        },
        (err) => err instanceof NotFoundError
      );
    });

    it('Cross-candidate attack (same tenant): User A2 cannot read candidate A1 application (403 Forbidden)', async () => {
      const attackerContext = {
        tenantId: tenantIdA,
        userId: userIdA2,
        candidateId: candidateIdA2,
        role: 'MEMBER',
      };
      await assert.rejects(
        async () => {
          await appTrackingService.getApplicationDetails(attackerContext, applicationA1.id);
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );
    });

    it('Cross-candidate attack (same tenant): User A2 cannot update notes/metadata on candidate A1 application', async () => {
      const attackerContext = {
        tenantId: tenantIdA,
        userId: userIdA2,
        candidateId: candidateIdA2,
        role: 'MEMBER',
      };
      await assert.rejects(
        async () => {
          await appTrackingService.updateApplication(attackerContext, applicationA1.id, {
            notes: 'Tampered notes by Attacker Bob',
          });
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );

      const [freshApp] = await db
        .select()
        .from(jobApplications)
        .where(eq(jobApplications.id, applicationA1.id));
      assert.equal(freshApp.notes, 'Target application for Alice', 'Notes must remain unmutated');
    });

    it('Cross-candidate attack (same tenant): User A2 cannot change status of candidate A1 application', async () => {
      const attackerContext = {
        tenantId: tenantIdA,
        userId: userIdA2,
        candidateId: candidateIdA2,
        role: 'MEMBER',
      };
      await assert.rejects(
        async () => {
          await appTrackingService.updateApplicationStatus(
            attackerContext,
            applicationA1.id,
            'OFFER_RECEIVED'
          );
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );

      const [freshApp] = await db
        .select()
        .from(jobApplications)
        .where(eq(jobApplications.id, applicationA1.id));
      assert.equal(freshApp.status, 'SAVED', 'Status must remain unmutated');
    });

    it('Cross-candidate attack (same tenant): User A2 cannot safe-delete candidate A1 application', async () => {
      const attackerContext = {
        tenantId: tenantIdA,
        userId: userIdA2,
        candidateId: candidateIdA2,
        role: 'MEMBER',
      };
      await assert.rejects(
        async () => {
          await appTrackingService.safeDeleteApplication(attackerContext, applicationA1.id);
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );

      const [stillExists] = await db
        .select()
        .from(jobApplications)
        .where(eq(jobApplications.id, applicationA1.id));
      assert.ok(stillExists, 'Application record must not be deleted by unauthorized user');
    });

    it('Legitimate operation: Candidate A1 can read and update notes on own application', async () => {
      const ownerContext = {
        tenantId: tenantIdA,
        userId: userIdA1,
        candidateId: candidateIdA1,
        role: 'MEMBER',
      };
      const details = await appTrackingService.getApplicationDetails(
        ownerContext,
        applicationA1.id
      );
      assert.ok(details);
      assert.equal(details.application.id, applicationA1.id);

      const updated = await appTrackingService.updateApplication(ownerContext, applicationA1.id, {
        notes: 'Updated legitimate notes by Alice',
      });
      assert.equal(updated.notes, 'Updated legitimate notes by Alice');
    });

    it('Admin/Owner operation: Tenant OWNER can read and manage candidate A1 application', async () => {
      const adminContext = {
        tenantId: tenantIdA,
        userId: userIdAdminA,
        role: 'OWNER',
      };
      const details = await appTrackingService.getApplicationDetails(
        adminContext,
        applicationA1.id
      );
      assert.ok(details);
      assert.equal(details.application.id, applicationA1.id);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. APPLICATION WORKFLOW & PREPARATION (EXPENSIVE OP PRE-CHECKS)
  // ══════════════════════════════════════════════════════════════════════════
  describe('3. Application Workflow & Preparation Pre-Execution Security', () => {
    it('prepareJobApplication: Cross-candidate attack with candidate A1 ID by User A2 is rejected; AI and PDF generation are BLOCKED', async () => {
      let aiCalled = false;
      let pdfCompileCalled = false;

      const mockWorkflowService = new JobApplicationWorkflowService({
        database: db,
        applicationTrackingService: appTrackingService,
        candidateProfileService: profileService,
        candidateArtifactContentService: {
          rankProjectsForJob: () => [],
          generateApplicationDocuments: async () => {
            aiCalled = true;
            return {};
          },
        },
        applicationHandoffService: {
          buildApplicationHandoffKit: async () => {
            pdfCompileCalled = true;
            return null;
          },
        },
      });

      await assert.rejects(
        async () => {
          await mockWorkflowService.prepareJobApplication({
            tenantId: tenantIdA,
            userId: userIdA2,
            candidateId: candidateIdA1,
            role: 'MEMBER',
            jobPosting: {
              company: 'Target Corp',
              title: 'Principal Engineer',
              description: 'Must know distributed systems',
            },
          });
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );

      assert.equal(
        aiCalled,
        false,
        'AI / LLM tailoring call MUST NOT occur when authorization fails'
      );
      assert.equal(
        pdfCompileCalled,
        false,
        'PDF compilation MUST NOT occur when authorization fails'
      );
    });

    it('prepareJobApplication: Application ID belonging to Candidate A1 cannot be stolen by Candidate A2', async () => {
      const workflowService = new JobApplicationWorkflowService({
        database: db,
        applicationTrackingService: appTrackingService,
      });

      await assert.rejects(
        async () => {
          await workflowService.prepareJobApplication({
            tenantId: tenantIdA,
            userId: userIdA2,
            candidateId: candidateIdA2,
            applicationId: applicationA1.id, // Mismatch! App A1 belongs to Candidate A1
            role: 'MEMBER',
            jobPosting: {
              company: 'Target Corp',
              title: 'Principal Engineer',
            },
          });
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );
    });

    it('regenerateApplicationPackage: User A2 cannot regenerate candidate A1 application package; PDF compiler is BLOCKED', async () => {
      let pdfCompileCalled = false;
      const mockWorkflowService = new JobApplicationWorkflowService({
        database: db,
        applicationTrackingService: appTrackingService,
        applicationHandoffService: {
          buildApplicationHandoffKit: async () => {
            pdfCompileCalled = true;
            return null;
          },
        },
      });

      await assert.rejects(
        async () => {
          await mockWorkflowService.regenerateApplicationPackage({
            tenantId: tenantIdA,
            userId: userIdA2,
            candidateId: candidateIdA2,
            applicationId: applicationA1.id,
            role: 'MEMBER',
          });
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );

      assert.equal(
        pdfCompileCalled,
        false,
        'PDF compilation MUST NOT occur on unauthorized package regeneration'
      );
    });

    it('requestApplicationApproval: User A2 cannot request approval tickets for Candidate A1', async () => {
      const workflowService = new JobApplicationWorkflowService({ database: db });

      await assert.rejects(
        async () => {
          await workflowService.requestApplicationApproval({
            tenantId: tenantIdA,
            userId: userIdA2,
            candidateId: candidateIdA1, // User A2 trying to mint approval for Candidate A1
            role: 'MEMBER',
            destinationUrl: 'https://example.test/apply',
            packageHash: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
          });
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );
    });

    it('Legitimate operation: Candidate A1 can request approval ticket for own application', async () => {
      const workflowService = new JobApplicationWorkflowService({ database: db });

      const ticket = await workflowService.requestApplicationApproval({
        tenantId: tenantIdA,
        userId: userIdA1,
        candidateId: candidateIdA1,
        clientId: 'test-client',
        jobId: 'job-sec-101',
        role: 'MEMBER',
        destinationUrl: 'https://example.test/apply',
        packageHash: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
      });

      assert.ok(ticket);
      assert.equal(ticket.candidateId, candidateIdA1);
      assert.equal(ticket.userId, userIdA1);
      assert.equal(ticket.status, 'PENDING');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. HANDOFF KITS & PACKAGE VERSION LIFECYCLE CHECKS
  // ══════════════════════════════════════════════════════════════════════════
  describe('4. Application Handoff Kits & Package Version Security', () => {
    it('Cross-candidate attack: User A2 cannot list handoff kits for Candidate A1', async () => {
      const attackerContext = {
        tenantId: tenantIdA,
        userId: userIdA2,
        role: 'MEMBER',
      };
      await assert.rejects(
        async () => {
          await appTrackingService.listHandoffKits(attackerContext, candidateIdA1);
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );
    });

    it('Cross-candidate attack: User A2 cannot archive handoff kit on Candidate A1 application', async () => {
      const attackerContext = {
        tenantId: tenantIdA,
        userId: userIdA2,
        candidateId: candidateIdA2,
        role: 'MEMBER',
      };
      await assert.rejects(
        async () => {
          await appTrackingService.archiveHandoffKit(
            attackerContext,
            applicationA1.id,
            'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678'
          );
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );
    });

    it('Cross-candidate attack: User A2 cannot delete handoff kit on Candidate A1 application', async () => {
      const attackerContext = {
        tenantId: tenantIdA,
        userId: userIdA2,
        candidateId: candidateIdA2,
        role: 'MEMBER',
      };
      await assert.rejects(
        async () => {
          await appTrackingService.deleteHandoffKit(
            attackerContext,
            applicationA1.id,
            'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678'
          );
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );
    });

    it('Cross-candidate attack: User A2 cannot restore package version on Candidate A1 application', async () => {
      const attackerContext = {
        tenantId: tenantIdA,
        userId: userIdA2,
        candidateId: candidateIdA2,
        role: 'MEMBER',
      };
      await assert.rejects(
        async () => {
          await appTrackingService.restoreApplicationPackage(attackerContext, applicationA1.id, 1);
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. CANDIDATE PROFILE & SKILLS/EVIDENCE OBJECT-LEVEL AUTHORIZATION
  // ══════════════════════════════════════════════════════════════════════════
  describe('5. Candidate Profile & Skills/Evidence Object-Level Authorization', () => {
    it('Cross-candidate attack: User A2 cannot read Candidate A1 profile (403 Forbidden)', async () => {
      const attackerContext = { tenantId: tenantIdA, userId: userIdA2, role: 'MEMBER' };
      await assert.rejects(
        async () => {
          await profileService.getProfile(attackerContext, candidateIdA1);
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );
    });

    it('Cross-candidate attack: User A2 cannot read Candidate A1 career preferences (403 Forbidden)', async () => {
      const attackerContext = { tenantId: tenantIdA, userId: userIdA2, role: 'MEMBER' };
      await assert.rejects(
        async () => {
          await profileService.getCareerPreferences(attackerContext, candidateIdA1);
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );
    });

    it('Cross-candidate attack: User A2 cannot read Candidate A1 career profile view (403 Forbidden)', async () => {
      const attackerContext = { tenantId: tenantIdA, userId: userIdA2, role: 'MEMBER' };
      await assert.rejects(
        async () => {
          await profileService.getCareerProfile(attackerContext, candidateIdA1);
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );
    });

    it('Cross-candidate attack: User A2 cannot read Candidate A1 skills and verified evidence (403 Forbidden)', async () => {
      const attackerContext = { tenantId: tenantIdA, userId: userIdA2, role: 'MEMBER' };
      await assert.rejects(
        async () => {
          await profileService.listSkillsWithEvidence(attackerContext, candidateIdA1);
        },
        (err) => err instanceof AuthorizationError && err.code === 'FORBIDDEN'
      );
    });

    it('listCandidates isolation: Member User A2 only sees own candidate; Tenant OWNER sees all candidates in tenant', async () => {
      const memberContext = { tenantId: tenantIdA, userId: userIdA2, role: 'MEMBER' };
      const memberResult = await profileService.listCandidates(memberContext);
      assert.equal(memberResult.items.length, 1);
      assert.equal(memberResult.items[0].id, candidateIdA2);

      const ownerContext = { tenantId: tenantIdA, userId: userIdAdminA, role: 'OWNER' };
      const ownerResult = await profileService.listCandidates(ownerContext);
      assert.ok(ownerResult.items.length >= 2);
      const candidateIds = ownerResult.items.map((c) => c.id);
      assert.ok(candidateIds.includes(candidateIdA1));
      assert.ok(candidateIds.includes(candidateIdA2));
    });

    it('Legitimate operation: Candidate A1 can read own profile, preferences, and verified skills', async () => {
      const ownerContext = { tenantId: tenantIdA, userId: userIdA1, role: 'MEMBER' };
      const profile = await profileService.getProfile(ownerContext, candidateIdA1);
      assert.ok(profile);
      assert.equal(profile.candidate.id, candidateIdA1);

      const prefs = await profileService.getCareerPreferences(ownerContext, candidateIdA1);
      assert.ok(prefs);
      assert.deepEqual(prefs.targetRoles, ['Backend Engineer']);

      const skillsList = await profileService.listSkillsWithEvidence(ownerContext, candidateIdA1);
      assert.ok(skillsList);
      assert.ok(skillsList.length >= 1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 6. INVALID / MISSING CONTEXT VALIDATION
  // ══════════════════════════════════════════════════════════════════════════
  describe('6. Invalid & Missing Context Rejection', () => {
    it('rejects resume operations with missing context or tenantId', async () => {
      await assert.rejects(
        async () => {
          await resumeService.getResumeDetails({
            context: null,
            resumeId: resumeA1.id,
            candidateId: candidateIdA1,
          });
        },
        (err) => err instanceof AuthorizationError
      );
    });

    it('rejects application operations with non-existent application UUID (404 Not Found)', async () => {
      const randomAppId = crypto.randomUUID();
      const validContext = {
        tenantId: tenantIdA,
        userId: userIdA1,
        candidateId: candidateIdA1,
        role: 'MEMBER',
      };
      await assert.rejects(
        async () => {
          await appTrackingService.getApplicationDetails(validContext, randomAppId);
        },
        (err) => err instanceof NotFoundError
      );
    });

    it('rejects candidate operations with non-existent candidate UUID (404 Not Found)', async () => {
      const randomCandId = crypto.randomUUID();
      const validContext = { tenantId: tenantIdA, userId: userIdA1, role: 'MEMBER' };
      await assert.rejects(
        async () => {
          await profileService.getProfile(validContext, randomCandId);
        },
        (err) => err instanceof NotFoundError
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 7. WEB HTTP ROUTES IDOR DEFENSE & ACCIDENTAL LEAKAGE PREVENTION
  // ══════════════════════════════════════════════════════════════════════════
  describe('7. Web HTTP Routes IDOR Defense & Error Policy', () => {
    it('POST /applications/:id/status: User A2 session targeting Candidate A1 application returns 404 (zero existence leakage)', async () => {
      const csrfA2 = generateCsrfToken(sessionIdA2);
      const res = await app.inject({
        method: 'POST',
        url: `/applications/${applicationA1.id}/status`,
        cookies: { [cookieName]: rawSessionTokenA2 },
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'http://localhost:3000',
        },
        payload: `status=INTERVIEWING&_csrf=${csrfA2}`,
      });

      assert.equal(res.statusCode, 404, 'Must return 404 without leaking application existence');
    });

    it('POST /applications/:id/delete: User A2 session targeting Candidate A1 application returns 404 or 403', async () => {
      const csrfA2 = generateCsrfToken(sessionIdA2);
      const res = await app.inject({
        method: 'POST',
        url: `/applications/${applicationA1.id}/delete`,
        cookies: { [cookieName]: rawSessionTokenA2 },
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'http://localhost:3000',
        },
        payload: `_csrf=${csrfA2}`,
      });

      assert.ok([403, 404].includes(res.statusCode), 'Must fail closed with 403 or 404');

      // Verify application still exists in database
      const [appStillThere] = await db
        .select()
        .from(jobApplications)
        .where(eq(jobApplications.id, applicationA1.id));
      assert.ok(appStillThere, 'Application must remain untouched in database');
    });

    it('POST /applications/:id/regenerate: User A2 session targeting Candidate A1 application returns 404 or 403', async () => {
      const csrfA2 = generateCsrfToken(sessionIdA2);
      const res = await app.inject({
        method: 'POST',
        url: `/applications/${applicationA1.id}/regenerate`,
        cookies: { [cookieName]: rawSessionTokenA2 },
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'http://localhost:3000',
        },
        payload: `scope=BOTH&_csrf=${csrfA2}`,
      });

      assert.ok([403, 404].includes(res.statusCode), 'Must fail closed with 403 or 404');
    });

    it('POST /applications/:id/packages/:version/restore: User A2 targeting Candidate A1 package returns 404 or 403', async () => {
      const csrfA2 = generateCsrfToken(sessionIdA2);
      const res = await app.inject({
        method: 'POST',
        url: `/applications/${applicationA1.id}/packages/1/restore`,
        cookies: { [cookieName]: rawSessionTokenA2 },
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'http://localhost:3000',
        },
        payload: `_csrf=${csrfA2}`,
      });

      assert.ok([403, 404].includes(res.statusCode), 'Must fail closed with 403 or 404');
    });

    it('GET /api/applications/:id/artifacts/resume/download: User A2 session targeting Candidate A1 application returns 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/applications/${applicationA1.id}/artifacts/resume/download`,
        cookies: { [cookieName]: rawSessionTokenA2 },
      });

      assert.equal(
        res.statusCode,
        404,
        'Must return 404 unauthorized without leaking artifact existence'
      );
    });

    it('GET /api/applications/:id/artifacts/resume/view: User A2 session targeting Candidate A1 application returns 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/applications/${applicationA1.id}/artifacts/resume/view`,
        cookies: { [cookieName]: rawSessionTokenA2 },
      });

      assert.equal(
        res.statusCode,
        404,
        'Must return 404 unauthorized without leaking artifact existence'
      );
    });

    it('Legitimate operation: Candidate A1 session can update own application status successfully (302 redirect)', async () => {
      const csrfA1 = generateCsrfToken(sessionIdA1);
      const res = await app.inject({
        method: 'POST',
        url: `/applications/${applicationA1.id}/status`,
        cookies: { [cookieName]: rawSessionTokenA1 },
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'http://localhost:3000',
        },
        payload: `status=APPLIED&_csrf=${csrfA1}`,
      });

      assert.equal(res.statusCode, 302);
      assert.ok(res.headers.location.includes('/applications?success=Application+status+updated'));

      const [updated] = await db
        .select()
        .from(jobApplications)
        .where(eq(jobApplications.id, applicationA1.id));
      assert.equal(updated.status, 'APPLIED', 'Status must be updated to APPLIED');
    });
  });
});
