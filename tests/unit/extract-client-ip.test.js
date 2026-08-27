/**
 * @file Regression Tests for Client IP Extraction (P14-003 Security Fix)
 *
 * Verifies that CF-Connecting-IP and X-Forwarded-For cannot be spoofed
 * on non-Cloudflare / direct requests. The client must not be able to
 * choose an arbitrary rate-limit identity by setting these headers directly.
 *
 * Test plan:
 * 1. Direct localhost request with fake CF-Connecting-IP → must use req.ip
 * 2. Direct localhost request with fake X-Forwarded-For → must use req.ip
 * 3. Normal localhost req.ip behavior
 * 4. Both spoofed headers present on direct request → must use req.ip
 * 5. Simulated trusted Cloudflare request (trustProxy=true) → CF-Connecting-IP trusted
 * 6. trustProxy=true without CF-Connecting-IP → X-Forwarded-For used
 * 7. Rate-limit key selection in each case
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { extractClientIp } from '../../src/utils/extract-client-ip.js';

/**
 * Creates a minimal Fastify app that returns the extracted client IP.
 * @param {object} opts
 * @param {boolean|number} [opts.trustProxy]
 */
async function createTestApp(opts = {}) {
  const app = Fastify({
    trustProxy: opts.trustProxy !== undefined ? opts.trustProxy : false,
  });

  app.get('/test-ip', async (req) => {
    return { ip: extractClientIp(req) };
  });

  return app;
}

/** Normalizes IP for comparison (strips IPv6 prefix) */
function normalizeIp(ip) {
  return (ip || '').replace(/^::ffff:/, '');
}

/** Checks if an IP is a loopback address */
function isLoopback(ip) {
  const n = normalizeIp(ip);
  return n === '127.0.0.1' || n === '::1';
}

describe('extractClientIp — Spoofing Prevention (P14-003)', () => {
  // =========================================================================
  // 1. Direct localhost request with fake CF-Connecting-IP
  // =========================================================================

  it('ignores spoofed CF-Connecting-IP on direct (non-proxy) requests', async () => {
    const app = await createTestApp({ trustProxy: false });

    const response = await app.inject({
      method: 'GET',
      url: '/test-ip',
      headers: {
        'cf-connecting-ip': '1.2.3.4', // Spoofed Cloudflare header
      },
    });

    const body = JSON.parse(response.payload);
    // Must NOT be 1.2.3.4 — must be req.ip (loopback)
    assert.notStrictEqual(body.ip, '1.2.3.4');
    assert.ok(isLoopback(body.ip), `Expected loopback IP, got: ${body.ip}`);

    await app.close();
  });

  // =========================================================================
  // 2. Direct localhost request with fake X-Forwarded-For
  // =========================================================================

  it('ignores spoofed X-Forwarded-For on direct (non-proxy) requests', async () => {
    const app = await createTestApp({ trustProxy: false });

    const response = await app.inject({
      method: 'GET',
      url: '/test-ip',
      headers: {
        'x-forwarded-for': '10.0.0.99, 192.168.1.1', // Spoofed proxy header
      },
    });

    const body = JSON.parse(response.payload);
    // Must NOT be 10.0.0.99 — must be req.ip (loopback)
    assert.notStrictEqual(body.ip, '10.0.0.99');
    assert.ok(isLoopback(body.ip), `Expected loopback IP, got: ${body.ip}`);

    await app.close();
  });

  // =========================================================================
  // 3. Normal localhost req.ip behavior
  // =========================================================================

  it('returns req.ip when no proxy headers are present', async () => {
    const app = await createTestApp({ trustProxy: false });

    const response = await app.inject({
      method: 'GET',
      url: '/test-ip',
    });

    const body = JSON.parse(response.payload);
    assert.ok(isLoopback(body.ip), `Expected loopback IP, got: ${body.ip}`);

    await app.close();
  });

  // =========================================================================
  // 4. Both spoofed headers present on direct request
  // =========================================================================

  it('returns req.ip when both spoofed headers are present (trustProxy=false)', async () => {
    const app = await createTestApp({ trustProxy: false });

    const response = await app.inject({
      method: 'GET',
      url: '/test-ip',
      headers: {
        'cf-connecting-ip': 'evil.attacker.com',
        'x-forwarded-for': '10.0.0.1',
      },
    });

    const body = JSON.parse(response.payload);
    // Both spoofed headers must be ignored
    assert.notStrictEqual(body.ip, 'evil.attacker.com');
    assert.notStrictEqual(body.ip, '10.0.0.1');
    assert.ok(isLoopback(body.ip), `Expected loopback IP, got: ${body.ip}`);

    await app.close();
  });

  // =========================================================================
  // 5. Simulated trusted Cloudflare request (trustProxy=true)
  // =========================================================================

  it('trusts CF-Connecting-IP when trustProxy=true (behind Cloudflare)', async () => {
    const app = await createTestApp({ trustProxy: true });

    const response = await app.inject({
      method: 'GET',
      url: '/test-ip',
      headers: {
        'cf-connecting-ip': '203.0.113.50',
        'x-forwarded-for': '203.0.113.50, 10.0.0.1',
      },
    });

    const body = JSON.parse(response.payload);
    // CF-Connecting-IP takes precedence when behind proxy
    assert.strictEqual(body.ip, '203.0.113.50');

    await app.close();
  });

  it('trusts X-Forwarded-For when trustProxy=true and no CF-Connecting-IP', async () => {
    const app = await createTestApp({ trustProxy: true });

    const response = await app.inject({
      method: 'GET',
      url: '/test-ip',
      headers: {
        'x-forwarded-for': '203.0.113.99, 10.0.0.1',
      },
    });

    const body = JSON.parse(response.payload);
    // Fastify's req.ip returns the leftmost X-Forwarded-For IP
    assert.strictEqual(body.ip, '203.0.113.99');

    await app.close();
  });

  it('returns loopback when trustProxy=true but no proxy headers', async () => {
    const app = await createTestApp({ trustProxy: true });

    const response = await app.inject({
      method: 'GET',
      url: '/test-ip',
      // No proxy headers — req.ip = socket remote = 127.0.0.1
    });

    const body = JSON.parse(response.payload);
    assert.ok(isLoopback(body.ip), `Expected loopback IP, got: ${body.ip}`);

    await app.close();
  });

  // =========================================================================
  // 6. Rate-limit key selection
  // =========================================================================

  it('rate-limit key uses req.ip (not spoofed header) on direct request', async () => {
    const app = await createTestApp({ trustProxy: false });

    const response = await app.inject({
      method: 'GET',
      url: '/test-ip',
      headers: {
        'cf-connecting-ip': 'attacker-controlled-ip',
        'x-forwarded-for': 'another-attacker-ip',
      },
    });

    const body = JSON.parse(response.payload);
    const rateLimitKey = `ip:${body.ip}`;

    // The rate-limit key must NOT contain attacker-controlled values
    assert.ok(!rateLimitKey.includes('attacker-controlled-ip'));
    assert.ok(!rateLimitKey.includes('another-attacker-ip'));
    // Must contain a loopback address
    assert.ok(
      rateLimitKey.includes('127.0.0.1') || rateLimitKey.includes('::1'),
      `Expected loopback in rate-limit key: ${rateLimitKey}`
    );

    await app.close();
  });

  it('rate-limit key uses CF-Connecting-IP on trusted proxy request', async () => {
    const app = await createTestApp({ trustProxy: true });

    const response = await app.inject({
      method: 'GET',
      url: '/test-ip',
      headers: {
        'cf-connecting-ip': '203.0.113.50',
        'x-forwarded-for': '203.0.113.50, 10.0.0.1',
      },
    });

    const body = JSON.parse(response.payload);
    const rateLimitKey = `ip:${body.ip}`;

    // The rate-limit key must contain the real Cloudflare client IP
    assert.strictEqual(rateLimitKey, 'ip:203.0.113.50');

    await app.close();
  });

  it('rate-limit key uses X-Forwarded-For when no CF-Connecting-IP (trustProxy=true)', async () => {
    const app = await createTestApp({ trustProxy: true });

    const response = await app.inject({
      method: 'GET',
      url: '/test-ip',
      headers: {
        'x-forwarded-for': '203.0.113.99, 10.0.0.1',
      },
    });

    const body = JSON.parse(response.payload);
    const rateLimitKey = `ip:${body.ip}`;

    // The rate-limit key must contain the original client IP from X-Forwarded-For
    assert.strictEqual(rateLimitKey, 'ip:203.0.113.99');

    await app.close();
  });
});
