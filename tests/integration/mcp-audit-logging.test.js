/**
 * @file Live Integration Tests for MCP Audit Logging (P7-006 — 2026-07-28 Standard)
 *
 * Runs against live PostgreSQL database and Fastify Streamable HTTP transport:
 * 1. Live Read Tool Invocation -> creates row in `audit_logs` with event_type = 'mcp.tool.completed'.
 * 2. Live Artifact Tool Invocation -> creates row in `audit_logs` with telemetry and sanitized params.
 * 3. Live RBAC Denial (READONLY calling write tool) -> creates row in `audit_logs` with event_type = 'mcp.tool.denied' (403 / -32003).
 * 4. Live Rate Limit Denial -> creates row in `audit_logs` with event_type = 'mcp.tool.denied' (429 / -32029).
 * 5. Correlation ID Match -> x-request-id header matches audit_logs.request_id exactly.
 * 6. Multi-Tenant Default-Deny Isolation -> Tenant A cannot view Tenant B audit events.
 * 7. Zero Plaintext Tokens in Database -> Database stores only sanitized details and safe prefixes.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  skills,
  candidateSkills,
  projects,
  projectResources,
  resources,
  evidenceItems,
  mcpApiTokens,
  auditLogs,
} from '../../src/db/schema.js';
import { buildApp } from '../../src/app.js';
import { createCareerMcpServer } from '../../src/mcp/server.js';
import {
  McpApiTokenService,
  hashMcpToken,
  generateMcpRawToken,
} from '../../src/services/mcp-api-token.service.js';
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';
import { McpAuditService } from '../../src/services/mcp-audit.service.js';

describe('Live MCP Audit Logging Integration Tests (P7-006)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let app;
  let tokenService;
  let rateLimiter;
  let auditService;

  let tenantA;
  let userA_Owner;
  let userA_ReadOnly;
  let candidateA;
  let projectA1;
  let resourceA1;
  let skillGo;
  let evidenceA1;

  let tenantB;
  let userB_Owner;

  let rawTokenA_Owner;
  let rawTokenA_ReadOnly;
  let rawTokenB_Owner;

  const PROTOCOL_META = Object.freeze({
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientCapabilities': {
      roots: { listChanged: false },
      sampling: {},
    },
  });

  before(async () => {
    // 1. Provision Tenant A & Users
    const [tA] = await db
      .insert(tenants)
      .values({
        name: `MCP Audit Tenant A ${testRunId}`,
        slug: `mcp-audit-a-${testRunId}`,
        tier: 'PRO',
      })
      .returning();
    tenantA = tA;
    createdTenantIds.push(tenantA.id);

    const [uA_Owner] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `owner-a-${testRunId}@example.com`,
        displayName: 'Alice Owner A',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();
    userA_Owner = uA_Owner;

    const [uA_ReadOnly] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `readonly-a-${testRunId}@example.com`,
        displayName: 'Alice ReadOnly A',
        role: 'READONLY',
        status: 'ACTIVE',
      })
      .returning();
    userA_ReadOnly = uA_ReadOnly;

    // 2. Provision Tenant B & User
    const [tB] = await db
      .insert(tenants)
      .values({
        name: `MCP Audit Tenant B ${testRunId}`,
        slug: `mcp-audit-b-${testRunId}`,
        tier: 'PRO',
      })
      .returning();
    tenantB = tB;
    createdTenantIds.push(tenantB.id);

    const [uB_Owner] = await db
      .insert(users)
      .values({
        tenantId: tenantB.id,
        email: `owner-b-${testRunId}@example.com`,
        displayName: 'Bob Owner B',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();
    userB_Owner = uB_Owner;

    // 3. Create Candidate, Project, Skill, and Evidence in Tenant A
    const [candA] = await db
      .insert(candidates)
      .values({
        tenantId: tenantA.id,
        userId: userA_Owner.id,
        displayName: 'Alice Test Candidate',
        headline: 'Lead Cloud Architect',
        summary: 'Lead Cloud Architect with Go and PostgreSQL expertise.',
        canonicalEmail: userA_Owner.email,
        status: 'ACTIVE',
      })
      .returning();
    candidateA = candA;

    const existingGo = await db.select().from(skills).where(eq(skills.slug, 'go')).limit(1);
    if (existingGo.length > 0) {
      skillGo = existingGo[0];
    } else {
      [skillGo] = await db
        .insert(skills)
        .values({
          slug: 'go',
          name: 'Go',
          category: 'LANGUAGE',
        })
        .returning();
    }

    [resourceA1] = await db
      .insert(resources)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        provider: 'GITHUB_APP',
        externalResourceId: `repo-audit-${testRunId}`,
        name: 'acme/distributed-orchestrator',
        displayName: 'acme/distributed-orchestrator',
        url: 'https://github.com/acme/distributed-orchestrator',
        isPrivate: false,
        status: 'ACTIVE',
      })
      .returning();

    [projectA1] = await db
      .insert(projects)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        name: 'Distributed Cloud Orchestrator',
        slug: `distributed-orchestrator-${testRunId}`,
        headline: 'Distributed Workflow Coordinator',
        summary: 'High-throughput distributed workflow coordinator in Go and PostgreSQL.',
        role: 'Lead Architect',
        isHighlighted: true,
      })
      .returning();

    await db.insert(projectResources).values({
      tenantId: tenantA.id,
      projectId: projectA1.id,
      resourceId: resourceA1.id,
    });

    [evidenceA1] = await db
      .insert(evidenceItems)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        resourceId: resourceA1.id,
        projectId: projectA1.id,
        skillId: skillGo.id,
        evidenceType: 'CODE_IMPORT_USAGE',
        sourceProvider: 'GITHUB_APP',
        sourceLocation: {
          filePath: 'go.mod',
          commitSha: 'a'.repeat(40),
        },
        excerpt: 'module github.com/acme/distributed-orchestrator',
        confidenceScore: 0.95,
        detectedAt: new Date(),
      })
      .returning();

    await db.insert(candidateSkills).values({
      tenantId: tenantA.id,
      candidateId: candidateA.id,
      skillId: skillGo.id,
      category: 'LANGUAGE',
      provenanceStatus: 'VERIFIED',
      primaryEvidenceId: evidenceA1.id,
      confidenceScore: 0.95,
      evidenceCount: 1,
    });

    // 4. Provision Dedicated MCP API Tokens
    tokenService = new McpApiTokenService({ db, nodeEnv: 'test' });
    rateLimiter = new McpRateLimiter();
    auditService = new McpAuditService({ db });

    // Token A Owner (all scopes)
    rawTokenA_Owner = generateMcpRawToken('test');
    await db.insert(mcpApiTokens).values({
      tenantId: tenantA.id,
      userId: userA_Owner.id,
      name: 'Owner Token A',
      tokenPrefix: rawTokenA_Owner.slice(0, 16),
      tokenHash: hashMcpToken(rawTokenA_Owner),
      scopes: ['career:read', 'career:write', 'career:export', 'career:admin'],
      status: 'ACTIVE',
      clientType: 'PERSONAL',
    });

    // Token A ReadOnly (career:read only)
    rawTokenA_ReadOnly = generateMcpRawToken('test');
    await db.insert(mcpApiTokens).values({
      tenantId: tenantA.id,
      userId: userA_ReadOnly.id,
      name: 'ReadOnly Token A',
      tokenPrefix: rawTokenA_ReadOnly.slice(0, 16),
      tokenHash: hashMcpToken(rawTokenA_ReadOnly),
      scopes: ['career:read'],
      status: 'ACTIVE',
      clientType: 'PERSONAL',
    });

    // Token B Owner
    rawTokenB_Owner = generateMcpRawToken('test');
    await db.insert(mcpApiTokens).values({
      tenantId: tenantB.id,
      userId: userB_Owner.id,
      name: 'Owner Token B',
      tokenPrefix: rawTokenB_Owner.slice(0, 16),
      tokenHash: hashMcpToken(rawTokenB_Owner),
      scopes: ['career:read', 'career:write'],
      status: 'ACTIVE',
      clientType: 'PERSONAL',
    });

    // 5. Build Fastify App with MCP routes & services
    const mcpServer = createCareerMcpServer({ deps: { db } });
    app = buildApp({
      db,
      tokenService,
      rateLimiter,
      auditService,
      mcpServer,
      logger: false,
    });
    await app.ready();
  });

  after(async () => {
    if (app) await app.close();
    if (createdTenantIds.length > 0) {
      for (const tId of createdTenantIds) {
        await db
          .delete(tenants)
          .where(eq(tenants.id, tId))
          .catch(() => {});
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Live Read Tool Invocation creates PostgreSQL audit_log row
  // ---------------------------------------------------------------------------
  it('1. POST /mcp executing read tool creates PostgreSQL audit_log row with event_type = mcp.tool.completed', async () => {
    const requestId = crypto.randomUUID();

    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${rawTokenA_Owner}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'get_candidate_profile',
        'x-request-id': requestId,
        'user-agent': 'LiveIntegrationTest/1.0',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-read-audit-1',
        method: 'tools/call',
        params: {
          name: 'get_candidate_profile',
          arguments: {
            candidateId: candidateA.id,
          },
          _meta: PROTOCOL_META,
        },
      },
    });

    assert.strictEqual(response.statusCode, 200);

    // Verify row created in PostgreSQL audit_logs
    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantA.id), eq(auditLogs.requestId, requestId)));

    assert.strictEqual(rows.length, 1);
    const auditRow = rows[0];

    assert.strictEqual(auditRow.tenantId, tenantA.id);
    assert.strictEqual(auditRow.userId, userA_Owner.id);
    assert.strictEqual(auditRow.eventType, 'mcp.tool.completed');
    assert.strictEqual(auditRow.resourceType, 'mcp_tool');
    assert.strictEqual(auditRow.resourceId, 'get_candidate_profile');
    assert.strictEqual(auditRow.userAgent, 'LiveIntegrationTest/1.0');
    assert.strictEqual(auditRow.details.toolName, 'get_candidate_profile');
    assert.strictEqual(auditRow.details.statusCode, 200);
    assert.strictEqual(auditRow.details.isError, false);
    assert.strictEqual(auditRow.details.role, 'OWNER');
    assert.ok(auditRow.details.durationMs >= 0);
  });

  // ---------------------------------------------------------------------------
  // 2. Live Artifact Tool Invocation creates PostgreSQL audit_log row
  // ---------------------------------------------------------------------------
  it('2. POST /mcp executing artifact tool creates PostgreSQL audit_log row with sanitized parameters and summary', async () => {
    const requestId = crypto.randomUUID();

    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${rawTokenA_Owner}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'recommend_portfolio_projects',
        'x-request-id': requestId,
        'user-agent': 'GeminiEnterprise/2.0',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-artifact-audit-2',
        method: 'tools/call',
        params: {
          name: 'recommend_portfolio_projects',
          arguments: {
            candidateId: candidateA.id,
            jobDescriptionText:
              'Seeking a Staff Distributed Systems Engineer with expertise in Go, PostgreSQL, high-throughput systems, and consensus protocols.',
            maxFeaturedProjects: 2,
          },
          _meta: PROTOCOL_META,
        },
      },
    });

    assert.strictEqual(response.statusCode, 200);

    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantA.id), eq(auditLogs.requestId, requestId)));

    assert.strictEqual(rows.length, 1);
    const auditRow = rows[0];

    assert.strictEqual(auditRow.eventType, 'mcp.tool.completed');
    assert.strictEqual(auditRow.resourceId, 'recommend_portfolio_projects');
    assert.strictEqual(auditRow.userAgent, 'GeminiEnterprise/2.0');
    assert.strictEqual(auditRow.details.toolName, 'recommend_portfolio_projects');
    assert.strictEqual(auditRow.details.parameters.maxFeaturedProjects, 2);
    assert.ok(auditRow.details.parameters.jobDescriptionText);
  });

  // ---------------------------------------------------------------------------
  // 3. Live RBAC Denial creates PostgreSQL audit_log row
  // ---------------------------------------------------------------------------
  it('3. POST /mcp RBAC denial (READONLY calling draft_cover_letter) records mcp.tool.denied with 403 / -32003', async () => {
    const requestId = crypto.randomUUID();

    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${rawTokenA_ReadOnly}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'draft_cover_letter',
        'x-request-id': requestId,
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-rbac-audit-3',
        method: 'tools/call',
        params: {
          name: 'draft_cover_letter',
          arguments: {
            candidateId: candidateA.id,
            jobDescriptionText:
              'Seeking a Principal Engineer with Go and PostgreSQL expertise for distributed systems.',
          },
          _meta: PROTOCOL_META,
        },
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = response.json();
    assert.ok(body.error || body.result?.isError, 'Expected JSON-RPC error payload');

    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantA.id), eq(auditLogs.requestId, requestId)));

    assert.strictEqual(rows.length, 1);
    const auditRow = rows[0];

    assert.strictEqual(auditRow.eventType, 'mcp.tool.denied');
    assert.strictEqual(auditRow.userId, userA_ReadOnly.id);
    assert.strictEqual(auditRow.resourceId, 'draft_cover_letter');
    assert.strictEqual(auditRow.details.statusCode, 403);
    assert.strictEqual(auditRow.details.errorCode, -32003);
    assert.strictEqual(auditRow.details.isError, true);
  });

  // ---------------------------------------------------------------------------
  // 4. Live Rate Limit Denial creates PostgreSQL audit_log row
  // ---------------------------------------------------------------------------
  it('4. POST /mcp Rate Limit Denial records mcp.tool.denied with 429 / -32029', async () => {
    const strictRateLimiter = new McpRateLimiter({ toolLimit: 0 }); // Instant tool limit breach
    const customApp = buildApp({
      db,
      tokenService,
      rateLimiter: strictRateLimiter,
      auditService,
      logger: false,
    });
    await customApp.ready();

    const requestId = crypto.randomUUID();

    const response = await customApp.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${rawTokenA_Owner}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'list_verified_skills',
        'x-request-id': requestId,
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-rate-limit-audit-4',
        method: 'tools/call',
        params: {
          name: 'list_verified_skills',
          arguments: {
            candidateId: candidateA.id,
          },
          _meta: PROTOCOL_META,
        },
      },
    });

    assert.strictEqual(response.statusCode, 429);

    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantA.id), eq(auditLogs.requestId, requestId)));

    assert.strictEqual(rows.length, 1);
    const auditRow = rows[0];

    assert.strictEqual(auditRow.eventType, 'mcp.tool.denied');
    assert.strictEqual(auditRow.resourceId, 'list_verified_skills');
    assert.strictEqual(auditRow.details.statusCode, 429);
    assert.strictEqual(auditRow.details.errorCode, -32029);

    await customApp.close();
  });

  // ---------------------------------------------------------------------------
  // 5. Correlation ID Match
  // ---------------------------------------------------------------------------
  it('5. x-request-id header returned to client matches database audit_logs.request_id', async () => {
    const requestId = crypto.randomUUID();

    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${rawTokenA_Owner}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'get_candidate_profile',
        'x-request-id': requestId,
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-corr-5',
        method: 'tools/call',
        params: {
          name: 'get_candidate_profile',
          arguments: {
            candidateId: candidateA.id,
          },
          _meta: PROTOCOL_META,
        },
      },
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers['x-request-id'], requestId);

    const [row] = await db.select().from(auditLogs).where(eq(auditLogs.requestId, requestId));

    assert.ok(row);
    assert.strictEqual(row.requestId, requestId);
  });

  // ---------------------------------------------------------------------------
  // 6. Multi-Tenant Default-Deny Isolation
  // ---------------------------------------------------------------------------
  it('6. Tenant A cannot see Tenant B audit log records in listAuditLogs query', async () => {
    // Generate event in Tenant B
    const reqIdB = crypto.randomUUID();
    await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${rawTokenB_Owner}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'get_candidate_profile',
        'x-request-id': reqIdB,
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-tenant-b-audit',
        method: 'tools/call',
        params: {
          name: 'get_candidate_profile',
          arguments: {
            candidateId: crypto.randomUUID(),
          },
          _meta: PROTOCOL_META,
        },
      },
    });

    // Query Tenant A audit logs
    const contextA = {
      tenantId: tenantA.id,
      userId: userA_Owner.id,
      role: 'OWNER',
      tokenScopes: ['career:read', 'career:admin'],
    };

    const auditListA = await auditService.listAuditLogs(contextA, { limit: 100 });

    assert.ok(auditListA.items.length > 0);
    for (const item of auditListA.items) {
      assert.strictEqual(
        item.tenantId,
        tenantA.id,
        'Audit list must contain ZERO foreign tenant records'
      );
      assert.notStrictEqual(item.tenantId, tenantB.id);
    }
  });

  // ---------------------------------------------------------------------------
  // 7. Zero Plaintext Secrets in Database Audit Rows
  // ---------------------------------------------------------------------------
  it('7. guarantees zero plaintext API keys or passwords exist anywhere in audit_logs database records', async () => {
    const allAuditRows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantA.id));

    assert.ok(allAuditRows.length > 0);

    for (const row of allAuditRows) {
      const serialized = JSON.stringify(row);
      assert.strictEqual(
        serialized.includes(rawTokenA_Owner),
        false,
        'Must never store full raw API token in audit log database row'
      );
      assert.strictEqual(
        serialized.includes(rawTokenA_ReadOnly),
        false,
        'Must never store full raw API token in audit log database row'
      );
      assert.strictEqual(
        serialized.includes('secret_bearer_token'),
        false,
        'Must never store secret tokens in audit log database row'
      );
    }
  });
});
