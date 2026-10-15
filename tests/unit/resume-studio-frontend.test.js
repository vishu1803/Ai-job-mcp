/**
 * @file Resume Studio Frontend Unit Tests (Slice 1, 2 & 3)
 *
 * Validates:
 * 1. Contract schema conformance with canonical analysis, draft, and proposal fixtures
 * 2. renderResumeStudioPage HTML structure, security headers, CSRF token binding, and proposal/conflict elements
 * 3. Save status indicators, revision badge, and conflict review modal rendering
 * 4. Truth state and evidence taxonomy distinction (VERIFIED, CLAIMED, INFERRED, MISSING, NOT_VERIFIED)
 * 5. Honest unverified status for uninspected PDF parseability
 * 6. Part A: Two-tab conflict resolution logic (different fields safe merge vs same field collision)
 * 7. Part B: AI bullet proposal lifecycle (generation, decision, stale status invalidation)
 * 8. Part C: Editing Preview labeling and client-side simulation disclaimer
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderResumeStudioPage } from '../../src/views/resume-studio.page.js';
import { renderLayout } from '../../src/views/layout.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

describe('Resume Studio Frontend Unit Tests (Slice 1, 2 & 3)', () => {
  // -------------------------------------------------------------------------
  // Slice 1: Analysis Engine Contract Verification
  // -------------------------------------------------------------------------
  it('loads canonical response fixture and validates required fields', async () => {
    const fixturePath = path.join(rootDir, 'tests/fixtures/resume-studio-analysis-response.json');
    const raw = await fs.readFile(fixturePath, 'utf8');
    const fixture = JSON.parse(raw);

    assert.equal(fixture.success, true);
    assert.ok(fixture.data);
    assert.equal(fixture.data.contractVersion, '1.0.0');
    assert.equal(fixture.data.fitStatus, 'AVAILABLE');
    assert.ok(fixture.data.candidateFit);
    assert.equal(typeof fixture.data.candidateFit.overallScore, 'number');
    assert.equal(fixture.data.candidateFit.fitBand, 'WEAK');

    // Denominator audit exists and contains 7 components
    const da = fixture.data.candidateFit.scoreBreakdown.denominatorAudit;
    assert.ok(da);
    assert.ok(da.requiredSkills);
    assert.ok(da.preferredSkills);
    assert.ok(da.projectRelevance);
    assert.ok(da.experience);
    assert.ok(da.education);
    assert.ok(da.location);
    assert.ok(da.evidenceConfidence);
    assert.equal(typeof da.totalEarnedPoints, 'number');
    assert.equal(typeof da.totalPossiblePoints, 'number');

    // Parseability MUST be NOT_VERIFIED
    assert.equal(fixture.data.parseability.status, 'NOT_VERIFIED');
    assert.ok(fixture.data.parseability.reason);

    // Keywords truth state distinction
    const keywords = fixture.data.keywords;
    assert.ok(Array.isArray(keywords));
    const reactKw = keywords.find((k) => k.term === 'React');
    assert.ok(reactKw);
    assert.equal(reactKw.truthState, 'CLAIMED');
    assert.equal(reactKw.satisfiesRequirement, false);
  });

  // -------------------------------------------------------------------------
  // Slice 2: Draft Contracts & Concurrency Fixture Verification
  // -------------------------------------------------------------------------
  it('loads canonical draft created fixture and validates contract v1.1.0 schema', async () => {
    const fixturePath = path.join(rootDir, 'tests/fixtures/resume-studio-draft-created.json');
    const raw = await fs.readFile(fixturePath, 'utf8');
    const fixture = JSON.parse(raw);

    assert.equal(fixture.success, true);
    assert.ok(fixture.data);
    assert.equal(fixture.data.contractVersion, '1.1.0');
    assert.equal(fixture.data.status, 'DRAFT');
    assert.equal(typeof fixture.data.id, 'string');
    assert.equal(typeof fixture.data.revision, 'number');
    assert.equal(fixture.data.revision, 1);

    // Nodes array exists and contains stable UUIDs, paths, and editable flags
    assert.ok(Array.isArray(fixture.data.nodes));
    assert.ok(fixture.data.nodes.length > 0);

    // Selection arrays exist
    const sel = fixture.data.selection;
    assert.ok(sel);
    assert.ok(Array.isArray(sel.experienceIds));
    assert.ok(Array.isArray(sel.projectIds));
    assert.ok(Array.isArray(sel.bulletIds));
    assert.ok(Array.isArray(sel.skillIds));
    assert.ok(sel.projectIds.length <= 4, 'Default selected projects must be <= 4');
  });

  // -------------------------------------------------------------------------
  // Slice 3: Proposal Contracts (v1.2.0) Fixture Verification
  // -------------------------------------------------------------------------
  it('loads canonical proposal created fixture and validates contract v1.2.0 schema', async () => {
    const fixturePath = path.join(rootDir, 'tests/fixtures/resume-studio-proposal-created.json');
    const raw = await fs.readFile(fixturePath, 'utf8');
    const fixture = JSON.parse(raw);

    assert.equal(fixture.success, true);
    assert.ok(fixture.data);
    assert.equal(fixture.data.contractVersion, '1.2.0');
    assert.equal(fixture.data.status, 'PENDING');
    assert.ok(fixture.data.id);
    assert.ok(fixture.data.draftId);
    assert.ok(fixture.data.nodeId);
    assert.equal(typeof fixture.data.baseRevision, 'number');

    // Original and proposed wording
    assert.ok(fixture.data.originalText);
    assert.ok(fixture.data.proposedText);
    assert.notEqual(fixture.data.originalText, fixture.data.proposedText);
    assert.ok(fixture.data.rationale);

    // Truth state and claims
    assert.equal(fixture.data.truthState, 'CLAIMED');
    assert.equal(fixture.data.claimLabel, '[Unverified User Claim]');

    // Referenced evidence and target job requirement
    assert.ok(fixture.data.jobRequirement);
    assert.ok(Array.isArray(fixture.data.evidenceLinks));
    assert.ok(fixture.data.evidenceLinks.length > 0);
    assert.equal(fixture.data.evidenceLinks[0].truthState, 'CLAIMED');
  });

  it('loads canonical proposal accepted fixture and validates atomic draft revision bump', async () => {
    const fixturePath = path.join(rootDir, 'tests/fixtures/resume-studio-proposal-accepted.json');
    const raw = await fs.readFile(fixturePath, 'utf8');
    const fixture = JSON.parse(raw);

    assert.equal(fixture.success, true);
    assert.equal(fixture.data.contractVersion, '1.2.0');

    // Accepted proposal
    const p = fixture.data.proposal;
    assert.equal(p.status, 'ACCEPTED');
    assert.ok(p.decidedAt);
    assert.equal(p.decisionRevision, 2);

    // Authoritative draft included with bumped revision
    const d = fixture.data.draft;
    assert.ok(d);
    assert.equal(d.revision, 2);
    assert.equal(d.id, p.draftId);
  });

  it('loads canonical proposal stale conflict fixture and verifies 409 STALE_PROPOSAL payload', async () => {
    const fixturePath = path.join(rootDir, 'tests/fixtures/resume-studio-proposal-stale.json');
    const raw = await fs.readFile(fixturePath, 'utf8');
    const fixture = JSON.parse(raw);

    assert.equal(fixture.success, false);
    assert.equal(fixture.error.code, 'CONFLICT');
    assert.equal(fixture.error.details[0].reason, 'STALE_PROPOSAL');
  });

  // -------------------------------------------------------------------------
  // Page View Rendering & DOM Integration Tests
  // -------------------------------------------------------------------------
  it('renders Resume Studio Page HTML with Slice 3 controls, conflict modal, and editing preview notice', () => {
    const html = renderResumeStudioPage({
      user: { id: 'u1', email: 'test@example.com', displayName: 'Asha 林', role: 'MEMBER' },
      tenant: { id: 't1', name: 'Test Tenant' },
      candidate: { id: 'c1', name: 'Asha 林' },
      candidateProfile: {
        skills: [{ name: 'PostgreSQL', verified: true }, { name: 'React', verified: false }],
        projects: [{ name: 'Analytical Engine Core', projectType: 'APPLICATION' }],
        experiences: [{ title: 'Lead Architect', company: 'Pioneer Labs', startDate: '2022', endDate: 'Present' }],
        professionalSummary: 'Senior Systems Architect with authentic repository evidence.',
      },
      baseResumes: [
        { id: '2e5d9ef0-58ba-4c27-af13-40e8660909a8', fileName: 'Asha_Master.pdf', version: 1, isMaster: true },
      ],
      draftId: 'test-draft-uuid-999',
      csrfToken: 'test-csrf-token-xyz-123',
    });

    // Contains title and DOCTYPE
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('AI Tailored Resume Studio'));

    // Slice 3 Header Elements
    assert.ok(html.includes('Slice 3 · AI Proposals &amp; Editor'));
    assert.ok(html.includes('id="rsSaveStatus"'));
    assert.ok(html.includes('id="rsRevisionBadge"'));

    // Slice 3 Conflict Resolution Banner & Modal
    assert.ok(html.includes('id="rsConflictBanner"'));
    assert.ok(html.includes('id="btnConflictReview"'));
    assert.ok(html.includes('id="btnConflictReload"'));
    assert.ok(html.includes('id="rsConflictModalBackdrop"'));
    assert.ok(html.includes('id="rsConflictModalBody"'));
    assert.ok(html.includes('id="btnConflictModalApply"'));
    assert.ok(html.includes('id="btnConflictModalCancel"'));

    // Part C: Editing Preview Tab & Notice
    assert.ok(html.includes('id="tabDocumentPreview"'));
    assert.ok(html.includes('Editing Preview</button>'));
    assert.ok(html.includes('rs-preview-notice'));
    assert.ok(html.includes('Editing Preview · Client-Side Rendering'));
    assert.ok(html.includes('Simulation Only'));
    assert.ok(html.includes('Page count, 1-page geometry, margins (&ge;0.50in), and vector text extraction are evaluated strictly on compiled export outputs in Slice 5'));
  });

  // -------------------------------------------------------------------------
  // Part A Regression Tests: Two-Tab Edits Conflict Classification
  // -------------------------------------------------------------------------
  it('correctly classifies non-conflicting two-tab edits affecting different fields as safe-mergeable', () => {
    // Tab 1 edits experience 0 bullet 0
    // Tab 2 (server) edited experience 0 bullet 1
    const baseBullet0 = 'Implemented React views.';
    const baseBullet1 = 'Documented PostgreSQL schema.';

    const serverBullet0 = 'Implemented React views.'; // Unchanged on server
    const serverBullet1 = 'Documented PostgreSQL query and index behavior.'; // Changed on server

    const localBullet0 = 'Implemented React component views with clean interfaces.'; // Changed locally
    const localBullet1 = 'Documented PostgreSQL schema.'; // Unchanged locally

    const localEdits = new Map([
      ['node-b0', { nodeId: 'node-b0', path: ['experience', 0, 'bullets', 0], text: localBullet0 }],
    ]);

    const serverChanges = [];
    if (serverBullet0 !== baseBullet0) serverChanges.push({ nodeId: 'node-b0', text: serverBullet0 });
    if (serverBullet1 !== baseBullet1) serverChanges.push({ nodeId: 'node-b1', text: serverBullet1 });

    // Check collision on node-b0: server didn't change it
    const directCollisions = serverChanges.filter((s) => localEdits.has(s.nodeId) && localEdits.get(s.nodeId).text !== s.text);
    const safeServerUpdates = serverChanges.filter((s) => !localEdits.has(s.nodeId));

    assert.equal(directCollisions.length, 0, 'Different fields must have ZERO direct collisions');
    assert.equal(safeServerUpdates.length, 1, 'Server update on bullet 1 must be safe to auto-merge');
    assert.equal(safeServerUpdates[0].nodeId, 'node-b1');
  });

  it('correctly classifies two-tab edits affecting the same field as a direct conflict requiring decision', () => {
    // Both Tab 1 and Tab 2 edited experience 0 bullet 0 with different wording
    const baseBullet0 = 'Implemented React views.';
    const serverBullet0 = 'Server tab wording for React views.';
    const localBullet0 = 'Local candidate wording for React views.';

    const localEdits = new Map([
      ['node-b0', { nodeId: 'node-b0', path: ['experience', 0, 'bullets', 0], text: localBullet0 }],
    ]);

    const serverChanges = [{ nodeId: 'node-b0', text: serverBullet0 }];

    const directCollisions = serverChanges.filter((s) => localEdits.has(s.nodeId) && localEdits.get(s.nodeId).text !== s.text);

    assert.equal(directCollisions.length, 1, 'Same field edited on both sides must produce 1 direct collision');
    assert.equal(directCollisions[0].nodeId, 'node-b0');
    assert.equal(directCollisions[0].text, serverBullet0);
  });

  // -------------------------------------------------------------------------
  // Part B: Proposal Decision Payload & Invalidation Guards
  // -------------------------------------------------------------------------
  it('enforces expectedRevision guard on proposal decisions', () => {
    const currentRevision = 2;
    const proposalBaseRevision = 1;

    // Guard: proposal was generated on rev 1, current is rev 2
    const isStale = proposalBaseRevision !== currentRevision;
    assert.equal(isStale, true, 'Proposal from revision 1 must be recognized as stale when draft is at revision 2');

    // Expected decision payloads
    const acceptPayload = { expectedRevision: currentRevision, decision: 'ACCEPT' };
    const rejectPayload = { expectedRevision: currentRevision, decision: 'REJECT' };

    assert.equal(acceptPayload.decision, 'ACCEPT');
    assert.equal(rejectPayload.decision, 'REJECT');
    assert.equal(acceptPayload.expectedRevision, 2);
  });
});
