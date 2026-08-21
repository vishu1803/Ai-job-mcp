/**
 * @file In-Memory Mock Resource Connector for Contract & Infrastructure Testing
 *
 * Provides a configurable, deterministic mock connector implementation for unit tests.
 * Never performs real network requests and stores zero credentials.
 */

import { BaseResourceConnector } from '../base/resource-connector.js';
import { CONNECTOR_CAPABILITIES } from '../base/capabilities.js';
import {
  createNormalizedAccount,
  createNormalizedResource,
  createPaginatedResult,
} from '../base/models.js';

export class MockResourceConnector extends BaseResourceConnector {
  /**
   * @param {string} [provider='GITHUB_APP']
   * @param {Object} [options]
   * @param {Iterable<string>} [options.capabilities] - Configurable capability set
   * @param {Object} [options.responses] - Pre-configured mock responses
   */
  constructor(provider = 'GITHUB_APP', options = {}) {
    super(provider);
    this.capabilities = new Set(
      options.capabilities || [
        CONNECTOR_CAPABILITIES.READ_ACCOUNT,
        CONNECTOR_CAPABILITIES.LIST_RESOURCES,
        CONNECTOR_CAPABILITIES.READ_RESOURCE,
        CONNECTOR_CAPABILITIES.REFRESH_CREDENTIAL,
        CONNECTOR_CAPABILITIES.REVOKE_ACCESS,
      ]
    );

    this.responses = {
      validate: { healthy: true, message: 'Mock connection healthy' },
      account: createNormalizedAccount({
        id: 'mock_acc_123',
        name: 'mock-user',
        displayName: 'Mock Test User',
        provider: this.provider,
        accountType: 'USER',
      }),
      resources: [
        createNormalizedResource({
          id: 'mock_res_1',
          name: 'repo-one',
          fullName: 'mock-user/repo-one',
          type: 'REPOSITORY',
          defaultBranch: 'main',
        }),
        createNormalizedResource({
          id: 'mock_res_2',
          name: 'repo-two',
          fullName: 'mock-user/repo-two',
          type: 'REPOSITORY',
          defaultBranch: 'main',
        }),
      ],
      ...options.responses,
    };

    /** @type {Array<{method: string, context: any, args: any}>} */
    this.invocationLog = [];
  }

  getCapabilities() {
    return new Set(this.capabilities);
  }

  setCapabilities(caps) {
    this.capabilities = new Set(caps);
  }

  async validate(context, credentials) {
    this.invocationLog.push({ method: 'validate', context, args: { credentials } });
    if (this.responses.validate instanceof Error) {
      throw this.responses.validate;
    }
    return this.responses.validate;
  }

  async getAccount(context, credentials) {
    this.invocationLog.push({ method: 'getAccount', context, args: { credentials } });
    if (this.responses.account instanceof Error) {
      throw this.responses.account;
    }
    return this.responses.account;
  }

  async listResources(context, credentials, options = {}) {
    this.assertCapability(CONNECTOR_CAPABILITIES.LIST_RESOURCES);
    this.invocationLog.push({ method: 'listResources', context, args: { credentials, options } });
    if (this.responses.resources instanceof Error) {
      throw this.responses.resources;
    }
    return createPaginatedResult({
      items: this.responses.resources,
      nextCursor: null,
      hasMore: false,
    });
  }

  async getResource(context, credentials, externalResourceId) {
    this.assertCapability(CONNECTOR_CAPABILITIES.READ_RESOURCE);
    this.invocationLog.push({
      method: 'getResource',
      context,
      args: { credentials, externalResourceId },
    });
    if (this.responses.resource instanceof Error) {
      throw this.responses.resource;
    }
    const found =
      this.responses.resource || this.responses.resources.find((r) => r.id === externalResourceId);
    if (!found) {
      throw new Error(`Resource ${externalResourceId} not found in mock`);
    }
    return found;
  }

  async refreshCredentials(context, credentials) {
    this.assertCapability(CONNECTOR_CAPABILITIES.REFRESH_CREDENTIAL);
    this.invocationLog.push({ method: 'refreshCredentials', context, args: { credentials } });
    if (this.responses.refresh instanceof Error) {
      throw this.responses.refresh;
    }
    return (
      this.responses.refresh || {
        credentials: { accessToken: 'mock_refreshed_token_456' },
        expiresAt: new Date(Date.now() + 3600 * 1000),
      }
    );
  }

  async revokeAccess(context, credentials) {
    this.assertCapability(CONNECTOR_CAPABILITIES.REVOKE_ACCESS);
    this.invocationLog.push({ method: 'revokeAccess', context, args: { credentials } });
    if (this.responses.revoke instanceof Error) {
      throw this.responses.revoke;
    }
  }
}
