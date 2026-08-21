import { ConnectorAuthError, ProviderUnavailableError } from '../errors/connector-errors.js';
import { AppError, NotFoundError, RateLimitError } from '../../errors/index.js';

export class GitHubAuthError extends ConnectorAuthError {
  /**
   * @param {string} message - Error description
   * @param {string} [code='GITHUB_AUTH_FAILED'] - Specific code
   */
  constructor(message = 'GitHub authentication failed', code = 'GITHUB_AUTH_FAILED') {
    super('GITHUB_APP', message, { code });
    this.name = 'GitHubAuthError';
  }
}

export class GitHubInstallationNotFoundError extends NotFoundError {
  /**
   * @param {string|number} [installationId='unknown']
   */
  constructor(installationId = 'unknown') {
    super(`GitHub App installation ${installationId} was not found or has been uninstalled`, {
      installationId: String(installationId),
      requiresReauth: true,
    });
    this.name = 'GitHubInstallationNotFoundError';
    this.code = 'INSTALLATION_NOT_FOUND';
  }
}

export class GitHubRateLimitError extends RateLimitError {
  /**
   * @param {string} message
   * @param {object} [details]
   * @param {number} [details.limit]
   * @param {number} [details.remaining]
   * @param {Date|number} [details.resetAt]
   */
  constructor(message = 'GitHub API rate limit exceeded', details = {}) {
    super(message, 'GITHUB_RATE_LIMITED', details);
    this.name = 'GitHubRateLimitError';
    this.provider = 'GITHUB_APP';
    this.limit = details.limit;
    this.remaining = details.remaining;
    this.resetAt = details.resetAt;
  }
}

export class GitHubApiError extends AppError {
  /**
   * @param {string} message
   * @param {string} [code='GITHUB_API_ERROR']
   * @param {number} [statusCode=500]
   * @param {boolean} [retryable=false]
   * @param {object} [details={}]
   */
  constructor(
    message = 'GitHub API error',
    code = 'GITHUB_API_ERROR',
    statusCode = 500,
    retryable = false,
    details = {}
  ) {
    super(message, statusCode, code, { ...details, retryable });
    this.name = 'GitHubApiError';
    this.provider = 'GITHUB_APP';
    this.retryable = retryable;
  }
}

/**
 * Parses upstream GitHub API response headers and error payload safely.
 *
 * @param {number} statusCode - HTTP status code
 * @param {any} body - Parsed JSON or raw text body from GitHub
 * @param {Headers|Record<string, string>} [headers={}] - Response headers
 * @returns {Error} Standardized domain error instance
 */
export function parseGitHubErrorResponse(statusCode, body = {}, headers = {}) {
  const getHeader = (name) => {
    if (!headers) return null;
    if (typeof headers.get === 'function') {
      return headers.get(name);
    }
    return headers[name.toLowerCase()] || headers[name] || null;
  };

  const message =
    (typeof body === 'object' && body !== null && body.message) ||
    (typeof body === 'string' && body.trim().length > 0
      ? body.trim()
      : `GitHub API error (${statusCode})`);

  // Rate limit response headers
  const rateLimitHeader = getHeader('x-ratelimit-limit');
  const rateRemainingHeader = getHeader('x-ratelimit-remaining');
  const rateResetHeader = getHeader('x-ratelimit-reset');
  const retryAfterHeader = getHeader('retry-after');

  const rateDetails = {
    limit: rateLimitHeader ? parseInt(rateLimitHeader, 10) : undefined,
    remaining: rateRemainingHeader ? parseInt(rateRemainingHeader, 10) : undefined,
    resetAt: rateResetHeader ? new Date(parseInt(rateResetHeader, 10) * 1000) : undefined,
    retryAfterSeconds: retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined,
  };

  // 1. Authentication Failure (401)
  if (statusCode === 401) {
    return new GitHubAuthError(message, 'GITHUB_AUTH_FAILED');
  }

  // 2. Rate Limit Exceeded (403 with rate limit header or 429)
  const isRateLimited =
    statusCode === 429 ||
    (statusCode === 403 &&
      (rateRemainingHeader === '0' ||
        message.toLowerCase().includes('rate limit') ||
        message.toLowerCase().includes('secondary rate')));

  if (isRateLimited) {
    return new GitHubRateLimitError(message, rateDetails);
  }

  // 3. Forbidden / Permissions Issue (403 standard)
  if (statusCode === 403) {
    return new GitHubApiError(message, 'GITHUB_FORBIDDEN', 403, false, {
      requiresPermissionSync: true,
    });
  }

  // 4. Resource Not Found / Installation Uninstalled (404)
  if (statusCode === 404) {
    if (message.toLowerCase().includes('installation')) {
      return new GitHubInstallationNotFoundError();
    }
    return new GitHubApiError(message, 'GITHUB_RESOURCE_NOT_FOUND', 404, false);
  }

  // 5. Upstream Service Unavailable / Gateway Errors (5xx)
  if (statusCode >= 500) {
    return new ProviderUnavailableError('GITHUB_APP', message);
  }

  // 6. Generic API Error
  return new GitHubApiError(message, 'GITHUB_API_ERROR', statusCode, false);
}
