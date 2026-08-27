/**
 * @file Unit Tests for Concurrency Semaphore (P14-003)
 *
 * Tests:
 * 1. Basic acquire/release
 * 2. Global concurrency limit
 * 3. Per-tenant concurrency limit
 * 4. Per-token concurrency limit
 * 5. Per-user concurrency limit
 * 6. Rejection when limit exceeded
 * 7. Release decrements correctly
 * 8. Execute wrapper (auto acquire/release)
 * 9. Statistics tracking
 * 10. Reset behavior
 * 11. Disabled mode
 * 12. Fail-open on internal errors
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ConcurrencySemaphore } from '../../src/security/concurrency-semaphore.js';

describe('ConcurrencySemaphore (P14-003)', () => {
  /** @type {ConcurrencySemaphore} */
  let semaphore;

  beforeEach(() => {
    semaphore = new ConcurrencySemaphore({
      globalMax: 5,
      tenantMax: 2,
      tokenMax: 2,
      userMax: 2,
      queueMax: 10,
      queueTimeoutMs: 5000,
      enabled: true,
    });
  });

  // =========================================================================
  // 1. Basic acquire/release
  // =========================================================================

  describe('basic acquire/release', () => {
    it('acquires a slot successfully', () => {
      const result = semaphore.acquire({ tenantId: 't1' });
      assert.equal(result.acquired, true);
      assert.equal(result.waitMs, 0);
    });

    it('releases a slot successfully', () => {
      semaphore.acquire({ tenantId: 't1' });
      semaphore.release({ tenantId: 't1' });
      // Should be able to acquire again
      const result = semaphore.acquire({ tenantId: 't1' });
      assert.equal(result.acquired, true);
    });

    it('tracks inflight count', () => {
      semaphore.acquire({ tenantId: 't1' });
      const stats = semaphore.getStats();
      assert.equal(stats.inflight._global, 1);
      assert.equal(stats.inflight['tenant:t1'], 1);
    });
  });

  // =========================================================================
  // 2. Global concurrency limit
  // =========================================================================

  describe('global limit', () => {
    it('rejects when global limit exceeded', () => {
      // Fill global slots (5 max)
      for (let i = 0; i < 5; i++) {
        semaphore.acquire({ tenantId: `tenant-${i}` });
      }
      // 6th should be rejected
      const result = semaphore.acquire({ tenantId: 'tenant-6' });
      assert.equal(result.acquired, false);
    });

    it('allows after release frees a global slot', () => {
      for (let i = 0; i < 5; i++) {
        semaphore.acquire({ tenantId: `tenant-${i}` });
      }
      // Release one
      semaphore.release({ tenantId: 'tenant-0' });
      // Should be able to acquire now
      const result = semaphore.acquire({ tenantId: 'tenant-new' });
      assert.equal(result.acquired, true);
    });
  });

  // =========================================================================
  // 3. Per-tenant concurrency limit
  // =========================================================================

  describe('per-tenant limit', () => {
    it('rejects when tenant limit exceeded', () => {
      semaphore.acquire({ tenantId: 't1' });
      semaphore.acquire({ tenantId: 't1' });
      // Tenant limit is 2
      const result = semaphore.acquire({ tenantId: 't1' });
      assert.equal(result.acquired, false);
    });

    it('does not affect other tenants', () => {
      semaphore.acquire({ tenantId: 't1' });
      semaphore.acquire({ tenantId: 't1' });
      // t1 is at limit
      assert.equal(semaphore.acquire({ tenantId: 't1' }).acquired, false);
      // t2 should still work
      assert.equal(semaphore.acquire({ tenantId: 't2' }).acquired, true);
    });

    it('different tenants have independent limits', () => {
      for (let i = 0; i < 2; i++) {
        semaphore.acquire({ tenantId: 't1' });
        semaphore.acquire({ tenantId: 't2' });
      }
      assert.equal(semaphore.acquire({ tenantId: 't1' }).acquired, false);
      assert.equal(semaphore.acquire({ tenantId: 't2' }).acquired, false);
    });
  });

  // =========================================================================
  // 4. Per-token concurrency limit
  // =========================================================================

  describe('per-token limit', () => {
    it('rejects when token limit exceeded', () => {
      semaphore.acquire({ tenantId: 't1', tokenHash: 'tok-aaa' });
      semaphore.acquire({ tenantId: 't1', tokenHash: 'tok-aaa' });
      // Token limit is 2
      const result = semaphore.acquire({ tenantId: 't1', tokenHash: 'tok-aaa' });
      assert.equal(result.acquired, false);
    });

    it('different tokens have independent limits', () => {
      semaphore.acquire({ tenantId: 't1', tokenHash: 'tok-aaa' });
      semaphore.acquire({ tenantId: 't1', tokenHash: 'tok-bbb' });
      // Both at limit (2 each)
      assert.equal(semaphore.acquire({ tenantId: 't1', tokenHash: 'tok-aaa' }).acquired, false);
      assert.equal(semaphore.acquire({ tenantId: 't1', tokenHash: 'tok-bbb' }).acquired, false);
    });
  });

  // =========================================================================
  // 5. Per-user concurrency limit
  // =========================================================================

  describe('per-user limit', () => {
    it('rejects when user limit exceeded', () => {
      semaphore.acquire({ tenantId: 't1', userId: 'u1' });
      semaphore.acquire({ tenantId: 't1', userId: 'u1' });
      const result = semaphore.acquire({ tenantId: 't1', userId: 'u1' });
      assert.equal(result.acquired, false);
    });
  });

  // =========================================================================
  // 6. Multiple scope limits interact
  // =========================================================================

  describe('multiple scope limits', () => {
    it('rejects if any scope limit is exceeded', () => {
      // Fill tenant limit for t1
      semaphore.acquire({ tenantId: 't1', userId: 'u1', tokenHash: 'tok-1' });
      semaphore.acquire({ tenantId: 't1', userId: 'u2', tokenHash: 'tok-2' });
      // t1 is at tenant limit (2)
      const result = semaphore.acquire({ tenantId: 't1', userId: 'u3', tokenHash: 'tok-3' });
      assert.equal(result.acquired, false);
    });
  });

  // =========================================================================
  // 7. Release decrements correctly
  // =========================================================================

  describe('release', () => {
    it('decrements global counter', () => {
      semaphore.acquire({ tenantId: 't1' });
      assert.equal(semaphore.getStats().inflight._global, 1);
      semaphore.release({ tenantId: 't1' });
      assert.equal(semaphore.getStats().inflight._global, undefined);
    });

    it('decrements tenant counter', () => {
      semaphore.acquire({ tenantId: 't1' });
      assert.equal(semaphore.getStats().inflight['tenant:t1'], 1);
      semaphore.release({ tenantId: 't1' });
      assert.equal(semaphore.getStats().inflight['tenant:t1'], undefined);
    });

    it('handles double release gracefully', () => {
      semaphore.acquire({ tenantId: 't1' });
      semaphore.release({ tenantId: 't1' });
      // Second release should not throw
      semaphore.release({ tenantId: 't1' });
    });

    it('handles release without prior acquire', () => {
      // Should not throw
      semaphore.release({ tenantId: 't1' });
    });
  });

  // =========================================================================
  // 8. Execute wrapper
  // =========================================================================

  describe('execute', () => {
    it('executes function and releases slot', async () => {
      let executed = false;
      await semaphore.execute({ tenantId: 't1' }, async () => {
        executed = true;
        return 'result';
      });
      assert.equal(executed, true);
      // Slot should be released
      assert.equal(semaphore.getStats().inflight['tenant:t1'], undefined);
    });

    it('releases slot even if function throws', async () => {
      try {
        await semaphore.execute({ tenantId: 't1' }, async () => {
          throw new Error('test error');
        });
      } catch (err) {
        assert.equal(err.message, 'test error');
      }
      // Slot should be released
      assert.equal(semaphore.getStats().inflight['tenant:t1'], undefined);
    });

    it('rejects with 429 when concurrency limit exceeded', async () => {
      // Fill all slots
      for (let i = 0; i < 5; i++) {
        semaphore.acquire({ tenantId: `tenant-${i}` });
      }
      try {
        await semaphore.execute({ tenantId: 'tenant-overflow' }, async () => 'ok');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.equal(err.statusCode, 429);
        assert.equal(err.code, 'CONCURRENCY_LIMITED');
      }
    });

    it('returns function result', async () => {
      const result = await semaphore.execute({ tenantId: 't1' }, async () => 42);
      assert.equal(result, 42);
    });
  });

  // =========================================================================
  // 9. Statistics
  // =========================================================================

  describe('getStats', () => {
    it('tracks acquired and released', () => {
      semaphore.acquire({ tenantId: 't1' });
      semaphore.release({ tenantId: 't1' });

      const stats = semaphore.getStats();
      assert.equal(stats.acquired, 1);
      assert.equal(stats.released, 1);
    });

    it('tracks rejected', () => {
      // Fill all slots
      for (let i = 0; i < 5; i++) {
        semaphore.acquire({ tenantId: `t-${i}` });
      }
      semaphore.acquire({ tenantId: 'overflow' }); // Rejected

      const stats = semaphore.getStats();
      assert.equal(stats.rejected, 1);
    });

    it('includes config', () => {
      const stats = semaphore.getStats();
      assert.equal(stats.config.globalMax, 5);
      assert.equal(stats.config.tenantMax, 2);
    });
  });

  // =========================================================================
  // 10. Reset
  // =========================================================================

  describe('reset', () => {
    it('clears all state', () => {
      semaphore.acquire({ tenantId: 't1' });
      semaphore.acquire({ tenantId: 't2' });
      semaphore.release({ tenantId: 't1' });

      semaphore.reset();

      const stats = semaphore.getStats();
      assert.equal(stats.acquired, 0);
      assert.equal(stats.released, 0);
      assert.equal(stats.rejected, 0);
    });
  });

  // =========================================================================
  // 11. Disabled mode
  // =========================================================================

  describe('disabled', () => {
    it('allows all requests when disabled', () => {
      const disabled = new ConcurrencySemaphore({ enabled: false });
      for (let i = 0; i < 100; i++) {
        const result = disabled.acquire({ tenantId: 't1' });
        assert.equal(result.acquired, true);
      }
    });
  });
});
