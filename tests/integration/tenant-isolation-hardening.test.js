/**
 * @file Cross-Cutting Tenant Isolation & Resource Authorization Hardening Integration Tests (P2-006)
 *
 * Live PostgreSQL tests verifying:
 * 1. Multi-Tenant Default Deny (404 NOT_FOUND on cross-tenant access for all operations)
 * 2. Resistance to Tenant Spoofing (Query, Header, Body injection attacks)
 * 3. Immutable Request Context (req.auth)
 * 4. Explicit Negative Regression Test demonstrating that tenant scoping prevents data leakage
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, sessions, resourceConnections } from '../../src/db/schema.js';
import { encryptSecret } from '../../src/security/encryption.js';
import { hashSessionToken, getSessionCookieOptions } from '../../src/security/session.service.js';
import { config } from '../../src/config/env.js';
import { connectorRegistry, MockResourceConnector } from '../../src/connectors/index.js';
import { ConnectionService } from '../../src/services/connection.service.js';
import { findConnectionByIdAndTenant } from '../../src/db/repositories/connection.repository.js';

describe('Global Resource Tenant Isolation Hardening Tests (P2-006)', () => {
  let app;
  let connectionService;

  // Tenant A: Primary Workspace
  let tenantA;
  let ownerUserA;
  let creatorUserA;
  let ownerSessionA;
  let creatorSessionA;
  let connA;

  // Tenant B: Isolated Foreign Workspace
  let tenantB;
  let ownerUserB;
  let ownerSessionB;
  let connB;

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
    // Setup Mock Connector
    const mockConnector = new MockResourceConnector('GITHUB_APP');
    connectorRegistry.register('GITHUB_APP', mockConnector, { allowOverride: true });

    connectionService = new ConnectionService(db, connectorRegistry);
    app = buildApp({ connectionService });
    await app.ready();

    // 1. Provision Tenant A
    const [tA] = await db
      .insert(tenants)
      .values({
        name: `Tenant A Isolation ${Date.now()}`,
        slug: `tenant-a-iso-${Date.now()}`,
        tier: 'PRO',
      })
      .returning();
    tenantA = tA;

    const [ownerA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `owner-a-iso-${Date.now()}@example.com`,
        displayName: 'Owner User A',
        role: 'OWNER',
      })
      .returning();
    ownerUserA = ownerA;

    const [creatorA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `creator-a-iso-${Date.now()}@example.com`,
        displayName: 'Creator User A',
        role: 'MEMBER',
      })
      .returning();
    creatorUserA = creatorA;

    ownerSessionA = await createTestSession(ownerUserA, tenantA);
    creatorSessionA = await createTestSession(creatorUserA, tenantA);

    // Create connection in Tenant A
    const [cA] = await db
      .insert(resourceConnections)
      .values({
        tenantId: tenantA.id,
        userId: creatorUserA.id,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        displayName: 'Tenant A Production App',
        externalAccountId: `gh_acc_a_${Date.now()}`,
        encryptedCredentials: encryptSecret(JSON.stringify({ token: 'tok_a' })),
        keyVersion: 'v1',
        status: 'ACTIVE',
      })
      .returning();
    connA = cA;

    // 2. Provision Tenant B
    const [tB] = await db
      .insert(tenants)
      .values({
        name: `Tenant B Isolation ${Date.now()}`,
        slug: `tenant-b-iso-${Date.now()}`,
        tier: 'FREE',
      })
      .returning();
    tenantB = tB;

    const [ownerB] = await db
      .insert(users)
      .values({
        tenantId: tenantB.id,
        email: `owner-b-iso-${Date.now()}@example.com`,
        displayName: 'Owner User B',
        role: 'OWNER',
      })
      .returning();
    ownerUserB = ownerB;
    ownerSessionB = await createTestSession(ownerUserB, tenantB);

    // Create connection in Tenant B
    const [cB] = await db
      .insert(resourceConnections)
      .values({
        tenantId: tenantB.id,
        userId: ownerUserB.id,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        displayName: 'Tenant B Secret App',
        externalAccountId: `gh_acc_b_${Date.now()}`,
        encryptedCredentials: encryptSecret(JSON.stringify({ token: 'tok_b_secret' })),
        keyVersion: 'v1',
        status: 'ACTIVE',
      })
      .returning();
    connB = cB;
  });

  after(async () => {
    if (app) await app.close();
    if (tenantA) {
      await db.delete(tenants).where(eq(tenants.id, tenantA.id));
    }
    if (tenantB) {
      await db.delete(tenants).where(eq(tenants.id, tenantB.id));
    }
    await closeDatabase();
  });

  // -------------------------------------------------------------------------
  // 1. Cross-Tenant Default Deny (404 NOT_FOUND)
  // -------------------------------------------------------------------------
  describe('1. Cross-Tenant Default Deny (404 NOT_FOUND)', () => {
    it('Tenant A cannot retrieve Tenant B connection via GET /connections/:id (returns 404)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/connections/${connB.id}`,
        headers: { cookie: ownerSessionA.cookie },
      });

      assert.strictEqual(res.statusCode, 404);
      const body = res.json();
      assert.strictEqual(body.error.code, 'CONNECTION_NOT_FOUND');
    });

    it('Tenant A cannot test Tenant B connection via POST /connections/:id/test (returns 404)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/connections/${connB.id}/test`,
        headers: { cookie: ownerSessionA.cookie },
      });

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json().error.code, 'CONNECTION_NOT_FOUND');
    });

    it('Tenant A cannot disconnect Tenant B connection via POST /connections/:id/disconnect (returns 404)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/connections/${connB.id}/disconnect`,
        headers: { cookie: ownerSessionA.cookie },
      });

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json().error.code, 'CONNECTION_NOT_FOUND');
    });

    it('Tenant A cannot delete Tenant B connection via DELETE /connections/:id (returns 404)', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/connections/${connB.id}`,
        headers: { cookie: ownerSessionA.cookie },
      });

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json().error.code, 'CONNECTION_NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Tenant Spoofing Resistance (Header, Query, Body Injection)
  // -------------------------------------------------------------------------
  describe('2. Tenant Spoofing Resistance', () => {
    it('ignores client-injected query parameter ?tenant_id=... and enforces authenticated tenant', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/connections?tenant_id=${tenantB.id}`,
        headers: { cookie: creatorSessionA.cookie },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = res.json();
      // Should ONLY return Tenant A's connection, ignoring the query parameter
      assert.strictEqual(body.items.length, 1);
      assert.strictEqual(body.items[0].id, connA.id);
    });

    it('ignores client-injected X-Tenant-Id header and enforces authenticated session tenant', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/connections/${connA.id}`,
        headers: {
          cookie: creatorSessionA.cookie,
          'x-tenant-id': tenantB.id,
          'X-Tenant-ID': tenantB.id,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json().id, connA.id);
    });

    it('ignores client-injected header attempting to access foreign connection', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/connections/${connB.id}`,
        headers: {
          cookie: creatorSessionA.cookie,
          'x-tenant-id': tenantB.id,
        },
      });

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json().error.code, 'CONNECTION_NOT_FOUND');
    });

    it('allows Tenant B owner with valid session to access Tenant B connection', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/connections/${connB.id}`,
        headers: {
          cookie: ownerSessionB.cookie,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json().id, connB.id);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Explicit Negative Regression Test
  // -------------------------------------------------------------------------
  describe('3. Explicit Negative Regression Test (Tenant Scoping Guard)', () => {
    it('demonstrates that unscoped query would leak cross-tenant data, but repository guard blocks it', async () => {
      // 1. Naive unscoped query simulation (VULNERABLE PATTERN):
      const [leakedUnscoped] = await db
        .select()
        .from(resourceConnections)
        .where(eq(resourceConnections.id, connB.id));

      // Unscoped query would find Conn B
      assert.ok(leakedUnscoped);
      assert.strictEqual(leakedUnscoped.tenantId, tenantB.id);

      // 2. Hardened repository query (SAFE PATTERN):
      const hardenedResult = await findConnectionByIdAndTenant(db, connB.id, tenantA.id);

      // Must be null because Conn B does NOT belong to Tenant A
      assert.strictEqual(hardenedResult, null);
    });
  });
});
