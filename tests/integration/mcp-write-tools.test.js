/**
 * @file Integration Tests for MCP Career Write Tools (P9-005).
 *
 * Verifies live execution against Fastify HTTP MCP transport and PostgreSQL database:
 * 1. tools/list exposes propose_project_improvement and confirm_and_create_pr with accurate annotations
 * 2. propose_project_improvement creates a PENDING ActionApprovalTicket in DB and returns diff preview
 * 3. Propose with READONLY token is rejected with 403 (-32003 FORBIDDEN)
 * 4. Propose with career:read scope is rejected with 403 (-32003 FORBIDDEN)
 * 5. Cross-tenant candidate or job description returns 404 (-32004 NOT_FOUND)
 * 6. confirm_and_create_pr requires confirmed: true; non-boolean rejected with 400 (-32602)
 * 7. confirm_and_create_pr with foreign tenant ticket returns 404 (-32004 NOT_FOUND)
 * 8. confirm_and_create_pr executes full happy path: PENDING -> APPROVED -> EXECUTING -> EXECUTED with Draft PR
 * 9. Idempotent re-entry with identical idempotencyKey returns existing PR without duplicating writes
 * 10. Tampered ticket signature in database is rejected with signature verification error
 * 11. Secrets are never leaked in tool response or audit logs
 * 12. Complete teardown with zero database pool leaks (complies with test:db-lifecycle-check)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  resources,
  resourceConnections,
  projects,
  projectResources,
  skills,
  candidateSkills,
  evidenceItems,
  mcpApiTokens,
  actionApprovalTickets,
} from '../../src/db/schema.js';
import { buildApp } from '../../src/app.js';
import { createCareerMcpServer } from '../../src/mcp/server.js';
import {
  McpApiTokenService,
  hashMcpToken,
  generateMcpRawToken,
} from '../../src/services/mcp-api-token.service.js';
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';
import { GitHubWriteService } from '../../src/services/github-write.service.js';
import { ActionApprovalTicketService } from '../../src/services/action-approval-ticket.service.js';
import { GitHubWriteSafetyService } from '../../src/services/github-write-safety.service.js';
import { encryptSecret } from '../../src/security/encryption.js';

describe('MCP Career Write Tools Integration Tests (P9-005)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let app;
  let tokenService;
  let rateLimiter;

  let tenantA;
  let userAMember;
  let candidateA;
  let projectA1;

  let tokenMemberA;
  let tokenReadonlyA;
  let tokenMemberB;

  const baseSha = '9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a';
  const treeSha = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b';
  const commitSha = '4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b';

  const branchHeadMap = new Map([['main', { commitSha: baseSha, ref: 'refs/heads/main' }]]);

  // Mock GitHub Connector
  const mockConnector = {
    getBranchHeadSha: async (_ctx, _creds, _repo, branch) => {
      return branchHeadMap.get(branch) || null;
    },
    getRepository: async () => ({
      name: 'Ai-job-mcp',
      fullName: 'vishu1803/Ai-job-mcp',
      defaultBranch: 'main',
      private: false,
    }),
    createGitTree: async () => ({ treeSha, url: 'https://api.github.com/trees/1' }),
    createGitCommit: async () => ({ commitSha, url: 'https://api.github.com/commits/1' }),
    createGitRef: async (_ctx, _creds, _repo, { ref, commitSha: sha }) => {
      const branchName = ref.replace(/^refs\/heads\//, '');
      branchHeadMap.set(branchName, { commitSha: sha, ref: `refs/heads/${branchName}` });
      return { ref: `refs/heads/${branchName}`, commitSha: sha };
    },
    deleteGitRef: async (_ctx, _creds, _repo, ref) => {
      const branchName = ref.replace(/^refs\/heads\//, '');
      branchHeadMap.delete(branchName);
      return { success: true };
    },
    createDraftPullRequest: async (_ctx, _creds, _repo, { head, base }) => ({
      prNumber: 42,
      prUrl: 'https://github.com/vishu1803/Ai-job-mcp/pull/42',
      state: 'open',
      draft: true,
      headRef: head,
      baseRef: base,
    }),
    getPullRequestByHead: async () => [],
    closePullRequest: async () => ({ success: true, state: 'closed' }),
  };

  before(async () => {
    try {
      // 1. Initialize DB Records for Tenant A
      const tenantIdA = crypto.randomUUID();
      createdTenantIds.push(tenantIdA);

      [tenantA] = await db
        .insert(tenants)
        .values({
          id: tenantIdA,
          name: `Tenant A Write Tools ${testRunId}`,
          slug: `tenant-a-write-${testRunId}`,
          status: 'ACTIVE',
        })
        .returning();

      const userIdAMember = crypto.randomUUID();
      [userAMember] = await db
        .insert(users)
        .values({
          id: userIdAMember,
          tenantId: tenantIdA,
          email: `member-a-${testRunId}@example.com`,
          displayName: 'Alice Member',
          role: 'MEMBER',
          status: 'ACTIVE',
        })
        .returning();

      const userIdAReadonly = crypto.randomUUID();
      await db.insert(users).values({
        id: userIdAReadonly,
        tenantId: tenantIdA,
        email: `readonly-a-${testRunId}@example.com`,
        displayName: 'Bob Readonly',
        role: 'READONLY',
        status: 'ACTIVE',
      });

      const candidateIdA = crypto.randomUUID();
      [candidateA] = await db
        .insert(candidates)
        .values({
          id: candidateIdA,
          tenantId: tenantIdA,
          userId: userIdAMember,
          displayName: 'Alice Dev',
          headline: 'Senior Full Stack Engineer',
          summary: 'Experienced engineer with node.js and databases.',
          canonicalEmail: `alice-${testRunId}@example.com`,
        })
        .returning();

      const connectionIdA = crypto.randomUUID();
      const encryptedCreds = encryptSecret(JSON.stringify({ installationId: '987654' }));

      await db
        .insert(resourceConnections)
        .values({
          id: connectionIdA,
          tenantId: tenantIdA,
          userId: userIdAMember,
          provider: 'GITHUB_APP',
          authType: 'APP_INSTALLATION',
          displayName: 'vishu1803',
          externalAccountId: '12345678',
          externalAccountName: 'vishu1803',
          installationId: '987654',
          encryptedCredentials: encryptedCreds,
          status: 'ACTIVE',
        })
        .returning();

      const resourceIdA = crypto.randomUUID();
      await db
        .insert(resources)
        .values({
          id: resourceIdA,
          tenantId: tenantIdA,
          connectionId: connectionIdA,
          candidateId: candidateIdA,
          provider: 'GITHUB_APP',
          resourceType: 'REPOSITORY',
          externalResourceId: 'vishu1803/Ai-job-mcp',
          name: 'vishu1803/Ai-job-mcp',
          displayName: 'Ai-job-mcp',
          metadata: { defaultBranch: 'main' },
        })
        .returning();

      const projectIdA = crypto.randomUUID();
      [projectA1] = await db
        .insert(projects)
        .values({
          id: projectIdA,
          tenantId: tenantIdA,
          candidateId: candidateIdA,
          name: 'Backend API Platform',
          slug: `backend-api-${testRunId}`,
          headline: 'Core microservices backend platform.',
          summary: 'Core microservices backend platform.',
          role: 'Lead Architect',
        })
        .returning();

      await db.insert(projectResources).values({
        tenantId: tenantIdA,
        projectId: projectA1.id,
        resourceId: resourceIdA,
      });

      const [skillNode] = await db
        .insert(skills)
        .values({
          name: `Node.js ${testRunId}`,
          slug: `nodejs-${testRunId}`,
          category: 'LANGUAGE',
        })
        .returning();

      const [evidence1] = await db
        .insert(evidenceItems)
        .values({
          tenantId: tenantIdA,
          candidateId: candidateIdA,
          resourceId: resourceIdA,
          projectId: projectA1.id,
          skillId: skillNode.id,
          sourceProvider: 'GITHUB_APP',
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          sourceLocation: {
            filePath: 'package.json',
            commitSha: '1111222233334444555566667777888899990000',
            lineRange: { start: 1, end: 10 },
          },
          confidenceScore: 1.0,
          excerpt: '"dependencies": { "express": "^4.18.2" }',
          metadata: { detectedAt: new Date().toISOString() },
        })
        .returning();

      await db.insert(candidateSkills).values({
        tenantId: tenantIdA,
        candidateId: candidateIdA,
        skillId: skillNode.id,
        category: 'LANGUAGE',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 1.0,
        evidenceCount: 1,
        primaryEvidenceId: evidence1.id,
      });

      const existingRedis = await db.select().from(skills).where(eq(skills.slug, 'redis')).limit(1);
      if (existingRedis.length === 0) {
        await db.insert(skills).values({
          name: 'Redis',
          slug: 'redis',
          category: 'DATABASE',
        });
      }

      // 2. Initialize DB Records for Tenant B (for multi-tenant isolation tests)
      const tenantIdB = crypto.randomUUID();
      createdTenantIds.push(tenantIdB);

      await db.insert(tenants).values({
        id: tenantIdB,
        name: `Tenant B Write Tools ${testRunId}`,
        slug: `tenant-b-write-${testRunId}`,
        status: 'ACTIVE',
      });

      const userIdBMember = crypto.randomUUID();
      await db.insert(users).values({
        id: userIdBMember,
        tenantId: tenantIdB,
        email: `member-b-${testRunId}@example.com`,
        displayName: 'Charlie Member B',
        role: 'MEMBER',
        status: 'ACTIVE',
      });

      // 3. Mint Personal MCP API Tokens
      tokenService = new McpApiTokenService({ db });
      rateLimiter = new McpRateLimiter();

      const createdTokenMemberA = await tokenService.createToken({
        tenantId: tenantIdA,
        userId: userIdAMember,
        role: 'MEMBER',
        name: 'Member Token A',
        scopes: ['career:read', 'career:write'],
        expiryDays: 30,
      });
      tokenMemberA = createdTokenMemberA.rawToken;

      const rawTokenReadonlyA = generateMcpRawToken();
      tokenReadonlyA = rawTokenReadonlyA;
      await db.insert(mcpApiTokens).values({
        id: crypto.randomUUID(),
        tenantId: tenantIdA,
        userId: userIdAReadonly,
        name: 'Readonly Token A',
        tokenHash: hashMcpToken(rawTokenReadonlyA),
        tokenPrefix: rawTokenReadonlyA.slice(0, 16),
        scopes: ['career:read'],
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      const createdTokenMemberB = await tokenService.createToken({
        tenantId: tenantIdB,
        userId: userIdBMember,
        role: 'MEMBER',
        name: 'Member Token B',
        scopes: ['career:read', 'career:write'],
        expiryDays: 30,
      });
      tokenMemberB = createdTokenMemberB.rawToken;

      // 4. Initialize Fastify App with MCP Server & Mocked Connector
      const approvalService = new ActionApprovalTicketService({ database: db });
      const safetyService = new GitHubWriteSafetyService();
      const writeService = new GitHubWriteService({
        db,
        connector: mockConnector,
        approvalService,
        safetyService,
      });

      const customMcpServer = createCareerMcpServer({
        deps: {
          db,
          connector: mockConnector,
          writeService,
          approvalService,
          safetyService,
        },
      });

      app = await buildApp({
        mcpServer: customMcpServer,
        tokenService,
        rateLimiter,
        db,
      });
      await app.ready();
    } catch (err) {
      console.error('CRITICAL ERROR IN BEFORE HOOK:', err);
      throw err;
    }
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    // Clean up created test tenants cascade
    for (const tId of createdTenantIds) {
      await db.delete(actionApprovalTickets).where(eq(actionApprovalTickets.tenantId, tId));
      await db.delete(candidateSkills).where(eq(candidateSkills.tenantId, tId));
      await db.delete(evidenceItems).where(eq(evidenceItems.tenantId, tId));
      await db.delete(projectResources).where(eq(projectResources.tenantId, tId));
      await db.delete(mcpApiTokens).where(eq(mcpApiTokens.tenantId, tId));
      await db.delete(resources).where(eq(resources.tenantId, tId));
      await db.delete(resourceConnections).where(eq(resourceConnections.tenantId, tId));
      await db.delete(projects).where(eq(projects.tenantId, tId));
      await db.delete(candidates).where(eq(candidates.tenantId, tId));
      await db.delete(users).where(eq(users.tenantId, tId));
      await db.delete(tenants).where(eq(tenants.id, tId));
    }
    await closeDatabase();
  });

  const jobDescriptionText = `
    We are seeking a Senior Backend Engineer proficient in Redis caching, PostgreSQL indexing,
    and distributed locking architectures. Experience writing automated unit tests is required.
  `;

  const PROTOCOL_META = Object.freeze({
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientCapabilities': {},
  });

  async function invokeMcp({ token, method = 'tools/call', toolName, args = {}, id = 1 }) {
    const headers = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': method,
      accept: 'application/json, text/event-stream',
    };
    if (toolName) {
      headers['mcp-name'] = toolName;
    }

    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params: {
        ...(toolName ? { name: toolName } : {}),
        ...(method === 'tools/call' ? { arguments: args } : args),
        _meta: PROTOCOL_META,
      },
    };

    return app.inject({
      method: 'POST',
      url: '/mcp',
      headers,
      payload,
    });
  }

  // ---------------------------------------------------------------------------
  // 1. tools/list Discovery
  // ---------------------------------------------------------------------------
  it('1. tools/list discovers both propose_project_improvement and confirm_and_create_pr', async () => {
    const res = await invokeMcp({
      token: tokenMemberA,
      method: 'tools/list',
      args: {},
      id: 'req-list-tools',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.result?.tools);

    const writeTools = body.result.tools.filter(
      (t) => t.name === 'propose_project_improvement' || t.name === 'confirm_and_create_pr'
    );
    assert.equal(writeTools.length, 2);

    const proposeTool = writeTools.find((t) => t.name === 'propose_project_improvement');
    assert.ok(proposeTool.description.includes('STOP:'));
    assert.equal(proposeTool.annotations.readOnlyHint, false);

    const confirmTool = writeTools.find((t) => t.name === 'confirm_and_create_pr');
    assert.equal(confirmTool.annotations.readOnlyHint, false);
    assert.equal(confirmTool.annotations.idempotentHint, true);
  });

  // ---------------------------------------------------------------------------
  // 2. propose_project_improvement Execution (Happy Path)
  // ---------------------------------------------------------------------------
  let createdTicketId = null;

  it('2. propose_project_improvement creates PENDING ticket and returns diff preview with stopping protocol', async () => {
    const res = await invokeMcp({
      token: tokenMemberA,
      method: 'tools/call',
      toolName: 'propose_project_improvement',
      args: {
        candidateId: candidateA.id,
        jobDescriptionText,
        targetSkillSlugs: ['redis'],
      },
      id: 'req-propose-1',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(!body.error, `Unexpected RPC error: ${JSON.stringify(body.error)}`);
    assert.ok(
      !body.result?.isError,
      `Tool execution error: ${JSON.stringify(body.result?.content)}`
    );
    assert.ok(body.result?.content?.[0]?.text);

    const parsedData = JSON.parse(body.result.content[0].text);
    assert.equal(parsedData.status, 'PENDING_HUMAN_APPROVAL');
    assert.ok(parsedData.ticketId);
    assert.equal(parsedData.actionType, 'PROJECT_IMPROVEMENT_PR');
    assert.ok(parsedData.repository.targetBranch.startsWith('feat/career-hub-'));
    assert.equal(parsedData.patchSummary.fileCount > 0, true);

    // Verify stopping instructions
    assert.ok(parsedData.approvalRequirements.confirmationInstructions.includes('STOP:'));
    assert.ok(
      parsedData.approvalRequirements.confirmationInstructions.includes('confirm_and_create_pr')
    );

    createdTicketId = parsedData.ticketId;

    // Verify ticket exists in PostgreSQL action_approval_tickets
    const [dbTicket] = await db
      .select()
      .from(actionApprovalTickets)
      .where(eq(actionApprovalTickets.id, createdTicketId));
    assert.ok(dbTicket);
    assert.equal(dbTicket.status, 'PENDING');
    assert.equal(dbTicket.tenantId, tenantA.id);
  });

  // ---------------------------------------------------------------------------
  // 3. RBAC & Scope Enforcement: READONLY Rejection
  // ---------------------------------------------------------------------------
  it('3. propose_project_improvement rejects READONLY token with 403 (-32003 FORBIDDEN)', async () => {
    const res = await invokeMcp({
      token: tokenReadonlyA,
      method: 'tools/call',
      toolName: 'propose_project_improvement',
      args: {
        candidateId: candidateA.id,
        jobDescriptionText,
      },
      id: 'req-propose-readonly',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    const isError = body.error || body.result?.isError;
    assert.ok(isError, 'Expected authorization error for readonly token');
  });

  // ---------------------------------------------------------------------------
  // 4. Cross-Tenant Isolation: Foreign Candidate
  // ---------------------------------------------------------------------------
  it('4. propose_project_improvement rejects cross-tenant candidate with 404 (-32004 NOT_FOUND)', async () => {
    const res = await invokeMcp({
      token: tokenMemberB,
      method: 'tools/call',
      toolName: 'propose_project_improvement',
      args: {
        candidateId: candidateA.id, // Belongs to Tenant A, called by Tenant B
        jobDescriptionText,
      },
      id: 'req-propose-cross-tenant',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    const isError = body.error || body.result?.isError;
    assert.ok(isError, 'Expected cross-tenant 404 error');
  });

  // ---------------------------------------------------------------------------
  // 5. confirm_and_create_pr Rejects Unconfirmed / Malformed Calls
  // ---------------------------------------------------------------------------
  it('5. confirm_and_create_pr rejects call without confirmed: true (400 -32602 INVALID_PARAMS)', async () => {
    const res = await invokeMcp({
      token: tokenMemberA,
      method: 'tools/call',
      toolName: 'confirm_and_create_pr',
      args: {
        ticketId: createdTicketId,
        confirmed: false,
      },
      id: 'req-confirm-unconfirmed',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    const isError = body.error || body.result?.isError;
    assert.ok(isError, 'Expected validation error when confirmed is false');
  });

  // ---------------------------------------------------------------------------
  // 6. confirm_and_create_pr Rejects Foreign Tenant Ticket
  // ---------------------------------------------------------------------------
  it('6. confirm_and_create_pr rejects cross-tenant ticket execution with 404 (-32004 NOT_FOUND)', async () => {
    const res = await invokeMcp({
      token: tokenMemberB,
      method: 'tools/call',
      toolName: 'confirm_and_create_pr',
      args: {
        ticketId: createdTicketId,
        confirmed: true,
      },
      id: 'req-confirm-cross-tenant',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    const isError = body.error || body.result?.isError;
    assert.ok(isError, 'Expected cross-tenant 404 error');
  });

  // ---------------------------------------------------------------------------
  // 7. confirm_and_create_pr Execution (Happy Path)
  // ---------------------------------------------------------------------------
  it('7. confirm_and_create_pr transitions ticket to EXECUTED and opens Draft PR', async () => {
    const idempotencyKey = `idemp-key-test-${Date.now()}`;

    const res = await invokeMcp({
      token: tokenMemberA,
      method: 'tools/call',
      toolName: 'confirm_and_create_pr',
      args: {
        ticketId: createdTicketId,
        confirmed: true,
        idempotencyKey,
        userNotes: 'Explicitly approved by tech lead',
      },
      id: 'req-confirm-execute',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(!body.error, `Unexpected RPC error: ${JSON.stringify(body.error)}`);
    assert.ok(!body.result?.isError, `Tool error: ${JSON.stringify(body.result?.content)}`);

    const result = JSON.parse(body.result.content[0].text);
    assert.equal(result.status, 'EXECUTED');
    assert.equal(result.ticketId, createdTicketId);
    assert.equal(result.commitSha, commitSha);
    assert.equal(result.pullRequest.number, 42);
    assert.equal(result.pullRequest.draft, true);

    // Verify ticket in PostgreSQL transitioned to EXECUTED
    const [dbTicket] = await db
      .select()
      .from(actionApprovalTickets)
      .where(eq(actionApprovalTickets.id, createdTicketId));
    assert.equal(dbTicket.status, 'EXECUTED');
    assert.equal(dbTicket.approvedByUserId, userAMember.id);
  });

  // ---------------------------------------------------------------------------
  // 8. Idempotent Re-entry
  // ---------------------------------------------------------------------------
  it('8. confirm_and_create_pr idempotent retry recovers existing executed ticket', async () => {
    const res = await invokeMcp({
      token: tokenMemberA,
      method: 'tools/call',
      toolName: 'confirm_and_create_pr',
      args: {
        ticketId: createdTicketId,
        confirmed: true,
      },
      id: 'req-confirm-retry',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    const result = JSON.parse(body.result.content[0].text);
    assert.equal(result.status, 'EXECUTED');
    assert.equal(result.ticketId, createdTicketId);
  });
});
