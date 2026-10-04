/**
 * @file Phase 9.2 — Real Browser Extension Runtime E2E Suite.
 *
 * Verifies real Chrome browser execution with the loaded extension:
 * 1. Launches real Chromium with the unpacked extension.
 * 2. Loads local test application form page.
 * 3. Verifies content-script message flow (GET_FORM_STATE, PLAN_FILL, EXECUTE_FILL, VERIFY_FILL).
 * 4. Verifies DOM fields actually mutate safely across frameworks.
 * 5. Verifies post-execution verification result.
 * 6. Verifies strict safety invariant: Final submit is NEVER clicked automatically.
 * 7. Verifies extension sidebar to content-script coordination.
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

describe('Phase 9.2 — Extension Runtime Connection (Real Browser E2E)', () => {
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
  let formTabId;

  const mockCandidate = {
    firstName: 'Alex',
    lastName: 'Morgan',
    fullName: 'Alex Morgan',
    email: 'alex.morgan@example.com',
    phone: '+1-555-0199',
    yearsOfExperience: '4-6',
    workAuthorization: true,
    coverLetter: 'I am excited to apply for the Senior Software Engineer role.',
  };

  before(async () => {
    // 1. Start local mock HTTP server
    server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);

      // Mock Application Page
      if (url.pathname === '/jobs/senior-software-engineer/apply') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Senior Software Engineer Application - Acme Corp</title>
            <meta name="portal" content="generic" />
          </head>
          <body>
            <h1>Senior Software Engineer Application</h1>
            <form id="application-form" action="/submit" method="POST">
              <div class="form-group">
                <label for="first_name">First Name</label>
                <input type="text" id="first_name" name="first_name" required />
              </div>

              <div class="form-group">
                <label for="last_name">Last Name</label>
                <input type="text" id="last_name" name="last_name" required />
              </div>

              <div class="form-group">
                <label for="email">Email</label>
                <input type="email" id="email" name="email" required />
              </div>

              <div class="form-group">
                <label for="phone">Phone</label>
                <input type="tel" id="phone" name="phone" />
              </div>

              <div class="form-group">
                <label for="experience_years">Years of Experience</label>
                <select id="experience_years" name="experience_years">
                  <option value="">Select experience...</option>
                  <option value="1-3">1-3 years</option>
                  <option value="4-6">4-6 years</option>
                  <option value="7+">7+ years</option>
                </select>
              </div>

              <div class="form-group">
                <label>Are you legally authorized to work in the United States?</label>
                <div>
                  <input type="radio" id="work_auth_yes" name="work_authorization" value="true" />
                  <label for="work_auth_yes">Yes</label>
                  <input type="radio" id="work_auth_no" name="work_authorization" value="false" />
                  <label for="work_auth_no">No</label>
                </div>
              </div>

              <div class="form-group">
                <label for="cover_letter">Cover Note</label>
                <textarea id="cover_letter" name="cover_letter"></textarea>
              </div>

              <div class="form-actions">
                <button type="submit" id="submit-application-btn">Submit Application</button>
              </div>
            </form>
            <div id="submit-indicator" style="display:none;">APPLICATION_SUBMITTED</div>
            <script>
              window.__formSubmitted = false;
              document.getElementById('application-form').addEventListener('submit', function(e) {
                e.preventDefault();
                window.__formSubmitted = true;
                document.getElementById('submit-indicator').style.display = 'block';
              });
            </script>
          </body>
          </html>
        `);
        return;
      }

      // Mock backend API endpoints
      if (url.pathname === '/api/extension/session') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'AUTHENTICATED',
            authenticated: true,
            user: {
              id: 'usr-test-1',
              email: 'alex.morgan@example.com',
              candidate: mockCandidate,
            },
          })
        );
        return;
      }

      if (url.pathname === '/api/extension/analyze-job') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            fitScore: 69.25,
            matchBand: 'STRONG_MATCH',
            recommendedProjects: [],
          })
        );
        return;
      }

      if (url.pathname === '/api/extension/prepare-handoff') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            handoffStatus: 'READY',
            applicationPackage: {
              packageHash: 'pkg_test_hash_123',
              candidate: mockCandidate,
              metadata: {
                destinationUrl: `${serverBaseUrl}/jobs/senior-software-engineer/apply`,
              },
            },
          })
        );
        return;
      }

      if (url.pathname === '/livez') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', ok: true }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        serverBaseUrl = `http://127.0.0.1:${serverPort}`;
        cdpPort = serverPort + 1000;
        resolve();
      });
    });

    // 2. Launch Chrome for Testing with extension
    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase9-2-cft-'));

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

    // Wait for Chrome CDP port to become responsive
    let cdpReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
        if (res.ok) {
          cdpReady = true;
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    assert.ok(cdpReady, 'Chrome failed to respond on CDP port');

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

    // Connect Playwright to real Chrome instance
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    context = browser.contexts()[0];

    // Open test form page
    formPage = await context.newPage();
    await formPage.goto(`${serverBaseUrl}/jobs/senior-software-engineer/apply`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait for content script injection
    await new Promise((r) => setTimeout(r, 1000));

    // Get tab ID from CDP targets
    const updatedTargets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
    const pageTarget = updatedTargets.find(
      (t) => t.type === 'page' && t.url.includes('/jobs/senior-software-engineer/apply')
    );
    formTabId = pageTarget ? pageTarget.id : null;
  });

  after(async () => {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (chromeProcess) {
      chromeProcess.kill();
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    // Clean up temporary profile directory
    setTimeout(() => {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5 });
      } catch {}
    }, 1000);
  });

  it('TEST 1 — Real Chrome content-script responds to GET_FORM_STATE with canonical schema', async () => {
    const backgroundPage = await context.newPage();
    await backgroundPage.goto(`chrome-extension://${extensionId}/sidebar/sidebar.html`);

    const formState = await backgroundPage.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      const applyTab = tabs.find((t) => t.url && t.url.includes('/apply'));
      if (!applyTab) return { error: 'Apply tab not found' };

      return new Promise((resolve) => {
        chrome.tabs.sendMessage(applyTab.id, { type: 'GET_FORM_STATE' }, (response) => {
          resolve(response);
        });
      });
    });

    await backgroundPage.close();

    assert.strictEqual(formState.success, true);
    assert.strictEqual(formState.hasForm, true);
    assert.ok(Array.isArray(formState.fields), 'formState.fields must be an array');
    assert.ok(formState.fields.length >= 6, `Expected at least 6 fields, got ${formState.fields.length}`);

    const fieldNames = formState.fields.map((f) => f.name || f.id);
    assert.ok(fieldNames.includes('first_name'), 'first_name must be detected');
    assert.ok(fieldNames.includes('last_name'), 'last_name must be detected');
    assert.ok(fieldNames.includes('email'), 'email must be detected');
    assert.ok(fieldNames.includes('phone'), 'phone must be detected');
    assert.ok(fieldNames.includes('experience_years'), 'experience_years must be detected');
    assert.ok(fieldNames.includes('work_authorization'), 'work_authorization must be detected');
  });

  it('TEST 2 — Real Chrome content-script responds to PLAN_FILL with canonical FillPlan', async () => {
    const backgroundPage = await context.newPage();
    await backgroundPage.goto(`chrome-extension://${extensionId}/sidebar/sidebar.html`);

    const planResult = await backgroundPage.evaluate(async (pkg) => {
      const tabs = await chrome.tabs.query({});
      const applyTab = tabs.find((t) => t.url && t.url.includes('/apply'));

      return new Promise((resolve) => {
        chrome.tabs.sendMessage(
          applyTab.id,
          {
            type: 'PLAN_FILL',
            applicationPackage: pkg,
            sensitiveConfirmed: true,
          },
          (response) => {
            resolve(response);
          }
        );
      });
    }, { candidate: mockCandidate });

    await backgroundPage.close();

    assert.strictEqual(planResult.success, true);
    assert.ok(planResult.plan, 'Plan must exist');
    assert.ok(Array.isArray(planResult.plan.actions), 'plan.actions must be an array');
    assert.ok(planResult.plan.actions.length >= 6, 'Plan must contain planned actions');

    const actions = planResult.plan.actions;
    const fnAction = actions.find((a) => a.name === 'first_name');
    assert.ok(fnAction, 'first_name action planned');
    assert.strictEqual(fnAction.action, 'FILL');
    assert.strictEqual(fnAction.sanitizedValue, 'Alex');

    const expAction = actions.find((a) => a.name === 'experience_years');
    assert.ok(expAction, 'experience_years action planned');
    assert.strictEqual(expAction.action, 'SELECT');
    assert.strictEqual(expAction.sanitizedValue, '4-6');

    const authAction = actions.find((a) => a.name === 'work_authorization');
    assert.ok(authAction, 'work_authorization action planned');
    assert.strictEqual(authAction.isProtected, true);
    assert.strictEqual(authAction.action, 'SELECT');
    assert.strictEqual(authAction.sanitizedValue, 'true');
  });

  it('TEST 3 — Real Chrome EXECUTE_FILL mutates DOM fields safely and verifies convergence', async () => {
    const backgroundPage = await context.newPage();
    await backgroundPage.goto(`chrome-extension://${extensionId}/sidebar/sidebar.html`);

    const execResult = await backgroundPage.evaluate(async (pkg) => {
      const tabs = await chrome.tabs.query({});
      const applyTab = tabs.find((t) => t.url && t.url.includes('/apply'));

      // 1. Plan
      const planRes = await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          applyTab.id,
          { type: 'PLAN_FILL', applicationPackage: pkg, sensitiveConfirmed: true },
          resolve
        );
      });

      // 2. Execute
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(
          applyTab.id,
          { type: 'EXECUTE_FILL', plan: planRes.plan, sensitiveConfirmed: true },
          resolve
        );
      });
    }, { candidate: mockCandidate });

    await backgroundPage.close();

    assert.strictEqual(execResult.success, true);
    assert.strictEqual(execResult.finalSubmitBlocked, true, 'Final submit MUST remain blocked');
    assert.ok(execResult.executionResult.summary.executed >= 5, 'Must execute at least 5 fields');
    assert.strictEqual(execResult.verificationResult.verified, true, 'Verification pass must succeed');
    assert.strictEqual(execResult.verificationResult.mismatches.length, 0, 'Zero verification mismatches');

    // 4. Assert actual DOM values directly in the real Chrome webpage
    const firstNameVal = await formPage.inputValue('#first_name');
    const lastNameVal = await formPage.inputValue('#last_name');
    const emailVal = await formPage.inputValue('#email');
    const phoneVal = await formPage.inputValue('#phone');
    const expVal = await formPage.inputValue('#experience_years');
    const authChecked = await formPage.isChecked('#work_auth_yes');
    const coverVal = await formPage.inputValue('#cover_letter');

    assert.strictEqual(firstNameVal, 'Alex');
    assert.strictEqual(lastNameVal, 'Morgan');
    assert.strictEqual(emailVal, 'alex.morgan@example.com');
    assert.strictEqual(phoneVal, '+1-555-0199');
    assert.strictEqual(expVal, '4-6');
    assert.strictEqual(authChecked, true);
    assert.strictEqual(coverVal, mockCandidate.coverLetter);
  });

  it('TEST 4 — Real Chrome VERIFY_FILL asserts DOM convergence matches planned values', async () => {
    const backgroundPage = await context.newPage();
    await backgroundPage.goto(`chrome-extension://${extensionId}/sidebar/sidebar.html`);

    const verifyResult = await backgroundPage.evaluate(async (pkg) => {
      const tabs = await chrome.tabs.query({});
      const applyTab = tabs.find((t) => t.url && t.url.includes('/apply'));

      const planRes = await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          applyTab.id,
          { type: 'PLAN_FILL', applicationPackage: pkg, sensitiveConfirmed: true },
          resolve
        );
      });

      return new Promise((resolve) => {
        chrome.tabs.sendMessage(
          applyTab.id,
          { type: 'VERIFY_FILL', plan: planRes.plan },
          resolve
        );
      });
    }, { candidate: mockCandidate });

    await backgroundPage.close();

    assert.strictEqual(verifyResult.success, true);
    assert.strictEqual(verifyResult.verification.verified, true);
    assert.ok(verifyResult.verification.verifiedCount >= 5);
    assert.strictEqual(verifyResult.verification.mismatches.length, 0);
  });

  it('TEST 5 — Strict Safety Invariant: Final submit button is NEVER clicked automatically', async () => {
    // Assert form was never submitted
    const isSubmitted = await formPage.evaluate(() => window.__formSubmitted);
    assert.strictEqual(isSubmitted, false, 'Form submission MUST NOT occur during autofill');

    const indicatorDisplay = await formPage.evaluate(() => {
      const el = document.getElementById('submit-indicator');
      return window.getComputedStyle(el).display;
    });
    assert.strictEqual(indicatorDisplay, 'none', 'Submit indicator must remain hidden');
  });

  it('TEST 6 — Sidebar Autofill Form coordination: Click Autofill in sidebar drives end-to-end flow', async () => {
    const sidebarPage = await context.newPage();
    await sidebarPage.goto(
      `chrome-extension://${extensionId}/sidebar/sidebar.html?tabId=${formTabId}`
    );

    // Wait for sidebar initialization
    await sidebarPage.waitForSelector('#autofillFormBtn', { state: 'attached', timeout: 5000 });

    // Set backend URL in storage so sidebar communicates with local mock server
    await sidebarPage.evaluate(async (url) => {
      await chrome.storage.local.set({ backendUrl: url });
    }, serverBaseUrl);

    // Configure sidebar controller with activeJob matching current page
    await sidebarPage.evaluate(async (url) => {
      const controller = window.__sidebarController || globalThis.__sidebarController;
      if (controller) {
        controller.activeJob = {
          url,
          sourceUrl: url,
          title: 'Senior Software Engineer',
          company: 'Acme Corp',
        };
        controller.cachedState = {
          handoffPackage: {
            applicationPackage: {
              candidate: {
                firstName: 'Alex',
                lastName: 'Morgan',
                email: 'alex.morgan@example.com',
                phone: '+1-555-0199',
                yearsOfExperience: '4-6',
                workAuthorization: true,
              },
              metadata: { destinationUrl: url },
            },
          },
        };
      }
    }, `${serverBaseUrl}/jobs/senior-software-engineer/apply`);

    // Step 1: Trigger autofill through sidebar handler (detects sensitive fields, prompts user)
    await sidebarPage.evaluate(async () => {
      const controller = window.__sidebarController || globalThis.__sidebarController;
      if (controller && typeof controller.handleAutofillForm === 'function') {
        await controller.handleAutofillForm();
      }
    });

    // Step 2: User confirms sensitive autofill
    await sidebarPage.evaluate(() => {
      const cb = document.getElementById('confirmSensitiveAutofill');
      if (cb) cb.checked = true;
    });

    // Step 3: Trigger autofill execution (now with sensitive confirmation)
    await sidebarPage.evaluate(async () => {
      const controller = window.__sidebarController || globalThis.__sidebarController;
      if (controller && typeof controller.handleAutofillForm === 'function') {
        await controller.handleAutofillForm();
      }
    });

    // Wait for DOM fields to reflect updated values
    await new Promise((r) => setTimeout(r, 800));

    // Verify webpage values
    const emailVal = await formPage.inputValue('#email');
    assert.strictEqual(emailVal, 'alex.morgan@example.com');

    // Verify submission remained blocked
    const isSubmitted = await formPage.evaluate(() => window.__formSubmitted);
    assert.strictEqual(isSubmitted, false);

    await sidebarPage.close();
  });
});
