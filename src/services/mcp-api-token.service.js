/**
 * @file MCP Dedicated API Token Service (P7-003A).
 *
 * Implements personal MCP API token management conforming to ADR-043:
 * 1. Cryptographically secure token generation (`mcp_<env>_<32-byte-hex>`).
 * 2. SHA-256 token hashing for database storage (zero raw tokens stored/logged).
 * 3. Scope ceiling enforcement by RBAC role (READONLY, MEMBER, OWNER).
 * 4. Token lifecycle management: creation, listing, revocation, rotation, expiration.
 * 5. Environment binding (`live`, `test`, `dev`) to prevent cross-environment replay.
 * 6. User and tenant boundary isolation with constant-time lookup semantics.
 * 7. Throttled last-used timestamp tracking (every 60 seconds).
 * 8. Quota enforcement: maximum 10 active tokens per user.
 */

import crypto from 'node:crypto';
import { eq, and, sql, desc } from 'drizzle-orm';
import { mcpApiTokens, users, tenants, auditLogs } from '../db/schema.js';
import { db as defaultDb } from '../db/index.js';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../errors/index.js';
import { CreateMcpTokenInputSchema, McpTokenSummarySchema } from '../domain/mcp/mcp.schemas.js';
import { sanitizeAuditDetails } from '../utils/audit-sanitizer.js';
import { config } from '../config/env.js';

/**
 * Maximum permitted active MCP API tokens per user.
 */
export const MAX_ACTIVE_TOKENS_PER_USER = 10;

/**
 * Default token lifetime in days (30 days).
 */
export const DEFAULT_TOKEN_EXPIRY_DAYS = 30;

/**
 * Allowed token expiration policies in days (null/0 indicates no expiration).
 */
export const ALLOWED_EXPIRY_DAYS = [30, 60, 90, null, 0];

/**
 * Minimum throttle interval between last_used_at timestamp writes (60 seconds).
 */
export const LAST_USED_THROTTLE_MS = 60 * 1000;

/**
 * Permission ceilings defining the maximum allowable scopes for each workspace role.
 */
export const ROLE_SCOPE_CEILINGS = Object.freeze({
  READONLY: Object.freeze(['career:read']),
  MEMBER: Object.freeze(['career:read', 'career:write', 'career:export']),
  OWNER: Object.freeze(['career:read', 'career:write', 'career:export', 'career:admin']),
});

/**
 * Resolves the environment tag for token formatting.
 *
 * @param {string} [nodeEnv=config.NODE_ENV] Current runtime environment
 * @returns {'live' | 'test' | 'dev'} Normalized environment tag
 */
export function getEnvironmentTag(nodeEnv = config.NODE_ENV) {
  if (nodeEnv === 'production') return 'live';
  if (nodeEnv === 'test') return 'test';
  return 'dev';
}

/**
 * Generates a cryptographically secure raw MCP API token.
 * Format: `mcp_<env>_<32-byte-hex>` (e.g. `mcp_live_4a8b...`)
 *
 * @param {string} [nodeEnv=config.NODE_ENV] Runtime environment
 * @returns {string} Raw token string
 */
export function generateMcpRawToken(nodeEnv = config.NODE_ENV) {
  const envTag = getEnvironmentTag(nodeEnv);
  const randomHex = crypto.randomBytes(32).toString('hex');
  return `mcp_${envTag}_${randomHex}`;
}

/**
 * Computes the SHA-256 hexadecimal hash of a raw token for database lookup.
 *
 * @param {string} rawToken Raw token string
 * @returns {string} 64-character SHA-256 hex hash
 */
export function hashMcpToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new ValidationError('Invalid or empty token for hashing.', 'INVALID_TOKEN');
  }
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Validates that the token format and environment tag match expected runtime environment.
 *
 * @param {string} rawToken Raw token string
 * @param {string} [expectedEnv=config.NODE_ENV] Expected environment
 * @returns {boolean} True if environment matches
 * @throws {AuthenticationError} If environment mismatch is detected
 */
export function validateTokenEnvironment(rawToken, expectedEnv = config.NODE_ENV) {
  if (!rawToken || typeof rawToken !== 'string') {
    return false;
  }

  const expectedTag = getEnvironmentTag(expectedEnv);
  const match = rawToken.match(/^mcp_(live|test|dev)_[0-9a-fA-F]{64}$/);

  if (!match) {
    // If not matching canonical prefix, it's either an invalid token or legacy/session token
    return false;
  }

  const tokenEnvTag = match[1];
  if (tokenEnvTag !== expectedTag) {
    throw new AuthenticationError(
      `Token environment mismatch: token is configured for "${tokenEnvTag}", server is running in "${expectedTag}".`,
      'ENVIRONMENT_MISMATCH'
    );
  }

  return true;
}

/**
 * Validates requested scopes against the user's role permission ceiling.
 *
 * @param {'OWNER' | 'MEMBER' | 'READONLY'} role User role
 * @param {string[]} requestedScopes Scopes requested for the token
 * @returns {string[]} Validated scope array
 * @throws {AuthorizationError} If requested scopes exceed role ceiling
 */
export function validateScopesAgainstCeiling(role, requestedScopes) {
  const ceiling = ROLE_SCOPE_CEILINGS[role];
  if (!ceiling) {
    throw new AuthorizationError(`Unknown role "${role}".`, 'INVALID_ROLE');
  }

  const ceilingSet = new Set(ceiling);
  for (const scope of requestedScopes) {
    if (!ceilingSet.has(scope)) {
      throw new AuthorizationError(
        `Scope "${scope}" exceeds maximum permission ceiling for role "${role}". Allowed: [${ceiling.join(', ')}].`,
        'SCOPE_CEILING_EXCEEDED'
      );
    }
  }

  return requestedScopes;
}

/**
 * Formats a database record into a safe, client-facing token summary (never leaks hash or raw secret).
 *
 * @param {typeof mcpApiTokens.$inferSelect} row Database row
 * @returns {import('../domain/mcp/mcp.schemas.js').McpTokenSummarySchema} Safe token summary
 */
export function toTokenSummary(row) {
  return McpTokenSummarySchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scopes: row.scopes || [],
    lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null,
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
    status: row.status,
    clientType: row.clientType,
  });
}

/**
 * Service orchestrating the complete lifecycle of dedicated MCP API tokens.
 */
export class McpApiTokenService {
  /**
   * @param {object} [options={}] Service dependencies
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.db] Database client
   * @param {string} [options.nodeEnv=config.NODE_ENV] Runtime environment
   */
  constructor(options = {}) {
    this.db = options.db || defaultDb;
    this.nodeEnv = options.nodeEnv || config.NODE_ENV;
  }

  /**
   * Provisions a new personal MCP API token with role ceiling enforcement.
   *
   * @param {object} params Token creation parameters
   * @param {string} params.tenantId Tenant UUID
   * @param {string} params.userId User UUID
   * @param {'OWNER' | 'MEMBER' | 'READONLY'} params.role Current user role
   * @param {string} params.name Descriptive token label (e.g. "Claude Desktop", "Cursor")
   * @param {string[]} [params.scopes=['career:read']] Requested token scopes
   * @param {number | null} [params.expiryDays=30] Expiry in days (0 or null for no expiration)
   * @param {'PERSONAL' | 'THIRD_PARTY'} [params.clientType='PERSONAL'] Client authorization type
   * @param {object} [options={}] Execution overrides
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.db] Transaction/DB client
   * @param {string} [options.requestId] Correlation trace ID
   * @param {string} [options.clientIp] Caller IP
   * @returns {Promise<{ rawToken: string, token: import('../domain/mcp/mcp.schemas.js').McpTokenSummarySchema }>} Token result with raw secret returned ONCE
   */
  async createToken(params, options = {}) {
    const database = options.db || this.db;

    // 1. RBAC Check: READONLY cannot create tokens
    if (params.role === 'READONLY') {
      throw new AuthorizationError(
        'READONLY users are not permitted to generate MCP API tokens.',
        'FORBIDDEN'
      );
    }

    // 2. Validate input schema
    const validatedInput = CreateMcpTokenInputSchema.parse({
      name: params.name,
      scopes: params.scopes || ['career:read'],
      expiryDays: params.expiryDays !== undefined ? params.expiryDays : DEFAULT_TOKEN_EXPIRY_DAYS,
      clientType: params.clientType || 'PERSONAL',
    });

    // 3. Enforce Scope Ceiling against User Role
    validateScopesAgainstCeiling(params.role, validatedInput.scopes);

    // 4. Enforce Expiry Policy
    let expiresAt = null;
    if (validatedInput.expiryDays && validatedInput.expiryDays > 0) {
      expiresAt = new Date(Date.now() + validatedInput.expiryDays * 24 * 60 * 60 * 1000);
    }

    // 5. Enforce User Active Token Quota (Max 10)
    const now = new Date();
    const activeTokens = await database
      .select({ id: mcpApiTokens.id })
      .from(mcpApiTokens)
      .where(
        and(
          eq(mcpApiTokens.tenantId, params.tenantId),
          eq(mcpApiTokens.userId, params.userId),
          eq(mcpApiTokens.status, 'ACTIVE'),
          sql`(${mcpApiTokens.expiresAt} IS NULL OR ${mcpApiTokens.expiresAt} > ${now})`
        )
      );

    if (activeTokens.length >= MAX_ACTIVE_TOKENS_PER_USER) {
      throw new ConflictError(
        `Active MCP API token quota limit reached (${MAX_ACTIVE_TOKENS_PER_USER}). Please revoke an unused token before creating a new one.`,
        'MAX_TOKENS_EXCEEDED'
      );
    }

    // 6. Generate Raw Secret & Cryptographic Hash
    const rawToken = generateMcpRawToken(this.nodeEnv);
    const tokenHash = hashMcpToken(rawToken);
    const tokenPrefix = rawToken.slice(0, 16); // e.g. "mcp_live_4a8b9c1d"

    // 7. Persist to PostgreSQL
    const [row] = await database
      .insert(mcpApiTokens)
      .values({
        tenantId: params.tenantId,
        userId: params.userId,
        name: validatedInput.name,
        tokenPrefix,
        tokenHash,
        scopes: validatedInput.scopes,
        expiresAt,
        status: 'ACTIVE',
        clientType: validatedInput.clientType,
      })
      .returning();

    // 8. Record Sanitized Audit Log (never log raw token or full hash)
    try {
      const sanitizedDetails = sanitizeAuditDetails({
        tokenId: row.id,
        tokenPrefix: row.tokenPrefix,
        scopes: row.scopes,
        clientType: row.clientType,
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      });

      await database.insert(auditLogs).values({
        tenantId: params.tenantId,
        userId: params.userId,
        eventType: 'mcp.token.created',
        resourceType: 'mcp_api_token',
        resourceId: row.id,
        details: sanitizedDetails,
        ipAddress: options.clientIp || null,
        requestId: options.requestId || null,
      });
    } catch {
      // Non-blocking audit log insert
    }

    return {
      rawToken,
      token: toTokenSummary(row),
    };
  }

  /**
   * Lists safe summaries of MCP API tokens for the authenticated user/tenant.
   *
   * @param {object} params Listing parameters
   * @param {string} params.tenantId Tenant UUID
   * @param {string} params.userId User UUID
   * @param {'OWNER' | 'MEMBER' | 'READONLY'} params.role Current user role
   * @param {string} [params.targetUserId] Optional target user ID (OWNER only)
   * @param {object} [options={}] Execution overrides
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.db] Database client
   * @returns {Promise<Array<import('../domain/mcp/mcp.schemas.js').McpTokenSummarySchema>>} Safe token summaries
   */
  async listTokens(params, options = {}) {
    const database = options.db || this.db;

    // Tenant and user boundary isolation:
    // Non-OWNER roles can strictly list their own tokens only.
    const queryUserId =
      params.role === 'OWNER' && params.targetUserId ? params.targetUserId : params.userId;

    const rows = await database
      .select()
      .from(mcpApiTokens)
      .where(and(eq(mcpApiTokens.tenantId, params.tenantId), eq(mcpApiTokens.userId, queryUserId)))
      .orderBy(desc(mcpApiTokens.createdAt));

    return rows.map(toTokenSummary);
  }

  /**
   * Revokes an active MCP API token.
   * Guarantees that browser sessions and other MCP tokens remain completely untouched.
   *
   * @param {object} params Revocation parameters
   * @param {string} params.tenantId Tenant UUID
   * @param {string} params.userId User UUID
   * @param {'OWNER' | 'MEMBER' | 'READONLY'} params.role User role
   * @param {string} params.tokenId UUID of token to revoke
   * @param {object} [options={}] Execution overrides
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.db] Database client
   * @param {string} [options.requestId] Trace correlation ID
   * @param {string} [options.clientIp] Caller IP
   * @returns {Promise<boolean>} True if revoked
   */
  async revokeToken(params, options = {}) {
    const database = options.db || this.db;

    // RBAC check: READONLY cannot revoke tokens
    if (params.role === 'READONLY') {
      throw new AuthorizationError(
        'READONLY users are not permitted to revoke MCP API tokens.',
        'FORBIDDEN'
      );
    }

    if (!params.tokenId) {
      throw new ValidationError('Token ID is required for revocation.', 'INVALID_PARAMS');
    }

    // Lookup token within tenant boundary
    const rows = await database
      .select()
      .from(mcpApiTokens)
      .where(and(eq(mcpApiTokens.id, params.tokenId), eq(mcpApiTokens.tenantId, params.tenantId)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundError('MCP API token not found.');
    }

    const token = rows[0];

    // User ownership check: MEMBER can only revoke their own tokens
    if (params.role !== 'OWNER' && token.userId !== params.userId) {
      throw new NotFoundError('MCP API token not found.');
    }

    const now = new Date();
    await database
      .update(mcpApiTokens)
      .set({
        status: 'REVOKED',
        revokedAt: now,
      })
      .where(eq(mcpApiTokens.id, token.id));

    // Audit log
    try {
      const sanitizedDetails = sanitizeAuditDetails({
        tokenId: token.id,
        tokenPrefix: token.tokenPrefix,
        name: token.name,
      });

      await database.insert(auditLogs).values({
        tenantId: params.tenantId,
        userId: params.userId,
        eventType: 'mcp.token.revoked',
        resourceType: 'mcp_api_token',
        resourceId: token.id,
        details: sanitizedDetails,
        ipAddress: options.clientIp || null,
        requestId: options.requestId || null,
      });
    } catch {
      // Non-blocking audit
    }

    return true;
  }

  /**
   * Atomically rotates an MCP API token: revokes the old token and mints a new one.
   *
   * @param {object} params Rotation parameters
   * @param {string} params.tenantId Tenant UUID
   * @param {string} params.userId User UUID
   * @param {'OWNER' | 'MEMBER' | 'READONLY'} params.role User role
   * @param {string} params.tokenId Existing token UUID
   * @param {number | null} [params.expiryDays] Optional new expiry duration in days
   * @param {object} [options={}] Execution overrides
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.db] Database client
   * @param {string} [options.requestId] Trace correlation ID
   * @param {string} [options.clientIp] Caller IP
   * @returns {Promise<{ rawToken: string, token: import('../domain/mcp/mcp.schemas.js').McpTokenSummarySchema }>} New raw token and summary
   */
  async rotateToken(params, options = {}) {
    const database = options.db || this.db;

    if (params.role === 'READONLY') {
      throw new AuthorizationError(
        'READONLY users are not permitted to rotate MCP API tokens.',
        'FORBIDDEN'
      );
    }

    // 1. Fetch existing token within tenant boundary
    const rows = await database
      .select()
      .from(mcpApiTokens)
      .where(and(eq(mcpApiTokens.id, params.tokenId), eq(mcpApiTokens.tenantId, params.tenantId)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundError('MCP API token not found.');
    }

    const existingToken = rows[0];

    // User ownership check
    if (params.role !== 'OWNER' && existingToken.userId !== params.userId) {
      throw new NotFoundError('MCP API token not found.');
    }

    // 2. Revoke old token
    const now = new Date();
    await database
      .update(mcpApiTokens)
      .set({
        status: 'REVOKED',
        revokedAt: now,
      })
      .where(eq(mcpApiTokens.id, existingToken.id));

    // 3. Create new token with identical safe metadata
    const rawToken = generateMcpRawToken(this.nodeEnv);
    const tokenHash = hashMcpToken(rawToken);
    const tokenPrefix = rawToken.slice(0, 16);

    let expiresAt = null;
    const expiryDays =
      params.expiryDays !== undefined ? params.expiryDays : DEFAULT_TOKEN_EXPIRY_DAYS;
    if (expiryDays && expiryDays > 0) {
      expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    }

    const [newRow] = await database
      .insert(mcpApiTokens)
      .values({
        tenantId: params.tenantId,
        userId: existingToken.userId,
        name: existingToken.name,
        tokenPrefix,
        tokenHash,
        scopes: existingToken.scopes,
        expiresAt,
        status: 'ACTIVE',
        clientType: existingToken.clientType,
      })
      .returning();

    // 4. Audit Log
    try {
      const sanitizedDetails = sanitizeAuditDetails({
        oldTokenId: existingToken.id,
        newTokenId: newRow.id,
        tokenPrefix: newRow.tokenPrefix,
        name: newRow.name,
      });

      await database.insert(auditLogs).values({
        tenantId: params.tenantId,
        userId: params.userId,
        eventType: 'mcp.token.rotated',
        resourceType: 'mcp_api_token',
        resourceId: newRow.id,
        details: sanitizedDetails,
        ipAddress: options.clientIp || null,
        requestId: options.requestId || null,
      });
    } catch {
      // Non-blocking audit
    }

    return {
      rawToken,
      token: toTokenSummary(newRow),
    };
  }

  /**
   * Authenticates and validates a raw MCP API token against PostgreSQL.
   * Enforces status, expiration, tenant/user activity, and role scope ceiling.
   *
   * @param {string} rawToken Raw Bearer token
   * @param {object} [options={}] Validation options
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.db] Database client
   * @returns {Promise<{ token: typeof mcpApiTokens.$inferSelect, user: typeof users.$inferSelect, tenant: typeof tenants.$inferSelect, effectiveScopes: string[] }>} Validated credential context
   * @throws {AuthenticationError} If token is invalid, expired, revoked, or environment mismatch
   */
  async validateToken(rawToken, options = {}) {
    const database = options.db || this.db;

    // 1. Environment validation
    validateTokenEnvironment(rawToken, this.nodeEnv);

    // 2. Hash raw token
    const tokenHash = hashMcpToken(rawToken);

    // 3. Database lookup joined with users and tenants
    const rows = await database
      .select({
        token: mcpApiTokens,
        user: users,
        tenant: tenants,
      })
      .from(mcpApiTokens)
      .innerJoin(users, eq(mcpApiTokens.userId, users.id))
      .innerJoin(tenants, eq(mcpApiTokens.tenantId, tenants.id))
      .where(eq(mcpApiTokens.tokenHash, tokenHash))
      .limit(1);

    if (rows.length === 0) {
      throw new AuthenticationError(
        'Invalid, expired, or revoked MCP API token.',
        'UNAUTHENTICATED'
      );
    }

    const { token, user, tenant } = rows[0];

    // 4. Validate token lifecycle status
    if (token.status === 'REVOKED') {
      throw new AuthenticationError('MCP API token has been revoked.', 'TOKEN_REVOKED');
    }

    const now = new Date();
    if (token.status === 'EXPIRED' || (token.expiresAt && new Date(token.expiresAt) <= now)) {
      // Update status to EXPIRED in background if not already marked
      if (token.status !== 'EXPIRED') {
        database
          .update(mcpApiTokens)
          .set({ status: 'EXPIRED' })
          .where(eq(mcpApiTokens.id, token.id))
          .catch(() => {});
      }
      throw new AuthenticationError('MCP API token has expired.', 'TOKEN_EXPIRED');
    }

    if (token.status !== 'ACTIVE') {
      throw new AuthenticationError('MCP API token is not active.', 'UNAUTHENTICATED');
    }

    // 5. Validate tenant and user account status
    if (tenant.status && tenant.status !== 'ACTIVE') {
      throw new AuthenticationError(
        'Workspace account is inactive or suspended.',
        'TENANT_INACTIVE'
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new AuthenticationError('User account is inactive or suspended.', 'USER_INACTIVE');
    }

    // 6. Intersect token scopes with current user role ceiling
    const roleCeiling = ROLE_SCOPE_CEILINGS[user.role] || ['career:read'];
    const ceilingSet = new Set(roleCeiling);
    const tokenScopes = Array.isArray(token.scopes) ? token.scopes : [];
    const effectiveScopes = tokenScopes.filter((scope) => ceilingSet.has(scope));

    // Fallback to minimal career:read if scope intersection became empty
    if (effectiveScopes.length === 0 && ceilingSet.has('career:read')) {
      effectiveScopes.push('career:read');
    }

    // 7. Throttled last_used_at update (once every 60 seconds)
    const lastUsedTime = token.lastUsedAt ? new Date(token.lastUsedAt).getTime() : 0;
    if (Date.now() - lastUsedTime > LAST_USED_THROTTLE_MS) {
      database
        .update(mcpApiTokens)
        .set({ lastUsedAt: now })
        .where(eq(mcpApiTokens.id, token.id))
        .catch(() => {});
    }

    return {
      token,
      user,
      tenant,
      effectiveScopes,
    };
  }
}

/**
 * Singleton instance of McpApiTokenService for runtime application use.
 */
export const defaultMcpApiTokenService = new McpApiTokenService();
