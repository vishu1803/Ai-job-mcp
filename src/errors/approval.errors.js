/**
 * @file Action Approval Error Classes (P9-002 / ARCH-032 / ADR-053)
 *
 * Dedicated typed domain errors for the two-phase action approval state machine.
 */

import { AppError } from './base.error.js';

/**
 * 404 Not Found — Approval Ticket Not Found Error.
 */
export class ApprovalTicketNotFoundError extends AppError {
  constructor(message = 'Approval ticket not found', details = null) {
    super(message, 404, 'APPROVAL_TICKET_NOT_FOUND', details);
  }
}

/**
 * 410 Gone — Approval Ticket Expired Error.
 */
export class ApprovalTicketExpiredError extends AppError {
  constructor(message = 'Approval ticket has expired', details = null) {
    super(message, 410, 'APPROVAL_TICKET_EXPIRED', details);
  }
}

/**
 * 409 Conflict — Invalid Ticket State Transition Error.
 */
export class ApprovalTicketStateError extends AppError {
  constructor(message = 'Invalid approval ticket state for requested transition', details = null) {
    super(message, 409, 'INVALID_TICKET_STATE', details);
  }
}

/**
 * 409 Conflict — Stale Base Branch HEAD Commit SHA Error.
 */
export class StaleHeadShaError extends AppError {
  constructor(
    message = 'Base branch has been modified since approval ticket was created',
    details = null
  ) {
    super(message, 409, 'STALE_BASE_HEAD_SHA', details);
  }
}

/**
 * 400 Bad Request — Cryptographic Ticket Signature Verification Failure.
 */
export class InvalidTicketSignatureError extends AppError {
  constructor(
    message = 'Cryptographic signature verification failed for approval ticket',
    details = null
  ) {
    super(message, 400, 'INVALID_TICKET_SIGNATURE', details);
  }
}
