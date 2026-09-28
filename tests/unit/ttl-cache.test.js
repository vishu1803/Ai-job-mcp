/**
 * @file Unit Regression: in-process TTL read cache contract.
 *
 * The cache sits in front of expensive database reads, so its failure modes matter more
 * than its hit rate. These tests pin the four properties the hot-path wiring depends on:
 *   1. entries expire and are never served past their TTL
 *   2. a disabled cache is a pure pass-through (no reads, no stores)
 *   3. callers never share a mutable object, so one mutation cannot corrupt another view
 *   4. it stays bounded, evicting in least-recently-used order
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TtlCache,
  isReadCacheEnabled,
  isTestRunner,
  createReadCache,
} from '../../src/utils/ttl-cache.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

describe('TtlCache', () => {
  it('returns a value it stored while the entry is live', () => {
    const cache = new TtlCache({ ttlMs: 1000, logger: silentLogger });
    cache.set('k', { value: 42 });
    assert.deepStrictEqual(cache.get('k'), { value: 42 });
  });

  it('misses for an unknown key', () => {
    const cache = new TtlCache({ ttlMs: 1000, logger: silentLogger });
    assert.strictEqual(cache.get('absent'), undefined);
  });

  it('expires entries once the TTL has elapsed', async () => {
    const cache = new TtlCache({ ttlMs: 5, logger: silentLogger });
    cache.set('k', 'value');
    assert.strictEqual(cache.get('k'), 'value');

    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.strictEqual(cache.get('k'), undefined, 'a TTL-expired entry must not be served');
    assert.strictEqual(cache.size, 0, 'expired entries are dropped on read');
  });

  it('treats a zero TTL as immediately stale rather than as an unbounded entry', () => {
    const cache = new TtlCache({ ttlMs: 0, logger: silentLogger });
    cache.set('k', 'value');
    assert.strictEqual(cache.get('k'), undefined);
  });

  it('is a pure pass-through when disabled', () => {
    const cache = new TtlCache({ ttlMs: 1000, enabled: false, logger: silentLogger });
    cache.set('k', 'value');
    assert.strictEqual(cache.get('k'), undefined);
    assert.strictEqual(cache.size, 0);
    assert.strictEqual(cache.stats().bypasses, 1);
  });

  it('never stores undefined, which is indistinguishable from a miss', () => {
    const cache = new TtlCache({ ttlMs: 1000, logger: silentLogger });
    cache.set('k', undefined);
    assert.strictEqual(cache.get('k'), undefined);
    assert.strictEqual(cache.size, 0);
  });

  it('never returns a shared object across reads', () => {
    const cache = new TtlCache({ ttlMs: 1000, logger: silentLogger });
    cache.set('k', { nested: { list: [1, 2, 3] } });

    const first = cache.get('k');
    first.nested.list.push(4);
    first.nested.list[0] = 999;

    const second = cache.get('k');
    assert.deepStrictEqual(
      second.nested.list,
      [1, 2, 3],
      'mutating one caller result must not corrupt the cached entry'
    );

    const third = cache.get('k');
    second.nested.list.push(5);
    assert.deepStrictEqual(third.nested.list, [1, 2, 3]);
  });

  it('does not retain a reference to the object the caller stored', () => {
    const cache = new TtlCache({ ttlMs: 1000, logger: silentLogger });
    const live = { count: 1 };
    cache.set('k', live);

    live.count = 2;
    assert.strictEqual(cache.get('k').count, 1, 'the cached copy is taken at store time');
  });

  it('skips caching a value it cannot copy instead of sharing it by reference', () => {
    const cache = new TtlCache({ ttlMs: 1000, logger: silentLogger });
    cache.set('k', { fn: () => 'not cloneable' });

    assert.strictEqual(cache.get('k'), undefined);
    assert.strictEqual(cache.size, 0);
    assert.strictEqual(cache.stats().uncloneable, 1);
  });

  it('evicts least-recently-used entries past maxEntries', () => {
    const cache = new TtlCache({ ttlMs: 60_000, maxEntries: 3, logger: silentLogger });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    cache.get('a'); // 'a' becomes most recently used, so 'b' is now the oldest

    cache.set('d', 4);

    assert.strictEqual(cache.get('b'), undefined, 'oldest entry is evicted');
    assert.strictEqual(cache.get('a'), 1);
    assert.strictEqual(cache.get('c'), 3);
    assert.strictEqual(cache.get('d'), 4);
    assert.strictEqual(cache.size, 3);
    assert.strictEqual(cache.stats().evictions, 1);
  });

  it('drops a single entry via invalidate and everything via clear', () => {
    const cache = new TtlCache({ ttlMs: 1000, logger: silentLogger });
    cache.set('a', 1);
    cache.set('b', 2);

    cache.invalidate('a');
    assert.strictEqual(cache.get('a'), undefined);
    assert.strictEqual(cache.get('b'), 2);

    cache.clear();
    assert.strictEqual(cache.size, 0);
    assert.strictEqual(cache.get('b'), undefined);
  });

  it('reports hits, misses and stores for observability', () => {
    const cache = new TtlCache({ ttlMs: 1000, logger: silentLogger });
    cache.get('miss');
    cache.set('hit', 'v');
    cache.get('hit');
    cache.get('hit');

    const stats = cache.stats();
    assert.strictEqual(stats.misses, 1);
    assert.strictEqual(stats.stores, 1);
    assert.strictEqual(stats.hits, 2);
    assert.strictEqual(stats.size, 1);
    assert.strictEqual(stats.enabled, true);
    assert.strictEqual(stats.ttlMs, 1000);
  });
});

describe('read cache environment resolution', () => {
  it('honours an explicit opt-in over the environment default', () => {
    assert.strictEqual(isReadCacheEnabled({ NODE_ENV: 'test', READ_CACHE_ENABLED: 'true' }), true);
  });

  it('honours an explicit opt-out over the environment default', () => {
    assert.strictEqual(
      isReadCacheEnabled({ NODE_ENV: 'production', READ_CACHE_ENABLED: 'false' }),
      false
    );
  });

  it('defaults on for development and production', () => {
    assert.strictEqual(
      isReadCacheEnabled({ NODE_ENV: 'development' }, { underTestRunner: false }),
      true
    );
    assert.strictEqual(
      isReadCacheEnabled({ NODE_ENV: 'production' }, { underTestRunner: false }),
      true
    );
  });

  it('defaults off under NODE_ENV=test so read-after-write stays deterministic', () => {
    assert.strictEqual(isReadCacheEnabled({ NODE_ENV: 'test' }, { underTestRunner: false }), false);
  });

  it('stays off under the test runner even when NODE_ENV resolves to development', () => {
    // `.env.local` is loaded with override:true and sets NODE_ENV=development, so the
    // environment alone cannot be trusted to keep the suite deterministic.
    assert.strictEqual(
      isReadCacheEnabled({ NODE_ENV: 'development' }, { underTestRunner: true }),
      false
    );
  });

  it('is actually disabled in this very test process', () => {
    assert.strictEqual(isTestRunner(), true, 'the runner signal must be detectable');
    assert.strictEqual(
      isReadCacheEnabled(),
      false,
      'the suite must never run with the read cache enabled by default'
    );
  });

  it('an explicit opt-in still wins over the test runner', () => {
    assert.strictEqual(
      isReadCacheEnabled(
        { NODE_ENV: 'development', READ_CACHE_ENABLED: 'true' },
        { underTestRunner: true }
      ),
      true
    );
  });

  it('detects the runner from the environment or the node exec arguments', () => {
    assert.strictEqual(isTestRunner({ NODE_TEST_CONTEXT: 'child-v8' }, []), true);
    assert.strictEqual(isTestRunner({}, ['--test']), true);
    assert.strictEqual(isTestRunner({}, ['--test-concurrency=10']), true);
    assert.strictEqual(isTestRunner({}, ['--max-old-space-size=4096']), false);
  });

  it('builds a cache from configuration values', () => {
    const cache = createReadCache({
      name: 'unit',
      ttlMs: 10,
      maxEntries: 2,
      enabled: true,
    });
    assert.strictEqual(cache.get('never-stored'), undefined);
    assert.strictEqual(cache.name, 'unit');
    assert.strictEqual(cache.ttlMs, 10);
    assert.strictEqual(cache.maxEntries, 2);
    assert.strictEqual(cache.enabled, true);
  });
});
