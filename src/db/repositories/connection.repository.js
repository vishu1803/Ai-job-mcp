/**
 * @file Resource Connections Repository
 *
 * Encapsulates all database operations for the resource_connections table.
 * Strictly enforces tenant isolation on all queries (WHERE tenant_id = :tenantId).
 */

import { eq, and, desc, lt, count } from 'drizzle-orm';
import { resourceConnections, auditLogs } from '../schema.js';

/**
 * Lists resource connections within a tenant workspace with optional filtering and pagination.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db
 * @param {string} tenantId - Trusted tenant UUID
 * @param {object} [options]
 * @param {string} [options.provider] - Optional provider filter
 * @param {string} [options.status] - Optional status filter
 * @param {string} [options.cursor] - Opaque ISO timestamp cursor
 * @param {number} [options.limit=50] - Number of items to return
 * @returns {Promise<{items: Array<any>, nextCursor: string|null, hasMore: boolean, totalCount: number}>}
 */
export async function listConnectionsByTenant(db, tenantId, options = {}) {
  const limit = Math.min(Math.max(1, options.limit || 50), 100);
  const conditions = [eq(resourceConnections.tenantId, tenantId)];

  if (options.provider) {
    conditions.push(eq(resourceConnections.provider, options.provider));
  }
  if (options.status) {
    conditions.push(eq(resourceConnections.status, options.status));
  }
  if (options.cursor) {
    const cursorDate = new Date(options.cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(lt(resourceConnections.createdAt, cursorDate));
    }
  }

  // Execute query with limit + 1 to check for hasMore
  const rows = await db
    .select()
    .from(resourceConnections)
    .where(and(...conditions))
    .orderBy(desc(resourceConnections.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null;

  // Optional count for total records in tenant matching provider/status
  const totalCountConditions = [eq(resourceConnections.tenantId, tenantId)];
  if (options.provider) {
    totalCountConditions.push(eq(resourceConnections.provider, options.provider));
  }
  if (options.status) {
    totalCountConditions.push(eq(resourceConnections.status, options.status));
  }

  const [countResult] = await db
    .select({ count: count() })
    .from(resourceConnections)
    .where(and(...totalCountConditions));

  return {
    items,
    nextCursor,
    hasMore,
    totalCount: Number(countResult?.count || 0),
  };
}

/**
 * Finds a single connection record by ID within a specific tenant workspace.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db
 * @param {string} connectionId - Connection UUID
 * @param {string} tenantId - Trusted tenant UUID
 * @returns {Promise<any|null>} Connection row or null
 */
export async function findConnectionByIdAndTenant(db, connectionId, tenantId) {
  const [connection] = await db
    .select()
    .from(resourceConnections)
    .where(
      and(eq(resourceConnections.id, connectionId), eq(resourceConnections.tenantId, tenantId))
    );

  return connection || null;
}

/**
 * Updates status and operational metadata for a connection.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db
 * @param {string} connectionId - Connection UUID
 * @param {string} tenantId - Trusted tenant UUID
 * @param {object} updates - Column updates
 * @returns {Promise<any>} Updated connection record
 */
export async function updateConnectionMetadata(db, connectionId, tenantId, updates) {
  const [updated] = await db
    .update(resourceConnections)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(
      and(eq(resourceConnections.id, connectionId), eq(resourceConnections.tenantId, tenantId))
    )
    .returning();

  return updated || null;
}

/**
 * Disconnects a connection, overwrites its encrypted credentials with scrubbed ciphertext,
 * and sets status to DISCONNECTED.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db
 * @param {string} connectionId - Connection UUID
 * @param {string} tenantId - Trusted tenant UUID
 * @param {string} scrubbedCiphertext - Inactive scrubbed ciphertext payload
 * @returns {Promise<any>} Updated record
 */
export async function disconnectConnectionRecord(db, connectionId, tenantId, scrubbedCiphertext) {
  const [disconnected] = await db
    .update(resourceConnections)
    .set({
      status: 'DISCONNECTED',
      encryptedCredentials: scrubbedCiphertext,
      updatedAt: new Date(),
    })
    .where(
      and(eq(resourceConnections.id, connectionId), eq(resourceConnections.tenantId, tenantId))
    )
    .returning();

  return disconnected || null;
}

/**
 * Permanently deletes a connection record from a tenant workspace.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db
 * @param {string} connectionId - Connection UUID
 * @param {string} tenantId - Trusted tenant UUID
 * @returns {Promise<any>} Deleted record or null
 */
export async function deleteConnectionRecord(db, connectionId, tenantId) {
  const [deleted] = await db
    .delete(resourceConnections)
    .where(
      and(eq(resourceConnections.id, connectionId), eq(resourceConnections.tenantId, tenantId))
    )
    .returning();

  return deleted || null;
}

/**
 * Writes an audit record to the audit_logs table.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db
 * @param {object} auditData
 */
export async function writeAuditRecord(db, auditData) {
  await db.insert(auditLogs).values({
    tenantId: auditData.tenantId,
    userId: auditData.userId || null,
    eventType: auditData.eventType,
    resourceType: 'resource_connection',
    resourceId: auditData.resourceId || null,
    requestId: auditData.requestId || null,
    ipAddress: auditData.ipAddress || null,
    userAgent: auditData.userAgent || null,
    details: auditData.details || {},
  });
}
