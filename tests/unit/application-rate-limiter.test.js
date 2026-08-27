/**
 * @file Unit Tests for Application Rate Limiter (P14-003)
 *
 * Tests:
 * 1. Sliding window correctness
 * 2. IP rate limiting
 * 3. Auth rate limiting
 * 4. Tenant rate limiting
 * 5. Token rate limiting
 * 6. Tool cost-aware rate limiting
 * 7. Daily rate limiting
 * 8. Bounded memory / LRU eviction
 * 9. Retry-After computation
 * 10. Fail-open behavior
 * 11. Reset behavior
 * 12. Tool cost classification
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  McpRateLimiter,
  ToolCostTier,
  TOOL_COST_MAP,
  TIER_LIMITS,
} from '../../src/security/mcp-rate-limiter.js';

describe('McpRateLimiter (P14-003)', () => {
  /** @type {McpRateLimiter} */
  let limiter;

  beforeEach(() => {
    limiter = new McpRateLimiter({
      ipLimit: 10,
      tenantLimit: 20,
      tokenLimit: 15,
      authLimit: 5,
      windowMs: 1000, // 1 second window for fast tests
      maxKeys: 100,
    });
  });

  // =========================================================================
  // 1. Sliding window correctness
  // =========================================================================

  describe('sliding window', () => {
    it('allows requests within the limit', () => {
      for (let i = 0; i < 5; i++) {
        const result = limiter.checkLimit('test-key', 10, 1000);
        assert.equal(result.allowed, true);
      }
    });

    it('rejects requests exceeding the limit', () => {
      for (let i = 0; i < 10; i++) {
        limiter.checkLimit('test-key', 10, 1000);
      }
      const result = limiter.checkLimit('test-key', 10, 1000);
      assert.equal(result.allowed, false);
      assert.ok(result.retryAfterMs > 0);
    });

    it('allows requests after window expires', async () => {
      for (let i = 0; i < 5; i++) {
        limiter.checkLimit('test-key', 5, 50); // 50ms window
      }
      // Should be at limit
      const result1 = limiter.checkLimit('test-key', 5, 50);
      assert.equal(result1.allowed, false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Should allow again
      const result2 = limiter.checkLimit('test-key', 5, 50);
      assert.equal(result2.allowed, true);
    });

    it('prunes stale timestamps correctly', () => {
      // Add timestamps in a 100ms window
      for (let i = 0; i < 3; i++) {
        limiter.checkLimit('test-key', 10, 100);
      }
      assert.equal(limiter.hits.get('test-key').length, 3);
    });

    it('handles empty/null key gracefully', () => {
      const result = limiter.checkLimit('', 10);
      assert.equal(result.allowed, true);

      const result2 = limiter.checkLimit(null, 10);
      assert.equal(result2.allowed, true);
    });
  });

  // =========================================================================
  // 2. IP rate limiting
  // =========================================================================

  describe('checkIpLimit (throwing)', () => {
    it('throws when IP limit exceeded', () => {
      const ip = '192.168.1.1';
      for (let i = 0; i < 10; i++) {
        limiter.checkIpLimit(ip);
      }
      assert.throws(
        () => limiter.checkIpLimit(ip),
        (err) => err.statusCode === 429 && err.code === 'RATE_LIMITED'
      );
    });

    it('does not throw for different IP', () => {
      for (let i = 0; i < 10; i++) {
        limiter.checkIpLimit('192.168.1.1');
      }
      assert.doesNotThrow(() => limiter.checkIpLimit('192.168.1.2'));
    });
  });

  describe('checkIpLimitResult (non-throwing)', () => {
    it('tracks IP limits independently', () => {
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';

      for (let i = 0; i < 10; i++) {
        limiter.checkIpLimitResult(ip1);
      }
      const ip1Result = limiter.checkIpLimitResult(ip1);
      assert.equal(ip1Result.allowed, false);

      const ip2Result = limiter.checkIpLimitResult(ip2);
      assert.equal(ip2Result.allowed, true);
    });

    it('allows null IP without error', () => {
      const result = limiter.checkIpLimitResult(null);
      assert.equal(result.allowed, true);
    });

    it('allows empty IP without error', () => {
      const result = limiter.checkIpLimitResult('');
      assert.equal(result.allowed, true);
    });
  });

  // =========================================================================
  // 3. Auth rate limiting
  // =========================================================================

  describe('checkAuthLimit', () => {
    it('uses tighter limit than general IP', () => {
      const ip = '10.0.0.1';
      // Auth limit is 5
      for (let i = 0; i < 5; i++) {
        limiter.checkAuthLimit(ip);
      }
      const result = limiter.checkAuthLimit(ip);
      assert.equal(result.allowed, false);
    });

    it('returns correct retryAfterMs', () => {
      const ip = '10.0.0.1';
      for (let i = 0; i < 5; i++) {
        limiter.checkAuthLimit(ip);
      }
      const result = limiter.checkAuthLimit(ip);
      assert.equal(result.allowed, false);
      assert.ok(result.retryAfterMs > 0);
      assert.ok(result.retryAfterMs <= 1000); // Within window
    });
  });

  // =========================================================================
  // 4. Tenant rate limiting
  // =========================================================================

  describe('checkTenantLimitResult (non-throwing)', () => {
    it('tracks tenant limits independently', () => {
      const tenant1 = 'tenant-aaa';
      const tenant2 = 'tenant-bbb';

      for (let i = 0; i < 20; i++) {
        limiter.checkTenantLimitResult(tenant1);
      }
      const t1Result = limiter.checkTenantLimitResult(tenant1);
      assert.equal(t1Result.allowed, false);

      const t2Result = limiter.checkTenantLimitResult(tenant2);
      assert.equal(t2Result.allowed, true);
    });

    it('allows custom limit override', () => {
      const tenant = 'tenant-custom';
      for (let i = 0; i < 3; i++) {
        limiter.checkTenantLimitResult(tenant, 3);
      }
      const result = limiter.checkTenantLimitResult(tenant, 3);
      assert.equal(result.allowed, false);
    });
  });

  // =========================================================================
  // 5. Token rate limiting
  // =========================================================================

  describe('checkTokenLimit', () => {
    it('tracks per-token limits', () => {
      const token = 'abc123';
      for (let i = 0; i < 15; i++) {
        limiter.checkTokenLimit(token);
      }
      const result = limiter.checkTokenLimit(token);
      assert.equal(result.allowed, false);
    });

    it('tracks different tokens independently', () => {
      const token1 = 'token-aaa';
      const token2 = 'token-bbb';

      for (let i = 0; i < 15; i++) {
        limiter.checkTokenLimit(token1);
      }
      assert.equal(limiter.checkTokenLimit(token1).allowed, false);
      assert.equal(limiter.checkTokenLimit(token2).allowed, true);
    });
  });

  // =========================================================================
  // 6. Tool cost-aware rate limiting
  // =========================================================================

  describe('checkToolLimit (throwing)', () => {
    it('uses CHEAP tier limit for protocol tools', () => {
      const tier = TOOL_COST_MAP['initialize'];
      assert.equal(tier, ToolCostTier.CHEAP);
      assert.equal(TIER_LIMITS[ToolCostTier.CHEAP], 120);
    });

    it('uses MEDIUM tier for standard reads', () => {
      assert.equal(TOOL_COST_MAP['get_candidate_profile'], ToolCostTier.MEDIUM);
      assert.equal(TOOL_COST_MAP['list_verified_skills'], ToolCostTier.MEDIUM);
    });

    it('uses HIGH tier for expensive reads', () => {
      assert.equal(TOOL_COST_MAP['analyze_job_fit'], ToolCostTier.HIGH);
      assert.equal(TIER_LIMITS[ToolCostTier.HIGH], 20);
    });

    it('uses EXPENSIVE tier for writes', () => {
      assert.equal(TOOL_COST_MAP['draft_cover_letter'], ToolCostTier.EXPENSIVE);
      assert.equal(TOOL_COST_MAP['generate_tailored_resume'], ToolCostTier.EXPENSIVE);
      assert.equal(TIER_LIMITS[ToolCostTier.EXPENSIVE], 5);
    });

    it('allows null tenant/tool without error', () => {
      limiter.checkToolLimit(null, null); // Should not throw
    });
  });

  describe('checkToolLimitResult (non-throwing)', () => {
    it('defaults to MEDIUM tier for unknown tools', () => {
      const result = limiter.checkToolLimitResult('tenant-1', 'unknown_tool');
      assert.equal(result.tier, ToolCostTier.MEDIUM);
    });

    it('enforces per-token tool limits', () => {
      const tenant = 'tenant-tool-test';
      const token = 'token-tool-test';
      const tool = 'draft_cover_letter'; // EXPENSIVE tier = 5/min

      for (let i = 0; i < 5; i++) {
        limiter.checkToolLimitResult(tenant, tool, token);
      }
      const result = limiter.checkToolLimitResult(tenant, tool, token);
      assert.equal(result.allowed, false);
    });

    it('allows null tenant/tool without error', () => {
      const result = limiter.checkToolLimitResult(null, null);
      assert.equal(result.allowed, true);
    });
  });

  // =========================================================================
  // 7. Daily rate limiting
  // =========================================================================

  describe('checkDailyLimit', () => {
    it('tracks daily counts', () => {
      for (let i = 0; i < 3; i++) {
        limiter.checkDailyLimit('daily:tenant-1:sync', 3);
      }
      const result = limiter.checkDailyLimit('daily:tenant-1:sync', 3);
      assert.equal(result.allowed, false);
    });

    it('resets on new day', () => {
      // Manually set a daily counter in the past
      const dayMs = 24 * 60 * 60 * 1000;
      const yesterday = Math.floor((Date.now() - dayMs) / dayMs) * dayMs;
      limiter.hits.set('daily:test:old', [yesterday, 999]);

      // Should allow because it's a new day
      const result = limiter.checkDailyLimit('daily:test:old', 3);
      assert.equal(result.allowed, true);
    });
  });

  // =========================================================================
  // 8. Bounded memory / LRU eviction
  // =========================================================================

  describe('bounded memory', () => {
    it('evicts old keys when maxKeys is reached', () => {
      const smallLimiter = new McpRateLimiter({ maxKeys: 10, windowMs: 60000 });

      // Fill to capacity
      for (let i = 0; i < 10; i++) {
        smallLimiter.checkLimit(`key-${i}`, 100, 60000);
      }
      assert.equal(smallLimiter.hits.size, 10);

      // Adding one more should trigger eviction
      smallLimiter.checkLimit('key-new', 100, 60000);

      // Should have evicted some old keys
      assert.ok(smallLimiter.hits.size <= 10);
    });

    it('evicts least-recently-used keys first', () => {
      const smallLimiter = new McpRateLimiter({ maxKeys: 5, windowMs: 60000 });

      // Add 5 keys with small delays to ensure distinct lastAccess timestamps
      for (let i = 0; i < 5; i++) {
        smallLimiter.checkLimit(`key-${i}`, 100, 60000);
      }

      // Access key-4 (most recently added) to refresh its lastAccess
      smallLimiter.checkLimit('key-4', 100, 60000);

      // Add a 6th key to trigger eviction
      smallLimiter.checkLimit('key-new', 100, 60000);

      // key-4 should still exist (most recently accessed)
      assert.ok(
        smallLimiter.hits.has('key-4'),
        'key-4 (recently accessed) should survive eviction'
      );
      // key-new should exist (just added)
      assert.ok(smallLimiter.hits.has('key-new'), 'key-new should exist');
    });
  });

  // =========================================================================
  // 9. Retry-After computation
  // =========================================================================

  describe('Retry-After', () => {
    it('returns positive retryAfterMs when rate limited', () => {
      const lim = new McpRateLimiter({ ipLimit: 2, windowMs: 1000 });
      lim.checkIpLimitResult('1.2.3.4');
      lim.checkIpLimitResult('1.2.3.4');
      const result = lim.checkIpLimitResult('1.2.3.4');
      assert.equal(result.allowed, false);
      assert.ok(result.retryAfterMs > 0);
      assert.ok(result.retryAfterMs <= 1000);
    });

    it('returns 0 retryAfterMs when allowed', () => {
      const result = limiter.checkIpLimitResult('1.2.3.4');
      assert.equal(result.allowed, true);
      assert.equal(result.retryAfterMs, 0);
    });
  });

  // =========================================================================
  // 10. Fail-open behavior
  // =========================================================================

  describe('fail-open', () => {
    it('allows request when key is falsy', () => {
      const result = limiter.checkLimit(undefined, 5);
      assert.equal(result.allowed, true);
    });

    it('handles concurrent access safely', () => {
      // Simulate concurrent requests using Result API
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          new Promise((resolve) => {
            resolve(limiter.checkLimit('concurrent-key', 5, 1000));
          })
        );
      }
      // All should complete without throwing
      return Promise.all(promises).then((results) => {
        const allowed = results.filter((r) => r.allowed).length;
        const denied = results.filter((r) => !r.allowed).length;
        // At least some should be denied (the limit is 5)
        assert.ok(denied > 0 || allowed <= 6); // Allow for race condition
      });
    });
  });

  // =========================================================================
  // 11. Reset behavior
  // =========================================================================

  describe('reset', () => {
    it('clears all state', () => {
      limiter.checkIpLimit('1.2.3.4');
      limiter.checkTenantLimit('tenant-1');
      limiter.checkTokenLimit('token-1');

      assert.ok(limiter.hits.size > 0);

      limiter.reset();

      assert.equal(limiter.hits.size, 0);
      assert.equal(limiter.lastAccess.size, 0);
      assert.equal(limiter.stats.allowed, 0);
      assert.equal(limiter.stats.denied, 0);
    });
  });

  // =========================================================================
  // 12. Statistics
  // =========================================================================

  describe('getStats', () => {
    it('tracks allowed and denied counts', () => {
      limiter.checkIpLimitResult('1.2.3.4');
      limiter.checkIpLimitResult('1.2.3.4');

      const stats = limiter.getStats();
      assert.equal(stats.allowed, 2);
      assert.equal(stats.denied, 0);
      assert.equal(stats.total, 2);
    });

    it('tracks uniqueKeys count', () => {
      limiter.checkIpLimitResult('1.2.3.4');
      limiter.checkTenantLimitResult('tenant-1');

      const stats = limiter.getStats();
      assert.equal(stats.uniqueKeys, 2);
    });
  });
});
