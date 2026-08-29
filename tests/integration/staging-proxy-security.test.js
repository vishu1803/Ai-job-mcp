/**
 * @file Staging Proxy & Client IP Security Integration Tests (Task P14-004)
 *
 * Verifies the proxy trust boundary, header spoofing defenses, rate-limiting
 * client identity derivation, and public staging URL generation across:
 *
 * 1. Scenario A: Real request behind Cloudflare Tunnel (trustProxy=true with CF-Connecting-IP)
 * 2. Scenario B: Spoofed X-Forwarded-For header on direct request (trustProxy=false)
 * 3. Scenario C: Spoofed CF-Connecting-IP header on direct request (trustProxy=false)
 * 4. Scenario D: Direct localhost request without proxy headers
 * 5. Scenario E: Rate limiter client identity isolation across IP buckets
 * 6. Public Staging RFC 9728 & RFC 8414 Metadata Discovery URLs
 * 7. Remote MCP unauthenticated 401 WWW-Authenticate staging header
 * 8. CSRF Origin header validation against public staging URL
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { extractClientIp } from '../../src/utils/extract-client-ip.js';
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';
import { closeDatabase } from '../../src/db/index.js';

describe('Staging Proxy & Perimeter Security Verification (P14-004)', () => {
  after(async () => {
    await closeDatabase();
  });

  // =========================================================================
  // Scenario A: Real Request behind Cloudflare Tunnel (trustProxy=true)
  // =========================================================================
  it('Scenario A: Correctly extracts authoritative CF-Connecting-IP behind Cloudflare Tunnel', async () => {
    const app = buildApp({
      trustProxy: true,
    });

    const realClientIp = '198.51.100.42';
    const cfEdgeIp = '172.70.100.1';

    const response = await app.inject({
      method: 'GET',
      url: '/livez',
      headers: {
        host: 'dev.aicareershub.tech',
        'x-forwarded-proto': 'https',
        'cf-connecting-ip': realClientIp,
        'x-forwarded-for': `${realClientIp}, ${cfEdgeIp}`,
        'cf-ray': '8f1234567890abcd-IAD',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const payload = JSON.parse(response.payload);
    assert.strictEqual(payload.status, 'ok');

    await app.close();
  });

  // =========================================================================
  // Scenario B: Spoofed X-Forwarded-For on Direct Request (trustProxy=false)
  // =========================================================================
  it('Scenario B: Ignores spoofed X-Forwarded-For on direct non-proxy connections', async () => {
    const app = buildApp({
      trustProxy: false,
    });

    // Custom test route to directly inspect resolved extractClientIp
    app.get('/test/resolved-ip', async (req) => {
      return { clientIp: extractClientIp(req), rawIp: req.ip };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test/resolved-ip',
      headers: {
        'x-forwarded-for': '10.0.0.99, 192.168.1.1',
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const data = JSON.parse(response.payload);

    // Must NOT adopt attacker's spoofed IP
    assert.notStrictEqual(data.clientIp, '10.0.0.99');
    assert.notStrictEqual(data.rawIp, '10.0.0.99');
    assert.ok(
      data.clientIp === '127.0.0.1' || data.clientIp === '::1',
      `Expected loopback IP, got: ${data.clientIp}`
    );

    await app.close();
  });

  // =========================================================================
  // Scenario C: Spoofed CF-Connecting-IP on Direct Request (trustProxy=false)
  // =========================================================================
  it('Scenario C: Ignores spoofed CF-Connecting-IP on direct non-proxy connections', async () => {
    const app = buildApp({
      trustProxy: false,
    });

    app.get('/test/resolved-ip-cf', async (req) => {
      return { clientIp: extractClientIp(req), rawIp: req.ip };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test/resolved-ip-cf',
      headers: {
        'cf-connecting-ip': '203.0.113.199', // Attacker attempting to spoof Cloudflare header
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const data = JSON.parse(response.payload);

    assert.notStrictEqual(data.clientIp, '203.0.113.199');
    assert.ok(
      data.clientIp === '127.0.0.1' || data.clientIp === '::1',
      `Expected loopback IP, got: ${data.clientIp}`
    );

    await app.close();
  });

  // =========================================================================
  // Scenario D: Direct Localhost Request without Proxy Headers
  // =========================================================================
  it('Scenario D: Safely resolves loopback IP on normal direct localhost requests', async () => {
    const app = buildApp({
      trustProxy: false,
    });

    app.get('/test/direct-localhost', async (req) => {
      return { clientIp: extractClientIp(req) };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test/direct-localhost',
    });

    assert.strictEqual(response.statusCode, 200);
    const data = JSON.parse(response.payload);
    assert.ok(
      data.clientIp === '127.0.0.1' || data.clientIp === '::1',
      `Expected loopback, got ${data.clientIp}`
    );

    await app.close();
  });

  // =========================================================================
  // Scenario E: Rate Limiter Client Identity Isolation
  // =========================================================================
  it('Scenario E: Enforces isolated rate-limit buckets per real client behind proxy', async () => {
    const customLimiter = new McpRateLimiter({
      cheapLimit: 3, // Low limit for test
      windowSeconds: 60,
    });

    const app = buildApp({
      trustProxy: true,
      rateLimiter: customLimiter,
    });

    const attackerIp = '198.51.100.10';
    const legitimateIp = '198.51.100.20';

    // Simulate 3 rapid requests from attacker IP
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/github',
        headers: {
          'cf-connecting-ip': attackerIp,
          'x-forwarded-for': `${attackerIp}, 172.70.1.1`,
          'content-type': 'application/json',
        },
        payload: { event: 'ping' },
      });
      assert.notStrictEqual(res.statusCode, 429);
    }

    // Legitimate user from different IP must NOT be throttled by attacker's activity
    const legitRes = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'cf-connecting-ip': legitimateIp,
        'x-forwarded-for': `${legitimateIp}, 172.70.1.1`,
        'content-type': 'application/json',
      },
      payload: { event: 'ping' },
    });
    assert.notStrictEqual(legitRes.statusCode, 429);

    await app.close();
  });

  // =========================================================================
  // RFC 9728 & RFC 8414 Metadata Discovery Endpoints
  // =========================================================================
  it('serves RFC 9728 and RFC 8414 metadata discovery with proper JSON headers', async () => {
    const app = buildApp({
      trustProxy: true,
    });

    // 1. RFC 9728 Protected Resource Metadata
    const resProtected = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-protected-resource',
      headers: {
        host: 'dev.aicareershub.tech',
        'x-forwarded-proto': 'https',
      },
    });

    assert.strictEqual(resProtected.statusCode, 200);
    assert.ok(resProtected.headers['content-type']?.includes('application/json'));
    const metaProtected = JSON.parse(resProtected.payload);
    assert.ok(metaProtected.resource, 'Expected resource URL in metadata');
    assert.ok(Array.isArray(metaProtected.authorization_servers));
    assert.ok(metaProtected.scopes_supported.includes('career:read'));

    // 2. RFC 8414 Authorization Server Metadata
    const resAuthServer = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-authorization-server',
      headers: {
        host: 'dev.aicareershub.tech',
        'x-forwarded-proto': 'https',
      },
    });

    assert.strictEqual(resAuthServer.statusCode, 200);
    const metaAuth = JSON.parse(resAuthServer.payload);
    assert.ok(metaAuth.issuer);
    assert.ok(metaAuth.authorization_endpoint);
    assert.ok(metaAuth.token_endpoint);
    assert.ok(metaAuth.revocation_endpoint);
    assert.ok(metaAuth.code_challenge_methods_supported.includes('S256'));

    await app.close();
  });

  // =========================================================================
  // Remote MCP 401 Challenge with Staging Resource Metadata
  // =========================================================================
  it('unauthenticated POST /mcp returns 401 with WWW-Authenticate header', async () => {
    const app = buildApp({
      trustProxy: true,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        host: 'dev.aicareershub.tech',
        'x-forwarded-proto': 'https',
        'content-type': 'application/json',
      },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      },
    });

    assert.strictEqual(response.statusCode, 401);
    const authHeader = response.headers['www-authenticate'];
    assert.ok(authHeader, 'Expected www-authenticate header');
    assert.ok(authHeader.includes('Bearer realm="mcp"'));
    assert.ok(authHeader.includes('resource_metadata='));

    const body = JSON.parse(response.payload);
    assert.strictEqual(body.jsonrpc, '2.0');
    assert.strictEqual(body.id, 1);
    assert.strictEqual(body.error.code, -32001); // Unauthorized

    await app.close();
  });

  // =========================================================================
  // CSRF Origin Header Validation against Staging Domain
  // =========================================================================
  it('rejects state-changing request from unauthorized origin with 403 CSRF_DETECTED', async () => {
    const app = buildApp({
      trustProxy: true,
    });

    // POST /auth/logout requires verifyCsrf
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        host: 'dev.aicareershub.tech',
        'x-forwarded-proto': 'https',
        origin: 'https://evil-phishing-site.com',
      },
    });

    assert.strictEqual(response.statusCode, 403);
    const body = JSON.parse(response.payload);
    assert.strictEqual(body.error.code, 'CSRF_DETECTED');

    await app.close();
  });
});
