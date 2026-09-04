/**
 * @file Restore stable MCP acceptance candidate (data remediation — infra only).
 *
 * Candidate: 10a2b51b-09bf-4090-8040-1f60ebeb89c9
 *
 * Restores ONLY:
 *   candidates.display_name / headline / summary
 *   profile_metadata->userCustom.headline / summary
 *   removes candidate_skills rows with source = 'CANDIDATE_DECLARED' (proven E2E
 *   residue: docker/kubernetes/redis created at the same transaction timestamp as
 *   the contamination write 2026-09-02 20:52:08.063)
 *
 * Never touches: evidence-backed candidate_skills, evidence_items, resources,
 * projects, education/languages/experience/location in profile_metadata, users,
 * tenants, or any other candidate.
 *
 * Guard: refuses to run unless ALLOW_MUTATE_MCP_FIXTURE_CANDIDATE=true (deliberate
 * operator approval). Snapshots are written to scratch/ before and after.
 *
 * Usage:
 *   ALLOW_MUTATE_MCP_FIXTURE_CANDIDATE=true node scripts/restore-mcp-fixture-candidate.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import {
  PROTECTED_MCP_FIXTURE_CANDIDATE_ID,
  ALLOW_MUTATE_ENV,
} from '../tests/helpers/e2e-fixture.js';

const TARGET = PROTECTED_MCP_FIXTURE_CANDIDATE_ID;

// ---------------------------------------------------------------------------
// Authentic source-of-truth values (recovered 2026-09-03; see Phase 1 report):
//   displayName: users.display_name "Vishwanath Nishad" (owner user, unchanged)
//   headline:    clean-state DOM snapshot + resume + userCustom.currentRole all
//                agree on "Full-Stack & Backend Developer"
//   summary:     clean-state DOM snapshot of /profile textarea (pre-contamination)
// ---------------------------------------------------------------------------
const AUTHENTIC = Object.freeze({
  displayName: 'Vishwanath Nishad',
  headline: 'Full-Stack & Backend Developer',
  summary:
    'Full-stack engineer specializing in robust, scalable backend systems and RESTful API design using Python (FastAPI/Django) ' +
    'and Node.js (Express/NestJS). Proven ability to independently deliver high-performance, production-ready applications, ' +
    'leveraging expertise in PostgreSQL and modular service design. Strong foundational problem-solver with a rigorous daily ' +
    'practice in Data Structures and Algorithms.',
});

const snapshotFile = (name) =>
  path.resolve('scratch', `restore-mcp-fixture-${name}-${Date.now()}.json`);

async function dumpState() {
  const c = await db.execute(sql`
    SELECT id, display_name, headline, summary, updated_at, profile_metadata
    FROM candidates WHERE id = ${TARGET}
  `);
  const skillsRes = await db.execute(sql`
    SELECT cs.id, cs.provenance_status, cs.source, s.slug, cs.created_at
    FROM candidate_skills cs JOIN skills s ON cs.skill_id = s.id
    WHERE cs.candidate_id = ${TARGET} ORDER BY cs.created_at
  `);
  const counts = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM candidate_skills cs WHERE cs.candidate_id = ${TARGET}) AS cs_total,
      (SELECT count(*)::int FROM candidate_skills cs WHERE cs.candidate_id = ${TARGET} AND cs.source = 'CANDIDATE_DECLARED') AS cs_declared,
      (SELECT count(*)::int FROM evidence_items e WHERE e.candidate_id = ${TARGET}) AS evidence_total,
      (SELECT count(*)::int FROM resources r WHERE r.candidate_id = ${TARGET}) AS resources_total,
      (SELECT count(*)::int FROM projects p WHERE p.candidate_id = ${TARGET}) AS projects_total
  `);
  return { candidate: c.rows[0], skills: skillsRes.rows, counts: counts.rows[0] };
}

async function main() {
  if (process.env[ALLOW_MUTATE_ENV] !== 'true') {
    console.error(
      `Refusing to run: this script mutates the stable READ-ONLY MCP fixture candidate.\n` +
        `Re-run with ${ALLOW_MUTATE_ENV}=true for an operator-approved data restoration.`
    );
    process.exit(1);
  }

  console.log(`=== RESTORING STABLE MCP FIXTURE CANDIDATE ${TARGET} ===\n`);
  const before = await dumpState();
  fs.writeFileSync(snapshotFile('before'), JSON.stringify(before, null, 2));
  console.log('Before snapshot written. Current identity:');
  console.log(`  displayName: ${before.candidate.display_name}`);
  console.log(`  headline:    ${before.candidate.headline}`);
  console.log(`  summary:     ${before.candidate.summary}`);
  console.log(`  declared skills: ${before.counts.cs_declared} (${before.skills.filter(s => s.source === 'CANDIDATE_DECLARED').map(s => s.slug).join(', ')})`);

  if (before.counts.cs_declared > 0) {
    console.log('\nRemoving E2E-residue declared skills...');
    await db.execute(sql`
      DELETE FROM candidate_skills
      WHERE candidate_id = ${TARGET} AND source = 'CANDIDATE_DECLARED'
    `);
    console.log(`  Removed ${before.counts.cs_declared} CANDIDATE_DECLARED row(s).`);
  }

  console.log('\nRestoring identity fields (candidates + userCustom mirror)...');
  await db.execute(sql`
    UPDATE candidates
    SET display_name = ${AUTHENTIC.displayName},
        headline = ${AUTHENTIC.headline},
        summary = ${AUTHENTIC.summary},
        profile_metadata = jsonb_set(
          jsonb_set(
            profile_metadata,
            '{userCustom,headline}',
            to_jsonb(${AUTHENTIC.headline}::text)
          ),
          '{userCustom,summary}',
          to_jsonb(${AUTHENTIC.summary}::text)
        ),
        updated_at = now()
    WHERE id = ${TARGET}
  `);
  console.log('  Identity restored.');

  const after = await dumpState();
  fs.writeFileSync(snapshotFile('after'), JSON.stringify(after, null, 2));
  console.log('\nAfter snapshot written. Verified state:');
  console.log(`  displayName: ${after.candidate.display_name}`);
  console.log(`  headline:    ${after.candidate.headline}`);
  console.log(`  summary:     ${after.candidate.summary.slice(0, 80)}...`);
  console.log(`  declared skills: ${after.counts.cs_declared}`);
  console.log(`  evidence-backed skills: ${after.counts.cs_total} (unchanged class)`);
  console.log(`  evidence_items: ${after.counts.evidence_total}`);
  console.log(`  resources: ${after.counts.resources_total}`);
  console.log(`  projects: ${after.counts.projects_total}`);

  const ok =
    after.candidate.display_name === AUTHENTIC.displayName &&
    after.candidate.headline === AUTHENTIC.headline &&
    after.candidate.summary === AUTHENTIC.summary &&
    after.counts.cs_declared === 0 &&
    after.counts.evidence_total === before.counts.evidence_total &&
    after.counts.resources_total === before.counts.resources_total &&
    after.counts.projects_total === before.counts.projects_total;

  console.log(ok ? '\n✅ RESTORE VERIFIED' : '\n❌ RESTORE MISMATCH — investigate snapshots.');
  process.exit(ok ? 0 : 2);
}

main().catch(async (e) => {
  console.error('Restore failed:', e);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
