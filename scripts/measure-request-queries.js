#!/usr/bin/env node
/**
 * @file Measures how many SQL statements each read route issues per request.
 *
 * Why: the application has no database read cache, so every page view replays its
 * full query set over the wire. On a high-latency link that cost is directly the
 * page latency, and it is easy to miss because nothing in the code says "cache".
 * This harness wraps `pg.Pool.prototype.query` to count and capture statements,
 * then injects authenticated GET requests through the real Fastify app.
 *
 * Read-only against the database: it issues GETs only, and the one row it writes
 * (a session token for an existing user) is deleted before exit.
 *
 * Usage:
 *   node scripts/measure-request-queries.js [--tenant=<uuid>] [--candidate=<uuid>]
 */

import pg from 'pg';

const args = process.argv.slice(2);
const argValue = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : null;
};

const TENANT_ID = argValue('tenant') || '24d53f53-780e-4431-b065-32180c354175';
const CANDIDATE_ID = argValue('candidate') || '10a2b51b-09bf-4090-8040-1f60ebeb89c9';

/** @type {{ count: number, statements: string[] } | null} */
let current = null;
const originalQuery = pg.Pool.prototype.query;

pg.Pool.prototype.query = function patchedQuery(...queryArgs) {
  if (current) {
    current.count += 1;
    const first = queryArgs[0];
    const text = typeof first === 'string' ? first : first?.text || '';
    current.statements.push(String(text).replace(/\s+/g, ' ').trim().slice(0, 120));
  }
  return originalQuery.apply(this, queryArgs);
};

const { buildApp } = await import('../src/app.js');
const { db, closeDatabase } = await import('../src/db/index.js');
const { candidates } = await import('../src/db/schema.js');
const { createSession } = await import('../src/security/session.service.js');
const { eq } = await import('drizzle-orm');

const ROUTES = [
  '/dashboard',
  '/profile',
  '/applications',
  '/skills',
  '/sources',
  '/resumes',
  '/api/profile/bootstrap',
];

let app;
let rawToken;

try {
  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, CANDIDATE_ID));
  if (!candidate) throw new Error(`Candidate ${CANDIDATE_ID} not found`);

  const session = await createSession(db, { userId: candidate.userId, tenantId: TENANT_ID });
  rawToken = session.rawToken;

  app = buildApp({ logger: false });
  await app.ready();

  // Each route is exercised twice: pass 1 populates any cache, pass 2 is the repeat
  // page view a user makes when moving between screens. Comparing pass 2 against the
  // same pass 2 with caching off isolates the cache's effect from warm-process noise.
  const rows = [];
  for (const url of ROUTES) {
    const passes = [];
    for (let pass = 1; pass <= 2; pass += 1) {
      current = { count: 0, statements: [] };
      const startedAt = Date.now();
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { accept: 'application/json' },
        cookies: { career_hub_session: rawToken },
      });
      passes.push({
        status: res.statusCode,
        queries: current.count,
        ms: Date.now() - startedAt,
        statements: current.statements,
      });
      current = null;
    }

    const first = passes[0];
    const second = passes[1];
    rows.push({
      url,
      status: second.status,
      queries: first.queries,
      queriesWarm: second.queries,
      duplicateQueries: second.statements.filter((s, i) => second.statements.indexOf(s) !== i)
        .length,
      ms: first.ms,
      msWarm: second.ms,
      statements: second.statements,
      statementsCold: first.statements,
    });
  }

  console.log(
    'route'.padEnd(26),
    'status'.padEnd(7),
    'pass1'.padEnd(7),
    'pass2'.padEnd(7),
    'saved'.padEnd(7),
    'dupes2'.padEnd(7),
    'ms pass1'.padEnd(9),
    'ms pass2'
  );
  for (const row of rows) {
    console.log(
      row.url.padEnd(26),
      String(row.status).padEnd(7),
      String(row.queries).padEnd(7),
      String(row.queriesWarm).padEnd(7),
      String(row.queries - row.queriesWarm).padEnd(7),
      String(row.duplicateQueries).padEnd(7),
      String(row.ms).padEnd(9),
      row.msWarm
    );
  }

  console.log('\n--- statements on the warm (repeat) pass ---');
  for (const row of rows) {
    console.log(`\n${row.url} (pass1=${row.queries}, pass2=${row.queriesWarm})`);
    const seen = new Map();
    for (const statement of row.statements) seen.set(statement, (seen.get(statement) || 0) + 1);
    for (const [statement, times] of seen) {
      console.log(`  ${times > 1 ? `x${times} ` : ''}${statement}`);
    }
  }

  console.log('\n--- statements on the cold (first) pass ---');
  for (const row of rows) {
    console.log(`\n${row.url} (${row.queries} statements)`);
    const seen = new Map();
    for (const statement of row.statementsCold) seen.set(statement, (seen.get(statement) || 0) + 1);
    for (const [statement, times] of seen) {
      console.log(`  ${times > 1 ? `x${times} ` : ''}${statement}`);
    }
  }
} finally {
  if (app) await app.close();
  if (rawToken) {
    const { sessions } = await import('../src/db/schema.js');
    const { eq: eqOp } = await import('drizzle-orm');
    await db
      .delete(sessions)
      .where(
        eqOp(
          sessions.userId,
          (
            await db
              .select({ userId: candidates.userId })
              .from(candidates)
              .where(eqOp(candidates.id, CANDIDATE_ID))
          )[0]?.userId
        )
      );
  }
  await closeDatabase();
}
