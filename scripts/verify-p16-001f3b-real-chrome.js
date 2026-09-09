/**
 * STEP 4-8: REAL CHROME VERIFICATION (P16-001F-3B).
 * Launches real Chrome with the aicareershub extension, injects the real user's
 * session cookie, opens the live Cloudflare Greenhouse job, runs Analyze ->
 * Prepare Handoff -> Resume download, then verifies snapshot/package/PDF.
 * No code changes; no data deletion; extension untouched.
 */
/* global WebSocket */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { db, pool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { createSession } from '../src/security/session.service.js';
import { ResumeParserService } from '../src/services/resume-parser.service.js';

const CHROME_PATH = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\chrome\\win64-152.0.7977.82\\chrome-win64\\chrome.exe';
const EXTENSION_DIR = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const DOWNLOAD_DIR = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\.tmp-downloads';
const SCREENSHOT_DIR = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\.tmp-screens';
const CDP_PORT = 9333;
const JOB_URL = 'https://job-boards.greenhouse.io/cloudflare/jobs/8102350?gh_jid=8102350';

for (const d of [DOWNLOAD_DIR, SCREENSHOT_DIR]) fs.mkdirSync(d, { recursive: true });

class CDPConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl; this.ws = null; this.nextId = 1; this.pending = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data.toString());
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(new Error(data.error.message || JSON.stringify(data.error)));
        else resolve(data.result);
      }
    });
  }
  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }
  async evaluate(expression, awaitPromise = true) {
    const res = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text || JSON.stringify(res.exceptionDetails);
      throw new Error('Eval error: ' + desc);
    }
    return res.result?.value;
  }
  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const outPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(outPath, Buffer.from(res.data, 'base64'));
    console.log('  [Screenshot] ' + filename);
  }
  close() { try { this.ws?.close(); } catch { /* noop */ } }
}

async function main() {
  const result = {};
  console.log('=== STEP 4-8 REAL CHROME VERIFICATION ===');

  // Server identity check
  const { execSync } = await import('node:child_process');
  const netstat = execSync('netstat -ano').toString().split('\n').filter((l) => l.includes(':3000') && l.includes('LISTENING'));
  console.log('[Server] listeners: ' + JSON.stringify(netstat.map((l) => l.trim())));

  // 1. Session for real user
  const [targetUser] = await db.select().from(schema.users).where(eq(schema.users.email, 'vishwanatnishad@gmail.com'));
  const [targetCand] = await db.select().from(schema.candidates).where(eq(schema.candidates.userId, targetUser.id));
  const session = await createSession(db, { userId: targetUser.id, tenantId: targetUser.tenantId });
  console.log('[Auth] user=' + targetUser.displayName + ' candidate=' + targetCand.id);

  // Record pre-existing downloads
  const preDownloads = new Set(fs.readdirSync(DOWNLOAD_DIR));

  // 2. Kill any Chrome already bound to CDP port (same policy as acceptance harness)
  try {
    const existing = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/version').catch(() => null);
    if (existing && existing.ok) {
      console.log('[Chrome] pre-existing Chrome on CDP port — terminating');
      try { execSync('powershell -Command "Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force"'); } catch { /* noop */ }
      await sleep(1500);
    }
  } catch { /* noop */ }

  // 3. Launch Chrome
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cft-verify-'));
  console.log('[Chrome] launching…');
  const chromeProcess = spawn(CHROME_PATH, [
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + profileDir,
    '--load-extension=' + EXTENSION_DIR,
    '--disable-extensions-except=' + EXTENSION_DIR,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { detached: false, stdio: 'ignore' });

  let versionInfo = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/version');
      if (res.ok) { versionInfo = await res.json(); break; }
    } catch { await sleep(500); }
  }
  if (!versionInfo) { chromeProcess.kill('SIGKILL'); throw new Error('Chrome did not start'); }
  console.log('[Chrome] connected: ' + versionInfo.Browser);

  const browserCdp = new CDPConnection(versionInfo.webSocketDebuggerUrl);
  await browserCdp.connect();

  let swTarget = null;
  for (let i = 0; i < 20; i++) {
    const t = await browserCdp.send('Target.getTargets');
    swTarget = t.targetInfos.find((x) => x.type === 'service_worker' && x.url.includes('background/service-worker.js'));
    if (swTarget) break;
    await sleep(500);
  }
  if (!swTarget) throw new Error('Extension service worker not found');
  const extensionId = swTarget.url.match(/chrome-extension:\/\/([a-z0-9]+)\//)[1];
  console.log('[Extension] id=' + extensionId);

  await browserCdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD_DIR, eventsEnabled: true });

  // Auth cookie
  const expires = Math.floor(Date.now() / 1000) + 7 * 86400;
  await browserCdp.send('Storage.setCookies', {
    cookies: [
      { name: 'career_hub_session', value: session.rawToken, domain: 'localhost', path: '/', httpOnly: true, expires },
      { name: 'career_hub_session', value: session.rawToken, url: 'http://localhost:3000/', httpOnly: true, expires },
    ],
  });
  console.log('[Auth] cookie injected');

  async function openTab(url) {
    const { targetId } = await browserCdp.send('Target.createTarget', { url });
    const list = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json();
    const t = list.find((x) => x.id === targetId);
    const conn = new CDPConnection(t.webSocketDebuggerUrl);
    await conn.connect();
    await conn.send('Page.enable');
    await conn.send('Runtime.enable');
    return { conn, targetId, evaluate: (e, a) => conn.evaluate(e, a), shot: (f) => conn.captureScreenshot(f), close: async () => { conn.close(); await browserCdp.send('Target.closeTarget', { targetId }); } };
  }

  async function resolveNumericTabId(urlFragment, maxAttempts = 10) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const targetsRes = await browserCdp.send('Target.getTargets');
        const swInfo = targetsRes.targetInfos.find((t) => t.type === 'service_worker' && t.url.includes('service-worker.js'));
        if (swInfo) {
          const { sessionId } = await browserCdp.send('Target.attachToTarget', { targetId: swInfo.targetId, flatten: true });
          const evalRes = await browserCdp.send('Runtime.evaluate', {
            expression: 'chrome.tabs.query({}).then(tabs => tabs.map(t => ({id: t.id, url: t.url, title: t.title})))',
            awaitPromise: true, returnByValue: true,
          }, sessionId);
          await browserCdp.send('Target.detachFromTarget', { sessionId }).catch(() => null);
          const tabs = evalRes?.result?.value;
          if (Array.isArray(tabs)) {
            const match = tabs.find((t) => t.url && t.url.includes(urlFragment));
            if (match) return match.id;
          }
        }
      } catch (e) { console.log('  [tabId] attempt ' + attempt + ': ' + e.message); }
      if (attempt < maxAttempts) await sleep(1000);
    }
    return null;
  }

  try {
    // 4. Open the live job page
    console.log('\n[STEP4] opening job page: ' + JOB_URL);
    const jobTab = await openTab(JOB_URL);
    await sleep(6000);

    const numericTabId = await resolveNumericTabId('greenhouse.io');
    if (!numericTabId) throw new Error('Could not resolve numeric tab id for greenhouse tab');
    console.log('[STEP4] job tab numeric id: ' + numericTabId);

    // 5. Open popup
    const popupUrl = 'chrome-extension://' + extensionId + '/popup/popup.html?tabId=' + numericTabId;
    const popup = await openTab(popupUrl);
    for (let i = 0; i < 20; i++) {
      try { await popup.evaluate('!!document.getElementById("authStatusText")'); break; } catch { await sleep(300); }
    }
    for (let i = 0; i < 20; i++) {
      const t = await popup.evaluate('document.getElementById("authStatusText")?.textContent?.trim() || ""');
      if (t && t !== 'Checking...') break;
      await sleep(300);
    }
    const authStatus = await popup.evaluate('document.getElementById("authStatusText")?.textContent?.trim() || ""');
    console.log('[STEP4] popup auth: ' + authStatus);
    if (authStatus !== 'Connected') throw new Error('Popup not authenticated: ' + authStatus);

    // Wait for job detection
    let detected = false;
    for (let i = 0; i < 40 && !detected; i++) {
      detected = await popup.evaluate('!document.getElementById("stateDetected")?.classList?.contains("hidden")');
      if (!detected) {
        const noJob = await popup.evaluate('!document.getElementById("stateNoJob")?.classList?.contains("hidden")');
        if (noJob) { await sleep(2500); await popup.evaluate('document.getElementById("retryDetectBtn")?.click()'); }
        else await sleep(500);
      }
    }
    if (!detected) throw new Error('Job detection did not complete');
    const detectedTitle = await popup.evaluate('document.getElementById("jobTitle")?.textContent?.trim()');
    console.log('[STEP4] detected job: ' + detectedTitle);
    await popup.shot('v-01-detected.png');

    // 6. Analyze
    console.log('\n[STEP4] clicking Analyze…');
    await popup.evaluate('document.getElementById("analyzeJobBtn").click()');
    let analysisReady = false;
    for (let i = 0; i < 60 && !analysisReady; i++) {
      await sleep(1000);
      analysisReady = await popup.evaluate('!document.getElementById("stateAnalysis")?.classList?.contains("hidden")');
    }
    if (!analysisReady) {
      const alert = await popup.evaluate('document.getElementById("alertMessage")?.textContent?.trim() || ""');
      throw new Error('Analysis did not complete: ' + alert);
    }
    const fitScore = await popup.evaluate('document.getElementById("fitScoreNum")?.textContent?.trim()');
    const fitGrade = await popup.evaluate('document.getElementById("fitGradeBadge")?.textContent?.trim()');
    const uiProjects = await popup.evaluate('Array.from(document.getElementById("featuredProjectsList")?.children || []).map(c => c.textContent.trim())');
    console.log('[STEP4] fit: ' + fitScore + ' ' + fitGrade);
    console.log('[STEP4] UI recommended projects:');
    for (const p of uiProjects) console.log('   ' + p);
    await popup.shot('v-02-analysis.png');
    result.uiProjects = uiProjects;

    // 7. Prepare Handoff
    console.log('\n[STEP4] clicking Prepare Handoff Kit…');
    await popup.evaluate('document.getElementById("prepareHandoffBtn").click()');
    let handoffReady = false;
    for (let i = 0; i < 75 && !handoffReady; i++) {
      await sleep(2000);
      handoffReady = await popup.evaluate('!document.getElementById("stateHandoffReady")?.classList?.contains("hidden")');
      if (!handoffReady && i % 15 === 14) {
        const alert = await popup.evaluate('document.getElementById("alertMessage")?.textContent?.trim() || ""');
        console.log('   [handoff wait ' + (i + 1) * 2 + 's] alert: ' + alert);
      }
    }
    if (!handoffReady) {
      const alert = await popup.evaluate('document.getElementById("alertMessage")?.textContent?.trim() || ""');
      await popup.shot('v-handoff-timeout.png');
      throw new Error('Handoff did not complete: ' + alert);
    }
    const lifecycleAction = await popup.evaluate('document.getElementById("lifecycleActionBadge")?.textContent?.trim()');
    const validationStatus = await popup.evaluate('document.getElementById("statusValidationBadge")?.textContent?.trim()');
    const resumeStatus = await popup.evaluate('document.getElementById("statusResumeBadge")?.textContent?.trim()');
    const parseability = await popup.evaluate('document.getElementById("telParseability")?.textContent?.trim()');
    const jobMatch = await popup.evaluate('document.getElementById("telJobMatch")?.textContent?.trim()');
    const evidenceCoverage = await popup.evaluate('document.getElementById("telEvidenceCoverage")?.textContent?.trim()');
    console.log('[STEP4] handoff READY: action=' + lifecycleAction + ' validation=' + validationStatus + ' resume=' + resumeStatus);
    console.log('[STEP4] telemetry: parseability=' + parseability + ' jobMatch=' + jobMatch + ' evidence=' + evidenceCoverage);
    await popup.shot('v-03-handoff-ready.png');
    result.lifecycleAction = lifecycleAction;
    result.validationStatus = validationStatus;

    // 8. Download resume
    console.log('\n[STEP4] downloading resume PDF…');
    await popup.evaluate('document.getElementById("downloadResumeBtn").click()');
    await sleep(8000);
    await jobTab.close();
    await popup.close();
  } finally {
    chromeProcess.kill();
  }

  // ---------------- SERVER-SIDE VERIFICATION (STEPS 5-8) ----------------
  console.log('\n[STEP5] latest snapshot for candidate…');
  const snap = (await db.execute(sql`
    SELECT id, canonical_job_id, job_content_hash, analyzed_at, project_rankings
    FROM job_analysis_snapshots
    WHERE candidate_id = ${targetCand.id}
    ORDER BY analyzed_at DESC LIMIT 1`)).rows[0];
  if (!snap) throw new Error('No snapshot row found for candidate');
  const snapRankings = snap.project_rankings || [];
  result.snapshotId = snap.id;
  console.log(JSON.stringify({
    snapshotId: snap.id,
    canonicalJobId: snap.canonical_job_id,
    analyzedAt: snap.analyzed_at,
    jobContentHash: snap.job_content_hash.slice(0, 16) + '…',
    rankings: snapRankings.map((r) => ({ name: r.projectName || r.name, score: r.relevanceScore, rank: r.relevanceRank })),
  }, null, 1));

  console.log('\n[STEP7] latest package for application 2f71f4cf…');
  const pkg = (await db.execute(sql`
    SELECT version, package_hash, lifecycle_state, prepared_at,
           package_payload->>'generationContractVersion' AS contract,
           package_payload->'structuredResume'->>'schemaVersion' AS sr_schema,
           package_payload->'structuredResume'->'projects' AS sr_projects,
           package_payload->'tailoringPlan'->'selectedProjectIds' AS plan_ids,
           package_payload->'targetJob'->'jobFitAnalysis'->>'source' AS fit_source,
           package_payload->'targetJob'->'jobFitAnalysis'->>'snapshotId' AS fit_snapshot_id,
           package_payload->'targetJob'->'jobFitAnalysis'->'projectRankings' AS fit_rankings,
           package_payload->'structuredResume'->'candidateIdentity'->>'headline' AS headline,
           package_payload->'structuredResume'->'summary'->>'text' AS summary_text
    FROM application_packages
    WHERE application_id = '2f71f4cf-0f86-43eb-b1c0-687e2e2d2d1c'
    ORDER BY version DESC LIMIT 1`)).rows[0];
  if (!pkg) throw new Error('No package found');
  const srProjects = pkg.sr_projects || [];
  result.packageVersion = pkg.version;
  result.contract = pkg.contract;
  console.log(JSON.stringify({
    version: pkg.version,
    lifecycleState: pkg.lifecycle_state,
    packageHash: pkg.package_hash.slice(0, 16) + '…',
    generationContractVersion: pkg.contract,
    structuredResumeSchemaVersion: pkg.sr_schema,
    fitSource: pkg.fit_source,
    fitSnapshotId: pkg.fit_snapshot_id,
    fitRankings: (pkg.fit_rankings || []).map((r) => ({ name: r.projectName || r.name, score: r.relevanceScore, rank: r.relevanceRank })),
    headline: pkg.headline,
    summaryFirst140: (pkg.summary_text || '').slice(0, 140),
    structuredResumeProjects: srProjects.map((p) => ({ name: p.name, rank: p.rank, score: p.relevanceScore })),
  }, null, 1));

  // Kit resume hash
  const kit = (await db.execute(sql`
    SELECT metadata->'handoffKit'->>'packageHash' AS kit_hash,
           metadata->'handoffKit'->'resume'->>'contentHash' AS pdf_hash
    FROM job_applications WHERE id = '2f71f4cf-0f86-43eb-b1c0-687e2e2d2d1c'`)).rows[0];
  console.log('\n[STEP8] kit: packageHash=' + (kit.kit_hash || '').slice(0, 16) + '… pdfHash=' + (kit.pdf_hash || '').slice(0, 16) + '…');

  // Identify the downloaded PDF matching the new kit hash
  console.log('\n[STEP8] downloaded PDF identity…');
  const crypto = await import('node:crypto');
  let downloadedBytes = null;
  const newFiles = fs.readdirSync(DOWNLOAD_DIR).filter((f) => !preDownloads.has(f));
  console.log('   new download files: ' + JSON.stringify(newFiles));
  const pdfCandidates = newFiles.filter((f) => f.endsWith('.pdf'));
  let matchedPdf = null;
  for (const f of pdfCandidates) {
    const bytes = fs.readFileSync(path.join(DOWNLOAD_DIR, f));
    const h = crypto.createHash('sha256').update(bytes).digest('hex');
    if (h === kit.pdf_hash) { matchedPdf = f; downloadedBytes = bytes; break; }
  }
  if (!matchedPdf && pdfCandidates.length > 0) {
    downloadedBytes = fs.readFileSync(path.join(DOWNLOAD_DIR, pdfCandidates[0]));
    matchedPdf = pdfCandidates[0];
    console.log('   WARN: no exact kit-hash match; using newest pdf ' + matchedPdf);
  }
  if (!downloadedBytes) throw new Error('No resume PDF downloaded');

  const parser = new ResumeParserService();
  const text = parser.extractRawText({ buffer: downloadedBytes, format: 'PDF' }) || '';
  const probes = {
    'Product-Data-Explorer': /product[\s-]*data[\s-]*explorer/i.test(text),
    'Collaborative Task Manager': /collaborative[\s-]*task[\s-]*manager/i.test(text),
    'AI-Powered Code Review Assistant': /ai[\s-]*powered[\s-]*code[\s-]*review/i.test(text),
    oldGenericHeading_FullStackBackend: /full-stack & backend developer/i.test(text),
  };
  const pdeIdx = text.search(/product[\s-]*data[\s-]*explorer/i);
  const ctmIdx = text.search(/collaborative[\s-]*task[\s-]*manager/i);
  const acraIdx = text.search(/ai[\s-]*powered[\s-]*code[\s-]*review/i);
  const orderOk = pdeIdx >= 0 && (pdeIdx < ctmIdx || ctmIdx < 0) && (pdeIdx < acraIdx || acraIdx < 0);
  console.log(JSON.stringify({
    matchedPdf,
    projectPresence: probes,
    firstMentionOrder: { pde: pdeIdx, ctm: ctmIdx, acra: acraIdx },
    pdeBeforeOthers: orderOk,
    pdfHeadlineExcerpt: text.slice(0, 220).replace(/\s+/g, ' '),
    pdfSummaryExcerpt: (text.match(/PROFESSIONAL SUMMARY\s+([\s\S]{0,200})/i)?.[1] || '').replace(/\s+/g, ' ').slice(0, 200),
  }, null, 1));

  // Final verdict
  const srNames = srProjects.map((p) => (p.name || '').toLowerCase());
  const verdict = {
    snapshotPersisted: Boolean(snap.id),
    snapshotPdeRank1: (snapRankings[0]?.projectName || snapRankings[0]?.name || '').toLowerCase().includes('product-data-explorer'),
    packageStructured: pkg.contract === 'P16-001F' && srProjects.length > 0,
    pdeFirstInStructuredResume: (srNames[0] || '').includes('product-data-explorer'),
    pdeInPdf: probes['Product-Data-Explorer'],
    pdeFirstInPdf: orderOk,
    tailoredHeading: !probes.oldGenericHeading_FullStackBackend,
  };
  verdict.OVERALL = Object.values(verdict).every(Boolean) ? 'PASS' : 'FAIL';
  console.log('\n=== VERDICT ===');
  console.log(JSON.stringify(verdict, null, 1));
  result.verdict = verdict;

  await pool.end();
  return result;
}

main().catch(async (e) => {
  console.error('CHROME VERIFY ERROR:', e.message);
  try { await pool.end(); } catch { /* noop */ }
  process.exit(1);
});
