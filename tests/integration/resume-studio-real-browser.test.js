/** Real TCP Fastify + disposable PostgreSQL + Chromium. No API response mocks. */
/* global document, innerWidth, getComputedStyle */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { sql } from 'drizzle-orm';
import { startStudioHarness, studioJobTarget } from '../helpers/resume-studio-harness.js';

let h, browser, context, page, draftId, firstNode, secondNode;
const output = new URL('../../output/resume-studio/screenshots/', import.meta.url);
const failures = [];
const api = async () => {
  const response = await h.request('GET', '/drafts/' + draftId);
  assert.equal(response.status, 200);
  return (await response.json()).data;
};
const saved = async (target = page) => {
  await target.waitForFunction(
    () => document.getElementById('rsSaveStatusText')?.textContent === 'All changes saved'
  );
};
const input = (target, id) => target.locator('.rs-edit-input[data-node-id="' + id + '"]');
const edit = async (target, id, text) => {
  const response = target.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().endsWith('/drafts/' + draftId)
  );
  await input(target, id).fill(text);
  assert.equal((await response).status(), 200);
  await saved(target);
};
before(async () => {
  h = await startStudioHarness();
  await fs.mkdir(output, { recursive: true });
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([
    { name: 'career_hub_session', value: h.sessions[0].rawToken, url: h.baseUrl },
  ]);
  context.on('page', (p) => p.on('pageerror', (error) => failures.push(error.message)));
  page = await context.newPage();
  await page.goto(h.baseUrl + '/resume-studio');
});
after(async () => {
  await browser?.close();
  await h?.close();
});

test('real session, CSRF, analysis and independent master-to-draft creation', async () => {
  await page.locator('#jobTitle').fill(studioJobTarget.title);
  await page.locator('#jobCompany').fill(studioJobTarget.company);
  await page.locator('#jobSourceUrl').fill(studioJobTarget.sourceUrl);
  await page.locator('#jobDescription').fill(studioJobTarget.rawDescription);
  const analysis = page.waitForResponse((r) => r.url().endsWith('/resume-studio/analyze'));
  await page.locator('#btnRunAnalysis').click();
  assert.equal((await analysis).status(), 200);
  await page.waitForFunction(
    () => document.getElementById('valFitScore').textContent.trim() !== '—'
  );
  const creation = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/resume-studio/drafts')
  );
  await page.locator('#btnCreateDraft').click();
  const response = await creation;
  assert.equal(response.status(), 201);
  const draft = (await response.json()).data;
  draftId = draft.id;
  [firstNode, secondNode] = draft.nodes.filter(
    (n) => n.kind === 'BULLET' && n.path[0] === 'experience'
  );
  await input(page, firstNode.nodeId).waitFor();
  assert.ok(page.url().includes(draftId));
  assert.equal(draft.sourceResumeId, h.people[0].resumeId);
});
test('autosave and browser refresh preserve candidate wording', async () => {
  await edit(page, secondNode.nodeId, 'Documented PostgreSQL query and index behavior.');
  await page.reload();
  await input(page, secondNode.nodeId).waitFor();
  assert.equal(
    await input(page, secondNode.nodeId).inputValue(),
    'Documented PostgreSQL query and index behavior.'
  );
});
test('include and exclude bullets, projects and skills persist as decisions', async () => {
  for (const selector of ['.rs-toggle-bullet', '.rs-toggle-proj', '.rs-toggle-skill']) {
    const checkbox = page.locator('#structuredEditorContainer ' + selector).first();
    const was = await checkbox.isChecked();
    const ack = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.url().endsWith('/drafts/' + draftId)
    );
    await checkbox.setChecked(!was);
    assert.equal((await ack).status(), 200);
    await saved();
    const restore = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.url().endsWith('/drafts/' + draftId)
    );
    await checkbox.setChecked(was);
    assert.equal((await restore).status(), 200);
    await saved();
  }
});
test('two tabs retain unrelated server edits during a reviewed merge', async () => {
  const other = await context.newPage();
  await other.goto(h.baseUrl + '/resume-studio?draftId=' + draftId);
  await input(other, firstNode.nodeId).waitFor();
  await edit(
    other,
    secondNode.nodeId,
    'Server tab documented PostgreSQL query and index behavior.'
  );
  const conflict = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().endsWith('/drafts/' + draftId)
  );
  await input(page, firstNode.nodeId).fill(
    'Implemented React views with the use of component interfaces in order to support internal workflows.'
  );
  // If identical to the source, the edit is still authoritative: expectedRevision is stale.
  assert.equal((await conflict).status(), 409);
  await page.locator('#rsConflictBanner.active').waitFor();
  await page.locator('#btnConflictReview').click();
  assert.equal(await page.locator('#rsConflictModalBody input[type=radio]').count(), 0);
  const merged = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().endsWith('/drafts/' + draftId)
  );
  await page.locator('#btnConflictModalApply').click();
  assert.equal((await merged).status(), 200);
  await saved();
  assert.equal(
    (await api()).structuredResume.experience[0].bullets[1],
    'Server tab documented PostgreSQL query and index behavior.'
  );
  await other.close();
});
test('same-field conflict requires an explicit choice and preserves the chosen wording', async () => {
  const other = await context.newPage();
  await other.goto(h.baseUrl + '/resume-studio?draftId=' + draftId);
  await input(other, secondNode.nodeId).waitFor();
  await edit(other, secondNode.nodeId, 'Other tab documented PostgreSQL query behavior.');
  const conflict = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().endsWith('/drafts/' + draftId)
  );
  await input(page, secondNode.nodeId).fill('My local PostgreSQL documentation wording.');
  assert.equal((await conflict).status(), 409);
  await page.locator('#btnConflictReview').click();
  assert.equal(await page.locator('#btnConflictModalApply').isDisabled(), true);
  assert.equal(await page.locator('#rsConflictModalBody input:checked').count(), 0);
  await page.locator('#rsConflictModalBody input[value=local]').check();
  const merged = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().endsWith('/drafts/' + draftId)
  );
  await page.locator('#btnConflictModalApply').click();
  assert.equal((await merged).status(), 200);
  await saved();
  assert.equal(
    (await api()).structuredResume.experience[0].bullets[1],
    'My local PostgreSQL documentation wording.'
  );
  await other.close();
});
test('candidate generates, inspects and rejects a grounded proposal without editing the draft', async () => {
  const revision = (await api()).revision;
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/proposals')
  );
  await page.locator('.rs-btn-propose[data-bullet-node-id="' + firstNode.nodeId + '"]').click();
  assert.equal((await response).status(), 201);
  await page.locator('.rs-btn-reject-proposal').first().waitFor();
  assert.ok(
    (await page.locator('.rs-proposal-evidence').first().textContent()).includes('CLAIMED')
  );
  await page.locator('.rs-inspect-proposal-source').first().click();
  assert.ok(
    (await page.locator('#evidenceItemsContainer').textContent()).includes(
      'not independently verified'
    )
  );
  await page.keyboard.press('Escape');
  const decision = page.waitForResponse((r) => r.url().endsWith('/decision'));
  await page.locator('.rs-btn-reject-proposal').first().click();
  assert.equal((await decision).status(), 200);
  assert.equal((await api()).revision, revision);
});
test('proposal is stale after a manual edit; restored pending cards cannot accept stale text', async () => {
  const generation = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/proposals')
  );
  await page.locator('.rs-btn-propose[data-bullet-node-id="' + firstNode.nodeId + '"]').click();
  const proposal = (await (await generation).json()).data;
  await page.locator('.rs-btn-accept-proposal').first().waitFor();
  await edit(page, secondNode.nodeId, 'Candidate edited PostgreSQL documentation during review.');
  assert.equal(await page.locator('.rs-btn-accept-proposal').first().isDisabled(), true);
  assert.equal(
    (
      await h.request('POST', '/drafts/' + draftId + '/proposals/' + proposal.id + '/decision', {
        expectedRevision: (await api()).revision,
        decision: 'ACCEPT',
      })
    ).status,
    409
  );
  await page.reload();
  await page.locator('.rs-proposal-stale-notice').first().waitFor();
  assert.equal(await page.locator('.rs-btn-accept-proposal').first().isDisabled(), true);
});
test('explicit acceptance advances revision and replay is rejected', async () => {
  const generation = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/proposals')
  );
  await page.locator('.rs-btn-propose[data-bullet-node-id="' + firstNode.nodeId + '"]').click();
  const proposal = (await (await generation).json()).data;
  const revision = (await api()).revision;
  const decision = page.waitForResponse((r) => r.url().endsWith('/decision'));
  await page.locator('.rs-btn-accept-proposal').first().click();
  assert.equal((await decision).status(), 200);
  assert.equal((await api()).revision, revision + 1);
  assert.equal(await input(page, firstNode.nodeId).inputValue(), proposal.proposedText);
  assert.equal(
    (
      await h.request('POST', '/drafts/' + draftId + '/proposals/' + proposal.id + '/decision', {
        expectedRevision: revision + 1,
        decision: 'ACCEPT',
      })
    ).status,
    409
  );
});
test('offline save retains wording and Retry save recovers over real HTTP', async () => {
  await context.setOffline(true);
  try {
    await input(page, secondNode.nodeId).fill(
      'Candidate retained PostgreSQL wording while offline.'
    );
    await page.locator('#btnRetrySave').waitFor();
    assert.equal(await page.locator('#rsSaveStatusText').textContent(), 'Network error');
    assert.equal(
      await input(page, secondNode.nodeId).inputValue(),
      'Candidate retained PostgreSQL wording while offline.'
    );
    // A scheduled document refresh must leave recovery under candidate control.
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('#btnRetrySave').isVisible(), true);
  } finally {
    await context.setOffline(false);
  }
  const response = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().endsWith('/drafts/' + draftId)
  );
  await page.locator('#btnRetrySave').click();
  assert.equal((await response).status(), 200);
  await saved();
  assert.equal(
    (await api()).structuredResume.experience[0].bullets[1],
    'Candidate retained PostgreSQL wording while offline.'
  );
});
test('manual editing during provider generation rejects the obsolete proposal without replacing wording', async () => {
  await edit(
    page,
    firstNode.nodeId,
    'Implemented React views with the use of component interfaces in order to support internal workflows.'
  );
  const started = h.pauseProvider(),
    generation = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/proposals')
    );
  await page.locator('.rs-btn-propose[data-bullet-node-id="' + firstNode.nodeId + '"]').click();
  await started;
  await edit(page, secondNode.nodeId, 'Candidate PostgreSQL wording saved during AI generation.');
  h.releaseProvider();
  assert.equal((await generation).status(), 409);
  assert.equal(
    (await api()).structuredResume.experience[0].bullets[1],
    'Candidate PostgreSQL wording saved during AI generation.'
  );
});
test('measured PDF preview maps actual text to the editor and both formats download', async () => {
  await page.locator('#btnCompilePreview').click();
  await page.waitForFunction(
    () => !document.getElementById('btnExportPdf').disabled,
    {},
    { timeout: 60000 }
  );
  await page.locator('.rs-pdf-page img').waitFor();
  assert.equal(
    await page.locator('.rs-pdf-page img').evaluate((img) => img.complete && img.naturalWidth > 0),
    true
  );
  const mapped = page.locator('.rs-pdf-node[data-node-id="' + firstNode.nodeId + '"]').first();
  await mapped.click();
  assert.equal(
    await input(page, firstNode.nodeId).evaluate((el) => el === document.activeElement),
    true
  );
  for (const [selector, format] of [
    ['#btnExportPdf', 'pdf'],
    ['#btnExportDocx', 'docx'],
  ]) {
    const downloading = page.waitForEvent('download');
    await page.locator(selector).click();
    const download = await downloading;
    await download.saveAs(
      new URL('integrated.' + format, output).pathname.replace(/^\/([A-Z]:)/, '$1')
    );
  }
});
test('approval is explicit and version history remains inspectable', async () => {
  assert.equal(await page.locator('#btnApprovePackage').isDisabled(), true);
  await page.locator('#rsApprovalReviewed').check();
  const response = page.waitForResponse((r) => r.url().endsWith('/approval'));
  await page.locator('#btnApprovePackage').click();
  assert.equal((await response).status(), 200);
  await page.waitForFunction(
    () => document.getElementById('btnApprovePackage').dataset.packageHash?.length === 64
  );
  await page.locator('#rsHistory summary').click();
  await page.locator('#rsHistoryList button').first().waitFor();
  await page.locator('#rsHistoryList button').last().click();
  await page.getByRole('button', { name: 'Restore version 1', exact: true }).waitFor();
  const revision = (await api()).revision,
    restoration = page.waitForResponse((r) => r.url().endsWith('/restore'));
  let unlock, locked;
  const acquired = new Promise((resolve) => {
    locked = resolve;
  });
  const holding = h.db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM resume_studio_drafts WHERE id=${draftId} FOR UPDATE`);
    locked();
    await new Promise((resolve) => {
      unlock = resolve;
    });
  });
  await Promise.race([acquired, holding]);
  try {
    await page.getByRole('button', { name: 'Restore version 1', exact: true }).click();
    await page.waitForFunction(
      () => document.getElementById('structuredEditorCard').getAttribute('aria-busy') === 'true'
    );
    assert.equal(await input(page, firstNode.nodeId).isDisabled(), true);
  } finally {
    unlock?.();
    await holding;
  }
  assert.equal((await restoration).status(), 200);
  assert.equal((await api()).revision, revision + 1);
  await page.waitForFunction(
    () => !document.getElementById('btnExportPdf').disabled,
    {},
    { timeout: 60000 }
  );
});
test('desktop, laptop, tablet and mobile have no horizontal page overflow; drawers support Escape', async () => {
  await page.locator('#tabDocumentPreview').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#tabRequirements').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#tabDocumentPreview').getAttribute('aria-selected'), 'true');
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['laptop', 1280, 900],
    ['tablet', 1024, 900],
    ['mobile', 375, 812],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('#tabDocumentPreview').click();
    await page.locator('.rs-header-title').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: new URL(name + '.png', output).pathname.replace(/^\/([A-Z]:)/, '$1'),
      fullPage: true,
    });
    await page.screenshot({
      path: new URL(name + '-viewport.png', output).pathname.replace(/^\/([A-Z]:)/, '$1'),
    });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      name +
        ' horizontal overflow: ' +
        JSON.stringify(
          await page.evaluate(() =>
            [...document.querySelectorAll('body *')]
              .filter(
                (el) =>
                  el.getBoundingClientRect().right > innerWidth + 1 &&
                  getComputedStyle(el).position !== 'fixed'
              )
              .map((el) => el.tagName + '.' + el.className)
              .slice(0, 12)
          )
        )
    );
    await page.locator('#btnOpenDiagnostics').click();
    await page.keyboard.press('Tab');
    assert.equal(
      await page
        .locator('#drawerDiagnostics')
        .evaluate((el) => el.contains(document.activeElement)),
      true
    );
    await page.keyboard.press('Escape');
    assert.equal(
      await page.locator('#drawerDiagnostics').evaluate((el) => el.classList.contains('open')),
      false
    );
  }
  assert.deepEqual(failures, [], 'Browser JavaScript errors');
});
test('read-only session can retrieve its own draft but cannot generate or edit', async () => {
  const readonly = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await readonly.addCookies([
    { name: 'career_hub_session', value: h.sessions[3].rawToken, url: h.baseUrl },
  ]);
  const p = await readonly.newPage();
  await p.goto(h.baseUrl + '/resume-studio?draftId=' + h.readonlyDraft.id);
  await p.locator('textarea.rs-edit-input').first().waitFor();
  assert.equal(await p.locator('textarea.rs-edit-input').first().isDisabled(), true);
  assert.equal(await p.locator('#btnCreateDraft').isDisabled(), true);
  await p.setViewportSize({ width: 375, height: 812 });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.equal(
    (
      await h.request(
        'POST',
        '/drafts/' + h.readonlyDraft.id + '/proposals',
        {
          expectedRevision: 1,
          nodeId: h.readonlyDraft.nodes.find((n) => n.kind === 'BULLET').nodeId,
        },
        3
      )
    ).status,
    403
  );
  await readonly.close();
});
test('shared navigation remains usable on the real resume archive after adding Studio', async () => {
  const archive = await context.newPage();
  await archive.goto(h.baseUrl + '/resumes');
  for (const width of [1024, 375]) {
    await archive.setViewportSize({ width, height: 812 });
    assert.ok(
      await archive.locator('.nav-inner').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
    );
    await archive.locator('#mobileNavToggle').click();
    await archive.locator('#mobileNavMenu.open a[href="/resume-studio"]').waitFor();
    await archive.locator('#mobileNavToggle').click();
  }
  await archive.close();
});
test('junior and experienced candidates use real authenticated drafts and measured one-page previews', async () => {
  for (const [person, name] of [
    [1, 'junior'],
    [2, 'experienced'],
  ]) {
    const draft = await h.create(person),
      c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await c.addCookies([
      { name: 'career_hub_session', value: h.sessions[person].rawToken, url: h.baseUrl },
    ]);
    const p = await c.newPage();
    await p.goto(h.baseUrl + '/resume-studio?draftId=' + draft.id);
    await p.waitForFunction(
      () => !document.getElementById('btnExportPdf').disabled,
      {},
      { timeout: 60000 }
    );
    if (person === 2) {
      await p.locator('.rs-source-details summary').click();
      const end = draft.nodes.find(
        (n) => n.path[0] === 'experience' && n.path[1] === 0 && n.path[2] === 'endDate'
      );
      const saving = p.waitForResponse(
        (r) => r.request().method() === 'PATCH' && r.url().endsWith('/drafts/' + draft.id)
      );
      await input(p, end.nodeId).fill('2026-10');
      assert.equal((await saving).status(), 200);
      await saved(p);
      const revised = (
        await (await h.request('GET', '/drafts/' + draft.id, undefined, person)).json()
      ).data;
      assert.equal(revised.structuredResume.experience[0].isCurrent, false);
      assert.equal(revised.masterSnapshot.experience[0].isCurrent, true);
      assert.ok(
        (await p.locator('[data-role-index="0"][data-role-field="dates"]').textContent()).includes(
          '2026-10'
        )
      );
      await p.waitForFunction(
        () => !document.getElementById('btnExportPdf').disabled,
        {},
        { timeout: 60000 }
      );
    }
    const metadata = await h.request('GET', '/drafts/' + draft.id + '/document', undefined, person);
    assert.equal(metadata.status, 200);
    const measured = (await metadata.json()).data;
    assert.equal(measured.verification.pageCount, 1);
    assert.ok(measured.verification.minimumFontPt >= 9.95);
    assert.equal(measured.verification.textPreserved, true);
    assert.equal(draft.structuredResume.experience.length, person === 1 ? 0 : 3);
    assert.equal((await h.request('GET', '/drafts/' + draft.id)).status, 404);
    await p.screenshot({
      path: new URL(name + '.png', output).pathname.replace(/^\/([A-Z]:)/, '$1'),
      fullPage: true,
    });
    await c.close();
  }
});
