/**
 * @file Integration Tests: Multi-Tenant Application Isolation & IDOR Security Suite (Phase 12 / P12-005)
 *
 * Formally verifies the approved 14-scenario multi-tenant isolation attack matrix
 * across job_applications, application_stages, tailored_documents, ApplicationTrackingService,
 * ApplicationAnalyticsService, and MCP tracking tools.
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
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { ApplicationAnalyticsService } from '../../src/services/application-analytics.service.js';
import {
  handleTrackJobApplication,
  handleUpdateApplicationStatus,
  handleAddApplicationStage,
  handleUpdateApplicationStageOutcome,
  handleAttachApplicationDocument,
  handleGetJobApplication,
  handleListActiveApplications,
} from '../../src/mcp/tools/career-tracking-tools.js';
import { NotFoundError } from '../../src/errors/index.js';

describe('Multi-Tenant Application Isolation & Security Suite (P12-005)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');

  let tenantA;
  let userA;
  let candidateA;
  let contextA;
  let applicationA;
  let stageA;
  let docA;

  let tenantB;
  let userB;
  let candidateB;
  let contextB;
  let applicationB;
  let stageB;
  let docB;

  let trackingService;
  let analyticsService;
  const createdTenantIds = [];

  before(async () => {
    trackingService = new ApplicationTrackingService({ database: db });
    analyticsService = new ApplicationAnalyticsService({ database: db });

    // =========================================================================
    // 1. Seed Tenant A Fixtures
    // =========================================================================
    const tidA = crypto.randomUUID();
    createdTenantIds.push(tidA);
    [tenantA] = await db
      .insert(tenants)
      .values({
        id: tidA,
        name: `Tenant A Isolation ${testRunId}`,
        slug: `tenant-a-iso-${testRunId}`,
        tier: 'PRO',
      })
      .returning();

    const uidA = crypto.randomUUID();
    [userA] = await db
      .insert(users)
      .values({
        id: uidA,
        tenantId: tenantA.id,
        email: `alice-iso-${testRunId}@example.com`,
        displayName: 'Alice Architect',
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
        displayName: 'Alice Candidate A',
        headline: 'Principal Distributed Architect',
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

    [applicationA] = await db
      .insert(jobApplications)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        companyName: 'Acme High-Sec Corp',
        jobTitle: 'Principal Security Architect',
        status: 'INTERVIEWING',
        appliedAt: new Date(),
        compensation: { baseSalary: 250000, currency: 'USD' },
        notes: 'Strictly confidential interview notes for Tenant A',
        atsFitSnapshot: { overallScore: 94.0, missingSkills: ['Rust'] },
        parsedJobDescription: { requirements: [{ extractedValue: 'Rust', category: 'LANGUAGE' }] },
      })
      .returning();

    [stageA] = await db
      .insert(applicationStages)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenantA.id,
        applicationId: applicationA.id,
        stageType: 'TECHNICAL_ASSESSMENT',
        title: 'Acme Core Engine Assessment',
        outcome: 'PASSED',
        feedback: 'Top 1% score on systems architecture',
        orderIndex: 0,
      })
      .returning();

    [docA] = await db
      .insert(tailoredDocuments)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenantA.id,
        applicationId: applicationA.id,
        candidateId: candidateA.id,
        documentType: 'TAILORED_RESUME',
        title: 'Acme Tailored Resume v1',
        content: { privateKey: 'secret_a_token', summary: 'Alice confidential resume' },
        contentHash: crypto.randomBytes(32).toString('hex'),
      })
      .returning();

    // =========================================================================
    // 2. Seed Tenant B Fixtures
    // =========================================================================
    const tidB = crypto.randomUUID();
    createdTenantIds.push(tidB);
    [tenantB] = await db
      .insert(tenants)
      .values({
        id: tidB,
        name: `Tenant B Isolation ${testRunId}`,
        slug: `tenant-b-iso-${testRunId}`,
        tier: 'FREE',
      })
      .returning();

    const uidB = crypto.randomUUID();
    [userB] = await db
      .insert(users)
      .values({
        id: uidB,
        tenantId: tenantB.id,
        email: `bob-iso-${testRunId}@example.com`,
        displayName: 'Bob Hacker',
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
        displayName: 'Bob Candidate B',
        headline: 'Frontend Developer',
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

    [applicationB] = await db
      .insert(jobApplications)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenantB.id,
        candidateId: candidateB.id,
        companyName: 'Beta Labs',
        jobTitle: 'Frontend Developer',
        status: 'APPLIED',
        appliedAt: new Date(),
        compensation: { baseSalary: 120000, currency: 'USD' },
        notes: 'Public notes for Tenant B',
        atsFitSnapshot: { overallScore: 72.0, missingSkills: ['GraphQL'] },
        parsedJobDescription: {
          requirements: [{ extractedValue: 'GraphQL', category: 'FRAMEWORK' }],
        },
      })
      .returning();

    [stageB] = await db
      .insert(applicationStages)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenantB.id,
        applicationId: applicationB.id,
        stageType: 'RECRUITER_SCREEN',
        title: 'Beta Recruiter Call',
        outcome: 'PASSED',
        feedback: 'Recruiter screen cleared',
        orderIndex: 0,
      })
      .returning();

    [docB] = await db
      .insert(tailoredDocuments)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenantB.id,
        applicationId: applicationB.id,
        candidateId: candidateB.id,
        documentType: 'TAILORED_COVER_LETTER',
        title: 'Beta Cover Letter v1',
        content: { privateKey: 'secret_b_token', intro: 'Bob cover letter' },
        contentHash: crypto.randomBytes(32).toString('hex'),
      })
      .returning();
  });

  after(async () => {
    try {
      if (createdTenantIds.length > 0) {
        for (const tid of createdTenantIds) {
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

  // ===========================================================================
  // 14-Scenario Isolation Attack Matrix
  // ===========================================================================

  it('Scenario 1: Cross-Tenant Get Application (MCP get_job_application returns 404 with zero info leak)', async () => {
    let thrownError;
    try {
      await handleGetJobApplication(contextB, { applicationId: applicationA.id });
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError instanceof NotFoundError, 'Must throw NotFoundError');
    assert.strictEqual(thrownError.statusCode, 404);

    // Verify zero information leakage
    const errMsg = thrownError.message;
    assert.ok(!errMsg.includes('Acme High-Sec Corp'), 'Must not leak company name');
    assert.ok(!errMsg.includes('Principal Security Architect'), 'Must not leak job title');
    assert.ok(!errMsg.includes('Strictly confidential'), 'Must not leak notes');
    assert.ok(!errMsg.includes('250000'), 'Must not leak salary');

    // Compare with non-existent UUID to verify error message indistinguishability
    const randomUuid = crypto.randomUUID();
    let randomError;
    try {
      await handleGetJobApplication(contextB, { applicationId: randomUuid });
    } catch (err) {
      randomError = err;
    }
    assert.strictEqual(
      errMsg.replace(applicationA.id, '<ID>'),
      randomError.message.replace(randomUuid, '<ID>')
    );
  });

  it('Scenario 2: Cross-Tenant List Applications (MCP list_active_applications never returns foreign rows)', async () => {
    const res = await handleListActiveApplications(contextB, { limit: 50 });
    assert.ok(Array.isArray(res.items));
    assert.strictEqual(res.total, 1);
    assert.strictEqual(res.items[0].companyName, 'Beta Labs');

    // Assert zero Tenant A items present
    const foreignItems = res.items.filter((i) => i.companyName.includes('Acme'));
    assert.strictEqual(foreignItems.length, 0);
  });

  it('Scenario 3: Cross-Tenant Create for Foreign Candidate (MCP track_job_application rejects foreign candidateId with 404)', async () => {
    await assert.rejects(
      () =>
        handleTrackJobApplication(contextB, {
          candidateId: candidateA.id,
          companyName: 'Infiltrator Corp',
          jobTitle: 'Malicious Role',
        }),
      NotFoundError
    );

    // Verify no application created in DB for candidateA under Infiltrator Corp
    const check = await db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.candidateId, candidateA.id),
          eq(jobApplications.companyName, 'Infiltrator Corp')
        )
      );
    assert.strictEqual(check.length, 0);
  });

  it('Scenario 4: Cross-Tenant Status Update (MCP update_application_status fails closed with 404)', async () => {
    await assert.rejects(
      () =>
        handleUpdateApplicationStatus(contextB, {
          applicationId: applicationA.id,
          status: 'REJECTED',
          reason: 'Malicious reject from Tenant B',
        }),
      NotFoundError
    );

    // Verify Application A status was not modified
    const [appAfter] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, applicationA.id));
    assert.strictEqual(appAfter.status, 'INTERVIEWING');
  });

  it('Scenario 5: Cross-Tenant Stage Creation (MCP add_application_stage fails closed with 404)', async () => {
    await assert.rejects(
      () =>
        handleAddApplicationStage(contextB, {
          applicationId: applicationA.id,
          stageType: 'BEHAVIORAL',
          title: 'Malicious Injected Stage',
        }),
      NotFoundError
    );

    // Verify no stage was added to applicationA
    const stages = await db
      .select()
      .from(applicationStages)
      .where(
        and(
          eq(applicationStages.applicationId, applicationA.id),
          eq(applicationStages.title, 'Malicious Injected Stage')
        )
      );
    assert.strictEqual(stages.length, 0);
  });

  it('Scenario 6: Cross-Tenant Stage Outcome Update (MCP update_application_stage_outcome fails closed with 404)', async () => {
    await assert.rejects(
      () =>
        handleUpdateApplicationStageOutcome(contextB, {
          stageId: stageA.id,
          outcome: 'FAILED',
          feedback: 'Tampered failure',
        }),
      NotFoundError
    );

    // Verify Stage A outcome was not modified
    const [stageAfter] = await db
      .select()
      .from(applicationStages)
      .where(eq(applicationStages.id, stageA.id));
    assert.strictEqual(stageAfter.outcome, 'PASSED');
  });

  it('Scenario 7: Cross-Tenant Document Attachment (MCP attach_application_document fails closed with 404)', async () => {
    await assert.rejects(
      () =>
        handleAttachApplicationDocument(contextB, {
          applicationId: applicationA.id,
          documentType: 'TAILORED_RESUME',
          title: 'Rogue Resume Injection',
          content: { rogue: true },
        }),
      NotFoundError
    );

    // Verify no document was attached to applicationA
    const docs = await db
      .select()
      .from(tailoredDocuments)
      .where(
        and(
          eq(tailoredDocuments.applicationId, applicationA.id),
          eq(tailoredDocuments.title, 'Rogue Resume Injection')
        )
      );
    assert.strictEqual(docs.length, 0);
  });

  it('Scenario 8: Cross-Tenant Delete (Service deleteApplication fails closed with 404; records intact)', async () => {
    await assert.rejects(
      () => trackingService.deleteApplication(contextB, applicationA.id),
      NotFoundError
    );

    // Verify applicationA, stageA, docA remain intact in DB
    const [appCheck] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, applicationA.id));
    assert.ok(appCheck);

    const [stageCheck] = await db
      .select()
      .from(applicationStages)
      .where(eq(applicationStages.id, stageA.id));
    assert.ok(stageCheck);

    const [docCheck] = await db
      .select()
      .from(tailoredDocuments)
      .where(eq(tailoredDocuments.id, docA.id));
    assert.ok(docCheck);
  });

  it('Scenario 9: Cross-Tenant Candidate Analytics Summary (getCandidateAnalytics throws 404)', async () => {
    await assert.rejects(
      () => analyticsService.getCandidateAnalytics(contextB, candidateA.id),
      NotFoundError
    );
  });

  it('Scenario 10: Cross-Tenant Score Progression Correlation (getScoreProgressionCorrelation throws 404)', async () => {
    await assert.rejects(
      () => analyticsService.getScoreProgressionCorrelation(contextB, candidateA.id),
      NotFoundError
    );
  });

  it('Scenario 11: Cross-Tenant Skill Gap Analytics (getSkillGapFrequency throws 404)', async () => {
    await assert.rejects(
      () => analyticsService.getSkillGapFrequency(contextB, candidateA.id),
      NotFoundError
    );
  });

  it('Scenario 12: Client-Injected Tenant ID in Payload (Strictly rejected at MCP schema boundary and overridden by context at service layer)', async () => {
    // 1. MCP transport schema boundary: Rejects injected tenantId
    await assert.rejects(
      () =>
        handleTrackJobApplication(contextB, {
          companyName: 'Spoof Guarded Corp',
          jobTitle: 'Spoof Tested Engineer',
          tenantId: tenantA.id, // Client attempts to force insertion into Tenant A
        }),
      (err) => err.name === 'ZodError' && err.message.includes('tenantId')
    );

    // 2. Service boundary: If called directly with payload containing tenantId, uses context.tenantId
    const res = await trackingService.createApplication(contextB, candidateB.id, {
      companyName: 'Spoof Guarded Corp',
      jobTitle: 'Spoof Tested Engineer',
      tenantId: tenantA.id,
    });

    assert.ok(res);
    assert.strictEqual(res.tenantId, tenantB.id, 'Must bind to context.tenantId');

    const [createdInA] = await db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenantA.id),
          eq(jobApplications.companyName, 'Spoof Guarded Corp')
        )
      );
    assert.strictEqual(createdInA, undefined, 'Must not create record in Tenant A');
  });

  it('Scenario 13: Cross-Tenant Stage Outcome with Spoofed Tenant (Rejected at MCP boundary and fails with 404 at service layer)', async () => {
    // 1. MCP boundary: Rejects unrecognized tenantId argument
    await assert.rejects(
      () =>
        handleUpdateApplicationStageOutcome(contextB, {
          stageId: stageA.id,
          tenantId: tenantA.id,
          outcome: 'FAILED',
        }),
      (err) => err.name === 'ZodError' && err.message.includes('tenantId')
    );

    // 2. Service boundary: Direct call with contextB on stageA throws NotFoundError
    await assert.rejects(
      () => trackingService.updateStageOutcome(contextB, stageA.id, 'FAILED'),
      NotFoundError
    );

    const [stageAfter] = await db
      .select()
      .from(applicationStages)
      .where(eq(applicationStages.id, stageA.id));
    assert.strictEqual(stageAfter.outcome, 'PASSED');
  });

  it('Scenario 14: Cascade Deletion Isolation (Deleting Tenant A application preserves Tenant B records)', async () => {
    // Delete Tenant A application legitimately
    const delRes = await trackingService.deleteApplication(contextA, applicationA.id);
    assert.strictEqual(delRes.deleted, true);

    // Verify Tenant A records removed
    const [appACheck] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, applicationA.id));
    assert.strictEqual(appACheck, undefined);

    const stagesA = await db
      .select()
      .from(applicationStages)
      .where(eq(applicationStages.applicationId, applicationA.id));
    assert.strictEqual(stagesA.length, 0);

    const docsA = await db
      .select()
      .from(tailoredDocuments)
      .where(eq(tailoredDocuments.applicationId, applicationA.id));
    assert.strictEqual(docsA.length, 0);

    // Verify Tenant B records remain 100% intact and unaffected
    const [appBCheck] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, applicationB.id));
    assert.ok(appBCheck);
    assert.strictEqual(appBCheck.companyName, 'Beta Labs');

    const [stageBCheck] = await db
      .select()
      .from(applicationStages)
      .where(eq(applicationStages.id, stageB.id));
    assert.ok(stageBCheck);
    assert.strictEqual(stageBCheck.title, 'Beta Recruiter Call');

    const [docBCheck] = await db
      .select()
      .from(tailoredDocuments)
      .where(eq(tailoredDocuments.id, docB.id));
    assert.ok(docBCheck);
    assert.strictEqual(docBCheck.title, 'Beta Cover Letter v1');
  });
});
