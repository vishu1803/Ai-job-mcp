/**
 * @file Integration Tests: Application Tracking Service (Phase 12 / P12-002)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  jobApplications,
  applicationStages,
  tailoredDocuments,
  auditLogs,
} from '../../src/db/schema.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { computeDocumentContentHash } from '../../src/domain/career/application-state-machine.js';
import { NotFoundError, ValidationError, AuthorizationError } from '../../src/errors/index.js';

describe('Application Tracking Service Integration Tests (P12-002)', () => {
  const service = new ApplicationTrackingService();
  const testRunId = crypto.randomBytes(4).toString('hex');

  let tenantA;
  let userA;
  let candidateA;
  let contextA;

  let tenantB;
  let userB;
  let candidateB;
  let contextB;

  const createdTenantIds = [];

  before(async () => {
    // 1. Setup Tenant A
    const tenantIdA = crypto.randomUUID();
    createdTenantIds.push(tenantIdA);

    [tenantA] = await db
      .insert(tenants)
      .values({
        id: tenantIdA,
        name: `Tenant A Tracking Service ${testRunId}`,
        slug: `tenant-a-srv-${testRunId}`,
        tier: 'PRO',
      })
      .returning();

    const userIdA = crypto.randomUUID();
    [userA] = await db
      .insert(users)
      .values({
        id: userIdA,
        tenantId: tenantA.id,
        email: `alice-srv-${testRunId}@example.com`,
        displayName: 'Alice Engineer',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    [candidateA] = await db
      .insert(candidates)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenantA.id,
        userId: userA.id,
        displayName: 'Alice Candidate',
        headline: 'Staff Backend Architect',
        status: 'ACTIVE',
      })
      .returning();

    contextA = {
      tenantId: tenantA.id,
      userId: userA.id,
      role: 'MEMBER',
    };

    // 2. Setup Tenant B
    const tenantIdB = crypto.randomUUID();
    createdTenantIds.push(tenantIdB);

    [tenantB] = await db
      .insert(tenants)
      .values({
        id: tenantIdB,
        name: `Tenant B Tracking Service ${testRunId}`,
        slug: `tenant-b-srv-${testRunId}`,
        tier: 'FREE',
      })
      .returning();

    const userIdB = crypto.randomUUID();
    [userB] = await db
      .insert(users)
      .values({
        id: userIdB,
        tenantId: tenantB.id,
        email: `bob-srv-${testRunId}@example.com`,
        displayName: 'Bob Engineer',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    [candidateB] = await db
      .insert(candidates)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenantB.id,
        userId: userB.id,
        displayName: 'Bob Candidate',
        headline: 'Frontend Engineer',
        status: 'ACTIVE',
      })
      .returning();

    contextB = {
      tenantId: tenantB.id,
      userId: userB.id,
      role: 'MEMBER',
    };
  });

  after(async () => {
    try {
      if (createdTenantIds.length > 0) {
        for (const tid of createdTenantIds) {
          await db.delete(auditLogs).where(eq(auditLogs.tenantId, tid));
          await db.delete(tailoredDocuments).where(eq(tailoredDocuments.tenantId, tid));
          await db.delete(applicationStages).where(eq(applicationStages.tenantId, tid));
          await db.delete(jobApplications).where(eq(jobApplications.tenantId, tid));
          await db.delete(candidates).where(eq(candidates.tenantId, tid));
          await db.delete(users).where(eq(users.tenantId, tid));
          await db.delete(tenants).where(eq(tenants.id, tid));
        }
      }
    } finally {
      await closeDatabase();
    }
  });

  describe('1. createApplication', () => {
    let createdApp;

    it('creates a job application with full metadata and emits audit event', async () => {
      createdApp = await service.createApplication(contextA, candidateA.id, {
        companyName: 'Anthropic',
        jobTitle: 'Systems Research Engineer',
        jobUrl: 'https://anthropic.com/jobs/systems-research',
        source: 'COMPANY_CAREERS',
        location: 'San Francisco, CA',
        workplaceType: 'HYBRID',
        employmentType: 'FULL_TIME',
        rawJobDescription:
          'We are seeking engineers to build robust distributed training infrastructure...',
        parsedJobDescription: {
          title: 'Systems Research Engineer',
          requiredSkills: [
            { slug: 'nodejs', name: 'Node.js' },
            { slug: 'distributed-systems', name: 'Distributed Systems' },
          ],
        },
        atsFitSnapshot: {
          overallScore: 94.0,
          matchGrade: 'EXCELLENT',
        },
        status: 'SAVED',
        compensation: {
          currency: 'USD',
          minSalary: 250000,
          maxSalary: 320000,
          targetSalary: 290000,
          equity: '0.2% Equity',
        },
        notes: 'Spoke with hiring manager at conference.',
        metadata: { priority: 'TIER_1' },
      });

      assert.ok(createdApp.id);
      assert.strictEqual(createdApp.companyName, 'Anthropic');
      assert.strictEqual(createdApp.status, 'SAVED');
      assert.strictEqual(createdApp.tenantId, tenantA.id);
      assert.strictEqual(createdApp.candidateId, candidateA.id);

      // Verify audit log
      const [audit] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, tenantA.id),
            eq(auditLogs.resourceId, createdApp.id),
            eq(auditLogs.eventType, 'job_application.created')
          )
        );

      assert.ok(audit);
      assert.strictEqual(audit.details.companyName, 'Anthropic');
      assert.strictEqual(audit.details.status, 'SAVED');
    });

    it('initializes appliedAt timestamp when initial status is APPLIED', async () => {
      const app = await service.createApplication(contextA, candidateA.id, {
        companyName: 'Linear',
        jobTitle: 'Senior Fullstack Engineer',
        status: 'APPLIED',
      });

      assert.strictEqual(app.status, 'APPLIED');
      assert.ok(app.appliedAt);
    });

    it('blocks Tenant A from creating application for Tenant B candidate (returns 404)', async () => {
      await assert.rejects(
        () =>
          service.createApplication(contextA, candidateB.id, {
            companyName: 'Malicious Corp',
            jobTitle: 'Hacker',
          }),
        NotFoundError
      );
    });
  });

  describe('2. updateApplicationStatus & State Machine Progression', () => {
    let testApp;

    before(async () => {
      testApp = await service.createApplication(contextA, candidateA.id, {
        companyName: 'OpenAI',
        jobTitle: 'Infrastructure Engineer',
        status: 'SAVED',
      });
    });

    it('progresses through valid hiring funnel: SAVED -> APPLIED -> SCREENING -> INTERVIEWING -> OFFER_RECEIVED -> OFFER_ACCEPTED', async () => {
      // 1. SAVED -> APPLIED
      const applied = await service.updateApplicationStatus(
        contextA,
        testApp.id,
        'APPLIED',
        'Submitted via portal'
      );
      assert.strictEqual(applied.status, 'APPLIED');
      assert.ok(applied.appliedAt);

      // 2. APPLIED -> SCREENING
      const screening = await service.updateApplicationStatus(
        contextA,
        testApp.id,
        'SCREENING',
        'Recruiter email received'
      );
      assert.strictEqual(screening.status, 'SCREENING');

      // 3. SCREENING -> INTERVIEWING
      const interviewing = await service.updateApplicationStatus(
        contextA,
        testApp.id,
        'INTERVIEWING',
        'Onsite loop scheduled'
      );
      assert.strictEqual(interviewing.status, 'INTERVIEWING');

      // 4. INTERVIEWING -> OFFER_RECEIVED
      const offerReceived = await service.updateApplicationStatus(
        contextA,
        testApp.id,
        'OFFER_RECEIVED',
        'Formal written offer'
      );
      assert.strictEqual(offerReceived.status, 'OFFER_RECEIVED');

      // 5. OFFER_RECEIVED -> OFFER_ACCEPTED
      const offerAccepted = await service.updateApplicationStatus(
        contextA,
        testApp.id,
        'OFFER_ACCEPTED',
        'Signed offer letter'
      );
      assert.strictEqual(offerAccepted.status, 'OFFER_ACCEPTED');
      assert.ok(offerAccepted.closedAt);

      // 6. OFFER_ACCEPTED -> ARCHIVED
      const archived = await service.updateApplicationStatus(
        contextA,
        testApp.id,
        'ARCHIVED',
        'Start date confirmed'
      );
      assert.strictEqual(archived.status, 'ARCHIVED');
    });

    it('rejects illegal status transition (e.g. SAVED -> OFFER_ACCEPTED) with ValidationError', async () => {
      const draftApp = await service.createApplication(contextA, candidateA.id, {
        companyName: 'Illegal Leap Corp',
        jobTitle: 'Architect',
        status: 'SAVED',
      });

      await assert.rejects(
        () => service.updateApplicationStatus(contextA, draftApp.id, 'OFFER_ACCEPTED'),
        ValidationError
      );
    });

    it('handles reopening of REJECTED application and clears closedAt', async () => {
      const rejectedApp = await service.createApplication(contextA, candidateA.id, {
        companyName: 'Reopen Corp',
        jobTitle: 'Backend Dev',
        status: 'APPLIED',
      });

      const rejected = await service.updateApplicationStatus(
        contextA,
        rejectedApp.id,
        'REJECTED',
        'Headcount paused'
      );
      assert.strictEqual(rejected.status, 'REJECTED');
      assert.ok(rejected.closedAt);

      const reopened = await service.updateApplicationStatus(
        contextA,
        rejectedApp.id,
        'APPLIED',
        'Recruiter reached back out'
      );
      assert.strictEqual(reopened.status, 'APPLIED');
      assert.strictEqual(reopened.closedAt, null);
    });
  });

  describe('3. addApplicationStage & Chronological Ordering', () => {
    let testApp;

    before(async () => {
      testApp = await service.createApplication(contextA, candidateA.id, {
        companyName: 'Figma',
        jobTitle: 'Staff Performance Engineer',
      });
    });

    it('appends multiple sequential stages with automated monotonic orderIndex (0, 1, 2)', async () => {
      const stage0 = await service.addApplicationStage(contextA, testApp.id, {
        stageType: 'RECRUITER_SCREEN',
        title: 'Initial HR Screen (30m)',
        scheduledAt: new Date(Date.now() - 86400000).toISOString(),
        outcome: 'PASSED',
      });

      const stage1 = await service.addApplicationStage(contextA, testApp.id, {
        stageType: 'TECHNICAL_ASSESSMENT',
        title: 'Algorithms & Concurrency (60m)',
        scheduledAt: new Date().toISOString(),
        outcome: 'PASSED',
      });

      const stage2 = await service.addApplicationStage(contextA, testApp.id, {
        stageType: 'SYSTEM_DESIGN',
        title: 'Real-Time Collaboration Engine Architecture (60m)',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        outcome: 'PENDING',
      });

      assert.strictEqual(stage0.orderIndex, 0);
      assert.strictEqual(stage1.orderIndex, 1);
      assert.strictEqual(stage2.orderIndex, 2);
    });
  });

  describe('4. updateStageOutcome', () => {
    let stageToUpdate;

    before(async () => {
      const app = await service.createApplication(contextA, candidateA.id, {
        companyName: 'Vercel',
        jobTitle: 'Edge Infrastructure Engineer',
      });

      stageToUpdate = await service.addApplicationStage(contextA, app.id, {
        stageType: 'ONSITE_LOOP',
        title: 'Onsite Architecture Loop',
        outcome: 'PENDING',
      });
    });

    it('updates outcome to PASSED and records completedAt timestamp', async () => {
      const updated = await service.updateStageOutcome(
        contextA,
        stageToUpdate.id,
        'PASSED',
        'Strong performance on distributed caching and edge routing.'
      );

      assert.strictEqual(updated.outcome, 'PASSED');
      assert.ok(updated.completedAt);
      assert.strictEqual(
        updated.feedback,
        'Strong performance on distributed caching and edge routing.'
      );
    });

    it('updates outcome to RESCHEDULED and clears completedAt', async () => {
      const newScheduledDate = new Date(Date.now() + 172800000).toISOString();
      const rescheduled = await service.updateStageOutcome(
        contextA,
        stageToUpdate.id,
        'RESCHEDULED',
        'Interviewer sick; moved to next week',
        { scheduledAt: newScheduledDate }
      );

      assert.strictEqual(rescheduled.outcome, 'RESCHEDULED');
      assert.strictEqual(rescheduled.completedAt, null);
    });
  });

  describe('5. attachTailoredDocument & Versioning', () => {
    let testApp;

    before(async () => {
      testApp = await service.createApplication(contextA, candidateA.id, {
        companyName: 'Datadog',
        jobTitle: 'Core Platform Architect',
      });
    });

    it('attaches immutable tailored document with server-computed SHA-256 hash and version 1', async () => {
      const docContent = {
        headline: 'Core Platform Architect | Distributed Telemetry',
        skills: ['nodejs', 'postgresql', 'distributed-systems'],
      };
      const expectedHash = computeDocumentContentHash(docContent);

      const doc1 = await service.attachTailoredDocument(contextA, testApp.id, {
        candidateId: candidateA.id,
        documentType: 'TAILORED_RESUME',
        title: 'Datadog Tailored Resume v1',
        content: docContent,
        citationRefs: [
          {
            evidenceId: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
            filePath: 'src/telemetry/tracer.js',
          },
        ],
        integrityScore: 1.0,
        atsFitScore: 95.0,
      });

      assert.strictEqual(doc1.version, 1);
      assert.strictEqual(doc1.documentType, 'TAILORED_RESUME');
      assert.strictEqual(doc1.contentHash, expectedHash);
      assert.strictEqual(doc1.citationRefs.length, 1);
    });

    it('increments version monotonically for subsequent documents of same type', async () => {
      const doc2 = await service.attachTailoredDocument(contextA, testApp.id, {
        candidateId: candidateA.id,
        documentType: 'TAILORED_RESUME',
        title: 'Datadog Tailored Resume v2',
        content: { headline: 'Core Platform Architect v2' },
      });

      const coverLetter = await service.attachTailoredDocument(contextA, testApp.id, {
        candidateId: candidateA.id,
        documentType: 'TAILORED_COVER_LETTER',
        title: 'Datadog Cover Letter v1',
        content: { body: 'Dear Datadog Team...' },
      });

      assert.strictEqual(doc2.version, 2);
      assert.strictEqual(coverLetter.version, 1);
    });
  });

  describe('6. getApplicationDetails & listApplications', () => {
    let queriedApp;

    before(async () => {
      queriedApp = await service.createApplication(contextA, candidateA.id, {
        companyName: 'Cloudflare',
        jobTitle: 'Edge Worker Engineer',
        source: 'REFERRAL',
        status: 'INTERVIEWING',
      });

      await service.addApplicationStage(contextA, queriedApp.id, {
        stageType: 'TECHNICAL_ASSESSMENT',
        title: 'V8 Isolate Deep Dive',
      });

      await service.attachTailoredDocument(contextA, queriedApp.id, {
        candidateId: candidateA.id,
        documentType: 'TAILORED_RESUME',
        title: 'Cloudflare Tailored Resume',
        content: { test: true },
      });
    });

    it('getApplicationDetails returns root application, stages, and tailored documents', async () => {
      const details = await service.getApplicationDetails(contextA, queriedApp.id);

      assert.strictEqual(details.application.id, queriedApp.id);
      assert.strictEqual(details.application.companyName, 'Cloudflare');
      assert.strictEqual(details.stages.length, 1);
      assert.strictEqual(details.tailoredDocuments.length, 1);
    });

    it('listApplications filters by status and companyName with pagination', async () => {
      const list = await service.listApplications(
        contextA,
        candidateA.id,
        { companyName: 'Cloudflare', status: 'INTERVIEWING' },
        { limit: 10, offset: 0 }
      );

      assert.ok(list.items.length >= 1);
      assert.strictEqual(list.items[0].companyName, 'Cloudflare');
      assert.strictEqual(list.limit, 10);
      assert.strictEqual(list.offset, 0);
    });
  });

  describe('7. Multi-Tenant Default-Deny (404 Isolation)', () => {
    let tenantAApp;

    before(async () => {
      tenantAApp = await service.createApplication(contextA, candidateA.id, {
        companyName: 'Secret Company',
        jobTitle: 'Stealth Engineer',
      });
    });

    it('Tenant B cannot get details of Tenant A application (returns 404)', async () => {
      await assert.rejects(
        () => service.getApplicationDetails(contextB, tenantAApp.id),
        NotFoundError
      );
    });

    it('Tenant B cannot update status of Tenant A application (returns 404)', async () => {
      await assert.rejects(
        () => service.updateApplicationStatus(contextB, tenantAApp.id, 'APPLIED'),
        NotFoundError
      );
    });

    it('Tenant B cannot add stage to Tenant A application (returns 404)', async () => {
      await assert.rejects(
        () =>
          service.addApplicationStage(contextB, tenantAApp.id, {
            stageType: 'RECRUITER_SCREEN',
            title: 'Unauthorized Stage',
          }),
        NotFoundError
      );
    });

    it('Tenant B cannot attach document to Tenant A application (returns 404)', async () => {
      await assert.rejects(
        () =>
          service.attachTailoredDocument(contextB, tenantAApp.id, {
            candidateId: candidateB.id,
            documentType: 'TAILORED_RESUME',
            title: 'Hacked Resume',
            content: {},
          }),
        NotFoundError
      );
    });

    it('Tenant B cannot delete Tenant A application (returns 404)', async () => {
      await assert.rejects(() => service.deleteApplication(contextB, tenantAApp.id), NotFoundError);
    });

    it('rejects mutating operations from READONLY context with AuthorizationError', async () => {
      const readOnlyContext = {
        ...contextA,
        role: 'READONLY',
      };

      await assert.rejects(
        () => service.updateApplicationStatus(readOnlyContext, tenantAApp.id, 'APPLIED'),
        AuthorizationError
      );
    });
  });

  describe('8. deleteApplication & Cascade Verification', () => {
    it('deletes application, cascades child stages/docs, and emits audit event', async () => {
      const appToDelete = await service.createApplication(contextA, candidateA.id, {
        companyName: 'To Delete Corp',
        jobTitle: 'Temporary Role',
      });

      const stage = await service.addApplicationStage(contextA, appToDelete.id, {
        stageType: 'RECRUITER_SCREEN',
        title: 'Temp Stage',
      });

      const doc = await service.attachTailoredDocument(contextA, appToDelete.id, {
        candidateId: candidateA.id,
        documentType: 'CUSTOM_NOTE',
        title: 'Temp Note',
        content: { note: 'delete me' },
      });

      // Execute deletion
      const res = await service.deleteApplication(contextA, appToDelete.id);
      assert.strictEqual(res.deleted, true);

      // Verify records are gone
      await assert.rejects(
        () => service.getApplicationDetails(contextA, appToDelete.id),
        NotFoundError
      );

      const stagesAfter = await db
        .select()
        .from(applicationStages)
        .where(eq(applicationStages.id, stage.id));
      assert.strictEqual(stagesAfter.length, 0);

      const docsAfter = await db
        .select()
        .from(tailoredDocuments)
        .where(eq(tailoredDocuments.id, doc.id));
      assert.strictEqual(docsAfter.length, 0);

      // Verify audit log
      const [audit] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, tenantA.id),
            eq(auditLogs.resourceId, appToDelete.id),
            eq(auditLogs.eventType, 'job_application.deleted')
          )
        );

      assert.ok(audit);
      assert.strictEqual(audit.details.deletedStagesCount, 1);
      assert.strictEqual(audit.details.deletedDocsCount, 1);
    });
  });
});
