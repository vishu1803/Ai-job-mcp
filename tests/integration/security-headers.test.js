/**
 * @file Security Headers Integration Tests.
 *
 * Verifies that the centralized HTTP security headers policy is applied
 * across application endpoints:
 * 1. X-Content-Type-Options: nosniff
 * 2. Referrer-Policy: strict-origin-when-cross-origin
 * 3. Permissions-Policy: camera=(), microphone=(), geolocation=()
 * 4. Cross-Origin-Opener-Policy: same-origin
 * 5. Content-Security-Policy: frame-ancestors, script-src, style-src
 * 6. X-Frame-Options: SAMEORIGIN
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { closeDatabase } from '../../src/db/index.js';

describe('Centralized HTTP Security Headers Policy', () => {
  let app;

  before(async () => {
    app = buildApp();
    await app.ready();
  });

  after(async () => {
    await app.close();
    await closeDatabase();
  });

  it('1. Returns X-Content-Type-Options: nosniff across public endpoints', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/livez',
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  it('2. Returns Referrer-Policy: strict-origin-when-cross-origin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/livez',
    });
    assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  });

  it('3. Returns Permissions-Policy disabling unused sensitive device APIs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/livez',
    });
    assert.ok(res.headers['permissions-policy']);
    assert.ok(res.headers['permissions-policy'].includes('camera=()'));
    assert.ok(res.headers['permissions-policy'].includes('microphone=()'));
    assert.ok(res.headers['permissions-policy'].includes('geolocation=()'));
  });

  it('4. Returns Cross-Origin-Opener-Policy: same-origin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/livez',
    });
    assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin');
  });

  it('5. Returns Content-Security-Policy with frame-ancestors allowlisting MCP clients', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/docs/mcp',
    });
    const csp = res.headers['content-security-policy'];
    assert.ok(csp, 'CSP header should be present');
    assert.ok(csp.includes("default-src 'self'"), 'default-src self should be present');
    assert.ok(csp.includes('frame-ancestors'), 'frame-ancestors directive should be present');
    assert.ok(csp.includes('https://claude.ai'), 'Claude origin allowed in frame-ancestors');
    assert.ok(csp.includes('https://chatgpt.com'), 'ChatGPT origin allowed in frame-ancestors');
  });

  it('6. Returns X-Frame-Options: SAMEORIGIN', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/docs/mcp',
    });
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
  });
});
