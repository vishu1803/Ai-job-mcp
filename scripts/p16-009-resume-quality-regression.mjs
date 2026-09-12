/**
 * P16-009 — Real-Candidate Read-Only Regression Harness
 *
 * Generates resumes for ≥3 meaningfully different stored jobs using the CURRENT
 * implementation (label "current") and, when P16-009 is implemented, the new
 * composition engine (label "p16-009"). Read-only against the database: only
 * SELECT queries; never INSERT/UPDATE/DELETE, never creates applications.
 *
 * Outputs into scratch/p16-009/:
 *   <key>.pdf                  compiled resume for the current implementation
 *   <key>.p16-009.pdf          compiled resume for the P16-009 implementation (when present)
 *   <key>.tex / .p16-009.tex   LaTeX sources
 *   <key>.txt / .p16-009.txt   extracted PDF text
 *   report.json                machine-readable A/B comparison
 *
 * Usage: node scripts/p16-009-resume-quality-regression.mjs [--ab]
 */
import fs from 'node:fs';
import path from 'node:path';
import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { CandidateArtifactContentService } from '../src/services/candidate-artifact-content.service.js';
import { LatexCompilerService } from '../src/services/latex-compiler.service.js';
import { PdfGeometryAnalyzer } from '../src/services/pdf-geometry-analyzer.service.js';
import { ResumeContentOptimizer } from '../src/services/resume-content-optimizer.service.js';
import { resumeParserService } from '../src/services/resume-parser.service.js';
import { computeResumeQualityScore } from '../src/services/resume-quality-score.service.js';

const TENANT = '24d53f53-780e-4431-b065-32180c354175';
const CAND = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
const OUT_DIR = path.resolve('scratch/p16-009');
const A_B_MODE = process.argv.includes('--ab');

const OUT_DIR_LEGACY = path.resolve('scratch');

const candRow = (
  await db.execute(sql`
    SELECT id, user_id, tenant_id, display_name, canonical_email, headline, summary
    FROM candidates WHERE id = ${CAND}
  `)
).rows[0];

async function loadSnapshot(urlLike, fallbackUrlLike) {
  const primary = await db.execute(sql`
    SELECT id, canonical_job_id, normalized_job_url, project_rankings, match_analysis, overall_fit
    FROM job_analysis_snapshots
    WHERE normalized_job_url LIKE ${urlLike}
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const row = primary.rows[0] || (fallbackUrlLike
    ? (await db.execute(sql`
        SELECT id, canonical_job_id, normalized_job_url, project_rankings, match_analysis, overall_fit
        FROM job_analysis_snapshots
        WHERE normalized_job_url LIKE ${fallbackUrlLike}
        ORDER BY created_at DESC
        LIMIT 1
      `)).rows[0]
    : null);
  return row || null;
}

const snapA = await loadSnapshot('%cloudflare/jobs/8102350%', '%cloudflare%');
const snapB = await loadSnapshot('%vercel%', null);
const snapC = await loadSnapshot('%crunchyroll%', '%siemens%');

const jobA = {
  id: snapA.canonical_job_id || 'cloudflare-8102350',
  canonicalJobId: snapA.canonical_job_id,
  company: 'Cloudflare',
  title: 'Systems & Infrastructure Engineer',
  description: 'Infrastructure, distributed systems, telemetry, high throughput, networking, Linux, Rust, Go, Python.',
  requirements: ['Distributed Systems', 'Rust', 'Linux', 'High Concurrency', 'Telemetry'],
  projectRankings: snapA.project_rankings,
  jobFitAnalysis: { projectRankings: snapA.project_rankings, matchAnalysis: snapA.match_analysis, overallFit: snapA.overall_fit },
};

const jobB = {
  id: snapB.canonical_job_id || 'vercel-backend',
  canonicalJobId: snapB.canonical_job_id,
  company: 'Vercel',
  title: 'Software Engineer, Backend',
  description: 'Serverless infrastructure, Node.js, Next.js, Edge compute, TypeScript, PostgreSQL, scalable APIs.',
  requirements: ['Node.js', 'Next.js', 'TypeScript', 'PostgreSQL', 'APIs'],
  projectRankings: snapB.project_rankings,
  jobFitAnalysis: { projectRankings: snapB.project_rankings, matchAnalysis: snapB.match_analysis, overallFit: snapB.overall_fit },
};

const jobC = {
  id: snapC.canonical_job_id || 'python-ai-backend',
  canonicalJobId: snapC.canonical_job_id,
  company: 'Crunchyroll',
  title: 'Python AI & Backend Systems Engineer',
  description: 'AI model evaluation pipelines, Python, FastAPI, Flask, PostgreSQL, LLM integration, OpenAI API, high concurrency.',
  requirements: ['Python', 'FastAPI', 'LLM', 'PostgreSQL', 'OpenAI API'],
  projectRankings: snapC.project_rankings,
  jobFitAnalysis: { projectRankings: snapC.project_rankings, matchAnalysis: snapC.match_analysis, overallFit: snapC.overall_fit },
};

const JOBS = [
  { key: 'cloudflare', label: 'Job A (Cloudflare, Systems & Infrastructure)', job: jobA },
  { key: 'vercel', label: 'Job B (Vercel, Backend)', job: jobB },
  { key: 'crunchyroll', label: 'Job C (Crunchyroll, Python AI & Backend)', job: jobC },
];

const svc = new CandidateArtifactContentService();
const compiler = new LatexCompilerService();
const geometryAnalyzer = new PdfGeometryAnalyzer();
const optimizer = new ResumeContentOptimizer({ latexCompiler: compiler, geometryAnalyzer });

fs.mkdirSync(OUT_DIR, { recursive: true });

/** Extracts text from a compiled PDF via the project parser. */
function extractPdfText(pdfBuffer) {
  const result = resumeParserService.extractRawText({ buffer: pdfBuffer, format: 'PDF' });
  return typeof result === 'string' ? result : String(result?.text || result?.textContent || '');
}

/** Renders + compiles with the current implementation through the P16-008 optimizer. */
async function generateCurrent(job) {
  const candData = await svc.buildCandidateData({ tenantId: TENANT, userId: candRow.user_id, candidateId: CAND, jobPosting: job });
  const opt = await optimizer.optimize({
    candidateProfile: candData,
    jobPosting: job,
    options: {
      projectRankings: job.projectRankings,
      matchAnalysis: job.jobFitAnalysis?.matchAnalysis,
      maxIterations: 5,
    },
  });
  return opt;
}

/** Renders + compiles with the P16-009 implementation when available. */
async function generateP16009(job) {
  const candData = await svc.buildCandidateData({ tenantId: TENANT, userId: candRow.user_id, candidateId: CAND, jobPosting: job });
  const opt = await optimizer.optimize({
    candidateProfile: candData,
    jobPosting: job,
    options: {
      projectRankings: job.projectRankings,
      matchAnalysis: job.jobFitAnalysis?.matchAnalysis,
      maxIterations: 5,
      p16_009: true, // engine flag consumed by the optimizer once implemented
    },
  });
  return opt;
}

const report = { generatedAt: new Date().toISOString(), candidate: { id: CAND }, jobs: [] };

for (const { key, label, job } of JOBS) {
  console.log(`\n=== ${label} ===`);
  const entry = { key, label, company: job.company, title: job.title };

  const current = await generateCurrent(job);
  const currentText = extractPdfText(current.pdfBuffer);
  fs.writeFileSync(path.join(OUT_DIR, `${key}.pdf`), current.pdfBuffer);
  fs.writeFileSync(path.join(OUT_DIR, `${key}.tex`), current.latexContent || '');
  fs.writeFileSync(path.join(OUT_DIR, `${key}.txt`), currentText);
  const currentScore = computeResumeQualityScore({
    structuredResume: current.structuredResume,
    candidateProfile: null,
    jobPosting: job,
    extractedText: currentText,
    pageCount: current.acceptanceMetrics?.pageCount ?? null,
    geometry: current.geometry,
  });
  entry.current = summarize(key, current, currentText, currentScore);

  if (A_B_MODE) {
    try {
      const p9 = await generateP16009(job);
      const p9Text = extractPdfText(p9.pdfBuffer);
      fs.writeFileSync(path.join(OUT_DIR, `${key}.p16-009.pdf`), p9.pdfBuffer);
      fs.writeFileSync(path.join(OUT_DIR, `${key}.p16-009.tex`), p9.latexContent || '');
      fs.writeFileSync(path.join(OUT_DIR, `${key}.p16-009.txt`), p9Text);
      const p9Score = computeResumeQualityScore({
        structuredResume: p9.structuredResume,
        candidateProfile: null,
        jobPosting: job,
        extractedText: p9Text,
        pageCount: p9.acceptanceMetrics?.pageCount ?? null,
        geometry: p9.geometry,
      });
      entry.p16_009 = summarize(key, p9, p9Text, p9Score);
      entry.comparison = compareSummaries(entry.current, entry.p16_009);
    } catch (err) {
      entry.p16_009 = { error: String(err?.message || err) };
      console.error('P16-009 path failed:', err?.message || err);
    }
  }

  report.jobs.push(entry);
}

report.comparison = report.jobs.some((j) => j.comparison) ? { note: 'See per-job comparison blocks' } : undefined;
fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\nReport written to ${path.join(OUT_DIR, 'report.json')}`);
printHumanReport(report);

await pool.end();
process.exit(0);

/** Builds the summary block consumed by the report + human table. */
function summarize(key, opt, extractedText, quality) {
  const sr = opt.structuredResume || {};
  const am = opt.acceptanceMetrics || {};
  return {
    sections: sr.sectionOrder || [],
    projects: (sr.projects || []).map((p) => ({
      name: p.name || p.displayName,
      bulletCount: Array.isArray(p.bullets) ? p.bullets.length : 0,
      bullets: (Array.isArray(p.bullets) ? p.bullets : []).map((b) => (typeof b === 'string' ? b : b?.text || '')),
    })),
    experienceBullets: (sr.experience || []).reduce((n, e) => n + (Array.isArray(e.bullets) ? e.bullets.length : 0), 0),
    dsaRendered: Boolean(sr.dsa?.hasSection),
    dsaBullets: Array.isArray(sr.dsa?.bullets) ? sr.dsa.bullets.length : 0,
    factsAvailable: am.factUtilization?.distinctFactsAvailable ?? null,
    factsRendered: am.factUtilization?.factsRendered ?? null,
    pageCount: am.pageCount ?? null,
    occupancyPercent: am.geometry?.pageOccupancyPercent ?? null,
    bottomWhitespacePt: am.geometry?.bottomWhitespacePt ?? null,
    qaScore: opt.qaScore ?? null,
    qualityScore: quality?.score ?? null,
    qualityBreakdown: quality?.dimensions ?? null,
    iterations: opt.iterationsRun,
  };
}

/** Machine-readable A/B delta between current and P16-009 summaries. */
function compareSummaries(a, b) {
  if (!b || b.error) return null;
  return {
    sectionsAdded: (b.sections || []).filter((s) => !(a.sections || []).includes(s)),
    sectionsRemoved: (a.sections || []).filter((s) => !(b.sections || []).includes(s)),
    bulletsAdded: (b.projects || []).reduce((n, p) => n + p.bulletCount, 0) - (a.projects || []).reduce((n, p) => n + p.bulletCount, 0),
    factsNewlyUtilized: Math.max(0, (b.factsRendered ?? 0) - (a.factsRendered ?? 0)),
    factsLost: Math.max(0, (a.factsRendered ?? 0) - (b.factsRendered ?? 0)),
    occupancyChangePct: (b.occupancyPercent ?? 0) - (a.occupancyPercent ?? 0),
    qualityScoreChange: (b.qualityScore ?? 0) - (a.qualityScore ?? 0),
    dsaSectionAdded: !a.dsaRendered && b.dsaRendered,
    dsaSectionRemoved: a.dsaRendered && !b.dsaRendered,
  };
}

/** Compact human-readable table. */
function printHumanReport(report) {
  console.log('\n================ P16-009 REGRESSION SUMMARY ================');
  for (const j of report.jobs) {
    console.log(`\n[${j.label}]`);
    for (const variant of ['current', 'p16_009']) {
      const s = j[variant];
      if (!s) continue;
      console.log(`  ${variant.padEnd(10)} pages=${s.pageCount} occupancy=${s.occupancyPercent}% bottomWS=${s.bottomWhitespacePt}pt facts=${s.factsRendered}/${s.factsAvailable} dsa=${s.dsaRendered ? 'ON' : 'off'} projects=${(s.projects || []).map((p) => p.bulletCount).join('/')} expBullets=${s.experienceBullets} qa=${s.qaScore} quality=${s.qualityScore}`);
    }
    if (j.comparison) console.log(`  Δ quality=${j.comparison.qualityScoreChange} occupancy=${j.comparison.occupancyChangePct}% bullets=${j.comparison.bulletsAdded}`);
  }
}
