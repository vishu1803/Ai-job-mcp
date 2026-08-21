/**
 * @file Unit Tests for GitHub Webhook Service & Delivery Cache (Task P3-003)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WebhookDeliveryCache } from '../../src/services/webhook-delivery-cache.js';
import { GitHubWebhookService } from '../../src/services/github-webhook.service.js';
import { generateWebhookSignature } from '../../src/security/webhook-signature.js';

describe('GitHub Webhook Service & Delivery Cache Unit Tests (P3-003)', () => {
  const testSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  describe('1. WebhookDeliveryCache', () => {
    test('tracks delivery ID and detects duplicates within TTL', () => {
      let mockTime = 1000000;
      const cache = new WebhookDeliveryCache({
        ttlMs: 5000,
        nowFn: () => mockTime,
      });

      const deliveryId = '7f8b9a2c-d4e5-4a1b-9c8e-3f2a1b0c9d8e';

      assert.equal(cache.has(deliveryId), false, 'Initial lookup must be false');
      cache.set(deliveryId);
      assert.equal(cache.has(deliveryId), true, 'Lookup after set must be true');
      assert.equal(cache.size(), 1);

      // Advance time beyond TTL
      mockTime += 6000;
      assert.equal(cache.has(deliveryId), false, 'Lookup after TTL expiry must be false');
      assert.equal(cache.size(), 0);
    });

    test('enforces bounded capacity with FIFO eviction', () => {
      const cache = new WebhookDeliveryCache({
        maxSize: 3,
      });

      cache.set('del-1');
      cache.set('del-2');
      cache.set('del-3');
      assert.equal(cache.size(), 3);

      cache.set('del-4');
      assert.equal(cache.size(), 3, 'Capacity must not exceed maxSize');
      assert.equal(cache.has('del-1'), false, 'Oldest item del-1 must be evicted');
      assert.equal(cache.has('del-2'), true);
      assert.equal(cache.has('del-4'), true);
    });
  });

  describe('2. Header & Ingress Validation', () => {
    const service = new GitHubWebhookService({
      webhookSecret: testSecret,
    });

    test('throws 400 when X-GitHub-Event header is missing', async () => {
      const payload = { action: 'deleted' };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = generateWebhookSignature(rawBody, testSecret);

      await assert.rejects(
        async () => {
          await service.processWebhook({
            headers: {
              'x-github-delivery': 'guid-123',
              'x-hub-signature-256': signature,
            },
            rawBody,
            payload,
          });
        },
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.code, 'MISSING_EVENT_HEADER');
          return true;
        }
      );
    });

    test('throws 400 when X-GitHub-Delivery header is missing', async () => {
      const payload = { action: 'deleted' };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = generateWebhookSignature(rawBody, testSecret);

      await assert.rejects(
        async () => {
          await service.processWebhook({
            headers: {
              'x-github-event': 'installation',
              'x-hub-signature-256': signature,
            },
            rawBody,
            payload,
          });
        },
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.code, 'MISSING_DELIVERY_HEADER');
          return true;
        }
      );
    });

    test('throws 401 when signature is invalid or tampered', async () => {
      const payload = { action: 'deleted' };
      const rawBody = Buffer.from(JSON.stringify(payload));

      await assert.rejects(
        async () => {
          await service.processWebhook({
            headers: {
              'x-github-event': 'installation',
              'x-github-delivery': 'guid-123',
              'x-hub-signature-256':
                'sha256=0000000000000000000000000000000000000000000000000000000000000000',
            },
            rawBody,
            payload,
          });
        },
        (err) => {
          assert.equal(err.statusCode, 401);
          assert.equal(err.code, 'INVALID_WEBHOOK_SIGNATURE');
          return true;
        }
      );
    });
  });

  describe('3. Event Routing & Lifecycle Service Actions', () => {
    test('handles ping event successfully', async () => {
      const deliveryCache = new WebhookDeliveryCache();
      const service = new GitHubWebhookService({
        webhookSecret: testSecret,
        deliveryCache,
      });

      const payload = { zen: 'Keep it logically awesome.', hook_id: 998877 };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = generateWebhookSignature(rawBody, testSecret);

      const result = await service.processWebhook({
        headers: {
          'x-github-event': 'ping',
          'x-github-delivery': 'del-ping-1',
          'x-hub-signature-256': signature,
        },
        rawBody,
        payload,
      });

      assert.equal(result.success, true);
      assert.equal(result.ping, true);
      assert.equal(result.hookId, 998877);
    });

    test('deduplicates repeat delivery ID and returns 200 without executing side effects', async () => {
      const deliveryCache = new WebhookDeliveryCache();
      const service = new GitHubWebhookService({
        webhookSecret: testSecret,
        deliveryCache,
      });

      const payload = { zen: 'Keep it logically awesome.' };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = generateWebhookSignature(rawBody, testSecret);

      const firstRes = await service.processWebhook({
        headers: {
          'x-github-event': 'ping',
          'x-github-delivery': 'del-repeat-1',
          'x-hub-signature-256': signature,
        },
        rawBody,
        payload,
      });

      assert.equal(firstRes.success, true);
      assert.equal(firstRes.duplicate, undefined);

      const secondRes = await service.processWebhook({
        headers: {
          'x-github-event': 'ping',
          'x-github-delivery': 'del-repeat-1',
          'x-hub-signature-256': signature,
        },
        rawBody,
        payload,
      });

      assert.equal(secondRes.success, true);
      assert.equal(secondRes.duplicate, true);
      assert.equal(secondRes.event, 'ping');
    });

    test('acknowledges unsupported event types safely with 200', async () => {
      const deliveryCache = new WebhookDeliveryCache();
      const service = new GitHubWebhookService({
        webhookSecret: testSecret,
        deliveryCache,
      });

      const payload = { action: 'starred' };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = generateWebhookSignature(rawBody, testSecret);

      const result = await service.processWebhook({
        headers: {
          'x-github-event': 'star',
          'x-github-delivery': 'del-star-1',
          'x-hub-signature-256': signature,
        },
        rawBody,
        payload,
      });

      assert.equal(result.success, true);
      assert.equal(result.ignored, true);
      assert.equal(result.event, 'star');
      assert.equal(result.reason, 'unsupported_event');
    });
  });

  describe('4. Mock Database & Token Cache Lifecycle Invariant Tests', () => {
    test('installation.deleted transitions status to REVOKED, evicts token cache, and emits audit log', async () => {
      const testTenantId = 'tenant-uuid-111';
      const testInstallationId = 12345678;
      const testConnId = 'conn-uuid-111';

      let updatedData = null;
      let auditedRecord = null;
      let evictedTenantId = null;
      let evictedInstallId = null;

      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => [
                {
                  id: testConnId,
                  tenantId: testTenantId,
                  userId: 'user-uuid-111',
                  installationId: String(testInstallationId),
                  externalAccountId: '887766',
                  externalAccountName: 'octocat',
                  status: 'ACTIVE',
                },
              ],
            }),
          }),
        }),
        update: () => ({
          set: (data) => ({
            where: async () => {
              updatedData = data;
              return [];
            },
          }),
        }),
        insert: () => ({
          values: async (record) => {
            auditedRecord = record;
            return [];
          },
        }),
      };

      const mockTokenCache = {
        evict: (tId, iId) => {
          evictedTenantId = tId;
          evictedInstallId = iId;
        },
      };

      const service = new GitHubWebhookService({
        db: mockDb,
        tokenCache: mockTokenCache,
        webhookSecret: testSecret,
      });

      const payload = {
        action: 'deleted',
        installation: { id: testInstallationId },
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = generateWebhookSignature(rawBody, testSecret);

      const result = await service.processWebhook({
        headers: {
          'x-github-event': 'installation',
          'x-github-delivery': 'del-inst-del-1',
          'x-hub-signature-256': signature,
        },
        rawBody,
        payload,
      });

      assert.equal(result.success, true);
      assert.equal(result.action, 'deleted');
      assert.equal(result.connectionId, testConnId);
      assert.equal(result.tenantId, testTenantId);

      // Verify DB update
      assert.equal(updatedData.status, 'REVOKED');
      assert.equal(updatedData.lastErrorCode, 'APP_UNINSTALLED');

      // Verify token cache eviction
      assert.equal(evictedTenantId, testTenantId);
      assert.equal(evictedInstallId, testInstallationId);

      // Verify audit log
      assert.equal(auditedRecord.eventType, 'github.installation.deleted');
      assert.equal(auditedRecord.tenantId, testTenantId);
      assert.equal(auditedRecord.details.installationId, String(testInstallationId));
    });

    test('installation.suspend transitions status to REVOKED and evicts token cache', async () => {
      const testTenantId = 'tenant-uuid-222';
      const testInstallationId = 22223333;
      const testConnId = 'conn-uuid-222';

      let updatedData = null;
      let evictedTenantId = null;

      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => [
                {
                  id: testConnId,
                  tenantId: testTenantId,
                  userId: 'user-uuid-222',
                  installationId: String(testInstallationId),
                  externalAccountId: '998877',
                  status: 'ACTIVE',
                },
              ],
            }),
          }),
        }),
        update: () => ({
          set: (data) => ({
            where: async () => {
              updatedData = data;
              return [];
            },
          }),
        }),
        insert: () => ({
          values: async () => [],
        }),
      };

      const mockTokenCache = {
        evict: (tId) => {
          evictedTenantId = tId;
        },
      };

      const service = new GitHubWebhookService({
        db: mockDb,
        tokenCache: mockTokenCache,
        webhookSecret: testSecret,
      });

      const payload = {
        action: 'suspend',
        installation: { id: testInstallationId, suspended_at: '2026-08-21T12:00:00Z' },
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = generateWebhookSignature(rawBody, testSecret);

      const result = await service.processWebhook({
        headers: {
          'x-github-event': 'installation',
          'x-github-delivery': 'del-suspend-1',
          'x-hub-signature-256': signature,
        },
        rawBody,
        payload,
      });

      assert.equal(result.success, true);
      assert.equal(result.action, 'suspend');
      assert.equal(updatedData.status, 'REVOKED');
      assert.equal(updatedData.lastErrorCode, 'INSTALLATION_SUSPENDED');
      assert.equal(evictedTenantId, testTenantId);
    });

    test('installation.unsuspend restores status to ACTIVE and clears error fields', async () => {
      const testTenantId = 'tenant-uuid-333';
      const testInstallationId = 33334444;
      const testConnId = 'conn-uuid-333';

      let updatedData = null;

      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => [
                {
                  id: testConnId,
                  tenantId: testTenantId,
                  userId: 'user-uuid-333',
                  installationId: String(testInstallationId),
                  status: 'REVOKED',
                },
              ],
            }),
          }),
        }),
        update: () => ({
          set: (data) => ({
            where: async () => {
              updatedData = data;
              return [];
            },
          }),
        }),
        insert: () => ({
          values: async () => [],
        }),
      };

      const service = new GitHubWebhookService({
        db: mockDb,
        webhookSecret: testSecret,
      });

      const payload = {
        action: 'unsuspend',
        installation: { id: testInstallationId },
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = generateWebhookSignature(rawBody, testSecret);

      const result = await service.processWebhook({
        headers: {
          'x-github-event': 'installation',
          'x-github-delivery': 'del-unsuspend-1',
          'x-hub-signature-256': signature,
        },
        rawBody,
        payload,
      });

      assert.equal(result.success, true);
      assert.equal(result.action, 'unsuspend');
      assert.equal(updatedData.status, 'ACTIVE');
      assert.equal(updatedData.lastErrorCode, null);
      assert.equal(updatedData.lastErrorAt, null);
    });

    test('installation_repositories.added updates repositorySelection metadata and evicts token cache', async () => {
      const testTenantId = 'tenant-uuid-444';
      const testInstallationId = 44445555;
      const testConnId = 'conn-uuid-444';

      let updatedData = null;
      let evictedTenantId = null;

      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => [
                {
                  id: testConnId,
                  tenantId: testTenantId,
                  userId: 'user-uuid-444',
                  installationId: String(testInstallationId),
                  status: 'ACTIVE',
                  metadata: { repositorySelection: 'selected', targetType: 'User' },
                },
              ],
            }),
          }),
        }),
        update: () => ({
          set: (data) => ({
            where: async () => {
              updatedData = data;
              return [];
            },
          }),
        }),
        insert: () => ({
          values: async () => [],
        }),
      };

      const mockTokenCache = {
        evict: (tId) => {
          evictedTenantId = tId;
        },
      };

      const service = new GitHubWebhookService({
        db: mockDb,
        tokenCache: mockTokenCache,
        webhookSecret: testSecret,
      });

      const payload = {
        action: 'added',
        installation: { id: testInstallationId, repository_selection: 'selected' },
        repositories_added: [{ id: 101, name: 'repo-one', full_name: 'octocat/repo-one' }],
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = generateWebhookSignature(rawBody, testSecret);

      const result = await service.processWebhook({
        headers: {
          'x-github-event': 'installation_repositories',
          'x-github-delivery': 'del-repos-add-1',
          'x-hub-signature-256': signature,
        },
        rawBody,
        payload,
      });

      assert.equal(result.success, true);
      assert.equal(result.action, 'added');
      assert.equal(updatedData.metadata.repositorySelection, 'selected');
      assert.equal(evictedTenantId, testTenantId);
    });

    test('monotonic guard: inactive connection (REVOKED) ignores subsequent repository events', async () => {
      const testTenantId = 'tenant-uuid-555';
      const testInstallationId = 55556666;
      let updateExecuted = false;

      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => [
                {
                  id: 'conn-uuid-555',
                  tenantId: testTenantId,
                  userId: 'user-uuid-555',
                  installationId: String(testInstallationId),
                  status: 'REVOKED',
                  metadata: { repositorySelection: 'selected' },
                },
              ],
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: async () => {
              updateExecuted = true;
              return [];
            },
          }),
        }),
      };

      const service = new GitHubWebhookService({
        db: mockDb,
        webhookSecret: testSecret,
      });

      const payload = {
        action: 'added',
        installation: { id: testInstallationId },
        repositories_added: [{ id: 102, name: 'repo-delayed' }],
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = generateWebhookSignature(rawBody, testSecret);

      const result = await service.processWebhook({
        headers: {
          'x-github-event': 'installation_repositories',
          'x-github-delivery': 'del-delayed-repo-1',
          'x-hub-signature-256': signature,
        },
        rawBody,
        payload,
      });

      assert.equal(result.success, true);
      assert.equal(result.ignored, true);
      assert.equal(result.reason, 'connection_inactive');
      assert.equal(
        updateExecuted,
        false,
        'Inactive connection must NOT be updated by delayed repo event'
      );
    });

    test('unlinked installation returns 200 without database mutations', async () => {
      let updateExecuted = false;

      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => [], // No connection found
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: async () => {
              updateExecuted = true;
              return [];
            },
          }),
        }),
      };

      const service = new GitHubWebhookService({
        db: mockDb,
        webhookSecret: testSecret,
      });

      const payload = {
        action: 'deleted',
        installation: { id: 99999999 },
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const signature = generateWebhookSignature(rawBody, testSecret);

      const result = await service.processWebhook({
        headers: {
          'x-github-event': 'installation',
          'x-github-delivery': 'del-unlinked-1',
          'x-hub-signature-256': signature,
        },
        rawBody,
        payload,
      });

      assert.equal(result.success, true);
      assert.equal(result.unlinked, true);
      assert.equal(updateExecuted, false, 'Unlinked installation must not mutate database');
    });
  });
});
