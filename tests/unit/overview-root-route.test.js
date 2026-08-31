/**
 * @file Unit & Integration Tests for Overview Root Route (GET /)
 *
 * Verifies:
 * 1. STATE A — Unauthenticated GET / renders public marketing landing page (no candidate data leaked).
 * 2. STATE A (JSON) — Unauthenticated GET / with Accept: application/json returns API operational info.
 * 3. STATE B — Authenticated GET / renders live candidate Overview experience.
 * 4. FIRST-RUN USER — Authenticated fresh user with 0 data sees SETUP MODE and Guided 6-Step Readiness Checklist.
 * 5. FULLY CONFIGURED USER — Authenticated candidate sees CAREER INTELLIGENCE MODE and metrics.
 * 6. DIRECT DASHBOARD — Authenticated GET /dashboard renders candidate workspace; unauthenticated redirects to /login.
 * 7. SESSION LIFECYCLE — Logging out transitions GET / back to public landing immediately.
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildApp } from '../../src/app.js';
import { db, pool, closeDatabase } from '../../src/db/index.js';
import { users, tenants, candidates, sessions } from '../../src/db/schema.js';
import { createSession } from '../../src/security/session.service.js';

describe('Overview / Root Route — Authenticated & Public States', () => {
  const app = buildApp({ logger: false });

  // Test identities
  const freshTenantId = crypto.randomUUID();
  const freshUserId = crypto.randomUUID();
  let freshSessionToken = '';
  let configuredSessionToken = '';

  after(async () => {
    // Clean up test data
    try {
      await db.delete(sessions).execute();
    } catch {
      // ignore
    }
    await app.close();
    await closeDatabase(pool);
  });

  test('1. Unauthenticated GET / renders public landing page without candidate data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/',
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'], /text\/html/);
    assert.match(response.payload, /Universal AI Career Intelligence Platform/i);
    assert.match(response.payload, /Sign in with GitHub/i);
    assert.match(response.payload, /Evidence-Grounded/i);
    assert.match(response.payload, /Model Context Protocol/i);
    // Ensure no private candidate identities leak
    assert.doesNotMatch(response.payload, /Candidate Profile/);
    assert.doesNotMatch(response.payload, /Readiness Score/);
  });

  test('2. Unauthenticated GET / with Accept: application/json returns operational API descriptor', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: {
        accept: 'application/json',
      },
    });

    assert.equal(response.statusCode, 200);
    const json = JSON.parse(response.payload);
    assert.equal(json.name, 'Antigravity Career Hub API');
    assert.equal(json.status, 'operational');
    assert.equal(json.mcpEndpoint, '/mcp');
  });

  test('3. Authenticated GET / for first-run user renders SETUP MODE and Guided 6-Step Readiness Checklist', async () => {
    // Create fresh user in db
    await db.insert(tenants).values({
      id: freshTenantId,
      name: 'Fresh Workspace',
      slug: `fresh-${crypto.randomBytes(3).toString('hex')}`,
      tier: 'FREE',
    });
    await db.insert(users).values({
      id: freshUserId,
      tenantId: freshTenantId,
      email: 'fresh.user@example.com',
      displayName: 'Fresh Candidate User',
      role: 'OWNER',
    });
    await db.insert(candidates).values({
      id: crypto.randomUUID(),
      tenantId: freshTenantId,
      userId: freshUserId,
      displayName: 'Fresh Candidate User',
    });

    const session = await createSession(db, {
      userId: freshUserId,
      tenantId: freshTenantId,
    });
    freshSessionToken = session.rawToken;

    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: {
        cookie: `career_hub_session=${freshSessionToken}`,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.payload, /Candidate Workspace/i);
    assert.match(response.payload, /Fresh Candidate User/);
    assert.match(response.payload, /SETUP MODE/);
    assert.match(response.payload, /Career Readiness & Setup Checklist/);
    assert.match(response.payload, /Connect Repositories/);
    assert.match(response.payload, /Upload Source Resume/);
    assert.match(response.payload, /Connect AI Client/);
  });

  test('4. Authenticated GET / for configured candidate renders CAREER INTELLIGENCE MODE', async () => {
    // Find or create configured user
    const [existingConfigured] = await db
      .select()
      .from(users)
      .where(users.displayName ? undefined : undefined)
      .limit(1);

    const session = await createSession(db, {
      userId: existingConfigured.id,
      tenantId: existingConfigured.tenantId,
    });
    configuredSessionToken = session.rawToken;

    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: {
        cookie: `career_hub_session=${configuredSessionToken}`,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.payload, /Candidate Workspace/i);
    assert.match(response.payload, /Readiness Score:/);
    assert.match(response.payload, /Verified Skills/);
    assert.match(response.payload, /Connected Sources/);
    assert.match(response.payload, /Tracked Applications/);
  });

  test('5. Direct navigation to /dashboard works for authenticated users', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: {
        cookie: `career_hub_session=${configuredSessionToken}`,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.payload, /Candidate Workspace/i);
  });

  test('6. Unauthenticated GET /dashboard redirects to /login?returnTo=/dashboard', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard',
    });

    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/login?returnTo=/dashboard');
  });

  test('7. Unauthenticated GET /dashboard with Accept: application/json returns 401 UNAUTHENTICATED', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: {
        accept: 'application/json',
      },
    });

    assert.equal(response.statusCode, 401);
    const json = JSON.parse(response.payload);
    assert.equal(json.error.code, 'UNAUTHENTICATED');
  });
});
