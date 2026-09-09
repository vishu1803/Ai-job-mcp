import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { DocumentStorageService } from '../src/services/document-storage.service.js';
import { ResumeParserService } from '../src/services/resume-parser.service.js';

const storage = new DocumentStorageService();
const TENANT = '24d53f53-780e-4431-b065-32180c354175';
const APP = '2f71f4cf-0f86-43eb-b1c0-687e2e2d2d1c';

const pkg = (await db.execute(sql`
  SELECT package_payload->'tailoringPlan'->'selectedProjectIds' AS plan_ids,
         package_payload->'structuredResume'->'tailoringPlan'->'selectedProjectIds' AS sr_plan_ids,
         package_payload->'structuredResume'->'projects' AS sr_projects,
         package_payload->'tailoredResume'->'structuredResume'->'projects' AS tr_sr_projects,
         package_payload->'jobFitAnalysis'->'projectRankings' AS top_fit_rankings,
         package_payload->'jobFitAnalysis'->>'source' AS top_fit_source,
         package_payload->'jobFitAnalysis'->>'snapshotId' AS top_fit_snapshot
  FROM application_packages WHERE application_id = ${APP} AND version = 5`)).rows[0];
console.log('[v5 deep]');
console.log(JSON.stringify({
  planSelectedProjectIds: pkg_plan_ids(pkg) ,
}, null, 1));
function pkg_plan_ids(p){ return p.plan_ids; }
console.log('plan_ids:', JSON.stringify(pkg.plan_ids));
console.log('sr_plan_ids:', JSON.stringify(pkg.sr_plan_ids));
console.log('sr_projects:', JSON.stringify((pkg.sr_projects||[]).map(p=>p.name)));
console.log('tr_sr_projects:', JSON.stringify((pkg.tr_sr_projects||[]).map(p=>p.name)));
console.log('topLevelJobFitAnalysis:', pkg.top_fit_source, pkg.top_fit_snapshot, JSON.stringify((pkg.top_fit_rankings||[]).map(r=>r.projectName||r.name)));

// Kit artifacts for v5
const kit = (await db.execute(sql`
  SELECT metadata->'handoffKit'->'resume'->>'storageKey' AS pdf_key,
         metadata->'handoffKit'->'resume'->>'texStorageKey' AS tex_key,
         metadata->'handoffKit'->'resume'->>'contentHash' AS pdf_hash
  FROM job_applications WHERE id = ${APP}`)).rows[0];
console.log('\n[kit] pdf_key=' + kit.pdf_key + ' tex_key=' + kit.tex_key);

if (kit.tex_key) {
  const tex = (await storage.getDecryptedDocument({ tenantId: TENANT, storageKey: kit.tex_key })).toString('utf8');
  const projSection = tex.split(/atssection\{[^}]*Projects?\}/i)[1] || '';
  const texProjects = [...projSection.matchAll(/\textbf\{([^}]+)\}/g)].map(m => m[1]).slice(0, 6);
  const headline = (tex.match(/\atssection\{([^}]+)\}/) || [])[1];
  const summary = (tex.match(/Professional Summary\}\s*([\s\S]{0,260})/)?.[1] || '').replace(/\s+/g, ' ');
  console.log('\n[STEP7/8 TEX]');
  console.log(JSON.stringify({ headline, texProjects, summaryFirst240: summary.slice(0, 240) }, null, 1));
}
if (kit.pdf_key) {
  const pdfBuf = await storage.getDecryptedDocument({ tenantId: TENANT, storageKey: kit.pdf_key });
  const crypto = await import('node:crypto');
  console.log('\n[STEP8 KIT PDF] sha256=' + crypto.createHash('sha256').update(pdfBuf).digest('hex').slice(0,16) + '… (kit hash ' + (kit.pdf_hash||'').slice(0,16) + '…)');
  const parser = new ResumeParserService();
  const text = parser.extractRawText({ buffer: pdfBuf, format: 'PDF' }) || '';
  const probes = {
    PDE: /product[\s-]*data[\s-]*explorer/i.test(text),
    CTM: /collaborative[\s-]*task[\s-]*manager/i.test(text),
    ACRA: /ai[\s-]*powered[\s-]*code[\s-]*review/i.test(text),
    oldHeading: /full-stack & backend developer/i.test(text),
  };
  const idx = {
    pde: text.search(/product[\s-]*data[\s-]*explorer/i),
    ctm: text.search(/collaborative[\s-]*task[\s-]*manager/i),
    acra: text.search(/ai[\s-]*powered[\s-]*code[\s-]*review/i),
  };
  console.log(JSON.stringify({ probes, idx, pdeFirst: idx.pde >= 0 && (idx.pde < idx.ctm || idx.ctm < 0), excerpt: text.slice(0, 200).replace(/\s+/g, ' ') }, null, 1));
}
await pool.end();
