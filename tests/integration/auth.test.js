import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, sessions } from '../../src/db/schema.js';
import { GitHubProvider } from '../../src/security/providers/github.provider.js';
import { AuthService } from '../../src/security/auth.service.js';
import { OAUTH_TRANSIT_COOKIE_NAME } from '../../src/security/oauth-state.js';

describe('GitHub OAuth & Server-Side Session Authentication Integration Tests (P2-002)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const syntheticEmail = `dev-${testRunId}@example.com`;
  const createdTenantIds = [];

  let app;
  let authService;
  let mockFetch;

  before(async () => {
    // Synthetic GitHub API mock responses
    mockFetch = async (url, options = {}) => {
      // 1. OAuth token exchange endpoint
      if (url === 'https://github.com/login/oauth/access_token') {
        const body = JSON.parse(options.body || '{}');
        if (body.code === 'valid_mock_code') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: 'gho_synthetic_access_token_123',
              token_type: 'bearer',
              scope: 'read:user,user:email',
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            error: 'bad_verification_code',
            error_description: 'The code passed is incorrect or expired.',
          }),
        };
      }

      // 2. User profile endpoint
      if (url === 'https://api.github.com/user') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 99001122,
            login: `dev_${testRunId}`,
            name: `Developer ${testRunId}`,
            email: syntheticEmail,
            avatar_url: `https://avatars.githubusercontent.com/u/99001122?v=4`,
          }),
        };
      }

      throw new Error(`Unhandled mock URL: ${url}`);
    };

    const mockGitHubProvider = new GitHubProvider({
      clientId: 'mock_gh_client_id',
      clientSecret: 'mock_gh_client_secret',
      redirectUri: 'http://localhost:3000/auth/github/callback',
      fetchFn: mockFetch,
    });

    const providers = new Map();
    providers.set('github', mockGitHubProvider);

    const testEncryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    authService = new AuthService({ db, providers, encryptionKey: testEncryptionKey });
    app = buildApp({ logger: false, authService });

    // Ensure Fastify is initialized
    await app.ready();
  });

  after(async () => {
    // Clean up created tenants (cascades to users, sessions, audit_logs)
    for (const tenantId of createdTenantIds) {
      try {
        await db.delete(tenants).where(eq(tenants.id, tenantId));
      } catch {
        // Best-effort teardown
      }
    }

    await app.close();
    await closeDatabase();
  });

  let savedState;
  let savedTransitCookie;
  let sessionCookie;
  let createdUserId;
  let createdTenantId;

  it('1. GET /auth/github initiates OAuth 2.1 flow and sets transit cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/github',
    });

    assert.strictEqual(res.statusCode, 302);
    const location = res.headers['location'];
    assert.ok(location.startsWith('https://github.com/login/oauth/authorize'));

    const parsedUrl = new URL(location);
    assert.strictEqual(parsedUrl.searchParams.get('client_id'), 'mock_gh_client_id');
    assert.strictEqual(parsedUrl.searchParams.get('code_challenge_method'), 'S256');

    savedState = parsedUrl.searchParams.get('state');
    assert.ok(savedState);

    // Extract set-cookie for oauth_transit
    const setCookie = res.headers['set-cookie'];
    assert.ok(setCookie);

    const cookies = res.cookies;
    const transit = cookies.find((c) => c.name === OAUTH_TRANSIT_COOKIE_NAME);
    assert.ok(transit);
    savedTransitCookie = transit.value;
  });

  it('2. GET /auth/github/callback rejects forged/mismatched state', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/github/callback',
      query: {
        code: 'valid_mock_code',
        state: 'forged_tampered_state_123',
      },
      cookies: {
        [OAUTH_TRANSIT_COOKIE_NAME]: savedTransitCookie,
      },
    });

    assert.strictEqual(res.statusCode, 401);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error.code, 'INVALID_OAUTH_STATE');
  });

  it('3. GET /auth/github/callback provisions new user and tenant on valid authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/github/callback',
      query: {
        code: 'valid_mock_code',
        state: savedState,
        format: 'json',
      },
      cookies: {
        [OAUTH_TRANSIT_COOKIE_NAME]: savedTransitCookie,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);

    assert.strictEqual(body.isNewUser, true);
    assert.ok(body.user.id);
    assert.strictEqual(body.user.email, syntheticEmail);
    assert.strictEqual(body.user.role, 'OWNER');
    assert.ok(body.tenant.id);
    assert.ok(body.tenant.slug);

    createdUserId = body.user.id;
    createdTenantId = body.tenant.id;
    createdTenantIds.push(createdTenantId);

    // Verify session cookie was set
    const cookies = res.cookies;
    const sessionCookieObj = cookies.find((c) => c.name === 'career_hub_session');
    assert.ok(sessionCookieObj);
    assert.ok(sessionCookieObj.value);
    sessionCookie = sessionCookieObj.value;

    // Verify database records exist
    const [dbUser] = await db.select().from(users).where(eq(users.id, createdUserId));
    assert.strictEqual(dbUser.email, syntheticEmail);
    assert.strictEqual(dbUser.status, 'ACTIVE');

    const [dbTenant] = await db.select().from(tenants).where(eq(tenants.id, createdTenantId));
    assert.strictEqual(dbTenant.tier, 'FREE');

    // Verify session in database is stored as SHA-256 hash (never raw token)
    const expectedSessionId = crypto.createHash('sha256').update(sessionCookie).digest('hex');
    const [dbSession] = await db.select().from(sessions).where(eq(sessions.id, expectedSessionId));
    assert.ok(dbSession);
    assert.strictEqual(dbSession.userId, createdUserId);
    assert.strictEqual(dbSession.tenantId, createdTenantId);
  });

  it('4. GET /auth/me returns authenticated user & tenant context with valid session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: {
        career_hub_session: sessionCookie,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);

    assert.strictEqual(body.user.id, createdUserId);
    assert.strictEqual(body.user.email, syntheticEmail);
    assert.strictEqual(body.user.role, 'OWNER');
    assert.strictEqual(body.tenant.id, createdTenantId);
    assert.strictEqual(body.tenant.tier, 'FREE');
    assert.ok(body.session.id);
    assert.ok(body.session.expiresAt);
  });

  it('5. GET /auth/me rejects unauthenticated request without session cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
    });

    assert.strictEqual(res.statusCode, 401);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error.code, 'UNAUTHENTICATED');
  });

  it('6. GET /auth/me rejects forged/non-existent session token', async () => {
    const forgedToken = crypto.randomBytes(32).toString('base64url');
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: {
        career_hub_session: forgedToken,
      },
    });

    assert.strictEqual(res.statusCode, 401);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error.code, 'INVALID_SESSION');
  });

  it('7. POST /auth/logout (JSON API) revokes session in database and returns JSON confirmation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        accept: 'application/json',
      },
      cookies: {
        career_hub_session: sessionCookie,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.message, 'Successfully logged out');

    // Verify session row is deleted in DB
    const sessionId = crypto.createHash('sha256').update(sessionCookie).digest('hex');
    const dbSessions = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    assert.strictEqual(dbSessions.length, 0);

    // Subsequent GET /auth/me should fail with 401
    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: {
        career_hub_session: sessionCookie,
      },
    });
    assert.strictEqual(meRes.statusCode, 401);
  });

  it('7a. POST /auth/logout (HTML Form) revokes session and redirects browser to /login', async () => {
    // Provision fresh session
    const flowRes = await app.inject({ method: 'GET', url: '/auth/github' });
    const parsedUrl = new URL(flowRes.headers['location']);
    const newState = parsedUrl.searchParams.get('state');
    const newTransit = flowRes.cookies.find((c) => c.name === OAUTH_TRANSIT_COOKIE_NAME).value;

    const callbackRes = await app.inject({
      method: 'GET',
      url: '/auth/github/callback',
      query: { code: 'valid_mock_code', state: newState, format: 'json' },
      cookies: { [OAUTH_TRANSIT_COOKIE_NAME]: newTransit },
    });

    const activeCookie = callbackRes.cookies.find((c) => c.name === 'career_hub_session').value;
    const activeSessionId = crypto.createHash('sha256').update(activeCookie).digest('hex');

    // Submit standard HTML Form (x-www-form-urlencoded)
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'text/html,application/xhtml+xml',
      },
      cookies: {
        career_hub_session: activeCookie,
      },
    });

    assert.strictEqual(logoutRes.statusCode, 302);
    assert.strictEqual(logoutRes.headers['location'], '/login');

    // Verify session row is deleted from PostgreSQL
    const remaining = await db.select().from(sessions).where(eq(sessions.id, activeSessionId));
    assert.strictEqual(remaining.length, 0);
  });

  it('7b. GET /auth/logout (Browser Fallback) revokes session and redirects browser to /login', async () => {
    // Provision fresh session
    const flowRes = await app.inject({ method: 'GET', url: '/auth/github' });
    const parsedUrl = new URL(flowRes.headers['location']);
    const newState = parsedUrl.searchParams.get('state');
    const newTransit = flowRes.cookies.find((c) => c.name === OAUTH_TRANSIT_COOKIE_NAME).value;

    const callbackRes = await app.inject({
      method: 'GET',
      url: '/auth/github/callback',
      query: { code: 'valid_mock_code', state: newState, format: 'json' },
      cookies: { [OAUTH_TRANSIT_COOKIE_NAME]: newTransit },
    });

    const activeCookie = callbackRes.cookies.find((c) => c.name === 'career_hub_session').value;
    const activeSessionId = crypto.createHash('sha256').update(activeCookie).digest('hex');

    const getLogoutRes = await app.inject({
      method: 'GET',
      url: '/auth/logout',
      cookies: {
        career_hub_session: activeCookie,
      },
    });

    assert.strictEqual(getLogoutRes.statusCode, 302);
    assert.strictEqual(getLogoutRes.headers['location'], '/login');

    // Verify session is revoked
    const remaining = await db.select().from(sessions).where(eq(sessions.id, activeSessionId));
    assert.strictEqual(remaining.length, 0);
  });

  it('7c. POST /auth/logout rejects cross-site request forgery with 403 CSRF_DETECTED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        origin: 'https://evil-attacker.com',
        'content-type': 'application/x-www-form-urlencoded',
      },
    });

    assert.strictEqual(res.statusCode, 403);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error.code, 'CSRF_DETECTED');
  });

  it('7d. Repeated unauthenticated logout requests execute safely and idempotently', async () => {
    // Repeated POST
    const postRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
    });
    assert.strictEqual(postRes.statusCode, 302);
    assert.strictEqual(postRes.headers['location'], '/login');

    // Repeated GET
    const getRes = await app.inject({
      method: 'GET',
      url: '/auth/logout',
    });
    assert.strictEqual(getRes.statusCode, 302);
    assert.strictEqual(getRes.headers['location'], '/login');
  });

  it('8. Re-login for existing user updates session without creating duplicate tenant', async () => {
    // Generate new OAuth state
    const flowRes = await app.inject({
      method: 'GET',
      url: '/auth/github',
    });

    const parsedUrl = new URL(flowRes.headers['location']);
    const newState = parsedUrl.searchParams.get('state');
    const newTransit = flowRes.cookies.find((c) => c.name === OAUTH_TRANSIT_COOKIE_NAME).value;

    const callbackRes = await app.inject({
      method: 'GET',
      url: '/auth/github/callback',
      query: {
        code: 'valid_mock_code',
        state: newState,
        format: 'json',
      },
      cookies: {
        [OAUTH_TRANSIT_COOKIE_NAME]: newTransit,
      },
    });

    assert.strictEqual(callbackRes.statusCode, 200);
    const body = JSON.parse(callbackRes.payload);

    assert.strictEqual(body.isNewUser, false);
    assert.strictEqual(body.user.id, createdUserId);
    assert.strictEqual(body.tenant.id, createdTenantId);
  });

  it('9. Suspended user is denied authentication with 403 Forbidden', async () => {
    // Mark user as SUSPENDED
    await db.update(users).set({ status: 'SUSPENDED' }).where(eq(users.id, createdUserId));

    const flowRes = await app.inject({
      method: 'GET',
      url: '/auth/github',
    });

    const parsedUrl = new URL(flowRes.headers['location']);
    const newState = parsedUrl.searchParams.get('state');
    const newTransit = flowRes.cookies.find((c) => c.name === OAUTH_TRANSIT_COOKIE_NAME).value;

    const callbackRes = await app.inject({
      method: 'GET',
      url: '/auth/github/callback',
      query: {
        code: 'valid_mock_code',
        state: newState,
        format: 'json',
      },
      cookies: {
        [OAUTH_TRANSIT_COOKIE_NAME]: newTransit,
      },
    });

    assert.strictEqual(callbackRes.statusCode, 403);
    const body = JSON.parse(callbackRes.payload);
    assert.strictEqual(body.error.code, 'ACCOUNT_SUSPENDED');

    // Restore user to ACTIVE for subsequent tests
    await db.update(users).set({ status: 'ACTIVE' }).where(eq(users.id, createdUserId));
  });

  it('10. GET /dashboard rejects unauthenticated request without session cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: {
        accept: 'application/json',
      },
    });

    assert.strictEqual(res.statusCode, 401);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error.code, 'UNAUTHENTICATED');
  });

  it('11. GET /dashboard returns protected dashboard placeholder for authenticated user', async () => {
    // Re-authenticate user to obtain active session cookie
    const flowRes = await app.inject({
      method: 'GET',
      url: '/auth/github',
    });
    const parsedUrl = new URL(flowRes.headers['location']);
    const newState = parsedUrl.searchParams.get('state');
    const newTransit = flowRes.cookies.find((c) => c.name === OAUTH_TRANSIT_COOKIE_NAME).value;

    const callbackRes = await app.inject({
      method: 'GET',
      url: '/auth/github/callback',
      query: {
        code: 'valid_mock_code',
        state: newState,
        format: 'json',
      },
      cookies: {
        [OAUTH_TRANSIT_COOKIE_NAME]: newTransit,
      },
    });

    const activeSessionCookie = callbackRes.cookies.find(
      (c) => c.name === 'career_hub_session'
    ).value;

    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: {
        accept: 'application/json',
      },
      cookies: {
        career_hub_session: activeSessionCookie,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.message, 'Welcome to Antigravity Career Hub Dashboard');
    assert.strictEqual(body.user.id, createdUserId);
    assert.strictEqual(body.user.displayName, `Developer ${testRunId}`);
    assert.strictEqual(body.user.role, 'OWNER');
    assert.strictEqual(body.tenant.id, createdTenantId);
    assert.strictEqual(body.tenant.name, `Developer ${testRunId}'s Workspace`);

    // Verify zero credential leakage
    assert.strictEqual(body.token, undefined);
    assert.strictEqual(body.accessToken, undefined);
    assert.strictEqual(body.session, undefined);
  });

  it('12. GET /dashboard ignores injected spoofed tenant IDs', async () => {
    // Re-authenticate user
    const flowRes = await app.inject({
      method: 'GET',
      url: '/auth/github',
    });
    const parsedUrl = new URL(flowRes.headers['location']);
    const newState = parsedUrl.searchParams.get('state');
    const newTransit = flowRes.cookies.find((c) => c.name === OAUTH_TRANSIT_COOKIE_NAME).value;

    const callbackRes = await app.inject({
      method: 'GET',
      url: '/auth/github/callback',
      query: {
        code: 'valid_mock_code',
        state: newState,
        format: 'json',
      },
      cookies: {
        [OAUTH_TRANSIT_COOKIE_NAME]: newTransit,
      },
    });

    const activeSessionCookie = callbackRes.cookies.find(
      (c) => c.name === 'career_hub_session'
    ).value;
    const spoofedTenantId = crypto.randomUUID();

    const res = await app.inject({
      method: 'GET',
      url: `/dashboard?tenant_id=${spoofedTenantId}`,
      headers: {
        accept: 'application/json',
        'x-tenant-id': spoofedTenantId,
        'tenant-id': spoofedTenantId,
      },
      cookies: {
        career_hub_session: activeSessionCookie,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.tenant.id, createdTenantId);
    assert.notStrictEqual(body.tenant.id, spoofedTenantId);
  });

  it('13. GET /auth/github/callback redirects to /dashboard upon successful browser login', async () => {
    const flowRes = await app.inject({
      method: 'GET',
      url: '/auth/github',
    });
    const parsedUrl = new URL(flowRes.headers['location']);
    const newState = parsedUrl.searchParams.get('state');
    const newTransit = flowRes.cookies.find((c) => c.name === OAUTH_TRANSIT_COOKIE_NAME).value;

    const callbackRes = await app.inject({
      method: 'GET',
      url: '/auth/github/callback',
      query: {
        code: 'valid_mock_code',
        state: newState,
      },
      cookies: {
        [OAUTH_TRANSIT_COOKIE_NAME]: newTransit,
      },
    });

    assert.strictEqual(callbackRes.statusCode, 302);
    assert.strictEqual(callbackRes.headers.location, '/dashboard');
    const sessionCookieObj = callbackRes.cookies.find((c) => c.name === 'career_hub_session');
    assert.ok(sessionCookieObj);
    assert.ok(sessionCookieObj.value);
  });

  it('14. GET /auth/github/callback preserves return_to across OAuth roundtrip and redirects back to return_to', async () => {
    const returnToUrl =
      '/oauth/authorize?response_type=code&client_id=claude-web&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&state=state_xyz123';

    const flowRes = await app.inject({
      method: 'GET',
      url: `/auth/github?return_to=${encodeURIComponent(returnToUrl)}`,
    });
    assert.strictEqual(flowRes.statusCode, 302);
    const parsedUrl = new URL(flowRes.headers['location']);
    const newState = parsedUrl.searchParams.get('state');
    const newTransit = flowRes.cookies.find((c) => c.name === OAUTH_TRANSIT_COOKIE_NAME).value;

    const callbackRes = await app.inject({
      method: 'GET',
      url: '/auth/github/callback',
      query: {
        code: 'valid_mock_code',
        state: newState,
      },
      cookies: {
        [OAUTH_TRANSIT_COOKIE_NAME]: newTransit,
      },
    });

    assert.strictEqual(callbackRes.statusCode, 302);
    assert.strictEqual(callbackRes.headers.location, returnToUrl);
    const sessionCookieObj = callbackRes.cookies.find((c) => c.name === 'career_hub_session');
    assert.ok(sessionCookieObj);
    assert.ok(sessionCookieObj.value);
  });
});
