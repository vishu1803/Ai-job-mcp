/**
 * READ-ONLY FORENSIC TRACE PART 3 (P16-001F-3B diagnostic).
 * Deep dive on application 2f71f4cf-0f86-43eb-b1c0-687e2e2d2d1c:
 * full package payloads, tailored_documents mapping, candidate profile projects,
 * and content of the exact downloaded artifact. SELECT-only. No writes.
 */
import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { DocumentStorageService } from '../src/services/document-storage.service.js';
import { ResumeParserService } from '../src/services/resume-parser.service.js';
import crypto from 'node:crypto';

const APP_ID = '2f71f4cf-0f86-43eb-b1c0-687e2e2d2d1c';
const ARTIFACT_KEY = '68ffadf9-30fc-4d84-a377-d318820951ae'; // matches downloaded PDF
const DL_HASH = '47f5cf0c88ad6cac07b0c438f2901c7ca1178f371c766f5996fb78810a59d25b';
const storage = new DocumentStorageService();

async function main() {
  console.log('=== FORENSIC TRACE PART 3: deep dive ' + APP_ID.slice(0, 8) + ' ===');

  const [app] = (await db.execute(sql`
    SELECT id, tenant_id, candidate_id, canonical_job_id, status,
           metadata->'currentPackageHash' AS cur_hash,
           metadata->'currentPackageVersion' AS cur_ver,
           metadata->'handoffKit'->>'packageHash' AS kit_hash,
           metadata->'handoffKit'->>'generatedAt' AS kit_generated_at,
           metadata->'handoffKit'->'resume'->>'contentHash' AS kit_pdf_hash,
           metadata->'handoffKit'->'resume'->>'storageKey' AS kit_pdf_key,
           metadata->'handoffKit'->'resume'->>'texStorageKey' AS kit_tex_key,
           metadata->'handoffKit'->'resume'->'qaAudit'->>'score' AS kit_qa_score
    FROM job_applications WHERE id = ${APP_ID}`)).rows;
  console.log('\n[1] APPLICATION ROW');
  console.log(JSON.stringify(app, null, 2));

  // ---- Full package payloads ----
  const pkgs = (await db.execute(sql`
    SELECT version, package_hash, lifecycle_state, prepared_at, source, fit_score, answers,
           package_payload->'targetJob'->'jobFitAnalysis' AS tj_fit,
           package_payload->'targetJob'->'projectRankings' AS tj_rankings,
           package_payload->'targetJob'->'recommendedProjects' AS tj_recommended,
           package_payload->'targetJob'->>'title' AS tj_title,
           package_payload->'tailoredResume'->'selectedProjects' AS tr_sel,
           package_payload->'tailoredResume'->'structuredResume' IS NOT NULL AS has_sr,
           package_payload->>'generationContractVersion' AS contract,
           package_payload->'structuredResume'->'projects' AS sr_projects
    FROM application_packages WHERE application_id = ${APP_ID} ORDER BY version ASC`)).rows;
  console.log('\n[2] PACKAGE PAYLOADS (' + pkgs.length + ')');
  for (const p of pkgs) {
    const fit = p.tj_fit;
    console.log(JSON.stringify({
      version: p.version,
      state: p.lifecycle_state,
      packageHash: p.package_hash.slice(0, 16) + '…',
      preparedAt: p.prepared_at,
      source: p.source,
      fitScore: p.fit_score,
      contract: p.contract,
      hasStructuredResume: p.has_sr,
      structuredResumeProjects: Array.isArray(p.sr_projects) ? p.sr_projects.map((x) => x.name) : null,
      targetJobTitle: p.tj_title,
      targetJobProjectRankings: Array.isArray(p.tj_rankings) ? p.tj_rankings.map((r) => ({ n: r.projectName || r.name, s: r.relevanceScore, band: r.relevanceBand })) : p.tj_rankings,
      targetJobRecommendedProjects: p.tj_recommended,
      targetJobJobFitAnalysis: fit ? {
        source: fit.source,
        snapshotId: fit.snapshotId,
        isAuthoritative: fit.isAuthoritative,
        rankings: Array.isArray(fit.projectRankings) ? fit.projectRankings.map((r) => ({ n: r.projectName || r.name, s: r.relevanceScore, rank: r.relevanceRank })) : null,
        topRelevant: Array.isArray(fit.topRelevantProjects) ? fit.topRelevantProjects.map((r) => ({ n: r.projectName || r.name, s: r.relevanceScore })) : null,
      } : null,
      tailoredResumeSelectedProjects: Array.isArray(p.tr_sel) ? p.tr_sel.map((s) => s.name || s.projectName || s.title) : p.tr_sel,
    }, null, 2));
  }

  // ---- tailored_documents rows: map artifacts to packageHash ----
  const docs = (await db.execute(sql`
    SELECT document_type, title, metadata->>'packageHash' AS md_pkg_hash,
           metadata->'artifact'->>'packageHash' AS art_pkg_hash,
           metadata->'artifact'->>'contentHash' AS art_pdf_hash,
           metadata->'artifact'->>'storageKey' AS art_key,
           metadata->'artifact'->>'generationContractVersion' AS art_contract,
           metadata->'markdownContentHash' AS md_content_hash,
           created_at
    FROM tailored_documents WHERE application_id = ${APP_ID}
    ORDER BY created_at ASC`)).rows;
  console.log('\n[3] TAILORED_DOCUMENTS (' + docs.length + ') — mapping artifact hashes to packages');
  for (const d of docs) {
    console.log(JSON.stringify({
      type: d.document_type,
      pkgHash: (d.art_pkg_hash || d.md_pkg_hash || '')?.slice(0, 16) + '…',
      pdfHash: d.art_pdf_hash?.slice(0, 16) + '…',
      storageKey: d.art_key,
      contract: d.art_contract,
      createdAt: d.created_at,
      IS_DOWNLOADED_PDF: d.art_pdf_hash === DL_HASH,
    }));
  }

  // ---- Candidate profile projects (does Product-Data-Explorer exist?) ----
  const [cand] = (await db.execute(sql`
    SELECT id, tenant_id, display_name,
           profile_metadata->'projects' AS pm_projects,
           profile_metadata->'resumeData'->'projects' AS rd_projects
    FROM candidates WHERE id = ${(await db.execute(sql`SELECT candidate_id FROM job_applications WHERE id = ${APP_ID}`)).rows[0].candidate_id}`)).rows;
  const profProjects = cand?.pm_projects || cand?.rd_projects || [];
  console.log('\n[4] CANDIDATE PROFILE PROJECTS (' + profProjects.length + ') for candidate ' + cand?.id);
  for (const p of profProjects) {
    console.log(JSON.stringify({ name: p.name || p.title, id: p.id || p.projectId, archived: p.isArchived || p.metadata?.portfolioStatus, url: p.repositoryUrl || p.url }));
  }

  // ---- Exact content of the downloaded artifact (the failing PDF) ----
  console.log('\n[5] DOWNLOADED ARTIFACT CONTENT (' + ARTIFACT_KEY + ')');
  try {
    const buf = await storage.getDecryptedDocument({ tenantId: app.tenant_id, storageKey: ARTIFACT_KEY });
    const h = crypto.createHash('sha256').update(buf).digest('hex');
    console.log('sha256=' + h + ' matchesDownloaded=' + (h === DL_HASH) + ' bytes=' + buf.length);
    const parser = new ResumeParserService();
    const text = parser.extractRawText({ buffer: buf, format: 'PDF' }) || '';
    const projProbes = ['Product-Data-Explorer', 'Product Data Explorer', 'Collaborative Task Manager', 'AI-Powered Code Review Assistant'];
    const presence = {};
    for (const probe of projProbes) presence[probe] = text.includes(probe);
    console.log(JSON.stringify({ projectTitlePresence: presence }, null, 1));
  } catch (e) {
    console.log('artifact read failed: ' + e.message);
  }

  // ---- Current kit artifact content (regenerated at 10:32:32, hash a4b0e044…) ----
  console.log('\n[6] CURRENT KIT RESUME ARTIFACT (' + (app.kit_pdf_key || 'n/a') + ')');
  try {
    if (app.kit_pdf_key) {
      const buf = await storage.getDecryptedDocument({ tenantId: app.tenant_id, storageKey: app.kit_pdf_key });
      const h = crypto.createHash('sha256').update(buf).digest('hex');
      console.log('sha256=' + h + ' matchesKitHash=' + (h === app.kit_pdf_hash));
      const parser = new ResumeParserService();
      const text = parser.extractRawText({ buffer: buf, format: 'PDF' }) || '';
      const projProbes = ['Product-Data-Explorer', 'Product Data Explorer', 'Collaborative Task Manager', 'AI-Powered Code Review Assistant'];
      const presence = {};
      for (const probe of projProbes) presence[probe] = text.includes(probe);
      const headline = text.slice(0, 160).replace(/\s+/g, ' ');
      console.log(JSON.stringify({ projectTitlePresence: presence, headline }, null, 1));
    }
  } catch (e) {
    console.log('kit artifact read failed: ' + e.message);
  }

  console.log('\n=== FORENSIC TRACE PART 3 END ===');
  await pool.end();
}

main().catch(async (e) => {
  console.error('FORENSIC TRACE 3 ERROR:', e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
