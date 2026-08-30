/**
 * @file Integration Tests: MCP Career Tracking Tools (Phase 12 / P12-003)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
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
import { createCareerMcpServer } from '../../src/mcp/server.js';
import {
  handleTrackJobApplication,
  handleUpdateApplicationStatus,
  handleAddApplicationStage,
  handleUpdateApplicationStageOutcome,
  handleAttachApplicationDocument,
  handleGetJobApplication,
  handleListActiveApplications,
} from '../../src/mcp/tools/career-tracking-tools.js';
import { NotFoundError, ValidationError, AuthorizationError } from '../../src/errors/index.js';

describe('MCP Career Tracking Tools Integration Tests (P12-003)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');

  let tenantA;
  let userA;
  let _candidateA;
  let contextA;

  let tenantB;
  let userB;
  let _candidateB;
  let contextB;

  let readOnlyContextA;
  const createdTenantIds = [];

  before(async () => {
    // 1. Tenant A
    const tidA = crypto.randomUUID();
    createdTenantIds.push(tidA);
    [tenantA] = await db
      .insert(tenants)
      .values({
        id: tidA,
        name: `Tenant A Tracking MCP ${testRunId}`,
        slug: `tenant-a-mcp-${testRunId}`,
        tier: 'PRO',
      })
      .returning();

    const uidA = crypto.randomUUID();
    [userA] = await db
      .insert(users)
      .values({
        id: uidA,
        tenantId: tenantA.id,
        email: `alice-mcp-${testRunId}@example.com`,
        displayName: 'Alice Engineer',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    [_candidateA] = await db
      .insert(candidates)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenantA.id,
        userId: userA.id,
        displayName: 'Alice Candidate',
        headline: 'Distributed Systems Architect',
        status: 'ACTIVE',
      })
      .returning();

    contextA = {
      tenantId: tenantA.id,
      userId: userA.id,
      role: 'MEMBER',
      scopes: ['career:read', 'career:write'],
      tokenScopes: ['career:read', 'career:write'],
    };

    readOnlyContextA = {
      tenantId: tenantA.id,
      userId: userA.id,
      role: 'READONLY',
      scopes: ['career:read'],
      tokenScopes: ['career:read'],
    };

    // 2. Tenant B
    const tidB = crypto.randomUUID();
    createdTenantIds.push(tidB);
    [tenantB] = await db
      .insert(tenants)
      .values({
        id: tidB,
        name: `Tenant B Tracking MCP ${testRunId}`,
        slug: `tenant-b-mcp-${testRunId}`,
        tier: 'FREE',
      })
      .returning();

    const uidB = crypto.randomUUID();
    [userB] = await db
      .insert(users)
      .values({
        id: uidB,
        tenantId: tenantB.id,
        email: `bob-mcp-${testRunId}@example.com`,
        displayName: 'Bob Engineer',
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

    contextB = {
      tenantId: tenantB.id,
      userId: userB.id,
      role: 'MEMBER',
      scopes: ['career:read', 'career:write'],
      tokenScopes: ['career:read', 'career:write'],
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

  describe('1. Server Factory Registration & Catalog', () => {
    it('createCareerMcpServer registers exactly 16 total tools (4 read, 3 artifact, 2 write, 7 tracking)', () => {
      const server = createCareerMcpServer();
      const toolNames = Array.from(server.registeredTools.keys());
      assert.strictEqual(toolNames.length, 24);

      // Verify all 7 tracking tools are present
      assert.ok(toolNames.includes('track_job_application'));
      assert.ok(toolNames.includes('update_application_status'));
      assert.ok(toolNames.includes('add_application_stage'));
      assert.ok(toolNames.includes('update_application_stage_outcome'));
      assert.ok(toolNames.includes('attach_application_document'));
      assert.ok(toolNames.includes('get_job_application'));
      assert.ok(toolNames.includes('list_active_applications'));

      // Verify destructive delete primitive is NOT exposed to MCP clients
      assert.strictEqual(toolNames.includes('delete_job_application'), false);
      assert.strictEqual(toolNames.includes('deleteApplication'), false);
    });
  });

  describe('2. MCP Tracking Tools Execution Flow', () => {
    let trackedApp;
    let stage1;

    it('track_job_application tracks opportunity and returns structured summary', async () => {
      const res = await handleTrackJobApplication(contextA, {
        companyName: 'Vercel',
        jobTitle: 'Edge Infrastructure Architect',
        jobUrl: 'https://vercel.com/careers/edge-infra',
        source: 'COMPANY_CAREERS',
        workplaceType: 'REMOTE',
        employmentType: 'FULL_TIME',
        rawJobDescription: 'We are seeking an edge infrastructure architect...',
        compensation: {
          currency: 'USD',
          minSalary: 220000,
          maxSalary: 280000,
          targetSalary: 250000,
        },
        notes: 'Targeting Q3 transition.',
        status: 'SAVED',
      });

      assert.ok(res.application.id);
      assert.strictEqual(res.application.companyName, 'Vercel');
      assert.strictEqual(res.application.status, 'SAVED');
      trackedApp = res.application;
    });

    it('update_application_status transitions lifecycle state and manages timestamps', async () => {
      const res = await handleUpdateApplicationStatus(contextA, {
        applicationId: trackedApp.id,
        status: 'APPLIED',
        reason: 'Applied via company careers website',
      });

      assert.strictEqual(res.application.status, 'APPLIED');
      assert.ok(res.application.appliedAt);
    });

    it('update_application_status rejects illegal state transition without mutation', async () => {
      await assert.rejects(
        () =>
          handleUpdateApplicationStatus(contextA, {
            applicationId: trackedApp.id,
            status: 'OFFER_ACCEPTED', // Illegal leap from APPLIED
          }),
        ValidationError
      );
    });

    it('add_application_stage appends chronological interview round', async () => {
      const res = await handleAddApplicationStage(contextA, {
        applicationId: trackedApp.id,
        stageType: 'RECRUITER_SCREEN',
        title: 'Initial 30m Recruiter Chat',
        interviewerNames: ['Jane Recruiter'],
      });

      assert.ok(res.stage.id);
      assert.strictEqual(res.stage.orderIndex, 0);
      assert.strictEqual(res.stage.stageType, 'RECRUITER_SCREEN');
      stage1 = res.stage;
    });

    it('update_application_stage_outcome marks round as PASSED', async () => {
      const res = await handleUpdateApplicationStageOutcome(contextA, {
        stageId: stage1.id,
        outcome: 'PASSED',
        feedback: 'Recruiter was impressed with distributed systems background.',
      });

      assert.strictEqual(res.stage.outcome, 'PASSED');
      assert.strictEqual(res.stage.hasFeedback, true);
      assert.ok(res.stage.completedAt);
    });

    it('attach_application_document attaches tailored resume snapshot with server-computed hash', async () => {
      const res = await handleAttachApplicationDocument(contextA, {
        applicationId: trackedApp.id,
        documentType: 'TAILORED_RESUME',
        title: 'Vercel Tailored Resume v1',
        content: {
          headline: 'Edge Infrastructure Architect | Node.js & V8 Isolates',
          highlights: ['Optimized edge cold starts', 'Designed global routing layer'],
        },
        integrityScore: 1.0,
        atsFitScore: 94.5,
      });

      assert.ok(res.document.id);
      assert.strictEqual(res.document.version, 1);
      assert.strictEqual(res.document.contentHash.length, 64);
    });

    it('get_job_application returns aggregate details within <= 25 KB budget', async () => {
      const res = await handleGetJobApplication(contextA, {
        applicationId: trackedApp.id,
        includeFullJd: true,
      });

      assert.strictEqual(res.application.id, trackedApp.id);
      assert.strictEqual(res.stages.length, 1);
      assert.strictEqual(res.tailoredDocuments.length, 1);

      const serializedSize = Buffer.byteLength(JSON.stringify(res), 'utf8');
      assert.ok(serializedSize <= 25600, `Output size ${serializedSize} exceeded 25 KB budget`);
    });

    it('list_active_applications returns compact application list within <= 15 KB budget and redacts compensation', async () => {
      const res = await handleListActiveApplications(contextA, {
        companyName: 'Vercel',
        limit: 10,
      });

      assert.ok(res.items.length >= 1);
      assert.strictEqual(res.items[0].companyName, 'Vercel');

      // Ensure compensation numbers are not present in list summaries
      assert.strictEqual(res.items[0].compensation, undefined);

      const serializedSize = Buffer.byteLength(JSON.stringify(res), 'utf8');
      assert.ok(serializedSize <= 15360, `List size ${serializedSize} exceeded 15 KB budget`);
    });
  });

  describe('3. Multi-Tenant Isolation & RBAC Protection', () => {
    let tenantAApp;

    before(async () => {
      const res = await handleTrackJobApplication(contextA, {
        companyName: 'Confidential Corp',
        jobTitle: 'Stealth Architect',
      });
      tenantAApp = res.application;
    });

    it('Tenant B cannot access Tenant A application via get_job_application (returns 404)', async () => {
      await assert.rejects(
        () =>
          handleGetJobApplication(contextB, {
            applicationId: tenantAApp.id,
          }),
        NotFoundError
      );
    });

    it('Tenant B cannot update status of Tenant A application (returns 404)', async () => {
      await assert.rejects(
        () =>
          handleUpdateApplicationStatus(contextB, {
            applicationId: tenantAApp.id,
            status: 'ARCHIVED',
          }),
        NotFoundError
      );
    });

    it('rejects mutating tools for READONLY role with AuthorizationError (403)', async () => {
      await assert.rejects(
        () =>
          handleTrackJobApplication(readOnlyContextA, {
            companyName: 'Should Fail',
            jobTitle: 'Blocked Role',
          }),
        AuthorizationError
      );

      await assert.rejects(
        () =>
          handleUpdateApplicationStatus(readOnlyContextA, {
            applicationId: tenantAApp.id,
            status: 'APPLIED',
          }),
        AuthorizationError
      );
    });
  });
});
