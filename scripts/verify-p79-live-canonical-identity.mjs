/**
 * @file Part 79 Live Acceptance Verification Script.
 *
 * Verifies live in Chrome for Testing:
 * 1. Initial page detection binds Canonical Job Identity (fingerprint, title, company).
 * 2. Analyze Job Match executes RETAIN_AND_ENRICH transition with title invariance.
 * 3. Passive events respect PRESERVE_ACTIVE_SESSION without title regression.
 * 4. Explicit rescan reinforces RETAIN_AND_ENRICH idempotency.
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

const CHROME_PATH = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\chrome\\win64-152.0.7977.82\\chrome-win64\\chrome.exe';
const PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cft-p79-authority-'));
const EXTENSION_DIR = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const SCREENSHOT_DIR = 'C:\\Users\\VISHW\\.gemini\\antigravity-ide\\brain\\32fc28a4-be6a-4f53-afeb-1fb203af361a';
const CDP_PORT = 9455;

const TARGET_JOB_URL = 'https://www.linkedin.com/jobs/view/4466834190/';

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

  async send(method, params = {}, timeoutMs = 25000) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    const effectiveTimeout = (method === 'Page.navigate' || method === 'Page.reload') ? 15000 : timeoutMs;
    return new Promise((resolve, reject) => {
      const tid = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          if (method === 'Page.navigate' || method === 'Page.reload') {
            resolve({ timedOut: true });
          } else {
            reject(new Error(`CDP command ${method} timed out after ${effectiveTimeout}ms`));
          }
        }
      }, effectiveTimeout);
      this.pending.set(id, {
        resolve: (val) => {
          clearTimeout(tid);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(tid);
          reject(err);
        },
      });
      this.ws.send(payload);
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res?.result?.value;
  }

  async captureScreenshot(outputPath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    if (res?.data) {
      fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    }
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
  }
}

async function main() {
  console.log('=== PART 79: CANONICAL JOB IDENTITY & STATE-TRANSITION AUTHORITY LIVE TEST ===\n');

  const [canonicalUser] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, 'vishwanatnishad@gmail.com'))
    .limit(1);

  if (!canonicalUser) throw new Error('Canonical user not found');
  const session = await createSession(db, {
    userId: canonicalUser.id,
    tenantId: canonicalUser.tenantId,
  });

  console.log('1. Launching Chrome for Testing with extension...');
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
  let swCdp = null;
  let tabCdp = null;
  let sidebarCdp = null;

  try {
    await sleep(3000);
    const versionRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    const versionData = await versionRes.json();
    browserCdp = new CDPClient(versionData.webSocketDebuggerUrl);
    await browserCdp.connect();

    const targets = await browserCdp.send('Target.getTargets');
    const swTarget = targets.targetInfos.find((t) => t.url?.includes('service-worker.js'));
    const extId = swTarget.url.match(/chrome-extension:\/\/([a-z0-9]+)\//)[1];
    console.log(`   Extension ID: ${extId}`);

    const targetList = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const swInfo = targetList.find((item) => item.url?.includes('service-worker.js'));
    swCdp = new CDPClient(swInfo.webSocketDebuggerUrl);
    await swCdp.connect();
    await swCdp.send('Runtime.enable');

    console.log('2. Authenticating extension storage...');
    await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.storage.local.set({
          authToken: ${JSON.stringify(session.rawToken)},
          userProfile: ${JSON.stringify({
            id: canonicalUser.id,
            email: canonicalUser.email,
            name: 'Vishwanath Nishad',
          })},
          activePortal: { portalName: 'LinkedIn', isJobPage: true }
        }, resolve);
      })
    `);

    console.log('3. Opening Chrome Side Panel via chrome.sidePanel.open()...');
    const popupTarget = await browserCdp.send('Target.createTarget', {
      url: `chrome-extension://${extId}/popup/popup.html`,
    });
    const listAfterPopup = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const popupItem = listAfterPopup.find((item) => item.id === popupTarget.targetId);
    const popupCdp = new CDPClient(popupItem.webSocketDebuggerUrl);
    await popupCdp.connect();

    await popupCdp.send('Runtime.evaluate', {
      expression: `(async () => {
        const win = await chrome.windows.getCurrent();
        await chrome.sidePanel.open({ windowId: win.id });
        return { success: true };
      })()`,
      awaitPromise: true,
      userGesture: true,
    });
    await sleep(2500);
    await browserCdp.send('Target.closeTarget', { targetId: popupTarget.targetId });

    let sidePanelTarget = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const allTargets = await browserCdp.send('Target.getTargets');
      sidePanelTarget = allTargets.targetInfos.find(
        (t) => t.url?.includes('sidebar.html') && !t.url?.includes('?tabId=')
      );
      if (sidePanelTarget) break;
      await sleep(1000);
    }
    if (!sidePanelTarget) throw new Error('Side Panel target not found');

    const sbItem = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find(
      (item) => item.id === sidePanelTarget.targetId
    );
    sidebarCdp = new CDPClient(sbItem.webSocketDebuggerUrl);
    await sidebarCdp.connect();
    await sidebarCdp.send('Runtime.enable');
    await sidebarCdp.send('DOM.enable');
    await sidebarCdp.send('Network.enable');
    await sidebarCdp.send('Network.setCookie', {
      name: 'career_hub_session',
      value: session.rawToken,
      domain: 'localhost',
      path: '/',
    });

    console.log(`4. Opening target LinkedIn Job URL: ${TARGET_JOB_URL}...`);
    const tabTarget = await browserCdp.send('Target.createTarget', { url: TARGET_JOB_URL });
    await sleep(8000);

    const currentTabList = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const tabItem = currentTabList.find((i) => i.id === tabTarget.targetId);
    tabCdp = new CDPClient(tabItem.webSocketDebuggerUrl);
    await tabCdp.connect();
    await tabCdp.send('Page.enable');
    await tabCdp.send('Runtime.enable');

    const chromeTabs = await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.query({}, (tabs) => resolve(tabs.map(t => ({ id: t.id, url: t.url, active: t.active }))));
      })
    `);
    const activeLinkedInTab = chromeTabs.find((t) => t.url?.includes('linkedin.com/jobs'));
    console.log('   Active LinkedIn Tab in Chrome:', JSON.stringify(activeLinkedInTab));

    // Focus active tab and sync sidebar
    if (activeLinkedInTab) {
      await swCdp.evaluate(`
        new Promise((resolve) => {
          chrome.tabs.update(${activeLinkedInTab.id}, { active: true }, resolve);
        })
      `);
      await sidebarCdp.evaluate(`
        (async () => {
          window.__sidebarController.activeTabId = ${activeLinkedInTab.id};
          await window.__sidebarController._requestDetectionFromTab();
        })()
      `);
    }

    await sleep(4000);

    // Ensure authenticated state in controller
    await sidebarCdp.evaluate(`(async () => {
      await window.__sidebarController?._checkAuthStatus();
    })()`);

    const preAnalyzeState = await sidebarCdp.evaluate(`
      (() => {
        const c = window.__sidebarController;
        return {
          isAuthenticated: c?.isAuthenticated,
          title: document.getElementById('jobTitle')?.textContent?.trim(),
          company: document.getElementById('jobCompany')?.textContent?.trim(),
          activeJobTitle: c?.activeJob?.title,
          cachedJobTitle: c?.cachedState?.jobData?.title,
          fingerprint: c?.activeJobFingerprint,
          analyzeBtnDisabled: document.getElementById('analyzeJobBtn')?.disabled,
          analyzeBtnText: document.getElementById('analyzeJobBtn')?.textContent?.trim(),
        };
      })()
    `);
    console.log('\n--- PRE-ANALYSIS STATE (BIND_NEW_JOB) ---');
    console.log(JSON.stringify(preAnalyzeState, null, 2));

    if (!preAnalyzeState.title || preAnalyzeState.title === '—') {
      throw new Error(`Expected valid detected title, got: "${preAnalyzeState.title}"`);
    }

    const initialScreenshot = path.join(SCREENSHOT_DIR, 'p79-01-live-detected.png');
    await sidebarCdp.captureScreenshot(initialScreenshot);
    console.log(`Saved screenshot: ${initialScreenshot}`);

    // 5. Trigger runAnalyzeJob
    console.log('\n5. Triggering runAnalyzeJob() via JobIdentityAuthority (RETAIN_AND_ENRICH transition)...');
    await sidebarCdp.evaluate(`
      (async () => {
        const c = window.__sidebarController;
        c.runAnalyzeJob();
      })()
    `);

    // Poll state during and after analysis for 15 seconds
    console.log('6. Polling sidebar state over next 15 seconds...');
    let postAnalyzeState = null;
    for (let i = 1; i <= 15; i++) {
      await sleep(1000);
      postAnalyzeState = await sidebarCdp.evaluate(`
        (() => {
          const c = window.__sidebarController;
          return {
            second: ${i},
            workflowState: c?.stateMachine?.state,
            lockState: c?.cachedState?.lockState,
            domJobTitle: document.getElementById('jobTitle')?.textContent?.trim(),
            domJobCompany: document.getElementById('jobCompany')?.textContent?.trim(),
            activeJobTitle: c?.activeJob?.title,
            cachedJobTitle: c?.cachedState?.jobData?.title,
            scoreValue: document.getElementById('scoreValue')?.textContent?.trim(),
            matchBand: document.getElementById('matchBandBadge')?.textContent?.trim(),
            hasFitAnalysis: Boolean(c?.cachedState?.fitAnalysis),
          };
        })()
      `);
      if (postAnalyzeState?.hasFitAnalysis) {
        console.log(`   [T+${i}s] Analysis Complete! Score: ${postAnalyzeState.scoreValue}, MatchBand: ${postAnalyzeState.matchBand}`);
        break;
      }
    }

    console.log('\n--- POST-ANALYSIS STATE ---');
    console.log(JSON.stringify(postAnalyzeState, null, 2));

    if (!postAnalyzeState?.hasFitAnalysis) {
      throw new Error('Analysis did not produce fitAnalysis within 15s');
    }

    // CRITICAL P78/P79 INVARIANT: Title must NOT change to "Not specified" or "—"
    if (postAnalyzeState.domJobTitle !== preAnalyzeState.title) {
      throw new Error(`CRITICAL REGRESSION: domJobTitle changed from "${preAnalyzeState.title}" to "${postAnalyzeState.domJobTitle}"!`);
    }
    if (postAnalyzeState.activeJobTitle !== preAnalyzeState.activeJobTitle) {
      throw new Error(`CRITICAL REGRESSION: activeJobTitle changed from "${preAnalyzeState.activeJobTitle}" to "${postAnalyzeState.activeJobTitle}"!`);
    }

    const analyzedScreenshot = path.join(SCREENSHOT_DIR, 'p79-02-live-analyzed.png');
    await sidebarCdp.captureScreenshot(analyzedScreenshot);
    console.log(`Saved screenshot: ${analyzedScreenshot}`);

    // 7. Verify PRESERVE_ACTIVE_SESSION on passive non-job event
    console.log('\n7. Verifying PRESERVE_ACTIVE_SESSION on passive non-job event...');
    const passiveResult = await sidebarCdp.evaluate(`
      (() => {
        const c = window.__sidebarController;
        c._reconcileDetectedJob({ title: '', company: '' });
        return {
          workflowState: c?.stateMachine?.state,
          domJobTitle: document.getElementById('jobTitle')?.textContent?.trim(),
          activeJobTitle: c?.activeJob?.title,
          hasFitAnalysis: Boolean(c?.cachedState?.fitAnalysis),
        };
      })()
    `);
    console.log('   Passive non-job result:', JSON.stringify(passiveResult));
    if (passiveResult.domJobTitle !== preAnalyzeState.title) {
      throw new Error(`PRESERVE_ACTIVE_SESSION failed: title mutated to "${passiveResult.domJobTitle}"`);
    }

    // 8. Verify explicit rescan on same job reinforces RETAIN_AND_ENRICH
    console.log('\n8. Executing explicit rescan on current job (reinforces RETAIN_AND_ENRICH idempotency)...');
    await sidebarCdp.evaluate(`window.__sidebarController.rescan()`);
    await sleep(2500);

    const postRescanState = await sidebarCdp.evaluate(`
      (() => {
        const c = window.__sidebarController;
        return {
          workflowState: c?.stateMachine?.state,
          domJobTitle: document.getElementById('jobTitle')?.textContent?.trim(),
          activeJobTitle: c?.activeJob?.title,
          hasFitAnalysis: Boolean(c?.cachedState?.fitAnalysis),
        };
      })()
    `);
    console.log('   Post-rescan state:', JSON.stringify(postRescanState));
    if (postRescanState.domJobTitle !== preAnalyzeState.title) {
      throw new Error(`Explicit rescan mutated title to "${postRescanState.domJobTitle}"`);
    }

    const rescannedScreenshot = path.join(SCREENSHOT_DIR, 'p79-03-live-rescanned.png');
    await sidebarCdp.captureScreenshot(rescannedScreenshot);
    console.log(`Saved screenshot: ${rescannedScreenshot}`);

    console.log('\n===============================================================');
    console.log('>>> ALL PART 79 LIVE CFT ACCEPTANCE CHECKS PASSED WITH 100% SUCCESS! <<<');
    console.log('===============================================================\n');

  } finally {
    if (browserCdp) browserCdp.close();
    if (swCdp) swCdp.close();
    if (tabCdp) tabCdp.close();
    if (sidebarCdp) sidebarCdp.close();
    try {
      chromeProcess.kill('SIGKILL');
    } catch {}
    try {
      fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error('\nFAIL:', err);
  process.exit(1);
});
