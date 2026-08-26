/**
 * @file Application State Machine & Content Integrity Engine (Phase 12 / ARCH-043 / ADR-064)
 *
 * Implements the deterministic state transition rules for job applications and
 * cryptographic content hash utilities for immutable tailored document snapshots.
 */

import crypto from 'node:crypto';
import { ValidationError } from '../../errors/index.js';

/**
 * Authoritative directed state transition graph (ARCH-043 Section 4).
 */
export const VALID_STATUS_TRANSITIONS = Object.freeze({
  SAVED: Object.freeze(['APPLIED', 'WITHDRAWN', 'ARCHIVED']),
  APPLIED: Object.freeze(['SCREENING', 'INTERVIEWING', 'REJECTED', 'WITHDRAWN', 'ARCHIVED']),
  SCREENING: Object.freeze(['INTERVIEWING', 'OFFER_RECEIVED', 'REJECTED', 'WITHDRAWN', 'ARCHIVED']),
  INTERVIEWING: Object.freeze(['OFFER_RECEIVED', 'REJECTED', 'WITHDRAWN', 'ARCHIVED']),
  OFFER_RECEIVED: Object.freeze(['OFFER_ACCEPTED', 'REJECTED', 'WITHDRAWN', 'ARCHIVED']),
  OFFER_ACCEPTED: Object.freeze(['ARCHIVED']),
  REJECTED: Object.freeze(['ARCHIVED', 'APPLIED']),
  WITHDRAWN: Object.freeze(['ARCHIVED', 'SAVED', 'APPLIED']),
  ARCHIVED: Object.freeze(['SAVED', 'APPLIED', 'SCREENING', 'INTERVIEWING']),
});

/**
 * Terminal application states.
 */
export const TERMINAL_STATUSES = Object.freeze([
  'OFFER_ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'ARCHIVED',
]);

/**
 * Validates whether a state transition from `fromStatus` to `toStatus` is permitted.
 *
 * @param {string} fromStatus Current application status
 * @param {string} toStatus Desired target status
 * @returns {boolean} True if transition is valid
 */
export function isValidStatusTransition(fromStatus, toStatus) {
  if (!fromStatus || !toStatus) {
    return false;
  }
  if (fromStatus === toStatus) {
    return true; // No-op idempotent transition
  }
  const allowed = VALID_STATUS_TRANSITIONS[fromStatus];
  if (!allowed) {
    return false;
  }
  return allowed.includes(toStatus);
}

/**
 * Asserts that a state transition is permitted; throws a ValidationError if invalid.
 *
 * @param {string} fromStatus Current application status
 * @param {string} toStatus Desired target status
 * @throws {ValidationError} If transition violates state machine rules
 */
export function assertValidStatusTransition(fromStatus, toStatus) {
  if (!isValidStatusTransition(fromStatus, toStatus)) {
    throw new ValidationError(
      `Illegal application status transition from "${fromStatus}" to "${toStatus}".`,
      {
        fromStatus,
        toStatus,
        allowedTransitions: VALID_STATUS_TRANSITIONS[fromStatus] || [],
      }
    );
  }
}

/**
 * Determines whether the given application status is terminal.
 *
 * @param {string} status Application status
 * @returns {boolean}
 */
export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Recursively sorts the keys of an object to ensure deterministic serialization.
 *
 * @param {unknown} value Arbitrary value or object
 * @returns {unknown} Sorted value
 */
export function sortObjectKeys(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  const sorted = {};
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    sorted[key] = sortObjectKeys(value[key]);
  }
  return sorted;
}

/**
 * Computes a deterministic SHA-256 hex content hash of a document snapshot payload.
 *
 * @param {Record<string, unknown>} content Structured document payload
 * @returns {string} 64-hex character SHA-256 hash string
 */
export function computeDocumentContentHash(content) {
  const canonicalObject = sortObjectKeys(content);
  const canonicalJson = JSON.stringify(canonicalObject);
  return crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}
