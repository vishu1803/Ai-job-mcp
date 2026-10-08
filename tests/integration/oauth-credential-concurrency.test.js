import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import Fastify from 'fastify';
import { eq } from 'drizzle-orm';
import { db, pool, createPool, createDb, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  oauthTokens,
  oauthAuthorizationCodes,
  auditLogs,
} from '../../src/db/schema.js';
import {
  OAuthAuthorizationService,
  hashOAuthToken,
} from '../../src/services/oauth-authorization.service.js';
import { AiConnectionStatusService } from '../../src/services/ai-connection-status.service.js';
import { authenticateMcpRequest } from '../../src/security/mcp-auth.js';
import { oauthRoutes } from '../../src/routes/oauth.routes.js';
import { AuthenticationError } from '../../src/errors/index.js';

describe('ISSUE-04 single-use OAuth credentials (real PostgreSQL)', () => {
  const tenantId = crypto.randomUUID(),
    userId = crypto.randomUUID();
  const foreignTenantId = crypto.randomUUID();
  const clientId = 'claude-web',
    redirectUri = 'https://claude.ai/api/mcp/auth_callback';
  const resource = 'http://localhost:3000/mcp',
    codeVerifier = 'v'.repeat(60);
  const base = new OAuthAuthorizationService({ db });
  before(async () => {
    for (const id of [tenantId, foreignTenantId]) {
      await db.insert(tenants).values({ id, name: 'ISSUE04', slug: 'issue04-' + id });
    }
    await db.insert(users).values({
      id: userId,
      tenantId,
      email: userId + '@example.test',
      displayName: 'ISSUE04',
      role: 'MEMBER',
    });
  });
  after(async () => {
    try {
      for (const id of [tenantId, foreignTenantId])
        await db.delete(tenants).where(eq(tenants.id, id));
    } finally {
      await closeDatabase();
    }
  });
  async function fixture(kind = 'code', overrides = {}) {
    const code = await base.createAuthorizationCode({
      clientId,
      redirectUri,
      resource,
      codeChallenge: crypto.createHash('sha256').update(codeVerifier).digest('base64url'),
      scopes: ['career:read'],
      tenantId,
      userId,
      userRole: 'MEMBER',
      ...overrides,
    });
    const codeArgs = { clientId, redirectUri, resource, code, codeVerifier };
    const [codeRow] = await db
      .select()
      .from(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.codeHash, hashOAuthToken(code)));
    if (kind === 'code')
      return {
        args: codeArgs,
        row: codeRow,
        method: 'exchangeAuthorizationCode',
        table: 'oauth_authorization_codes',
      };
    const pair = await base.exchangeAuthorizationCode(codeArgs);
    const [row] = await db
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.refreshTokenHash, hashOAuthToken(pair.refresh_token)));
    return {
      args: { clientId, resource, refreshToken: pair.refresh_token },
      row,
      pair,
      method: 'refreshAccessToken',
      table: 'oauth_tokens',
    };
  }
  async function rows(f) {
    return db
      .select()
      .from(oauthTokens)
      .where(
        f.method === 'exchangeAuthorizationCode'
          ? eq(oauthTokens.authorizationCodeId, f.row.id)
          : eq(oauthTokens.familyId, f.row.familyId)
      );
  }
  const invalidGrant = (err) => err.code === 'INVALID_GRANT';
  async function freshService(callback) {
    const p = createPool({ max: 1 });
    try {
      return await callback(new OAuthAuthorizationService({ db: createDb(p) }));
    } finally {
      await closeDatabase(p);
    }
  }

  for (const kind of ['code', 'refresh']) {
    for (const count of [2, 10, 50]) {
      it(`${kind}: ${count} concurrent callers on separate pools and services have one winner`, async () => {
        const f = await fixture(kind);
        const results = await Promise.allSettled(
          Array.from({ length: count }, () => freshService((s) => s[f.method](f.args)))
        );
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
        for (const r of results.filter((r) => r.status === 'rejected'))
          assert.equal(r.reason.code, 'INVALID_GRANT');
        const stored = await rows(f);
        assert.equal(stored.length, kind === 'code' ? 1 : 2);
        if (kind === 'refresh') {
          assert.equal(stored.filter((r) => r.predecessorId === f.row.id).length, 1);
          assert.ok(
            stored.every((r) => r.isRevoked && r.familyRevokedAt),
            'strict replay revokes winner too'
          );
        }
        console.log(`ISSUE04 ${kind} callers=${count} pools=${count} winners=1 successorPairs=1`);
      });
    }
    it(`${kind}: forced PostgreSQL row-lock contention has one winner`, async () => {
      const f = await fixture(kind),
        lock = await pool.connect();
      const name = 'issue04-' + crypto.randomUUID();
      const pools = Array.from({ length: 10 }, () =>
        createPool({ max: 1, application_name: name })
      );
      let requests;
      try {
        await lock.query('BEGIN');
        await lock.query(`SELECT id FROM ${f.table} WHERE id=$1 FOR UPDATE`, [f.row.id]);
        requests = Promise.allSettled(
          pools.map((p) => new OAuthAuthorizationService({ db: createDb(p) })[f.method](f.args))
        );
        let waiting = 0;
        for (let i = 0; i < 200 && waiting < 2; i++) {
          const q = await pool.query(
            "SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",
            [name]
          );
          waiting = q.rows[0].n;
          if (waiting < 2) await new Promise((r) => setTimeout(r, 20));
        }
        assert.ok(waiting >= 2, 'actual PostgreSQL lock wait observed across connections');
        await lock.query('COMMIT');
        const results = await requests;
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
        assert.equal((await rows(f)).length, kind === 'code' ? 1 : 2);
      } finally {
        await lock.query('ROLLBACK');
        lock.release();
        if (requests) await requests;
        await Promise.all(pools.map((p) => closeDatabase(p)));
      }
    });
    it(`${kind}: two independent Node processes cannot fork credentials`, async () => {
      const f = await fixture(kind);
      const script = `
        import {once} from 'node:events';
        import {OAuthAuthorizationService} from './src/services/oauth-authorization.service.js';
        import {db,closeDatabase} from './src/db/index.js';
        process.stdin.resume();const go=once(process.stdin,'data');console.log('READY');await go;
        try { await new OAuthAuthorizationService({db})[${JSON.stringify(f.method)}](${JSON.stringify(f.args)});console.log('WIN'); }
        catch(e){console.log(e.code==='INVALID_GRANT'?'LOSE':'ERROR');process.exitCode=e.code==='INVALID_GRANT'?0:1;}
        finally{process.stdin.pause();await closeDatabase();}`;
      const workers = Array.from({ length: 2 }, () => {
        const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
          cwd: process.cwd(),
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
        const w = { child, output: '', errors: '' };
        w.ready = new Promise((resolve, reject) => {
          child.stdout.on('data', (d) => {
            w.output += d;
            if (w.output.includes('READY')) resolve();
          });
          child.once('error', reject);
        });
        child.stderr.on('data', (d) => {
          w.errors += d;
        });
        w.exit = new Promise((resolve, reject) =>
          child.once('exit', (c) =>
            c === 0 ? resolve() : reject(new Error('Worker failed: ' + w.errors))
          )
        );
        return w;
      });
      try {
        await Promise.all(workers.map((w) => w.ready));
        for (const w of workers) w.child.stdin.write('go\n');
        await Promise.all(workers.map((w) => w.exit));
        assert.equal(workers.filter((w) => w.output.includes('WIN')).length, 1);
        assert.equal(workers.filter((w) => w.output.includes('LOSE')).length, 1);
        assert.equal((await rows(f)).length, kind === 'code' ? 1 : 2);
      } finally {
        for (const w of workers) w.child.kill();
      }
    });

    it(`${kind}: sequential replay and replay from a restarted pool cannot issue again`, async () => {
      const f = await fixture(kind);
      await base[f.method](f.args);
      await assert.rejects(base[f.method](f.args), invalidGrant);
      await freshService((s) => assert.rejects(s[f.method](f.args), invalidGrant));
      assert.equal((await rows(f)).length, kind === 'code' ? 1 : 2);
    });
    it(`${kind}: wrong client does not consume another client's credential`, async () => {
      const f = await fixture(kind);
      await assert.rejects(base[f.method]({ ...f.args, clientId: 'chatgpt-web' }), invalidGrant);
      await base[f.method](f.args);
    });
    it(`${kind}: invalid audience does not consume the credential`, async () => {
      const f = await fixture(kind);
      await assert.rejects(
        base[f.method]({ ...f.args, resource: 'https://foreign.example.test/mcp' }),
        (e) => e.code === 'INVALID_TARGET'
      );
      await base[f.method](f.args);
    });
    it(`${kind}: expired credential issues nothing`, async () => {
      const f = await fixture(kind);
      if (kind === 'code')
        await db
          .update(oauthAuthorizationCodes)
          .set({ expiresAt: new Date(0) })
          .where(eq(oauthAuthorizationCodes.id, f.row.id));
      else
        await db
          .update(oauthTokens)
          .set({ refreshTokenExpiresAt: new Date(0) })
          .where(eq(oauthTokens.id, f.row.id));
      await assert.rejects(base[f.method](f.args), invalidGrant);
      assert.equal((await rows(f)).length, kind === 'code' ? 0 : 1);
    });
    it(`${kind}: foreign persisted tenant/user binding fails closed`, async () => {
      const f = await fixture(kind);
      const table = kind === 'code' ? oauthAuthorizationCodes : oauthTokens;
      await db.update(table).set({ tenantId: foreignTenantId }).where(eq(table.id, f.row.id));
      await assert.rejects(base[f.method](f.args), invalidGrant);
      assert.equal((await rows(f)).length, kind === 'code' ? 0 : 1);
    });

    // Real transactions with controlled failure boundaries, not a fake DB.
    for (const point of [
      'before-lock',
      'after-lock',
      'before-consume',
      'after-consume',
      'before-pair',
      'after-pair',
      'audit',
      'commit',
      'lost-commit-ack',
    ]) {
      it(`${kind}: ${point} fails closed without a second lineage`, async () => {
        const f = await fixture(kind);
        const faulty = faultDatabase(point);
        await assert.rejects(
          new OAuthAuthorizationService({ db: faulty })[f.method](f.args),
          /ISSUE04 fault/
        );
        const stored = await rows(f);
        const committed = point === 'lost-commit-ack';
        assert.equal(stored.length, (kind === 'code' ? 0 : 1) + (committed ? 1 : 0));
        if (committed) await freshService((s) => assert.rejects(s[f.method](f.args), invalidGrant));
        else await base[f.method](f.args); // rollback is safe to retry; never internal automatic retry
        assert.equal((await rows(f)).length, kind === 'code' ? 1 : 2);
      });
    }
  }

  function faultDatabase(point) {
    return new Proxy(db, {
      get(target, key) {
        if (key !== 'transaction')
          return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
        return async (callback) => {
          const fail = () => {
            throw new Error('ISSUE04 fault ' + point);
          };
          const result = await target.transaction(async (tx) => {
            if (point === 'before-lock') fail();
            let locked = false;
            const wrapped = new Proxy(tx, {
              get(t, k) {
                if (k === 'execute')
                  return async (...args) => {
                    const result = await t.execute(...args);
                    // First execute is clock (code) / advisory family lock (refresh).
                    if (!locked) {
                      locked = true;
                      if (point === 'after-lock') fail();
                    }
                    return result;
                  };
                if (k === 'update')
                  return (table) => {
                    if (point === 'before-consume') fail();
                    const builder = t.update(table),
                      set = builder.set.bind(builder);
                    builder.set = (values) => {
                      const q = set(values),
                        where = q.where.bind(q);
                      q.where = (...conditions) => {
                        const w = where(...conditions),
                          returning = w.returning.bind(w);
                        w.returning = async (...args) => {
                          const rows = await returning(...args);
                          if (point === 'after-consume') fail();
                          return rows;
                        };
                        return w;
                      };
                      return q;
                    };
                    return builder;
                  };
                if (k === 'insert')
                  return (table) => {
                    if (table === oauthTokens) {
                      if (point === 'before-pair') fail();
                      const builder = t.insert(table),
                        values = builder.values.bind(builder);
                      builder.values = async (...args) => {
                        const r = await values(...args);
                        if (point === 'after-pair') fail();
                        return r;
                      };
                      return builder;
                    }
                    if (table === auditLogs && point === 'audit') fail();
                    return t.insert(table);
                  };
                return typeof t[k] === 'function' ? t[k].bind(t) : t[k];
              },
            });
            const value = await callback(wrapped);
            if (point === 'commit') fail(); // force rollback at the commit boundary
            return value;
          });
          if (point === 'lost-commit-ack') fail(); // actual PostgreSQL COMMIT succeeded, caller did not learn it
          return result;
        };
      },
    });
  }

  for (const field of ['codeVerifier', 'redirectUri']) {
    it(`code: wrong ${field} does not burn the valid code`, async () => {
      const f = await fixture();
      await assert.rejects(
        base.exchangeAuthorizationCode({
          ...f.args,
          [field]: field === 'codeVerifier' ? 'x'.repeat(60) : 'https://claude.ai/wrong',
        }),
        invalidGrant
      );
      await base.exchangeAuthorizationCode(f.args);
    });
  }
  for (const kind of ['code', 'refresh']) {
    it(`${kind}: real deferred PostgreSQL COMMIT failure rolls back consumption and both token hashes`, async () => {
      const f = await fixture(kind);
      const name = 'issue04_commit_' + crypto.randomUUID().replaceAll('-', '');
      try {
        await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN IF NEW.tenant_id = '${tenantId}'::uuid THEN RAISE EXCEPTION 'ISSUE04 deferred commit failure'; END IF; RETURN NEW; END $$`);
        await pool.query(
          `CREATE CONSTRAINT TRIGGER ${name} AFTER INSERT ON oauth_tokens DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${name}()`
        );
        await assert.rejects(
          base[f.method](f.args),
          (e) =>
            e.cause?.message?.includes('ISSUE04 deferred commit failure') ||
            e.message.includes('ISSUE04 deferred commit failure')
        );
        assert.equal((await rows(f)).length, kind === 'code' ? 0 : 1);
      } finally {
        await pool.query(`DROP TRIGGER IF EXISTS ${name} ON oauth_tokens`);
        await pool.query(`DROP FUNCTION IF EXISTS ${name}()`);
      }
      await base[f.method](f.args);
      assert.equal((await rows(f)).length, kind === 'code' ? 1 : 2);
    });
    for (const boundary of ['before-commit', 'after-commit']) {
      it(`${kind}: process crash ${boundary} survives restart without a duplicate lineage`, async () => {
        const f = await fixture(kind);
        const script = `
          import {OAuthAuthorizationService} from './src/services/oauth-authorization.service.js';
          import {db} from './src/db/index.js';
          const boundary=${JSON.stringify(boundary)};
          const wrapped=new Proxy(db,{get(t,k){if(k!=='transaction')return typeof t[k]==='function'?t[k].bind(t):t[k];
            return async callback=>{const result=await t.transaction(async tx=>{const value=await callback(tx);
              if(boundary==='before-commit'){console.log('BOUNDARY');await new Promise(()=>{});}return value;});
              console.log('BOUNDARY');await new Promise(()=>{});return result;};}});
          await new OAuthAuthorizationService({db:wrapped})[${JSON.stringify(f.method)}](${JSON.stringify(f.args)});`;
        const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
          cwd: process.cwd(),
          env: process.env,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        const exited = new Promise((resolve) => child.once('exit', resolve));
        let errors = '';
        child.stderr.on('data', (d) => {
          errors += d;
        });
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error('Crash boundary not reached: ' + errors)),
              20000
            );
            child.stdout.on('data', (d) => {
              if (String(d).includes('BOUNDARY')) {
                clearTimeout(timeout);
                resolve();
              }
            });
            child.once('error', (e) => {
              clearTimeout(timeout);
              reject(e);
            });
            child.once('exit', () => {
              clearTimeout(timeout);
              reject(new Error('Worker exited before crash boundary: ' + errors));
            });
          });
          child.kill();
          await exited;
          if (boundary === 'before-commit') await freshService((s) => s[f.method](f.args));
          else await freshService((s) => assert.rejects(s[f.method](f.args), invalidGrant));
          assert.equal((await rows(f)).length, kind === 'code' ? 1 : 2);
        } finally {
          child.kill();
          await exited;
        }
      });
    }
    it(`${kind}: inactive user cannot spend a credential`, async () => {
      const f = await fixture(kind);
      try {
        await db.update(users).set({ status: 'SUSPENDED' }).where(eq(users.id, userId));
        await assert.rejects(base[f.method](f.args), invalidGrant);
        assert.equal((await rows(f)).length, kind === 'code' ? 0 : 1);
      } finally {
        await db.update(users).set({ status: 'ACTIVE' }).where(eq(users.id, userId));
      }
      await base[f.method](f.args);
    });
  }
  it('code: missing credential is rejected without issuing a pair', async () => {
    const f = await fixture();
    await assert.rejects(
      base.exchangeAuthorizationCode({ ...f.args, code: 'unknown-code' }),
      invalidGrant
    );
    await base.exchangeAuthorizationCode(f.args);
  });
  it('refresh: missing credential is rejected', async () => {
    await assert.rejects(
      base.refreshAccessToken({ clientId, refreshToken: 'unknown-refresh' }),
      invalidGrant
    );
  });
  it('refresh: expiry is rechecked after waiting for a database lock', async () => {
    const f = await fixture('refresh'),
      lock = await pool.connect();
    let request;
    try {
      await lock.query('BEGIN');
      await lock.query('SELECT id FROM oauth_tokens WHERE id=$1 FOR UPDATE', [f.row.id]);
      request = freshService((s) => assert.rejects(s.refreshAccessToken(f.args), invalidGrant));
      await lock.query(
        'UPDATE oauth_tokens SET refresh_token_expires_at=clock_timestamp() WHERE id=$1',
        [f.row.id]
      );
      await lock.query('COMMIT');
      await request;
      assert.equal((await rows(f)).length, 1);
    } finally {
      await lock.query('ROLLBACK');
      lock.release();
      if (request) await request;
    }
  });
  it('code: expiry is rechecked after waiting for a database lock', async () => {
    const f = await fixture(),
      lock = await pool.connect();
    let request;
    try {
      await lock.query('BEGIN');
      await lock.query('SELECT id FROM oauth_authorization_codes WHERE id=$1 FOR UPDATE', [
        f.row.id,
      ]);
      request = freshService((s) =>
        assert.rejects(s.exchangeAuthorizationCode(f.args), invalidGrant)
      );
      await lock.query(
        'UPDATE oauth_authorization_codes SET expires_at=clock_timestamp() WHERE id=$1',
        [f.row.id]
      );
      await lock.query('COMMIT');
      await request;
      assert.equal((await rows(f)).length, 0);
    } finally {
      await lock.query('ROLLBACK');
      lock.release();
      if (request) await request;
    }
  });
  it('refresh: role demotion clamps successor scopes', async () => {
    const f = await fixture('refresh', { scopes: ['career:read', 'career:write'] });
    try {
      await db.update(users).set({ role: 'READONLY' }).where(eq(users.id, userId));
      const pair = await base.refreshAccessToken(f.args);
      assert.equal(pair.scope, 'career:read');
    } finally {
      await db.update(users).set({ role: 'MEMBER' }).where(eq(users.id, userId));
    }
  });
  for (const member of [0, 1]) {
    it(`refresh: replay R${member + 1} after R1 -> R2 -> R3 durably revokes the entire family`, async () => {
      const f = await fixture('refresh');
      const r2 = await base.refreshAccessToken(f.args);
      const r3 = await base.refreshAccessToken({ ...f.args, refreshToken: r2.refresh_token });
      await freshService((s) =>
        assert.rejects(
          s.refreshAccessToken({
            ...f.args,
            refreshToken: member === 0 ? f.pair.refresh_token : r2.refresh_token,
          }),
          invalidGrant
        )
      );
      const family = await rows(f);
      assert.equal(family.length, 3);
      assert.ok(family.every((r) => r.isRevoked && r.familyRevokedAt));
      await assert.rejects(base.validateAccessToken(r3.access_token));
      await assert.rejects(
        base.refreshAccessToken({ ...f.args, refreshToken: r3.refresh_token }),
        invalidGrant
      );
      assert.equal((await rows(f)).length, 3);
    });
  }
  it('refresh: concurrent replay of R1 and rotation of R2 never leaves a live descendant', async () => {
    const f = await fixture('refresh'),
      r2 = await base.refreshAccessToken(f.args);
    await Promise.allSettled([
      freshService((s) => s.refreshAccessToken(f.args)),
      freshService((s) => s.refreshAccessToken({ ...f.args, refreshToken: r2.refresh_token })),
    ]);
    const family = await rows(f);
    assert.ok(family.length <= 3);
    assert.ok(family.every((r) => r.isRevoked && r.familyRevokedAt));
  });
  it('refresh: scope escalation is rejected without rotation', async () => {
    const f = await fixture('refresh');
    await assert.rejects(
      base.refreshAccessToken({ ...f.args, scope: 'career:read career:write' }),
      (e) => e.code === 'INVALID_SCOPE'
    );
    assert.equal((await rows(f)).length, 1);
    await base.refreshAccessToken(f.args);
  });
  it('refresh: scopes may narrow but never expand, and role ceiling is reapplied', async () => {
    const f = await fixture('refresh', { scopes: ['career:read', 'career:write'] });
    const r2 = await base.refreshAccessToken({ ...f.args, scope: 'career:read' });
    assert.equal(r2.scope, 'career:read');
    await assert.rejects(
      base.refreshAccessToken({ ...f.args, refreshToken: r2.refresh_token, scope: 'career:write' }),
      (e) => e.code === 'INVALID_SCOPE'
    );
  });
  it('refresh: explicit revocation forbids rotation', async () => {
    const f = await fixture('refresh');
    await base.revokeToken({ token: f.pair.refresh_token });
    await assert.rejects(base.refreshAccessToken(f.args), invalidGrant);
    assert.equal((await rows(f)).length, 1);
  });
  it('provider revocation racing rotation cannot resurrect a successor', async () => {
    const f = await fixture('refresh');
    const lifecycle = new AiConnectionStatusService({ database: db });
    await Promise.allSettled([
      freshService((s) => s.refreshAccessToken(f.args)),
      lifecycle.revokeProviderConnection({ tenantId, userId, provider: 'claude' }),
    ]);
    assert.ok((await rows(f)).every((r) => r.isRevoked && r.familyRevokedAt));
  });
  it('MCP bearer context uses only persisted identity; rotation revokes old access and enables new access', async () => {
    const f = await fixture('refresh');
    const req = (token) => ({
      headers: { authorization: `Bearer ${token}` },
      id: crypto.randomUUID(),
    });
    const first = await authenticateMcpRequest(req(f.pair.access_token), {
      db,
      oauthService: base,
    });
    assert.equal(first.tenantId, tenantId);
    assert.equal(first.userId, userId);
    const pair = await base.refreshAccessToken({
      ...f.args,
      tenantId: foreignTenantId,
      userId: crypto.randomUUID(),
    });
    const next = await authenticateMcpRequest(req(pair.access_token), { db, oauthService: base });
    assert.equal(next.tenantId, tenantId);
    assert.equal(next.userId, userId);
    assert.deepEqual(next.tokenScopes, ['career:read']);
    await assert.rejects(
      authenticateMcpRequest(req(f.pair.access_token), { db, oauthService: base })
    );
  });
  it('database constraints independently prevent code and predecessor duplication and active family branches', async () => {
    const f = await fixture('refresh');
    const clone = {
      ...f.row,
      id: crypto.randomUUID(),
      accessTokenHash: crypto.randomUUID(),
      refreshTokenHash: crypto.randomUUID(),
    };
    await assert.rejects(
      db.insert(oauthTokens).values({ ...clone, authorizationCodeId: null }),
      (e) => e.cause?.code === '23505' && e.cause.constraint === 'uq_oauth_tokens_active_family'
    );
    await assert.rejects(
      db.insert(oauthTokens).values({ ...clone, familyId: crypto.randomUUID() }),
      (e) =>
        e.cause?.code === '23505' && e.cause.constraint === 'uq_oauth_tokens_authorization_code'
    );
    const r2 = await base.refreshAccessToken(f.args);
    const [successor] = await db
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.refreshTokenHash, hashOAuthToken(r2.refresh_token)));
    await assert.rejects(
      db.insert(oauthTokens).values({
        ...successor,
        id: crypto.randomUUID(),
        familyId: crypto.randomUUID(),
        accessTokenHash: crypto.randomUUID(),
        refreshTokenHash: crypto.randomUUID(),
      }),
      (e) => e.cause?.code === '23505' && e.cause.constraint === 'uq_oauth_tokens_predecessor'
    );
  });
  it('security audit events never include codes, tokens or PKCE material', async () => {
    const f = await fixture('refresh');
    const pair = await base.refreshAccessToken(f.args);
    await assert.rejects(base.refreshAccessToken(f.args), invalidGrant);
    const events = await db.select().from(auditLogs).where(eq(auditLogs.tenantId, tenantId));
    for (const type of [
      'oauth.code.redeemed',
      'oauth.code.replay_rejected',
      'oauth.refresh.rotated',
      'oauth.refresh.replay_rejected',
      'oauth.family.revoked',
    ])
      assert.ok(events.some((e) => e.eventType === type));
    const encoded = JSON.stringify(events);
    for (const secret of [
      codeVerifier,
      f.pair.access_token,
      f.pair.refresh_token,
      pair.access_token,
      pair.refresh_token,
    ])
      assert.ok(!encoded.includes(secret));
  });
  for (const grantType of ['authorization_code', 'refresh_token']) {
    for (const failure of ['database', 'replay']) {
      it(`${grantType}: HTTP ${failure} returns safe OAuth error and no credential`, async () => {
        const app = Fastify({ logger: false }),
          events = [];
        const reject = async () => {
          throw failure === 'database'
            ? new Error('PRIVATE_DATABASE_DETAIL')
            : new AuthenticationError('Credential already used.', 'INVALID_GRANT');
        };
        try {
          await app.register(oauthRoutes, {
            oauthService: { exchangeAuthorizationCode: reject, refreshAccessToken: reject },
            auditService: {
              recordEvent: async (event) => {
                events.push(event);
              },
            },
          });
          const response = await app.inject({
            method: 'POST',
            url: '/oauth/token',
            payload: {
              grant_type: grantType,
              client_id: clientId,
              code: 'synthetic-code',
              redirect_uri: redirectUri,
              resource,
              code_verifier: codeVerifier,
              refresh_token: 'synthetic-refresh',
            },
          });
          assert.equal(response.statusCode, failure === 'database' ? 503 : 400);
          assert.equal(
            response.json().error,
            failure === 'database' ? 'temporarily_unavailable' : 'invalid_grant'
          );
          assert.equal(response.json().access_token, undefined);
          const logged = JSON.stringify(events);
          for (const secret of [
            'PRIVATE_DATABASE_DETAIL',
            codeVerifier,
            'synthetic-code',
            'synthetic-refresh',
          ]) {
            assert.ok(!response.payload.includes(secret));
            assert.ok(!logged.includes(secret));
          }
        } finally {
          await app.close();
        }
      });
    }
  }
  it('HTTP refresh forwards narrowed scope and never accepts client identity context', async () => {
    const app = Fastify({ logger: false });
    let input;
    try {
      await app.register(oauthRoutes, {
        oauthService: {
          refreshAccessToken: async (params) => {
            input = params;
            return {
              access_token: 'synthetic-access',
              refresh_token: 'synthetic-successor',
              scope: 'career:read',
              token_type: 'Bearer',
              expires_in: 3600,
            };
          },
        },
        auditService: { recordEvent: async () => {} },
      });
      const response = await app.inject({
        method: 'POST',
        url: '/oauth/token',
        payload: {
          grant_type: 'refresh_token',
          client_id: clientId,
          refresh_token: 'synthetic-refresh',
          scope: 'career:read',
          tenantId: foreignTenantId,
          userId: crypto.randomUUID(),
        },
      });
      assert.equal(response.statusCode, 200);
      assert.equal(input.scope, 'career:read');
      assert.equal(input.tenantId, undefined);
      assert.equal(input.userId, undefined);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers.pragma, 'no-cache');
    } finally {
      await app.close();
    }
  });
});
