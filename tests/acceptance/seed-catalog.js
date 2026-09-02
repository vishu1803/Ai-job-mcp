import { db, closeDatabase, pool } from '../../src/db/index.js';
import { skillCatalog } from '../../src/db/schema.js';
import { sql } from 'drizzle-orm';
import { SKILL_CATALOG_SEED } from '../../src/services/skill-catalog.seed.js';

async function seed() {
  const [{ count }] = await db.select({ count: sql`count(*)::int` }).from(skillCatalog);
  console.log(`Current catalog entries: ${count}`);

  if (count >= SKILL_CATALOG_SEED.length) {
    console.log('Catalog already seeded.');
    await closeDatabase(pool);
    return;
  }

  let inserted = 0;
  for (const entry of SKILL_CATALOG_SEED) {
    try {
      const existing = await db.select({ id: skillCatalog.id }).from(skillCatalog).where(sql`slug = ${entry.slug}`).limit(1);
      if (existing.length === 0) {
        await db.insert(skillCatalog).values({
          canonicalName: entry.canonicalName,
          slug: entry.slug,
          category: entry.category,
          subcategory: entry.subcategory || null,
          skillType: entry.skillType || 'TECHNOLOGY',
          description: entry.description || null,
          aliases: entry.aliases || [],
          active: true,
          sortOrder: entry.sortOrder || 0,
          metadata: {},
        });
        inserted++;
      }
    } catch (err) {
      console.error(`Failed to insert ${entry.slug}:`, err.message);
    }
  }

  const [{ count: finalCount }] = await db.select({ count: sql`count(*)::int` }).from(skillCatalog);
  console.log(`Seeded ${inserted} new entries. Total: ${finalCount}`);

  await closeDatabase(pool);
}

seed().catch(err => { console.error(err); process.exit(1); });
