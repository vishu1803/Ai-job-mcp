/**
 * @file Unit Tests for Database Pool Guard (P14-003)
 *
 * Tests:
 * 1. Initial state (CLOSED)
 * 2. Normal operation (below threshold)
 * 3. Circuit trips when utilization exceeds threshold
 * 4. OPEN state rejects requests
 * 5. Cooldown transitions to HALF_OPEN
 * 6. HALF_OPEN allows one request
 * 7. Recovery transitions back to CLOSED
 * 8. Pool stats computation
 * 9. Guard statistics
 * 10. Fail-open on internal errors
 * 11. Start/stop lifecycle
 * 12. Reset behavior
 * 13. Disabled mode
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DbPoolGuard, CircuitState } from '../../src/security/db-pool-guard.js';

/**
 * Creates a mock pg.Pool with configurable stats.
 */
function createMockPool(overrides = {}) {
  return {
    totalCount: overrides.totalCount ?? 10,
    idleCount: overrides.idleCount ?? 8,
    waitingCount: overrides.waitingCount ?? 0,
    // Allow dynamic updates
    _setStats(total, idle, waiting) {
      this.totalCount = total;
      this.idleCount = idle;
      this.waitingCount = waiting;
    },
  };
}

describe('DbPoolGuard (P14-003)', () => {
  /** @type {DbPoolGuard} */
  let guard;
  /** @type {ReturnType<typeof createMockPool>} */
  let mockPool;

  beforeEach(() => {
    mockPool = createMockPool({ totalCount: 10, idleCount: 8, waitingCount: 0 });
    guard = new DbPoolGuard(mockPool, {
      utilizationThreshold: 0.8,
      cooldownMs: 100, // Short cooldown for tests
      checkIntervalMs: 50,
      lowWaterMark: 0.5,
      enabled: true,
    });
  });

  afterEach(() => {
    guard.reset();
  });

  // =========================================================================
  // 1. Initial state
  // =========================================================================

  describe('initial state', () => {
    it('starts in CLOSED state', () => {
      assert.equal(guard.state, CircuitState.CLOSED);
    });

    it('allows requests in CLOSED state', () => {
      const result = guard.check();
      assert.equal(result.allowed, true);
      assert.equal(result.state, CircuitState.CLOSED);
    });
  });

  // =========================================================================
  // 2. Normal operation
  // =========================================================================

  describe('normal operation', () => {
    it('allows when utilization is below threshold', () => {
      // 20% utilization (2/10)
      mockPool._setStats(10, 8, 0);
      const result = guard.check();
      assert.equal(result.allowed, true);
    });

    it('reports utilization in stats', () => {
      mockPool._setStats(10, 5, 0); // 50%
      const result = guard.check();
      assert.ok(result.utilization !== undefined);
      assert.ok(Math.abs(result.utilization - 0.5) < 0.01);
    });
  });

  // =========================================================================
  // 3. Circuit trips at threshold
  // =========================================================================

  describe('circuit tripping', () => {
    it('trips when utilization exceeds threshold', () => {
      // 90% utilization (9/10 checked out)
      mockPool._setStats(10, 1, 0);
      const result = guard.check();
      assert.equal(result.allowed, false);
      assert.equal(result.state, CircuitState.OPEN);
    });

    it('trips exactly at threshold', () => {
      // 80% utilization (8/10)
      mockPool._setStats(10, 2, 0);
      const result = guard.check();
      assert.equal(result.allowed, false);
      assert.equal(result.state, CircuitState.OPEN);
    });
  });

  // =========================================================================
  // 4. OPEN state rejects
  // =========================================================================

  describe('OPEN state', () => {
    it('rejects all requests', () => {
      // Trip the circuit
      mockPool._setStats(10, 1, 0);
      guard.check();

      // Now even with low utilization, circuit stays OPEN until cooldown
      mockPool._setStats(10, 8, 0);
      const result = guard.check();
      assert.equal(result.allowed, false);
      assert.equal(result.state, CircuitState.OPEN);
    });
  });

  // =========================================================================
  // 5. Cooldown transitions to HALF_OPEN
  // =========================================================================

  describe('cooldown to HALF_OPEN', () => {
    it('transitions to HALF_OPEN after cooldown', async () => {
      // Trip the circuit
      mockPool._setStats(10, 1, 0);
      guard.check();
      assert.equal(guard.state, CircuitState.OPEN);

      // Wait for cooldown (100ms)
      await new Promise((resolve) => setTimeout(resolve, 120));

      // Check should transition to HALF_OPEN
      const result = guard.check();
      assert.equal(result.allowed, true);
      assert.equal(result.state, CircuitState.HALF_OPEN);
    });
  });

  // =========================================================================
  // 6. HALF_OPEN allows test request
  // =========================================================================

  describe('HALF_OPEN state', () => {
    it('allows one request through', async () => {
      // Trip
      mockPool._setStats(10, 1, 0);
      guard.check();

      // Wait for cooldown
      await new Promise((resolve) => setTimeout(resolve, 120));

      // Should be HALF_OPEN and allow
      const result = guard.check();
      assert.equal(result.allowed, true);
      assert.equal(result.state, CircuitState.HALF_OPEN);
    });
  });

  // =========================================================================
  // 7. Recovery to CLOSED
  // =========================================================================

  describe('recovery', () => {
    it('recovers to CLOSED when utilization drops', async () => {
      // Start periodic sampling
      guard.start();

      // Trip
      mockPool._setStats(10, 1, 0);
      guard.check();

      // Wait for cooldown
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Allow one request in HALF_OPEN
      guard.check();

      // Pool recovers
      mockPool._setStats(10, 8, 0);

      // Wait for multiple sample intervals to ensure _sample runs and detects recovery
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should recover to CLOSED
      assert.equal(guard.state, CircuitState.CLOSED);
    });
  });

  // =========================================================================
  // 8. Pool stats
  // =========================================================================

  describe('getPoolStats', () => {
    it('returns pool utilization metrics', () => {
      mockPool._setStats(10, 5, 2);
      const stats = guard.getPoolStats();
      assert.equal(stats.totalCount, 10);
      assert.equal(stats.idleCount, 5);
      assert.equal(stats.waitingCount, 2);
      assert.equal(stats.checkedOutCount, 5);
      assert.ok(Math.abs(stats.utilization - 0.5) < 0.01);
    });

    it('handles missing pool gracefully', () => {
      const guardNoPool = new DbPoolGuard(null, { enabled: true });
      const stats = guardNoPool.getPoolStats();
      assert.equal(stats.totalCount, 0);
      assert.equal(stats.utilization, 0);
    });
  });

  // =========================================================================
  // 9. Guard statistics
  // =========================================================================

  describe('getStats', () => {
    it('tracks checked and rejected', () => {
      guard.check();
      mockPool._setStats(10, 1, 0);
      guard.check(); // Rejected (trips circuit)

      const stats = guard.getStats();
      assert.equal(stats.checked, 1);
      assert.equal(stats.rejected, 1);
      assert.equal(stats.total, 2);
    });

    it('includes pool stats', () => {
      const stats = guard.getStats();
      assert.ok(stats.pool);
      assert.ok(typeof stats.pool.totalCount === 'number');
    });

    it('includes config', () => {
      const stats = guard.getStats();
      assert.equal(stats.config.utilizationThreshold, 0.8);
      assert.equal(stats.config.cooldownMs, 100);
    });
  });

  // =========================================================================
  // 10. Fail-open
  // =========================================================================

  describe('fail-open', () => {
    it('allows when pool is null', () => {
      const guardNoPool = new DbPoolGuard(null, { enabled: true });
      const result = guardNoPool.check();
      assert.equal(result.allowed, true);
    });

    it('allows when pool stats are unavailable', () => {
      const brokenPool = { totalCount: undefined };
      const guardBroken = new DbPoolGuard(brokenPool, { enabled: true });
      const result = guardBroken.check();
      assert.equal(result.allowed, true);
    });
  });

  // =========================================================================
  // 11. Start/stop lifecycle
  // =========================================================================

  describe('lifecycle', () => {
    it('starts and stops periodic checks', () => {
      guard.start();
      assert.ok(guard._checkTimer);
      guard.stop();
      assert.equal(guard._checkTimer, null);
    });

    it('does not double-start', () => {
      guard.start();
      guard.start(); // Should not throw
      guard.stop();
    });
  });

  // =========================================================================
  // 12. Reset
  // =========================================================================

  describe('reset', () => {
    it('clears all state', () => {
      mockPool._setStats(10, 1, 0);
      guard.check(); // Trips

      guard.reset();

      assert.equal(guard.state, CircuitState.CLOSED);
      assert.equal(guard.openedAt, null);
      assert.equal(guard.stats.checked, 0);
      assert.equal(guard.stats.rejected, 0);
    });
  });

  // =========================================================================
  // 13. Disabled mode
  // =========================================================================

  describe('disabled', () => {
    it('allows all requests when disabled', () => {
      const disabledGuard = new DbPoolGuard(mockPool, { enabled: false });
      mockPool._setStats(10, 0, 0); // 100% utilization
      const result = disabledGuard.check();
      assert.equal(result.allowed, true);
    });
  });
});
