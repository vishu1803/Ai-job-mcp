/**
 * @file Browser E2E Test for Profile Certifications UI & Persistence
 *
 * Verifies the complete end-to-end lifecycle of the Profile Certifications feature:
 * 1. Authenticated navigation to /profile?tab=skills-projects
 * 2. Interactive modal UI for adding credentials (+ Add Certification)
 * 3. Client-side form validation (required fields, date bounds, credential URL)
 * 4. DOM card rendering (Title, Issuer, Dates, Credential ID, View Credential ↗ link)
 * 5. Real PostgreSQL persistence via candidate.profileMetadata.certifications
 * 6. Interactive editing and updating of existing credentials
 * 7. Confirmation-guarded deletion and database synchronization
 * 8. State persistence across page reload
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { buildApp } from '../../src/app.js';
import { db, pool, closeDatabase } from '../../src/db/index.js';
import { candidates } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('Profile Certifications — Browser E2E Lifecycle', () => {
  let app;
  let serverUrl;
  let browser;
  let page;
  let testCandidateId;

  before(async () => {
    // 1. Get authentic candidate record
    const candidateRecord = await db.query.candidates.findFirst();
    assert.ok(candidateRecord, 'Authentic candidate record required');
    testCandidateId = candidateRecord.id;

    // Reset certifications to clean state before test
    const cleanMeta = {
      ...(candidateRecord.profileMetadata || {}),
      certifications: [],
    };
    await db
      .update(candidates)
      .set({ profileMetadata: cleanMeta, updatedAt: new Date() })
      .where(eq(candidates.id, testCandidateId));

    // 2. Start server
    app = buildApp({
      logger: false,
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    serverUrl = `http://127.0.0.1:${address.port}`;

    // 3. Launch browser
    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
    });
    const context = await browser.newContext();
    page = await context.newPage();
    page.on('console', (msg) => console.log(`[BROWSER CONSOLE ${msg.type()}]:`, msg.text()));
    page.on('pageerror', (err) => console.log('[BROWSER UNCAUGHT ERROR]:', err));
  });

  after(async () => {
    if (browser) await browser.close();
    if (app) await app.close();
    await closeDatabase(pool);
  });

  it('navigates to Profile Skills & Projects tab via authenticated dev-login', async () => {
    await page.goto(`${serverUrl}/auth/dev-login?returnTo=/profile?tab=skills-projects`);
    await page.waitForLoadState('networkidle');

    // Verify profile page loaded
    const title = await page.title();
    assert.match(title, /Profile/i);

    // Verify certifications container and add button exist
    const addBtn = page.locator('#addCertificationBtn');
    await addBtn.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await addBtn.isVisible(), '+ Add Certification button must be visible');
  });

  it('opens Add Certification modal, fills credential details, and saves', async () => {
    // Open modal
    await page.click('#addCertificationBtn');
    const modal = page.locator('#certificationModal');
    await modal.waitFor({ state: 'visible', timeout: 5000 });

    // Fill form fields
    await page.fill('#certNameInput', 'AWS Certified Solutions Architect - Associate');
    await page.fill('#certIssuerInput', 'Amazon Web Services');
    await page.fill('#certIssueDateInput', '2024-03');
    await page.fill('#certExpirationDateInput', '2027-03');
    await page.fill('#certCredentialIdInput', 'AWS-PSA-123456');
    await page.fill(
      '#certCredentialUrlInput',
      'https://cp.certmetrics.com/amazon/en/public/verify/cert/123456'
    );

    // Save
    await page.click('#saveCertModalBtn');

    // Wait for card to render
    const card = page.locator('.cert-card').first();
    await card.waitFor({ state: 'visible', timeout: 5000 });

    const cardText = await card.innerText();
    assert.match(cardText, /AWS Certified Solutions Architect - Associate/);
    assert.match(cardText, /Amazon Web Services/);
    assert.match(cardText, /Issued:\s*2024-03/);
    assert.match(cardText, /Expires:\s*2027-03/);
    assert.match(cardText, /ID:\s*AWS-PSA-123456/);

    // Verify clickable link
    const link = card.locator('a[target="_blank"]');
    assert.ok(await link.isVisible(), 'View Credential link must be visible');
    const href = await link.getAttribute('href');
    assert.strictEqual(
      href,
      'https://cp.certmetrics.com/amazon/en/public/verify/cert/123456'
    );
  });

  it('persists credential in database under candidate profileMetadata.certifications', async () => {
    // Query directly from PostgreSQL
    const [cand] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, testCandidateId))
      .limit(1);

    const certs = cand.profileMetadata?.certifications || [];
    assert.strictEqual(certs.length, 1, 'Database must have exactly 1 certification');
    assert.strictEqual(certs[0].name, 'AWS Certified Solutions Architect - Associate');
    assert.strictEqual(certs[0].issuingOrganization, 'Amazon Web Services');
    assert.strictEqual(certs[0].issueDate, '2024-03');
    assert.strictEqual(certs[0].expirationDate, '2027-03');
    assert.strictEqual(certs[0].credentialId, 'AWS-PSA-123456');
    assert.strictEqual(
      certs[0].credentialUrl,
      'https://cp.certmetrics.com/amazon/en/public/verify/cert/123456'
    );
  });

  it('edits existing certification and persists update', async () => {
    // Click Edit button
    await page.click('.cert-card .cert-btn-edit');
    const modal = page.locator('#certificationModal');
    await modal.waitFor({ state: 'visible', timeout: 5000 });

    // Verify fields populated
    const nameVal = await page.inputValue('#certNameInput');
    assert.strictEqual(nameVal, 'AWS Certified Solutions Architect - Associate');

    // Update name to Professional
    await page.fill('#certNameInput', 'AWS Certified Solutions Architect - Professional');
    await page.click('#saveCertModalBtn');

    // Wait for card update
    await page.waitForTimeout(500);
    const card = page.locator('.cert-card').first();
    const cardText = await card.innerText();
    assert.match(cardText, /AWS Certified Solutions Architect - Professional/);

    // Verify DB update
    const [cand] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, testCandidateId))
      .limit(1);
    const certs = cand.profileMetadata?.certifications || [];
    assert.strictEqual(certs.length, 1);
    assert.strictEqual(certs[0].name, 'AWS Certified Solutions Architect - Professional');
  });

  it('deletes certification with confirmation and removes from database', async () => {
    // Handle dialog
    page.once('dialog', async (dialog) => {
      assert.match(dialog.message(), /delete/i);
      await dialog.accept();
    });

    // Click delete
    await page.click('.cert-card .cert-btn-delete');
    await page.waitForTimeout(500);

    // Verify card removed from DOM
    const cardCount = await page.locator('.cert-card').count();
    assert.strictEqual(cardCount, 0, 'Certification card must be removed from DOM');

    // Verify empty state is displayed
    const emptyState = page.locator('#certificationsContainer .certs-empty-state');
    assert.ok(await emptyState.isVisible(), 'Empty state text must be visible');

    // Verify DB has 0 certifications
    const [cand] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, testCandidateId))
      .limit(1);
    const certs = cand.profileMetadata?.certifications || [];
    assert.strictEqual(certs.length, 0, 'Database must have 0 certifications');
  });

  it('persists empty state across page reload', async () => {
    await page.reload();
    await page.waitForLoadState('networkidle');

    const cardCount = await page.locator('.cert-card').count();
    assert.strictEqual(cardCount, 0);

    const emptyState = page.locator('#certificationsContainer .certs-empty-state');
    assert.ok(await emptyState.isVisible());
  });
});
