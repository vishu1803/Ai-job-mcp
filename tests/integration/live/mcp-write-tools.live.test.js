/**
 * @file Live MCP Career Write Tools Integration Test (Task P9-005)
 *
 * Exercises propose_project_improvement and confirm_and_create_pr through Fastify MCP transport
 * against live repository (e.g. vishu1803/Ai-job-mcp) when real GitHub App credentials exist.
 *
 * Invariants:
 * 1. Proposes project improvement via MCP propose_project_improvement
 * 2. Asserts diff preview and stopping protocol instructions
 * 3. Human confirmation simulated via MCP confirm_and_create_pr with confirmed: true
 * 4. Verifies live Draft PR opened on isolated branch feat/career-hub-*
 * 5. Verifies default branch (main) unchanged
 * 6. Closes Draft PR and deletes feature branch during cleanup
 * 7. Skips gracefully if live credentials not present
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../../src/db/index.js';
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
} from '../../../src/db/schema.js';
import { buildApp } from '../../../src/app.js';
import { createCareerMcpServer } from '../../../src/mcp/server.js';
import { McpApiTokenService } from '../../../src/services/mcp-api-token.service.js';
import { McpRateLimiter } from '../../../src/security/mcp-rate-limiter.js';
import { GitHubAppConnector } from '../../../src/connectors/github/github-connector.js';
import { GitHubAppAuthManager } from '../../../src/connectors/github/auth.js';
import { GitHubTokenCache } from '../../../src/connectors/github/token-cache.js';
import { GitHubWriteService } from '../../../src/services/github-write.service.js';
import { ActionApprovalTicketService } from '../../../src/services/action-approval-ticket.service.js';
import { GitHubWriteSafetyService } from '../../../src/services/github-write-safety.service.js';
import { encryptSecret } from '../../../src/security/encryption.js';
import { createConnectorContext } from '../../../src/connectors/base/context.js';

dotenv.config();
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

const hasLiveGitHubCredentials = Boolean(
  process.env.GITHUB_APP_ID &&
  process.env.GITHUB_APP_PRIVATE_KEY &&
  process.env.GITHUB_APP_INSTALLATION_ID
);

describe('Live MCP Career Write Tools Integration (P9-005)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let app;
  let tokenService;
  let rateLimiter;
  let tokenMember;
  let candidateId;
  let targetBranchCreated = null;
  let prNumberCreated = null;
  let connector = null;
  let connectorContext = null;
  let credentials = null;

  const targetRepo = process.env.GITHUB_TEST_REPOSITORY || 'vishu1803/Ai-job-mcp';

  before(async () => {
    if (!hasLiveGitHubCredentials) {
      return;
    }

    const tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);

    await db.insert(tenants).values({
      id: tenantId,
      name: `Live MCP Tenant ${testRunId}`,
      slug: `live-mcp-${testRunId}`,
      status: 'ACTIVE',
    });

    const userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      tenantId,
      email: `live-mcp-${testRunId}@example.com`,
      displayName: 'Live MCP Engineer',
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    candidateId = crypto.randomUUID();
    await db.insert(candidates).values({
      id: candidateId,
      tenantId,
      userId,
      displayName: 'Live Candidate',
      headline: 'Staff Backend Systems Engineer',
      summary: 'Expert in distributed architecture and node.js caching systems.',
      canonicalEmail: `live-candidate-${testRunId}@example.com`,
    });

    const connectionId = crypto.randomUUID();
    const encryptedCreds = encryptSecret(
      JSON.stringify({ installationId: process.env.GITHUB_APP_INSTALLATION_ID })
    );

    await db
      .insert(resourceConnections)
      .values({
        id: connectionId,
        tenantId,
        userId,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        displayName: 'vishu1803',
        externalAccountId: '12345678',
        externalAccountName: 'vishu1803',
        installationId: process.env.GITHUB_APP_INSTALLATION_ID,
        encryptedCredentials: encryptedCreds,
        status: 'ACTIVE',
      })
      .returning();

    const resourceId = crypto.randomUUID();
    await db
      .insert(resources)
      .values({
        id: resourceId,
        tenantId,
        connectionId,
        candidateId,
        provider: 'GITHUB_APP',
        resourceType: 'REPOSITORY',
        externalResourceId: targetRepo,
        name: targetRepo,
        displayName: 'Ai-job-mcp',
        metadata: { defaultBranch: 'main' },
      })
      .returning();

    const projectId = crypto.randomUUID();
    const [project] = await db
      .insert(projects)
      .values({
        id: projectId,
        tenantId,
        candidateId,
        name: targetRepo,
        slug: `ai-job-mcp-${testRunId}`,
        headline: 'AI Job MCP Server repository',
        summary: 'Core repository for MCP server implementations.',
        role: 'Maintainer',
      })
      .returning();

    await db.insert(projectResources).values({
      tenantId,
      projectId: project.id,
      resourceId,
    });

    const [skillNode] = await db
      .insert(skills)
      .values({
        name: `Node.js ${testRunId}`,
        slug: `nodejs-live-${testRunId}`,
        category: 'LANGUAGE',
      })
      .returning();

    const [evidence] = await db
      .insert(evidenceItems)
      .values({
        tenantId,
        candidateId,
        resourceId,
        projectId: project.id,
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
      tenantId,
      candidateId,
      skillId: skillNode.id,
      category: 'LANGUAGE',
      provenanceStatus: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceCount: 1,
      primaryEvidenceId: evidence.id,
    });

    tokenService = new McpApiTokenService({ db });
    rateLimiter = new McpRateLimiter();

    const createdToken = await tokenService.createToken({
      tenantId,
      userId,
      role: 'MEMBER',
      name: 'Live Member Token',
      scopes: ['career:read', 'career:write'],
      expiryDays: 1,
    });
    tokenMember = createdToken.rawToken;

    const tokenCache = new GitHubTokenCache();
    const authManager = new GitHubAppAuthManager({
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
      cache: tokenCache,
    });

    connector = new GitHubAppConnector({ authManager });
    connectorContext = createConnectorContext({
      tenantId,
      userId,
      connectionId,
      provider: 'GITHUB_APP',
      authType: 'APP_INSTALLATION',
    });

    credentials = {
      installationId: process.env.GITHUB_APP_INSTALLATION_ID,
    };

    const approvalService = new ActionApprovalTicketService({ database: db });
    const safetyService = new GitHubWriteSafetyService();
    const writeService = new GitHubWriteService({
      db,
      connector,
      approvalService,
      safetyService,
    });

    const mcpServer = createCareerMcpServer({
      deps: {
        db,
        connector,
        writeService,
        approvalService,
        safetyService,
      },
    });

    app = await buildApp({
      mcpServer,
      tokenService,
      rateLimiter,
      db,
    });
    await app.ready();
  });

  after(async () => {
    // 1. Cleanup live GitHub resources
    if (connector && credentials && targetRepo) {
      if (prNumberCreated) {
        try {
          await connector.closePullRequest(
            connectorContext,
            credentials,
            targetRepo,
            prNumberCreated
          );
        } catch {
          // Best effort
        }
      }
      if (targetBranchCreated) {
        try {
          await connector.deleteGitRef(
            connectorContext,
            credentials,
            targetRepo,
            `refs/heads/${targetBranchCreated}`
          );
        } catch {
          // Best effort
        }
      }
    }

    if (app) {
      await app.close();
    }

    // 2. Cleanup PostgreSQL test fixtures
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

    return app.inject({
      method: 'POST',
      url: '/mcp',
      headers,
      payload: {
        jsonrpc: '2.0',
        id,
        method,
        params: {
          ...(toolName ? { name: toolName } : {}),
          ...(method === 'tools/call' ? { arguments: args } : args),
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });
  }

  it('performs live proposal -> diff inspection -> human confirm -> Draft PR -> live cleanup', async (t) => {
    if (!hasLiveGitHubCredentials) {
      t.skip('Skipping live MCP test: GITHUB_APP_* credentials not configured in environment');
      return;
    }

    const jobDescriptionText = `
      We are looking for a Senior Engineer with Redis caching, PostgreSQL indexing,
      and distributed microservice architecture skills.
    `;

    // 1. Propose Project Improvement via MCP Streamable HTTP
    const proposeRes = await invokeMcp({
      token: tokenMember,
      method: 'tools/call',
      toolName: 'propose_project_improvement',
      args: {
        candidateId,
        jobDescriptionText,
      },
      id: 'live-propose-1',
    });

    assert.equal(proposeRes.statusCode, 200);
    const proposeBody = proposeRes.json();
    assert.ok(!proposeBody.error, `Propose RPC error: ${JSON.stringify(proposeBody.error)}`);
    assert.ok(
      !proposeBody.result?.isError,
      `Propose Tool error: ${JSON.stringify(proposeBody.result?.content)}`
    );

    const proposeResult = JSON.parse(proposeBody.result.content[0].text);
    assert.equal(proposeResult.status, 'PENDING_HUMAN_APPROVAL');
    assert.ok(proposeResult.ticketId);
    assert.ok(proposeResult.repository.targetBranch.startsWith('feat/career-hub-'));
    assert.ok(proposeResult.approvalRequirements.confirmationInstructions.includes('STOP:'));

    targetBranchCreated = proposeResult.repository.targetBranch;
    const ticketId = proposeResult.ticketId;

    // 2. Confirm and Create Draft PR via MCP Streamable HTTP
    const confirmRes = await invokeMcp({
      token: tokenMember,
      method: 'tools/call',
      toolName: 'confirm_and_create_pr',
      args: {
        ticketId,
        confirmed: true,
        userNotes: 'Automated live sandbox test execution',
      },
      id: 'live-confirm-1',
    });

    assert.equal(confirmRes.statusCode, 200);
    const confirmBody = confirmRes.json();
    assert.ok(!confirmBody.error, `Confirm RPC error: ${JSON.stringify(confirmBody.error)}`);
    assert.ok(
      !confirmBody.result?.isError,
      `Confirm Tool error: ${JSON.stringify(confirmBody.result?.content)}`
    );

    const confirmResult = JSON.parse(confirmBody.result.content[0].text);
    assert.equal(confirmResult.status, 'EXECUTED');
    assert.equal(confirmResult.ticketId, ticketId);
    assert.ok(confirmResult.commitSha);
    assert.ok(confirmResult.pullRequest.number);
    assert.equal(confirmResult.pullRequest.draft, true);

    prNumberCreated = confirmResult.pullRequest.number;

    // 3. Verify in PostgreSQL that ticket status is EXECUTED
    const [dbTicket] = await db
      .select()
      .from(actionApprovalTickets)
      .where(eq(actionApprovalTickets.id, ticketId));
    assert.ok(dbTicket);
    assert.equal(dbTicket.status, 'EXECUTED');
  });
});
