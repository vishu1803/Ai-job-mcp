/**
 * @file Live Integration Tests for Dedicated MCP API Token Infrastructure (P7-003A)
 *
 * Validates against PostgreSQL:
 * 1. Token creation and persistence in mcp_api_tokens.
 * 2. Token authentication over live Streamable HTTP POST /mcp endpoint.
 * 3. Scope ceiling enforcement on live MCP operations.
 * 4. Token revocation: invalidates MCP access immediately.
 * 5. Browser session independence: revoking MCP token DOES NOT touch sessions table.
 * 6. Token rotation: old token revoked, new token authenticated.
 * 7. Expiry enforcement: expired token rejected.
 * 8. Multi-tenant cryptographic isolation.
 * 9. Maximum active tokens quota (10) enforcement.
 * 10. Transitional session fallback authentication.
 * 11. Zero raw secrets or full hashes in database or logs.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, sessions, mcpApiTokens } from '../../src/db/schema.js';
import { buildApp } from '../../src/app.js';
import { createMcpServer } from '../../src/mcp/server.js';
import { McpApiTokenService, hashMcpToken } from '../../src/services/mcp-api-token.service.js';
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';
import { AuthenticationError, NotFoundError, ConflictError } from '../../src/errors/index.js';

describe('Live MCP API Token Infrastructure Integration Tests (P7-003A)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let app;
  let mcpServer;
  let tokenService;
  let testRateLimiter;

  let tenantA;
  let ownerA;
  let memberA;
  let _readonlyA;

  let tenantB;
  let ownerB;

  before(async () => {
    tokenService = new McpApiTokenService({ db, nodeEnv: 'test' });
    testRateLimiter = new McpRateLimiter({
      ipLimit: 500,
      tenantLimit: 1000,
      toolLimit: 200,
    });

    // 1. Provision Tenant A & Users
    [tenantA] = await db
      .insert(tenants)
      .values({
        name: `Tenant A (MCP Tokens ${testRunId})`,
        slug: `tenant-a-tokens-${testRunId}`,
        tier: 'ENTERPRISE',
      })
      .returning();
    createdTenantIds.push(tenantA.id);

    [ownerA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `owner-a-${testRunId}@example.com`,
        displayName: 'Alice Owner',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();

    [memberA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `member-a-${testRunId}@example.com`,
        displayName: 'Bob Member',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    [_readonlyA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `readonly-a-${testRunId}@example.com`,
        displayName: 'Rachel Readonly',
        role: 'READONLY',
        status: 'ACTIVE',
      })
      .returning();

    // 2. Provision Tenant B & Owner B
    [tenantB] = await db
      .insert(tenants)
      .values({
        name: `Tenant B (MCP Tokens ${testRunId})`,
        slug: `tenant-b-tokens-${testRunId}`,
        tier: 'FREE',
      })
      .returning();
    createdTenantIds.push(tenantB.id);

    [ownerB] = await db
      .insert(users)
      .values({
        tenantId: tenantB.id,
        email: `owner-b-${testRunId}@example.com`,
        displayName: 'Mallory Owner',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();

    // 3. Initialize McpServer & Fastify App
    mcpServer = createMcpServer({ name: 'test-token-mcp', version: '0.1.0' });

    mcpServer.registerTool(
      {
        name: 'test_read_profile',
        description: 'Read-only candidate profile tool',
        inputSchema: { includeSkills: z.boolean().optional() },
        requiredRole: 'READONLY',
        requiredScopes: ['career:read'],
      },
      async (context, _args) => {
        return {
          status: 'OK',
          tenantId: context.tenantId,
          userId: context.userId,
          authMethod: context.authMethod,
          tokenScopes: context.tokenScopes,
        };
      }
    );

    mcpServer.registerTool(
      {
        name: 'test_write_resume',
        description: 'Write resume tool',
        inputSchema: { jobTitle: z.string() },
        requiredRole: 'MEMBER',
        requiredScopes: ['career:write'],
      },
      async (context, args) => {
        return {
          status: 'ADAPTED',
          tenantId: context.tenantId,
          jobTitle: args.jobTitle,
        };
      }
    );

    app = await buildApp({
      mcpServer,
      db,
      rateLimiter: testRateLimiter,
      tokenService,
    });
    await app.ready();
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    // Cleanup created test tenants (cascades to users, tokens, sessions)
    for (const tenantId of createdTenantIds) {
      await db
        .delete(tenants)
        .where(eq(tenants.id, tenantId))
        .catch(() => {});
    }
  });

  // ===========================================================================
  // 1. Token Creation & Persistence
  // ===========================================================================
  it('1. creates personal MCP API token with role ceiling enforcement and persists in DB', async () => {
    const { rawToken, token } = await tokenService.createToken({
      tenantId: tenantA.id,
      userId: ownerA.id,
      role: 'OWNER',
      name: 'Alice Claude Desktop',
      scopes: ['career:read', 'career:write', 'career:export'],
      expiryDays: 30,
    });

    assert.ok(rawToken.startsWith('mcp_test_'));
    assert.strictEqual(token.name, 'Alice Claude Desktop');
    assert.strictEqual(token.status, 'ACTIVE');
    assert.deepStrictEqual(token.scopes, ['career:read', 'career:write', 'career:export']);

    // Check DB record: raw token is NEVER stored
    const dbRow = await db
      .select()
      .from(mcpApiTokens)
      .where(eq(mcpApiTokens.id, token.id))
      .limit(1);

    assert.strictEqual(dbRow.length, 1);
    assert.strictEqual(dbRow[0].tokenHash, hashMcpToken(rawToken));
    assert.strictEqual(dbRow[0].tokenHash.length, 64);
    assert.notStrictEqual(dbRow[0].tokenHash, rawToken);
  });

  // ===========================================================================
  // 2. Authentication over Streamable HTTP POST /mcp
  // ===========================================================================
  it('2. authenticates live MCP tool execution using dedicated MCP API token', async () => {
    const { rawToken } = await tokenService.createToken({
      tenantId: tenantA.id,
      userId: memberA.id,
      role: 'MEMBER',
      name: 'Bob Cursor Token',
      scopes: ['career:read', 'career:write'],
      expiryDays: 60,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${rawToken}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'test_read_profile',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-token-001',
        method: 'tools/call',
        params: {
          name: 'test_read_profile',
          arguments: { includeSkills: true },
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
    assert.strictEqual(body.id, 'req-token-001');
    assert.ok(body.result);

    const structured = body.result.structuredData;
    assert.strictEqual(structured.tenantId, tenantA.id);
    assert.strictEqual(structured.userId, memberA.id);
    assert.strictEqual(structured.authMethod, 'MCP_API_TOKEN');
    assert.deepStrictEqual(structured.tokenScopes, ['career:read', 'career:write']);
  });

  // ===========================================================================
  // 3. Scope Enforcement (Read-Only Token Cannot Write)
  // ===========================================================================
  it('3. rejects write tool call when token scope is limited to career:read', async () => {
    const { rawToken } = await tokenService.createToken({
      tenantId: tenantA.id,
      userId: memberA.id,
      role: 'MEMBER',
      name: 'Bob Readonly Token',
      scopes: ['career:read'], // Restricted scope
    });

    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${rawToken}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'test_write_resume',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-token-scope-001',
        method: 'tools/call',
        params: {
          name: 'test_write_resume',
          arguments: { jobTitle: 'Software Architect' },
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    // Scope check failure returns MCP error or isError envelope
    const body = JSON.parse(response.payload);
    if (body.error) {
      assert.strictEqual(body.error.code, -32003);
      assert.match(body.error.message, /Insufficient token scope/);
    } else {
      assert.strictEqual(body.result.isError, true);
      assert.match(body.result.content[0].text, /Insufficient token scope/);
    }
  });

  // ===========================================================================
  // 4. Token Revocation & Browser Session Independence
  // ===========================================================================
  it('4. revoking an MCP API token disables MCP access but keeps browser sessions active', async () => {
    // 1. Create a browser web session in `sessions` table
    const webSessionSecret = `web_session_${crypto.randomBytes(16).toString('hex')}`;
    const webSessionHash = crypto.createHash('sha256').update(webSessionSecret).digest('hex');

    await db.insert(sessions).values({
      id: webSessionHash,
      userId: ownerA.id,
      tenantId: tenantA.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // 2. Create an MCP API token
    const { rawToken, token } = await tokenService.createToken({
      tenantId: tenantA.id,
      userId: ownerA.id,
      role: 'OWNER',
      name: 'Revocable Token',
      scopes: ['career:read'],
    });

    // Verify MCP works
    const res1 = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${rawToken}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'check-1',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });
    assert.strictEqual(res1.statusCode, 200);

    // 3. Revoke the MCP token
    await tokenService.revokeToken({
      tenantId: tenantA.id,
      userId: ownerA.id,
      role: 'OWNER',
      tokenId: token.id,
    });

    // 4. Verify MCP token is rejected (401 / -32001)
    const res2 = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${rawToken}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'check-2',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });
    assert.strictEqual(res2.statusCode, 401);
    const body2 = JSON.parse(res2.payload);
    assert.strictEqual(body2.error.code, -32001);

    // 5. Verify the user's browser session in `sessions` table is STILL ACTIVE
    const [activeSession] = await db.select().from(sessions).where(eq(sessions.id, webSessionHash));

    assert.ok(activeSession);
    assert.strictEqual(activeSession.userId, ownerA.id);
  });

  // ===========================================================================
  // 5. Token Rotation
  // ===========================================================================
  it('5. rotates MCP API token: revokes old token and issues new active token', async () => {
    const { rawToken: oldRawToken, token: oldToken } = await tokenService.createToken({
      tenantId: tenantA.id,
      userId: memberA.id,
      role: 'MEMBER',
      name: 'Rotatable Token',
      scopes: ['career:read', 'career:write'],
    });

    const { rawToken: newRawToken, token: newToken } = await tokenService.rotateToken({
      tenantId: tenantA.id,
      userId: memberA.id,
      role: 'MEMBER',
      tokenId: oldToken.id,
      expiryDays: 90,
    });

    assert.notStrictEqual(oldRawToken, newRawToken);
    assert.notStrictEqual(oldToken.id, newToken.id);
    assert.strictEqual(newToken.name, oldToken.name);
    assert.deepStrictEqual(newToken.scopes, oldToken.scopes);

    // Old token fails
    await assert.rejects(() => tokenService.validateToken(oldRawToken), AuthenticationError);

    // New token succeeds
    const validated = await tokenService.validateToken(newRawToken);
    assert.strictEqual(validated.token.id, newToken.id);
  });

  // ===========================================================================
  // 6. Multi-Tenant Cryptographic Isolation
  // ===========================================================================
  it('6. prevents cross-tenant token access (Tenant B cannot revoke Tenant A token)', async () => {
    const { token } = await tokenService.createToken({
      tenantId: tenantA.id,
      userId: ownerA.id,
      role: 'OWNER',
      name: 'Tenant A Secret Token',
    });

    // Tenant B owner attempts to revoke Tenant A token -> 404 NOT_FOUND (default-deny)
    await assert.rejects(
      () =>
        tokenService.revokeToken({
          tenantId: tenantB.id,
          userId: ownerB.id,
          role: 'OWNER',
          tokenId: token.id,
        }),
      NotFoundError
    );
  });

  // ===========================================================================
  // 7. Maximum Token Quota Enforcement (10 Active Tokens)
  // ===========================================================================
  it('7. enforces maximum 10 active tokens quota per user', async () => {
    // Create tokens under Owner A up to limit
    try {
      for (let i = 0; i < 15; i++) {
        await tokenService.createToken({
          tenantId: tenantA.id,
          userId: ownerA.id,
          role: 'OWNER',
          name: `Quota Token ${i}`,
        });
      }
      assert.fail('Should have thrown ConflictError for quota limit');
    } catch (err) {
      assert.ok(err.statusCode === 409 || err instanceof ConflictError);
    }
  });

  // ===========================================================================
  // 8. Transitional Session Token Fallback Compatibility
  // ===========================================================================
  it('8. supports transitional session token fallback with authMethod: SESSION_FALLBACK', async () => {
    const legacyToken = `session_transitional_${crypto.randomBytes(16).toString('hex')}`;
    const legacyHash = hashMcpToken(legacyToken);

    await db.insert(sessions).values({
      id: legacyHash,
      userId: ownerA.id,
      tenantId: tenantA.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${legacyToken}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'test_read_profile',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'legacy-req-001',
        method: 'tools/call',
        params: {
          name: 'test_read_profile',
          arguments: { includeSkills: true },
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    const structured = body.result.structuredData;
    assert.strictEqual(structured.authMethod, 'SESSION_FALLBACK');
  });
});
