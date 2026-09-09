/**
 * READ-ONLY FORENSIC TRACE (P16-001F-3B diagnostic).
 * SELECT-only DB access. Decrypts stored artifacts in memory only. No writes.
 * Usage: node scripts/forensic-trace-p16-001f3b.js
 */
import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { DocumentStorageService } from '../src/services/document-storage.service.js';
import crypto from 'node:crypto';

const CANONICAL_JOB_URL = 'https://job-boards.greenhouse.io/cloudflare/jobs/8102350';
const names = (arr) => (Array.isArray(arr) ? arr.map((p) => p?.name || p?.displayName || p?.projectName || JSON.stringify(p)).filter(Boolean) : null);
const short = (s) => (typeof s === 'string' && s.length > 24 ? s.slice(0, 12) + '…(' + s.length + ')' : s);

const storage = new DocumentStorageService();

async function main() {
  console.log('=== FORENSIC TRACE START ===');

  // ---- 1. Find the application for the Cloudflare job ----
  const apps = await db.execute(
    `SELECT id, tenant_id, candidate_id, canonical_job_id, normalized_job_url, company_name, job_title,
            status, metadata->'currentPackageHash' AS cur_hash, metadata->'currentPackageVersion' AS cur_ver,
            metadata->'handoffKit'->>'packageHash' AS kit_hash,
            metadata->'handoffKit'->>'generationContractVersion' AS kit_contract,
            metadata->'handoffKit'->>'structuredResumeSchemaVersion' AS kit_schema,
            created_at, updated_at
     FROM job_applications
     WHERE canonical_job_id ILIKE '%cloudflare%8102350%' OR normalized_job_url ILIKE '%8102350%'
     ORDER BY created_at DESC`
  );
  const app = apps.rows[0];
  if (!app) {
    console.log('NO APPLICATION FOUND for Cloudflare 8102350');
    await pool.end();
    return;
  }
  const appId = app.id;
  console.log('\n[1] APPLICATION');
  console.log(JSON.stringify({ ...app, metadata: undefined }, (k, v) => (k === 'metadata' ? undefined : v), 2));

  // ---- 2. Snapshot rows for this canonical job + candidate ----
  const snaps = await db.execute(
    sql`SELECT id, contract_version, tenant_id, candidate_id, canonical_job_id, normalized_job_url, job_content_hash,
            analyzed_at, overall_fit, project_rankings, metadata->'topRelevantProjects' AS top_rel,
            NOW() - analyzed_at AS age, (NOW() - analyzed_at) < interval '2 hours' AS fresh
     FROM job_analysis_snapshots
     WHERE tenant_id = ${app.tenant_id} AND candidate_id = ${app.candidate_id} AND (canonical_job_id ILIKE ${'%8102350%'} OR normalized_job_url ILIKE ${'%8102350%'})
     ORDER BY analyzed_at DESC`
  );
  console.log('\n[2] JOB ANALYSIS SNAPSHOTS (' + snaps.rows.length + ')');
  for (const s of snaps.rows) {
    console.log(JSON.stringify({
      snapshotId: s.id,
      contractVersion: s.contract_version,
      analyzedAt: s.analyzed_at,
      age: s.age,
      freshUnder2h: s.fresh,
      jobContentHash: short(s.job_content_hash),
      projectRankings: names(s.project_rankings),
      topRelevantProjects: names(s.top_rel),
      fullProjectRankings: s.project_rankings,
    }, null, 2));
  }

  // ---- 3. All package versions for this application ----
  const pkgs = await db.execute(
    sql`SELECT id, version, package_hash, lifecycle_state, source, prepared_at,
            package_payload->>'generationContractVersion' AS contract,
            package_payload->>'structuredResumeSchemaVersion' AS schema_ver,
            package_payload->'tailoredResume'->>'generationContractVersion' AS tr_contract,
            package_payload->'structuredResume'->>'schemaVersion' AS sr_schema,
            package_payload->'structuredResume'->'projects' AS sr_projects,
            package_payload->'tailoringPlan'->'selectedProjectIds' AS plan_proj_ids,
            package_payload->'tailoredResume'->'selectedProjects' AS tr_selected,
            package_payload->'targetJob'->'jobFitAnalysis'->>'snapshotId' AS fit_snapshot_id,
            package_payload->'targetJob'->'jobFitAnalysis'->>'source' AS fit_source,
            package_payload->'targetJob'->'jobFitAnalysis'->'projectRankings' AS fit_rankings,
            answers->'jobFitAnalysis'->'projectRankings' AS answers_rankings
     FROM application_packages
     WHERE tenant_id = ${app.tenant_id} AND application_id = ${appId}
     ORDER BY version ASC`
  );
  console.log('\n[3] PACKAGE VERSIONS (' + pkgs.rows.length + ')');
  for (const p of pkgs.rows) {
    console.log(JSON.stringify({
      version: p.version,
      lifecycleState: p.lifecycle_state,
      packageHash: short(p.package_hash),
      preparedAt: p.prepared_at,
      source: p.source,
      generationContractVersion: p.contract || p.tr_contract,
      structuredResumeSchemaVersion: p.sr_schema || p.schema_ver,
      jobFitAnalysisSnapshotId: p.fit_snapshot_id,
      jobFitAnalysisSource: p.fit_source,
      jobFitAnalysisProjectRankings: names(p.fit_rankings),
      tailoringPlanSelectedProjectIds: p.plan_proj_ids,
      structuredResumeProjects: names(p.sr_projects),
      structuredResumeProjectsFull: p.sr_projects?.map((x) => ({ projectId: x.projectId, name: x.name, rank: x.rank, relevanceScore: x.relevanceScore })),
      tailoredResumeSelectedProjects: names(p.tr_selected),
      answersJobFitAnalysisProjectRankings: names(p.answers_rankings),
    }, null, 2));
  }

  // ---- 4. CURRENT package details: kit + resume markdown project order ----
  const cur = pkgs.rows.find((p) => p.lifecycle_state === 'CURRENT') || pkgs.rows[pkgs.rows.length - 1];
  const payloadRow = await db.execute(
    sql`SELECT package_payload FROM application_packages WHERE tenant_id = ${app.tenant_id} AND application_id = ${appId} AND version = ${cur.version}`
  );
  const payload = payloadRow.rows[0]?.package_payload || {};
  const tr = payload.tailoredResume || {};
  const md = tr.markdownContent || '';
  const mdProjects = [...md.matchAll(/^###\s+(?:\[[^\]]*\]\([^)]*\)|([^(#\n]+))/gm)].map((m) => (m[1] || m[0]).replace(/^###\s*/, '').trim());
  console.log('\n[4] CURRENT PACKAGE (v' + cur.version + ') DETAILS');
  console.log(JSON.stringify({
    selectedSections: tr.selectedSections || payload.selectedSections || null,
    markdownProjectHeaders: mdProjects,
    summaryFirst120: (payload.structuredResume?.summary?.text || md.split('\n').find((l) => l && !l.startsWith('#') && l.length > 40) || '').slice(0, 120),
    targetJobJobFitAnalysisSource: payload.targetJob?.jobFitAnalysis?.source,
    targetJobJobFitAnalysisSnapshotId: payload.targetJob?.jobFitAnalysis?.snapshotId,
    targetJobJobFitAnalysisAuthoritativeRankings: names(payload.targetJob?.jobFitAnalysis?.authoritativeRankings),
    targetJobProjectRankings: names(payload.targetJob?.projectRankings),
    recommendedProjects: payload.targetJob?.recommendedProjects,
    portfolioLinks: (payload.portfolioLinks || []).map((l) => l.projectName),
    jobFitAnalysisTopLevel: payload.jobFitAnalysis ? { source: payload.jobFitAnalysis.source, snapshotId: payload.jobFitAnalysis.snapshotId, rankings: names(payload.jobFitAnalysis.projectRankings) } : null,
  }, null, 2));

  // ---- 5. Handoff kit reuse evidence + artifact identity ----
  const kit = app.kit_hash ? (await db.execute(sql`SELECT metadata->'handoffKit' AS kit FROM job_applications WHERE id = ${appId}`)).rows[0]?.kit : null;
  console.log('\n[5] HANDOFF KIT (persisted on application metadata)');
  if (kit) {
    const resumeArt = kit.resume || {};
    console.log(JSON.stringify({
      kitPackageHash: short(kit.packageHash),
      appCurrentPackageHash: short(app.cur_hash),
      HASH_MATCH: kit.packageHash === app.cur_hash,
      generationContractVersion: kit.generationContractVersion,
      structuredResumeSchemaVersion: kit.structuredResumeSchemaVersion,
      generatedAt: kit.generatedAt,
      resumeContentHash: resumeArt.contentHash,
      resumeStorageKey: resumeArt.storageKey,
      resumeTexStorageKey: resumeArt.texStorageKey,
      resumeQaScore: resumeArt.qaAudit?.score,
      resumeQaPassed: resumeArt.qaAudit?.passed,
    }, null, 2));
  } else {
    console.log('No handoffKit persisted on application metadata.');
  }

  // ---- 6. PDF evidence: downloaded PDF hash vs kit hash vs stored artifact ----
  console.log('\n[6] PDF EVIDENCE (downloaded tailored-resume.pdf)');
  try {
    const fs = await import('node:fs/promises');
    const pdfBytes = await fs.readFile('.tmp-downloads/tailored-resume.pdf');
    const pdfHash = crypto.createHash('sha256').update(pdfBytes).digest('hex');
    const kitResumeHash = kit?.resume?.contentHash;
    console.log(JSON.stringify({
      downloadedPdfSha256: pdfHash,
      kitResumePdfContentHash: kitResumeHash,
      DOWNLOADED_PDF_MATCHES_KIT: kitResumeHash ? pdfHash === kitResumeHash : 'kit hash unavailable',
    }, null, 2));
    if (kit?.resume?.texStorageKey && kitResumeHash && pdfHash !== kitResumeHash) {
      console.log('NOTE: downloaded PDF differs from kit resume contentHash — downloaded file may be from a different run.');
    }
  } catch (e) {
    console.log('Could not read downloaded PDF: ' + e.message);
  }

  // ---- 7. LaTeX source of the CURRENT kit: project order emitted ----
  console.log('\n[7] LATEX SOURCE (decrypted .tex of current kit resume)');
  try {
    if (kit?.resume?.texStorageKey) {
      const texBuf = await storage.getDecryptedDocument({ tenantId: app.tenant_id, storageKey: kit.resume.texStorageKey });
      const tex = texBuf.toString('utf8');
      const projMatches = [...tex.matchAll(/\\textbf\{([^}]+)\}(?=[\s\S]{0,120}?\\atssection|[\s\S]{0,120}?\\href)/g)].map((m) => m[1]);
      const projectSection = tex.split('Technical Projects')[1] || tex.split('atssection{Projects}')[1] || '';
      const texProjectNames = [...projectSection.matchAll(/\\textbf\{([^}]+)\}/g)].map((m) => m[1]);
      console.log(JSON.stringify({ texProjectNamesInOrder: texProjectNames, summaryInTex: (tex.match(/Professional Summary\}([\s\S]{0,300})/)?.[1] || '').slice(0, 200).replace(/\s+/g, ' ') }, null, 2));
    } else {
      console.log('No texStorageKey on kit resume.');
    }
  } catch (e) {
    console.log('Tex decryption failed: ' + e.message);
  }

  console.log('\n=== FORENSIC TRACE END ===');
  await pool.end();
}

main().catch(async (e) => {
  console.error('FORENSIC TRACE ERROR:', e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
