/**
 * @file Action Approval Ticket Service (P9-002 / ARCH-032 / ADR-053)
 *
 * Implements the Two-Phase Human-in-the-Loop Action Approval State Machine.
 * Serves as the sole authorization boundary before any external GitHub repository mutations.
 *
 * Lifecycle States:
 * PENDING -> APPROVED -> EXECUTING -> EXECUTED (Terminal Success)
 *         -> REJECTED (Terminal User)
 *         -> CANCELLED (Terminal User)
 *         -> EXPIRED (Terminal System)
 *         -> FAILED (Terminal Error)
 */

import crypto from 'node:crypto';
import { db as defaultDb } from '../db/index.js';
import {
  createApprovalTicketRecord,
  getApprovalTicketById,
  getApprovalTicketForUpdate,
  transitionTicketStatusAtomic,
  listApprovalTicketsByTenant,
} from '../db/repositories/approval-ticket.repository.js';
import {
  CreateApprovalTicketInputSchema,
  ApprovalTicketSchema,
  ApproveTicketInputSchema,
  RejectTicketInputSchema,
  CancelTicketInputSchema,
  ConsumeTicketInputSchema,
  CompleteExecutionInputSchema,
  FailExecutionInputSchema,
} from '../domain/career/approval-ticket.schemas.js';
import { signTicketPayload, verifyTicketSignature } from '../security/approval-signer.js';
import {
  ApprovalTicketNotFoundError,
  ApprovalTicketExpiredError,
  ApprovalTicketStateError,
  InvalidTicketSignatureError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '../errors/index.js';
import { logger as defaultLogger } from '../utils/logger.js';

// Default TTLs (in milliseconds)
export const CREATION_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const EXECUTION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export class ActionApprovalTicketService {
  /**
   * @param {object} [options={}]
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.database=defaultDb]
   * @param {import('./mcp-audit.service.js').McpAuditService} [options.mcpAuditService=null]
   * @param {import('pino').Logger} [options.logger=defaultLogger]
   */
  constructor(options = {}) {
    this.db = options.database || defaultDb;
    this.mcpAuditService = options.mcpAuditService || null;
    this.logger = options.logger || defaultLogger;
  }

  /**
   * Validates trusted request context and sovereign tenant ID.
   *
   * @private
   * @param {object} context Request context
   * @param {string} [opName='operation']
   * @returns {{ tenantId: string, userId: string, role: string }}
   */
  _validateContext(context, opName = 'operation') {
    if (!context || typeof context !== 'object') {
      throw new ValidationError(`Context is required for ${opName}`, 'CONTEXT_REQUIRED');
    }
    const tenantId = context.tenantId;
    if (!tenantId || typeof tenantId !== 'string') {
      throw new ValidationError(`tenantId is required for ${opName}`, 'TENANT_ID_REQUIRED');
    }
    const userId = context.userId || context.id || null;
    const role = (context.role || 'MEMBER').toUpperCase();

    return { tenantId, userId, role };
  }

  /**
   * Dispatches audit log event asynchronously with error swallowing to prevent workflow blockage.
   *
   * @private
   * @param {object} params
   */
  async _emitAudit(params) {
    if (this.mcpAuditService && typeof this.mcpAuditService.logEvent === 'function') {
      try {
        await this.mcpAuditService.logEvent(params);
      } catch (err) {
        this.logger.warn(
          { eventType: params.eventType, error: err.message },
          'Failed to write audit log for approval lifecycle event'
        );
      }
    }
  }

  /**
   * Phase 1: Propose Action & Mint Approval Ticket.
   *
   * @param {object} context Trusted request context ({ tenantId, userId, role })
   * @param {object} params Validated create ticket input
   * @returns {Promise<object>} Created ApprovalTicket
   */
  async createTicket(context, params) {
    const { tenantId, userId } = this._validateContext(context, 'createTicket');
    const validated = CreateApprovalTicketInputSchema.parse(params);

    const { candidateProfile, proposal, expectedHeadSha, baseBranch } = validated;

    // Sovereign Multi-Tenant Isolation Assertion (404 Default-Deny)
    if (candidateProfile.tenantId !== tenantId || proposal.tenantId !== tenantId) {
      throw new NotFoundError('Candidate profile or project improvement proposal not found');
    }

    if (proposal.status !== 'PROPOSED') {
      throw new ValidationError(
        `Cannot create approval ticket for proposal in ${proposal.status} status`,
        'PROPOSAL_NOT_ELIGIBLE'
      );
    }

    const ticketId = crypto.randomUUID();
    const candidateId = candidateProfile.candidate?.id || candidateProfile.id;
    const resourceId = proposal.resourceId;
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + CREATION_TTL_MS);

    const ticketDraft = {
      id: ticketId,
      tenantId,
      userId: userId || candidateId,
      candidateId,
      resourceId,
      proposalId: proposal.proposalId,
      actionType: 'PROJECT_IMPROVEMENT_PR',
      repositoryName: proposal.repositoryName,
      baseBranch: baseBranch || 'main',
      targetBranch: proposal.targetBranch,
      expectedHeadSha,
      patchFingerprint: proposal.patch.patchFingerprint,
      patchSummary: {
        fileCount: proposal.patch.fileCount,
        totalDiffLines: proposal.patch.totalDiffLines,
        expectedFiles: proposal.patch.files.map((f) => f.path),
      },
      status: 'PENDING',
      createdAt,
      updatedAt: createdAt,
      expiresAt,
    };

    // Calculate cryptographic HMAC signature
    const hmacSignature = signTicketPayload(ticketDraft);
    ticketDraft.hmacSignature = hmacSignature;

    // Persist in PostgreSQL
    const createdRecord = await createApprovalTicketRecord(this.db, ticketDraft);

    // Emit Audit Event
    await this._emitAudit({
      context: { tenantId, userId: ticketDraft.userId },
      eventType: 'approval.ticket_created',
      resourceType: 'approval_ticket',
      resourceId: ticketId,
      metadata: {
        ticketId,
        proposalId: proposal.proposalId,
        repositoryName: proposal.repositoryName,
        targetBranch: proposal.targetBranch,
        expectedHeadSha,
        patchFingerprint: proposal.patch.patchFingerprint,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return ApprovalTicketSchema.parse(createdRecord);
  }

  /**
   * Retrieves an approval ticket by ID strictly scoped to tenant.
   * Lazily marks expired tickets as EXPIRED.
   *
   * @param {object} context
   * @param {string} ticketId
   * @returns {Promise<object>} ApprovalTicket
   */
  async getTicket(context, ticketId) {
    const { tenantId } = this._validateContext(context, 'getTicket');

    const ticket = await getApprovalTicketById(this.db, tenantId, ticketId);
    if (!ticket) {
      throw new ApprovalTicketNotFoundError(`Approval ticket ${ticketId} not found`);
    }

    // Lazy Expiration Evaluation
    if (ticket.status === 'PENDING' && new Date() > new Date(ticket.expiresAt)) {
      await transitionTicketStatusAtomic(this.db, tenantId, ticketId, 'PENDING', 'EXPIRED', {
        rejectionReason: 'Ticket expired before human approval',
      });

      ticket.status = 'EXPIRED';
      ticket.rejectionReason = 'Ticket expired before human approval';

      await this._emitAudit({
        context: { tenantId, userId: ticket.userId },
        eventType: 'approval.ticket_expired',
        resourceType: 'approval_ticket',
        resourceId: ticketId,
        metadata: { ticketId, reason: 'CREATION_TTL_EXPIRED' },
      });
    }

    return ApprovalTicketSchema.parse(ticket);
  }

  /**
   * Phase 2: Human Approval Gate (`confirm_action`).
   *
   * Transitions ticket from PENDING -> APPROVED atomically within a transaction.
   *
   * @param {object} context Trusted request context ({ tenantId, userId, role })
   * @param {object} params
   * @returns {Promise<object>} Approved ApprovalTicket
   */
  async approveTicket(context, params) {
    const { tenantId, userId, role } = this._validateContext(context, 'approveTicket');

    if (role === 'READONLY') {
      throw new AuthorizationError('READONLY role is not authorized to approve action tickets');
    }

    const { ticketId } = ApproveTicketInputSchema.parse(params);

    const approvedRecord = await this.db.transaction(async (tx) => {
      // 1. Acquire exclusive row lock
      const ticket = await getApprovalTicketForUpdate(tx, tenantId, ticketId);
      if (!ticket) {
        throw new ApprovalTicketNotFoundError(`Approval ticket ${ticketId} not found`);
      }

      // 2. Cryptographic Integrity & Anti-Tamper Verification
      if (!verifyTicketSignature(ticket)) {
        throw new InvalidTicketSignatureError(
          'Cryptographic HMAC signature verification failed for approval ticket'
        );
      }

      // 3. Expiration Check
      if (new Date() > new Date(ticket.expiresAt)) {
        await transitionTicketStatusAtomic(tx, tenantId, ticketId, 'PENDING', 'EXPIRED', {
          rejectionReason: 'Ticket expired before human approval',
        });

        await this._emitAudit({
          context: { tenantId, userId },
          eventType: 'approval.ticket_expired',
          resourceType: 'approval_ticket',
          resourceId: ticketId,
          metadata: { ticketId, reason: 'CREATION_TTL_EXPIRED' },
        });

        throw new ApprovalTicketExpiredError('Approval ticket has expired and cannot be approved');
      }

      // 4. Idempotency Handling (Already approved by same user)
      if (ticket.status === 'APPROVED' && ticket.approvedByUserId === userId) {
        return ticket;
      }

      // 5. State Machine Invariant Check
      if (ticket.status !== 'PENDING') {
        throw new ApprovalTicketStateError(
          `Cannot approve ticket in ${ticket.status} status. Ticket must be in PENDING state.`
        );
      }

      // 6. Atomic State Transition
      const now = new Date();
      const updated = await transitionTicketStatusAtomic(
        tx,
        tenantId,
        ticketId,
        'PENDING',
        'APPROVED',
        {
          approvedByUserId: userId,
          approvedAt: now,
        }
      );

      if (!updated) {
        throw new ApprovalTicketStateError(
          'Failed to transition ticket to APPROVED state (concurrent conflict)'
        );
      }

      return updated;
    });

    // Emit Audit Event
    await this._emitAudit({
      context: { tenantId, userId },
      eventType: 'approval.ticket_approved',
      resourceType: 'approval_ticket',
      resourceId: ticketId,
      metadata: {
        ticketId,
        approvedByUserId: userId,
        approvedAt: approvedRecord.approvedAt,
      },
    });

    return ApprovalTicketSchema.parse(approvedRecord);
  }

  /**
   * Human Rejection Gate (`reject_action`).
   *
   * Transitions ticket from PENDING -> REJECTED.
   *
   * @param {object} context
   * @param {object} params
   * @returns {Promise<object>} Rejected ApprovalTicket
   */
  async rejectTicket(context, params) {
    const { tenantId, userId, role } = this._validateContext(context, 'rejectTicket');

    if (role === 'READONLY') {
      throw new AuthorizationError('READONLY role is not authorized to reject action tickets');
    }

    const { ticketId, rejectionReason } = RejectTicketInputSchema.parse(params);

    const rejectedRecord = await this.db.transaction(async (tx) => {
      const ticket = await getApprovalTicketForUpdate(tx, tenantId, ticketId);
      if (!ticket) {
        throw new ApprovalTicketNotFoundError(`Approval ticket ${ticketId} not found`);
      }

      if (!verifyTicketSignature(ticket)) {
        throw new InvalidTicketSignatureError('Cryptographic HMAC signature verification failed');
      }

      if (ticket.status !== 'PENDING') {
        throw new ApprovalTicketStateError(
          `Cannot reject ticket in ${ticket.status} status. Only PENDING tickets can be rejected.`
        );
      }

      const updated = await transitionTicketStatusAtomic(
        tx,
        tenantId,
        ticketId,
        'PENDING',
        'REJECTED',
        {
          rejectionReason,
          approvedByUserId: userId,
          approvedAt: new Date(),
        }
      );

      return updated;
    });

    await this._emitAudit({
      context: { tenantId, userId },
      eventType: 'approval.ticket_rejected',
      resourceType: 'approval_ticket',
      resourceId: ticketId,
      metadata: { ticketId, rejectionReason, rejectedByUserId: userId },
    });

    return ApprovalTicketSchema.parse(rejectedRecord);
  }

  /**
   * Cancellation Gate (`cancel_action`).
   *
   * Transitions ticket from PENDING or APPROVED -> CANCELLED.
   *
   * @param {object} context
   * @param {object} params
   * @returns {Promise<object>} Cancelled ApprovalTicket
   */
  async cancelTicket(context, params) {
    const { tenantId, userId, role } = this._validateContext(context, 'cancelTicket');

    if (role === 'READONLY') {
      throw new AuthorizationError('READONLY role is not authorized to cancel action tickets');
    }

    const { ticketId, reason } = CancelTicketInputSchema.parse(params);

    const cancelledRecord = await this.db.transaction(async (tx) => {
      const ticket = await getApprovalTicketForUpdate(tx, tenantId, ticketId);
      if (!ticket) {
        throw new ApprovalTicketNotFoundError(`Approval ticket ${ticketId} not found`);
      }

      if (!verifyTicketSignature(ticket)) {
        throw new InvalidTicketSignatureError('Cryptographic HMAC signature verification failed');
      }

      if (ticket.status !== 'PENDING' && ticket.status !== 'APPROVED') {
        throw new ApprovalTicketStateError(
          `Cannot cancel ticket in ${ticket.status} status. Only PENDING or APPROVED tickets can be cancelled.`
        );
      }

      const updated = await transitionTicketStatusAtomic(
        tx,
        tenantId,
        ticketId,
        ticket.status,
        'CANCELLED',
        {
          rejectionReason: reason || 'Cancelled by user',
        }
      );

      return updated;
    });

    await this._emitAudit({
      context: { tenantId, userId },
      eventType: 'approval.ticket_cancelled',
      resourceType: 'approval_ticket',
      resourceId: ticketId,
      metadata: { ticketId, reason: reason || 'Cancelled by user', cancelledByUserId: userId },
    });

    return ApprovalTicketSchema.parse(cancelledRecord);
  }

  /**
   * Execution Consumer (Mandatory Entry Point for P9-003).
   *
   * Atomically acquires execution lock, transitioning APPROVED -> EXECUTING.
   *
   * @param {object} context
   * @param {object} params
   * @returns {Promise<object>} Locked ApprovalTicket ready for GitHub write
   */
  async consumeTicketForExecution(context, params) {
    const { tenantId, userId, role } = this._validateContext(context, 'consumeTicketForExecution');

    if (role === 'READONLY') {
      throw new AuthorizationError('READONLY role is not authorized to execute action tickets');
    }

    const { ticketId, idempotencyKey } = ConsumeTicketInputSchema.parse(params);

    const executingRecord = await this.db.transaction(async (tx) => {
      const ticket = await getApprovalTicketForUpdate(tx, tenantId, ticketId);
      if (!ticket) {
        throw new ApprovalTicketNotFoundError(`Approval ticket ${ticketId} not found`);
      }

      if (!verifyTicketSignature(ticket)) {
        throw new InvalidTicketSignatureError('Cryptographic HMAC signature verification failed');
      }

      // Idempotency: Safe re-entry for identical key or already executed ticket
      if (
        ticket.status === 'EXECUTED' ||
        (ticket.idempotencyKey === idempotencyKey && ticket.status === 'EXECUTING')
      ) {
        return ticket;
      }

      // Status Check: Must be APPROVED
      if (ticket.status !== 'APPROVED') {
        throw new ApprovalTicketStateError(
          `Cannot execute ticket in ${ticket.status} status. Ticket must be APPROVED.`
        );
      }

      // Execution Window Check (Max 5 minutes after approval)
      if (ticket.approvedAt) {
        const approvedAtMs = new Date(ticket.approvedAt).getTime();
        if (Date.now() - approvedAtMs > EXECUTION_WINDOW_MS) {
          await transitionTicketStatusAtomic(tx, tenantId, ticketId, 'APPROVED', 'EXPIRED', {
            failureReason: 'Execution window of 5 minutes expired after human approval',
          });

          await this._emitAudit({
            context: { tenantId, userId },
            eventType: 'approval.ticket_expired',
            resourceType: 'approval_ticket',
            resourceId: ticketId,
            metadata: { ticketId, reason: 'EXECUTION_WINDOW_EXPIRED' },
          });

          throw new ApprovalTicketExpiredError(
            'Approval execution window of 5 minutes has elapsed. Request a fresh approval.'
          );
        }
      }

      // Single-Use Atomic Transition to EXECUTING
      const now = new Date();
      const updated = await transitionTicketStatusAtomic(
        tx,
        tenantId,
        ticketId,
        'APPROVED',
        'EXECUTING',
        {
          consumedAt: now,
          idempotencyKey,
        }
      );

      if (!updated) {
        throw new ApprovalTicketStateError(
          'Failed to lock ticket for execution (concurrent consumer acquired ticket)'
        );
      }

      return updated;
    });

    await this._emitAudit({
      context: { tenantId, userId },
      eventType: 'approval.execution_started',
      resourceType: 'approval_ticket',
      resourceId: ticketId,
      metadata: { ticketId, idempotencyKey, consumedAt: executingRecord.consumedAt },
    });

    return ApprovalTicketSchema.parse(executingRecord);
  }

  /**
   * Finalizes successful execution (Caller: P9-003 after PR creation).
   *
   * Transitions EXECUTING -> EXECUTED.
   *
   * @param {object} context
   * @param {object} params
   * @returns {Promise<object>} Finalized ApprovalTicket
   */
  async completeExecution(context, params) {
    const { tenantId, userId } = this._validateContext(context, 'completeExecution');
    const { ticketId, executionResult } = CompleteExecutionInputSchema.parse(params);

    const executedRecord = await this.db.transaction(async (tx) => {
      const ticket = await getApprovalTicketForUpdate(tx, tenantId, ticketId);
      if (!ticket) {
        throw new ApprovalTicketNotFoundError(`Approval ticket ${ticketId} not found`);
      }

      if (!verifyTicketSignature(ticket)) {
        throw new InvalidTicketSignatureError('Cryptographic HMAC signature verification failed');
      }

      if (ticket.status !== 'EXECUTING') {
        throw new ApprovalTicketStateError(
          `Cannot complete execution for ticket in ${ticket.status} status. Ticket must be in EXECUTING state.`
        );
      }

      const now = new Date();
      const updated = await transitionTicketStatusAtomic(
        tx,
        tenantId,
        ticketId,
        'EXECUTING',
        'EXECUTED',
        {
          executedAt: now,
          executionResult,
        }
      );

      return updated;
    });

    await this._emitAudit({
      context: { tenantId, userId },
      eventType: 'approval.execution_completed',
      resourceType: 'approval_ticket',
      resourceId: ticketId,
      metadata: { ticketId, executionResult, executedAt: executedRecord.executedAt },
    });

    return ApprovalTicketSchema.parse(executedRecord);
  }

  /**
   * Records execution failure (Caller: P9-003 on GitHub API error or network drop).
   *
   * Transitions EXECUTING -> FAILED.
   *
   * @param {object} context
   * @param {object} params
   * @returns {Promise<object>} Failed ApprovalTicket
   */
  async failExecution(context, params) {
    const { tenantId, userId } = this._validateContext(context, 'failExecution');
    const { ticketId, failureReason } = FailExecutionInputSchema.parse(params);

    const failedRecord = await this.db.transaction(async (tx) => {
      const ticket = await getApprovalTicketForUpdate(tx, tenantId, ticketId);
      if (!ticket) {
        throw new ApprovalTicketNotFoundError(`Approval ticket ${ticketId} not found`);
      }

      if (ticket.status !== 'EXECUTING') {
        throw new ApprovalTicketStateError(
          `Cannot mark execution failure for ticket in ${ticket.status} status. Ticket must be in EXECUTING state.`
        );
      }

      const updated = await transitionTicketStatusAtomic(
        tx,
        tenantId,
        ticketId,
        'EXECUTING',
        'FAILED',
        {
          failureReason,
          executedAt: new Date(),
        }
      );

      return updated;
    });

    await this._emitAudit({
      context: { tenantId, userId },
      eventType: 'approval.execution_failed',
      resourceType: 'approval_ticket',
      resourceId: ticketId,
      metadata: { ticketId, failureReason },
    });

    return ApprovalTicketSchema.parse(failedRecord);
  }

  /**
   * Lists approval tickets within tenant workspace with optional pagination and filters.
   *
   * @param {object} context
   * @param {object} [options={}]
   * @returns {Promise<{items: Array<any>, nextCursor: string|null, hasMore: boolean, totalCount: number}>}
   */
  async listTickets(context, options = {}) {
    const { tenantId } = this._validateContext(context, 'listTickets');
    return listApprovalTicketsByTenant(this.db, tenantId, options);
  }
}
