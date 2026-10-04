/**
 * @file Browser Extension Provider Portal Adapters Export Bridge (Phase 9.2 / ARCH-060).
 *
 * Self-contained provider metadata and adapter registry for Chrome extension content scripts.
 * Zero external imports crossing extension boundary.
 */

export const PortalApplicationStateEnum = Object.freeze([
  'INITIALIZED',
  'FORM_DETECTED',
  'AUTOFILLED',
  'SUBMISSION_BLOCKED',
  'READY_FOR_REVIEW',
  'SUBMITTED_MANUAL',
]);

export const StandardPortalProviders = Object.freeze([
  'greenhouse',
  'lever',
  'ashby',
  'workday',
  'smartrecruiters',
  'icims',
  'generic',
]);
