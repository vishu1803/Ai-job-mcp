/**
 * @file Web Application View Routes Integration Tests (P13.5-001).
 *
 * Verifies:
 * 1. GET / serves public landing page (HTML) and JSON status on Accept: application/json
 * 2. GET /login serves human authentication portal and redirects if already logged in
 * 3. GET /docs/mcp serves public developer MCP documentation
 * 4. GET /dashboard, /onboarding, /connect, /settings enforce authentication & redirect unauthenticated users
 * 5. Authenticated sessions properly hydrate dashboard data without leaking secrets
 * 6. POST /mcp remains purely JSON-RPC machine protocol (no HTML regression)
 * 7. OAuth discovery endpoints (RFC 8414, RFC 9728) continue to function unchanged
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  sessions,
  candidates,
  skills,
  candidateSkills,
  projects,
} from '../../src/db/schema.js';
import { createSession, getSessionCookieOptions } from '../../src/security/session.service.js';
import { config } from '../../src/config/env.js';

describe('Web Application View Routes Integration Tests (P13.5-001)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const candidateId = crypto.randomUUID();
  const skillId = crypto.randomUUID();
  const projectId = crypto.randomUUID();

  let app;
  let rawSessionToken;
  let cookieHeader;

  before(async () => {
    app = buildApp({ db });
    await app.ready();

    // 1. Provision isolated test tenant & user
    await db.insert(tenants).values({
      id: tenantId,
      name: `Web Test Tenant ${testRunId}`,
      slug: `web-test-${testRunId}`,
      tier: 'PRO',
    });

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: `web-user-${testRunId}@example.test`,
      displayName: `Alex Mercer ${testRunId}`,
      role: 'OWNER',
      status: 'ACTIVE',
    });

    // 2. Provision candidate profile, skill, and project
    await db.insert(candidates).values({
      id: candidateId,
      tenantId,
      userId,
      displayName: 'Alex Mercer',
      headline: 'Lead Cloud & Distributed Systems Architect',
      bio: 'Engineering scalable cloud native systems and MCP agents.',
    });

    await db.insert(skills).values({
      id: skillId,
      name: 'Distributed Systems',
      slug: `distributed-systems-${testRunId}`,
      category: 'ARCHITECTURE',
    });

    await db.insert(candidateSkills).values({
      id: crypto.randomUUID(),
      tenantId,
      candidateId,
      skillId,
      category: 'ARCHITECTURE',
      confidenceScore: 0.95,
      provenanceStatus: 'VERIFIED',
      evidenceCount: 12,
    });

    await db.insert(projects).values({
      id: projectId,
      tenantId,
      candidateId,
      name: 'react-node-microservices',
      slug: `react-node-microservices-${testRunId}`,
      summary: 'Production distributed microservices architecture on Kubernetes',
    });

    // 3. Create server-side session
    const session = await createSession(db, {
      userId,
      tenantId,
    });
    rawSessionToken = session.rawToken;
    const cookieOpts = getSessionCookieOptions(config);
    cookieHeader = `${cookieOpts.name}=${rawSessionToken}`;
  });

  after(async () => {
    // Clean up test data
    try {
      await db.delete(candidateSkills).where(eq(candidateSkills.tenantId, tenantId));
      await db.delete(projects).where(eq(projects.tenantId, tenantId));
      await db.delete(skills).where(eq(skills.id, skillId));
      await db.delete(candidates).where(eq(candidates.tenantId, tenantId));
      await db.delete(sessions).where(eq(sessions.tenantId, tenantId));
      await db.delete(users).where(eq(users.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    } catch {
      // Ignore cleanup errors in teardown
    }
    await app.close();
    await closeDatabase();
  });

  // ---------------------------------------------------------------------------
  // 1. GET / (Landing Page)
  // ---------------------------------------------------------------------------
  it('1. GET / returns 200 OK and rendered HTML landing page by default', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/',
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.payload, /The Evidence-Backed AI Career Platform/);
    assert.match(res.payload, /Sign in with GitHub/);
    assert.match(res.payload, /Explore MCP Protocol/);
    assert.match(res.payload, /Anthropic Claude/);
    assert.match(res.payload, /OpenAI ChatGPT/);
    assert.match(res.payload, /Google Gemini/);
  });

  it('2. GET / returns JSON status when Accept header is strictly application/json', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/',
      headers: {
        accept: 'application/json',
      },
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /application\/json/);
    const body = JSON.parse(res.payload);
    assert.equal(body.status, 'operational');
    assert.equal(body.mcpEndpoint, '/mcp');
  });

  // ---------------------------------------------------------------------------
  // 2. GET /login
  // ---------------------------------------------------------------------------
  it('3. GET /login returns 200 OK and rendered HTML login portal when unauthenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/login',
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.payload, /Sign in to Career Hub/);
    assert.match(res.payload, /Continue with GitHub/);
    assert.match(res.payload, /\/auth\/github/);
  });

  it('4. GET /login redirects to /dashboard when user is already authenticated', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'GET',
      url: '/login',
      cookies: {
        [cookieOpts.name]: rawSessionToken,
        career_hub_session: rawSessionToken,
      },
      headers: {
        cookie: cookieHeader,
      },
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers['location'], '/dashboard');
  });

  // ---------------------------------------------------------------------------
  // 3. GET /docs/mcp
  // ---------------------------------------------------------------------------
  it('5. GET /docs/mcp returns 200 OK and developer documentation page', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/docs/mcp',
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.payload, /Model Context Protocol \(MCP\) Documentation/);
    assert.match(res.payload, /POST \/mcp/);
    assert.match(res.payload, /career:read/);
    assert.match(res.payload, /career:write/);
    assert.match(res.payload, /get_candidate_profile/);
    assert.match(res.payload, /analyze_job_fit/);
    assert.match(res.payload, /propose_project_improvement/);
    assert.match(res.payload, /confirm_and_create_pr/);
  });

  // ---------------------------------------------------------------------------
  // 4. Protected Shell Routes (Unauthenticated -> Redirect)
  // ---------------------------------------------------------------------------
  it('6. GET /dashboard redirects unauthenticated user to /login?returnTo=/dashboard', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers['location'], '/login?returnTo=/dashboard');
  });

  it('7. GET /onboarding redirects unauthenticated user to /login?returnTo=/onboarding', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/onboarding',
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers['location'], '/login?returnTo=/onboarding');
  });

  it('8. GET /connect redirects unauthenticated user to /login?returnTo=/connect', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/connect',
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers['location'], '/login?returnTo=/connect');
  });

  it('9. GET /settings redirects unauthenticated user to /login?returnTo=/settings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/settings',
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers['location'], '/login?returnTo=/settings');
  });

  // ---------------------------------------------------------------------------
  // 5. Authenticated Shell Routes (200 OK + Data Hydration)
  // ---------------------------------------------------------------------------
  it('10. GET /dashboard returns 200 OK and hydrates candidate profile and verified skills for authenticated user', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
      cookies: {
        [cookieOpts.name]: rawSessionToken,
        career_hub_session: rawSessionToken,
      },
      headers: {
        cookie: cookieHeader,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.payload, /Welcome back, Alex Mercer/);
    assert.match(res.payload, /PRO TIER/);
    assert.match(res.payload, /Lead Cloud &amp; Distributed Systems Architect/);
    assert.match(res.payload, /Distributed Systems/);
    assert.match(res.payload, /react-node-microservices/);
  });

  it('11. GET /onboarding returns 200 OK and wizard steps for authenticated user', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'GET',
      url: '/onboarding',
      cookies: {
        [cookieOpts.name]: rawSessionToken,
        career_hub_session: rawSessionToken,
      },
      headers: {
        cookie: cookieHeader,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.payload, /Candidate Onboarding Wizard/);
    assert.match(res.payload, /Install GitHub App/);
    assert.match(res.payload, /Execute AST Ingestion/);
  });

  it('12. GET /connect returns 200 OK and AI connection hub for authenticated user', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'GET',
      url: '/connect',
      cookies: {
        [cookieOpts.name]: rawSessionToken,
        career_hub_session: rawSessionToken,
      },
      headers: {
        cookie: cookieHeader,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.payload, /AI Connection Center/);
    assert.match(res.payload, /Anthropic Claude/);
    assert.match(res.payload, /OpenAI ChatGPT/);
    assert.match(res.payload, /Google Gemini/);
  });

  it('13. GET /settings returns 200 OK and GDPR data controls for authenticated user', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'GET',
      url: '/settings',
      cookies: {
        [cookieOpts.name]: rawSessionToken,
        career_hub_session: rawSessionToken,
      },
      headers: {
        cookie: cookieHeader,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.payload, /Account (&|&amp;) Privacy Settings/);
    assert.match(res.payload, /GDPR Erasure/);
    assert.match(res.payload, /Delete Account \(GDPR\)/);
  });

  // ---------------------------------------------------------------------------
  // 6. Security & Secret Leakage Prevention
  // ---------------------------------------------------------------------------
  it('14. Rendered HTML pages never leak database passwords, raw tokens, or private secrets', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const pages = ['/', '/docs/mcp', '/dashboard', '/connect', '/settings'];

    for (const pageUrl of pages) {
      const res = await app.inject({
        method: 'GET',
        url: pageUrl,
        cookies: {
          [cookieOpts.name]: rawSessionToken,
          career_hub_session: rawSessionToken,
        },
        headers: {
          cookie: cookieHeader,
        },
      });

      assert.equal(res.statusCode, 200);
      assert.doesNotMatch(res.payload, /postgres:/i);
      assert.doesNotMatch(res.payload, /password=/i);
      assert.doesNotMatch(res.payload, /gho_[a-zA-Z0-9_]+/);
      assert.doesNotMatch(res.payload, /SESSION_COOKIE_SECRET/);
      assert.doesNotMatch(res.payload, /GITHUB_APP_PRIVATE_KEY/);
    }

    // Also check unauthenticated /login
    const loginRes = await app.inject({
      method: 'GET',
      url: '/login',
    });
    assert.equal(loginRes.statusCode, 200);
    assert.doesNotMatch(loginRes.payload, /postgres:/i);
    assert.doesNotMatch(loginRes.payload, /password=/i);
  });

  // ---------------------------------------------------------------------------
  // 7. MCP & OAuth Discovery Protocol Invariants (Zero Regression)
  // ---------------------------------------------------------------------------
  it('15. POST /mcp remains purely JSON-RPC machine protocol and rejects unauthenticated requests with JSON-RPC error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-1',
        method: 'tools/list',
      },
    });

    // MCP protocol rejects unauthenticated with 401 JSON / JSON-RPC error, never HTML!
    assert.equal(res.statusCode, 401);
    assert.match(res.headers['content-type'], /application\/json/);
    const body = JSON.parse(res.payload);
    assert.ok(body.error || body.message);
  });

  it('16. RFC 8414 & RFC 9728 OAuth discovery endpoints return standard JSON metadata', async () => {
    const resAuthServer = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-authorization-server',
    });
    assert.equal(resAuthServer.statusCode, 200);
    assert.match(resAuthServer.headers['content-type'], /application\/json/);
    const authMeta = JSON.parse(resAuthServer.payload);
    assert.ok(authMeta.authorization_endpoint);
    assert.ok(authMeta.token_endpoint);

    const resProtectedResource = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-protected-resource',
    });
    assert.equal(resProtectedResource.statusCode, 200);
    assert.match(resProtectedResource.headers['content-type'], /application\/json/);
    const resMeta = JSON.parse(resProtectedResource.payload);
    assert.ok(resMeta.resource);
  });

  // ---------------------------------------------------------------------------
  // 8. Human Web Logout Workflow & Session Invalidation
  // ---------------------------------------------------------------------------
  it('17. Authenticated views render secure Sign Out POST form in navbar', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
      cookies: {
        [cookieOpts.name]: rawSessionToken,
        career_hub_session: rawSessionToken,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.payload, /<form action="\/auth\/logout" method="POST"/);
    assert.match(res.payload, /Sign Out<\/button>/);
  });

  it('18. Submitting Sign Out form (POST /auth/logout) clears cookie and redirects to /login', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'text/html,application/xhtml+xml',
      },
      cookies: {
        [cookieOpts.name]: rawSessionToken,
        career_hub_session: rawSessionToken,
      },
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers['location'], '/login');

    // Verify session cookie was cleared
    const setCookie = res.headers['set-cookie'];
    assert.ok(setCookie);
  });

  it('19. Direct navigation to GET /auth/logout safely revokes session and redirects to /login', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/logout',
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers['location'], '/login');
  });
});
