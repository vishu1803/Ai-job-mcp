/**
 * READ-ONLY FORENSIC TRACE PART 2 (P16-001F-3B diagnostic).
 * Scans all applications/snapshots for the Cloudflare job across candidates,
 * hash-scans stored artifacts to identify the PDF that was downloaded,
 * and extracts text from the downloaded PDF. SELECT-only. No writes.
 */
import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { DocumentStorageService } from '../src/services/document-storage.service.js';
import { ResumeParserService } from '../src/services/resume-parser.service.js';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const storage = new DocumentStorageService();
const names = (arr) => (Array.isArray(arr) ? arr.map((p) => p?.name || p?.displayName || p?.projectName).filter(Boolean) : null);

async function main() {
  console.log('=== FORENSIC TRACE PART 2 ===');

  // ---- A. All snapshot rows in the DB (any tenant/candidate) ----
  const snaps = await db.execute(sql`
    SELECT id, tenant_id, candidate_id, canonical_job_id, normalized_job_url, analyzed_at,
           project_rankings, metadata->'topRelevantProjects' AS top_rel
    FROM job_analysis_snapshots
    ORDER BY analyzed_at DESC
    LIMIT 20`);
  console.log('\n[A] ALL job_analysis_snapshots rows: ' + snaps.rows.length);
  for (const s of snaps.rows) {
    console.log(JSON.stringify({
      snapshotId: s.id,
      tenantId: s.tenant_id,
      candidateId: s.candidate_id,
      canonicalJobId: s.canonical_job_id,
      normalizedJobUrl: s.normalized_job_url,
      analyzedAt: s.analyzed_at,
      rankings: names(s.project_rankings),
    }));
  }

  // ---- B. All applications mentioning Cloudflare / 8102350 ----
  const apps = await db.execute(sql`
    SELECT id, tenant_id, candidate_id, canonical_job_id, normalized_job_url, company_name, job_title, status,
           metadata->'currentPackageHash' AS cur_hash,
           metadata->'handoffKit'->>'packageHash' AS kit_hash,
           metadata->'handoffKit'->>'generatedAt' AS kit_generated_at,
           metadata->'handoffKit'->'resume'->>'contentHash' AS kit_resume_pdf_hash,
           created_at, updated_at
    FROM job_applications
    WHERE normalized_job_url ILIKE '%8102350%' OR company_name ILIKE '%cloudflare%'
    ORDER BY created_at DESC`);
  console.log('\n[B] APPLICATIONS matching Cloudflare/8102350: ' + apps.rows.length);
  for (const a of apps.rows) {
    console.log(JSON.stringify({
      applicationId: a.id,
      candidateId: a.candidate_id,
      canonicalJobId: a.canonical_job_id,
      normalizedJobUrl: a.normalized_job_url,
      status: a.status,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
      currentPackageHash: a.cur_hash?.slice(0, 16) + '…',
      kitGeneratedAt: a.kit_generated_at,
      kitResumePdfHash: a.kit_resume_pdf_hash,
    }));
  }

  // ---- C. For each matching application: package versions + project data ----
  for (const a of apps.rows) {
    const pkgs = await db.execute(sql`
      SELECT version, package_hash, lifecycle_state, prepared_at,
             package_payload->>'generationContractVersion' AS contract,
             package_payload->'structuredResume'->'projects' AS sr_projects,
             package_payload->'tailoringPlan'->'selectedProjectIds' AS plan_ids,
             package_payload->'tailoredResume'->'selectedProjects' AS tr_sel,
             package_payload->'tailoredResume'->'markdownContent' AS md,
             package_payload->'targetJob'->'jobFitAnalysis'->>'source' AS fit_source,
             package_payload->'targetJob'->'jobFitAnalysis'->'projectRankings' AS fit_rankings,
             package_payload->'structuredResume'->'candidateIdentity'->>'headline' AS headline
      FROM application_packages
      WHERE application_id = ${a.id}
      ORDER BY version ASC`);
    console.log('\n[C] Application ' + a.id.slice(0, 8) + ' — ' + pkgs.rows.length + ' package version(s)');
    for (const p of pkgs.rows) {
      const md = p.md || '';
      const mdProjHeaders = [...md.matchAll(/^###\s+(?:\[[^\]]*\]\([^)]*\)|([^(#\n]+))/gm)]
        .map((m) => (m[1] || m[0]).replace(/^###\s*/, '').trim())
        .filter((h) => !/summary|skills|experience|education/i.test(h));
      console.log(JSON.stringify({
        version: p.version,
        state: p.lifecycle_state,
        preparedAt: p.prepared_at,
        contract: p.contract,
        fitSource: p.fit_source,
        fitRankings: names(p.fit_rankings),
        headline: p.headline,
        structuredResumeProjects: names(p.sr_projects),
        planSelectedProjectIds: p.plan_ids,
        markdownProjectHeaders: mdProjHeaders,
      }, null, 1));
    }
  }

  // ---- D. Downloaded PDF: text + locate matching stored artifact by hash ----
  console.log('\n[D] DOWNLOADED PDF IDENTITY');
  const dl = '.tmp-downloads/tailored-resume.pdf';
  try {
    const pdfBytes = await fs.readFile(dl);
    const pdfHash = crypto.createHash('sha256').update(pdfBytes).digest('hex');
    const stat = await fs.stat(dl);
    console.log(JSON.stringify({ file: dl, sha256: pdfHash, sizeBytes: pdfBytes.length, modifiedAt: stat.mtime }));

    const parser = new ResumeParserService();
    let text = '';
    try {
      text = parser.extractRawText({ buffer: pdfBytes, format: 'PDF' }) || '';
    } catch (e) {
      text = '(extract failed: ' + e.message + ')';
    }
    const projectProbes = ['Product-Data-Explorer', 'Product Data Explorer', 'Collaborative Task Manager', 'Collaborative-task-manager', 'AI-Powered Code Review Assistant', 'AI-powered-code-review-assistant'];
    const found = {};
    for (const probe of projectProbes) found[probe] = text.includes(probe);
    console.log(JSON.stringify({ downloadedPdfProjectTitlePresence: found, headlineExcerpt: text.slice(0, 200).replace(/\s+/g, ' ') }, null, 1));

    // Hash-scan stored artifacts across ALL tenants to find which stored PDF equals the downloaded one
    const storageRoot = path.resolve(process.cwd(), 'storage', 'documents');
    let tenants = [];
    try { tenants = await fs.readdir(storageRoot); } catch { /* none */ }
    let matchFound = false;
    for (const tenantDir of tenants) {
      const tenantPath = path.join(storageRoot, tenantDir);
      let keys = [];
      try { keys = await fs.readdir(tenantPath); } catch { continue; }
      for (const keyFile of keys) {
        if (!keyFile.endsWith('.enc')) continue;
        try {
          const buf = await storage.getDecryptedDocument({ tenantId: tenantDir, storageKey: keyFile.replace(/\.enc$/, '') });
          const h = crypto.createHash('sha256').update(buf).digest('hex');
          if (h === pdfHash) {
            matchFound = true;
            console.log('MATCH: downloaded PDF === stored artifact tenant=' + tenantDir + ' storageKey=' + keyFile);
          }
        } catch { continue; }
      }
    }
    if (!matchFound) console.log('NO stored artifact matches the downloaded PDF hash (PDF was generated in a previous session/artifact pruned, or modified after download).');
  } catch (e) {
    console.log('Downloaded PDF analysis failed: ' + e.message);
  }

  // ---- E. Downloaded zips: identify their applications ----
  console.log('\n[E] DOWNLOADED BUNDLES (appId prefixes)');
  for (const z of ['handoff-kit-2f71f4cf.zip', 'handoff-kit-628b7764.zip', 'handoff-kit-c67e8893.zip']) {
    try {
      const st = await fs.stat(path.join('.tmp-downloads', z));
      console.log(z + ' modifiedAt=' + st.mtime.toISOString());
    } catch { console.log(z + ' (stat failed)'); }
  }

  console.log('\n=== FORENSIC TRACE PART 2 END ===');
  await pool.end();
}

main().catch(async (e) => {
  console.error('FORENSIC TRACE 2 ERROR:', e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
