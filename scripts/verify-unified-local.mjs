/* Real browser screenshots from an already running actual-main isolated server. */
/* global document, innerWidth, getComputedStyle, scrollTo */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const runtime = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
assert.equal(runtime.worktree, path.resolve('.'));
assert.equal(runtime.branch, 'main');
assert.equal(runtime.database, 'product_audit_resume_studio');
assert.equal(new URL(runtime.baseUrl).hostname, '127.0.0.1');
const out = path.resolve('output/unified-workspace/local-main');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const screens = [];
try {
  await page.goto(runtime.loginUrl);
  await page.locator('textarea.rs-edit-input').first().waitFor();
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      await page.locator('#workspaceTheme').selectOption(theme);
      for (const [screen, url] of [
        ['overview', runtime.baseUrl + '/dashboard'],
        ['resumes', runtime.baseUrl + '/resumes'],
        ['studio', runtime.studioUrl],
      ]) {
        await page.goto(url);
        await page.locator('h1').first().waitFor();
        if (screen === 'studio') {
          await page.locator('textarea.rs-edit-input').first().waitFor();
          await page.waitForFunction(
            () => !document.getElementById('btnExportPdf').disabled,
            {},
            { timeout: 60000 }
          );
        }
        if (screen === 'studio')
          await page.locator('.rs-pdf-page img').evaluate((img) => img.decode());
        await page.evaluate(() => scrollTo(0, 0));
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          screen + width
        );
        const file = name + '-' + theme + '-' + screen + '.png';
        await page.screenshot({
          path: path.join(out, file),
          fullPage: true,
          animations: 'disabled',
        });
        await page.screenshot({
          path: path.join(out, file.replace('.png', '-viewport.png')),
          animations: 'disabled',
        });
        screens.push({ screen, width, theme, file });
      }
    }
  }
  assert.deepEqual(errors, []);
  const result = {
    status: 'PASS',
    worktree: runtime.worktree,
    branch: runtime.branch,
    baseUrl: runtime.baseUrl,
    screens,
    errors,
    provider: runtime.provider,
    database: runtime.database,
    note: 'Real running main application; normal fixture authentication; no API response mocks. Theme screenshot animations completed before capture.',
  };
  await fs.writeFile(path.join(out, 'verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: 'PASS', screens: screens.length, out }));
} finally {
  await browser.close();
}
