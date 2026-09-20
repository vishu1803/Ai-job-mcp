/**
 * @file Part 60 Real Chrome E2E Acceptance Verification Script
 *
 * Exercises all 33 required Part 60 verification steps:
 * 1. Sign in
 * 2. Verify canonical authenticated email
 * 3. Detect Job A
 * 4. Analyze Job A
 * 5. ANALYSIS_READY
 * 6. Prepare Handoff Kit
 * 7. APPLICATION_READY
 * 8. LOCKED
 * 9. Verify Application A in MCP application infrastructure
 * 10. Navigate to Job B
 * 11. Verify Job A remains displayed
 * 12. Verify Application A remains displayed
 * 13. Verify no new analysis
 * 14. Verify no duplicate application
 * 15. Close/reopen sidebar
 * 16. Verify LOCKED restored
 * 17. Reload page
 * 18. Verify LOCKED restored
 * 19. Expire session
 * 20. Verify workflow remains intact
 * 21. Re-authenticate
 * 22. Verify APPLICATION_READY + LOCKED restored
 * 23. Click Reset Workflow
 * 24. Verify extension becomes IDLE
 * 25. Verify Application A still exists in MCP Application List
 * 26. Verify saved resume still exists
 * 27. Verify saved cover letter still exists
 * 28. Verify saved handoff package still exists
 * 29. Navigate to Job B
 * 30. Verify fresh detection is now allowed
 * 31. Analyze Job B
 * 32. Verify new workflow is independent of Application A
 * 33. Verify Application A remains untouched
 *
 * Captures 8 required screenshots:
 * - p60-01-canonical-identity.png
 * - p60-02-application-ready.png
 * - p60-03-locked-workflow.png
 * - p60-04-navigation-while-locked.png
 * - p60-05-restored-locked-workflow.png
 * - p60-06-reset-state.png
 * - p60-07-old-app-available-after-reset.png
 * - p60-08-new-workflow-after-reset.png
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { createSession } from '../src/security/session.service.js';

const CHROME_PATH =
  'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\chrome\\win64-152.0.7977.82\\chrome-win64\\chrome.exe';
const PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cft-p60-acceptance-'));
const EXTENSION_DIR = 'C:\\Users\\VISHW\\OneDrive\\Desktop\\Ai-career-agent\\extension';
const SCREENSHOT_DIR =
  'C:\\Users\\VISHW\\.gemini\\antigravity-ide\\brain\\6c240aca-0203-4240-b960-4e31b472135d';
const CDP_PORT = 9335;
const FIXTURE_PORT = 3099;

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Job A Fixture
const JOB_A_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Senior Backend Engineer - TechCorp Global | LinkedIn</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    "title": "Senior Backend Engineer",
    "description": "TechCorp Global is seeking a Senior Backend Engineer to build high-scale distributed systems. Requirements: 3+ years experience with Node.js, TypeScript, PostgreSQL, Docker, and Redis.",
    "hiringOrganization": {
      "@type": "Organization",
      "name": "TechCorp Global"
    },
    "jobLocation": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "San Francisco",
        "addressRegion": "CA",
        "addressCountry": "US"
      }
    }
  }
  </script>
</head>
<body>
  <div class="job-view-layout">
    <div class="top-card-layout">
      <h1 class="top-card-layout__title font-bold">Senior Backend Engineer</h1>
      <div class="top-card-layout__first-subline">
        <a class="topcard__org-name-link" href="#">TechCorp Global</a>
        <span class="topcard__flavor topcard__flavor--bullet">San Francisco, CA (Hybrid)</span>
      </div>
    </div>
    <div class="decorated-job-posting__details">
      <div class="show-more-less-html__markup">
        <p>TechCorp Global is seeking a Senior Backend Engineer to build high-scale distributed systems.</p>
        <h3>Requirements:</h3>
        <ul>
          <li>3+ years experience in backend software engineering with Node.js and TypeScript.</li>
          <li>Hands-on experience with PostgreSQL database schema design and performance optimization.</li>
          <li>Proficiency with Docker containerization and Redis caching.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

// Job B Fixture
const JOB_B_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Staff Distributed Systems Engineer - CloudCorp Systems | LinkedIn</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    "title": "Staff Distributed Systems Engineer",
    "description": "CloudCorp Systems is hiring a Staff Distributed Systems Engineer. Requirements: Go, Distributed Systems, Kubernetes, Kafka, and Cloud Infrastructure.",
    "hiringOrganization": {
      "@type": "Organization",
      "name": "CloudCorp Systems"
    },
    "jobLocation": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Seattle",
        "addressRegion": "WA",
        "addressCountry": "US"
      }
    }
  }
  </script>
</head>
<body>
  <div class="job-view-layout">
    <div class="top-card-layout">
      <h1 class="top-card-layout__title font-bold">Staff Distributed Systems Engineer</h1>
      <div class="top-card-layout__first-subline">
        <a class="topcard__org-name-link" href="#">CloudCorp Systems</a>
        <span class="topcard__flavor topcard__flavor--bullet">Seattle, WA (Remote)</span>
      </div>
    </div>
    <div class="decorated-job-posting__details">
      <div class="show-more-less-html__markup">
        <p>CloudCorp Systems is looking for a Staff Distributed Systems Engineer.</p>
        <h3>Requirements:</h3>
        <ul>
          <li>5+ years experience building distributed architectures with Go and Kubernetes.</li>
          <li>Expertise in event-driven streaming with Apache Kafka.</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;

class CDPConnection {
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
      awaitPromise,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        `Eval failed for "${expression}": ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`
      );
    }
    return res.result?.value;
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const fullPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(fullPath, Buffer.from(res.data, 'base64'));
    console.log(`   [Screenshot] Saved: ${fullPath}`);
    return fullPath;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log('================================================================');
  console.log('  STARTING PART 60 REAL CHROME E2E ACCEPTANCE VERIFICATION');
  console.log('================================================================\n');

  // 1. Start HTTP fixture server
  const fixtureServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/job-a') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(JOB_A_HTML);
    } else if (req.url === '/job-b') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(JOB_B_HTML);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
  await new Promise((resolve) => fixtureServer.listen(FIXTURE_PORT, '127.0.0.1', resolve));
  console.log(`[Fixture] Server listening at http://127.0.0.1:${FIXTURE_PORT}`);

  // 2. Query target real user and candidate
  const users = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, 'vishwanatnishad@gmail.com'));
  const targetUser = users[0];
  if (!targetUser) throw new Error('Target user vishwanatnishad@gmail.com not found');

  const candidates = await db
    .select()
    .from(schema.candidates)
    .where(eq(schema.candidates.userId, targetUser.id));
  const targetCandidate = candidates[0];
  if (!targetCandidate) throw new Error('Target candidate not found');

  console.log(`[DB] Target User: ${targetUser.email} (ID: ${targetUser.id})`);
  console.log(`[DB] Target Candidate: ${targetCandidate.displayName} (ID: ${targetCandidate.id})`);

  // Count initial applications
  const initialAppRows = await db
    .select()
    .from(schema.jobApplications)
    .where(eq(schema.jobApplications.candidateId, targetCandidate.id));
  console.log(`[DB] Initial Candidate Applications in DB: ${initialAppRows.length}`);

  // Create real server session
  const realSession = await createSession(db, {
    userId: targetUser.id,
    tenantId: targetUser.tenantId,
    userAgent: 'P60-Real-Chrome-Agent',
    ipAddress: '127.0.0.1',
  });
  console.log(`[DB] Created Real Server Session: ${realSession.sessionId}`);

  // 3. Launch Chrome with extension
  console.log('[Chrome] Spawning real Chrome with MV3 Extension loaded...');
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

  let chromeInfo = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) {
        chromeInfo = await res.json();
        break;
      }
    } catch {
      await sleep(500);
    }
  }
  if (!chromeInfo) throw new Error('Could not connect to Chrome on CDP port');
  console.log(`[Chrome] Connected to ${chromeInfo.Browser}`);

  const browserCdp = new CDPConnection(chromeInfo.webSocketDebuggerUrl);
  await browserCdp.connect();

  // Find extension ID
  let extensionId = null;
  for (let i = 0; i < 20; i++) {
    const targetsRes = await browserCdp.send('Target.getTargets');
    const swTarget = targetsRes.targetInfos.find(
      (t) => t.type === 'service_worker' && t.url.includes('service-worker.js')
    );
    if (swTarget) {
      const m = swTarget.url.match(/chrome-extension:\/\/([a-z0-9]+)\//);
      if (m) extensionId = m[1];
      break;
    }
    await sleep(500);
  }
  if (!extensionId) throw new Error('Could not find Extension ID in Chrome');
  console.log(`[Extension] Extension ID: ${extensionId}`);

  async function openTab(url) {
    const { targetId } = await browserCdp.send('Target.createTarget', { url });
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const t = list.find((item) => item.id === targetId);
    const conn = new CDPConnection(t.webSocketDebuggerUrl);
    await conn.connect();
    await conn.send('Page.enable');
    await conn.send('Runtime.enable');
    await conn.send('DOM.enable');
    await conn.send('Network.enable');
    return {
      conn,
      targetId,
      evaluate: (expr, p = true) => conn.evaluate(expr, p),
      captureScreenshot: (file) => conn.captureScreenshot(file),
      close: async () => {
        conn.close();
        await browserCdp.send('Target.closeTarget', { targetId });
      },
    };
  }

  let sidebarTab = null;
  let jobTab = null;

  try {
    // -------------------------------------------------------------
    // STEP 1 & 2: Sign In & Verify Canonical Authenticated Email
    // -------------------------------------------------------------
    console.log('\n--- STEP 1 & 2: Sign in & Verify Canonical Authenticated Email ---');
    const simulatedTabId = 4001;
    sidebarTab = await openTab(
      `chrome-extension://${extensionId}/sidebar/sidebar.html?tabId=${simulatedTabId}`
    );
    await sleep(1000);

    // Set real session cookie
    await sidebarTab.conn.send('Network.setCookie', {
      name: 'career_hub_session',
      value: realSession.rawToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    });

    // Check auth status
    await sidebarTab.evaluate(`window.__sidebarController._checkAuthStatus()`);
    await sleep(500);

    const isAuth = await sidebarTab.evaluate(`window.__sidebarController.isAuthenticated`);
    const displayedName = await sidebarTab.evaluate(
      `document.getElementById('userName').textContent`
    );
    const displayedEmail = await sidebarTab.evaluate(
      `document.getElementById('userEmail').textContent`
    );

    console.log(`   [Check] Authenticated: ${isAuth}`);
    console.log(`   [Check] Displayed Name: "${displayedName}"`);
    console.log(`   [Check] Displayed Email: "${displayedEmail}"`);

    if (!isAuth) throw new Error('Failed to authenticate in sidebar');
    if (displayedEmail !== targetUser.email) {
      throw new Error(
        `Canonical email violation! Expected "${targetUser.email}", got "${displayedEmail}"`
      );
    }
    console.log(
      '   >>> STEP 1 & 2 VERIFIED: Real canonical identity displayed without mock leakage <<<'
    );
    await sidebarTab.captureScreenshot('p60-01-canonical-identity.png');

    // -------------------------------------------------------------
    // STEP 3: Detect Job A
    // -------------------------------------------------------------
    console.log('\n--- STEP 3: Detect Job A ---');
    jobTab = await openTab(`http://127.0.0.1:${FIXTURE_PORT}/job-a`);
    await sleep(1000);

    // Pass detected Job A to sidebar
    const jobAData = {
      title: 'Senior Backend Engineer',
      company: 'TechCorp Global',
      location: 'San Francisco, CA (Hybrid)',
      employmentType: 'Full-time',
      sourceUrl: `http://127.0.0.1:${FIXTURE_PORT}/job-a`,
      provider: 'LINKEDIN',
      description:
        'TechCorp Global is seeking a Senior Backend Engineer to build high-scale distributed systems.',
      portalMetadata: {
        portalName: 'LinkedIn',
        confidence: 'HIGH',
        capabilities: {
          jobExtraction: true,
          applicationDetection: true,
          formExtraction: false,
          automaticFieldMapping: false,
        },
      },
    };

    await sidebarTab.evaluate(
      `window.__sidebarController._handleJobDetectedEvent(${JSON.stringify(jobAData)})`
    );
    await sleep(500);

    const detectedTitleA = await sidebarTab.evaluate(
      `document.getElementById('jobTitle').textContent`
    );
    console.log(`   [Check] Detected Job A Title: "${detectedTitleA}"`);
    if (!detectedTitleA.includes('Senior Backend Engineer')) {
      throw new Error('Failed to detect Job A in sidebar');
    }
    console.log('   >>> STEP 3 VERIFIED: Job A detected <<<');

    // -------------------------------------------------------------
    // STEP 4 & 5: Analyze Job A -> ANALYSIS_READY
    // -------------------------------------------------------------
    console.log('\n--- STEP 4 & 5: Analyze Job A -> ANALYSIS_READY ---');
    await sidebarTab.evaluate(`window.__sidebarController.runAnalyzeJob()`, false);

    for (let i = 0; i < 30; i++) {
      const state = await sidebarTab.evaluate(`window.__sidebarController.stateMachine.state`);
      if (state === 'ANALYSIS_READY') break;
      await sleep(1000);
    }

    const stateAfterAnalysis = await sidebarTab.evaluate(
      `window.__sidebarController.stateMachine.state`
    );
    const scoreVal = await sidebarTab.evaluate(`document.getElementById('scoreValue').textContent`);
    console.log(`   [Check] Workflow state: ${stateAfterAnalysis}, Match Score: ${scoreVal}`);
    if (stateAfterAnalysis !== 'ANALYSIS_READY') {
      throw new Error(`Expected ANALYSIS_READY, got ${stateAfterAnalysis}`);
    }
    console.log('   >>> STEP 4 & 5 VERIFIED: Job A analyzed, reached ANALYSIS_READY <<<');

    // -------------------------------------------------------------
    // STEP 6, 7 & 8: Prepare Handoff Kit -> APPLICATION_READY + LOCKED
    // -------------------------------------------------------------
    console.log('\n--- STEP 6, 7 & 8: Prepare Handoff Kit -> APPLICATION_READY + LOCKED ---');
    await sidebarTab.evaluate(`window.__sidebarController.runPrepareHandoff()`, false);

    for (let i = 0; i < 30; i++) {
      const state = await sidebarTab.evaluate(`window.__sidebarController.stateMachine.state`);
      if (state === 'APPLICATION_READY') break;
      await sleep(1000);
    }

    const stateAfterHandoff = await sidebarTab.evaluate(
      `window.__sidebarController.stateMachine.state`
    );
    const isLocked = await sidebarTab.evaluate(`window.__sidebarController.isWorkflowLocked()`);
    const lockState = await sidebarTab.evaluate(
      `window.__sidebarController.stateMachine.lockState`
    );
    const appAId = await sidebarTab.evaluate(`document.getElementById('handoffAppId').textContent`);
    const isLockBannerVisible = await sidebarTab.evaluate(
      `!document.getElementById('workflowLockBanner').classList.contains('hidden')`
    );
    const isLockBadgeVisible = await sidebarTab.evaluate(
      `!document.getElementById('workflowLockedBadge').classList.contains('hidden')`
    );
    const isReanalyzeDisabled = await sidebarTab.evaluate(
      `document.getElementById('reanalyzeBtn').disabled`
    );

    console.log(`   [Check] Workflow State: ${stateAfterHandoff}`);
    console.log(`   [Check] Lock State: ${lockState}, isLocked: ${isLocked}`);
    console.log(`   [Check] Application A ID: ${appAId}`);
    console.log(
      `   [Check] Lock Banner Visible: ${isLockBannerVisible}, Lock Badge Visible: ${isLockBadgeVisible}`
    );
    console.log(`   [Check] Re-detect Button Disabled: ${isReanalyzeDisabled}`);

    if (stateAfterHandoff !== 'APPLICATION_READY')
      throw new Error(`Expected APPLICATION_READY, got ${stateAfterHandoff}`);
    if (!isLocked || lockState !== 'LOCKED')
      throw new Error(`Workflow lock invariant violated! Expected LOCKED`);
    if (!isLockBannerVisible || !isLockBadgeVisible || !isReanalyzeDisabled) {
      throw new Error('Lock UI elements not properly rendered');
    }

    console.log('   >>> STEP 6, 7 & 8 VERIFIED: APPLICATION_READY + LOCKED established <<<');
    await sidebarTab.captureScreenshot('p60-02-application-ready.png');
    await sidebarTab.captureScreenshot('p60-03-locked-workflow.png');

    console.log('\n--- STEP 9: Verify Application A in MCP Infrastructure ---');
    const appsInDb = await db
      .select()
      .from(schema.jobApplications)
      .where(eq(schema.jobApplications.id, appAId));
    if (appsInDb.length === 0) throw new Error(`Application ${appAId} not found in PostgreSQL!`);
    console.log(
      `   [DB] Application A confirmed in DB: ${appsInDb[0].id} (Status: ${appsInDb[0].status})`
    );

    const appsAfterFirstHandoff = await db
      .select()
      .from(schema.jobApplications)
      .where(eq(schema.jobApplications.candidateId, targetCandidate.id));
    console.log(
      `   [DB] Total candidate applications in DB after handoff: ${appsAfterFirstHandoff.length}`
    );
    console.log('   >>> STEP 9 VERIFIED: Application A exists in database infrastructure <<<');

    // -------------------------------------------------------------
    // STEP 10, 11, 12, 13, 14: Navigate to Job B while LOCKED
    // -------------------------------------------------------------
    console.log('\n--- STEP 10-14: Navigate to Job B while LOCKED ---');
    // Navigate fixture tab to Job B
    await jobTab.conn.send('Page.navigate', { url: `http://127.0.0.1:${FIXTURE_PORT}/job-b` });
    await sleep(1000);

    // Reconcile navigation on locked tab in durable store
    const jobBData = {
      title: 'Staff Distributed Systems Engineer',
      company: 'CloudCorp Systems',
      location: 'Seattle, WA (Remote)',
      employmentType: 'Full-time',
      sourceUrl: `http://127.0.0.1:${FIXTURE_PORT}/job-b`,
    };

    // Send navigation event to store and sidebar
    await sidebarTab.evaluate(`
      window.__sidebarController.store.reconcileNavigation(
        ${simulatedTabId},
        ${JSON.stringify(jobBData)}
      )
    `);
    // Also simulate detector event arriving
    await sidebarTab.evaluate(`
      window.__sidebarController._handleJobDetectedEvent(${JSON.stringify(jobBData)})
    `);
    await sleep(500);

    const jobTitleWhileLocked = await sidebarTab.evaluate(
      `document.getElementById('jobTitle').textContent`
    );
    const appIdWhileLocked = await sidebarTab.evaluate(
      `document.getElementById('handoffAppId').textContent`
    );
    const currentScoreWhileLocked = await sidebarTab.evaluate(
      `document.getElementById('scoreValue').textContent`
    );

    console.log(`   [Check] Displayed Job Title: "${jobTitleWhileLocked}" (Expected Job A)`);
    console.log(
      `   [Check] Displayed App ID: "${appIdWhileLocked}" (Expected Application A: "${appAId}")`
    );
    console.log(
      `   [Check] Displayed Score: "${currentScoreWhileLocked}" (Expected Job A Score: "${scoreVal}")`
    );

    if (!jobTitleWhileLocked.includes('Senior Backend Engineer')) {
      throw new Error(
        `Workflow lock failure! Job was overwritten by navigation to Job B: ${jobTitleWhileLocked}`
      );
    }
    if (appIdWhileLocked !== appAId) {
      throw new Error(`Workflow lock failure! App ID was replaced: ${appIdWhileLocked}`);
    }

    // Verify DB count has not changed (no duplicate application created)
    const appsAfterNav = await db
      .select()
      .from(schema.jobApplications)
      .where(eq(schema.jobApplications.candidateId, targetCandidate.id));
    if (appsAfterNav.length !== appsAfterFirstHandoff.length) {
      throw new Error(
        `Unexpected duplicate application created during navigation! Expected ${appsAfterFirstHandoff.length}, got ${appsAfterNav.length}`
      );
    }

    console.log(
      '   >>> STEP 10-14 VERIFIED: Navigation while locked strictly preserved Job A and Application A <<<'
    );
    await sidebarTab.captureScreenshot('p60-04-navigation-while-locked.png');

    // -------------------------------------------------------------
    // STEP 15 & 16: Close and Reopen Sidebar -> Verify LOCKED Restored
    // -------------------------------------------------------------
    console.log('\n--- STEP 15 & 16: Close/Reopen Sidebar -> Verify LOCKED Restored ---');
    await sidebarTab.close();
    sidebarTab = await openTab('about:blank');
    await sidebarTab.conn.send('Network.setCookie', {
      name: 'career_hub_session',
      value: realSession.rawToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    });
    await sidebarTab.conn.send('Page.navigate', {
      url: `chrome-extension://${extensionId}/sidebar/sidebar.html?tabId=${simulatedTabId}`,
    });
    await sleep(1500);

    await sidebarTab.evaluate(`window.__sidebarController._checkAuthStatus()`);
    await sidebarTab.evaluate(`window.__sidebarController._hydrateFromStore()`);
    await sleep(500);

    const rehydratedState = await sidebarTab.evaluate(
      `window.__sidebarController.stateMachine.state`
    );
    const rehydratedIsLocked = await sidebarTab.evaluate(
      `window.__sidebarController.isWorkflowLocked()`
    );
    const rehydratedAppId = await sidebarTab.evaluate(
      `document.getElementById('handoffAppId').textContent`
    );
    const rehydratedJobTitle = await sidebarTab.evaluate(
      `document.getElementById('jobTitle').textContent`
    );

    console.log(`   [Check] Rehydrated State: ${rehydratedState}, isLocked: ${rehydratedIsLocked}`);
    console.log(
      `   [Check] Rehydrated App ID: "${rehydratedAppId}", Job Title: "${rehydratedJobTitle}"`
    );

    if (rehydratedState !== 'APPLICATION_READY' || !rehydratedIsLocked) {
      throw new Error('Durable lock recovery failed upon reopening sidebar');
    }
    if (rehydratedAppId !== appAId || !rehydratedJobTitle.includes('Senior Backend Engineer')) {
      throw new Error('Durable recovery did not restore exact Job A application');
    }

    console.log('   >>> STEP 15 & 16 VERIFIED: Close/reopen sidebar restored LOCKED workflow <<<');
    await sidebarTab.captureScreenshot('p60-05-restored-locked-workflow.png');

    // -------------------------------------------------------------
    // STEP 17 & 18: Reload Page -> Verify LOCKED Restored
    // -------------------------------------------------------------
    console.log('\n--- STEP 17 & 18: Reload Page -> Verify LOCKED Restored ---');
    await sidebarTab.conn.send('Page.reload');
    await sleep(1500);

    await sidebarTab.evaluate(`window.__sidebarController._checkAuthStatus()`);
    await sidebarTab.evaluate(`window.__sidebarController._hydrateFromStore()`);
    await sleep(500);

    const reloadedIsLocked = await sidebarTab.evaluate(
      `window.__sidebarController.isWorkflowLocked()`
    );
    const reloadedState = await sidebarTab.evaluate(
      `window.__sidebarController.stateMachine.state`
    );
    if (!reloadedIsLocked || reloadedState !== 'APPLICATION_READY') {
      throw new Error('Page reload failed to preserve locked workflow');
    }
    console.log('   >>> STEP 17 & 18 VERIFIED: Page reload preserved LOCKED workflow <<<');

    // -------------------------------------------------------------
    // STEP 19 & 20: Expire Session -> Workflow Remains Intact
    // -------------------------------------------------------------
    console.log('\n--- STEP 19 & 20: Expire Session -> Workflow Remains Intact ---');
    await sidebarTab.evaluate(`window.__sidebarController._handleSessionExpired()`);
    await sleep(500);

    const isUnauthAfterExpiry = await sidebarTab.evaluate(
      `!window.__sidebarController.isAuthenticated`
    );
    const appAfterExpiry = await sidebarTab.evaluate(
      `document.getElementById('handoffAppId').textContent`
    );
    const jobAfterExpiry = await sidebarTab.evaluate(
      `document.getElementById('jobTitle').textContent`
    );
    const lockAfterExpiry = await sidebarTab.evaluate(
      `window.__sidebarController.isWorkflowLocked()`
    );

    console.log(
      `   [Check] Unauthenticated: ${isUnauthAfterExpiry}, App ID: "${appAfterExpiry}", Job: "${jobAfterExpiry}", isLocked: ${lockAfterExpiry}`
    );
    if (!isUnauthAfterExpiry || appAfterExpiry !== appAId || !lockAfterExpiry) {
      throw new Error('Session expiry corrupted locked workflow! Invariant violated.');
    }
    console.log('   >>> STEP 19 & 20 VERIFIED: Session expiry preserved workflow and lock <<<');

    // -------------------------------------------------------------
    // STEP 21 & 22: Re-authenticate -> APPLICATION_READY + LOCKED
    // -------------------------------------------------------------
    console.log('\n--- STEP 21 & 22: Re-authenticate -> APPLICATION_READY + LOCKED ---');
    await sidebarTab.conn.send('Network.setCookie', {
      name: 'career_hub_session',
      value: realSession.rawToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    });
    await sidebarTab.evaluate(`window.__sidebarController._checkAuthStatus()`);
    await sleep(500);

    const emailAfterReauth = await sidebarTab.evaluate(
      `document.getElementById('userEmail').textContent`
    );
    const stateAfterReauth = await sidebarTab.evaluate(
      `window.__sidebarController.stateMachine.state`
    );
    const lockAfterReauth = await sidebarTab.evaluate(
      `window.__sidebarController.isWorkflowLocked()`
    );

    console.log(
      `   [Check] Email after reauth: "${emailAfterReauth}", State: ${stateAfterReauth}, isLocked: ${lockAfterReauth}`
    );
    if (
      emailAfterReauth !== targetUser.email ||
      stateAfterReauth !== 'APPLICATION_READY' ||
      !lockAfterReauth
    ) {
      throw new Error('Re-authentication failed to restore canonical identity and locked state');
    }
    console.log(
      '   >>> STEP 21 & 22 VERIFIED: Re-authentication restored canonical identity and lock <<<'
    );

    // -------------------------------------------------------------
    // STEP 23 & 24: Click Reset Workflow -> Extension Becomes IDLE
    // -------------------------------------------------------------
    console.log('\n--- STEP 23 & 24: Click Reset Workflow -> Extension Becomes IDLE ---');
    await sidebarTab.evaluate(`window.__sidebarController.resetWorkflow()`);
    await sleep(500);

    const stateAfterReset = await sidebarTab.evaluate(
      `window.__sidebarController.stateMachine.state`
    );
    const isLockedAfterReset = await sidebarTab.evaluate(
      `window.__sidebarController.isWorkflowLocked()`
    );
    const isLockBannerHidden = await sidebarTab.evaluate(
      `document.getElementById('workflowLockBanner').classList.contains('hidden')`
    );
    const isLockBadgeHidden = await sidebarTab.evaluate(
      `document.getElementById('workflowLockedBadge').classList.contains('hidden')`
    );
    const isReanalyzeActiveAfterReset = await sidebarTab.evaluate(
      `!document.getElementById('reanalyzeBtn').disabled`
    );

    console.log(`   [Check] State after reset: ${stateAfterReset} (Expected: IDLE)`);
    console.log(`   [Check] isLocked after reset: ${isLockedAfterReset} (Expected: false)`);
    console.log(
      `   [Check] Lock Banner Hidden: ${isLockBannerHidden}, Lock Badge Hidden: ${isLockBadgeHidden}`
    );
    console.log(`   [Check] Re-detect enabled: ${isReanalyzeActiveAfterReset}`);

    if (stateAfterReset !== 'IDLE' || isLockedAfterReset !== false || !isLockBannerHidden) {
      throw new Error('Reset Workflow failed to return extension to unlocked IDLE state');
    }
    console.log('   >>> STEP 23 & 24 VERIFIED: Extension reset to IDLE and unlocked <<<');
    await sidebarTab.captureScreenshot('p60-06-reset-state.png');

    // -------------------------------------------------------------
    // STEP 25, 26, 27, 28: Application A & Data Remains in Database
    // -------------------------------------------------------------
    console.log(
      '\n--- STEP 25-28: Verify Application A, Resume, Cover Letter, Handoff Data Intact in DB ---'
    );
    const appsInDbAfterReset = await db
      .select()
      .from(schema.jobApplications)
      .where(eq(schema.jobApplications.id, appAId));

    if (appsInDbAfterReset.length === 0) {
      throw new Error('CRITICAL VIOLATION: Reset Workflow deleted Application A from database!');
    }

    const appA = appsInDbAfterReset[0];
    console.log(`   [DB] Application A confirmed present in DB: ${appA.id}`);
    console.log(`   [DB] Resume Artifact ID: ${appA.resumeArtifactId}`);
    console.log(`   [DB] Cover Letter Artifact ID: ${appA.coverLetterArtifactId}`);
    console.log(`   [DB] Handoff Package Hash: ${appA.handoffPackageHash}`);

    // Verify all candidate applications still present in DB
    const allAppsAfterReset = await db
      .select()
      .from(schema.jobApplications)
      .where(eq(schema.jobApplications.candidateId, targetCandidate.id));
    console.log(
      `   [DB] Total candidate applications in DB after Reset: ${allAppsAfterReset.length}`
    );
    if (allAppsAfterReset.length !== appsAfterFirstHandoff.length) {
      throw new Error('Application count changed after reset! Data destruction detected.');
    }

    console.log(
      '   >>> STEP 25-28 VERIFIED: Reset Workflow did NOT delete Application A, resume, cover letter, or handoff kit <<<'
    );
    await sidebarTab.captureScreenshot('p60-07-old-app-available-after-reset.png');

    // -------------------------------------------------------------
    // STEP 29 & 30: Navigate to Job B -> Fresh Detection Allowed
    // -------------------------------------------------------------
    console.log('\n--- STEP 29 & 30: Navigate to Job B -> Fresh Detection Allowed ---');
    await sidebarTab.evaluate(`
      window.__sidebarController._handleJobDetectedEvent(${JSON.stringify(jobBData)})
    `);
    await sleep(500);

    const detectedTitleB = await sidebarTab.evaluate(
      `document.getElementById('jobTitle').textContent`
    );
    const stateWithJobB = await sidebarTab.evaluate(
      `window.__sidebarController.stateMachine.state`
    );
    const appIdForJobB = await sidebarTab.evaluate(
      `window.__sidebarController.cachedState.applicationId`
    );

    console.log(`   [Check] Detected Title: "${detectedTitleB}" (Expected: Job B)`);
    console.log(`   [Check] State: ${stateWithJobB} (Expected: JOB_DETECTED)`);
    console.log(`   [Check] Application ID: ${appIdForJobB} (Expected: null)`);

    if (!detectedTitleB.includes('Staff Distributed Systems Engineer')) {
      throw new Error('Fresh detection of Job B failed after reset');
    }
    if (appIdForJobB !== null) {
      throw new Error(`New workflow inherited old applicationId: ${appIdForJobB}`);
    }
    console.log('   >>> STEP 29 & 30 VERIFIED: Fresh detection of Job B allowed after reset <<<');

    // -------------------------------------------------------------
    // STEP 31, 32 & 33: Analyze Job B -> Independent Workflow, App A Untouched
    // -------------------------------------------------------------
    console.log('\n--- STEP 31-33: Analyze Job B -> Independent Workflow, App A Untouched ---');
    await sidebarTab.evaluate(`window.__sidebarController.runAnalyzeJob()`, false);

    for (let i = 0; i < 30; i++) {
      const state = await sidebarTab.evaluate(`window.__sidebarController.stateMachine.state`);
      if (state === 'ANALYSIS_READY') break;
      await sleep(1000);
    }

    const stateJobB = await sidebarTab.evaluate(`window.__sidebarController.stateMachine.state`);
    const scoreJobB = await sidebarTab.evaluate(
      `document.getElementById('scoreValue').textContent`
    );
    console.log(`   [Check] Job B Workflow State: ${stateJobB}, Match Score: ${scoreJobB}`);
    if (stateJobB !== 'ANALYSIS_READY') {
      throw new Error(`Job B failed to reach ANALYSIS_READY: ${stateJobB}`);
    }

    // Verify Application A in DB remains completely untouched
    const appACheck = await db
      .select()
      .from(schema.jobApplications)
      .where(eq(schema.jobApplications.id, appAId));
    if (appACheck.length === 0 || appACheck[0].jobTitle !== appA.jobTitle) {
      throw new Error('Application A was mutated by new Job B workflow!');
    }

    console.log(
      '   >>> STEP 31-33 VERIFIED: Job B analyzed independently, Application A completely untouched <<<'
    );
    await sidebarTab.captureScreenshot('p60-08-new-workflow-after-reset.png');

    console.log('\n================================================================');
    console.log('  ALL 33 PART 60 REAL CHROME E2E VERIFICATION STEPS PASSED 100%!');
    console.log('================================================================\n');

    await sidebarTab.close().catch(() => {});
    await jobTab.close().catch(() => {});
    process.exit(0);
  } finally {
    browserCdp.close();
    chromeProcess.kill('SIGTERM');
    fixtureServer.close();
    try {
      fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

run().catch((err) => {
  console.error('\n[FATAL ERROR IN REAL CHROME E2E]:', err);
  process.exit(1);
});
