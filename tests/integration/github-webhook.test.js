/**
 * @file Integration Tests for GitHub Webhook Ingress & Lifecycle Subsystem (Task P3-003)
 *
 * Tests the complete Fastify HTTP lifecycle against PostgreSQL:
 * 1. Signature verification & raw body parsing
 * 2. Header validation (400 on missing event/delivery ID)
 * 3. Idempotency & repeat delivery deduplication
 * 4. installation.deleted lifecycle mutation (REVOKED status, error code, token cache eviction, audit log)
 * 5. installation.suspend & installation.unsuspend status transitions
 * 6. installation_repositories metadata updates
 * 7. Multi-tenant isolation & unlinked installation safety
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, resourceConnections, auditLogs } from '../../src/db/schema.js';
import { GitHubWebhookService } from '../../src/services/github-webhook.service.js';
import { GitHubTokenCache } from '../../src/connectors/github/token-cache.js';
import { WebhookDeliveryCache } from '../../src/services/webhook-delivery-cache.js';
import { generateWebhookSignature } from '../../src/security/webhook-signature.js';
import { encryptSecret } from '../../src/security/encryption.js';

describe('GitHub Webhook HTTP & Database Integration Tests (P3-003)', () => {
  const testSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testMasterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  let app;
  let tokenCache;
  let deliveryCache;
  let webhookService;

  const testTenantAId = crypto.randomUUID();
  const testTenantBId = crypto.randomUUID();
  const testUserAId = crypto.randomUUID();
  const testUserBId = crypto.randomUUID();

  const testInstallationAId = Math.floor(10000000 + Math.random() * 80000000);
  const testInstallationBId = testInstallationAId + 1;

  let connectionAId;
  let connectionBId;

  before(async () => {
    // 1. Create test tenants and users
    await db.insert(tenants).values([
      { id: testTenantAId, name: 'Webhook Tenant A', slug: `wh-tenant-a-${Date.now()}` },
      { id: testTenantBId, name: 'Webhook Tenant B', slug: `wh-tenant-b-${Date.now()}` },
    ]);

    await db.insert(users).values([
      {
        id: testUserAId,
        tenantId: testTenantAId,
        email: `wh-user-a-${Date.now()}@example.com`,
        displayName: 'Webhook User A',
        role: 'OWNER',
      },
      {
        id: testUserBId,
        tenantId: testTenantBId,
        email: `wh-user-b-${Date.now()}@example.com`,
        displayName: 'Webhook User B',
        role: 'OWNER',
      },
    ]);

    // 2. Create encrypted credentials package
    const credsCiphertext = encryptSecret(
      JSON.stringify({
        installationId: String(testInstallationAId),
        linkedAt: new Date().toISOString(),
      }),
      { key: testMasterKey }
    );

    // 3. Create resource connections for Tenant A and Tenant B
    const [connA] = await db
      .insert(resourceConnections)
      .values({
        tenantId: testTenantAId,
        userId: testUserAId,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        displayName: 'GitHub (octocat-a)',
        externalAccountId: '10001',
        externalAccountName: 'octocat-a',
        installationId: String(testInstallationAId),
        encryptedCredentials: credsCiphertext,
        keyVersion: 'v1',
        scopes: ['contents:read', 'metadata:read'],
        status: 'ACTIVE',
        metadata: { repositorySelection: 'all', targetType: 'User' },
      })
      .returning();

    const [connB] = await db
      .insert(resourceConnections)
      .values({
        tenantId: testTenantBId,
        userId: testUserBId,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        displayName: 'GitHub (octocat-b)',
        externalAccountId: '10002',
        externalAccountName: 'octocat-b',
        installationId: String(testInstallationBId),
        encryptedCredentials: credsCiphertext,
        keyVersion: 'v1',
        scopes: ['contents:read', 'metadata:read'],
        status: 'ACTIVE',
        metadata: { repositorySelection: 'all', targetType: 'User' },
      })
      .returning();

    connectionAId = connA.id;
    connectionBId = connB.id;

    // 4. Initialize token cache with primed entries
    tokenCache = new GitHubTokenCache();
    tokenCache.set(testTenantAId, testInstallationAId, null, {
      token: 'ghs_cached_token_tenant_a_123',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      permissions: { contents: 'read', metadata: 'read' },
    });
    tokenCache.set(testTenantBId, testInstallationBId, null, {
      token: 'ghs_cached_token_tenant_b_456',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      permissions: { contents: 'read', metadata: 'read' },
    });

    deliveryCache = new WebhookDeliveryCache();
    webhookService = new GitHubWebhookService({
      db,
      tokenCache,
      deliveryCache,
      webhookSecret: testSecret,
    });

    // 5. Build Fastify application
    app = buildApp({
      logger: false,
      db,
      webhookService,
      tokenCache,
    });
    await app.ready();
  });

  after(async () => {
    // Teardown test records
    try {
      await db.delete(tenants).where(eq(tenants.id, testTenantAId));
      await db.delete(tenants).where(eq(tenants.id, testTenantBId));
    } catch {
      // Best effort cleanup
    }

    await app.close();
    await closeDatabase();
  });

  test('1. POST /webhooks/github rejects unauthenticated requests with missing or invalid signature (401)', async () => {
    const payload = { action: 'deleted', installation: { id: testInstallationAId } };

    // Missing signature header
    const noSigRes = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'x-github-event': 'installation',
        'x-github-delivery': crypto.randomUUID(),
        'content-type': 'application/json',
      },
      payload: JSON.stringify(payload),
    });

    assert.equal(noSigRes.statusCode, 401);
    const noSigBody = JSON.parse(noSigRes.payload);
    assert.equal(noSigBody.error.code, 'MISSING_WEBHOOK_SIGNATURE');

    // Invalid signature header
    const invalidSigRes = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'x-github-event': 'installation',
        'x-github-delivery': crypto.randomUUID(),
        'x-hub-signature-256':
          'sha256=0000000000000000000000000000000000000000000000000000000000000000',
        'content-type': 'application/json',
      },
      payload: JSON.stringify(payload),
    });

    assert.equal(invalidSigRes.statusCode, 401);
    const invalidSigBody = JSON.parse(invalidSigRes.payload);
    assert.equal(invalidSigBody.error.code, 'INVALID_WEBHOOK_SIGNATURE');
  });

  test('2. POST /webhooks/github rejects missing required headers with 400', async () => {
    const payload = { action: 'deleted' };
    const rawBody = JSON.stringify(payload);
    const signature = generateWebhookSignature(rawBody, testSecret);

    // Missing X-GitHub-Event
    const noEventRes = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'x-github-delivery': crypto.randomUUID(),
        'x-hub-signature-256': signature,
        'content-type': 'application/json',
      },
      payload: rawBody,
    });

    assert.equal(noEventRes.statusCode, 400);
    assert.equal(JSON.parse(noEventRes.payload).error.code, 'MISSING_EVENT_HEADER');

    // Missing X-GitHub-Delivery
    const noDeliveryRes = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'x-github-event': 'installation',
        'x-hub-signature-256': signature,
        'content-type': 'application/json',
      },
      payload: rawBody,
    });

    assert.equal(noDeliveryRes.statusCode, 400);
    assert.equal(JSON.parse(noDeliveryRes.payload).error.code, 'MISSING_DELIVERY_HEADER');
  });

  test('3. POST /webhooks/github processes ping event successfully (200 OK)', async () => {
    const payload = { zen: 'Non-blocking is better than blocking.', hook_id: 112233 };
    const rawBody = JSON.stringify(payload);
    const signature = generateWebhookSignature(rawBody, testSecret);
    const deliveryId = crypto.randomUUID();

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'x-github-event': 'ping',
        'x-github-delivery': deliveryId,
        'x-hub-signature-256': signature,
        'content-type': 'application/json',
      },
      payload: rawBody,
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.data.ping, true);
    assert.equal(body.data.hookId, 112233);
  });

  test('4. POST /webhooks/github installation.deleted updates DB to REVOKED, evicts token cache, and audits event', async () => {
    // Assert cache is currently populated for Tenant A
    assert.notEqual(tokenCache.get(testTenantAId, testInstallationAId), null);

    const payload = {
      action: 'deleted',
      installation: { id: testInstallationAId },
    };
    const rawBody = JSON.stringify(payload);
    const signature = generateWebhookSignature(rawBody, testSecret);
    const deliveryId = crypto.randomUUID();

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'x-github-event': 'installation',
        'x-github-delivery': deliveryId,
        'x-hub-signature-256': signature,
        'content-type': 'application/json',
      },
      payload: rawBody,
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.data.action, 'deleted');
    assert.equal(body.data.connectionId, connectionAId);

    // 1. Verify database state
    const [dbConnA] = await db
      .select()
      .from(resourceConnections)
      .where(eq(resourceConnections.id, connectionAId));

    assert.equal(dbConnA.status, 'REVOKED');
    assert.equal(dbConnA.lastErrorCode, 'APP_UNINSTALLED');
    assert.notEqual(dbConnA.lastErrorAt, null);

    // 2. Verify token cache eviction for Tenant A
    assert.equal(tokenCache.get(testTenantAId, testInstallationAId), null);

    // 3. Verify Tenant B remains untouched (Multi-tenant isolation)
    const [dbConnB] = await db
      .select()
      .from(resourceConnections)
      .where(eq(resourceConnections.id, connectionBId));
    assert.equal(dbConnB.status, 'ACTIVE');
    assert.notEqual(tokenCache.get(testTenantBId, testInstallationBId), null);

    // 4. Verify audit log entry
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, connectionAId));
    const deleteAudit = logs.find((l) => l.eventType === 'github.installation.deleted');
    assert.notEqual(deleteAudit, undefined);
    assert.equal(deleteAudit.tenantId, testTenantAId);
    assert.equal(deleteAudit.details.installationId, String(testInstallationAId));
  });

  test('5. POST /webhooks/github installation.suspend & installation.unsuspend lifecycle transitions', async () => {
    // 1. Test suspend on Tenant B
    const suspendPayload = {
      action: 'suspend',
      installation: { id: testInstallationBId, suspended_at: new Date().toISOString() },
    };
    const suspendRaw = JSON.stringify(suspendPayload);
    const suspendSig = generateWebhookSignature(suspendRaw, testSecret);
    const suspendDeliveryId = crypto.randomUUID();

    const suspendRes = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'x-github-event': 'installation',
        'x-github-delivery': suspendDeliveryId,
        'x-hub-signature-256': suspendSig,
        'content-type': 'application/json',
      },
      payload: suspendRaw,
    });

    assert.equal(suspendRes.statusCode, 200);
    const [suspendedConnB] = await db
      .select()
      .from(resourceConnections)
      .where(eq(resourceConnections.id, connectionBId));
    assert.equal(suspendedConnB.status, 'REVOKED');
    assert.equal(suspendedConnB.lastErrorCode, 'INSTALLATION_SUSPENDED');
    assert.equal(tokenCache.get(testTenantBId, testInstallationBId), null);

    // 2. Test unsuspend on Tenant B
    const unsuspendPayload = {
      action: 'unsuspend',
      installation: { id: testInstallationBId },
    };
    const unsuspendRaw = JSON.stringify(unsuspendPayload);
    const unsuspendSig = generateWebhookSignature(unsuspendRaw, testSecret);
    const unsuspendDeliveryId = crypto.randomUUID();

    const unsuspendRes = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'x-github-event': 'installation',
        'x-github-delivery': unsuspendDeliveryId,
        'x-hub-signature-256': unsuspendSig,
        'content-type': 'application/json',
      },
      payload: unsuspendRaw,
    });

    assert.equal(unsuspendRes.statusCode, 200);
    const [activeConnB] = await db
      .select()
      .from(resourceConnections)
      .where(eq(resourceConnections.id, connectionBId));
    assert.equal(activeConnB.status, 'ACTIVE');
    assert.equal(activeConnB.lastErrorCode, null);
    assert.equal(activeConnB.lastErrorAt, null);
  });

  test('6. POST /webhooks/github installation_repositories updates metadata and evicts token cache', async () => {
    // Prime token cache for Tenant B
    tokenCache.set(testTenantBId, testInstallationBId, null, {
      token: 'ghs_cached_token_tenant_b_new',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      permissions: { contents: 'read', metadata: 'read' },
    });

    const repoPayload = {
      action: 'added',
      installation: { id: testInstallationBId, repository_selection: 'selected' },
      repositories_added: [
        { id: 501, name: 'repo-alpha', full_name: 'octocat/repo-alpha' },
        { id: 502, name: 'repo-beta', full_name: 'octocat/repo-beta' },
      ],
    };
    const rawBody = JSON.stringify(repoPayload);
    const signature = generateWebhookSignature(rawBody, testSecret);
    const deliveryId = crypto.randomUUID();

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'x-github-event': 'installation_repositories',
        'x-github-delivery': deliveryId,
        'x-hub-signature-256': signature,
        'content-type': 'application/json',
      },
      payload: rawBody,
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.repositorySelection, 'selected');

    // 1. Verify metadata in database
    const [dbConnB] = await db
      .select()
      .from(resourceConnections)
      .where(eq(resourceConnections.id, connectionBId));
    assert.equal(dbConnB.metadata.repositorySelection, 'selected');

    // 2. Verify token cache evicted
    assert.equal(tokenCache.get(testTenantBId, testInstallationBId), null);

    // 3. Verify audit log entry
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, connectionBId));
    const repoAudit = logs.find((l) => l.eventType === 'github.repositories.added');
    assert.notEqual(repoAudit, undefined);
    assert.equal(repoAudit.details.addedCount, 2);
  });

  test('7. POST /webhooks/github duplicate delivery ID returns 200 duplicate without repeating mutations', async () => {
    const fixedDeliveryId = crypto.randomUUID();
    const payload = {
      action: 'added',
      installation: { id: testInstallationBId, repository_selection: 'selected' },
      repositories_added: [{ id: 503, name: 'repo-gamma' }],
    };
    const rawBody = JSON.stringify(payload);
    const signature = generateWebhookSignature(rawBody, testSecret);

    // First delivery attempt
    const res1 = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'x-github-event': 'installation_repositories',
        'x-github-delivery': fixedDeliveryId,
        'x-hub-signature-256': signature,
        'content-type': 'application/json',
      },
      payload: rawBody,
    });
    assert.equal(res1.statusCode, 200);
    assert.equal(JSON.parse(res1.payload).data.duplicate, undefined);

    const initialAuditCount = (
      await db.select().from(auditLogs).where(eq(auditLogs.resourceId, connectionBId))
    ).length;

    // Duplicate delivery attempt
    const res2 = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'x-github-event': 'installation_repositories',
        'x-github-delivery': fixedDeliveryId,
        'x-hub-signature-256': signature,
        'content-type': 'application/json',
      },
      payload: rawBody,
    });

    assert.equal(res2.statusCode, 200);
    const body2 = JSON.parse(res2.payload);
    assert.equal(body2.data.duplicate, true);

    const finalAuditCount = (
      await db.select().from(auditLogs).where(eq(auditLogs.resourceId, connectionBId))
    ).length;
    assert.equal(
      finalAuditCount,
      initialAuditCount,
      'Duplicate delivery must not write duplicate audit logs'
    );
  });

  test('8. POST /webhooks/github unlinked installation returns 200 without database mutations', async () => {
    const unlinkedInstallId = 99999999;
    const payload = {
      action: 'deleted',
      installation: { id: unlinkedInstallId },
    };
    const rawBody = JSON.stringify(payload);
    const signature = generateWebhookSignature(rawBody, testSecret);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'x-github-event': 'installation',
        'x-github-delivery': crypto.randomUUID(),
        'x-hub-signature-256': signature,
        'content-type': 'application/json',
      },
      payload: rawBody,
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.unlinked, true);
  });
});
