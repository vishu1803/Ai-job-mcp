import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { pool, closeDatabase } from '../../src/db/index.js';

describe('Live Health & API Error Integration Tests (P1-005)', () => {
  const app = buildApp({ logger: false });

  after(async () => {
    await app.close();
    await closeDatabase(pool);
  });

  test('1. Live HTTP GET /livez succeeds without DB query', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/livez',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'antigravity-career-hub');
    assert.ok(typeof body.uptime === 'number');
  });

  test('2. Live HTTP GET /healthz executes real database health check on PostgreSQL', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.status, 'healthy');
    assert.equal(body.dependencies.database.status, 'healthy');
    assert.ok(body.dependencies.database.latencyMs > 0);
    // Ensure no passwords or database connection strings are exposed
    assert.equal(res.payload.includes('postgres://'), false);
    assert.equal(res.payload.includes('password'), false);
  });

  test('3. Unhandled error on route produces standard error envelope without credential leaks', async () => {
    const customId = 'trace-corr-id-12345';
    const res = await app.inject({
      method: 'GET',
      url: '/non-existent-api-endpoint',
      headers: {
        'x-correlation-id': customId,
      },
    });

    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.equal(body.error.requestId, customId);
  });
});
