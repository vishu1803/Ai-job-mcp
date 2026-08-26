import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { pool, closeDatabase } from '../../src/db/index.js';

describe('Fastify Application & Health Endpoints (P1-005)', () => {
  const app = buildApp({ logger: false });

  after(async () => {
    await app.close();
    await closeDatabase(pool);
  });

  test('1. GET /livez returns 200 OK without requiring database', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/livez',
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'antigravity-career-hub');
    assert.ok(typeof body.uptime === 'number');
    assert.ok(body.timestamp);
    assert.equal(response.headers['cache-control'], 'no-store, no-cache, must-revalidate');
  });

  test('2. GET /healthz reports database dependency health status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    // When connected to live Supabase DB, status is 200 healthy
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.status, 'healthy');
    assert.equal(body.service, 'antigravity-career-hub');
    assert.ok(body.dependencies);
    assert.equal(body.dependencies.database.status, 'healthy');
    assert.ok(typeof body.dependencies.database.latencyMs === 'number');
    assert.equal(response.headers['cache-control'], 'no-store, no-cache, must-revalidate');
  });

  test('3. GET / returns 200 OK and rendered landing page or JSON status via content negotiation', async () => {
    // Default browser navigation returns HTML
    const htmlRes = await app.inject({
      method: 'GET',
      url: '/',
    });
    assert.equal(htmlRes.statusCode, 200);
    assert.match(htmlRes.headers['content-type'], /text\/html/);
    assert.match(htmlRes.payload, /The Evidence-Backed AI Career Platform/);

    // Explicit Accept: application/json returns operational JSON status
    const jsonRes = await app.inject({
      method: 'GET',
      url: '/',
      headers: {
        accept: 'application/json',
      },
    });
    assert.equal(jsonRes.statusCode, 200);
    assert.match(jsonRes.headers['content-type'], /application\/json/);
    const body = JSON.parse(jsonRes.payload);
    assert.equal(body.status, 'operational');
    assert.equal(body.version, '0.1.0');
    assert.equal(body.mcpEndpoint, '/mcp');
  });

  test('4. GET /non-existent-route returns standard 404 NOT_FOUND envelope with request ID', async () => {
    const customReqId = 'custom-correlation-id-999';
    const response = await app.inject({
      method: 'GET',
      url: '/non-existent-route',
      headers: {
        'x-request-id': customReqId,
      },
    });

    assert.equal(response.statusCode, 404);
    const body = JSON.parse(response.payload);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.equal(body.error.requestId, customReqId);
  });

  test('5. Request ID correlation generates UUID when client provides none', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/livez',
    });

    assert.ok(response.headers['x-request-id']);
    assert.ok(response.headers['x-request-id'].length >= 32);
  });
});
