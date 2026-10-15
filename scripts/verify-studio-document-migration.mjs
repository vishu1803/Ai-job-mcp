import assert from 'node:assert/strict';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
const target = new URL(process.env.DATABASE_URL);
assert.equal(process.env.NODE_ENV, 'test');
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55447');
assert.equal(target.pathname, '/product_audit_resume_studio');
const name = 'product_audit_resume_studio_docs_fresh_' + Date.now();
const admin = new pg.Client({ connectionString: target.href });
await admin.connect();
let pool;
try {
  await admin.query('CREATE DATABASE "' + name + '"');
  const isolated = new URL(target);
  isolated.pathname = '/' + name;
  pool = new pg.Pool({ connectionString: isolated.href });
  const database = drizzle(pool);
  await migrate(database, { migrationsFolder: './drizzle' });
  await migrate(database, { migrationsFolder: './drizzle' });
  const result = await pool.query(
    'SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations'
  );
  assert.equal(result.rows[0].count, 25);
  const guards = await pool.query(
    "SELECT count(*)::int AS count FROM pg_trigger WHERE tgname='studio_document_guard'"
  );
  assert.equal(guards.rows[0].count, 1);
  console.log(
    JSON.stringify({
      database: name,
      migrations: 25,
      replay: 'PASS',
      documentGuard: 'PASS',
      retained: true,
    })
  );
} finally {
  await pool?.end();
  await admin.end();
}
