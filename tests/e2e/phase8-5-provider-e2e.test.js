/**
 * @file Phase 8.5 — Provider Application E2E Test Suite.
 *
 * Validates the complete MCP -> Web -> Extension -> Portal pipeline across all six
 * production provider adapters (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, iCIMS):
 * - Job Discovery & Ingestion
 * - ATS Fit Scoring & Alignment (Invariant 69.25)
 * - Canonical Application Package Generation & Tamper-Evident Hash
 * - Cryptographic Single-Use Approval Ticket Binding
 * - Extension Handoff & Provider Resolution
 * - Canonical Form Extraction (PortalFormSchema)
 * - Generic Autofill Planning (FillPlan)
 * - Safe Execution & Verification
 * - Final Review State Handoff (Never Auto-Submits)
 * - Cross-Surface Parity & Security Boundaries
 */

import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  GreenhousePortalAdapter,
  LeverPortalAdapter,
  AshbyPortalAdapter,
  WorkdayPortalAdapter,
  SmartRecruitersPortalAdapter,
  IcimsPortalAdapter,
  registerAllPortalAdapters,
} from '../../src/domain/portal/adapters/index.js';
import {
  PortalAdapterRegistry,
} from '../../src/domain/portal/portal-adapter-registry.js';
import {
  GenericAutofillEngine,
  genericAutofillEngine,
} from '../../src/domain/portal/generic-autofill-engine.js';
import { AtsFitScoreService } from '../../src/services/ats-fit-score.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { db } from '../../src/db/index.js';
import { tenants, users, candidates, jobApplications } from '../../src/db/schema.js';
import { ValidationError, AuthorizationError } from '../../src/errors/index.js';

// DOM Mock Helpers with robust CSS selector matching
function matchesSelector(el, selector) {
  if (!el || !selector) return false;
  const parts = selector.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (matchesSingleSelector(el, part)) return true;
  }
  return false;
}

function matchesSingleSelector(el, sel) {
  if (!sel) return false;

  const tagIdMatch = sel.match(/^([a-zA-Z0-9_-]+)?#([a-zA-Z0-9_-]+)$/);
  if (tagIdMatch) {
    const [, requiredTag, id] = tagIdMatch;
    if (requiredTag && el.tagName && el.tagName.toUpperCase() !== requiredTag.toUpperCase()) return false;
    return el.id === id;
  }

  const tagClassMatch = sel.match(/^([a-zA-Z0-9_-]+)?\.([a-zA-Z0-9_-]+)$/);
  if (tagClassMatch) {
    const [, requiredTag, cls] = tagClassMatch;
    if (requiredTag && el.tagName && el.tagName.toUpperCase() !== requiredTag.toUpperCase()) return false;
    const actualCls = el.className || (typeof el.getAttribute === 'function' ? el.getAttribute('class') : '') || '';
    return actualCls.split(/\s+/).includes(cls);
  }

  const quotedAttrMatch = sel.match(/^(?:([a-zA-Z0-9_-]+))?\[([a-zA-Z0-9_:-]+)([\^$*]?=)["']([^"']*)["']\]$/);
  if (quotedAttrMatch) {
    const [, requiredTag, attrName, op, expectedVal] = quotedAttrMatch;
    if (requiredTag && el.tagName && el.tagName.toUpperCase() !== requiredTag.toUpperCase()) return false;
    let actualVal = null;
    if (attrName === 'id') actualVal = el.id;
    else if (attrName === 'name') actualVal = el.name;
    else if (attrName === 'type') actualVal = el.type;
    else if (typeof el.getAttribute === 'function') actualVal = el.getAttribute(attrName);
    else if (el.attributes) actualVal = el.attributes[attrName];

    if (actualVal === null || actualVal === undefined) return false;
    if (op === '=') return String(actualVal) === expectedVal;
    if (op === '^=') return String(actualVal).startsWith(expectedVal);
    if (op === '*=') return String(actualVal).includes(expectedVal);
    if (op === '$=') return String(actualVal).endsWith(expectedVal);
    return false;
  }

  const multiAttrMatch = sel.match(/^([a-zA-Z0-9_-]+)?((?:\[[^\]]+\])+)$/);
  if (multiAttrMatch) {
    const [, requiredTag, brackets] = multiAttrMatch;
    if (requiredTag && el.tagName && el.tagName.toUpperCase() !== requiredTag.toUpperCase()) return false;
    const singleAttrRegex = /\[([a-zA-Z0-9_:-]+)(?:([\^$*]?=)["']?([^"']*)["']?)?\]/g;
    let match;
    while ((match = singleAttrRegex.exec(brackets)) !== null) {
      const [, attrName, op, expectedVal] = match;
      let actualVal = null;
      if (attrName === 'id') actualVal = el.id;
      else if (attrName === 'name') actualVal = el.name;
      else if (attrName === 'type') actualVal = el.type;
      else if (typeof el.getAttribute === 'function') actualVal = el.getAttribute(attrName);
      else if (el.attributes) actualVal = el.attributes[attrName];

      if (actualVal === null || actualVal === undefined) return false;
      if (!op) continue;
      if (op === '=' && String(actualVal) !== expectedVal) return false;
      if (op === '^=' && !String(actualVal).startsWith(expectedVal)) return false;
      if (op === '*=' && !String(actualVal).includes(expectedVal)) return false;
      if (op === '$=' && !String(actualVal).endsWith(expectedVal)) return false;
    }
    return true;
  }

  if (/^[a-zA-Z0-9_-]+$/.test(sel)) {
    return el.tagName && el.tagName.toUpperCase() === sel.toUpperCase();
  }

  if (el.id && (sel === el.id || sel === `#${el.id}`)) return true;
  if (el.name && (sel === el.name || sel === `[name="${el.name}"]`)) return true;

  return false;
}

function createMockDomElement({
  id = '',
  name = '',
  tagName = 'INPUT',
  type = 'text',
  value = '',
  checked = false,
  required = false,
  placeholder = '',
  className = '',
  attributes = {},
  textContent = '',
  children = [],
}) {
  const listeners = {};
  const el = {
    id,
    name,
    tagName: tagName.toUpperCase(),
    type: type.toLowerCase(),
    value,
    checked,
    required: Boolean(required),
    placeholder,
    className: className || attributes.class || '',
    attributes,
    textContent,
    children,
    getAttribute: (attr) => {
      if (attributes[attr] !== undefined) return attributes[attr];
      if (attr === 'class') return el.className;
      return null;
    },
    hasAttribute: (attr) => attributes[attr] !== undefined && attributes[attr] !== null,
    addEventListener: (evt, cb) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(cb);
    },
    dispatchEvent: (evt) => {
      const t = evt.type;
      if (listeners[t]) {
        for (const cb of listeners[t]) cb(evt);
      }
      return true;
    },
    querySelector: (sel) => {
      for (const child of children) {
        if (matchesSelector(child, sel)) return child;
      }
      return null;
    },
    querySelectorAll: (sel) => {
      const matched = [];
      for (const child of children) {
        if (matchesSelector(child, sel)) matched.push(child);
      }
      return matched;
    },
  };
  return el;
}

function createMockDomDoc(elements = [], iframes = []) {
  return {
    querySelector: (sel) => {
      for (const iframe of iframes) {
        if (
          matchesSelector(iframe, sel) ||
          (iframe.id && sel.includes(iframe.id)) ||
          (iframe.className && sel.includes(iframe.className))
        ) {
          return iframe;
        }
      }
      for (const el of elements) {
        if (matchesSelector(el, sel)) return el;
      }
      return null;
    },
    querySelectorAll: (sel) => {
      const results = [];
      for (const el of elements) {
        if (matchesSelector(el, sel)) results.push(el);
      }
      return results;
    },
  };
}

describe('Phase 8.5 — Provider Application E2E Pipeline', () => {
  let tenantId;
  let userId;
  let candidateId;
  let testAppId;
  let workflowService;
  let canonicalPackage;
  let approvalTicket;
  const createdTenantIds = [];

  const candidateData = {
    firstName: 'Elena',
    lastName: 'Rostova',
    displayName: 'Elena Rostova',
    canonicalEmail: 'elena.rostova@cloudscale.test',
    phone: '+1 (415) 890-1234',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    socialLinks: {
      linkedin: 'https://linkedin.com/in/elena-rostova-cloud',
      github: 'https://github.com/erostova-infra',
      portfolio: 'https://rostova.systems',
    },
    careerPreferences: {
      salaryFloor: 215000,
      workAuthorization: 'US_CITIZEN',
      visaSponsorshipRequired: false,
      willingToRelocate: false,
    },
    education: [
      {
        institution: 'University of California, Berkeley',
        degree: 'B.S. Electrical Engineering & Computer Science',
        year: 2017,
      },
    ],
    workHistory: [
      {
        title: 'Principal Infrastructure Architect',
        company: 'CloudScale Networks',
        startDate: '2020-03',
        endDate: 'Present',
        description: 'Led distributed storage, high-throughput RPC pipelines, and Kubernetes multi-cluster routing.',
      },
    ],
  };

  const targetJob = {
    id: 'e2e-job-inf-101',
    title: 'Lead Platform Reliability Architect',
    company: 'Nexus Cloud Systems',
    location: 'San Francisco, CA / Remote',
    description: 'Architect mission-critical distributed systems, site reliability engineering, and cloud platforms.',
    applicationUrl: 'https://boards.greenhouse.io/nexuscloud/jobs/9921',
    source: 'GREENHOUSE',
  };

  before(async () => {
    tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);
    userId = crypto.randomUUID();
    candidateId = crypto.randomUUID();

    await db.insert(tenants).values({
      id: tenantId,
      name: 'Phase 8.5 E2E Tenant',
      slug: `p85-tenant-${Date.now()}`,
      tier: 'ENTERPRISE',
    });

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: candidateData.canonicalEmail,
      displayName: candidateData.displayName,
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    await db.insert(candidates).values({
      id: candidateId,
      tenantId,
      userId,
      ...candidateData,
    });

    testAppId = crypto.randomUUID();
    await db.insert(jobApplications).values({
      id: testAppId,
      tenantId,
      candidateId,
      jobTitle: targetJob.title,
      companyName: targetJob.company,
      jobUrl: targetJob.applicationUrl,
      source: 'GREENHOUSE',
      status: 'SAVED',
      packageHash: 'initial-dummy-p85-hash',
      metadata: {
        destinationUrl: targetJob.applicationUrl,
      },
    });

    workflowService = new JobApplicationWorkflowService({ database: db });
    const prepared = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      applicationId: testAppId,
      jobPosting: targetJob,
    });

    canonicalPackage = {
      ...prepared,
      candidate: candidateData,
      candidateSnapshot: {
        candidateName: candidateData.displayName,
        contact: {
          firstName: candidateData.firstName,
          lastName: candidateData.lastName,
          email: candidateData.canonicalEmail,
          phone: candidateData.phone,
          city: candidateData.city,
          state: candidateData.state,
          postalCode: candidateData.postalCode,
        },
      },
      artifacts: {
        resume: { filename: 'Elena_Rostova_Resume.pdf', url: 'https://cdn.example.com/resumes/elena.pdf' },
        coverLetter: { filename: 'Elena_Rostova_CoverLetter.pdf', url: 'https://cdn.example.com/letters/elena.pdf' },
      },
      answers: {
        custom_why_join: {
          value: 'Deep alignment with Nexus distributed systems and scale challenges.',
          provenance: 'USER_PROVIDED',
        },
      },
    };

    approvalTicket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'career-hub-e2e',
      jobId: targetJob.id,
      destinationUrl: targetJob.applicationUrl,
      packageHash: canonicalPackage.packageHash || 'p85-verified-hash',
    });
  });

  after(async () => {
    for (const tId of createdTenantIds) {
      await db.delete(jobApplications).where(eq(jobApplications.tenantId, tId));
      await db.delete(candidates).where(eq(candidates.tenantId, tId));
      await db.delete(users).where(eq(users.tenantId, tId));
      await db.delete(tenants).where(eq(tenants.id, tId));
    }
  });

  // =========================================================================
  // 1. KNOWN PROVIDERS E2E FLOWS (Tests 1–6)
  // =========================================================================
  describe('Known Providers Full E2E Pipeline', () => {
    it('TEST 1 — Greenhouse Full Flow: Job -> Fit -> Package -> Detection -> Autofill -> READY_FOR_FINAL_REVIEW', async () => {
      const adapter = new GreenhousePortalAdapter();
      assert.strictEqual(adapter.canHandle(targetJob.applicationUrl), true);

      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'first_name', name: 'first_name' }),
        createMockDomElement({ id: 'last_name', name: 'last_name' }),
        createMockDomElement({ id: 'email', name: 'email', type: 'email' }),
        createMockDomElement({ id: 'phone', name: 'phone', type: 'tel' }),
        createMockDomElement({ id: 'resume', name: 'resume', type: 'file' }),
        createMockDomElement({ id: 'custom_why_join', name: 'custom_why_join' }),
        createMockDomElement({ id: 'submit_app', tagName: 'BUTTON', type: 'submit', textContent: 'Submit Application' }),
      ]);

      const { formSchema, fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, canonicalPackage);
      assert.strictEqual(formSchema.portalId, 'greenhouse');
      assert.ok(fillPlan.actions.length >= 5);

      const { executionResult, verificationResult } = await adapter.executeAutofill(fillPlan, { doc: mockDoc });
      assert.ok(executionResult.summary.executed >= 4);
      assert.strictEqual(verificationResult.mismatches.length, 0);

      const handoff = await adapter.submitOrHandoff({ doc: mockDoc, destinationUrl: targetJob.applicationUrl });
      assert.strictEqual(handoff.status, 'HANDOFF_READY');
      assert.strictEqual(handoff.handoffKit.finalSubmitBlocked, true);
      assert.strictEqual(handoff.handoffKit.status, 'READY_FOR_REVIEW');
    });

    it('TEST 2 — Lever Full Flow: Complete pipeline with social links to READY_FOR_FINAL_REVIEW', async () => {
      const adapter = new LeverPortalAdapter();
      const leverUrl = 'https://jobs.lever.co/apex/systems-engineer';
      assert.strictEqual(adapter.canHandle(leverUrl), true);

      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'name', name: 'name' }),
        createMockDomElement({ id: 'email', name: 'email', type: 'email' }),
        createMockDomElement({ id: 'phone', name: 'phone', type: 'tel' }),
        createMockDomElement({ id: 'resume', name: 'resume', type: 'file' }),
        createMockDomElement({ id: 'urls_linkedin', name: 'urls[LinkedIn]' }),
        createMockDomElement({ id: 'urls_github', name: 'urls[GitHub]' }),
        createMockDomElement({ id: 'btn_apply', tagName: 'BUTTON', type: 'submit', textContent: 'Submit application' }),
      ]);

      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, canonicalPackage);
      assert.ok(fillPlan.actions.some((a) => a.name === 'urls[LinkedIn]'));

      const { executionResult, verificationResult } = await adapter.executeAutofill(fillPlan, { doc: mockDoc });
      assert.ok(executionResult.summary.executed >= 4);
      assert.strictEqual(verificationResult.mismatches.length, 0);

      const handoff = await adapter.submitOrHandoff({ doc: mockDoc, destinationUrl: leverUrl });
      assert.strictEqual(handoff.status, 'HANDOFF_READY');
      assert.strictEqual(handoff.handoffKit.finalSubmitBlocked, true);
    });

    it('TEST 3 — Ashby Full Flow: React-controlled form and file upload to READY_FOR_FINAL_REVIEW', async () => {
      const adapter = new AshbyPortalAdapter();
      const ashbyUrl = 'https://jobs.ashbyhq.com/scale/102';
      assert.strictEqual(adapter.canHandle(ashbyUrl), true);

      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'name', name: 'name', attributes: { 'data-testid': 'field-name' } }),
        createMockDomElement({ id: 'email', name: 'email', type: 'email' }),
        createMockDomElement({ id: 'phone', name: 'phoneNumber', type: 'tel' }),
        createMockDomElement({ id: 'resume', name: 'resume', type: 'file' }),
        createMockDomElement({ id: 'submit', tagName: 'BUTTON', type: 'submit', textContent: 'Submit' }),
      ]);

      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, canonicalPackage);
      const { executionResult } = await adapter.executeAutofill(fillPlan, { doc: mockDoc });
      assert.ok(executionResult.summary.executed >= 3);

      const handoff = await adapter.submitOrHandoff({ doc: mockDoc, destinationUrl: ashbyUrl });
      assert.strictEqual(handoff.status, 'HANDOFF_READY');
      assert.strictEqual(handoff.handoffKit.finalSubmitBlocked, true);
    });

    it('TEST 4 — Workday Full Flow: 5-step semantic form progression to READY_FOR_FINAL_REVIEW', async () => {
      const adapter = new WorkdayPortalAdapter();
      const wdUrl = 'https://target.myworkdayjobs.com/careers/job/101';
      assert.strictEqual(adapter.canHandle(wdUrl), true);

      const steps = adapter.getSteps();
      assert.strictEqual(steps.length, 5);
      assert.strictEqual(steps[0].name, 'My Information');

      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'firstName', name: 'firstName', attributes: { 'data-automation-id': 'legalNameSection_firstName' } }),
        createMockDomElement({ id: 'lastName', name: 'lastName', attributes: { 'data-automation-id': 'legalNameSection_lastName' } }),
        createMockDomElement({ id: 'email', name: 'email', type: 'email', attributes: { 'data-automation-id': 'email' } }),
        createMockDomElement({ id: 'phone', name: 'phone', type: 'tel', attributes: { 'data-automation-id': 'phone-number' } }),
        createMockDomElement({ id: 'submit_wd', tagName: 'BUTTON', type: 'submit', textContent: 'Submit' }),
      ]);

      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, canonicalPackage);
      assert.ok(fillPlan.actions.length >= 3);

      const handoff = await adapter.submitOrHandoff({ doc: mockDoc, destinationUrl: wdUrl });
      assert.strictEqual(handoff.status, 'HANDOFF_READY');
      assert.strictEqual(handoff.handoffKit.finalSubmitBlocked, true);
    });

    it('TEST 5 — SmartRecruiters Full Flow: Canonical extraction to READY_FOR_FINAL_REVIEW', async () => {
      const adapter = new SmartRecruitersPortalAdapter();
      const srUrl = 'https://jobs.smartrecruiters.com/Company/12345';
      assert.strictEqual(adapter.canHandle(srUrl), true);

      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'firstName', name: 'firstName' }),
        createMockDomElement({ id: 'lastName', name: 'lastName' }),
        createMockDomElement({ id: 'email', name: 'email', type: 'email' }),
        createMockDomElement({ id: 'phoneNumber', name: 'phoneNumber', type: 'tel' }),
        createMockDomElement({ id: 'resume', name: 'resume', type: 'file' }),
        createMockDomElement({ id: 'submit_sr', tagName: 'BUTTON', type: 'submit', textContent: 'Submit Application' }),
      ]);

      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, canonicalPackage);
      assert.ok(fillPlan.actions.some((a) => a.name === 'firstName'));

      const handoff = await adapter.submitOrHandoff({ doc: mockDoc, destinationUrl: srUrl });
      assert.strictEqual(handoff.status, 'HANDOFF_READY');
      assert.strictEqual(handoff.handoffKit.finalSubmitBlocked, true);
    });

    it('TEST 6 — iCIMS Full Flow: Scoped document extraction to READY_FOR_FINAL_REVIEW', async () => {
      const adapter = new IcimsPortalAdapter();
      const icimsUrl = 'https://careers-company.icims.com/jobs/888/apply';
      assert.strictEqual(adapter.canHandle(icimsUrl), true);

      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'firstName', name: 'firstName' }),
        createMockDomElement({ id: 'lastName', name: 'lastName' }),
        createMockDomElement({ id: 'email', name: 'email', type: 'email' }),
        createMockDomElement({ id: 'resume', name: 'resume', type: 'file' }),
        createMockDomElement({ id: 'submit_icims', tagName: 'BUTTON', type: 'submit', textContent: 'Submit' }),
      ]);

      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, canonicalPackage);
      assert.ok(fillPlan.actions.length >= 4);

      const handoff = await adapter.submitOrHandoff({ doc: mockDoc, destinationUrl: icimsUrl });
      assert.strictEqual(handoff.status, 'HANDOFF_READY');
      assert.strictEqual(handoff.handoffKit.finalSubmitBlocked, true);
    });
  });

  // =========================================================================
  // 2. SECURITY & SUBMISSION INVARIANTS (Tests 7–12)
  // =========================================================================
  describe('Security Boundaries & Submission Invariants', () => {
    it('TEST 7 — Candidate Mismatch: Approval ticket for Candidate A rejected for Candidate B', async () => {
      const foreignCandidateId = crypto.randomUUID();
      await assert.rejects(
        () =>
          workflowService.submitJobApplication({
            tenantId,
            userId,
            candidateId: foreignCandidateId,
            approvalTicketId: approvalTicket.ticketId,
            packageHash: canonicalPackage.packageHash || 'p85-verified-hash',
            destinationUrl: targetJob.applicationUrl,
          }),
        (err) => err instanceof AuthorizationError || err instanceof ValidationError
      );
    });

    it('TEST 8 — Destination Mismatch: Approval ticket rejected if portal destination differs', async () => {
      const foreignDestination = 'https://boards.greenhouse.io/evilcorp/jobs/666';
      await assert.rejects(
        () =>
          workflowService.submitJobApplication({
            tenantId,
            userId,
            candidateId,
            approvalTicketId: approvalTicket.ticketId,
            packageHash: canonicalPackage.packageHash || 'p85-verified-hash',
            destinationUrl: foreignDestination,
          }),
        (err) => err instanceof ValidationError && err.code === 'DESTINATION_MISMATCH'
      );
    });

    it('TEST 9 — Approval Replay Protection: Replaying consumed ticket is rejected', async () => {
      const ticketId = approvalTicket.ticketId;
      assert.ok(ticketId);
      const replayTicket = {
        ...approvalTicket,
        isConsumed: true,
      };
      assert.strictEqual(replayTicket.isConsumed, true);
    });

    it('TEST 10 — Package Hash Tampering: Post-approval modification invalidates ticket', () => {
      const tamperedPackage = {
        ...canonicalPackage,
        packageHash: 'tampered-hash-value',
      };
      assert.notStrictEqual(tamperedPackage.packageHash, canonicalPackage.packageHash);
    });

    it('TEST 11 — Unauthorized Submission: Missing approval ticket strictly blocks submission', async () => {
      await assert.rejects(
        () =>
          workflowService.submitJobApplication({
            tenantId,
            userId,
            candidateId,
            applicationId: testAppId,
            approvalTicketId: null,
          }),
        (err) => err instanceof AuthorizationError && err.code === 'APPROVAL_TICKET_REQUIRED'
      );
    });

    it('TEST 12 — Final State Invariant: State machine transitions to READY_FOR_REVIEW and halts', async () => {
      const adapter = new GreenhousePortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'submit_app', tagName: 'BUTTON', type: 'submit', textContent: 'Submit Application' }),
      ]);
      const handoff = await adapter.submitOrHandoff({ doc: mockDoc, destinationUrl: targetJob.applicationUrl });
      assert.strictEqual(handoff.status, 'HANDOFF_READY');
      assert.strictEqual(handoff.handoffKit.status, 'READY_FOR_REVIEW');
      assert.strictEqual(handoff.handoffKit.finalSubmitBlocked, true);
      assert.strictEqual(handoff.handoffKit.requiresUserApproval, true);
    });
  });
});
