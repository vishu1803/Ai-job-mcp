/**
 * @file Integration Tests for Phase 9.4 — Persist Approval State
 *
 * Verifies:
 * 1. Approval survives server restart (persisted in PostgreSQL).
 * 2. Valid ticket succeeds.
 * 3. Wrong candidate fails.
 * 4. Wrong application fails.
 * 5. Wrong destination fails.
 * 6. Modified package fails.
 * 7. Expired ticket fails.
 * 8. Revoked ticket fails.
 * 9. Replayed ticket fails (single-use replay rejection).
 * 10. Invalid cryptographic signature fails.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sealGeneratedPackage } from '../../src/services/evidence/artifact-policy.js';
import { db, closeDatabase, pool } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  jobApplications,
  applicationApprovalTickets,
  applicationPackages,
} from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  JobApplicationWorkflowService,
  signApplicationTicket,
  computeApplicationPackageHash,
} from '../../src/services/job-application-workflow.service.js';
import {
  ValidationError,
  AuthorizationError,
  ConflictError,
  InvalidTicketSignatureError,
} from '../../src/errors/index.js';

describe('Phase 9.4 — Approval Persistence & Security Integration Tests', () => {
  const tenantId = crypto.randomUUID();
  const foreignTenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const foreignUserId = crypto.randomUUID();
  const candidateId = crypto.randomUUID();
  const foreignCandidateId = crypto.randomUUID();
  const applicationId = crypto.randomUUID();
  const foreignApplicationId = crypto.randomUUID();

  const jobId = 'job-senior-dist-eng-901';
  const destinationUrl = 'https://boards.greenhouse.io/acme-corp/jobs/901';
  let packageHash;

  let workflowService;
  let samplePackage;

  before(async () => {
    // 1. Seed database tenants, users, candidates, and job applications
    await db.insert(tenants).values([
      {
        id: tenantId,
        name: 'Phase 9.4 Primary Tenant',
        slug: `p94-tenant-${Date.now()}`,
        status: 'ACTIVE',
      },
      {
        id: foreignTenantId,
        name: 'Phase 9.4 Foreign Tenant',
        slug: `p94-foreign-${Date.now()}`,
        status: 'ACTIVE',
      },
    ]);

    await db.insert(users).values([
      {
        id: userId,
        tenantId,
        email: `p94-user-${Date.now()}@example.test`,
        displayName: 'Approval Persistence Tester',
        role: 'MEMBER',
        status: 'ACTIVE',
      },
      {
        id: foreignUserId,
        tenantId: foreignTenantId,
        email: `p94-foreign-${Date.now()}@example.test`,
        displayName: 'Foreign Adversary Tester',
        role: 'MEMBER',
        status: 'ACTIVE',
      },
    ]);

    await db.insert(candidates).values([
      {
        id: candidateId,
        tenantId,
        userId,
        displayName: 'Devon Persistence',
        canonicalEmail: `devon-${Date.now()}@example.test`,
        headline: 'Lead Platform Reliability Architect',
      },
      {
        id: foreignCandidateId,
        tenantId: foreignTenantId,
        userId: foreignUserId,
        displayName: 'Foreign Candidate',
        canonicalEmail: `foreign-${Date.now()}@example.test`,
        headline: 'External Applicant',
      },
    ]);

    await db.insert(jobApplications).values([
      {
        id: applicationId,
        tenantId,
        candidateId,
        companyName: 'Acme Corp',
        jobTitle: 'Senior Distributed Engineer',
        jobUrl: destinationUrl,
        status: 'SAVED',
      },
      {
        id: foreignApplicationId,
        tenantId: foreignTenantId,
        candidateId: foreignCandidateId,
        companyName: 'Other Corp',
        jobTitle: 'Junior Engineer',
        jobUrl: destinationUrl,
        status: 'SAVED',
      },
    ]);

    workflowService = new JobApplicationWorkflowService({ database: db });

    samplePackage = {
      applicationId,
      candidateId,
      targetJob: {
        id: jobId,
        title: 'Senior Distributed Engineer',
        company: 'Acme Corp',
        applicationUrl: destinationUrl,
      },
      candidateName: 'Devon Persistence',
      candidateEmail: 'devon@example.test',
      candidatePhone: '+1-555-0199',
      tailoredResume: {
        markdown: '# Devon Resume',
        markdownContent: '# Devon Resume',
      },
      coverLetter: {
        markdown: '# Devon Cover Letter',
        markdownContent: '# Devon Cover Letter',
      },
      generationContractVersion: 'p16.0',
      answers: {},
    };
    samplePackage = await sealGeneratedPackage(db, { tenantId, candidateId }, samplePackage);
    packageHash = computeApplicationPackageHash(samplePackage);
    samplePackage.packageHash = packageHash;
    await db.insert(applicationPackages).values({
      tenantId,
      candidateId,
      applicationId,
      packageHash,
      packagePayload: samplePackage,
      version: 1,
    });
  });

  after(async () => {
    try {
      await db
        .delete(applicationApprovalTickets)
        .where(eq(applicationApprovalTickets.tenantId, tenantId));
      await db
        .delete(applicationApprovalTickets)
        .where(eq(applicationApprovalTickets.tenantId, foreignTenantId));
      await db.delete(jobApplications).where(eq(jobApplications.tenantId, tenantId));
      await db.delete(jobApplications).where(eq(jobApplications.tenantId, foreignTenantId));
      await db.delete(candidates).where(eq(candidates.tenantId, tenantId));
      await db.delete(candidates).where(eq(candidates.tenantId, foreignTenantId));
      await db.delete(users).where(eq(users.tenantId, tenantId));
      await db.delete(users).where(eq(users.tenantId, foreignTenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
      await db.delete(tenants).where(eq(tenants.id, foreignTenantId));
    } catch {
      // Ignore teardown cleanup errors
    } finally {
      await closeDatabase();
    }
  });

  it('TEST 1 — Approval survives server restart (durable PostgreSQL persistence)', async () => {
    // Mint approval ticket with first service instance
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      applicationId,
      jobId,
      destinationUrl,
      packageHash,
    });

    assert.ok(ticket.ticketId);
    assert.strictEqual(ticket.status, 'ISSUED');
    assert.ok(ticket.signature);

    // Simulate complete process restart by creating a completely fresh service instance
    // and verifying ticket can be fetched directly from database
    const freshServiceInstance = new JobApplicationWorkflowService({ database: db });
    const loadedTicket = await freshServiceInstance.getApprovalTicket({
      tenantId,
      ticketId: ticket.ticketId,
    });

    assert.ok(loadedTicket);
    assert.strictEqual(loadedTicket.ticketId, ticket.ticketId);
    assert.strictEqual(loadedTicket.packageHash, packageHash);
    assert.strictEqual(loadedTicket.destinationUrl, destinationUrl);
    assert.strictEqual(loadedTicket.candidateId, candidateId);
    assert.strictEqual(loadedTicket.signature, ticket.signature);
  });

  it('TEST 2 — Valid ticket succeeds through submission workflow', async () => {
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      applicationId,
      jobId,
      destinationUrl,
      packageHash,
    });

    const result = await workflowService.submitJobApplication({
      tenantId,
      userId,
      candidateId,
      approvalTicketId: ticket.ticketId,
      applicationId,
      jobId,
      destinationUrl,
      packageHash,
      applicationPackage: samplePackage,
    });

    assert.ok(result);
    // Verified consumption in database
    const consumedTicket = await workflowService.getApprovalTicket({
      tenantId,
      ticketId: ticket.ticketId,
    });
    assert.strictEqual(consumedTicket.status, 'CONSUMED');
    assert.ok(consumedTicket.consumedAt);
  });

  it('TEST 3 — Wrong candidate fails (candidate binding validation)', async () => {
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      applicationId,
      jobId,
      destinationUrl,
      packageHash,
    });

    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId: foreignCandidateId, // Wrong candidate
          approvalTicketId: ticket.ticketId,
          applicationId,
          jobId,
          destinationUrl,
          packageHash,
          applicationPackage: samplePackage,
        });
      },
      (err) => {
        assert.ok(err instanceof AuthorizationError);
        assert.strictEqual(err.code, 'FORBIDDEN_TICKET_MISMATCH');
        return true;
      }
    );
  });

  it('TEST 4 — Wrong application fails (application binding validation)', async () => {
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      applicationId,
      jobId,
      destinationUrl,
      packageHash,
    });

    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId,
          approvalTicketId: ticket.ticketId,
          applicationId: crypto.randomUUID(), // Wrong application ID
          jobId,
          destinationUrl,
          packageHash,
          applicationPackage: samplePackage,
        });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.strictEqual(err.code, 'APPLICATION_ID_MISMATCH');
        return true;
      }
    );
  });

  it('TEST 5 — Wrong destination fails (destination binding validation)', async () => {
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      applicationId,
      jobId,
      destinationUrl,
      packageHash,
    });

    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId,
          approvalTicketId: ticket.ticketId,
          applicationId,
          jobId,
          destinationUrl: 'https://jobs.lever.co/acme-corp/malicious-target', // Wrong destination
          packageHash,
          applicationPackage: samplePackage,
        });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.strictEqual(err.code, 'DESTINATION_MISMATCH');
        return true;
      }
    );
  });

  it('TEST 6 — Modified package fails (bit-for-bit package hash integrity)', async () => {
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      applicationId,
      jobId,
      destinationUrl,
      packageHash,
    });

    const tamperedHash = crypto.createHash('sha256').update('tampered-payload').digest('hex');

    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId,
          approvalTicketId: ticket.ticketId,
          applicationId,
          jobId,
          destinationUrl,
          packageHash: tamperedHash, // Tampered hash
          applicationPackage: samplePackage,
        });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.strictEqual(err.code, 'PACKAGE_HASH_TAMPERED');
        return true;
      }
    );
  });

  it('TEST 7 — Expired ticket fails', async () => {
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      applicationId,
      jobId,
      destinationUrl,
      packageHash,
    });

    // Manually force expiration in database
    await db
      .update(applicationApprovalTickets)
      .set({
        expiresAt: new Date(Date.now() - 60 * 1000), // 1 minute in past
      })
      .where(eq(applicationApprovalTickets.id, ticket.ticketId));

    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId,
          approvalTicketId: ticket.ticketId,
          applicationId,
          jobId,
          destinationUrl,
          packageHash,
          applicationPackage: samplePackage,
        });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.strictEqual(err.code, 'TICKET_EXPIRED');
        return true;
      }
    );
  });

  it('TEST 8 — Revoked ticket fails', async () => {
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      applicationId,
      jobId,
      destinationUrl,
      packageHash,
    });

    // Explicitly revoke ticket
    await workflowService.revokeApplicationApprovalTicket({
      tenantId,
      userId,
      ticketId: ticket.ticketId,
      reason: 'User revoked consent for submission',
    });

    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId,
          approvalTicketId: ticket.ticketId,
          applicationId,
          jobId,
          destinationUrl,
          packageHash,
          applicationPackage: samplePackage,
        });
      },
      (err) => {
        assert.ok(err instanceof AuthorizationError);
        assert.strictEqual(err.code, 'TICKET_REVOKED');
        return true;
      }
    );
  });

  it('TEST 9 — Replayed ticket fails (single-use replay rejection)', async () => {
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      applicationId,
      jobId,
      destinationUrl,
      packageHash,
    });

    // First submission succeeds
    await workflowService.submitJobApplication({
      tenantId,
      userId,
      candidateId,
      approvalTicketId: ticket.ticketId,
      applicationId,
      jobId,
      destinationUrl,
      packageHash,
      applicationPackage: samplePackage,
    });

    // Second submission with identical ticket must be rejected
    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId,
          approvalTicketId: ticket.ticketId,
          applicationId,
          jobId,
          destinationUrl,
          packageHash,
          applicationPackage: samplePackage,
        });
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.strictEqual(err.code, 'CONFLICT');
        assert.ok(err.message.includes('already been consumed'));
        return true;
      }
    );
  });

  it('TEST 10 — Invalid cryptographic signature fails', async () => {
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      applicationId,
      jobId,
      destinationUrl,
      packageHash,
    });

    // Tamper with ticket signature in database
    await db
      .update(applicationApprovalTickets)
      .set({
        signature: 'deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef',
      })
      .where(eq(applicationApprovalTickets.id, ticket.ticketId));

    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId,
          approvalTicketId: ticket.ticketId,
          applicationId,
          jobId,
          destinationUrl,
          packageHash,
          applicationPackage: samplePackage,
        });
      },
      (err) => {
        assert.ok(err instanceof InvalidTicketSignatureError || err instanceof AuthorizationError);
        assert.strictEqual(err.code, 'INVALID_TICKET_SIGNATURE');
        return true;
      }
    );
  });
});
