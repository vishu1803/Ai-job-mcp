/**
 * @file Canonical User-Facing State Definitions & Enums
 *
 * Defines the 12 standard user-facing states required across all portal workflows.
 * Guarantees zero leakage of backend implementation details (stack traces, SQL,
 * database errors, Zod internals, HTTP codes, class names).
 */

/**
 * 12 Canonical User-Facing States
 * @readonly
 * @enum {string}
 */
export const UserFacingStateEnum = {
  LOADING: 'LOADING',
  EMPTY: 'EMPTY',
  SUCCESS: 'SUCCESS',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  NETWORK_FAILURE: 'NETWORK_FAILURE',
  SERVER_FAILURE: 'SERVER_FAILURE',
  AI_FAILURE: 'AI_FAILURE',
  RETRYABLE_FAILURE: 'RETRYABLE_FAILURE',
};

/**
 * Recovery Action Types
 * @readonly
 * @enum {string}
 */
export const RecoveryActionType = {
  RETRY: 'retry',
  GO_BACK: 'go_back',
  EDIT_PROFILE: 'edit_profile',
  SIGN_IN: 'sign_in',
  CONTACT_SUPPORT: 'contact_support',
  NAVIGATE: 'navigate',
  CONTINUE_WITHOUT_AI: 'continue_without_ai',
};

/**
 * Canonical descriptions and default human-centered messages for all 12 states.
 */
export const USER_FACING_STATE_DEFAULTS = {
  [UserFacingStateEnum.LOADING]: {
    title: 'Loading your information…',
    message: 'Please wait while we prepare your view.',
    isError: false,
    recoverable: false,
  },
  [UserFacingStateEnum.EMPTY]: {
    title: 'Nothing here yet',
    message: 'Get started by adding your first item.',
    isError: false,
    recoverable: true,
  },
  [UserFacingStateEnum.SUCCESS]: {
    title: 'Changes saved successfully',
    message: 'Your updates have been applied.',
    isError: false,
    recoverable: false,
  },
  [UserFacingStateEnum.VALIDATION_ERROR]: {
    title: 'Please check your information',
    message: 'Some fields need your attention before you can continue.',
    isError: true,
    recoverable: true,
    defaultAction: {
      type: RecoveryActionType.RETRY,
      label: 'Review fields',
    },
  },
  [UserFacingStateEnum.AUTHENTICATION_ERROR]: {
    title: 'Session expired',
    message: 'Please sign in to continue using your account.',
    isError: true,
    recoverable: true,
    defaultAction: {
      type: RecoveryActionType.SIGN_IN,
      label: 'Sign in',
      href: '/login',
    },
  },
  [UserFacingStateEnum.AUTHORIZATION_ERROR]: {
    title: 'Access restricted',
    message: "You don't have permission to perform this action or view this resource.",
    isError: true,
    recoverable: true,
    defaultAction: {
      type: RecoveryActionType.GO_BACK,
      label: 'Go back',
    },
  },
  [UserFacingStateEnum.NOT_FOUND]: {
    title: "We couldn't find that page",
    message: 'The resource you requested may have moved, been deleted, or never existed.',
    isError: true,
    recoverable: true,
    defaultAction: {
      type: RecoveryActionType.NAVIGATE,
      label: 'Go to Dashboard',
      href: '/dashboard',
    },
  },
  [UserFacingStateEnum.CONFLICT]: {
    title: 'Update conflict detected',
    message: 'The information on your screen was updated elsewhere. Please choose how to proceed.',
    isError: true,
    recoverable: true,
    defaultAction: {
      type: RecoveryActionType.RETRY,
      label: 'Review changes',
    },
  },
  [UserFacingStateEnum.NETWORK_FAILURE]: {
    title: "We couldn't connect to the server",
    message: 'Please check your internet connection and try again.',
    isError: true,
    recoverable: true,
    defaultAction: {
      type: RecoveryActionType.RETRY,
      label: 'Try again',
    },
  },
  [UserFacingStateEnum.SERVER_FAILURE]: {
    title: "We couldn't complete your request",
    message: "Your information hasn't been lost. Please try again in a few moments.",
    isError: true,
    recoverable: true,
    defaultAction: {
      type: RecoveryActionType.RETRY,
      label: 'Try again',
    },
  },
  [UserFacingStateEnum.AI_FAILURE]: {
    title: 'AI assistant temporarily unavailable',
    message: 'The AI assistant is temporarily unavailable. The core portal continues working normally.',
    isError: true,
    recoverable: true,
    defaultAction: {
      type: RecoveryActionType.CONTINUE_WITHOUT_AI,
      label: 'Continue without AI',
    },
  },
  [UserFacingStateEnum.RETRYABLE_FAILURE]: {
    title: 'This is taking longer than expected',
    message: 'The service is temporarily busy. Your progress is safe.',
    isError: true,
    recoverable: true,
    defaultAction: {
      type: RecoveryActionType.RETRY,
      label: 'Retry now',
    },
  },
};
