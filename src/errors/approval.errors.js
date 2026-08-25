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

/**
 * 403 Forbidden — Prohibited Branch or Write Operation Error.
 */
export class ForbiddenOperationError extends AppError {
  constructor(message = 'Requested repository write operation is prohibited', details = null) {
    super(message, 403, 'FORBIDDEN_OPERATION', details);
  }
}

/**
 * 403 Forbidden — Attempted Write Directly to Default or Protected Branch.
 */
export class ProtectedDefaultBranchError extends ForbiddenOperationError {
  constructor(
    message = 'Direct write to default or protected branch is prohibited',
    details = null
  ) {
    super(message, details);
    this.code = 'PROTECTED_DEFAULT_BRANCH';
  }
}

/**
 * 403 Forbidden — Prohibited or Malformed Git Reference.
 */
export class InvalidGitRefError extends ForbiddenOperationError {
  constructor(message = 'Invalid or prohibited Git reference', details = null) {
    super(message, details);
    this.code = 'INVALID_GIT_REF';
  }
}

/**
 * 403 Forbidden — Patch Path Traversal, Binary, or Size Policy Violation.
 */
export class PatchPolicyViolationError extends ForbiddenOperationError {
  constructor(message = 'Patch violates file path, binary, or size policy', details = null) {
    super(message, details);
    this.code = 'PATCH_POLICY_VIOLATION';
  }
}

/**
 * 403 Forbidden — Modification of CI/CD Workflow or Automation Files Prohibited.
 */
export class WorkflowModificationError extends ForbiddenOperationError {
  constructor(
    message = 'Modification of CI/CD workflow files is strictly prohibited',
    details = null
  ) {
    super(message, details);
    this.code = 'WORKFLOW_MODIFICATION_PROHIBITED';
  }
}

/**
 * 403 Forbidden — High-Entropy Secret Detected in Patch or Metadata.
 */
export class SecretDetectedError extends ForbiddenOperationError {
  constructor(message = 'High-entropy secret or credential detected in payload', details = null) {
    super(message, details);
    this.code = 'SECRET_DETECTED_IN_PAYLOAD';
  }
}

/**
 * 409 Conflict — Feature Branch Already Exists and Cannot Be Overwritten.
 */
export class BranchCollisionError extends AppError {
  constructor(message = 'Target feature branch already exists in repository', details = null) {
    super(message, 409, 'BRANCH_COLLISION_DETECTED', details);
  }
}
