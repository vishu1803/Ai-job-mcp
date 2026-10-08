import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  jobApplications,
  applicationPackages,
  applicationApprovalTickets,
} from '../../src/db/schema.js';
import {
  JobApplicationWorkflowService,
  signApplicationTicket,
  computeApplicationPackageHash,
} from '../../src/services/job-application-workflow.service.js';
import { applicationExecutionPayload } from '../../src/domain/job/application-package-identity.js';
import { registerJobWorkflowTools } from '../../src/mcp/tools/job-workflow-tools.js';
import { JOB_WORKFLOW_TOOL_DEFINITIONS } from '../../src/domain/mcp/job-workflow-tools.schemas.js';
import { buildApp } from '../../src/app.js';
import { createSession, generateCsrfToken } from '../../src/security/session.service.js';

describe('ISSUE-02 durable approved-content execution boundary', () => {
  let app;
  const tenantId = crypto.randomUUID(),
    userId = crypto.randomUUID(),
    candidateId = crypto.randomUUID();
  const foreignTenantId = crypto.randomUUID(),
    foreignUserId = crypto.randomUUID(),
    foreignCandidateId = crypto.randomUUID();
  const destinationUrl = 'https://employer.example.test/apply/1';
  const quiet = {
    info() {},
    warn() {},
    error() {},
    child() {
      return this;
    },
  };

  before(async () => {
    for (const [tid, uid, cid] of [
      [tenantId, userId, candidateId],
      [foreignTenantId, foreignUserId, foreignCandidateId],
    ]) {
      await db
        .insert(tenants)
        .values({ id: tid, name: 'ISSUE-02 fixture', slug: `issue02-${tid}` });
      await db.insert(users).values({
        id: uid,
        tenantId: tid,
        email: `${uid}@example.test`,
        displayName: 'ISSUE-02 User',
        role: 'MEMBER',
        status: 'ACTIVE',
      });
      await db
        .insert(candidates)
        .values({ id: cid, tenantId: tid, userId: uid, displayName: 'Reviewed Candidate' });
    }
  });
  after(async () => {
    if (app) await app.close();
    try {
      await db.delete(tenants).where(inArray(tenants.id, [tenantId, foreignTenantId]));
    } finally {
      await closeDatabase();
    }
  });

  async function fixture({ adapter = true, method = 'submitOrHandoff' } = {}) {
    const applicationId = crypto.randomUUID();
    const pkg = {
      candidateId,
      candidateName: 'Reviewed Candidate',
      candidateEmail: 'reviewed@example.test',
      candidatePhone: '111',
      targetJob: {
        id: applicationId,
        title: 'Engineer',
        company: 'Employer',
        applicationUrl: destinationUrl,
        source: 'MANUAL',
        description: 'Reviewed job',
        retrievedAt: new Date().toISOString(),
      },
      tailoredResume: {
        title: 'Resume',
        markdownContent: 'Resume A',
        contentHash: 'a'.repeat(64),
        fitScore: 80,
      },
      coverLetter: {
        title: 'Cover letter',
        markdownContent: 'Letter A',
        contentHash: 'b'.repeat(64),
      },
      verifiedSkills: [],
      claimedSkills: [],
      portfolioLinks: [],
      answers: { eligibility: 'A' },
      preparedAt: new Date().toISOString(),
      candidate: { contact: { email: 'reviewed@example.test' } },
      attachments: [{ name: 'approved.txt', contentHash: 'c'.repeat(64) }],
      portalFields: { consent: true },
      metadata: { source: 'reviewed' },
    };
    pkg.packageHash = computeApplicationPackageHash(pkg);
    await db.insert(jobApplications).values({
      id: applicationId,
      tenantId,
      candidateId,
      companyName: 'Employer',
      jobTitle: 'Engineer',
      jobUrl: destinationUrl,
      status: 'SAVED',
    });
    const [row] = await db
      .insert(applicationPackages)
      .values({
        tenantId,
        candidateId,
        applicationId,
        packageHash: pkg.packageHash,
        packagePayload: pkg,
        version: 1,
      })
      .returning();
    const executed = [];
    let regenerations = 0;
    const service = new JobApplicationWorkflowService({
      database: db,
      logger: quiet,
      portalAdapterRegistry: {
        resolve: () =>
          adapter
            ? {
                [method]: async (ctx) => {
                  executed.push(ctx.applicationPackage);
                  return { status: 'HANDOFF_READY', portalType: 'TEST', finalSubmitBlocked: true };
                },
              }
            : null,
      },
      applicationHandoffService: {
        async buildApplicationHandoffKit() {
          regenerations++;
          throw new Error('Post-approval document regeneration is forbidden');
        },
      },
    });
    const approvalParams = {
      tenantId,
      userId,
      candidateId,
      applicationId,
      jobId: pkg.targetJob.id,
      destinationUrl,
      packageHash: pkg.packageHash,
      packageVersion: 1,
    };
    const approve = () => service.requestApplicationApproval(approvalParams);
    const submit = (ticket, extra = {}) =>
      service.submitJobApplication({
        tenantId,
        userId,
        candidateId,
        approvalTicketId: ticket.ticketId,
        packageHash: ticket.packageHash,
        destinationUrl,
        ...extra,
      });
    return {
      service,
      pkg,
      row,
      executed,
      approvalParams,
      approve,
      submit,
      regenerations: () => regenerations,
    };
  }

  for (const method of ['submitOrHandoff', 'submit']) {
    it(`executes the approved snapshot through ${method}, not caller objects`, async () => {
      const f = await fixture({ method });
      const ticket = await f.approve();
      await f.submit(ticket, { applicationPackage: f.pkg });
      assert.deepEqual(f.executed[0], {
        ...applicationExecutionPayload(f.pkg),
        applicationId: f.row.applicationId,
        packageVersion: 1,
        packageHash: ticket.packageHash,
      });
      assert.notEqual(f.executed[0], f.pkg);
      assert.ok(Object.isFrozen(f.executed[0].answers));
      assert.throws(() => {
        f.executed[0].answers.eligibility = 'B';
      }, TypeError);
    });
  }

  const mutations = {
    resume: (p) => {
      p.tailoredResume.markdownContent = 'B';
    },
    coverLetter: (p) => {
      p.coverLetter.markdownContent = 'B';
    },
    answers: (p) => {
      p.answers.eligibility = 'B';
    },
    contact: (p) => {
      p.candidatePhone = '999';
      p.candidate.contact.email = 'attacker@example.test';
    },
    attachments: (p) => {
      p.attachments[0].contentHash = 'f'.repeat(64);
    },
    portalFields: (p) => {
      p.portalFields.consent = false;
    },
    metadata: (p) => {
      p.metadata.source = 'B';
    },
    structuredResume: (p) => {
      p.structuredResume = { experience: ['unapproved B'] };
    },
    artifactUrl: (p) => {
      p.artifacts = { resume: { url: 'https://attacker.example.test/b.pdf' } };
    },
    jobDestination: (p) => {
      p.targetJob.applicationUrl = 'https://attacker.example.test/apply';
    },
    employer: (p) => {
      p.targetJob.company = 'Attacker';
    },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    it(`A approved, B supplied with A's hash: ${name} cannot reach execution`, async () => {
      const f = await fixture();
      const ticket = await f.approve();
      const attacker = structuredClone(f.pkg);
      mutate(attacker);
      assert.equal(attacker.packageHash, ticket.packageHash);
      await f.submit(ticket, { applicationPackage: attacker });
      assert.deepEqual(
        applicationExecutionPayload(f.executed[0]),
        applicationExecutionPayload(f.pkg)
      );
    });
  }

  it('manual handoff uses only approved text/answers and never regenerates from live profile', async () => {
    const f = await fixture({ adapter: false });
    const ticket = await f.approve();
    const attacker = structuredClone(f.pkg);
    attacker.tailoredResume.markdownContent = 'B';
    attacker.answers.eligibility = 'B';
    const result = await f.submit(ticket, { applicationPackage: attacker });
    assert.equal(result.manualHandoffKit.resumeMarkdown, 'Resume A');
    assert.equal(result.manualHandoffKit.coverLetterMarkdown, 'Letter A');
    assert.deepEqual(result.manualHandoffKit.suggestedAnswers, { eligibility: 'A' });
    assert.equal(f.regenerations(), 0);
  });

  it('loads the original approved snapshot after restart and later ledger mutation', async () => {
    const f = await fixture();
    const ticket = await f.approve();
    const changed = structuredClone(f.pkg);
    changed.tailoredResume.markdownContent = 'B';
    await db
      .update(applicationPackages)
      .set({ packagePayload: changed })
      .where(eq(applicationPackages.id, f.row.id));
    const restarted = new JobApplicationWorkflowService({
      database: db,
      logger: quiet,
      portalAdapterRegistry: {
        resolve: () => ({
          async submitOrHandoff(ctx) {
            f.executed.push(ctx.applicationPackage);
            return { status: 'HANDOFF_READY' };
          },
        }),
      },
    });
    await restarted.submitJobApplication({
      tenantId,
      userId,
      candidateId,
      approvalTicketId: ticket.ticketId,
      packageHash: ticket.packageHash,
      destinationUrl,
    });
    assert.equal(f.executed[0].tailoredResume.markdownContent, 'Resume A');
  });

  it('changed answers after blocked handoff create a new version without changing the approved snapshot', async () => {
    const f = await fixture();
    const ticket = await f.approve();
    await f.submit(ticket);
    const changed = structuredClone(f.pkg);
    changed.answers.eligibility = 'B';
    changed.packageHash = computeApplicationPackageHash(changed);
    const version = await f.service.applicationTrackingService.recordApplicationPackage(
      { tenantId, userId, role: 'MEMBER' },
      f.row.applicationId,
      changed
    );
    assert.equal(version.version, 2);
    assert.notEqual(version.packageHash, ticket.packageHash);
    const stored = await f.service.getApprovalTicket({ tenantId, ticketId: ticket.ticketId });
    assert.equal(stored.metadata.approvalTarget.applicationPackage.answers.eligibility, 'A');
  });
  for (const submitted of [false, true]) {
    it(`does not permit version changes for ${submitted ? 'actual submission' : 'unverified staging'}`, async () => {
      const f = await fixture();
      await db
        .update(jobApplications)
        .set({
          status: 'HANDOFF_READY',
          appliedAt: submitted ? new Date() : null,
          metadata: submitted
            ? { finalSubmitBlocked: true, externalSubmissionState: 'SUBMITTED' }
            : {},
        })
        .where(eq(jobApplications.id, f.row.applicationId));
      const changed = structuredClone(f.pkg);
      changed.answers.eligibility = 'B';
      changed.packageHash = computeApplicationPackageHash(changed);
      await assert.rejects(
        f.service.applicationTrackingService.recordApplicationPackage(
          { tenantId, userId, role: 'MEMBER' },
          f.row.applicationId,
          changed
        ),
        { code: 'CONFLICT' }
      );
    });
  }

  it('rejects unpersisted client hashes instead of minting arbitrary approval identities', async () => {
    const f = await fixture();
    await assert.rejects(
      f.service.requestApplicationApproval({ ...f.approvalParams, packageHash: 'f'.repeat(64) }),
      { code: 'APPROVAL_PACKAGE_NOT_FOUND' }
    );
  });
  it('rejects foreign tenant package lookup', async () => {
    const f = await fixture();
    await assert.rejects(
      f.service.requestApplicationApproval({
        ...f.approvalParams,
        tenantId: foreignTenantId,
        userId: foreignUserId,
        candidateId: foreignCandidateId,
      }),
      { code: 'APPROVAL_PACKAGE_NOT_FOUND' }
    );
  });
  it('rejects foreign user approval creation', async () => {
    const f = await fixture();
    await assert.rejects(
      f.service.requestApplicationApproval({ ...f.approvalParams, userId: foreignUserId }),
      { code: 'FORBIDDEN' }
    );
  });
  for (const key of ['applicationId', 'packageVersion', 'jobId', 'destinationUrl']) {
    it(`rejects mismatched approval selector ${key}`, async () => {
      const f = await fixture();
      const invalid = {
        applicationId: crypto.randomUUID(),
        packageVersion: 999,
        jobId: 'other',
        destinationUrl: 'https://attacker.example.test/apply',
      };
      await assert.rejects(
        f.service.requestApplicationApproval({ ...f.approvalParams, [key]: invalid[key] })
      );
    });
  }
  it('rejects corrupt/legacy ledger hashes and requires new preparation', async () => {
    const f = await fixture();
    const changed = structuredClone(f.pkg);
    changed.answers.eligibility = 'B';
    await db
      .update(applicationPackages)
      .set({ packagePayload: changed })
      .where(eq(applicationPackages.id, f.row.id));
    await assert.rejects(f.approve(), { code: 'APPROVAL_PACKAGE_INTEGRITY' });
  });
  it('rejects a package with no persisted payload', async () => {
    const f = await fixture();
    await db
      .update(applicationPackages)
      .set({ packagePayload: null })
      .where(eq(applicationPackages.id, f.row.id));
    await assert.rejects(f.approve(), { code: 'APPROVAL_PACKAGE_NOT_FOUND' });
  });
  it('requires an explicit application selector when hash lookup is ambiguous', async () => {
    const f = await fixture();
    const otherApplicationId = crypto.randomUUID();
    await db.insert(jobApplications).values({
      id: otherApplicationId,
      tenantId,
      candidateId,
      companyName: 'Employer',
      jobTitle: 'Engineer',
      jobUrl: `${destinationUrl}?duplicate=1`,
      status: 'SAVED',
    });
    await db.insert(applicationPackages).values({
      tenantId,
      candidateId,
      applicationId: otherApplicationId,
      packageHash: f.pkg.packageHash,
      packagePayload: f.pkg,
      version: 1,
    });
    await assert.rejects(
      f.service.requestApplicationApproval({ ...f.approvalParams, applicationId: undefined }),
      { code: 'APPROVAL_PACKAGE_NOT_FOUND' }
    );
    assert.ok((await f.approve()).ticketId);
  });
  it('fails closed if the durable snapshot cannot be written', async () => {
    const f = await fixture();
    f.service.db = new Proxy(db, {
      get(target, key) {
        if (key === 'transaction')
          return callback => target.transaction(tx => callback(new Proxy(tx, {
            get(transaction, method) {
              if (method === 'insert') return () => { throw new Error('SNAPSHOT_WRITE_UNAVAILABLE'); };
              const value = Reflect.get(transaction, method);
              return typeof value === 'function' ? value.bind(transaction) : value;
            },
          })));
        return Reflect.get(target, key);
      },
    });
    await assert.rejects(f.approve(), /SNAPSHOT_WRITE_UNAVAILABLE/);
    assert.equal(f.executed.length, 0);
  });
  it('fails closed if durable snapshot cannot be read, even after prior successful read', async () => {
    const f = await fixture();
    const ticket = await f.approve();
    await f.service.getApprovalTicket({ tenantId, ticketId: ticket.ticketId });
    f.service.db = {
      select() {
        throw new Error('SNAPSHOT_READ_UNAVAILABLE');
      },
    };
    await assert.rejects(f.submit(ticket), /SNAPSHOT_READ_UNAVAILABLE/);
    assert.equal(f.executed.length, 0);
  });
  it('rejects legacy hash-only tickets even with a valid legacy signature', async () => {
    const f = await fixture();
    const ticket = await f.approve();
    await db
      .update(applicationApprovalTickets)
      .set({ metadata: {}, signature: signApplicationTicket(ticket) })
      .where(eq(applicationApprovalTickets.id, ticket.ticketId));
    await assert.rejects(f.submit(ticket), { code: 'APPROVAL_SNAPSHOT_REQUIRED' });
    assert.equal(f.executed.length, 0);
  });
  it('changing both snapshot content and its computed hash cannot forge approval', async () => {
    const f = await fixture();
    const ticket = await f.approve();
    const [row] = await db
      .select()
      .from(applicationApprovalTickets)
      .where(eq(applicationApprovalTickets.id, ticket.ticketId));
    row.metadata.approvalTarget.applicationPackage.answers.eligibility = 'B';
    const hash = computeApplicationPackageHash(row.metadata.approvalTarget.applicationPackage);
    await db
      .update(applicationApprovalTickets)
      .set({ metadata: row.metadata, packageHash: hash })
      .where(eq(applicationApprovalTickets.id, ticket.ticketId));
    await assert.rejects(f.submit(ticket, { packageHash: hash }), {
      code: 'INVALID_TICKET_SIGNATURE',
    });
    assert.equal(f.executed.length, 0);
  });

  for (const change of [
    'snapshot',
    'packageId',
    'packageVersion',
    'applicationId',
    'destinationUrl',
    'packageHash',
  ]) {
    it(`rejects durable approval tampering: ${change}`, async () => {
      const f = await fixture();
      const ticket = await f.approve();
      const [row] = await db
        .select()
        .from(applicationApprovalTickets)
        .where(eq(applicationApprovalTickets.id, ticket.ticketId));
      const updates = {};
      if (change === 'snapshot') {
        row.metadata.approvalTarget.applicationPackage.answers.eligibility = 'B';
        updates.metadata = row.metadata;
      } else if (change === 'packageId') {
        row.metadata.approvalTarget.packageId = crypto.randomUUID();
        updates.metadata = row.metadata;
      } else
        updates[change] = {
          packageVersion: 99,
          applicationId: crypto.randomUUID(),
          destinationUrl: 'https://attacker.example.test/apply',
          packageHash: 'f'.repeat(64),
        }[change];
      // Valid FK when testing application identity substitution.
      if (change === 'applicationId') updates.applicationId = (await fixture()).row.applicationId;
      await db
        .update(applicationApprovalTickets)
        .set(updates)
        .where(eq(applicationApprovalTickets.id, ticket.ticketId));
      await assert.rejects(f.submit(ticket));
      assert.equal(f.executed.length, 0);
    });
  }
  for (const [key, value] of [
    ['tenantId', foreignTenantId],
    ['userId', foreignUserId],
    ['candidateId', foreignCandidateId],
  ]) {
    it(`rejects cross-context submission ${key}`, async () => {
      const f = await fixture();
      const ticket = await f.approve();
      await assert.rejects(f.submit(ticket, { [key]: value }));
      assert.equal(f.executed.length, 0);
    });
  }

  it('extension HTTP preview loads persisted content rather than caller package B', async () => {
    const f = await fixture();
    app ||= await buildApp();
    const session = await createSession(db, { tenantId, userId });
    const supplied = structuredClone(f.pkg);
    supplied.candidateName = 'Unapproved B';
    supplied.answers.eligibility = 'B';
    const response = await app.inject({
      method: 'POST',
      url: '/api/extension/preview-package',
      headers: { authorization: `Bearer ${session.rawToken}` },
      payload: {
        applicationId: f.row.applicationId,
        packageHash: f.pkg.packageHash,
        applicationPackage: supplied,
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    const preview = response.json();
    assert.equal(preview.structuredPreview.candidateInfo.name, 'Reviewed Candidate');
    assert.deepEqual(preview.approvalContent, applicationExecutionPayload(f.pkg));
  });

  it('web HTTP approval and manual submission cannot execute a supplied package B', async () => {
    const f = await fixture();
    app ||= await buildApp();
    const session = await createSession(db, { tenantId, userId });
    const headers = {
      cookie: `career_hub_session=${session.rawToken}`,
      'x-csrf-token': generateCsrfToken(session.sessionId),
      accept: 'application/json',
    };
    const approval = await app.inject({
      method: 'POST',
      url: `/applications/${f.row.applicationId}/apply/request-approval`,
      headers,
      payload: { destinationUrl, packageHash: f.pkg.packageHash, packageVersion: 1 },
    });
    assert.equal(approval.statusCode, 200, approval.body);
    const ticket = approval.json().ticket;
    const supplied = structuredClone(f.pkg);
    supplied.tailoredResume.markdownContent = 'Unapproved B';
    supplied.answers.eligibility = 'B';
    const submission = await app.inject({
      method: 'POST',
      url: `/applications/${f.row.applicationId}/apply/submit`,
      headers,
      payload: {
        approvalTicketId: ticket.ticketId,
        packageHash: ticket.packageHash,
        destinationUrl,
        applicationPackage: supplied,
      },
    });
    assert.equal(submission.statusCode, 200, submission.body);
    assert.equal(submission.json().submissionResult.manualHandoffKit.resumeMarkdown, 'Resume A');
    assert.equal(
      submission.json().submissionResult.manualHandoffKit.suggestedAnswers.eligibility,
      'A'
    );
    const replay = await app.inject({
      method: 'POST', url: `/applications/${f.row.applicationId}/apply/submit`, headers,
      payload: { approvalTicketId: ticket.ticketId, packageHash: ticket.packageHash, destinationUrl },
    });
    assert.equal(replay.statusCode, 409, replay.body);
    assert.equal(replay.json().error, 'CONFLICT');
  });

  it('MCP preview ignores caller modifications and approval/submission round-trip uses persisted content', async () => {
    const f = await fixture();
    const tools = new Map();
    registerJobWorkflowTools(
      {
        registerTool(definition, handler) {
          tools.set(definition.name, { definition, handler });
        },
      },
      { database: db, jobApplicationWorkflowService: f.service }
    );
    const context = {
      tenantId,
      userId,
      role: 'MEMBER',
      tokenScopes: ['career:read', 'career:write'],
    };
    const supplied = {
      ...f.pkg,
      applicationId: f.row.applicationId,
      packageVersion: 1,
      candidateName: 'Unreviewed B',
      answers: { eligibility: 'B' },
    };
    const preview = await tools
      .get('create_application_preview')
      .handler(context, { applicationPackage: supplied });
    assert.equal(preview.candidateInfo.name, 'Reviewed Candidate');
    assert.equal(preview.packageHash, computeApplicationPackageHash(f.pkg));
    assert.deepEqual(preview.approvalContent, applicationExecutionPayload(f.pkg));
    const ticket = await tools
      .get('request_application_approval')
      .handler(context, f.approvalParams);
    const submissionInput = JOB_WORKFLOW_TOOL_DEFINITIONS.submit_job_application.inputSchema.parse({
      approvalTicketId: ticket.ticketId,
      packageHash: ticket.packageHash,
      destinationUrl,
    });
    await tools.get('submit_job_application').handler(context, submissionInput);
    assert.equal(f.executed[0].answers.eligibility, 'A');
  });
});
