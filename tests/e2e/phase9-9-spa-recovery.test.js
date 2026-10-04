/**
 * @file Phase 9.9 — Dynamic DOM / SPA Recovery E2E Suite.
 *
 * Verifies dynamic DOM updates, framework re-renders, and SPA navigation in real Chromium:
 * 1. React / Vue / Angular full virtual DOM re-renders without stale element reference errors.
 * 2. history.pushState route navigation interception and dynamic form mounting.
 * 3. Multi-step forward / backward navigation (popstate / history.back()) with form schema recovery.
 * 4. refreshFormSchema() / REFRESH_FORM_SCHEMA message contract parity.
 * 5. Strict invariant: Final submission is NEVER clicked during dynamic recovery.
 */

import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const CFT_PATH = path.resolve('chrome/win64-152.0.7977.82/chrome-win64/chrome.exe');
const SYSTEM_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CHROME_PATH = fs.existsSync(CFT_PATH) ? CFT_PATH : SYSTEM_CHROME;
const EXTENSION_DIR = path.resolve('extension');

describe('Phase 9.9 — Dynamic DOM / SPA Recovery (Real Browser E2E)', () => {
  let server;
  let serverPort;
  let serverBaseUrl;
  let cdpPort;
  let profileDir;
  let chromeProcess;
  let browser;
  let context;
  let extensionId;
  let formPage;
  let sidebarPage;

  const candidateProfile = {
    firstName: 'Jordan',
    lastName: 'Lee',
    fullName: 'Jordan Lee',
    email: 'jordan.lee@example.com',
    phone: '+1-555-8765',
    workAuthorization: true,
    linkedinUrl: 'https://linkedin.com/in/jordanlee',
    currentCompany: 'Quantum Software',
  };

  async function sendTabMessage(type, payload = {}) {
    return await sidebarPage.evaluate(
      async ({ type, payload }) => {
        const tabs = await chrome.tabs.query({});
        const appTab = tabs.find((t) => t.url && t.url.includes('127.0.0.1'));
        if (!appTab) return { success: false, error: 'App tab not found' };
        return new Promise((resolve) => {
          chrome.tabs.sendMessage(appTab.id, { type, ...payload }, (res) => {
            resolve(res);
          });
        });
      },
      { type, payload }
    );
  }

  before(async () => {
    // 1. Start local SPA test server
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Careers Portal SPA - Acme Tech</title>
          <meta name="portal" content="generic" />
          <style>
            body { font-family: sans-serif; padding: 20px; }
            .step-indicator { font-weight: bold; margin-bottom: 12px; }
          </style>
        </head>
        <body>
          <div id="spa-root">
            <header>
              <h1 id="page-title">Senior Platform Engineer</h1>
              <nav id="spa-nav">
                <button id="view-job-btn" onclick="navigateTo('/jobs/platform-engineer')">Job Overview</button>
                <button id="apply-btn" onclick="navigateTo('/jobs/platform-engineer/apply')">Apply Now</button>
              </nav>
            </header>

            <main id="app-view">
              <div id="job-overview-view">
                <p>We are seeking a Senior Platform Engineer to build scalable cloud infrastructure.</p>
              </div>
            </main>
          </div>

          <script>
            window.__spaState = {
              currentRoute: '/jobs/platform-engineer',
              step: 1,
              renderCount: 0,
              submitted: false,
            };

            function navigateTo(url) {
              window.history.pushState({}, '', url);
              renderRoute(url);
            }

            window.addEventListener('popstate', () => {
              renderRoute(window.location.pathname);
            });

            function renderRoute(pathname) {
              window.__spaState.currentRoute = pathname;
              const view = document.getElementById('app-view');

              if (pathname.includes('/apply/step-2')) {
                renderStep2(view);
              } else if (pathname.includes('/apply')) {
                renderStep1(view);
              } else {
                renderOverview(view);
              }
            }

            function renderOverview(container) {
              container.innerHTML = '<div id="job-overview-view"><p>We are seeking a Senior Platform Engineer.</p></div>';
            }

            function renderStep1(container) {
              window.__spaState.step = 1;
              window.__spaState.renderCount++;
              container.innerHTML = \`
                <div id="form-container" data-render-id="\${window.__spaState.renderCount}">
                  <div class="step-indicator">Step 1 of 2: Personal Information</div>
                  <form id="application-form" onsubmit="event.preventDefault(); window.__spaState.submitted = true;">
                    <div>
                      <label for="first_name">First Name</label>
                      <input type="text" id="first_name" name="first_name" required />
                    </div>
                    <div>
                      <label for="last_name">Last Name</label>
                      <input type="text" id="last_name" name="last_name" required />
                    </div>
                    <div>
                      <label for="email">Email Address</label>
                      <input type="email" id="email" name="email" required />
                    </div>
                    <div>
                      <label for="phone">Phone Number</label>
                      <input type="tel" id="phone" name="phone" />
                    </div>
                    <div>
                      <label for="company">Current Company</label>
                      <input type="text" id="company" name="company" />
                    </div>
                    <button type="button" id="next-step-btn" onclick="navigateTo('/jobs/platform-engineer/apply/step-2')">Next Step</button>
                    <button type="submit" id="submit-btn">Submit Application</button>
                  </form>
                </div>
              \`;
            }

            function renderStep2(container) {
              window.__spaState.step = 2;
              window.__spaState.renderCount++;
              container.innerHTML = \`
                <div id="form-container" data-render-id="\${window.__spaState.renderCount}">
                  <div class="step-indicator">Step 2 of 2: Work Eligibility & Profile</div>
                  <form id="application-form" onsubmit="event.preventDefault(); window.__spaState.submitted = true;">
                    <div>
                      <label for="work_authorization">Are you legally authorized to work in the country?</label>
                      <select id="work_authorization" name="work_authorization">
                        <option value="">Select...</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>
                    <div>
                      <label for="linkedin_url">LinkedIn URL</label>
                      <input type="url" id="linkedin_url" name="linkedin_url" />
                    </div>
                    <div>
                      <label for="notes">Additional Information</label>
                      <textarea id="notes" name="notes"></textarea>
                    </div>
                    <button type="button" id="back-step-btn" onclick="window.history.back()">Back</button>
                    <button type="submit" id="final-submit-btn">Submit Application</button>
                  </form>
                </div>
              \`;
            }

            window.simulateFrameworkRerender = function() {
              const view = document.getElementById('app-view');
              if (window.__spaState.currentRoute.includes('/apply/step-2')) {
                renderStep2(view);
              } else if (window.__spaState.currentRoute.includes('/apply')) {
                renderStep1(view);
              }
            };
          </script>
        </body>
        </html>
      `);
    });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        serverBaseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });

    // 2. Launch Chrome with unpacked extension using identical flags from phase9-2
    cdpPort = 9400 + Math.floor(Math.random() * 500);
    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-spa-recovery-'));

    chromeProcess = spawn(
      CHROME_PATH,
      [
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profileDir}`,
        `--load-extension=${EXTENSION_DIR}`,
        `--disable-extensions-except=${EXTENSION_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
        'about:blank',
      ],
      { stdio: 'ignore' }
    );

    // Wait for CDP endpoint
    let connected = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
        if (res.ok) {
          connected = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(connected, 'CDP remote debugging port must be reachable');

    // Deterministic extension ID derived from extension manifest key
    const manifest = JSON.parse(
      fs.readFileSync(path.join(EXTENSION_DIR, 'manifest.json'), 'utf8')
    );
    const buf = Buffer.from(manifest.key, 'base64');
    const hash = crypto.createHash('sha256').update(buf).digest();
    extensionId = Array.from(hash.slice(0, 16))
      .map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 0x0f)))
      .join('');
    assert.ok(extensionId && extensionId.length === 32, 'Valid 32-char extension ID computed');

    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    context = browser.contexts()[0];

    // Open target page
    formPage = await context.newPage();
    await formPage.goto(`${serverBaseUrl}/jobs/platform-engineer`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1000));

    // Open extension sidebar
    sidebarPage = await context.newPage();
    await sidebarPage.goto(`chrome-extension://${extensionId}/sidebar/sidebar.html`);
    await new Promise((r) => setTimeout(r, 500));
  });

  after(async () => {
    if (sidebarPage) {
      await sidebarPage.close().catch(() => {});
    }
    if (formPage) {
      await formPage.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (chromeProcess) {
      chromeProcess.kill();
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    setTimeout(() => {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5 });
      } catch {}
    }, 1000);
  });

  it('TEST 1 — SPA history.pushState route navigation triggers form detection and schema extraction', async () => {
    // 1. Initially on Overview: No form present
    const initialFormState = await sendTabMessage('REFRESH_FORM_SCHEMA');
    assert.strictEqual(initialFormState.success, true);
    assert.strictEqual(initialFormState.hasForm, false, 'No form on job overview route');

    // 2. SPA client-side route transition via pushState: Click "Apply Now"
    await formPage.click('#apply-btn');
    await new Promise((r) => setTimeout(r, 600));

    const currentUrl = formPage.url();
    assert.ok(currentUrl.includes('/apply'), `URL must reflect client-side route: ${currentUrl}`);

    // 3. Send REFRESH_FORM_SCHEMA to detect mounted form
    const applyFormState = await sendTabMessage('REFRESH_FORM_SCHEMA');
    assert.strictEqual(applyFormState.success, true);
    assert.strictEqual(applyFormState.hasForm, true, 'Form must be detected on /apply route');
    assert.ok(Array.isArray(applyFormState.fields));

    const fieldNames = applyFormState.fields.map((f) => f.name || f.id);
    assert.ok(fieldNames.includes('first_name'), 'first_name must be extracted');
    assert.ok(fieldNames.includes('last_name'), 'last_name must be extracted');
    assert.ok(fieldNames.includes('email'), 'email must be extracted');
    assert.ok(fieldNames.includes('phone'), 'phone must be extracted');
    assert.ok(fieldNames.includes('company'), 'company must be extracted');
  });

  it('TEST 2 — React/Vue simulated complete DOM re-render does not cause stale element errors', async () => {
    // 1. Plan on DOM Render #1
    const planResult = await sendTabMessage('PLAN_FILL', {
      applicationPackage: { candidate: candidateProfile },
    });

    assert.strictEqual(planResult.success, true);
    assert.ok(planResult.plan);
    const plan = planResult.plan;

    // 2. Simulate complete framework virtual DOM destruction and recreation (React state update)
    const renderIds = await formPage.evaluate(() => {
      const beforeId = document.getElementById('form-container')?.getAttribute('data-render-id');
      window.simulateFrameworkRerender();
      const afterId = document.getElementById('form-container')?.getAttribute('data-render-id');
      return { beforeId, afterId };
    });

    assert.notStrictEqual(renderIds.beforeId, renderIds.afterId, 'DOM must have been completely torn down and recreated');

    // 3. Execute Autofill on the fresh DOM nodes
    const executeResult = await sendTabMessage('EXECUTE_FILL', { plan });

    assert.strictEqual(executeResult.success, true);
    assert.strictEqual(executeResult.finalSubmitBlocked, true, 'Safety invariant: Submit button is never clicked');

    // 4. Verify DOM values in the freshly re-rendered DOM
    const domValues = await formPage.evaluate(() => ({
      firstName: document.getElementById('first_name')?.value,
      lastName: document.getElementById('last_name')?.value,
      email: document.getElementById('email')?.value,
      phone: document.getElementById('phone')?.value,
      company: document.getElementById('company')?.value,
    }));

    assert.strictEqual(domValues.firstName, 'Jordan', 'First name filled cleanly in fresh DOM');
    assert.strictEqual(domValues.lastName, 'Lee', 'Last name filled cleanly in fresh DOM');
    assert.strictEqual(domValues.email, 'jordan.lee@example.com', 'Email filled cleanly in fresh DOM');
    assert.strictEqual(domValues.phone, '+1-555-8765', 'Phone filled cleanly in fresh DOM');
    assert.strictEqual(domValues.company, 'Quantum Software', 'Company filled cleanly in fresh DOM');

    // 5. Post-fill verification pass
    assert.strictEqual(executeResult.verificationResult.verified, true, 'Verification must pass on new DOM nodes');
  });

  it('TEST 3 — Multi-step SPA navigation: step 1 -> step 2 -> popstate back to step 1 recovers schema cleanly', async () => {
    // Advance to Step 2 via button click
    await formPage.click('#next-step-btn');
    await new Promise((r) => setTimeout(r, 600));

    assert.ok(formPage.url().includes('/apply/step-2'), 'URL should reflect Step 2');

    // Step 2 Form Schema Refresh
    const step2Schema = await sendTabMessage('REFRESH_FORM_SCHEMA');
    assert.strictEqual(step2Schema.success, true);
    assert.strictEqual(step2Schema.step, 2, 'Step number updated to 2');

    const step2Fields = step2Schema.fields.map((f) => f.name || f.id);
    assert.ok(step2Fields.includes('work_authorization'), 'Step 2 work_authorization detected');
    assert.ok(step2Fields.includes('linkedin_url'), 'Step 2 linkedin_url detected');
    assert.ok(step2Fields.includes('notes'), 'Step 2 notes detected');

    // Plan & Execute Step 2
    const step2PlanResult = await sendTabMessage('PLAN_FILL', {
      applicationPackage: { candidate: candidateProfile },
      sensitiveConfirmed: true,
    });
    assert.strictEqual(step2PlanResult.success, true);

    const step2Exec = await sendTabMessage('EXECUTE_FILL', {
      plan: step2PlanResult.plan,
      sensitiveConfirmed: true,
    });
    assert.strictEqual(step2Exec.success, true);

    const step2Values = await formPage.evaluate(() => ({
      workAuth: document.getElementById('work_authorization')?.value,
      linkedin: document.getElementById('linkedin_url')?.value,
    }));
    assert.strictEqual(step2Values.workAuth, 'yes');
    assert.strictEqual(step2Values.linkedin, 'https://linkedin.com/in/jordanlee');

    // Now trigger popstate back navigation (browser back button)
    await formPage.evaluate(() => window.history.back());
    await new Promise((r) => setTimeout(r, 600));

    // Must be back on Step 1
    assert.ok(formPage.url().includes('/apply'), 'URL is back on /apply');
    assert.ok(!formPage.url().includes('/step-2'), 'URL is not on step-2');

    // Refresh Form Schema for Step 1
    const step1RecoveredSchema = await sendTabMessage('REFRESH_FORM_SCHEMA');
    assert.strictEqual(step1RecoveredSchema.success, true);
    assert.strictEqual(step1RecoveredSchema.step, 1, 'Step number recovered to 1');

    const step1RecoveredFields = step1RecoveredSchema.fields.map((f) => f.name || f.id);
    assert.ok(step1RecoveredFields.includes('first_name'), 'first_name present after back navigation');
    assert.ok(step1RecoveredFields.includes('last_name'), 'last_name present after back navigation');
    assert.ok(step1RecoveredFields.includes('email'), 'email present after back navigation');
  });

  it('TEST 4 — Form submit action is NEVER triggered across any SPA lifecycle transitions', async () => {
    const submitted = await formPage.evaluate(() => window.__spaState.submitted);
    assert.strictEqual(submitted, false, 'Form must never be submitted automatically');
  });
});
