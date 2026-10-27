import fs from 'node:fs';
import path from 'node:path';
import { pool, closeDatabase } from '../src/db/index.js';
import { SkillCatalogService } from '../src/services/skill-catalog.service.js';
import { DocumentStorageService } from '../src/services/document-storage.service.js';

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

    // Seed canonical base resume for candidate fixtures if not already present
    const baseResumeId = 'fb8d151d-4282-4471-bd18-67e5b4a60a2a';
    const tenantId = '24d53f53-780e-4431-b065-32180c354175';
    const candidateId = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
    const checkResume = await client.query('SELECT id FROM "resumes" WHERE id = $1', [
      baseResumeId,
    ]);
    if (checkResume.rowCount === 0) {
      const storage = new DocumentStorageService();
      const rawBytes = Buffer.from('Vishwanath Nishad Authentic Master Resume Document');
      const stored = await storage.storeEncryptedDocument({
        tenantId,
        candidateId,
        buffer: rawBytes,
      });
      await client.query(
        `INSERT INTO "resumes" (
          id, "tenantId", "candidateId", version, "fileName", "mimeType",
          "storagePath", "storageBucket", "contentHash", "encryptionKeyId", "encryptionAlgorithm", "iv", "authTag",
          "isBaseResume", "lifecycleState", metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO NOTHING`,
        [
          baseResumeId,
          tenantId,
          candidateId,
          1,
          'Vishwanath_Nishad_Resume.pdf',
          'application/pdf',
          stored.storagePath,
          stored.storageBucket,
          stored.contentHash,
          stored.encryptionKeyId,
          stored.encryptionAlgorithm,
          stored.iv,
          stored.authTag,
          true,
          'BASE_RESUME',
          JSON.stringify({ source: 'CANONICAL_MASTER_SEED', seededAt: new Date().toISOString() }),
        ]
      );
      console.log(`  ✓ resumes: canonical base resume ${baseResumeId} seeded`);
    }

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
