/**
 * @file Unit Regression Suite: Job Application Submission Truth & Anti-Fabrication (P14-005AZ)
 *
 * Validates:
 * 1. Greenhouse submission without real integration returns HANDOFF_READY, never SUBMITTED.
 * 2. No fake SUB-* reference is generated for unintegrated portals.
 * 3. HANDOFF_READY contains the official application URL and manual handoff kit.
 * 4. Prepared package, resume, cover letter, and answers are preserved in handoff kit.
 * 5. A true external success path returns SUBMITTED when a real adapter is configured.
 * 6. Human approval ticket is strictly required (missing, expired, or replayed ticket is rejected).
 * 7. Status reporting clearly distinguishes Career Hub tracking status from external submission state.
 * 8. Zero database mutations to historical application (0fe0cce0-dd5f-43e8-91fb-e8e8b2b4158a).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, candidates, jobApplications } from '../../src/db/schema.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { createCareerMcpServer } from '../../src/mcp/server.js';
import { AuthorizationError, ConflictError } from '../../src/errors/index.js';

describe('Job Application Submission Truth Regression Suite (P14-005AZ)', () => {
  const createdTenantIds = [];
  let tenantId;
  let userId;
  let candidateId;
  let workflowService;
  let authContext;

  const mockJob = {
    id: crypto.randomUUID(),
    company: 'Vercel',
    title: 'Software Engineer, Backend',
    location: 'Remote - United States',
    description:
      'Build and maintain scalable backend systems using Node.js, PostgreSQL, and TypeScript.',
    source: 'GREENHOUSE',
    applicationUrl: 'https://job-boards.greenhouse.io/vercel/jobs/5430088004',
    sourceUrl: 'https://boards.greenhouse.io/vercel',
    requirements: ['Node.js', 'PostgreSQL', 'TypeScript'],
    responsibilities: ['Build backend systems'],
    skills: ['Node.js', 'PostgreSQL', 'TypeScript'],
    retrievedAt: new Date().toISOString(),
  };

  const historicalAppId = '0fe0cce0-dd5f-43e8-91fb-e8e8b2b4158a';

  before(async () => {
    tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);
    userId = crypto.randomUUID();
    candidateId = crypto.randomUUID();

    await db.insert(tenants).values({
      id: tenantId,
      name: 'Truth Submission Tenant',
      slug: `truth-sub-${Date.now()}`,
      tier: 'PRO',
    });

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: `truth-candidate-${Date.now()}@example.test`,
      displayName: 'Truth Seeker',
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    await db.insert(candidates).values({
      id: candidateId,
      tenantId,
      userId,
      displayName: 'Truth Seeker',
      canonicalEmail: `truth-candidate-${Date.now()}@example.test`,
    });

    workflowService = new JobApplicationWorkflowService({ database: db });

    authContext = {
      tenantId,
      userId,
      role: 'MEMBER',
      tokenScopes: ['career:read', 'career:write'],
    };
  });

  after(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
    await closeDatabase();
  });

  it('1. Greenhouse without real integration returns HANDOFF_READY, never SUBMITTED', async () => {
    const pkg = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: mockJob,
      answers: { whyUs: 'I love developer tools' },
    });

    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'chatgpt-web',
      jobId: mockJob.id,
      destinationUrl: mockJob.applicationUrl,
      packageHash: pkg.packageHash,
    });

    const result = await workflowService.submitJobApplication({
      tenantId,
      userId,
      candidateId,
      approvalTicketId: ticket.ticketId,
      packageHash: pkg.packageHash,
      destinationUrl: mockJob.applicationUrl,
      applicationPackage: pkg,
    });

    assert.strictEqual(
      result.status,
      'HANDOFF_READY',
      'Must be HANDOFF_READY without real adapter'
    );
    assert.notStrictEqual(result.status, 'SUBMITTED', 'Must NEVER falsely claim SUBMITTED');
    assert.strictEqual(result.portalType, 'GREENHOUSE');
    assert.ok(result.applicationId, 'Must track local application ID');
  });

  it('2. No fake SUB-* reference is generated for unintegrated portal', async () => {
    const pkg = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: mockJob,
    });

    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'chatgpt-web',
      jobId: mockJob.id,
      destinationUrl: mockJob.applicationUrl,
      packageHash: pkg.packageHash,
    });

    const result = await workflowService.submitJobApplication({
      tenantId,
      userId,
      candidateId,
      approvalTicketId: ticket.ticketId,
      packageHash: pkg.packageHash,
      destinationUrl: mockJob.applicationUrl,
      applicationPackage: pkg,
    });

    assert.strictEqual(result.externalReference, undefined, 'Must not fabricate externalReference');
    assert.doesNotMatch(
      JSON.stringify(result),
      /SUB-[0-9A-F]{8}/,
      'Must not generate fake SUB-* reference'
    );
  });

  it('3. HANDOFF_READY contains the official application URL', async () => {
    const pkg = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: mockJob,
    });

    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'chatgpt-web',
      jobId: mockJob.id,
      destinationUrl: mockJob.applicationUrl,
      packageHash: pkg.packageHash,
    });

    const result = await workflowService.submitJobApplication({
      tenantId,
      userId,
      candidateId,
      approvalTicketId: ticket.ticketId,
      packageHash: pkg.packageHash,
      destinationUrl: mockJob.applicationUrl,
      applicationPackage: pkg,
    });

    assert.strictEqual(result.destinationUrl, mockJob.applicationUrl);
    assert.strictEqual(result.manualHandoffKit.directPortalUrl, mockJob.applicationUrl);
  });

  it('4. manualHandoffKit preserves resume, cover letter, and suggested answers', async () => {
    const pkg = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: mockJob,
      answers: { workAuth: 'Authorized in US', noticePeriod: '2 weeks' },
    });

    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'chatgpt-web',
      jobId: mockJob.id,
      destinationUrl: mockJob.applicationUrl,
      packageHash: pkg.packageHash,
    });

    const result = await workflowService.submitJobApplication({
      tenantId,
      userId,
      candidateId,
      approvalTicketId: ticket.ticketId,
      packageHash: pkg.packageHash,
      destinationUrl: mockJob.applicationUrl,
      applicationPackage: pkg,
    });

    const kit = result.manualHandoffKit;
    assert.ok(kit, 'Handoff kit must exist');
    assert.ok(kit.resumeMarkdown.length > 50, 'Resume markdown must be populated');
    assert.ok(kit.coverLetterMarkdown.length > 50, 'Cover letter markdown must be populated');
    assert.strictEqual(kit.suggestedAnswers.workAuth, 'Authorized in US');
    assert.strictEqual(kit.suggestedAnswers.noticePeriod, '2 weeks');
    assert.ok(kit.checklist.length >= 3, 'Checklist must guide candidate submission');
  });

  it('5. A true external success path returns SUBMITTED when a real adapter exists', async () => {
    const mockRealAdapter = {
      canSubmit: (url) => url.includes('partner-portal.com'),
      submit: async ({ _destinationUrl, applicationPackage }) => ({
        status: 'SUBMITTED',
        externalReference: 'REAL-EXT-VERCEL-42001',
        portalType: 'GREENHOUSE_DIRECT_API',
        message: `Application transmitted to ${applicationPackage.targetJob.company} via verified Greenhouse API key.`,
      }),
    };

    const serviceWithAdapter = new JobApplicationWorkflowService({
      database: db,
      submissionAdapters: [mockRealAdapter],
    });

    const partnerJob = {
      ...mockJob,
      applicationUrl: 'https://partner-portal.com/greenhouse/apply/123',
    };

    const pkg = await serviceWithAdapter.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: partnerJob,
    });

    const ticket = await serviceWithAdapter.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'chatgpt-web',
      jobId: partnerJob.id,
      destinationUrl: partnerJob.applicationUrl,
      packageHash: pkg.packageHash,
    });

    const result = await serviceWithAdapter.submitJobApplication({
      tenantId,
      userId,
      candidateId,
      approvalTicketId: ticket.ticketId,
      packageHash: pkg.packageHash,
      destinationUrl: partnerJob.applicationUrl,
      applicationPackage: pkg,
    });

    assert.strictEqual(
      result.status,
      'SUBMITTED',
      'Must return SUBMITTED when real adapter succeeds'
    );
    assert.strictEqual(
      result.externalReference,
      'REAL-EXT-VERCEL-42001',
      'Must surface real externalReference'
    );
    assert.strictEqual(result.portalType, 'GREENHOUSE_DIRECT_API');
    assert.match(result.message, /verified Greenhouse API key/);
  });

  it('6. Human approval gate is strictly required and enforced', async () => {
    const pkg = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: mockJob,
    });

    // A. Missing approval ticket
    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId,
          approvalTicketId: null,
          packageHash: pkg.packageHash,
          destinationUrl: mockJob.applicationUrl,
          applicationPackage: pkg,
        });
      },
      (err) => {
        assert.ok(err instanceof AuthorizationError);
        assert.match(err.message, /APPROVAL_REQUIRED/);
        return true;
      }
    );

    // B. Replayed approval ticket
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'chatgpt-web',
      jobId: mockJob.id,
      destinationUrl: mockJob.applicationUrl,
      packageHash: pkg.packageHash,
    });

    // First use: succeeds
    await workflowService.submitJobApplication({
      tenantId,
      userId,
      candidateId,
      approvalTicketId: ticket.ticketId,
      packageHash: pkg.packageHash,
      destinationUrl: mockJob.applicationUrl,
      applicationPackage: pkg,
    });

    // Replay attempt: rejected
    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId,
          approvalTicketId: ticket.ticketId,
          packageHash: pkg.packageHash,
          destinationUrl: mockJob.applicationUrl,
          applicationPackage: pkg,
        });
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.match(err.message, /already been consumed/);
        return true;
      }
    );
  });

  it('7. Status reporting clearly distinguishes Career Hub tracking from external submission', async () => {
    const pkg = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: mockJob,
    });

    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'chatgpt-web',
      jobId: mockJob.id,
      destinationUrl: mockJob.applicationUrl,
      packageHash: pkg.packageHash,
    });

    const subResult = await workflowService.submitJobApplication({
      tenantId,
      userId,
      candidateId,
      approvalTicketId: ticket.ticketId,
      packageHash: pkg.packageHash,
      destinationUrl: mockJob.applicationUrl,
      applicationPackage: pkg,
    });

    const server = createCareerMcpServer({ deps: { database: db } });
    const statusTool = server.registeredTools.get('get_application_submission_status');

    const report = await statusTool.handler(authContext, {
      applicationId: subResult.applicationId,
    });

    assert.strictEqual(
      report.status,
      'HANDOFF_READY',
      'External submission state must be HANDOFF_READY'
    );
    assert.strictEqual(report.trackingStatus, 'SAVED', 'Career Hub internal state must be SAVED');
    assert.strictEqual(report.externalReference, null, 'No externalReference exists');
    assert.strictEqual(
      report.appliedAt,
      null,
      'appliedAt timestamp is null until user submits externally'
    );
  });

  it('8. Verifies no unintended database mutations occur on historical submission record', async () => {
    const [historical] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, historicalAppId))
      .limit(1);

    assert.ok(historical, 'Historical application must exist');
    assert.strictEqual(
      historical.status,
      'APPLIED',
      'Historical record status must remain APPLIED'
    );
    assert.strictEqual(historical.companyName, 'Vercel');
    assert.strictEqual(historical.jobTitle, 'Software Engineer, Backend');
    assert.strictEqual(
      historical.notes,
      'Application prepared via Career Hub. Package Hash: 9ac027780d032859fdcf2097e0d3b57240f4fe8d993bcd1ee3901efff99ef191'
    );
  });
});
