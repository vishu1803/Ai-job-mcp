/**
 * @file Noise Skill Pre-Execution Safety Check
 *
 * Read-only investigation of the 12 vs 11 discrepancy.
 * DO NOT modify any data.
 */

import { eq, and, inArray } from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';
import { skills, candidateSkills, evidenceItems, resources } from '../src/db/schema.js';
import { SkillTaxonomyEngine, GENERIC_NOISE_TERMS } from '../src/domain/career/skill-taxonomy.js';

const TARGET_CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';

// Build noise slugs
const NOISE_SLUGS = new Set();
for (const term of GENERIC_NOISE_TERMS) {
  const result = SkillTaxonomyEngine.normalizeSkill(term);
  if (result?.isNoise) NOISE_SLUGS.add(result.canonicalSlug);
}

// Also add the extra terms
for (const term of [
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
  'api',
  'auth',
  'middleware',
  'tasks',
  'forms',
  'parser',
]) {
  const result = SkillTaxonomyEngine.normalizeSkill(term);
  if (result?.isNoise) NOISE_SLUGS.add(result.canonicalSlug);
}

async function main() {
  try {
    // 1. Find all noise skills in the global skills table
    const noiseSkills = await db
      .select()
      .from(skills)
      .where(inArray(skills.slug, [...NOISE_SLUGS]));

    console.log(`\n=== GLOBAL NOISE SKILLS: ${noiseSkills.length} rows ===\n`);

    // 2. For each noise skill, get cross-candidate references
    const skillReport = [];
    for (const skill of noiseSkills) {
      // All candidate_skills referencing this skill
      const allCS = await db
        .select()
        .from(candidateSkills)
        .where(eq(candidateSkills.skillId, skill.id));

      const uniqueCandidates = [...new Set(allCS.map((r) => r.candidateId))];
      const targetCS = allCS.filter((r) => r.candidateId === TARGET_CANDIDATE_ID);

      // All evidence items referencing this skill
      const allEvidence = await db
        .select()
        .from(evidenceItems)
        .where(eq(evidenceItems.skillId, skill.id));

      // Get distinct resources
      const resourceIds = [...new Set(allEvidence.map((e) => e.resourceId).filter(Boolean))];

      // For each evidence, get the resource name
      const resourceNames = [];
      for (const rid of resourceIds.slice(0, 5)) {
        const [res] = await db
          .select({ name: resources.name })
          .from(resources)
          .where(eq(resources.id, rid));
        if (res) resourceNames.push(res.name);
      }

      const isTargetOnly =
        uniqueCandidates.length === 1 && uniqueCandidates[0] === TARGET_CANDIDATE_ID;
      const isOrphaned = allCS.length === 0;

      let scope;
      if (isOrphaned) scope = 'C. ORPHANED';
      else if (isTargetOnly) scope = 'A. TARGET-ONLY';
      else scope = `B. SHARED (${uniqueCandidates.length} candidates)`;

      const report = {
        skillId: skill.id,
        slug: skill.slug,
        name: skill.name,
        dbCategory: skill.category,
        taxonomyNoise: NOISE_SLUGS.has(skill.slug),
        totalCandidateSkills: allCS.length,
        uniqueCandidates: uniqueCandidates.length,
        targetCandidateRefs: targetCS.length,
        totalEvidence: allEvidence.length,
        uniqueResources: resourceIds.length,
        resourceNames,
        scope,
      };
      skillReport.push(report);

      console.log(`--- ${skill.name} (${skill.slug}) ---`);
      console.log(`  skill ID:           ${skill.id}`);
      console.log(`  DB category:        ${skill.category}`);
      console.log(`  taxonomy NOISE:     ${NOISE_SLUGS.has(skill.slug)}`);
      console.log(
        `  candidate_skills:   ${allCS.length} rows across ${uniqueCandidates.length} candidate(s)`
      );
      console.log(`  target refs:        ${targetCS.length}`);
      console.log(`  evidence_items:     ${allEvidence.length} rows`);
      console.log(
        `  resources:          ${resourceIds.length} (${resourceNames.join(', ') || 'none'})`
      );
      console.log(`  scope:              ${scope}`);
      console.log('');
    }

    // 3. Verify legitimate skills
    console.log('\n=== LEGITIMATE SKILL PROTECTION CHECK ===\n');
    const legitimateSlugs = [
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
    ];
    for (const slug of legitimateSlugs) {
      const result = SkillTaxonomyEngine.normalizeSkill(slug);
      const inNoise = NOISE_SLUGS.has(slug);
      const inDB = noiseSkills.some((s) => s.slug === slug);
      console.log(
        `  ${slug}: isNoise=${result?.isNoise}, inNoiseSlugs=${inNoise}, inNoiseSkillRows=${inDB} → ${inDB ? '⚠️ IN DELETION SET' : '✅ PROTECTED'}`
      );
    }

    // 4. Verify the target candidate's noise skills
    console.log(`\n=== CANDIDATE ${TARGET_CANDIDATE_ID} ===\n`);
    const targetCS = await db
      .select({ skillId: candidateSkills.skillId })
      .from(candidateSkills)
      .where(eq(candidateSkills.candidateId, TARGET_CANDIDATE_ID));
    console.log(`  Total candidate_skills: ${targetCS.length}`);
    const targetNoiseCS = targetCS.filter((r) => {
      const matching = noiseSkills.find((s) => s.id === r.skillId);
      return !!matching;
    });
    console.log(`  Noise candidate_skills: ${targetNoiseCS.length}`);
    console.log(`  Legitimate candidate_skills: ${targetCS.length - targetNoiseCS.length}`);

    // 5. Summary
    console.log('\n=== SUMMARY ===\n');
    const targetOnly = skillReport.filter((r) => r.scope.startsWith('A.'));
    const shared = skillReport.filter((r) => r.scope.startsWith('B.'));
    const orphaned = skillReport.filter((r) => r.scope.startsWith('C.'));

    console.log(`  A. TARGET-ONLY (safe to remove globally): ${targetOnly.length}`);
    for (const r of targetOnly) {
      console.log(
        `     - ${r.name} (${r.slug}): ${r.totalEvidence} evidence, ${r.totalCandidateSkills} candidate_skill(s)`
      );
    }
    console.log(`  B. SHARED (DO NOT delete globally): ${shared.length}`);
    for (const r of shared) {
      console.log(
        `     - ${r.name} (${r.slug}): ${r.uniqueCandidates} candidates, ${r.totalEvidence} evidence`
      );
    }
    console.log(`  C. ORPHANED (safe to delete globally): ${orphaned.length}`);
    for (const r of orphaned) {
      console.log(`     - ${r.name} (${r.slug}): ${r.totalEvidence} evidence (orphaned)`);
    }

    console.log(`\n  Safe candidate-scoped deletions for ${TARGET_CANDIDATE_ID}:`);
    console.log(
      `    candidate_skills to remove: ${targetCS.length - (targetCS.length - targetNoiseCS.length)} = ${targetNoiseCS.length}`
    );
    console.log(
      `    evidence to remove: ${skillReport.reduce((sum) => sum, 0)} (see per-skill detail above)`
    );

    // Calculate evidence that belongs to target candidate for each noise skill
    let totalTargetEvidence = 0;
    for (const skill of noiseSkills) {
      const targetEvidence = await db
        .select()
        .from(evidenceItems)
        .where(
          and(
            eq(evidenceItems.skillId, skill.id),
            eq(evidenceItems.candidateId, TARGET_CANDIDATE_ID)
          )
        );
      totalTargetEvidence += targetEvidence.length;
    }
    console.log(`    evidence belonging to target candidate: ${totalTargetEvidence}`);
  } catch (err) {
    console.error('Investigation failed:', err);
  } finally {
    await pool.end();
  }
}

main();
