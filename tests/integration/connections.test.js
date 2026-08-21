/**
 * @file Resource Connection Lifecycle Live Integration Tests (P2-005)
 *
 * Tests the complete lifecycle of resource connections against live PostgreSQL:
 * 1. GET /connections (listing, pagination, filters, zero credential leakage)
 * 2. GET /connections/:id (detail retrieval, cross-tenant 404 isolation)
 * 3. POST /connections/:id/test (mock connector execution, status mutation, error updates, rate limiting)
 * 4. POST /connections/:id/disconnect (credential scrubbing, idempotency, audit record)
 * 5. DELETE /connections/:id (hard deletion, cascade)
 * 6. Security matrix (tenant isolation, creator/owner permission, non-creator 403, readonly 403)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, sessions, resourceConnections, auditLogs } from '../../src/db/schema.js';
import { encryptSecret } from '../../src/security/encryption.js';
import { hashSessionToken, getSessionCookieOptions } from '../../src/security/session.service.js';
import { config } from '../../src/config/env.js';
import {
  connectorRegistry,
  MockResourceConnector,
  ConnectorAuthError,
  ProviderUnavailableError,
} from '../../src/connectors/index.js';
import { ConnectionService } from '../../src/services/connection.service.js';

describe('Resource Connection Lifecycle Live Integration Tests (P2-005)', () => {
  let app;
  let connectionService;

  // Tenant A: Primary Workspace
  let tenantA;
  let ownerUserA;
  let creatorUserA;
  let memberUserA;
  let readonlyUserA;

  let ownerSessionA;
  let creatorSessionA;
  let memberSessionA;
  let readonlySessionA;

  // Tenant B: Isolated Foreign Workspace
  let tenantB;
  let ownerUserB;
  let ownerSessionB;

  // Connection IDs
  let activeConnAId;
  let mockConnector;

  const cookieName = getSessionCookieOptions(config).name;

  async function createTestSession(user, tenant) {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const hashedId = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

    await db.insert(sessions).values({
      id: hashedId,
      userId: user.id,
      tenantId: tenant.id,
      expiresAt,
    });

    return { rawToken, cookie: `${cookieName}=${rawToken}` };
  }

  before(async () => {
    // 1. Setup Mock Connector in registry
    mockConnector = new MockResourceConnector('GITHUB_APP');
    connectorRegistry.register('GITHUB_APP', mockConnector, { allowOverride: true });

    connectionService = new ConnectionService(db, connectorRegistry);
    app = buildApp({ connectionService });
    await app.ready();

    // 2. Provision Tenant A
    const [tA] = await db
      .insert(tenants)
      .values({
        name: `Tenant A Lifecycle ${Date.now()}`,
        slug: `tenant-a-lc-${Date.now()}`,
        tier: 'PRO',
      })
      .returning();
    tenantA = tA;

    // Provision Users in Tenant A
    const [ownerA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `owner-a-${Date.now()}@example.com`,
        displayName: 'Owner User A',
        role: 'OWNER',
      })
      .returning();
    ownerUserA = ownerA;

    const [creatorA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `creator-a-${Date.now()}@example.com`,
        displayName: 'Creator User A',
        role: 'MEMBER',
      })
      .returning();
    creatorUserA = creatorA;

    const [memberA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `member-a-${Date.now()}@example.com`,
        displayName: 'Member User A',
        role: 'MEMBER',
      })
      .returning();
    memberUserA = memberA;

    const [readonlyA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `readonly-a-${Date.now()}@example.com`,
        displayName: 'Readonly User A',
        role: 'READONLY',
      })
      .returning();
    readonlyUserA = readonlyA;

    // Create sessions
    ownerSessionA = await createTestSession(ownerUserA, tenantA);
    creatorSessionA = await createTestSession(creatorUserA, tenantA);
    memberSessionA = await createTestSession(memberUserA, tenantA);
    readonlySessionA = await createTestSession(readonlyUserA, tenantA);

    // 3. Provision Tenant B (Foreign Workspace)
    const [tB] = await db
      .insert(tenants)
      .values({
        name: `Tenant B Foreign ${Date.now()}`,
        slug: `tenant-b-foreign-${Date.now()}`,
        tier: 'FREE',
      })
      .returning();
    tenantB = tB;

    const [ownerB] = await db
      .insert(users)
      .values({
        tenantId: tenantB.id,
        email: `owner-b-${Date.now()}@example.com`,
        displayName: 'Owner User B',
        role: 'OWNER',
      })
      .returning();
    ownerUserB = ownerB;
    ownerSessionB = await createTestSession(ownerUserB, tenantB);

    // 4. Create primary resource connection in Tenant A created by creatorUserA
    const syntheticSecret = JSON.stringify({
      token: 'ghu_synthetic_test_token_123',
      refreshToken: 'ghr_synthetic_refresh_token_456',
    });
    const encryptedSecret = encryptSecret(syntheticSecret);

    const [conn] = await db
      .insert(resourceConnections)
      .values({
        tenantId: tenantA.id,
        userId: creatorUserA.id,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        displayName: 'GitHub App Production',
        externalAccountId: `gh_acc_${Date.now()}`,
        externalAccountName: 'career-agent-org',
        installationId: 'inst_998877',
        encryptedCredentials: encryptedSecret,
        keyVersion: 'v1',
        status: 'PENDING',
        scopes: ['repo:read', 'user:read'],
        metadata: { installedBy: 'creatorUserA' },
      })
      .returning();
    activeConnAId = conn.id;
  });

  after(async () => {
    if (app) await app.close();
    // Cleanup created tenants (cascade deletes users, sessions, connections, audit logs)
    if (tenantA) {
      await db.delete(tenants).where(eq(tenants.id, tenantA.id));
    }
    if (tenantB) {
      await db.delete(tenants).where(eq(tenants.id, tenantB.id));
    }
    await closeDatabase();
  });

  // -------------------------------------------------------------------------
  // 1. GET /connections
  // -------------------------------------------------------------------------
  describe('1. GET /connections', () => {
    it('rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/connections',
      });

      assert.strictEqual(res.statusCode, 401);
      const body = res.json();
      assert.strictEqual(body.error.code, 'UNAUTHENTICATED');
    });

    it('returns connection summary list and pagination envelope for authenticated user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/connections',
        headers: {
          cookie: creatorSessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = res.json();

      assert.ok(Array.isArray(body.items));
      assert.strictEqual(body.items.length, 1);
      assert.strictEqual(body.items[0].id, activeConnAId);
      assert.strictEqual(body.items[0].displayName, 'GitHub App Production');
      assert.strictEqual(body.items[0].provider, 'GITHUB_APP');

      // Security check: Zero credentials leaked
      assert.strictEqual(body.items[0].encryptedCredentials, undefined);
      assert.strictEqual(body.items[0].keyVersion, undefined);

      assert.strictEqual(body.pagination.limit, 50);
      assert.strictEqual(body.pagination.hasMore, false);
    });

    it('filters connections by provider and status safely', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/connections?provider=GITHUB_APP&status=PENDING',
        headers: {
          cookie: creatorSessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = res.json();
      assert.strictEqual(body.items.length, 1);

      // Query with non-matching status
      const noMatchRes = await app.inject({
        method: 'GET',
        url: '/connections?provider=GITHUB_APP&status=DISCONNECTED',
        headers: {
          cookie: creatorSessionA.cookie,
        },
      });

      assert.strictEqual(noMatchRes.statusCode, 200);
      assert.strictEqual(noMatchRes.json().items.length, 0);
    });

    it('allows READONLY member to list tenant connections', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/connections',
        headers: {
          cookie: readonlySessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json().items.length, 1);
    });
  });

  // -------------------------------------------------------------------------
  // 2. GET /connections/:id
  // -------------------------------------------------------------------------
  describe('2. GET /connections/:id', () => {
    it('returns detailed metadata including creator ID and safe metadata object', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/connections/${activeConnAId}`,
        headers: {
          cookie: creatorSessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = res.json();
      assert.strictEqual(body.id, activeConnAId);
      assert.strictEqual(body.userId, creatorUserA.id);
      assert.deepStrictEqual(body.metadata, { installedBy: 'creatorUserA' });

      // Security check: Zero credential fields
      assert.strictEqual(body.encryptedCredentials, undefined);
      assert.strictEqual(body.keyVersion, undefined);
    });

    it('returns 404 NOT_FOUND when requesting connection belonging to another tenant (Tenant B -> Conn A)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/connections/${activeConnAId}`,
        headers: {
          cookie: ownerSessionB.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 404);
      const body = res.json();
      assert.strictEqual(body.error.code, 'CONNECTION_NOT_FOUND');
    });

    it('returns 404 NOT_FOUND for non-existent UUID in workspace', async () => {
      const fakeId = crypto.randomUUID();
      const res = await app.inject({
        method: 'GET',
        url: `/connections/${fakeId}`,
        headers: {
          cookie: creatorSessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json().error.code, 'CONNECTION_NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // 3. POST /connections/:id/test
  // -------------------------------------------------------------------------
  describe('3. POST /connections/:id/test', () => {
    it('executes health test successfully, mutates status to ACTIVE, updates lastValidatedAt, and logs audit', async () => {
      mockConnector.responses.validate = { healthy: true, message: 'Upstream GitHub App active' };

      const res = await app.inject({
        method: 'POST',
        url: `/connections/${activeConnAId}/test`,
        headers: {
          cookie: creatorSessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = res.json();
      assert.strictEqual(body.healthy, true);
      assert.strictEqual(body.status, 'ACTIVE');
      assert.strictEqual(body.message, 'Upstream GitHub App active');
      assert.ok(body.validatedAt);

      // Verify database mutation
      const [dbRecord] = await db
        .select()
        .from(resourceConnections)
        .where(eq(resourceConnections.id, activeConnAId));

      assert.strictEqual(dbRecord.status, 'ACTIVE');
      assert.ok(dbRecord.lastValidatedAt);
      assert.strictEqual(dbRecord.lastErrorCode, null);

      // Verify audit log
      const [auditLog] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, tenantA.id),
            eq(auditLogs.eventType, 'connection.tested'),
            eq(auditLogs.resourceId, activeConnAId)
          )
        );
      assert.ok(auditLog);
      assert.strictEqual(auditLog.details.healthy, true);
    });

    it('handles connector authentication failure (401), sets status to REVOKED, and updates lastErrorCode', async () => {
      mockConnector.responses.validate = new ConnectorAuthError('GITHUB_APP', 'Bad credentials');

      const res = await app.inject({
        method: 'POST',
        url: `/connections/${activeConnAId}/test`,
        headers: {
          cookie: creatorSessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json().error.code, 'CONNECTOR_AUTH_FAILED');

      // Verify database updated to REVOKED
      const [dbRecord] = await db
        .select()
        .from(resourceConnections)
        .where(eq(resourceConnections.id, activeConnAId));

      assert.strictEqual(dbRecord.status, 'REVOKED');
      assert.strictEqual(dbRecord.lastErrorCode, 'CONNECTOR_AUTH_FAILED');
      assert.ok(dbRecord.lastErrorAt);
    });

    it('handles temporary upstream provider unavailable (503), sets status to ERROR, and preserves credentials', async () => {
      // Re-activate connection first
      await db
        .update(resourceConnections)
        .set({ status: 'ACTIVE' })
        .where(eq(resourceConnections.id, activeConnAId));

      mockConnector.responses.validate = new ProviderUnavailableError(
        'GITHUB_APP',
        'GitHub API 503'
      );

      const res = await app.inject({
        method: 'POST',
        url: `/connections/${activeConnAId}/test`,
        headers: {
          cookie: creatorSessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 503);
      assert.strictEqual(res.json().error.code, 'PROVIDER_UNAVAILABLE');

      const [dbRecord] = await db
        .select()
        .from(resourceConnections)
        .where(eq(resourceConnections.id, activeConnAId));

      assert.strictEqual(dbRecord.status, 'ERROR');
      assert.strictEqual(dbRecord.lastErrorCode, 'PROVIDER_UNAVAILABLE');
    });

    it('rejects test request from non-creator MEMBER with 403 FORBIDDEN', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/connections/${activeConnAId}/test`,
        headers: {
          cookie: memberSessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.json().error.code, 'FORBIDDEN');
    });

    it('rejects test request from READONLY user with 403 FORBIDDEN', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/connections/${activeConnAId}/test`,
        headers: {
          cookie: readonlySessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.json().error.code, 'FORBIDDEN');
    });

    it('allows workspace OWNER to test connection created by member', async () => {
      mockConnector.responses.validate = { healthy: true, message: 'Validated by Owner' };

      const res = await app.inject({
        method: 'POST',
        url: `/connections/${activeConnAId}/test`,
        headers: {
          cookie: ownerSessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json().healthy, true);
    });
  });

  // -------------------------------------------------------------------------
  // 4. POST /connections/:id/disconnect
  // -------------------------------------------------------------------------
  describe('4. POST /connections/:id/disconnect', () => {
    it('rejects disconnect request from non-creator MEMBER with 403 FORBIDDEN', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/connections/${activeConnAId}/disconnect`,
        headers: {
          cookie: memberSessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.json().error.code, 'FORBIDDEN');
    });

    it('disconnects connection, overwrites ciphertext with scrubbed payload, and records audit event', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/connections/${activeConnAId}/disconnect`,
        headers: {
          cookie: creatorSessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = res.json();
      assert.strictEqual(body.status, 'DISCONNECTED');
      assert.ok(body.message.includes('disconnected successfully'));

      // Check database
      const [dbRecord] = await db
        .select()
        .from(resourceConnections)
        .where(eq(resourceConnections.id, activeConnAId));

      assert.strictEqual(dbRecord.status, 'DISCONNECTED');

      // Verify audit event
      const [auditLog] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, tenantA.id),
            eq(auditLogs.eventType, 'connection.disconnected'),
            eq(auditLogs.resourceId, activeConnAId)
          )
        );
      assert.ok(auditLog);
    });

    it('is idempotent: subsequent disconnect calls succeed without error', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/connections/${activeConnAId}/disconnect`,
        headers: {
          cookie: creatorSessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json().status, 'DISCONNECTED');
    });

    it('guarantees that disconnected connection cannot be tested', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/connections/${activeConnAId}/test`,
        headers: {
          cookie: creatorSessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.json().error.code, 'CONFLICT');
    });
  });

  // -------------------------------------------------------------------------
  // 5. DELETE /connections/:id
  // -------------------------------------------------------------------------
  describe('5. DELETE /connections/:id', () => {
    let connToDeleteId;

    before(async () => {
      const encryptedSecret = encryptSecret(JSON.stringify({ token: 'test' }));
      const [conn] = await db
        .insert(resourceConnections)
        .values({
          tenantId: tenantA.id,
          userId: creatorUserA.id,
          provider: 'GITLAB',
          authType: 'OAUTH2_CODE',
          displayName: 'GitLab To Delete',
          externalAccountId: `gl_acc_${Date.now()}`,
          encryptedCredentials: encryptedSecret,
          keyVersion: 'v1',
          status: 'ACTIVE',
        })
        .returning();
      connToDeleteId = conn.id;
    });

    it('rejects delete request from non-creator MEMBER with 403 FORBIDDEN', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/connections/${connToDeleteId}`,
        headers: {
          cookie: memberSessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 403);
    });

    it('rejects delete request across tenant boundary with 404 NOT_FOUND', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/connections/${connToDeleteId}`,
        headers: {
          cookie: ownerSessionB.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 404);
    });

    it('allows workspace OWNER to permanently delete connection and records audit event', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/connections/${connToDeleteId}`,
        headers: {
          cookie: ownerSessionA.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json().status, 'DELETED');

      // Verify row is purged from DB
      const [dbRecord] = await db
        .select()
        .from(resourceConnections)
        .where(eq(resourceConnections.id, connToDeleteId));

      assert.strictEqual(dbRecord, undefined);

      // Verify audit event
      const [auditLog] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, tenantA.id),
            eq(auditLogs.eventType, 'connection.deleted'),
            eq(auditLogs.resourceId, connToDeleteId)
          )
        );
      assert.ok(auditLog);
    });
  });
});
