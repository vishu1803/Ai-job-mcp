/**
 * @file Base Resource Connector Abstraction
 *
 * Defines the abstract base class for all third-party resource connectors.
 * Implements capability validation, transient credential boundaries, and standard error handling.
 */

import { CONNECTOR_CAPABILITIES } from './capabilities.js';
import { UnsupportedCapabilityError } from '../errors/connector-errors.js';

/**
 * @abstract
 * Base class for third-party resource connectors.
 */
export class BaseResourceConnector {
  /**
   * @param {string} provider - Resource provider enum identifier
   */
  constructor(provider) {
    if (new.target === BaseResourceConnector) {
      throw new TypeError('Cannot construct BaseResourceConnector instances directly');
    }
    if (!provider || typeof provider !== 'string') {
      throw new TypeError('Connector provider must be a non-empty string');
    }
    this.provider = provider;
  }

  /**
   * Returns the set of capability flags supported by this connector.
   * @abstract
   * @returns {ReadonlySet<string>}
   */
  getCapabilities() {
    throw new Error('getCapabilities() must be implemented by subclass');
  }

  /**
   * Asserts that this connector supports the specified capability flag.
   * @param {string} capability - One of CONNECTOR_CAPABILITIES
   * @throws {UnsupportedCapabilityError} If capability is not supported
   */
  assertCapability(capability) {
    const caps = this.getCapabilities();
    if (!caps || !caps.has(capability)) {
      throw new UnsupportedCapabilityError(this.provider, capability);
    }
  }

  // -------------------------------------------------------------------------
  // 1. Mandatory Core Operations (Must be implemented by every connector)
  // -------------------------------------------------------------------------

  /**
   * Validates health and active authorization of a connection against the provider.
   * @abstract
   * @param {import('./context.js').ConnectorContext} _context - Trusted execution context
   * @param {Record<string, unknown>} _credentials - Decrypted credential bundle
   * @returns {Promise<{healthy: boolean, message?: string}>}
   */
  async validate(_context, _credentials) {
    throw new Error(`validate() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Retrieves normalized profile/account metadata from the provider.
   * @abstract
   * @param {import('./context.js').ConnectorContext} _context - Trusted execution context
   * @param {Record<string, unknown>} _credentials - Decrypted credential bundle
   * @returns {Promise<import('./models.js').NormalizedAccount>}
   */
  async getAccount(_context, _credentials) {
    throw new Error(`getAccount() must be implemented by ${this.constructor.name}`);
  }

  // -------------------------------------------------------------------------
  // 2. Capability-Guarded Operations (Throw UnsupportedCapabilityError if not overridden)
  // -------------------------------------------------------------------------

  /**
   * Lists available resources (repositories, files, documents) with cursor pagination.
   * Guarded by: CONNECTOR_CAPABILITIES.LIST_RESOURCES
   *
   * @param {import('./context.js').ConnectorContext} _context
   * @param {Record<string, unknown>} _credentials
   * @param {import('./models.js').PaginationOptions} [_options]
   * @returns {Promise<import('./models.js').PaginatedResult<import('./models.js').NormalizedResource>>}
   */
  async listResources(_context, _credentials, _options = {}) {
    this.assertCapability(CONNECTOR_CAPABILITIES.LIST_RESOURCES);
    throw new Error(
      `listResources() declared capability but not implemented by ${this.constructor.name}`
    );
  }

  /**
   * Fetches a single normalized resource by external identifier.
   * Guarded by: CONNECTOR_CAPABILITIES.READ_RESOURCE
   *
   * @param {import('./context.js').ConnectorContext} _context
   * @param {Record<string, unknown>} _credentials
   * @param {string} _externalResourceId
   * @returns {Promise<import('./models.js').NormalizedResource>}
   */
  async getResource(_context, _credentials, _externalResourceId) {
    this.assertCapability(CONNECTOR_CAPABILITIES.READ_RESOURCE);
    throw new Error(
      `getResource() declared capability but not implemented by ${this.constructor.name}`
    );
  }

  /**
   * Performs proactive credential refresh (e.g. OAuth2 token refresh or App JWT renewal).
   * Guarded by: CONNECTOR_CAPABILITIES.REFRESH_CREDENTIAL
   *
   * @param {import('./context.js').ConnectorContext} _context
   * @param {Record<string, unknown>} _credentials
   * @returns {Promise<{credentials: Record<string, unknown>, expiresAt?: Date}>}
   */
  async refreshCredentials(_context, _credentials) {
    this.assertCapability(CONNECTOR_CAPABILITIES.REFRESH_CREDENTIAL);
    throw new Error(
      `refreshCredentials() declared capability but not implemented by ${this.constructor.name}`
    );
  }

  /**
   * Revokes access on the upstream provider side.
   * Guarded by: CONNECTOR_CAPABILITIES.REVOKE_ACCESS
   *
   * @param {import('./context.js').ConnectorContext} _context
   * @param {Record<string, unknown>} _credentials
   * @returns {Promise<void>}
   */
  async revokeAccess(_context, _credentials) {
    this.assertCapability(CONNECTOR_CAPABILITIES.REVOKE_ACCESS);
    throw new Error(
      `revokeAccess() declared capability but not implemented by ${this.constructor.name}`
    );
  }
}
