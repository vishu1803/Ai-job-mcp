/**
 * @file Integration Regression: Copilot chat route profile-load failure contract.
 *
 * Root cause being locked down: POST /assistant/message used to preload the
 * candidate profile (and the readiness, repositories, skills, applications and
 * resumes context) behind `catch { // Fallback }`. A `getCareerProfile()`
 * rejection (e.g. a `57014` statement timeout) was swallowed, so the copilot
 * answered as though the candidate had no profile at all.
 *
 * This suite proves that a profile outage on the copilot route:
 *   1. Does NOT return HTTP 200 with `{ ok: true }` and a fabricated answer.
 *   2. DOES return a structured server error instead.
 *   3. Renders the HTML failure page (not a success redirect) for form clients.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, candidates } from '../../src/db/schema.js';
import { createSession } from '../../src/security/session.service.js';

describe('Copilot chat route: profile-load failure is surfaced, never fabricated', () => {
  let app;
  let tenant;
  let user;
  let candidate;
  let sessionToken;

  before(async () => {
    const runId = crypto.randomUUID().slice(0, 8);

    [tenant] = await db
      .insert(tenants)
      .values({ name: `Copilot Failure Tenant ${runId}`, slug: `copilot-failure-${runId}` })
      .returning();

    [user] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: `copilot-failure-${runId}@example.com`,
        displayName: 'Copilot Failure User',
        role: 'MEMBER',
      })
      .returning();

    [candidate] = await db
      .insert(candidates)
      .values({
        tenantId: tenant.id,
        userId: user.id,
        displayName: 'Copilot Failure Candidate',
        canonicalEmail: `copilot-failure-${runId}@example.com`,
      })
      .returning();

    // Simulate the observed runtime failure: a profile load that rejects the way
    // a database statement timeout does.
    app = buildApp({
      logger: false,
      candidateProfileService: {
        getCareerProfile: async () => {
          const err = new Error('canceling statement due to statement timeout');
          err.code = '57014';
          throw err;
        },
      },
    });
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

  it('returns a structured server error for a normal message (JSON client)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/assistant/message',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      cookies: { career_hub_session: sessionToken },
      payload: { message: 'What skills should I highlight?', pageContext: 'dashboard' },
    });

    assert.ok(res.statusCode >= 500, `expected a server error, received ${res.statusCode}`);
    assert.notStrictEqual(
      res.statusCode,
      200,
      'a failed profile load must not produce a 200 copilot answer'
    );

    const body = JSON.parse(res.payload);
    assert.strictEqual(body.ok, undefined, 'must never report a successful copilot turn');
    assert.ok(body.error, 'must return a structured error payload');
    assert.strictEqual(
      /Cannot read properties of null/.test(res.payload),
      false,
      'must never reproduce the null-dereference crash signature'
    );
  });

  it('renders the HTML failure page for a form client instead of redirecting to success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/assistant/message',
      headers: { accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
      cookies: { career_hub_session: sessionToken },
      payload: 'message=What+skills+should+I+highlight%3F',
    });

    assert.ok(res.statusCode >= 500, `expected a server error, received ${res.statusCode}`);
    assert.match(
      String(res.headers['content-type'] || ''),
      /text\/html/,
      'a 5xx must render the error page, not a redirect'
    );
  });
});
