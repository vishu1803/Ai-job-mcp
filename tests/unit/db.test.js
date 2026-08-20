import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSanitizedDbUrl,
  getPoolConfig,
  createPool,
  createDb,
  checkDatabaseHealth,
  closeDatabase,
  pool,
  db,
} from '../../src/db/index.js';
import { schema } from '../../src/db/schema.js';
import drizzleConfig from '../../drizzle.config.js';
import { config } from '../../src/config/env.js';

describe('PostgreSQL & Drizzle Foundation (P1-003)', () => {
  after(async () => {
    await closeDatabase(pool);
  });
  test('1. Environment configuration parses and validates database parameters', () => {
    assert.ok(config.DATABASE_URL);
    assert.equal(typeof config.DATABASE_POOL_MIN, 'number');
    assert.equal(typeof config.DATABASE_POOL_MAX, 'number');
    assert.equal(typeof config.DATABASE_SSL, 'boolean');
    assert.equal(typeof config.DATABASE_STATEMENT_TIMEOUT_MS, 'number');
    assert.ok(config.DATABASE_POOL_MAX >= config.DATABASE_POOL_MIN);
  });

  test('2. parseSanitizedDbUrl safely extracts metadata without leaking credentials', () => {
    const sanitized = parseSanitizedDbUrl(
      'postgres://secret_user:super_secret_password_123@db.prod.internal:5433/career_production'
    );

    assert.equal(sanitized.protocol, 'postgres');
    assert.equal(sanitized.host, 'db.prod.internal');
    assert.equal(sanitized.port, 5433);
    assert.equal(sanitized.database, 'career_production');
    assert.equal(sanitized.user, 'secret_user');
    // Ensure password is not present in returned object
    assert.equal(/** @type {any} */ (sanitized).password, undefined);

    const json = JSON.stringify(sanitized);
    assert.equal(json.includes('super_secret_password_123'), false);
  });

  test('3. parseSanitizedDbUrl handles malformed URLs gracefully', () => {
    const sanitized = parseSanitizedDbUrl('not-a-valid-url');
    assert.equal(sanitized.host, 'unknown');
    assert.equal(sanitized.port, 5432);
    assert.equal(sanitized.database, 'unknown');
  });

  test('4. getPoolConfig generates valid pg Pool options matching environment', () => {
    const poolConfig = getPoolConfig();
    assert.equal(poolConfig.connectionString, config.DATABASE_URL);
    assert.equal(poolConfig.min, config.DATABASE_POOL_MIN);
    assert.equal(poolConfig.max, config.DATABASE_POOL_MAX);
    assert.equal(poolConfig.statement_timeout, config.DATABASE_STATEMENT_TIMEOUT_MS);
    assert.equal(poolConfig.idleTimeoutMillis, 30000);
    assert.equal(poolConfig.connectionTimeoutMillis, 10000);

    const overridden = getPoolConfig({ max: 25, statement_timeout: 5000 });
    assert.equal(overridden.max, 25);
    assert.equal(overridden.statement_timeout, 5000);
  });

  test('5. Database module exports singleton pool and drizzle instances', () => {
    assert.ok(pool);
    assert.ok(db);
    assert.equal(typeof pool.query, 'function');
    assert.equal(typeof db.select, 'function');
    assert.equal(typeof schema, 'object');
  });

  test('6. createPool and createDb factory functions instantiate decoupled instances', () => {
    const customPool = createPool({ max: 5 });
    assert.ok(customPool);
    assert.equal(typeof customPool.query, 'function');

    const customDb = createDb(customPool, schema);
    assert.ok(customDb);
    assert.equal(typeof customDb.select, 'function');

    // Clean up custom pool
    customPool.end();
  });

  test('7. checkDatabaseHealth returns healthy status on successful query probe', async () => {
    const mockPool = {
      async query(sql) {
        assert.equal(sql, 'SELECT 1 AS alive');
        return { rows: [{ alive: 1 }] };
      },
    };

    const health = await checkDatabaseHealth(/** @type {any} */ (mockPool));
    assert.equal(health.status, 'healthy');
    assert.equal(typeof health.latencyMs, 'number');
    assert.ok(health.timestamp);
    assert.equal(health.error, undefined);
  });

  test('8. checkDatabaseHealth returns unhealthy status on unexpected query output', async () => {
    const mockPool = {
      async query() {
        return { rows: [{ alive: 0 }] };
      },
    };

    const health = await checkDatabaseHealth(/** @type {any} */ (mockPool));
    assert.equal(health.status, 'unhealthy');
    assert.equal(typeof health.latencyMs, 'number');
    assert.ok(health.error);
    assert.equal(health.error, 'Unexpected query response from database');
  });

  test('9. checkDatabaseHealth catches query errors and returns safe unhealthy payload without credential leakage', async () => {
    const mockPool = {
      async query() {
        const err = new Error('getaddrinfo ENOTFOUND fake-pg-host');
        /** @type {any} */ (err).password = 'leaked_db_password';
        throw err;
      },
    };

    const health = await checkDatabaseHealth(/** @type {any} */ (mockPool));
    assert.equal(health.status, 'unhealthy');
    assert.equal(typeof health.latencyMs, 'number');
    assert.ok(health.error);
    assert.ok(health.error.includes('ENOTFOUND'));
    assert.equal(health.error.includes('leaked_db_password'), false);
  });

  test('10. closeDatabase drains connection pool cleanly', async () => {
    let ended = false;
    const mockPool = {
      async end() {
        ended = true;
      },
    };

    await closeDatabase(/** @type {any} */ (mockPool));
    assert.equal(ended, true);
  });

  test('11. Drizzle Kit configuration is valid and structured for PostgreSQL dialect', () => {
    assert.ok(drizzleConfig);
    assert.equal(drizzleConfig.dialect, 'postgresql');
    assert.equal(drizzleConfig.schema, './src/db/schema.js');
    assert.equal(drizzleConfig.out, './drizzle');
    assert.ok(drizzleConfig.dbCredentials);
    assert.equal(drizzleConfig.dbCredentials.url, config.DATABASE_URL);
  });
});
