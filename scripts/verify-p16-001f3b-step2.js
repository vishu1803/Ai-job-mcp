/**
 * STEP 2 + STEP 5 (pre-Chrome) — P16-001F-3B verification.
 * Proves the NEW server (PID started after restart) implements:
 *  - POST /api/extension/analyze-job  (returns analysisSnapshotId)
 *  - POST /api/extension/prepare-handoff (route registered; probed harmlessly)
 *  - job_analysis_snapshots persistence with authoritative rankings
 * Uses the real user session and the live Greenhouse job content.
 * Creates legitimate new snapshot rows only (idempotent analyze). No deletes, no code changes.
 */
import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { createSession } from '../src/security/session.service.js';

const JOB_URL = 'https://job-boards.greenhouse.io/cloudflare/jobs/8102350?gh_jid=8102350';
const API = 'http://localhost:3000/api/extension';

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function fetchJobPage() {
  const res = await fetch(JOB_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36', Accept: 'text/html' },
  });
  if (!res.ok) throw new Error('Greenhouse fetch failed: HTTP ' + res.status);
  const html = await res.text();
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  // Greenhouse job description lives in #content (job posting body)
  const contentMatch = html.match(/<div[^>]*id=["']content["'][^>]*>([\s\S]*?)<\/div>\s*(<div|<section|<footer|$)/i);
  const rawDesc = contentMatch ? contentMatch[1] : html;
  return {
    title: (titleMatch ? titleMatch[1] : 'Software Engineer').replace(/\s*-\s*Cloudflare.*$/i, '').trim(),
    description: stripTags(rawDesc).slice(0, 12000),
  };
}

async function main() {
  console.log('=== STEP 2/5 PRE-CHROME VERIFICATION ===');

  // 0. Confirm exactly one fresh server process
  const listeners = [];
  const { execSync } = await import('node:child_process');
  const netstat = execSync('netstat -ano').toString();
  for (const line of netstat.split('\n')) {
    if (line.includes(':3000') && line.includes('LISTENING')) listeners.push(line.trim());
  }
  console.log('\n[0] Port 3000 listeners: ' + JSON.stringify(listeners));

  // 1. Session for the real user
  const [targetUser] = await db.select().from(schema.users).where(eq(schema.users.email, 'vishwanatnishad@gmail.com'));
  if (!targetUser) throw new Error('Target user vishwanatnishad@gmail.com not found');
  const [targetCand] = await db.select().from(schema.candidates).where(eq(schema.candidates.userId, targetUser.id));
  console.log('[1] Session user: ' + targetUser.displayName + ' candidate=' + targetCand.id);

  const session = await createSession(db, { userId: targetUser.id, tenantId: targetUser.tenantId });

  // 2. Fetch live job content
  let job;
  try {
    job = await fetchJobPage();
    console.log('[2] Live job fetched: title="' + job.title + '" descriptionChars=' + job.description.length);
  } catch (e) {
    console.log('[2] WARN: live fetch failed (' + e.message + ') — using title-only probe');
    job = { title: 'Software Engineer', description: '' };
  }

  // 3. POST /api/extension/analyze-job (proves route + snapshot layer on the NEW process)
  const analyzeRes = await fetch(API + '/analyze-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.rawToken },
    body: JSON.stringify({
      job: {
        title: job.title,
        company: 'Cloudflare',
        description: job.description || job.title,
        sourceUrl: JOB_URL,
        provider: 'GREENHOUSE',
        location: 'Remote',
      },
    }),
  });
  const analyze = await analyzeRes.json();
  console.log('\n[3] POST /analyze-job -> HTTP ' + analyzeRes.status);
  console.log(JSON.stringify({
    analysisSnapshotId: analyze.analysisSnapshotId,
    canonicalJobId: analyze.canonicalJob?.canonicalJobId,
    fitScore: analyze.fitAnalysis?.score,
    existingApplication: analyze.existingApplication,
    featuredProjects: (analyze.portfolioRecommendations?.featuredProjects || []).map((p) => ({
      name: p.projectName || p.name,
      score: p.relevanceScore ?? p.score,
      rank: p.relevanceRank,
    })),
  }, null, 1));

  if (!analyze.analysisSnapshotId) {
    console.log('FAIL: analysisSnapshotId missing — snapshot layer not active on this process?');
    await pool.end();
    process.exit(1);
  }

  // 4. Verify snapshot row (STEP 5 pre-check)
  const snap = (await db.execute(sql`
    SELECT id, candidate_id, canonical_job_id, job_content_hash, analyzed_at, project_rankings
    FROM job_analysis_snapshots
    WHERE id = ${analyze.analysisSnapshotId}`)).rows[0];
  const rankings = snap?.project_rankings || [];
  console.log('\n[4] SNAPSHOT ROW ' + (snap ? 'FOUND' : 'MISSING'));
  console.log(JSON.stringify({
    snapshotId: snap?.id,
    candidateMatches: snap?.candidate_id === targetCand.id,
    canonicalJobId: snap?.canonical_job_id,
    jobContentHash: snap?.job_content_hash?.slice(0, 16) + '…',
    analyzedAt: snap?.analyzed_at,
    rankings: rankings.map((r) => ({ name: r.projectName || r.name, score: r.relevanceScore, rank: r.relevanceRank })),
    pdeFirst: (rankings[0]?.projectName || rankings[0]?.name || '').toLowerCase().includes('product-data-explorer'),
  }, null, 1));

  // 5. Probe prepare-handoff route exposure harmlessly (empty body -> 400, not 404)
  const probeRes = await fetch(API + '/prepare-handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.rawToken },
    body: JSON.stringify({}),
  });
  const probe = await probeRes.json().catch(() => ({}));
  console.log('\n[5] prepare-handoff route probe (empty payload): HTTP ' + probeRes.status + ' code=' + probe.code);
  console.log('    (400 INVALID_JOB_PAYLOAD = route registered on current code; 404 would mean stale server)');

  console.log('\n=== STEP 2/5 PRE-CHECK DONE ===');
  await pool.end();
}

main().catch(async (e) => {
  console.error('VERIFY ERROR:', e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
