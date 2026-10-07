/**
 * @file Application Approval Tickets Repository (Phase 9.4 Persistent Approvals)
 *
 * Encapsulates all transactional database operations for application_approval_tickets.
 * Strictly enforces tenant isolation on every query (WHERE tenant_id = :tenantId).
 */

import { eq, and, desc, lt, inArray } from 'drizzle-orm';
import { applicationApprovalTickets } from '../schema.js';
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
 * Persists a newly created application approval ticket in PostgreSQL.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} dbClient
 * @param {object} ticketData
 * @returns {Promise<object>}
 */
export async function createApplicationApprovalTicketRecord(dbClient, ticketData) {
  assertTenantId(ticketData.tenantId, 'createApplicationApprovalTicketRecord');

  const [created] = await dbClient
    .insert(applicationApprovalTickets)
    .values({
      id: ticketData.ticketId || ticketData.id,
      tenantId: ticketData.tenantId,
      userId: ticketData.userId,
      candidateId: ticketData.candidateId,
      applicationId: ticketData.applicationId || null,
      jobId: String(ticketData.jobId),
      destinationUrl: ticketData.destinationUrl,
      packageHash: ticketData.packageHash,
      packageVersion: ticketData.packageVersion ?? null,
      status: ticketData.status || 'ISSUED',
      signature: ticketData.signature,
      issuedAt: ticketData.issuedAt ? new Date(ticketData.issuedAt) : new Date(),
      expiresAt: new Date(ticketData.expiresAt),
      metadata: ticketData.metadata || {},
      createdAt: ticketData.createdAt ? new Date(ticketData.createdAt) : new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

/**
 * Retrieves a single application approval ticket by ID strictly scoped to tenant.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} dbClient
 * @param {string} tenantId Sovereign tenant UUID
 * @param {string} ticketId Ticket UUID
 * @returns {Promise<object|null>}
 */
export async function getApplicationApprovalTicketById(dbClient, tenantId, ticketId) {
  assertTenantId(tenantId, 'getApplicationApprovalTicketById');

  const [row] = await dbClient
    .select()
    .from(applicationApprovalTickets)
    .where(
      and(
        eq(applicationApprovalTickets.id, ticketId),
        eq(applicationApprovalTickets.tenantId, tenantId)
      )
    )
    .limit(1);

  return row || null;
}

/**
 * Atomically transitions an application approval ticket's status.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} dbClient
 * @param {string} tenantId Sovereign tenant UUID
 * @param {string} ticketId Ticket UUID
 * @param {string|string[]} fromStatus Expected current status
 * @param {string} toStatus Target status
 * @param {object} [updates={}] Additional fields to update
 * @returns {Promise<object|null>} Updated row if matched, null otherwise
 */
export async function updateApplicationApprovalTicketStatus(
  dbClient,
  tenantId,
  ticketId,
  fromStatus,
  toStatus,
  updates = {}
) {
  assertTenantId(tenantId, 'updateApplicationApprovalTicketStatus');

  const conditions = [
    eq(applicationApprovalTickets.id, ticketId),
    eq(applicationApprovalTickets.tenantId, tenantId),
  ];

  if (Array.isArray(fromStatus)) {
    conditions.push(inArray(applicationApprovalTickets.status, fromStatus));
  } else if (fromStatus) {
    conditions.push(eq(applicationApprovalTickets.status, fromStatus));
  }

  const [updated] = await dbClient
    .update(applicationApprovalTickets)
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
 * Revokes an application approval ticket.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} dbClient
 * @param {string} tenantId Sovereign tenant UUID
 * @param {string} ticketId Ticket UUID
 * @param {string} [reason]
 * @returns {Promise<object|null>}
 */
export async function revokeApplicationApprovalTicket(dbClient, tenantId, ticketId, reason = null) {
  assertTenantId(tenantId, 'revokeApplicationApprovalTicket');

  const [updated] = await dbClient
    .update(applicationApprovalTickets)
    .set({
      status: 'REVOKED',
      revokedAt: new Date(),
      updatedAt: new Date(),
      metadata: reason ? { revocationReason: reason } : {},
    })
    .where(
      and(
        eq(applicationApprovalTickets.id, ticketId),
        eq(applicationApprovalTickets.tenantId, tenantId)
      )
    )
    .returning();

  return updated || null;
}
