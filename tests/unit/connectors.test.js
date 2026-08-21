/**
 * @file Unit Tests for Provider-Neutral Resource Connector Framework (P2-004)
 *
 * Tests:
 * 1. BaseResourceConnector abstraction and capability enforcement
 * 2. CONNECTOR_CAPABILITIES definitions
 * 3. ConnectorContext creation and validation
 * 4. ConnectorRegistry registration, resolution, and duplicate protection
 * 5. Connector Error Taxonomy (HTTP mapping, retryability, safety)
 * 6. Normalized Domain Models (Account, Resource, OperationResult)
 * 7. Pagination contracts and limit boundaries (max 100)
 * 8. MockResourceConnector execution and error simulation
 * 9. Security constraints (statelessness, zero credential retention, zero token leakage)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  BaseResourceConnector,
  CONNECTOR_CAPABILITIES,
  createConnectorContext,
  createNormalizedAccount,
  createNormalizedResource,
  createOperationResult,
  createPaginationOptions,
  createPaginatedResult,
  ConnectorRegistry,
  MockResourceConnector,
  ConnectionNotFoundError,
  ConnectionInactiveError,
  ConnectorAuthError,
  InsufficientScopeError,
  ProviderRateLimitError,
  ProviderUnavailableError,
  ResourceNotFoundError,
  UnsupportedCapabilityError,
} from '../../src/connectors/index.js';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  AuthorizationError,
  AuthenticationError,
  RateLimitError,
  DependencyError,
} from '../../src/errors/index.js';

describe('Resource Connector Framework Unit Tests (P2-004)', () => {
  const validTenantId = crypto.randomUUID();
  const validUserId = crypto.randomUUID();
  const validConnectionId = crypto.randomUUID();

  let registry;

  beforeEach(() => {
    registry = new ConnectorRegistry();
  });

  // -------------------------------------------------------------------------
  // 1. Base Resource Connector Abstraction
  // -------------------------------------------------------------------------
  describe('1. BaseResourceConnector Abstraction', () => {
    it('prevents direct instantiation of abstract BaseResourceConnector', () => {
      assert.throws(
        () => new BaseResourceConnector('GITHUB_APP'),
        (err) => {
          assert.ok(err instanceof TypeError);
          assert.ok(err.message.includes('Cannot construct BaseResourceConnector'));
          return true;
        }
      );
    });

    it('rejects instantiation of subclass without provider identifier', () => {
      class TestConnector extends BaseResourceConnector {}
      assert.throws(
        () => new TestConnector(''),
        (err) => {
          assert.ok(err instanceof TypeError);
          assert.ok(err.message.includes('must be a non-empty string'));
          return true;
        }
      );
    });

    it('throws UnsupportedCapabilityError when invoking unsupported capability-guarded methods', async () => {
      class MinimalConnector extends BaseResourceConnector {
        getCapabilities() {
          return new Set([CONNECTOR_CAPABILITIES.READ_ACCOUNT]);
        }
        async validate() {
          return { healthy: true };
        }
        async getAccount() {
          return createNormalizedAccount({
            id: '1',
            name: 'test',
            provider: 'GITHUB_APP',
          });
        }
      }

      const connector = new MinimalConnector('GITHUB_APP');
      const ctx = createConnectorContext({
        tenantId: validTenantId,
        userId: validUserId,
        connectionId: validConnectionId,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
      });

      await assert.rejects(
        async () => connector.listResources(ctx, {}),
        (err) => {
          assert.ok(err instanceof UnsupportedCapabilityError);
          assert.strictEqual(err.code, 'UNSUPPORTED_CAPABILITY');
          return true;
        }
      );

      await assert.rejects(
        async () => connector.getResource(ctx, {}, 'res_1'),
        (err) => {
          assert.ok(err instanceof UnsupportedCapabilityError);
          return true;
        }
      );

      await assert.rejects(
        async () => connector.refreshCredentials(ctx, {}),
        (err) => {
          assert.ok(err instanceof UnsupportedCapabilityError);
          return true;
        }
      );

      await assert.rejects(
        async () => connector.revokeAccess(ctx, {}),
        (err) => {
          assert.ok(err instanceof UnsupportedCapabilityError);
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. Capabilities Enum & Helpers
  // -------------------------------------------------------------------------
  describe('2. Capabilities Enum & Immutability', () => {
    it('exports all standard approved capability identifiers as frozen object', () => {
      assert.ok(Object.isFrozen(CONNECTOR_CAPABILITIES));
      assert.strictEqual(CONNECTOR_CAPABILITIES.READ_ACCOUNT, 'READ_ACCOUNT');
      assert.strictEqual(CONNECTOR_CAPABILITIES.LIST_RESOURCES, 'LIST_RESOURCES');
      assert.strictEqual(CONNECTOR_CAPABILITIES.READ_RESOURCE, 'READ_RESOURCE');
      assert.strictEqual(CONNECTOR_CAPABILITIES.READ_CONTENT, 'READ_CONTENT');
      assert.strictEqual(CONNECTOR_CAPABILITIES.REFRESH_CREDENTIAL, 'REFRESH_CREDENTIAL');
      assert.strictEqual(CONNECTOR_CAPABILITIES.REVOKE_ACCESS, 'REVOKE_ACCESS');
      assert.strictEqual(CONNECTOR_CAPABILITIES.WRITE_RESOURCE, 'WRITE_RESOURCE');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Connector Execution Context
  // -------------------------------------------------------------------------
  describe('3. Connector Execution Context Validation', () => {
    it('creates a valid immutable ConnectorContext with all required properties', () => {
      const context = createConnectorContext({
        tenantId: validTenantId,
        userId: validUserId,
        connectionId: validConnectionId,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        scopes: ['contents:read', 'metadata:read'],
        requestId: 'req-custom-123',
      });

      assert.strictEqual(context.tenantId, validTenantId);
      assert.strictEqual(context.userId, validUserId);
      assert.strictEqual(context.connectionId, validConnectionId);
      assert.strictEqual(context.provider, 'GITHUB_APP');
      assert.strictEqual(context.authType, 'APP_INSTALLATION');
      assert.deepStrictEqual(context.scopes, ['contents:read', 'metadata:read']);
      assert.strictEqual(context.requestId, 'req-custom-123');

      // Verify immutability
      assert.ok(Object.isFrozen(context));
      assert.ok(Object.isFrozen(context.scopes));
    });

    it('generates random UUID requestId if requestId is omitted or blank', () => {
      const context = createConnectorContext({
        tenantId: validTenantId,
        userId: validUserId,
        connectionId: validConnectionId,
        provider: 'GITLAB',
        authType: 'OAUTH2_CODE',
      });

      assert.ok(context.requestId);
      assert.ok(typeof context.requestId === 'string');
      assert.strictEqual(context.requestId.length, 36);
    });

    it('rejects context creation with missing or non-UUID identifiers', () => {
      assert.throws(
        () =>
          createConnectorContext({
            tenantId: 'invalid-not-uuid',
            userId: validUserId,
            connectionId: validConnectionId,
            provider: 'GITHUB_APP',
            authType: 'APP_INSTALLATION',
          }),
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.strictEqual(err.code, 'VALIDATION_ERROR');
          return true;
        }
      );

      assert.throws(
        () =>
          createConnectorContext({
            tenantId: validTenantId,
            userId: 'invalid-user',
            connectionId: validConnectionId,
            provider: 'GITHUB_APP',
            authType: 'APP_INSTALLATION',
          }),
        (err) => err instanceof ValidationError
      );

      assert.throws(
        () =>
          createConnectorContext({
            tenantId: validTenantId,
            userId: validUserId,
            connectionId: 'invalid-conn',
            provider: 'GITHUB_APP',
            authType: 'APP_INSTALLATION',
          }),
        (err) => err instanceof ValidationError
      );
    });

    it('rejects invalid provider enum or invalid authType enum', () => {
      assert.throws(
        () =>
          createConnectorContext({
            tenantId: validTenantId,
            userId: validUserId,
            connectionId: validConnectionId,
            provider: 'UNSUPPORTED_PROVIDER_XYZ',
            authType: 'APP_INSTALLATION',
          }),
        (err) => err instanceof ValidationError
      );

      assert.throws(
        () =>
          createConnectorContext({
            tenantId: validTenantId,
            userId: validUserId,
            connectionId: validConnectionId,
            provider: 'GITHUB_APP',
            authType: 'INVALID_AUTH_TYPE',
          }),
        (err) => err instanceof ValidationError
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. Connector Registry
  // -------------------------------------------------------------------------
  describe('4. Connector Registry Operations', () => {
    it('registers and resolves connector for a valid provider', () => {
      const mockGitHub = new MockResourceConnector('GITHUB_APP');
      registry.register('GITHUB_APP', mockGitHub);

      assert.strictEqual(registry.has('GITHUB_APP'), true);
      assert.strictEqual(registry.get('GITHUB_APP'), mockGitHub);
      assert.deepStrictEqual(registry.getSupportedProviders(), ['GITHUB_APP']);
    });

    it('rejects duplicate registration without allowOverride flag', () => {
      const mock1 = new MockResourceConnector('GITHUB_APP');
      const mock2 = new MockResourceConnector('GITHUB_APP');

      registry.register('GITHUB_APP', mock1);
      assert.throws(
        () => registry.register('GITHUB_APP', mock2),
        (err) => {
          assert.ok(err instanceof ConflictError);
          assert.strictEqual(err.code, 'CONFLICT');
          return true;
        }
      );

      // With override, it succeeds
      registry.register('GITHUB_APP', mock2, { allowOverride: true });
      assert.strictEqual(registry.get('GITHUB_APP'), mock2);
    });

    it('rejects registration of objects not extending BaseResourceConnector', () => {
      assert.throws(
        () => registry.register('GITHUB_APP', { validate: () => {} }),
        (err) => {
          assert.ok(err instanceof TypeError);
          assert.ok(err.message.includes('must be an instance of BaseResourceConnector'));
          return true;
        }
      );
    });

    it('rejects get() for unregistered provider with clear ValidationError', () => {
      assert.throws(
        () => registry.get('NOTION'),
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.ok(err.message.includes('No connector registered'));
          return true;
        }
      );
    });

    it('checks capability support through registry helper hasCapability()', () => {
      const mock = new MockResourceConnector('GITLAB', {
        capabilities: [CONNECTOR_CAPABILITIES.READ_ACCOUNT, CONNECTOR_CAPABILITIES.LIST_RESOURCES],
      });
      registry.register('GITLAB', mock);

      assert.strictEqual(
        registry.hasCapability('GITLAB', CONNECTOR_CAPABILITIES.READ_ACCOUNT),
        true
      );
      assert.strictEqual(
        registry.hasCapability('GITLAB', CONNECTOR_CAPABILITIES.LIST_RESOURCES),
        true
      );
      assert.strictEqual(
        registry.hasCapability('GITLAB', CONNECTOR_CAPABILITIES.WRITE_RESOURCE),
        false
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. Connector Error Taxonomy
  // -------------------------------------------------------------------------
  describe('5. Connector Error Taxonomy & Resilience Mapping', () => {
    it('ConnectionNotFoundError maps to 404 NOT_FOUND and non-retryable', () => {
      const err = new ConnectionNotFoundError(validConnectionId, validTenantId);
      assert.ok(err instanceof NotFoundError);
      assert.strictEqual(err.statusCode, 404);
      assert.strictEqual(err.code, 'CONNECTION_NOT_FOUND');
      assert.strictEqual(err.retryable, false);
    });

    it('ConnectionInactiveError maps to 403 CONNECTION_INACTIVE and non-retryable', () => {
      const err = new ConnectionInactiveError(validConnectionId, 'DISCONNECTED');
      assert.ok(err instanceof AuthorizationError);
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'CONNECTION_INACTIVE');
      assert.strictEqual(err.retryable, false);
    });

    it('ConnectorAuthError maps to 401 CONNECTOR_AUTH_FAILED and requires reauth', () => {
      const err = new ConnectorAuthError('GITHUB_APP', 'Bad credentials');
      assert.ok(err instanceof AuthenticationError);
      assert.strictEqual(err.statusCode, 401);
      assert.strictEqual(err.code, 'CONNECTOR_AUTH_FAILED');
      assert.strictEqual(err.requiresReauth, true);
    });

    it('InsufficientScopeError maps to 403 INSUFFICIENT_SCOPE', () => {
      const err = new InsufficientScopeError('GITHUB_APP', ['repo:read'], ['user:read']);
      assert.ok(err instanceof AuthorizationError);
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'INSUFFICIENT_SCOPE');
    });

    it('ProviderRateLimitError maps to 429 PROVIDER_RATE_LIMITED and includes retryAfter', () => {
      const resetTime = Math.floor(Date.now() / 1000) + 120;
      const err = new ProviderRateLimitError('GITHUB_APP', 120, resetTime);
      assert.ok(err instanceof RateLimitError);
      assert.strictEqual(err.statusCode, 429);
      assert.strictEqual(err.code, 'PROVIDER_RATE_LIMITED');
      assert.strictEqual(err.retryable, true);
      assert.strictEqual(err.retryAfter, 120);
      assert.ok(err.details.resetAt);
    });

    it('ProviderUnavailableError maps to 503 PROVIDER_UNAVAILABLE and is retryable', () => {
      const err = new ProviderUnavailableError('GITHUB_APP', 'Gateway timeout', true);
      assert.ok(err instanceof DependencyError);
      assert.strictEqual(err.statusCode, 503);
      assert.strictEqual(err.code, 'PROVIDER_UNAVAILABLE');
      assert.strictEqual(err.retryable, true);
    });

    it('ResourceNotFoundError maps to 404 RESOURCE_NOT_FOUND', () => {
      const err = new ResourceNotFoundError('GITHUB_APP', 'repo_999');
      assert.ok(err instanceof NotFoundError);
      assert.strictEqual(err.statusCode, 404);
      assert.strictEqual(err.code, 'RESOURCE_NOT_FOUND');
    });

    it('UnsupportedCapabilityError maps to 400 UNSUPPORTED_CAPABILITY', () => {
      const err = new UnsupportedCapabilityError('GOOGLE_DRIVE', 'WRITE_RESOURCE');
      assert.ok(err instanceof ValidationError);
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, 'UNSUPPORTED_CAPABILITY');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Normalized Domain Models & Result Contracts
  // -------------------------------------------------------------------------
  describe('6. Normalized Domain Models', () => {
    it('creates valid NormalizedAccount with required and optional fields', () => {
      const account = createNormalizedAccount({
        id: '887766',
        name: 'octocat',
        displayName: 'The Octocat',
        avatarUrl: 'https://github.com/images/error/octocat_happy.gif',
        provider: 'GITHUB_APP',
        accountType: 'USER',
        metadata: { followers: 100 },
      });

      assert.strictEqual(account.id, '887766');
      assert.strictEqual(account.name, 'octocat');
      assert.strictEqual(account.displayName, 'The Octocat');
      assert.strictEqual(account.provider, 'GITHUB_APP');
      assert.strictEqual(account.accountType, 'USER');
      assert.strictEqual(account.metadata.followers, 100);
      assert.ok(Object.isFrozen(account));
    });

    it('creates valid NormalizedResource with repository classification', () => {
      const res = createNormalizedResource({
        id: 'repo_12345',
        name: 'ai-career-agent',
        fullName: 'vishu1803/ai-career-agent',
        type: 'REPOSITORY',
        url: 'https://github.com/vishu1803/ai-career-agent',
        defaultBranch: 'main',
        isPrivate: false,
        languages: ['JavaScript', 'HTML'],
        updatedAt: '2026-08-21T00:00:00.000Z',
        metadata: { stars: 5 },
      });

      assert.strictEqual(res.id, 'repo_12345');
      assert.strictEqual(res.name, 'ai-career-agent');
      assert.strictEqual(res.fullName, 'vishu1803/ai-career-agent');
      assert.strictEqual(res.type, 'REPOSITORY');
      assert.strictEqual(res.defaultBranch, 'main');
      assert.strictEqual(res.isPrivate, false);
      assert.deepStrictEqual(res.languages, ['JavaScript', 'HTML']);
      assert.ok(res.updatedAt instanceof Date);
      assert.ok(Object.isFrozen(res));
    });

    it('creates standard ConnectorOperationResult envelopes', () => {
      const successResult = createOperationResult({
        success: true,
        data: { message: 'ok' },
      });
      assert.strictEqual(successResult.success, true);
      assert.deepStrictEqual(successResult.data, { message: 'ok' });
      assert.strictEqual(successResult.error, null);

      const failResult = createOperationResult({
        success: false,
        error: { code: 'FAILED' },
      });
      assert.strictEqual(failResult.success, false);
      assert.strictEqual(failResult.data, null);
      assert.deepStrictEqual(failResult.error, { code: 'FAILED' });
    });
  });

  // -------------------------------------------------------------------------
  // 7. Pagination Contracts & Boundaries
  // -------------------------------------------------------------------------
  describe('7. Pagination Contracts & Boundaries', () => {
    it('uses default limit of 50 when limit is omitted', () => {
      const options = createPaginationOptions({});
      assert.strictEqual(options.limit, 50);
      assert.strictEqual(options.cursor, null);
    });

    it('caps limit at maximum 100 items', () => {
      const options = createPaginationOptions({ limit: 500, cursor: 'cur_abc' });
      assert.strictEqual(options.limit, 100);
      assert.strictEqual(options.cursor, 'cur_abc');
    });

    it('rejects non-positive integer limits with ValidationError', () => {
      assert.throws(
        () => createPaginationOptions({ limit: 0 }),
        (err) => err instanceof ValidationError
      );
      assert.throws(
        () => createPaginationOptions({ limit: -10 }),
        (err) => err instanceof ValidationError
      );
      assert.throws(
        () => createPaginationOptions({ limit: 'invalid' }),
        (err) => err instanceof ValidationError
      );
    });

    it('creates normalized PaginatedResult structure', () => {
      const result = createPaginatedResult({
        items: [{ id: '1' }, { id: '2' }],
        nextCursor: 'next_page_token_123',
        hasMore: true,
        totalCount: 150,
      });

      assert.strictEqual(result.items.length, 2);
      assert.strictEqual(result.nextCursor, 'next_page_token_123');
      assert.strictEqual(result.hasMore, true);
      assert.strictEqual(result.totalCount, 150);
      assert.ok(Object.isFrozen(result));
      assert.ok(Object.isFrozen(result.items));
    });
  });

  // -------------------------------------------------------------------------
  // 8. Mock Resource Connector Execution
  // -------------------------------------------------------------------------
  describe('8. Mock Resource Connector Execution', () => {
    it('executes full mock connector lifecycle successfully', async () => {
      const mock = new MockResourceConnector('GITHUB_APP');
      const ctx = createConnectorContext({
        tenantId: validTenantId,
        userId: validUserId,
        connectionId: validConnectionId,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
      });
      const credentials = { token: 'synthetic_test_token' };

      // 1. Validate
      const valResult = await mock.validate(ctx, credentials);
      assert.strictEqual(valResult.healthy, true);

      // 2. Get Account
      const account = await mock.getAccount(ctx, credentials);
      assert.strictEqual(account.name, 'mock-user');
      assert.strictEqual(account.provider, 'GITHUB_APP');

      // 3. List Resources
      const resources = await mock.listResources(ctx, credentials);
      assert.strictEqual(resources.items.length, 2);
      assert.strictEqual(resources.items[0].name, 'repo-one');

      // 4. Get Resource
      const singleRes = await mock.getResource(ctx, credentials, 'mock_res_1');
      assert.strictEqual(singleRes.id, 'mock_res_1');

      // 5. Refresh Credentials
      const refreshed = await mock.refreshCredentials(ctx, credentials);
      assert.ok(refreshed.credentials.accessToken);

      // 6. Revoke Access
      await mock.revokeAccess(ctx, credentials);

      // Verify invocation log
      assert.strictEqual(mock.invocationLog.length, 6);
    });

    it('simulates error conditions accurately when configured', async () => {
      const mock = new MockResourceConnector('GITHUB_APP', {
        responses: {
          validate: new ConnectorAuthError('GITHUB_APP', 'Token revoked'),
          account: new ProviderUnavailableError('GITHUB_APP', 'API down'),
        },
      });

      const ctx = createConnectorContext({
        tenantId: validTenantId,
        userId: validUserId,
        connectionId: validConnectionId,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
      });

      await assert.rejects(
        async () => mock.validate(ctx, {}),
        (err) => err instanceof ConnectorAuthError
      );

      await assert.rejects(
        async () => mock.getAccount(ctx, {}),
        (err) => err instanceof ProviderUnavailableError
      );
    });
  });

  // -------------------------------------------------------------------------
  // 9. Security & Boundary Guarantees
  // -------------------------------------------------------------------------
  describe('9. Security & Boundary Guarantees', () => {
    it('guarantees context does not accept or store credential fields', () => {
      const context = createConnectorContext({
        tenantId: validTenantId,
        userId: validUserId,
        connectionId: validConnectionId,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        // Injected fields attempting leakage:
        accessToken: 'ghs_maliciously_injected_token',
        secret: 'my_secret',
      });

      assert.strictEqual(context.accessToken, undefined);
      assert.strictEqual(context.secret, undefined);
    });

    it('guarantees registry never stores credentials on connector instances', () => {
      const mock = new MockResourceConnector('GITHUB_APP');
      registry.register('GITHUB_APP', mock);

      const resolved = registry.get('GITHUB_APP');
      assert.strictEqual(resolved.credentials, undefined);
      assert.strictEqual(resolved.accessToken, undefined);
    });
  });
});
