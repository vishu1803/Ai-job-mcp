/**
 * @file Noise Skill Data Remediation Migration (v2)
 *
 * Safely identifies and removes skill/evidence records whose canonical
 * taxonomy classification is NOISE (local modules, stdlib, generic code words).
 *
 * Key safety rule: A global skill is ONLY deleted when it has ZERO remaining
 * candidate_skills references after the candidate cleanup. Shared skills are
 * never deleted.
 *
 * Usage:
 *   node scripts/migrate-remove-noise-skills.js            # dry-run (default)
 *   node scripts/migrate-remove-noise-skills.js --execute   # apply changes
 *   node scripts/migrate-remove-noise-skills.js --candidate <id>  # scope to one candidate
 */

import { eq, and, inArray } from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';
import { skills, candidateSkills, evidenceItems } from '../src/db/schema.js';
import { SkillTaxonomyEngine, GENERIC_NOISE_TERMS } from '../src/domain/career/skill-taxonomy.js';
import { logger } from '../src/utils/logger.js';

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const candidateIdx = args.indexOf('--candidate');
const TARGET_CANDIDATE_ID = candidateIdx !== -1 ? args[candidateIdx + 1] : null;

// ---------------------------------------------------------------------------
// 1. Build noise slug set from canonical taxonomy
// ---------------------------------------------------------------------------
const NOISE_SLUGS = new Set();

for (const term of GENERIC_NOISE_TERMS) {
  const result = SkillTaxonomyEngine.normalizeSkill(term);
  if (result && result.isNoise) {
    NOISE_SLUGS.add(result.canonicalSlug);
  }
}

// Also check common variants that might be in the DB
const EXTRA_NOISE_SLUGS = [
  'app',
  'server',
  'main',
  'core',
  'config',
  'utils',
  'helpers',
  'models',
  'views',
  'controllers',
  'services',
  'routes',
  'handlers',
  'schemas',
  'constants',
  'tests',
  'common',
  'lib',
  'shared',
  'index',
  'run',
  'cli',
  'db',
  'database',
  'api',
  'auth',
  'middleware',
  'tasks',
  'forms',
  'parser',
];

for (const slug of EXTRA_NOISE_SLUGS) {
  const result = SkillTaxonomyEngine.normalizeSkill(slug);
  if (result && result.isNoise) {
    NOISE_SLUGS.add(result.canonicalSlug);
  }
}

logger.info(
  { noiseSlugsCount: NOISE_SLUGS.size, noiseSlugs: [...NOISE_SLUGS] },
  'Noise slug set built from taxonomy'
);

// ---------------------------------------------------------------------------
// 2. Verify legitimate skills are NOT in noise set
// ---------------------------------------------------------------------------
const LEGITIMATE_SKILLS = [
  'react',
  'postgresql',
  'fastapi',
  'next-js',
  'typescript',
  'fastify',
  'drizzle-orm',
  'python',
  'javascript',
  'node-js',
  'django',
  'flask',
  'docker',
  'kubernetes',
  'redis',
  'mongodb',
  'zod',
  'vitest',
  'jest',
];

for (const slug of LEGITIMATE_SKILLS) {
  const result = SkillTaxonomyEngine.normalizeSkill(slug);
  if (result && result.isNoise) {
    throw new Error(`CRITICAL: Legitimate skill '${slug}' is classified as NOISE — aborting`);
  }
}

logger.info(
  { count: LEGITIMATE_SKILLS.length },
  'Verified legitimate skills are NOT classified as NOISE'
);

// ---------------------------------------------------------------------------
// 3. Read-only inventory with reference counting
// ---------------------------------------------------------------------------
async function runInventory() {
  const noiseSkills = await db
    .select({
      id: skills.id,
      slug: skills.slug,
      name: skills.name,
      category: skills.category,
    })
    .from(skills)
    .where(inArray(skills.slug, [...NOISE_SLUGS]));

  if (noiseSkills.length === 0) {
    logger.info('No noise skills found in database — nothing to clean up');
    return { noiseSkills: [], evidenceCount: 0, candidateSkillCount: 0, noiseSkillIds: [] };
  }

  const noiseSkillIds = noiseSkills.map((s) => s.id);

  // Per-skill reference analysis
  const skillDetails = [];
  let totalEvidenceCount = 0;
  let totalCandidateSkillCount = 0;

  for (const skill of noiseSkills) {
    // All candidate_skills referencing this skill globally
    const allCS = await db
      .select()
      .from(candidateSkills)
      .where(eq(candidateSkills.skillId, skill.id));

    const uniqueCandidates = [...new Set(allCS.map((r) => r.candidateId))];
    const targetCS = allCS.filter((r) => r.candidateId === TARGET_CANDIDATE_ID);

    // Evidence for target candidate only
    const targetEvidenceWhere = TARGET_CANDIDATE_ID
      ? and(eq(evidenceItems.skillId, skill.id), eq(evidenceItems.candidateId, TARGET_CANDIDATE_ID))
      : eq(evidenceItems.skillId, skill.id);

    const targetEvidence = await db.select().from(evidenceItems).where(targetEvidenceWhere);

    // Determine scope
    const isShared = uniqueCandidates.length > 1;
    const hasTargetRef = targetCS.length > 0;
    const isTargetOnly = !isShared && hasTargetRef;
    const isOrphaned = allCS.length === 0;

    let scope;
    if (isOrphaned) scope = 'C. ORPHANED';
    else if (isShared) scope = `B. SHARED (${uniqueCandidates.length} candidates)`;
    else if (isTargetOnly) scope = 'A. TARGET-ONLY';
    else scope = 'D. OTHER-CANDIDATE-ONLY';

    // After candidate cleanup, how many references remain?
    const remainingAfterCleanup = allCS.length - targetCS.length;

    skillDetails.push({
      skillId: skill.id,
      slug: skill.slug,
      name: skill.name,
      dbCategory: skill.category,
      globalCandidateSkillCount: allCS.length,
      uniqueCandidateCount: uniqueCandidates.length,
      targetCandidateRefs: targetCS.length,
      targetEvidenceCount: targetEvidence.length,
      remainingAfterCleanup,
      scope,
      safeToDeleteGlobal: remainingAfterCleanup === 0,
    });

    totalEvidenceCount += targetEvidence.length;
    totalCandidateSkillCount += targetCS.length;
  }

  // Summary
  const targetOnly = skillDetails.filter((s) => s.scope.startsWith('A.'));
  const shared = skillDetails.filter((s) => s.scope.startsWith('B.'));
  const safeToDeleteGlobal = skillDetails.filter((s) => s.safeToDeleteGlobal);

  logger.info(
    {
      totalNoiseSkills: noiseSkills.length,
      candidateSkillsToDelete: totalCandidateSkillCount,
      evidenceToDelete: totalEvidenceCount,
      targetOnlyCount: targetOnly.length,
      sharedCount: shared.length,
      safeGlobalDeletionCount: safeToDeleteGlobal.length,
    },
    'Inventory complete'
  );

  // Log each skill detail
  for (const s of skillDetails) {
    const status = s.safeToDeleteGlobal
      ? `SAFE TO DELETE (${s.remainingAfterCleanup} refs remain after cleanup)`
      : `PRESERVE (${s.remainingAfterCleanup} refs remain from other candidates)`;

    logger.info(
      {
        slug: s.slug,
        name: s.name,
        scope: s.scope,
        globalRefs: s.globalCandidateSkillCount,
        targetRefs: s.targetCandidateRefs,
        targetEvidence: s.targetEvidenceCount,
        remainingAfterCleanup: s.remainingAfterCleanup,
        safeToDeleteGlobal: s.safeToDeleteGlobal,
      },
      `  ${s.name} (${s.slug}): ${status}`
    );
  }

  return {
    noiseSkills,
    evidenceCount: totalEvidenceCount,
    candidateSkillCount: totalCandidateSkillCount,
    noiseSkillIds,
    skillDetails,
  };
}

// ---------------------------------------------------------------------------
// 4. Execute cleanup in transaction
// ---------------------------------------------------------------------------
async function executeCleanup(noiseSkillIds, skillDetails) {
  if (!noiseSkillIds || noiseSkillIds.length === 0) {
    logger.info('No noise skill IDs to process');
    return { evidenceDeleted: 0, candidateSkillsDeleted: 0, skillsDeleted: 0 };
  }

  let evidenceDeleted = 0;
  let candidateSkillsDeleted = 0;
  let skillsDeleted = 0;
  let skillsPreserved = 0;

  await db.transaction(async (tx) => {
    // Step 1: Delete evidence items linked to noise skills (candidate-scoped)
    for (const skillId of noiseSkillIds) {
      const whereClause = TARGET_CANDIDATE_ID
        ? and(
            eq(evidenceItems.skillId, skillId),
            eq(evidenceItems.candidateId, TARGET_CANDIDATE_ID)
          )
        : eq(evidenceItems.skillId, skillId);

      const existing = await tx
        .select({ id: evidenceItems.id })
        .from(evidenceItems)
        .where(whereClause);
      if (existing.length > 0) {
        await tx.delete(evidenceItems).where(whereClause);
        evidenceDeleted += existing.length;
        logger.info({ skillId, count: existing.length }, 'Deleted evidence items for noise skill');
      }
    }

    // Step 2: Delete candidate_skills linked to noise skills (candidate-scoped)
    for (const skillId of noiseSkillIds) {
      const whereClause = TARGET_CANDIDATE_ID
        ? and(
            eq(candidateSkills.skillId, skillId),
            eq(candidateSkills.candidateId, TARGET_CANDIDATE_ID)
          )
        : eq(candidateSkills.skillId, skillId);

      const existing = await tx
        .select({ id: candidateSkills.id })
        .from(candidateSkills)
        .where(whereClause);
      if (existing.length > 0) {
        await tx.delete(candidateSkills).where(whereClause);
        candidateSkillsDeleted += existing.length;
        logger.info(
          { skillId, count: existing.length },
          'Deleted candidate_skills for noise skill'
        );
      }
    }

    // Step 3: Delete global skills ONLY if they have ZERO remaining references
    // Re-query remaining references after candidate cleanup
    for (const detail of skillDetails) {
      if (detail.safeToDeleteGlobal) {
        // Verify zero references still hold (within transaction)
        const remaining = await tx
          .select({ id: candidateSkills.id })
          .from(candidateSkills)
          .where(eq(candidateSkills.skillId, detail.skillId));

        if (remaining.length === 0) {
          await tx.delete(skills).where(eq(skills.id, detail.skillId));
          skillsDeleted++;
          logger.info(
            { skillId: detail.skillId, slug: detail.slug },
            'Deleted orphaned global noise skill'
          );
        } else {
          skillsPreserved++;
          logger.warn(
            { skillId: detail.skillId, slug: detail.slug, remainingRefs: remaining.length },
            'Skill has unexpected remaining references — preserving'
          );
        }
      } else {
        skillsPreserved++;
        logger.info(
          {
            skillId: detail.skillId,
            slug: detail.slug,
            remainingRefs: detail.remainingAfterCleanup,
          },
          'PRESERVED shared noise skill'
        );
      }
    }
  });

  return { evidenceDeleted, candidateSkillsDeleted, skillsDeleted, skillsPreserved };
}

// ---------------------------------------------------------------------------
// 5. Post-cleanup verification
// ---------------------------------------------------------------------------
async function verifyCleanup(skillDetails) {
  const safeToDeleteSlugs = skillDetails.filter((s) => s.safeToDeleteGlobal).map((s) => s.slug);

  const sharedSlugs = skillDetails.filter((s) => !s.safeToDeleteGlobal).map((s) => s.slug);

  // Verify safe-to-delete skills are gone
  const remaining = await db
    .select({ slug: skills.slug, name: skills.name })
    .from(skills)
    .where(inArray(skills.slug, safeToDeleteSlugs));

  const remainingUnsafe = remaining.filter((r) => safeToDeleteSlugs.includes(r.slug));

  if (remainingUnsafe.length > 0) {
    logger.error(
      { remaining: remainingUnsafe },
      'WARNING: Safe-to-delete noise skills still exist'
    );
    return false;
  }

  // Verify shared skills are preserved
  const preserved = await db
    .select({ slug: skills.slug, name: skills.name })
    .from(skills)
    .where(inArray(skills.slug, sharedSlugs));

  if (preserved.length !== sharedSlugs.length) {
    logger.error(
      { expected: sharedSlugs.length, actual: preserved.length },
      'WARNING: Some shared noise skills were incorrectly deleted'
    );
    return false;
  }

  // Verify legitimate skills still exist
  const legitimateCheck = await db
    .select({ slug: skills.slug, name: skills.name })
    .from(skills)
    .where(inArray(skills.slug, LEGITIMATE_SKILLS.slice(0, 5)));

  logger.info(
    {
      safeToDeleteRemoved: remainingUnsafe.length === 0,
      sharedPreserved: preserved.length,
      legitimateSkillsPresent: legitimateCheck.length,
    },
    'Post-cleanup verification complete'
  );

  return remainingUnsafe.length === 0 && preserved.length === sharedSlugs.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  try {
    logger.info(
      { execute: EXECUTE, targetCandidate: TARGET_CANDIDATE_ID },
      'Starting noise skill remediation (v2 — reference-based global deletion)'
    );

    // Step 1: Inventory
    const inventory = await runInventory();

    if (inventory.noiseSkills.length === 0) {
      logger.info('Nothing to clean up');
      await pool.end();
      process.exit(0);
    }

    if (!EXECUTE) {
      logger.info(
        {
          evidenceToDelete: inventory.evidenceCount,
          candidateSkillsToDelete: inventory.candidateSkillCount,
          globalSkillsToDelete: inventory.skillDetails.filter((s) => s.safeToDeleteGlobal).length,
          globalSkillsPreserved: inventory.skillDetails.filter((s) => !s.safeToDeleteGlobal).length,
        },
        'DRY RUN — re-run with --execute to apply changes'
      );
      await pool.end();
      process.exit(0);
    }

    // Step 2: Execute
    const result = await executeCleanup(inventory.noiseSkillIds, inventory.skillDetails);
    logger.info(result, 'Cleanup execution complete');

    // Step 3: Verify
    const ok = await verifyCleanup(inventory.skillDetails);
    if (ok) {
      logger.info('✅ Remediation completed successfully');
    } else {
      logger.error('❌ Verification failed — manual investigation required');
    }

    await pool.end();
    process.exit(ok ? 0 : 1);
  } catch (err) {
    logger.error({ err }, 'Migration failed — transaction rolled back');
    await pool.end();
    process.exit(1);
  }
}

main();
