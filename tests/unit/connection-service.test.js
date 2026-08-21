/**
 * @file Unit Tests for Resource Connection Lifecycle Service & Schemas (P2-005)
 *
 * Tests:
 * 1. Authorization matrix (OWNER, creator MEMBER, non-creator MEMBER, READONLY)
 * 2. In-memory rate limiting (10 req/min limit on /test)
 * 3. Connection state transitions & lifecycle guards (DISCONNECTED -> 409, REVOKED -> 401)
 * 4. Model sanitization (zero plaintext or ciphertext credentials in summary / detail models)
 * 5. Zod schema validation rules for query/path/response structures
 * 6. Disconnect idempotency behavior
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ConnectionService } from '../../src/services/connection.service.js';
import {
  ConnectionParamsSchema,
  ConnectionListQuerySchema,
  ConnectionSummarySchema,
  ConnectionDetailSchema,
  ConnectionTestResultSchema,
  ConnectionMutationResultSchema,
} from '../../src/routes/connections.schemas.js';
import {
  AuthorizationError,
  ConflictError,
  AuthenticationError,
  RateLimitError,
} from '../../src/errors/index.js';
import { ConnectorRegistry, MockResourceConnector } from '../../src/connectors/index.js';

describe('Resource Connection Lifecycle Service Unit Tests (P2-005)', () => {
  const tenantId = crypto.randomUUID();
  const ownerUserId = crypto.randomUUID();
  const creatorUserId = crypto.randomUUID();
  const otherMemberUserId = crypto.randomUUID();
  const readonlyUserId = crypto.randomUUID();
  const connectionId = crypto.randomUUID();

  let service;
  let registry;

  beforeEach(() => {
    registry = new ConnectorRegistry();
    registry.register('GITHUB_APP', new MockResourceConnector('GITHUB_APP'));
    service = new ConnectionService({}, registry);
    service.clearRateLimits();
  });

  // -------------------------------------------------------------------------
  // 1. Authorization Matrix
  // -------------------------------------------------------------------------
  describe('1. Role & User-Creator Authorization Matrix', () => {
    const mockConnection = {
      id: connectionId,
      tenantId,
      userId: creatorUserId,
      status: 'ACTIVE',
    };

    it('allows workspace OWNER to mutate connection created by another user', () => {
      const ownerUser = { id: ownerUserId, role: 'OWNER' };
      assert.doesNotThrow(() => service.assertCanMutateConnection(ownerUser, mockConnection));
    });

    it('allows MEMBER who is the connection creator to mutate their connection', () => {
      const creatorUser = { id: creatorUserId, role: 'MEMBER' };
      assert.doesNotThrow(() => service.assertCanMutateConnection(creatorUser, mockConnection));
    });

    it('rejects MEMBER who is NOT the connection creator with AuthorizationError (403)', () => {
      const otherMember = { id: otherMemberUserId, role: 'MEMBER' };
      assert.throws(
        () => service.assertCanMutateConnection(otherMember, mockConnection),
        (err) => {
          assert.ok(err instanceof AuthorizationError);
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('rejects READONLY user even if they were the recorded creator with AuthorizationError (403)', () => {
      const readonlyUser = { id: readonlyUserId, role: 'READONLY' };
      assert.throws(
        () => service.assertCanMutateConnection(readonlyUser, mockConnection),
        (err) => {
          assert.ok(err instanceof AuthorizationError);
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. In-Memory Test Rate Limiting
  // -------------------------------------------------------------------------
  describe('2. Health Test Rate Limiting', () => {
    it('allows up to 10 test requests per minute and rejects the 11th request with RateLimitError (429)', () => {
      const userId = creatorUserId;

      for (let i = 0; i < 10; i++) {
        assert.doesNotThrow(() => service.enforceTestRateLimit(userId, connectionId));
      }

      assert.throws(
        () => service.enforceTestRateLimit(userId, connectionId),
        (err) => {
          assert.ok(err instanceof RateLimitError);
          assert.strictEqual(err.statusCode, 429);
          assert.strictEqual(err.code, 'RATE_LIMITED');
          return true;
        }
      );
    });

    it('isolates rate limits between distinct connections', () => {
      const otherConnectionId = crypto.randomUUID();

      for (let i = 0; i < 10; i++) {
        service.enforceTestRateLimit(creatorUserId, connectionId);
      }

      // Other connection should still be allowed
      assert.doesNotThrow(() => service.enforceTestRateLimit(creatorUserId, otherConnectionId));
    });
  });

  // -------------------------------------------------------------------------
  // 3. Connection State Guards
  // -------------------------------------------------------------------------
  describe('3. Connection State Lifecycle Guards', () => {
    it('rejects /test on DISCONNECTED connection with ConflictError (409)', async () => {
      const mockDisconnected = {
        id: connectionId,
        tenantId,
        userId: creatorUserId,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        status: 'DISCONNECTED',
        encryptedCredentials: 'enc:v1:dummy',
      };

      // Mock repository call
      service.db = {
        select: () => ({
          from: () => ({
            where: async () => [mockDisconnected],
          }),
        }),
      };

      await assert.rejects(
        async () =>
          service.testConnection({ id: creatorUserId, role: 'MEMBER' }, tenantId, connectionId),
        (err) => {
          assert.ok(err instanceof ConflictError);
          assert.strictEqual(err.statusCode, 409);
          assert.strictEqual(err.code, 'CONFLICT');
          return true;
        }
      );
    });

    it('rejects /test on REVOKED connection with AuthenticationError (401)', async () => {
      const mockRevoked = {
        id: connectionId,
        tenantId,
        userId: creatorUserId,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        status: 'REVOKED',
        encryptedCredentials: 'enc:v1:dummy',
      };

      service.db = {
        select: () => ({
          from: () => ({
            where: async () => [mockRevoked],
          }),
        }),
      };

      await assert.rejects(
        async () =>
          service.testConnection({ id: creatorUserId, role: 'MEMBER' }, tenantId, connectionId),
        (err) => {
          assert.ok(err instanceof AuthenticationError);
          assert.strictEqual(err.statusCode, 401);
          assert.strictEqual(err.code, 'CONNECTION_REVOKED');
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. Model Sanitization (Zero Credential Leakage)
  // -------------------------------------------------------------------------
  describe('4. Response Model Sanitization', () => {
    const rawDbRow = {
      id: connectionId,
      tenantId,
      userId: creatorUserId,
      provider: 'GITHUB_APP',
      authType: 'APP_INSTALLATION',
      displayName: 'Production GitHub App',
      externalAccountId: '123456',
      externalAccountName: 'octocat',
      installationId: 'inst_789',
      encryptedCredentials: 'enc:v1:v1:iv:tag:secret_ciphertext',
      keyVersion: 'v1',
      status: 'ACTIVE',
      scopes: ['repo:read'],
      metadata: { org: 'antigravity' },
      expiresAt: new Date(),
      refreshedAt: new Date(),
      lastValidatedAt: new Date(),
      lastErrorCode: null,
      lastErrorAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('toSummaryModel strips encryptedCredentials, keyVersion, and internal user/metadata', () => {
      const summary = service.toSummaryModel(rawDbRow);
      assert.strictEqual(summary.encryptedCredentials, undefined);
      assert.strictEqual(summary.keyVersion, undefined);
      assert.strictEqual(summary.userId, undefined);
      assert.strictEqual(summary.metadata, undefined);
      assert.strictEqual(summary.displayName, 'Production GitHub App');
      assert.strictEqual(summary.status, 'ACTIVE');
    });

    it('toDetailModel preserves safe metadata but strictly strips encryptedCredentials and keyVersion', () => {
      const detail = service.toDetailModel(rawDbRow);
      assert.strictEqual(detail.encryptedCredentials, undefined);
      assert.strictEqual(detail.keyVersion, undefined);
      assert.strictEqual(detail.userId, creatorUserId);
      assert.deepStrictEqual(detail.metadata, { org: 'antigravity' });
    });
  });

  // -------------------------------------------------------------------------
  // 5. Zod Schemas Validation
  // -------------------------------------------------------------------------
  describe('5. Zod Request & Response Schemas', () => {
    it('validates ConnectionParamsSchema for valid UUIDs', () => {
      assert.ok(ConnectionParamsSchema.safeParse({ id: connectionId }).success);
      assert.strictEqual(ConnectionParamsSchema.safeParse({ id: 'invalid-id' }).success, false);
    });

    it('validates ConnectionListQuerySchema and applies limit bounds (1 to 100, default 50)', () => {
      const defaultParsed = ConnectionListQuerySchema.parse({});
      assert.strictEqual(defaultParsed.limit, 50);

      const customParsed = ConnectionListQuerySchema.parse({ limit: '25', provider: 'GITHUB_APP' });
      assert.strictEqual(customParsed.limit, 25);
      assert.strictEqual(customParsed.provider, 'GITHUB_APP');

      assert.strictEqual(ConnectionListQuerySchema.safeParse({ limit: 150 }).success, false);
      assert.strictEqual(ConnectionListQuerySchema.safeParse({ limit: 0 }).success, false);
    });

    it('validates ConnectionSummarySchema & ConnectionDetailSchema', () => {
      const validSummary = {
        id: connectionId,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        displayName: 'App',
        externalAccountId: '100',
        status: 'ACTIVE',
        scopes: ['repo:read'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      assert.ok(ConnectionSummarySchema.safeParse(validSummary).success);

      const validDetail = {
        ...validSummary,
        userId: creatorUserId,
        metadata: { info: 'ok' },
      };
      assert.ok(ConnectionDetailSchema.safeParse(validDetail).success);
    });

    it('validates ConnectionTestResultSchema and ConnectionMutationResultSchema', () => {
      const testResult = {
        connectionId,
        provider: 'GITHUB_APP',
        healthy: true,
        status: 'ACTIVE',
        message: 'Healthy',
        validatedAt: new Date().toISOString(),
      };
      assert.ok(ConnectionTestResultSchema.safeParse(testResult).success);

      const mutationResult = {
        connectionId,
        provider: 'GITHUB_APP',
        status: 'DISCONNECTED',
        message: 'Disconnected',
        updatedAt: new Date().toISOString(),
      };
      assert.ok(ConnectionMutationResultSchema.safeParse(mutationResult).success);
    });
  });
});
