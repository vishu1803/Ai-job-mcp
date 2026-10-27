/**
 * Safe, read-only database connectivity and health diagnostic probe.
 * Validates connection pool, query response latency, schema table counts, and migration status.
 * Never outputs credentials or alters database state.
 */
import { pool, checkDatabaseHealth, parseSanitizedDbUrl, closeDatabase } from '../src/db/index.js';

async function runCheck() {
  const sanitized = parseSanitizedDbUrl();
  console.log(
    `[DB Check] Target: ${sanitized.protocol}://${sanitized.user}@${sanitized.host}:${sanitized.port}/${sanitized.database} (SSL: ${sanitized.ssl})`
  );

  const health = await checkDatabaseHealth();
  if (health.status !== 'healthy') {
    console.error(
      `[DB Check] FAILED: Health probe returned status '${health.status}'. Error: ${health.error}`
    );
    await closeDatabase().catch(() => {});
    process.exit(1);
  }

  console.log(`[DB Check] Health Probe: HEALTHY (Latency: ${health.latencyMs}ms)`);

  const client = await pool.connect();
  try {
    const versionRes = await client.query('SELECT version()');
    console.log(`[DB Check] Engine: ${versionRes.rows[0].version}`);

    const connRes = await client.query(
      'SELECT current_database(), current_user, inet_server_addr(), inet_server_port()'
    );
    console.log(
      `[DB Check] Session: DB=${connRes.rows[0].current_database}, User=${connRes.rows[0].current_user}, Host=${connRes.rows[0].inet_server_addr || 'loopback'}, Port=${connRes.rows[0].inet_server_port || sanitized.port}`
    );

    const tablesRes = await client.query(`
      SELECT count(*)::int as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log(`[DB Check] Public Schema Tables: ${tablesRes.rows[0].count}`);

    try {
      const migRes = await client.query(
        'SELECT count(*)::int as count FROM drizzle.__drizzle_migrations'
      );
      console.log(`[DB Check] Applied Drizzle Migrations: ${migRes.rows[0].count}`);
    } catch {
      console.log(
        `[DB Check] Drizzle migrations table not found or not initialized in drizzle schema.`
      );
    }

    const countsRes = await client.query(`
      SELECT 
        (SELECT count(*) FROM users)::int as users,
        (SELECT count(*) FROM candidates)::int as candidates,
        (SELECT count(*) FROM skills)::int as skills,
        (SELECT count(*) FROM projects)::int as projects,
        (SELECT count(*) FROM evidence_items)::int as evidence,
        (SELECT count(*) FROM job_applications)::int as applications
    `);
    console.log(`[DB Check] Seeded Records: ${JSON.stringify(countsRes.rows[0])}`);
    console.log('[DB Check] Result: SUCCESS — Database connection verified.');
  } finally {
    client.release();
    await closeDatabase();
  }
}

runCheck().catch((err) => {
  console.error('[DB Check] Unhandled exception:', err.message);
  process.exit(1);
});
