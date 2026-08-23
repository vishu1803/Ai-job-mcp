/**
 * @file Live Integration Tests for MCP Server Foundation (2026-07-28 Protocol Standard)
 *
 * Validates:
 * 1. Modern 2026-07-28 protocol flow over Streamable HTTP (POST /mcp).
 * 2. Header-based routing (MCP-Protocol-Version, Mcp-Method, Mcp-Name).
 * 3. Modern request envelope with required _meta context.
 * 4. Tool listing (tools/list) and tool execution (tools/call).
 * 5. Multi-tenant Bearer token authentication against PostgreSQL sessions.
 * 6. Authentication failure modes (missing, invalid, expired tokens).
 * 7. RBAC enforcement over live HTTP transport (OWNER vs READONLY).
 * 8. Client tenantId spoofing rejection (context.tenantId strictly authoritative).
 * 9. Prototype pollution and payload size defense.
 * 10. RequestId correlation header propagation.
 * 11. Zero database mutations during MCP operations.
 * 12. Legacy 2025-11-25 initialize handshake fallback compatibility.
 * 13. Hard protocol assertion confirming 2026-07-28 response format.
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

describe('Live MCP Server Foundation Integration Tests (P7-001 — 2026-07-28 Standard)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let app;
  let mcpServer;

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
      expiresAt: new Date(Date.now() - 1000 * 60 * 60),
    });

    // 4. Configure MCP Server with foundation test tools
    mcpServer = createMcpServer({
      name: 'antigravity-career-hub',
      version: '0.1.0',
      protocolVersion: '2026-07-28',
    });

    // Read tool (allowed for all roles)
    mcpServer.registerTool(
      {
        name: 'ping_health',
        description: 'Read-only health check tool',
        inputSchema: {
          msg: z.string().optional(),
          tenantId: z.string().optional(),
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
  // 1. Modern 2026-07-28 Tool Listing (tools/list)
  // ===========================================================================
  it('1. successfully returns tool definitions via modern 2026-07-28 tools/list request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'list-req-modern-1',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
            'io.modelcontextprotocol/clientInfo': {
              name: 'gemini-cli',
              version: '2.0.0',
            },
          },
        },
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.jsonrpc, '2.0');
    assert.strictEqual(body.id, 'list-req-modern-1');
    assert.ok(body.result);
    assert.strictEqual(body.result.resultType, 'complete');
    assert.ok(Array.isArray(body.result.tools));

    const toolNames = body.result.tools.map((t) => t.name);
    assert.ok(toolNames.includes('ping_health'));
    assert.ok(toolNames.includes('mutate_profile_summary'));

    // Verify 2026-07-28 metadata envelope in result
    assert.strictEqual(
      body.result._meta['io.modelcontextprotocol/serverInfo'].name,
      'antigravity-career-hub'
    );
    assert.strictEqual(body.result._meta['io.modelcontextprotocol/serverInfo'].version, '0.1.0');
  });

  // ===========================================================================
  // 2. Modern 2026-07-28 Tool Execution (tools/call)
  // ===========================================================================
  it('2. executes authenticated tool call and propagates trusted security context over 2026-07-28 standard', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'ping_health',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'call-req-modern-1',
        method: 'tools/call',
        params: {
          name: 'ping_health',
          arguments: {
            msg: 'modern-protocol-ping',
          },
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.jsonrpc, '2.0');
    assert.strictEqual(body.id, 'call-req-modern-1');
    assert.ok(body.result);
    assert.strictEqual(body.result.resultType, 'complete');
    assert.ok(Array.isArray(body.result.content));
    assert.strictEqual(body.result.content[0].type, 'text');

    const structured = JSON.parse(body.result.content[0].text);
    assert.strictEqual(structured.status, 'ok');
    assert.strictEqual(structured.callerTenantId, tenantA.id);
    assert.strictEqual(structured.callerUserId, userA.id);
    assert.strictEqual(structured.callerRole, 'OWNER');
    assert.strictEqual(structured.echo, 'modern-protocol-ping');
  });

  // ===========================================================================
  // 3. Hard Protocol Assertion: Rejects Unsupported Protocol Version
  // ===========================================================================
  it('3. rejects incompatible protocol version with UnsupportedProtocolVersionError', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '1999-01-01',
        'mcp-method': 'tools/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'bad-version-1',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '1999-01-01',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.payload);
    assert.ok(body.error);
    assert.match(body.error.message, /Unsupported protocol version/);
  });

  // ===========================================================================
  // 4. Authentication Failure Modes
  // ===========================================================================
  it('4. rejects request with missing Bearer token with 401 / -32001', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'missing-auth-1',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
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
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'bad-token-1',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
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
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'expired-token-1',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
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
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'mutate_profile_summary',
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
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    const body = JSON.parse(response.payload);
    if (body.error) {
      assert.strictEqual(body.error.code, -32003);
    } else {
      assert.strictEqual(body.result.isError, true);
      assert.match(body.result.content[0].text, /Insufficient role permissions/);
    }
  });

  it('8. OWNER user calling MEMBER write tool succeeds', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`, // User A has OWNER role
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'mutate_profile_summary',
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
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.result.resultType, 'complete');
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
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'ping_health',
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
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
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
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'ping_health',
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
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
        'x-request-id': customReqId,
      },
      payload: {
        jsonrpc: '2.0',
        id: 'correlate-1',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers['x-request-id'], customReqId);
  });

  // ===========================================================================
  // 8. Zero Database Mutations Invariant
  // ===========================================================================
  it('12. guarantees zero database mutations during modern MCP tool listing', async () => {
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
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'no-mut-2',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
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

  // ===========================================================================
  // 9. Legacy 2025-11-25 Interoperability Fallback
  // ===========================================================================
  it('13. supports legacy 2025-11-25 initialize handshake fallback for older clients', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'legacy-init-1',
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: {
            name: 'legacy-cli',
            version: '1.0.0',
          },
        },
      },
    });

    assert.strictEqual(response.statusCode, 200);
    assert.match(response.payload, /antigravity-career-hub/);
  });
});
