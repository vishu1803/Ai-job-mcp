/**
 * @file Safe, Reversible Taxonomy Contamination Cleanup Script (P14-005AE)
 *
 * Identifies and cleans historical package/dependency contamination in candidate_skills,
 * evidence_items, and skills tables while strictly preserving user-declared additional skills.
 *
 * Usage:
 *   node scripts/cleanup-taxonomy-contamination.js            # Dry-run audit (read-only)
 *   node scripts/cleanup-taxonomy-contamination.js --execute  # Transactional backup + cleanup
 *   node scripts/cleanup-taxonomy-contamination.js --rollback # Restore from backup tables
 */

import fs from 'node:fs';
import path from 'node:path';
import { db, closeDatabase } from '../src/db/index.js';
import { sql, inArray } from 'drizzle-orm';
import { candidateSkills, evidenceItems, skills } from '../src/db/schema.js';
import { SkillWorthinessGate } from '../src/domain/career/skill-worthiness-gate.js';
import { resolveParentSkills } from '../src/domain/career/parent-skill-mappings.js';
import { SkillTaxonomyEngine } from '../src/domain/career/skill-taxonomy.js';

const BACKUP_JSON_PATH = path.resolve('scratch', 'backup-taxonomy-contamination-20260903.json');

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const isRollback = args.includes('--rollback');

  console.log('======================================================');
  console.log('🧹 ANTIGRAVITY CAREER HUB - TAXONOMY CLEANUP ENGINE');
  console.log('======================================================');

  if (isRollback) {
    await executeRollback();
    await closeDatabase();
    return;
  }

  // 1. Audit and identify rows
  const allCandidateSkills = await db.execute(sql`
    SELECT cs.id, cs.tenant_id, cs.candidate_id, cs.skill_id, cs.provenance_status, cs.source,
           s.slug as skill_slug, s.name as skill_name, s.category as skill_category
    FROM candidate_skills cs
    JOIN skills s ON cs.skill_id = s.id
    ORDER BY s.slug ASC
  `);

  console.log(`\nFound ${allCandidateSkills.rows.length} total rows in candidate_skills.`);

  const toKeep = [];
  const toRemap = [];
  const toPurge = [];

  for (const row of allCandidateSkills.rows) {
    // INVARIANT: Never touch user-declared additional skills
    if (row.source === 'CANDIDATE_DECLARED') {
      toKeep.push({ row, reason: 'USER_DECLARED_ADDITIONAL_SKILL' });
      continue;
    }

    const evaluation = SkillWorthinessGate.evaluate(row.skill_slug);

    if (evaluation.isSkillWorthy) {
      toKeep.push({ row, reason: evaluation.classification });
    } else {
      const parentMappings = resolveParentSkills(row.skill_slug);
      if (parentMappings && parentMappings.length > 0) {
        toRemap.push({ row, parentMappings, reason: evaluation.reason });
      } else {
        toPurge.push({ row, reason: evaluation.reason });
      }
    }
  }

  console.log('\n--- CLASSIFICATION BREAKDOWN ---');
  console.log(`✅ Legitimate Skills to KEEP:           ${toKeep.length}`);
  console.log(`🔄 Package Evidence to REMAP to Parents: ${toRemap.length}`);
  console.log(`🗑️  Contaminated Packages to PURGE:       ${toPurge.length}`);

  if (toRemap.length > 0) {
    console.log('\nSample items to REMAP:');
    for (const item of toRemap.slice(0, 10)) {
      console.log(`  - ${item.row.skill_slug} -> ${item.parentMappings.map(p => p.parentSlug).join(', ')}`);
    }
  }

  if (toPurge.length > 0) {
    console.log('\nSample items to PURGE:');
    for (const item of toPurge.slice(0, 15)) {
      console.log(`  - ${item.row.skill_slug} (${item.reason})`);
    }
  }

  if (!isExecute) {
    console.log('\n[DRY RUN COMPLETE] Zero database modifications performed.');
    console.log('To execute cleanup with automatic backup, run:');
    console.log('  node scripts/cleanup-taxonomy-contamination.js --execute');
    await closeDatabase();
    return;
  }

  // EXECUTE MODE:
  console.log('\n🚀 EXECUTING DATABASE CLEANUP IN ATOMIC TRANSACTION...');

  // Step 1: Create deterministic snapshot tables
  console.log('1. Creating database snapshot tables...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS backup_candidate_skills_20260903 AS SELECT * FROM candidate_skills;
    CREATE TABLE IF NOT EXISTS backup_evidence_items_20260903 AS SELECT * FROM evidence_items;
    CREATE TABLE IF NOT EXISTS backup_skills_20260903 AS SELECT * FROM skills;
  `);

  // Export JSON backup artifact
  const backupData = {
    timestamp: new Date().toISOString(),
    totalCandidateSkills: allCandidateSkills.rows.length,
    purgedSkillIds: toPurge.map(p => p.row.id),
    remappedSkillIds: toRemap.map(r => r.row.id),
    purgedRows: toPurge.map(p => p.row),
  };
  fs.mkdirSync(path.dirname(BACKUP_JSON_PATH), { recursive: true });
  fs.writeFileSync(BACKUP_JSON_PATH, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`2. Exported JSON snapshot to ${BACKUP_JSON_PATH}`);

  // Step 2: Transactional cleanup
  await db.transaction(async (tx) => {
    // A. Remap parent evidence items
    for (const item of toRemap) {
      for (const parent of item.parentMappings) {
        // Resolve parent skill in skills table
        const parentRes = await tx.execute(sql`
          SELECT id FROM skills WHERE slug = ${parent.parentSlug} LIMIT 1
        `);
        const parentId = parentRes.rows[0]?.id;

        if (parentId) {
          // Re-link evidence_items pointing to old child skill
          await tx.execute(sql`
            UPDATE evidence_items
            SET skill_id = ${parentId},
                metadata = jsonb_set(
                  coalesce(metadata, '{}'::jsonb),
                  '{derivedFromPackage}',
                  to_jsonb(${item.row.skill_slug}::text)
                )
            WHERE skill_id = ${item.row.skill_id}
              AND candidate_id = ${item.row.candidate_id}
          `);
        }
      }

      // Delete the child skill candidate_skills row now that evidence is remapped
      await tx.execute(sql`
        DELETE FROM candidate_skills WHERE id = ${item.row.id}
      `);
    }

    // B. Delete contaminated candidate_skills and their evidence items
    if (toPurge.length > 0) {
      const purgeIds = toPurge.map(p => p.row.id);
      const purgeSkillIds = Array.from(new Set(toPurge.map(p => p.row.skill_id)));

      // Delete evidence_items linked to purged non-skills
      if (purgeSkillIds.length > 0) {
        await tx.delete(evidenceItems).where(inArray(evidenceItems.skillId, purgeSkillIds));
      }

      // Delete candidate_skills rows
      if (purgeIds.length > 0) {
        await tx.delete(candidateSkills).where(inArray(candidateSkills.id, purgeIds));
      }
    }

    // C. Clean up orphaned skills rows that have no references anywhere
    await tx.execute(sql`
      DELETE FROM skills s
      WHERE s.id NOT IN (SELECT distinct skill_id FROM candidate_skills WHERE skill_id IS NOT NULL)
        AND s.id NOT IN (SELECT distinct skill_id FROM evidence_items WHERE skill_id IS NOT NULL)
        AND s.slug NOT IN (SELECT slug FROM skill_catalog)
    `);
  });

  console.log('3. Cleanup transaction committed successfully.');

  // Step 3: Verification
  const verifyResult = await db.execute(sql`
    SELECT count(*) as remaining_count FROM candidate_skills
  `);
  console.log(`\nVerification: ${verifyResult.rows[0].remaining_count} clean candidate_skills remaining.`);
  console.log('✅ TAXONOMY CLEANUP COMPLETED SUCCESSFULLY.');

  await closeDatabase();
}

async function executeRollback() {
  console.log('⚠️  EXECUTING ROLLBACK FROM SNAPSHOT TABLES...');
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        TRUNCATE candidate_skills CASCADE;
        INSERT INTO candidate_skills SELECT * FROM backup_candidate_skills_20260903;

        TRUNCATE evidence_items CASCADE;
        INSERT INTO evidence_items SELECT * FROM backup_evidence_items_20260903;

        INSERT INTO skills SELECT * FROM backup_skills_20260903 ON CONFLICT (slug) DO NOTHING;
      `);
    });
    console.log('✅ ROLLBACK COMPLETED: Original database state restored.');
  } catch (err) {
    console.error('❌ Rollback failed:', err);
  }
}

main().catch(async (e) => {
  console.error('Fatal error during taxonomy cleanup:', e);
  await closeDatabase();
  process.exit(1);
});
