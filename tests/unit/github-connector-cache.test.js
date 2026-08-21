/**
 * @file Unit Tests for GitHub Connector In-Memory LRU Cache (Task P3-006)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GitHubConnectorCache,
  GITHUB_CACHE_TTL,
} from '../../src/connectors/github/github-connector-cache.js';
import { ValidationError } from '../../src/errors/index.js';

describe('GitHub Connector In-Memory LRU Cache Unit Tests (P3-006)', () => {
  let cache;
  const tenantA = 'tenant-aaa-111';
  const tenantB = 'tenant-bbb-222';
  const installationId = 155430459;

  beforeEach(() => {
    cache = new GitHubConnectorCache({
      maxEntries: 10,
      maxEntriesPerTenant: 5,
    });
  });

  // -------------------------------------------------------------------------
  // 1. Key Generation & Determinism
  // -------------------------------------------------------------------------
  describe('1. Key Generation & Determinism', () => {
    it('generates deterministic keys regardless of query parameter property order', () => {
      const key1 = cache.generateKey(tenantA, installationId, 'listResources', null, {
        limit: 50,
        page: 2,
      });
      const key2 = cache.generateKey(tenantA, installationId, 'listResources', null, {
        page: 2,
        limit: 50,
      });

      assert.strictEqual(key1, key2);
      assert.ok(key1.startsWith(`gh_cache:${tenantA}:${installationId}:listResources:root:`));
    });

    it('rejects invalid or missing mandatory key components', () => {
      assert.throws(() => cache.generateKey(null, installationId, 'getAccount'), ValidationError);
      assert.throws(() => cache.generateKey(tenantA, null, 'getAccount'), ValidationError);
      assert.throws(() => cache.generateKey(tenantA, installationId, ''), ValidationError);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Set, Get, Fresh Hits, and Stale Misses
  // -------------------------------------------------------------------------
  describe('2. Set, Get, Fresh Hits, and Expiration', () => {
    it('stores normalized data with ETag and retrieves a fresh hit', () => {
      const normalizedData = { id: '123', name: 'repo-one' };
      const success = cache.set(
        tenantA,
        installationId,
        'getResource',
        '123',
        {},
        { data: normalizedData, etag: 'W/"etag-123"' },
        300
      );

      assert.strictEqual(success, true);
      const entry = cache.get(tenantA, installationId, 'getResource', '123');

      assert.ok(entry);
      assert.deepStrictEqual(entry.data, normalizedData);
      assert.strictEqual(entry.etag, 'W/"etag-123"');
      assert.strictEqual(entry.isExpired, false);

      const stats = cache.getStats();
      assert.strictEqual(stats.hits, 1);
      assert.strictEqual(stats.misses, 0);
    });

    it('records a miss for nonexistent keys', () => {
      const entry = cache.get(tenantA, installationId, 'getResource', '999');
      assert.strictEqual(entry, null);

      const stats = cache.getStats();
      assert.strictEqual(stats.misses, 1);
      assert.strictEqual(stats.hits, 0);
    });

    it('marks entry as expired when current time exceeds expiresAt', () => {
      const normalizedData = { id: '123', name: 'repo-one' };
      cache.set(
        tenantA,
        installationId,
        'getResource',
        '123',
        {},
        { data: normalizedData, etag: 'W/"etag-123"' },
        -1 // expired immediately
      );

      const entry = cache.get(tenantA, installationId, 'getResource', '123');
      assert.ok(entry);
      assert.strictEqual(entry.isExpired, true);
      assert.strictEqual(entry.etag, 'W/"etag-123"');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Touch Revalidation on HTTP 304
  // -------------------------------------------------------------------------
  describe('3. Touch Revalidation on HTTP 304', () => {
    it('updates expiresAt and increments revalidations304 without altering cached data', () => {
      const normalizedData = { content: '# Hello World' };
      cache.set(
        tenantA,
        installationId,
        'getReadme',
        '123',
        {},
        { data: normalizedData, etag: 'W/"etag-readme"' },
        1
      );

      const beforeTouch = cache.get(tenantA, installationId, 'getReadme', '123');
      const touched = cache.touch(
        tenantA,
        installationId,
        'getReadme',
        '123',
        {},
        GITHUB_CACHE_TTL.GET_README
      );

      assert.strictEqual(touched, true);
      const afterTouch = cache.get(tenantA, installationId, 'getReadme', '123');

      assert.ok(afterTouch.expiresAt > beforeTouch.expiresAt);
      assert.strictEqual(afterTouch.isExpired, false);
      assert.deepStrictEqual(afterTouch.data, normalizedData);

      const stats = cache.getStats();
      assert.strictEqual(stats.revalidations304, 1);
    });

    it('returns false when touching a nonexistent key', () => {
      const touched = cache.touch(tenantA, installationId, 'getReadme', '999');
      assert.strictEqual(touched, false);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Payload Size Limits (> 1 MB Rejection)
  // -------------------------------------------------------------------------
  describe('4. Payload Size Bounds', () => {
    it('rejects caching payloads exceeding 1 MB', () => {
      const largeString = 'X'.repeat(1048577); // 1 MB + 1 byte
      const largePayload = { content: largeString };

      const success = cache.set(
        tenantA,
        installationId,
        'getFileContent',
        '123:large.txt',
        {},
        { data: largePayload },
        300
      );

      assert.strictEqual(success, false);
      const entry = cache.get(tenantA, installationId, 'getFileContent', '123:large.txt');
      assert.strictEqual(entry, null);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Multi-Tenant Isolation
  // -------------------------------------------------------------------------
  describe('5. Multi-Tenant Isolation', () => {
    it('prevents Tenant B from reading or accessing Tenant A cache entries', () => {
      const dataA = { secretRepo: 'internal-a' };
      cache.set(
        tenantA,
        installationId,
        'getResource',
        '100',
        {},
        { data: dataA, etag: 'W/"etag-a"' },
        300
      );

      // Tenant B queries same resource and installation
      const entryB = cache.get(tenantB, installationId, 'getResource', '100');
      assert.strictEqual(entryB, null);

      // Tenant A gets their data
      const entryA = cache.get(tenantA, installationId, 'getResource', '100');
      assert.deepStrictEqual(entryA.data, dataA);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Targeted Eviction (Installation, Operation, Resource, Tenant)
  // -------------------------------------------------------------------------
  describe('6. Targeted Eviction APIs', () => {
    beforeEach(() => {
      cache.set(tenantA, installationId, 'getResource', '101', {}, { data: { id: '101' } }, 300);
      cache.set(tenantA, installationId, 'getResource', '102', {}, { data: { id: '102' } }, 300);
      cache.set(
        tenantA,
        installationId,
        'listResources',
        null,
        { page: 1 },
        { data: { items: [] } },
        300
      );
      cache.set(tenantB, installationId, 'getResource', '101', {}, { data: { id: '101-b' } }, 300);
    });

    it('evicts specific resource for an operation', () => {
      const count = cache.evict(tenantA, installationId, 'getResource', '101');
      assert.strictEqual(count, 1);

      assert.strictEqual(cache.get(tenantA, installationId, 'getResource', '101'), null);
      assert.ok(cache.get(tenantA, installationId, 'getResource', '102'));
      assert.ok(cache.get(tenantB, installationId, 'getResource', '101')); // Tenant B untouched
    });

    it('evicts all entries for a specific operation', () => {
      const count = cache.evict(tenantA, installationId, 'getResource', null);
      assert.strictEqual(count, 2);

      assert.strictEqual(cache.get(tenantA, installationId, 'getResource', '101'), null);
      assert.strictEqual(cache.get(tenantA, installationId, 'getResource', '102'), null);
      assert.ok(cache.get(tenantA, installationId, 'listResources', null, { page: 1 }));
    });

    it('evicts all entries for tenant + installation', () => {
      const count = cache.evict(tenantA, installationId);
      assert.strictEqual(count, 3);

      assert.strictEqual(cache.get(tenantA, installationId, 'getResource', '101'), null);
      assert.strictEqual(
        cache.get(tenantA, installationId, 'listResources', null, { page: 1 }),
        null
      );
      assert.ok(cache.get(tenantB, installationId, 'getResource', '101'));
    });

    it('evicts all entries for an entire tenant', () => {
      const count = cache.evictTenant(tenantA);
      assert.strictEqual(count, 3);

      assert.ok(cache.get(tenantB, installationId, 'getResource', '101'));
    });

    it('clears all entries across all tenants on clear()', () => {
      cache.clear();
      assert.strictEqual(cache.getStats().size, 0);
    });
  });

  // -------------------------------------------------------------------------
  // 7. LRU Eviction & Capacity Ceilings
  // -------------------------------------------------------------------------
  describe('7. LRU Eviction & Capacity Ceilings', () => {
    it('enforces per-tenant capacity limit (5 entries) by evicting oldest tenant item', () => {
      for (let i = 1; i <= 5; i++) {
        cache.set(
          tenantA,
          installationId,
          'getResource',
          String(i),
          {},
          { data: { id: String(i) } },
          300
        );
      }

      assert.strictEqual(cache.getStats().size, 5);

      // Adding 6th entry for Tenant A should evict resource '1'
      cache.set(tenantA, installationId, 'getResource', '6', {}, { data: { id: '6' } }, 300);

      assert.strictEqual(cache.get(tenantA, installationId, 'getResource', '1'), null);
      assert.ok(cache.get(tenantA, installationId, 'getResource', '6'));
      assert.strictEqual(cache.getStats().evictions, 1);
    });

    it('enforces global capacity limit (10 entries) across multiple tenants', () => {
      // 5 entries for Tenant A
      for (let i = 1; i <= 5; i++) {
        cache.set(
          tenantA,
          installationId,
          'getResource',
          String(i),
          {},
          { data: { id: String(i) } },
          300
        );
      }

      // 5 entries for Tenant B
      for (let i = 1; i <= 5; i++) {
        cache.set(
          tenantB,
          installationId,
          'getResource',
          String(i),
          {},
          { data: { id: String(i) } },
          300
        );
      }

      assert.strictEqual(cache.getStats().size, 10);

      // Add 11th entry
      const tenantC = 'tenant-ccc-333';
      cache.set(tenantC, installationId, 'getResource', '99', {}, { data: { id: '99' } }, 300);

      assert.strictEqual(cache.getStats().size, 10);
      assert.strictEqual(cache.get(tenantA, installationId, 'getResource', '1'), null); // oldest evicted
      assert.ok(cache.get(tenantC, installationId, 'getResource', '99'));
    });
  });
});
