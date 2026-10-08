/** ISSUE-01: real PostgreSQL + Fastify, mocking only outbound GitHub HTTP. */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  sessions,
  resourceConnections,
  githubInstallationStates,
  auditLogs,
} from '../../src/db/schema.js';
import { createSession, getSessionCookieOptions } from '../../src/security/session.service.js';
import { decryptSecret } from '../../src/security/encryption.js';
import { buildApp } from '../../src/app.js';
import {
  githubFixture,
  installation,
  masterKey,
  authorizedFlow,
} from '../helpers/github-installation.fixture.js';

describe('ISSUE-01 secure installation claiming (PostgreSQL)', () => {
  const tenantIds = [crypto.randomUUID(), crypto.randomUUID()];
  let a, b, rawA, rawB;
  const rows = () =>
    db.select().from(resourceConnections).where(inArray(resourceConnections.tenantId, tenantIds));
  const assertUnlinked = async () => assert.equal((await rows()).length, 0);
  const organization = () =>
    installation({ account: { id: 700, login: 'trusted-org', type: 'Organization' } });

  // Exercise the exact migration in a transaction-local schema, never another database's tables.
  async function migrationProbe(duplicate) {
    const name = `issue01_migration_${crypto.randomBytes(8).toString('hex')}`;
    const migration = readFileSync(
      new URL('../../drizzle/0018_secure_github_installation_claims.sql', import.meta.url),
      'utf8'
    );
    const rollback = new Error('Migration probe verified; roll back test schema');
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.execute(
          sql.raw(`CREATE SCHEMA "${name}"; SET LOCAL search_path TO "${name}";
        CREATE TABLE tenants(id uuid PRIMARY KEY);
        CREATE TABLE users(id uuid PRIMARY KEY);
        CREATE TABLE sessions(id text PRIMARY KEY);
        CREATE TABLE resource_connections(id text PRIMARY KEY, provider text, installation_id text);
        INSERT INTO resource_connections VALUES ('original', 'GITHUB_APP', '9001');`)
        );
        if (duplicate)
          await tx.execute(
            sql.raw("INSERT INTO resource_connections VALUES ('foreign', 'GITHUB_APP', '9001')")
          );
        await tx.execute(sql.raw(migration));
        const columns = await tx.execute(
          sql`SELECT column_name FROM information_schema.columns WHERE table_schema = ${name} AND table_name = 'sessions'`
        );
        assert.ok(columns.rows.some((row) => row.column_name === 'github_user_id'));
        const indexes = await tx.execute(
          sql`SELECT indexname FROM pg_indexes WHERE schemaname = ${name}`
        );
        assert.ok(
          indexes.rows.some(
            (row) => row.indexname === 'resource_connections_github_installation_unique'
          )
        );
        const existing = await tx.execute(sql.raw('SELECT * FROM resource_connections'));
        assert.equal(existing.rows.length, 1);
        assert.equal(existing.rows[0].id, 'original');
        throw rollback;
      }),
      (error) => (duplicate ? (error.cause || error).code === '23505' : error === rollback)
    );
    const remaining = await db.execute(sql`SELECT 1 FROM pg_namespace WHERE nspname = ${name}`);
    assert.equal(remaining.rows.length, 0);
  }

  before(async () => {
    await db
      .insert(tenants)
      .values(tenantIds.map((id) => ({ id, name: 'ISSUE-01 test', slug: `issue01-${id}` })));
    const seeded = await db
      .insert(users)
      .values(
        tenantIds.map((tenantId, i) => ({
          tenantId,
          email: `issue01-${tenantId}@example.test`,
          displayName: `User ${i}`,
          role: 'OWNER',
        }))
      )
      .returning();
    const contexts = [];
    for (const [i, user] of seeded.entries()) {
      const created = await createSession(db, {
        userId: user.id,
        tenantId: user.tenantId,
        githubUserId: String(101 + i),
      });
      const [session] = await db.select().from(sessions).where(eq(sessions.id, created.sessionId));
      contexts.push({ user, session, tenantId: user.tenantId, rawToken: created.rawToken });
    }
    [a, b] = contexts;
    rawA = a.rawToken;
    rawB = b.rawToken;
  });
  beforeEach(async () => {
    await db
      .delete(githubInstallationStates)
      .where(inArray(githubInstallationStates.tenantId, tenantIds));
    await db.delete(resourceConnections).where(inArray(resourceConnections.tenantId, tenantIds));
    await db.delete(auditLogs).where(inArray(auditLogs.tenantId, tenantIds));
  });
  it('migration expands schema and preserves the existing installation row', async () =>
    migrationProbe(false));
  it('migration rejects historical duplicate claims atomically without choosing or deleting an owner', async () =>
    migrationProbe(true));
  after(async () => {
    await db.delete(tenants).where(inArray(tenants.id, tenantIds));
    await closeDatabase();
  });

  it('legitimate personal owner links using numeric ID despite a changed username; encrypted metadata and audit persist', async () => {
    const { service, calls } = githubFixture(db);
    const result = await service.linkInstallation(await authorizedFlow(service, a));
    assert.equal(result.isUpdate, false);
    assert.equal(result.connection.tenantId, a.tenantId);
    assert.equal(result.connection.metadata.authorizedGithubUserId, '101');
    const credentials = JSON.parse(
      decryptSecret(result.connection.encryptedCredentials, masterKey)
    );
    assert.equal(credentials.installationId, '9001');
    assert.equal(credentials.linkedByUserId, a.user.id);
    assert.equal(credentials.token, undefined);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.tenantId, a.tenantId));
    assert.equal(logs.length, 1);
    assert.equal(logs[0].resourceId, result.connection.id);
    assert.doesNotMatch(JSON.stringify(logs), /ghu_test|test-secret/);
    assert.ok(calls.some((c) => new URL(c.url).pathname === '/user/installations'));
  });
  it('active organization owner can claim an accessible organization installation', async () => {
    const { service } = githubFixture(db, { installation: organization() });
    assert.equal(
      (await service.linkInstallation(await authorizedFlow(service, a))).connection.metadata
        .targetType,
      'Organization'
    );
  });
  it('authorized reconnect updates the existing row, not a second owner; disconnected credentials are refreshed explicitly', async () => {
    const { service } = githubFixture(db);
    const first = await service.linkInstallation(await authorizedFlow(service, a));
    await db
      .update(resourceConnections)
      .set({ status: 'DISCONNECTED' })
      .where(eq(resourceConnections.id, first.connection.id));
    const second = await service.linkInstallation(await authorizedFlow(service, a));
    assert.equal(second.isUpdate, true);
    assert.equal(second.connection.id, first.connection.id);
    assert.equal(second.connection.status, 'ACTIVE');
    assert.equal((await rows()).length, 1);
  });

  for (const name of [
    'attacker knows victim ID',
    'foreign unclaimed personal installation',
    'App-visible but not user-accessible installation',
  ]) {
    it(`rejects ${name}`, async () => {
      const options = name.includes('personal')
        ? { installation: installation({ account: { id: 999, login: 'victim', type: 'User' } }) }
        : { accessible: [] };
      const { service, calls } = githubFixture(db, options);
      await assert.rejects(service.linkInstallation(await authorizedFlow(service, a)), {
        code: 'INSTALLATION_ACCESS_DENIED',
      });
      await assertUnlinked();
      assert.equal(calls.filter((c) => c.url.includes('/app/installations/')).length, 0);
    });
  }
  it('foreign already-claimed installation remains with its original tenant', async () => {
    const owner = githubFixture(db);
    await owner.service.linkInstallation(await authorizedFlow(owner.service, a));
    const attacker = githubFixture(db, { profile: { id: 102, type: 'User' }, accessible: [] });
    await assert.rejects(
      attacker.service.linkInstallation(await authorizedFlow(attacker.service, b)),
      { code: 'INSTALLATION_ACCESS_DENIED' }
    );
    assert.equal((await rows())[0].tenantId, a.tenantId);
    assert.equal((await rows()).length, 1);
  });
  for (const [name, membership] of [
    [
      'ordinary organization member',
      { state: 'active', role: 'member', organization: { id: 700 } },
    ],
    ['pending organization owner', { state: 'pending', role: 'admin', organization: { id: 700 } }],
    [
      'membership for another organization',
      { state: 'active', role: 'admin', organization: { id: 701 } },
    ],
  ])
    it(`rejects ${name}`, async () => {
      const { service } = githubFixture(db, { installation: organization(), membership });
      await assert.rejects(service.linkInstallation(await authorizedFlow(service, a)), {
        code: 'INSTALLATION_ACCESS_DENIED',
      });
      await assertUnlinked();
    });
  it('inaccessible organization (403) fails closed without an App fallback', async () => {
    const { service, calls } = githubFixture(db, {
      installation: organization(),
      fail: { '/user/memberships/orgs/trusted-org': 403 },
    });
    await assert.rejects(service.linkInstallation(await authorizedFlow(service, a)), {
      code: 'INSTALLATION_ACCESS_DENIED',
    });
    await assertUnlinked();
    assert.equal(calls.filter((c) => c.url.includes('/app/installations/')).length, 0);
  });
  it('GitHub user OAuth must match the numeric identity verified at login, not the same login/email text', async () => {
    const { service } = githubFixture(db, {
      profile: { id: 999, login: 'owner', email: a.user.email, type: 'User' },
    });
    await assert.rejects(service.linkInstallation(await authorizedFlow(service, a)), {
      code: 'INSTALLATION_ACCESS_DENIED',
    });
    await assertUnlinked();
  });

  const stateAttacks = [
    ['missing state', (flow) => ({ ...flow, stateToken: undefined })],
    [
      'invalid state',
      (flow) => ({
        ...flow,
        stateToken: `${flow.stateToken}x`,
        cookieToken: `${flow.stateToken}x`,
      }),
    ],
    ['missing cookie', (flow) => ({ ...flow, cookieToken: undefined })],
    ['cookie mismatch', (flow) => ({ ...flow, cookieToken: 'other-state' })],
    ['another user', (flow) => ({ ...flow, ...b })],
    [
      'another tenant',
      (flow) => ({
        ...flow,
        tenantId: b.tenantId,
        user: { ...a.user, tenantId: b.tenantId },
        session: { ...a.session, tenantId: b.tenantId },
      }),
    ],
    ['installation mismatch', (flow) => ({ ...flow, installationId: 9002 })],
    ['another session', (flow) => ({ ...flow, session: { ...flow.session, id: b.session.id } })],
  ];
  for (const [name, mutate] of stateAttacks)
    it(`state attack: ${name} cannot create a connection`, async () => {
      const { service, calls } = githubFixture(db);
      const flow = await authorizedFlow(service, a);
      await assert.rejects(service.linkInstallation(mutate(flow)));
      await assertUnlinked();
      assert.equal(calls.length, 0);
    });
  it('expired durable state fails even with a still correctly signed cookie', async () => {
    const { service, calls } = githubFixture(db);
    const flow = await authorizedFlow(service, a);
    await db
      .update(githubInstallationStates)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(githubInstallationStates.sessionId, a.session.id));
    await assert.rejects(service.linkInstallation(flow), { code: 'INVALID_OAUTH_STATE' });
    await assertUnlinked();
    assert.equal(calls.length, 0);
  });
  it('install state can transition only once and cannot be rebound to a different installation', async () => {
    const { service } = githubFixture(db);
    const start = await service.createInstallationState(a);
    const request = {
      ...a,
      stateToken: start.stateToken,
      cookieToken: start.stateToken,
      installationId: 9001,
    };
    await service.beginUserAuthorization(request);
    await assert.rejects(service.beginUserAuthorization({ ...request, installationId: 9002 }), {
      code: 'INVALID_OAUTH_STATE',
    });
    await assertUnlinked();
  });
  it('OAuth state replay is rejected before further GitHub requests', async () => {
    const { service, calls } = githubFixture(db);
    const flow = await authorizedFlow(service, a);
    await service.linkInstallation(flow);
    const count = calls.length;
    await assert.rejects(service.linkInstallation(flow), { code: 'INVALID_OAUTH_STATE' });
    assert.equal(calls.length, count);
    assert.equal((await rows()).length, 1);
  });
  it('simultaneous callbacks with the same state execute authority checks only once', async () => {
    const { service, calls } = githubFixture(db);
    const flow = await authorizedFlow(service, a);
    const attempts = await Promise.allSettled([
      service.linkInstallation(flow),
      service.linkInstallation(flow),
    ]);
    assert.equal(attempts.filter((v) => v.status === 'fulfilled').length, 1);
    assert.equal(calls.filter((c) => c.url.includes('/login/oauth/access_token')).length, 1);
    assert.equal((await rows()).length, 1);
  });

  const failures = [
    ['revoked user authorization', { fail: { '/login/oauth/access_token': 401 } }],
    ['revoked installation', { fail: { '/app/installations/9001': 403 } }],
    ['deleted installation', { fail: { '/app/installations/9001': 404 } }],
    ['GitHub unavailable', { fail: { '/user/installations': 503 } }],
    ['GitHub network error', { fail: { '/user/installations': 'network' } }],
    ['invalid JSON', { fail: { '/user/installations': 'json' } }],
    ['invalid installation list', { listResponse: { total_count: 1, installations: null } }],
    ['OAuth error with HTTP 200', { token: { error: 'bad_verification_code' } }],
    [
      'login OAuth token used instead of App user token',
      { token: { access_token: 'gho_wrong_app', token_type: 'bearer' } },
    ],
    [
      'suspended installation',
      { appResponse: installation({ suspended_at: '2026-10-07T00:00:00Z' }) },
    ],
    ['mismatched App response', { appResponse: installation({ id: 9002 }) }],
    [
      'App and user account disagreement',
      { appResponse: installation({ account: { id: 999, login: 'victim', type: 'User' } }) },
    ],
    ['insufficient installation permissions', { appResponse: installation({ permissions: {} }) }],
  ];
  for (const [name, options] of failures)
    it(`fails closed: ${name}; state is burned`, async () => {
      const { service } = githubFixture(db, options);
      const flow = await authorizedFlow(service, a);
      await assert.rejects(service.linkInstallation(flow), { code: 'INSTALLATION_ACCESS_DENIED' });
      await assertUnlinked();
      await assert.rejects(service.linkInstallation(flow), { code: 'INVALID_OAUTH_STATE' });
    });
  it('pagination finds an authorized installation after the first page', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => installation({ id: i + 1 }));
    const { service, calls } = githubFixture(db, {
      pages: [
        { total_count: 101, installations: page1 },
        { total_count: 101, installations: [installation()] },
      ],
    });
    await service.linkInstallation(await authorizedFlow(service, a));
    assert.ok(calls.some((c) => c.url.endsWith('page=2')));
  });
  it('two authorized tenants racing for the same organization yield exactly one owner and one deterministic rejection', async () => {
    // Both are genuine org owners; authorization is not the race arbiter, PostgreSQL is.
    let release,
      arrivals = 0;
    const barrier = new Promise((resolve) => {
      release = resolve;
    });
    const beforeAppResponse = async () => {
      if (++arrivals === 2) release();
      await barrier;
    };
    const left = githubFixture(db, { installation: organization(), beforeAppResponse });
    const right = githubFixture(db, {
      installation: organization(),
      profile: { id: 102, type: 'User' },
      beforeAppResponse,
    });
    const flows = await Promise.all([
      authorizedFlow(left.service, a),
      authorizedFlow(right.service, b),
    ]);
    const attempts = await Promise.allSettled([
      left.service.linkInstallation(flows[0]),
      right.service.linkInstallation(flows[1]),
    ]);
    assert.equal(attempts.filter((v) => v.status === 'fulfilled').length, 1);
    const rejected = attempts.filter((v) => v.status === 'rejected');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'CONFLICT');
    assert.equal(rejected[0].reason.statusCode, 409);
    assert.equal(rejected[0].reason.details.reason, 'INSTALLATION_ALREADY_LINKED');
    assert.equal((await rows()).length, 1);
    const logs = await db.select().from(auditLogs).where(inArray(auditLogs.tenantId, tenantIds));
    assert.equal(logs.length, 1);
    assert.equal(logs[0].tenantId, (await rows())[0].tenantId);
  });
  it('an already-claimed installation rejects another authorized org owner without replacing the tenant', async () => {
    const left = githubFixture(db, { installation: organization() });
    const right = githubFixture(db, {
      installation: organization(),
      profile: { id: 102, type: 'User' },
    });
    await left.service.linkInstallation(await authorizedFlow(left.service, a));
    await assert.rejects(right.service.linkInstallation(await authorizedFlow(right.service, b)), {
      code: 'CONFLICT',
      statusCode: 409,
    });
    assert.equal((await rows()).length, 1);
    assert.equal((await rows())[0].tenantId, a.tenantId);
  });
  it('global unique index rejects direct competing inserts independently of service checks', async () => {
    const { service } = githubFixture(db);
    await service.linkInstallation(await authorizedFlow(service, a));
    const [{ id: _id, ...existing }] = await rows();
    await assert.rejects(
      db
        .insert(resourceConnections)
        .values({ ...existing, tenantId: b.tenantId, userId: b.user.id }),
      (error) => (error.cause || error).code === '23505'
    );
    assert.equal((await rows()).length, 1);
  });
  it('a database/audit transaction failure rolls back the connection and cannot replay authorization', async () => {
    const { service } = githubFixture(db);
    const flow = await authorizedFlow(service, a);
    service.db = {
      delete: db.delete.bind(db),
      transaction: (callback) =>
        db.transaction(async (tx) => {
          await callback(tx);
          throw new Error('Simulated transaction/commit failure');
        }),
    };
    await assert.rejects(service.linkInstallation(flow), /Simulated transaction/);
    await assertUnlinked();
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.tenantId, a.tenantId));
    assert.equal(logs.length, 0);
    await assert.rejects(service.linkInstallation(flow), { code: 'INVALID_OAUTH_STATE' });
  });
  it('failure to consume state in the database prevents GitHub verification and linking', async () => {
    const { service, calls } = githubFixture(db);
    const flow = await authorizedFlow(service, a);
    service.db = {
      delete: () => {
        throw new Error('Database unavailable');
      },
    };
    await assert.rejects(service.linkInstallation(flow), /Database unavailable/);
    assert.equal(calls.length, 0);
    await assertUnlinked();
  });
  it('a validly signed but never-issued state cannot bypass the durable state store', async () => {
    const { service, calls } = githubFixture(db);
    const flow = await authorizedFlow(service, a);
    await db
      .delete(githubInstallationStates)
      .where(eq(githubInstallationStates.sessionId, a.session.id));
    await assert.rejects(service.linkInstallation(flow), { code: 'INVALID_OAUTH_STATE' });
    assert.equal(calls.length, 0);
    await assertUnlinked();
  });

  it('HTTP route requires session, state and two callbacks with exact PKCE binding', async () => {
    const { service, calls } = githubFixture(db);
    const app = buildApp({ logger: false, db, installationService: service });
    try {
      const sessionName = getSessionCookieOptions().name;
      assert.equal((await app.inject('/integrations/github/install')).statusCode, 401);
      const start = await app.inject({
        url: '/integrations/github/install',
        cookies: { [sessionName]: rawA },
      });
      assert.equal(start.statusCode, 302);
      const initial = new URL(start.headers.location).searchParams.get('state');
      const stateCookie = start.cookies.find((c) => c.name === 'gh_install_state');
      assert.equal(stateCookie.path, '/');
      assert.equal(stateCookie.value, initial);
      for (const setup_action of ['install', 'update']) {
        const missing = await app.inject({
          url: '/integrations/github/install/callback',
          query: { installation_id: 9001, setup_action },
          cookies: { [sessionName]: rawA },
        });
        assert.equal(missing.statusCode, 400);
      }
      const callback = await app.inject({
        url: '/integrations/github/install/callback',
        query: { installation_id: 9001, state: initial },
        cookies: { [sessionName]: rawA, gh_install_state: initial },
      });
      assert.equal(callback.statusCode, 302);
      await assertUnlinked();
      const url = new URL(callback.headers.location);
      const state = url.searchParams.get('state');
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      const badSession = await app.inject({
        url: '/integrations/github/authorize/callback',
        query: { state, code: 'valid-code' },
        cookies: { [sessionName]: rawB, gh_install_state: state },
      });
      assert.equal(badSession.statusCode, 401);
      const finish = await app.inject({
        url: '/integrations/github/authorize/callback',
        query: { state, code: 'valid-code' },
        cookies: { [sessionName]: rawA, gh_install_state: state },
      });
      assert.equal(finish.statusCode, 302);
      assert.equal(finish.headers.location, '/dashboard?connection=linked');
      const exchange = calls.find((c) => c.url.includes('/login/oauth/access_token'));
      const verifier = new URLSearchParams(exchange.request.body).get('code_verifier');
      assert.equal(
        crypto.createHash('sha256').update(verifier).digest('base64url'),
        url.searchParams.get('code_challenge')
      );
      assert.equal(finish.cookies.find((c) => c.name === 'gh_install_state').value, '');
    } finally {
      await app.close();
    }
  });
});
