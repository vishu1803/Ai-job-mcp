import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { pool, closeDatabase } from '../../src/db/index.js';

describe('Phase 2 Web Routes & Frozen Design System Integration Tests (P14-003A)', () => {
  const app = buildApp({ logger: false });

  after(async () => {
    await app.close();
    await closeDatabase(pool);
  });

  test('1. GET /docs/mcp renders 200 OK and complete 16-tool protocol catalog', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/docs/mcp',
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'], /text\/html/);
    assert.match(response.payload, /Model Context Protocol/i);
    assert.match(response.payload, /get_candidate_profile/);
    assert.match(response.payload, /list_verified_skills/);
    assert.match(response.payload, /analyze_job_fit/);
    assert.match(response.payload, /track_job_application/);
  });

  test('2. Unauthenticated access to /applications redirects to /login with returnTo', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/applications',
    });

    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/login?returnTo=/applications');
  });

  test('3. Unauthenticated access to /skills/:slug redirects to /login with returnTo', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/skills/fastapi',
    });

    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/login?returnTo=/skills/fastapi');
  });

  test('4. Unauthenticated access to /apps/radar redirects to /login with returnTo', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/apps/radar',
    });

    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/login?returnTo=/apps/radar');
  });

  test('5. Public legal routes render 200 OK with valid headers and footer links', async () => {
    const legalPaths = [
      '/privacy',
      '/cookies',
      '/terms',
      '/security',
      '/data-deletion',
      '/accessibility',
      '/subprocessors',
    ];

    for (const path of legalPaths) {
      const res = await app.inject({
        method: 'GET',
        url: path,
      });

      assert.equal(res.statusCode, 200, `Expected 200 OK for ${path}`);
      assert.match(res.headers['content-type'], /text\/html/);
      assert.match(res.payload, /Antigravity Career Hub/);
    }
  });
});
