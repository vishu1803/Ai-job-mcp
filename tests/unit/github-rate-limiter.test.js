/**
 * @file Unit Tests for GitHub Rate Limiter (Task P3-006)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubRateLimiter } from '../../src/connectors/github/github-rate-limiter.js';
import { ProviderRateLimitError } from '../../src/connectors/errors/connector-errors.js';

describe('GitHub Rate Limiter Unit Tests (P3-006)', () => {
  let rateLimiter;
  const tenantA = 'tenant-aaa-111';
  const tenantB = 'tenant-bbb-222';
  const installationId = 155430459;

  beforeEach(() => {
    rateLimiter = new GitHubRateLimiter();
  });

  // -------------------------------------------------------------------------
  // 1. Header Parsing
  // -------------------------------------------------------------------------
  describe('1. Response Header Parsing', () => {
    it('parses standard GitHub rate-limit headers correctly', () => {
      const resetEpoch = Math.floor(Date.now() / 1000) + 1800; // 30 mins ahead
      const headers = {
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '4950',
        'x-ratelimit-reset': String(resetEpoch),
      };

      const quota = rateLimiter.updateFromHeaders(tenantA, installationId, headers);

      assert.ok(quota);
      assert.strictEqual(quota.limit, 5000);
      assert.strictEqual(quota.remaining, 4950);
      assert.strictEqual(quota.resetAt.getTime(), resetEpoch * 1000);

      const fetched = rateLimiter.getQuota(tenantA, installationId);
      assert.deepStrictEqual(fetched, {
        limit: 5000,
        remaining: 4950,
        resetAt: new Date(resetEpoch * 1000),
      });
    });

    it('handles Map/Headers instance with get() method case-insensitively', () => {
      const resetEpoch = Math.floor(Date.now() / 1000) + 3600;
      const headersMap = new Map([
        ['X-RateLimit-Limit', '5000'],
        ['X-RateLimit-Remaining', '100'],
        ['X-RateLimit-Reset', String(resetEpoch)],
      ]);

      const quota = rateLimiter.updateFromHeaders(tenantA, installationId, headersMap);

      assert.ok(quota);
      assert.strictEqual(quota.remaining, 100);
    });

    it('returns null when rate-limit headers are absent', () => {
      const quota = rateLimiter.updateFromHeaders(tenantA, installationId, {});
      assert.strictEqual(quota, null);
      assert.strictEqual(rateLimiter.getQuota(tenantA, installationId), null);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Tenant & Installation Isolation
  // -------------------------------------------------------------------------
  describe('2. Namespace Isolation', () => {
    it('isolates quota tracking between different tenants and installations', () => {
      rateLimiter.updateFromHeaders(tenantA, installationId, {
        'x-ratelimit-remaining': '2500',
      });
      rateLimiter.updateFromHeaders(tenantB, installationId, {
        'x-ratelimit-remaining': '10',
      });

      assert.strictEqual(rateLimiter.getQuota(tenantA, installationId).remaining, 2500);
      assert.strictEqual(rateLimiter.getQuota(tenantB, installationId).remaining, 10);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Quota Assertion & Throttling
  // -------------------------------------------------------------------------
  describe('3. Quota Assertion & Throttling', () => {
    it('allows requests when quota is healthy (> 5)', async () => {
      rateLimiter.updateFromHeaders(tenantA, installationId, {
        'x-ratelimit-remaining': '100',
      });

      // Should complete immediately without error
      await rateLimiter.assertAvailableQuota(tenantA, installationId);
    });

    it('applies artificial throttling delay when remaining <= 5', async () => {
      rateLimiter.updateFromHeaders(tenantA, installationId, {
        'x-ratelimit-remaining': '3',
      });

      const startTime = Date.now();
      await rateLimiter.assertAvailableQuota(tenantA, installationId);
      const elapsed = Date.now() - startTime;

      // remaining=3 -> (6 - 3) * 100 = 300ms delay
      assert.ok(elapsed >= 250, `Expected throttling delay >= 250ms, got ${elapsed}ms`);
    });

    it('throws ProviderRateLimitError when remaining is 0', async () => {
      const resetEpoch = Math.floor(Date.now() / 1000) + 60;
      rateLimiter.updateFromHeaders(tenantA, installationId, {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(resetEpoch),
      });

      await assert.rejects(
        async () => rateLimiter.assertAvailableQuota(tenantA, installationId),
        (err) => {
          assert.ok(err instanceof ProviderRateLimitError);
          assert.strictEqual(err.provider, 'GITHUB_APP');
          assert.ok(err.retryAfter >= 1);
          return true;
        }
      );
    });

    it('clears expired quota state when reset timestamp has passed', async () => {
      const pastEpoch = Math.floor(Date.now() / 1000) - 10; // 10s in past
      rateLimiter.updateFromHeaders(tenantA, installationId, {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(pastEpoch),
      });

      // Should not throw because reset window elapsed
      await rateLimiter.assertAvailableQuota(tenantA, installationId);
      assert.strictEqual(rateLimiter.getQuota(tenantA, installationId), null);
    });
  });
});
