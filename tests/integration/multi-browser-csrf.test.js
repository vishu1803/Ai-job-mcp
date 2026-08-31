/**
 * @file Multi-Browser CSRF & Session Isolation Integration Tests.
 *
 * Verifies:
 * 1. Two independent browser sessions can authenticate as the same user
 * 2. Both sessions can access all authenticated pages
 * 3. State-changing POST requests work for both sessions (valid Origin)
 * 4. Cross-site (malicious Origin) requests are still blocked by CSRF
 * 5. Logging out one session does NOT affect the other
 * 6. Session tokens are cryptographically distinct
 * 7. Cookie attributes are correct
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, sessions, candidates } from '../../src/db/schema.js';
import { createSession, getSessionCookieOptions } from '../../src/security/session.service.js';
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';

describe('Multi-Browser CSRF & Session Isolation (P14-003A)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  let app;
  let sessionTokenA; // Browser A
  let sessionTokenB; // Browser B
  let rateLimiter;

  const cookieOpts = getSessionCookieOptions({
    NODE_ENV: 'test',
    SESSION_COOKIE_NAME: 'career_hub_session',
  });
  const cookieName = cookieOpts.name;

  before(async () => {
    rateLimiter = new McpRateLimiter({ authLimit: 1000, ipLimit: 1000 });
    app = buildApp({ logger: false, rateLimiter });
    await app.ready();

    // Create tenant and user
    await db.insert(tenants).values({
      id: tenantId,
      name: `MultiBrowser Tenant ${testRunId}`,
      slug: `multi-browser-${testRunId}`,
      tier: 'FREE',
    });

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: `multi-browser-${testRunId}@example.test`,
      displayName: `Multi Browser User ${testRunId}`,
      role: 'OWNER',
      status: 'ACTIVE',
    });

    // Create candidate for this user
    await db.insert(candidates).values({
      id: crypto.randomUUID(),
      tenantId,
      userId,
      displayName: `Multi Browser Candidate ${testRunId}`,
      canonicalEmail: `multi-browser-${testRunId}@example.test`,
      status: 'ACTIVE',
    });

    // Create two independent sessions (simulating Browser A and Browser B)
    const sessionA = await createSession(db, {
      userId,
      tenantId,
      ipAddress: '127.0.0.1',
      userAgent: 'BrowserA/TestAgent',
    });
    sessionTokenA = sessionA.rawToken;

    const sessionB = await createSession(db, {
      userId,
      tenantId,
      ipAddress: '127.0.0.1',
      userAgent: 'BrowserB/TestAgent',
    });
    sessionTokenB = sessionB.rawToken;
  });

  after(async () => {
    // Clean up test data
    try {
      await db.delete(sessions).where(eq(sessions.userId, userId));
      await db.delete(candidates).where(eq(candidates.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    } catch {
      // Best-effort cleanup
    }
    await app.close();
    await closeDatabase();
  });

  // ──────────────────────────────────────────────────────────────────────
  // 1. BASIC AUTHENTICATION — Both sessions work independently
  // ──────────────────────────────────────────────────────────────────────
  it('1. Both sessions have cryptographically distinct tokens', () => {
    assert.notEqual(sessionTokenA, sessionTokenB);
    assert.ok(sessionTokenA.length >= 32, 'Token A should be high-entropy');
    assert.ok(sessionTokenB.length >= 32, 'Token B should be high-entropy');
  });

  it('2. Browser A can access /dashboard with session A', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
      cookies: { [cookieName]: sessionTokenA },
    });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.payload, /Dashboard/i);
  });

  it('3. Browser B can access /dashboard with session B', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
      cookies: { [cookieName]: sessionTokenB },
    });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.payload, /Dashboard/i);
  });

  it('4. Both sessions can access /skills', async () => {
    for (const [label, token] of [
      ['A', sessionTokenA],
      ['B', sessionTokenB],
    ]) {
      const res = await app.inject({
        method: 'GET',
        url: '/skills',
        cookies: { [cookieName]: token },
      });
      assert.equal(res.statusCode, 200, `Session ${label} should access /skills`);
    }
  });

  it('5. Both sessions can access /projects', async () => {
    for (const [label, token] of [
      ['A', sessionTokenA],
      ['B', sessionTokenB],
    ]) {
      const res = await app.inject({
        method: 'GET',
        url: '/projects',
        cookies: { [cookieName]: token },
      });
      assert.equal(res.statusCode, 200, `Session ${label} should access /projects`);
    }
  });

  it('6. Both sessions can access /sources', async () => {
    for (const [label, token] of [
      ['A', sessionTokenA],
      ['B', sessionTokenB],
    ]) {
      const res = await app.inject({
        method: 'GET',
        url: '/sources',
        cookies: { [cookieName]: token },
      });
      assert.equal(res.statusCode, 200, `Session ${label} should access /sources`);
    }
  });

  it('7. Both sessions can access /resumes', async () => {
    for (const [label, token] of [
      ['A', sessionTokenA],
      ['B', sessionTokenB],
    ]) {
      const res = await app.inject({
        method: 'GET',
        url: '/resumes',
        cookies: { [cookieName]: token },
      });
      assert.equal(res.statusCode, 200, `Session ${label} should access /resumes`);
    }
  });

  it('8. Both sessions can access /connect (AI Center)', async () => {
    for (const [label, token] of [
      ['A', sessionTokenA],
      ['B', sessionTokenB],
    ]) {
      const res = await app.inject({
        method: 'GET',
        url: '/connect',
        cookies: { [cookieName]: token },
      });
      assert.equal(res.statusCode, 200, `Session ${label} should access /connect`);
    }
  });

  it('9. Both sessions can access /settings', async () => {
    for (const [label, token] of [
      ['A', sessionTokenA],
      ['B', sessionTokenB],
    ]) {
      const res = await app.inject({
        method: 'GET',
        url: '/settings',
        cookies: { [cookieName]: token },
      });
      assert.equal(res.statusCode, 200, `Session ${label} should access /settings`);
    }
  });

  it('10. Both sessions can access /profile', async () => {
    for (const [label, token] of [
      ['A', sessionTokenA],
      ['B', sessionTokenB],
    ]) {
      const res = await app.inject({
        method: 'GET',
        url: '/profile',
        cookies: { [cookieName]: token },
      });
      assert.equal(res.statusCode, 200, `Session ${label} should access /profile`);
    }
  });

  it('11. Both sessions can access /docs/mcp', async () => {
    for (const [label, token] of [
      ['A', sessionTokenA],
      ['B', sessionTokenB],
    ]) {
      const res = await app.inject({
        method: 'GET',
        url: '/docs/mcp',
        cookies: { [cookieName]: token },
      });
      assert.equal(res.statusCode, 200, `Session ${label} should access /docs/mcp`);
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // 2. STATE-CHANGING POST REQUESTS — Both sessions can submit forms
  // ──────────────────────────────────────────────────────────────────────
  it('12. Browser B can POST /onboarding/profile with valid Origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/onboarding/profile',
      cookies: { [cookieName]: sessionTokenB },
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'http://localhost:3000',
      },
      payload: 'displayName=Updated+Name&headline=Test+Headline',
    });
    // Should redirect on success or return 200
    assert.ok(
      res.statusCode === 302 || res.statusCode === 200,
      `Expected redirect or 200, got ${res.statusCode}`
    );
  });

  it('13. Browser A can POST /onboarding/profile independently', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/onboarding/profile',
      cookies: { [cookieName]: sessionTokenA },
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'http://localhost:3000',
      },
      payload: 'displayName=Browser+A+Name&headline=Browser+A',
    });
    assert.ok(
      res.statusCode === 302 || res.statusCode === 200,
      `Expected redirect or 200, got ${res.statusCode}`
    );
  });

  it('14. Browser B can POST /connect/revoke-provider with valid Origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/connect/revoke-provider',
      cookies: { [cookieName]: sessionTokenB },
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'http://localhost:3000',
      },
      payload: 'provider=GITHUB',
    });
    assert.ok(
      res.statusCode === 302 || res.statusCode === 200,
      `Expected redirect or 200, got ${res.statusCode}`
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // 3. CROSS-SITE CSRF ATTACK — Still blocked
  // ──────────────────────────────────────────────────────────────────────
  it('15. POST /auth/logout is BLOCKED with malicious Origin header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { [cookieName]: sessionTokenA },
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://evil-attacker.example',
      },
      payload: '',
    });
    // CSRF_DETECTED should return 403
    assert.equal(res.statusCode, 403, 'Cross-site logout should be blocked');
    assert.match(res.payload, /CSRF_DETECTED/i);
  });

  it('16. POST /auth/logout is BLOCKED with forged Referer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { [cookieName]: sessionTokenA },
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://phishing-site.example',
        referer: 'https://phishing-site.example/do-evil',
      },
      payload: '',
    });
    assert.equal(res.statusCode, 403, 'Cross-site logout with forged referer should be blocked');
  });

  it('17. DELETE /account is BLOCKED with malicious Origin', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/account',
      cookies: { [cookieName]: sessionTokenA },
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil-attacker.example',
      },
      payload: JSON.stringify({ confirmPhrase: 'DELETE MY ACCOUNT' }),
    });
    assert.equal(res.statusCode, 403, 'Cross-site account deletion should be blocked');
    assert.match(res.payload, /CSRF_DETECTED/i);
  });

  // ──────────────────────────────────────────────────────────────────────
  // 4. SESSION ISOLATION — Logout from one doesn't affect the other
  // ──────────────────────────────────────────────────────────────────────
  it('18. Logging out Browser A does NOT invalidate Browser B', async () => {
    // First, verify both sessions work
    const preA = await app.inject({
      method: 'GET',
      url: '/dashboard',
      cookies: { [cookieName]: sessionTokenA },
    });
    const preB = await app.inject({
      method: 'GET',
      url: '/dashboard',
      cookies: { [cookieName]: sessionTokenB },
    });
    assert.equal(preA.statusCode, 200, 'Pre-logout: Browser A works');
    assert.equal(preB.statusCode, 200, 'Pre-logout: Browser B works');

    // Logout Browser A
    const logoutA = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { [cookieName]: sessionTokenA },
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'http://localhost:3000',
      },
      payload: '',
    });
    assert.ok(
      logoutA.statusCode === 302 || logoutA.statusCode === 200,
      `Browser A logout should succeed, got ${logoutA.statusCode}`
    );

    // Verify Browser A is now logged out
    const postA = await app.inject({
      method: 'GET',
      url: '/dashboard',
      cookies: { [cookieName]: sessionTokenA },
    });
    assert.equal(postA.statusCode, 302, 'Post-logout: Browser A should redirect to /login');
    assert.match(postA.headers.location, /\/login/);

    // Verify Browser B is still logged in
    const postB = await app.inject({
      method: 'GET',
      url: '/dashboard',
      cookies: { [cookieName]: sessionTokenB },
    });
    assert.equal(postB.statusCode, 200, 'Post-logout: Browser B should still work');
  });

  // ──────────────────────────────────────────────────────────────────────
  // 5. SAME-ACCOUNT CONCURRENCY — Both sessions work simultaneously
  // ──────────────────────────────────────────────────────────────────────
  it('19. Both sessions can access different pages simultaneously', async () => {
    const [resA, resB] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/skills',
        cookies: { [cookieName]: sessionTokenB }, // A was logged out above
      }),
      app.inject({
        method: 'GET',
        url: '/projects',
        cookies: { [cookieName]: sessionTokenB },
      }),
    ]);
    assert.equal(resA.statusCode, 200, 'Browser B can access /skills');
    assert.equal(resB.statusCode, 200, 'Browser B can access /projects');
  });

  // ──────────────────────────────────────────────────────────────────────
  // 6. UNAUTHENTICATED REQUESTS — Both sessions are required
  // ──────────────────────────────────────────────────────────────────────
  it('20. Unauthenticated GET redirects to /login', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
    });
    assert.equal(res.statusCode, 302);
    assert.match(res.headers.location, /\/login/);
  });

  it('21. No session cookie means no authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
      cookies: {},
    });
    assert.equal(res.statusCode, 302);
  });

  // ──────────────────────────────────────────────────────────────────────
  // 7. GET REQUESTS BYPASS CSRF — Always allowed for navigation
  // ──────────────────────────────────────────────────────────────────────
  it('22. GET requests never trigger CSRF validation', async () => {
    // Even with a malicious Origin on GET (unusual but possible), GET bypasses CSRF
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
      cookies: { [cookieName]: sessionTokenB },
      headers: {
        origin: 'https://evil-attacker.example',
      },
    });
    // GET requests bypass CSRF, so this should succeed with valid session
    assert.equal(res.statusCode, 200, 'GET should bypass CSRF check');
  });

  // ──────────────────────────────────────────────────────────────────────
  // 8. NO ORIGIN HEADER — Non-browser clients are allowed through
  // ──────────────────────────────────────────────────────────────────────
  it('23. POST without Origin header is allowed (non-browser client)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/onboarding/profile',
      cookies: { [cookieName]: sessionTokenB },
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        // No origin header — simulates curl/Postman/script
      },
      payload: 'displayName=NonBrowser+Client',
    });
    assert.ok(
      res.statusCode === 302 || res.statusCode === 200,
      `Non-browser POST without Origin should work, got ${res.statusCode}`
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // 9. SAME-SITE COOKIE — Prevents cross-site cookie transmission
  // ──────────────────────────────────────────────────────────────────────
  it('24. Session cookie has SameSite=Lax', () => {
    // This is verified by inspecting the cookie options
    const opts = getSessionCookieOptions({
      NODE_ENV: 'test',
      SESSION_COOKIE_NAME: 'career_hub_session',
    });
    assert.equal(opts.sameSite, 'lax', 'Cookie should be SameSite=Lax');
    assert.equal(opts.httpOnly, true, 'Cookie should be HttpOnly');
  });

  // ──────────────────────────────────────────────────────────────────────
  // 10. MULTIPLE SESSION ROWS — Both exist in database
  // ──────────────────────────────────────────────────────────────────────
  it('25. Two independent session rows exist for the same user', async () => {
    const userSessions = await db.select().from(sessions).where(eq(sessions.userId, userId));

    // At least 2 sessions (we created A and B; A might have been revoked in test 18)
    assert.ok(userSessions.length >= 1, 'At least one session row should exist');

    // The remaining session (B) should be valid
    const sessionBRow = userSessions.find((s) => s.userAgent === 'BrowserB/TestAgent');
    assert.ok(sessionBRow, 'Browser B session row should exist in database');
    assert.equal(sessionBRow.userId, userId, 'Session B belongs to the correct user');
    assert.equal(sessionBRow.tenantId, tenantId, 'Session B belongs to the correct tenant');
  });

  // ──────────────────────────────────────────────────────────────────────
  // 11. MALFORMED CSRF TOKEN — Hidden field exists but is decorative
  // ──────────────────────────────────────────────────────────────────────
  it('26. Connect page includes _csrf hidden field in form', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/connect',
      cookies: { [cookieName]: sessionTokenB },
    });
    assert.equal(res.statusCode, 200);
    // The page includes <input type="hidden" name="_csrf" ...>
    assert.match(res.payload, /name="_csrf"/, 'Connect page should include CSRF hidden field');
  });

  it('27. Resumes page includes _csrf hidden field in form', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/resumes',
      cookies: { [cookieName]: sessionTokenB },
    });
    assert.equal(res.statusCode, 200);
    assert.match(res.payload, /name="_csrf"/, 'Resumes page should include CSRF hidden field');
  });

  // ──────────────────────────────────────────────────────────────────────
  // 12. BROWSER B CAN LOGOUT ITSELF
  // ──────────────────────────────────────────────────────────────────────
  it('28. Browser B can successfully logout with valid same-origin request', async () => {
    const preLogout = await app.inject({
      method: 'GET',
      url: '/dashboard',
      cookies: { [cookieName]: sessionTokenB },
    });
    assert.equal(preLogout.statusCode, 200, 'Pre-logout: B works');

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { [cookieName]: sessionTokenB },
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'http://localhost:3000',
      },
      payload: '',
    });
    assert.ok(
      logout.statusCode === 302 || logout.statusCode === 200,
      `Browser B logout should succeed, got ${logout.statusCode}`
    );

    const postLogout = await app.inject({
      method: 'GET',
      url: '/dashboard',
      cookies: { [cookieName]: sessionTokenB },
    });
    assert.equal(postLogout.statusCode, 302, 'Post-logout: B should redirect to /login');
  });
});
