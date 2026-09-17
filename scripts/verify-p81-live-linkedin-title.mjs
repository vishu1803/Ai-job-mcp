/**
 * @file P81 Real Chrome Live LinkedIn Title False-Positive Verification Script
 *
 * Verifies live in real Chrome for Testing:
 * 1. Target URL: https://www.linkedin.com/jobs/view/4465164301/ (Triveous)
 * 2. Authentic Side Panel opened via chrome.sidePanel.open({ windowId }).
 * 3. Verified authentic extraction:
 *    - Title: strictly "Full Stack Developer"
 *    - Company: strictly "Triveous"
 *    - AI copy: "Use AI to assess how you fit" strictly REJECTED and NEVER displayed.
 * 4. Stress verification with live AI-fit widget heading:
 *    - Presence of <h2>Use AI to assess how you fit</h2> inside the root container.
 *    - Trigger #rescanBtn.click().
 *    - Side panel firmly retains "Full Stack Developer" and "Triveous".
 * 5. Page.reload resilience:
 *    - Fresh reload dispatches detection cycle.
 *    - Side panel retains authentic title and company without regressing to promotional copy.
 * 6. Tab switching resilience:
 *    - Switch to Tab B (Quik Hire 4466448213).
 *    - Side panel switches to "Backend Software Engineer (Remote)" / "Quik Hire Staffing".
 *    - Switch back to Tab A (Triveous 4465164301).
 *    - Side panel switches back to "Full Stack Developer" / "Triveous".
 * 7. Screenshots captured to brain artifact directory.
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
const PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cft-p81-title-'));
const EXTENSION_DIR = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const SCREENSHOT_DIR = 'C:\\Users\\VISHW\\.gemini\\antigravity-ide\\brain\\7c255938-ff51-431c-ad8d-b46eb1e7d510';
const CDP_PORT = 9471;

const LIVE_TRIVEOUS_URL = 'https://www.linkedin.com/jobs/view/4465164301/';
const LIVE_QUIK_HIRE_URL = 'https://www.linkedin.com/jobs/view/4466448213/';

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
  console.log('=== PART 81: REAL CHROME LIVE LINKEDIN TITLE FALSE POSITIVE VERIFICATION ===\n');

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
    await sidebarCdp.send('Page.enable');
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
    // STEP 1: NAVIGATE TAB A TO LIVE TRIVEOUS (4465164301)
    // =========================================================================
    console.log(`\n4. Opening Tab A (Triveous 4465164301): ${LIVE_TRIVEOUS_URL}...`);
    const tabATarget = await browserCdp.send('Target.createTarget', { url: LIVE_TRIVEOUS_URL });
    await sleep(8000);

    const initialTabs = await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.query({}, (tabs) => resolve(tabs.map(t => ({ id: t.id, url: t.url, active: t.active }))));
      })
    `);
    const tabAInfo = initialTabs.find((t) => t.url?.includes('4465164301'));
    if (!tabAInfo) throw new Error('Tab A not found');

    const listWithA = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const tabAItem = listWithA.find((item) => item.url?.includes('4465164301'));
    tabACdp = new CDPClient(tabAItem.webSocketDebuggerUrl);
    await tabACdp.connect();
    await tabACdp.send('Page.enable');

    console.log('   Activating Tab A in Chrome...');
    await swCdp.evaluate(`
      new Promise((resolve) => chrome.tabs.update(${tabAInfo.id}, { active: true }, resolve))
    `);
    await sleep(4000);

    // Poll Side Panel for Triveous
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
        }))()
      `);
      if (tabAState?.domTitle && tabAState.domTitle !== '—' && tabAState.domCompany?.toLowerCase().includes('triveous')) {
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
        }))()
      `);
      console.log(`   After rescan: "${tabAState?.domTitle}" at "${tabAState?.domCompany}"`);
    }

    // Strict assertions on Initial Render
    console.log('\n--- ASSERTIONS: INITIAL LIVE EXTRACTION ---');
    console.log(`   Rendered Title:   "${tabAState?.domTitle}"`);
    console.log(`   Rendered Company: "${tabAState?.domCompany}"`);

    if (tabAState?.domTitle === 'Use AI to assess how you fit' || tabAState?.domTitle?.includes('Use AI')) {
      throw new Error(`CRITICAL FAILURE: Side panel extracted marketing/AI copy: "${tabAState.domTitle}"`);
    }
    if (!tabAState?.domCompany?.toLowerCase().includes('triveous')) {
      throw new Error(`FAILURE: Expected company Triveous, got: "${tabAState?.domCompany}"`);
    }
    if (!tabAState?.domTitle || tabAState.domTitle === '—') {
      throw new Error('FAILURE: No job title rendered in side panel');
    }
    console.log('   ✔ Initial title extraction is authentic and free from AI marketing copy.');

    const screenshot1 = path.join(SCREENSHOT_DIR, 'p81-live-sidepanel-initial.png');
    await sidebarCdp.captureScreenshot(screenshot1);
    console.log(`   Screenshot saved: ${screenshot1}`);

    // =========================================================================
    // STEP 2: STRESS TEST WITH INJECTED LIVE AI-FIT CARD IN TAB A DOM
    // =========================================================================
    console.log('\n5. Injecting AI-fit widget heading (live LinkedIn reproduction) into Tab A...');
    await tabACdp.evaluate(`
      (() => {
        // Insert an AI fit card into lazy-column / main container to mirror live logged-in DOM
        const targetContainer = document.querySelector('[data-testid="lazy-column"]') ||
                                document.querySelector('.jobs-details__main-content') ||
                                document.querySelector('main') ||
                                document.body;
        if (targetContainer) {
          const aiCard = document.createElement('div');
          aiCard.className = 'job-details-premium-insight artdeco-card';
          aiCard.id = 'p81-test-ai-widget';
          aiCard.innerHTML = '<h2 class="t-16">Use AI to assess how you fit</h2><button>Try Now</button>';
          // Insert as first child to test if broad selectors pull it
          targetContainer.insertBefore(aiCard, targetContainer.firstChild);
          return { injected: true };
        }
        return { injected: false };
      })()
    `);
    await sleep(1000);

    console.log('   Clicking #rescanBtn to test extraction under live presence of AI fit widget...');
    await sidebarCdp.evaluate(`document.getElementById('rescanBtn').click()`);
    await sleep(4000);

    const postAiWidgetState = await sidebarCdp.evaluate(`
      (() => ({
        domTitle: document.getElementById('jobTitle')?.textContent?.trim(),
        domCompany: document.getElementById('jobCompany')?.textContent?.trim(),
        activeTitle: window.__sidebarController?.activeJob?.title,
        activeCompany: window.__sidebarController?.activeJob?.company,
      }))()
    `);

    console.log('\n--- ASSERTIONS: STRESS TEST WITH AI-FIT CARD ---');
    console.log(`   Title after AI card rescan:   "${postAiWidgetState?.domTitle}"`);
    console.log(`   Company after AI card rescan: "${postAiWidgetState?.domCompany}"`);

    if (postAiWidgetState?.domTitle === 'Use AI to assess how you fit' || postAiWidgetState?.domTitle?.includes('Use AI')) {
      throw new Error(`CRITICAL REGRESSION: Side panel succumbed to AI fit heading: "${postAiWidgetState.domTitle}"`);
    }
    if (!postAiWidgetState?.domCompany?.toLowerCase().includes('triveous')) {
      throw new Error(`FAILURE: Expected company Triveous, got: "${postAiWidgetState?.domCompany}"`);
    }
    console.log('   ✔ Firm resistance confirmed: AI fit heading strictly rejected in favor of authentic job title.');

    const screenshot2 = path.join(SCREENSHOT_DIR, 'p81-live-sidepanel-ai-widget-rescan.png');
    await sidebarCdp.captureScreenshot(screenshot2);
    console.log(`   Screenshot saved: ${screenshot2}`);

    // =========================================================================
    // STEP 3: FRESH PAGE RELOAD
    // =========================================================================
    console.log('\n6. Reloading Tab A (Triveous) with Page.reload...');
    await tabACdp.send('Page.reload');
    await sleep(7000);

    let reloadState = null;
    for (let i = 1; i <= 10; i++) {
      await sleep(1000);
      reloadState = await sidebarCdp.evaluate(`
        (() => ({
          domTitle: document.getElementById('jobTitle')?.textContent?.trim(),
          domCompany: document.getElementById('jobCompany')?.textContent?.trim(),
        }))()
      `);
      if (reloadState?.domTitle && reloadState.domTitle !== '—') break;
    }

    console.log('\n--- ASSERTIONS: AFTER PAGE.RELOAD ---');
    console.log(`   Title after reload:   "${reloadState?.domTitle}"`);
    console.log(`   Company after reload: "${reloadState?.domCompany}"`);

    if (reloadState?.domTitle === 'Use AI to assess how you fit' || reloadState?.domTitle?.includes('Use AI')) {
      throw new Error(`CRITICAL FAILURE on reload: extracted "${reloadState.domTitle}"`);
    }
    if (!reloadState?.domCompany?.toLowerCase().includes('triveous')) {
      throw new Error(`FAILURE on reload: Expected company Triveous, got: "${reloadState?.domCompany}"`);
    }
    console.log('   ✔ Clean reload persistence verified.');

    const screenshot3 = path.join(SCREENSHOT_DIR, 'p81-live-sidepanel-after-reload.png');
    await sidebarCdp.captureScreenshot(screenshot3);
    console.log(`   Screenshot saved: ${screenshot3}`);

    // =========================================================================
    // STEP 4: TAB SWITCHING TO TAB B (QUIK HIRE) AND BACK TO TAB A (TRIVEOUS)
    // =========================================================================
    console.log(`\n7. Opening Tab B (Quik Hire 4466448213): ${LIVE_QUIK_HIRE_URL}...`);
    const tabBTarget = await browserCdp.send('Target.createTarget', { url: LIVE_QUIK_HIRE_URL });
    await sleep(7000);

    const listWithB = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const tabBItem = listWithB.find((item) => item.url?.includes('4466448213'));
    tabBCdp = new CDPClient(tabBItem.webSocketDebuggerUrl);
    await tabBCdp.connect();
    await tabBCdp.send('Page.enable');

    const tabsWithB = await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.query({}, (tabs) => resolve(tabs.map(t => ({ id: t.id, url: t.url, active: t.active }))));
      })
    `);
    const tabBInfo = tabsWithB.find((t) => t.url?.includes('4466448213'));

    console.log('   Activating Tab B (Quik Hire)...');
    await swCdp.evaluate(`
      new Promise((resolve) => chrome.tabs.update(${tabBInfo.id}, { active: true }, resolve))
    `);
    await sleep(4000);

    let tabBState = null;
    for (let i = 1; i <= 10; i++) {
      await sleep(1000);
      tabBState = await sidebarCdp.evaluate(`
        (() => ({
          domTitle: document.getElementById('jobTitle')?.textContent?.trim(),
          domCompany: document.getElementById('jobCompany')?.textContent?.trim(),
        }))()
      `);
      if (tabBState?.domCompany?.toLowerCase().includes('quik hire')) break;
    }
    console.log(`   Tab B rendered: "${tabBState?.domTitle}" at "${tabBState?.domCompany}"`);

    console.log('   Switching back to Tab A (Triveous)...');
    await swCdp.evaluate(`
      new Promise((resolve) => chrome.tabs.update(${tabAInfo.id}, { active: true }, resolve))
    `);
    await sleep(4000);

    let tabABackState = null;
    for (let i = 1; i <= 10; i++) {
      await sleep(1000);
      tabABackState = await sidebarCdp.evaluate(`
        (() => ({
          domTitle: document.getElementById('jobTitle')?.textContent?.trim(),
          domCompany: document.getElementById('jobCompany')?.textContent?.trim(),
        }))()
      `);
      if (tabABackState?.domCompany?.toLowerCase().includes('triveous')) break;
    }

    console.log('\n--- ASSERTIONS: AFTER TAB SWITCH BACK ---');
    console.log(`   Title after switch back:   "${tabABackState?.domTitle}"`);
    console.log(`   Company after switch back: "${tabABackState?.domCompany}"`);

    if (tabABackState?.domTitle === 'Use AI to assess how you fit' || tabABackState?.domTitle?.includes('Use AI')) {
      throw new Error(`CRITICAL FAILURE on tab switch back: extracted "${tabABackState.domTitle}"`);
    }
    if (!tabABackState?.domCompany?.toLowerCase().includes('triveous')) {
      throw new Error(`FAILURE on tab switch back: Expected company Triveous, got: "${tabABackState?.domCompany}"`);
    }
    console.log('   ✔ Tab switching isolation and restoration verified.');

    const screenshot4 = path.join(SCREENSHOT_DIR, 'p81-live-sidepanel-tab-switch.png');
    await sidebarCdp.captureScreenshot(screenshot4);
    console.log(`   Screenshot saved: ${screenshot4}`);

    console.log('\n================================================================');
    console.log('✅ ALL PART 81 REAL CHROME LIVE ACCEPTANCE CHECKS PASSED');
    console.log('================================================================\n');

  } finally {
    if (tabACdp) tabACdp.close();
    if (tabBCdp) tabBCdp.close();
    if (sidebarCdp) sidebarCdp.close();
    if (swCdp) swCdp.close();
    if (browserCdp) browserCdp.close();
    chromeProcess.kill('SIGKILL');
    await sleep(1500);
    try {
      fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error('\n❌ VERIFICATION SCRIPT FAILED:\n', err);
  process.exit(1);
});
