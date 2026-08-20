import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import {
  pool,
  db,
  checkDatabaseHealth,
  closeDatabase,
  parseSanitizedDbUrl,
} from '../../src/db/index.js';
import { runMigrations } from '../../src/db/migrate.js';
import { config } from '../../src/config/env.js';

describe('PostgreSQL & Supabase Live Integration Tests', () => {
  after(async () => {
    await closeDatabase(pool);
  });

  test('1. Sanitized database metadata identifies host safely without credential leakage', () => {
    const sanitized = parseSanitizedDbUrl(config.DATABASE_URL);
    assert.ok(sanitized.host);
    assert.ok(sanitized.port);
    assert.ok(sanitized.database);
    assert.equal(/** @type {any} */ (sanitized).password, undefined);

    const serialized = JSON.stringify(sanitized);
    assert.equal(serialized.includes('password'), false);
  });

  test('2. Live database health probe executes SELECT 1 and returns healthy status', async () => {
    const health = await checkDatabaseHealth(pool);
    assert.equal(health.status, 'healthy');
    assert.ok(health.latencyMs > 0);
    assert.ok(health.timestamp);
    assert.equal(health.error, undefined);
  });

  test('3. Drizzle ORM executes SQL template queries against live database', async () => {
    const result = await db.execute(
      sql`SELECT 1 AS alive, current_database() AS db_name, version() AS db_version`
    );
    assert.ok(result);
    assert.ok(result.rows);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].alive, 1);
    assert.ok(result.rows[0].db_name);
    assert.ok(typeof result.rows[0].db_version === 'string');
    assert.ok(result.rows[0].db_version.includes('PostgreSQL'));
  });

  test('4. Live transaction and temporary DDL/DML execution operates cleanly with zero residual tables', async () => {
    await db.transaction(async (tx) => {
      // 1. Create temporary verification table
      await tx.execute(sql`
        CREATE TABLE IF NOT EXISTS _test_infra_probe (
          id SERIAL PRIMARY KEY,
          probe_name VARCHAR(50) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 2. Insert test probe row
      await tx.execute(sql`
        INSERT INTO _test_infra_probe (probe_name)
        VALUES ('supabase_integration_test');
      `);

      // 3. Query probe row
      const selectResult = await tx.execute(sql`
        SELECT probe_name FROM _test_infra_probe WHERE probe_name = 'supabase_integration_test';
      `);
      assert.equal(selectResult.rows.length, 1);
      assert.equal(selectResult.rows[0].probe_name, 'supabase_integration_test');

      // 4. Drop temporary verification table before transaction ends
      await tx.execute(sql`DROP TABLE _test_infra_probe;`);
    });

    // 5. Verify no residual tables exist in public schema
    const checkResult = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = '_test_infra_probe';
    `);
    assert.equal(checkResult.rows.length, 0);
  });

  test('5. Programmatic migration runner executes against live database schema', async () => {
    await assert.doesNotReject(async () => {
      await runMigrations({ migrationsFolder: './drizzle' });
    });
  });
});
