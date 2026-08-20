/**
 * @file Session Management Service.
 *
 * Implements server-side session lifecycle management backed by PostgreSQL:
 * 1. High-entropy token generation (256-bit)
 * 2. SHA-256 token hashing for secure storage
 * 3. Session lookup, validation, and activity sliding
 * 4. Immediate single and multi-device session revocation
 */

import crypto from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { sessions, users, tenants } from '../db/schema.js';
import { AuthenticationError } from '../errors/index.js';
import { config } from '../config/env.js';

export const DEFAULT_SESSION_TTL_SECONDS = 604800; // 7 days
const SLIDING_ACTIVITY_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Generates a 256-bit cryptographically secure random session token.
 *
 * @returns {string} Base64url-encoded random session token
 */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Computes the 64-character hexadecimal SHA-256 hash of a raw session token.
 *
 * @param {string} rawToken Raw session token from client cookie
 * @returns {string} SHA-256 hash string for sessions.id lookup
 */
export function hashSessionToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new AuthenticationError('Invalid or empty session token', 'INVALID_SESSION');
  }
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Creates and persists a new server-side session in PostgreSQL.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db Database client/transaction
 * @param {Object} params Session parameters
 * @param {string} params.userId User UUID
 * @param {string} params.tenantId Tenant UUID
 * @param {string | null} [params.ipAddress=null] Client IP address
 * @param {string | null} [params.userAgent=null] Client User-Agent header
 * @param {number} [params.ttlSeconds=604800] Session lifetime in seconds
 * @returns {Promise<{ rawToken: string, sessionId: string, expiresAt: Date }>} Created session metadata
 */
export async function createSession(db, params) {
  if (!params.userId || !params.tenantId) {
    throw new AuthenticationError(
      'User ID and Tenant ID are required to create a session',
      'INVALID_SESSION'
    );
  }

  const ttlSeconds = params.ttlSeconds || config.SESSION_TTL_SECONDS || DEFAULT_SESSION_TTL_SECONDS;
  const rawToken = generateSessionToken();
  const sessionId = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await db.insert(sessions).values({
    id: sessionId,
    userId: params.userId,
    tenantId: params.tenantId,
    ipAddress: params.ipAddress || null,
    userAgent: params.userAgent || null,
    expiresAt,
  });

  return {
    rawToken,
    sessionId,
    expiresAt,
  };
}

/**
 * Validates a session token and retrieves associated user and tenant context.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db Database client
 * @param {string} rawToken Raw session token from request cookie
 * @returns {Promise<{ session: typeof sessions.$inferSelect, user: typeof users.$inferSelect, tenant: typeof tenants.$inferSelect } | null>} Session context or null
 */
export async function validateSession(db, rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    return null;
  }

  let sessionId;
  try {
    sessionId = hashSessionToken(rawToken);
  } catch {
    return null;
  }

  const rows = await db
    .select({
      session: sessions,
      user: users,
      tenant: tenants,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(tenants, eq(sessions.tenantId, tenants.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())));

  if (!rows || rows.length === 0) {
    return null;
  }

  const { session, user, tenant } = rows[0];

  if (user.status !== 'ACTIVE') {
    throw new AuthenticationError('User account is suspended or deactivated', 'ACCOUNT_SUSPENDED');
  }

  // Throttled sliding activity update (every 15 minutes)
  const now = Date.now();
  const lastActiveTime = new Date(session.lastActiveAt).getTime();
  if (now - lastActiveTime > SLIDING_ACTIVITY_THRESHOLD_MS) {
    try {
      await db
        .update(sessions)
        .set({ lastActiveAt: new Date(now) })
        .where(eq(sessions.id, sessionId));
    } catch {
      // Non-blocking activity update
    }
  }

  return { session, user, tenant };
}

/**
 * Revokes an individual session by raw token.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db Database client
 * @param {string} rawToken Raw session token to revoke
 * @returns {Promise<boolean>} True if session existed and was deleted
 */
export async function revokeSession(db, rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    return false;
  }

  try {
    const sessionId = hashSessionToken(rawToken);
    const result = await db.delete(sessions).where(eq(sessions.id, sessionId));
    return result.rowCount > 0;
  } catch {
    return false;
  }
}

/**
 * Revokes all active sessions for a specific user across all devices.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db Database client
 * @param {string} userId User UUID
 * @returns {Promise<number>} Count of revoked sessions
 */
export async function revokeAllUserSessions(db, userId) {
  if (!userId) return 0;
  const result = await db.delete(sessions).where(eq(sessions.userId, userId));
  return result.rowCount || 0;
}

/**
 * Returns cookie options for setting or clearing session cookies.
 *
 * @param {import('../config/env.js').AppConfig} appConfig Application environment config
 * @param {number} [ttlSeconds=604800] Lifetime in seconds
 * @returns {import('@fastify/cookie').CookieSerializeOptions & { name: string }} Cookie options
 */
export function getSessionCookieOptions(
  appConfig = config,
  ttlSeconds = DEFAULT_SESSION_TTL_SECONDS
) {
  const isProd = appConfig.NODE_ENV === 'production';
  const name = isProd
    ? '__Host-career_hub_session'
    : appConfig.SESSION_COOKIE_NAME || 'career_hub_session';

  return {
    name,
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: ttlSeconds,
  };
}
