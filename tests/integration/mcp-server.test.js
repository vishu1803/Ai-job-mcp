/**
 * @file Live Integration Tests for MCP Streamable HTTP Transport & Fallback (P7-002)
 *
 * Validates:
 * 1. Modern 2026-07-28 protocol flow over Streamable HTTP (POST /mcp).
 * 2. Header-based routing (MCP-Protocol-Version, Mcp-Method, Mcp-Name).
 * 3. Modern request envelope with required _meta context.
 * 4. Tools discovery & execution (tools/list, tools/call).
 * 5. Resources discovery & read (resources/list, resources/read).
 * 6. Prompts discovery & get (prompts/list, prompts/get).
 * 7. Header mismatch & unsupported protocol version rejection.
 * 8. Content negotiation & media type validation (415).
 * 9. Multi-tier rate limiting enforcement (429 / -32029).
 * 10. Multi-tenant Bearer token authentication against PostgreSQL sessions.
 * 11. Authentication failure modes (missing, invalid, expired tokens).
 * 12. RBAC enforcement over live HTTP transport (OWNER vs READONLY).
 * 13. Client tenantId spoofing rejection (context.tenantId strictly authoritative).
 * 14. Prototype pollution and payload size defense.
 * 15. RequestId correlation header propagation.
 * 16. Zero database mutations during MCP operations.
 * 17. Legacy 2025-11-25 initialize handshake fallback compatibility.
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
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';

describe('Live MCP Server Streamable HTTP Transport Integration Tests (P7-002 — 2026-07-28 Standard)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let app;
  let mcpServer;
  let testRateLimiter;

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

    // 4. Configure MCP Server with foundation test tools, resources, prompts
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

    // Resource registration
    mcpServer.registerResource(
      {
        uri: 'career://candidate/profile-summary',
        name: 'candidate_profile_summary',
        description: 'Candidate verified summary resource',
        mimeType: 'application/json',
        requiredRole: 'READONLY',
        requiredScopes: ['career:read'],
      },
      async (context, uri) => {
        return {
          contents: [
            {
              uri: typeof uri === 'string' ? uri : uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({
                tenantId: context.tenantId,
                verified: true,
              }),
            },
          ],
        };
      }
    );

    // Prompt registration
    mcpServer.registerPrompt(
      {
        name: 'tailor_advice',
        description: 'Prompt guidance for tailoring resume to target job',
        argsSchema: {
          jobTitle: z.string().optional(),
        },
        requiredRole: 'READONLY',
        requiredScopes: ['career:read'],
      },
      async (context, args) => {
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Tailor profile for ${args?.jobTitle || 'Software Engineer'} in tenant ${context.tenantId}`,
              },
            },
          ],
        };
      }
    );

    // 5. Initialize custom rate limiter for tests
    testRateLimiter = new McpRateLimiter({
      ipLimit: 10000,
      tenantLimit: 10000,
      toolLimit: 10000,
      windowMs: 60000,
    });

    // 6. Initialize Fastify application with MCP server & custom rate limiter
    app = buildApp({
      mcpServer,
      db,
      rateLimiter: testRateLimiter,
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
  // 3. Modern 2026-07-28 Resource Discovery & Read
  // ===========================================================================
  it('3. lists registered resources via resources/list', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'resources/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'res-list-1',
        method: 'resources/list',
        params: {
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
    assert.ok(Array.isArray(body.result.resources));
    assert.strictEqual(body.result.resources[0].uri, 'career://candidate/profile-summary');
  });

  it('4. reads registered resource via resources/read with Mcp-Name header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'resources/read',
        'mcp-name': 'career://candidate/profile-summary',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'res-read-1',
        method: 'resources/read',
        params: {
          uri: 'career://candidate/profile-summary',
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
    assert.ok(Array.isArray(body.result.contents));
    const parsedText = JSON.parse(body.result.contents[0].text);
    assert.strictEqual(parsedText.tenantId, tenantA.id);
  });

  // ===========================================================================
  // 4. Modern 2026-07-28 Prompt Discovery & Get
  // ===========================================================================
  it('5. lists registered prompts via prompts/list', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'prompts/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'prompt-list-1',
        method: 'prompts/list',
        params: {
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
    assert.ok(Array.isArray(body.result.prompts));
    assert.strictEqual(body.result.prompts[0].name, 'tailor_advice');
  });

  it('6. generates prompt messages via prompts/get with Mcp-Name header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'prompts/get',
        'mcp-name': 'tailor_advice',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'prompt-get-1',
        method: 'prompts/get',
        params: {
          name: 'tailor_advice',
          arguments: {
            jobTitle: 'Principal Cloud Architect',
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
    assert.ok(Array.isArray(body.result.messages));
    assert.match(body.result.messages[0].content.text, /Principal Cloud Architect/);
  });

  // ===========================================================================
  // 5. Header Routing & Content-Type Validation
  // ===========================================================================
  it('7. rejects unsupported Content-Type with 415', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'text/plain',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      payload: 'plain-text-payload',
    });

    assert.strictEqual(response.statusCode, 415);
  });

  it('8. rejects Mcp-Method header mismatch against body method', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list', // Mismatched header
      },
      payload: {
        jsonrpc: '2.0',
        id: 'mismatch-1',
        method: 'tools/call', // Body declares call
        params: {
          name: 'ping_health',
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.error.code, -32602);
    assert.match(body.error.message, /does not match/);
  });

  it('9. rejects incompatible protocol version with UnsupportedProtocolVersionError', async () => {
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
  // 6. Rate Limit Enforcement
  // ===========================================================================
  it('10. enforces Rate Limiter tier and returns 429 / -32029 when limit exceeded', async () => {
    const tightLimiter = new McpRateLimiter({
      ipLimit: 100,
      tenantLimit: 2, // Only 2 requests allowed
      toolLimit: 100,
      windowMs: 60000,
    });

    const rateLimitedMcpServer = createMcpServer({
      name: 'antigravity-career-hub-rate-test',
      version: '0.1.0',
      protocolVersion: '2026-07-28',
    });
    rateLimitedMcpServer.registerTool(
      {
        name: 'ping_health',
        description: 'Read-only health check tool',
        inputSchema: {},
        requiredRole: 'READONLY',
        requiredScopes: ['career:read'],
      },
      async () => ({ status: 'ok' })
    );

    const rateLimitedApp = buildApp({
      mcpServer: rateLimitedMcpServer,
      db,
      rateLimiter: tightLimiter,
    });
    await rateLimitedApp.ready();

    const sendReq = () =>
      rateLimitedApp.inject({
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
          id: 'rate-req',
          method: 'tools/list',
          params: {
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        },
      });

    // First 2 requests succeed
    const res1 = await sendReq();
    assert.strictEqual(res1.statusCode, 200);
    const res2 = await sendReq();
    assert.strictEqual(res2.statusCode, 200);

    // 3rd request is blocked by rate limiter
    const res3 = await sendReq();
    assert.strictEqual(res3.statusCode, 429);
    const body = JSON.parse(res3.payload);
    assert.strictEqual(body.error.code, -32029);
    assert.match(body.error.message, /Rate limit exceeded/);

    await rateLimitedApp.close();
  });

  // ===========================================================================
  // 7. Authentication Failure Modes
  // ===========================================================================
  it('11. rejects request with missing Bearer token with 401 / -32001', async () => {
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

  it('12. rejects request with non-existent Bearer token with 401 / -32001', async () => {
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

  it('13. rejects request with expired Bearer token with 401 / -32001', async () => {
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
  // 8. RBAC Enforcement over Live Transport
  // ===========================================================================
  it('14. READONLY user calling MEMBER write tool is rejected with role error', async () => {
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

  it('15. OWNER user calling MEMBER write tool succeeds', async () => {
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
  // 9. Tenant Spoofing Defense
  // ===========================================================================
  it('16. prevents client from overriding tenantId via arguments', async () => {
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
  // 10. Prototype Pollution & Request ID Correlation
  // ===========================================================================
  it('17. rejects prototype pollution attack in payload with 400', async () => {
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

  it('18. echoes x-request-id correlation header in responses', async () => {
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
  // 11. Zero Database Mutations Invariant
  // ===========================================================================
  it('19. guarantees zero database mutations during modern MCP tool listing', async () => {
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
  // 12. Legacy 2025-11-25 Interoperability Fallback
  // ===========================================================================
  it('20. supports legacy 2025-11-25 initialize handshake fallback for older clients', async () => {
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
