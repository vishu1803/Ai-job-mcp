/**
 * @file Part 80 Real Chrome Live Acceptance Verification Script.
 *
 * Validates Requirement 4:
 * 1. ACTUAL SIDE PANEL:
 *    - Opened exclusively via chrome.sidePanel.open({ windowId }) through popup user gesture.
 *    - Target: unpinned sidebar.html with no tabId query param.
 * 2. ACTUAL TAB SWITCHING (Quik Hire / Appinventiv):
 *    - Tab A: Quik Hire Staffing job (4466448213).
 *    - Tab B: Appinventiv job (4464770430).
 *    - Genuine Chrome tab activation via chrome.tabs.update.
 * 3. FRESH RELOAD OF QUIK HIRE:
 *    - Page.reload executed on Tab A.
 *    - Verifies fresh detection request dispatched.
 *    - Verifies canonical title, company, and fingerprint remain unchanged.
 * 4. FRESH RELOAD OF APPINVENTIV:
 *    - Switch to Tab B, Page.reload executed on Tab B.
 *    - Verifies fresh detection request dispatched.
 *    - Verifies canonical title, company, and fingerprint remain unchanged.
 * 5. EXPLICIT RESCAN:
 *    - DOM click on #rescanBtn.
 *    - Verifies canonical title, company, and fingerprint remain unchanged.
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
const PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cft-p80-identity-'));
const EXTENSION_DIR = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const SCREENSHOT_DIR = 'C:\\Users\\VISHW\\.gemini\\antigravity-ide\\brain\\93a47748-8fd0-419b-8656-f7e93b0a6a67';
const CDP_PORT = 9465;

const LIVE_QUIK_HIRE_URL = 'https://www.linkedin.com/jobs/view/4466448213/';
const LIVE_APPINVENTIV_URL = 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430';

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
  console.log('=== PART 80: REAL CHROME SIDE PANEL & IDENTITY RELOAD VERIFICATION ===\n');

  // 0. Authenticate candidate session
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
  let sidebarCdp = null;
  let tabACdp = null;
  let tabBCdp = null;

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

    console.log('2. Authenticating extension storage and cookies...');
    await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.storage.local.set({
          authToken: ${JSON.stringify(session.rawToken)},
          sessionToken: ${JSON.stringify(session.rawToken)},
          cachedAuthUser: {
            id: '${canonicalUser.id}',
            email: '${canonicalUser.email}',
            displayName: '${canonicalUser.displayName || 'Vishwanath Nishad'}'
          },
          userProfile: ${JSON.stringify({
            id: canonicalUser.id,
            email: canonicalUser.email,
            name: canonicalUser.displayName || 'Vishwanath Nishad',
          })},
          activePortal: { portalName: 'LinkedIn', isJobPage: true }
        }, resolve);
      })
    `);

    // 3. Open Real Side Panel via chrome.sidePanel.open()
    console.log('3. Opening authentic Chrome Side Panel via chrome.sidePanel.open()...');
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
    if (!sidePanelTarget) throw new Error('Authentic Chrome Side Panel target not found');

    const sbItem = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find(
      (item) => item.id === sidePanelTarget.targetId
    );
    sidebarCdp = new CDPClient(sbItem.webSocketDebuggerUrl);
    await sidebarCdp.connect();
    await sidebarCdp.send('Runtime.enable');
    await sidebarCdp.send('DOM.enable');
    await sidebarCdp.send('Network.setCookie', {
      name: 'career_hub_session',
      value: session.rawToken,
      url: 'http://localhost:3000',
    });
    await sidebarCdp.send('Network.setCookie', {
      name: 'career_hub_session',
      value: session.rawToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    });
    await sidebarCdp.evaluate(`(async () => {
      await window.__sidebarController?._checkAuthStatus();
    })()`);
    console.log('   Connected to authentic Side Panel (authenticated)');

    // =========================================================================
    // STEP A: OPEN TAB A (Quik Hire) & RECORD CANONICAL IDENTITY
    // =========================================================================
    console.log(`\n4. Opening Tab A (Quik Hire): ${LIVE_QUIK_HIRE_URL}...`);
    const tabATarget = await browserCdp.send('Target.createTarget', { url: LIVE_QUIK_HIRE_URL });
    await sleep(8000);

    const initialTabs = await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.query({}, (tabs) => resolve(tabs.map(t => ({ id: t.id, url: t.url, active: t.active }))));
      })
    `);
    const tabAInfo = initialTabs.find((t) => t.url?.includes('4466448213'));
    if (!tabAInfo) throw new Error('Tab A not found');

    const listWithA = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const tabAItem = listWithA.find((item) => item.url?.includes('4466448213'));
    tabACdp = new CDPClient(tabAItem.webSocketDebuggerUrl);
    await tabACdp.connect();
    await tabACdp.send('Page.enable');

    console.log('   Activating Tab A in Chrome...');
    await swCdp.evaluate(`
      new Promise((resolve) => chrome.tabs.update(${tabAInfo.id}, { active: true }, resolve))
    `);
    await sleep(4000);

    // Poll Side Panel for Quik Hire
    let tabAState = null;
    for (let i = 1; i <= 15; i++) {
      await sleep(1000);
      tabAState = await sidebarCdp.evaluate(`
        (() => ({
          second: ${i},
          domTitle: document.getElementById('jobTitle')?.textContent?.trim(),
          domCompany: document.getElementById('jobCompany')?.textContent?.trim(),
          activeTitle: window.__sidebarController?.activeJob?.title,
          activeCompany: window.__sidebarController?.activeJob?.company,
          fingerprint: window.__sidebarController?.activeJobFingerprint,
          reqId: window.__sidebarController?._detectionRequestId,
        }))()
      `);
      if (tabAState?.domTitle && tabAState.domTitle !== '—' && tabAState.domCompany?.includes('Quik Hire')) {
        console.log(`   [T+${i}s] Tab A Rendered: "${tabAState.domTitle}" at "${tabAState.domCompany}"`);
        break;
      }
    }

    if (!tabAState?.domTitle || tabAState.domTitle === '—') {
      console.log('   Triggering DOM click on #rescanBtn for Tab A...');
      await sidebarCdp.evaluate(`document.getElementById('rescanBtn').click()`);
      await sleep(4000);
      tabAState = await sidebarCdp.evaluate(`
        (() => ({
          domTitle: document.getElementById('jobTitle')?.textContent?.trim(),
          domCompany: document.getElementById('jobCompany')?.textContent?.trim(),
          activeTitle: window.__sidebarController?.activeJob?.title,
          activeCompany: window.__sidebarController?.activeJob?.company,
          fingerprint: window.__sidebarController?.activeJobFingerprint,
          reqId: window.__sidebarController?._detectionRequestId,
        }))()
      `);
    }

    console.log('\n--- CANONICAL QUIK HIRE BASELINE ---');
    console.log(JSON.stringify(tabAState, null, 2));
    if (!tabAState?.domTitle || !tabAState.domTitle.toLowerCase().includes('backend')) {
      throw new Error(`Failed to bind authentic Quik Hire job title: ${JSON.stringify(tabAState)}`);
    }

    const quikHireCanonical = {
      title: tabAState.domTitle,
      company: tabAState.domCompany,
      fingerprint: tabAState.fingerprint,
    };
    console.log(`   Canonical Quik Hire: "${quikHireCanonical.title}" | "${quikHireCanonical.company}" | FP: ${quikHireCanonical.fingerprint}`);

    // =========================================================================
    // STEP B: OPEN TAB B (Appinventiv) & RECORD CANONICAL IDENTITY
    // =========================================================================
    console.log(`\n5. Opening Tab B (Appinventiv): ${LIVE_APPINVENTIV_URL}...`);
    const tabBTarget = await browserCdp.send('Target.createTarget', { url: LIVE_APPINVENTIV_URL });
    await sleep(8000);

    const tabsWithB = await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.query({}, (tabs) => resolve(tabs.map(t => ({ id: t.id, url: t.url }))));
      })
    `);
    const tabBInfo = tabsWithB.find((t) => t.url?.includes('4464770430'));
    if (!tabBInfo) throw new Error('Tab B not found');

    const listWithB = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const tabBItem = listWithB.find((item) => item.url?.includes('4464770430'));
    tabBCdp = new CDPClient(tabBItem.webSocketDebuggerUrl);
    await tabBCdp.connect();
    await tabBCdp.send('Page.enable');

    console.log('   Activating Tab B in Chrome...');
    await swCdp.evaluate(`
      new Promise((resolve) => chrome.tabs.update(${tabBInfo.id}, { active: true }, resolve))
    `);
    await sleep(4000);

    let tabBState = null;
    for (let i = 1; i <= 15; i++) {
      await sleep(1000);
      tabBState = await sidebarCdp.evaluate(`
        (() => ({
          second: ${i},
          domTitle: document.getElementById('jobTitle')?.textContent?.trim(),
          domCompany: document.getElementById('jobCompany')?.textContent?.trim(),
          activeTitle: window.__sidebarController?.activeJob?.title,
          activeCompany: window.__sidebarController?.activeJob?.company,
          fingerprint: window.__sidebarController?.activeJobFingerprint,
          reqId: window.__sidebarController?._detectionRequestId,
        }))()
      `);
      if (tabBState?.domTitle && tabBState.domTitle !== '—' && tabBState.domCompany?.includes('Appinventiv')) {
        console.log(`   [T+${i}s] Tab B Rendered: "${tabBState.domTitle}" at "${tabBState.domCompany}"`);
        break;
      }
    }

    if (!tabBState?.domCompany?.includes('Appinventiv')) {
      console.log('   Triggering DOM click on #rescanBtn for Tab B...');
      await sidebarCdp.evaluate(`document.getElementById('rescanBtn').click()`);
      await sleep(4000);
      tabBState = await sidebarCdp.evaluate(`
        (() => ({
          domTitle: document.getElementById('jobTitle')?.textContent?.trim(),
          domCompany: document.getElementById('jobCompany')?.textContent?.trim(),
          activeTitle: window.__sidebarController?.activeJob?.title,
          activeCompany: window.__sidebarController?.activeJob?.company,
          fingerprint: window.__sidebarController?.activeJobFingerprint,
          reqId: window.__sidebarController?._detectionRequestId,
        }))()
      `);
    }

    console.log('\n--- CANONICAL APPINVENTIV BASELINE ---');
    console.log(JSON.stringify(tabBState, null, 2));
    if (!tabBState?.domCompany?.includes('Appinventiv')) {
      throw new Error(`Failed to bind authentic Appinventiv job: ${JSON.stringify(tabBState)}`);
    }

    const appinventivCanonical = {
      title: tabBState.domTitle,
      company: tabBState.domCompany,
      fingerprint: tabBState.fingerprint,
    };
    console.log(`   Canonical Appinventiv: "${appinventivCanonical.title}" | "${appinventivCanonical.company}" | FP: ${appinventivCanonical.fingerprint}`);

    // =========================================================================
    // STEP C: TAB SWITCHING (Tab B -> Tab A) & RESTORATION ASSERTIONS
    // =========================================================================
    console.log('\n6. Switching back to Tab A (Quik Hire) via Chrome tab activation...');
    await swCdp.evaluate(`
      new Promise((resolve) => chrome.tabs.update(${tabAInfo.id}, { active: true }, resolve))
    `);
    await sleep(4000);

    const tabARestored = await sidebarCdp.evaluate(`
      (() => ({
        domTitle: document.getElementById('jobTitle')?.textContent?.trim(),
        domCompany: document.getElementById('jobCompany')?.textContent?.trim(),
        activeTitle: window.__sidebarController?.activeJob?.title,
        activeCompany: window.__sidebarController?.activeJob?.company,
        fingerprint: window.__sidebarController?.activeJobFingerprint,
        reqId: window.__sidebarController?._detectionRequestId,
      }))()
    `);
    console.log('\n--- TAB A RESTORED STATE ---');
    console.log(JSON.stringify(tabARestored, null, 2));

    console.log(`   Assertion [Tab Switching]: Title preserved: ${tabARestored.domTitle === quikHireCanonical.title ? 'PASS' : 'FAIL'}`);
    console.log(`   Assertion [Tab Switching]: Company preserved: ${tabARestored.domCompany === quikHireCanonical.company ? 'PASS' : 'FAIL'}`);
    console.log(`   Assertion [Tab Switching]: Fingerprint preserved: ${tabARestored.fingerprint === quikHireCanonical.fingerprint ? 'PASS' : 'FAIL'}`);

    if (tabARestored.domTitle !== quikHireCanonical.title) {
      throw new Error(`Tab switching corrupted Quik Hire title: expected "${quikHireCanonical.title}", got "${tabARestored.domTitle}"`);
    }
    if (tabARestored.domCompany !== quikHireCanonical.company) {
      throw new Error(`Tab switching corrupted Quik Hire company: expected "${quikHireCanonical.company}", got "${tabARestored.domCompany}"`);
    }
    if (tabARestored.fingerprint !== quikHireCanonical.fingerprint) {
      throw new Error(`Tab switching corrupted Quik Hire fingerprint: expected "${quikHireCanonical.fingerprint}", got "${tabARestored.fingerprint}"`);
    }

    const shot1 = path.join(SCREENSHOT_DIR, 'p80-01-tab-a-switched.png');
    await sidebarCdp.captureScreenshot(shot1);
    console.log(`   Saved screenshot: ${shot1}`);

    // =========================================================================
    // STEP D: FRESH RELOAD OF QUIK HIRE (TAB A)
    // =========================================================================
    console.log('\n7. Executing fresh reload of Tab A (Quik Hire)...');
    const reqIdBeforeQuikReload = tabARestored.reqId || 0;
    console.log(`   Detection Request ID before reload: ${reqIdBeforeQuikReload}`);

    await tabACdp.send('Page.reload');
    console.log('   Waiting 8s for reload and fresh content-script detection...');
    await sleep(8000);

    let quikReloaded = null;
    for (let i = 1; i <= 10; i++) {
      quikReloaded = await sidebarCdp.evaluate(`
        (() => ({
          domTitle: document.getElementById('jobTitle')?.textContent?.trim(),
          domCompany: document.getElementById('jobCompany')?.textContent?.trim(),
          activeTitle: window.__sidebarController?.activeJob?.title,
          activeCompany: window.__sidebarController?.activeJob?.company,
          fingerprint: window.__sidebarController?.activeJobFingerprint,
          reqId: window.__sidebarController?._detectionRequestId,
        }))()
      `);
      if (quikReloaded.reqId > reqIdBeforeQuikReload && quikReloaded.domTitle !== '—') break;
      await sleep(1000);
    }

    console.log('\n--- QUIK HIRE RELOADED STATE ---');
    console.log(JSON.stringify(quikReloaded, null, 2));

    console.log(`   Detection Request ID after reload: ${quikReloaded.reqId} (fresh detection confirmed: ${quikReloaded.reqId > reqIdBeforeQuikReload})`);
    if (quikReloaded.reqId <= reqIdBeforeQuikReload) {
      throw new Error(`CRITICAL: Tab reload did not initiate fresh detection! Expected request ID > ${reqIdBeforeQuikReload}, got ${quikReloaded.reqId}`);
    }

    console.log(`   Assertion [Quik Hire Reload]: Title unchanged: ${quikReloaded.domTitle === quikHireCanonical.title ? 'PASS' : 'FAIL'}`);
    console.log(`   Assertion [Quik Hire Reload]: Company unchanged: ${quikReloaded.domCompany === quikHireCanonical.company ? 'PASS' : 'FAIL'}`);
    console.log(`   Assertion [Quik Hire Reload]: Fingerprint unchanged: ${quikReloaded.fingerprint === quikHireCanonical.fingerprint ? 'PASS' : 'FAIL'}`);

    if (quikReloaded.domTitle !== quikHireCanonical.title) {
      throw new Error(`Quik Hire reload title mismatch: expected "${quikHireCanonical.title}", got "${quikReloaded.domTitle}"`);
    }
    if (quikReloaded.domCompany !== quikHireCanonical.company) {
      throw new Error(`Quik Hire reload company mismatch: expected "${quikHireCanonical.company}", got "${quikReloaded.domCompany}"`);
    }
    if (quikReloaded.fingerprint !== quikHireCanonical.fingerprint) {
      throw new Error(`Quik Hire reload fingerprint mismatch: expected "${quikHireCanonical.fingerprint}", got "${quikReloaded.fingerprint}"`);
    }

    const shot2 = path.join(SCREENSHOT_DIR, 'p80-02-quik-hire-reloaded.png');
    await sidebarCdp.captureScreenshot(shot2);
    console.log(`   Saved screenshot: ${shot2}`);

    // =========================================================================
    // STEP E: SWITCH TO TAB B & FRESH RELOAD OF APPINVENTIV
    // =========================================================================
    console.log('\n8. Switching to Tab B (Appinventiv) via Chrome tab activation...');
    await swCdp.evaluate(`
      new Promise((resolve) => chrome.tabs.update(${tabBInfo.id}, { active: true }, resolve))
    `);
    await sleep(4000);

    const tabBBeforeReload = await sidebarCdp.evaluate(`
      (() => ({
        domTitle: document.getElementById('jobTitle')?.textContent?.trim(),
        domCompany: document.getElementById('jobCompany')?.textContent?.trim(),
        fingerprint: window.__sidebarController?.activeJobFingerprint,
        reqId: window.__sidebarController?._detectionRequestId,
      }))()
    `);
    console.log(`   Detection Request ID before Appinventiv reload: ${tabBBeforeReload.reqId}`);

    console.log('   Executing fresh reload of Tab B (Appinventiv)...');
    await tabBCdp.send('Page.reload');
    console.log('   Waiting 8s for reload and fresh content-script detection...');
    await sleep(8000);

    let appinventivReloaded = null;
    for (let i = 1; i <= 10; i++) {
      appinventivReloaded = await sidebarCdp.evaluate(`
        (() => ({
          domTitle: document.getElementById('jobTitle')?.textContent?.trim(),
          domCompany: document.getElementById('jobCompany')?.textContent?.trim(),
          activeTitle: window.__sidebarController?.activeJob?.title,
          activeCompany: window.__sidebarController?.activeJob?.company,
          fingerprint: window.__sidebarController?.activeJobFingerprint,
          reqId: window.__sidebarController?._detectionRequestId,
        }))()
      `);
      if (appinventivReloaded.reqId > tabBBeforeReload.reqId && appinventivReloaded.domTitle !== '—') break;
      await sleep(1000);
    }

    console.log('\n--- APPINVENTIV RELOADED STATE ---');
    console.log(JSON.stringify(appinventivReloaded, null, 2));

    console.log(`   Detection Request ID after Appinventiv reload: ${appinventivReloaded.reqId} (fresh detection confirmed: ${appinventivReloaded.reqId > tabBBeforeReload.reqId})`);
    if (appinventivReloaded.reqId <= tabBBeforeReload.reqId) {
      throw new Error(`CRITICAL: Tab B reload did not initiate fresh detection! Expected request ID > ${tabBBeforeReload.reqId}, got ${appinventivReloaded.reqId}`);
    }

    console.log(`   Assertion [Appinventiv Reload]: Title unchanged: ${appinventivReloaded.domTitle === appinventivCanonical.title ? 'PASS' : 'FAIL'}`);
    console.log(`   Assertion [Appinventiv Reload]: Company unchanged: ${appinventivReloaded.domCompany === appinventivCanonical.company ? 'PASS' : 'FAIL'}`);
    console.log(`   Assertion [Appinventiv Reload]: Fingerprint unchanged: ${appinventivReloaded.fingerprint === appinventivCanonical.fingerprint ? 'PASS' : 'FAIL'}`);

    if (appinventivReloaded.domTitle !== appinventivCanonical.title) {
      throw new Error(`Appinventiv reload title mismatch: expected "${appinventivCanonical.title}", got "${appinventivReloaded.domTitle}"`);
    }
    if (appinventivReloaded.domCompany !== appinventivCanonical.company) {
      throw new Error(`Appinventiv reload company mismatch: expected "${appinventivCanonical.company}", got "${appinventivReloaded.domCompany}"`);
    }
    if (appinventivReloaded.fingerprint !== appinventivCanonical.fingerprint) {
      throw new Error(`Appinventiv reload fingerprint mismatch: expected "${appinventivCanonical.fingerprint}", got "${appinventivReloaded.fingerprint}"`);
    }

    const shot3 = path.join(SCREENSHOT_DIR, 'p80-03-appinventiv-reloaded.png');
    await sidebarCdp.captureScreenshot(shot3);
    console.log(`   Saved screenshot: ${shot3}`);

    // =========================================================================
    // STEP F: EXPLICIT RESCAN & INVARIANCE ASSERTION
    // =========================================================================
    console.log('\n9. Triggering explicit Rescan via DOM click on #rescanBtn...');
    const reqIdBeforeRescan = appinventivReloaded.reqId;
    await sidebarCdp.evaluate(`document.getElementById('rescanBtn').click()`);
    console.log('   Waiting 4s for rescan completion...');
    await sleep(4000);

    const rescanState = await sidebarCdp.evaluate(`
      (() => ({
        domTitle: document.getElementById('jobTitle')?.textContent?.trim(),
        domCompany: document.getElementById('jobCompany')?.textContent?.trim(),
        activeTitle: window.__sidebarController?.activeJob?.title,
        activeCompany: window.__sidebarController?.activeJob?.company,
        fingerprint: window.__sidebarController?.activeJobFingerprint,
        reqId: window.__sidebarController?._detectionRequestId,
      }))()
    `);

    console.log('\n--- EXPLICIT RESCAN STATE ---');
    console.log(JSON.stringify(rescanState, null, 2));

    console.log(`   Detection Request ID after rescan: ${rescanState.reqId} (new request confirmed: ${rescanState.reqId > reqIdBeforeRescan})`);
    console.log(`   Assertion [Explicit Rescan]: Title unchanged: ${rescanState.domTitle === appinventivCanonical.title ? 'PASS' : 'FAIL'}`);
    console.log(`   Assertion [Explicit Rescan]: Company unchanged: ${rescanState.domCompany === appinventivCanonical.company ? 'PASS' : 'FAIL'}`);
    console.log(`   Assertion [Explicit Rescan]: Fingerprint unchanged: ${rescanState.fingerprint === appinventivCanonical.fingerprint ? 'PASS' : 'FAIL'}`);

    if (rescanState.domTitle !== appinventivCanonical.title) {
      throw new Error(`Explicit rescan title mismatch: expected "${appinventivCanonical.title}", got "${rescanState.domTitle}"`);
    }
    if (rescanState.domCompany !== appinventivCanonical.company) {
      throw new Error(`Explicit rescan company mismatch: expected "${appinventivCanonical.company}", got "${rescanState.domCompany}"`);
    }
    if (rescanState.fingerprint !== appinventivCanonical.fingerprint) {
      throw new Error(`Explicit rescan fingerprint mismatch: expected "${appinventivCanonical.fingerprint}", got "${rescanState.fingerprint}"`);
    }

    const shot4 = path.join(SCREENSHOT_DIR, 'p80-04-explicit-rescan.png');
    await sidebarCdp.captureScreenshot(shot4);
    console.log(`   Saved screenshot: ${shot4}`);

    console.log('\n=========================================================================');
    console.log('ALL PART 80 REAL CHROME LIVE ACCEPTANCE CHECKS PASSED:');
    console.log('  ✔ Authentic Side Panel opened via chrome.sidePanel.open');
    console.log('  ✔ Authentic Tab Switching: Quik Hire <-> Appinventiv with zero state leakage');
    console.log('  ✔ Fresh reload of Quik Hire: title, company, fingerprint strictly invariant');
    console.log('  ✔ Fresh reload of Appinventiv: title, company, fingerprint strictly invariant');
    console.log('  ✔ Explicit Rescan: title, company, fingerprint strictly invariant');
    console.log('  ✔ 4 visual proof screenshots captured to brain artifact directory');
    console.log('=========================================================================\n');

  } finally {
    if (sidebarCdp) sidebarCdp.close();
    if (swCdp) swCdp.close();
    if (tabACdp) tabACdp.close();
    if (tabBCdp) tabBCdp.close();
    if (browserCdp) browserCdp.close();
    try { chromeProcess.kill('SIGTERM'); } catch {}
  }
}

main().catch((err) => {
  console.error('\n❌ P80 REAL CHROME VERIFICATION FAILED:', err);
  process.exit(1);
});
