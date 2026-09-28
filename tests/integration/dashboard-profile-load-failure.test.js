/**
 * @file Integration Regression: Dashboard profile-load failure contract.
 *
 * Root cause being locked down: `loadDashboardData` used to swallow a
 * `getCareerProfile()` rejection (e.g. a `57014` statement timeout) and continue
 * with `candidateProfile = null`, which then crashed inside
 * `identifyProfileConflicts` on `null.jobPreferences` and surfaced as a fake
 * "empty candidate profile".
 *
 * This suite proves that a database/profile outage:
 *   1. Does NOT return HTTP 200 with a fabricated empty dashboard.
 *   2. DOES return a structured server error instead.
 *   3. Never reproduces the old `Cannot read properties of null` crash signature.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, candidates } from '../../src/db/schema.js';
import { createSession } from '../../src/security/session.service.js';

describe('Dashboard profile-load failure contract', () => {
  let app;
  let tenant;
  let user;
  let candidate;
  let sessionToken;

  before(async () => {
    const runId = crypto.randomUUID().slice(0, 8);

    [tenant] = await db
      .insert(tenants)
      .values({ name: `Dash Failure Tenant ${runId}`, slug: `dash-failure-${runId}` })
      .returning();

    [user] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: `dash-failure-${runId}@example.com`,
        displayName: 'Dash Failure User',
        role: 'MEMBER',
      })
      .returning();

    [candidate] = await db
      .insert(candidates)
      .values({
        tenantId: tenant.id,
        userId: user.id,
        displayName: 'Dash Failure Candidate',
        canonicalEmail: `dash-failure-${runId}@example.com`,
      })
      .returning();

    // Simulate the observed runtime failure: a profile load that rejects the way
    // a database statement timeout does.
    const failingCandidateProfileService = {
      getCareerProfile: async () => {
        const err = new Error('canceling statement due to statement timeout');
        err.code = '57014';
        throw err;
      },
    };

    app = buildApp({ logger: false, candidateProfileService: failingCandidateProfileService });
    await app.ready();

    const session = await createSession(db, { userId: user.id, tenantId: tenant.id });
    sessionToken = session.rawToken;
  });

  after(async () => {
    if (app) await app.close();
    try {
      if (candidate?.id) await db.delete(candidates).where(eq(candidates.id, candidate.id));
      if (user?.id) await db.delete(users).where(eq(users.id, user.id));
      if (tenant?.id) await db.delete(tenants).where(eq(tenants.id, tenant.id));
    } finally {
      await closeDatabase();
    }
  });

  it('GET /dashboard surfaces the failure instead of a fabricated empty dashboard', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: { accept: 'application/json' },
      cookies: { career_hub_session: sessionToken },
    });

    assert.notStrictEqual(
      res.statusCode,
      200,
      'a failed profile load must not produce a 200 empty dashboard'
    );
    assert.ok(res.statusCode >= 500, `expected a server error, received ${res.statusCode}`);

    const body = JSON.parse(res.payload);
    assert.ok(body.error, 'must return a structured error payload');
    assert.strictEqual(
      /Cannot read properties of null/.test(res.payload),
      false,
      'must never reproduce the null-dereference crash signature'
    );
  });
});
