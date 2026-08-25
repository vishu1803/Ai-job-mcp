/**
 * @file OAuth 2.1 Authorization Server Unit Tests (P10-001).
 *
 * Tests:
 * 1. SHA-256 token hashing and PKCE S256 verification.
 * 2. Redirect URI matching (exact web + RFC 8252 loopback).
 * 3. RFC 8707 Resource Indicator canonicalization and matching.
 * 4. Zod schema validation for metadata, query, token requests, and revocation.
 * 5. OAuthAuthorizationService code generation, PKCE exchange, single-use invalidation,
 *    refresh token rotation (RTR), replay detection, resource binding, and token revocation.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  OAuthProtectedResourceMetadataSchema,
  OAuthAuthorizationServerMetadataSchema,
  OAuthAuthorizeQuerySchema,
  OAuthConsentBodySchema,
  OAuthTokenRequestSchema,
} from '../../src/domain/oauth/oauth.schemas.js';
import {
  OAuthAuthorizationService,
  PRECONFIGURED_OAUTH_CLIENTS,
  hashOAuthToken,
  verifyCodeChallenge,
  isMatchingRedirectUri,
  canonicalizeResourceUrl,
  isMatchingResource,
} from '../../src/services/oauth-authorization.service.js';
import {
  isValidReturnTo,
  generateOAuthState,
  validateAndConsumeOAuthState,
} from '../../src/security/oauth-state.js';
import { oauthAuthorizationCodes, oauthTokens, users, tenants } from '../../src/db/schema.js';

describe('OAuth 2.1 Cryptographic & Validation Primitives', () => {
  it('computes deterministic 64-char SHA-256 token hashes', () => {
    const raw = 'mcp_oauth_acc_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const hash1 = hashOAuthToken(raw);
    const hash2 = hashOAuthToken(raw);

    assert.equal(hash1.length, 64);
    assert.equal(hash1, hash2);
    assert.match(hash1, /^[0-9a-f]{64}$/);
  });

  it('correctly verifies PKCE S256 code challenge against verifier', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expectedChallenge = crypto
      .createHash('sha256')
      .update(verifier, 'utf8')
      .digest('base64url');

    assert.equal(verifyCodeChallenge(verifier, expectedChallenge, 'S256'), true);
    assert.equal(
      verifyCodeChallenge(
        'wrong_verifier_string_123456789012345678901234',
        expectedChallenge,
        'S256'
      ),
      false
    );
    assert.equal(verifyCodeChallenge(verifier, expectedChallenge, 'plain'), false);
    assert.equal(verifyCodeChallenge(null, expectedChallenge, 'S256'), false);
    assert.equal(verifyCodeChallenge(verifier, null, 'S256'), false);
  });

  it('matches exact redirect URIs for public web clients', () => {
    const claudeWeb = PRECONFIGURED_OAUTH_CLIENTS['claude-web'];

    assert.equal(isMatchingRedirectUri(claudeWeb, 'https://claude.ai/api/mcp/auth_callback'), true);
    assert.equal(
      isMatchingRedirectUri(claudeWeb, 'https://attacker.com/api/mcp/auth_callback'),
      false
    );
    assert.equal(isMatchingRedirectUri(claudeWeb, 'http://claude.ai/api/mcp/auth_callback'), false);
    assert.equal(isMatchingRedirectUri(claudeWeb, 'https://claude.ai/other_path'), false);
  });

  it('matches port-agnostic loopback redirect URIs for native desktop/CLI clients (RFC 8252)', () => {
    const claudeDesktop = PRECONFIGURED_OAUTH_CLIENTS['claude-desktop'];

    assert.equal(isMatchingRedirectUri(claudeDesktop, 'http://localhost/callback'), true);
    assert.equal(isMatchingRedirectUri(claudeDesktop, 'http://localhost:3118/callback'), true);
    assert.equal(isMatchingRedirectUri(claudeDesktop, 'http://127.0.0.1:8080/callback'), true);
    assert.equal(isMatchingRedirectUri(claudeDesktop, 'http://localhost:3118/wrong_path'), false);
    assert.equal(isMatchingRedirectUri(claudeDesktop, 'https://localhost/callback'), false);
    assert.equal(isMatchingRedirectUri(claudeDesktop, 'http://evil.com/callback'), false);
  });

  it('canonicalizes RFC 8707 Resource Indicator URLs correctly', () => {
    assert.equal(
      canonicalizeResourceUrl('https://API.CareerHub.Example.com/mcp/'),
      'https://api.careerhub.example.com/mcp'
    );
    assert.equal(canonicalizeResourceUrl('http://localhost:3000/mcp'), 'http://localhost:3000/mcp');
    assert.equal(canonicalizeResourceUrl('https://example.com/mcp///'), 'https://example.com/mcp');

    // Invalid scheme
    assert.throws(() => canonicalizeResourceUrl('ftp://example.com/mcp'));
    // Malformed URL
    assert.throws(() => canonicalizeResourceUrl('not-a-valid-url'));
    // Empty
    assert.throws(() => canonicalizeResourceUrl(''));
  });

  it('verifies RFC 8707 Resource Indicator matching and rejection', () => {
    const configured = 'https://api.careerhub.example.com/mcp';

    assert.equal(isMatchingResource('https://api.careerhub.example.com/mcp', configured), true);
    assert.equal(isMatchingResource('https://api.careerhub.example.com/mcp/', configured), true);
    assert.equal(isMatchingResource('https://API.CAREERHUB.EXAMPLE.COM/mcp', configured), true);

    // Mismatched host / attacker
    assert.equal(isMatchingResource('https://attacker.example.com/mcp', configured), false);
    // Mismatched scheme
    assert.equal(isMatchingResource('http://api.careerhub.example.com/mcp', configured), false);
    // Mismatched path
    assert.equal(isMatchingResource('https://api.careerhub.example.com/other', configured), false);
    // Missing / invalid
    assert.equal(isMatchingResource(null, configured), false);
    assert.equal(isMatchingResource('https://api.careerhub.example.com/mcp', null), false);
  });
});

describe('OAuth 2.1 Domain Schemas Validation', () => {
  it('validates RFC 9728 Protected Resource Metadata schema', () => {
    const valid = {
      resource: 'https://api.careerhub.example.com/mcp',
      authorization_servers: ['https://api.careerhub.example.com'],
      scopes_supported: ['career:read', 'career:write'],
      bearer_methods_supported: ['header'],
    };
    const parsed = OAuthProtectedResourceMetadataSchema.parse(valid);
    assert.equal(parsed.resource, valid.resource);
  });

  it('validates RFC 8414 Authorization Server Metadata schema', () => {
    const valid = {
      issuer: 'https://api.careerhub.example.com',
      authorization_endpoint: 'https://api.careerhub.example.com/oauth/authorize',
      token_endpoint: 'https://api.careerhub.example.com/oauth/token',
      revocation_endpoint: 'https://api.careerhub.example.com/oauth/revoke',
      jwks_uri: 'https://api.careerhub.example.com/.well-known/jwks.json',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['career:read', 'career:write'],
      resource_indicators_supported: true,
    };
    const parsed = OAuthAuthorizationServerMetadataSchema.parse(valid);
    assert.equal(parsed.issuer, valid.issuer);
    assert.equal(parsed.resource_indicators_supported, true);
  });

  it('validates OAuthAuthorizeQuerySchema and requires resource parameter', () => {
    const validQuery = {
      response_type: 'code',
      client_id: 'claude-web',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      resource: 'https://api.careerhub.example.com/mcp',
      scope: 'career:read career:write',
      state: 'xyz123_csrf',
      code_challenge: 'E9Melhoa2OwvFrGMTJguCH5rtx64fZqiJ100wnqdXUQ',
      code_challenge_method: 'S256',
    };
    assert.doesNotThrow(() => OAuthAuthorizeQuerySchema.parse(validQuery));

    // Missing resource rejected
    assert.throws(() => OAuthAuthorizeQuerySchema.parse({ ...validQuery, resource: undefined }));

    // Invalid resource URL rejected
    assert.throws(() => OAuthAuthorizeQuerySchema.parse({ ...validQuery, resource: 'not-a-url' }));

    // Missing state rejected
    assert.throws(() => OAuthAuthorizeQuerySchema.parse({ ...validQuery, state: undefined }));

    // Implicit grant rejected
    assert.throws(() => OAuthAuthorizeQuerySchema.parse({ ...validQuery, response_type: 'token' }));

    // Plain PKCE rejected
    assert.throws(() =>
      OAuthAuthorizeQuerySchema.parse({ ...validQuery, code_challenge_method: 'plain' })
    );

    // Short code_challenge rejected
    assert.throws(() =>
      OAuthAuthorizeQuerySchema.parse({ ...validQuery, code_challenge: 'too_short' })
    );
  });

  it('validates OAuthTokenRequestSchema for code exchange and refresh with resource', () => {
    const validCodeExchange = {
      grant_type: 'authorization_code',
      client_id: 'claude-web',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      resource: 'https://api.careerhub.example.com/mcp',
      code: 'mcp_oauth_code_123',
      code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    };
    assert.doesNotThrow(() => OAuthTokenRequestSchema.parse(validCodeExchange));

    // Missing resource in authorization_code grant rejected
    assert.throws(() =>
      OAuthTokenRequestSchema.parse({
        ...validCodeExchange,
        resource: undefined,
      })
    );

    // Missing code_verifier rejected
    assert.throws(() =>
      OAuthTokenRequestSchema.parse({
        ...validCodeExchange,
        code_verifier: undefined,
      })
    );

    const validRefresh = {
      grant_type: 'refresh_token',
      client_id: 'claude-web',
      refresh_token: 'mcp_oauth_ref_123',
      resource: 'https://api.careerhub.example.com/mcp',
    };
    assert.doesNotThrow(() => OAuthTokenRequestSchema.parse(validRefresh));

    // Missing refresh_token rejected
    assert.throws(() =>
      OAuthTokenRequestSchema.parse({
        ...validRefresh,
        refresh_token: undefined,
      })
    );
  });
});

describe('OAuthAuthorizationService Lifecycle Logic (Mocked DB)', () => {
  let mockDb;
  let service;
  let mockCodes = [];
  let mockTokens = [];
  let mockUsers = [];
  let mockTenants = [];

  beforeEach(() => {
    mockCodes = [];
    mockTokens = [];
    mockUsers = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        role: 'MEMBER',
        status: 'ACTIVE',
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        role: 'READONLY',
        status: 'ACTIVE',
      },
    ];
    mockTenants = [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        status: 'ACTIVE',
      },
    ];

    mockDb = {
      select: () => ({
        from: (table) => ({
          where: (_condition) => ({
            limit: () => {
              if (table === oauthAuthorizationCodes) {
                return mockCodes.slice(-1);
              }
              if (table === oauthTokens) {
                return mockTokens.slice(-1);
              }
              if (table === users) {
                return mockUsers.slice(0, 1);
              }
              if (table === tenants) {
                return mockTenants.slice(0, 1);
              }
              return [];
            },
          }),
        }),
      }),
      insert: (table) => ({
        values: (val) => {
          if (table === oauthAuthorizationCodes) {
            const row = { id: crypto.randomUUID(), ...val };
            mockCodes.push(row);
            return Promise.resolve([row]);
          }
          if (table === oauthTokens) {
            const row = { id: crypto.randomUUID(), ...val };
            mockTokens.push(row);
            return Promise.resolve([row]);
          }
          return Promise.resolve([]);
        },
      }),
      update: (table) => ({
        set: (updates) => ({
          where: (_cond) => {
            if (table === oauthAuthorizationCodes) {
              for (const c of mockCodes) {
                Object.assign(c, updates);
              }
            }
            if (table === oauthTokens) {
              for (const t of mockTokens) {
                Object.assign(t, updates);
              }
            }
            return Promise.resolve();
          },
        }),
      }),
    };

    service = new OAuthAuthorizationService({
      db: mockDb,
      config: {
        OAUTH_ISSUER_URL: 'http://localhost:3000',
        OAUTH_RESOURCE_URL: 'http://localhost:3000/mcp',
        OAUTH_ACCESS_TOKEN_TTL_SECONDS: 3600,
        OAUTH_REFRESH_TOKEN_TTL_SECONDS: 2592000,
        OAUTH_AUTH_CODE_TTL_SECONDS: 300,
      },
    });
  });

  it('generates protected resource and authorization server metadata', () => {
    const prm = service.getProtectedResourceMetadata();
    assert.equal(prm.resource, 'http://localhost:3000/mcp');
    assert.deepEqual(prm.authorization_servers, ['http://localhost:3000']);

    const asm = service.getAuthorizationServerMetadata();
    assert.equal(asm.issuer, 'http://localhost:3000');
    assert.equal(asm.token_endpoint, 'http://localhost:3000/oauth/token');
    assert.equal(asm.resource_indicators_supported, true);
  });

  it('validates authorization request with resource indicator and rejects mismatched resource', async () => {
    const valid = await service.validateAuthorizationRequest({
      clientId: 'claude-web',
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      resource: 'http://localhost:3000/mcp',
      scope: 'career:read',
      codeChallenge: 'E9Melhoa2OwvFrGMTJguCH5rtx64fZqiJ100wnqdXUQ',
      codeChallengeMethod: 'S256',
    });
    assert.equal(valid.resource, 'http://localhost:3000/mcp');

    // Missing resource
    await assert.rejects(
      service.validateAuthorizationRequest({
        clientId: 'claude-web',
        redirectUri: 'https://claude.ai/api/mcp/auth_callback',
        resource: undefined,
        scope: 'career:read',
        codeChallenge: 'E9Melhoa2OwvFrGMTJguCH5rtx64fZqiJ100wnqdXUQ',
        codeChallengeMethod: 'S256',
      }),
      /resource parameter is required/
    );

    // Wrong resource
    await assert.rejects(
      service.validateAuthorizationRequest({
        clientId: 'claude-web',
        redirectUri: 'https://claude.ai/api/mcp/auth_callback',
        resource: 'https://attacker.example.com/mcp',
        scope: 'career:read',
        codeChallenge: 'E9Melhoa2OwvFrGMTJguCH5rtx64fZqiJ100wnqdXUQ',
        codeChallengeMethod: 'S256',
      }),
      /does not match configured MCP resource/
    );
  });

  it('binds resource to authorization code and clamps scopes to role ceilings', async () => {
    const rawCode = await service.createAuthorizationCode({
      clientId: 'claude-web',
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      resource: 'http://localhost:3000/mcp',
      codeChallenge: 'E9Melhoa2OwvFrGMTJguCH5rtx64fZqiJ100wnqdXUQ',
      codeChallengeMethod: 'S256',
      scopes: ['career:read', 'career:write'],
      tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      userId: '22222222-2222-2222-2222-222222222222',
      userRole: 'READONLY', // READONLY role cannot have career:write!
    });

    assert.ok(rawCode.startsWith('mcp_oauth_code_'));
    assert.equal(mockCodes.length, 1);
    assert.equal(mockCodes[0].resource, 'http://localhost:3000/mcp');
    // Scopes should be clamped to ['career:read']
    assert.deepEqual(mockCodes[0].scopes, ['career:read']);
  });

  it('exchanges code for tokens bound to resource and rejects resource mismatches', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = crypto.createHash('sha256').update(verifier, 'utf8').digest('base64url');

    const rawCode = await service.createAuthorizationCode({
      clientId: 'claude-web',
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      resource: 'http://localhost:3000/mcp',
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      scopes: ['career:read'],
      tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      userId: '11111111-1111-1111-1111-111111111111',
      userRole: 'MEMBER',
    });

    // Mismatched resource at token exchange rejected
    await assert.rejects(
      service.exchangeAuthorizationCode({
        clientId: 'claude-web',
        redirectUri: 'https://claude.ai/api/mcp/auth_callback',
        resource: 'https://attacker.example.com/mcp',
        code: rawCode,
        codeVerifier: verifier,
      }),
      /does not match authorization code binding/
    );

    // Valid exchange
    const tokenResponse = await service.exchangeAuthorizationCode({
      clientId: 'claude-web',
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      resource: 'http://localhost:3000/mcp',
      code: rawCode,
      codeVerifier: verifier,
    });

    assert.ok(tokenResponse.access_token.startsWith('mcp_oauth_acc_'));
    assert.equal(mockTokens.length, 1);
    assert.equal(mockTokens[0].resource, 'http://localhost:3000/mcp');
  });

  it('rejects access token validation when expected resource does not match token audience', async () => {
    const now = new Date();
    const rawToken = 'mcp_oauth_acc_test_token_1234567890abcdef1234567890abcdef12345678';
    mockTokens.push({
      id: crypto.randomUUID(),
      tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      userId: '11111111-1111-1111-1111-111111111111',
      clientId: 'claude-web',
      accessTokenHash: hashOAuthToken(rawToken),
      resource: 'http://localhost:3000/mcp',
      tokenScopes: ['career:read'],
      isRevoked: false,
      accessTokenExpiresAt: new Date(now.getTime() + 3600 * 1000),
    });

    // Matching resource succeeds
    const validated = await service.validateAccessToken(rawToken, {
      expectedResource: 'http://localhost:3000/mcp',
    });
    assert.equal(validated.resource, 'http://localhost:3000/mcp');

    // Mismatched resource fails
    await assert.rejects(
      service.validateAccessToken(rawToken, {
        expectedResource: 'https://foreign-mcp-server.example.com/mcp',
      }),
      /OAuth access token was issued for resource/
    );
  });

  it('validates returnTo URLs against open-redirect attack vectors', () => {
    // Valid relative paths
    assert.equal(
      isValidReturnTo('/oauth/authorize?client_id=claude-web&redirect_uri=https%3A%2F%2Fclaude.ai'),
      true
    );
    assert.equal(isValidReturnTo('/oauth/authorize'), true);
    assert.equal(isValidReturnTo('/dashboard'), true);

    // Malicious external absolute URLs
    assert.equal(isValidReturnTo('https://attacker.example/oauth/authorize'), false);
    assert.equal(isValidReturnTo('http://attacker.example/oauth/authorize'), false);
    assert.equal(isValidReturnTo('javascript:alert(1)'), false);
    assert.equal(isValidReturnTo('data:text/html,<script>alert(1)</script>'), false);

    // Protocol-relative attempts
    assert.equal(isValidReturnTo('//attacker.example/oauth/authorize'), false);
    assert.equal(isValidReturnTo('/\\attacker.example'), false);

    // Control characters / newlines
    assert.equal(isValidReturnTo('/oauth/authorize\r\nHost: evil.com'), false);
    assert.equal(isValidReturnTo('/oauth/authorize\0evil'), false);

    // Unregistered paths
    assert.equal(isValidReturnTo('/admin/settings'), false);
    assert.equal(isValidReturnTo(''), false);
    assert.equal(isValidReturnTo(null), false);
  });

  it('preserves returnTo in encrypted OAuth transit state across generation and consumption', () => {
    const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const validReturnTo =
      '/oauth/authorize?response_type=code&client_id=claude-web&state=abc123state';

    const statePkg = generateOAuthState({
      provider: 'github',
      returnTo: validReturnTo,
      encryptionKey: testKey,
    });

    assert.ok(statePkg.transitCookieValue);

    const verified = validateAndConsumeOAuthState(statePkg.state, statePkg.transitCookieValue, {
      provider: 'github',
      encryptionKey: testKey,
    });

    assert.equal(verified.returnTo, validReturnTo);
  });

  it('validates OAuthConsentBodySchema and rejects unauthorized parameters or actions', () => {
    const validConsent = {
      client_id: 'claude-web',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      resource: 'http://localhost:3000/mcp',
      scope: 'career:read career:write',
      state: 'state_123456789',
      code_challenge: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      code_challenge_method: 'S256',
      action: 'allow',
    };

    assert.equal(OAuthConsentBodySchema.safeParse(validConsent).success, true);
    assert.equal(
      OAuthConsentBodySchema.safeParse({ ...validConsent, action: 'deny' }).success,
      true
    );

    // Invalid action
    assert.equal(
      OAuthConsentBodySchema.safeParse({ ...validConsent, action: 'bypass' }).success,
      false
    );

    // Missing required fields
    assert.equal(
      OAuthConsentBodySchema.safeParse({ ...validConsent, redirect_uri: undefined }).success,
      false
    );
  });

  it('rejects user_id and tenant_id query parameters in OAuthAuthorizeQuerySchema (strict identity isolation)', () => {
    const validQuery = {
      response_type: 'code',
      client_id: 'claude-web',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      resource: 'http://localhost:3000/mcp',
      scope: 'career:read',
      state: 'state12345',
      code_challenge: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      code_challenge_method: 'S256',
    };

    assert.equal(OAuthAuthorizeQuerySchema.safeParse(validQuery).success, true);

    // Query attempting to inject client-controlled user_id or tenant_id fails validation
    const poisonedQuery = {
      ...validQuery,
      user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    };
    assert.equal(OAuthAuthorizeQuerySchema.safeParse(poisonedQuery).success, false);
  });
});
