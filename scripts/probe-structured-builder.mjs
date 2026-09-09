/**
 * DECISIVE EXPERIMENT (read-only): replay buildStructuredResumeSnapshot with the
 * exact v5 inputs and inspect where projects are dropped.
 */
import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { CandidateArtifactContentService } from '../src/services/candidate-artifact-content.service.js';
import { CandidateProfileService } from '../src/services/candidate-profile.service.js';
import { buildStructuredResumeDocument } from '../src/services/structured-resume.service.js';

const TENANT = '24d53f53-780e-4431-b065-32180c354175';
const CAND = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
const UID = (await db.execute(sql`SELECT user_id FROM candidates WHERE id = ${CAND}`)).rows[0].user_id;

// Authoritative rankings from snapshot c45d6bda (the one bound to v5)
const snap = (await db.execute(sql`
  SELECT project_rankings FROM job_analysis_snapshots WHERE id = 'c45d6bda-c58d-4a3f-8429-48972d14e224'`)).rows[0];
const rankings = snap.project_rankings;
console.log('[input] rankings:', rankings.map(r => ({ id: r.projectId, n: r.projectName })));

// 1. What does buildCandidateData produce?
const svc = new CandidateArtifactContentService();
const candidateData = await svc.buildCandidateData({
  tenantId: TENANT, userId: UID, candidateId: CAND,
  jobPosting: { title: 'Principal Software Engineer, Data', company: 'Cloudflare', description: 'x'.repeat(100), id: 'd14f0683-a8ec-4230-8836-91157ecc87e9', canonicalJobId: 'd14f0683-a8ec-4230-8836-91157ecc87e9', source: 'GREENHOUSE', provider: 'GREENHOUSE', applicationUrl: 'https://job-boards.greenhouse.io/cloudflare/jobs/8102350' },
});
console.log('\n[candidateData.projects]:', (candidateData.projects || []).map(p => ({ id: p.id, name: p.name, slugKey: String(p.name||'').toLowerCase().replace(/[^a-z0-9]/g,'') })));

// 2. Replay builder with workflow's exact inputs
const candidateProfileInput = { ...candidateData, phone: candidateData.phone || null, location: candidateData.location || null };
const targetJobPosting = {
  id: 'd14f0683-a8ec-4230-8836-91157ecc87e9',
  canonicalJobId: 'd14f0683-a8ec-4230-8836-91157ecc87e9',
  source: 'GREENHOUSE', provider: 'GREENHOUSE',
  company: 'Cloudflare', title: 'Principal Software Engineer, Data',
  description: 'x'.repeat(120),
  applicationUrl: 'https://job-boards.greenhouse.io/cloudflare/jobs/8102350',
  recommendedProjects: ['Product Data Explorer', 'Collaborative Task Manager'],
  projectRankings: rankings,
  jobFitAnalysis: { projectRankings: rankings, topRelevantProjects: rankings, source: 'EXTENSION_AUTHORITATIVE_SNAPSHOT', overallFit: { atsScore: 47, fitBand: 'MODERATE' } },
};
const doc = buildStructuredResumeDocument({
  candidateProfile: candidateProfileInput,
  jobPosting: targetJobPosting,
  options: { projectRankings: rankings, matchAnalysis: null },
});
console.log('\n[builder result]');
console.log(JSON.stringify({
  planSelectedProjectIds: doc.tailoringPlan.selectedProjectIds,
  structuredProjects: doc.projects.map(p => ({ id: p.projectId, name: p.name, rank: p.rank })),
}, null, 1));

// 3. If empty, inspect the plan-vs-map mismatch
if (doc.projects.length === 0) {
  const meta = candidateProfileInput.profileMetadata || {};
  const rawProjects = meta.projects || candidateProfileInput.projects || [];
  console.log('\n[diag] rawProjects count:', rawProjects.length);
  console.log('[diag] rawProjects ids:', rawProjects.slice(0,12).map(p => p.id || p.projectId || '(none)'));
  console.log('[diag] plan ids:', doc.tailoringPlan.selectedProjectIds);
  const map = new Map();
  for (const p of rawProjects) { const k = p.id || p.projectId; if (k) map.set(k, p); }
  for (const id of doc.tailoringPlan.selectedProjectIds) {
    console.log('[diag] plan id', id, 'inMap:', map.has(id));
  }
}
await pool.end();
