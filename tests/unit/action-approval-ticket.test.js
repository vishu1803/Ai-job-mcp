/**
 * @file Unit Tests for Action Approval Ticket Service & Signer (P9-002 / ARCH-032 / ADR-053)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  ActionApprovalTicketService,
  CREATION_TTL_MS,
} from '../../src/services/action-approval-ticket.service.js';
import {
  signTicketPayload,
  verifyTicketSignature,
  buildCanonicalTicketPayload,
  deriveTenantSigningKey,
} from '../../src/security/approval-signer.js';
import {
  ApprovalTicketStatusEnum,
  ApprovalTicketSchema,
} from '../../src/domain/career/approval-ticket.schemas.js';
import { AuthorizationError, NotFoundError, ValidationError } from '../../src/errors/index.js';

// In-memory mock database implementing transactional row locking and atomic updates
function createMockDb() {
  const store = new Map();

  const db = {
    store,
    insert: () => ({
      values: (val) => ({
        returning: async () => {
          const row = { ...val };
          store.set(`${row.tenantId}:${row.id}`, row);
          return [row];
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: (_condition) => {
          return {
            limit: async () => {
              return Array.from(store.values());
            },
            for: () => ({
              limit: async () => {
                return Array.from(store.values());
              },
            }),
            orderBy: () => ({
              limit: async () => Array.from(store.values()),
            }),
          };
        },
      }),
    }),
    update: () => ({
      set: (_updates) => ({
        where: () => ({
          returning: async () => {
            return [];
          },
        }),
      }),
    }),
    transaction: async (callback) => {
      return callback(db);
    },
  };

  return db;
}

describe('Action Approval Signer & Cryptographic Binding (Unit)', () => {
  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const candidateId = crypto.randomUUID();
  const resourceId = crypto.randomUUID();
  const proposalId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const sampleTicket = {
    tenantId: tenantA,
    userId,
    candidateId,
    resourceId,
    proposalId,
    repositoryName: 'vishu1803/job-tracker-api',
    baseBranch: 'main',
    targetBranch: 'feat/career-hub-redis-8f3a12bc',
    expectedHeadSha: '9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a',
    patchFingerprint: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    expiresAt,
  };

  it('derives distinct 32-byte signing keys per tenant using HKDF-SHA256', () => {
    const keyA = deriveTenantSigningKey(tenantA);
    const keyB = deriveTenantSigningKey(tenantB);

    assert.equal(keyA.length, 32);
    assert.equal(keyB.length, 32);
    assert.notDeepEqual(keyA, keyB, 'Keys derived for different tenants must not match');
  });

  it('constructs canonical pipe-delimited payload matching ARCH-032 specification', () => {
    const canonical = buildCanonicalTicketPayload(sampleTicket);
    const parts = canonical.split('|');

    assert.equal(parts[0], 'V1');
    assert.equal(parts[1], tenantA);
    assert.equal(parts[2], userId);
    assert.equal(parts[3], candidateId);
    assert.equal(parts[4], resourceId);
    assert.equal(parts[5], proposalId);
    assert.equal(parts[6], 'vishu1803/job-tracker-api');
    assert.equal(parts[7], 'main');
    assert.equal(parts[8], 'feat/career-hub-redis-8f3a12bc');
    assert.equal(parts[9], '9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a');
    assert.equal(parts[10], 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2');
    assert.equal(parts[11], expiresAt.toISOString());
  });

  it('generates a 64-character SHA-256 HMAC and verifies successfully', () => {
    const signature = signTicketPayload(sampleTicket);
    assert.equal(signature.length, 64);
    assert.match(signature, /^[a-f0-9]{64}$/);

    const isValid = verifyTicketSignature({
      ...sampleTicket,
      hmacSignature: signature,
    });
    assert.equal(isValid, true);
  });

  it('rejects signature when any mutable parameter is tampered with', () => {
    const signature = signTicketPayload(sampleTicket);
    const signedTicket = { ...sampleTicket, hmacSignature: signature };

    // Tamper with repository
    assert.equal(
      verifyTicketSignature({ ...signedTicket, repositoryName: 'attacker/malicious-repo' }),
      false
    );

    // Tamper with target branch
    assert.equal(
      verifyTicketSignature({ ...signedTicket, targetBranch: 'feat/career-hub-backdoor' }),
      false
    );

    // Tamper with base branch
    assert.equal(verifyTicketSignature({ ...signedTicket, baseBranch: 'production' }), false);

    // Tamper with expectedHeadSha
    assert.equal(
      verifyTicketSignature({
        ...signedTicket,
        expectedHeadSha: '0000000000000000000000000000000000000000',
      }),
      false
    );

    // Tamper with patchFingerprint
    assert.equal(
      verifyTicketSignature({
        ...signedTicket,
        patchFingerprint: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      }),
      false
    );

    // Tamper with tenantId (cross-tenant signature forgery)
    assert.equal(verifyTicketSignature({ ...signedTicket, tenantId: tenantB }), false);

    // Tamper with expiration
    assert.equal(
      verifyTicketSignature({
        ...signedTicket,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }),
      false
    );
  });

  it('rejects signature with malformed hex or invalid length', () => {
    assert.equal(verifyTicketSignature({ ...sampleTicket, hmacSignature: 'bad-sig' }), false);
    assert.equal(verifyTicketSignature({ ...sampleTicket, hmacSignature: '' }), false);
    assert.equal(verifyTicketSignature(null), false);
  });
});

describe('Action Approval Domain Schemas (Unit)', () => {
  it('validates canonical approval ticket status enum values', () => {
    const validStates = [
      'PENDING',
      'APPROVED',
      'EXECUTING',
      'EXECUTED',
      'REJECTED',
      'CANCELLED',
      'EXPIRED',
      'FAILED',
    ];
    for (const status of validStates) {
      assert.equal(ApprovalTicketStatusEnum.parse(status), status);
    }

    assert.throws(() => ApprovalTicketStatusEnum.parse('UNKNOWN'));
    assert.throws(() => ApprovalTicketStatusEnum.parse('DRAFT'));
  });

  it('rejects target branches that do not match feat/career-hub-* invariant', () => {
    assert.throws(() => {
      ApprovalTicketSchema.parse({
        id: crypto.randomUUID(),
        tenantId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        candidateId: crypto.randomUUID(),
        resourceId: crypto.randomUUID(),
        proposalId: crypto.randomUUID(),
        actionType: 'PROJECT_IMPROVEMENT_PR',
        repositoryName: 'test/repo',
        baseBranch: 'main',
        targetBranch: 'main', // Invalid!
        expectedHeadSha: '9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a',
        patchFingerprint: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
        patchSummary: {
          fileCount: 1,
          totalDiffLines: 10,
          expectedFiles: ['index.js'],
        },
        hmacSignature: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(),
      });
    });
  });
});

describe('ActionApprovalTicketService In-Memory State Transitions (Unit)', () => {
  let mockDb;
  let service;
  let tenantId;
  let userId;
  let candidateProfile;
  let validProposal;
  let auditedEvents;

  beforeEach(() => {
    mockDb = createMockDb();
    auditedEvents = [];

    const mockAudit = {
      logEvent: async (ev) => {
        auditedEvents.push(ev);
      },
    };

    tenantId = crypto.randomUUID();
    userId = crypto.randomUUID();
    const candidateId = crypto.randomUUID();
    const resourceId = crypto.randomUUID();
    const proposalId = crypto.randomUUID();

    candidateProfile = {
      id: candidateId,
      tenantId,
      candidate: { id: candidateId, tenantId },
    };

    validProposal = {
      proposalId,
      tenantId,
      candidateId,
      resourceId,
      repositoryName: 'vishu1803/portfolio-api',
      targetBranch: 'feat/career-hub-redis-8f3a12bc',
      patch: {
        fileCount: 2,
        totalDiffLines: 45,
        patchFingerprint: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
        files: [{ path: 'src/redis.js' }, { path: 'tests/redis.test.js' }],
      },
      status: 'PROPOSED',
    };

    service = new ActionApprovalTicketService({
      database: mockDb,
      mcpAuditService: mockAudit,
    });
  });

  it('creates an approval ticket in PENDING state with 15m TTL and emits audit event', async () => {
    const ticket = await service.createTicket(
      { tenantId, userId, role: 'OWNER' },
      {
        candidateProfile,
        proposal: validProposal,
        expectedHeadSha: '9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a',
        baseBranch: 'main',
      }
    );

    assert.equal(ticket.status, 'PENDING');
    assert.equal(ticket.tenantId, tenantId);
    assert.equal(ticket.repositoryName, 'vishu1803/portfolio-api');
    assert.equal(ticket.targetBranch, 'feat/career-hub-redis-8f3a12bc');
    assert.equal(ticket.expectedHeadSha, '9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a');
    assert.ok(ticket.hmacSignature);
    assert.equal(verifyTicketSignature(ticket), true);

    const expiryTime = new Date(ticket.expiresAt).getTime();
    const createdTime = new Date(ticket.createdAt).getTime();
    assert.ok(Math.abs(expiryTime - createdTime - CREATION_TTL_MS) < 1000);

    assert.equal(auditedEvents.length, 1);
    assert.equal(auditedEvents[0].eventType, 'approval.ticket_created');
  });

  it('rejects ticket creation for BLOCKED proposals', async () => {
    await assert.rejects(
      async () => {
        await service.createTicket(
          { tenantId, userId, role: 'OWNER' },
          {
            candidateProfile,
            proposal: { ...validProposal, status: 'BLOCKED' },
            expectedHeadSha: '9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a',
          }
        );
      },
      (err) => err instanceof ValidationError && err.code === 'PROPOSAL_NOT_ELIGIBLE'
    );
  });

  it('rejects cross-tenant ticket creation with 404 NOT_FOUND', async () => {
    const foreignTenantId = crypto.randomUUID();

    await assert.rejects(
      async () => {
        await service.createTicket(
          { tenantId: foreignTenantId, userId, role: 'OWNER' },
          {
            candidateProfile,
            proposal: validProposal,
            expectedHeadSha: '9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a',
          }
        );
      },
      (err) => err instanceof NotFoundError
    );
  });

  it('rejects approval by READONLY role with 403 Forbidden', async () => {
    await assert.rejects(
      async () => {
        await service.approveTicket(
          { tenantId, userId, role: 'READONLY' },
          { ticketId: crypto.randomUUID() }
        );
      },
      (err) => err instanceof AuthorizationError && err.statusCode === 403
    );
  });
});
