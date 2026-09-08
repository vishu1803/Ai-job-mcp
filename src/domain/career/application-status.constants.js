/**
 * @file Authoritative Application Status Constants & Predicates (P15-002).
 *
 * Single source of truth for which application lifecycle statuses are
 * "submitted / protected" — i.e. the application has progressed beyond a
 * draft and must be treated as read-only against destructive preparation
 * mutations.
 *
 * Statuses mirror `applicationStatusEnum` in `src/db/schema.js` and
 * `ApplicationStatusEnum` in `src/domain/career/job-application.schemas.js`.
 * Do NOT invent a second status list. Any consumer that needs to decide
 * "is this application submitted / protected?" must use these helpers.
 */

/**
 * Statuses that are considered submitted/protected: the candidate has
 * progressed past the draft stage and the prepared package must not be
 * destructively replaced.
 *
 * `SAVED` is intentionally excluded — a saved (draft) application remains
 * editable/preparable.
 *
 * NOTE: `REJECTED`, `WITHDRAWN`, and `ARCHIVED` are terminal states. They
 * are intentionally NOT included here: they are not "submitted" in the
 * protection sense, and the application-tracking service treats them as
 * inactive (a fresh application may be created for the same job).
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
 * @returns {boolean} True if the status is in the protected set
 */
export function isSubmittedApplicationStatus(status) {
  return typeof status === 'string' && SUBMITTED_APPLICATION_STATUSES.includes(status);
}

/**
 * Terminal / inactive statuses. The application workflow treats applications
 * in these states as inactive: the same canonical job identity may start a
 * FRESH application. Route-level "existing application" matching must use
 * the same exclusion so the extension is never told an archived row is the
 * live application for a job (P15-002 Batch 3: idempotency alignment).
 *
 * Mirrors the service-level predicate in JobApplicationWorkflowService
 * (`status NOT IN ('REJECTED', 'WITHDRAWN', 'ARCHIVED')`).
 */
export const INACTIVE_APPLICATION_STATUSES = Object.freeze(['REJECTED', 'WITHDRAWN', 'ARCHIVED']);

/**
 * Determines whether an application status is terminal/inactive.
 *
 * @param {string|null|undefined} status Application lifecycle status
 * @returns {boolean} True if the status is in the inactive set
 */
export function isInactiveApplicationStatus(status) {
  return typeof status === 'string' && INACTIVE_APPLICATION_STATUSES.includes(status);
}

/**
 * Determines whether an application row is submitted/protected.
 *
 * In addition to the lifecycle status, an explicit `appliedAt` timestamp or
 * an external submission state of `SUBMITTED` also marks the application as
 * submitted (mirrors the service-level guard in ApplicationTrackingService).
 *
 * @param {object} application Application row
 * @param {object} [options]
 * @param {boolean} [options.includeAppliedAt=true] Treat a non-null appliedAt as submitted
 * @returns {boolean}
 */
export function isSubmittedApplication(application, options = {}) {
  if (!application || typeof application !== 'object') return false;

  const { includeAppliedAt = true } = options;

  if (isSubmittedApplicationStatus(application.status)) return true;
  if (includeAppliedAt && application.appliedAt != null) return true;
  if (application.metadata?.externalSubmissionState === 'SUBMITTED') return true;

  return false;
}