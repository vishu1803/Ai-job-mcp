import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { reconcileCandidateProjects } from '../src/services/candidate-artifact-content.service.js';

// Full buildCandidateData-equivalent reconcile with the REAL stored rows (as loadStoredProjects returns)
const stored = (await db.execute(sql`
  SELECT id, name, slug, metadata FROM projects
  WHERE candidate_id = '10a2b51b-09bf-4090-8040-1f60ebeb89c9'`)).rows;
console.log('stored rows:', stored.length);
const profile = (await db.execute(sql`
  SELECT id, name, slug, metadata FROM projects
  WHERE candidate_id = '10a2b51b-09bf-4090-8040-1f60ebeb89c9' AND name ILIKE '%vishu1803%'
  ORDER BY created_at DESC`)).rows;

// find ACRA curated entry url — full text of the resumeData project object:
const cand = (await db.execute(sql`
  SELECT profile_metadata->'resumeData'->'projects' as rd FROM candidates
  WHERE id='10a2b51b-09bf-4090-8040-1f60ebeb89c9'`)).rows[0];
for (const p of cand.rd || []) {
  console.log('--- curated:', p.name || p.title);
  console.log(JSON.stringify(p, null, 1).slice(0, 900));
}

const rec = reconcileCandidateProjects({ profileProjects: profile, resumeDataProjects: cand.rd, storedProjects: stored });
for (const p of rec) {
  console.log('RECONCILED:', p.name, '| repositoryUrl:', p.repositoryUrl, '| liveUrl:', p.liveUrl);
}
await pool.end();
