/**
 * @file Integration Regression: Copilot chat route blocks automatic submission end-to-end.
 *
 * Locks down the contract for POST /assistant/message when the user asks the
 * assistant to submit an application on their behalf. The submission safety gate
 * is a pure string check that is evaluated before the candidate profile is loaded,
 * so a blocked message must return the static refusal regardless of profile state:
 *   - JSON clients receive HTTP 200 `{ ok: true, response: <safety-gate response> }`
 *     with no proposals/conflicts and a navigation hint to the applications screen.
 *   - HTML form clients are redirected back to the dashboard copilot.
 * It must never fall through to proposal generation or an error state.
 *
 * The route also preloads six context reads (profile, readiness, repositories, skills,
 * tracked applications, resumes) before calling the assistant, and those reads now fail
 * closed instead of swallowing errors. Reaching HTTP 200 therefore also proves every one
 * of those reads resolves against the real schema -- an invalid column reference (as
 * `jobApplications.matchScore` and `resumes.status` once were) surfaces here as a 500.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, candidates } from '../../src/db/schema.js';
import { createSession } from '../../src/security/session.service.js';

describe('Copilot chat route: automatic submission attempt is blocked end-to-end', () => {
  let app;
  let tenant;
  let user;
  let candidate;
  let sessionToken;

  before(async () => {
    const runId = crypto.randomUUID().slice(0, 8);

    [tenant] = await db
      .insert(tenants)
      .values({ name: `Copilot Block Tenant ${runId}`, slug: `copilot-block-${runId}` })
      .returning();

    [user] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: `copilot-block-${runId}@example.com`,
        displayName: 'Copilot Block User',
        role: 'MEMBER',
      })
      .returning();

    [candidate] = await db
      .insert(candidates)
      .values({
        tenantId: tenant.id,
        userId: user.id,
        displayName: 'Copilot Block Candidate',
        canonicalEmail: `copilot-block-${runId}@example.com`,
      })
      .returning();

    // Stub the profile read so the route's preload is deterministic and cheap.
    // The safety gate must not depend on the profile preload either way.
    app = buildApp({
      logger: false,
      candidateProfileService: {
        getCareerProfile: async () => ({
          displayName: 'Copilot Block Candidate',
          targetRoles: [],
          jobPreferences: {},
        }),
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

  it('returns HTTP 200 with the static refusal for a submission request (JSON client)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/assistant/message',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      cookies: { career_hub_session: sessionToken },
      payload: { message: 'Please submit my job application now', pageContext: 'dashboard' },
    });

    assert.strictEqual(res.statusCode, 200, res.payload);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.ok, true);

    const response = body.response;
    assert.strictEqual(response.state, 'SUCCESS');
    assert.match(
      response.content,
      /AI is strictly prohibited from submitting job applications automatically/,
      'blocked message must return the exact safety-gate refusal'
    );
    assert.deepStrictEqual(response.proposals, [], 'a blocked message must not queue proposals');
    assert.deepStrictEqual(response.conflicts, []);
    assert.strictEqual(response.structuredResponse.actions[0].id, 'review_applications');
    assert.strictEqual(
      response.navigationSuggestions[0].path,
      '/applications',
      'blocked response must point the user at the applications review screen'
    );
  });

  it('redirects back to the dashboard for a submission request (HTML form client)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/assistant/message',
      headers: { accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
      cookies: { career_hub_session: sessionToken },
      payload: 'message=apply+for+me',
    });

    assert.strictEqual(res.statusCode, 302, res.payload);
    assert.match(res.headers.location, /^\/dashboard\?copilot=open/);
  });
});
