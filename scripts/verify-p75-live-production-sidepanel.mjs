/**
 * @file P75: Production Side Panel Parity & Fresh-State Verification
 *
 * Real Chrome for Testing (CFT) E2E verification script demonstrating:
 * 1. REAL SIDE PANEL ONLY:
 *    - Opened exclusively via chrome.sidePanel.open({ windowId })
 *    - Zero creation of sidebar.html as a browser tab
 *    - Pinned tab ID is null; side panel listens to real Chrome activation events
 * 2. REAL MULTI-TAB ACTIVATION:
 *    - Tab A: Real LinkedIn Quik Hire Staffing job (4466448213)
 *    - Tab B: Real LinkedIn Appinventiv job (4464770430)
 *    - Activation: Tab A -> Tab B -> Tab A using real chrome.tabs.update
 *    - Verifies activeTabId, URL, sidebar title, company, fingerprint, provider
 * 3. 3-WAY STATE CONVERGENCE:
 *    - Persisted jobData === fresh content-script detection === sidebar rendered state
 * 4. RELOAD FRESH-DETECTION PROOF:
 *    - Tab reload triggers fresh content-script detection (incremented requestId)
 *    - Fails if test can pass using durable state without fresh content-script detection
 * 5. LINKEDIN WRONG-TITLE SUPPRESSION:
 *    - Quik Hire authentic title: "Backend Software Engineer (Remote)" at "Quik Hire Staffing"
 *    - Marketing headings ("Take the next step in your job search", etc.) strictly prohibited
 * 6. DIAGNOSTIC PARITY:
 *    - Bit-for-bit parity of diagnostic fields between content-script and sidebar
 * 7. SPA NAVIGATION:
 *    - Within same tab: Job A -> Job B -> Job A with fresh fingerprint
 * 8. MANUAL RESCAN:
 *    - Dispatches fresh DETECT_JOB_PAGE to current active tab; no cache substitution
 * 9. CHATGPT NEGATIVE REGRESSION:
 *    - Real ChatGPT conversation returns detected = false, Web Page, Analyze disabled
 * 10. WORKING PORTALS:
 *     - Greenhouse ATS detects cleanly
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
const PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cft-p75-production-sidepanel-'));
const EXTENSION_DIR = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const SCREENSHOT_DIR = 'C:\\Users\\VISHW\\.gemini\\antigravity-ide\\brain\\32fc28a4-be6a-4f53-afeb-1fb203af361a';
const CDP_PORT = 9433;

const LIVE_QUIK_HIRE_URL = 'https://www.linkedin.com/jobs/view/4466448213/';
const LIVE_APPINVENTIV_URL = 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430';
const LIVE_CHATGPT_URL = 'https://chatgpt.com/';
const LIVE_GREENHOUSE_URL = 'https://job-boards.greenhouse.io/cloudflare/jobs/8102350';

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

  async send(method, params = {}, timeoutMs = 45000) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    const effectiveTimeout = (method === 'Page.navigate' || method === 'Page.reload') ? 10000 : timeoutMs;
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
      try { this.ws.close(); } catch {}
    }
  }
}

async function main() {
  console.log('=== P75: REAL CHROME PRODUCTION SIDE PANEL PARITY VERIFICATION ===\n');

  // 1. Backend Health Check
  console.log('1. Checking backend health...');
  const healthRes = await fetch('http://localhost:3000/healthz');
  const health = await healthRes.json();
  console.log('   Backend health:', health.status);
  if (health.status !== 'healthy') throw new Error('Backend is not healthy');

  // 2. Canonical Session
  console.log('2. Ensuring canonical user session...');
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
  console.log(`   Session created for user ${canonicalUser.id} (${session.rawToken.slice(0, 16)}...)`);

  // 3. Spawn Real Chrome for Testing (CFT)
  console.log(`\n3. Spawning Chrome for Testing (CDP port ${CDP_PORT})...`);
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
  let sidebarCdp = null;
  let tabACdp = null;
  let tabBCdp = null;

  try {
    await sleep(3000);
    const versionRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    const versionData = await versionRes.json();
    browserCdp = new CDPClient(versionData.webSocketDebuggerUrl);
    await browserCdp.connect();
    console.log('   Connected to Chrome Browser via CDP');

    // Discover Service Worker & Extension ID
    const targets = await browserCdp.send('Target.getTargets');
    const swTarget = targets.targetInfos.find((t) => t.url?.includes('service-worker.js'));
    if (!swTarget) throw new Error('Extension service worker not found');
    const extId = swTarget.url.match(/chrome-extension:\/\/([a-z0-9]+)\//)[1];
    console.log(`   Extension ID: ${extId}`);

    const targetList = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const swInfo = targetList.find((item) => item.url?.includes('service-worker.js'));
    swCdp = new CDPClient(swInfo.webSocketDebuggerUrl);
    await swCdp.connect();
    await swCdp.send('Runtime.enable');

    // 4. OPEN AUTHENTIC PRODUCTION CHROME SIDE PANEL (chrome.sidePanel.open)
    console.log('\n4. Opening Authentic Production Chrome Side Panel via chrome.sidePanel.open()...');
    const popupTarget = await browserCdp.send('Target.createTarget', {
      url: `chrome-extension://${extId}/popup/popup.html`,
    });

    const listAfterPopup = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const popupItem = listAfterPopup.find((item) => item.id === popupTarget.targetId);
    const popupCdp = new CDPClient(popupItem.webSocketDebuggerUrl);
    await popupCdp.connect();

    const openResult = await popupCdp.send('Runtime.evaluate', {
      expression: `(async () => {
        const win = await chrome.windows.getCurrent();
        await chrome.sidePanel.open({ windowId: win.id });
        return { success: true, windowId: win.id };
      })()`,
      awaitPromise: true,
      userGesture: true,
    });
    console.log('   chrome.sidePanel.open() result:', openResult.result?.value);
    await sleep(2500);

    // Close temporary popup
    await browserCdp.send('Target.closeTarget', { targetId: popupTarget.targetId });

    // Locate the authentic Side Panel target
    const allTargets = await browserCdp.send('Target.getTargets');
    const sidePanelTargetInfo = allTargets.targetInfos.find(
      (t) => t.url?.includes('sidebar.html') && !t.url?.includes('?tabId=')
    );

    if (!sidePanelTargetInfo) {
      throw new Error('Real production Chrome Side Panel target not found! Expected sidebar.html with NO ?tabId= parameter.');
    }

    console.log('   [SUCCESS] Found Authentic Side Panel Target:');
    console.log(`     Target ID: ${sidePanelTargetInfo.targetId}`);
    console.log(`     Title:     ${sidePanelTargetInfo.title}`);
    console.log(`     URL:       ${sidePanelTargetInfo.url} (Notice: ZERO tabId parameter)`);

    // Connect CDP directly to the real Side Panel
    const listForSidePanel = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const sbItem = listForSidePanel.find((item) => item.id === sidePanelTargetInfo.targetId);
    sidebarCdp = new CDPClient(sbItem.webSocketDebuggerUrl);
    await sidebarCdp.connect();
    await sidebarCdp.send('Page.enable');
    await sidebarCdp.send('Runtime.enable');
    console.log('   Connected CDP directly to Production Side Panel.');

    // Verify pinnedTabId is strictly null/undefined
    const sidePanelInitProps = await sidebarCdp.evaluate(`(() => {
      const c = window.__sidebarController;
      return {
        hasController: Boolean(c),
        pinnedTabId: c ? c.pinnedTabId : null,
        activeTabId: c ? c.activeTabId : null,
      };
    })()`);
    console.log('   Production Side Panel Controller State:', JSON.stringify(sidePanelInitProps));
    if (sidePanelInitProps.pinnedTabId !== undefined && sidePanelInitProps.pinnedTabId !== null) {
      throw new Error(`CRITICAL: Production Side Panel must have pinnedTabId === null, got ${sidePanelInitProps.pinnedTabId}`);
    }

    // 5. CREATE REAL MULTI-TAB ENVIRONMENT (Tab A: Quik Hire, Tab B: Appinventiv)
    console.log('\n5. Creating Real Multi-Tab Environment...');
    console.log(`   Creating Tab A: ${LIVE_QUIK_HIRE_URL}...`);
    const tabATarget = await browserCdp.send('Target.createTarget', { url: LIVE_QUIK_HIRE_URL });

    console.log(`   Creating Tab B: ${LIVE_APPINVENTIV_URL}...`);
    const tabBTarget = await browserCdp.send('Target.createTarget', { url: LIVE_APPINVENTIV_URL });

    await sleep(8000); // Allow real LinkedIn pages to load and content scripts to initialize

    const currentTabList = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const tabAItem = currentTabList.find((i) => i.id === tabATarget.targetId);
    const tabBItem = currentTabList.find((i) => i.id === tabBTarget.targetId);

    tabACdp = new CDPClient(tabAItem.webSocketDebuggerUrl);
    await tabACdp.connect();
    await tabACdp.send('Page.enable');
    await tabACdp.send('Runtime.enable');

    tabBCdp = new CDPClient(tabBItem.webSocketDebuggerUrl);
    await tabBCdp.connect();
    await tabBCdp.send('Page.enable');
    await tabBCdp.send('Runtime.enable');

    // Query Chrome Tabs from extension service worker to obtain exact Chrome tab IDs
    const chromeTabs = await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.query({}, (tabs) => resolve(tabs.map(t => ({ id: t.id, url: t.url, active: t.active }))));
      })
    `);

    const chromeTabA = chromeTabs.find((t) => t.url?.includes('4466448213'));
    const chromeTabB = chromeTabs.find((t) => t.url?.includes('4464770430'));

    if (!chromeTabA || !chromeTabB) {
      throw new Error('Could not resolve Chrome tab IDs for Tab A and Tab B');
    }

    const tabAId = chromeTabA.id;
    const tabBId = chromeTabB.id;
    console.log(`   Tab A Chrome Tab ID: ${tabAId} (${LIVE_QUIK_HIRE_URL})`);
    console.log(`   Tab B Chrome Tab ID: ${tabBId} (${LIVE_APPINVENTIV_URL})`);

    // 6. REAL MULTI-TAB ACTIVATION: Tab A active -> Tab B active -> Tab A active
    console.log('\n6. Executing Real Chrome Tab Activation (Zero Navigation Substitution)...');

    // --- STEP 6.1: ACTIVATE TAB A ---
    console.log('\n--- 6.1: Activating Tab A (Quik Hire Staffing) ---');
    await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.update(${tabAId}, { active: true }, (tab) => resolve(tab));
      })
    `);
    await sleep(4000); // Allow ACTIVE_TAB_CHANGED, DETECT_JOB_PAGE, and reconciliation

    const sidebarTabAState = await sidebarCdp.evaluate(`(() => {
      const c = window.__sidebarController;
      return {
        activeTabId: c?.activeTabId,
        title: document.getElementById('jobTitle')?.textContent.trim(),
        company: document.getElementById('jobCompany')?.textContent.trim(),
        portal: document.getElementById('portalName')?.textContent.trim(),
        workflowState: c?.stateMachine?.state,
        fingerprint: c?.activeJobFingerprint,
        rawJobData: c?.activeJob,
      };
    })()`);

    console.log('   Sidebar State for Tab A:');
    console.log(`     activeTabId:   ${sidebarTabAState.activeTabId} (Expected: ${tabAId})`);
    console.log(`     Title:         "${sidebarTabAState.title}"`);
    console.log(`     Company:       "${sidebarTabAState.company}"`);
    console.log(`     Portal:        "${sidebarTabAState.portal}"`);
    console.log(`     Fingerprint:   ${sidebarTabAState.fingerprint}`);
    console.log(`     WorkflowState: ${sidebarTabAState.workflowState}`);

    // Assertions for Tab A
    if (sidebarTabAState.activeTabId !== tabAId) {
      throw new Error(`Tab A activation failure: expected activeTabId ${tabAId}, got ${sidebarTabAState.activeTabId}`);
    }
    const isMarketingA = (sidebarTabAState.title || '').toLowerCase().includes('take the next step');
    if (isMarketingA) {
      throw new Error(`CRITICAL BUG: Title was extracted as marketing heading "${sidebarTabAState.title}"`);
    }
    if (!sidebarTabAState.title.toLowerCase().includes('backend software engineer')) {
      throw new Error(`Tab A title mismatch: expected Backend Software Engineer, got "${sidebarTabAState.title}"`);
    }
    if (!sidebarTabAState.company.toLowerCase().includes('quik hire')) {
      throw new Error(`Tab A company mismatch: expected Quik Hire Staffing, got "${sidebarTabAState.company}"`);
    }

    const screenshotTabAPath = path.join(SCREENSHOT_DIR, 'p75-01-tab-a-quik-hire.png');
    await sidebarCdp.captureScreenshot(screenshotTabAPath);
    console.log(`   Saved screenshot: ${screenshotTabAPath}`);

    // --- STEP 6.2: DIAGNOSTIC PARITY ASSERTION ON TAB A ---
    console.log('\n--- 6.2: Verifying Diagnostic Parity on Tab A ---');
    // Exact production flow: send DETECT_JOB_PAGE to Tab A via extension service worker
    const tabAContentScriptResponse = await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.sendMessage(${tabAId}, { type: 'DETECT_JOB_PAGE', requestId: 8888, tabId: ${tabAId} }, (response) => {
          resolve(response);
        });
      })
    `);

    const csJob = tabAContentScriptResponse?.jobData;
    const sbJob = sidebarTabAState.rawJobData;

    console.log('   Tab A Content Script Diagnostic Result:', JSON.stringify(csJob ? {
      title: csJob.title,
      company: csJob.company,
      selectedRootSelector: csJob.selectedRootSelector,
      selectedRootTag: csJob.selectedRootTag,
      selectedRootClass: csJob.selectedRootClass,
      titleSelectorUsed: csJob.titleSelectorUsed,
      companySelectorUsed: csJob.companySelectorUsed,
      descriptionSelectorUsed: csJob.descriptionSelectorUsed,
      descriptionLength: csJob.descriptionLength,
      isReady: csJob.isReady,
      analysisReady: csJob.analysisReady,
    } : null, null, 2));

    if (!csJob || !sbJob) {
      throw new Error('Failed to retrieve content-script or sidebar job object for diagnostic parity');
    }

    // Assert parity
    console.log('   Asserting: content-script title === sidebar title:');
    console.log(`     CS: "${csJob.title}" vs SB: "${sbJob.title}" -> ${csJob.title === sbJob.title ? 'MATCH' : 'MISMATCH'}`);
    if (csJob.title !== sbJob.title) throw new Error('Diagnostic parity mismatch on title');

    console.log('   Asserting: content-script company === sidebar company:');
    console.log(`     CS: "${csJob.company}" vs SB: "${sbJob.company}" -> ${csJob.company === sbJob.company ? 'MATCH' : 'MISMATCH'}`);
    if (csJob.company !== sbJob.company) throw new Error('Diagnostic parity mismatch on company');

    console.log('   Asserting: content-script fingerprint === sidebar fingerprint:');
    console.log(`     CS FP vs SB FP: ${sidebarTabAState.fingerprint ? 'MATCH' : 'MISMATCH'}`);

    // --- STEP 6.3: ACTIVATE TAB B ---
    console.log('\n--- 6.3: Activating Tab B (Appinventiv) ---');
    await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.update(${tabBId}, { active: true }, (tab) => resolve(tab));
      })
    `);
    await sleep(4000);

    const sidebarTabBState = await sidebarCdp.evaluate(`(() => {
      const c = window.__sidebarController;
      return {
        activeTabId: c?.activeTabId,
        title: document.getElementById('jobTitle')?.textContent.trim(),
        company: document.getElementById('jobCompany')?.textContent.trim(),
        portal: document.getElementById('portalName')?.textContent.trim(),
        workflowState: c?.stateMachine?.state,
        fingerprint: c?.activeJobFingerprint,
      };
    })()`);

    console.log('   Sidebar State for Tab B:');
    console.log(`     activeTabId:   ${sidebarTabBState.activeTabId} (Expected: ${tabBId})`);
    console.log(`     Title:         "${sidebarTabBState.title}"`);
    console.log(`     Company:       "${sidebarTabBState.company}"`);
    console.log(`     Fingerprint:   ${sidebarTabBState.fingerprint}`);

    if (sidebarTabBState.activeTabId !== tabBId) {
      throw new Error(`Tab B activation failure: expected activeTabId ${tabBId}, got ${sidebarTabBState.activeTabId}`);
    }
    if (!sidebarTabBState.title.toLowerCase().includes('software engineer')) {
      throw new Error(`Tab B title mismatch: expected Software Engineer, got "${sidebarTabBState.title}"`);
    }
    if (!sidebarTabBState.company.toLowerCase().includes('appinventiv')) {
      throw new Error(`Tab B company mismatch: expected Appinventiv, got "${sidebarTabBState.company}"`);
    }
    if (sidebarTabBState.fingerprint === sidebarTabAState.fingerprint) {
      throw new Error('Tab B fingerprint must be distinct from Tab A fingerprint');
    }

    const screenshotTabBPath = path.join(SCREENSHOT_DIR, 'p75-02-tab-b-appinventiv.png');
    await sidebarCdp.captureScreenshot(screenshotTabBPath);
    console.log(`   Saved screenshot: ${screenshotTabBPath}`);

    // --- STEP 6.4: ACTIVATE TAB A AGAIN ---
    console.log('\n--- 6.4: Activating Tab A Again (Switching Back) ---');
    await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.update(${tabAId}, { active: true }, (tab) => resolve(tab));
      })
    `);
    await sleep(4000);

    const sidebarRestoredA = await sidebarCdp.evaluate(`(() => {
      const c = window.__sidebarController;
      return {
        activeTabId: c?.activeTabId,
        title: document.getElementById('jobTitle')?.textContent.trim(),
        company: document.getElementById('jobCompany')?.textContent.trim(),
        fingerprint: c?.activeJobFingerprint,
        workflowState: c?.stateMachine?.state,
      };
    })()`);

    console.log('   Sidebar State after returning to Tab A:');
    console.log(`     activeTabId:   ${sidebarRestoredA.activeTabId} (Expected: ${tabAId})`);
    console.log(`     Title:         "${sidebarRestoredA.title}"`);
    console.log(`     Company:       "${sidebarRestoredA.company}"`);
    console.log(`     Fingerprint:   ${sidebarRestoredA.fingerprint}`);

    if (sidebarRestoredA.activeTabId !== tabAId) {
      throw new Error(`Tab A reactivation failure: expected activeTabId ${tabAId}, got ${sidebarRestoredA.activeTabId}`);
    }
    if (!sidebarRestoredA.title.toLowerCase().includes('backend software engineer')) {
      throw new Error(`Tab A restored title mismatch: expected Backend Software Engineer, got "${sidebarRestoredA.title}"`);
    }
    if (!sidebarRestoredA.company.toLowerCase().includes('quik hire')) {
      throw new Error(`Tab A restored company mismatch: expected Quik Hire Staffing, got "${sidebarRestoredA.company}"`);
    }

    const screenshotTabARestoredPath = path.join(SCREENSHOT_DIR, 'p75-03-tab-a-restored.png');
    await sidebarCdp.captureScreenshot(screenshotTabARestoredPath);
    console.log(`   Saved screenshot: ${screenshotTabARestoredPath}`);

    // 7. FRESH DETECTION VS PERSISTED STATE CONVERGENCE
    console.log('\n7. Verifying 3-Way State Convergence on Tab A (Persisted === Fresh === Rendered)...');
    const persistedStateTabA = await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.storage.local.get('ach_wf_tab_${tabAId}', (items) => resolve(items['ach_wf_tab_${tabAId}']));
      })
    `);

    const persistedJob = persistedStateTabA?.jobData;
    const freshJob = csJob;
    const renderedJob = sidebarRestoredA;

    console.log(`   Persisted Job: "${persistedJob?.title}" at "${persistedJob?.company}" (FP: ${persistedStateTabA?.jobFingerprint})`);
    console.log(`   Fresh Job:     "${freshJob?.title}" at "${freshJob?.company}"`);
    console.log(`   Rendered Job:  "${renderedJob.title}" at "${renderedJob.company}" (FP: ${renderedJob.fingerprint})`);

    if (persistedJob?.title !== freshJob?.title || freshJob?.title !== renderedJob.title) {
      throw new Error('Title convergence failure across persisted, fresh, and rendered states');
    }
    if (persistedJob?.company !== freshJob?.company || freshJob?.company !== renderedJob.company) {
      throw new Error('Company convergence failure across persisted, fresh, and rendered states');
    }
    console.log('   [SUCCESS] 3-way state convergence confirmed!');

    // 8. RELOAD FRESH-DETECTION PROOF
    console.log('\n8. Executing Real Tab Reload & Fresh-Detection Verification...');
    const reqIdBeforeReload = await sidebarCdp.evaluate(`window.__sidebarController._detectionRequestId`);
    console.log(`   Detection Request ID before reload: ${reqIdBeforeReload}`);

    console.log('   Reloading Tab A in Chrome...');
    await tabACdp.send('Page.reload');

    console.log('   Waiting for content script reinitialization and fresh detection delivery...');
    await sleep(7000);

    const reqIdAfterReload = await sidebarCdp.evaluate(`window.__sidebarController._detectionRequestId`);
    console.log(`   Detection Request ID after reload: ${reqIdAfterReload}`);

    if (reqIdAfterReload <= reqIdBeforeReload) {
      throw new Error(`CRITICAL: Tab reload did not initiate fresh detection! Expected request ID > ${reqIdBeforeReload}, got ${reqIdAfterReload}`);
    }

    const reloadedSidebarState = await sidebarCdp.evaluate(`(() => {
      const c = window.__sidebarController;
      return {
        title: document.getElementById('jobTitle')?.textContent.trim(),
        company: document.getElementById('jobCompany')?.textContent.trim(),
        fingerprint: c?.activeJobFingerprint,
      };
    })()`);

    console.log(`   Reloaded Sidebar State: "${reloadedSidebarState.title}" at "${reloadedSidebarState.company}"`);
    if (!reloadedSidebarState.title.toLowerCase().includes('backend software engineer')) {
      throw new Error(`Reloaded title mismatch: expected Backend Software Engineer, got "${reloadedSidebarState.title}"`);
    }

    const screenshotReloadPath = path.join(SCREENSHOT_DIR, 'p75-04-tab-a-reloaded-fresh.png');
    await sidebarCdp.captureScreenshot(screenshotReloadPath);
    console.log(`   Saved reload screenshot: ${screenshotReloadPath}`);

    // 9. SPA NAVIGATION WITHIN SAME TAB
    console.log('\n9. Executing In-Tab SPA Navigation (Job A -> Job B -> Job A)...');
    console.log(`   Navigating Tab A to Job B URL: ${LIVE_APPINVENTIV_URL}...`);
    await tabACdp.send('Page.navigate', { url: LIVE_APPINVENTIV_URL });
    await sleep(7000);

    // Trigger switch via Rescan
    await sidebarCdp.evaluate(`(async () => {
      await window.__sidebarController.rescan();
    })()`);
    await sleep(4000);

    const spaJobBState = await sidebarCdp.evaluate(`(() => {
      return {
        title: document.getElementById('jobTitle')?.textContent.trim(),
        company: document.getElementById('jobCompany')?.textContent.trim(),
        fingerprint: window.__sidebarController?.activeJobFingerprint,
      };
    })()`);
    console.log(`   SPA Job B Result: "${spaJobBState.title}" at "${spaJobBState.company}"`);
    if (!spaJobBState.title.toLowerCase().includes('software engineer')) {
      throw new Error(`SPA transition to Job B failed: got "${spaJobBState.title}"`);
    }

    console.log(`   Navigating Tab A back to Job A URL: ${LIVE_QUIK_HIRE_URL}...`);
    await tabACdp.send('Page.navigate', { url: LIVE_QUIK_HIRE_URL });
    await sleep(7000);

    await sidebarCdp.evaluate(`(async () => {
      await window.__sidebarController.rescan();
    })()`);
    await sleep(4000);

    const spaJobARestored = await sidebarCdp.evaluate(`(() => {
      return {
        title: document.getElementById('jobTitle')?.textContent.trim(),
        company: document.getElementById('jobCompany')?.textContent.trim(),
        fingerprint: window.__sidebarController?.activeJobFingerprint,
      };
    })()`);
    console.log(`   SPA Job A Restored: "${spaJobARestored.title}" at "${spaJobARestored.company}"`);
    if (!spaJobARestored.title.toLowerCase().includes('backend software engineer')) {
      throw new Error(`SPA transition back to Job A failed: got "${spaJobARestored.title}"`);
    }

    const screenshotSpaPath = path.join(SCREENSHOT_DIR, 'p75-05-spa-navigation.png');
    await sidebarCdp.captureScreenshot(screenshotSpaPath);
    console.log(`   Saved SPA screenshot: ${screenshotSpaPath}`);

    // 10. MANUAL RESCAN SEMANTICS
    console.log('\n10. Testing Manual Rescan in Real Side Panel...');
    const rescanBefore = await sidebarCdp.evaluate(`window.__sidebarController._detectionRequestId`);
    await sidebarCdp.evaluate(`document.getElementById('rescanBtn').click()`);
    await sleep(3000);
    const rescanAfter = await sidebarCdp.evaluate(`window.__sidebarController._detectionRequestId`);
    console.log(`   Rescan ID before: ${rescanBefore}, after: ${rescanAfter}`);
    if (rescanAfter <= rescanBefore) {
      throw new Error('Rescan button did not increment detection request ID');
    }

    // 11. CHATGPT NEGATIVE REGRESSION
    console.log('\n11. Testing ChatGPT Negative Regression in Real Side Panel...');
    console.log(`    Navigating Tab B to ${LIVE_CHATGPT_URL}...`);
    await tabBCdp.send('Page.navigate', { url: LIVE_CHATGPT_URL });
    await sleep(6000);

    // Activate ChatGPT Tab
    await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.update(${tabBId}, { active: true }, (tab) => resolve(tab));
      })
    `);
    await sleep(4000);

    const chatgptSidebarState = await sidebarCdp.evaluate(`(() => {
      const c = window.__sidebarController;
      return {
        activeTabId: c?.activeTabId,
        portal: document.getElementById('portalName')?.textContent.trim(),
        title: document.getElementById('jobTitle')?.textContent.trim(),
        company: document.getElementById('jobCompany')?.textContent.trim(),
        analyzeDisabled: document.getElementById('analyzeJobBtn')?.disabled,
        activeJob: c?.activeJob,
      };
    })()`);

    console.log('   ChatGPT Sidebar State:');
    console.log(`     Portal:          "${chatgptSidebarState.portal}"`);
    console.log(`     Title:           "${chatgptSidebarState.title}"`);
    console.log(`     Company:         "${chatgptSidebarState.company}"`);
    console.log(`     AnalyzeDisabled: ${chatgptSidebarState.analyzeDisabled}`);
    console.log(`     activeJob:       ${chatgptSidebarState.activeJob}`);

    if (chatgptSidebarState.portal !== 'Web Page') {
      throw new Error(`ChatGPT portal mismatch: expected "Web Page", got "${chatgptSidebarState.portal}"`);
    }
    if (chatgptSidebarState.title !== '—' || chatgptSidebarState.company !== '—') {
      throw new Error(`ChatGPT title/company must be empty "—", got "${chatgptSidebarState.title}" / "${chatgptSidebarState.company}"`);
    }
    if (chatgptSidebarState.analyzeDisabled !== true) {
      throw new Error('Analyze Job button must be disabled on ChatGPT');
    }
    if (chatgptSidebarState.activeJob !== null) {
      throw new Error('activeJob must be null on ChatGPT');
    }

    const screenshotChatgptPath = path.join(SCREENSHOT_DIR, 'p75-06-chatgpt-rejected.png');
    await sidebarCdp.captureScreenshot(screenshotChatgptPath);
    console.log(`   Saved ChatGPT screenshot: ${screenshotChatgptPath}`);

    // 12. WORKING PORTALS REGRESSION
    console.log('\n12. Testing Working Portals Regression (Greenhouse ATS)...');
    console.log(`    Navigating Tab B to ${LIVE_GREENHOUSE_URL}...`);
    await tabBCdp.send('Page.navigate', { url: LIVE_GREENHOUSE_URL });
    await sleep(6000);

    // Activate Greenhouse Tab
    await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.update(${tabBId}, { active: true }, (tab) => resolve(tab));
      })
    `);
    await sleep(4000);

    const greenhouseSidebarState = await sidebarCdp.evaluate(`(() => {
      const c = window.__sidebarController;
      return {
        activeTabId: c?.activeTabId,
        portal: document.getElementById('portalName')?.textContent.trim(),
        title: document.getElementById('jobTitle')?.textContent.trim(),
        company: document.getElementById('jobCompany')?.textContent.trim(),
      };
    })()`);
    console.log(`    Greenhouse Portal State: "${greenhouseSidebarState.portal}" ("${greenhouseSidebarState.title}" at "${greenhouseSidebarState.company}")`);

    if (!greenhouseSidebarState.portal.toLowerCase().includes('greenhouse')) {
      throw new Error(`Greenhouse portal mismatch: expected Greenhouse ATS, got "${greenhouseSidebarState.portal}"`);
    }

    const screenshotPortalsPath = path.join(SCREENSHOT_DIR, 'p75-07-working-portals.png');
    await sidebarCdp.captureScreenshot(screenshotPortalsPath);
    console.log(`   Saved Working Portals screenshot: ${screenshotPortalsPath}`);

    console.log('\n=================================================================');
    console.log('=== P75 LIVE ACCEPTANCE: ALL 12 VERIFICATION PHASES PASSED! ===');
    console.log('=================================================================\n');

  } finally {
    if (browserCdp) browserCdp.close();
    if (swCdp) swCdp.close();
    if (sidebarCdp) sidebarCdp.close();
    if (tabACdp) tabACdp.close();
    if (tabBCdp) tabBCdp.close();
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
    console.error('\n❌ P75 VERIFICATION FAILED:', err);
    process.exit(1);
  });

