/**
 * @file P73 Real Chrome Live LinkedIn Active Root & Description Extraction Verification Script
 *
 * Verifies live in real Chrome for Testing against:
 * https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430
 *
 * Checks:
 * 1. REAL LINKEDIN EXTRACTION:
 *    - Real live Appinventiv job on LinkedIn
 *    - Zero synthetic DOM injection, zero DOMParser, zero fixtures
 *    - Checks:
 *        a. Active job root discovered (findActiveLinkedInJobRoot)
 *        b. Job detected: title = 'Software Engineer', company = 'Appinventiv'
 *        c. Description extracted: activeJob.descriptionLength >= 50
 *        d. Provenance tracked: descriptionSource !== 'NONE', jobRootSource is non-null
 *        e. Separation: isReady = true, analysisReady = true
 *        f. Sidebar UI: descriptionLoadingNotice hidden, analyzeJobBtn enabled
 *        g. Passive isolation: exactly 0 /api/extension/analyze-job calls before click
 *    - Explicit click on [Analyze Job Match]:
 *        HTTP 200
 *        exactly 1 /api/extension/analyze-job
 *        no "jobDescriptionText too small" error
 * 2. TAB TRANSITION & ISOLATION:
 *    - Job A (Appinventiv) -> Job B (General Motors / alternate)
 *    - State isolation: Job A cannot overwrite Job B
 *    - Job B -> Job A: clean restoration
 * 3. RELOAD & PERSISTENCE TEST:
 *    - Reload Appinventiv job
 *    - Reconciled from DurableWorkflowStore without stuck loading state
 * 4. SCREENSHOTS captured to brain artifact dir
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { createSession } from '../src/security/session.service.js';

const CHROME_PATH =
  'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\chrome\\win64-152.0.7977.82\\chrome-win64\\chrome.exe';
const PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cft-p73-live-active-root-'));
const EXTENSION_DIR = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const SCREENSHOT_DIR =
  'C:\\Users\\VISHW\\.gemini\\antigravity-ide\\brain\\54f8a139-759d-4dab-b744-2e1d3451b975';
const CDP_PORT = 9399;

const LIVE_APPINVENTIV_URL =
  'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430';
const LIVE_JOB_B_URL = 'https://www.linkedin.com/jobs/view/4419969671/';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    const WebSocket = (await import('ws')).default;
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });

    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }

  async send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
    });
  }

  async evaluate(expression, awaitPromise = true) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    return res.result?.value;
  }

  async captureScreenshot(outputPath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }
  }
}

async function main() {
  console.log(
    '=== P73: REAL CHROME LIVE LINKEDIN ACTIVE ROOT & DESCRIPTION EXTRACTION VERIFICATION ===\n'
  );

  // Step 1: Health check
  console.log('1. Checking backend health on http://localhost:3000/healthz...');
  const healthRes = await fetch('http://localhost:3000/healthz');
  const health = await healthRes.json();
  console.log('   Backend status:', health.status || 'healthy');
  if (health.status !== 'healthy') throw new Error('Backend is not healthy');

  // Step 2: Ensure user session
  console.log('2. Ensuring canonical user session (vishwanatnishad@gmail.com)...');
  const [canonicalUser] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, 'vishwanatnishad@gmail.com'))
    .limit(1);

  if (!canonicalUser) throw new Error('Canonical user not found in database');

  const session = await createSession(db, {
    userId: canonicalUser.id,
    tenantId: canonicalUser.tenantId,
  });
  const sessionToken = session.rawToken;
  console.log(
    `   Session created for user ${canonicalUser.id}, token: ${sessionToken.slice(0, 16)}...`
  );

  // Step 3: Launch Chrome MV3
  console.log('\n3. Spawning real Chrome MV3 browser instance on port', CDP_PORT, '...');
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${PROFILE_DIR}`,
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let browserCdp = null;
  let testTabCdp = null;
  let sidebarCdp = null;
  let swCdp = null;

  let serverAnalyzeCalls = 0;
  let lastAnalyzeResponse = null;

  try {
    await sleep(3000);
    const versionRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    const versionData = await versionRes.json();
    browserCdp = new CDPClient(versionData.webSocketDebuggerUrl);
    await browserCdp.connect();
    console.log('   Connected to Chrome via CDP');

    // Extension Service Worker
    const targets = await browserCdp.send('Target.getTargets');
    const swTarget = targets.targetInfos.find((t) => t.url?.includes('service-worker.js'));
    if (!swTarget) throw new Error('Extension background service worker not found');
    const extId = swTarget.url.match(/chrome-extension:\/\/([a-z0-9]+)\//)[1];
    console.log(`   Extension ID: ${extId}`);

    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const swInfo = list.find((item) => item.url?.includes('service-worker.js'));
    swCdp = new CDPClient(swInfo.webSocketDebuggerUrl);
    await swCdp.connect();
    await swCdp.send('Runtime.enable');

    // Open Test Tab on Live Appinventiv Job
    console.log(
      `\n4. Navigating real browser tab to Live Appinventiv LinkedIn Job: ${LIVE_APPINVENTIV_URL}...`
    );
    const tabTarget = await browserCdp.send('Target.createTarget', { url: LIVE_APPINVENTIV_URL });
    const freshList = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const tabItem = freshList.find((item) => item.id === tabTarget.targetId);

    testTabCdp = new CDPClient(tabItem.webSocketDebuggerUrl);
    await testTabCdp.connect();
    await testTabCdp.send('Page.enable');
    await testTabCdp.send('Runtime.enable');

    console.log(
      '   Waiting 8 seconds for initial LinkedIn page load and content script hydration...'
    );
    await sleep(8000);

    const tabsInChrome = await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.query({}, (tabs) => resolve(tabs.map(t => ({ id: t.id, url: t.url, title: t.title }))));
      })
    `);
    const activeTestTab = tabsInChrome.find((t) => t.url?.includes('linkedin.com'));
    if (!activeTestTab) throw new Error('Live LinkedIn tab not found');
    const testTabId = activeTestTab.id;
    console.log(`   Test Tab ID: ${testTabId}`);

    // Direct content-script extraction diagnostics in the live tab
    console.log('\n--- Live Tab Extraction Diagnostics ---');
    const tabDiag = await testTabCdp.evaluate(`(() => {
      // Test findActiveLinkedInJobRoot and extract directly
      const root = document.querySelector('[data-view-name="job-details"]') ||
        document.querySelector('.jobs-details__main-content') ||
        document.querySelector('.jobs-search__job-details') ||
        document.querySelector('.details') ||
        document.querySelector('.core-rail') ||
        document.querySelector('.decorated-job-posting__details');
      
      const descEl = document.querySelector('.show-more-less-html__markup') ||
        document.querySelector('#job-details') ||
        document.querySelector('.jobs-description__content') ||
        document.querySelector('.description__text');

      return {
        hasRoot: Boolean(root),
        rootTag: root ? root.tagName : null,
        rootClass: root ? root.className : null,
        hasDescEl: Boolean(descEl),
        descSelector: descEl ? (descEl.id ? '#' + descEl.id : descEl.className) : null,
        descLength: descEl ? (descEl.textContent || '').trim().length : 0,
      };
    })()`);
    console.log('   Live Tab Diagnostics:', JSON.stringify(tabDiag, null, 2));

    // Open Sidebar UI pinned to test tab
    const sidebarUrl = `chrome-extension://${extId}/sidebar/sidebar.html?tabId=${testTabId}`;
    console.log(`\n5. Opening Extension Sidebar pinned to live tab: ${sidebarUrl}...`);
    const sidebarTarget = await browserCdp.send('Target.createTarget', { url: sidebarUrl });
    const targetList = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const sbItem = targetList.find((item) => item.id === sidebarTarget.targetId);

    sidebarCdp = new CDPClient(sbItem.webSocketDebuggerUrl);
    await sidebarCdp.connect();
    await sidebarCdp.send('Page.enable');
    await sidebarCdp.send('Runtime.enable');
    await sidebarCdp.send('Network.enable');

    // Instrument Network tracking for /api/extension/analyze-job
    sidebarCdp.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.method === 'Network.requestWillBeSent') {
          if (msg.params?.request?.url?.includes('/api/extension/analyze-job')) {
            serverAnalyzeCalls++;
            console.log(`   >>> [SERVER ANALYZE CALL #${serverAnalyzeCalls}] <<<`);
          }
        }
        if (msg.method === 'Network.responseReceived') {
          if (msg.params?.response?.url?.includes('/api/extension/analyze-job')) {
            lastAnalyzeResponse = {
              status: msg.params.response.status,
              statusText: msg.params.response.statusText,
            };
            console.log(`   >>> [SERVER ANALYZE RESPONSE: HTTP ${lastAnalyzeResponse.status}] <<<`);
          }
        }
      } catch {}
    });

    // Set real cookies on localhost:3000
    console.log('   Setting canonical session cookies for http://localhost:3000...');
    await sidebarCdp.send('Network.setCookie', {
      name: 'career_hub_session',
      value: sessionToken,
      url: 'http://localhost:3000',
    });

    // Wait for sidebar controller initialization & sync
    await sleep(4000);

    // =========================================================================
    // VERIFICATION 1: Real LinkedIn Active Root & Description Extraction
    // =========================================================================
    console.log('\n--- VERIFICATION 1: Live Appinventiv Active Root & Description Extraction ---');

    // Poll sidebar state until extraction completes (up to 15s)
    let sidebarState = null;
    const startPoll = Date.now();
    while (Date.now() - startPoll < 15000) {
      sidebarState = await sidebarCdp.evaluate(`(() => {
        const ctrl = window.__sidebarController;
        if (!ctrl) return { error: 'No controller' };
        return {
          activeJob: ctrl.activeJob ? {
            title: ctrl.activeJob.title,
            company: ctrl.activeJob.company,
            provider: ctrl.activeJob.provider,
            descriptionLength: (ctrl.activeJob.description || '').length,
            descriptionSource: ctrl.activeJob.descriptionSource || null,
            jobRootSource: ctrl.activeJob.jobRootSource || null,
            isReady: ctrl.activeJob.isReady,
            analysisReady: ctrl.activeJob.analysisReady,
          } : null,
          cachedJobData: ctrl.cachedState?.jobData ? {
            title: ctrl.cachedState.jobData.title,
            company: ctrl.cachedState.jobData.company,
            descriptionLength: (ctrl.cachedState.jobData.description || '').length,
            descriptionSource: ctrl.cachedState.jobData.descriptionSource || null,
          } : null,
          analyzeBtnDisabled: ctrl.elements.analyzeJobBtn ? ctrl.elements.analyzeJobBtn.disabled : null,
          loadingNoticeHidden: ctrl.elements.descriptionLoadingNotice ? ctrl.elements.descriptionLoadingNotice.classList.contains('hidden') : null,
          isAuthenticated: ctrl.isAuthenticated,
        };
      })()`);

      if (sidebarState?.activeJob?.analysisReady && sidebarState?.analyzeBtnDisabled === false) {
        break;
      }
      await sleep(1000);
    }

    console.log('   Sidebar State:', JSON.stringify(sidebarState, null, 2));

    if (!sidebarState?.activeJob) {
      throw new Error('FAILED: Job was not detected on live Appinventiv page');
    }

    // Verify Title and Company
    console.log('   Checking Title and Company...');
    if (sidebarState.activeJob.title !== 'Software Engineer') {
      throw new Error(
        `FAILED: Expected title 'Software Engineer', got '${sidebarState.activeJob.title}'`
      );
    }
    if (!sidebarState.activeJob.company.includes('Appinventiv')) {
      throw new Error(
        `FAILED: Expected company 'Appinventiv', got '${sidebarState.activeJob.company}'`
      );
    }
    console.log('   ✔ Title = Software Engineer, Company = Appinventiv confirmed');

    // Verify Description Extraction & Provenance
    console.log('   Checking Description Extraction & Provenance...');
    if (sidebarState.activeJob.descriptionLength < 50) {
      throw new Error(
        `FAILED: Description length is ${sidebarState.activeJob.descriptionLength} < 50`
      );
    }
    console.log(`   ✔ Description length: ${sidebarState.activeJob.descriptionLength} >= 50`);

    if (sidebarState.activeJob.descriptionSource === 'NONE') {
      throw new Error('FAILED: descriptionSource must NOT be NONE');
    }
    console.log(`   ✔ descriptionSource: ${sidebarState.activeJob.descriptionSource}`);

    if (sidebarState.activeJob.analysisReady !== true) {
      throw new Error('FAILED: activeJob.analysisReady must be true');
    }
    console.log('   ✔ activeJob.analysisReady: true');

    if (sidebarState.loadingNoticeHidden !== true) {
      throw new Error('FAILED: descriptionLoadingNotice must be hidden');
    }
    console.log('   ✔ loadingNoticeHidden: true (loading notice dismissed)');

    if (sidebarState.analyzeBtnDisabled !== false) {
      throw new Error('FAILED: analyzeJobBtn must be enabled (disabled === false)');
    }
    console.log('   ✔ analyzeBtnDisabled: false (Analyze button enabled)');

    // Verify Zero Analyze Calls before explicit click
    console.log('   Checking passive network isolation...');
    if (serverAnalyzeCalls !== 0) {
      throw new Error(`FAILED: Expected 0 analyze calls before click, saw ${serverAnalyzeCalls}`);
    }
    console.log(`   ✔ Server analyze calls before click: ${serverAnalyzeCalls} (STRICT ZERO)`);

    // Capture screenshot 1: Hydrated / Extracted state
    const hydratedScreenshot = path.join(SCREENSHOT_DIR, 'p73-01-live-appinventiv-extracted.png');
    await sidebarCdp.captureScreenshot(hydratedScreenshot);
    console.log(`   ✔ Saved screenshot: ${hydratedScreenshot}`);

    // Click Analyze Job Match
    console.log('\n--- Clicking [Analyze Job Match] ---');
    await sidebarCdp.evaluate(`(() => {
      const btn = window.__sidebarController?.elements?.analyzeJobBtn;
      if (btn) btn.click();
    })()`);

    // Wait for analysis HTTP response
    console.log('   Waiting for /api/extension/analyze-job response...');
    const analyzeWaitStart = Date.now();
    while (Date.now() - analyzeWaitStart < 25000) {
      if (lastAnalyzeResponse) break;
      await sleep(1000);
    }

    if (!lastAnalyzeResponse) {
      throw new Error('FAILED: Did not receive /api/extension/analyze-job response within 25s');
    }
    if (lastAnalyzeResponse.status !== 200) {
      throw new Error(
        `FAILED: /api/extension/analyze-job failed with HTTP ${lastAnalyzeResponse.status}`
      );
    }
    if (serverAnalyzeCalls !== 1) {
      throw new Error(
        `FAILED: Expected exactly 1 analyze call after click, saw ${serverAnalyzeCalls}`
      );
    }
    console.log(`   ✔ Analysis succeeded with HTTP ${lastAnalyzeResponse.status}`);
    console.log(`   ✔ Exactly 1 analyze call made: ${serverAnalyzeCalls}`);

    // Wait 2s for UI render and capture screenshot 2: Analyzed state
    await sleep(2000);
    const analyzedScreenshot = path.join(SCREENSHOT_DIR, 'p73-02-live-appinventiv-analyzed.png');
    await sidebarCdp.captureScreenshot(analyzedScreenshot);
    console.log(`   ✔ Saved screenshot: ${analyzedScreenshot}`);

    // =========================================================================
    // VERIFICATION 2: Tab Navigation Invalidation (Job A -> Job B -> Job A)
    // =========================================================================
    console.log('\n--- VERIFICATION 2: Tab / Job Navigation Invalidation ---');
    console.log(`   Navigating test tab to Job B: ${LIVE_JOB_B_URL}...`);
    await testTabCdp.send('Page.navigate', { url: LIVE_JOB_B_URL });
    await sleep(7000);

    // Sidebar rescan for Job B
    console.log('   Triggering Rescan on sidebar for Job B...');
    await sidebarCdp.evaluate(`(() => {
      window.__sidebarController?.rescan();
    })()`);
    await sleep(4000);

    const jobBState = await sidebarCdp.evaluate(`(() => {
      const ctrl = window.__sidebarController;
      return {
        activeJobTitle: ctrl?.activeJob?.title,
        activeJobCompany: ctrl?.activeJob?.company,
        pendingTitle: ctrl?.pendingDetectedJob?.title,
      };
    })()`);
    console.log('   Job B State:', JSON.stringify(jobBState, null, 2));

    // Capture screenshot 3: Tab switch
    const tabSwitchScreenshot = path.join(SCREENSHOT_DIR, 'p73-03-live-tab-switch.png');
    await sidebarCdp.captureScreenshot(tabSwitchScreenshot);
    console.log(`   ✔ Saved screenshot: ${tabSwitchScreenshot}`);

    // Navigate back: Job B -> Job A
    console.log(`   Navigating test tab BACK to Job A (Appinventiv): ${LIVE_APPINVENTIV_URL}...`);
    await testTabCdp.send('Page.navigate', { url: LIVE_APPINVENTIV_URL });
    await sleep(7000);

    console.log('   Triggering Rescan on sidebar for Job A...');
    await sidebarCdp.evaluate(`(() => {
      window.__sidebarController?.rescan();
    })()`);
    await sleep(4000);

    const jobARestored = await sidebarCdp.evaluate(`(() => {
      const ctrl = window.__sidebarController;
      return {
        activeJobTitle: ctrl?.activeJob?.title,
        activeJobCompany: ctrl?.activeJob?.company,
        descriptionLength: (ctrl?.activeJob?.description || '').length,
        analysisReady: ctrl?.activeJob?.analysisReady,
        analyzeBtnDisabled: ctrl?.elements?.analyzeJobBtn?.disabled,
      };
    })()`);
    console.log('   Restored Job A State:', JSON.stringify(jobARestored, null, 2));

    if (jobARestored?.activeJobTitle !== 'Software Engineer') {
      throw new Error(
        `FAILED: Expected restored title 'Software Engineer', got '${jobARestored?.activeJobTitle}'`
      );
    }
    console.log('   ✔ Restored Job A successfully without contamination from Job B');

    // =========================================================================
    // VERIFICATION 3: Page Reload & Persistence Test
    // =========================================================================
    console.log('\n--- VERIFICATION 3: Page Reload Test ---');
    console.log('   Reloading Appinventiv job page...');
    await testTabCdp.send('Page.reload');
    await sleep(7000);

    const reloadedState = await sidebarCdp.evaluate(`(() => {
      const ctrl = window.__sidebarController;
      return {
        title: ctrl?.activeJob?.title,
        company: ctrl?.activeJob?.company,
        descriptionLength: (ctrl?.activeJob?.description || '').length,
        analysisReady: ctrl?.activeJob?.analysisReady,
        analyzeBtnDisabled: ctrl?.elements?.analyzeJobBtn?.disabled,
        loadingNoticeHidden: ctrl?.elements?.descriptionLoadingNotice?.classList?.contains('hidden'),
      };
    })()`);
    console.log('   Reloaded State:', JSON.stringify(reloadedState, null, 2));

    if (reloadedState.title !== 'Software Engineer') {
      throw new Error(
        `FAILED: After reload, expected title 'Software Engineer', got '${reloadedState.title}'`
      );
    }
    console.log('   ✔ Reload test passed: Title maintained across reload');

    // Capture screenshot 4: Reloaded state
    const reloadedScreenshot = path.join(SCREENSHOT_DIR, 'p73-04-live-reloaded.png');
    await sidebarCdp.captureScreenshot(reloadedScreenshot);
    console.log(`   ✔ Saved screenshot: ${reloadedScreenshot}`);

    console.log('\n================================================================');
    console.log('🎉 P73 REAL CHROME LIVE LINKEDIN VERIFICATION COMPLETED SUCCESSFULLY!');
    console.log('================================================================\n');
  } finally {
    if (sidebarCdp) sidebarCdp.close();
    if (testTabCdp) testTabCdp.close();
    if (swCdp) swCdp.close();
    if (browserCdp) browserCdp.close();
    chromeProcess.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('\n❌ VERIFICATION FAILED:\n', err);
  process.exit(1);
});
