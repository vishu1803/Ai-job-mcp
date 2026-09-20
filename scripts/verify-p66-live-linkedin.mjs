/**
 * @file P66 Real Chrome Live LinkedIn Acceptance Verification Script.
 *
 * Requirements:
 * - Opens actual linkedin.com live job pages (NOT localhost fixtures).
 * - Tests URL /jobs/view/4419969671/ (General Motors - Senior Software Engineer – Go (Golang)).
 * - Tests single authoritative detection flow: content script DETECT_JOB_PAGE -> sidebar reconciliation.
 * - Tests page reload reconciliation on live page (0 analyze calls).
 * - Tests manual rescan on live page (0 analyze calls).
 * - Tests explicit Analyze Job Match boundary (exactly 1 analyze call).
 * - Records actual URL, title, company, externalJobId, timestamp, and server call count.
 * - Saves screenshots to artifact directory.
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
const PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cft-p66-live-linkedin-'));
const EXTENSION_DIR = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const SCREENSHOT_DIR =
  'C:\\Users\\VISHW\\.gemini\\antigravity-ide\\brain\\60a23d1d-49b1-4a06-b500-a5a1e32127d3';
const CDP_PORT = 9366;
const LIVE_LINKEDIN_URL = 'https://www.linkedin.com/jobs/view/4419969671/';

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
  console.log('=== P66: REAL CHROME LIVE LINKEDIN ACCEPTANCE VERIFICATION ===\n');

  // Step 1: Verify backend health
  console.log('1. Checking backend health on http://localhost:3000/api/health...');
  try {
    const healthRes = await fetch('http://localhost:3000/api/health');
    const health = await healthRes.json();
    console.log('   Backend status:', health.status || 'healthy');
  } catch (err) {
    throw new Error(`Backend not reachable: ${err.message}. Ensure npm run dev is running.`);
  }

  // Step 2: Establish canonical user session in database
  console.log('2. Ensuring canonical user session (vishwanatnishad@gmail.com)...');
  const [canonicalUser] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, 'vishwanatnishad@gmail.com'))
    .limit(1);

  if (!canonicalUser) {
    throw new Error('Canonical user vishwanatnishad@gmail.com not found in database');
  }

  const session = await createSession(db, {
    userId: canonicalUser.id,
    tenantId: canonicalUser.tenantId,
  });
  const sessionToken = session.rawToken;
  console.log(
    `   Session created for user ${canonicalUser.id}, token: ${sessionToken.slice(0, 16)}...`
  );

  // Step 3: Launch real Chrome with extension loaded
  console.log('\n3. Spawning real Chrome MV3 browser instance...');
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
  let linkedInCdp = null;
  let sidebarCdp = null;
  let swCdp = null;

  try {
    await sleep(3000);
    const versionRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    const versionData = await versionRes.json();
    browserCdp = new CDPClient(versionData.webSocketDebuggerUrl);
    await browserCdp.connect();
    console.log('   Connected to Chrome via CDP');

    // Identify extension ID from background service worker target
    const targets = await browserCdp.send('Target.getTargets');
    const swTarget = targets.targetInfos.find((t) => t.url?.includes('service-worker.js'));
    if (!swTarget) throw new Error('Extension background service worker not found');
    const extId = swTarget.url.match(/chrome-extension:\/\/([a-z0-9]+)\//)[1];
    console.log(`   Extension loaded with ID: ${extId}`);

    // Connect to service worker
    const listRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const list = await listRes.json();
    const swInfo = list.find((item) => item.url?.includes('service-worker.js'));
    swCdp = new CDPClient(swInfo.webSocketDebuggerUrl);
    await swCdp.connect();
    await swCdp.send('Runtime.enable');

    // Step 4: Open ACTUAL live LinkedIn job page
    console.log(`\n4. Navigating to LIVE LinkedIn Job: ${LIVE_LINKEDIN_URL}...`);
    const pageTarget = await browserCdp.send('Target.createTarget', { url: LIVE_LINKEDIN_URL });
    const freshList = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const pageItem = freshList.find((item) => item.id === pageTarget.targetId);

    linkedInCdp = new CDPClient(pageItem.webSocketDebuggerUrl);
    await linkedInCdp.connect();
    await linkedInCdp.send('Page.enable');
    await linkedInCdp.send('Runtime.enable');

    console.log('   Waiting 5 seconds for live LinkedIn DOM to mount and hydrate...');
    await sleep(5000);

    // Retrieve the numeric Chrome tab ID for the LinkedIn page
    const tabsInChrome = await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.query({}, (tabs) => resolve(tabs.map(t => ({ id: t.id, url: t.url, title: t.title }))));
      })
    `);
    const liveLinkedInTab = tabsInChrome.find((t) => t.url?.includes('linkedin.com'));
    if (!liveLinkedInTab) {
      throw new Error('LinkedIn tab could not be resolved from chrome.tabs.query');
    }
    const linkedInTabId = liveLinkedInTab.id;
    console.log(`   Live LinkedIn Tab resolved with Tab ID: ${linkedInTabId}`);

    // Step 5: Open extension sidebar pinned to LinkedIn tab ID
    const sidebarUrl = `chrome-extension://${extId}/sidebar/sidebar.html?tabId=${linkedInTabId}`;
    console.log(`\n5. Opening sidebar pinned to live tab: ${sidebarUrl}...`);
    const sidebarTarget = await browserCdp.send('Target.createTarget', { url: sidebarUrl });
    const targetList = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const sbItem = targetList.find((item) => item.id === sidebarTarget.targetId);

    sidebarCdp = new CDPClient(sbItem.webSocketDebuggerUrl);
    await sidebarCdp.connect();
    await sidebarCdp.send('Page.enable');
    await sidebarCdp.send('Runtime.enable');
    await sidebarCdp.send('Network.enable');

    // Instrument network monitoring on sidebar to count /api/extension/analyze-job calls
    let serverAnalyzeCalls = 0;
    const WebSocket = (await import('ws')).default;
    sidebarCdp.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.method === 'Network.requestWillBeSent') {
          if (msg.params?.request?.url?.includes('/api/extension/analyze-job')) {
            serverAnalyzeCalls++;
            console.log(
              `   [SERVER CALL DETECTED] /api/extension/analyze-job (call #${serverAnalyzeCalls})`
            );
          }
        }
      } catch {}
    });

    // Inject valid authentication token & cookies
    console.log('   Setting canonical session cookies for http://localhost:3000...');
    await sidebarCdp.send('Network.setCookie', {
      name: 'career_hub_session',
      value: sessionToken,
      url: 'http://localhost:3000',
    });
    await sidebarCdp.send('Network.setCookie', {
      name: 'career_hub_session',
      value: sessionToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    });
    await sidebarCdp.evaluate(`
      new Promise((resolve) => {
        chrome.storage.local.set({
          auth_token: '${sessionToken}',
          backendUrl: 'http://localhost:3000'
        }, resolve);
      })
    `);

    // Initialize sidebar controller
    console.log('   Initializing SidebarController and requesting authoritative detection...');
    await sidebarCdp.evaluate(`
      (async () => {
        const ctrl = window.__sidebarController;
        if (ctrl) {
          await ctrl._checkAuthStatus();
          await ctrl._hydrateFromStore();
          await ctrl._requestDetectionFromTab();
        }
      })()
    `);

    console.log('   Waiting 3.5s for authoritative DETECT_JOB_PAGE handshake & reconciliation...');
    await sleep(3500);

    // Step 6: Verify Live LinkedIn Detection
    console.log('\n--- VERIFICATION 1: LIVE LINKEDIN DETECTION ---');
    const detectionState = await sidebarCdp.evaluate(`
      (() => {
        const ctrl = window.__sidebarController;
        return {
          activeTabId: ctrl?.activeTabId,
          pinnedTabId: ctrl?.pinnedTabId,
          isAuthenticated: ctrl?.isAuthenticated,
          userEmail: ctrl?.currentUser?.email,
          workflowState: ctrl?.stateMachine?.state,
          activeJob: ctrl?.activeJob,
          jobTitleEl: document.getElementById('jobTitle')?.textContent,
          jobCompanyEl: document.getElementById('jobCompany')?.textContent,
          analyzeBtnText: document.getElementById('analyzeJobBtn')?.textContent,
          analyzeBtnDisabled: document.getElementById('analyzeJobBtn')?.disabled,
        };
      })()
    `);

    console.log('   Detected Title (DOM element):', `"${detectionState.jobTitleEl}"`);
    console.log('   Detected Company (DOM element):', `"${detectionState.jobCompanyEl}"`);
    console.log('   Active Job externalJobId:', detectionState.activeJob?.externalJobId);
    console.log('   Active Job provider:', detectionState.activeJob?.provider);
    console.log('   Active Job sourceUrl:', detectionState.activeJob?.sourceUrl);
    console.log('   Workflow state:', detectionState.workflowState);
    console.log('   Server /analyze-job calls so far:', serverAnalyzeCalls);

    const detectionTimestamp = new Date().toISOString();
    console.log('   Detection timestamp:', detectionTimestamp);

    if (!detectionState.activeJob || !detectionState.activeJob.title) {
      throw new Error(`Live LinkedIn job was NOT detected: ${JSON.stringify(detectionState)}`);
    }

    if (
      !detectionState.activeJob.title.toLowerCase().includes('engineer') &&
      !detectionState.activeJob.title.toLowerCase().includes('software') &&
      !detectionState.activeJob.title.toLowerCase().includes('golang')
    ) {
      throw new Error(`Unexpected job title: ${detectionState.activeJob.title}`);
    }

    if (detectionState.activeJob.externalJobId !== '4419969671') {
      throw new Error(
        `Expected externalJobId 4419969671, got: ${detectionState.activeJob.externalJobId}`
      );
    }

    if (serverAnalyzeCalls !== 0) {
      throw new Error(`Passive detection must make 0 server calls, got: ${serverAnalyzeCalls}`);
    }

    const screenshot1Path = path.join(SCREENSHOT_DIR, 'p66-01-live-linkedin-detected.png');
    await sidebarCdp.captureScreenshot(screenshot1Path);
    console.log(`   [Artifact Saved] Screenshot: ${screenshot1Path}`);

    // Step 7: Test Page Reload Re-Detection
    console.log('\n--- VERIFICATION 2: PAGE RELOAD DETERMINISM ---');
    console.log('   Reloading the live LinkedIn tab...');
    await linkedInCdp.send('Page.reload');

    console.log('   Waiting 5 seconds for page reload and content script re-evaluation...');
    await sleep(5000);

    const reloadedState = await sidebarCdp.evaluate(`
      (() => {
        const ctrl = window.__sidebarController;
        return {
          activeJob: ctrl?.activeJob,
          jobTitleEl: document.getElementById('jobTitle')?.textContent,
          jobCompanyEl: document.getElementById('jobCompany')?.textContent,
          workflowState: ctrl?.stateMachine?.state
        };
      })()
    `);

    console.log('   After reload - Title:', `"${reloadedState.jobTitleEl}"`);
    console.log('   After reload - Company:', `"${reloadedState.jobCompanyEl}"`);
    console.log('   After reload - Analyze calls count:', serverAnalyzeCalls);

    if (!reloadedState.activeJob || !reloadedState.activeJob.title) {
      throw new Error('Active job lost after reload');
    }
    if (serverAnalyzeCalls !== 0) {
      throw new Error(`Reload must make 0 server calls, got: ${serverAnalyzeCalls}`);
    }

    const screenshot2Path = path.join(SCREENSHOT_DIR, 'p66-02-live-linkedin-reloaded.png');
    await sidebarCdp.captureScreenshot(screenshot2Path);
    console.log(`   [Artifact Saved] Screenshot: ${screenshot2Path}`);

    // Step 8: Test Manual Rescan
    console.log('\n--- VERIFICATION 3: MANUAL RESCAN ---');
    console.log('   Triggering manual rescan() on sidebar...');
    await sidebarCdp.evaluate(`
      (async () => {
        await window.__sidebarController.rescan();
      })()
    `);

    await sleep(2000);

    const rescanState = await sidebarCdp.evaluate(`
      (() => {
        const ctrl = window.__sidebarController;
        return {
          activeJob: ctrl?.activeJob,
          jobTitleEl: document.getElementById('jobTitle')?.textContent,
          workflowState: ctrl?.stateMachine?.state
        };
      })()
    `);

    console.log('   After rescan - Title:', `"${rescanState.jobTitleEl}"`);
    console.log('   After rescan - Analyze calls count:', serverAnalyzeCalls);

    if (!rescanState.activeJob || !rescanState.activeJob.title) {
      throw new Error('Rescan failed to detect active job');
    }
    if (serverAnalyzeCalls !== 0) {
      throw new Error(`Rescan must make 0 server calls, got: ${serverAnalyzeCalls}`);
    }

    const screenshot3Path = path.join(SCREENSHOT_DIR, 'p66-03-live-linkedin-rescanned.png');
    await sidebarCdp.captureScreenshot(screenshot3Path);
    console.log(`   [Artifact Saved] Screenshot: ${screenshot3Path}`);

    // Step 9: Explicit Single Analyze Call Boundary
    console.log('\n--- VERIFICATION 4: EXPLICIT ANALYZE SERVER BOUNDARY ---');
    const btnState = await sidebarCdp.evaluate(`
      (() => {
        const btn = document.getElementById('analyzeJobBtn');
        const ctrl = window.__sidebarController;
        return {
          btnExists: Boolean(btn),
          btnDisabled: btn?.disabled,
          btnText: btn?.textContent,
          isAuthenticated: ctrl?.isAuthenticated,
          hasActiveJob: Boolean(ctrl?.activeJob)
        };
      })()
    `);
    console.log('   Analyze Button state before click:', JSON.stringify(btnState));
    console.log('   Clicking [Analyze Job Match] button...');
    await sidebarCdp.evaluate(`
      (async () => {
        const btn = document.getElementById('analyzeJobBtn');
        if (btn) {
          btn.click();
        }
      })()
    `);

    console.log('   Waiting for analysis to complete and render (up to 15s)...');
    let analyzedState = null;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      analyzedState = await sidebarCdp.evaluate(`
        (() => {
          const ctrl = window.__sidebarController;
          return {
            workflowState: ctrl?.stateMachine?.state,
            overallScore: ctrl?.cachedState?.fitAnalysis?.overallScore,
            matchedSkillsCount: ctrl?.cachedState?.fitAnalysis?.matchedSkills?.length,
            analyzeBtnText: document.getElementById('analyzeJobBtn')?.textContent,
          };
        })()
      `);
      if (
        analyzedState?.workflowState === 'ANALYSIS_READY' ||
        analyzedState?.workflowState === 'APPLICATION_READY'
      ) {
        break;
      }
    }

    console.log('   After Analyze - Workflow state:', analyzedState.workflowState);
    console.log('   After Analyze - Overall Fit Score:', analyzedState.overallScore);
    console.log('   After Analyze - Matched Skills count:', analyzedState.matchedSkillsCount);
    console.log('   After Analyze - Total /analyze-job server calls:', serverAnalyzeCalls);

    if (serverAnalyzeCalls !== 1) {
      throw new Error(
        `Explicit Analyze MUST trigger exactly 1 server call! Got: ${serverAnalyzeCalls}`
      );
    }

    const screenshot4Path = path.join(SCREENSHOT_DIR, 'p66-04-live-linkedin-analyzed.png');
    await sidebarCdp.captureScreenshot(screenshot4Path);
    console.log(`   [Artifact Saved] Screenshot: ${screenshot4Path}`);

    // Final Acceptance Evidence Log
    console.log('\n======================================================');
    console.log('P66 ACCEPTANCE VERIFICATION SUMMARY (LIVE LINKEDIN):');
    console.log('======================================================');
    console.log(`Actual URL:          ${LIVE_LINKEDIN_URL}`);
    console.log(`Detected Title:      ${detectionState.activeJob.title}`);
    console.log(`Detected Company:    ${detectionState.activeJob.company}`);
    console.log(`External Job ID:     ${detectionState.activeJob.externalJobId}`);
    console.log(`Provider:            ${detectionState.activeJob.provider}`);
    console.log(`Detection Timestamp: ${detectionTimestamp}`);
    console.log(`Passive Calls:       0 /api/extension/analyze-job calls`);
    console.log(`Reload Calls:        0 /api/extension/analyze-job calls`);
    console.log(`Rescan Calls:        0 /api/extension/analyze-job calls`);
    console.log(`Explicit Analyze:    EXACTLY 1 /api/extension/analyze-job call`);
    console.log(`Overall Fit Score:   ${analyzedState.overallScore}%`);
    console.log('======================================================');
    console.log('STATUS: ALL P66 LIVE ACCEPTANCE CRITERIA SATISFIED!\n');
  } finally {
    if (browserCdp) browserCdp.close();
    if (linkedInCdp) linkedInCdp.close();
    if (sidebarCdp) sidebarCdp.close();
    if (swCdp) swCdp.close();

    chromeProcess.kill();
    try {
      fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
    } catch {}
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n[FATAL ERROR in P66 Acceptance Script]:', err);
    process.exit(1);
  });
