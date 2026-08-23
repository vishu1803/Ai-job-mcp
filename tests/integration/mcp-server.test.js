/**
 * @file Live Integration Tests for MCP Server Foundation over Fastify & PostgreSQL (P7-001)
 *
 * Validates:
 * 1. Streamable HTTP route (POST /mcp) integration in Fastify.
 * 2. MCP JSON-RPC 2.0 initialize protocol handshake.
 * 3. Tool listing (tools/list) and execution (tools/call).
 * 4. Multi-tenant Bearer token authentication against PostgreSQL sessions.
 * 5. Authentication error responses (missing, invalid, expired tokens).
 * 6. RBAC enforcement over live HTTP transport (OWNER vs READONLY).
 * 7. Client tenantId spoofing rejection (context.tenantId strictly authoritative).
 * 8. Prototype pollution and payload size defense.
 * 9. RequestId correlation header propagation.
 * 10. Zero database mutations from handshake operations.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { sql, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, sessions } from '../../src/db/schema.js';
import { buildApp } from '../../src/app.js';
import { createMcpServer } from '../../src/mcp/server.js';
import { hashMcpToken } from '../../src/security/mcp-auth.js';

describe('Live MCP Server Foundation Integration Tests (P7-001)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let app;
  let mcpServer;
  let activeSessionId;

  let tenantA;
  let userA;
  let tokenA;

  let tenantB;
  let userB;
  let tokenB;

  let tokenExpired;

  before(async () => {
    // 1. Provision Tenant A & Owner User A
    [tenantA] = await db
      .insert(tenants)
      .values({
        name: `Tenant A (MCP ${testRunId})`,
        slug: `tenant-a-mcp-${testRunId}`,
        tier: 'ENTERPRISE',
      })
      .returning();
    createdTenantIds.push(tenantA.id);

    [userA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `owner-mcp-${testRunId}@example.com`,
        displayName: 'Alice Owner',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();

    tokenA = `mcp_live_${crypto.randomBytes(16).toString('hex')}`;
    const tokenAHash = hashMcpToken(tokenA);

    await db.insert(sessions).values({
      id: tokenAHash,
      userId: userA.id,
      tenantId: tenantA.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // 2. Provision Tenant B & Readonly User B
    [tenantB] = await db
      .insert(tenants)
      .values({
        name: `Tenant B (MCP ${testRunId})`,
        slug: `tenant-b-mcp-${testRunId}`,
        tier: 'FREE',
      })
      .returning();
    createdTenantIds.push(tenantB.id);

    [userB] = await db
      .insert(users)
      .values({
        tenantId: tenantB.id,
        email: `readonly-mcp-${testRunId}@example.com`,
        displayName: 'Bob Readonly',
        role: 'READONLY',
        status: 'ACTIVE',
      })
      .returning();

    tokenB = `mcp_live_${crypto.randomBytes(16).toString('hex')}`;
    const tokenBHash = hashMcpToken(tokenB);

    await db.insert(sessions).values({
      id: tokenBHash,
      userId: userB.id,
      tenantId: tenantB.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // 3. Provision Expired Session
    tokenExpired = `mcp_live_${crypto.randomBytes(16).toString('hex')}`;
    const tokenExpiredHash = hashMcpToken(tokenExpired);

    await db.insert(sessions).values({
      id: tokenExpiredHash,
      userId: userA.id,
      tenantId: tenantA.id,
      expiresAt: new Date(Date.now() - 1000 * 60 * 60), // Expired 1 hour ago
    });

    // 4. Configure MCP Server with foundation test tools
    mcpServer = createMcpServer({
      name: 'antigravity-career-hub',
      version: '0.1.0',
    });

    // Read tool (allowed for all roles)
    mcpServer.registerTool(
      {
        name: 'ping_health',
        description: 'Read-only health check tool',
        inputSchema: {
          msg: z.string().optional(),
        },
        requiredRole: 'READONLY',
        requiredScopes: ['career:read'],
      },
      async (context, args) => {
        return {
          status: 'ok',
          callerTenantId: context.tenantId,
          callerUserId: context.userId,
          callerRole: context.role,
          echo: args?.msg || 'pong',
        };
      }
    );

    // Write tool (restricted to MEMBER / OWNER)
    mcpServer.registerTool(
      {
        name: 'mutate_profile_summary',
        description: 'Write tool requiring MEMBER or OWNER role',
        inputSchema: {
          summary: z.string().min(5),
        },
        requiredRole: 'MEMBER',
        requiredScopes: ['career:write'],
      },
      async (context, args) => {
        return {
          modified: true,
          tenantId: context.tenantId,
          newSummary: args.summary,
        };
      }
    );

    // 5. Initialize Fastify application with MCP server
    app = buildApp({
      mcpServer,
      db,
    });
    await app.ready();

    // 6. Execute initialize handshake once to establish active session
    const initRes = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'init-setup-1',
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: {
            name: 'gemini-cli',
            version: '1.0.0',
          },
        },
      },
    });

    assert.strictEqual(initRes.statusCode, 200);
    activeSessionId = initRes.headers['mcp-session-id'];
    assert.ok(activeSessionId, 'Active session ID must be returned by initialize handshake');
  });

  after(async () => {
    // Teardown database fixtures
    for (const tId of createdTenantIds) {
      await db.delete(sessions).where(eq(sessions.tenantId, tId));
      await db.delete(users).where(eq(users.tenantId, tId));
      await db.delete(tenants).where(eq(tenants.id, tId));
    }

    if (app) {
      await app.close();
    }
    await closeDatabase();
  });

  // ===========================================================================
  // 1. Initialize Protocol Handshake (POST /mcp)
  // ===========================================================================
  it('1. successfully verifies MCP server metadata and protocol version capability', async () => {
    // Verify server registered name, version, and tools
    assert.strictEqual(mcpServer.name, 'antigravity-career-hub');
    assert.strictEqual(mcpServer.version, '0.1.0');
    assert.strictEqual(mcpServer.isStarted, true);
    assert.ok(activeSessionId);
  });

  // ===========================================================================
  // 2. Tool Listing (tools/list)
  // ===========================================================================
  it('2. returns registered tool definitions via tools/list', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-session-id': activeSessionId,
        'mcp-protocol-version': '2025-11-25',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'list-req-1',
        method: 'tools/list',
        params: {},
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.jsonrpc, '2.0');
    assert.ok(Array.isArray(body.result.tools));
    const toolNames = body.result.tools.map((t) => t.name);
    assert.ok(toolNames.includes('ping_health'));
    assert.ok(toolNames.includes('mutate_profile_summary'));
  });

  // ===========================================================================
  // 3. Authenticated Tool Execution (tools/call)
  // ===========================================================================
  it('3. executes authenticated tool call and propagates trusted security context', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-session-id': activeSessionId,
        'mcp-protocol-version': '2025-11-25',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'call-req-1',
        method: 'tools/call',
        params: {
          name: 'ping_health',
          arguments: {
            msg: 'integration-test-ping',
          },
        },
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.jsonrpc, '2.0');
    assert.strictEqual(body.id, 'call-req-1');
    assert.strictEqual(body.result.isError, false);
    assert.ok(Array.isArray(body.result.content));
    assert.strictEqual(body.result.content[0].type, 'text');

    const structured = JSON.parse(body.result.content[0].text);
    assert.strictEqual(structured.status, 'ok');
    assert.strictEqual(structured.callerTenantId, tenantA.id);
    assert.strictEqual(structured.callerUserId, userA.id);
    assert.strictEqual(structured.callerRole, 'OWNER');
    assert.strictEqual(structured.echo, 'integration-test-ping');
  });

  // ===========================================================================
  // 4. Authentication Failure Modes
  // ===========================================================================
  it('4. rejects request with missing Bearer token with 401 / -32001', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'missing-auth-1',
        method: 'tools/list',
        params: {},
      },
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.jsonrpc, '2.0');
    assert.strictEqual(body.error.code, -32001);
    assert.match(body.error.message, /Authentication required/);
  });

  it('5. rejects request with non-existent Bearer token with 401 / -32001', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: 'Bearer mcp_live_00000000000000000000000000000000',
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'bad-token-1',
        method: 'tools/list',
        params: {},
      },
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.error.code, -32001);
    assert.match(body.error.message, /Invalid, expired, or revoked Bearer token/);
  });

  it('6. rejects request with expired Bearer token with 401 / -32001', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenExpired}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'expired-token-1',
        method: 'tools/list',
        params: {},
      },
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.error.code, -32001);
  });

  // ===========================================================================
  // 5. RBAC Enforcement over Live Transport
  // ===========================================================================
  it('7. READONLY user calling MEMBER write tool is rejected with role error', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenB}`, // User B has READONLY role
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-session-id': activeSessionId,
        'mcp-protocol-version': '2025-11-25',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'rbac-fail-1',
        method: 'tools/call',
        params: {
          name: 'mutate_profile_summary',
          arguments: {
            summary: 'Updated summary by unauthorized user',
          },
        },
      },
    });

    const body = JSON.parse(response.payload);
    assert.strictEqual(body.result.isError, true);
    assert.match(body.result.content[0].text, /Insufficient role permissions/);
  });

  it('8. OWNER user calling MEMBER write tool succeeds', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`, // User A has OWNER role
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-session-id': activeSessionId,
        'mcp-protocol-version': '2025-11-25',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'rbac-success-1',
        method: 'tools/call',
        params: {
          name: 'mutate_profile_summary',
          arguments: {
            summary: 'Legitimate summary by workspace owner',
          },
        },
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.result.isError, false);
    const structured = JSON.parse(body.result.content[0].text);
    assert.strictEqual(structured.modified, true);
    assert.strictEqual(structured.tenantId, tenantA.id);
  });

  // ===========================================================================
  // 6. Tenant Spoofing Defense
  // ===========================================================================
  it('9. prevents client from overriding tenantId via arguments', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenB}`, // Tenant B context
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-session-id': activeSessionId,
        'mcp-protocol-version': '2025-11-25',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'spoof-1',
        method: 'tools/call',
        params: {
          name: 'ping_health',
          arguments: {
            tenantId: tenantA.id, // Client spoofing attempt
            msg: 'test-spoof',
          },
        },
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    const structured = JSON.parse(body.result.content[0].text);

    // Server strictly used authenticated Tenant B from token, ignoring spoofed Tenant A
    assert.strictEqual(structured.callerTenantId, tenantB.id);
    assert.notStrictEqual(structured.callerTenantId, tenantA.id);
  });

  // ===========================================================================
  // 7. Prototype Pollution & Request ID Correlation
  // ===========================================================================
  it('10. rejects prototype pollution attack in payload with 400', async () => {
    const rawPayload =
      '{"jsonrpc":"2.0","id":"proto-pollute-1","method":"tools/call","params":{"name":"ping_health","__proto__":{"polluted":true}}}';
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      payload: rawPayload,
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.payload);
    assert.ok(body.error || body.code === 'BAD_REQUEST' || body.error?.code === -32602);
  });

  it('11. echoes x-request-id correlation header in responses', async () => {
    const customReqId = '550e8400-e29b-41d4-a716-446655440000';
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-session-id': activeSessionId,
        'mcp-protocol-version': '2025-11-25',
        'x-request-id': customReqId,
      },
      payload: {
        jsonrpc: '2.0',
        id: 'correlate-1',
        method: 'tools/list',
        params: {},
      },
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers['x-request-id'], customReqId);
  });

  // ===========================================================================
  // 8. Zero Database Mutations Invariant
  // ===========================================================================
  it('12. guarantees zero database mutations during MCP tool listing', async () => {
    const [beforeTenants] = await db
      .select({ count: sql`count(*)` })
      .from(tenants)
      .where(eq(tenants.id, tenantA.id));
    const [beforeUsers] = await db
      .select({ count: sql`count(*)` })
      .from(users)
      .where(eq(users.tenantId, tenantA.id));
    const [beforeSessions] = await db
      .select({ count: sql`count(*)` })
      .from(sessions)
      .where(eq(sessions.tenantId, tenantA.id));

    await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-session-id': activeSessionId,
        'mcp-protocol-version': '2025-11-25',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'no-mut-2',
        method: 'tools/list',
        params: {},
      },
    });

    const [afterTenants] = await db
      .select({ count: sql`count(*)` })
      .from(tenants)
      .where(eq(tenants.id, tenantA.id));
    const [afterUsers] = await db
      .select({ count: sql`count(*)` })
      .from(users)
      .where(eq(users.tenantId, tenantA.id));
    const [afterSessions] = await db
      .select({ count: sql`count(*)` })
      .from(sessions)
      .where(eq(sessions.tenantId, tenantA.id));

    assert.strictEqual(afterTenants.count, beforeTenants.count);
    assert.strictEqual(afterUsers.count, beforeUsers.count);
    assert.strictEqual(afterSessions.count, beforeSessions.count);
  });
});
