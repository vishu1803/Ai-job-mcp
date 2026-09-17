/**
 * @file Inspect actual detection payload for LinkedIn Job ID 4466834190
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
const PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cft-inspect-4466834190-'));
const EXTENSION_DIR = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const SCREENSHOT_DIR = 'C:\\Users\\VISHW\\.gemini\\antigravity-ide\\brain\\32fc28a4-be6a-4f53-afeb-1fb203af361a';
const CDP_PORT = 9446;

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
  console.log('=== INSPECTING ACTUAL DETECTION PAYLOAD FOR JOB ID 4466834190 ===\n');

  // Ensure canonical user session
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

  // Spawn Chrome
  console.log('1. Launching Chrome with extension...');
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

    // Extension ID
    const targets = await browserCdp.send('Target.getTargets');
    const swTarget = targets.targetInfos.find((t) => t.url?.includes('service-worker.js'));
    const extId = swTarget.url.match(/chrome-extension:\/\/([a-z0-9]+)\//)[1];
    console.log(`   Extension ID: ${extId}`);

    const targetList = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const swInfo = targetList.find((item) => item.url?.includes('service-worker.js'));
    swCdp = new CDPClient(swInfo.webSocketDebuggerUrl);
    await swCdp.connect();
    await swCdp.send('Runtime.enable');

    // Authenticate extension storage
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

    // Open authentic side panel
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

    // Connect to side panel with polling retry
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

    // Create target LinkedIn tab
    console.log(`4. Opening target LinkedIn Job URL in browser tab: ${TARGET_JOB_URL}...`);
    const tabTarget = await browserCdp.send('Target.createTarget', { url: TARGET_JOB_URL });
    await sleep(8000); // Allow page load and content scripts to initialize

    const currentTabList = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const tabItem = currentTabList.find((i) => i.id === tabTarget.targetId);
    tabCdp = new CDPClient(tabItem.webSocketDebuggerUrl);
    await tabCdp.connect();
    await tabCdp.send('Page.enable');
    await tabCdp.send('Runtime.enable');
    await tabCdp.send('DOM.enable');

    // Screenshot page
    const pageScreenshotPath = path.join(SCREENSHOT_DIR, 'inspect-4466834190-page.png');
    await tabCdp.captureScreenshot(pageScreenshotPath);
    console.log(`   Page screenshot saved to: ${pageScreenshotPath}`);

    // Resolve Chrome tab ID
    const chromeTabs = await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.query({}, (tabs) => resolve(tabs.map(t => ({ id: t.id, url: t.url, active: t.active }))));
      })
    `);
    const targetChromeTab = chromeTabs.find((t) => t.url?.includes('4466834190'));
    if (!targetChromeTab) throw new Error('Could not find Chrome tab for 4466834190');
    console.log(`   Resolved Chrome Tab ID: ${targetChromeTab.id}`);

    // Activate the tab
    console.log('5. Activating the tab to trigger side panel synchronization...');
    await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.update(${targetChromeTab.id}, { active: true }, (tab) => resolve(tab));
      })
    `);
    await sleep(4000);

    // 6. Autoritative Content-Script Detection Payload via DETECT_JOB_PAGE
    console.log('\n6. Dispatching authoritative DETECT_JOB_PAGE message to content script...');
    const detectResponse = await swCdp.evaluate(`
      new Promise((resolve) => {
        chrome.tabs.sendMessage(${targetChromeTab.id}, { type: 'DETECT_JOB_PAGE' }, (res) => {
          resolve(res);
        });
      })
    `);

    console.log('\n======================================================');
    console.log('=== AUTHORITATIVE DETECT_JOB_PAGE RESPONSE PAYLOAD ===');
    console.log('======================================================');
    console.log(JSON.stringify(detectResponse, null, 2));

    // 7. Check Side Panel Controller State
    console.log('\n7. Inspecting Side Panel Controller State & DOM...');
    const sidebarControllerState = await sidebarCdp.evaluate(`
      (() => {
        const c = window.__sidebarController;
        return {
          isAuthenticated: c?.isAuthenticated,
          activeTabId: c?.activeTabId,
          activeJobFingerprint: c?.activeJobFingerprint,
          activeJob: c?.activeJob,
          lastDiagnostic: c?.lastDiagnostic || window.__lastDiagnostic,
          workflowState: c?.stateMachine?.state,
          elements: {
            jobTitleText: document.getElementById('jobTitle')?.textContent?.trim(),
            jobCompanyText: document.getElementById('jobCompany')?.textContent?.trim(),
            portalBadgeText: document.getElementById('portalBadge')?.textContent?.trim(),
            analyzeBtnDisabled: document.getElementById('analyzeJobBtn')?.disabled,
            analyzeBtnText: document.getElementById('analyzeJobBtn')?.textContent?.trim(),
            descriptionLoadingHidden: document.getElementById('descriptionLoadingNotice')?.classList?.contains('hidden')
          }
        };
      })()
    `);

    console.log('\n======================================================');
    console.log('=== SIDEBAR CONTROLLER STATE & DOM ===');
    console.log('======================================================');
    console.log(JSON.stringify(sidebarControllerState, null, 2));

    const sidebarScreenshotPath = path.join(SCREENSHOT_DIR, 'inspect-4466834190-sidebar.png');
    await sidebarCdp.captureScreenshot(sidebarScreenshotPath);
    console.log(`   Sidebar screenshot saved to: ${sidebarScreenshotPath}`);

    // 8. Detailed DOM Inspection of Job Elements on the Live Page
    console.log('\n8. Performing Deep DOM Inspection on Live LinkedIn Page...');
    const domDetails = await tabCdp.evaluate(`
      (() => {
        const criteriaItems = Array.from(document.querySelectorAll('.description__job-criteria-item, [class*="job-criteria"] li')).map(el => ({
          header: el.querySelector('h3, [class*="subheader"]')?.innerText?.trim(),
          text: el.querySelector('span, [class*="text"]')?.innerText?.trim()
        }));

        const topcardFlavors = Array.from(document.querySelectorAll('.topcard__flavor, .topcard__flavor--bullet, [class*="topcard"] span, [class*="top-card"] span')).map(el => ({
          className: el.className,
          text: el.innerText?.trim()
        })).filter(x => x.text && x.text.length < 100);

        const applyButtons = Array.from(document.querySelectorAll('a[class*="apply" i], button[class*="apply" i], [data-tracking-control-name*="apply" i]')).map(el => ({
          tag: el.tagName,
          className: el.className,
          text: el.innerText?.trim(),
          href: el.href || el.getAttribute('href')
        }));

        const salaryElements = Array.from(document.querySelectorAll('[class*="salary" i], [class*="compensation" i]')).map(el => ({
          className: el.className,
          text: el.innerText?.trim()
        }));

        return {
          titleTag: document.title,
          criteriaItems,
          topcardFlavors,
          applyButtons,
          salaryElements
        };
      })()
    `);

    console.log('\n======================================================');
    console.log('=== DEEP DOM DETAILS ON LIVE PAGE ===');
    console.log('======================================================');
    console.log(JSON.stringify(domDetails, null, 2));

  } catch (err) {
    console.error('Inspection failed:', err);
  } finally {
    if (browserCdp) browserCdp.close();
    if (swCdp) swCdp.close();
    if (tabCdp) tabCdp.close();
    if (sidebarCdp) sidebarCdp.close();
    if (chromeProcess) {
      try {
        chromeProcess.kill('SIGKILL');
      } catch {}
    }
    process.exit(0);
  }
}

main();
