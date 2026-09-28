/**
 * @file In-process TTL cache for read-heavy, hot-path data.
 *
 * Why this exists: this application issues its full query set on every request, and
 * the dominant reads (the assembled candidate profile view, the skill catalog
 * reference rows) are re-fetched unchanged within seconds by the same user moving
 * between the dashboard, the copilot drawer and the profile pages. On a
 * high-latency link that repeated work is directly page latency.
 *
 * Correctness properties this cache deliberately guarantees:
 * 1. It never stores a failure. A rejection propagates to the caller and leaves the
 *    cache empty, so a database outage can never be served back as a cached value.
 * 2. It never returns a shared, mutable object. Values are copied on store and again
 *    on read, so one caller mutating its result cannot corrupt another caller's view.
 * 3. It is bounded. Entries are evicted in least-recently-used order past
 *    `maxEntries`, so a long-lived process cannot grow without limit.
 * 4. It can be switched off entirely (`enabled: false`), in which case every read is
 *    a miss and every write is a no-op.
 *
 * A note on staleness: entries are only ever discarded by TTL expiry, LRU pressure,
 * `invalidate()` or `clear()`. There is no write-through invalidation wired into the
 * mutating services, so the TTL *is* the staleness bound. Keep it short.
 */

import { config } from '../config/env.js';
import { logger as defaultLogger } from './logger.js';

/**
 * Detects the Node test runner.
 *
 * `NODE_ENV=test` is not sufficient on its own: `.env.local` is loaded with
 * `override: true` and sets `NODE_ENV=development`, so a developer running the suite
 * locally would silently get production cache behaviour and hit non-deterministic
 * read-after-write assertions. The runner's own signal is reliable in every environment.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @param {string[]} [execArgv=process.execArgv]
 * @returns {boolean}
 */
export function isTestRunner(env = process.env, execArgv = process.execArgv) {
  if (env.NODE_TEST_CONTEXT) return true;
  return execArgv.some((arg) => arg === '--test' || arg.startsWith('--test-'));
}

/**
 * Resolves whether read caching is on.
 *
 * An explicit `READ_CACHE_ENABLED` always wins, which is the supported way to exercise
 * the cache from a test. Otherwise caching is on for the long-lived process environments
 * (development, production) and off under the test runner.
 *
 * @param {object} [env=config] Parsed environment configuration
 * @param {object} [options={}]
 * @param {boolean} [options.underTestRunner] Test-runner override, injectable for tests
 * @returns {boolean}
 */
export function isReadCacheEnabled(env = config, options = {}) {
  if (env.READ_CACHE_ENABLED === 'true') return true;
  if (env.READ_CACHE_ENABLED === 'false') return false;

  const underTestRunner = options.underTestRunner ?? isTestRunner();
  if (underTestRunner) return false;

  return env.NODE_ENV === 'development' || env.NODE_ENV === 'production';
}

/**
 * Bounded, expiring, copy-isolated in-process cache.
 */
export class TtlCache {
  /**
   * @param {object} [options={}]
   * @param {string} [options.name='ttl-cache'] Name used in hit/miss logging
   * @param {number} [options.ttlMs=5000] Entry lifetime in milliseconds
   * @param {number} [options.maxEntries=500] Upper bound on retained entries
   * @param {boolean} [options.enabled=true] When false every read misses and every write is dropped
   * @param {boolean} [options.clone=true] Copy values in and out to isolate callers
   * @param {import('pino').Logger} [options.logger=defaultLogger]
   */
  constructor({
    name = 'ttl-cache',
    ttlMs = 5000,
    maxEntries = 500,
    enabled = true,
    clone = true,
    logger = defaultLogger,
  } = {}) {
    this.name = name;
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.enabled = enabled;
    this.clone = clone;
    this.logger = logger;

    /** @type {Map<string, { expiresAt: number, value: unknown }>} */
    this._entries = new Map();
    this._stats = { hits: 0, misses: 0, stores: 0, evictions: 0, bypasses: 0, uncloneable: 0 };
  }

  /**
   * @param {unknown} value
   * @returns {unknown} A detached copy, or `undefined` when the value is not copyable
   * @private
   */
  _copy(value) {
    if (!this.clone) return value;
    try {
      return structuredClone(value);
    } catch {
      return undefined;
    }
  }

  /**
   * Reads a live entry, refreshing its recency position.
   *
   * @param {string} key
   * @returns {unknown|undefined} Cached copy, or `undefined` on miss/expiry
   */
  get(key) {
    if (!this.enabled) {
      this._stats.bypasses += 1;
      return undefined;
    }

    const entry = this._entries.get(key);
    if (!entry) {
      this._stats.misses += 1;
      return undefined;
    }
    if (Date.now() >= entry.expiresAt) {
      this._entries.delete(key);
      this._stats.misses += 1;
      return undefined;
    }

    // Re-insert so the Map's insertion order doubles as least-recently-used order.
    this._entries.delete(key);
    this._entries.set(key, entry);
    this._stats.hits += 1;
    return this._copy(entry.value);
  }

  /**
   * Stores a value. `undefined` is never stored (it is indistinguishable from a miss),
   * and a value that cannot be copied is skipped rather than cached by reference.
   *
   * @param {string} key
   * @param {unknown} value
   * @returns {void}
   */
  set(key, value) {
    if (!this.enabled) return;
    if (value === undefined) return;

    const copy = this._copy(value);
    if (copy === undefined) {
      this._stats.uncloneable += 1;
      this.logger.debug(
        { cache: this.name, key },
        'Read cache value is not copyable; skipping cache store'
      );
      return;
    }

    this._entries.delete(key);
    this._entries.set(key, { expiresAt: Date.now() + this.ttlMs, value: copy });
    this._stats.stores += 1;

    while (this._entries.size > this.maxEntries) {
      const oldest = this._entries.keys().next();
      if (oldest.done) break;
      this._entries.delete(oldest.value);
      this._stats.evictions += 1;
    }
  }

  /**
   * Drops a single entry. Not wired into the mutating services by design; available for
   * tests and for callers that know a specific value just changed.
   *
   * @param {string} key
   * @returns {void}
   */
  invalidate(key) {
    this._entries.delete(key);
  }

  /**
   * Drops every entry.
   *
   * @returns {void}
   */
  clear() {
    this._entries.clear();
  }

  /**
   * @returns {number} Number of retained entries
   */
  get size() {
    return this._entries.size;
  }

  /**
   * @returns {{ hits: number, misses: number, stores: number, evictions: number, bypasses: number, uncloneable: number, size: number, enabled: boolean, ttlMs: number }}
   */
  stats() {
    return { ...this._stats, size: this._entries.size, enabled: this.enabled, ttlMs: this.ttlMs };
  }
}

/**
 * Builds a cache configured from the environment.
 *
 * Instances are intended to be module-level so that every service instance in the
 * process shares one cache: several call sites construct services per request, and an
 * instance-scoped cache would be recreated (and therefore never hit) on each request.
 *
 * @param {object} options
 * @param {string} options.name
 * @param {number} [options.ttlMs] Overrides the configured default
 * @param {number} [options.maxEntries]
 * @param {boolean} [options.enabled]
 * @returns {TtlCache}
 */
export function createReadCache({ name, ttlMs, maxEntries, enabled }) {
  return new TtlCache({
    name,
    ttlMs: ttlMs ?? config.READ_CACHE_TTL_MS,
    maxEntries: maxEntries ?? config.READ_CACHE_MAX_ENTRIES,
    enabled: enabled ?? isReadCacheEnabled(),
  });
}
