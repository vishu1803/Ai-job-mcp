/**
 * P16-001F-5 DIAGNOSTIC — Issue 1: Requirement Matches
 * Traces: live job page → JobDescriptionParser.parse() → matcher → analyze API response
 * → snapshot row → extension-consumed fields. READ-ONLY + one legitimate analyze call.
 */
import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { createSession } from '../src/security/session.service.js';
import { JobDescriptionParser } from '../src/domain/career/job-parser.js';
import { decodeHtmlEntities } from '../src/services/job-board-adapters/greenhouse.adapter.js';

const JOB_URL = 'https://job-boards.greenhouse.io/cloudflare/jobs/8158016?gh_jid=8158016';
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

async function main() {
  console.log('=== ISSUE 1 TRACE: REQUIREMENT MATCHES ===');

  // 1. Raw extracted job description (same as extension flow: #content DOM)
  const res = await fetch(JOB_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36', Accept: 'text/html' },
  });
  const html = await res.text();
  const contentMatch = html.match(/<div[^>]*id=["']content["'][^>]*>([\s\S]*?)<\/div>\s*(<div|<section|<footer|$)/i);
  const rawDesc = contentMatch ? contentMatch[1] : html;
  const description = stripTags(rawDesc);
  console.log('[1] raw description chars:', description.length);

  // 2. JobDescriptionParser.parse() output
  const classification = await JobDescriptionParser.parse(
    {
      rawText: decodeHtmlEntities(description),
      title: 'Systems Engineer - Database Platform',
      company: 'Cloudflare',
      source: 'API',
    },
    { tenantId: '00000000-0000-0000-0000-000000000000', userId: '00000000-0000-0000-0000-000000000000' }
  );
  const reqs = classification.requirements || [];
  console.log('[2] parser requirements count:', reqs.length);
  const byCat = {};
  for (const r of reqs) byCat[r.category] = (byCat[r.category] || 0) + 1;
  console.log('[2] by category:', JSON.stringify(byCat));
  console.log('[2] sample:', JSON.stringify(reqs.slice(0, 4).map((r) => ({ c: r.category, v: r.extractedValue?.slice(0, 40), i: r.importance }))));

  // 3. Live analyze call as the real user
  const [targetUser] = await db.select().from(schema.users).where(eq(schema.users.email, 'vishwanatnishad@gmail.com'));
  const [targetCand] = await db.select().from(schema.candidates).where(eq(schema.candidates.userId, targetUser.id));
  const session = await createSession(db, { userId: targetUser.id, tenantId: targetUser.tenantId });

  const analyzeRes = await fetch(API + '/analyze-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.rawToken },
    body: JSON.stringify({
      job: {
        title: 'Systems Engineer - Database Platform',
        company: 'Cloudflare',
        description,
        sourceUrl: JOB_URL,
        provider: 'GREENHOUSE',
        location: 'Hybrid',
      },
    }),
  });
  const analyze = await analyzeRes.json();
  console.log('[3] analyze HTTP', analyzeRes.status);
  const fit = analyze.fitAnalysis || {};
  console.log('[3] API fitAnalysis keys:', JSON.stringify(Object.keys(fit)));
  console.log('[3] matches:', (fit.matches || []).length, 'partialMatches:', (fit.partialMatches || []).length,
    'missingRequirements:', (fit.missingRequirements || []).length, 'hardBlockers:', (fit.hardBlockers || []).length);
  console.log('[3] fitAnalysis raw keys from MCP:', JSON.stringify(Object.keys(analyze)));
  console.log('[3] requirementMatches in response?', 'requirementMatches' in fit);
  console.log('[3] overallFit:', JSON.stringify({ score: fit.score, grade: fit.grade }));

  // 4. Latest snapshot row for this candidate
  const snap = (await db.execute(sql`
    SELECT id, analyzed_at, match_analysis, parsed_job_description
    FROM job_analysis_snapshots
    WHERE candidate_id = ${targetCand.id}
    ORDER BY analyzed_at DESC LIMIT 1`)).rows[0];
  const ma = snap?.match_analysis || {};
  const pjd = snap?.parsed_job_description || {};
  console.log('[4] snapshot', snap?.id, 'at', snap?.analyzed_at);
  console.log('[4] match_analysis.requirementMatches:', (ma.requirementMatches || []).length,
    'skillGaps:', (ma.skillGaps || []).length);
  console.log('[4] parsed_job_description.requirements:', (pjd.requirements || []).length);

  console.log('=== ISSUE 1 TRACE DONE ===');
  await pool.end();
}

main().catch(async (e) => {
  console.error('TRACE ERROR:', e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
