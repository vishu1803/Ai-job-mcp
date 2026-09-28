/**
 * @file Integration Regression: candidate profile read-cache semantics.
 *
 * The read cache exists to stop a user's second page view from replaying the whole
 * profile assembly. This suite pins the three properties that make it safe:
 *
 *   1. A repeat read within the TTL performs no profile assembly work at all.
 *   2. The candidate root read and the access check are NEVER cached, so a candidate
 *      that has since been removed still fails loudly instead of being served from a
 *      stale cache entry.
 *   3. Repeated reads return equivalent data, not a shared mutable object.
 *
 * The cache is off by default under the test runner (asserted in the unit suite), so
 * this file opts in explicitly through `READ_CACHE_ENABLED` before importing the service.
 * The env assignment must therefore happen before the dynamic imports below.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

process.env.READ_CACHE_ENABLED = 'true';

let queryCount = 0;
const originalQuery = pg.Pool.prototype.query;
pg.Pool.prototype.query = function countedQuery(...queryArgs) {
  queryCount += 1;
  return originalQuery.apply(this, queryArgs);
};

const { db, closeDatabase } = await import('../../src/db/index.js');
const { tenants, users, candidates } = await import('../../src/db/schema.js');
const { eq } = await import('drizzle-orm');
const { CandidateProfileService } = await import('../../src/services/candidate-profile.service.js');

describe('Candidate profile read cache (real DB)', () => {
  let tenant;
  let user;
  let candidate;
  let service;
  let context;

  before(async () => {
    const runId = crypto.randomUUID().slice(0, 8);

    [tenant] = await db
      .insert(tenants)
      .values({ name: `Read Cache Tenant ${runId}`, slug: `read-cache-${runId}` })
      .returning();

    [user] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: `read-cache-${runId}@example.com`,
        displayName: 'Read Cache User',
        role: 'OWNER',
      })
      .returning();

    [candidate] = await db
      .insert(candidates)
      .values({
        tenantId: tenant.id,
        userId: user.id,
        displayName: 'Read Cache Candidate',
        canonicalEmail: `read-cache-${runId}@example.com`,
      })
      .returning();

    service = new CandidateProfileService(db);
    // OWNER with an explicit role avoids the extra role lookup, so a cache hit should
    // cost exactly one statement: the uncached candidate root read.
    context = { tenantId: tenant.id, userId: user.id, role: 'OWNER' };
  });

  after(async () => {
    try {
      if (candidate?.id) await db.delete(candidates).where(eq(candidates.id, candidate.id));
      if (user?.id) await db.delete(users).where(eq(users.id, user.id));
      if (tenant?.id) await db.delete(tenants).where(eq(tenants.id, tenant.id));
    } finally {
      pg.Pool.prototype.query = originalQuery;
      await closeDatabase();
    }
  });

  it('does not reassemble the profile for a repeat read inside the TTL', async () => {
    queryCount = 0;
    const first = await service.getProfile(context, candidate.id);
    const firstLoadQueries = queryCount;

    assert.ok(
      firstLoadQueries > 1,
      `a cold read must assemble the profile from several reads, saw ${firstLoadQueries}`
    );
    assert.strictEqual(first.candidate.id, candidate.id);
    assert.ok(Array.isArray(first.skills), 'the assembled payload is returned intact');

    queryCount = 0;
    const second = await service.getProfile(context, candidate.id);
    const secondLoadQueries = queryCount;

    assert.ok(
      secondLoadQueries < firstLoadQueries,
      `a repeat read must cost less than a cold read (${secondLoadQueries} vs ${firstLoadQueries})`
    );
    assert.ok(
      secondLoadQueries <= 1,
      `a repeat read should only pay the uncached root read, saw ${secondLoadQueries}`
    );

    assert.deepStrictEqual(second.skills, first.skills, 'a cached read must return the same data');
  });

  it('returns an isolated copy so a caller cannot corrupt the cached payload', async () => {
    const first = await service.getProfile(context, candidate.id);
    first.candidate.displayName = 'MUTATED BY CALLER';
    first.skills.push({ name: 'injected' });

    const second = await service.getProfile(context, candidate.id);
    assert.strictEqual(
      second.candidate.displayName,
      'Read Cache Candidate',
      'mutating one result must not leak into the cached entry'
    );
    assert.ok(
      !second.skills.some((skill) => skill.name === 'injected'),
      'mutating a nested array must not leak into the cached entry'
    );
  });

  it('never serves a cache entry for a candidate that no longer exists', async () => {
    // Warm the cache, then remove the candidate. The root read and access check are
    // deliberately outside the cache, so this must fail rather than return stale data.
    await service.getProfile(context, candidate.id);

    const [doomed] = await db
      .insert(candidates)
      .values({
        tenantId: tenant.id,
        userId: user.id,
        displayName: 'Doomed Candidate',
        canonicalEmail: `doomed-${crypto.randomUUID().slice(0, 8)}@example.com`,
      })
      .returning();

    await service.getProfile(context, doomed.id);
    await db.delete(candidates).where(eq(candidates.id, doomed.id));

    await assert.rejects(
      () => service.getProfile(context, doomed.id),
      /Candidate not found/,
      'a deleted candidate must not be served from the cache'
    );
  });
});
