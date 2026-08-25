/**
 * @file Unit Tests for Approved GitHub Write Operations (Task P9-003)
 *
 * Tests:
 * 1. Dynamic permission scoping and cache key derivation in GitHubAppAuthManager & token cache
 * 2. Branch naming regex & protected branch enforcement (main/master/develop)
 * 3. Optimistic concurrency: expectedHeadSha verification and 409 StaleHeadShaError
 * 4. Git Data API multi-file tree and single commit mapping
 * 5. Draft PR creation and markdown sanitization
 * 6. Secret detection in patches triggering fail-closed rejection
 * 7. Non-destructive rollback deleting isolated feat/career-hub-* branch on failure
 * 8. Idempotent re-entry discovering existing PR without duplicate creation
 * 9. Multi-tenant isolation enforcement returning 404 NOT_FOUND
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubWriteService, BRANCH_NAME_REGEX } from '../../src/services/github-write.service.js';
import { buildTokenCacheKey, GitHubTokenCache } from '../../src/connectors/github/token-cache.js';
import {
  StaleHeadShaError,
  ForbiddenOperationError,
  NotFoundError,
} from '../../src/errors/index.js';
import { encryptSecret } from '../../src/security/encryption.js';

describe('GitHub Write Operations Unit Tests (P9-003)', () => {
  const tenantId = '02986f0a-93dd-4242-83ee-d3b026349b3d';
  const userId = 'cfec123d-fe02-4cba-9cd0-56ad9de82002';
  const resourceId = 'af793006-bc5d-46ca-88a4-85e343907ff4';
  const ticketId = 'c29f4a18-9a3d-4c3d-b4ef-123456789abc';
  const baseSha = '9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a';

  let mockDb;
  let mockConnector;
  let mockApprovalService;
  let writeService;
  let sampleTicket;

  beforeEach(() => {
    sampleTicket = {
      id: ticketId,
      tenantId,
      userId,
      candidateId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      resourceId,
      repositoryName: 'vishu1803/Ai-job-mcp',
      baseBranch: 'main',
      targetBranch: 'feat/career-hub-redis-8f3a12bc',
      expectedHeadSha: baseSha,
      status: 'APPROVED',
      proposal: {
        id: 'prop-123',
        title: 'Implement Redis Caching Layer',
        rationale: 'Addresses missing Redis skill requirement with high confidence.',
        targetSkill: 'Redis',
        gapStatus: 'MISSING',
        confidenceScore: 0.95,
        verificationInstructions: 'npm test',
        files: [
          {
            path: 'src/services/cache.js',
            changeType: 'CREATE',
            content: 'export class CacheService {}\n',
          },
          {
            path: 'tests/cache.test.js',
            changeType: 'CREATE',
            content: 'import assert from "node:assert";\n',
          },
        ],
      },
    };

    mockDb = {
      select: () => ({
        from: () => ({
          where: () => [
            {
              id: resourceId,
              tenantId,
              status: 'ACTIVE',
              installationId: '12345678',
              encryptedCredentials: encryptSecret('ghp_test_mock_token_12345'),
            },
          ],
        }),
      }),
    };

    mockConnector = {
      getBranchHeadSha: async () => ({
        commitSha: baseSha,
        ref: 'refs/heads/main',
      }),
      createGitTree: async () => ({
        treeSha: 'tree_sha_abc123',
        url: 'https://api.github.com/repos/vishu1803/Ai-job-mcp/git/trees/tree_sha_abc123',
      }),
      createGitCommit: async () => ({
        commitSha: 'commit_sha_def456',
        url: 'https://github.com/vishu1803/Ai-job-mcp/commit/commit_sha_def456',
      }),
      createGitRef: async () => ({
        ref: 'refs/heads/feat/career-hub-redis-8f3a12bc',
        commitSha: 'commit_sha_def456',
      }),
      deleteGitRef: async () => ({ success: true }),
      createDraftPullRequest: async () => ({
        prNumber: 42,
        prUrl: 'https://github.com/vishu1803/Ai-job-mcp/pull/42',
        state: 'open',
        draft: true,
        headRef: 'feat/career-hub-redis-8f3a12bc',
        baseRef: 'main',
      }),
      getPullRequestByHead: async () => [],
      closePullRequest: async () => ({ success: true, state: 'closed' }),
    };

    mockApprovalService = {
      consumeTicketForExecution: async () => ({ ...sampleTicket, status: 'EXECUTING' }),
      completeExecution: async (_ctx, { result }) => result,
      failExecution: async () => ({ success: true }),
    };

    writeService = new GitHubWriteService({
      db: mockDb,
      connector: mockConnector,
      actionApprovalTicketService: mockApprovalService,
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Dynamic Permissions & Token Cache Scoping
  // ---------------------------------------------------------------------------
  it('1. Token cache builds distinct partitioned keys for different permission scopes', () => {
    const readKey = buildTokenCacheKey(tenantId, '12345', ['repo-a'], {
      contents: 'read',
      metadata: 'read',
    });
    const writeKey = buildTokenCacheKey(tenantId, '12345', ['repo-a'], {
      contents: 'write',
      pull_requests: 'write',
    });

    assert.notEqual(
      readKey,
      writeKey,
      'Read and write permissions must yield different cache keys'
    );
    assert.match(readKey, /^gh_token:/);
    assert.match(writeKey, /^gh_token:/);
  });

  it('2. Token cache stores and retrieves tokens with matching permission scopes', () => {
    const cache = new GitHubTokenCache();
    const tokenData = {
      token: 'ghs_scoped_write_token',
      expiresAt: new Date(Date.now() + 3600000),
      permissions: { contents: 'write', pull_requests: 'write' },
    };

    cache.set(tenantId, '12345', ['repo-a'], tokenData, tokenData.permissions);

    // Hit with matching write permissions
    const hit = cache.get(tenantId, '12345', ['repo-a'], {
      contents: 'write',
      pull_requests: 'write',
    });
    assert.ok(hit, 'Must retrieve cached token for matching permissions');
    assert.equal(hit.token, 'ghs_scoped_write_token');

    // Miss with read permissions
    const miss = cache.get(tenantId, '12345', ['repo-a'], {
      contents: 'read',
      metadata: 'read',
    });
    assert.equal(miss, null, 'Must not return write token for read request');
  });

  // ---------------------------------------------------------------------------
  // 2. Branch Safety & Protected Branch Enforcement
  // ---------------------------------------------------------------------------
  it('3. Enforces valid feat/career-hub-* branch naming format', () => {
    assert.ok(BRANCH_NAME_REGEX.test('feat/career-hub-redis-123'));
    assert.ok(BRANCH_NAME_REGEX.test('feat/career-hub-graphql-abc'));
    assert.equal(BRANCH_NAME_REGEX.test('main'), false);
    assert.equal(BRANCH_NAME_REGEX.test('feat/arbitrary-branch'), false);
    assert.equal(BRANCH_NAME_REGEX.test('feat/career-hub-CAPITALS'), false);
  });

  it('4. Rejects attempts to target protected branches (main/master/develop)', async () => {
    sampleTicket.targetBranch = 'main';

    const context = { tenantId, userId };
    await assert.rejects(
      async () => writeService.executeApprovedTicket(context, { ticketId }),
      (err) => err instanceof ForbiddenOperationError && err.message.includes('does not match')
    );
  });

  it('5. Rejects when target branch equals base branch', async () => {
    sampleTicket.targetBranch = 'feat/career-hub-test';
    sampleTicket.baseBranch = 'feat/career-hub-test';

    const context = { tenantId, userId };
    await assert.rejects(
      async () => writeService.executeApprovedTicket(context, { ticketId }),
      (err) =>
        err instanceof ForbiddenOperationError && err.message.includes('cannot equal base branch')
    );
  });

  // ---------------------------------------------------------------------------
  // 3. Optimistic Concurrency (expectedHeadSha)
  // ---------------------------------------------------------------------------
  it('6. Rejects execution and fails ticket when live base branch HEAD has diverged', async () => {
    mockConnector.getBranchHeadSha = async () => ({
      commitSha: 'diverged_different_sha_9999999999',
      ref: 'refs/heads/main',
    });

    let failedReason = null;
    mockApprovalService.failExecution = async (_ctx, { failureReason }) => {
      failedReason = failureReason;
      return { success: true };
    };

    const context = { tenantId, userId };
    await assert.rejects(
      async () => writeService.executeApprovedTicket(context, { ticketId }),
      (err) => err instanceof StaleHeadShaError && err.statusCode === 409
    );

    assert.equal(failedReason, 'STALE_BASE_HEAD_SHA');
  });

  // ---------------------------------------------------------------------------
  // 4. Secret Scrubber & Forbidden Paths
  // ---------------------------------------------------------------------------
  it('7. Rejects proposal containing secret in patch file content', async () => {
    sampleTicket.proposal.files[0].content =
      'const API_KEY = "ghp_111111111111111111111111111111111111";';

    const context = { tenantId, userId };
    await assert.rejects(
      async () => writeService.executeApprovedTicket(context, { ticketId }),
      (err) => err instanceof ForbiddenOperationError && err.message.includes('Secret detected')
    );
  });

  it('8. Rejects proposal modifying forbidden path (.github/workflows/ci.yml)', async () => {
    sampleTicket.proposal.files[0].path = '.github/workflows/ci.yml';

    const context = { tenantId, userId };
    await assert.rejects(
      async () => writeService.executeApprovedTicket(context, { ticketId }),
      (err) => err instanceof ForbiddenOperationError && err.message.includes('prohibited')
    );
  });

  // ---------------------------------------------------------------------------
  // 5. Successful Execution Happy Path
  // ---------------------------------------------------------------------------
  it('9. Executes full write pipeline: tree -> commit -> ref -> draft PR -> complete ticket', async () => {
    let treeCreated = false;
    let commitCreated = false;
    let refCreated = false;
    let prCreated = false;
    let ticketCompleted = false;

    mockConnector.createGitTree = async () => {
      treeCreated = true;
      return { treeSha: 'new_tree_sha' };
    };
    mockConnector.createGitCommit = async () => {
      commitCreated = true;
      return { commitSha: 'new_commit_sha' };
    };
    mockConnector.createGitRef = async () => {
      refCreated = true;
      return { ref: sampleTicket.targetBranch, commitSha: 'new_commit_sha' };
    };
    mockConnector.createDraftPullRequest = async () => {
      prCreated = true;
      return {
        prNumber: 99,
        prUrl: 'https://github.com/vishu1803/Ai-job-mcp/pull/99',
        state: 'open',
        draft: true,
      };
    };
    mockApprovalService.completeExecution = async () => {
      ticketCompleted = true;
      return { success: true };
    };

    const context = { tenantId, userId };
    const res = await writeService.executeApprovedTicket(context, { ticketId });

    assert.ok(treeCreated, 'Git tree must be created');
    assert.ok(commitCreated, 'Git commit must be created');
    assert.ok(refCreated, 'Git branch ref must be created');
    assert.ok(prCreated, 'Draft PR must be created');
    assert.ok(ticketCompleted, 'Ticket must be completed');
    assert.equal(res.prNumber, 99);
    assert.equal(res.prUrl, 'https://github.com/vishu1803/Ai-job-mcp/pull/99');
    assert.equal(res.branchName, sampleTicket.targetBranch);
    assert.equal(res.commitSha, 'new_commit_sha');
  });

  // ---------------------------------------------------------------------------
  // 6. Rollback on Partial Failure
  // ---------------------------------------------------------------------------
  it('10. Deletes isolated feature branch when PR creation fails after branch creation', async () => {
    let branchDeleted = false;
    let deletedRef = null;

    mockConnector.createDraftPullRequest = async () => {
      throw new Error('GitHub API timeout while creating pull request');
    };
    mockConnector.deleteGitRef = async (_ctx, _creds, _repo, ref) => {
      branchDeleted = true;
      deletedRef = ref;
      return { success: true };
    };

    const context = { tenantId, userId };
    await assert.rejects(
      async () => writeService.executeApprovedTicket(context, { ticketId }),
      (err) => err.message.includes('timeout while creating pull request')
    );

    assert.ok(branchDeleted, 'Rollback must delete created feature branch');
    assert.equal(deletedRef, sampleTicket.targetBranch);
  });

  // ---------------------------------------------------------------------------
  // 7. Idempotency Recovery
  // ---------------------------------------------------------------------------
  it('11. Discovers existing PR on retry and returns without creating duplicate PR', async () => {
    let createPrCalled = false;
    mockConnector.getPullRequestByHead = async () => [
      {
        number: 42,
        html_url: 'https://github.com/vishu1803/Ai-job-mcp/pull/42',
        state: 'open',
        head: {
          ref: sampleTicket.targetBranch,
          sha: '9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a',
        },
      },
    ];
    mockConnector.createDraftPullRequest = async () => {
      createPrCalled = true;
    };

    const context = { tenantId, userId };
    const res = await writeService.executeApprovedTicket(context, {
      ticketId,
      idempotencyKey: 'retry_key_1',
    });

    assert.equal(createPrCalled, false, 'Must not create duplicate PR');
    assert.equal(res.prNumber, 42);
    assert.equal(res.prUrl, 'https://github.com/vishu1803/Ai-job-mcp/pull/42');
  });

  // ---------------------------------------------------------------------------
  // 8. Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  it('12. Rejects cross-tenant ticket execution with 404 NotFoundError', async () => {
    const foreignTenantId = '88888888-8888-8888-8888-888888888888';
    const context = { tenantId: foreignTenantId, userId };

    await assert.rejects(
      async () => writeService.executeApprovedTicket(context, { ticketId }),
      (err) => err instanceof NotFoundError && err.statusCode === 404
    );
  });
});
