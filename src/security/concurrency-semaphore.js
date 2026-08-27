/**
 * @file Application-Level Concurrency Semaphore.
 *
 * Limits the number of inflight concurrent operations to protect:
 * - PostgreSQL connection pool from starvation
 * - AI API quota from burst exhaustion
 * - Application memory from unbounded concurrent work
 *
 * Design:
 * - Global limit: maximum total concurrent expensive operations
 * - Per-tenant limit: maximum concurrent operations per tenant
 * - Per-token limit: maximum concurrent operations per MCP token
 * - Queued limit: maximum requests waiting for a slot (beyond this, reject immediately)
 *
 * This is NOT a rate limiter. It controls concurrency (inflight), not throughput (completed/time).
 * Used in conjunction with the sliding-window rate limiter for complete protection.
 *
 * Failure mode:
 * - If the semaphore throws internally, the request is ALLOWED (fail-open).
 *   A broken semaphore should not cause a total service outage.
 */

import { logger } from '../utils/logger.js';

export class ConcurrencySemaphore {
  /**
   * @param {object} [options={}]
   * @param {number} [options.globalMax=15] Maximum total concurrent expensive operations
   * @param {number} [options.tenantMax=3] Maximum concurrent operations per tenant
   * @param {number} [options.tokenMax=2] Maximum concurrent operations per token
   * @param {number} [options.userMax=2] Maximum concurrent operations per user
   * @param {number} [options.queueMax=10] Maximum requests waiting in queue before rejection
   * @param {number} [options.queueTimeoutMs=10000] Max time a request waits in queue (ms)
   * @param {boolean} [options.enabled=true] Allow disabling for tests
   */
  constructor(options = {}) {
    this.globalMax = options.globalMax !== undefined ? options.globalMax : 15;
    this.tenantMax = options.tenantMax !== undefined ? options.tenantMax : 3;
    this.tokenMax = options.tokenMax !== undefined ? options.tokenMax : 2;
    this.userMax = options.userMax !== undefined ? options.userMax : 2;
    this.queueMax = options.queueMax !== undefined ? options.queueMax : 10;
    this.queueTimeoutMs = options.queueTimeoutMs !== undefined ? options.queueTimeoutMs : 10000;
    this.enabled = options.enabled !== undefined ? options.enabled : true;

    /** @type {Map<string, number>} scope -> current inflight count */
    this.inflight = new Map();

    /** @type {Map<string, Array<{ resolve: Function, reject: Function, timer: ReturnType<typeof setTimeout> }>>} */
    this.queues = new Map();

    /** @type {{ acquired: number, rejected: number, released: number, timedOut: number, total: number }} */
    this.stats = { acquired: 0, rejected: 0, released: 0, timedOut: 0, total: 0 };
  }

  /**
   * Attempts to acquire a concurrency slot.
   *
   * @param {object} identity
   * @param {string} [identity.tenantId] Tenant UUID
   * @param {string} [identity.tokenHash] SHA-256 token hash
   * @param {string} [identity.userId] User UUID
   * @returns {{ acquired: boolean, waitMs?: number }} Whether slot was acquired and wait time
   */
  acquire(identity = {}) {
    if (!this.enabled) {
      return { acquired: true, waitMs: 0 };
    }

    try {
      this.stats.total++;

      // Check global limit
      const globalCount = this.inflight.get('_global') || 0;
      if (globalCount >= this.globalMax) {
        this.stats.rejected++;
        return { acquired: false };
      }

      // Check tenant limit
      if (identity.tenantId) {
        const tenantCount = this.inflight.get(`tenant:${identity.tenantId}`) || 0;
        if (tenantCount >= this.tenantMax) {
          this.stats.rejected++;
          return { acquired: false };
        }
      }

      // Check token limit
      if (identity.tokenHash) {
        const tokenCount = this.inflight.get(`token:${identity.tokenHash}`) || 0;
        if (tokenCount >= this.tokenMax) {
          this.stats.rejected++;
          return { acquired: false };
        }
      }

      // Check user limit
      if (identity.userId) {
        const userCount = this.inflight.get(`user:${identity.userId}`) || 0;
        if (userCount >= this.userMax) {
          this.stats.rejected++;
          return { acquired: false };
        }
      }

      // All checks passed — increment counters
      this._increment(identity);
      this.stats.acquired++;
      return { acquired: true, waitMs: 0 };
    } catch (err) {
      // Fail-open
      logger.warn({ err }, 'ConcurrencySemaphore.acquire error — failing open');
      this.stats.acquired++;
      return { acquired: true, waitMs: 0 };
    }
  }

  /**
   * Releases a previously acquired concurrency slot.
   *
   * @param {object} identity Same identity object passed to acquire()
   */
  release(identity = {}) {
    if (!this.enabled) return;

    try {
      this._decrement(identity);
      this.stats.released++;

      // Check if any queued requests can now proceed
      this._drainQueues();
    } catch (err) {
      logger.warn({ err }, 'ConcurrencySemaphore.release error');
    }
  }

  /**
   * Wraps an async function with concurrency control.
   * Automatically acquires before execution and releases after (success or failure).
   *
   * @param {object} identity Identity object for scope checks
   * @param {Function} fn Async function to execute
   * @returns {Promise<*>} Result of fn
   * @throws {Error} With statusCode 429 if concurrency limit exceeded, or original error
   */
  async execute(identity, fn) {
    const result = this.acquire(identity);

    if (!result.acquired) {
      const err = new Error('Concurrency limit exceeded. Too many concurrent operations.');
      err.statusCode = 429;
      err.code = 'CONCURRENCY_LIMITED';
      throw err;
    }

    try {
      return await fn();
    } finally {
      this.release(identity);
    }
  }

  /**
   * Returns current concurrency statistics.
   */
  getStats() {
    const scopes = {};
    for (const [key, count] of this.inflight) {
      if (count > 0) scopes[key] = count;
    }
    return {
      ...this.stats,
      inflight: { ...scopes },
      config: {
        globalMax: this.globalMax,
        tenantMax: this.tenantMax,
        tokenMax: this.tokenMax,
        userMax: this.userMax,
      },
    };
  }

  /**
   * Resets all concurrency state (useful in test teardown).
   */
  reset() {
    this.inflight.clear();
    for (const [, queue] of this.queues) {
      for (const entry of queue) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Semaphore reset'));
      }
    }
    this.queues.clear();
    this.stats = { acquired: 0, rejected: 0, released: 0, timedOut: 0, total: 0 };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** @private */
  _increment(identity) {
    this._bump('_global');
    if (identity.tenantId) this._bump(`tenant:${identity.tenantId}`);
    if (identity.tokenHash) this._bump(`token:${identity.tokenHash}`);
    if (identity.userId) this._bump(`user:${identity.userId}`);
  }

  /** @private */
  _decrement(identity) {
    this._drop('_global');
    if (identity.tenantId) this._drop(`tenant:${identity.tenantId}`);
    if (identity.tokenHash) this._drop(`token:${identity.tokenHash}`);
    if (identity.userId) this._drop(`user:${identity.userId}`);
  }

  /** @private */
  _bump(key) {
    this.inflight.set(key, (this.inflight.get(key) || 0) + 1);
  }

  /** @private */
  _drop(key) {
    const current = this.inflight.get(key) || 0;
    if (current <= 1) {
      this.inflight.delete(key);
    } else {
      this.inflight.set(key, current - 1);
    }
  }

  /** @private */
  _drainQueues() {
    // Not implemented for V1 — concurrency limits are immediate reject, no queuing.
    // Queuing adds complexity (head-of-line blocking, fairness) without clear benefit
    // for a single-instance application behind Cloudflare.
  }
}

/**
 * Singleton concurrency semaphore for application runtime.
 */
export const defaultConcurrencySemaphore = new ConcurrencySemaphore();
