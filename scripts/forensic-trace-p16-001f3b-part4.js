/**
 * READ-ONLY FORENSIC TRACE PART 4 (P16-001F-3B diagnostic).
 * Dual-source project investigation: candidates.profile_metadata vs projects table,
 * full snapshot payloads, identities, audit trail. SELECT-only. No writes.
 */
import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

const CANDS = {
  failing: '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
  snap1: '6e7bf23b-3d1e-42af-8d1a-b7b5503d7e76',
  snap2: 'cf5dc398-b53b-4dcf-bb61-bd152aedf9d2',
  app0829: '62bfe755-5f00-4dac-8d02-820356ede838',
  app0943: '588b08e5-af22-48ff-9eef-b638a20b10fc',
  app1008: '6059ea46-703e-4dce-a58c-3ec8fa078199',
};

async function main() {
  console.log('=== FORENSIC TRACE PART 4 ===');

  // ---- 1. Identity map ----
  const ids = Object.values(CANDS).map((c) => `'${c}'`).join(',');
  const cands = (await db.execute(sql.raw(`
    SELECT id, tenant_id, display_name, canonical_email, status, created_at,
           jsonb_array_length(COALESCE(profile_metadata->'projects', '[]'::jsonb)) AS pm_project_count,
           profile_metadata->'projects' AS pm_projects
    FROM candidates WHERE id IN (${ids})`))).rows;
  console.log('\n[1] CANDIDATES');
  for (const c of cands) {
    console.log(JSON.stringify({
      id: c.id,
      displayName: c.display_name,
      email: c.canonical_email,
      tenantId: c.tenant_id,
      createdAt: c.created_at,
      pmProjectCount: c.pm_project_count,
      pmProjectNames: (c.pm_projects || []).map((p) => p.name || p.title),
    }));
  }

  // ---- 2. projects TABLE per candidate ----
  const projRows = (await db.execute(sql.raw(`
    SELECT candidate_id, id, name, status, created_at
    FROM projects WHERE candidate_id IN (${ids}) ORDER BY candidate_id, created_at`))).rows;
  console.log('\n[2] PROJECTS TABLE rows');
  const byCand = {};
  for (const p of projRows) {
    byCand[p.candidate_id] = byCand[p.candidate_id] || [];
    byCand[p.candidate_id].push({ projectId: p.id, name: p.name, status: p.status, createdAt: p.created_at });
  }
  for (const [cid, list] of Object.entries(byCand)) {
    console.log(cid.slice(0, 8) + ': ' + JSON.stringify(list.map((x) => ({ name: x.name, status: x.status }))));
  }
  if (projRows.length === 0) console.log('(projects table empty for all involved candidates)');

  // ---- 3. Full snapshot payloads ----
  const snaps = (await db.execute(sql`
    SELECT id, tenant_id, candidate_id, canonical_job_id, analyzed_at,
           overall_fit, match_analysis, project_rankings,
           metadata->'topRelevantProjects' AS meta_top,
           metadata->'portfolioRecommendations' AS meta_portfolio,
           jsonb_array_length(COALESCE(match_analysis->'requirementMatches', '[]'::jsonb)) AS req_count
    FROM job_analysis_snapshots ORDER BY analyzed_at DESC`)).rows;
  console.log('\n[3] FULL SNAPSHOT PAYLOADS (' + snaps.length + ')');
  for (const s of snaps) {
    console.log(JSON.stringify({
      snapshotId: s.id,
      tenantId: s.tenant_id,
      candidateId: s.candidate_id,
      canonicalJobId: s.canonical_job_id,
      analyzedAt: s.analyzed_at,
      overallFit: s.overall_fit,
      requirementMatchCount: s.req_count,
      projectRankings: (s.project_rankings || []).map((r) => ({ n: r.projectName || r.name, s: r.relevanceScore })),
      metaTopRelevant: (s.meta_top || []).map((r) => ({ n: r.projectName || r.name, s: r.relevanceScore })),
      metaPortfolioFeatured: ((s.meta_portfolio || {}).featuredProjects || []).map((r) => ({ n: r.projectName || r.name || r.title, s: r.relevanceScore ?? r.score })),
    }, null, 1));
  }

  // ---- 4. Which candidate does tenant 24d53f53 (failing app tenant) hold? ----
  const t24 = (await db.execute(sql`
    SELECT id, display_name, canonical_email, created_at FROM candidates
    WHERE tenant_id = '24d53f53-780e-4431-b065-32180c354175' ORDER BY created_at`)).rows;
  console.log('\n[4] CANDIDATES in failing-app tenant 24d53f53');
  for (const c of t24) console.log(JSON.stringify({ id: c.id, name: c.display_name, email: c.canonical_email, createdAt: c.created_at }));

  // ---- 5. Recent audit logs (analyze/prepare activity) ----
  try {
    const audits = (await db.execute(sql`
      SELECT action, created_at, metadata
      FROM audit_logs
      WHERE created_at > NOW() - INTERVAL '6 hours'
        AND (action ILIKE '%analyz%' OR action ILIKE '%prepare%' OR action ILIKE '%extension%' OR action ILIKE '%handoff%')
      ORDER BY created_at DESC LIMIT 30`)).rows;
    console.log('\n[5] AUDIT LOGS (6h window): ' + audits.length);
    for (const a of audits) {
      console.log(JSON.stringify({ action: a.action, at: a.created_at, meta: a.metadata ? JSON.stringify(a.metadata).slice(0, 200) : null }));
    }
  } catch (e) {
    console.log('\n[5] audit_logs query failed: ' + e.message);
  }

  console.log('\n=== FORENSIC TRACE PART 4 END ===');
  await pool.end();
}

main().catch(async (e) => {
  console.error('FORENSIC TRACE 4 ERROR:', e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
