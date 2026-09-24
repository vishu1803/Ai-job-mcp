import fs from 'node:fs';
import path from 'node:path';
import { pool, closeDatabase } from '../src/db/index.js';
import { SkillCatalogService } from '../src/services/skill-catalog.service.js';

async function seedTestFixtures() {
  const seedFile = path.resolve('src/db/seeds/test-fixtures.json');
  if (!fs.existsSync(seedFile)) {
    console.error(`Seed file not found at ${seedFile}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
  const client = await pool.connect();

  const tables = [
    'tenants',
    'users',
    'resource_connections',
    'candidates',
    'skills',
    'projects',
    'resources',
    'project_resources',
    'candidate_skills',
    'evidence_items',
    'job_applications',
  ];

  console.log('Seeding test fixtures into PostgreSQL...');

  try {
    await client.query('BEGIN');

    for (const table of tables) {
      const rows = data[table];
      if (!rows || rows.length === 0) continue;

      let insertedCount = 0;
      for (const row of rows) {
        const keys = Object.keys(row);
        const values = Object.values(row).map((val) => {
          if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
            return JSON.stringify(val);
          }
          return val;
        });

        const cols = keys.map((k) => `"${k}"`).join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

        const res = await client.query(
          `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values
        );
        insertedCount += res.rowCount || 0;
      }
      console.log(`  ✓ ${table}: ${rows.length} records processed (${insertedCount} inserted)`);
    }

    await client.query('COMMIT');

    // The canonical skill registry (skill_catalog) is tenant-agnostic reference data that the
    // Additional Skills UI and the integration suites both read. Seed it from the single
    // production seed source (SKILL_CATALOG_SEED) so a freshly provisioned environment matches
    // the runtime contract instead of relying on ambient rows in a developer database.
    const catalogResult = await new SkillCatalogService().seedCatalog();
    console.log(
      `  ✓ skill_catalog: ${catalogResult.inserted} inserted (${catalogResult.existing} existing)`
    );

    console.log('✅ Test fixtures successfully seeded.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to seed test fixtures:', err);
    process.exitCode = 1;
    throw err;
  } finally {
    client.release();
    await closeDatabase(pool);
  }
}

seedTestFixtures().catch((err) => {
  console.error(err);
  process.exit(1);
});
