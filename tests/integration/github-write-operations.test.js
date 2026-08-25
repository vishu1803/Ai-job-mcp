/**
 * @file Integration Tests for Approved GitHub Write Operations (Task P9-003)
 *
 * Tests the complete database-backed and state-machine-backed write pipeline:
 * 1. Consumes APPROVED ActionApprovalTicket via ActionApprovalTicketService
 * 2. Mints scoped installation token via GitHubAppAuthManager
 * 3. Verifies optimistic concurrency against base branch expectedHeadSha
 * 4. Creates atomic multi-file Git tree and commit via Git Data API
 * 5. Creates isolated feature branch ref (feat/career-hub-*)
 * 6. Creates Draft Pull Request against base branch
 * 7. Enforces non-destructive rollback on partial failure (deletes feature branch ref)
 * 8. Discovers existing PR on idempotent retry without duplicating writes
 * 9. Enforces multi-tenant sovereign isolation (404 NOT_FOUND)
 * 10. Clean database teardown with zero connection leaks
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  resourceConnections,
  actionApprovalTickets,
} from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { ActionApprovalTicketService } from '../../src/services/action-approval-ticket.service.js';
import { GitHubWriteService } from '../../src/services/github-write.service.js';
import { GitHubAppConnector } from '../../src/connectors/github/github-connector.js';
import { GitHubAppAuthManager } from '../../src/connectors/github/auth.js';
import { GitHubTokenCache } from '../../src/connectors/github/token-cache.js';
import { encryptSecret } from '../../src/security/encryption.js';
import { StaleHeadShaError, ApprovalTicketStateError } from '../../src/errors/index.js';

describe('GitHub Write Operations Integration Tests (P9-003)', () => {
  const tenantId = crypto.randomUUID();
  const foreignTenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const foreignUserId = crypto.randomUUID();
  const candidateId = crypto.randomUUID();
  const resourceId = crypto.randomUUID();
  const baseSha = '9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a';

  let testKeyPair;
  let tokenCache;
  let authManager;
  let connector;
  let approvalService;
  let writeService;
  let context;
  let candidateProfile;

  // Track mock GitHub API calls
  const mockGitHubState = {
    branches: new Map(),
    commits: new Map(),
    trees: new Map(),
    pulls: [],
    deletedRefs: [],
    shouldFailPrCreation: false,
    baseHeadSha: baseSha,
  };

  before(async () => {
    // 1. Generate RSA key pair for GitHubAppAuthManager
    testKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    tokenCache = new GitHubTokenCache();

    // 2. Comprehensive mock fetch for GitHub REST API
    const mockFetch = async (url, options = {}) => {
      const urlStr = String(url);
      const method = options.method || 'GET';

      // POST /app/installations/:id/access_tokens
      if (urlStr.includes('/access_tokens')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            token: 'ghs_mock_scoped_token_12345',
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            permissions: { contents: 'write', pull_requests: 'write' },
            repository_selection: 'selected',
          }),
        };
      }

      // GET /repos/:owner/:repo/git/ref/heads/:branch
      if (urlStr.includes('/git/ref/heads/') && method === 'GET') {
        const branchName = urlStr.split('/git/ref/heads/')[1];
        if (branchName === 'stale-base') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ref: 'refs/heads/stale-base',
              object: { sha: 'moved_ahead_new_head_sha_999999' },
            }),
          };
        }
        if (branchName === 'main') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ref: 'refs/heads/main',
              object: { sha: baseSha },
            }),
          };
        }
        if (mockGitHubState.branches.has(branchName)) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ref: `refs/heads/${branchName}`,
              object: { sha: mockGitHubState.branches.get(branchName) },
            }),
          };
        }
        return {
          ok: false,
          status: 404,
          json: async () => ({ message: 'Not Found' }),
        };
      }

      // GET /repos/:owner/:repo/branches/:branch
      if (urlStr.includes('/branches/') && method === 'GET') {
        const branchName = urlStr.split('/branches/')[1];
        return {
          ok: true,
          status: 200,
          json: async () => ({
            name: branchName,
            commit: {
              sha: branchName === 'stale-base' ? 'moved_ahead_new_head_sha_999999' : baseSha,
            },
          }),
        };
      }

      // POST /repos/:owner/:repo/git/trees
      if (urlStr.includes('/git/trees') && method === 'POST') {
        const treeSha = `tree_${crypto.randomBytes(8).toString('hex')}`;
        mockGitHubState.trees.set(treeSha, options.body);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            sha: treeSha,
            url: `https://api.github.com/repos/vishu1803/Ai-job-mcp/git/trees/${treeSha}`,
          }),
        };
      }

      // POST /repos/:owner/:repo/git/commits
      if (urlStr.includes('/git/commits') && method === 'POST') {
        const commitSha = crypto.randomBytes(20).toString('hex');
        mockGitHubState.commits.set(commitSha, options.body);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            sha: commitSha,
            html_url: `https://github.com/vishu1803/Ai-job-mcp/commit/${commitSha}`,
          }),
        };
      }

      // POST /repos/:owner/:repo/git/refs
      if (urlStr.includes('/git/refs') && method === 'POST') {
        const parsed = JSON.parse(options.body);
        const branchName = parsed.ref.replace(/^refs\/heads\//, '');
        mockGitHubState.branches.set(branchName, parsed.sha);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            ref: parsed.ref,
            object: { sha: parsed.sha },
          }),
        };
      }

      // DELETE /repos/:owner/:repo/git/refs/heads/:branch
      if (urlStr.includes('/git/refs/') && method === 'DELETE') {
        const rawPath = urlStr.split('/git/refs/')[1] || '';
        const branchName = rawPath.replace(/^heads\//, '');
        mockGitHubState.branches.delete(branchName);
        mockGitHubState.deletedRefs.push(branchName);
        return {
          ok: true,
          status: 204,
          text: async () => '',
        };
      }

      // GET /repos/:owner/:repo/pulls
      if (urlStr.includes('/pulls') && method === 'GET') {
        const urlObj = new URL(urlStr, 'https://api.github.com');
        const headFilter = urlObj.searchParams.get('head');
        let pulls = mockGitHubState.pulls;
        if (headFilter) {
          pulls = pulls.filter((p) => {
            const prHead = (p.head?.ref || p.head || p.headRef || '').replace(/^refs\/heads\//, '');
            return prHead === headFilter.replace(/^refs\/heads\//, '');
          });
        }
        return {
          ok: true,
          status: 200,
          json: async () => pulls,
        };
      }

      // POST /repos/:owner/:repo/pulls
      if (urlStr.includes('/pulls') && method === 'POST') {
        const parsed = JSON.parse(options.body);
        if (parsed.head?.includes('fail') || mockGitHubState.shouldFailPrCreation) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ message: 'Simulated upstream PR creation failure' }),
          };
        }
        const prNumber = mockGitHubState.pulls.length + 1;
        const newPr = {
          number: prNumber,
          html_url: `https://github.com/vishu1803/Ai-job-mcp/pull/${prNumber}`,
          state: 'open',
          draft: Boolean(parsed.draft),
          head: { ref: parsed.head, sha: mockGitHubState.branches.get(parsed.head) },
          base: { ref: parsed.base },
        };
        mockGitHubState.pulls.push(newPr);
        return {
          ok: true,
          status: 201,
          json: async () => newPr,
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      };
    };

    authManager = new GitHubAppAuthManager({
      appId: '123456',
      privateKey: testKeyPair.privateKey,
      cache: tokenCache,
      fetchFn: mockFetch,
    });

    connector = new GitHubAppConnector({
      authManager,
      fetchFn: mockFetch,
    });

    approvalService = new ActionApprovalTicketService({ db });
    writeService = new GitHubWriteService({
      db,
      connector,
      actionApprovalTicketService: approvalService,
    });

    // 3. Seed PostgreSQL database entities
    await db.insert(tenants).values([
      {
        id: tenantId,
        name: 'GitHub Write Operations Tenant',
        slug: `ghwrite-tenant-${Date.now()}`,
        status: 'ACTIVE',
      },
      {
        id: foreignTenantId,
        name: 'Foreign Tenant',
        slug: `foreign-tenant-${Date.now()}`,
        status: 'ACTIVE',
      },
    ]);

    await db.insert(users).values([
      {
        id: userId,
        tenantId,
        email: `candidate-${Date.now()}@example.com`,
        displayName: 'Test Candidate',
        role: 'MEMBER',
        status: 'ACTIVE',
      },
      {
        id: foreignUserId,
        tenantId: foreignTenantId,
        email: `foreign-${Date.now()}@example.com`,
        displayName: 'Foreign User',
        role: 'MEMBER',
        status: 'ACTIVE',
      },
    ]);

    await db.insert(candidates).values({
      id: candidateId,
      tenantId,
      userId,
      displayName: 'Test Candidate Profile',
      targetRoles: ['Backend Engineer'],
    });

    await db.insert(resourceConnections).values({
      id: resourceId,
      tenantId,
      userId,
      provider: 'GITHUB_APP',
      displayName: 'GitHub App Connection',
      externalAccountId: 'gh_candidate_user_123',
      installationId: '155430459',
      encryptedCredentials: encryptSecret('ghp_test_token_12345'),
      status: 'ACTIVE',
      authType: 'APP_INSTALLATION',
    });

    context = {
      tenantId,
      userId,
      role: 'MEMBER',
      user: { id: userId, tenantId, role: 'MEMBER' },
    };

    candidateProfile = {
      id: candidateId,
      tenantId,
      candidate: { id: candidateId, tenantId },
    };
  });

  after(async () => {
    try {
      await db.delete(actionApprovalTickets).where(eq(actionApprovalTickets.tenantId, tenantId));
      await db.delete(resourceConnections).where(eq(resourceConnections.tenantId, tenantId));
      await db.delete(candidates).where(eq(candidates.tenantId, tenantId));
      await db.delete(users).where(eq(users.tenantId, tenantId));
      await db.delete(users).where(eq(users.tenantId, foreignTenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
      await db.delete(tenants).where(eq(tenants.id, foreignTenantId));
    } finally {
      await closeDatabase();
    }
  });

  function createSampleProposal(targetBranch) {
    const files = [
      {
        path: 'src/services/cache-manager.js',
        changeType: 'CREATE',
        content: 'export class CacheManager { constructor() { this.store = new Map(); } }\n',
      },
      {
        path: 'tests/unit/cache-manager.test.js',
        changeType: 'CREATE',
        content: 'import { describe, it } from "node:test";\n',
      },
    ];
    return {
      proposalId: crypto.randomUUID(),
      tenantId,
      candidateId,
      resourceId,
      repositoryName: 'vishu1803/Ai-job-mcp',
      targetBranch,
      patch: {
        fileCount: files.length,
        totalDiffLines: 60,
        patchFingerprint: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
        files,
      },
      status: 'PROPOSED',
      title: 'Implement Redis Caching Layer',
      rationale: 'Addresses missing Redis skill requirement with high confidence.',
      targetSkill: 'Redis',
      gapStatus: 'MISSING',
      confidenceScore: 0.95,
      verificationInstructions: 'npm test',
      files,
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Happy Path Execution
  // ---------------------------------------------------------------------------
  it('1. Executes full happy path: PENDING -> APPROVED -> EXECUTING -> EXECUTED with branch & Draft PR creation', async () => {
    mockGitHubState.baseHeadSha = baseSha;
    mockGitHubState.shouldFailPrCreation = false;

    const targetBranch = `feat/career-hub-redis-${Date.now()}`;
    const proposal = createSampleProposal(targetBranch);

    // Step A: Create Ticket
    const ticket = await approvalService.createTicket(context, {
      candidateProfile,
      proposal,
      baseBranch: 'main',
      expectedHeadSha: baseSha,
    });

    assert.equal(ticket.status, 'PENDING');

    // Step B: Human Approves Ticket
    const approvedTicket = await approvalService.approveTicket(context, {
      ticketId: ticket.id,
    });

    assert.equal(approvedTicket.status, 'APPROVED');

    // Step C: Execute Approved Action
    const executionResult = await writeService.executeApprovedTicket(context, {
      ticketId: ticket.id,
      proposal,
    });

    assert.ok(executionResult.prNumber > 0, 'Must return positive PR number');
    assert.match(executionResult.prUrl, /pull\/\d+$/);
    assert.equal(executionResult.branchName, targetBranch);
    assert.ok(
      /^[a-f0-9]{40}$/i.test(executionResult.commitSha),
      'Must return 40-char hex commitSha'
    );

    // Step D: Verify Database State
    const finalTicket = await approvalService.getTicket(context, ticket.id);
    assert.equal(finalTicket.status, 'EXECUTED');
    assert.equal(finalTicket.executionResult.prNumber, executionResult.prNumber);
    assert.equal(finalTicket.executionResult.branchName, targetBranch);
  });

  // ---------------------------------------------------------------------------
  // 2. Optimistic Concurrency: Stale Base HEAD Commit Rejection
  // ---------------------------------------------------------------------------
  it('2. Rejects execution with 409 StaleHeadShaError and marks ticket FAILED when base branch HEAD moves', async () => {
    const targetBranch = `feat/career-hub-stale-${Date.now()}`;
    const proposal = createSampleProposal(targetBranch);

    const ticket = await approvalService.createTicket(context, {
      candidateProfile,
      proposal,
      baseBranch: 'stale-base',
      expectedHeadSha: baseSha,
    });

    await approvalService.approveTicket(context, { ticketId: ticket.id });

    await assert.rejects(
      async () => writeService.executeApprovedTicket(context, { ticketId: ticket.id, proposal }),
      (err) => err instanceof StaleHeadShaError && err.statusCode === 409
    );

    // Verify database record transitioned to FAILED
    const failedTicket = await approvalService.getTicket(context, ticket.id);
    assert.equal(failedTicket.status, 'FAILED');
    assert.equal(failedTicket.failureReason, 'STALE_BASE_HEAD_SHA');

    // Reset base HEAD
    mockGitHubState.baseHeadSha = baseSha;
  });

  // ---------------------------------------------------------------------------
  // 3. Non-Destructive Rollback on Partial Failure
  // ---------------------------------------------------------------------------
  it('3. Performs non-destructive rollback: deletes feature branch ref and marks ticket FAILED when PR creation fails', async () => {
    mockGitHubState.shouldFailPrCreation = true;
    mockGitHubState.deletedRefs = [];

    const targetBranch = `feat/career-hub-fail-${Date.now()}`;
    const proposal = createSampleProposal(targetBranch);

    const ticket = await approvalService.createTicket(context, {
      candidateProfile,
      proposal,
      baseBranch: 'main',
      expectedHeadSha: baseSha,
    });

    await approvalService.approveTicket(context, { ticketId: ticket.id });

    try {
      await assert.rejects(
        async () => writeService.executeApprovedTicket(context, { ticketId: ticket.id, proposal }),
        (err) =>
          err.message.includes('Simulated upstream PR creation failure') ||
          err.message.includes('500') ||
          err.statusCode === 503 ||
          err.statusCode === 500
      );

      // Verify feature branch was deleted on rollback
      assert.ok(
        mockGitHubState.deletedRefs.includes(targetBranch),
        'Must call DELETE /git/refs/heads/ for the created feature branch'
      );

      // Verify ticket in DB is FAILED
      const failedTicket = await approvalService.getTicket(context, ticket.id);
      assert.equal(failedTicket.status, 'FAILED');
    } finally {
      mockGitHubState.shouldFailPrCreation = false;
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Idempotent Re-entry
  // ---------------------------------------------------------------------------
  it('4. Supports idempotent re-entry with identical idempotencyKey without duplicating PR creation', async () => {
    const targetBranch = `feat/career-hub-idempotent-${Date.now()}`;
    const proposal = createSampleProposal(targetBranch);
    const idempotencyKey = `idemp-${crypto.randomUUID()}`;

    const ticket = await approvalService.createTicket(context, {
      candidateProfile,
      proposal,
      baseBranch: 'main',
      expectedHeadSha: baseSha,
    });

    await approvalService.approveTicket(context, { ticketId: ticket.id });

    // Initial Execution
    const firstRes = await writeService.executeApprovedTicket(context, {
      ticketId: ticket.id,
      proposal,
      idempotencyKey,
    });

    // Re-execution with same idempotencyKey
    const secondRes = await writeService.executeApprovedTicket(context, {
      ticketId: ticket.id,
      proposal,
      idempotencyKey,
    });

    assert.equal(firstRes.prNumber, secondRes.prNumber);
    assert.equal(firstRes.prUrl, secondRes.prUrl);
    assert.equal(firstRes.branchName, secondRes.branchName);
  });

  // ---------------------------------------------------------------------------
  // 5. Multi-Tenant Sovereign Isolation
  // ---------------------------------------------------------------------------
  it('5. Enforces multi-tenant sovereign isolation: foreign tenant cannot execute ticket (404 NotFoundError)', async () => {
    const targetBranch = `feat/career-hub-tenant-${Date.now()}`;
    const proposal = createSampleProposal(targetBranch);

    const ticket = await approvalService.createTicket(context, {
      candidateProfile,
      proposal,
      baseBranch: 'main',
      expectedHeadSha: baseSha,
    });

    await approvalService.approveTicket(context, { ticketId: ticket.id });

    const foreignContext = {
      tenantId: foreignTenantId,
      userId: foreignUserId,
      role: 'MEMBER',
      user: { id: foreignUserId, tenantId: foreignTenantId, role: 'MEMBER' },
    };

    await assert.rejects(
      async () =>
        writeService.executeApprovedTicket(foreignContext, { ticketId: ticket.id, proposal }),
      (err) => err.statusCode === 404
    );
  });

  // ---------------------------------------------------------------------------
  // 6. Rejection of Unapproved Tickets
  // ---------------------------------------------------------------------------
  it('6. Prohibits execution of unapproved tickets (PENDING status throws 409 ApprovalTicketStateError)', async () => {
    const targetBranch = `feat/career-hub-unapproved-${Date.now()}`;
    const proposal = createSampleProposal(targetBranch);

    const ticket = await approvalService.createTicket(context, {
      candidateProfile,
      proposal,
      baseBranch: 'main',
      expectedHeadSha: baseSha,
    });

    // Do NOT approve ticket
    await assert.rejects(
      async () => writeService.executeApprovedTicket(context, { ticketId: ticket.id, proposal }),
      (err) => err instanceof ApprovalTicketStateError && err.statusCode === 409
    );
  });
});
