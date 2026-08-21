/**
 * @file Unit Tests for Tenant Isolation & Resource Authorization Hardening (P2-006)
 *
 * Validates:
 * 1. authorizeResourceAccess tenant matching, role enforcement, and creator ownership rules
 * 2. Cross-tenant default-deny returning 404 (preventing IDOR and enumeration)
 * 3. Immutable connector context creation only after successful authorization
 * 4. Repository assertTenantId runtime guards blocking un-scoped queries
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  authorizeResourceAccess,
  createTrustedConnectorContext,
} from '../../src/security/resource-authorization.js';
import {
  listConnectionsByTenant,
  findConnectionByIdAndTenant,
  updateConnectionMetadata,
  disconnectConnectionRecord,
  deleteConnectionRecord,
  writeAuditRecord,
} from '../../src/db/repositories/connection.repository.js';
import { ConnectionNotFoundError } from '../../src/connectors/errors/connector-errors.js';
import { AuthorizationError, ValidationError } from '../../src/errors/index.js';

describe('Tenant Isolation & Resource Authorization Unit Tests (P2-006)', () => {
  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  const creatorUser = { id: crypto.randomUUID(), role: 'MEMBER' };
  const nonCreatorUser = { id: crypto.randomUUID(), role: 'MEMBER' };
  const ownerUser = { id: crypto.randomUUID(), role: 'OWNER' };
  const readonlyUser = { id: crypto.randomUUID(), role: 'READONLY' };

  const connectionA = {
    id: crypto.randomUUID(),
    tenantId: tenantA,
    userId: creatorUser.id,
    provider: 'GITHUB_APP',
    authType: 'APP_INSTALLATION',
    scopes: ['repo:read'],
    status: 'ACTIVE',
  };

  // -------------------------------------------------------------------------
  // 1. Cross-Tenant Default Deny (404 NOT_FOUND)
  // -------------------------------------------------------------------------
  describe('1. Cross-Tenant Default Deny (404 NOT_FOUND)', () => {
    it('throws ConnectionNotFoundError (404) when resource tenantId does not match trusted tenantId', () => {
      assert.throws(
        () =>
          authorizeResourceAccess({
            user: ownerUser,
            tenantId: tenantB, // Caller belongs to Tenant B, resource belongs to Tenant A
            resource: connectionA,
            action: 'read',
          }),
        (err) => {
          assert.ok(err instanceof ConnectionNotFoundError);
          assert.strictEqual(err.statusCode, 404);
          assert.strictEqual(err.code, 'CONNECTION_NOT_FOUND');
          return true;
        }
      );
    });

    it('throws ConnectionNotFoundError (404) when resource is null/undefined', () => {
      assert.throws(
        () =>
          authorizeResourceAccess({
            user: ownerUser,
            tenantId: tenantA,
            resource: null,
            action: 'read',
          }),
        (err) => {
          assert.ok(err instanceof ConnectionNotFoundError);
          assert.strictEqual(err.statusCode, 404);
          return true;
        }
      );
    });

    it('throws ValidationError when trusted tenantId parameter is missing or invalid', () => {
      assert.throws(
        () =>
          authorizeResourceAccess({
            user: ownerUser,
            tenantId: '',
            resource: connectionA,
          }),
        (err) => {
          assert.ok(err instanceof ValidationError);
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. Read Operations RBAC
  // -------------------------------------------------------------------------
  describe('2. Read Operations RBAC', () => {
    it('permits OWNER to read tenant resources', () => {
      assert.doesNotThrow(() =>
        authorizeResourceAccess({
          user: ownerUser,
          tenantId: tenantA,
          resource: connectionA,
          action: 'read',
        })
      );
    });

    it('permits creator MEMBER to read tenant resources', () => {
      assert.doesNotThrow(() =>
        authorizeResourceAccess({
          user: creatorUser,
          tenantId: tenantA,
          resource: connectionA,
          action: 'read',
        })
      );
    });

    it('permits non-creator MEMBER to read tenant resources', () => {
      assert.doesNotThrow(() =>
        authorizeResourceAccess({
          user: nonCreatorUser,
          tenantId: tenantA,
          resource: connectionA,
          action: 'read',
        })
      );
    });

    it('permits READONLY member to read tenant resources', () => {
      assert.doesNotThrow(() =>
        authorizeResourceAccess({
          user: readonlyUser,
          tenantId: tenantA,
          resource: connectionA,
          action: 'read',
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. Mutating / Deleting Operations RBAC & Creator Ownership
  // -------------------------------------------------------------------------
  describe('3. Mutating / Deleting Operations RBAC & Creator Ownership', () => {
    it('permits workspace OWNER to mutate or delete connection created by another user', () => {
      assert.doesNotThrow(() =>
        authorizeResourceAccess({
          user: ownerUser,
          tenantId: tenantA,
          resource: connectionA,
          action: 'mutate',
          requireCreator: true,
        })
      );

      assert.doesNotThrow(() =>
        authorizeResourceAccess({
          user: ownerUser,
          tenantId: tenantA,
          resource: connectionA,
          action: 'delete',
          requireCreator: true,
        })
      );
    });

    it('permits creator MEMBER to mutate or delete their own connection', () => {
      assert.doesNotThrow(() =>
        authorizeResourceAccess({
          user: creatorUser,
          tenantId: tenantA,
          resource: connectionA,
          action: 'mutate',
          requireCreator: true,
        })
      );
    });

    it('rejects non-creator MEMBER from mutating connection with 403 AuthorizationError', () => {
      assert.throws(
        () =>
          authorizeResourceAccess({
            user: nonCreatorUser,
            tenantId: tenantA,
            resource: connectionA,
            action: 'mutate',
            requireCreator: true,
          }),
        (err) => {
          assert.ok(err instanceof AuthorizationError);
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('rejects READONLY user from mutating connection with 403 AuthorizationError even if recorded as creator', () => {
      const readonlyCreator = { id: connectionA.userId, role: 'READONLY' };
      assert.throws(
        () =>
          authorizeResourceAccess({
            user: readonlyCreator,
            tenantId: tenantA,
            resource: connectionA,
            action: 'mutate',
            requireCreator: true,
          }),
        (err) => {
          assert.ok(err instanceof AuthorizationError);
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. Trusted Connector Context Minting
  // -------------------------------------------------------------------------
  describe('4. Trusted Connector Context Minting', () => {
    it('mints immutable ConnectorContext from trusted session and connection data', () => {
      const ctx = createTrustedConnectorContext({
        user: creatorUser,
        tenantId: tenantA,
        connection: connectionA,
        requestId: 'req-test-123',
      });

      assert.strictEqual(ctx.tenantId, tenantA);
      assert.strictEqual(ctx.userId, creatorUser.id);
      assert.strictEqual(ctx.connectionId, connectionA.id);
      assert.strictEqual(ctx.provider, 'GITHUB_APP');
      assert.strictEqual(ctx.requestId, 'req-test-123');
      assert.ok(Object.isFrozen(ctx));
    });

    it('rejects minting ConnectorContext across tenant boundary with 404', () => {
      assert.throws(
        () =>
          createTrustedConnectorContext({
            user: ownerUser,
            tenantId: tenantB,
            connection: connectionA,
          }),
        (err) => {
          assert.ok(err instanceof ConnectionNotFoundError);
          assert.strictEqual(err.statusCode, 404);
          return true;
        }
      );
    });

    it('rejects minting ConnectorContext for unauthorized user with 403', () => {
      assert.throws(
        () =>
          createTrustedConnectorContext({
            user: nonCreatorUser,
            tenantId: tenantA,
            connection: connectionA,
          }),
        (err) => {
          assert.ok(err instanceof AuthorizationError);
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. Repository Guard: assertTenantId
  // -------------------------------------------------------------------------
  describe('5. Repository Guard: assertTenantId', () => {
    const fakeDb = {};

    it('listConnectionsByTenant rejects null/undefined tenantId', async () => {
      await assert.rejects(() => listConnectionsByTenant(fakeDb, null), ValidationError);
    });

    it('findConnectionByIdAndTenant rejects null/undefined tenantId', async () => {
      await assert.rejects(
        () => findConnectionByIdAndTenant(fakeDb, 'conn-1', undefined),
        ValidationError
      );
    });

    it('updateConnectionMetadata rejects null/undefined tenantId', async () => {
      await assert.rejects(
        () => updateConnectionMetadata(fakeDb, 'conn-1', '', {}),
        ValidationError
      );
    });

    it('disconnectConnectionRecord rejects null/undefined tenantId', async () => {
      await assert.rejects(
        () => disconnectConnectionRecord(fakeDb, 'conn-1', null, 'scrubbed'),
        ValidationError
      );
    });

    it('deleteConnectionRecord rejects null/undefined tenantId', async () => {
      await assert.rejects(
        () => deleteConnectionRecord(fakeDb, 'conn-1', undefined),
        ValidationError
      );
    });

    it('writeAuditRecord rejects null/undefined tenantId in audit payload', async () => {
      await assert.rejects(() => writeAuditRecord(fakeDb, { eventType: 'test' }), ValidationError);
    });
  });
});
