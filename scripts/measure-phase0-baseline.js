#!/usr/bin/env node
/**
 * @file Phase 0 Performance Baseline Measurement Harness.
 */

import pg from 'pg';
import { performance } from 'node:perf_hooks';

const TENANT_ID = '24d53f53-780e-4431-b065-32180c354175';
const CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';

/** @type {{ count: number, statements: string[] } | null} */
let currentTracking = null;
const originalQuery = pg.Pool.prototype.query;

pg.Pool.prototype.query = function patchedQuery(...queryArgs) {
  if (currentTracking) {
    currentTracking.count += 1;
    const first = queryArgs[0];
    const text = typeof first === 'string' ? first : first?.text || '';
    currentTracking.statements.push(String(text).replace(/\s+/g, ' ').trim().slice(0, 140));
  }
  return originalQuery.apply(this, queryArgs);
};

const { buildApp } = await import('../src/app.js');
const { db, closeDatabase } = await import('../src/db/index.js');
const { candidates, jobApplications, sessions } = await import('../src/db/schema.js');
const { createSession } = await import('../src/security/session.service.js');
const { eq } = await import('drizzle-orm');

let app;
let rawToken;

try {
  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, CANDIDATE_ID));
  if (!candidate) throw new Error(`Candidate ${CANDIDATE_ID} not found`);

  const apps = await db
    .select({ id: jobApplications.id })
    .from(jobApplications)
    .where(eq(jobApplications.candidateId, CANDIDATE_ID))
    .limit(1);

  const testAppId = apps[0]?.id;

  const session = await createSession(db, { userId: candidate.userId, tenantId: TENANT_ID });
  rawToken = session.rawToken;

  app = buildApp({ logger: false });
  await app.ready();

  const ROUTES = [
    { url: '/', auth: false },
    { url: '/login', auth: false },
    { url: '/dashboard', auth: true },
    { url: '/applications', auth: true },
    { url: '/profile', auth: true },
    { url: '/sources', auth: true },
    { url: '/resumes', auth: true },
    { url: '/projects', auth: true },
    { url: '/skills', auth: true },
    { url: '/apps/radar', auth: true },
    { url: testAppId ? `/applications/${testAppId}/apply` : null, auth: true },
    { url: testAppId ? `/applications/${testAppId}/handoff` : null, auth: true },
    { url: '/onboarding', auth: true },
  ].filter((r) => r.url !== null);

  const results = [];

  for (const route of ROUTES) {
    const passes = [];
    for (let pass = 1; pass <= 2; pass += 1) {
      currentTracking = { count: 0, statements: [] };
      const startedAt = performance.now();
      const cookies = route.auth ? { career_hub_session: rawToken } : {};

      const res = await app.inject({
        method: 'GET',
        url: route.url,
        headers: { accept: 'text/html,application/xhtml+xml' },
        cookies,
      });

      const totalTimeMs = performance.now() - startedAt;
      const tracking = currentTracking;
      currentTracking = null;

      passes.push({
        pass,
        status: res.statusCode,
        totalTimeMs: Math.round(totalTimeMs),
        payloadBytes: Buffer.byteLength(res.payload, 'utf8'),
        queryCount: tracking.count,
        statements: tracking.statements,
      });
    }

    const r = {
      url: route.url,
      auth: route.auth,
      cold: passes[0],
      warm: passes[1],
    };
    results.push(r);
    console.log(
      `[MEASURED] ${r.url.padEnd(35)} status=${r.warm.status} cold=${r.cold.totalTimeMs}ms (${r.cold.queryCount} queries) warm=${r.warm.totalTimeMs}ms (${r.warm.queryCount} queries) payload=${(r.warm.payloadBytes / 1024).toFixed(1)}KB`
    );
  }

  console.log(
    '\n========================================================================================================================'
  );
  console.log('PHASE 0 BASELINE PERFORMANCE REPORT (SERVER-SIDE)');
  console.log(
    '========================================================================================================================'
  );
  console.log(
    'Route'.padEnd(36),
    'Status'.padEnd(7),
    'Cold ms'.padEnd(9),
    'Warm ms'.padEnd(9),
    'Cold Qs'.padEnd(9),
    'Warm Qs'.padEnd(9),
    'Payload (KB)'
  );
  console.log('-'.repeat(90));

  for (const r of results) {
    console.log(
      r.url.padEnd(36),
      String(r.warm.status).padEnd(7),
      String(r.cold.totalTimeMs).padEnd(9),
      String(r.warm.totalTimeMs).padEnd(9),
      String(r.cold.queryCount).padEnd(9),
      String(r.warm.queryCount).padEnd(9),
      (r.warm.payloadBytes / 1024).toFixed(1)
    );
  }

  console.log('\n--- JSON RESULT ---');
  console.log(JSON.stringify(results, null, 2));
} finally {
  if (app) await app.close();
  if (rawToken) {
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
