/** Audit observations, not release acceptance. No backend, database or employer calls. */
/* global Blob, document -- Browser globals inside Playwright page.evaluate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { SidebarController } from '../../extension/sidebar/sidebar.js';
import { genericAutofillEngine } from '../../extension/content/generic-autofill-engine.js';

test('effective form handler preserves durable workflow update and saves formData', async () => {
  const controller = new SidebarController();
  controller.cachedState = { workflowState: 'APPLICATION_READY' };
  let saved = 0;
  controller.store = { saveTabState: async () => saved++ };
  controller._renderFormCard = () => {};
  const form = { fields: [{ name: 'email', type: 'email' }] };
  await controller._handleFormDetectedEvent(form);
  assert.equal(controller.detectedFormData, form);
  assert.deepEqual(controller.cachedState.formData, form);
  assert.deepEqual(controller.cachedState.detectedFormFields, form.fields);
  assert.equal(saved, 1);
});

test('preview sees fields from effective form handler', async () => {
  const controller = new SidebarController();
  controller.cachedState = {};
  controller._renderFormCard = () => {};
  let output = '';
  controller._showAssistantResponse = (text) => {
    output = text;
  };
  controller.backendClient.getAutofillPlan = async () => ({
    mappedFields: [{ available: true, label: 'Email', value: 'a@b.com', source: 'profile' }],
    fillableCount: 1,
    sensitiveCount: 0,
  });
  await controller._handleFormDetectedEvent({ fields: [{ name: 'email', type: 'email' }] });
  await controller.handlePreviewAutofillPlan();
  assert.match(output, /Safe Autofill Plan/);
});

test('audit: confirmation never fabricates missing authorization and sponsorship answers', () => {
  const form = {
    fields: [
      {
        fieldId: 'work_auth',
        name: 'authorized_to_work',
        label: 'Work authorization',
        type: 'select',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
      },
      {
        fieldId: 'visa',
        name: 'requires_sponsorship',
        label: 'Visa sponsorship',
        type: 'select',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
      },
    ],
  };
  const unconfirmed = genericAutofillEngine.planFillSync(form, { candidate: {} });
  assert.ok(unconfirmed.actions.every((a) => a.action === 'REVIEW'));
  const confirmed = genericAutofillEngine.planFillSync(
    form,
    { candidate: {} },
    { allowProtected: true }
  );
  // Missing candidate data must remain REVIEW even with allowProtected
  assert.ok(confirmed.actions.every((a) => a.action === 'REVIEW'));
});

test('audit: prepare response metadata supplies no candidate autofill values', () => {
  // Public response shape traced at extension.routes.js:1171-1227, not a live backend call.
  const handoffResponse = {
    applicationId: 'fixture',
    packageHash: 'fixture',
    targetJob: { title: 'Engineer', company: 'Acme' },
    artifacts: { resume: { ready: true, downloadUrl: '/fixture' } },
  };
  const plan = genericAutofillEngine.planFillSync(
    { fields: [{ fieldId: 'email', name: 'email', label: 'Email', type: 'email' }] },
    handoffResponse
  );
  assert.equal(plan.actions[0].action, 'REVIEW');
  assert.equal(plan.actions[0].source, 'missing');
});

test('audit: destination binding fails closed on missing, mismatched, or altered destinations', () => {
  const controller = new SidebarController();

  // 1. Missing expected or active destination must fail closed
  assert.equal(controller._verifyDestinationBinding('', 'https://jobs.lever.co/acme/job-1'), false);
  assert.equal(controller._verifyDestinationBinding('https://jobs.lever.co/acme/job-1', ''), false);
  assert.equal(
    controller._verifyDestinationBinding(null, 'https://jobs.lever.co/acme/job-1'),
    false
  );
  assert.equal(
    controller._verifyDestinationBinding('https://jobs.lever.co/acme/job-1', null),
    false
  );
  assert.equal(controller._verifyDestinationBinding('', ''), false);

  // 2. Protocols must match
  assert.equal(
    controller._verifyDestinationBinding(
      'http://jobs.lever.co/acme/job-1',
      'https://jobs.lever.co/acme/job-1'
    ),
    false
  );

  // 3. Greenhouse query parameter job ID binding (token / gh_jid)
  assert.equal(
    controller._verifyDestinationBinding(
      'https://boards.greenhouse.io/embed/job_app?for=acme&token=99999',
      'https://boards.greenhouse.io/embed/job_app?for=acme&token=11111'
    ),
    false,
    'Different job tokens on same Greenhouse embed host must fail closed'
  );
  assert.equal(
    controller._verifyDestinationBinding(
      'https://boards.greenhouse.io/embed/job_app?for=acme&token=11111',
      'https://boards.greenhouse.io/embed/job_app?for=acme&token=11111'
    ),
    true
  );

  // 4. Lever same host, different employer slug in path
  assert.equal(
    controller._verifyDestinationBinding(
      'https://jobs.lever.co/evilcorp/job-1',
      'https://jobs.lever.co/acme/job-1'
    ),
    false,
    'Different employer slug on same Lever host must fail closed'
  );

  // 5. Lever same host, same employer, different job ID
  assert.equal(
    controller._verifyDestinationBinding(
      'https://jobs.lever.co/acme/job-B/apply',
      'https://jobs.lever.co/acme/job-A'
    ),
    false
  );
  assert.equal(
    controller._verifyDestinationBinding(
      'https://jobs.lever.co/acme/job-A/apply',
      'https://jobs.lever.co/acme/job-A'
    ),
    true
  );

  // 6. Employer-specific ATS subdomains (e.g. *.myworkdayjobs.com, *.icims.com)
  assert.equal(
    controller._verifyDestinationBinding(
      'https://stripe.wd1.myworkdayjobs.com/careers/job/12345',
      'https://airbnb.wd1.myworkdayjobs.com/careers/job/12345'
    ),
    false,
    'Different employer subdomains on Workday must fail closed'
  );
  assert.equal(
    controller._verifyDestinationBinding(
      'https://stripe.wd1.myworkdayjobs.com/en-US/careers/job/12345',
      'https://stripe.wd1.myworkdayjobs.com/careers/job/12345'
    ),
    true,
    'Same employer Workday subdomain and same job ID must match'
  );

  // 7. Localhost: must NOT bypass canonical job identity or port checks
  assert.equal(
    controller._verifyDestinationBinding(
      'http://localhost:8080/jobs/101',
      'http://localhost:3000/jobs/101'
    ),
    false,
    'Different ports on localhost must fail closed'
  );
  assert.equal(
    controller._verifyDestinationBinding(
      'http://localhost:3000/jobs/202',
      'http://localhost:3000/jobs/101'
    ),
    false,
    'Different job IDs on localhost must fail closed'
  );
  assert.equal(
    controller._verifyDestinationBinding(
      'http://localhost:3000/jobs/101/apply',
      'http://localhost:3000/jobs/101'
    ),
    true,
    'Same job ID on localhost must pass'
  );

  // 8. Navigating to generic root career page when specific job was approved
  assert.equal(
    controller._verifyDestinationBinding(
      'https://boards.greenhouse.io/acme',
      'https://boards.greenhouse.io/acme/jobs/123'
    ),
    false,
    'Navigating to generic career page without job ID must fail closed'
  );
});

test('audit: handleAutofillForm fails closed on missing destination or incomplete package', async () => {
  const controller = new SidebarController();
  let formError = null;
  controller._showFormError = (msg) => {
    formError = msg;
  };
  controller.activeTabId = 1;

  // Case A: Missing tab URL or expected destination
  controller.cachedState = {
    handoffPackage: {
      destinationUrl: '',
      applicationPackage: { candidate: { email: 'test@example.com' }, packageHash: 'hash1' },
    },
  };
  globalThis.chrome = {
    tabs: {
      get: async () => ({ id: 1, url: '' }),
    },
  };

  await controller.handleAutofillForm();
  assert.match(formError, /Destination mismatch/);

  // Case B: Metadata-only package (no authoritative candidate)
  formError = null;
  controller.cachedState = {
    handoffPackage: {
      destinationUrl: 'https://jobs.lever.co/acme/job-1',
      applicationPackage: {
        applicationId: 'app-123',
        packageHash: 'pkg-hash',
        targetJob: { title: 'Backend' },
        candidate: null, // missing candidate
      },
    },
  };
  globalThis.chrome = {
    tabs: {
      get: async () => ({ id: 1, url: 'https://jobs.lever.co/acme/job-1' }),
    },
  };

  await controller.handleAutofillForm();
  assert.match(formError, /Authoritative application package required/);

  // Case C: Fallback package with empty candidate object
  formError = null;
  controller.cachedState.handoffPackage.applicationPackage.candidate = {};
  await controller.handleAutofillForm();
  assert.match(formError, /Authoritative application package required/);
});

test('audit: handleAutofillForm verifies tab destination immediately before DOM fill execution', async () => {
  const controller = new SidebarController();
  let formError = null;
  controller._showFormError = (msg) => {
    formError = msg;
  };
  controller.activeTabId = 1;

  controller.cachedState = {
    handoffPackage: {
      destinationUrl: 'https://jobs.lever.co/acme/job-1',
      applicationPackage: {
        candidate: { email: 'test@example.com', fullName: 'Candidate Name' },
        packageHash: 'pkg-hash',
      },
    },
  };

  let tabGetCall = 0;
  let executeFillSent = false;

  globalThis.chrome = {
    tabs: {
      get: async () => {
        tabGetCall++;
        if (tabGetCall === 1) {
          // Initial check passes
          return { id: 1, url: 'https://jobs.lever.co/acme/job-1' };
        }
        // Tab navigated away right before EXECUTE_FILL!
        return { id: 1, url: 'https://attacker.example.com/phish' };
      },
      sendMessage: (tabId, msg, cb) => {
        if (msg.type === 'GET_FORM_STATE') {
          return cb({ fields: [{ fieldId: 'email', name: 'email', type: 'email' }] });
        }
        if (msg.type === 'PLAN_FILL') {
          return cb({ success: true, plan: { actions: [], summary: { protectedCount: 0 } } });
        }
        if (msg.type === 'EXECUTE_FILL') {
          executeFillSent = true;
          return cb({ success: true, executionResult: { summary: { executed: 1 } } });
        }
      },
    },
    runtime: {},
  };

  await controller.handleAutofillForm();
  assert.match(formError, /Security check failed: Active tab navigated away/);
  assert.equal(executeFillSent, false, 'EXECUTE_FILL must NEVER be sent if tab navigated away');
});

test('audit: DownloadManager verifies artifact identity before initiating download', async () => {
  const { DownloadManager } = await import('../../extension/downloads/download-manager.js');

  let chromeDownloadCalled = false;
  globalThis.chrome = {
    downloads: {
      download: async () => {
        chromeDownloadCalled = true;
        return 42;
      },
    },
  };

  const fakeBackend = {
    getArtifactDownloadUrl: async (appId, type, hash) =>
      `https://backend.test/download/${appId}/${type}?h=${hash}`,
  };
  const manager = new DownloadManager(fakeBackend);

  // Mock verifyArtifactIdentity returning mismatch/unverified
  manager.verifyArtifactIdentity = async () => ({
    verified: false,
    reason: 'PACKAGE_HASH_MISMATCH',
  });

  await assert.rejects(async () => {
    await manager.downloadArtifact({
      applicationId: 'app-1',
      artifactType: 'resume',
      packageHash: 'expected-hash',
      filename: 'resume.pdf',
    });
  }, /Artifact identity verification failed before download: PACKAGE_HASH_MISMATCH/);

  assert.equal(
    chromeDownloadCalled,
    false,
    'chrome.downloads.download must not be initiated when artifact verification fails'
  );
});

test('audit: real browser DOM text fill succeeds; attachment execution is not upload; form never submitted', async (t) => {
  const { chromium } = await import('playwright');
  const executablePath =
    process.env.PRODUCT_AUDIT_CHROME || 'chrome/win64-152.0.7977.82/chrome-win64/chrome.exe';
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(
    '<form><input id="email" name="email" type="email"><input id="resume" name="resume" type="file"><button id="submit" type="submit">Submit</button></form>'
  );
  const engineSource = await fs.readFile(
    new URL('../../extension/content/generic-autofill-engine.js', import.meta.url),
    'utf8'
  );
  const result = await page.evaluate(async (source) => {
    const module = await import(
      URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    );
    let submits = 0;
    document.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      submits++;
    });
    const plan = {
      actions: [
        { fieldId: 'email', name: 'email', action: 'FILL', sanitizedValue: 'fixture@example.test' },
        { fieldId: 'resume', name: 'resume', action: 'UPLOAD', sanitizedValue: 'resume.pdf' },
      ],
    };
    const execution = module.genericAutofillEngine.executeFillSync(plan, { doc: document });
    const verification = module.genericAutofillEngine.verifyFillSync(plan, { doc: document });
    return {
      email: document.querySelector('#email').value,
      fileCount: document.querySelector('#resume').files.length,
      execution,
      verification,
      submits,
    };
  }, engineSource);
  assert.equal(result.email, 'fixture@example.test');
  assert.equal(result.fileCount, 0);
  assert.equal(result.submits, 0, 'Form submission must NEVER be triggered by autofill');
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.verifiedCount, 1);
  // Programmatic file input attachment is restricted by browser security; requires explicit manual upload
  assert.equal(result.execution.executedActions[1].status, 'NEEDS_MANUAL_UPLOAD');
  assert.equal(result.execution.executedActions[1].requiresUserReview, true);
});
