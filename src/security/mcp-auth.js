/**
 * @file MCP Authentication & Security Context Minting.
 *
 * Implements:
 * 1. Bearer token extraction and SHA-256 hash lookup against PostgreSQL.
 * 2. Immutable, sovereign McpRequestContext minting.
 * 3. Role-Based Access Control (RBAC) permission checking.
 * 4. Token scope enforcement.
 * Adheres strictly to ARCH-022 and multi-tenant sovereign default-deny isolation.
 */

import crypto from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { sessions, users, tenants } from '../db/schema.js';
import { db } from '../db/index.js';
import { AuthenticationError, AuthorizationError } from '../errors/index.js';
import { McpRequestContextSchema } from '../domain/mcp/mcp.schemas.js';

/**
 * Extracts and hashes a raw Bearer token from authorization headers.
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
 * Computes SHA-256 hash of a raw token for secure database lookup.
 *
 * @param {string} rawToken Raw token
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function hashMcpToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Authenticates an incoming MCP HTTP request and mints a trusted McpRequestContext.
 *
 * @param {import('fastify').FastifyRequest} req Fastify request
 * @param {object} [options={}] Optional overrides (e.g. database client)
 * @returns {Promise<import('../domain/mcp/mcp.schemas.js').McpRequestContextSchema>} Immutable trusted context
 * @throws {AuthenticationError} If authentication fails
 */
export async function authenticateMcpRequest(req, options = {}) {
  const database = options.db || req.db || db;
  const rawToken = extractBearerToken(req.headers['authorization']);
  const tokenHash = hashMcpToken(rawToken);

  // 1. Lookup active session / API token
  const now = new Date();
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

  // 2. Validate tenant & user status
  if (tenant.status && tenant.status !== 'ACTIVE') {
    throw new AuthenticationError('Workspace account is inactive or suspended.', 'TENANT_INACTIVE');
  }

  if (user.status !== 'ACTIVE') {
    throw new AuthenticationError('User account is inactive or suspended.', 'USER_INACTIVE');
  }

  // 3. Mint trusted, frozen McpRequestContext
  const rawContext = {
    requestId: req.id || crypto.randomUUID(),
    tenantId: tenant.id,
    userId: user.id,
    role: user.role,
    tokenScopes: ['career:read', 'career:write', 'career:export'],
    clientInfo: {
      userAgent: req.headers['user-agent'] || undefined,
      protocolVersion: /** @type {string} */ (req.headers['mcp-protocol-version']) || '2025-11-25',
      ipAddress: req.ip || /** @type {string} */ (req.headers['x-forwarded-for']) || '127.0.0.1',
    },
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
