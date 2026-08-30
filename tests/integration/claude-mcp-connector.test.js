/**
 * @file Integration Tests for Claude Remote MCP & OAuth 2.1 Connector (P10-001).
 *
 * Verifies live execution against Fastify HTTP MCP transport, OAuth endpoints, and PostgreSQL database:
 * 1. Unauthenticated MCP request returns 401 with WWW-Authenticate pointing to Protected Resource Metadata.
 * 2. GET /.well-known/oauth-protected-resource and GET /.well-known/oauth-authorization-server.
 * 3. GET /oauth/authorize query validation (rejects invalid clients, mismatched redirects, missing state, plain PKCE).
 * 4. GET /oauth/authorize successful authorization code generation with PKCE challenge and scope ceiling clamping.
 * 5. POST /oauth/token code exchange (rejects bad verifier, succeeds on valid verifier, enforces single-use).
 * 6. POST /mcp execution using OAuth Bearer access token (tools/list and tools/call get_candidate_profile).
 * 7. Rejection of query string tokens (/mcp?token=...) with 400 QUERY_TOKEN_PROHIBITED.
 * 8. Sovereign multi-tenant isolation (Tenant B OAuth token cannot query Tenant A candidate -> 404 NOT_FOUND).
 * 9. Scope enforcement (career:read token rejected on write tool propose_project_improvement -> 403 FORBIDDEN).
 * 10. Refresh token rotation (RTR) and replay detection with entire family revocation.
 * 11. POST /oauth/revoke and immediate invalidation on subsequent MCP tool calls.
 * 12. Clean teardown with zero database pool leaks (satisfies test:db-lifecycle-check).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  sessions,
  candidates,
  candidateSkills,
  evidenceItems,
  oauthAuthorizationCodes,
  oauthTokens,
} from '../../src/db/schema.js';
import { buildApp } from '../../src/app.js';
import { createCareerMcpServer } from '../../src/mcp/server.js';
import { McpApiTokenService } from '../../src/services/mcp-api-token.service.js';
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';
import { OAuthAuthorizationService } from '../../src/services/oauth-authorization.service.js';
import { createSession, getSessionCookieOptions } from '../../src/security/session.service.js';
import { config } from '../../src/config/env.js';

describe('Claude Remote MCP & OAuth 2.1 Connector Integration Tests (P10-001)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let app;
  let oauthService;
  let tokenService;
  let rateLimiter;

  let tenantA;
  let userAMember;
  let userAReadonly;
  let candidateA;

  let memberACookie;
  let readonlyACookie;

  let _tenantB;
  let _userBMember;
  let candidateB;
  let expectedResource;

  const validVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk_custom_verifier_12345678';
  const validChallenge = crypto
    .createHash('sha256')
    .update(validVerifier, 'utf8')
    .digest('base64url');

  before(async () => {
    try {
      // 1. Initialize Tenant A
      const tenantIdA = crypto.randomUUID();
      createdTenantIds.push(tenantIdA);

      [tenantA] = await db
        .insert(tenants)
        .values({
          id: tenantIdA,
          name: `Tenant A Claude MCP ${testRunId}`,
          slug: `tenant-a-claude-${testRunId}`,
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
          displayName: 'Alice Member A',
          role: 'MEMBER',
          status: 'ACTIVE',
        })
        .returning();

      const userIdAReadonly = crypto.randomUUID();
      [userAReadonly] = await db
        .insert(users)
        .values({
          id: userIdAReadonly,
          tenantId: tenantIdA,
          email: `readonly-a-${testRunId}@example.com`,
          displayName: 'Bob Readonly A',
          role: 'READONLY',
          status: 'ACTIVE',
        })
        .returning();

      const candidateIdA = crypto.randomUUID();
      [candidateA] = await db
        .insert(candidates)
        .values({
          id: candidateIdA,
          tenantId: tenantIdA,
          userId: userIdAMember,
          displayName: 'Alice Candidate A',
          canonicalEmail: `alice-candidate-${testRunId}@example.com`,
          headline: 'Senior Full Stack Engineer',
          status: 'ACTIVE',
        })
        .returning();

      // 2. Initialize Tenant B (for multi-tenant isolation tests)
      const tenantIdB = crypto.randomUUID();
      createdTenantIds.push(tenantIdB);

      [_tenantB] = await db
        .insert(tenants)
        .values({
          id: tenantIdB,
          name: `Tenant B Claude MCP ${testRunId}`,
          slug: `tenant-b-claude-${testRunId}`,
          status: 'ACTIVE',
        })
        .returning();

      const userIdBMember = crypto.randomUUID();
      [_userBMember] = await db
        .insert(users)
        .values({
          id: userIdBMember,
          tenantId: tenantIdB,
          email: `member-b-${testRunId}@example.com`,
          displayName: 'Charlie Member B',
          role: 'MEMBER',
          status: 'ACTIVE',
        })
        .returning();

      const candidateIdB = crypto.randomUUID();
      [candidateB] = await db
        .insert(candidates)
        .values({
          id: candidateIdB,
          tenantId: tenantIdB,
          userId: userIdBMember,
          displayName: 'Charlie Candidate B',
          canonicalEmail: `charlie-candidate-${testRunId}@example.com`,
          headline: 'DevOps Architect',
          status: 'ACTIVE',
        })
        .returning();

      // 3. Setup Sessions
      const cookieOpts = getSessionCookieOptions(config);
      const sessionMemberRecord = await createSession(db, {
        userId: userAMember.id,
        tenantId: tenantA.id,
      });
      memberACookie = `${cookieOpts.name}=${sessionMemberRecord.rawToken}`;

      const sessionReadonlyRecord = await createSession(db, {
        userId: userAReadonly.id,
        tenantId: tenantA.id,
      });
      readonlyACookie = `${cookieOpts.name}=${sessionReadonlyRecord.rawToken}`;

      // 4. Setup Services & App
      oauthService = new OAuthAuthorizationService({ db });
      expectedResource = oauthService.getExpectedResourceUrl();
      tokenService = new McpApiTokenService({ db });
      rateLimiter = new McpRateLimiter();

      const customMcpServer = createCareerMcpServer({
        deps: { db },
      });

      app = await buildApp({
        mcpServer: customMcpServer,
        tokenService,
        oauthService,
        rateLimiter,
        db,
      });
      await app.ready();
    } catch (err) {
      console.error('CRITICAL ERROR IN OAUTH BEFORE HOOK:', err);
      throw err;
    }
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    // Clean up created test tenants cascade
    for (const tId of createdTenantIds) {
      await db.delete(oauthTokens).where(eq(oauthTokens.tenantId, tId));
      await db.delete(oauthAuthorizationCodes).where(eq(oauthAuthorizationCodes.tenantId, tId));
      await db.delete(sessions).where(eq(sessions.tenantId, tId));
      await db.delete(candidateSkills).where(eq(candidateSkills.tenantId, tId));
      await db.delete(evidenceItems).where(eq(evidenceItems.tenantId, tId));
      await db.delete(candidates).where(eq(candidates.tenantId, tId));
      await db.delete(users).where(eq(users.tenantId, tId));
      await db.delete(tenants).where(eq(tenants.id, tId));
    }
    await closeDatabase();
  });

  // ---------------------------------------------------------------------------
  // 1. Discovery & 401 Challenge
  // ---------------------------------------------------------------------------
  it('1. returns 401 with WWW-Authenticate pointing to Protected Resource Metadata on unauthenticated request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-discovery-1',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    assert.equal(res.statusCode, 401);
    const authHeader = res.headers['www-authenticate'];
    assert.ok(authHeader);
    assert.match(authHeader, /^Bearer realm="mcp", resource_metadata=/);
    assert.ok(authHeader.includes('/.well-known/oauth-protected-resource'));
  });

  it('2. serves RFC 9728 Protected Resource Metadata at /.well-known/oauth-protected-resource', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-protected-resource',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.resource);
    assert.ok(Array.isArray(body.authorization_servers));
    assert.ok(body.scopes_supported.includes('career:read'));
    assert.ok(body.scopes_supported.includes('career:write'));
  });

  it('3. serves RFC 8414 Authorization Server Metadata at /.well-known/oauth-authorization-server', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-authorization-server',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.issuer);
    assert.ok(body.authorization_endpoint.includes('/oauth/authorize'));
    assert.ok(body.token_endpoint.includes('/oauth/token'));
    assert.deepEqual(body.code_challenge_methods_supported, ['S256']);
    assert.deepEqual(body.response_types_supported, ['code']);
  });

  // ---------------------------------------------------------------------------
  // 2. Authorization & Consent Endpoints (GET /oauth/authorize & POST /oauth/authorize/consent)
  // ---------------------------------------------------------------------------
  it('4. rejects authorization request with invalid client, missing state, missing resource, or invalid redirect', async () => {
    // Unknown client
    const res1 = await app.inject({
      method: 'GET',
      url: `/oauth/authorize?response_type=code&client_id=unknown-client&redirect_uri=https://claude.ai/api/mcp/auth_callback&resource=${encodeURIComponent(expectedResource)}&state=state123&code_challenge=${validChallenge}&code_challenge_method=S256`,
    });
    assert.equal(res1.statusCode, 400);
    assert.equal(JSON.parse(res1.body).error, 'invalid_client');

    // Mismatched redirect URI for Claude Web
    const res2 = await app.inject({
      method: 'GET',
      url: `/oauth/authorize?response_type=code&client_id=claude-web&redirect_uri=https://attacker.com/callback&resource=${encodeURIComponent(expectedResource)}&state=state123&code_challenge=${validChallenge}&code_challenge_method=S256`,
    });
    assert.equal(res2.statusCode, 400);
    assert.equal(JSON.parse(res2.body).error, 'invalid_request');

    // Missing state
    const res3 = await app.inject({
      method: 'GET',
      url: `/oauth/authorize?response_type=code&client_id=claude-web&redirect_uri=https://claude.ai/api/mcp/auth_callback&resource=${encodeURIComponent(expectedResource)}&code_challenge=${validChallenge}&code_challenge_method=S256`,
    });
    assert.equal(res3.statusCode, 400);
    assert.equal(JSON.parse(res3.body).error, 'invalid_request');

    // Missing resource (Case A: RFC 8707 requirement)
    const res4 = await app.inject({
      method: 'GET',
      url: `/oauth/authorize?response_type=code&client_id=claude-web&redirect_uri=https://claude.ai/api/mcp/auth_callback&state=state123&code_challenge=${validChallenge}&code_challenge_method=S256`,
    });
    assert.equal(res4.statusCode, 400);
    assert.equal(JSON.parse(res4.body).error, 'invalid_request');

    // Mismatched resource target (Case B: RFC 8707 invalid_target)
    const res5 = await app.inject({
      method: 'GET',
      url: `/oauth/authorize?response_type=code&client_id=claude-web&redirect_uri=https://claude.ai/api/mcp/auth_callback&resource=https://attacker.example.com/mcp&state=state123&code_challenge=${validChallenge}&code_challenge_method=S256`,
    });
    assert.equal(res5.statusCode, 400);
    assert.equal(JSON.parse(res5.body).error, 'invalid_target');
  });

  it('4b. redirects unauthenticated GET /oauth/authorize to /auth/github with preserved relative return_to', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/oauth/authorize?response_type=code&client_id=claude-web&redirect_uri=https://claude.ai/api/mcp/auth_callback&resource=${encodeURIComponent(expectedResource)}&scope=career:read+career:write&state=csrf_test_state_123&code_challenge=${validChallenge}&code_challenge_method=S256`,
    });

    assert.equal(res.statusCode, 302);
    const location = res.headers.location;
    assert.ok(location);
    assert.ok(location.startsWith('/auth/github?return_to='));

    const parsed = new URL(location, 'http://localhost');
    const returnTo = parsed.searchParams.get('return_to');
    assert.ok(returnTo);
    assert.ok(returnTo.startsWith('/oauth/authorize?'));
    assert.ok(returnTo.includes('client_id=claude-web'));
    assert.ok(returnTo.includes('state=csrf_test_state_123'));
  });

  it('5a. renders HTML consent screen for authenticated user on GET /oauth/authorize', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/oauth/authorize?response_type=code&client_id=claude-web&redirect_uri=https://claude.ai/api/mcp/auth_callback&resource=${encodeURIComponent(expectedResource)}&scope=career:read+career:write&state=csrf_test_state_123&code_challenge=${validChallenge}&code_challenge_method=S256`,
      headers: {
        cookie: memberACookie,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type']?.includes('text/html'));
    assert.ok(res.body.includes('Authorize Claude (Web Client)'));
    assert.ok(res.body.includes('career:read'));
    assert.ok(res.body.includes('career:write'));
    assert.ok(res.body.includes('/oauth/authorize/consent'));
    assert.ok(res.body.includes('never receives direct GitHub credentials'));
  });

  it('5b. redirects with error=access_denied when user denies consent on POST /oauth/authorize/consent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/authorize/consent',
      headers: {
        cookie: memberACookie,
      },
      payload: {
        client_id: 'claude-web',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        resource: expectedResource,
        scope: 'career:read career:write',
        state: 'csrf_test_state_123',
        code_challenge: validChallenge,
        code_challenge_method: 'S256',
        action: 'deny',
      },
    });

    assert.equal(res.statusCode, 302);
    const redirectUrl = new URL(res.headers.location);
    assert.equal(redirectUrl.origin, 'https://claude.ai');
    assert.equal(redirectUrl.pathname, '/api/mcp/auth_callback');
    assert.equal(redirectUrl.searchParams.get('error'), 'access_denied');
    assert.equal(redirectUrl.searchParams.get('state'), 'csrf_test_state_123');
  });

  let issuedCodeMemberA;
  it('5c. successfully generates authorization code for Member A upon consent approval and redirects with code & state', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/authorize/consent',
      headers: {
        cookie: memberACookie,
      },
      payload: {
        client_id: 'claude-web',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        resource: expectedResource,
        scope: 'career:read career:write',
        state: 'csrf_test_state_123',
        code_challenge: validChallenge,
        code_challenge_method: 'S256',
        action: 'allow',
      },
    });

    assert.equal(res.statusCode, 302);
    const location = res.headers.location;
    assert.ok(location);

    const redirectUrl = new URL(location);
    assert.equal(redirectUrl.origin, 'https://claude.ai');
    assert.equal(redirectUrl.pathname, '/api/mcp/auth_callback');
    assert.equal(redirectUrl.searchParams.get('state'), 'csrf_test_state_123');

    issuedCodeMemberA = redirectUrl.searchParams.get('code');
    assert.ok(issuedCodeMemberA);
    assert.ok(issuedCodeMemberA.startsWith('mcp_oauth_code_'));
  });

  it('6. clamps requested scopes to user role ceiling (READONLY user gets only career:read)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/authorize/consent',
      headers: {
        cookie: readonlyACookie,
      },
      payload: {
        client_id: 'claude-desktop',
        redirect_uri: 'http://localhost:3118/callback',
        resource: expectedResource,
        scope: 'career:read career:write',
        state: 'state_readonly',
        code_challenge: validChallenge,
        code_challenge_method: 'S256',
        action: 'allow',
      },
    });

    assert.equal(res.statusCode, 302);
    const location = res.headers.location;
    const redirectUrl = new URL(location);
    const code = redirectUrl.searchParams.get('code');

    const codeHash = crypto.createHash('sha256').update(code, 'utf8').digest('hex');
    const [codeRecord] = await db
      .select()
      .from(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.codeHash, codeHash))
      .limit(1);

    assert.ok(codeRecord);
    // Role ceiling enforced: career:write stripped
    assert.deepEqual(codeRecord.scopes, ['career:read']);
    assert.equal(codeRecord.resource, expectedResource);
  });

  // ---------------------------------------------------------------------------
  // 3. Token Exchange Endpoint (POST /oauth/token)
  // ---------------------------------------------------------------------------
  it('7. rejects authorization code exchange when PKCE code_verifier is invalid or resource is mismatched/missing', async () => {
    // Missing resource in code exchange (Case C)
    const resMissingResource = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'claude-web',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        code: issuedCodeMemberA,
        code_verifier: validVerifier,
      }).toString(),
    });
    assert.equal(resMissingResource.statusCode, 400);
    assert.equal(JSON.parse(resMissingResource.body).error, 'invalid_request');

    // Mismatched resource target (Case D)
    const resMismatchedResource = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'claude-web',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        resource: 'https://attacker.example.com/mcp',
        code: issuedCodeMemberA,
        code_verifier: validVerifier,
      }).toString(),
    });
    assert.equal(resMismatchedResource.statusCode, 400);
    assert.equal(JSON.parse(resMismatchedResource.body).error, 'invalid_target');

    // Invalid code verifier
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'claude-web',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        resource: expectedResource,
        code: issuedCodeMemberA,
        code_verifier: 'invalid_code_verifier_123456789012345678901234567890',
      }).toString(),
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'invalid_grant');
    assert.ok(body.error_description.includes('PKCE'));
  });

  let accessTokenMemberA;
  let refreshTokenMemberA;

  it('8. exchanges authorization code for access token and rotating refresh token with valid PKCE & resource', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'claude-web',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        resource: expectedResource,
        code: issuedCodeMemberA,
        code_verifier: validVerifier,
      }).toString(),
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.access_token);
    assert.ok(body.access_token.startsWith('mcp_oauth_acc_'));
    assert.equal(body.token_type, 'Bearer');
    assert.equal(body.expires_in, 3600);
    assert.ok(body.refresh_token);
    assert.ok(body.refresh_token.startsWith('mcp_oauth_ref_'));
    assert.equal(body.scope, 'career:read career:write');

    accessTokenMemberA = body.access_token;
    refreshTokenMemberA = body.refresh_token;
  });

  it('8b. supports Anthropic Hosted Client Metadata URL (CIMD) as client_id for automatic client identification', async () => {
    const cimdClientId = 'https://claude.ai/api/mcp/client-metadata.json';
    const cimdCode = await oauthService.createAuthorizationCode({
      clientId: cimdClientId,
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      resource: expectedResource,
      codeChallenge: validChallenge,
      codeChallengeMethod: 'S256',
      scopes: ['career:read'],
      tenantId: tenantA.id,
      userId: userAMember.id,
      userRole: 'MEMBER',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: cimdClientId,
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        resource: expectedResource,
        code: cimdCode,
        code_verifier: validVerifier,
      }).toString(),
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.access_token);
    assert.equal(body.token_type, 'Bearer');
    assert.equal(body.scope, 'career:read');

    // Verify token works on MCP
    const mcpRes = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${body.access_token}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-cimd-list',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    assert.equal(mcpRes.statusCode, 200);
    const mcpBody = JSON.parse(mcpRes.body);
    assert.ok(Array.isArray(mcpBody.result?.tools));
  });

  it('9. enforces single-use authorization code (replaying code fails with invalid_grant)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'claude-web',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        resource: expectedResource,
        code: issuedCodeMemberA,
        code_verifier: validVerifier,
      }).toString(),
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'invalid_grant');
    assert.ok(body.error_description.includes('already been consumed'));
  });

  // ---------------------------------------------------------------------------
  // 4. Authenticated MCP Operations over Streamable HTTP
  // ---------------------------------------------------------------------------
  it('10. executes MCP tools/list using OAuth Bearer access token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${accessTokenMemberA}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-list-1',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.result?.tools);
    const toolNames = body.result.tools.map((t) => t.name);
    assert.ok(toolNames.includes('get_candidate_profile'));
    assert.ok(toolNames.includes('propose_project_improvement'));
  });

  it('11. executes MCP tools/call get_candidate_profile using OAuth Bearer access token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${accessTokenMemberA}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'get_candidate_profile',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-call-profile-1',
        method: 'tools/call',
        params: {
          name: 'get_candidate_profile',
          arguments: {
            candidateId: candidateA.id,
          },
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.result?.content);
    const profileText = body.result.content[0].text;
    assert.ok(profileText.includes('Alice Candidate A'));
  });

  it('12. rejects query string tokens (/mcp?token=...) with 400 QUERY_TOKEN_PROHIBITED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/mcp?token=${accessTokenMemberA}`,
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-query-token-1',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error?.message.includes('prohibited'));
  });

  // ---------------------------------------------------------------------------
  // 5. Multi-Tenant Sovereign Isolation
  // ---------------------------------------------------------------------------
  it('13. prevents cross-tenant access (Tenant A OAuth token querying Tenant B candidate fails with 404 / -32004)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${accessTokenMemberA}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'get_candidate_profile',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-cross-tenant-1',
        method: 'tools/call',
        params: {
          name: 'get_candidate_profile',
          arguments: {
            candidateId: candidateB.id, // Candidate from Tenant B!
          },
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    const isError = body.error || body.result?.isError;
    assert.ok(isError, 'Expected cross-tenant access error');
    const errMsg = body.error?.message || body.result?.content?.[0]?.text || '';
    assert.match(errMsg, /not found/i);
  });

  it('13b. enforces token scope restriction (career:read OAuth token rejected on write tool)', async () => {
    // Mint token with only career:read scope
    const readOnlyCode = await oauthService.createAuthorizationCode({
      clientId: 'claude-web',
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      resource: expectedResource,
      codeChallenge: validChallenge,
      codeChallengeMethod: 'S256',
      scopes: ['career:read'],
      tenantId: tenantA.id,
      userId: userAMember.id,
      userRole: 'MEMBER',
    });

    const readTokenRes = await oauthService.exchangeAuthorizationCode({
      clientId: 'claude-web',
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      resource: expectedResource,
      code: readOnlyCode,
      codeVerifier: validVerifier,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${readTokenRes.access_token}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'propose_project_improvement',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-scope-denied-1',
        method: 'tools/call',
        params: {
          name: 'propose_project_improvement',
          arguments: {
            candidateId: candidateA.id,
            jobDescriptionText:
              'We are seeking a Senior Backend Engineer proficient in Redis caching, PostgreSQL indexing, and distributed systems.',
          },
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    const isError = body.error || body.result?.isError;
    assert.ok(isError, 'Expected scope denial error');
    const errMsg = body.error?.message || body.result?.content?.[0]?.text || '';
    assert.match(errMsg, /scope|permission|forbidden/i);
  });

  // ---------------------------------------------------------------------------
  // 6. Refresh Token Rotation (RTR) & Replay Family Revocation
  // ---------------------------------------------------------------------------
  let rotatedAccessToken;
  let _rotatedRefreshToken;

  it('14. refreshes access token using Refresh Token Rotation (RTR)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'claude-web',
        resource: expectedResource,
        refresh_token: refreshTokenMemberA,
      }).toString(),
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.access_token);
    assert.ok(body.refresh_token);
    assert.notEqual(body.access_token, accessTokenMemberA);
    assert.notEqual(body.refresh_token, refreshTokenMemberA);

    rotatedAccessToken = body.access_token;
    _rotatedRefreshToken = body.refresh_token;
  });

  it('15. detects refresh token replay (reusing old refresh token revokes entire token family)', async () => {
    // Replay old refresh token (refreshTokenMemberA)
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'claude-web',
        resource: expectedResource,
        refresh_token: refreshTokenMemberA, // Replay!
      }).toString(),
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'invalid_grant');
    assert.ok(body.error_description.includes('replay detected'));

    // Verify that the newly rotated token was also revoked as part of the family
    const mcpRes = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${rotatedAccessToken}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-after-family-revocation',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    assert.equal(mcpRes.statusCode, 401);
  });

  // ---------------------------------------------------------------------------
  // 7. Token Revocation (POST /oauth/revoke)
  // ---------------------------------------------------------------------------
  it('16. revokes token explicitly via POST /oauth/revoke and blocks subsequent MCP calls', async () => {
    // Mint fresh code and token
    const rawCode = await oauthService.createAuthorizationCode({
      clientId: 'claude-web',
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      resource: expectedResource,
      codeChallenge: validChallenge,
      codeChallengeMethod: 'S256',
      scopes: ['career:read'],
      tenantId: tenantA.id,
      userId: userAMember.id,
      userRole: 'MEMBER',
    });

    const tokenRes = await oauthService.exchangeAuthorizationCode({
      clientId: 'claude-web',
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      resource: expectedResource,
      code: rawCode,
      codeVerifier: validVerifier,
    });

    const freshAccessToken = tokenRes.access_token;

    // Verify it works
    const test1 = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${freshAccessToken}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-before-revoke',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });
    assert.equal(test1.statusCode, 200);

    // Revoke token
    const revokeRes = await app.inject({
      method: 'POST',
      url: '/oauth/revoke',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        token: freshAccessToken,
        client_id: 'claude-web',
      }).toString(),
    });

    assert.equal(revokeRes.statusCode, 200);
    assert.equal(JSON.parse(revokeRes.body).revoked, true);

    // Verify it is now rejected with 401
    const test2 = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${freshAccessToken}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-after-revoke',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });
    assert.equal(test2.statusCode, 401);
  });
});
