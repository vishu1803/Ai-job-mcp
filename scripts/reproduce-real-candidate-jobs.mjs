import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { CandidateArtifactContentService } from '../src/services/candidate-artifact-content.service.js';
import { buildStructuredResumeSnapshot } from '../src/services/structured-resume.service.js';
import { LatexDocumentGenerator } from '../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../src/services/latex-compiler.service.js';
import { ResumeParserService } from '../src/services/resume-parser.service.js';
import { PdfQaValidatorService } from '../src/services/pdf-qa-validator.service.js';

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

const svc = new CandidateArtifactContentService();
const generator = new LatexDocumentGenerator();
const compiler = new LatexCompilerService();
const parser = new ResumeParserService();
const qa = new PdfQaValidatorService();

async function runJobFlow(label, job, snap) {
  console.log(`\n==================================================`);
  console.log(`RUNNING PIPELINE FOR: ${label} (${job.company} - ${job.title})`);
  console.log(`==================================================`);

  const candData = await svc.buildCandidateData({
    tenantId: TENANT,
    userId: candRow.user_id,
    candidateId: CAND,
    jobPosting: job,
  });

  const structuredSnapshot = buildStructuredResumeSnapshot({
    candidateProfile: candData,
    jobPosting: job,
    options: {
      projectRankings: job.projectRankings,
      matchAnalysis: job.jobFitAnalysis?.matchAnalysis,
    },
  });

  const doc = structuredSnapshot.structuredResume;
  console.log(`[Structured Snapshot Summary]`);
  console.log(`- Candidate Name: ${doc.candidateIdentity?.displayName}`);
  console.log(`- Target Role: ${doc.candidateIdentity?.headline}`);
  console.log(`- Summary: ${doc.summary?.text}`);
  console.log(`- Experience: ${doc.experience?.length} role(s) -> ${doc.experience?.map(e => `${e.title} at ${e.company} (${(e.bullets||[]).length} bullets)`).join('; ')}`);
  console.log(`- Education: ${doc.education?.length} entry -> ${doc.education?.map(e => `${e.degree} from ${e.institution}`).join('; ')}`);
  console.log(`- Selected Projects (${doc.projects?.length}):`);
  for (const p of doc.projects) {
    console.log(`  * [${p.rank}] ${p.displayName || p.name} (tech: ${(p.technologies || []).join(', ')})`);
    for (const b of (p.bullets || [])) {
      const txt = typeof b === 'string' ? b : b?.text;
      console.log(`    - ${txt}`);
    }
  }

  const appPackage = {
    candidateId: CAND,
    candidateName: doc.candidateIdentity?.displayName || 'Candidate',
    candidateEmail: doc.candidateIdentity?.email,
    candidatePhone: doc.candidateIdentity?.phone,
    targetJob: job,
    packageHash: `simulated-pkg-${label.toLowerCase()}`,
    structuredResume: doc,
    tailoringPlan: structuredSnapshot.tailoringPlan,
    tailoredResume: {
      structuredResume: doc,
      contentHash: `simulated-hash-${label.toLowerCase()}`,
    },
  };

  // Generate LaTeX
  const latexResult = generator.generateTailoredResumeLatex({
    applicationPackage: appPackage,
    candidateProfile: candData,
  });
  console.log(`- Generated LaTeX length: ${latexResult.texContent.length} chars`);

  // Compile PDF
  const pdfResult = await compiler.compileLatexToPdf({
    texContent: latexResult.texContent,
    jobName: `real-cand-${label.toLowerCase()}`,
  });
  console.log(`- Compiled PDF size: ${pdfResult.pdfBuffer.length} bytes`);

  // Extract PDF text
  const extractedText = parser.extractRawText({ buffer: pdfResult.pdfBuffer, format: 'PDF' });
  const pageMatches = [...extractedText.matchAll(/--- Page (\d+) ---/g)];
  const pageCount = pageMatches.length || 1;
  console.log(`- Actual PDF Page Count: ${pageCount}`);

  // Build expectedContent for QA
  const expectedContent = {
    candidateName: doc.candidateIdentity?.displayName,
    projectNames: doc.projects.map(p => p.displayName || p.name),
    projectBullets: doc.projects.flatMap(p => (p.bullets || []).map(b => (typeof b === 'string' ? b : b?.text)).slice(0, 1)),
    experienceRoles: (doc.experience || []).map(e => e.title),
    experienceBullets: (doc.experience || []).flatMap(e => (e.bullets || []).slice(0, 1)),
    educationTokens: (doc.education || []).map(e => e.institution),
    links: ['github.com'],
  };

  const qaResult = await qa.validatePdf({
    pdfBuffer: pdfResult.pdfBuffer,
    expectedCandidate: {
      name: doc.candidateIdentity?.displayName,
      email: doc.candidateIdentity?.email,
      phone: doc.candidateIdentity?.phone,
    },
    targetJob: job,
    verifiedSkills: (candData.skills || []).slice(0, 10).map(s => s.name || s),
    documentType: 'RESUME',
    expectedContent,
  });

  console.log(`- QA Audit Passed: ${qaResult.passed} (Score: ${qaResult.score}/100)`);
  if (qaResult.criticalFailures?.length) {
    console.log(`- Critical Failures:`, qaResult.criticalFailures);
  }
  if (qaResult.findings?.length) {
    console.log(`- Findings:`, qaResult.findings.slice(0, 5));
  }

  return { label, job, doc, pageCount, qaResult, extractedText };
}

try {
  const resA = await runJobFlow('JOB_A_CLOUDFLARE', jobA, snapA);
  const resB = await runJobFlow('JOB_B_VERCEL', jobB, snapB);

  console.log(`\n==================================================`);
  console.log(`COMPARISON AUDIT: JOB A vs JOB B`);
  console.log(`==================================================`);
  console.log(`Job A Projects: ${resA.doc.projects.map(p => p.displayName || p.name).join(' | ')}`);
  console.log(`Job B Projects: ${resB.doc.projects.map(p => p.displayName || p.name).join(' | ')}`);
  console.log(`Project selection changed: ${resA.doc.projects.map(p=>p.name).join(',') !== resB.doc.projects.map(p=>p.name).join(',')}`);
  console.log(`Job A Target Role: "${resA.doc.candidateIdentity?.headline}"`);
  console.log(`Job B Target Role: "${resB.doc.candidateIdentity?.headline}"`);
  console.log(`Job A Summary: "${resA.doc.summary?.text}"`);
  console.log(`Job B Summary: "${resB.doc.summary?.text}"`);
  console.log(`Job A Experience Preserved: ${resA.doc.experience[0]?.company} - ${resA.doc.experience[0]?.title}`);
  console.log(`Job B Experience Preserved: ${resB.doc.experience[0]?.company} - ${resB.doc.experience[0]?.title}`);
  console.log(`Job A Education Preserved: ${resA.doc.education[0]?.institution} - ${resA.doc.education[0]?.degree}`);
  console.log(`Job B Education Preserved: ${resB.doc.education[0]?.institution} - ${resB.doc.education[0]?.degree}`);
  console.log(`Job A Contact Preserved: ${resA.doc.candidateIdentity?.email}`);
  console.log(`Job B Contact Preserved: ${resB.doc.candidateIdentity?.email}`);
  console.log(`Both PDFs Exactly 1 Page: Job A = ${resA.pageCount} page(s), Job B = ${resB.pageCount} page(s)`);
  console.log(`Both QA Passed: Job A = ${resA.qaResult.passed}, Job B = ${resB.qaResult.passed}`);

} finally {
  await pool.end();
}
