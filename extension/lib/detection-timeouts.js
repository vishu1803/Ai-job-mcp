/**
 * @file Shared Detection Timeout Constants (P71).
 *
 * Establishes a single source of truth for the detection timeout contract
 * between the content-script hydration loop and the sidebar request timeout.
 *
 * INVARIANT: DETECTION_REQUEST_TIMEOUT_MS > DETECTION_MAX_DURATION_MS
 *
 * This eliminates the deterministic race where the sidebar's Promise.race
 * timeout fires before the content-script's bounded hydration completes,
 * discarding valid late-arriving LinkedIn detection results.
 */

/**
 * Maximum duration (ms) the content-script's performDetectionWithHydration()
 * will wait for DOM hydration before returning whatever result it has.
 *
 * Used in: extension/content/content-script.js
 */
export const DETECTION_MAX_DURATION_MS = 5000;

/**
 * Maximum duration (ms) the sidebar's _requestDetectionFromTab() will wait
 * for a DETECT_JOB_PAGE response before treating the request as timed out.
 *
 * MUST be strictly greater than DETECTION_MAX_DURATION_MS to ensure that
 * valid content-script hydration results are never discarded by a premature
 * sidebar timeout.
 *
 * Used in: extension/sidebar/sidebar.js
 */
export const DETECTION_REQUEST_TIMEOUT_MS = 7000;

// Static invariant assertion (fails at import time if violated)
if (DETECTION_REQUEST_TIMEOUT_MS <= DETECTION_MAX_DURATION_MS) {
  throw new Error(
    `Detection timeout invariant violated: DETECTION_REQUEST_TIMEOUT_MS (${DETECTION_REQUEST_TIMEOUT_MS}) ` +
    `must be strictly greater than DETECTION_MAX_DURATION_MS (${DETECTION_MAX_DURATION_MS})`
  );
}
