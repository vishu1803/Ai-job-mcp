/**
 * @file MCP Authentication & Security Context Minting (P7-003A).
 *
 * Implements:
 * 1. Dedicated personal MCP API token validation via McpApiTokenService.
 * 2. Transitional Session Fallback for local development & legacy compatibility.
 * 3. Immutable, sovereign McpRequestContext minting with dynamic per-token scopes.
 * 4. Strict Role-Based Access Control (RBAC) & Scope verification.
 * Adheres strictly to ARCH-022, ADR-043, and multi-tenant sovereign default-deny isolation.
 */

import crypto from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { sessions, users, tenants } from '../db/schema.js';
import { db } from '../db/index.js';
import { AuthenticationError, AuthorizationError } from '../errors/index.js';
import { McpRequestContextSchema } from '../domain/mcp/mcp.schemas.js';
import {
  defaultMcpApiTokenService,
  hashMcpToken,
  ROLE_SCOPE_CEILINGS,
} from '../services/mcp-api-token.service.js';
import { defaultOAuthAuthorizationService } from '../services/oauth-authorization.service.js';

export { hashMcpToken };

/**
 * Extracts a raw Bearer token from the authorization header.
 *
 * @param {string | undefined} authHeader Authorization HTTP header
 * @returns {string} Raw token string
 * @throws {AuthenticationError} If header is missing or malformed
 */
export function extractBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') {
    throw new AuthenticationError(
      'Authentication required. Missing Authorization header.',
      'UNAUTHENTICATED'
    );
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    throw new AuthenticationError(
      'Invalid authorization format. Expected "Bearer <token>".',
      'UNAUTHENTICATED'
    );
  }

  const token = parts[1];
  if (!token || token.length < 8) {
    throw new AuthenticationError('Invalid or empty Bearer token.', 'UNAUTHENTICATED');
  }

  return token;
}

/**
 * Authenticates an incoming MCP HTTP request and mints a trusted McpRequestContext.
 * Prioritizes dedicated MCP API tokens and OAuth 2.1 access tokens; falls back to transitional session tokens if present.
 *
 * @param {import('fastify').FastifyRequest} req Fastify request
 * @param {object} [options={}] Optional overrides (e.g. database client, tokenService, oauthService)
 * @returns {Promise<import('../domain/mcp/mcp.schemas.js').McpRequestContextSchema>} Immutable trusted context
 * @throws {AuthenticationError} If authentication fails
 */
export async function authenticateMcpRequest(req, options = {}) {
  const database = options.db || req.db || db;
  const tokenService = options.tokenService || defaultMcpApiTokenService;
  const oauthService = options.oauthService || defaultOAuthAuthorizationService;
  const rawToken = extractBearerToken(req.headers['authorization']);

  const now = new Date();
  const clientInfo = {
    userAgent: req.headers['user-agent'] || undefined,
    protocolVersion: /** @type {string} */ (req.headers['mcp-protocol-version']) || '2026-07-28',
    ipAddress: req.ip || /** @type {string} */ (req.headers['x-forwarded-for']) || '127.0.0.1',
  };

  // ---------------------------------------------------------------------------
  // Path 1: Primary Path — Dedicated Personal MCP API Token (`mcp_<env>_<hex>`)
  // ---------------------------------------------------------------------------
  const isMcpTokenFormat = /^mcp_(live|test|dev)_[0-9a-fA-F]{64}$/.test(rawToken);

  if (isMcpTokenFormat) {
    const { user, tenant, effectiveScopes } = await tokenService.validateToken(rawToken, {
      db: database,
    });

    const rawContext = {
      requestId: req.id || crypto.randomUUID(),
      tenantId: tenant.id,
      userId: user.id,
      role: user.role,
      tokenScopes: effectiveScopes,
      authMethod: 'MCP_API_TOKEN',
      clientInfo,
      authenticatedAt: now.toISOString(),
    };

    const parsedContext = McpRequestContextSchema.parse(rawContext);
    return Object.freeze(parsedContext);
  }

  // ---------------------------------------------------------------------------
  // Path 2: OAuth 2.1 Bearer Token (`mcp_oauth_acc_<hex>`)
  // ---------------------------------------------------------------------------
  const isOAuthTokenFormat = /^mcp_oauth_acc_[0-9a-fA-F]{64}$/.test(rawToken);

  if (isOAuthTokenFormat) {
    const expectedResource =
      typeof oauthService.getExpectedResourceUrl === 'function'
        ? oauthService.getExpectedResourceUrl()
        : undefined;

    const { user, tenant, effectiveScopes, clientId } = await oauthService.validateAccessToken(
      rawToken,
      { db: database, expectedResource }
    );

    const rawContext = {
      requestId: req.id || crypto.randomUUID(),
      tenantId: tenant.id,
      userId: user.id,
      role: user.role,
      tokenScopes: effectiveScopes,
      authMethod: 'OAUTH_BEARER',
      clientInfo: {
        ...clientInfo,
        clientId,
      },
      authenticatedAt: now.toISOString(),
    };

    const parsedContext = McpRequestContextSchema.parse(rawContext);
    return Object.freeze(parsedContext);
  }

  // ---------------------------------------------------------------------------
  // Path 2: Transitional Session Fallback (DEPRECATION NOTICE: Scheduled for removal in Phase 13)
  // Allows web UI sessions to authenticate MCP endpoints during local testing until
  // the Phase 13 Dashboard User Onboarding & Token Generation UI is deployed.
  // ---------------------------------------------------------------------------
  const tokenHash = hashMcpToken(rawToken);

  const rows = await database
    .select({
      session: sessions,
      user: users,
      tenant: tenants,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(tenants, eq(sessions.tenantId, tenants.id))
    .where(and(eq(sessions.id, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  if (rows.length === 0) {
    throw new AuthenticationError('Invalid, expired, or revoked Bearer token.', 'UNAUTHENTICATED');
  }

  const { user, tenant } = rows[0];

  // Validate tenant & user status
  if (tenant.status && tenant.status !== 'ACTIVE') {
    throw new AuthenticationError('Workspace account is inactive or suspended.', 'TENANT_INACTIVE');
  }

  if (user.status !== 'ACTIVE') {
    throw new AuthenticationError('User account is inactive or suspended.', 'USER_INACTIVE');
  }

  // Assign scope ceiling based on user's role
  const roleScopes = ROLE_SCOPE_CEILINGS[user.role] || ['career:read'];

  const rawContext = {
    requestId: req.id || crypto.randomUUID(),
    tenantId: tenant.id,
    userId: user.id,
    role: user.role,
    tokenScopes: roleScopes,
    authMethod: 'SESSION_FALLBACK',
    clientInfo,
    authenticatedAt: now.toISOString(),
  };

  const parsedContext = McpRequestContextSchema.parse(rawContext);
  return Object.freeze(parsedContext);
}

/**
 * Asserts that the authenticated context satisfies the tool's required role and scopes.
 *
 * @param {import('../domain/mcp/mcp.schemas.js').McpRequestContextSchema} context Trusted context
 * @param {import('../domain/mcp/mcp.schemas.js').McpToolDefinitionSchema} toolDef Tool definition
 * @throws {AuthorizationError} If permissions or scopes are insufficient
 */
export function assertToolPermission(context, toolDef) {
  if (!context || !context.role) {
    throw new AuthenticationError(
      'Authentication context is missing or invalid.',
      'UNAUTHENTICATED'
    );
  }

  // Role hierarchy
  const roleLevels = {
    READONLY: 1,
    MEMBER: 2,
    OWNER: 3,
  };

  const currentLevel = roleLevels[context.role] || 0;
  const requiredLevel = roleLevels[toolDef.requiredRole] || 1;

  if (currentLevel < requiredLevel) {
    throw new AuthorizationError(
      `Insufficient role permissions for tool "${toolDef.name}". Requires ${toolDef.requiredRole}, current role is ${context.role}.`,
      'FORBIDDEN'
    );
  }

  // Scope check
  if (Array.isArray(toolDef.requiredScopes) && toolDef.requiredScopes.length > 0) {
    const userScopes = new Set(context.tokenScopes || []);
    const hasScope = toolDef.requiredScopes.some((scope) => userScopes.has(scope));

    if (!hasScope) {
      throw new AuthorizationError(
        `Insufficient token scope for tool "${toolDef.name}". Requires one of [${toolDef.requiredScopes.join(', ')}].`,
        'FORBIDDEN'
      );
    }
  }
}
