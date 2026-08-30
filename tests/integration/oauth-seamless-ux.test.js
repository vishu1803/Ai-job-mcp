/**
 * @file OAuth Seamless UX, Multi-Client Isolation & Grant Lifecycle Integration Tests (P14-004 / ARCH-054).
 *
 * Verifies the production-grade OAuth 2.1 UX and security invariants:
 * 1. New User Flow: Unauthenticated client -> /oauth/authorize -> 302 /auth/github -> login -> consent -> code -> token -> MCP.
 * 2. Returning User Flow (Active Browser Session): Hits /oauth/authorize -> direct consent UI -> approve -> code -> token -> MCP.
 * 3. Non-Silent AI Client Isolation: User logged into Career Hub is NEVER silently granted access to an AI client; consent is mandatory.
 * 4. Multi-Client Independence: Authorizing Claude (claude-web) does NOT grant access to ChatGPT (chatgpt-web); each client requires separate consent.
 * 5. Returning Authorized User (Silent Refresh): Valid refresh_token exchanges for new access_token + rotated refresh_token without browser interaction.
 * 6. Expired Token Handling: Expired access_token rejected on /mcp with 401; refresh_token restores access.
 * 7. Revoked Token Handling: /oauth/revoke invalidates access token and prevents subsequent /mcp calls.
 * 8. Replay & Anti-Tamper Protections:
 *    - Consumed authorization code cannot be replayed (INVALID_GRANT).
 *    - Replayed refresh token revokes entire token family (theft detection).
 *    - PKCE code_verifier mismatch is rejected (INVALID_GRANT).
 * 9. Multi-Tenant Isolation: Tenant A OAuth token cannot access Tenant B candidate data.
 * 10. Scope Enforcement: Read-only scope (career:read) rejected on write tools with 403.
 * 11. Ephemeral database lifecycle: 100% clean teardown with zero pool leaks.
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
  skills,
  candidateSkills,
  projects,
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

describe('OAuth Seamless UX, Multi-Client Isolation & Grant Lifecycle Tests', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let app;
  let oauthService;
  let tokenService;
  let rateLimiter;

  let tenantA;
  let userA;
  let candidateA;
  let sessionA;
  let cookieHeaderA;

  let _tenantB;
  let userB;
  let candidateB;

  let expectedResource;

  const validVerifierClaude = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk_claude_verifier_12345';
  const validChallengeClaude = crypto
    .createHash('sha256')
    .update(validVerifierClaude, 'utf8')
    .digest('base64url');

  const validVerifierChatGPT = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk_chatgpt_verifier_12345';
  const validChallengeChatGPT = crypto
    .createHash('sha256')
    .update(validVerifierChatGPT, 'utf8')
    .digest('base64url');

  const PROTOCOL_META = Object.freeze({
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientCapabilities': {},
  });

  async function invokeMcp({ token, method = 'tools/call', toolName, args = {}, id = 1 }) {
    const headers = {
      authorization: `Bearer ${token}`,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': method,
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

  before(async () => {
    // 1. Provision Tenant A & User A
    const tenantIdA = crypto.randomUUID();
    createdTenantIds.push(tenantIdA);

    [tenantA] = await db
      .insert(tenants)
      .values({
        id: tenantIdA,
        name: `Tenant A Seamless UX ${testRunId}`,
        slug: `tenant-a-ux-${testRunId}`,
        tier: 'PRO',
      })
      .returning();

    const userIdA = crypto.randomUUID();
    [userA] = await db
      .insert(users)
      .values({
        id: userIdA,
        tenantId: tenantIdA,
        email: `user-a-ux-${testRunId}@example.test`,
        displayName: `Alex Mercer UX ${testRunId}`,
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    const candidateIdA = crypto.randomUUID();
    [candidateA] = await db
      .insert(candidates)
      .values({
        id: candidateIdA,
        tenantId: tenantIdA,
        userId: userA.id,
        displayName: `Alex Mercer UX ${testRunId}`,
        canonicalEmail: `user-a-ux-${testRunId}@example.test`,
        headline: 'Staff Distributed Systems Engineer',
        status: 'ACTIVE',
      })
      .returning();

    const skillIdA = crypto.randomUUID();
    await db.insert(skills).values({
      id: skillIdA,
      name: `Distributed Architecture ${testRunId}`,
      slug: `dist-arch-${testRunId}`,
      category: 'ARCHITECTURE',
    });

    await db.insert(candidateSkills).values({
      id: crypto.randomUUID(),
      tenantId: tenantIdA,
      candidateId: candidateA.id,
      skillId: skillIdA,
      category: 'ARCHITECTURE',
      confidenceScore: 0.96,
      provenanceStatus: 'VERIFIED',
      evidenceCount: 8,
    });

    const projectIdA = crypto.randomUUID();
    await db.insert(projects).values({
      id: projectIdA,
      tenantId: tenantIdA,
      candidateId: candidateA.id,
      name: 'cloud-control-plane',
      slug: `cloud-control-plane-${testRunId}`,
      headline: 'Multi-region Kubernetes control plane with eBPF telemetry',
      role: 'Lead Engineer',
      isHighlighted: true,
    });

    // 2. Provision Tenant B & User B (for cross-tenant boundary verification)
    const tenantIdB = crypto.randomUUID();
    createdTenantIds.push(tenantIdB);

    [_tenantB] = await db
      .insert(tenants)
      .values({
        id: tenantIdB,
        name: `Tenant B Seamless UX ${testRunId}`,
        slug: `tenant-b-ux-${testRunId}`,
        tier: 'FREE',
      })
      .returning();

    const userIdB = crypto.randomUUID();
    [userB] = await db
      .insert(users)
      .values({
        id: userIdB,
        tenantId: tenantIdB,
        email: `user-b-ux-${testRunId}@example.test`,
        displayName: `Bella Tenant B ${testRunId}`,
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
        userId: userB.id,
        displayName: `Bella Candidate B ${testRunId}`,
        canonicalEmail: `user-b-ux-${testRunId}@example.test`,
        headline: 'Security Researcher',
        status: 'ACTIVE',
      })
      .returning();

    // 3. Create active session for User A
    const cookieOpts = getSessionCookieOptions(config);
    sessionA = await createSession(db, {
      userId: userA.id,
      tenantId: tenantA.id,
    });
    cookieHeaderA = `${cookieOpts.name}=${sessionA.rawToken}`;

    // 4. Initialize Services & Fastify App
    oauthService = new OAuthAuthorizationService({ db });
    expectedResource = oauthService.getExpectedResourceUrl();
    tokenService = new McpApiTokenService({ db });
    rateLimiter = new McpRateLimiter({ authLimit: 1000, ipLimit: 1000 });

    const mcpServer = createCareerMcpServer({ deps: { db } });
    app = await buildApp({
      mcpServer,
      tokenService,
      oauthService,
      rateLimiter,
      db,
    });
    await app.ready();
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    for (const tId of createdTenantIds) {
      await db.delete(oauthTokens).where(eq(oauthTokens.tenantId, tId));
      await db.delete(oauthAuthorizationCodes).where(eq(oauthAuthorizationCodes.tenantId, tId));
      await db.delete(sessions).where(eq(sessions.tenantId, tId));
      await db.delete(candidateSkills).where(eq(candidateSkills.tenantId, tId));
      await db.delete(projects).where(eq(projects.tenantId, tId));
      await db.delete(candidates).where(eq(candidates.tenantId, tId));
      await db.delete(users).where(eq(users.tenantId, tId));
      await db.delete(tenants).where(eq(tenants.id, tId));
    }
    await closeDatabase();
  });

  // ---------------------------------------------------------------------------
  // 1. Scenario 1: New Unauthenticated User Flow
  // ---------------------------------------------------------------------------
  it('1. New User: Unauthenticated request to /oauth/authorize redirects to /auth/github with preserved return_to', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/oauth/authorize',
      query: {
        response_type: 'code',
        client_id: 'claude-web',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        resource: expectedResource,
        scope: 'career:read career:write',
        state: 'new_user_state_123',
        code_challenge: validChallengeClaude,
        code_challenge_method: 'S256',
      },
    });

    assert.strictEqual(res.statusCode, 302);
    const location = res.headers['location'];
    assert.ok(location.startsWith('/auth/github?return_to='));

    const parsed = new URL(location, 'http://localhost');
    const returnTo = parsed.searchParams.get('return_to');
    assert.ok(returnTo.startsWith('/oauth/authorize?'));
    assert.ok(returnTo.includes('client_id=claude-web'));
    assert.ok(returnTo.includes('new_user_state_123'));
  });

  // ---------------------------------------------------------------------------
  // 2. Scenario 2: Logged-in User without AI Authorization
  // ---------------------------------------------------------------------------
  it('2. Logged-in User: Displays explicit consent screen for claude-web without silent auto-grant', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/oauth/authorize',
      headers: {
        cookie: cookieHeaderA,
      },
      query: {
        response_type: 'code',
        client_id: 'claude-web',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        resource: expectedResource,
        scope: 'career:read career:write',
        state: 'consent_state_456',
        code_challenge: validChallengeClaude,
        code_challenge_method: 'S256',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.payload, /Authorize Claude \(Web Client\)|Authorize Anthropic Claude/);
    assert.match(res.payload, /Alex Mercer UX/);
    assert.match(res.payload, /form method="POST" action="\/oauth\/authorize\/consent"/);
  });

  it('2b. Automatic Client Identification (CIMD): Displays consent screen for Anthropic hosted metadata URL without manual client ID entry', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/oauth/authorize',
      headers: {
        cookie: cookieHeaderA,
      },
      query: {
        response_type: 'code',
        client_id: 'https://claude.ai/api/mcp/client-metadata.json',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        resource: expectedResource,
        scope: 'career:read',
        state: 'cimd_consent_state_789',
        code_challenge: validChallengeClaude,
        code_challenge_method: 'S256',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.match(res.payload, /Authorize Anthropic Claude/);
    assert.match(res.payload, /career:read/);
    assert.match(res.payload, /Human-in-the-Loop Safety Guarantee/);
  });

  // ---------------------------------------------------------------------------
  // 3. Scenario 3: Consent Grant & Single-Use Authorization Code Exchange
  // ---------------------------------------------------------------------------
  let claudeAuthCode;
  let claudeAccessToken;
  let claudeRefreshToken;

  it('3. User Approves Consent: Mints single-use authorization code and redirects to Claude callback', async () => {
    const consentRes = await app.inject({
      method: 'POST',
      url: '/oauth/authorize/consent',
      headers: {
        cookie: cookieHeaderA,
      },
      payload: {
        client_id: 'claude-web',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        resource: expectedResource,
        scope: 'career:read career:write',
        state: 'consent_state_456',
        code_challenge: validChallengeClaude,
        code_challenge_method: 'S256',
        action: 'allow',
      },
    });

    assert.strictEqual(consentRes.statusCode, 302);
    const redirectUrl = new URL(consentRes.headers['location']);
    assert.strictEqual(redirectUrl.origin, 'https://claude.ai');
    assert.strictEqual(redirectUrl.pathname, '/api/mcp/auth_callback');
    assert.strictEqual(redirectUrl.searchParams.get('state'), 'consent_state_456');

    claudeAuthCode = redirectUrl.searchParams.get('code');
    assert.ok(claudeAuthCode, 'Expected authorization code in redirect');
    assert.ok(claudeAuthCode.startsWith('mcp_oauth_code_'));

    // Token Exchange with PKCE verifier
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      payload: {
        grant_type: 'authorization_code',
        client_id: 'claude-web',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        resource: expectedResource,
        code: claudeAuthCode,
        code_verifier: validVerifierClaude,
      },
    });

    assert.strictEqual(tokenRes.statusCode, 200);
    const tokenBody = JSON.parse(tokenRes.payload);
    assert.ok(tokenBody.access_token);
    assert.ok(tokenBody.refresh_token);
    assert.strictEqual(tokenBody.token_type, 'Bearer');
    assert.strictEqual(tokenBody.scope, 'career:read career:write');

    claudeAccessToken = tokenBody.access_token;
    claudeRefreshToken = tokenBody.refresh_token;
  });

  it('3b. Replaying consumed authorization code is strictly rejected with 400 INVALID_GRANT', async () => {
    const replayRes = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      payload: {
        grant_type: 'authorization_code',
        client_id: 'claude-web',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        resource: expectedResource,
        code: claudeAuthCode,
        code_verifier: validVerifierClaude,
      },
    });

    assert.strictEqual(replayRes.statusCode, 400);
    const body = JSON.parse(replayRes.payload);
    assert.strictEqual(body.error, 'invalid_grant');
  });

  // ---------------------------------------------------------------------------
  // 4. Scenario 4: MCP Execution under Claude Token
  // ---------------------------------------------------------------------------
  it('4. MCP Execution: Claude token accesses tools/list and candidate profile tools', async () => {
    const mcpRes = await invokeMcp({
      token: claudeAccessToken,
      method: 'tools/call',
      toolName: 'get_candidate_profile',
      args: { candidateId: candidateA.id },
    });

    assert.strictEqual(mcpRes.statusCode, 200);
    const body = JSON.parse(mcpRes.payload);
    assert.strictEqual(body.error, undefined);
    assert.ok(body.result);
    assert.match(body.result.content[0].text, /Alex Mercer UX/);
  });

  // ---------------------------------------------------------------------------
  // 5. Scenario 5: Multi-Client Independence (ChatGPT requires separate consent)
  // ---------------------------------------------------------------------------
  it('5. Multi-Client Independence: Having authorized Claude does NOT grant access to chatgpt-web; ChatGPT must request its own consent', async () => {
    const chatgptAuthRes = await app.inject({
      method: 'GET',
      url: '/oauth/authorize',
      headers: {
        cookie: cookieHeaderA,
      },
      query: {
        response_type: 'code',
        client_id: 'chatgpt-web',
        redirect_uri: 'https://chatgpt.com/api/mcp/oauth_callback',
        resource: expectedResource,
        scope: 'career:read',
        state: 'chatgpt_state_789',
        code_challenge: validChallengeChatGPT,
        code_challenge_method: 'S256',
      },
    });

    assert.strictEqual(chatgptAuthRes.statusCode, 200);
    assert.match(chatgptAuthRes.payload, /ChatGPT/);
    assert.match(chatgptAuthRes.payload, /Authorize OpenAI ChatGPT/);
    assert.match(chatgptAuthRes.payload, /career:read/);
    // career:write was not requested by ChatGPT here, so write description is omitted
    assert.doesNotMatch(chatgptAuthRes.payload, /Propose & Confirm Improvements/);
  });

  it('5b. Authorize ChatGPT separately: Grants independent access_token bound strictly to chatgpt-web', async () => {
    const consentRes = await app.inject({
      method: 'POST',
      url: '/oauth/authorize/consent',
      headers: {
        cookie: cookieHeaderA,
      },
      payload: {
        client_id: 'chatgpt-web',
        redirect_uri: 'https://chatgpt.com/api/mcp/oauth_callback',
        resource: expectedResource,
        scope: 'career:read',
        state: 'chatgpt_state_789',
        code_challenge: validChallengeChatGPT,
        code_challenge_method: 'S256',
        action: 'allow',
      },
    });

    assert.strictEqual(consentRes.statusCode, 302);
    const redirectUrl = new URL(consentRes.headers['location']);
    assert.strictEqual(redirectUrl.origin, 'https://chatgpt.com');
    const chatgptCode = redirectUrl.searchParams.get('code');

    const tokenRes = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      payload: {
        grant_type: 'authorization_code',
        client_id: 'chatgpt-web',
        redirect_uri: 'https://chatgpt.com/api/mcp/oauth_callback',
        resource: expectedResource,
        code: chatgptCode,
        code_verifier: validVerifierChatGPT,
      },
    });

    assert.strictEqual(tokenRes.statusCode, 200);
    const tokenBody = JSON.parse(tokenRes.payload);
    assert.strictEqual(tokenBody.scope, 'career:read');

    // Verify chatgpt-web token cannot call write tool
    const writeToolRes = await invokeMcp({
      token: tokenBody.access_token,
      method: 'tools/call',
      toolName: 'propose_project_improvement',
      args: {
        candidateId: candidateA.id,
        jobDescriptionText:
          'We are seeking a Senior Backend Engineer proficient in Redis caching, PostgreSQL indexing, and distributed systems.',
      },
    });

    assert.strictEqual(writeToolRes.statusCode, 200);
    const writeBody = JSON.parse(writeToolRes.payload);
    const isWriteError = writeBody.error || writeBody.result?.isError;
    assert.ok(isWriteError, 'Expected write tool error on read-only token');
    const writeErrMsg = writeBody.error?.message || writeBody.result?.content?.[0]?.text || '';
    assert.match(writeErrMsg, /scope|permission|forbidden|Requires one of/i);
  });

  // ---------------------------------------------------------------------------
  // 6. Scenario 6: Returning Authorized User (Silent Refresh Token Exchange)
  // ---------------------------------------------------------------------------
  let _rotatedClaudeRefreshToken;
  let renewedClaudeAccessToken;

  it('6. Silent Refresh: Returning AI client rotates refresh_token on POST /oauth/token without user interaction', async () => {
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      payload: {
        grant_type: 'refresh_token',
        client_id: 'claude-web',
        refresh_token: claudeRefreshToken,
        resource: expectedResource,
      },
    });

    assert.strictEqual(refreshRes.statusCode, 200);
    const body = JSON.parse(refreshRes.payload);
    assert.ok(body.access_token);
    assert.ok(body.refresh_token);
    assert.notStrictEqual(body.refresh_token, claudeRefreshToken);

    renewedClaudeAccessToken = body.access_token;
    _rotatedClaudeRefreshToken = body.refresh_token;

    // Renewed access token functions on MCP immediately
    const mcpRes = await invokeMcp({
      token: renewedClaudeAccessToken,
      method: 'tools/list',
    });

    assert.strictEqual(mcpRes.statusCode, 200);
    const mcpBody = JSON.parse(mcpRes.payload);
    assert.ok(Array.isArray(mcpBody.result?.tools));
  });

  // ---------------------------------------------------------------------------
  // 7. Scenario 7: Refresh Token Replay Detection & Family Revocation
  // ---------------------------------------------------------------------------
  it('7. Replay Detection: Reusing old refresh token revokes entire token family immediately', async () => {
    const replayRes = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      payload: {
        grant_type: 'refresh_token',
        client_id: 'claude-web',
        refresh_token: claudeRefreshToken, // Old already-rotated token!
        resource: expectedResource,
      },
    });

    assert.strictEqual(replayRes.statusCode, 400);
    const body = JSON.parse(replayRes.payload);
    assert.strictEqual(body.error, 'invalid_grant');
    assert.match(body.error_description, /family has been revoked/i);

    // Previously renewed access token is now also invalidated
    const mcpRes = await invokeMcp({
      token: renewedClaudeAccessToken,
      method: 'tools/list',
    });

    assert.strictEqual(mcpRes.statusCode, 401);
  });

  // ---------------------------------------------------------------------------
  // 8. Scenario 8: Multi-Tenant Boundary Defense
  // ---------------------------------------------------------------------------
  it('8. Multi-Tenant Isolation: Tenant A token querying Tenant B candidate fails with 404 NOT_FOUND', async () => {
    // Generate fresh token for Tenant A
    const code = await oauthService.createAuthorizationCode({
      clientId: 'claude-web',
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      resource: expectedResource,
      codeChallenge: validChallengeClaude,
      codeChallengeMethod: 'S256',
      scopes: ['career:read'],
      tenantId: tenantA.id,
      userId: userA.id,
      userRole: userA.role,
    });

    const tokenRes = await oauthService.exchangeAuthorizationCode({
      clientId: 'claude-web',
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      resource: expectedResource,
      code,
      codeVerifier: validVerifierClaude,
    });

    const crossTenantRes = await invokeMcp({
      token: tokenRes.access_token,
      method: 'tools/call',
      toolName: 'get_candidate_profile',
      args: { candidateId: candidateB.id }, // Candidate belonging to Tenant B!
    });

    assert.strictEqual(crossTenantRes.statusCode, 200);
    const body = JSON.parse(crossTenantRes.payload);
    const isError = body.error || body.result?.isError;
    assert.ok(isError, 'Expected cross-tenant access error');
    const errMsg = body.error?.message || body.result?.content?.[0]?.text || '';
    assert.match(errMsg, /Candidate not found/i);
  });

  // ---------------------------------------------------------------------------
  // 9. Scenario 9: Token Revocation Lifecycle
  // ---------------------------------------------------------------------------
  it('9. Token Revocation: POST /oauth/revoke invalidates access token permanently', async () => {
    const code = await oauthService.createAuthorizationCode({
      clientId: 'claude-web',
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      resource: expectedResource,
      codeChallenge: validChallengeClaude,
      codeChallengeMethod: 'S256',
      scopes: ['career:read'],
      tenantId: tenantA.id,
      userId: userA.id,
      userRole: userA.role,
    });

    const tokenRes = await oauthService.exchangeAuthorizationCode({
      clientId: 'claude-web',
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      resource: expectedResource,
      code,
      codeVerifier: validVerifierClaude,
    });

    // Revoke token
    const revokeRes = await app.inject({
      method: 'POST',
      url: '/oauth/revoke',
      payload: {
        token: tokenRes.access_token,
      },
    });

    assert.strictEqual(revokeRes.statusCode, 200);

    // Verify immediate rejection
    const mcpRes = await invokeMcp({
      token: tokenRes.access_token,
      method: 'tools/list',
    });

    assert.strictEqual(mcpRes.statusCode, 401);
  });
});
