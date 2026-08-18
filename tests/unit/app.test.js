import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';

describe('Fastify Application Foundation', () => {
  const app = buildApp({ logger: false });

  after(async () => {
    await app.close();
  });

  test('GET /healthz returns 200 OK and valid status envelope', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'antigravity-career-hub');
    assert.ok(body.timestamp);
  });

  test('GET / returns 200 OK and root platform status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/',
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.status, 'operational');
    assert.equal(body.version, '0.1.0');
    assert.equal(body.mcpEndpoint, '/mcp');
  });

  test('GET /non-existent-route returns 404 Not Found', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/non-existent-route',
    });

    assert.equal(response.statusCode, 404);
  });
});
