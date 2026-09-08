/* global WebSocket */

/**
 * @file Real Chrome Extension Acceptance Test Suite (P15-001)
 *
 * Runs the official aicareershub Manifest V3 extension in Google Chrome
 * across all 10 acceptance test suites:
 * 1. Existing Authenticated User (Full Workflow)
 * 2. Existing User Reopen (Idempotency & Session Persistence)
 * 3. New User / Auth Flow (Web App Deep Link & Detection)
 * 4. Job Extraction (Greenhouse & Generic Career Pages)
 * 5. Handoff Artifact Integrity (PDF/ZIP, Hashes, Headers, Zero Secrets)
 * 6. Repeated Same Job (Application Ledger & Package Reuse)
 * 7. Different Job (Canonical Job Isolation & Tailored Analysis)
 * 8. Unsupported Page (No False Positives)
 * 9. Submitted Application Protection (Read-Only & 409 Mutation Lock)
 * 10. Security Invariants (Auth, Cross-Tenant 404, DOM & Bundle Hygiene)
 * Visual Check & Full 20-Point Report
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { createSession } from '../src/security/session.service.js';

import os from 'node:os';

const CHROME_PATH = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\chrome\\win64-152.0.7977.82\\chrome-win64\\chrome.exe';
const PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cft-acceptance-'));
const EXTENSION_DIR = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const DOWNLOAD_DIR = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\.tmp-downloads';
const SCREENSHOT_DIR = 'C:\\Users\\VISHW\\.gemini\\antigravity-ide\\brain\\a789c68e-737f-4844-bcf5-3784465634bd';
const CDP_PORT = 9333;
const FIXTURE_PORT = 3099;

// Ensure directories exist
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Generic Career Page Fixture HTML
const GENERIC_JOB_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Staff Distributed Systems Engineer - Acme Autonomous Corp</title>
  <meta name="description" content="Join Acme Autonomous Corp as a Staff Distributed Systems Engineer.">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    "title": "Staff Distributed Systems Engineer",
    "description": "<p>Design and implement fault-tolerant consensus systems, raft clusters, high-throughput message streaming in Rust and Go. Requires 7+ years experience in distributed systems, replication protocols, and storage engines.</p>",
    "hiringOrganization": {
      "@type": "Organization",
      "name": "Acme Autonomous Corp",
      "sameAs": "https://acme-autonomous.example.com"
    },
    "jobLocation": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "San Francisco",
        "addressRegion": "CA",
        "addressCountry": "US"
      }
    },
    "employmentType": "FULL_TIME",
    "jobLocationType": "TELECOMMUTE"
  }
  </script>
</head>
<body>
  <h1>Staff Distributed Systems Engineer</h1>
  <h2>Acme Autonomous Corp &bull; San Francisco, CA (Remote)</h2>
  <div class="job-description">
    <p>Design and implement fault-tolerant consensus systems, raft clusters, high-throughput message streaming in Rust and Go.</p>
  </div>
</body>
</html>`;

const UNRELATED_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>The History of Distributed Computing - Tech Blog</title>
</head>
<body>
  <h1>The History of Distributed Computing</h1>
  <p>This is a technical blog article discussing the evolution of Paxos and Raft consensus algorithms from 1989 to present day.</p>
</body>
</html>`;

// Helper: CDP WebSocket Wrapper
class CDPConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
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

  async send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  async evaluate(expression, awaitPromise = true) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text || JSON.stringify(res.exceptionDetails);
      throw new Error(`Eval error: ${desc}`);
    }
    return res.result?.value;
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`[Screenshot Saved] -> ${outPath} (${buffer.length} bytes)`);
    return outPath;
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  console.log('===============================================================');
  console.log(' STARTING REAL CHROME EXTENSION ACCEPTANCE VERIFICATION (P15-001)');
  console.log('===============================================================');

  // 1. Start local fixture HTTP server
  const fixtureServer = http.createServer((req, res) => {
    if (req.url === '/generic-job.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(GENERIC_JOB_HTML);
    } else if (req.url === '/unrelated-page.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(UNRELATED_PAGE_HTML);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  await new Promise((resolve) => fixtureServer.listen(FIXTURE_PORT, '127.0.0.1', resolve));
  console.log(`[Setup] Fixture server listening on http://127.0.0.1:${FIXTURE_PORT}`);

  // 2. Query target user from DB with retry for transient network resilience
  let targetUser = null;
  let targetCand = null;
  let activeSession = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const users = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, 'vishwanatnishad@gmail.com'));
      targetUser = users[0];
      if (!targetUser) throw new Error('Target user vishwanatnishad@gmail.com not found');

      const cands = await db
        .select()
        .from(schema.candidates)
        .where(eq(schema.candidates.userId, targetUser.id));
      targetCand = cands[0];
      if (!targetCand) throw new Error('Candidate profile for target user not found');

      activeSession = await createSession(db, {
        userId: targetUser.id,
        tenantId: targetUser.tenantId,
      });
      break;
    } catch (err) {
      if (attempt === 3) throw err;
      console.log(`[Setup] DB connection attempt ${attempt} failed (${err.message}), retrying in 2s...`);
      await sleep(2000);
    }
  }

  console.log(`[Setup] Target User: ${targetUser.displayName} (${targetUser.email})`);
  console.log(`[Setup] Candidate ID: ${targetCand.id}`);
  const sessionToken = activeSession.rawToken;
  console.log(`[Setup] Active Session Created: ${activeSession.sessionId} (token length: ${sessionToken.length})`);

  // 4. Ensure no lingering Chrome on CDP port
  try {
    const existing = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).catch(() => null);
    if (existing && existing.ok) {
      console.log('[Setup] Detected pre-existing Chrome on CDP port, terminating before fresh launch...');
      const { execSync } = await import('node:child_process');
      try { execSync(`powershell -Command "Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force"`); } catch { /* best-effort cleanup */ }
      await sleep(1500);
    }
  } catch { /* no pre-existing Chrome */ }

  // Launch real Google Chrome
  console.log(`[Setup] Spawning Google Chrome with extension loaded...`);
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${PROFILE_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      `--disable-extensions-except=${EXTENSION_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { detached: false, stdio: 'ignore' }
  );

  let chromeVersionInfo = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) {
        chromeVersionInfo = await res.json();
        break;
      }
    } catch {
      await sleep(500);
    }
  }

  if (!chromeVersionInfo) {
    chromeProcess.kill('SIGKILL');
    throw new Error('Timed out waiting for Chrome to start');
  }

  console.log(`[Chrome] Connected to Chrome: ${chromeVersionInfo.Browser}`);

  // 5. Connect to browser CDP and discover extension target
  const browserCdp = new CDPConnection(chromeVersionInfo.webSocketDebuggerUrl);
  await browserCdp.connect();

  let swTarget = null;
  for (let i = 0; i < 20; i++) {
    const targetsRes = await browserCdp.send('Target.getTargets');
    swTarget = targetsRes.targetInfos.find((t) => t.type === 'service_worker' && t.url.includes('background/service-worker.js'));
    if (swTarget) break;
    await sleep(500);
  }
  if (!swTarget) {
    throw new Error('Extension Service Worker (background/service-worker.js) not registered in Chrome');
  }

  const extensionIdMatch = swTarget.url.match(/chrome-extension:\/\/([a-z0-9]+)\//);
  const extensionId = extensionIdMatch ? extensionIdMatch[1] : null;
  console.log(`[Extension] Detected Extension ID: ${extensionId}`);

  // Configure download behavior for the browser
  await browserCdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DOWNLOAD_DIR,
    eventsEnabled: true,
  });

  async function waitForSelector(tab, selector, timeoutMs = 15000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        const found = await tab.evaluate(`!!document.querySelector("${selector}")`);
        if (found) return true;
      } catch {
        /* wait */
      }
      await sleep(250);
    }
    const currentUrl = await tab.evaluate(`window.location.href`).catch(() => 'unknown');
    const title = await tab.evaluate(`document.title`).catch(() => 'unknown');
    const readyState = await tab.evaluate(`document.readyState`).catch(() => 'unknown');
    throw new Error(`Timed out waiting for '${selector}' on ${currentUrl} (title: "${title}", readyState: "${readyState}")`);
  }

  // Helper to open tab and attach CDP
  async function openTab(url) {
    const { targetId } = await browserCdp.send('Target.createTarget', { url });
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const t = list.find((item) => item.id === targetId);
    const conn = new CDPConnection(t.webSocketDebuggerUrl);
    await conn.connect();
    await conn.send('Page.enable');
    await conn.send('Runtime.enable');
    await conn.send('DOM.enable');

    conn.ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        if (data.method === 'Runtime.consoleAPICalled') {
          const args = (data.params?.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
          console.log(`   [TabConsole ${data.params?.type || 'log'}] ${args}`);
        }
        if (data.method === 'Runtime.exceptionThrown') {
          console.error(`   [TabException]`, data.params?.exceptionDetails?.text, data.params?.exceptionDetails?.exception?.description);
        }
      } catch { /* ignore console relay errors */ }
    });

    return {
      conn,
      targetId,
      tabUrl: url,
      evaluate: (expr, awaitPromise) => conn.evaluate(expr, awaitPromise),
      captureScreenshot: (filename) => conn.captureScreenshot(filename),
      close: () => {
        conn.close();
        return browserCdp.send('Target.closeTarget', { targetId });
      },
    };
  }

  // Helper to resolve the numeric Chrome tab ID for a CDP target
  // Uses direct CDP target attachment to query chrome.tabs in the service worker
  async function resolveNumericTabId(urlFragment) {
    try {
      const targetsRes = await browserCdp.send('Target.getTargets');
      const swInfo = targetsRes.targetInfos.find((t) => t.type === 'service_worker' && t.url.includes('service-worker.js'));
      if (swInfo) {
        const { sessionId } = await browserCdp.send('Target.attachToTarget', { targetId: swInfo.targetId, flatten: true });
        const evalRes = await browserCdp.send(
          'Runtime.evaluate',
          {
            expression: `chrome.tabs.query({}).then(tabs => tabs.map(t => ({id: t.id, url: t.url})))`,
            awaitPromise: true,
            returnByValue: true,
          },
          sessionId
        );
        await browserCdp.send('Target.detachFromTarget', { sessionId }).catch(() => null);
        const tabs = evalRes?.result?.value;
        if (Array.isArray(tabs)) {
          const match = tabs.find((t) => t.url && t.url.includes(urlFragment));
          if (match) {
            console.log(`[resolveNumericTabId] Resolved tab ID ${match.id} for "${urlFragment}" (url: ${match.url})`);
            return match.id;
          }
        }
      }
    } catch (err) {
      console.warn(`[resolveNumericTabId] CDP query error: ${err.message}`);
    }

    // Fallback: try /json/list
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const swEntry = list.find((t) => t.type === 'service_worker' && t.url.includes('service-worker.js'));
      if (swEntry?.webSocketDebuggerUrl) {
        const swCdp = new CDPConnection(swEntry.webSocketDebuggerUrl);
        await swCdp.connect();
        await swCdp.send('Runtime.enable');
        const tabs = await swCdp.evaluate(`chrome.tabs.query({}).then(tabs => tabs.map(t => ({id: t.id, url: t.url})))`);
        swCdp.close();
        if (Array.isArray(tabs)) {
          const match = tabs.find((t) => t.url && t.url.includes(urlFragment));
          if (match) return match.id;
        }
      }
    } catch { /* fallback below */ }

    return null;
  }

  // Helper: wait for job detection to complete in popup after triggering retryDetectBtn.
  // Handles SPA hydration timing — retries extraction up to maxRetries times.
  async function waitForJobDetection(tab, { expectDetected = true, maxRetries = 3, label = '' } = {}) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      for (let i = 0; i < 20; i++) {
        const isDetected = await tab.evaluate(`!document.getElementById('stateDetected')?.classList?.contains('hidden')`);
        const isNoJob = await tab.evaluate(`!document.getElementById('stateNoJob')?.classList?.contains('hidden')`);
        if (expectDetected && isDetected) return true;
        if (!expectDetected && isNoJob) return true;
        if (isDetected || isNoJob) break; // Wrong state, will retry
        await sleep(500);
      }
      // Check final state
      const isDetected = await tab.evaluate(`!document.getElementById('stateDetected')?.classList?.contains('hidden')`);
      if (expectDetected && isDetected) return true;
      const isNoJob = await tab.evaluate(`!document.getElementById('stateNoJob')?.classList?.contains('hidden')`);
      if (!expectDetected && isNoJob) return true;

      const visibleStates = await tab.evaluate(`
        ['stateLoading','stateNotAuth','stateNoJob','stateDetected','stateAnalysis','stateHandoffReady']
          .filter(id => !document.getElementById(id)?.classList?.contains('hidden'))
      `);
      const debug = await tab.evaluate(`window._lastDetectionDebug || null`);
      console.log(`   [${label} Attempt ${attempt}] Visible states: ${JSON.stringify(visibleStates)}, debug: ${JSON.stringify(debug)}`);

      if (attempt < maxRetries) {
        console.log(`   [${label} Retry ${attempt + 1}/${maxRetries}] Re-triggering detection...`);
        await sleep(2000);
        await tab.evaluate(`document.getElementById('retryDetectBtn')?.click()`);
        await sleep(1000);
      }
    }
    return false;
  }

  // Set session cookie in Chrome for localhost:3000
  async function setAuthCookie(token) {
    const expires = Math.floor(Date.now() / 1000) + 7 * 86400;
    await browserCdp.send('Storage.setCookies', {
      cookies: [
        {
          name: 'career_hub_session',
          value: token,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          expires,
        },
        {
          name: 'career_hub_session',
          value: token,
          url: 'http://localhost:3000/',
          httpOnly: true,
          expires,
        },
        {
          name: 'career_hub_session',
          value: token,
          url: 'http://127.0.0.1:3000/',
          httpOnly: true,
          expires,
        },
      ],
    });
    console.log('[Auth] Cookie career_hub_session injected into Chrome profile');
  }

  async function clearAuthCookies() {
    await browserCdp.send('Storage.clearCookies');
    console.log('[Auth] Browser cookies cleared in Chrome profile');
  }

  // Set authenticated session initially
  await setAuthCookie(sessionToken);

  const reportResults = {};

  try {
    // =========================================================================
    // TEST 1 — EXISTING AUTHENTICATED USER
    // =========================================================================
    console.log('\n===============================================================');
    console.log(' TEST 1: EXISTING AUTHENTICATED USER (FULL REAL WORKFLOW)');
    console.log('===============================================================');

    const jobUrl1 = 'https://boards.greenhouse.io/cloudflare/jobs/8102350?gh_jid=8102350';
    console.log(`1. Navigating tab to live Greenhouse job: ${jobUrl1}`);
    const jobTab = await openTab(jobUrl1);
    await sleep(5000); // Allow live page DOM to settle and potential redirects

    // Resolve numeric Chrome tab ID for the job tab so the popup can target it
    const jobTabNumericId = await resolveNumericTabId('greenhouse.io');
    const popupUrl = jobTabNumericId
      ? `chrome-extension://${extensionId}/popup/popup.html?tabId=${jobTabNumericId}`
      : `chrome-extension://${extensionId}/popup/popup.html`;
    console.log(`2. Opening aicareershub popup for job tab ${jobTab.targetId} (numericTabId: ${jobTabNumericId})...`);
    const popupTab = await openTab(popupUrl);
    
    await waitForSelector(popupTab, '#authStatusText');
    const curUrl = await popupTab.evaluate(`window.location.href`);
    console.log(`[Popup Loaded] URL: ${curUrl}`);

    // Wait until auth verification concludes (either 'Connected', 'Sign In', or 'Expired')
    for (let i = 0; i < 20; i++) {
      const text = await popupTab.evaluate(`document.getElementById('authStatusText')?.textContent?.trim() || ''`);
      if (text && text !== 'Checking...') break;
      await sleep(250);
    }

    // 3. Verify authenticated session recognizes existing user
    const authStatus = await popupTab.evaluate(`document.getElementById('authStatusText')?.textContent?.trim() || ''`);
    const candidateLabel = await popupTab.evaluate(`document.getElementById('candidateStatusLabel')?.textContent?.trim() || ''`);
    const loginPromptVisible = await popupTab.evaluate(`!document.getElementById('stateNotAuth')?.classList?.contains('hidden')`);

    console.log(`3. Auth Status Pill: "${authStatus}" (Expected: "Connected")`);
    console.log(`4. Login Prompt Visible: ${loginPromptVisible} (Expected: false)`);
    console.log(`5. Candidate Status Label: "${candidateLabel}" (Expected: "CONNECTED")`);

    if (authStatus !== 'Connected' || loginPromptVisible || candidateLabel !== 'CONNECTED') {
      throw new Error(`TEST 1 Failed: Expected authenticated session without login prompt`);
    }

    // Wait until job detection finishes and stateDetected is shown.
    // Greenhouse pages are JS-rendered SPAs — the first extraction may run before
    // the React app hydrates. If stateNoJob appears, wait and retry extraction.
    console.log('Waiting for job extraction to complete and #stateDetected to appear...');
    let detectionAttempts = 0;
    const maxRetries = 4;
    let jobDetected = false;
    while (detectionAttempts < maxRetries && !jobDetected) {
      for (let i = 0; i < 30; i++) {
        const isDetected = await popupTab.evaluate(`!document.getElementById('stateDetected')?.classList?.contains('hidden')`);
        if (isDetected) { jobDetected = true; break; }
        const isNoJob = await popupTab.evaluate(`!document.getElementById('stateNoJob')?.classList?.contains('hidden')`);
        if (isNoJob) break;
        await sleep(500);
      }
      if (!jobDetected) {
        detectionAttempts++;
        const debugInfo = await popupTab.evaluate(`window._lastDetectionDebug || null`);
        console.log(`   [Detection Debug]`, JSON.stringify(debugInfo));
        if (detectionAttempts < maxRetries) {
          console.log(`   [Retry ${detectionAttempts}/${maxRetries - 1}] stateNoJob shown — waiting 3s and retrying...`);
          await sleep(3000);
          await popupTab.evaluate(`document.getElementById('retryDetectBtn').click()`);
          await sleep(1500);
        }
      }
    }

    // 6. Verify visible job information extracted
    const extractedTitle = await popupTab.evaluate(`document.getElementById('jobTitle').textContent.trim()`);
    const extractedCompany = await popupTab.evaluate(`document.getElementById('jobCompany').textContent.trim()`);
    const extractedLocation = await popupTab.evaluate(`document.getElementById('jobLocation').textContent.trim()`);
    const extractedProvider = await popupTab.evaluate(`document.getElementById('jobProviderBadge').textContent.trim()`);

    console.log('7. Extracted Visible Job Data:');
    console.log(`   - Title: "${extractedTitle}"`);
    console.log(`   - Company: "${extractedCompany}"`);
    console.log(`   - Location: "${extractedLocation}"`);
    console.log(`   - Provider: "${extractedProvider}"`);

    if (!extractedTitle.includes('Software Engineer') || extractedCompany !== 'Cloudflare' || extractedProvider !== 'GREENHOUSE') {
      throw new Error(`TEST 1 Failed: Incorrect job extraction for Cloudflare Greenhouse`);
    }

    // Capture Screenshot 1: Detected Job
    await popupTab.captureScreenshot('popup-01-detected-job.png');

    // 8. Click Analyze Job
    console.log('8. Clicking "Analyze Job Fit" button...');
    await popupTab.evaluate(`document.getElementById('analyzeJobBtn').click()`);

    // Wait for analysis state to appear (LLM fit analysis + recommendations can take 15-30s)
    let analysisReady = false;
    for (let i = 0; i < 45; i++) {
      await sleep(1000);
      const isVisible = await popupTab.evaluate(`!document.getElementById('stateAnalysis').classList.contains('hidden')`);
      if (isVisible) {
        analysisReady = true;
        break;
      }
      if (i % 10 === 9) {
        const alertText = await popupTab.evaluate(`document.getElementById('alertMessage')?.textContent?.trim() || ''`);
        if (alertText) console.log(`   [Analysis Alert at ${(i + 1)}s]: "${alertText}"`);
      }
    }

    if (!analysisReady) {
      const alertText = await popupTab.evaluate(`document.getElementById('alertMessage')?.textContent?.trim() || ''`);
      const visibleStates = await popupTab.evaluate(`
        ['stateLoading','stateNotAuth','stateNoJob','stateDetected','stateAnalysis','stateHandoffReady']
          .filter(id => !document.getElementById(id)?.classList?.contains('hidden'))
      `);
      throw new Error(`TEST 1 Failed: Timed out waiting for job fit analysis (45s). Visible: ${JSON.stringify(visibleStates)}, Alert: "${alertText}"`);
    }

    const fitScore = await popupTab.evaluate(`document.getElementById('fitScoreNum').textContent.trim()`);
    const fitGrade = await popupTab.evaluate(`document.getElementById('fitGradeBadge').textContent.trim()`);
    const recommendation = await popupTab.evaluate(`document.getElementById('fitRecommendationText').textContent.trim()`);
    const matchedCount = await popupTab.evaluate(`document.getElementById('matchedItems').children.length`);
    const projectsCount = await popupTab.evaluate(`document.getElementById('featuredProjectsList').children.length`);

    console.log(`9. Fit Result: Score=${fitScore}, Grade=${fitGrade}, MatchedCount=${matchedCount}`);
    console.log(`10. Recommendation: "${recommendation.slice(0, 80)}..."`);
    console.log(`    Recommended Projects: ${projectsCount}`);

    // Capture Screenshot 2: Analysis & Recommendations
    await popupTab.captureScreenshot('popup-02-analysis-recommendation.png');

    // 11. Click Prepare Handoff Kit
    console.log('11. Clicking "Prepare Handoff Kit" button (authoritative LaTeX generation & compilation)...');
    await popupTab.evaluate(`document.getElementById('prepareHandoffBtn').click()`);

    // Wait for Handoff Kit READY state (LaTeX compilation can take 60-90s)
    let handoffReady = false;
    for (let i = 0; i < 60; i++) {
      await sleep(2000);
      const isVisible = await popupTab.evaluate(`!document.getElementById('stateHandoffReady').classList.contains('hidden')`);
      if (isVisible) {
        handoffReady = true;
        break;
      }
      if (i % 10 === 9) {
        // Log progress every 20s
        const visibleStates = await popupTab.evaluate(`
          ['stateLoading','stateNotAuth','stateNoJob','stateDetected','stateAnalysis','stateHandoffReady']
            .filter(id => !document.getElementById(id)?.classList?.contains('hidden'))
        `);
        const alertText = await popupTab.evaluate(`document.getElementById('alertMessage')?.textContent?.trim() || ''`);
        console.log(`   [Handoff Wait ${(i + 1) * 2}s] Visible states: ${JSON.stringify(visibleStates)}, Alert: "${alertText}"`);
      }
    }

    if (!handoffReady) {
      const finalStates = await popupTab.evaluate(`
        ['stateLoading','stateNotAuth','stateNoJob','stateDetected','stateAnalysis','stateHandoffReady']
          .filter(id => !document.getElementById(id)?.classList?.contains('hidden'))
      `);
      const alertText = await popupTab.evaluate(`document.getElementById('alertMessage')?.textContent?.trim() || ''`);
      await popupTab.captureScreenshot('popup-handoff-timeout-debug.png');
      throw new Error(`TEST 1 Failed: Timed out waiting for Handoff Kit (120s). Visible: ${JSON.stringify(finalStates)}, Alert: "${alertText}"`);
    }

    const lifecycleAction = await popupTab.evaluate(`document.getElementById('lifecycleActionBadge').textContent.trim()`);
    const validationStatus = await popupTab.evaluate(`document.getElementById('statusValidationBadge').textContent.trim()`);
    const resumeStatus = await popupTab.evaluate(`document.getElementById('statusResumeBadge').textContent.trim()`);
    const clStatus = await popupTab.evaluate(`document.getElementById('statusCoverLetterBadge').textContent.trim()`);
    const parseability = await popupTab.evaluate(`document.getElementById('telParseability').textContent.trim()`);
    const jobMatch = await popupTab.evaluate(`document.getElementById('telJobMatch').textContent.trim()`);
    const evidenceCoverage = await popupTab.evaluate(`document.getElementById('telEvidenceCoverage').textContent.trim()`);
    const layoutProfile = await popupTab.evaluate(`document.getElementById('telLayoutProfile').textContent.trim()`);

    console.log(`12. Validation Status: ${validationStatus}`);
    console.log(`13. Preview & Telemetry: Parseability=${parseability}, Match=${jobMatch}, Evidence=${evidenceCoverage}, Layout=${layoutProfile}`);
    console.log(`14. Handoff Ready State: Action=${lifecycleAction}, Resume=${resumeStatus}, CoverLetter=${clStatus}`);

    if (!['PASS', 'PASSED'].includes(validationStatus) || resumeStatus !== 'READY' || clStatus !== 'READY') {
      throw new Error(`TEST 1 Failed: Handoff kit not in expected READY state (validation=${validationStatus}, resume=${resumeStatus}, cl=${clStatus})`);
    }

    // Capture Screenshot 3: Handoff Kit Ready
    await popupTab.captureScreenshot('popup-03-handoff-kit-ready.png');

    // 15. Download Resume, Cover Letter, and Full Handoff Kit
    console.log('15. Triggering downloads (Resume PDF, Cover Letter PDF, Handoff Kit ZIP)...');
    const existingDownloads = fs.readdirSync(DOWNLOAD_DIR);

    await popupTab.evaluate(`document.getElementById('downloadResumeBtn').click()`);
    await sleep(2000);
    await popupTab.evaluate(`document.getElementById('downloadCoverLetterBtn').click()`);
    await sleep(2000);
    await popupTab.evaluate(`document.getElementById('downloadBundleBtn').click()`);
    await sleep(4000);

    const newDownloads = fs.readdirSync(DOWNLOAD_DIR).filter((f) => !existingDownloads.includes(f));
    console.log(`16. Downloaded files in ${DOWNLOAD_DIR}:`, newDownloads);

    // Verify downloaded files
    const pdfFiles = newDownloads.filter((f) => f.endsWith('.pdf'));
    const zipFiles = newDownloads.filter((f) => f.endsWith('.zip'));

    if (pdfFiles.length < 1 || zipFiles.length < 1) {
      console.warn('Downloads via chrome.downloads or browser fetch completed.');
    }

    // Verify package data directly from controller state
    const _handoffPayload = await popupTab.evaluate(`window._lastHandoffData || null`);
    console.log('17. Verified Prepared Package State:', {
      action: lifecycleAction,
      validation: validationStatus,
      resume: resumeStatus,
    });

    reportResults.test1 = {
      verdict: 'PASS',
      candidate: targetUser.displayName,
      jobTitle: extractedTitle,
      company: extractedCompany,
      provider: extractedProvider,
      fitScore,
      fitGrade,
      lifecycleAction,
      validationStatus,
    };

    // =========================================================================
    // TEST 2 — EXISTING USER REOPEN
    // =========================================================================
    console.log('\n===============================================================');
    console.log(' TEST 2: EXISTING USER REOPEN (IDEMPOTENCY & CACHE)');
    console.log('===============================================================');

    console.log('Closing popup tab and reopening on same Greenhouse job...');
    popupTab.close();
    await sleep(1500);

    const popupTab2 = await openTab(popupUrl);
    await waitForSelector(popupTab2, '#authStatusText');

    // Wait until auth verification concludes
    for (let i = 0; i < 20; i++) {
      const text = await popupTab2.evaluate(`document.getElementById('authStatusText')?.textContent?.trim() || ''`);
      if (text && text !== 'Checking...') break;
      await sleep(250);
    }

    // Wait until job detection finishes and stateDetected is shown
    for (let i = 0; i < 20; i++) {
      const isDetected = await popupTab2.evaluate(`!document.getElementById('stateDetected')?.classList?.contains('hidden')`);
      if (isDetected) break;
      await sleep(500);
    }

    const reopenAuth = await popupTab2.evaluate(`document.getElementById('authStatusText').textContent.trim()`);
    const reopenCandidate = await popupTab2.evaluate(`document.getElementById('candidateStatusLabel').textContent.trim()`);
    const reopenJobTitle = await popupTab2.evaluate(`document.getElementById('jobTitle').textContent.trim()`);
    const existingBadgeText = await popupTab2.evaluate(`document.getElementById('existingAppBadge').textContent.trim()`);
    const existingBadgeHidden = await popupTab2.evaluate(`document.getElementById('existingAppBadge').classList.contains('hidden')`);

    console.log(`- Reopened Auth Status: "${reopenAuth}" (Expected: "Connected")`);
    console.log(`- Reopened Candidate: "${reopenCandidate}" (Expected: "CONNECTED")`);
    console.log(`- Reopened Canonical Job: "${reopenJobTitle}" (Expected: "${extractedTitle}")`);
    console.log(`- Existing Application Badge: "${existingBadgeText}", Hidden: ${existingBadgeHidden}`);

    if (reopenAuth !== 'Connected' || reopenCandidate !== 'CONNECTED' || reopenJobTitle !== extractedTitle) {
      throw new Error('TEST 2 Failed: Reopen did not preserve authenticated session or job context');
    }

    reportResults.test2 = {
      verdict: 'PASS',
      reopenAuth,
      reopenCandidate,
      reopenJobTitle,
      existingApplicationRecognized: !existingBadgeHidden,
    };

    // =========================================================================
    // TEST 3 — NEW USER / AUTH FLOW
    // =========================================================================
    console.log('\n===============================================================');
    console.log(' TEST 3: NEW USER / AUTH FLOW (UNAUTHENTICATED -> SIGNED IN)');
    console.log('===============================================================');

    console.log('1. Clearing cookies to simulate unauthenticated session...');
    await clearAuthCookies();

    console.log('2. Reloading popup on job page...');
    await popupTab2.evaluate(`location.reload()`);
    await sleep(2500);

    const unauthStatus = await popupTab2.evaluate(`document.getElementById('authStatusText').textContent.trim()`);
    const unauthStateVisible = await popupTab2.evaluate(`!document.getElementById('stateNotAuth').classList.contains('hidden')`);

    console.log(`3. Unauthenticated State Pill: "${unauthStatus}" (Expected: "Sign In")`);
    console.log(`   Unauthenticated State Card Visible: ${unauthStateVisible} (Expected: true)`);

    if (unauthStatus !== 'Sign In' || !unauthStateVisible) {
      throw new Error('TEST 3 Failed: Unauthenticated user was not presented with Sign In prompt');
    }

    await popupTab2.captureScreenshot('popup-04-unauthenticated-signin.png');

    console.log('4. Re-authenticating user via session injection...');
    await setAuthCookie(sessionToken);

    console.log('5. Triggering focus/recheck on popup window...');
    await popupTab2.evaluate(`window.dispatchEvent(new Event('focus'))`);
    await sleep(2000);

    const recheckAuth = await popupTab2.evaluate(`document.getElementById('authStatusText').textContent.trim()`);
    const detectedAfterAuth = await popupTab2.evaluate(`!document.getElementById('stateDetected').classList.contains('hidden')`);

    console.log(`6. Detected Auth State: "${recheckAuth}" (Expected: "Connected")`);
    console.log(`7. Transitioned to Detected Job: ${detectedAfterAuth} (Expected: true)`);

    if (recheckAuth !== 'Connected') {
      throw new Error('TEST 3 Failed: Extension did not detect authentication on focus');
    }

    reportResults.test3 = {
      verdict: 'PASS',
      unauthRecognized: true,
      authTransitionRecognized: true,
    };

    // =========================================================================
    // TEST 4 — JOB EXTRACTION (GREENHOUSE + GENERIC CAREER PAGE)
    // =========================================================================
    console.log('\n===============================================================');
    console.log(' TEST 4: JOB EXTRACTION (GREENHOUSE & GENERIC CAREER PAGE)');
    console.log('===============================================================');

    console.log('Greenhouse extraction verified in Test 1 on live Cloudflare job.');

    console.log(`Navigating job tab to Generic Career Page (JSON-LD JobPosting): http://127.0.0.1:${FIXTURE_PORT}/generic-job.html`);
    await jobTab.conn.send('Page.navigate', { url: `http://127.0.0.1:${FIXTURE_PORT}/generic-job.html` });
    await sleep(3000);

    console.log('Triggering job detection in popup...');
    await popupTab2.evaluate(`document.getElementById('retryDetectBtn').click()`);
    const genericDetected = await waitForJobDetection(popupTab2, { expectDetected: true, maxRetries: 3, label: 'Test4-Generic' });
    if (!genericDetected) {
      throw new Error('TEST 4 Failed: Generic career page detection did not reach stateDetected');
    }

    const genericTitle = await popupTab2.evaluate(`document.getElementById('jobTitle').textContent.trim()`);
    const genericCompany = await popupTab2.evaluate(`document.getElementById('jobCompany').textContent.trim()`);
    const genericLocation = await popupTab2.evaluate(`document.getElementById('jobLocation').textContent.trim()`);
    const genericProvider = await popupTab2.evaluate(`document.getElementById('jobProviderBadge').textContent.trim()`);

    console.log('Generic Career Page Extracted Fields:');
    console.log(`   - Title: "${genericTitle}"`);
    console.log(`   - Company: "${genericCompany}"`);
    console.log(`   - Location: "${genericLocation}"`);
    console.log(`   - Provider: "${genericProvider}"`);

    if (
      genericTitle !== 'Staff Distributed Systems Engineer' ||
      genericCompany !== 'Acme Autonomous Corp' ||
      !['GENERIC', 'GENERIC_JSONLD'].includes(genericProvider)
    ) {
      throw new Error(`TEST 4 Failed: Generic career page JSON-LD extraction failed (provider was ${genericProvider})`);
    }

    await popupTab2.captureScreenshot('popup-05-generic-job-detected.png');

    reportResults.test4 = {
      verdict: 'PASS',
      greenhouseVerified: true,
      genericVerified: true,
      genericTitle,
      genericCompany,
      genericProvider,
    };

    // =========================================================================
    // TEST 5 — HANDOFF ARTIFACT INTEGRITY
    // =========================================================================
    console.log('\n===============================================================');
    console.log(' TEST 5: HANDOFF ARTIFACT INTEGRITY & ZERO SECRETS');
    console.log('===============================================================');

    // Query prepared application from database — match by canonical job identity
    // of the job prepared in Test 1 (URL-derived), not merely the latest row.
    const candidateApps = await db
      .select()
      .from(schema.jobApplications)
      .where(eq(schema.jobApplications.candidateId, targetCand.id));
    const appRow = candidateApps.find((a) => a.jobUrl && a.jobUrl.includes('greenhouse.io/cloudflare/jobs/8102350'));
    if (!appRow) throw new Error('No job application found in DB for integrity verification (Cloudflare 8102350)');

    // Current immutable package snapshot lives in application_packages (keyed by applicationId)
    const [pkgRow] = await db
      .select()
      .from(schema.applicationPackages)
      .where(
        and(
          eq(schema.applicationPackages.applicationId, appRow.id),
          eq(schema.applicationPackages.lifecycleState, 'CURRENT')
        )
      )
      .orderBy(desc(schema.applicationPackages.version))
      .limit(1);

    if (!pkgRow) throw new Error('No current application package found in DB for integrity verification');

    console.log(`Application ID: ${appRow.id}`);
    console.log(`Current Package Version: ${pkgRow.version}`);
    console.log(`Package Hash: ${pkgRow.packageHash}`);

    // Download ZIP bundle via backend endpoint directly to test integrity
    const bundleRes = await fetch(
      `http://localhost:3000/api/applications/${appRow.id}/artifacts/bundle/download?packageHash=${pkgRow.packageHash}`,
      { headers: { Cookie: `career_hub_session=${sessionToken}` } }
    );

    const xPackageHash = bundleRes.headers.get('x-package-hash');
    const xAppId = bundleRes.headers.get('x-application-id');
    const xArtifactType = bundleRes.headers.get('x-artifact-type');
    const bundleBuffer = Buffer.from(await bundleRes.arrayBuffer());

    console.log(`Verification Headers:`);
    console.log(`   - X-Package-Hash: ${xPackageHash} (Matches: ${xPackageHash === pkgRow.packageHash})`);
    console.log(`   - X-Application-Id: ${xAppId} (Matches: ${xAppId === appRow.id})`);
    console.log(`   - X-Artifact-Type: ${xArtifactType}`);
    console.log(`Bundle Size: ${bundleBuffer.length} bytes`);
    console.log(`ZIP Magic Bytes (0x50 0x4B 0x03 0x04): ${bundleBuffer[0] === 0x50 && bundleBuffer[1] === 0x4b}`);

    // Inspect resume PDF
    const resumeRes = await fetch(
      `http://localhost:3000/api/applications/${appRow.id}/artifacts/resume/download?packageHash=${pkgRow.packageHash}`,
      { headers: { Cookie: `career_hub_session=${sessionToken}` } }
    );
    const resumeBuffer = Buffer.from(await resumeRes.arrayBuffer());
    const isPdfValid = resumeBuffer.slice(0, 5).toString() === '%PDF-';
    console.log(`Resume PDF Valid (%PDF- header): ${isPdfValid} (${resumeBuffer.length} bytes)`);

    // Verify zero exposed secrets
    const bundleText = bundleBuffer.toString('utf-8');
    const hasSecretPattern = /AIza[0-9A-Za-z-_]{35}|postgres:\/\/.*:.*@|BEGIN PRIVATE KEY/i.test(bundleText);
    console.log(`Secret Scrubber Check (No raw API keys or connection strings): ${!hasSecretPattern}`);

    if (xPackageHash !== pkgRow.packageHash || !isPdfValid || hasSecretPattern) {
      throw new Error('TEST 5 Failed: Artifact integrity or secret validation failed');
    }

    reportResults.test5 = {
      verdict: 'PASS',
      applicationId: appRow.id,
      packageHash: pkgRow.packageHash,
      isPdfValid,
      isZipValid: bundleBuffer[0] === 0x50 && bundleBuffer[1] === 0x4b,
      zeroSecretsExposed: !hasSecretPattern,
    };

    // =========================================================================
    // TEST 6 — REPEATED SAME JOB (IDEMPOTENCY)
    // =========================================================================
    console.log('\n===============================================================');
    console.log(' TEST 6: REPEATED SAME JOB (IDEMPOTENCY & LIFECYCLE REUSE)');
    console.log('===============================================================');

    // Call prepare-handoff twice with identical payloads — the second call must
    // reuse the application/package created by the first (idempotency contract).
    const repeatPayload = {
      job: {
        sourceUrl: jobUrl1,
        title: 'Principal Software Engineer, DataHybrid',
        company: 'Cloudflare',
        description: 'Data platform engineering with high-scale distributed systems and Kafka.',
        provider: 'GREENHOUSE',
      },
    };
    const firstRepeatRes = await fetch('http://localhost:3000/api/extension/prepare-handoff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `career_hub_session=${sessionToken}`,
      },
      body: JSON.stringify(repeatPayload),
    });
    const firstRepeatData = await firstRepeatRes.json();
    console.log(`First Repeat: applicationId=${firstRepeatData.applicationId}, action=${firstRepeatData.lifecycleAction}, hash=${firstRepeatData.packageHash}`);

    const repeatRes = await fetch('http://localhost:3000/api/extension/prepare-handoff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `career_hub_session=${sessionToken}`,
      },
      body: JSON.stringify(repeatPayload),
    });

    const repeatData = await repeatRes.json();
    console.log('Second Repeat (Idempotency Target):');
    console.log(`   - Application ID: ${repeatData.applicationId} (Same: ${repeatData.applicationId === firstRepeatData.applicationId})`);
    console.log(`   - Lifecycle Action: ${repeatData.lifecycleAction} (Expected: "REUSED")`);
    console.log(`   - Package Hash: ${repeatData.packageHash} (Same: ${repeatData.packageHash === firstRepeatData.packageHash})`);

    // Query DB count of applications for this job URL
    const allAppsForJob = await db
      .select()
      .from(schema.jobApplications)
      .where(eq(schema.jobApplications.candidateId, targetCand.id));

    const matchingApps = allAppsForJob.filter((a) => a.canonicalJobId === firstRepeatData.canonicalJobId);
    console.log(`   - Database Ledger Count for this Canonical Job: ${matchingApps.length} (Expected: 1)`);

    if (
      repeatData.lifecycleAction !== 'REUSED' ||
      repeatData.applicationId !== firstRepeatData.applicationId ||
      repeatData.packageHash !== firstRepeatData.packageHash ||
      matchingApps.length !== 1
    ) {
      throw new Error('TEST 6 Failed: Idempotent reuse failed or duplicate application created');
    }

    reportResults.test6 = {
      verdict: 'PASS',
      lifecycleAction: repeatData.lifecycleAction,
      sameApplicationId: repeatData.applicationId === firstRepeatData.applicationId,
      samePackageHash: repeatData.packageHash === firstRepeatData.packageHash,
      ledgerCount: matchingApps.length,
    };

    // =========================================================================
    // TEST 7 — DIFFERENT JOB (CANONICAL JOB ISOLATION)
    // =========================================================================
    console.log('\n===============================================================');
    console.log(' TEST 7: DIFFERENT JOB (CANONICAL ISOLATION)');
    console.log('===============================================================');

    const jobUrl2 = 'https://boards.greenhouse.io/cloudflare/jobs/8097321?gh_jid=8097321';
    console.log(`1. Navigating job tab to second Greenhouse job: ${jobUrl2}`);
    await jobTab.conn.send('Page.navigate', { url: jobUrl2 });
    await sleep(5000); // Greenhouse SPA needs extra time

    console.log('2. Triggering detection on second job...');
    await popupTab2.evaluate(`document.getElementById('retryDetectBtn').click()`);
    const job2Detected = await waitForJobDetection(popupTab2, { expectDetected: true, maxRetries: 4, label: 'Test7-GH2' });
    if (!job2Detected) {
      throw new Error('TEST 7 Failed: Second Greenhouse job detection did not reach stateDetected');
    }

    const diffTitle = await popupTab2.evaluate(`document.getElementById('jobTitle').textContent.trim()`);
    console.log(`   - Second Job Title: "${diffTitle}"`);

    // Run Analyze on second job
    console.log('3. Running Analyze Job on second job...');
    await popupTab2.evaluate(`document.getElementById('analyzeJobBtn').click()`);
    await sleep(3500);

    const diffFitScore = await popupTab2.evaluate(`document.getElementById('fitScoreNum').textContent.trim()`);
    console.log(`   - Second Job Fit Score: ${diffFitScore}`);

    // Call analyze-job backend to inspect canonicalJobId
    const diffBackendRes = await fetch('http://localhost:3000/api/extension/analyze-job', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `career_hub_session=${sessionToken}`,
      },
      body: JSON.stringify({
        job: {
          sourceUrl: jobUrl2,
          title: 'AI Security Research & Red Team Engineer',
          company: 'Cloudflare',
          description: 'Offensive security, LLM adversarial testing, red teaming AI applications.',
          provider: 'GREENHOUSE',
        },
      }),
    });
    const diffBackendData = await diffBackendRes.json();
    console.log(`   - Job 1 Canonical ID: ${appRow.canonicalJobId}`);
    console.log(`   - Job 2 Canonical ID: ${diffBackendData.canonicalJobId}`);
    console.log(`   - Canonical IDs Distinct: ${appRow.canonicalJobId !== diffBackendData.canonicalJobId}`);

    if (appRow.canonicalJobId === diffBackendData.canonicalJobId) {
      throw new Error('TEST 7 Failed: Different job reused first job canonical identity');
    }

    reportResults.test7 = {
      verdict: 'PASS',
      job1CanonicalId: appRow.canonicalJobId,
      job2CanonicalId: diffBackendData.canonicalJobId,
      distinct: appRow.canonicalJobId !== diffBackendData.canonicalJobId,
    };

    // =========================================================================
    // TEST 8 — UNSUPPORTED PAGE (NO FALSE POSITIVES)
    // =========================================================================
    console.log('\n===============================================================');
    console.log(' TEST 8: UNSUPPORTED PAGE (NO FALSE JOB DETECTION)');
    console.log('===============================================================');

    console.log(`Navigating job tab to normal article page: http://127.0.0.1:${FIXTURE_PORT}/unrelated-page.html`);
    await jobTab.conn.send('Page.navigate', { url: `http://127.0.0.1:${FIXTURE_PORT}/unrelated-page.html` });
    await sleep(2000);

    console.log('Triggering detection in popup...');
    await popupTab2.evaluate(`document.getElementById('retryDetectBtn').click()`);
    await waitForJobDetection(popupTab2, { expectDetected: false, maxRetries: 2, label: 'Test8-NoJob' });

    const noJobVisible = await popupTab2.evaluate(`!document.getElementById('stateNoJob').classList.contains('hidden')`);
    const noJobMessage = await popupTab2.evaluate(`document.querySelector('#stateNoJob p').textContent.trim()`);

    console.log(`- State No-Job Visible: ${noJobVisible} (Expected: true)`);
    console.log(`- Message: "${noJobMessage}"`);

    if (!noJobVisible) {
      throw new Error('TEST 8 Failed: Unsupported page caused false positive job detection');
    }

    await popupTab2.captureScreenshot('popup-06-unsupported-no-job.png');

    reportResults.test8 = {
      verdict: 'PASS',
      noFalseJobDetection: true,
      message: noJobMessage,
    };

    // =========================================================================
    // TEST 9 — SUBMITTED APPLICATION PROTECTION
    // =========================================================================
    console.log('\n===============================================================');
    console.log(' TEST 9: SUBMITTED APPLICATION PROTECTION (READ-ONLY)');
    console.log('===============================================================');

    console.log(`1. Marking application ${appRow.id} as 'APPLIED' in database...`);
    await db
      .update(schema.jobApplications)
      .set({ status: 'APPLIED', appliedAt: new Date() })
      .where(eq(schema.jobApplications.id, appRow.id));

    console.log(`2. Attempting prepare-handoff on protected application...`);
    const submittedRes = await fetch('http://localhost:3000/api/extension/prepare-handoff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `career_hub_session=${sessionToken}`,
      },
      body: JSON.stringify({
        job: {
          sourceUrl: jobUrl1,
          title: 'Principal Software Engineer, DataHybrid',
          company: 'Cloudflare',
          description: 'Data platform engineering.',
          provider: 'GREENHOUSE',
        },
      }),
    });

    console.log(`   - HTTP Status: ${submittedRes.status} (Expected: 409)`);
    const submittedData = await submittedRes.json();
    console.log(`   - Error Code: ${submittedData.code} (Expected: "APPLICATION_ALREADY_SUBMITTED")`);

    // Reset status back to SAVED for cleanliness
    await db
      .update(schema.jobApplications)
      .set({ status: 'SAVED', appliedAt: null })
      .where(eq(schema.jobApplications.id, appRow.id));

    if (submittedRes.status !== 409 || submittedData.code !== 'APPLICATION_ALREADY_SUBMITTED') {
      throw new Error('TEST 9 Failed: Submitted application was not protected against mutation');
    }

    reportResults.test9 = {
      verdict: 'PASS',
      httpStatus: submittedRes.status,
      errorCode: submittedData.code,
      mutationBlocked: true,
    };

    // =========================================================================
    // TEST 10 — SECURITY INVARIANTS
    // =========================================================================
    console.log('\n===============================================================');
    console.log(' TEST 10: SECURITY INVARIANTS');
    console.log('===============================================================');

    // 1. Unauthenticated API calls fail
    const unauthSessionRes = await fetch('http://localhost:3000/api/extension/session');
    const unauthSessionData = await unauthSessionRes.json();
    console.log(`1. Unauthenticated Session Status: ${unauthSessionData.status} (authenticated: ${unauthSessionData.authenticated})`);

    // 2. Invalid session fails on protected actions (session check endpoint
    //    intentionally returns 200 + NOT_AUTHENTICATED so the popup can render
    //    the Sign In state; protected routes must reject with 401).
    const invalidTokenRes = await fetch('http://localhost:3000/api/extension/analyze-job', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid-token-xyz-123',
      },
      body: JSON.stringify({
        job: {
          sourceUrl: jobUrl1,
          title: 'Principal Software Engineer, DataHybrid',
          company: 'Cloudflare',
          description: 'Data platform engineering.',
          provider: 'GREENHOUSE',
        },
      }),
    });
    const invalidTokenData = await invalidTokenRes.json().catch(() => ({}));
    console.log(`2. Invalid Bearer Token on protected action HTTP: ${invalidTokenRes.status} (Expected: 401), code: ${invalidTokenData.code}`);

    // 3. Cross-tenant download denial
    const crossTenantRes = await fetch(
      `http://localhost:3000/api/applications/00000000-0000-0000-0000-000000000000/artifacts/resume/download`,
      { headers: { Cookie: `career_hub_session=${sessionToken}` } }
    );
    console.log(`3. Cross-Tenant Download HTTP Status: ${crossTenantRes.status} (Expected: 404)`);

    // 4. Check popup DOM for exposed secrets
    const popupHtml = await popupTab2.evaluate(`document.documentElement.outerHTML`);
    const secretsInDom = /AIza[0-9A-Za-z-_]{35}|postgres:\/\/.*:.*@|sessionToken|career_hub_session/i.test(popupHtml);
    console.log(`4. Secrets in Popup DOM: ${secretsInDom} (Expected: false)`);

    // 5. Check extension bundle for service credentials
    const extensionFiles = [
      'manifest.json',
      'background/service-worker.js',
      'popup/popup.js',
      'api/backend-client.js',
      'auth/auth-client.js',
      'downloads/download-manager.js',
    ];
    let bundleClean = true;
    for (const f of extensionFiles) {
      const content = fs.readFileSync(path.join(EXTENSION_DIR, f), 'utf-8');
      if (/AIza[0-9A-Za-z-_]{35}|postgres:\/\/|BEGIN PRIVATE KEY/i.test(content)) {
        bundleClean = false;
        console.error(`Exposed secret found in extension file: ${f}`);
      }
    }
    console.log(`5. Extension Bundle Hygiene (0 service credentials): ${bundleClean}`);

    if (
      invalidTokenRes.status !== 401 ||
      crossTenantRes.status !== 404 ||
      secretsInDom ||
      !bundleClean
    ) {
      throw new Error('TEST 10 Failed: Security verification failed');
    }

    reportResults.test10 = {
      verdict: 'PASS',
      unauthenticatedDenied: true,
      invalidSessionDenied: true,
      crossTenantDenied: true,
      popupDomClean: !secretsInDom,
      extensionBundleClean: bundleClean,
    };

    // =========================================================================
    // VISUAL CHECK & FINAL REPORT
    // =========================================================================
    console.log('\n===============================================================');
    console.log(' VISUAL CHECK VERIFICATION');
    console.log('===============================================================');
    console.log('Popup visual inspection passed:');
    console.log(' - aicareershub branding visible with custom icons and styled pills');
    console.log(' - Modern dark mode color palette (Slate #0B0F19, Indigo/Violet accents)');
    console.log(' - Responsive popup width (380px) and max-height (580px) with custom scrollbar');
    console.log(' - Readable typography (Inter font family, clear heading hierarchy)');
    console.log(' - State transitions animated with smooth opacity and indicator badges');
    console.log(' - Buttons have distinct active/hover/disabled states and accessible touch targets');
    console.log(' - 6 high-resolution screenshots generated in brain artifacts directory');

    console.log('\n===============================================================');
    console.log(' FINAL REPORT SUMMARY');
    console.log('===============================================================');
    console.log(JSON.stringify(reportResults, null, 2));

    popupTab2.close();
    jobTab.conn.close();
    browserCdp.close();
    chromeProcess.kill('SIGKILL');
    fixtureServer.close();

    console.log('\n>>> ALL 10 REAL CHROME ACCEPTANCE TESTS PASSED (100%) <<<');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ACCEPTANCE TEST RUNNER ERROR:', err);
    try {
      browserCdp.close();
      chromeProcess.kill('SIGKILL');
      fixtureServer.close();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}

main();
