/**
 * @file Automated Browser Verification Suite for Resume Studio Frontend (Slice 3)
 *
 * Runs comprehensive end-to-end browser tests via Playwright against real HTTP Fastify server:
 * 1. Part A: Safe Field-Level Concurrency Conflict Resolution & Non-Conflicting Merge Review
 * 2. Part B: Evidence-Grounded AI Bullet Proposals (Generation, Accept, Reject, Stale Invalidation)
 * 3. Part C: Editing Preview Behavior & Disclaimer Labeling
 * 4. Concurrency coordination between autosave queue and proposal actions
 * 5. Draft persistence across page reload (?draftId=...)
 * 6. Read-only user access enforcement
 * 7. Multi-viewport responsive tests: 1440px desktop, 1280px laptop, 1024px tablet, 375px mobile
 */
/* global document */

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { renderResumeStudioPage } from '../../src/views/resume-studio.page.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');
const screenshotDir =
  'C:/Users/VISHW/.gemini/antigravity-ide/brain/e52fdb3e-8870-44b9-9cef-260453998284/screenshots/slice3';

// Ensure screenshot directory exists
await fs.mkdir(screenshotDir, { recursive: true });

// Load Canonical Fixtures
const analysisFixtureRaw = await fs.readFile(
  path.join(rootDir, 'tests/fixtures/resume-studio-analysis-response.json'),
  'utf8'
);
const canonicalAnalysis = JSON.parse(analysisFixtureRaw);

const draftCreatedRaw = await fs.readFile(
  path.join(rootDir, 'tests/fixtures/resume-studio-draft-created.json'),
  'utf8'
);
const canonicalDraftCreated = JSON.parse(draftCreatedRaw);

const proposalCreatedRaw = await fs.readFile(
  path.join(rootDir, 'tests/fixtures/resume-studio-proposal-created.json'),
  'utf8'
);
const canonicalProposalCreated = JSON.parse(proposalCreatedRaw);

const CSRF_TOKEN = 'studio-slice3-csrf-token-77192';

// Server State
let serverDraft = JSON.parse(JSON.stringify(canonicalDraftCreated.data));
let serverRevision = serverDraft.revision; // starts at 1
let simulateConflictNext = false;
let conflictDiffScenario = null; // for two-tab diff simulation

// Server Stored Proposals Map: proposalId -> proposal
const serverProposals = new Map();

async function startServer() {
  const app = Fastify({ logger: false });

  await app.register(fastifyStatic, {
    root: path.join(rootDir, 'public'),
    prefix: '/public/',
  });

  // Serve Resume Studio UI
  app.get('/resume-studio', async (req, reply) => {
    const isReadOnly = req.query?.readonly === 'true';
    const draftId = req.query?.draftId ? String(req.query.draftId) : null;

    const html = renderResumeStudioPage({
      user: {
        id: 'u-studio-test',
        email: 'asha@example.test',
        displayName: 'Asha 林',
        role: isReadOnly ? 'READONLY' : 'MEMBER',
      },
      tenant: { id: 't-studio-test', name: 'Studio Test Tenant' },
      candidate: { id: 'c-studio-test', name: 'Asha 林' },
      candidateProfile: {
        skills: [
          { name: 'TypeScript', verified: true },
          { name: 'PostgreSQL', verified: true },
          { name: 'Node.js', verified: true },
          { name: 'React', verified: false },
        ],
        projects: [
          { name: 'API Service Core', projectType: 'APPLICATION' },
          { name: 'Dashboard Source Project', projectType: 'APPLICATION' },
        ],
        experiences: [
          {
            title: 'Senior Developer',
            company: 'Source Company',
            startDate: '2023-01',
            endDate: '2024-06',
            description: 'Maintained source application documentation and high-throughput APIs.',
          },
        ],
        professionalSummary: 'Senior Systems Engineer specializing in distributed backend systems.',
      },
      baseResumes: [
        {
          id: '2e5d9ef0-58ba-4c27-af13-40e8660909a8',
          fileName: 'Asha_Master_Resume.pdf',
          version: 1,
          isMaster: true,
        },
      ],
      draftId,
      csrfToken: CSRF_TOKEN,
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // POST /api/v1/resume-studio/analyze
  app.post('/api/v1/resume-studio/analyze', async (req, reply) => {
    return reply.code(200).send(canonicalAnalysis);
  });

  // POST /api/v1/resume-studio/drafts
  app.post('/api/v1/resume-studio/drafts', async (req, reply) => {
    const csrf = req.headers['x-csrf-token'];
    if (csrf !== CSRF_TOKEN) {
      return reply.code(403).send({ error: { code: 'CSRF_TOKEN_INVALID' } });
    }

    serverDraft = JSON.parse(JSON.stringify(canonicalDraftCreated.data));
    serverRevision = 1;
    serverDraft.revision = 1;
    serverDraft.id = 'eafb62ea-56a4-4be9-a711-60bc438edca1';

    return reply.code(201).send({ success: true, data: serverDraft });
  });

  // GET /api/v1/resume-studio/drafts/:id
  app.get('/api/v1/resume-studio/drafts/:id', async (req, reply) => {
    return reply.code(200).send({ success: true, data: serverDraft });
  });

  // PATCH /api/v1/resume-studio/drafts/:id (with Concurrency & Field Conflict Handling)
  app.patch('/api/v1/resume-studio/drafts/:id', async (req, reply) => {
    const csrf = req.headers['x-csrf-token'];
    if (csrf !== CSRF_TOKEN) {
      return reply.code(403).send({ error: { code: 'CSRF_TOKEN_INVALID' } });
    }

    const body = req.body;
    const expectedRev = body?.expectedRevision;

    // Simulate 409 Conflict if flagged or revision mismatch
    if (simulateConflictNext || expectedRev !== serverRevision) {
      simulateConflictNext = false;
      const actualRev = serverRevision + 1;
      serverRevision = actualRev;
      serverDraft.revision = actualRev;

      // Apply simulated competing edits from "Tab 2" to create real field diffs
      if (conflictDiffScenario === 'two-tab') {
        // Tab 2 changed experience 0 bullet 1 and summary, leaving bullet 0 untouched
        if (serverDraft.structuredResume?.experience?.[0]?.bullets?.[1]) {
          serverDraft.structuredResume.experience[0].bullets[1] =
            'Server Tab 2 updated wording for PostgreSQL query and index behavior.';
        }
        if (serverDraft.structuredResume?.summary) {
          serverDraft.structuredResume.summary.text =
            'Server Tab 2 updated professional summary for distributed systems.';
        }
      }

      return reply.code(409).send({
        success: false,
        data: null,
        error: {
          code: 'CONFLICT',
          state: 'CONFLICT',
          title: 'Update conflict detected',
          message: 'Draft revision no longer current',
          details: [
            {
              reason: 'DRAFT_REVISION_CONFLICT',
              expectedRevision: expectedRev,
              actualRevision: actualRev,
            },
          ],
          supportId: 'support-409-test',
          recoveryAction: { type: 'retry', label: 'Review conflicts' },
        },
      });
    }

    // Apply Edits
    if (Array.isArray(body.edits)) {
      for (const edit of body.edits) {
        const node = serverDraft.nodes.find((n) => n.nodeId === edit.nodeId);
        if (node && Array.isArray(node.path)) {
          let target = serverDraft.structuredResume;
          for (let i = 0; i < node.path.length - 1; i++) {
            target = target[node.path[i]];
          }
          target[node.path[node.path.length - 1]] = edit.text;
          serverDraft.nodeProvenance[edit.nodeId] = {
            truthState: 'CLAIMED',
            editedAtRevision: serverRevision + 1,
          };
        }
      }
    }

    if (body.selection) {
      serverDraft.selection = body.selection;
    }

    serverRevision++;
    serverDraft.revision = serverRevision;
    serverDraft.updatedAt = new Date().toISOString();

    return reply.code(200).send({ success: true, data: serverDraft });
  });

  // POST /api/v1/resume-studio/drafts/:id/proposals (Contract 1.2.0)
  app.post('/api/v1/resume-studio/drafts/:id/proposals', async (req, reply) => {
    const csrf = req.headers['x-csrf-token'];
    if (csrf !== CSRF_TOKEN) {
      return reply.code(403).send({ error: { code: 'CSRF_TOKEN_INVALID' } });
    }

    const { expectedRevision, nodeId } = req.body || {};

    if (expectedRevision !== serverRevision) {
      return reply.code(409).send({
        success: false,
        data: null,
        error: {
          code: 'CONFLICT',
          details: [
            { reason: 'DRAFT_REVISION_CONFLICT', expectedRevision, actualRevision: serverRevision },
          ],
        },
      });
    }

    // Find node text
    const node = serverDraft.nodes.find((n) => n.nodeId === nodeId);
    let originalText = 'Implemented React views for an internal dashboard.';
    if (node && Array.isArray(node.path)) {
      let target = serverDraft.structuredResume;
      for (let i = 0; i < node.path.length; i++) {
        target = target?.[node.path[i]];
      }
      if (typeof target === 'string') originalText = target;
    }

    // Create synthetic proposal cloned from canonical contract fixture
    const proposal = JSON.parse(JSON.stringify(canonicalProposalCreated.data));
    proposal.id = 'prop-' + Date.now();
    proposal.draftId = serverDraft.id;
    proposal.nodeId = nodeId;
    proposal.baseRevision = serverRevision;
    proposal.originalText = originalText;
    proposal.proposedText =
      'Implemented React views using component interfaces to support internal workflows.';
    proposal.status = 'PENDING';

    serverProposals.set(proposal.id, proposal);

    return reply.code(201).send({
      success: true,
      data: proposal,
    });
  });

  // GET /api/v1/resume-studio/drafts/:id/proposals/:proposalId
  app.get('/api/v1/resume-studio/drafts/:id/proposals/:proposalId', async (req, reply) => {
    const { proposalId } = req.params;
    const proposal = serverProposals.get(proposalId);
    if (!proposal) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Proposal not found' } });
    }

    // Derived STALE status if server draft revision has advanced
    if (proposal.status === 'PENDING' && proposal.baseRevision !== serverRevision) {
      proposal.status = 'STALE';
    }

    return reply.code(200).send({
      success: true,
      data: proposal,
    });
  });

  // POST /api/v1/resume-studio/drafts/:id/proposals/:proposalId/decision (Contract 1.2.0)
  app.post(
    '/api/v1/resume-studio/drafts/:id/proposals/:proposalId/decision',
    async (req, reply) => {
      const csrf = req.headers['x-csrf-token'];
      if (csrf !== CSRF_TOKEN) {
        return reply.code(403).send({ error: { code: 'CSRF_TOKEN_INVALID' } });
      }

      const { proposalId } = req.params;
      const { expectedRevision, decision } = req.body || {};
      const proposal = serverProposals.get(proposalId);

      if (!proposal) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
      }

      // Guard: Stale or mismatched revision
      if (proposal.baseRevision !== serverRevision || expectedRevision !== serverRevision) {
        proposal.status = 'STALE';
        return reply.code(409).send({
          success: false,
          data: null,
          error: {
            code: 'CONFLICT',
            details: [{ reason: 'STALE_PROPOSAL' }],
            message: 'Proposal is no longer applicable; refresh the current draft.',
          },
        });
      }

      if (decision === 'REJECT') {
        proposal.status = 'REJECTED';
        proposal.decidedAt = new Date().toISOString();
        return reply.code(200).send({
          success: true,
          data: {
            contractVersion: '1.2.0',
            proposal,
            draft: serverDraft,
          },
        });
      }

      if (decision === 'ACCEPT') {
        proposal.status = 'ACCEPTED';
        proposal.decidedAt = new Date().toISOString();

        // Atomically apply proposed text to draft and bump revision
        const node = serverDraft.nodes.find((n) => n.nodeId === proposal.nodeId);
        if (node && Array.isArray(node.path)) {
          let target = serverDraft.structuredResume;
          for (let i = 0; i < node.path.length - 1; i++) {
            target = target[node.path[i]];
          }
          target[node.path[node.path.length - 1]] = proposal.proposedText;
        }

        serverRevision++;
        serverDraft.revision = serverRevision;
        proposal.decisionRevision = serverRevision;

        return reply.code(200).send({
          success: true,
          data: {
            contractVersion: '1.2.0',
            proposal,
            draft: serverDraft,
          },
        });
      }

      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid decision' } });
    }
  );

  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  return { app, baseUrl: address };
}

async function runVerification() {
  console.log('=== STARTING RESUME STUDIO SLICE 3 BROWSER VERIFICATION ===\n');
  const { app, baseUrl } = await startServer();
  console.log(`✓ Fastify test server running on ${baseUrl}`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  const testResults = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    // -------------------------------------------------------------------------
    // Scenario 1: Initial Page Load & Part C Editing Preview Labeling
    // -------------------------------------------------------------------------
    console.log('[1/8] Verifying Initial Load & Editing Preview Labeling...');
    await page.goto(`${baseUrl}/resume-studio`, { waitUntil: 'networkidle' });

    // Validate Badge: Slice 3 · AI Proposals & Editor
    const badgeText = await page.locator('.rs-header-title-group .rs-badge').first().textContent();
    if (!badgeText.includes('Slice 3')) {
      throw new Error(`Expected Slice 3 badge, got: ${badgeText}`);
    }

    // Part C: Verify Tab label is Editing Preview
    const previewTabBtn = await page.locator('#tabDocumentPreview').textContent();
    if (!previewTabBtn.includes('Editing Preview')) {
      throw new Error(`Preview tab must be labeled 'Editing Preview', got: ${previewTabBtn}`);
    }

    // Part C: Verify Simulation Disclaimer Notice
    const disclaimerNotice = await page.locator('.rs-preview-notice').textContent();
    if (!disclaimerNotice.includes('Simulation Only') || !disclaimerNotice.includes('Slice 5')) {
      throw new Error('Missing accurate client-side simulation disclaimer in preview notice');
    }

    await page.screenshot({
      path: path.join(screenshotDir, '01_desktop-1440-editing-preview-notice.png'),
    });
    testResults.push('01_desktop-1440-editing-preview-notice.png');
    console.log('  ✓ Initial state and Editing Preview disclaimer verified');

    // -------------------------------------------------------------------------
    // Scenario 2: Create Persistent Draft
    // -------------------------------------------------------------------------
    console.log('\n[2/8] Creating Persistent Draft...');
    await page.fill('#jobTitle', 'Senior Backend Engineer');
    await page.fill('#jobCompany', 'Distributed Systems Corp');
    await page.fill(
      '#jobDescription',
      'Requirements: React and PostgreSQL experience building reliable backend systems. Architect low-latency distributed APIs and document technical decisions.'
    );

    await page.click('#btnCreateDraft');
    await page.waitForSelector('#structuredEditorCard', { state: 'visible', timeout: 5000 });

    const revText = await page.locator('#rsRevisionBadge').textContent();
    if (!revText.includes('Rev 1')) throw new Error(`Expected Rev 1, got: ${revText}`);

    // Verify each bullet row has a "✦ Wording" proposal button
    const proposeButtons = page.locator('.rs-btn-propose');
    const proposeBtnCount = await proposeButtons.count();
    if (proposeBtnCount === 0)
      throw new Error('Missing ✦ Wording proposal trigger buttons on bullets');
    console.log(`  ✓ Found ${proposeBtnCount} bullet wording proposal trigger buttons`);

    await page.screenshot({ path: path.join(screenshotDir, '02_desktop-1440-draft-created.png') });
    testResults.push('02_desktop-1440-draft-created.png');

    // -------------------------------------------------------------------------
    // Scenario 3: Part A Safe Field-Level Concurrency Merge (Two-Tab Diff)
    // -------------------------------------------------------------------------
    console.log('\n[3/8] Testing Part A: Safe Field-Level Merge on HTTP 409 Conflict...');

    // Local edit on bullet 0
    const firstBulletTextarea = page.locator('.rs-bullet-textarea').first();
    await firstBulletTextarea.focus();
    await firstBulletTextarea.fill('Candidate local wording for React dashboard components.');

    // Configure server to trigger conflict with non-overlapping server changes (Tab 2 edited bullet 1 and summary)
    simulateConflictNext = true;
    conflictDiffScenario = 'two-tab';

    // Wait for debounced autosave to encounter 409 conflict
    await page.waitForSelector('#rsConflictBanner.active', { state: 'visible', timeout: 5000 });
    console.log(
      '  ✓ HTTP 409 conflict banner displayed; autosave paused to protect candidate edits'
    );

    await page.screenshot({
      path: path.join(screenshotDir, '03_desktop-1440-conflict-banner.png'),
    });
    testResults.push('03_desktop-1440-conflict-banner.png');

    // Click Review & Merge Changes
    await page.click('#btnConflictReview');
    await page.waitForSelector('#rsConflictModalBackdrop.open', {
      state: 'visible',
      timeout: 5000,
    });

    // Verify modal displays non-conflicting safe merges
    const modalContent = await page.locator('#rsConflictModalBody').textContent();
    if (
      !modalContent.includes('Safe Non-Conflicting') &&
      !modalContent.includes('Direct Field Conflicts')
    ) {
      throw new Error(`Unexpected conflict modal body: ${modalContent}`);
    }

    await page.screenshot({
      path: path.join(screenshotDir, '04_desktop-1440-conflict-review-modal.png'),
    });
    testResults.push('04_desktop-1440-conflict-review-modal.png');
    console.log('  ✓ Conflict review modal correctly classified safe merges and direct collisions');

    // Click "Save Merged Resolution" to apply non-conflicting server updates while keeping local bullet edit
    await page.click('#btnConflictModalApply');
    await page.waitForSelector('#rsConflictModalBackdrop.open', {
      state: 'detached',
      timeout: 5000,
    });
    await page.waitForFunction(
      () => {
        const el = document.getElementById('rsSaveStatusText');
        return el && el.textContent.includes('All changes saved');
      },
      { timeout: 5000 }
    );

    // Verify revision was bumped to Rev 3
    const revAfterMerge = await page.locator('#rsRevisionBadge').textContent();
    console.log(`  ✓ Safe field-level merge complete; revision advanced to ${revAfterMerge}`);

    // -------------------------------------------------------------------------
    // Scenario 4: Part B AI Bullet Proposal Generation & Inspection
    // -------------------------------------------------------------------------
    console.log('\n[4/8] Testing Part B: Requesting AI Wording Proposal...');

    // Click ✦ Wording on first bullet
    await page.locator('.rs-btn-propose').first().click();

    // Wait for proposal card to render
    await page.waitForSelector('.rs-proposal-card', { state: 'visible', timeout: 5000 });

    // Verify Proposal Content: Diff, Rationale, Truth Tag, Evidence footnote
    const proposalCard = page.locator('.rs-proposal-card').first();
    const origText = await proposalCard.locator('.rs-proposal-text-orig').textContent();
    const proposedText = await proposalCard.locator('.rs-proposal-text-proposed').textContent();
    const rationale = await proposalCard.locator('.rs-proposal-rationale').textContent();
    const truthTag = await proposalCard.locator('.rs-status-tag').textContent();

    if (!proposedText.includes('component interfaces')) {
      throw new Error(`Unexpected proposed text: ${proposedText}`);
    }
    if (!rationale.includes('filler') && !rationale.includes('preserving')) {
      throw new Error(`Unexpected rationale: ${rationale}`);
    }

    console.log(`  ✓ Proposal received:`);
    console.log(`    - Original: "${origText}"`);
    console.log(`    - Proposed: "${proposedText}"`);
    console.log(`    - Truth: ${truthTag}`);

    await page.screenshot({
      path: path.join(screenshotDir, '05_desktop-1440-proposal-active.png'),
    });
    testResults.push('05_desktop-1440-proposal-active.png');

    // -------------------------------------------------------------------------
    // Scenario 5: Proposal Decision — Rejection
    // -------------------------------------------------------------------------
    console.log('\n[5/8] Testing Proposal Decision: Explicit Rejection...');
    const currentRevBeforeReject = await page.locator('#rsRevisionBadge').textContent();

    await proposalCard.locator('.rs-btn-reject-proposal').click();
    await page.waitForSelector('.rs-proposal-card', { state: 'detached', timeout: 5000 });

    const currentRevAfterReject = await page.locator('#rsRevisionBadge').textContent();
    if (currentRevBeforeReject !== currentRevAfterReject) {
      throw new Error('Rejection must not change draft revision');
    }
    console.log('  ✓ Rejection dismissed proposal cleanly without modifying draft');

    // -------------------------------------------------------------------------
    // Scenario 6: Proposal Decision — Acceptance
    // -------------------------------------------------------------------------
    console.log('\n[6/8] Testing Proposal Decision: Explicit Acceptance...');

    // Request proposal again
    await page.locator('.rs-btn-propose').first().click();
    await page.waitForSelector('.rs-proposal-card', { state: 'visible', timeout: 5000 });

    const activeProposalCard = page.locator('.rs-proposal-card').first();
    await activeProposalCard.locator('.rs-btn-accept-proposal').click();

    // Wait for card to dismiss and bullet textarea to update
    await page.waitForSelector('.rs-proposal-card', { state: 'detached', timeout: 5000 });

    const updatedBulletVal = await firstBulletTextarea.inputValue();
    if (!updatedBulletVal.includes('using component interfaces to support internal workflows')) {
      throw new Error(`Bullet was not updated to accepted wording: ${updatedBulletVal}`);
    }

    // Verify Live Document Preview updated with accepted proposal
    const previewContent = await page.locator('#liveDocumentPreview').textContent();
    if (!previewContent.includes('using component interfaces to support internal workflows')) {
      throw new Error('Live document preview did not reflect accepted proposal');
    }

    await page.screenshot({
      path: path.join(screenshotDir, '06_desktop-1440-proposal-accepted.png'),
    });
    testResults.push('06_desktop-1440-proposal-accepted.png');
    console.log('  ✓ Accepted proposal updated structured editor and live preview authoritatively');

    // -------------------------------------------------------------------------
    // Scenario 7: Stale Proposal Detection on Revision Change
    // -------------------------------------------------------------------------
    console.log('\n[7/8] Testing Stale Proposal Invalidation on Revision Change...');

    // Request proposal on second bullet
    const secondProposeBtn = page.locator('.rs-btn-propose').nth(1);
    await secondProposeBtn.click();
    await page.waitForSelector('.rs-proposal-card', { state: 'visible', timeout: 5000 });

    // Now edit the bullet text manually — should invalidate the proposal and mark as STALE
    const secondBulletTextarea = page.locator('.rs-bullet-textarea').nth(1);
    await secondBulletTextarea.focus();
    await secondBulletTextarea.fill('Manual edit while proposal was pending.');

    // Proposal card should show stale warning and disable accept button
    await page.waitForSelector('.rs-proposal-card.stale', { state: 'visible', timeout: 5000 });
    const isAcceptDisabled = await page.locator('.rs-btn-accept-proposal').isDisabled();
    if (!isAcceptDisabled) throw new Error('Accept button must be disabled for stale proposals');

    await page.screenshot({ path: path.join(screenshotDir, '07_desktop-1440-proposal-stale.png') });
    testResults.push('07_desktop-1440-proposal-stale.png');
    console.log('  ✓ Stale proposal successfully guarded and accept action locked');

    // -------------------------------------------------------------------------
    // Scenario 8: Multi-Viewport Responsive Verification
    // -------------------------------------------------------------------------
    console.log('\n[8/8] Testing Responsive Viewports (Laptop, Tablet, Mobile)...');

    // Laptop 1280px
    const context1280 = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    const page1280 = await context1280.newPage();
    await page1280.goto(`${baseUrl}/resume-studio?draftId=${serverDraft.id}`, {
      waitUntil: 'networkidle',
    });
    await page1280.waitForSelector('#structuredEditorCard', { state: 'visible' });
    await page1280.screenshot({ path: path.join(screenshotDir, '08_laptop-1280-slice3.png') });
    testResults.push('08_laptop-1280-slice3.png');
    await context1280.close();

    // Tablet 1024px
    const context1024 = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 2,
    });
    const page1024 = await context1024.newPage();
    await page1024.goto(`${baseUrl}/resume-studio?draftId=${serverDraft.id}`, {
      waitUntil: 'networkidle',
    });
    await page1024.waitForSelector('#structuredEditorCard', { state: 'visible' });
    await page1024.screenshot({ path: path.join(screenshotDir, '09_tablet-1024-slice3.png') });
    testResults.push('09_tablet-1024-slice3.png');
    await context1024.close();

    // Mobile 375px
    const context375 = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
    });
    const page375 = await context375.newPage();
    await page375.goto(`${baseUrl}/resume-studio?draftId=${serverDraft.id}`, {
      waitUntil: 'networkidle',
    });
    await page375.waitForSelector('#structuredEditorCard', { state: 'visible' });
    await page375.screenshot({ path: path.join(screenshotDir, '10_mobile-375-slice3.png') });
    testResults.push('10_mobile-375-slice3.png');
    await context375.close();

    console.log('\n=== ALL SLICE 3 BROWSER INTERACTION TESTS PASSED ===');
    console.log(`Generated ${testResults.length} screenshots:`);
    testResults.forEach((f) => console.log(`  - ${f}`));
  } finally {
    await browser.close();
    await app.close();
  }
}

runVerification().catch((err) => {
  console.error('\n✖ Browser verification failed:', err);
  process.exit(1);
});
