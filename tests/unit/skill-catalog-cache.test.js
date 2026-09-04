/**
 * Regression: SkillCatalogService in-process reference-data cache.
 *
 * The catalog + categories are slow-changing, tenant-agnostic reference data that
 * the profile page/bootstrap re-requests on every load. The service must:
 *   - load the whole active catalog and the categories at most once per TTL
 *   - serve subsequent unfiltered whole-catalog reads + categories from memory
 *   - keep filtered searches hitting the DB (fresh, small result sets)
 *   - never cache when the instance is constructed with disableReferenceCache: true
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { pool } from '../../src/db/index.js';
import { SkillCatalogService } from '../../src/services/skill-catalog.service.js';

const originalQuery = pg.Pool.prototype.query;

/** Counts skill_catalog SELECT statements executed through the pool. */
function instrument() {
  let catalogSelects = 0;
  const wrapped = function patched(...args) {
    const config = args[0] && typeof args[0] === 'object' ? args[0] : {};
    if (config.text && config.text.includes('from "skill_catalog"')) {
      catalogSelects += 1;
    }
    return originalQuery.apply(this, args);
  };
  pg.Pool.prototype.query = wrapped;
  return {
    count: () => catalogSelects,
    restore: () => {
      pg.Pool.prototype.query = originalQuery;
    },
  };
}

after(async () => {
  pg.Pool.prototype.query = originalQuery;
  await pool.end();
});

describe('SkillCatalogService reference-data cache', () => {
  it('1. whole-catalog read + categories hit the DB once, then are served from cache', async () => {
    const svc = new SkillCatalogService();
    const inst = instrument();
    try {
      const first = await svc.searchSkills({ query: '', pageSize: 500 });
      const cats1 = await svc.getCategories();
      const afterCold = inst.count();
      assert.ok(afterCold >= 2, `cold load should execute catalog queries, got ${afterCold}`);

      const second = await svc.searchSkills({ query: '', pageSize: 500 });
      const cats2 = await svc.getCategories();
      const afterWarm = inst.count();
      assert.equal(afterWarm, afterCold, 'warm reads must not execute new catalog queries');
      assert.equal(first.items.length, second.items.length, 'warm snapshot must be identical size');
      assert.equal(first.items[0]?.slug, second.items[0]?.slug);
      assert.equal(cats1.length, cats2.length);
    } finally {
      inst.restore();
    }
  });

  it('2. filtered searches always hit the DB (never served stale from cache)', async () => {
    const svc = new SkillCatalogService();
    // Warm the whole-catalog cache first
    const inst = instrument();
    try {
      await svc.searchSkills({ query: '', pageSize: 500 });
      const baseline = inst.count();

      const filtered = await svc.searchSkills({ query: 'aws' });
      const afterFiltered = inst.count();
      assert.ok(
        afterFiltered > baseline,
        `filtered search must execute a DB query (baseline=${baseline}, after=${afterFiltered})`
      );
      // Any active AWS-related rows must come back only through DB freshness
      assert.ok(Array.isArray(filtered.items));
      assert.equal(filtered.total, filtered.items.length);
    } finally {
      inst.restore();
    }
  });

  it('3. disableReferenceCache instance never caches', async () => {
    const svc = new SkillCatalogService(null, { disableReferenceCache: true });
    const inst = instrument();
    try {
      await svc.searchSkills({ query: '', pageSize: 500 });
      await svc.getCategories();
      const first = inst.count();
      await svc.searchSkills({ query: '', pageSize: 500 });
      await svc.getCategories();
      const second = inst.count();
      assert.ok(second > first, 'cache-disabled instance must re-query every time');
    } finally {
      inst.restore();
    }
  });

  it('4. cache-disabled and cached instances return the same catalog content', async () => {
    const cached = new SkillCatalogService();
    const uncached = new SkillCatalogService(null, { disableReferenceCache: true });
    const [a, b] = await Promise.all([
      cached.searchSkills({ query: '', pageSize: 500 }),
      uncached.searchSkills({ query: '', pageSize: 500 }),
    ]);
    assert.equal(a.total, b.total);
    assert.deepEqual(
      a.items.map((s) => s.slug),
      b.items.map((s) => s.slug),
      'cache must not change content or ordering'
    );
  });
});
