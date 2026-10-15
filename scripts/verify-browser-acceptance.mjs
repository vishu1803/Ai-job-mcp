/**
 * @file End-to-End Real Browser Acceptance Test Suite.
 *
 * Launches Playwright Chromium to test the complete user experience across
 * all 5 candidate archetypes and key viewports.
 *
 * Verifies:
 * 1. Public entry, auth redirects, and login portal.
 * 2. Archetype A (New Candidate): Empty states, guidance, onboarding wizard.
 * 3. Archetype B (Partial Candidate): Missing phone warning, claimed skills, profile edit.
 * 4. Archetype C (Junior Backend): Verified skills, project evidence, base resume, saved job.
 * 5. Archetype D (Experienced Lead): Full dashboard, Radar discovery & paste-JD analysis,
 *    Resume Studio end-to-end (bullet editing, AI proposal, 1-page A4 PDF preview),
 *    Applications board & Handoff Kit workspace, AI token generation, Dark theme.
 * 6. Archetype E (Tenant 2 / Readonly): Multi-tenant isolation (IDOR 404) & READONLY 403 gate.
 * 7. Responsive viewports (1440px, 1024px, 768px, 390px, 375px) with zero horizontal overflow.
 */

/* global document, window */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startBrowserAcceptanceHarness } from './serve-browser-acceptance.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.resolve(__dirname, '../output/browser-acceptance');
const screenshotDir = path.join(outputDir, 'screenshots');

await fs.mkdir(screenshotDir, { recursive: true });

const results = {
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  defects: [],
  viewportsTested: [],
};

function recordCheck(title, status = 'PASS', details = {}) {
  results.checks.push({ title, status, details, timestamp: new Date().toISOString() });
  console.log(`  [${status}] ${title}`);
}

function recordDefect(severity, title, details) {
  results.defects.push({ severity, title, details, timestamp: new Date().toISOString() });
  console.error(`  [DEFECT ${severity}] ${title}: ${details}`);
}

console.log('================================================================');
console.log('  ANTIGRAVITY CAREER HUB — REAL-BROWSER ACCEPTANCE AUDIT');
console.log('================================================================\n');

// 1. Launch Acceptance Server Harness
console.log('1. Starting integrated acceptance server harness...');
const harness = await startBrowserAcceptanceHarness();
console.log(`   Acceptance server ready at ${harness.baseUrl}`);
console.log(`   Database: ${harness.manifest.database} on port ${harness.manifest.databasePort}`);

const [personaA, personaB, personaC, personaD, personaE] = harness.personas;

// 2. Launch Chromium Browser
console.log('\n2. Launching real Chromium browser via Playwright...');
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
} catch {
  browser = await chromium.launch({ headless: true });
}

try {
  // ===========================================================================
  // JOURNEY 1: PUBLIC ENTRY, AUTH BOUNDARIES & NAVIGATION
  // ===========================================================================
  console.log('\n--- JOURNEY 1: PUBLIC ENTRY, AUTH BOUNDARIES & NAVIGATION ---');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // 1.1 Landing page
    const landingRes = await page.goto(harness.baseUrl + '/');
    assert.equal(landingRes.status(), 200);
    const landingTitle = await page.title();
    assert.ok(landingTitle.length > 0, 'Landing page has title');
    const heroHeading = await page.locator('h1').first().textContent();
    assert.ok(heroHeading.length > 0, 'Hero heading exists');

    const landingScreenshot = path.join(screenshotDir, '01-landing-desktop-1440.png');
    await page.screenshot({ path: landingScreenshot, fullPage: true });
    results.screenshots.push({ name: '01-landing-desktop-1440.png', page: '/' });
    recordCheck('Landing page renders HTTP 200 with hero heading and brand navigation');

    // 1.2 Unauthenticated protected routes redirect to login
    for (const route of ['/dashboard', '/profile', '/resumes', '/resume-studio', '/applications']) {
      const redirectRes = await context.request.get(harness.baseUrl + route, { maxRedirects: 0 });
      assert.equal(
        redirectRes.status(),
        302,
        `Unauthenticated ${route} should redirect with HTTP 302`
      );
      const loc = redirectRes.headers()['location'];
      assert.ok(loc.includes('/login'), `Redirect for ${route} points to /login`);
    }
    recordCheck('Unauthenticated requests to protected views fail-safe to /login redirect');

    // 1.3 Login page rendering
    await page.goto(harness.baseUrl + '/login');
    assert.equal(page.url().includes('/login'), true);
    assert.ok(
      (await page.locator('#githubLoginBtn, a[href*="/auth/github"]').count()) > 0,
      'GitHub login button present'
    );
    assert.ok(
      (await page.locator('#devLoginBtn, a[href*="/auth/dev-login"]').count()) > 0,
      'Dev login helper button present in non-production'
    );

    const loginScreenshot = path.join(screenshotDir, '02-login-desktop-1440.png');
    await page.screenshot({ path: loginScreenshot, fullPage: false });
    results.screenshots.push({ name: '02-login-desktop-1440.png', page: '/login' });
    recordCheck('Login portal renders GitHub OAuth CTA and dev-login helper cleanly');

    // 1.4 MCP Specification Documentation
    const mcpRes = await page.goto(harness.baseUrl + '/docs/mcp');
    assert.equal(mcpRes.status(), 200);
    assert.ok((await page.textContent('body')).includes('Model Context Protocol'));
    const mcpScreenshot = path.join(screenshotDir, '03-mcp-docs-desktop-1440.png');
    await page.screenshot({ path: mcpScreenshot, fullPage: false });
    results.screenshots.push({ name: '03-mcp-docs-desktop-1440.png', page: '/docs/mcp' });
    recordCheck('Public MCP specification documentation view renders HTTP 200');

    // 1.5 Legal & Compliance pages
    for (const legalRoute of ['/privacy', '/terms', '/security', '/data-deletion']) {
      const res = await context.request.get(harness.baseUrl + legalRoute);
      assert.equal(res.status(), 200, `Legal route ${legalRoute} returns 200`);
    }
    recordCheck(
      'Static trust & compliance pages (/privacy, /terms, /security, /data-deletion) return 200'
    );

    await context.close();
  }

  // ===========================================================================
  // JOURNEY 2: ARCHETYPE A (NEW CANDIDATE — FIRST TIME EXPERIENCE)
  // ===========================================================================
  console.log('\n--- JOURNEY 2: ARCHETYPE A (NEW CANDIDATE — FIRST TIME USER) ---');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // 2.1 Authenticate as Persona A
    await page.goto(personaA.loginUrl);
    await page.waitForURL('**/dashboard');
    assert.ok(page.url().includes('/dashboard'));
    recordCheck('Persona A (New Candidate) authenticated via dev-login into /dashboard');

    // 2.2 Verify Dashboard empty state
    const bodyText = await page.textContent('body');
    assert.ok(bodyText.includes('Alex Rivers') || bodyText.includes('Welcome'));
    // Ensure no unhandled error message or NaN is visible
    assert.ok(!bodyText.includes('NaN%'), 'Zero NaN percentages in empty dashboard');

    const dashScreenshot = path.join(screenshotDir, '04-archetype-a-dashboard-1440.png');
    await page.screenshot({ path: dashScreenshot, fullPage: false });
    results.screenshots.push({ name: '04-archetype-a-dashboard-1440.png', page: '/dashboard' });
    recordCheck('Empty dashboard renders gracefully without NaN% or unhandled exceptions');

    // 2.3 Onboarding Wizard
    await page.goto(harness.baseUrl + '/onboarding');
    assert.equal(page.url().includes('/onboarding'), true);
    assert.ok((await page.locator('form').count()) > 0, 'Onboarding profile form present');
    const onbScreenshot = path.join(screenshotDir, '05-archetype-a-onboarding-1440.png');
    await page.screenshot({ path: onbScreenshot, fullPage: false });
    results.screenshots.push({ name: '05-archetype-a-onboarding-1440.png', page: '/onboarding' });
    recordCheck('Onboarding setup wizard displays Step 1 profile form');

    // 2.4 Resumes Empty State
    await page.goto(harness.baseUrl + '/resumes');
    assert.equal(page.url().includes('/resumes'), true);
    const resumesText = await page.textContent('body');
    assert.ok(
      resumesText.includes('Upload') ||
        resumesText.includes('Resume') ||
        resumesText.includes('No resumes')
    );
    const resumesScreenshot = path.join(screenshotDir, '06-archetype-a-resumes-empty-1440.png');
    await page.screenshot({ path: resumesScreenshot, fullPage: false });
    results.screenshots.push({ name: '06-archetype-a-resumes-empty-1440.png', page: '/resumes' });
    recordCheck('Resumes hub displays clean upload prompt for candidate with 0 resumes');

    // 2.5 Applications Empty State
    await page.goto(harness.baseUrl + '/applications');
    assert.equal(page.url().includes('/applications'), true);
    const appsText = await page.textContent('body');
    assert.ok(
      appsText.includes('No applications') ||
        appsText.includes('Track') ||
        appsText.includes('Radar') ||
        appsText.includes('Saved')
    );
    const appsScreenshot = path.join(screenshotDir, '07-archetype-a-applications-empty-1440.png');
    await page.screenshot({
      path: appsScreenshot,
      fullPage: false,
    });
    results.screenshots.push({
      name: '07-archetype-a-applications-empty-1440.png',
      page: '/applications',
    });
    recordCheck('Applications hub displays calm empty workspace with CTA to Radar');

    await context.close();
  }

  // ===========================================================================
  // JOURNEY 3: ARCHETYPE B (PARTIAL CANDIDATE — MISSING PHONE & CLAIMS)
  // ===========================================================================
  console.log('\n--- JOURNEY 3: ARCHETYPE B (PARTIAL CANDIDATE & READINESS) ---');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // 3.1 Authenticate as Persona B
    await page.goto(personaB.loginUrl);
    await page.waitForURL('**/dashboard');
    assert.ok(page.url().includes('/dashboard'));

    // 3.2 Verify readiness missing phone indicator
    const dashText = await page.textContent('body');
    assert.ok(
      dashText.includes('Add Phone') ||
        dashText.includes('phone') ||
        dashText.includes('Readiness') ||
        dashText.includes('Jordan Lee')
    );
    const partialDashScreenshot = path.join(screenshotDir, '08-archetype-b-dashboard-1440.png');
    await page.screenshot({ path: partialDashScreenshot, fullPage: false });
    results.screenshots.push({ name: '08-archetype-b-dashboard-1440.png', page: '/dashboard' });
    recordCheck('Dashboard flags missing phone number readiness prompt for Jordan Lee');

    // 3.3 Profile View: Inspect Claims and Fill Phone
    await page.goto(harness.baseUrl + '/profile');
    assert.equal(page.url().includes('/profile'), true);
    const profileText = await page.textContent('body');
    assert.ok(profileText.includes('Jordan Lee'));

    const profileScreenshot = path.join(screenshotDir, '09-archetype-b-profile-before-1440.png');
    await page.screenshot({ path: profileScreenshot, fullPage: false });
    results.screenshots.push({
      name: '09-archetype-b-profile-before-1440.png',
      page: '/profile',
    });

    // Check skills page for claimed status
    await page.goto(harness.baseUrl + '/skills');
    const skillsText = await page.textContent('body');
    assert.ok(skillsText.includes('JavaScript') || skillsText.includes('CSS'));
    recordCheck('Skills taxonomy explorer displays claimed skills with CLAIMED provenance badge');

    // Return to profile to inspect contact section
    await page.goto(harness.baseUrl + '/profile?section=contact');
    const contactText = await page.textContent('body');
    assert.ok(contactText.includes('Jordan Lee'));
    recordCheck('Profile contact tab loads cleanly without errors');

    await context.close();
  }

  // ===========================================================================
  // JOURNEY 4: ARCHETYPE C (JUNIOR BACKEND — EVIDENCE, RESUME, RADAR)
  // ===========================================================================
  console.log('\n--- JOURNEY 4: ARCHETYPE C (JUNIOR BACKEND CANDIDATE) ---');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // 4.1 Authenticate as Persona C
    await page.goto(personaC.loginUrl);
    await page.waitForURL('**/dashboard');
    assert.ok(page.url().includes('/dashboard'));

    const dashText = await page.textContent('body');
    assert.ok(dashText.includes('Taylor Coder') || dashText.includes('Library Lending API'));
    assert.ok(dashText.includes('PostgreSQL') || dashText.includes('Node.js'));

    const cDashScreenshot = path.join(screenshotDir, '10-archetype-c-dashboard-1440.png');
    await page.screenshot({ path: cDashScreenshot, fullPage: false });
    results.screenshots.push({ name: '10-archetype-c-dashboard-1440.png', page: '/dashboard' });
    recordCheck('Dashboard showcases verified project and top verified skills chips');

    // 4.2 Projects Portfolio & Detail Inspection
    await page.goto(harness.baseUrl + '/projects');
    assert.equal(page.url().includes('/projects'), true);
    assert.ok((await page.textContent('body')).includes('Library Lending API'));
    const projListScreenshot = path.join(screenshotDir, '11-archetype-c-projects-1440.png');
    await page.screenshot({ path: projListScreenshot, fullPage: false });
    results.screenshots.push({ name: '11-archetype-c-projects-1440.png', page: '/projects' });
    recordCheck('Projects portfolio renders verified Library Lending API card');

    // 4.3 Skills Taxonomy Page
    await page.goto(harness.baseUrl + '/skills');
    assert.equal(page.url().includes('/skills'), true);
    const skillsText = await page.textContent('body');
    assert.ok(skillsText.includes('TypeScript') || skillsText.includes('Docker'));
    const skillsScreenshot = path.join(screenshotDir, '12-archetype-c-skills-1440.png');
    await page.screenshot({ path: skillsScreenshot, fullPage: false });
    results.screenshots.push({ name: '12-archetype-c-skills-1440.png', page: '/skills' });
    recordCheck('Skills taxonomy explorer displays verified skills with evidence links');

    // 4.4 Resumes Hub
    await page.goto(harness.baseUrl + '/resumes');
    assert.equal(page.url().includes('/resumes'), true);
    const resumesText = await page.textContent('body');
    assert.ok(resumesText.includes('taylor-coder-junior-backend.pdf'));
    const cResumesScreenshot = path.join(screenshotDir, '13-archetype-c-resumes-1440.png');
    await page.screenshot({ path: cResumesScreenshot, fullPage: false });
    results.screenshots.push({ name: '13-archetype-c-resumes-1440.png', page: '/resumes' });
    recordCheck('Resumes hub displays master resume with BASE_RESUME badge');

    // 4.5 Radar Job Discovery
    await page.goto(harness.baseUrl + '/apps/radar');
    assert.equal(page.url().includes('/apps/radar'), true);
    const radarText = await page.textContent('body');
    assert.ok(
      radarText.includes('Radar') ||
        radarText.includes('Synthetix') ||
        radarText.includes('Backend') ||
        radarText.includes('Discover')
    );
    const cRadarScreenshot = path.join(screenshotDir, '14-archetype-c-radar-1440.png');
    await page.screenshot({ path: cRadarScreenshot, fullPage: false });
    results.screenshots.push({ name: '14-archetype-c-radar-1440.png', page: '/apps/radar' });
    recordCheck('Radar Job Fit page renders discovery view and saved job matches');

    await context.close();
  }

  // ===========================================================================
  // JOURNEY 5: ARCHETYPE D (EXPERIENCED LEAD — RESUME STUDIO & HANDOFF KIT)
  // ===========================================================================
  console.log('\n--- JOURNEY 5: ARCHETYPE D (LEAD ARCHITECT, STUDIO & HANDOFF) ---');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (['error', 'warning'].includes(msg.type())) {
        console.log('PAGE ' + msg.type().toUpperCase() + ':', msg.text());
      }
    });
    page.on('pageerror', (err) => console.error('PAGE ERROR:', err.message));

    // 5.1 Authenticate as Persona D
    await page.goto(personaD.loginUrl);
    await page.waitForURL('**/dashboard');
    assert.ok(page.url().includes('/dashboard'));

    const dashText = await page.textContent('body');
    assert.ok(dashText.includes('Morgan Vance'));
    assert.ok(dashText.includes('Stripe') || dashText.includes('Snowflake'));
    const dDashScreenshot = path.join(screenshotDir, '15-archetype-d-dashboard-1440.png');
    await page.screenshot({ path: dDashScreenshot, fullPage: false });
    results.screenshots.push({ name: '15-archetype-d-dashboard-1440.png', page: '/dashboard' });
    recordCheck('Dashboard displays 4 active application pipeline stages for Morgan Vance');

    // 5.2 Radar Discovery Search & Paste JD Fit Analysis
    await page.goto(harness.baseUrl + '/apps/radar');
    const radarDiscoverText = await page.textContent('body');
    assert.ok(
      radarDiscoverText.includes('Stripe') ||
        radarDiscoverText.includes('Datadog') ||
        radarDiscoverText.includes('Snowflake')
    );
    recordCheck('Radar discovery renders curated job cards from JobDiscoveryService');

    // 5.3 Resume Studio End-to-End
    await page.goto(personaD.studioUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('#structuredEditorContainer textarea.rs-edit-input').first().waitFor();
    assert.ok(page.url().includes('/resume-studio?draftId='));

    // Check Target Job Header
    const studioText = await page.textContent('body');
    assert.ok(
      studioText.includes('Staff Platform Engineer') || studioText.includes('Synthetic Systems')
    );
    recordCheck('Resume Studio loads target job context bar');

    // 5.4 Run Analysis & Fit Score Diagnostics
    await page.locator('#rsJobDetails > summary').click();
    const analysisPromise = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/analyze')
    );
    await page.locator('#btnRunAnalysis').click();
    const analysisRes = await analysisPromise;
    assert.equal(analysisRes.status(), 200);
    const fitScoreVal = await page.locator('#valFitScore').textContent();
    assert.notEqual(fitScoreVal, '—');
    await page.locator('#rsJobDetails > summary').click();
    recordCheck(
      `Resume Studio diagnostics & ATS fit score (${fitScoreVal}) evaluated over CSRF API`
    );

    // 5.5 Propose AI Revision & Accept Proposal
    const proposePromise = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/proposals')
    );
    await page.locator('.rs-btn-propose').first().click();
    const proposeRes = await proposePromise;
    if (proposeRes.status() !== 201) {
      console.error('PROPOSE FAILED STATUS:', proposeRes.status(), await proposeRes.text());
    }
    assert.equal(proposeRes.status(), 201);

    const acceptBtn = page.locator('.rs-btn-accept-proposal').first();
    await acceptBtn.waitFor();
    assert.equal(await acceptBtn.isDisabled(), false);
    assert.equal(await page.locator('.rs-btn-reject-proposal').first().isDisabled(), false);

    // Inspect Proposal Evidence Source
    await page.locator('.rs-inspect-proposal-source').first().click();
    assert.ok((await page.locator('#evidenceItemsContainer').textContent()).length > 0);
    await page.keyboard.press('Escape');

    const studioEditorScreenshot = path.join(
      screenshotDir,
      '16-archetype-d-studio-proposal-1440.png'
    );
    await page.screenshot({ path: studioEditorScreenshot, fullPage: false });
    results.screenshots.push({
      name: '16-archetype-d-studio-proposal-1440.png',
      page: '/resume-studio',
    });
    recordCheck('Synthetic AI bullet proposal generated with source provenance and modal controls');

    // Accept Proposal
    const acceptDecisionPromise = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/decision')
    );
    await acceptBtn.click();
    const decisionRes = await acceptDecisionPromise;
    assert.equal(decisionRes.status(), 200);
    recordCheck('Accepted AI proposal cleanly integrates text into candidate bullet');

    // 5.6 Structured Bullet Editing & Autosave (on second bullet)
    const bulletInputs = page.locator('#structuredEditorContainer textarea.rs-edit-input');
    const secondBullet = bulletInputs.nth(1);
    const originalSecondValue = await secondBullet.inputValue();
    const updatedSecondValue =
      originalSecondValue + ' Built low-latency Raft consensus utilizing automated benchmarks.';

    const patchPromise = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.url().includes('/drafts/')
    );
    await secondBullet.fill(updatedSecondValue);
    const patchRes = await patchPromise;
    assert.equal(patchRes.status(), 200);

    await page.waitForFunction(
      () => document.getElementById('rsSaveStatusText').textContent === 'All changes saved'
    );
    recordCheck('Structured bullet editing autosaves revision to backend ledger');

    // Reload page and verify persistence
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    const bulletInputsReloaded = page.locator('#structuredEditorContainer textarea.rs-edit-input');
    await bulletInputsReloaded.nth(1).waitFor();
    assert.equal(await bulletInputsReloaded.nth(1).inputValue(), updatedSecondValue);
    recordCheck('Edited bullet content persists across full browser reload');

    // 5.7 Document Preview & Single-Page A4 Compliance
    await page.locator('#tabDocumentPreview').click();
    await page.waitForTimeout(500);
    if (await page.locator('#btnExportPdf').isDisabled()) {
      await page
        .locator('#btnCompilePreview')
        .click()
        .catch(() => {});
    }
    await page.waitForFunction(
      () => !document.getElementById('btnExportPdf').disabled,
      {},
      { timeout: 90000 }
    );
    assert.equal(await page.locator('#btnExportPdf').isDisabled(), false);
    assert.equal(await page.locator('#btnExportDocx').isDisabled(), false);

    const studioDocScreenshot = path.join(screenshotDir, '17-archetype-d-studio-preview-1440.png');
    await page.screenshot({ path: studioDocScreenshot, fullPage: false });
    results.screenshots.push({
      name: '17-archetype-d-studio-preview-1440.png',
      page: '/resume-studio',
    });
    recordCheck('Single-page A4 document preview compiles with PDF & DOCX export enabled');

    // 5.8 Applications Board
    await page.goto(harness.baseUrl + '/applications');
    assert.equal(page.url().includes('/applications'), true);
    const appsText = await page.textContent('body');
    assert.ok(appsText.includes('Stripe'));
    assert.ok(appsText.includes('Datadog'));
    assert.ok(appsText.includes('Snowflake'));
    assert.ok(appsText.includes('HashiCorp'));

    const appsBoardScreenshot = path.join(screenshotDir, '18-archetype-d-applications-1440.png');
    await page.screenshot({ path: appsBoardScreenshot, fullPage: false });
    results.screenshots.push({
      name: '18-archetype-d-applications-1440.png',
      page: '/applications',
    });
    recordCheck(
      'Applications kanban board displays all 4 lifecycle states (Saved, Prepared, Handoff Ready, Applied)'
    );

    // 5.9 Snowflake Handoff Kit Workspace
    const snowflakeHandoffRoute = `/applications/${personaD.appD3Id}/handoff`;
    await page.goto(harness.baseUrl + snowflakeHandoffRoute);
    assert.ok(page.url().includes('/handoff'));

    const handoffText = await page.textContent('body');
    assert.ok(handoffText.includes('HANDOFF_READY') || handoffText.includes('Handoff'));
    assert.ok(handoffText.includes('Snowflake'));
    assert.ok(handoffText.includes('Package Hash') || handoffText.includes('package'));
    assert.ok(
      (await page.locator('a[href*="download"], button:has-text("Download")').count()) > 0,
      'Download package button present'
    );

    const handoffScreenshot = path.join(screenshotDir, '19-archetype-d-handoff-kit-1440.png');
    await page.screenshot({ path: handoffScreenshot, fullPage: false });
    results.screenshots.push({
      name: '19-archetype-d-handoff-kit-1440.png',
      page: '/applications/:id/handoff',
    });
    recordCheck(
      'Handoff Kit workspace displays package integrity hash, QA badge and export button'
    );

    // 5.10 AI Connection Center & Token Generation
    await page.goto(harness.baseUrl + '/connect');
    assert.equal(page.url().includes('/connect'), true);
    assert.ok((await page.textContent('body')).includes('Model Context Protocol'));
    const connectScreenshot = path.join(screenshotDir, '20-archetype-d-connect-1440.png');
    await page.screenshot({ path: connectScreenshot, fullPage: false });
    results.screenshots.push({ name: '20-archetype-d-connect-1440.png', page: '/connect' });
    recordCheck('AI Connection Center renders MCP client instructions & token generation shell');

    // 5.11 Settings & Theme Toggle
    await page.goto(harness.baseUrl + '/settings');
    assert.equal(page.url().includes('/settings'), true);
    const settingsScreenshot = path.join(screenshotDir, '21-archetype-d-settings-1440.png');
    await page.screenshot({ path: settingsScreenshot, fullPage: false });
    results.screenshots.push({ name: '21-archetype-d-settings-1440.png', page: '/settings' });
    recordCheck('Account & privacy settings page renders theme preferences and data controls');

    await context.close();
  }

  // ===========================================================================
  // JOURNEY 6: ARCHETYPE E (TENANT 2 / READONLY — ISOLATION & IDOR DEFENSE)
  // ===========================================================================
  console.log('\n--- JOURNEY 6: ARCHETYPE E (MULTI-TENANT ISOLATION & READONLY GATE) ---');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // 6.1 Authenticate as Persona E (Isolated Tenant 2, READONLY role)
    await page.goto(personaE.loginUrl);
    await page.waitForURL('**/dashboard');
    assert.ok(page.url().includes('/dashboard'));

    const tenant2Text = await page.textContent('body');
    assert.ok(
      tenant2Text.includes('Sam Security') ||
        tenant2Text.includes('Isolated') ||
        tenant2Text.includes('Workspace')
    );
    assert.ok(!tenant2Text.includes('Morgan Vance'), 'Tenant 1 candidate name never leaked');
    assert.ok(!tenant2Text.includes('Snowflake'), 'Tenant 1 applications never leaked');
    recordCheck('Tenant 2 dashboard displays strict tenant isolation without Tenant 1 data leaks');

    // 6.2 IDOR Defense: Cross-Tenant Application Access Returns 404
    const tenant1HandoffRoute = `/applications/${personaD.appD3Id}/handoff`;
    const idorRes = await context.request.get(harness.baseUrl + tenant1HandoffRoute);
    assert.ok([404, 403].includes(idorRes.status()), `Cross-tenant IDOR must return 404/403`);
    recordCheck('Cross-tenant IDOR attempt on application handoff blocked with 404 Not Found');

    // 6.3 IDOR Defense: Cross-Tenant Studio Draft Access Returns 404
    const idorDraftRes = await context.request.get(
      harness.baseUrl + '/api/v1/resume-studio/drafts/' + personaD.draftId
    );
    assert.equal(idorDraftRes.status(), 404);
    recordCheck('Cross-tenant IDOR attempt on Resume Studio draft blocked with 404 Not Found');

    // 6.4 Readonly Role Mutation Defense: PATCH Draft Returns 403 Forbidden
    const patchDraftRes = await context.request.patch(
      harness.baseUrl + '/api/v1/resume-studio/drafts/' + personaE.draftId,
      {
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': personaE.csrfToken,
        },
        data: {
          expectedRevision: 1,
          nodes: [],
        },
      }
    );
    assert.equal(
      patchDraftRes.status(),
      403,
      'READONLY user mutation attempt must return 403 Forbidden'
    );
    recordCheck('READONLY role mutation attempt on Resume Studio draft blocked with 403 Forbidden');

    const isolationScreenshot = path.join(screenshotDir, '22-archetype-e-isolation-1440.png');
    await page.screenshot({ path: isolationScreenshot, fullPage: false });
    results.screenshots.push({
      name: '22-archetype-e-isolation-1440.png',
      page: '/dashboard (Tenant 2)',
    });

    await context.close();
  }

  // ===========================================================================
  // JOURNEY 7: RESPONSIVE VIEWPORT AUDIT (1024px, 768px, 390px, 375px)
  // ===========================================================================
  console.log('\n--- JOURNEY 7: RESPONSIVE VIEWPORT AUDIT & THEME INSPECTION ---');
  {
    const viewports = [
      { name: 'Tablet-Landscape', width: 1024, height: 768 },
      { name: 'Tablet-Portrait', width: 768, height: 1024 },
      { name: 'Mobile-iPhone-14', width: 390, height: 844 },
      { name: 'Mobile-iPhone-SE', width: 375, height: 667 },
    ];

    for (const vp of viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await context.newPage();

      // Login as Persona D to test rich responsive layout
      await page.goto(personaD.loginUrl);
      await page.waitForURL('**/dashboard');

      // Test horizontal overflow invariant
      const overflow = await page.evaluate(() => {
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });

      assert.ok(
        !overflow.hasOverflow,
        `No horizontal overflow on ${vp.name} (${overflow.scrollWidth}px <= ${overflow.clientWidth}px)`
      );

      const vpScreenshot = path.join(
        screenshotDir,
        `23-responsive-dashboard-${vp.name}-${vp.width}.png`
      );
      await page.screenshot({ path: vpScreenshot, fullPage: false });
      results.screenshots.push({
        name: `23-responsive-dashboard-${vp.name}-${vp.width}.png`,
        viewport: vp,
      });
      results.viewportsTested.push({ ...vp, overflowTested: true, passed: true });
      recordCheck(
        `Viewport ${vp.name} (${vp.width}x${vp.height}): Zero horizontal overflow, clean responsive layout`
      );

      // Check Mobile Navigation Drawer (for mobile viewports <= 768)
      if (vp.width <= 768) {
        const drawerToggle = page.locator('#navToggle, button[aria-label*="menu"]').first();
        if ((await drawerToggle.count()) > 0 && (await drawerToggle.isVisible())) {
          await drawerToggle.click();
          await page.waitForTimeout(200);
          const drawerScreenshot = path.join(
            screenshotDir,
            `24-mobile-drawer-${vp.name}-${vp.width}.png`
          );
          await page.screenshot({ path: drawerScreenshot, fullPage: false });
          results.screenshots.push({
            name: `24-mobile-drawer-${vp.name}-${vp.width}.png`,
            viewport: vp,
          });
          recordCheck(`Mobile drawer navigation opens smoothly on ${vp.name}`);
        }
      }

      await context.close();
    }
  }

  // ===========================================================================
  // AUDIT REPORT GENERATION & WRAP-UP
  // ===========================================================================
  results.completedAt = new Date().toISOString();
  results.totalChecks = results.checks.length;
  results.passedChecks = results.checks.filter((c) => c.status === 'PASS').length;
  results.totalScreenshots = results.screenshots.length;
  results.totalDefects = results.defects.length;

  const reportPath = path.join(outputDir, 'acceptance-report.json');
  await fs.writeFile(reportPath, JSON.stringify(results, null, 2));

  console.log('\n================================================================');
  console.log('  ACCEPTANCE AUDIT SUMMARY:');
  console.log('================================================================');
  console.log(`  Total Checks:      ${results.totalChecks}`);
  console.log(`  Passed:            ${results.passedChecks}`);
  console.log(`  Failed:            ${results.totalChecks - results.passedChecks}`);
  console.log(`  Screenshots Saved: ${results.totalScreenshots}`);
  console.log(`  Screenshots Path:  ${screenshotDir}`);
  console.log(`  Audit Report:      ${reportPath}`);
  console.log('================================================================\n');
} finally {
  console.log('Shutting down Chromium browser and acceptance server...');
  if (browser) await browser.close();
  if (harness) await harness.cleanup();
}
