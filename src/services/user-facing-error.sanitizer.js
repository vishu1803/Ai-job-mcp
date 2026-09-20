/**
 * @file User-Facing Error Sanitizer & State Formatter
 *
 * Translates low-level operational, database, validation, AI, and framework
 * errors into human-centered, accessible, and recoverable presentation models.
 *
 * Hard Invariant: NEVER leak stack traces, database schema, SQL queries,
 * Zod internals, HTTP codes, class names, or raw system exceptions to end users.
 */

import {
  UserFacingStateEnum,
  RecoveryActionType,
  USER_FACING_STATE_DEFAULTS,
} from '../domain/ui/user-facing-states.js';
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DependencyError,
} from '../errors/index.js';

// Technical patterns that must be completely scrubbed if detected in raw inputs
const TECHNICAL_LEAK_PATTERNS = [
  /\bat\s+.*:\d+:\d+/i, // Stack traces e.g. at Object.<anonymous> (/var/app/src/index.js:42:15)
  /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|TABLE|COLUMN|CONSTRAINT)\b/i, // SQL syntax
  /relation\s+["']?[\w_]+["']?\s+does\s+not\s+exist/i, // DB table errors
  /duplicate\s+key\s+value\s+violates/i, // DB unique constraint
  /violates\s+foreign\s+key\s+constraint/i, // DB foreign key
  /null\s+value\s+in\s+column/i, // DB not null constraint
  /invalid_type|unrecognized_keys|too_small|too_big|invalid_enum_value/i, // Zod codes
  /FastifyError|DrizzleError|PostgresError|PgError|AppError|ZodError/i, // Class names
  /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i, // OS/Node socket errors
  /HTTP\s+\d{3}|\bstatus\s+code\s+\d{3}\b/i, // HTTP protocol codes
  /\b(GET|POST|PUT|PATCH|DELETE)\s+\/[\w\/\.-]+/i, // Internal API routes
];

/**
 * Checks if a string contains internal technical leaks.
 * @param {string} str
 * @returns {boolean}
 */
export function containsTechnicalLeak(str) {
  if (!str || typeof str !== 'string') return false;
  return TECHNICAL_LEAK_PATTERNS.some((pattern) => pattern.test(str));
}

/**
 * Human-friendly field names mapping.
 */
const FIELD_LABEL_MAP = {
  email: 'Email address',
  canonicalEmail: 'Email address',
  phone: 'Phone number',
  contactPhone: 'Phone number',
  countryCode: 'Country calling code',
  contactCountryCode: 'Country calling code',
  displayName: 'Full name',
  name: 'Name',
  headline: 'Professional headline',
  summary: 'Executive summary',
  location: 'Current location',
  targetRoleTitles: 'Target job titles',
  preferredLocations: 'Preferred locations',
  salaryFloor: 'Minimum salary',
  targetSalary: 'Target salary',
  salaryCurrency: 'Currency',
  visaSponsorshipRequired: 'Visa sponsorship preference',
  workAuthStatus: 'Work authorization status',
  noticePeriod: 'Notice period',
  customNoticePeriod: 'Custom notice period duration',
  companyName: 'Company name',
  jobTitle: 'Job title',
  jobDescriptionText: 'Job description text',
  status: 'Application status',
  resumeFile: 'Resume document',
};

/**
 * Converts a raw field identifier to a human-readable label.
 * @param {string} field
 * @returns {string}
 */
export function formatFieldLabel(field) {
  if (!field) return 'Field';
  // Strip array indices or path prefixes: e.g. "metadata.answers.noticePeriod" -> "noticePeriod"
  const cleanField =
    field
      .replace(/\[\d+\]/g, '')
      .split('.')
      .pop() || field;
  if (FIELD_LABEL_MAP[cleanField]) {
    return FIELD_LABEL_MAP[cleanField];
  }
  // Convert camelCase or snake_case to Title Case
  return cleanField
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .trim()
    .replace(/^./, (str) => str.toUpperCase());
}

/**
 * Translates a validation issue into a warm, natural human message.
 * @param {string} field
 * @param {string} rawMsg
 * @returns {string}
 */
export function humanizeValidationMessage(field, rawMsg = '') {
  const label = formatFieldLabel(field);
  const msgLower = (rawMsg || '').toLowerCase();

  if (containsTechnicalLeak(rawMsg)) {
    return `Please check the ${label.toLowerCase()} format.`;
  }

  if (
    msgLower.includes('required') ||
    msgLower.includes('missing') ||
    msgLower.includes('expected string, received undefined')
  ) {
    return `${label} is required.`;
  }
  if (msgLower.includes('email') || msgLower.includes('invalid email')) {
    return `Please enter a valid email address (e.g. name@example.com).`;
  }
  if (msgLower.includes('phone') || msgLower.includes('country code')) {
    return `Please enter a valid phone number with your country calling code.`;
  }
  if (msgLower.includes('notice period')) {
    return `Please select your notice period so employers know your availability.`;
  }
  if (
    msgLower.includes('positive') ||
    msgLower.includes('negative') ||
    msgLower.includes('greater than')
  ) {
    return `${label} must be a positive number.`;
  }
  if (msgLower.includes('too short') || msgLower.includes('minimum')) {
    return `${label} is too short. Please provide a little more detail.`;
  }
  if (msgLower.includes('too long') || msgLower.includes('maximum')) {
    return `${label} exceeds the maximum length.`;
  }

  // If already clean and friendly, return it without internal details
  if (rawMsg && !containsTechnicalLeak(rawMsg) && rawMsg.length < 120) {
    return rawMsg;
  }

  return `Please provide a valid ${label.toLowerCase()}.`;
}

/**
 * Checks if an error is specifically an AI/LLM failure.
 * @param {any} error
 * @returns {boolean}
 */
function isAiError(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const code = (error.code || '').toLowerCase();
  return (
    code.includes('gemini') ||
    code.includes('vertex') ||
    code.includes('llm') ||
    code.startsWith('ai_') ||
    code.endsWith('_ai') ||
    code.includes('_ai_') ||
    code.includes('model_') ||
    /\b(ai|model)\b/i.test(code) ||
    msg.includes('gemini') ||
    msg.includes('google genai') ||
    msg.includes('vertex') ||
    msg.includes('anthropic') ||
    msg.includes('openai') ||
    msg.includes('rate limit exceeded on model') ||
    msg.includes('model is overloaded') ||
    msg.includes('resource exhausted') ||
    msg.includes('quota')
  );
}

/**
 * Checks if an error is a network or connectivity failure.
 * @param {any} error
 * @returns {boolean}
 */
function isNetworkError(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const code = (error.code || '').toLowerCase();
  return (
    code === 'econnrefused' ||
    code === 'enotfound' ||
    code === 'enetunreach' ||
    code === 'fetch_failed' ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('etimedout') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('connection refused') ||
    msg.includes('internet') ||
    msg.includes('dns lookup')
  );
}

/**
 * Sanitizes any system error into a structured User-Facing State Model.
 *
 * @param {Error|any} error The caught error
 * @param {object} [context={}] Contextual clues
 * @param {string} [context.action] Operation being performed ('save_profile', 'submit_application', 'generate_resume')
 * @param {string} [context.requestId] Request ID or support trace ID
 * @param {string} [context.referer] Referrer URL for recovery navigation
 * @returns {object} Safe user-facing state representation
 */
export function sanitizeUserFacingError(error, context = {}) {
  const requestId = context.requestId || error?.requestId || error?.details?.requestId || null;
  const action = context.action || '';
  const referer = context.referer || '/';

  // 1. Check for AI Failure (highest priority domain degradation)
  if (isAiError(error)) {
    return {
      state: UserFacingStateEnum.AI_FAILURE,
      statusCode: 503,
      title: 'AI assistant is temporarily unavailable',
      message:
        'The AI copilot is temporarily busy or undergoing scheduled maintenance. The core portal remains fully functional — your profile, tracked applications, and manual editing are unaffected.',
      supportId: requestId,
      recoveryAction: {
        type: RecoveryActionType.CONTINUE_WITHOUT_AI,
        label: 'Continue without AI',
        href: referer,
      },
      fieldErrors: [],
      isAiFailure: true,
      isRecoverable: true,
    };
  }

  // 2. Check for Network / Connectivity Failure
  if (isNetworkError(error)) {
    return {
      state: UserFacingStateEnum.NETWORK_FAILURE,
      statusCode: 503,
      title: "We couldn't connect to the server",
      message:
        'Please check your internet connection. We will automatically try again when you are back online.',
      supportId: requestId,
      recoveryAction: {
        type: RecoveryActionType.RETRY,
        label: 'Try again',
      },
      fieldErrors: [],
      isAiFailure: false,
      isRecoverable: true,
    };
  }

  // 3. Validation Errors (400)
  const isValidation =
    error instanceof ValidationError ||
    error?.statusCode === 400 ||
    error?.code === 'VALIDATION_ERROR' ||
    Boolean(error?.validation) ||
    Boolean(error?.issues);

  if (isValidation) {
    const rawDetails = error?.details || error?.validation || error?.issues || [];
    const fieldErrors = [];

    if (Array.isArray(rawDetails)) {
      for (const item of rawDetails) {
        const fieldName =
          item.field || item.path?.[0] || item.instancePath || item.params?.missingProperty || '';
        const rawMessage = item.message || '';
        fieldErrors.push({
          field: fieldName.replace(/^\//, '').replace(/\./g, '_'),
          label: formatFieldLabel(fieldName),
          message: humanizeValidationMessage(fieldName, rawMessage),
        });
      }
    } else if (typeof rawDetails === 'object' && rawDetails !== null) {
      for (const [k, v] of Object.entries(rawDetails)) {
        fieldErrors.push({
          field: k,
          label: formatFieldLabel(k),
          message: humanizeValidationMessage(
            k,
            typeof v === 'string' ? v : String(v?.message || 'Check this field')
          ),
        });
      }
    }

    // Default message tailored by action if available
    let actionTitle = 'Please check your information';
    if (action === 'save_profile') {
      actionTitle = "We couldn't save your profile";
    } else if (action === 'submit_application') {
      actionTitle = 'Application needs your review';
    }

    const fieldCount = fieldErrors.length;
    const summaryMsg =
      fieldCount > 1
        ? `There are ${fieldCount} items that need your attention before we can continue.`
        : fieldCount === 1
          ? fieldErrors[0].message
          : 'Please check the highlighted fields and try again.';

    return {
      state: UserFacingStateEnum.VALIDATION_ERROR,
      statusCode: 400,
      title: actionTitle,
      message: summaryMsg,
      supportId: requestId,
      recoveryAction: {
        type: RecoveryActionType.RETRY,
        label: 'Review fields',
      },
      fieldErrors,
      isAiFailure: false,
      isRecoverable: true,
    };
  }

  // 4. Authentication Error (401)
  if (
    error instanceof AuthenticationError ||
    error?.statusCode === 401 ||
    error?.code === 'AUTHENTICATION_REQUIRED'
  ) {
    return {
      state: UserFacingStateEnum.AUTHENTICATION_ERROR,
      statusCode: 401,
      title: 'Session expired',
      message:
        'Your session has timed out or you are not signed in. Please sign in to securely continue your work.',
      supportId: requestId,
      recoveryAction: {
        type: RecoveryActionType.SIGN_IN,
        label: 'Sign in',
        href: `/login${referer && referer !== '/' ? `?returnTo=${encodeURIComponent(referer)}` : ''}`,
      },
      fieldErrors: [],
      isAiFailure: false,
      isRecoverable: true,
    };
  }

  // 5. Authorization Error (403)
  if (
    error instanceof AuthorizationError ||
    error?.statusCode === 403 ||
    error?.code === 'FORBIDDEN'
  ) {
    return {
      state: UserFacingStateEnum.AUTHORIZATION_ERROR,
      statusCode: 403,
      title: 'Access restricted',
      message:
        "You don't have permission to view this resource or perform this action with your current role.",
      supportId: requestId,
      recoveryAction: {
        type: RecoveryActionType.GO_BACK,
        label: 'Go back',
        href: referer,
      },
      fieldErrors: [],
      isAiFailure: false,
      isRecoverable: true,
    };
  }

  // 6. Not Found Error (404)
  if (error instanceof NotFoundError || error?.statusCode === 404 || error?.code === 'NOT_FOUND') {
    return {
      state: UserFacingStateEnum.NOT_FOUND,
      statusCode: 404,
      title: "We couldn't find that page",
      message: 'The page or resource you requested may have moved, been deleted, or never existed.',
      supportId: requestId,
      recoveryAction: {
        type: RecoveryActionType.NAVIGATE,
        label: 'Go to Dashboard',
        href: '/dashboard',
      },
      fieldErrors: [],
      isAiFailure: false,
      isRecoverable: true,
    };
  }

  // 7. Conflict Error (409)
  if (error instanceof ConflictError || error?.statusCode === 409 || error?.code === 'CONFLICT') {
    return {
      state: UserFacingStateEnum.CONFLICT,
      statusCode: 409,
      title: 'Update conflict detected',
      message:
        'The information on your screen was modified in another session. Please review your updates.',
      supportId: requestId,
      recoveryAction: {
        type: RecoveryActionType.RETRY,
        label: 'Review conflicts',
      },
      fieldErrors: [],
      isAiFailure: false,
      isRecoverable: true,
    };
  }

  // 8. Rate Limit / Transient Retryable Failure (429)
  if (
    error instanceof RateLimitError ||
    error?.statusCode === 429 ||
    error?.code === 'RATE_LIMITED'
  ) {
    return {
      state: UserFacingStateEnum.RETRYABLE_FAILURE,
      statusCode: 429,
      title: 'Too many requests',
      message:
        'You have performed several actions in a short time. Please pause for a moment and try again.',
      supportId: requestId,
      recoveryAction: {
        type: RecoveryActionType.RETRY,
        label: 'Try again',
      },
      fieldErrors: [],
      isAiFailure: false,
      isRecoverable: true,
    };
  }

  // 9. Dependency / Upstream Provider Unavailable Error (503)
  if (
    error instanceof DependencyError ||
    error?.statusCode === 503 ||
    error?.code === 'DEPENDENCY_ERROR' ||
    error?.code === 'PROVIDER_UNAVAILABLE'
  ) {
    return {
      state: UserFacingStateEnum.NETWORK_FAILURE,
      statusCode: 503,
      title: 'Service temporarily unavailable',
      message:
        error?.message && !containsTechnicalLeak(error.message)
          ? error.message
          : 'An upstream service or dependency is temporarily unavailable. Please try again shortly.',
      supportId: requestId,
      recoveryAction: {
        type: RecoveryActionType.RETRY,
        label: 'Try again',
      },
      fieldErrors: [],
      isAiFailure: false,
      isRecoverable: true,
    };
  }

  // 10. Generic Server Failure (500) - With explicit reassurance that data was not lost
  let actionFailureTitle = "We couldn't complete your request";
  if (action === 'save_profile') {
    actionFailureTitle = "We couldn't save your profile";
  } else if (action === 'submit_application') {
    actionFailureTitle = "We couldn't submit your application";
  } else if (action === 'generate_resume') {
    actionFailureTitle = "We couldn't generate your resume";
  }

  return {
    state: UserFacingStateEnum.SERVER_FAILURE,
    statusCode: 500,
    title: actionFailureTitle,
    message: "Your information hasn't been lost. Please try again in a few moments.",
    supportId: requestId,
    recoveryAction: {
      type: RecoveryActionType.RETRY,
      label: 'Try again',
      href: referer,
    },
    fieldErrors: [],
    isAiFailure: false,
    isRecoverable: true,
  };
}

/**
 * Sanitizes a raw error message string so it can be safely displayed in flash messages or URL parameters.
 * Strips any technical patterns and replaces with human text.
 *
 * @param {string|null} rawMsg
 * @returns {string} Safe human-readable text
 */
export function sanitizeErrorMessage(rawMsg) {
  if (!rawMsg || typeof rawMsg !== 'string') return '';
  const trimmed = rawMsg.trim();
  if (containsTechnicalLeak(trimmed)) {
    return "We couldn't complete your request. Please try again.";
  }
  // Remove "Validation error: " prefix if present
  const cleaned = trimmed.replace(/^Validation error:\s*/i, '');
  if (cleaned.length > 200) {
    return cleaned.slice(0, 197) + '…';
  }
  return cleaned;
}
