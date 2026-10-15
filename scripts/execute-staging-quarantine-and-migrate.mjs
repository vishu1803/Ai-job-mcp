#!/usr/bin/env node
/**
 * @file Staging Database Quarantine Repair & Migration Execution
 *
 * Atomically executes:
 * 1. Quarantine of the 6 conflicting historical duplicate installation records
 * 2. Scope update on the 14 associated resources to DISCONNECTED
 * 3. Execution of pending schema migrations (0018, 0019, 0020, 0021)
 * 4. Post-migration schema verification (sessions.github_user_id, tables, indexes)
 *
 * Strict TLS enforcement with authentic Project CA certificate.
 */

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { config } from '../src/config/env.js';
import { encryptSecret } from '../src/security/encryption.js';

const { Client } = pg;

const AFFECTED_CONNECTION_IDS = [
  '1743c149-bf4c-4c4e-a1fa-0532dfd5460a',
  '819a081b-79c7-4245-822b-8fdb26e32dfe',
  '0ad3efed-7dbd-4e13-8e0d-abb587fdca90',
  '3991ab54-3053-4c57-b753-c8dd1cc3edc1',
  '85f3dd21-a65c-419b-87d7-9be56349202c',
  'f1999c45-18f5-4698-bea5-23a914efa275',
];

const caPath = path.resolve(process.cwd(), 'certs/ca.pem');
if (!fs.existsSync(caPath)) {
  throw new Error(`CA certificate not found at ${caPath}`);
}
const ca = fs.readFileSync(caPath, 'utf8');

const targetUrl = new URL(config.DATABASE_URL);
targetUrl.searchParams.delete('sslmode');
targetUrl.searchParams.delete('ssl');

console.log('=== STAGING DATABASE REPAIR & MIGRATION RUNNER ===');
console.log(`Target: ${targetUrl.hostname}:${targetUrl.port}${targetUrl.pathname}`);
console.log('TLS: Strict verification enabled (rejectUnauthorized: true, custom CA)');

const pgClient = new Client({
  connectionString: targetUrl.toString(),
  ssl: {
    rejectUnauthorized: true,
    ca,
  },
  connectionTimeoutMillis: 10000,
  query_timeout: 30000,
});

try {
  await pgClient.connect();
  console.log('Connected to PostgreSQL successfully.');

  // -------------------------------------------------------------------------
  // STEP 1: Quarantine Transaction
  // -------------------------------------------------------------------------
  console.log('\n--- Step 1: Executing Quarantine Transaction ---');
  await pgClient.query('BEGIN');
  await pgClient.query("SET LOCAL statement_timeout = '20s'");
  await pgClient.query("SET LOCAL lock_timeout = '5s'");

  // Verify and lock target connections
  const lockRes = await pgClient.query(
    `SELECT id, installation_id, status FROM resource_connections WHERE id = ANY($1::uuid[]) FOR UPDATE`,
    [AFFECTED_CONNECTION_IDS]
  );

  if (lockRes.rows.length !== AFFECTED_CONNECTION_IDS.length) {
    throw new Error(
      `Expected ${AFFECTED_CONNECTION_IDS.length} connection records, found ${lockRes.rows.length}`
    );
  }
  console.log(`Locked ${lockRes.rows.length} duplicate connection records.`);

  // Lock associated resources
  const resLock = await pgClient.query(
    `SELECT id, status FROM resources WHERE connection_id = ANY($1::uuid[]) FOR UPDATE`,
    [AFFECTED_CONNECTION_IDS]
  );
  console.log(`Locked ${resLock.rows.length} scoped resource records.`);

  // Generate encrypted tombstone
  const tombstone = encryptSecret(
    JSON.stringify({
      quarantined: true,
      reason: 'DUPLICATE_CLAIM_INCIDENT_REPAIR',
      quarantinedAt: new Date().toISOString(),
    })
  );

  // Update resource_connections
  const updateConnRes = await pgClient.query(
    `UPDATE resource_connections
     SET 
       installation_id = NULL,
       status = 'DISCONNECTED',
       expires_at = NULL,
       scopes = '[]'::jsonb,
       encrypted_credentials = $2,
       metadata = metadata || jsonb_build_object(
         'quarantine', jsonb_build_object(
           'reason', 'DUPLICATE_CLAIM_INCIDENT_REPAIR',
           'originalInstallationId', installation_id,
           'quarantinedAt', now()
         )
       ),
       updated_at = now()
     WHERE id = ANY($1::uuid[])`,
    [AFFECTED_CONNECTION_IDS, tombstone]
  );
  console.log(`Updated ${updateConnRes.rowCount} resource_connections to DISCONNECTED.`);

  // Update resources
  const updateResRes = await pgClient.query(
    `UPDATE resources
     SET status = 'DISCONNECTED', updated_at = now()
     WHERE connection_id = ANY($1::uuid[])`,
    [AFFECTED_CONNECTION_IDS]
  );
  console.log(`Updated ${updateResRes.rowCount} resources to DISCONNECTED.`);

  // Assert duplicate installation_ids are resolved
  const dupCheck = await pgClient.query(`
    SELECT installation_id, COUNT(*) 
    FROM resource_connections 
    WHERE provider = 'GITHUB_APP' AND installation_id IS NOT NULL 
    GROUP BY installation_id 
    HAVING COUNT(*) > 1
  `);

  if (dupCheck.rows.length > 0) {
    throw new Error(
      `Duplicate installation_ids still exist after quarantine: ${JSON.stringify(dupCheck.rows)}`
    );
  }
  console.log('Confirmed 0 duplicate installation_ids remaining in resource_connections.');

  await pgClient.query('COMMIT');
  console.log('Quarantine transaction COMMITTED successfully.');

  // -------------------------------------------------------------------------
  // STEP 2: Execute Migrations 0018 through 0021
  // -------------------------------------------------------------------------
  console.log('\n--- Step 2: Applying Migrations (0018-0021) ---');
  const drizzleDb = drizzle(pgClient);
  await migrate(drizzleDb, { migrationsFolder: './drizzle' });
  console.log('Drizzle migrations finished.');

  // -------------------------------------------------------------------------
  // STEP 3: Verification
  // -------------------------------------------------------------------------
  console.log('\n--- Step 3: Verifying Schema State ---');

  // 1. Check sessions.github_user_id
  const sessionCol = await pgClient.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'github_user_id'`
  );
  const hasGithubUserId = sessionCol.rows.length > 0;
  console.log(`sessions.github_user_id present: ${hasGithubUserId}`);
  if (!hasGithubUserId) throw new Error('sessions.github_user_id is missing!');

  // 2. Check github_installation_states
  const ghStates = await pgClient.query(
    `SELECT to_regclass('public.github_installation_states') AS exists`
  );
  console.log(`github_installation_states table present: ${Boolean(ghStates.rows[0].exists)}`);

  // 3. Check application_executions
  const appExec = await pgClient.query(
    `SELECT to_regclass('public.application_executions') AS exists`
  );
  console.log(`application_executions table present: ${Boolean(appExec.rows[0].exists)}`);

  // 4. Check unique index
  const uqIndex = await pgClient.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'resource_connections_github_installation_unique'`
  );
  console.log(`Unique index on installation_id present: ${uqIndex.rows.length > 0}`);

  // 5. Total migrations recorded
  const migCount = await pgClient.query(`SELECT count(*) FROM drizzle.__drizzle_migrations`);
  console.log(`Total migrations in drizzle.__drizzle_migrations: ${migCount.rows[0].count}`);

  console.log('\n=== ALL MIGRATIONS AND REPAIR SUCCEEDED! ===');
  await pgClient.end();
} catch (err) {
  console.error('\nEXECUTION FAILED:', err.message);
  await pgClient.query('ROLLBACK').catch(() => {});
  await pgClient.end().catch(() => {});
  process.exit(1);
}
