import fs from 'node:fs';
import path from 'node:path';
import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { CandidateArtifactContentService } from '../src/services/candidate-artifact-content.service.js';
import { LatexCompilerService } from '../src/services/latex-compiler.service.js';
import { PdfGeometryAnalyzer } from '../src/services/pdf-geometry-analyzer.service.js';
import { ResumeContentOptimizer } from '../src/services/resume-content-optimizer.service.js';

const TENANT = '24d53f53-780e-4431-b065-32180c354175';
const CAND = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';

const candRow = (await db.execute(sql`
  SELECT id, user_id, tenant_id, display_name, canonical_email, headline, summary
  FROM candidates WHERE id = ${CAND}
`)).rows[0];

const snapA = (await db.execute(sql`
  SELECT id, canonical_job_id, normalized_job_url, project_rankings, match_analysis, overall_fit
  FROM job_analysis_snapshots
  WHERE normalized_job_url LIKE '%cloudflare/jobs/8102350%'
  ORDER BY created_at DESC
  LIMIT 1
`)).rows[0] || (await db.execute(sql`
  SELECT id, canonical_job_id, normalized_job_url, project_rankings, match_analysis, overall_fit
  FROM job_analysis_snapshots
  WHERE normalized_job_url LIKE '%cloudflare%'
  ORDER BY created_at DESC
  LIMIT 1
`)).rows[0];

const snapB = (await db.execute(sql`
  SELECT id, canonical_job_id, normalized_job_url, project_rankings, match_analysis, overall_fit
  FROM job_analysis_snapshots
  WHERE normalized_job_url LIKE '%vercel%'
  ORDER BY created_at DESC
  LIMIT 1
`)).rows[0];

const snapC = (await db.execute(sql`
  SELECT id, canonical_job_id, normalized_job_url, project_rankings, match_analysis, overall_fit
  FROM job_analysis_snapshots
  WHERE normalized_job_url LIKE '%crunchyroll%' OR normalized_job_url LIKE '%siemens%'
  ORDER BY created_at DESC
  LIMIT 1
`)).rows[0] || snapB;

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

const svc = new CandidateArtifactContentService();
const compiler = new LatexCompilerService();
const geometryAnalyzer = new PdfGeometryAnalyzer();
const optimizer = new ResumeContentOptimizer({
  latexCompiler: compiler,
  geometryAnalyzer,
});

// Artifact destination paths
const artifactScratchDir = 'C:\\Users\\VISHW\\.gemini\\antigravity-ide\\brain\\ea0d5724-0ace-4618-9325-5853f7180381\\scratch';
const localScratchDir = path.resolve('scratch');
fs.mkdirSync(artifactScratchDir, { recursive: true });
fs.mkdirSync(localScratchDir, { recursive: true });

async function runOptimizedJob(label, job, fileKey) {
  console.log(`\n======================================================================`);
  console.log(`OPTIMIZING AND VALIDATING: ${label} (${job.company} - ${job.title})`);
  console.log(`======================================================================`);

  const candData = await svc.buildCandidateData({
    tenantId: TENANT,
    userId: candRow.user_id,
    candidateId: CAND,
    jobPosting: job,
  });

  const optResult = await optimizer.optimize({
    candidateProfile: candData,
    jobPosting: job,
    options: {
      projectRankings: job.projectRankings,
      matchAnalysis: job.jobFitAnalysis?.matchAnalysis,
      maxIterations: 5,
    },
  });

  const pdfPathArtifact = path.join(artifactScratchDir, `${fileKey}.pdf`);
  const pdfPathLocal = path.join(localScratchDir, `${fileKey}.pdf`);
  fs.writeFileSync(pdfPathArtifact, optResult.pdfBuffer);
  fs.writeFileSync(pdfPathLocal, optResult.pdfBuffer);
  console.log(`[Artifact Persisted] -> ${pdfPathArtifact}`);
  console.log(`[Artifact Persisted] -> ${pdfPathLocal}`);

  const m = optResult.acceptanceMetrics;
  const init = optResult.iterationHistory[0];

  console.log(`[Iterations Run]: ${optResult.iterationsRun}`);
  console.log(`[Iteration History]:`);
  for (const h of optResult.iterationHistory) {
    console.log(`  * Iteration ${h.iteration}: pageCount=${h.pageCount}, bottomWhitespace=${h.bottomWhitespacePt}pt, occupancy=${Math.round(h.pageOccupancyRatio*100)}%, factsRendered=${h.factsRendered}, action="${h.action}"`);
  }

  return {
    label,
    company: job.company,
    title: job.title,
    optResult,
    metrics: m,
    initial: init,
  };
}

try {
  const resA = await runOptimizedJob('Job A', jobA, 'Job_A_Cloudflare');
  const resB = await runOptimizedJob('Job B', jobB, 'Job_B_Vercel');
  const resC = await runOptimizedJob('Job C', jobC, 'Job_C_Crunchyroll');

  console.log(`\n\n====================================================================================================`);
  console.log(`P16-008: FINAL PDF CONTENT QUALITY VALIDATION & OPTIMIZER ACCEPTANCE TABLE`);
  console.log(`====================================================================================================`);
  console.log(`Metric                              | Job A (Cloudflare)      | Job B (Vercel)          | Job C (Crunchyroll)`);
  console.log(`------------------------------------+-------------------------+-------------------------+-------------------------`);

  const rows = [
    ['1. Target Role Heading', resA.optResult.structuredResume.candidateIdentity?.headline, resB.optResult.structuredResume.candidateIdentity?.headline, resC.optResult.structuredResume.candidateIdentity?.headline],
    ['2. Summary Chars / Sentences', `${resA.metrics.summary.chars}c / ${resA.metrics.summary.sentenceCount}s`, `${resB.metrics.summary.chars}c / ${resB.metrics.summary.sentenceCount}s`, `${resC.metrics.summary.chars}c / ${resC.metrics.summary.sentenceCount}s`],
    ['3. Selected Projects Count', `${resA.metrics.projects.count} projects`, `${resB.metrics.projects.count} projects`, `${resC.metrics.projects.count} projects`],
    ['4. Bullets per Project (R1/R2/R3)', resA.metrics.projects.bulletsPerProject.map(p => `${p.name.slice(0,12)}: ${p.bulletsCount}`).join('; '), resB.metrics.projects.bulletsPerProject.map(p => `${p.name.slice(0,12)}: ${p.bulletsCount}`).join('; '), resC.metrics.projects.bulletsPerProject.map(p => `${p.name.slice(0,12)}: ${p.bulletsCount}`).join('; ')],
    ['5. Total Project Bullets', `${resA.metrics.projects.totalBullets} bullets`, `${resB.metrics.projects.totalBullets} bullets`, `${resC.metrics.projects.totalBullets} bullets`],
    ['6. Experience Roles / Bullets', `${resA.metrics.experience.rolesCount} roles / ${resA.metrics.experience.bulletsCount} bullets`, `${resB.metrics.experience.rolesCount} roles / ${resB.metrics.experience.bulletsCount} bullets`, `${resC.metrics.experience.rolesCount} roles / ${resC.metrics.experience.bulletsCount} bullets`],
    ['7. DSA Section Status', `${resA.metrics.dsa.rendered ? 'RENDERED' : 'OMITTED (Truthful)'}`, `${resB.metrics.dsa.rendered ? 'RENDERED' : 'OMITTED (Truthful)'}`, `${resC.metrics.dsa.rendered ? 'RENDERED' : 'OMITTED (Truthful)'}`],
    ['8. Distinct Facts (Avail/Rendered)', `${resA.metrics.factUtilization.distinctFactsAvailable} avail / ${resA.metrics.factUtilization.factsRendered} rend`, `${resB.metrics.factUtilization.distinctFactsAvailable} avail / ${resB.metrics.factUtilization.factsRendered} rend`, `${resC.metrics.factUtilization.distinctFactsAvailable} avail / ${resC.metrics.factUtilization.factsRendered} rend`],
    ['9. Fact Utilization Ratio', `${Math.round(resA.metrics.factUtilization.utilizationRatio*100)}%`, `${Math.round(resB.metrics.factUtilization.utilizationRatio*100)}%`, `${Math.round(resC.metrics.factUtilization.utilizationRatio*100)}%`],
    ['10. Page Count (Strictly 1)', `${resA.metrics.pageCount} page (${resA.metrics.isSinglePage ? 'PASS' : 'FAIL'})`, `${resB.metrics.pageCount} page (${resB.metrics.isSinglePage ? 'PASS' : 'FAIL'})`, `${resC.metrics.pageCount} page (${resC.metrics.isSinglePage ? 'PASS' : 'FAIL'})`],
    ['11. Bottom Whitespace', `${resA.metrics.geometry.bottomWhitespacePt} pt`, `${resB.metrics.geometry.bottomWhitespacePt} pt`, `${resC.metrics.geometry.bottomWhitespacePt} pt`],
    ['12. Page Occupancy Ratio', `${resA.metrics.geometry.pageOccupancyPercent}%`, `${resB.metrics.geometry.pageOccupancyPercent}%`, `${resC.metrics.geometry.pageOccupancyPercent}%`],
    ['13. Pre-Exposure QA Score', `${resA.optResult.qaScore}/100 (${resA.optResult.qaPassed ? 'PASS' : 'FAIL'})`, `${resB.optResult.qaScore}/100 (${resB.optResult.qaPassed ? 'PASS' : 'FAIL'})`, `${resC.optResult.qaScore}/100 (${resC.optResult.qaPassed ? 'PASS' : 'FAIL'})`],
    ['14. Optimizer Iterations Run', `${resA.optResult.iterationsRun} iteration(s)`, `${resB.optResult.iterationsRun} iteration(s)`, `${resC.optResult.iterationsRun} iteration(s)`],
  ];

  for (const [k, vA, vB, vC] of rows) {
    console.log(`${k.padEnd(35)} | ${String(vA).slice(0,23).padEnd(23)} | ${String(vB).slice(0,23).padEnd(23)} | ${String(vC).slice(0,23).padEnd(23)}`);
  }

  console.log(`------------------------------------+-------------------------+-------------------------+-------------------------`);

} finally {
  await pool.end();
}
