/**
 * @file Database Pool Guard (Circuit Breaker).
 *
 * Monitors PostgreSQL connection pool utilization and rejects new requests
 * when the pool is near exhaustion. Prevents the failure scenario:
 *
 *   HTTP requests → many simultaneous DB checkouts → pool starvation → app failure
 *
 * The guard sits between the concurrency semaphore and the database:
 *
 *   HTTP/MCP traffic
 *       ↓
 *   rate/concurrency gate
 *       ↓
 *   DB pool guard (this module)
 *       ↓
 *   DB operation
 *       ↓
 *   pool
 *
 * Circuit states:
 * - CLOSED: Normal operation, all requests pass through
 * - OPEN: Pool utilization exceeds threshold, new requests rejected with 503
 * - HALF_OPEN: After cooldown, one test request allowed to verify recovery
 *
 * Failure mode:
 * - If the guard itself throws, requests are ALLOWED (fail-open).
 *   A broken guard should not cause a total service outage.
 */

import { logger } from '../utils/logger.js';

export const CircuitState = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

export class DbPoolGuard {
  /**
   * @param {import('pg').Pool} pool PostgreSQL pool instance to monitor
   * @param {object} [options={}]
   * @param {number} [options-utilizationThreshold=0.8] Pool utilization threshold to trip circuit (0-1)
   * @param {number} [options.cooldownMs=30000] Time in ms to wait before trying half-open
   * @param {number} [options.checkIntervalMs=5000] How often to sample pool stats
   * @param {number} [options.lowWaterMark=0.5] Utilization below which circuit closes from half-open
   * @param {boolean} [options.enabled=true] Allow disabling for tests
   */
  constructor(pool, options = {}) {
    this.pool = pool;
    this.utilizationThreshold =
      options.utilizationThreshold !== undefined ? options.utilizationThreshold : 0.8;
    this.cooldownMs = options.cooldownMs !== undefined ? options.cooldownMs : 30000;
    this.checkIntervalMs = options.checkIntervalMs !== undefined ? options.checkIntervalMs : 5000;
    this.lowWaterMark = options.lowWaterMark !== undefined ? options.lowWaterMark : 0.5;
    this.enabled = options.enabled !== undefined ? options.enabled : true;

    this.state = CircuitState.CLOSED;
    this.openedAt = null;
    this._checkTimer = null;

    /** @type {{ checked: number, rejected: number, total: number, currentState: string }} */
    this.stats = { checked: 0, rejected: 0, total: 0, currentState: CircuitState.CLOSED };
  }

  /**
   * Starts periodic pool utilization monitoring.
   */
  start() {
    if (!this.enabled || this._checkTimer) return;
    this._checkTimer = setInterval(() => this._sample(), this.checkIntervalMs);
    // Allow Node.js to exit even if timer is running
    if (this._checkTimer.unref) this._checkTimer.unref();
  }

  /**
   * Stops periodic monitoring.
   */
  stop() {
    if (this._checkTimer) {
      clearInterval(this._checkTimer);
      this._checkTimer = null;
    }
  }

  /**
   * Checks whether a new DB operation should be allowed.
   * Returns immediately (synchronous) for fast rejection.
   *
   * @returns {{ allowed: boolean, state: string, utilization?: number }}
   */
  check() {
    if (!this.enabled) {
      return { allowed: true, state: CircuitState.CLOSED };
    }

    try {
      this.stats.total++;

      if (this.state === CircuitState.OPEN) {
        // Check if cooldown has elapsed
        if (this.openedAt && Date.now() - this.openedAt >= this.cooldownMs) {
          this.state = CircuitState.HALF_OPEN;
          logger.info('DB pool circuit breaker transitioning to HALF_OPEN');
          // Allow one request through for health check
          this.stats.checked++;
          this.stats.currentState = this.state;
          return { allowed: true, state: this.state };
        }
        this.stats.rejected++;
        this.stats.currentState = this.state;
        return { allowed: false, state: this.state };
      }

      if (this.state === CircuitState.HALF_OPEN) {
        // Allow one request through to test recovery
        this.stats.checked++;
        this.stats.currentState = this.state;
        return { allowed: true, state: this.state };
      }

      // CLOSED state — check pool utilization
      const utilization = this._getUtilization();
      if (utilization >= this.utilizationThreshold) {
        this._trip();
        this.stats.rejected++;
        this.stats.currentState = this.state;
        return { allowed: false, state: this.state, utilization };
      }

      this.stats.checked++;
      this.stats.currentState = this.state;
      return { allowed: true, state: this.state, utilization };
    } catch (err) {
      // Fail-open
      logger.warn({ err }, 'DbPoolGuard.check error — failing open');
      this.stats.checked++;
      return { allowed: true, state: CircuitState.CLOSED };
    }
  }

  /**
   * Returns current pool utilization stats.
   * @returns {object}
   */
  getPoolStats() {
    try {
      if (!this.pool || typeof this.pool.totalCount !== 'number') {
        return { totalCount: 0, idleCount: 0, waitingCount: 0, checkedOutCount: 0, utilization: 0 };
      }
      const totalCount = this.pool.totalCount || 0;
      const idleCount = this.pool.idleCount || 0;
      const waitingCount = this.pool.waitingCount || 0;
      const checkedOutCount = totalCount - idleCount;
      const utilization = totalCount > 0 ? checkedOutCount / totalCount : 0;
      return { totalCount, idleCount, waitingCount, checkedOutCount, utilization };
    } catch {
      return { totalCount: 0, idleCount: 0, waitingCount: 0, checkedOutCount: 0, utilization: 0 };
    }
  }

  /**
   * Returns guard statistics.
   */
  getStats() {
    return {
      ...this.stats,
      pool: this.getPoolStats(),
      config: {
        utilizationThreshold: this.utilizationThreshold,
        cooldownMs: this.cooldownMs,
        lowWaterMark: this.lowWaterMark,
      },
    };
  }

  /**
   * Resets guard state (useful in test teardown).
   */
  reset() {
    this.stop();
    this.state = CircuitState.CLOSED;
    this.openedAt = null;
    this.stats = { checked: 0, rejected: 0, total: 0, currentState: CircuitState.CLOSED };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /** @private */
  _getUtilization() {
    const stats = this.getPoolStats();
    return stats.utilization;
  }

  /** @private */
  _sample() {
    try {
      const utilization = this._getUtilization();

      if (this.state === CircuitState.HALF_OPEN) {
        if (utilization < this.lowWaterMark) {
          this.state = CircuitState.CLOSED;
          this.openedAt = null;
          logger.info(
            { utilization },
            'DB pool circuit breaker recovered — transitioning to CLOSED'
          );
        }
        return;
      }

      if (this.state === CircuitState.CLOSED && utilization >= this.utilizationThreshold) {
        this._trip();
      }
    } catch (err) {
      logger.warn({ err }, 'DbPoolGuard._sample error');
    }
  }

  /** @private */
  _trip() {
    this.state = CircuitState.OPEN;
    this.openedAt = Date.now();
    logger.error(
      { utilization: this._getUtilization(), threshold: this.utilizationThreshold },
      'DB pool circuit breaker TRIPPED — rejecting new DB operations'
    );
  }
}

/**
 * Factory function creating a DbPoolGuard for a given pool.
 * @param {import('pg').Pool} pool
 * @param {object} [options]
 * @returns {DbPoolGuard}
 */
export function createDbPoolGuard(pool, options = {}) {
  return new DbPoolGuard(pool, options);
}
