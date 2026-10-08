import crypto from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  applicationApprovalTickets as approvals,
  applicationExecutions as executions,
  jobApplications,
  auditLogs,
} from '../schema.js';
import { ConflictError } from '../../errors/index.js';

export function executionEvent(database, ticket, executionId, eventType, details = {}) {
  return database.insert(auditLogs).values({
    tenantId: ticket.tenantId,
    userId: ticket.userId,
    eventType,
    resourceType: 'application_execution',
    resourceId: executionId || ticket.ticketId,
    details: {
      approvalId: ticket.ticketId,
      applicationId: ticket.applicationId,
      executionId,
      ...details,
    },
  });
}

/** CAS and durable intent commit together. The snapshot validated by ISSUE-02
 * must still be the exact current row at claim time (including its metadata).
 * PostgreSQL rechecks this predicate after waiting on a concurrent updater.
 */
export async function claimApplicationExecution(database, ticket) {
  return database.transaction(async (tx) => {
    // Acquire the row lock BEFORE evaluating the expiry predicate. A SELECT
    // FOR UPDATE contender can otherwise wait without an UPDATE/EPQ recheck.
    await tx
      .select({ id: approvals.id })
      .from(approvals)
      .where(and(eq(approvals.id, ticket.ticketId), eq(approvals.tenantId, ticket.tenantId)))
      .for('update');
    const [claimed] = await tx
      .update(approvals)
      .set({ status: 'CONSUMED', consumedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(approvals.id, ticket.ticketId),
          eq(approvals.tenantId, ticket.tenantId),
          eq(approvals.userId, ticket.userId),
          eq(approvals.candidateId, ticket.candidateId),
          eq(approvals.applicationId, ticket.applicationId),
          eq(approvals.status, 'ISSUED'),
          eq(approvals.signature, ticket.signature),
          eq(approvals.packageHash, ticket.packageHash),
          eq(approvals.packageVersion, ticket.packageVersion),
          eq(approvals.jobId, ticket.jobId),
          eq(approvals.destinationUrl, ticket.destinationUrl),
          eq(approvals.expiresAt, new Date(ticket.expiresAt)),
          sql`${approvals.expiresAt} > clock_timestamp()`,
          sql`${approvals.metadata} = ${JSON.stringify(ticket.metadata)}::jsonb`
        )
      )
      .returning();
    if (!claimed)
      throw new ConflictError('Approval is no longer executable', 'TICKET_ALREADY_CONSUMED');
    const [execution] = await tx
      .insert(executions)
      .values({
        id: crypto.randomUUID(),
        approvalId: ticket.ticketId,
        tenantId: ticket.tenantId,
        userId: ticket.userId,
        candidateId: ticket.candidateId,
        applicationId: ticket.applicationId,
        packageId: ticket.metadata.approvalTarget.packageId,
        packageVersion: ticket.packageVersion,
        packageHash: ticket.packageHash,
      })
      .returning();
    await executionEvent(tx, ticket, execution.id, 'application.execution_claimed');
    return execution;
  });
}

export async function startApplicationExecution(database, ticket, executionId) {
  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(executions)
      .set({ status: 'STARTED', startedAt: new Date() })
      .where(
        and(
          eq(executions.id, executionId),
          eq(executions.tenantId, ticket.tenantId),
          eq(executions.approvalId, ticket.ticketId),
          eq(executions.status, 'CLAIMED')
        )
      )
      .returning();
    if (!row) throw new ConflictError('Execution cannot be started', 'EXECUTION_NOT_CLAIMED');
    await executionEvent(tx, ticket, executionId, 'application.execution_started');
    return row;
  });
}

/** Result + application status + event are one local transaction, never an HTTP
 * transaction. Failed commits leave STARTED: reconcile, NEVER resubmit.
 */
export async function finishApplicationExecution(
  database,
  ticket,
  executionId,
  {
    status,
    result = null,
    failureClassification = null,
    fromStatus = 'STARTED',
    reconciliationEvidence = null,
  }
) {
  if (!['SUCCEEDED', 'FAILED', 'UNKNOWN'].includes(status))
    throw new Error('Invalid execution result state');
  if (!['CLAIMED', 'STARTED', 'UNKNOWN'].includes(fromStatus))
    throw new Error('Terminal executions cannot transition');
  if (fromStatus === 'CLAIMED' && status !== 'FAILED' && !reconciliationEvidence)
    throw new Error('Unstarted executions require reconciliation evidence');
  // Maintenance-only persistence: no public endpoint, adapter invocation or
  // retry. Operators must quiesce the owner and supply a provider evidence ref.
  if (fromStatus === 'UNKNOWN' && !reconciliationEvidence)
    throw new Error('Unknown outcomes require reconciliation evidence');
  if (
    reconciliationEvidence !== null &&
    (typeof reconciliationEvidence !== 'string' ||
      !reconciliationEvidence.trim() ||
      reconciliationEvidence.length > 1024 ||
      status === 'UNKNOWN' ||
      !['CLAIMED', 'STARTED', 'UNKNOWN'].includes(fromStatus))
  )
    throw new Error('Invalid reconciliation evidence or transition');
  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(executions)
      .set({
        status,
        result,
        failureClassification,
        completedAt: new Date(),
        externalReference: result?.externalReference || null,
      })
      .where(
        and(
          eq(executions.id, executionId),
          eq(executions.tenantId, ticket.tenantId),
          eq(executions.approvalId, ticket.ticketId),
          eq(executions.status, fromStatus)
        )
      )
      .returning();
    if (!row)
      throw new ConflictError(
        'Execution result already recorded or not owned',
        'EXECUTION_STATE_CONFLICT'
      );
    if (status === 'SUCCEEDED') {
      const [application] = await tx
        .update(jobApplications)
        .set({
          status: result.status,
          appliedAt: result.status === 'SUBMITTED' ? new Date(result.submittedAt) : null,
          updatedAt: new Date(),
          metadata: sql`${jobApplications.metadata} || ${JSON.stringify({
            executionId,
            approvalTicketId: ticket.ticketId,
            destinationUrl: ticket.destinationUrl,
            externalReference: result.externalReference,
            externalSubmissionState: result.status,
            externalSubmissionStatus: result.status,
            packageHash: ticket.packageHash,
            executedPackageId: ticket.metadata.approvalTarget.packageId,
            executedPackageVersion: ticket.packageVersion,
            finalSubmitBlocked: result.status !== 'SUBMITTED',
          })}::jsonb`,
        })
        .where(
          and(
            eq(jobApplications.id, ticket.applicationId),
            eq(jobApplications.tenantId, ticket.tenantId),
            eq(jobApplications.candidateId, ticket.candidateId)
          )
        )
        .returning();
      if (!application) throw new Error('Approved application no longer exists');
    }
    await executionEvent(
      tx,
      ticket,
      executionId,
      `application.execution_${status === 'UNKNOWN' ? 'outcome_unknown' : status.toLowerCase()}`,
      { failureClassification, externalReference: result?.externalReference }
    );
    if (reconciliationEvidence) {
      const actor = await tx.execute(sql`select current_user as actor`);
      await executionEvent(
        tx,
        ticket,
        executionId,
        'application.execution_reconciliation_completed',
        {
          previousStatus: fromStatus,
          status,
          evidenceReference: reconciliationEvidence,
          databaseActor: actor.rows[0].actor,
        }
      );
    }
    return row;
  });
}
