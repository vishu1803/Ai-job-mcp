/**
 * @file Action Approval Tickets Repository (P9-002 / ARCH-032 / ADR-053)
 *
 * Encapsulates all transactional database operations for action_approval_tickets.
 * Strictly enforces tenant isolation on every query (WHERE tenant_id = :tenantId).
 */

import { eq, and, desc, lt, count } from 'drizzle-orm';
import { actionApprovalTickets } from '../schema.js';
import { ValidationError } from '../../errors/index.js';

function assertTenantId(tenantId, fnName) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new ValidationError(
      `tenantId is mandatory for repository operation ${fnName}`,
      'TENANT_ID_REQUIRED'
    );
  }
}

/**
 * Persists a newly created action approval ticket.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} dbClient
 * @param {object} ticketData
 * @returns {Promise<object>}
 */
export async function createApprovalTicketRecord(dbClient, ticketData) {
  assertTenantId(ticketData.tenantId, 'createApprovalTicketRecord');

  const [created] = await dbClient
    .insert(actionApprovalTickets)
    .values({
      id: ticketData.id,
      tenantId: ticketData.tenantId,
      userId: ticketData.userId,
      candidateId: ticketData.candidateId,
      resourceId: ticketData.resourceId,
      proposalId: ticketData.proposalId,
      actionType: ticketData.actionType || 'PROJECT_IMPROVEMENT_PR',
      repositoryName: ticketData.repositoryName,
      baseBranch: ticketData.baseBranch || 'main',
      targetBranch: ticketData.targetBranch,
      expectedHeadSha: ticketData.expectedHeadSha,
      patchFingerprint: ticketData.patchFingerprint,
      patchSummary: ticketData.patchSummary,
      hmacSignature: ticketData.hmacSignature,
      status: ticketData.status || 'PENDING',
      expiresAt: ticketData.expiresAt,
      createdAt: ticketData.createdAt || new Date(),
      updatedAt: ticketData.updatedAt || new Date(),
    })
    .returning();

  return created;
}

/**
 * Retrieves a single ticket by ID strictly scoped to tenant.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} dbClient
 * @param {string} tenantId Sovereign tenant UUID
 * @param {string} ticketId Ticket UUID
 * @returns {Promise<object|null>}
 */
export async function getApprovalTicketById(dbClient, tenantId, ticketId) {
  assertTenantId(tenantId, 'getApprovalTicketById');

  const [row] = await dbClient
    .select()
    .from(actionApprovalTickets)
    .where(
      and(eq(actionApprovalTickets.id, ticketId), eq(actionApprovalTickets.tenantId, tenantId))
    )
    .limit(1);

  return row || null;
}

/**
 * Retrieves a single ticket row acquiring an exclusive lock (SELECT FOR UPDATE) within an active transaction.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} dbClient
 * @param {string} tenantId Sovereign tenant UUID
 * @param {string} ticketId Ticket UUID
 * @returns {Promise<object|null>}
 */
export async function getApprovalTicketForUpdate(dbClient, tenantId, ticketId) {
  assertTenantId(tenantId, 'getApprovalTicketForUpdate');

  const [row] = await dbClient
    .select()
    .from(actionApprovalTickets)
    .where(
      and(eq(actionApprovalTickets.id, ticketId), eq(actionApprovalTickets.tenantId, tenantId))
    )
    .for('update')
    .limit(1);

  return row || null;
}

/**
 * Atomically transitions ticket status from an expected state to a target state.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} dbClient
 * @param {string} tenantId Sovereign tenant UUID
 * @param {string} ticketId Ticket UUID
 * @param {string|string[]} fromStatus Expected current status
 * @param {string} toStatus Target status
 * @param {object} [updates={}] Additional fields to update (e.g. approvedAt, consumedAt, executionResult)
 * @returns {Promise<object|null>} Updated row if transition matched, null if state mismatch / 0 rows updated
 */
export async function transitionTicketStatusAtomic(
  dbClient,
  tenantId,
  ticketId,
  fromStatus,
  toStatus,
  updates = {}
) {
  assertTenantId(tenantId, 'transitionTicketStatusAtomic');

  const conditions = [
    eq(actionApprovalTickets.id, ticketId),
    eq(actionApprovalTickets.tenantId, tenantId),
  ];

  if (Array.isArray(fromStatus)) {
    // Multiple valid source states
    // Note: Use inArray if needed or equality check
    conditions.push(eq(actionApprovalTickets.status, fromStatus[0]));
  } else if (fromStatus) {
    conditions.push(eq(actionApprovalTickets.status, fromStatus));
  }

  const [updated] = await dbClient
    .update(actionApprovalTickets)
    .set({
      status: toStatus,
      updatedAt: new Date(),
      ...updates,
    })
    .where(and(...conditions))
    .returning();

  return updated || null;
}

/**
 * Lists approval tickets within a tenant workspace with optional filtering and pagination.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} dbClient
 * @param {string} tenantId Sovereign tenant UUID
 * @param {object} [options={}]
 * @param {string} [options.status] Optional status filter
 * @param {string} [options.candidateId] Optional candidate filter
 * @param {string} [options.cursor] Opaque ISO timestamp cursor
 * @param {number} [options.limit=50] Items limit
 * @returns {Promise<{items: Array<any>, nextCursor: string|null, hasMore: boolean, totalCount: number}>}
 */
export async function listApprovalTicketsByTenant(dbClient, tenantId, options = {}) {
  assertTenantId(tenantId, 'listApprovalTicketsByTenant');

  const limit = Math.min(Math.max(1, options.limit || 50), 100);
  const conditions = [eq(actionApprovalTickets.tenantId, tenantId)];

  if (options.status) {
    conditions.push(eq(actionApprovalTickets.status, options.status));
  }
  if (options.candidateId) {
    conditions.push(eq(actionApprovalTickets.candidateId, options.candidateId));
  }
  if (options.cursor) {
    const cursorDate = new Date(options.cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(lt(actionApprovalTickets.createdAt, cursorDate));
    }
  }

  const rows = await dbClient
    .select()
    .from(actionApprovalTickets)
    .where(and(...conditions))
    .orderBy(desc(actionApprovalTickets.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null;

  const [totalResult] = await dbClient
    .select({ total: count() })
    .from(actionApprovalTickets)
    .where(eq(actionApprovalTickets.tenantId, tenantId));

  return {
    items,
    nextCursor,
    hasMore,
    totalCount: Number(totalResult?.total || 0),
  };
}
