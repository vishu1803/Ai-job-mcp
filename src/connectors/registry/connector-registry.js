/**
 * @file Connector Registry
 *
 * Centralized registry responsible for provider-to-connector resolution,
 * capability introspection, and preventing duplicate adapter registration.
 */

import { BaseResourceConnector } from '../base/resource-connector.js';
import { ValidationError, ConflictError } from '../../errors/index.js';
import { resourceProviderEnum } from '../../db/schema.js';

export class ConnectorRegistry {
  constructor() {
    /** @type {Map<string, BaseResourceConnector>} */
    this.connectors = new Map();
  }

  /**
   * Registers a connector instance for a specific provider.
   *
   * @param {string} provider - Resource provider enum value
   * @param {BaseResourceConnector} connector - Connector instance extending BaseResourceConnector
   * @param {Object} [options]
   * @param {boolean} [options.allowOverride=false] - If true, permits overwriting existing registration
   */
  register(provider, connector, options = {}) {
    if (!provider || typeof provider !== 'string') {
      throw new ValidationError('Provider identifier must be a non-empty string');
    }

    if (!resourceProviderEnum.enumValues.includes(provider)) {
      throw new ValidationError(
        `Invalid provider '${provider}'. Must be one of: ${resourceProviderEnum.enumValues.join(', ')}`
      );
    }

    if (!(connector instanceof BaseResourceConnector)) {
      throw new TypeError(
        `Connector for provider '${provider}' must be an instance of BaseResourceConnector`
      );
    }

    if (this.connectors.has(provider) && !options.allowOverride) {
      throw new ConflictError(
        `Connector for provider '${provider}' is already registered in registry`
      );
    }

    this.connectors.set(provider, connector);
  }

  /**
   * Resolves the connector registered for the specified provider.
   *
   * @param {string} provider - Resource provider enum value
   * @returns {BaseResourceConnector}
   * @throws {ValidationError} If provider is not registered
   */
  get(provider) {
    const connector = this.connectors.get(provider);
    if (!connector) {
      throw new ValidationError(
        `No connector registered for resource provider '${provider}'. Supported: [${this.getSupportedProviders().join(', ')}]`
      );
    }
    return connector;
  }

  /**
   * Checks if a connector is registered for the specified provider.
   *
   * @param {string} provider
   * @returns {boolean}
   */
  has(provider) {
    return this.connectors.has(provider);
  }

  /**
   * Checks if a provider supports a specific capability.
   *
   * @param {string} provider - Resource provider enum value
   * @param {string} capability - One of CONNECTOR_CAPABILITIES
   * @returns {boolean}
   */
  hasCapability(provider, capability) {
    const connector = this.get(provider);
    return connector.getCapabilities().has(capability);
  }

  /**
   * Returns a list of all currently registered provider names.
   *
   * @returns {string[]}
   */
  getSupportedProviders() {
    return Array.from(this.connectors.keys());
  }

  /**
   * Clears all registered connectors (primarily for test teardown).
   */
  clear() {
    this.connectors.clear();
  }
}

/**
 * Global singleton connector registry instance.
 */
export const connectorRegistry = new ConnectorRegistry();
