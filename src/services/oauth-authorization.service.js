/**
 * @file OAuth 2.1 Authorization & Token Management Service (P10-001).
 *
 * Implements:
 * 1. RFC 9728 Protected Resource Metadata & RFC 8414 Authorization Server Metadata.
 * 2. Pre-configured & DB-backed OAuth 2.1 Public Client registry for Claude (Web, Desktop, CLI).
 * 3. Strict RFC 8252 Loopback and exact Web redirect URI matching.
 * 4. Mandatory PKCE (S256) verification.
 * 5. Single-use Authorization Codes with 5-minute TTL.
 * 6. Access Token issuance and Refresh Token Rotation (RTR) with family revocation on replay.
 * 7. Token Revocation (RFC 7009).
 * 8. Sovereign multi-tenant resolution and RBAC role ceiling clamping.
 */

import crypto from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  oauthClients,
  oauthAuthorizationCodes,
  oauthTokens,
  users,
  tenants,
} from '../db/schema.js';
import { config } from '../config/env.js';
import { AuthenticationError, AuthorizationError, ValidationError } from '../errors/index.js';
import { ROLE_SCOPE_CEILINGS } from './mcp-api-token.service.js';

/**
 * Pre-configured OAuth 2.1 Clients for Anthropic Claude.
 */
export const PRECONFIGURED_OAUTH_CLIENTS = {
  'claude-web': {
    clientId: 'claude-web',
    clientName: 'Anthropic Claude (Web)',
    clientType: 'PUBLIC',
    redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
    allowedGrantTypes: ['authorization_code', 'refresh_token'],
    allowedScopes: ['career:read', 'career:write'],
    isTrusted: true,
  },
  'claude-desktop': {
    clientId: 'claude-desktop',
    clientName: 'Anthropic Claude Desktop',
    clientType: 'PUBLIC',
    redirectUris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
    allowedGrantTypes: ['authorization_code', 'refresh_token'],
    allowedScopes: ['career:read', 'career:write'],
    isTrusted: true,
  },
  'claude-cli': {
    clientId: 'claude-cli',
    clientName: 'Anthropic Claude Code (CLI)',
    clientType: 'PUBLIC',
    redirectUris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
    allowedGrantTypes: ['authorization_code', 'refresh_token'],
    allowedScopes: ['career:read', 'career:write'],
    isTrusted: true,
  },
};

/**
 * Computes a deterministic SHA-256 hex hash of a raw token or authorization code.
 *
 * @param {string} rawToken Raw token string
 * @returns {string} SHA-256 hex string (64 chars)
 */
export function hashOAuthToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/**
 * Verifies a PKCE S256 code challenge against the provided code verifier.
 *
 * @param {string} codeVerifier The plain text code verifier
 * @param {string} codeChallenge The expected Base64URL-encoded SHA-256 challenge
 * @param {string} [method='S256'] The challenge method (only S256 allowed)
 * @returns {boolean} True if challenge matches verifier
 */
export function verifyCodeChallenge(codeVerifier, codeChallenge, method = 'S256') {
  if (method !== 'S256') {
    return false;
  }
  if (!codeVerifier || typeof codeVerifier !== 'string') {
    return false;
  }
  if (!codeChallenge || typeof codeChallenge !== 'string') {
    return false;
  }

  const computedChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier, 'utf8')
    .digest('base64url');

  if (computedChallenge.length !== codeChallenge.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedChallenge, 'utf8'),
      Buffer.from(codeChallenge, 'utf8')
    );
  } catch {
    return false;
  }
}

/**
 * Validates whether the requested redirect URI is permitted for the client.
 * Strictly implements RFC 8252 for native clients (port-agnostic localhost matching)
 * and exact string matching for public web clients.
 *
 * @param {object} client Client definition
 * @param {string} requestedRedirectUri Requested redirect URI
 * @returns {boolean} True if valid
 */
export function isMatchingRedirectUri(client, requestedRedirectUri) {
  if (!client || !Array.isArray(client.redirectUris) || !requestedRedirectUri) {
    return false;
  }

  // Exact string match
  if (client.redirectUris.includes(requestedRedirectUri)) {
    return true;
  }

  try {
    const requestedUrl = new URL(requestedRedirectUri);

    // RFC 8252 Loopback matching for Native Desktop/CLI clients
    if (
      requestedUrl.protocol === 'http:' &&
      (requestedUrl.hostname === 'localhost' || requestedUrl.hostname === '127.0.0.1')
    ) {
      for (const registeredUri of client.redirectUris) {
        try {
          const registeredUrl = new URL(registeredUri);
          if (
            (registeredUrl.hostname === 'localhost' || registeredUrl.hostname === '127.0.0.1') &&
            registeredUrl.pathname === requestedUrl.pathname
          ) {
            return true;
          }
        } catch {
          // Ignore invalid registered URI
        }
      }
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Service for OAuth 2.1 token issuance, verification, and metadata discovery.
 */
export class OAuthAuthorizationService {
  /**
   * @param {object} [dependencies={}] Optional dependency overrides
   * @param {object} [dependencies.db] Drizzle database client
   * @param {object} [dependencies.config] Application configuration
   */
  constructor(dependencies = {}) {
    this.db = dependencies.db || db;
    this.config = dependencies.config || config;
  }

  /**
   * Returns RFC 9728 Protected Resource Metadata.
   *
   * @returns {object} Metadata object
   */
  getProtectedResourceMetadata() {
    const issuer = this.config.OAUTH_ISSUER_URL || this.config.APP_URL || 'http://localhost:3000';
    const resource =
      this.config.OAUTH_RESOURCE_URL ||
      (this.config.APP_URL ? `${this.config.APP_URL}/mcp` : 'http://localhost:3000/mcp');

    return {
      resource,
      authorization_servers: [issuer],
      scopes_supported: ['career:read', 'career:write'],
      bearer_methods_supported: ['header'],
      resource_documentation: `${issuer}/docs/mcp`,
    };
  }

  /**
   * Returns RFC 8414 OAuth 2.0 Authorization Server Metadata.
   *
   * @returns {object} Metadata object
   */
  getAuthorizationServerMetadata() {
    const issuer = this.config.OAUTH_ISSUER_URL || this.config.APP_URL || 'http://localhost:3000';

    return {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['career:read', 'career:write'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      service_documentation: `${issuer}/docs/oauth`,
    };
  }

  /**
   * Retrieves an OAuth client by clientId.
   *
   * @param {string} clientId Client identifier
   * @param {object} [options={}] Options override
   * @returns {Promise<object | null>} Client definition or null
   */
  async getClient(clientId, options = {}) {
    const database = options.db || this.db;

    if (PRECONFIGURED_OAUTH_CLIENTS[clientId]) {
      return PRECONFIGURED_OAUTH_CLIENTS[clientId];
    }

    const [foundClient] = await database
      .select()
      .from(oauthClients)
      .where(eq(oauthClients.clientId, clientId))
      .limit(1);

    return foundClient || null;
  }

  /**
   * Validates an authorization request query.
   *
   * @param {object} params Query parameters
   * @param {string} params.clientId Client ID
   * @param {string} params.redirectUri Redirect URI
   * @param {string} [params.scope] Requested scopes
   * @param {string} params.codeChallenge PKCE Code challenge
   * @param {string} [params.codeChallengeMethod='S256'] Challenge method
   * @param {object} [options={}] Options override
   * @returns {Promise<{ client: object, scopes: string[] }>}
   */
  async validateAuthorizationRequest(params, options = {}) {
    const { clientId, redirectUri, scope, codeChallenge, codeChallengeMethod } = params;

    const client = await this.getClient(clientId, options);
    if (!client) {
      throw new ValidationError(`Unknown client_id: "${clientId}"`, 'INVALID_CLIENT');
    }

    if (!isMatchingRedirectUri(client, redirectUri)) {
      throw new ValidationError(
        `redirect_uri "${redirectUri}" is not registered for client "${clientId}"`,
        'INVALID_REDIRECT_URI'
      );
    }

    if (codeChallengeMethod !== 'S256') {
      throw new ValidationError(
        'code_challenge_method must be "S256" in OAuth 2.1',
        'INVALID_CODE_CHALLENGE_METHOD'
      );
    }

    if (!codeChallenge || codeChallenge.length < 43 || codeChallenge.length > 128) {
      throw new ValidationError('Invalid code_challenge length (43-128 chars)', 'INVALID_PKCE');
    }

    const requestedScopes = (scope || 'career:read')
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const reqScope of requestedScopes) {
      if (!client.allowedScopes.includes(reqScope)) {
        throw new ValidationError(
          `Scope "${reqScope}" is not allowed for client "${clientId}"`,
          'INVALID_SCOPE'
        );
      }
    }

    return {
      client,
      scopes: requestedScopes.length > 0 ? requestedScopes : ['career:read'],
    };
  }

  /**
   * Mints a single-use authorization code bound to user, tenant, client, redirect URI, and PKCE.
   *
   * @param {object} params Code creation params
   * @param {string} params.clientId Client ID
   * @param {string} params.redirectUri Redirect URI
   * @param {string} params.codeChallenge PKCE Challenge
   * @param {string} [params.codeChallengeMethod='S256'] PKCE Method
   * @param {string[]} params.scopes Granted scopes
   * @param {string} params.tenantId Tenant ID
   * @param {string} params.userId User ID
   * @param {string} params.userRole User role
   * @param {object} [options={}] Options override
   * @returns {Promise<string>} Raw authorization code string
   */
  async createAuthorizationCode(params, options = {}) {
    const database = options.db || this.db;
    const {
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod = 'S256',
      scopes,
      tenantId,
      userId,
      userRole,
    } = params;

    // Clamp scopes to user role ceiling
    const allowedRoleScopes = ROLE_SCOPE_CEILINGS[userRole] || ['career:read'];
    const effectiveScopes = scopes.filter((s) => allowedRoleScopes.includes(s));

    if (effectiveScopes.length === 0) {
      effectiveScopes.push('career:read');
    }

    const rawCode = `mcp_oauth_code_${crypto.randomBytes(32).toString('hex')}`;
    const codeHash = hashOAuthToken(rawCode);

    const ttlSeconds = this.config.OAUTH_AUTH_CODE_TTL_SECONDS || 300;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await database.insert(oauthAuthorizationCodes).values({
      codeHash,
      clientId,
      tenantId,
      userId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      scopes: effectiveScopes,
      isConsumed: false,
      expiresAt,
    });

    return rawCode;
  }

  /**
   * Exchanges an authorization code for an access token and rotating refresh token.
   *
   * @param {object} params Exchange parameters
   * @param {string} params.clientId Client ID
   * @param {string} params.redirectUri Redirect URI
   * @param {string} params.code Raw authorization code
   * @param {string} params.codeVerifier Plain text PKCE verifier
   * @param {object} [options={}] Options override
   * @returns {Promise<object>} Token response object
   */
  async exchangeAuthorizationCode(params, options = {}) {
    const database = options.db || this.db;
    const { clientId, redirectUri, code, codeVerifier } = params;

    const client = await this.getClient(clientId, options);
    if (!client) {
      throw new AuthenticationError(`Unknown client_id: "${clientId}"`, 'INVALID_CLIENT');
    }

    const codeHash = hashOAuthToken(code);
    const now = new Date();

    const [authCodeRecord] = await database
      .select()
      .from(oauthAuthorizationCodes)
      .where(
        and(
          eq(oauthAuthorizationCodes.clientId, clientId),
          eq(oauthAuthorizationCodes.codeHash, codeHash)
        )
      )
      .limit(1);

    if (!authCodeRecord) {
      throw new AuthenticationError('Invalid authorization code.', 'INVALID_GRANT');
    }

    if (authCodeRecord.isConsumed) {
      throw new AuthenticationError(
        'Authorization code has already been consumed.',
        'INVALID_GRANT'
      );
    }

    if (authCodeRecord.expiresAt < now) {
      throw new AuthenticationError('Authorization code has expired.', 'INVALID_GRANT');
    }

    if (authCodeRecord.redirectUri !== redirectUri) {
      throw new AuthenticationError(
        'redirect_uri does not match authorization code issuance.',
        'INVALID_GRANT'
      );
    }

    const isPkceValid = verifyCodeChallenge(
      codeVerifier,
      authCodeRecord.codeChallenge,
      authCodeRecord.codeChallengeMethod
    );

    if (!isPkceValid) {
      throw new AuthenticationError(
        'PKCE verification failed: invalid code_verifier.',
        'INVALID_GRANT'
      );
    }

    // Mark code as consumed immediately
    await database
      .update(oauthAuthorizationCodes)
      .set({
        isConsumed: true,
        consumedAt: now,
      })
      .where(eq(oauthAuthorizationCodes.id, authCodeRecord.id));

    // Verify user and tenant state
    const [user] = await database
      .select()
      .from(users)
      .where(eq(users.id, authCodeRecord.userId))
      .limit(1);

    const [tenant] = await database
      .select()
      .from(tenants)
      .where(eq(tenants.id, authCodeRecord.tenantId))
      .limit(1);

    if (!user || user.status !== 'ACTIVE' || !tenant) {
      throw new AuthenticationError('User or tenant account is inactive.', 'INVALID_GRANT');
    }

    // Re-verify role scope ceiling
    const allowedRoleScopes = ROLE_SCOPE_CEILINGS[user.role] || ['career:read'];
    const finalScopes = authCodeRecord.scopes.filter((s) => allowedRoleScopes.includes(s));

    // Issue tokens
    const familyId = crypto.randomUUID();
    const rawAccessToken = `mcp_oauth_acc_${crypto.randomBytes(32).toString('hex')}`;
    const rawRefreshToken = `mcp_oauth_ref_${crypto.randomBytes(32).toString('hex')}`;

    const accessTokenHash = hashOAuthToken(rawAccessToken);
    const refreshTokenHash = hashOAuthToken(rawRefreshToken);

    const accessTtlSeconds = this.config.OAUTH_ACCESS_TOKEN_TTL_SECONDS || 3600;
    const refreshTtlSeconds = this.config.OAUTH_REFRESH_TOKEN_TTL_SECONDS || 2592000;

    const accessTokenExpiresAt = new Date(now.getTime() + accessTtlSeconds * 1000);
    const refreshTokenExpiresAt = new Date(now.getTime() + refreshTtlSeconds * 1000);

    await database.insert(oauthTokens).values({
      tenantId: tenant.id,
      userId: user.id,
      clientId,
      accessTokenHash,
      refreshTokenHash,
      familyId,
      tokenScopes: finalScopes,
      isRevoked: false,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    });

    return {
      access_token: rawAccessToken,
      token_type: 'Bearer',
      expires_in: accessTtlSeconds,
      refresh_token: rawRefreshToken,
      scope: finalScopes.join(' '),
    };
  }

  /**
   * Refreshes an access token using Refresh Token Rotation (RTR).
   *
   * @param {object} params Refresh parameters
   * @param {string} params.clientId Client ID
   * @param {string} params.refreshToken Raw refresh token
   * @param {object} [options={}] Options override
   * @returns {Promise<object>} New Token response object
   */
  async refreshAccessToken(params, options = {}) {
    const database = options.db || this.db;
    const { clientId, refreshToken } = params;

    const client = await this.getClient(clientId, options);
    if (!client) {
      throw new AuthenticationError(`Unknown client_id: "${clientId}"`, 'INVALID_CLIENT');
    }

    const refreshTokenHash = hashOAuthToken(refreshToken);
    const now = new Date();

    const [tokenRecord] = await database
      .select()
      .from(oauthTokens)
      .where(
        and(eq(oauthTokens.clientId, clientId), eq(oauthTokens.refreshTokenHash, refreshTokenHash))
      )
      .limit(1);

    if (!tokenRecord) {
      throw new AuthenticationError('Invalid refresh token.', 'INVALID_GRANT');
    }

    // Refresh Token Replay / Theft Detection:
    // If the token was already revoked, someone is trying to reuse an old refresh token!
    // Invalidate the entire token family immediately.
    if (tokenRecord.isRevoked) {
      await database
        .update(oauthTokens)
        .set({
          isRevoked: true,
          revokedAt: now,
        })
        .where(eq(oauthTokens.familyId, tokenRecord.familyId));

      throw new AuthenticationError(
        'Refresh token replay detected. Entire token family has been revoked.',
        'INVALID_GRANT'
      );
    }

    if (tokenRecord.refreshTokenExpiresAt && tokenRecord.refreshTokenExpiresAt < now) {
      throw new AuthenticationError('Refresh token has expired.', 'INVALID_GRANT');
    }

    // Invalidate previous token
    await database
      .update(oauthTokens)
      .set({
        isRevoked: true,
        revokedAt: now,
      })
      .where(eq(oauthTokens.id, tokenRecord.id));

    // Verify active user/tenant
    const [user] = await database
      .select()
      .from(users)
      .where(eq(users.id, tokenRecord.userId))
      .limit(1);

    const [tenant] = await database
      .select()
      .from(tenants)
      .where(eq(tenants.id, tokenRecord.tenantId))
      .limit(1);

    if (!user || user.status !== 'ACTIVE' || !tenant) {
      throw new AuthenticationError('User or tenant account is inactive.', 'INVALID_GRANT');
    }

    const allowedRoleScopes = ROLE_SCOPE_CEILINGS[user.role] || ['career:read'];
    const finalScopes = tokenRecord.tokenScopes.filter((s) => allowedRoleScopes.includes(s));

    // Issue new pair in the same family
    const rawAccessToken = `mcp_oauth_acc_${crypto.randomBytes(32).toString('hex')}`;
    const rawRefreshToken = `mcp_oauth_ref_${crypto.randomBytes(32).toString('hex')}`;

    const newAccessTokenHash = hashOAuthToken(rawAccessToken);
    const newRefreshTokenHash = hashOAuthToken(rawRefreshToken);

    const accessTtlSeconds = this.config.OAUTH_ACCESS_TOKEN_TTL_SECONDS || 3600;
    const refreshTtlSeconds = this.config.OAUTH_REFRESH_TOKEN_TTL_SECONDS || 2592000;

    const accessTokenExpiresAt = new Date(now.getTime() + accessTtlSeconds * 1000);
    const refreshTokenExpiresAt = new Date(now.getTime() + refreshTtlSeconds * 1000);

    await database.insert(oauthTokens).values({
      tenantId: tenant.id,
      userId: user.id,
      clientId,
      accessTokenHash: newAccessTokenHash,
      refreshTokenHash: newRefreshTokenHash,
      familyId: tokenRecord.familyId,
      tokenScopes: finalScopes,
      isRevoked: false,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    });

    return {
      access_token: rawAccessToken,
      token_type: 'Bearer',
      expires_in: accessTtlSeconds,
      refresh_token: rawRefreshToken,
      scope: finalScopes.join(' '),
    };
  }

  /**
   * Revokes an access token or refresh token.
   *
   * @param {object} params Revoke parameters
   * @param {string} params.token Raw token to revoke
   * @param {object} [options={}] Options override
   * @returns {Promise<{ revoked: boolean }>}
   */
  async revokeToken(params, options = {}) {
    const database = options.db || this.db;
    const { token } = params;

    const tokenHash = hashOAuthToken(token);
    const now = new Date();

    const [accessMatch] = await database
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.accessTokenHash, tokenHash))
      .limit(1);

    if (accessMatch) {
      await database
        .update(oauthTokens)
        .set({
          isRevoked: true,
          revokedAt: now,
        })
        .where(eq(oauthTokens.id, accessMatch.id));
      return { revoked: true };
    }

    const [refreshMatch] = await database
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.refreshTokenHash, tokenHash))
      .limit(1);

    if (refreshMatch) {
      // Revoke entire token family on refresh token revocation
      await database
        .update(oauthTokens)
        .set({
          isRevoked: true,
          revokedAt: now,
        })
        .where(eq(oauthTokens.familyId, refreshMatch.familyId));
      return { revoked: true };
    }

    return { revoked: true };
  }

  /**
   * Validates an incoming OAuth 2.1 access token.
   *
   * @param {string} rawToken Raw Bearer access token
   * @param {object} [options={}] Options override
   * @returns {Promise<{ user: object, tenant: object, effectiveScopes: string[], clientId: string }>}
   */
  async validateAccessToken(rawToken, options = {}) {
    const database = options.db || this.db;
    const tokenHash = hashOAuthToken(rawToken);
    const now = new Date();

    const [tokenRecord] = await database
      .select()
      .from(oauthTokens)
      .where(
        and(
          eq(oauthTokens.accessTokenHash, tokenHash),
          eq(oauthTokens.isRevoked, false),
          gt(oauthTokens.accessTokenExpiresAt, now)
        )
      )
      .limit(1);

    if (!tokenRecord) {
      throw new AuthenticationError('Invalid or expired OAuth access token.', 'INVALID_TOKEN');
    }

    const [user] = await database
      .select()
      .from(users)
      .where(and(eq(users.id, tokenRecord.userId), eq(users.status, 'ACTIVE')))
      .limit(1);

    if (!user) {
      throw new AuthenticationError('User account not found or suspended.', 'INACTIVE_USER');
    }

    const [tenant] = await database
      .select()
      .from(tenants)
      .where(eq(tenants.id, tokenRecord.tenantId))
      .limit(1);

    if (!tenant) {
      throw new AuthenticationError('Tenant account not found.', 'TENANT_NOT_FOUND');
    }

    const allowedRoleScopes = ROLE_SCOPE_CEILINGS[user.role] || ['career:read'];
    const effectiveScopes = tokenRecord.tokenScopes.filter((s) => allowedRoleScopes.includes(s));

    if (effectiveScopes.length === 0) {
      throw new AuthorizationError(
        'User role does not permit any granted token scopes.',
        'FORBIDDEN'
      );
    }

    return {
      user,
      tenant,
      effectiveScopes,
      clientId: tokenRecord.clientId,
    };
  }
}

export const defaultOAuthAuthorizationService = new OAuthAuthorizationService();
