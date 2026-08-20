/**
 * @file Centralized Application Error Hierarchy
 *
 * Defines machine-readable, predictable error classes with HTTP status mappings.
 * Strict adherence to docs/architecture.md and .github/instructions/backend.instructions.md.
 */

/**
 * Base Application Error class.
 */
export class AppError extends Error {
  /**
   * @param {string} message Human-readable safe error message
   * @param {number} [statusCode=500] HTTP status code
   * @param {string} [code='INTERNAL_ERROR'] Machine-readable error code
   * @param {any} [details=null] Optional structured context / validation errors
   * @param {boolean} [isOperational=true] True if operational/expected error
   */
  constructor(
    message,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    details = null,
    isOperational = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 Bad Request / Validation Failure Error.
 */
export class ValidationError extends AppError {
  /**
   * @param {string} [message='Validation failed']
   * @param {any} [details=null] Structured field error details
   */
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * 401 Unauthorized / Authentication Error.
 */
export class AuthenticationError extends AppError {
  /**
   * @param {string} [message='Authentication required']
   * @param {string} [code='AUTHENTICATION_ERROR'] Machine-readable error code
   * @param {any} [details=null] Structured error details
   */
  constructor(message = 'Authentication required', code = 'AUTHENTICATION_ERROR', details = null) {
    super(message, 401, code, details);
  }
}

/**
 * 403 Forbidden / Authorization Error.
 */
export class AuthorizationError extends AppError {
  /**
   * @param {string} [message='Access denied']
   * @param {string} [code='AUTHORIZATION_ERROR'] Machine-readable error code
   * @param {any} [details=null] Structured error details
   */
  constructor(message = 'Access denied', code = 'AUTHORIZATION_ERROR', details = null) {
    super(message, 403, code, details);
  }
}

/**
 * 404 Not Found Error.
 */
export class NotFoundError extends AppError {
  /**
   * @param {string} [message='Requested resource not found']
   * @param {any} [details=null]
   */
  constructor(message = 'Requested resource not found', details = null) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

/**
 * 409 Conflict Error.
 */
export class ConflictError extends AppError {
  /**
   * @param {string} [message='Resource conflict occurred']
   * @param {any} [details=null]
   */
  constructor(message = 'Resource conflict occurred', details = null) {
    super(message, 409, 'CONFLICT', details);
  }
}

/**
 * 429 Too Many Requests / Rate Limit Error (Placeholder for Phase 14).
 */
export class RateLimitError extends AppError {
  /**
   * @param {string} [message='Rate limit exceeded. Please try again later.']
   * @param {any} [details=null]
   */
  constructor(message = 'Rate limit exceeded. Please try again later.', details = null) {
    super(message, 429, 'RATE_LIMITED', details);
  }
}

/**
 * 503 Service Unavailable / Dependency Error.
 */
export class DependencyError extends AppError {
  /**
   * @param {string} [message='Required dependency or service unavailable']
   * @param {any} [details=null]
   */
  constructor(message = 'Required dependency or service unavailable', details = null) {
    super(message, 503, 'DEPENDENCY_ERROR', details);
  }
}

/**
 * 500 Internal Server Error.
 */
export class InternalServerError extends AppError {
  /**
   * @param {string} [message='An unexpected internal server error occurred']
   * @param {any} [details=null]
   */
  constructor(message = 'An unexpected internal server error occurred', details = null) {
    super(message, 500, 'INTERNAL_ERROR', details);
  }
}

/**
 * 500 Cryptographic / Encryption Error.
 */
export class CryptoError extends AppError {
  /**
   * @param {string} [message='Cryptographic operation failed']
   * @param {string} [code='CRYPTO_ERROR'] Machine-readable error code
   * @param {any} [details=null] Safe structured metadata
   */
  constructor(message = 'Cryptographic operation failed', code = 'CRYPTO_ERROR', details = null) {
    super(message, 500, code, details);
  }
}
