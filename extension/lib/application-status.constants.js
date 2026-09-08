/**
 * @file Extension-side mirror of the authoritative submitted/protected
 * application-status predicate (P15-002).
 *
 * SINGLE SOURCE OF TRUTH: `src/domain/career/application-status.constants.js`
 * in the backend repository. This file exists because the unpacked MV3
 * extension cannot import modules outside the `extension/` root.
 *
 * A regression test (`tests/unit/extension-popup-controller.test.js`) asserts
 * this file's exported status list is IDENTICAL to the backend authority —
 * any drift fails CI. Do not edit this list without updating the authority.
 */

/**
 * Statuses considered submitted/protected (read-only against destructive
 * preparation mutations). Must mirror the backend authority exactly.
 */
export const SUBMITTED_APPLICATION_STATUSES = Object.freeze([
  'APPLIED',
  'SCREENING',
  'INTERVIEWING',
  'OFFER_RECEIVED',
  'OFFER_ACCEPTED',
]);

/**
 * Determines whether an application status is submitted/protected.
 *
 * @param {string|null|undefined} status Application lifecycle status
 * @returns {boolean}
 */
export function isSubmittedApplicationStatus(status) {
  return typeof status === 'string' && SUBMITTED_APPLICATION_STATUSES.includes(status);
}