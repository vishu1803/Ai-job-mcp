/**
 * @file Connector Error Taxonomy
 *
 * Defines machine-readable, normalized error classes for third-party connector operations.
 * Subclasses standard AppError hierarchy with retryability and provider resilience metadata.
 */

import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  DependencyError,
} from '../../errors/index.js';

/**
 * Thrown when a resource connection record does not exist in the requested tenant.
 */
export class ConnectionNotFoundError extends NotFoundError {
  /**
   * @param {string} [connectionId] - Target connection ID
   * @param {string} [tenantId] - Target tenant ID
   */
  constructor(connectionId, tenantId) {
    super(
      `Resource connection ${connectionId || ''} not found in tenant ${tenantId || ''}`.trim(),
      { connectionId, tenantId, retryable: false }
    );
    this.code = 'CONNECTION_NOT_FOUND';
    this.retryable = false;
  }
}

/**
 * Thrown when a resource connection is in an inactive lifecycle state (e.g. DISCONNECTED, REVOKED).
 */
export class ConnectionInactiveError extends AuthorizationError {
  /**
   * @param {string} connectionId
   * @param {string} status - Current connection status (e.g. 'DISCONNECTED', 'REVOKED')
   */
  constructor(connectionId, status) {
    super(
      `Resource connection ${connectionId} is inactive (status: ${status})`,
      'CONNECTION_INACTIVE',
      { connectionId, status, retryable: false }
    );
    this.code = 'CONNECTION_INACTIVE';
    this.retryable = false;
  }
}

/**
 * Thrown when upstream provider authentication fails (e.g. invalid/expired access token or revoked app).
 */
export class ConnectorAuthError extends AuthenticationError {
  /**
   * @param {string} provider - Resource provider identifier
   * @param {string} [message] - Safe error message
   * @param {Record<string, unknown>} [details] - Safe structured details (NO tokens/secrets)
   */
  constructor(provider, message = 'Provider authentication failed', details = {}) {
    super(`${provider}: ${message}`, 'CONNECTOR_AUTH_FAILED', {
      provider,
      ...details,
      retryable: false,
      requiresReauth: true,
    });
    this.code = 'CONNECTOR_AUTH_FAILED';
    this.retryable = false;
    this.requiresReauth = true;
  }
}

/**
 * Thrown when a connection lacks the required permission scopes for the requested operation.
 */
export class InsufficientScopeError extends AuthorizationError {
  /**
   * @param {string} provider
   * @param {string[]} requiredScopes
   * @param {string[]} grantedScopes
   */
  constructor(provider, requiredScopes = [], grantedScopes = []) {
    super(
      `Connection lacks required scopes for ${provider}. Required: [${requiredScopes.join(', ')}], Granted: [${grantedScopes.join(', ')}]`,
      'INSUFFICIENT_SCOPE',
      { provider, requiredScopes, grantedScopes, retryable: false }
    );
    this.code = 'INSUFFICIENT_SCOPE';
    this.retryable = false;
  }
}

/**
 * Thrown when an external provider rate limits the request (HTTP 429).
 */
export class ProviderRateLimitError extends RateLimitError {
  /**
   * @param {string} provider - Resource provider identifier
   * @param {number} [retryAfterSeconds=60] - Seconds before retry is permitted
   * @param {number} [resetTimestamp] - Epoch timestamp (seconds) when rate limit resets
   */
  constructor(provider, retryAfterSeconds = 60, resetTimestamp = undefined) {
    const safeRetryAfter = Math.max(1, Math.floor(Number(retryAfterSeconds) || 60));
    super(`Rate limit exceeded for provider ${provider}. Retry after ${safeRetryAfter}s`, {
      provider,
      retryAfter: safeRetryAfter,
      resetAt: resetTimestamp ? new Date(resetTimestamp * 1000).toISOString() : undefined,
      retryable: true,
    });
    this.code = 'PROVIDER_RATE_LIMITED';
    this.provider = provider;
    this.retryAfter = safeRetryAfter;
    this.retryable = true;
  }
}

/**
 * Thrown when an external provider API is temporarily unreachable, timed out, or returning 5xx.
 */
export class ProviderUnavailableError extends DependencyError {
  /**
   * @param {string} provider - Resource provider identifier
   * @param {string} [message='Provider service is temporarily unavailable']
   * @param {boolean} [retryable=true] - Whether safe idempotent reads may be retried
   */
  constructor(provider, message = 'Provider service is temporarily unavailable', retryable = true) {
    super(`${provider}: ${message}`, {
      provider,
      retryable,
    });
    this.code = 'PROVIDER_UNAVAILABLE';
    this.provider = provider;
    this.retryable = retryable;
  }
}

/**
 * Thrown when a specific resource (repository, file, document) cannot be found on the provider.
 */
export class ResourceNotFoundError extends NotFoundError {
  /**
   * @param {string} provider
   * @param {string} resourceId
   */
  constructor(provider, resourceId) {
    super(`Resource ${resourceId} not found on provider ${provider}`, {
      provider,
      resourceId,
      retryable: false,
    });
    this.code = 'RESOURCE_NOT_FOUND';
    this.retryable = false;
  }
}

/**
 * Thrown when invoking an operation that is unsupported by the provider's declared capabilities.
 */
export class UnsupportedCapabilityError extends ValidationError {
  /**
   * @param {string} provider
   * @param {string} capability
   */
  constructor(provider, capability) {
    super(`Provider ${provider} does not support capability '${capability}'`, {
      provider,
      capability,
      retryable: false,
    });
    this.code = 'UNSUPPORTED_CAPABILITY';
    this.retryable = false;
  }
}
