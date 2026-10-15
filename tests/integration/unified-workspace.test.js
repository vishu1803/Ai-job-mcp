import { renderRadarPage, renderRadarResultPage } from '../../src/views/radar.page.js';
/* Real PostgreSQL, TCP session/CSRF and Chrome. Synthetic candidates only. */
/* global document, innerWidth, getComputedStyle */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStudioHarness, studioJobTarget } from '../helpers/resume-studio-harness.js';
import { jobApplications } from '../../src/db/schema.js';
import { StudioLibraryResponseSchema } from '../../src/domain/career/resume-studio-library.schemas.js';
let h, draft, application, browser, context, page;
const output = new URL('../../output/unified-workspace/', import.meta.url);
const errors = [];
const web = (path, options = {}, person = 0) =>
  fetch(h.baseUrl + path, {
    ...options,
    headers: { ...h.headers(person), Accept: 'text/html', ...options.headers },
  });
before(async () => {
  h = await startStudioHarness();
  draft = await h.create();
  await h.create(1);
  await h.create(2);
  [application] = await h.db
    .insert(jobApplications)
    .values({
      tenantId: h.people[0].tenantId,
      candidateId: h.people[0].candidateId,
      companyName: studioJobTarget.company,
      jobTitle: studioJobTarget.title,
      rawJobDescription: studioJobTarget.rawDescription,
      jobUrl: studioJobTarget.sourceUrl,
    })
    .returning();
  await fs.mkdir(output, { recursive: true });
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
  });
  await context.addCookies([
    { name: 'career_hub_session', value: h.sessions[0].rawToken, url: h.baseUrl },
  ]);
  page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
});
after(async () => {
  await browser?.close();
  await h?.close();
});
test('owned paginated library lists only caller drafts, validates contract and permits readonly', async () => {
  const response = await h.request('GET', '/drafts?limit=1');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const value = await response.json();
  StudioLibraryResponseSchema.parse(value.data);
  assert.deepEqual(
    value.data.drafts.map((d) => d.id),
    [draft.id]
  );
  assert.equal(value.data.nextOffset, null);
  await fs.writeFile(
    new URL('../fixtures/resume-studio-library.json', import.meta.url),
    JSON.stringify(value, null, 2) + '\n'
  );
  for (const who of [1, 2, 3]) {
    const data = (await (await h.request('GET', '/drafts', undefined, who)).json()).data;
    assert.ok(!data.drafts.some((d) => d.id === draft.id));
  }
  for (const query of ['limit=51', 'offset=-1', 'tenantId=foreign', 'limit=nope'])
    assert.equal((await h.request('GET', '/drafts?' + query)).status, 400);
  const unauth = await fetch(h.baseUrl + '/api/v1/resume-studio/drafts');
  assert.equal(unauth.status, 401);
  const clone = await h.create(),
    first = (await (await h.request('GET', '/drafts?limit=1')).json()).data;
  assert.equal(first.drafts[0].id, clone.id);
  assert.equal(first.nextOffset, 1);
  const second = (await (await h.request('GET', '/drafts?limit=1&offset=1')).json()).data;
  assert.equal(second.drafts[0].id, draft.id);
});
test('application context uses existing owned target and never creates or approves on navigation', async () => {
  const route = '/resume-studio?applicationId=' + application.id;
  const response = await web(route),
    html = await response.text();
  assert.equal(response.status, 200);
  assert.ok(html.includes(studioJobTarget.rawDescription));
  assert.ok(html.includes('/applications/' + application.id + '/apply'));
  assert.equal((await web(route, {}, 1)).status, 404);
  assert.equal((await web(route, {}, 2)).status, 404);
  assert.equal(
    (await web('/resume-studio?draftId=' + draft.id + '&applicationId=' + application.id)).status,
    200
  );
  assert.equal((await web('/resume-studio?applicationId=bad')).status, 400);
  const [different] = await h.db
    .insert(jobApplications)
    .values({
      tenantId: h.people[0].tenantId,
      candidateId: h.people[0].candidateId,
      companyName: 'Other Systems',
      jobTitle: 'Different target',
      rawJobDescription: studioJobTarget.rawDescription,
    })
    .returning();
  assert.equal(
    (await web('/resume-studio?draftId=' + draft.id + '&applicationId=' + different.id)).status,
    404
  );

  assert.equal((await web('/resume-studio?sourceResumeId=' + h.people[1].resumeId)).status, 404);
});
test('Jobs form reuses pasted target with session CSRF; missing CSRF and short descriptions denied', async () => {
  const user = { id: 'synthetic', displayName: 'Candidate' };
  for (const html of [
    renderRadarPage({
      user,
      discoveredJobs: [
        {
          id: 'job',
          title: studioJobTarget.title,
          company: studioJobTarget.company,
          description: studioJobTarget.rawDescription,
          skills: [],
          matchedSkills: [],
          missingSkills: [],
          atsScore: null,
        },
      ],
      csrfToken: 'synthetic-csrf',
    }),
    renderRadarResultPage({
      user,
      analysisData: {},
      studioTarget: studioJobTarget,
      csrfToken: 'synthetic-csrf',
    }),
  ]) {
    assert.ok(html.includes('/resume-studio/open?from=jobs'));
    assert.ok(html.includes(studioJobTarget.rawDescription));
    assert.ok(html.includes('synthetic-csrf'));
  }

  const body = {
    jobTitle: studioJobTarget.title,
    companyName: studioJobTarget.company,
    jobDescriptionText: studioJobTarget.rawDescription,
  };
  const response = await web('/resume-studio/open?from=jobs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes(studioJobTarget.rawDescription));
  const headers = { ...h.headers() };
  delete headers['x-csrf-token'];
  assert.equal(
    (
      await fetch(h.baseUrl + '/resume-studio/open', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
    ).status,
    403
  );
  assert.equal(
    (
      await web('/resume-studio/open', {
        method: 'POST',
        body: JSON.stringify({ ...body, jobDescriptionText: 'short' }),
      })
    ).status,
    400
  );
});
test('Overview and Library discover persistent drafts and preserve source actions', async () => {
  for (const route of ['/dashboard', '/resumes']) {
    const r = await web(route);
    assert.equal(r.status, 200);
    assert.ok((await r.text()).includes('/resume-studio?draftId=' + draft.id));
  }
  const html = await (await web('/resumes')).text();
  for (const action of [
    '/resumes/upload',
    '/download',
    '/delete',
    '_csrf',
    'Review imported facts',
  ])
    assert.ok(html.includes(action));
});
test('real shell has five destinations, themes persist and mobile navigation supports keyboard', async () => {
  await page.goto(h.baseUrl + '/resumes');
  assert.deepEqual(await page.locator('.ch-primary-nav a').allTextContents(), [
    'Overview',
    'Profile',
    'Jobs',
    'Resumes',
    'Applications',
  ]);
  assert.equal(await page.locator('.ch-primary-nav a[aria-current]').textContent(), 'Resumes');
  await page.locator('#workspaceTheme').selectOption('dark');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['laptop', 1280, 900],
    ['tablet', 768, 1024],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      await page.locator('#workspaceTheme').selectOption(theme);
      for (const route of ['/dashboard', '/resumes']) {
        await page.goto(h.baseUrl + route);
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          route + name
        );
        await page.screenshot({
          path: new URL(
            name + '-' + theme + (route === '/resumes' ? '-resumes' : '-overview') + '.png',
            output
          ).pathname.replace(/^\/([A-Z]:)/, '$1'),
          fullPage: true,
        });
      }
    }
    if (width < 1101) {
      await page.locator('#mobileNavToggle').click();
      await page.locator('#mobileNavMenu.open').waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#mobileNavToggle').getAttribute('aria-expanded'), 'false');
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.keyboard.press('Control+Home');
  await page.locator('.ch-skip').focus();
  assert.equal(await page.locator('.ch-skip').evaluate((e) => e === document.activeElement), true);
});
test('Library resumes real Studio with shared theme, context, actual PDF, keyboard resize and return', async () => {
  await page.goto(h.baseUrl + '/resumes');
  await page
    .locator('a[href="/resume-studio?draftId=' + draft.id + '"]')
    .first()
    .click();
  await page.locator('textarea.rs-edit-input').first().waitFor();
  assert.equal(await page.locator('.ch-primary-nav a[aria-current]').textContent(), 'Resumes');
  await page.waitForFunction(
    () => !document.getElementById('btnExportPdf').disabled,
    {},
    { timeout: 60000 }
  );
  await page.locator('.rs-pdf-page img').waitFor();
  const separator = page.locator('#studioDivider');
  await separator.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await separator.getAttribute('aria-valuenow'), '55');
  for (const theme of ['light', 'dark']) {
    await page.locator('#workspaceTheme').selectOption(theme);
    await page.screenshot({
      path: new URL('desktop-' + theme + '-studio.png', output).pathname.replace(
        /^\/([A-Z]:)/,
        '$1'
      ),
    });
  }
  await page.locator('#studioReturnLink').click();
  await page.waitForURL('**/resumes');
  await page.goto(
    h.baseUrl + '/resume-studio?applicationId=' + application.id + '&draftId=' + draft.id
  );
  await page.locator('textarea.rs-edit-input').first().waitFor();
  assert.ok(
    (await page.locator('#studioReturnLink').getAttribute('href')).includes(application.id)
  );
  await page.locator('#studioReturnLink').click();
  await page.waitForURL('**/applications/' + application.id + '/apply');
  await page.goto(h.baseUrl + '/resume-studio?draftId=' + draft.id);
  await page.locator('textarea.rs-edit-input').first().waitFor();
  await page.waitForFunction(
    () => !document.getElementById('btnExportPdf').disabled,
    {},
    { timeout: 60000 }
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['light', 'dark']) {
    await page.locator('#workspaceTheme').selectOption(theme);
    await page.screenshot({
      path: new URL('mobile-' + theme + '-studio.png', output).pathname.replace(
        /^\/([A-Z]:)/,
        '$1'
      ),
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
});
