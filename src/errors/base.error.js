/**
 * @file Base Application Error Class
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

export default AppError;
