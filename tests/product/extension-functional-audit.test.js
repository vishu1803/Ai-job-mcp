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

test('audit: same host different job rejected by sidebar destination check', () => {
  const controller = new SidebarController();
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
});

test('audit: real browser DOM text fill succeeds; attachment execution is not upload', async (t) => {
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
  assert.equal(result.submits, 0);
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.verifiedCount, 1);
  // Programmatic file input attachment is restricted by browser security; requires explicit manual upload
  assert.equal(result.execution.executedActions[1].status, 'NEEDS_MANUAL_UPLOAD');
  assert.equal(result.execution.executedActions[1].requiresUserReview, true);
});
