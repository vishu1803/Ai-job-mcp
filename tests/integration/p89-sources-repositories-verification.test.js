/**
 * @file Integration Tests for Sources & Repository Management (P89)
 *
 * Verifies:
 * 1. Discovers candidate and authentic connected repositories from the database (repository-agnostic).
 * 2. GET /sources returns all 10 active repositories with correct metadata and canonical URLs.
 * 3. Stable repository identity on (tenant_id, provider, external_resource_id).
 * 4. State Machine Lifecycle (10 -> 9 -> 10):
 *    - Deselect 1 repository -> GET /sources returns 9 active.
 *    - Total rows in database remains 10 (1 DISCONNECTED, 9 ACTIVE).
 *    - Re-select repository -> GET /sources returns 10 active.
 *    - Total rows in database remains 10 (0 duplicates created).
 * 5. Database unique constraint rejects duplicate repository inserts for the same tenant & external_id.
 * 6. Tenant isolation: a different tenant cannot access or see candidate repositories.
 * 7. Reload persistence: multiple subsequent GET /sources calls return consistent data.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import { resources, candidates, users, tenants, sessions } from '../../src/db/schema.js';

describe('P89 Sources & Repository Verification Integration Tests', () => {
  let app;
  let candidate;
  let user;
  let tenant;
  let sessionToken;
  let syntheticOtherTenant;
  let syntheticOtherUser;
  let syntheticOtherSessionToken;

  before(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    // 1. Discover target candidate from database source of truth
    const candidateList = await db.select().from(candidates);
    candidate = candidateList.find((c) => c.displayName?.includes('Vishwanath') || c.canonicalEmail?.includes('vishw'));
    assert.ok(candidate, 'Target candidate must exist in database');

    const [userRecord] = await db.select().from(users).where(eq(users.id, candidate.userId));
    assert.ok(userRecord, 'Candidate user record must exist in database');
    user = userRecord;

    const [tenantRecord] = await db.select().from(tenants).where(eq(tenants.id, candidate.tenantId));
    assert.ok(tenantRecord, 'Candidate tenant record must exist in database');
    tenant = tenantRecord;

    // 2. Ensure candidate's 10 repositories are in ACTIVE state for testing baseline
    await db
      .update(resources)
      .set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(and(eq(resources.candidateId, candidate.id), eq(resources.provider, 'GITHUB_APP')));

    // 3. Create authenticated session for candidate
    sessionToken = crypto.randomBytes(32).toString('hex');
    const hashedSessionId = crypto.createHash('sha256').update(sessionToken).digest('hex');
    await db.insert(sessions).values({
      id: hashedSessionId,
      userId: user.id,
      tenantId: tenant.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // 4. Create an isolated other tenant for tenant isolation verification
    const otherTenantId = crypto.randomUUID();
    const otherUserId = crypto.randomUUID();
    const [createdOtherTenant] = await db
      .insert(tenants)
      .values({
        id: otherTenantId,
        name: 'Isolated Other Workspace',
        slug: `isolated-${crypto.randomBytes(4).toString('hex')}`,
        tier: 'FREE',
      })
      .returning();
    syntheticOtherTenant = createdOtherTenant;

    const [createdOtherUser] = await db
      .insert(users)
      .values({
        id: otherUserId,
        tenantId: otherTenantId,
        email: `other-tenant-${crypto.randomBytes(4).toString('hex')}@example.test`,
        role: 'OWNER',
        displayName: 'Other Tenant User',
      })
      .returning();
    syntheticOtherUser = createdOtherUser;

    syntheticOtherSessionToken = crypto.randomBytes(32).toString('hex');
    const hashedOtherSessionId = crypto.createHash('sha256').update(syntheticOtherSessionToken).digest('hex');
    await db.insert(sessions).values({
      id: hashedOtherSessionId,
      userId: syntheticOtherUser.id,
      tenantId: syntheticOtherTenant.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  });

  after(async () => {
    // Clean up sessions
    if (sessionToken) {
      const hashedSessionId = crypto.createHash('sha256').update(sessionToken).digest('hex');
      await db.delete(sessions).where(eq(sessions.id, hashedSessionId));
    }
    if (syntheticOtherSessionToken) {
      const hashedOtherSessionId = crypto.createHash('sha256').update(syntheticOtherSessionToken).digest('hex');
      await db.delete(sessions).where(eq(sessions.id, hashedOtherSessionId));
    }
    if (syntheticOtherTenant) {
      await db.delete(tenants).where(eq(tenants.id, syntheticOtherTenant.id));
    }
    await app.close();
    await closeDatabase();
  });

  it('1. Discovers authentic candidate repositories from database source-of-truth', async () => {
    const candidateRepos = await db
      .select()
      .from(resources)
      .where(and(eq(resources.candidateId, candidate.id), eq(resources.provider, 'GITHUB_APP')));

    assert.strictEqual(candidateRepos.length, 10, 'Candidate must have exactly 10 authentic repositories');
    const activeRepos = candidateRepos.filter((r) => r.status === 'ACTIVE');
    assert.strictEqual(activeRepos.length, 10, 'All 10 authentic repositories must be in ACTIVE status');
  });

  it('2. GET /sources returns all 10 connected repositories with valid metadata', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/sources',
      headers: {
        Accept: 'application/json',
      },
      cookies: {
        career_hub_session: sessionToken,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.success, true);
    assert.ok(body.data.github);
    assert.ok(body.data.github.connection, 'GitHub connection must exist');
    assert.strictEqual(body.data.github.connection.status, 'ACTIVE');

    const repos = body.data.github.repositories;
    assert.strictEqual(repos.length, 10, 'Must return exactly 10 connected repositories');

    for (const repo of repos) {
      assert.ok(repo.id, 'Repository must have primary UUID');
      assert.ok(repo.name, 'Repository must have name');
      assert.ok(repo.externalResourceId, 'Repository must have numeric external ID');
      assert.strictEqual(repo.status, 'ACTIVE');
      assert.ok(repo.url.startsWith('https://github.com/'));
    }
  });

  it('3. GET /sources preserves repository state across reloads (idempotency)', async () => {
    for (let reloadAttempt = 1; reloadAttempt <= 3; reloadAttempt++) {
      const res = await app.inject({
        method: 'GET',
        url: '/sources',
        headers: { Accept: 'application/json' },
        cookies: { career_hub_session: sessionToken },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.data.github.repositories.length, 10, `Reload attempt ${reloadAttempt} must show 10 repositories`);
    }
  });

  it('4. Enforces stable repository identity and state machine lifecycle (10 -> 9 -> 10) with 0 duplicates', async () => {
    // 1. Query baseline 10 repos
    const initialRepos = await db
      .select()
      .from(resources)
      .where(and(eq(resources.candidateId, candidate.id), eq(resources.provider, 'GITHUB_APP')));
    assert.strictEqual(initialRepos.length, 10);

    const repoToDisconnect = initialRepos[0];

    // 2. Transition repoToDisconnect: ACTIVE -> DISCONNECTED (simulating deselection)
    await db
      .update(resources)
      .set({ status: 'DISCONNECTED', updatedAt: new Date() })
      .where(eq(resources.id, repoToDisconnect.id));

    // 3. Verify GET /sources returns 9 active repositories
    const res9 = await app.inject({
      method: 'GET',
      url: '/sources',
      headers: { Accept: 'application/json' },
      cookies: { career_hub_session: sessionToken },
    });
    assert.strictEqual(res9.statusCode, 200);
    const body9 = JSON.parse(res9.payload);
    assert.strictEqual(body9.data.github.repositories.length, 9, 'Should return 9 active repositories after 1 is disconnected');
    assert.strictEqual(
      body9.data.github.repositories.some((r) => r.id === repoToDisconnect.id),
      false,
      'Disconnected repo must not appear in active repository list'
    );

    // Verify DB still contains exactly 10 rows total (1 DISCONNECTED, 9 ACTIVE)
    const midCheck = await db
      .select()
      .from(resources)
      .where(and(eq(resources.candidateId, candidate.id), eq(resources.provider, 'GITHUB_APP')));
    assert.strictEqual(midCheck.length, 10, 'Total database records must remain 10 during disconnection');
    assert.strictEqual(midCheck.filter((r) => r.status === 'DISCONNECTED').length, 1);

    // 4. Transition repoToDisconnect: DISCONNECTED -> ACTIVE (simulating reconnection)
    await db
      .update(resources)
      .set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(eq(resources.id, repoToDisconnect.id));

    // 5. Verify GET /sources returns 10 active repositories again
    const res10 = await app.inject({
      method: 'GET',
      url: '/sources',
      headers: { Accept: 'application/json' },
      cookies: { career_hub_session: sessionToken },
    });
    assert.strictEqual(res10.statusCode, 200);
    const body10 = JSON.parse(res10.payload);
    assert.strictEqual(body10.data.github.repositories.length, 10, 'Should return 10 active repositories after reconnection');

    // 6. Assert ZERO duplicate records were created (total count remains exactly 10)
    const finalCheck = await db
      .select()
      .from(resources)
      .where(and(eq(resources.candidateId, candidate.id), eq(resources.provider, 'GITHUB_APP')));
    assert.strictEqual(finalCheck.length, 10, 'Total database records must remain exactly 10 (0 duplicates)');
    assert.strictEqual(finalCheck.filter((r) => r.status === 'ACTIVE').length, 10);
  });

  it('5. Database unique constraint prevents duplicate repository records on (tenant_id, provider, external_resource_id)', async () => {
    const existing = (
      await db
        .select()
        .from(resources)
        .where(and(eq(resources.candidateId, candidate.id), eq(resources.provider, 'GITHUB_APP')))
        .limit(1)
    )[0];

    assert.ok(existing);

    // Attempt to insert duplicate record with same tenantId, provider, externalResourceId
    await assert.rejects(
      async () => {
        await db.insert(resources).values({
          tenantId: existing.tenantId,
          candidateId: candidate.id,
          connectionId: existing.connectionId,
          provider: existing.provider,
          resourceType: 'REPOSITORY',
          externalResourceId: existing.externalResourceId,
          name: 'Duplicate Attempt',
          displayName: 'Duplicate Attempt',
          status: 'ACTIVE',
        });
      },
      (err) => {
        // Must reject with Postgres unique constraint violation error code 23505
        return Boolean(
          err.code === '23505' ||
          err.cause?.code === '23505' ||
          err.message?.includes('unique') ||
          err.cause?.message?.includes('unique constraint')
        );
      }
    );
  });

  it('6. Tenant isolation: other workspace tenants cannot see candidate repositories', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/sources',
      headers: { Accept: 'application/json' },
      cookies: { career_hub_session: syntheticOtherSessionToken },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.github.repositories.length, 0, 'Other tenant must see 0 repositories');
  });
});
