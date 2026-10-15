/** Browser proof against the already running isolated visual server; no API mocks. */
/* global scrollTo, innerWidth */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const runtime = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const origin = new URL(runtime.baseUrl);
assert.equal(origin.hostname, '127.0.0.1');
assert.ok(Number(origin.port) >= 4317 && Number(origin.port) <= 4327);
const output = fileURLToPath(
  new URL('../output/resume-studio/visual-local-' + Date.now() + '/', import.meta.url)
);
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const checks = [];
try {
  const unauth = await context.request.get(runtime.studioUrl, { maxRedirects: 0 });
  assert.equal(unauth.status(), 302);
  await page.goto(runtime.loginUrl);
  await page.locator('#structuredEditorContainer textarea.rs-edit-input').first().waitFor();
  assert.ok(page.url().includes('/resume-studio?draftId='));
  checks.push(
    'Existing development fixture login creates a real session; unauthenticated Studio redirects'
  );
  for (const file of [
    'css/resume-studio.css',
    'js/resume-studio.client.js',
    'js/resume-studio-documents.client.js',
    'js/resume-studio-state.js',
  ]) {
    const response = await context.request.get(runtime.baseUrl + '/public/' + file);
    assert.equal(response.status(), 200);
    assert.deepEqual(
      await response.body(),
      await fs.readFile(new URL('../public/' + file, import.meta.url))
    );
  }
  checks.push('All Studio assets served byte-identically from the integrated worktree');
  const endpoint = runtime.baseUrl + '/api/v1/resume-studio/drafts/' + runtime.draftId;
  const readDraft = async () => (await (await context.request.get(endpoint)).json()).data;
  await page.locator('#rsJobDetails > summary').click();
  const analysis = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/analyze')
  );
  await page.locator('#btnRunAnalysis').click();
  assert.equal((await analysis).status(), 200);
  assert.notEqual(await page.locator('#valFitScore').textContent(), '—');
  await page.locator('#rsJobDetails > summary').click();
  checks.push('Job analysis and actual diagnostics are available over authenticated CSRF HTTP');
  const draft = await readDraft();
  const node = draft.nodes.filter((n) => n.kind === 'BULLET' && n.path[0] === 'experience')[1];
  const text = 'Documented PostgreSQL query behavior for application documentation.';
  const field = page.locator('.rs-edit-input[data-node-id="' + node.nodeId + '"]');
  const ack = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url() === endpoint);
  await field.fill(text);
  assert.equal((await ack).status(), 200);
  await page.waitForFunction(
    () => document.getElementById('rsSaveStatusText').textContent === 'All changes saved'
  );
  await page.reload();
  await field.waitFor();
  assert.equal(await field.inputValue(), text);
  assert.equal((await readDraft()).revision, draft.revision + 1);
  checks.push('Structured editing autosaves a new revision and survives browser reload');
  const generation = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/proposals')
  );
  await page.locator('.rs-btn-propose').first().click();
  assert.equal((await generation).status(), 201);
  await page.locator('.rs-btn-accept-proposal').first().waitFor();
  assert.equal(await page.locator('.rs-btn-accept-proposal').first().isDisabled(), false);
  assert.equal(await page.locator('.rs-btn-reject-proposal').first().isDisabled(), false);
  await page.locator('.rs-inspect-proposal-source').first().click();
  assert.ok(
    (await page.locator('#evidenceItemsContainer').textContent()).includes(
      'not independently verified'
    )
  );
  await page.screenshot({ path: path.join(output, 'evidence.png') });
  await page.keyboard.press('Escape');
  await page.locator('.rs-proposal-card').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'proposal.png') });
  checks.push(
    'Source-grounded synthetic provider proposal, evidence and explicit accept/reject controls visible; no suggestion applied'
  );
  await page.locator('#tabDocumentPreview').click();
  await page.waitForFunction(
    () => !document.getElementById('btnExportPdf').disabled,
    {},
    { timeout: 60000 }
  );
  const document = (await (await context.request.get(endpoint + '/document')).json()).data;
  assert.equal(document.revision, (await readDraft()).revision);
  assert.equal(document.verification.pageCount, 1);
  assert.equal(document.verification.a4, true);
  assert.deepEqual(document.verification.failedChecks, []);
  assert.ok(await page.locator('#rsDocumentPreview img').count());
  assert.equal(await page.locator('#btnExportDocx').isDisabled(), false);
  assert.equal(await page.locator('#rsApprovalReviewed').isDisabled(), false);
  assert.equal(await page.locator('#btnApprovePackage').isDisabled(), true);
  checks.push(
    'Exact compiled one-A4-page PDF and PDF/DOCX export controls ready; approval requires explicit review'
  );
  await page.locator('#rsHistory > summary').click();
  await page.locator('#rsHistoryList button').first().waitFor();
  assert.ok((await page.locator('#rsHistoryList button').count()) >= 2);
  await page.locator('#rsHistory > summary').click();
  checks.push('Persisted version history is available');
  await page.evaluate(() => scrollTo(0, 0));
  const before = await page.locator('#studioLeftPane').boundingBox();
  const divider = await page.locator('#studioDivider').boundingBox();
  await page.mouse.move(divider.x + divider.width / 2, 400);
  await page.mouse.down();
  await page.mouse.move(divider.x + 70, 400, { steps: 8 });
  await page.mouse.up();
  assert.ok((await page.locator('#studioLeftPane').boundingBox()).width > before.width + 30);
  await page.locator('#studioLeftPane').evaluate((el) => el.style.removeProperty('width'));
  checks.push('Existing split-pane divider actually resizes the editor/preview');
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['laptop', 1280, 900],
    ['tablet', 1024, 900],
    ['mobile', 375, 812],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('#tabDocumentPreview').click();
    await page.evaluate(() => scrollTo(0, 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const visible = await page.locator('body').innerText();
    assert.doesNotMatch(visible, /Slice\s*[123]|REVIEW STATES:|Prototype|Debug controls/i);
    await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
    await page.screenshot({ path: path.join(output, name + '-viewport.png') });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#btnOpenDiagnostics').click();
  await page.screenshot({ path: path.join(output, 'diagnostics.png') });
  await page.keyboard.press('Escape');
  checks.push(
    'Four responsive viewports, neutral editorial interface and diagnostic drawer; no prototype/slice/debug labels'
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(output, 'verification.json'),
    JSON.stringify(
      {
        status: 'PASS',
        checks,
        baseUrl: runtime.baseUrl,
        worktree: runtime.worktree,
        provider: runtime.provider,
        documentVerification: document.verification,
        screenshots: output,
        browserErrors: errors,
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ status: 'PASS', checks: checks.length, screenshots: output }));
} finally {
  await browser.close();
}
