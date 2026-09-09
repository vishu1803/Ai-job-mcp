import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { DocumentStorageService } from '../src/services/document-storage.service.js';
import { ResumeParserService } from '../src/services/resume-parser.service.js';
import crypto from 'node:crypto';

const storage = new DocumentStorageService();
const TENANT = '24d53f53-780e-4431-b065-32180c354175';
const APP = '2f71f4cf-0f86-43eb-b1c0-687e2e2d2d1c';

const kit = (await db.execute(sql`
  SELECT metadata->'handoffKit'->>'packageHash' AS kit_hash,
         metadata->'handoffKit'->'resume'->>'contentHash' AS pdf_hash,
         metadata->'handoffKit'->'resume'->>'texStorageKey' AS tex_key,
         metadata->'handoffKit'->'resume'->'qaAudit'->>'score' AS qa,
         metadata->'handoffKit'->'resume'->'qaAudit'->>'passed' AS qa_pass
  FROM job_applications WHERE id = ${APP}`)).rows[0];
console.log('[kit] pkgHash=' + kit.kit_hash.slice(0,16) + '… pdfHash=' + kit.pdf_hash.slice(0,16) + '… qa=' + kit.qa + '/' + kit.qa_pass);

const tex = (await storage.getDecryptedDocument({ tenantId: TENANT, storageKey: kit.tex_key })).toString('utf8');
const projSection = tex.split(/\atssection\{/).find(s => /Project/i.test(s.split('}')[0])) || '';
const texProjects = [...(projSection + (projSection.includes('textbf') ? '' : '')).matchAll(/\textbf\{([^}]+)\}/g)].map(m => m[1]);
const allTexbf = [...tex.matchAll(/\textbf\{([A-Z][^}]{3,60})\}/g)].map(m => m[1]).filter(n => /Explorer|Task|Review|Data/i.test(n));
const summary = (tex.match(/Professional Summary\}\s*([\s\S]{0,240})/)?.[1] || '').replace(/\s+/g, ' ');
console.log('[TEX] project mentions in order:', JSON.stringify(allTexbf.slice(0, 6)));
console.log('[TEX] summary:', summary.slice(0, 200));

const pdfBuf = await storage.getDecryptedDocument({ tenantId: TENANT, storageKey: (await db.execute(sql`SELECT metadata->'handoffKit'->'resume'->>'storageKey' AS k FROM job_applications WHERE id = ${APP}`)).rows[0].k });
console.log('[PDF] hash match:', crypto.createHash('sha256').update(pdfBuf).digest('hex') === kit.pdf_hash);
const text = new ResumeParserService().extractRawText({ buffer: pdfBuf, format: 'PDF' }) || '';
const idx = {
  pde: text.search(/product[\s-]*data[\s-]*explorer/i),
  ctm: text.search(/collaborative[\s-]*task[\s-]*manager/i),
  acra: text.search(/ai[\s-]*powered[\s-]*code[\s-]*review/i),
};
const probes = {
  PDE_present: idx.pde >= 0,
  CTM_present: idx.ctm >= 0,
  ACRA_absent_ok: idx.acra < 0 || idx.acra > idx.ctm,
  tailoredHeading: /software engineer, data/i.test(text) && !/full-stack & backend developer/i.test(text),
};
const projectsSection = text.slice(text.search(/TECHNICAL PROJECTS|PROJECTS/i));
console.log('[PDF]', JSON.stringify({ probes, mentionOrder: idx, projectsSectionExcerpt: projectsSection.slice(0, 400).replace(/\s+/g, ' ') }, null, 1));
await pool.end();
