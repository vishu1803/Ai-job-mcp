/**
 * @file Web Security Mutation Boundary Integration Tests (Phase 1).
 *
 * Verifies end-to-end security boundary for all state-changing web operations:
 * 1. Unauthenticated mutation rejected (401 JSON / 302 redirect)
 * 2. Missing Origin with session rejected in browser context (403 CSRF_DETECTED)
 * 3. Malicious Origin rejected (403 CSRF_DETECTED)
 * 4. Malformed Origin rejected (403 CSRF_DETECTED)
 * 5. Forged Referer rejected (403 CSRF_DETECTED)
 * 6. Missing CSRF token with session rejected (403 CSRF_TOKEN_MISSING)
 * 7. Tampered/invalid CSRF token rejected (403 CSRF_TOKEN_INVALID)
 * 8. Cross-session CSRF token rejected (403 CSRF_TOKEN_INVALID)
 * 9. Valid mutation with trusted Origin & session-bound CSRF token accepted (200 OK)
 * 10. GET requests exempt from CSRF validation (200 OK)
 * 11. Webhook endpoints exempt from browser CSRF checks (verified via HMAC)
 * 12. Sec-Fetch-Site cross-site defense (403 CSRF_DETECTED)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, sessions, candidates } from '../../src/db/schema.js';
import {
  createSession,
  getSessionCookieOptions,
  generateCsrfToken,
} from '../../src/security/session.service.js';
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';

describe('Web Security Mutation Boundary (CSRF & State-Changing Protections)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const tenantId = crypto.randomUUID();
  const userIdA = crypto.randomUUID();
  const userIdB = crypto.randomUUID();
  const candidateIdA = crypto.randomUUID();

  let app;
  let rawSessionTokenA;
  let sessionIdA;
  let rawSessionTokenB;
  let sessionIdB;
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

    // 1. Create tenant
    await db.insert(tenants).values({
      id: tenantId,
      name: `Security Tenant ${testRunId}`,
      slug: `security-tenant-${testRunId}`,
      tier: 'FREE',
    });

    // 2. Create User A and Candidate A
    await db.insert(users).values({
      id: userIdA,
      tenantId,
      email: `user-a-${testRunId}@example.test`,
      displayName: `User Alpha ${testRunId}`,
      role: 'OWNER',
      status: 'ACTIVE',
    });

    await db.insert(candidates).values({
      id: candidateIdA,
      tenantId,
      userId: userIdA,
      displayName: `Candidate Alpha ${testRunId}`,
      canonicalEmail: `user-a-${testRunId}@example.test`,
      status: 'ACTIVE',
    });

    // 3. Create User B
    await db.insert(users).values({
      id: userIdB,
      tenantId,
      email: `user-b-${testRunId}@example.test`,
      displayName: `User Beta ${testRunId}`,
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    // 4. Create Session for User A
    const sessionA = await createSession(db, {
      userId: userIdA,
      tenantId,
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestBrowserA',
    });
    rawSessionTokenA = sessionA.rawToken;
    sessionIdA = sessionA.sessionId;

    // 5. Create Session for User B
    const sessionB = await createSession(db, {
      userId: userIdB,
      tenantId,
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestBrowserB',
    });
    rawSessionTokenB = sessionB.rawToken;
    sessionIdB = sessionB.sessionId;
  });

  after(async () => {
    try {
      await db.delete(sessions).where(eq(sessions.tenantId, tenantId));
      await db.delete(candidates).where(eq(candidates.tenantId, tenantId));
      await db.delete(users).where(eq(users.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    } catch {
      // Best-effort cleanup
    }
    await app.close();
    await closeDatabase();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. UNAUTHENTICATED MUTATION
  // ──────────────────────────────────────────────────────────────────────────
  it('1. Unauthenticated POST /profile is rejected (401 for JSON)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/profile',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        sections: {
          identity: { displayName: 'Hacker Name' },
        },
      }),
    });

    assert.equal(res.statusCode, 401, 'Unauthenticated JSON mutation must return 401');
    assert.match(res.payload, /Unauthorized/i);
  });

  it('2. Unauthenticated POST /profile is redirected to /login for HTML clients', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/profile',
      headers: {
        accept: 'text/html',
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: 'displayName=Hacker+Name',
    });

    assert.equal(res.statusCode, 302, 'Unauthenticated HTML mutation must redirect');
    assert.match(res.headers.location, /\/login\?returnTo=\/profile/);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. MISSING ORIGIN WITH ACTIVE SESSION IN BROWSER CONTEXT
  // ──────────────────────────────────────────────────────────────────────────
  it('3. Browser mutation with active session but missing Origin/Referer is blocked', async () => {
    const validCsrf = generateCsrfToken(sessionIdA);

    const res = await app.inject({
      method: 'POST',
      url: '/profile',
      cookies: { [cookieName]: rawSessionTokenA },
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'sec-fetch-mode': 'cors', // Identifies browser fetch context
        'x-csrf-token': validCsrf,
        // Intentionally omitting Origin and Referer
      },
      payload: JSON.stringify({
        sections: {
          identity: { displayName: 'Updated Without Origin' },
        },
      }),
    });

    assert.equal(res.statusCode, 403, 'Missing Origin in browser context must be blocked');
    assert.match(res.payload, /CSRF_DETECTED/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. MALICIOUS ORIGIN HEADER
  // ──────────────────────────────────────────────────────────────────────────
  it('4. Authenticated mutation with malicious Origin is blocked (CSRF_DETECTED)', async () => {
    const validCsrf = generateCsrfToken(sessionIdA);

    const res = await app.inject({
      method: 'POST',
      url: '/profile',
      cookies: { [cookieName]: rawSessionTokenA },
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: 'https://evil-attacker.example',
        'x-csrf-token': validCsrf,
      },
      payload: JSON.stringify({
        sections: {
          identity: { displayName: 'Hacked Name' },
        },
      }),
    });

    assert.equal(res.statusCode, 403, 'Malicious Origin must be blocked with 403');
    assert.match(res.payload, /CSRF_DETECTED/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. MALFORMED ORIGIN HEADER
  // ──────────────────────────────────────────────────────────────────────────
  it('5. Authenticated mutation with null Origin is blocked (privacy sandbox/sandboxed iframe)', async () => {
    const validCsrf = generateCsrfToken(sessionIdA);

    const res = await app.inject({
      method: 'POST',
      url: '/profile',
      cookies: { [cookieName]: rawSessionTokenA },
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: 'null',
        'x-csrf-token': validCsrf,
      },
      payload: JSON.stringify({
        sections: {
          identity: { displayName: 'Sandboxed Exploit' },
        },
      }),
    });

    assert.equal(res.statusCode, 403, 'null Origin must be blocked');
    assert.match(res.payload, /CSRF_DETECTED/i);
  });

  it('6. Authenticated mutation with malformed Origin URL is blocked', async () => {
    const validCsrf = generateCsrfToken(sessionIdA);

    const res = await app.inject({
      method: 'POST',
      url: '/profile',
      cookies: { [cookieName]: rawSessionTokenA },
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: 'ht!tp://invalid-format',
        'x-csrf-token': validCsrf,
      },
      payload: JSON.stringify({
        sections: {
          identity: { displayName: 'Malformed Exploit' },
        },
      }),
    });

    assert.equal(res.statusCode, 403, 'Malformed Origin must be blocked');
    assert.match(res.payload, /CSRF_DETECTED/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. FORGED REFERER HEADER
  // ──────────────────────────────────────────────────────────────────────────
  it('7. Authenticated mutation with untrusted Referer is blocked', async () => {
    const validCsrf = generateCsrfToken(sessionIdA);

    const res = await app.inject({
      method: 'POST',
      url: '/profile',
      cookies: { [cookieName]: rawSessionTokenA },
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        referer: 'https://phishing-site.example/steal-profile',
        'x-csrf-token': validCsrf,
      },
      payload: JSON.stringify({
        sections: {
          identity: { displayName: 'Phishing Update' },
        },
      }),
    });

    assert.equal(res.statusCode, 403, 'Untrusted Referer must be blocked');
    assert.match(res.payload, /CSRF_DETECTED/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. MISSING CSRF TOKEN
  // ──────────────────────────────────────────────────────────────────────────
  it('8. Authenticated mutation with trusted Origin but MISSING CSRF token is blocked', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/profile',
      cookies: { [cookieName]: rawSessionTokenA },
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        // Intentionally missing x-csrf-token
      },
      payload: JSON.stringify({
        sections: {
          identity: { displayName: 'Missing CSRF Name' },
        },
      }),
    });

    assert.equal(res.statusCode, 403, 'Missing CSRF token must return 403');
    assert.match(res.payload, /CSRF_TOKEN_MISSING/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. TAMPERED / INVALID CSRF TOKEN
  // ──────────────────────────────────────────────────────────────────────────
  it('9. Authenticated mutation with tampered CSRF token is blocked (CSRF_TOKEN_INVALID)', async () => {
    const validToken = generateCsrfToken(sessionIdA);
    const [nonce, signature] = validToken.split('.');
    const tamperedToken = `${nonce}.${'00'.repeat(32)}`; // Forged signature

    const res = await app.inject({
      method: 'POST',
      url: '/profile',
      cookies: { [cookieName]: rawSessionTokenA },
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        'x-csrf-token': tamperedToken,
      },
      payload: JSON.stringify({
        sections: {
          identity: { displayName: 'Tampered Token Name' },
        },
      }),
    });

    assert.equal(res.statusCode, 403, 'Tampered CSRF token must return 403');
    assert.match(res.payload, /CSRF_TOKEN_INVALID/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. CROSS-SESSION CSRF TOKEN
  // ──────────────────────────────────────────────────────────────────────────
  it('10. CSRF token belonging to Session B is rejected when submitted by Session A', async () => {
    // Generate valid token strictly bound to Session B
    const tokenForSessionB = generateCsrfToken(sessionIdB);

    // Session A presents User B's token
    const res = await app.inject({
      method: 'POST',
      url: '/profile',
      cookies: { [cookieName]: rawSessionTokenA },
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        'x-csrf-token': tokenForSessionB,
      },
      payload: JSON.stringify({
        sections: {
          identity: { displayName: 'Cross Session Name' },
        },
      }),
    });

    assert.equal(res.statusCode, 403, 'Cross-session CSRF token must return 403');
    assert.match(res.payload, /CSRF_TOKEN_INVALID/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 9. VALID MUTATION WITH TRUSTED ORIGIN AND SESSION-BOUND TOKEN
  // ──────────────────────────────────────────────────────────────────────────
  it('11. Valid mutation with trusted Origin and session-bound CSRF token succeeds (200 OK)', async () => {
    const validCsrf = generateCsrfToken(sessionIdA);

    const res = await app.inject({
      method: 'POST',
      url: '/profile',
      cookies: { [cookieName]: rawSessionTokenA },
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        'x-csrf-token': validCsrf,
      },
      payload: JSON.stringify({
        sections: {
          identity: {
            displayName: 'Legitimate Alpha Name',
            headline: 'Senior Distributed Systems Architect',
          },
        },
      }),
    });

    assert.equal(
      res.statusCode,
      200,
      `Valid mutation should succeed, got ${res.statusCode}: ${res.payload}`
    );
    const data = JSON.parse(res.payload);
    assert.equal(data.displayName, 'Legitimate Alpha Name');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 10. GET REQUESTS EXEMPT FROM CSRF VALIDATION
  // ──────────────────────────────────────────────────────────────────────────
  it('12. GET /profile is exempt from CSRF validation even with malicious Origin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/profile',
      cookies: { [cookieName]: rawSessionTokenA },
      headers: {
        origin: 'https://evil-attacker.example',
      },
    });

    assert.equal(res.statusCode, 200, 'GET request must bypass CSRF checks');
    assert.match(res.payload, /Candidate Profile &amp; Readiness Workspace|Candidate Profile/);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 11. WEBHOOK EXEMPTION
  // ──────────────────────────────────────────────────────────────────────────
  it('13. POST /webhooks/github is exempt from browser CSRF checks (uses HMAC)', async () => {
    // Missing signature returns 400 (Bad Request), NOT 403 (CSRF blocked)
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        origin: 'https://github.com',
      },
      payload: JSON.stringify({ action: 'ping' }),
    });

    // 400 means webhook was processed by its own signature middleware, not blocked by CSRF
    assert.notEqual(res.statusCode, 403, 'Webhook must not be blocked by CSRF middleware');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 12. SEC-FETCH-SITE CROSS-SITE DEFENSE
  // ──────────────────────────────────────────────────────────────────────────
  it('14. Mutation with Sec-Fetch-Site: cross-site is immediately blocked', async () => {
    const validCsrf = generateCsrfToken(sessionIdA);

    const res = await app.inject({
      method: 'POST',
      url: '/profile',
      cookies: { [cookieName]: rawSessionTokenA },
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        'sec-fetch-site': 'cross-site',
        'x-csrf-token': validCsrf,
      },
      payload: JSON.stringify({
        sections: {
          identity: { displayName: 'Cross Site Attacker' },
        },
      }),
    });

    assert.equal(res.statusCode, 403, 'Sec-Fetch-Site: cross-site must be blocked');
    assert.match(res.payload, /CSRF_DETECTED/i);
  });
});
