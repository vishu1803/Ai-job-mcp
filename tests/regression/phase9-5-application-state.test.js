/**
 * @file Regression Tests for Phase 9.5 — Application State Consistency
 *
 * Requirements:
 * 1. Explicit states: PREPARED, APPROVAL_PENDING, APPROVED, HANDOFF_READY, READY_FOR_FINAL_REVIEW, SUBMITTED, APPLIED, FAILED.
 * 2. READY_FOR_FINAL_REVIEW must NEVER be represented as APPLIED or SUBMITTED unless an actual authorized submission event has occurred.
 * 3. Because automatic final submission remains disabled, the expected terminal state for current automation is READY_FOR_FINAL_REVIEW, not APPLIED.
 * 4. Test every legal and illegal transition.
 * 5. Especially: READY_FOR_FINAL_REVIEW -> APPLIED/SUBMITTED must fail unless the explicit final submission event is authorized and actually executed.
 * 6. submitJobApplication with finalSubmitBlocked: true must persist READY_FOR_FINAL_REVIEW with appliedAt: null, NEVER APPLIED.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  jobApplications,
} from '../../src/db/schema.js';
import { eq, and } from 'drizzle-orm';
import {
  JobApplicationWorkflowStateEnum,
  JobApplicationWorkflowStateMachine,
  SubmissionStatusEnum,
} from '../../src/domain/job/job-workflow.schemas.js';
import {
  JobApplicationWorkflowService,
  signApplicationTicket,
} from '../../src/services/job-application-workflow.service.js';
import { ValidationError } from '../../src/errors/index.js';

describe('Phase 9.5 — Application State Consistency & State Machine Invariants', () => {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const candidateId = crypto.randomUUID();
  const applicationId = crypto.randomUUID();

  const jobId = 'job-senior-qa-905';
  const destinationUrl = 'https://boards.greenhouse.io/acme-corp/jobs/905';

  let workflowService;

  before(async () => {
    // Seed tenant, user, candidate
    await db.insert(tenants).values({
      id: tenantId,
      name: 'Phase 9.5 State Consistency Tenant',
      slug: `p95-tenant-${Date.now()}`,
      status: 'ACTIVE',
    });

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: `p95-user-${Date.now()}@example.com`,
      displayName: 'Phase 9.5 State Reviewer',
      role: 'MEMBER',
    });

    await db.insert(candidates).values({
      id: candidateId,
      tenantId,
      userId,
      displayName: 'P95 Candidate',
      canonicalEmail: 'p95-candidate@example.com',
    });

    workflowService = new JobApplicationWorkflowService({ db });
  });

  after(async () => {
    try {
      await db.delete(jobApplications).where(eq(jobApplications.tenantId, tenantId));
      await db.delete(candidates).where(eq(candidates.tenantId, tenantId));
      await db.delete(users).where(eq(users.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    } catch {
      // Best-effort cleanup
    }
    await closeDatabase();
  });

  describe('1. JobApplicationWorkflowStateMachine Unit Tests', () => {
    it('initializes to PREPARED by default', () => {
      const sm = new JobApplicationWorkflowStateMachine();
      assert.strictEqual(sm.state, 'PREPARED');
    });

    it('allows legal forward transitions: PREPARED -> APPROVAL_PENDING -> APPROVED -> READY_FOR_FINAL_REVIEW', () => {
      const sm = new JobApplicationWorkflowStateMachine('PREPARED');
      assert.strictEqual(sm.transition('APPROVAL_PENDING'), 'APPROVAL_PENDING');
      assert.strictEqual(sm.transition('APPROVED'), 'APPROVED');
      assert.strictEqual(sm.transition('READY_FOR_FINAL_REVIEW'), 'READY_FOR_FINAL_REVIEW');
    });

    it('allows legal handoff path: PREPARED -> HANDOFF_READY -> READY_FOR_FINAL_REVIEW', () => {
      const sm = new JobApplicationWorkflowStateMachine('PREPARED');
      assert.strictEqual(sm.transition('HANDOFF_READY'), 'HANDOFF_READY');
      assert.strictEqual(sm.transition('READY_FOR_FINAL_REVIEW'), 'READY_FOR_FINAL_REVIEW');
    });

    it('strictly forbids automated transition: READY_FOR_FINAL_REVIEW -> APPLIED without authorization', () => {
      const sm = new JobApplicationWorkflowStateMachine('READY_FOR_FINAL_REVIEW');
      assert.throws(
        () => sm.transition('APPLIED', { authorizedSubmissionExecuted: false }),
        (err) => {
          assert.strictEqual(err.name, 'ValidationError');
          assert.strictEqual(err.code, 'FORBIDDEN_AUTOMATED_SUBMIT');
          assert.match(err.message, /Automated final submission is disabled/i);
          return true;
        }
      );
    });

    it('strictly forbids automated transition: READY_FOR_FINAL_REVIEW -> SUBMITTED without authorization', () => {
      const sm = new JobApplicationWorkflowStateMachine('READY_FOR_FINAL_REVIEW');
      assert.throws(
        () => sm.transition('SUBMITTED'), // defaults to false
        (err) => {
          assert.strictEqual(err.name, 'ValidationError');
          assert.strictEqual(err.code, 'FORBIDDEN_AUTOMATED_SUBMIT');
          return true;
        }
      );
    });

    it('permits READY_FOR_FINAL_REVIEW -> SUBMITTED when authorizedSubmissionExecuted is explicitly true', () => {
      const sm = new JobApplicationWorkflowStateMachine('READY_FOR_FINAL_REVIEW');
      const newState = sm.transition('SUBMITTED', { authorizedSubmissionExecuted: true, reason: 'User confirmed final submission' });
      assert.strictEqual(newState, 'SUBMITTED');
      assert.strictEqual(sm.state, 'SUBMITTED');
    });

    it('permits READY_FOR_FINAL_REVIEW -> APPLIED when authorizedSubmissionExecuted is explicitly true', () => {
      const sm = new JobApplicationWorkflowStateMachine('READY_FOR_FINAL_REVIEW');
      const newState = sm.transition('APPLIED', { authorizedSubmissionExecuted: true, reason: 'User executed external submit' });
      assert.strictEqual(newState, 'APPLIED');
      assert.strictEqual(sm.state, 'APPLIED');
    });

    it('rejects illegal transition: PREPARED -> SUBMITTED (bypassing approval)', () => {
      const sm = new JobApplicationWorkflowStateMachine('PREPARED');
      assert.throws(
        () => sm.transition('SUBMITTED'),
        (err) => {
          assert.strictEqual(err.code, 'INVALID_STATE_TRANSITION');
          return true;
        }
      );
    });

    it('rejects illegal transition: APPROVAL_PENDING -> READY_FOR_FINAL_REVIEW (skipping approval)', () => {
      const sm = new JobApplicationWorkflowStateMachine('APPROVAL_PENDING');
      assert.throws(
        () => sm.transition('READY_FOR_FINAL_REVIEW'),
        (err) => {
          assert.strictEqual(err.code, 'INVALID_STATE_TRANSITION');
          return true;
        }
      );
    });

    it('rejects illegal transition: SUBMITTED -> PREPARED (terminal state)', () => {
      const sm = new JobApplicationWorkflowStateMachine('SUBMITTED');
      assert.throws(
        () => sm.transition('PREPARED'),
        (err) => {
          assert.strictEqual(err.code, 'INVALID_STATE_TRANSITION');
          return true;
        }
      );
    });

    it('allows retry transition: FAILED -> PREPARED', () => {
      const sm = new JobApplicationWorkflowStateMachine('FAILED');
      assert.strictEqual(sm.transition('PREPARED', { reason: 'User restarted workflow' }), 'PREPARED');
    });
  });

  describe('2. Database & Service Level State Transitions', () => {
    it('creates an application and transitions through lifecycle with DB persistence', async () => {
      // 1. Insert application in DB as PREPARED
      await db.insert(jobApplications).values({
        id: applicationId,
        tenantId,
        candidateId,
        companyName: 'Acme State Test Corp',
        jobTitle: 'Senior Systems Engineer',
        jobUrl: destinationUrl,
        status: 'PREPARED',
        appliedAt: null,
      });

      let [appRow] = await db
        .select()
        .from(jobApplications)
        .where(eq(jobApplications.id, applicationId));
      assert.strictEqual(appRow.status, 'PREPARED');
      assert.strictEqual(appRow.appliedAt, null);

      // 2. Transition PREPARED -> APPROVAL_PENDING
      const step1 = await workflowService.transitionApplicationState({
        tenantId,
        userId,
        applicationId,
        targetState: 'APPROVAL_PENDING',
        reason: 'Approval requested by user',
      });
      assert.strictEqual(step1.status, 'APPROVAL_PENDING');
      assert.strictEqual(step1.appliedAt, null);

      // 3. Transition APPROVAL_PENDING -> APPROVED
      const step2 = await workflowService.transitionApplicationState({
        tenantId,
        userId,
        applicationId,
        targetState: 'APPROVED',
        reason: 'Approval ticket granted',
      });
      assert.strictEqual(step2.status, 'APPROVED');
      assert.strictEqual(step2.appliedAt, null);

      // 4. Transition APPROVED -> READY_FOR_FINAL_REVIEW
      const step3 = await workflowService.transitionApplicationState({
        tenantId,
        userId,
        applicationId,
        targetState: 'READY_FOR_FINAL_REVIEW',
        reason: 'Form filled in browser, awaiting human review',
      });
      assert.strictEqual(step3.status, 'READY_FOR_FINAL_REVIEW');
      assert.strictEqual(step3.appliedAt, null);

      // Verify row in database
      [appRow] = await db
        .select()
        .from(jobApplications)
        .where(eq(jobApplications.id, applicationId));
      assert.strictEqual(appRow.status, 'READY_FOR_FINAL_REVIEW');
      assert.strictEqual(appRow.appliedAt, null);
    });

    it('rejects automated transition from READY_FOR_FINAL_REVIEW to APPLIED at service level', async () => {
      await assert.rejects(
        async () => {
          await workflowService.transitionApplicationState({
            tenantId,
            userId,
            applicationId,
            targetState: 'APPLIED',
            authorizedSubmissionExecuted: false,
          });
        },
        (err) => {
          assert.strictEqual(err.code, 'FORBIDDEN_AUTOMATED_SUBMIT');
          return true;
        }
      );

      // Database state remains strictly READY_FOR_FINAL_REVIEW, appliedAt remains null
      const [appRow] = await db
        .select()
        .from(jobApplications)
        .where(eq(jobApplications.id, applicationId));
      assert.strictEqual(appRow.status, 'READY_FOR_FINAL_REVIEW');
      assert.strictEqual(appRow.appliedAt, null);
    });

    it('succeeds when transition from READY_FOR_FINAL_REVIEW to SUBMITTED has authorizedSubmissionExecuted: true', async () => {
      const finalResult = await workflowService.transitionApplicationState({
        tenantId,
        userId,
        applicationId,
        targetState: 'SUBMITTED',
        authorizedSubmissionExecuted: true,
        reason: 'Explicit human submit button click verified',
      });

      assert.strictEqual(finalResult.status, 'SUBMITTED');
      assert.ok(finalResult.appliedAt !== null, 'appliedAt timestamp must be set on actual submission');

      const [appRow] = await db
        .select()
        .from(jobApplications)
        .where(eq(jobApplications.id, applicationId));
      assert.strictEqual(appRow.status, 'SUBMITTED');
      assert.ok(appRow.appliedAt instanceof Date, 'Database appliedAt must be a Date');
    });
  });

  describe('3. submitJobApplication Pipeline with Blocked Submission Invariant', () => {
    it('sets database status to READY_FOR_FINAL_REVIEW and appliedAt to null when final submission is blocked', async () => {
      const testJobId = 'job-p95-final-blocked';
      const testDestUrl = 'https://boards.greenhouse.io/acme-corp/jobs/905-blocked';
      const pkg = {
        applicationId: crypto.randomUUID(),
        targetJob: {
          id: testJobId,
          company: 'Acme Invariant Corp',
          title: 'Infrastructure Architect',
          directPortalUrl: testDestUrl,
          applicationUrl: testDestUrl,
          source: 'COMPANY_CAREERS',
        },
        tailoredResume: {
          markdownContent: '# John Doe\n\nExperienced Architect',
          contentHash: crypto.createHash('sha256').update('resume').digest('hex'),
        },
        coverLetter: {
          markdownContent: '# Dear Hiring Manager\n\nInterested in Infrastructure.',
          contentHash: crypto.createHash('sha256').update('letter').digest('hex'),
        },
        verifiedSkills: [{ skill: 'Distributed Systems', confidence: 0.95 }],
        claimedSkills: [{ skill: 'PostgreSQL', confidence: 0.9 }],
        portfolioLinks: [],
        packageHash: crypto.createHash('sha256').update('pkg-p95-test-payload').digest('hex'),
        preparedAt: new Date().toISOString(),
        answers: {},
      };

      // Mock portal adapter that simulates the canonical platform behavior:
      // Form filled, staged for human review, final submit blocked.
      const mockBlockedAdapter = {
        id: 'greenhouse-mock',
        name: 'Mock Greenhouse Adapter',
        canSubmit: (url) => url.includes('greenhouse.io'),
        submit: async () => mockBlockedAdapter.submitOrHandoff(),
        submitOrHandoff: async () => ({
          status: 'READY_FOR_FINAL_REVIEW',
          portalType: 'GREENHOUSE',
          destinationUrl: testDestUrl,
          finalSubmitBlocked: true,
          authorizedSubmissionExecuted: false,
          externalReference: null,
          message: 'Form filled in Chromium. Staged for human review prior to final submission.',
          handoffKit: {
            requiresUserApproval: true,
            submissionReady: true,
            finalSubmitBlocked: true,
            status: 'READY_FOR_REVIEW',
          },
        }),
      };

      const customWorkflow = new JobApplicationWorkflowService({
        db,
        submissionAdapters: [mockBlockedAdapter],
      });

      // Issue approval ticket
      const ticket = await customWorkflow.requestApplicationApproval({
        tenantId,
        userId,
        candidateId,
        applicationId: pkg.applicationId,
        clientId: 'p95-test-client',
        jobId: testJobId,
        destinationUrl: testDestUrl,
        packageHash: pkg.packageHash,
      });

      // Execute submitJobApplication
      const result = await customWorkflow.submitJobApplication({
        tenantId,
        userId,
        candidateId,
        applicationId: pkg.applicationId,
        jobId: testJobId,
        destinationUrl: testDestUrl,
        packageHash: pkg.packageHash,
        applicationPackage: pkg,
        approvalTicketId: ticket.ticketId,
        approvalSignature: ticket.signature,
      });

      // Invariant 1: Result status must be READY_FOR_FINAL_REVIEW, NEVER APPLIED or SUBMITTED
      assert.strictEqual(result.status, 'READY_FOR_FINAL_REVIEW');
      assert.strictEqual(result.submittedAt, undefined);
      assert.ok(result.stagedAt, 'stagedAt timestamp should be set');

      // Invariant 2: Database record must be READY_FOR_FINAL_REVIEW, appliedAt must be NULL
      const [savedApp] = await db
        .select()
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.tenantId, tenantId),
            eq(jobApplications.candidateId, candidateId),
            eq(jobApplications.companyName, 'Acme Invariant Corp')
          )
        );

      assert.ok(savedApp, 'Application must be recorded in DB');
      assert.strictEqual(savedApp.status, 'READY_FOR_FINAL_REVIEW');
      assert.strictEqual(savedApp.appliedAt, null, 'appliedAt MUST remain null when final submit is blocked');
      assert.strictEqual(savedApp.metadata.finalSubmitBlocked, true);
    });

    it('sets database status to HANDOFF_READY and appliedAt to null on manual handoff fallback', async () => {
      const testJobId = 'job-p95-handoff';
      const testDestUrl = 'https://unknown-portal.org/careers/apply/123';
      const pkg = {
        applicationId: crypto.randomUUID(),
        targetJob: {
          id: testJobId,
          company: 'Handoff Testing Corp',
          title: 'Site Reliability Engineer',
          directPortalUrl: testDestUrl,
          applicationUrl: testDestUrl,
          source: 'COMPANY_CAREERS',
        },
        tailoredResume: {
          markdownContent: '# SRE Resume',
          contentHash: crypto.createHash('sha256').update('resume-sre').digest('hex'),
        },
        coverLetter: {
          markdownContent: '# SRE Cover Letter',
          contentHash: crypto.createHash('sha256').update('letter-sre').digest('hex'),
        },
        verifiedSkills: [{ skill: 'Linux', confidence: 0.95 }],
        claimedSkills: [{ skill: 'Kubernetes', confidence: 0.9 }],
        portfolioLinks: [],
        packageHash: crypto.createHash('sha256').update('pkg-p95-handoff').digest('hex'),
        preparedAt: new Date().toISOString(),
        answers: {},
      };

      const customWorkflow = new JobApplicationWorkflowService({
        db,
        submissionAdapters: [], // no direct adapter -> triggers manual handoff
      });

      const ticket = await customWorkflow.requestApplicationApproval({
        tenantId,
        userId,
        candidateId,
        applicationId: pkg.applicationId,
        clientId: 'p95-test-client',
        jobId: testJobId,
        destinationUrl: testDestUrl,
        packageHash: pkg.packageHash,
      });

      const result = await customWorkflow.submitJobApplication({
        tenantId,
        userId,
        candidateId,
        applicationId: pkg.applicationId,
        jobId: testJobId,
        destinationUrl: testDestUrl,
        packageHash: pkg.packageHash,
        applicationPackage: pkg,
        approvalTicketId: ticket.ticketId,
        approvalSignature: ticket.signature,
      });

      assert.strictEqual(result.status, 'HANDOFF_READY');
      assert.ok(result.manualHandoffKit);

      const [savedApp] = await db
        .select()
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.tenantId, tenantId),
            eq(jobApplications.candidateId, candidateId),
            eq(jobApplications.companyName, 'Handoff Testing Corp')
          )
        );

      assert.ok(savedApp);
      assert.strictEqual(savedApp.status, 'HANDOFF_READY');
      assert.strictEqual(savedApp.appliedAt, null, 'appliedAt MUST remain null on manual handoff');
    });
  });
});
