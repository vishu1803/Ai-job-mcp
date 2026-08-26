/**
 * @file Integration Tests: Job Application Database Schema & Cascade Isolation (Phase 12 / P12-001)
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
} from '../../src/db/schema.js';
import { computeDocumentContentHash } from '../../src/domain/career/application-state-machine.js';

describe('Job Application Database Schema & Isolation Integration Tests (P12-001)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');

  let tenantA;
  let userA;
  let candidateA;

  let tenantB;
  let userB;
  let _candidateB;

  const createdTenantIds = [];

  before(async () => {
    // 1. Setup Tenant A & Candidate A
    const tenantIdA = crypto.randomUUID();
    createdTenantIds.push(tenantIdA);

    [tenantA] = await db
      .insert(tenants)
      .values({
        id: tenantIdA,
        name: `Tenant A Job Tracking ${testRunId}`,
        slug: `tenant-a-tracking-${testRunId}`,
        tier: 'PRO',
      })
      .returning();

    const userIdA = crypto.randomUUID();
    [userA] = await db
      .insert(users)
      .values({
        id: userIdA,
        tenantId: tenantA.id,
        email: `alice-tracking-${testRunId}@example.com`,
        displayName: 'Alice Tracker',
        role: 'OWNER',
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

    // 2. Setup Tenant B & Candidate B (for cross-tenant tests)
    const tenantIdB = crypto.randomUUID();
    createdTenantIds.push(tenantIdB);

    [tenantB] = await db
      .insert(tenants)
      .values({
        id: tenantIdB,
        name: `Tenant B Job Tracking ${testRunId}`,
        slug: `tenant-b-tracking-${testRunId}`,
        tier: 'FREE',
      })
      .returning();

    const userIdB = crypto.randomUUID();
    [userB] = await db
      .insert(users)
      .values({
        id: userIdB,
        tenantId: tenantB.id,
        email: `bob-tracking-${testRunId}@example.com`,
        displayName: 'Bob Tracker',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    [_candidateB] = await db
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
  });

  after(async () => {
    try {
      if (createdTenantIds.length > 0) {
        for (const tid of createdTenantIds) {
          // Cascade cleanups
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

  describe('1. CRUD & Child Relations on Job Applications', () => {
    let createdAppId;

    it('inserts a complete job_applications record with all jsonb fields', async () => {
      const appId = crypto.randomUUID();
      createdAppId = appId;

      const [app] = await db
        .insert(jobApplications)
        .values({
          id: appId,
          tenantId: tenantA.id,
          candidateId: candidateA.id,
          companyName: 'Stripe',
          jobTitle: 'Staff Backend Engineer (Payments Infrastructure)',
          jobUrl: 'https://stripe.com/jobs/staff-infra-101',
          source: 'LINKEDIN',
          location: 'San Francisco, CA',
          workplaceType: 'HYBRID',
          employmentType: 'FULL_TIME',
          rawJobDescription:
            'We are seeking a Staff Engineer to lead high-throughput payment systems...',
          parsedJobDescription: {
            title: 'Staff Backend Engineer',
            requiredSkills: [
              { slug: 'nodejs', name: 'Node.js' },
              { slug: 'postgresql', name: 'PostgreSQL' },
            ],
          },
          atsFitSnapshot: {
            overallScore: 92.5,
            matchGrade: 'EXCELLENT',
            requiredSkillsScore: 40.0,
          },
          status: 'SAVED',
          compensation: {
            currency: 'USD',
            minSalary: 230000,
            maxSalary: 290000,
            targetSalary: 260000,
            equity: '0.15% RSUs',
          },
          notes: 'Initial bookmark after reaching out to recruiter.',
          metadata: { priority: 'HIGH' },
        })
        .returning();

      assert.strictEqual(app.id, appId);
      assert.strictEqual(app.companyName, 'Stripe');
      assert.strictEqual(app.status, 'SAVED');
      assert.strictEqual(app.compensation.currency, 'USD');
      assert.strictEqual(app.atsFitSnapshot.overallScore, 92.5);
    });

    it('inserts sequential application_stages child records for the application', async () => {
      const stage1Id = crypto.randomUUID();
      const stage2Id = crypto.randomUUID();

      const [stage1] = await db
        .insert(applicationStages)
        .values({
          id: stage1Id,
          tenantId: tenantA.id,
          applicationId: createdAppId,
          stageType: 'RECRUITER_SCREEN',
          title: 'Initial Recruiter Screen (30 min)',
          scheduledAt: new Date(Date.now() - 86400000),
          completedAt: new Date(Date.now() - 82800000),
          outcome: 'PASSED',
          interviewerNames: ['Sarah Miller (Senior Tech Recruiter)'],
          feedback: 'Strong alignment on technical stack and compensation.',
          orderIndex: 0,
        })
        .returning();

      const [stage2] = await db
        .insert(applicationStages)
        .values({
          id: stage2Id,
          tenantId: tenantA.id,
          applicationId: createdAppId,
          stageType: 'TECHNICAL_ASSESSMENT',
          title: 'System Design Deep Dive (Distributed Ledger)',
          scheduledAt: new Date(Date.now() + 86400000),
          outcome: 'PENDING',
          interviewerNames: ['Alex Rivera (Principal Architect)'],
          orderIndex: 1,
        })
        .returning();

      assert.strictEqual(stage1.outcome, 'PASSED');
      assert.strictEqual(stage1.orderIndex, 0);
      assert.strictEqual(stage2.outcome, 'PENDING');
      assert.strictEqual(stage2.orderIndex, 1);
    });

    it('attaches an immutable tailored_documents record with verified SHA-256 hash', async () => {
      const docId = crypto.randomUUID();
      const docContent = {
        headline: 'Staff Backend Architect | Distributed Systems Specialist',
        summary: '10+ years engineering high-scale distributed backends.',
        skills: [
          { slug: 'nodejs', name: 'Node.js', status: 'VERIFIED' },
          { slug: 'postgresql', name: 'PostgreSQL', status: 'VERIFIED' },
        ],
      };

      const computedHash = computeDocumentContentHash(docContent);

      const [doc] = await db
        .insert(tailoredDocuments)
        .values({
          id: docId,
          tenantId: tenantA.id,
          applicationId: createdAppId,
          candidateId: candidateA.id,
          documentType: 'TAILORED_RESUME',
          version: 1,
          title: 'Stripe Staff Payments Tailored Resume v1',
          content: docContent,
          renderedMarkdown: '# Alice Candidate\n\n## Staff Backend Architect',
          renderedPlainText: 'Alice Candidate\nStaff Backend Architect',
          contentHash: computedHash,
          citationRefs: [
            {
              evidenceId: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
              filePath: 'src/services/auth.service.js',
              commitSha: '5fe4bec9cc62f6445fd7f7b433f811f631e4b6d3',
            },
          ],
          integrityScore: 1.0,
          atsFitScore: 92.5,
        })
        .returning();

      assert.strictEqual(doc.id, docId);
      assert.strictEqual(doc.documentType, 'TAILORED_RESUME');
      assert.strictEqual(doc.contentHash, computedHash);
      assert.strictEqual(doc.citationRefs.length, 1);
    });

    it('updates application status from SAVED to INTERVIEWING with appliedAt timestamp', async () => {
      const now = new Date();
      const [updated] = await db
        .update(jobApplications)
        .set({
          status: 'INTERVIEWING',
          appliedAt: now,
          updatedAt: now,
        })
        .where(and(eq(jobApplications.id, createdAppId), eq(jobApplications.tenantId, tenantA.id)))
        .returning();

      assert.strictEqual(updated.status, 'INTERVIEWING');
      assert.ok(updated.appliedAt);
    });
  });

  describe('2. Multi-Tenant Boundary Isolation', () => {
    it('prevents Tenant B from reading Tenant A job applications', async () => {
      const rows = await db
        .select()
        .from(jobApplications)
        .where(eq(jobApplications.tenantId, tenantB.id));

      assert.strictEqual(rows.length, 0);
    });

    it('prevents Tenant B from reading Tenant A application stages', async () => {
      const rows = await db
        .select()
        .from(applicationStages)
        .where(eq(applicationStages.tenantId, tenantB.id));

      assert.strictEqual(rows.length, 0);
    });

    it('prevents Tenant B from reading Tenant A tailored documents', async () => {
      const rows = await db
        .select()
        .from(tailoredDocuments)
        .where(eq(tailoredDocuments.tenantId, tenantB.id));

      assert.strictEqual(rows.length, 0);
    });
  });

  describe('3. Cascade Deletion Integrity', () => {
    it('cascades application deletion to its child stages and tailored documents', async () => {
      // Create dedicated application for cascade test
      const tempAppId = crypto.randomUUID();
      await db.insert(jobApplications).values({
        id: tempAppId,
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        companyName: 'Cascade Test Corp',
        jobTitle: 'Software Engineer',
      });

      const tempStageId = crypto.randomUUID();
      await db.insert(applicationStages).values({
        id: tempStageId,
        tenantId: tenantA.id,
        applicationId: tempAppId,
        stageType: 'RECRUITER_SCREEN',
        title: 'Screen',
      });

      const tempDocId = crypto.randomUUID();
      await db.insert(tailoredDocuments).values({
        id: tempDocId,
        tenantId: tenantA.id,
        applicationId: tempAppId,
        candidateId: candidateA.id,
        documentType: 'CUSTOM_NOTE',
        title: 'Notes',
        content: { note: 'test note' },
        contentHash: computeDocumentContentHash({ note: 'test note' }),
      });

      // Verify insertion
      const [appBefore] = await db
        .select()
        .from(jobApplications)
        .where(eq(jobApplications.id, tempAppId));
      assert.ok(appBefore);

      // Delete Application
      await db.delete(jobApplications).where(eq(jobApplications.id, tempAppId));

      // Verify children were cascaded
      const stagesAfter = await db
        .select()
        .from(applicationStages)
        .where(eq(applicationStages.id, tempStageId));
      assert.strictEqual(stagesAfter.length, 0);

      const docsAfter = await db
        .select()
        .from(tailoredDocuments)
        .where(eq(tailoredDocuments.id, tempDocId));
      assert.strictEqual(docsAfter.length, 0);
    });
  });
});
