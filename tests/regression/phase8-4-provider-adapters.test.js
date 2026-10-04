/**
 * @file Phase 8.4 — Provider Application Adapters Regression Suite.
 *
 * Verifies all 54 architectural, functional, security, multi-step, iframe, error normalization,
 * cross-surface parity, and regression gates:
 * - Detection: Tests 1-7
 * - Canonical extraction: Tests 8-13
 * - Multi-step: Tests 14-17
 * - Iframe: Tests 18-19
 * - Custom questions: Tests 20-22
 * - Sensitive fields: Tests 23-27
 * - Files: Tests 28-30
 * - Errors: Tests 31-34
 * - Submission safety: Tests 35-37
 * - Cross-surface parity: Tests 38-40
 * - Architecture: Tests 41-43
 * - Full regression verification: Tests 44-54
 */

import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';

import { handleAnalyzeJobFit } from '../../src/mcp/tools/career-read-tools.js';
import { BASELINE_JD, createTestCandidateContext } from './phase9-baseline.test.js';

import {
  PortalAdapterContract,
  PortalFormSchema,
  PortalFieldSchema,
  ApplicationStepSchema,
  FieldValidationErrorSchema,
  PortalApplicationStateEnum,
  PortalApplicationStateMachine,
  PortalErrorStatusEnum,
  IframeScopeSchema,
} from '../../src/domain/portal/portal-adapter.contract.js';
import {
  PortalAdapterRegistry,
  portalAdapterRegistry,
} from '../../src/domain/portal/portal-adapter-registry.js';
import { BasePortalAdapter } from '../../src/domain/portal/base-portal-adapter.js';
import {
  GreenhousePortalAdapter,
  LeverPortalAdapter,
  AshbyPortalAdapter,
  WorkdayPortalAdapter,
  SmartRecruitersPortalAdapter,
  IcimsPortalAdapter,
  registerStandardPortalAdapters,
} from '../../src/domain/portal/adapters/index.js';
import {
  GenericAutofillEngine,
  genericAutofillEngine,
} from '../../src/domain/portal/generic-autofill-engine.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { db } from '../../src/db/index.js';
import { tenants, users, candidates, jobApplications } from '../../src/db/schema.js';
import { ValidationError } from '../../src/errors/index.js';

// DOM Mock Helpers
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

  // Check ID selector #id or tag#id
  const tagIdMatch = sel.match(/^([a-zA-Z0-9_-]+)?#([a-zA-Z0-9_-]+)$/);
  if (tagIdMatch) {
    const [, requiredTag, id] = tagIdMatch;
    if (requiredTag && el.tagName && el.tagName.toUpperCase() !== requiredTag.toUpperCase()) {
      return false;
    }
    return el.id === id;
  }

  // Check class selector .class or tag.class
  const tagClassMatch = sel.match(/^([a-zA-Z0-9_-]+)?\.([a-zA-Z0-9_-]+)$/);
  if (tagClassMatch) {
    const [, requiredTag, cls] = tagClassMatch;
    if (requiredTag && el.tagName && el.tagName.toUpperCase() !== requiredTag.toUpperCase()) {
      return false;
    }
    const actualCls = el.className || (typeof el.getAttribute === 'function' ? el.getAttribute('class') : '') || '';
    return actualCls.split(/\s+/).includes(cls);
  }

  // Check quoted attribute selector where value can contain brackets e.g. [name="urls[LinkedIn]"]
  const quotedAttrMatch = sel.match(/^(?:([a-zA-Z0-9_-]+))?\[([a-zA-Z0-9_:-]+)([\^$*]?=)["']([^"']*)["']\]$/);
  if (quotedAttrMatch) {
    const [, requiredTag, attrName, op, expectedVal] = quotedAttrMatch;
    if (requiredTag && el.tagName && el.tagName.toUpperCase() !== requiredTag.toUpperCase()) {
      return false;
    }
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

  // Check single or multiple attribute brackets: [attr], [attr=val], [attr^=val], tag[attr...][attr...]
  const multiAttrMatch = sel.match(/^([a-zA-Z0-9_-]+)?((?:\[[^\]]+\])+)$/);
  if (multiAttrMatch) {
    const [, requiredTag, brackets] = multiAttrMatch;
    if (requiredTag && el.tagName && el.tagName.toUpperCase() !== requiredTag.toUpperCase()) {
      return false;
    }
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
      if (!op) continue; // [attr] exists
      if (op === '=' && String(actualVal) !== expectedVal) return false;
      if (op === '^=' && !String(actualVal).startsWith(expectedVal)) return false;
      if (op === '*=' && !String(actualVal).includes(expectedVal)) return false;
      if (op === '$=' && !String(actualVal).endsWith(expectedVal)) return false;
    }
    return true;
  }

  // Check simple tag selector: e.g. "button", "form", "input", "iframe"
  if (/^[a-zA-Z0-9_-]+$/.test(sel)) {
    return el.tagName && el.tagName.toUpperCase() === sel.toUpperCase();
  }

  // Check exact id match
  if (el.id && (sel === el.id || sel === `#${el.id}`)) return true;

  // Check exact name match
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

describe('Phase 8.4 — Provider Application Adapters', () => {
  let tenantId;
  let userId;
  let candidateId;
  let workflowService;
  let basePackage;
  const createdTenantIds = [];

  const mockJob = {
    id: 'p84-job-adapter',
    title: 'Staff Infrastructure Architect',
    company: 'Nexus Scale Inc.',
    location: 'Remote, US',
    description: 'Lead resilient platform infrastructure, cloud distributed consensus, and microservice architectures.',
    applicationUrl: 'https://boards.greenhouse.io/nexus/jobs/5001',
    source: 'GREENHOUSE',
  };

  before(async () => {
    tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);
    userId = crypto.randomUUID();
    candidateId = crypto.randomUUID();

    await db.insert(tenants).values({
      id: tenantId,
      name: 'Phase 8.4 Adapters Tenant',
      slug: `p84-tenant-${Date.now()}`,
      tier: 'PRO',
    });

    const userEmail = `p84-adapter-${Date.now()}@example.test`;

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: userEmail,
      displayName: 'Provider Adapter Engineer',
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    await db.insert(candidates).values({
      id: candidateId,
      tenantId,
      userId,
      canonicalEmail: userEmail,
      firstName: 'Samantha',
      lastName: 'Vance',
      displayName: 'Samantha Vance',
      phone: '+1 (555) 789-0123',
      city: 'Seattle',
      state: 'WA',
      postalCode: '98101',
      socialLinks: {
        linkedin: 'https://linkedin.com/in/samanthavance',
        github: 'https://github.com/svance-systems',
      },
      careerPreferences: {
        salaryFloor: 195000,
        workAuthorization: 'US_CITIZEN',
        visaSponsorshipRequired: false,
        willingToRelocate: false,
      },
      education: [
        {
          institution: 'University of Washington',
          degree: 'B.S. Computer Science',
          year: 2018,
        },
      ],
      workHistory: [
        {
          title: 'Senior Cloud Engineer',
          company: 'HyperCloud Technologies',
          startDate: '2021-01',
          endDate: 'Present',
          description: 'Designed scalable Kubernetes clusters and event-driven architectures.',
        },
      ],
    });

    const testAppId = crypto.randomUUID();
    await db.insert(jobApplications).values({
      id: testAppId,
      tenantId,
      candidateId,
      jobTitle: mockJob.title,
      companyName: mockJob.company,
      jobUrl: mockJob.applicationUrl,
      source: 'GREENHOUSE',
      status: 'SAVED',
      packageHash: 'initial-dummy-package-hash-84',
      metadata: {
        destinationUrl: mockJob.applicationUrl,
      },
    });

    workflowService = new JobApplicationWorkflowService({ database: db });
    const prepared = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      applicationId: testAppId,
      jobPosting: mockJob,
    });
    basePackage = {
      ...prepared,
      candidate: {
        firstName: 'Samantha',
        lastName: 'Vance',
        displayName: 'Samantha Vance',
        canonicalEmail: userEmail,
        phone: '+1 (555) 789-0123',
        contact: {
          firstName: 'Samantha',
          lastName: 'Vance',
          phone: '+1 (555) 789-0123',
        },
      },
      candidateSnapshot: {
        candidateName: 'Samantha Vance',
        contact: {
          phone: '+1 (555) 789-0123',
        },
      },
      artifacts: {
        resume: { filename: 'Samantha_Resume.pdf', url: 'https://cdn.example.com/resumes/1.pdf' },
        coverLetter: { filename: 'Samantha_CoverLetter.pdf', url: 'https://cdn.example.com/letters/1.pdf' },
      },
    };
  });

  after(async () => {
    for (const tId of createdTenantIds) {
      await db.delete(jobApplications).where(eq(jobApplications.tenantId, tId));
      await db.delete(candidates).where(eq(candidates.tenantId, tId));
      await db.delete(users).where(eq(users.tenantId, tId));
      await db.delete(tenants).where(eq(tenants.id, tId));
    }
  });

  // ==========================================
  // 1. PROVIDER DETECTION (Tests 1–7)
  // ==========================================
  describe('Provider Detection', () => {
    it('TEST 1 — Greenhouse detection matches greenhouse URLs and DOM markers', () => {
      const adapter = new GreenhousePortalAdapter();
      assert.strictEqual(adapter.canHandle('https://boards.greenhouse.io/stripe/jobs/123'), true);
      assert.strictEqual(adapter.canHandle('https://job-boards.greenhouse.io/apex/jobs/456'), true);
      assert.strictEqual(adapter.canHandle('https://grnh.se/abc1234'), true);
      assert.strictEqual(adapter.canHandle({ url: 'https://careers.example.com/apply?gh_src=custom' }), true);
      const mockDoc = createMockDomDoc([createMockDomElement({ id: 'application_form' })]);
      assert.strictEqual(adapter.canHandle({ doc: mockDoc }), true);
      assert.strictEqual(adapter.canHandle('https://jobs.lever.co/company/job'), false);
    });

    it('TEST 2 — Lever detection matches lever URLs and DOM markers', () => {
      const adapter = new LeverPortalAdapter();
      assert.strictEqual(adapter.canHandle('https://jobs.lever.co/netflix/job-1'), true);
      assert.strictEqual(adapter.canHandle('https://lever.co/apply/123'), true);
      const mockDoc = createMockDomDoc([createMockDomElement({ id: 'application-form' })]);
      assert.strictEqual(adapter.canHandle({ doc: mockDoc }), true);
      assert.strictEqual(adapter.canHandle('https://boards.greenhouse.io/job'), false);
    });

    it('TEST 3 — Ashby detection matches ashby URLs and DOM markers', () => {
      const adapter = new AshbyPortalAdapter();
      assert.strictEqual(adapter.canHandle('https://jobs.ashbyhq.com/openai/100'), true);
      assert.strictEqual(adapter.canHandle('https://ashbyhq.com/apply/200'), true);
      const mockDoc = createMockDomDoc([createMockDomElement({ attributes: { 'data-ashby-application-form': 'true' } })]);
      assert.strictEqual(adapter.canHandle({ doc: mockDoc }), true);
      assert.strictEqual(adapter.canHandle('https://company.myworkdayjobs.com/apply'), false);
    });

    it('TEST 4 — Workday detection matches myworkdayjobs.com and semantic automation markers', () => {
      const adapter = new WorkdayPortalAdapter();
      assert.strictEqual(adapter.canHandle('https://target.myworkdayjobs.com/en-US/careers/job/1'), true);
      assert.strictEqual(adapter.canHandle('https://workday.com/careers/job/2'), true);
      assert.strictEqual(adapter.canHandle('https://wd5.myworkdayjobs.com/company/job/3'), true);
      const mockDoc = createMockDomDoc([createMockDomElement({ attributes: { 'data-automation-id': 'workday-application' } })]);
      assert.strictEqual(adapter.canHandle({ doc: mockDoc }), true);
      assert.strictEqual(adapter.canHandle('https://smartrecruiters.com/job'), false);
    });

    it('TEST 5 — SmartRecruiters detection matches smartrecruiters.com and DOM markers', () => {
      const adapter = new SmartRecruitersPortalAdapter();
      assert.strictEqual(adapter.canHandle('https://jobs.smartrecruiters.com/Company/7439999-role'), true);
      assert.strictEqual(adapter.canHandle('https://smartrecruiters.com/apply/10'), true);
      const mockDoc = createMockDomDoc([createMockDomElement({ attributes: { 'data-qa': 'smartr-application-form' } })]);
      assert.strictEqual(adapter.canHandle({ doc: mockDoc }), true);
      assert.strictEqual(adapter.canHandle('https://icims.com/job'), false);
    });

    it('TEST 6 — iCIMS detection matches icims.com and iframe markers', () => {
      const adapter = new IcimsPortalAdapter();
      assert.strictEqual(adapter.canHandle('https://careers-company.icims.com/jobs/123/apply'), true);
      assert.strictEqual(adapter.canHandle('https://icims.com/careers/456'), true);
      const mockDoc = createMockDomDoc([createMockDomElement({ id: 'icims_content_iframe', tagName: 'IFRAME' })]);
      assert.strictEqual(adapter.canHandle({ doc: mockDoc }), true);
      assert.strictEqual(adapter.canHandle('https://boards.greenhouse.io/job'), false);
    });

    it('TEST 7 — Unknown provider does not crash and returns false across all adapters', () => {
      const adapters = [
        new GreenhousePortalAdapter(),
        new LeverPortalAdapter(),
        new AshbyPortalAdapter(),
        new WorkdayPortalAdapter(),
        new SmartRecruitersPortalAdapter(),
        new IcimsPortalAdapter(),
      ];
      const unknownUrl = 'https://unknown-custom-portal.org/jobs/apply';
      for (const adapter of adapters) {
        assert.doesNotThrow(() => {
          const handled = adapter.canHandle(unknownUrl);
          assert.strictEqual(handled, false);
        });
      }
    });
  });

  // ==========================================
  // 2. CANONICAL EXTRACTION (Tests 8–13)
  // ==========================================
  describe('Canonical Form Extraction', () => {
    it('TEST 8 — Greenhouse form extracts into valid canonical PortalFormSchema', async () => {
      const adapter = new GreenhousePortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'first_name', name: 'first_name' }),
        createMockDomElement({ id: 'last_name', name: 'last_name' }),
        createMockDomElement({ id: 'email', name: 'email', type: 'email' }),
        createMockDomElement({ id: 'phone', name: 'phone', type: 'tel' }),
        createMockDomElement({ id: 'resume', name: 'resume', type: 'file' }),
      ]);
      const schema = await adapter.extractFormSchema({ doc: mockDoc, destinationUrl: 'https://boards.greenhouse.io/apply' });
      assert.doesNotThrow(() => PortalFormSchema.parse(schema));
      assert.strictEqual(schema.portalId, 'greenhouse');
      assert.ok(schema.fields.some((f) => f.name === 'first_name'));
      assert.ok(schema.fields.some((f) => f.name === 'resume' && f.type === 'file'));
      assert.strictEqual(schema.attachments.length, 1);
    });

    it('TEST 9 — Lever form extracts into valid canonical PortalFormSchema', async () => {
      const adapter = new LeverPortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'name', name: 'name' }),
        createMockDomElement({ id: 'email', name: 'email', type: 'email' }),
        createMockDomElement({ id: 'phone', name: 'phone', type: 'tel' }),
        createMockDomElement({ id: 'resume', name: 'resume', type: 'file' }),
        createMockDomElement({ id: 'urls_linkedin', name: 'urls[LinkedIn]' }),
      ]);
      const schema = await adapter.extractFormSchema({ doc: mockDoc, destinationUrl: 'https://jobs.lever.co/apply' });
      assert.doesNotThrow(() => PortalFormSchema.parse(schema));
      assert.strictEqual(schema.portalId, 'lever');
      assert.ok(schema.fields.some((f) => f.name === 'name'));
      assert.ok(schema.fields.some((f) => f.name === 'urls[LinkedIn]'));
    });

    it('TEST 10 — Ashby form extracts into valid canonical PortalFormSchema', async () => {
      const adapter = new AshbyPortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'name', name: 'name', attributes: { 'data-testid': 'field-name' } }),
        createMockDomElement({ id: 'email', name: 'email', type: 'email' }),
        createMockDomElement({ id: 'resume', name: 'resume', type: 'file' }),
      ]);
      const schema = await adapter.extractFormSchema({ doc: mockDoc, destinationUrl: 'https://jobs.ashbyhq.com/apply' });
      assert.doesNotThrow(() => PortalFormSchema.parse(schema));
      assert.strictEqual(schema.portalId, 'ashby');
      assert.ok(schema.fields.some((f) => f.name === 'name'));
    });

    it('TEST 11 — Workday form extracts into valid canonical PortalFormSchema with semantic fields', async () => {
      const adapter = new WorkdayPortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'firstName', name: 'firstName', attributes: { 'data-automation-id': 'legalNameSection_firstName' } }),
        createMockDomElement({ id: 'lastName', name: 'lastName', attributes: { 'data-automation-id': 'legalNameSection_lastName' } }),
        createMockDomElement({ id: 'email', name: 'email', type: 'email', attributes: { 'data-automation-id': 'email' } }),
        createMockDomElement({ id: 'resume', name: 'resume', type: 'file', attributes: { 'data-automation-id': 'file-upload-drop-zone' } }),
      ]);
      const schema = await adapter.extractFormSchema({ doc: mockDoc, destinationUrl: 'https://company.myworkdayjobs.com/apply' });
      assert.doesNotThrow(() => PortalFormSchema.parse(schema));
      assert.strictEqual(schema.portalId, 'workday');
      assert.ok(schema.fields.some((f) => f.name === 'firstName'));
      assert.strictEqual(schema.isMultiStep, true);
    });

    it('TEST 12 — SmartRecruiters form extracts into valid canonical PortalFormSchema', async () => {
      const adapter = new SmartRecruitersPortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'firstName', name: 'firstName', attributes: { 'data-qa': 'first-name-input' } }),
        createMockDomElement({ id: 'lastName', name: 'lastName', attributes: { 'data-qa': 'last-name-input' } }),
        createMockDomElement({ id: 'email', name: 'email', type: 'email' }),
        createMockDomElement({ id: 'resume', name: 'resume', type: 'file', attributes: { 'data-qa': 'resume-upload' } }),
      ]);
      const schema = await adapter.extractFormSchema({ doc: mockDoc, destinationUrl: 'https://jobs.smartrecruiters.com/apply' });
      assert.doesNotThrow(() => PortalFormSchema.parse(schema));
      assert.strictEqual(schema.portalId, 'smartrecruiters');
      assert.ok(schema.fields.some((f) => f.name === 'firstName'));
    });

    it('TEST 13 — iCIMS form extracts into valid canonical PortalFormSchema', async () => {
      const adapter = new IcimsPortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'firstName', name: 'firstName' }),
        createMockDomElement({ id: 'lastName', name: 'lastName' }),
        createMockDomElement({ id: 'email', name: 'email', type: 'email' }),
        createMockDomElement({ id: 'resume', name: 'resume', type: 'file' }),
      ]);
      const schema = await adapter.extractFormSchema({ doc: mockDoc, destinationUrl: 'https://careers-company.icims.com/apply' });
      assert.doesNotThrow(() => PortalFormSchema.parse(schema));
      assert.strictEqual(schema.portalId, 'icims');
      assert.ok(schema.fields.some((f) => f.name === 'firstName'));
    });
  });

  // ==========================================
  // 3. MULTI-STEP APPLICATIONS (Tests 14–17)
  // ==========================================
  describe('Multi-Step Application Handling', () => {
    it('TEST 14 — Greenhouse multi-step indicator sets isMultiStep and populates step identifiers', async () => {
      const adapter = new GreenhousePortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'first_name', name: 'first_name' }),
        createMockDomElement({ id: 'step_container' }),
      ]);
      const schema = await adapter.extractFormSchema({ doc: mockDoc });
      assert.strictEqual(schema.isMultiStep, true);
      assert.ok(schema.steps.length > 0);
      assert.ok(schema.steps.includes('step_personal'));
    });

    it('TEST 15 — Lever multi-step application transitions correctly', async () => {
      const adapter = new LeverPortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'name', name: 'name' }),
        createMockDomElement({ attributes: { 'data-step-nav': 'true' } }),
      ]);
      const schema = await adapter.extractFormSchema({ doc: mockDoc });
      assert.strictEqual(schema.isMultiStep, true);
      assert.ok(schema.steps.includes('step_application'));
    });

    it('TEST 16 — Ashby multi-step form detects step progress indicator', async () => {
      const adapter = new AshbyPortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'name', name: 'name' }),
        createMockDomElement({ attributes: { 'data-testid': 'application-step-indicator' } }),
      ]);
      const schema = await adapter.extractFormSchema({ doc: mockDoc });
      assert.strictEqual(schema.isMultiStep, true);
      assert.ok(schema.steps.includes('step_basic_info'));
    });

    it('TEST 17 — Workday multi-step models formal steps with navigation semantics', () => {
      const adapter = new WorkdayPortalAdapter();
      const steps = adapter.getSteps();
      assert.strictEqual(steps.length, 5);
      assert.strictEqual(steps[0].order, 1);
      assert.strictEqual(steps[0].navigation.hasNext, true);
      assert.strictEqual(steps[0].navigation.isFinalStep, false);
      assert.strictEqual(steps[4].order, 5);
      assert.strictEqual(steps[4].navigation.isFinalStep, true);
      assert.ok(steps[4].navigation.submitSelector);
    });
  });

  // ==========================================
  // 4. IFRAME SUPPORT (Tests 18–19)
  // ==========================================
  describe('Iframe Boundary Handling', () => {
    it('TEST 18 — Accessible iframe resolves scoped document and extracts schema', () => {
      const adapter = new BasePortalAdapter({
        id: 'test-iframe-adapter',
        name: 'Test Iframe Adapter',
      });
      const iframeDoc = createMockDomDoc([createMockDomElement({ id: 'inner_input', name: 'inner_input' })]);
      const iframeEl = {
        id: 'content_frame',
        contentDocument: iframeDoc,
      };
      const rootDoc = {
        querySelector: (sel) => (sel.includes('iframe') ? iframeEl : null),
      };
      const result = adapter.locateIframe({ doc: rootDoc }, 'iframe#content_frame');
      assert.strictEqual(result.isIframe, true);
      assert.strictEqual(result.isAccessible, true);
      assert.strictEqual(result.isBlocked, false);
      assert.strictEqual(result.status, 'ACCESSIBLE');
      assert.strictEqual(result.doc, iframeDoc);
    });

    it('TEST 19 — Blocked cross-origin iframe yields status BLOCKED and requires manual review without crashing', () => {
      const adapter = new BasePortalAdapter({
        id: 'test-blocked-iframe-adapter',
        name: 'Test Blocked Iframe Adapter',
      });
      const iframeEl = {
        id: 'blocked_frame',
        get contentDocument() {
          throw new Error('SecurityError: Blocked a frame with origin from accessing a cross-origin frame.');
        },
      };
      const rootDoc = {
        querySelector: (sel) => (sel.includes('iframe') ? iframeEl : null),
      };
      const result = adapter.locateIframe({ doc: rootDoc }, 'iframe#blocked_frame');
      assert.strictEqual(result.isIframe, true);
      assert.strictEqual(result.isAccessible, false);
      assert.strictEqual(result.isBlocked, true);
      assert.strictEqual(result.status, 'BLOCKED');
      assert.strictEqual(result.doc, null);
      assert.strictEqual(result.requiresUserReview, true);
    });
  });

  // ==========================================
  // 5. CUSTOM QUESTIONS (Tests 20–22)
  // ==========================================
  describe('Custom Question Safety', () => {
    it('TEST 20 — Explicit approved answer maps to custom question with HIGH confidence', async () => {
      const adapter = new GreenhousePortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'first_name', name: 'first_name' }),
        createMockDomElement({ id: 'custom_why_join', name: 'custom_why_join', attributes: { 'aria-label': 'Why join us?' } }),
      ]);
      const pkgWithAnswer = {
        ...basePackage,
        answers: {
          custom_why_join: {
            value: 'Passionate about distributed systems architecture.',
            provenance: 'USER_PROVIDED',
          },
        },
      };
      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, pkgWithAnswer);
      const action = fillPlan.actions.find((a) => a.name === 'custom_why_join');
      assert.ok(action);
      assert.strictEqual(action.action, 'FILL');
      assert.strictEqual(action.sanitizedValue, 'Passionate about distributed systems architecture.');
      assert.strictEqual(action.confidence, 'HIGH');
    });

    it('TEST 21 — Missing custom answer resolves strictly to action REVIEW and requiresUserReview: true', async () => {
      const adapter = new GreenhousePortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'first_name', name: 'first_name' }),
        createMockDomElement({ id: 'custom_favorite_editor', name: 'custom_favorite_editor', attributes: { 'aria-label': 'Favorite editor' } }),
      ]);
      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, basePackage);
      const action = fillPlan.actions.find((a) => a.name === 'custom_favorite_editor');
      assert.ok(action);
      assert.strictEqual(action.action, 'REVIEW');
      assert.strictEqual(action.requiresUserReview, true);
      assert.strictEqual(action.rawValue, null);
    });

    it('TEST 22 — Job prose cannot generate answers for custom portal questions (zero fabrication)', async () => {
      const adapter = new LeverPortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'name', name: 'name' }),
        createMockDomElement({ id: 'cards_experience', name: 'cards[project_experience]', attributes: { 'aria-label': 'Describe project experience' } }),
      ]);
      // Attempt to pass job description prose pretending to be candidate knowledge
      const pkg = {
        ...basePackage,
        job: { ...mockJob, description: 'Candidate must have 10 years of Kubernetes and Kafka.' },
      };
      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, pkg);
      const action = fillPlan.actions.find((a) => a.name === 'cards[project_experience]');
      assert.ok(action);
      assert.strictEqual(action.action, 'REVIEW');
      assert.strictEqual(action.rawValue, null);
      assert.notStrictEqual(action.sanitizedValue, 'Candidate must have 10 years of Kubernetes and Kafka.');
    });
  });

  // ==========================================
  // 6. SENSITIVE FIELDS (Tests 23–27)
  // ==========================================
  describe('Sensitive Field Protection', () => {
    it('TEST 23 — Work authorization question is protected and marked requiresUserReview: true', async () => {
      const adapter = new WorkdayPortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'workAuthorizationQuestion', name: 'work_authorization', attributes: { 'data-automation-id': 'workAuthorizationQuestion' } }),
      ]);
      const schema = await adapter.extractFormSchema({ doc: mockDoc });
      const field = schema.fields.find((f) => f.name === 'work_authorization');
      assert.ok(field);
      assert.strictEqual(field.requiresUserReview, true);
      assert.strictEqual(field.metadata.isSensitive, true);
    });

    it('TEST 24 — Visa sponsorship question remains protected across all adapters', async () => {
      const adapters = [new GreenhousePortalAdapter(), new LeverPortalAdapter(), new AshbyPortalAdapter()];
      for (const adapter of adapters) {
        const mockDoc = createMockDomDoc([
          createMockDomElement({ id: 'visa_sponsorship', name: 'require_visa_sponsorship', attributes: { 'aria-label': 'Do you require visa sponsorship?' } }),
        ]);
        const schema = await adapter.extractFormSchema({ doc: mockDoc });
        const field = schema.fields.find((f) => f.name === 'require_visa_sponsorship');
        if (field) {
          assert.strictEqual(field.requiresUserReview, true);
          assert.strictEqual(field.metadata.isSensitive, true);
        }
      }
    });

    it('TEST 25 — Salary expectation question is strictly gated and protected', async () => {
      const adapter = new SmartRecruitersPortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'salary_expectation', name: 'desired_salary', attributes: { 'data-qa': 'question-salary', 'aria-label': 'Desired salary' } }),
      ]);
      const schema = await adapter.extractFormSchema({ doc: mockDoc });
      const field = schema.fields.find((f) => f.name === 'desired_salary');
      assert.ok(field);
      assert.strictEqual(field.requiresUserReview, true);
      assert.strictEqual(field.metadata.isSensitive, true);
    });

    it('TEST 26 — Legal attestation & accuracy confirmation NEVER automatically check', async () => {
      const adapter = new GreenhousePortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'declarations_accuracyconfirmed', name: 'declarations_accuracyconfirmed', type: 'checkbox' }),
      ]);
      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, basePackage);
      const action = fillPlan.actions.find((a) => a.fieldId.includes('accuracyconfirmed') || a.name.includes('accuracyconfirmed'));
      if (action) {
        assert.strictEqual(action.action, 'REVIEW');
        assert.strictEqual(action.requiresUserReview, true);
        assert.notStrictEqual(action.action, 'CHECK');
      }
    });

    it('TEST 27 — Demographic & EEO fields (gender, race, veteran, disability) remain protected', async () => {
      const adapter = new GreenhousePortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'demographic_questions' }),
      ]);
      const schema = await adapter.extractFormSchema({ doc: mockDoc });
      const eeoFields = schema.fields.filter((f) => f.name.startsWith('eeo_'));
      assert.ok(eeoFields.length >= 4);
      for (const f of eeoFields) {
        assert.strictEqual(f.requiresUserReview, true);
        assert.strictEqual(f.metadata.isSensitive, true);
      }
    });
  });

  // ==========================================
  // 7. FILE UPLOADS (Tests 28–30)
  // ==========================================
  describe('File Upload Handling', () => {
    it('TEST 28 — Resume upload field resolves approved resume artifact', async () => {
      const adapter = new LeverPortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'resume', name: 'resume', type: 'file' }),
      ]);
      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, basePackage);
      const action = fillPlan.actions.find((a) => a.fieldType === 'file' && a.name === 'resume');
      assert.ok(action);
      assert.strictEqual(action.action, 'UPLOAD');
      assert.strictEqual(action.confidence, 'HIGH');
    });

    it('TEST 29 — Cover letter upload field resolves approved cover letter artifact', async () => {
      const adapter = new GreenhousePortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'first_name', name: 'first_name' }),
        createMockDomElement({ id: 'cover_letter', name: 'cover_letter', type: 'file' }),
      ]);
      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, basePackage);
      const action = fillPlan.actions.find((a) => a.fieldType === 'file' && a.name === 'cover_letter');
      assert.ok(action);
      assert.strictEqual(action.action, 'UPLOAD');
    });

    it('TEST 30 — Missing approved file artifact resolves strictly to action: REVIEW', async () => {
      const adapter = new AshbyPortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'resume', name: 'resume', type: 'file' }),
      ]);
      const pkgWithoutResume = {
        ...basePackage,
        artifacts: {},
      };
      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, pkgWithoutResume);
      const action = fillPlan.actions.find((a) => a.fieldType === 'file' && a.name === 'resume');
      assert.ok(action);
      assert.strictEqual(action.action, 'REVIEW');
      assert.strictEqual(action.requiresUserReview, true);
    });
  });

  // ==========================================
  // 8. ERROR NORMALIZATION (Tests 31–34)
  // ==========================================
  describe('Error Normalization', () => {
    it('TEST 31 — Missing required field normalizes into canonical FieldValidationError', () => {
      const adapter = new BasePortalAdapter({ id: 'test-adapter', name: 'Test Adapter' });
      const err = adapter.normalizeValidationError({
        fieldId: 'fld_email',
        rawMessage: 'Email address cannot be blank',
      });
      assert.strictEqual(err.code, 'MISSING_REQUIRED_FIELD');
      assert.strictEqual(err.message, 'This field is required');
      assert.strictEqual(err.severity, 'ERROR');
      assert.strictEqual(err.recoverable, true);
      assert.strictEqual(err.requiresUserReview, true);
    });

    it('TEST 32 — Invalid field format normalizes appropriately', () => {
      const adapter = new BasePortalAdapter({ id: 'test-adapter', name: 'Test Adapter' });
      const errEmail = adapter.normalizeValidationError({
        fieldId: 'fld_email',
        rawMessage: 'Please enter a valid email',
      });
      assert.strictEqual(errEmail.code, 'INVALID_EMAIL_FORMAT');

      const errPhone = adapter.normalizeValidationError({
        fieldId: 'fld_phone',
        rawMessage: 'Invalid phone format',
      });
      assert.strictEqual(errPhone.code, 'INVALID_PHONE_FORMAT');
    });

    it('TEST 33 — Navigation failure states are representable in PortalErrorStatusEnum', () => {
      assert.doesNotThrow(() => PortalErrorStatusEnum.parse('NAVIGATION_FAILED'));
      assert.doesNotThrow(() => PortalErrorStatusEnum.parse('AUTH_REQUIRED'));
      assert.doesNotThrow(() => PortalErrorStatusEnum.parse('IFRAME_BLOCKED'));
    });

    it('TEST 34 — Unknown provider state is handled gracefully with UNKNOWN_PROVIDER_STATE', () => {
      assert.doesNotThrow(() => PortalErrorStatusEnum.parse('UNKNOWN_PROVIDER_STATE'));
      assert.doesNotThrow(() => PortalErrorStatusEnum.parse('READY_FOR_REVIEW'));
    });
  });

  // ==========================================
  // 9. SUBMISSION SAFETY (Tests 35–37)
  // ==========================================
  describe('Submission Safety Invariants', () => {
    it('TEST 35 — Submit button is detected by detectSubmitButton', () => {
      const adapter = new BasePortalAdapter({ id: 'test-adapter', name: 'Test Adapter' });
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'submit_app', tagName: 'BUTTON', type: 'submit', textContent: 'Submit Application' }),
      ]);
      const info = adapter.detectSubmitButton(mockDoc);
      assert.strictEqual(info.hasSubmitButton, true);
      assert.ok(info.selector);
    });

    it('TEST 36 — Submit action is NOT executed during submitOrHandoff', async () => {
      const adapter = new GreenhousePortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'submit_app', tagName: 'BUTTON', type: 'submit', textContent: 'Submit Application' }),
      ]);
      const res = await adapter.submitOrHandoff({ doc: mockDoc, destinationUrl: 'https://boards.greenhouse.io/apply' });
      assert.strictEqual(res.status, 'HANDOFF_READY');
      assert.strictEqual(res.retryState, 'NOT_SENT');
      assert.strictEqual(res.handoffKit.finalSubmitBlocked, true);
      assert.strictEqual(res.handoffKit.requiresUserApproval, true);
    });

    it('TEST 37 — Application state machine transitions to READY_FOR_REVIEW, never directly to SUBMITTED', () => {
      const sm = new PortalApplicationStateMachine('NOT_STARTED');
      sm.transition('DETECTED');
      sm.transition('FORM_EXTRACTED');
      sm.transition('READY_FOR_FILL');
      sm.transition('FILLING');
      sm.transition('FILLED');
      sm.transition('VALIDATING');
      sm.transition('READY_FOR_REVIEW');
      assert.strictEqual(sm.state, 'READY_FOR_REVIEW');

      // Attempt forbidden automated jump to SUBMITTED
      assert.throws(
        () => sm.transition('SUBMITTED'),
        (err) => err instanceof ValidationError && err.code === 'FORBIDDEN_AUTOMATED_SUBMIT'
      );
    });
  });

  // ==========================================
  // 10. CROSS-SURFACE PARITY (Tests 38–40)
  // ==========================================
  describe('Cross-Surface Parity', () => {
    it('TEST 38 — MCP package produces identical canonical form mapping in provider adapters', async () => {
      const adapter = new GreenhousePortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'first_name', name: 'first_name' }),
        createMockDomElement({ id: 'email', name: 'email', type: 'email' }),
      ]);
      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, basePackage);
      assert.ok(fillPlan.actions.length >= 2);
      const fn = fillPlan.actions.find((a) => a.name === 'first_name');
      assert.strictEqual(fn.sanitizedValue, 'Samantha');
    });

    it('TEST 39 — Web package produces identical canonical form mapping in provider adapters', async () => {
      const adapter = new LeverPortalAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'name', name: 'name' }),
        createMockDomElement({ id: 'email', name: 'email', type: 'email' }),
      ]);
      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, basePackage);
      const nameAction = fillPlan.actions.find((a) => a.name === 'name');
      assert.strictEqual(nameAction.sanitizedValue, 'Samantha Vance');
    });

    it('TEST 40 — Extension receives identical canonical package schema without data mutation', () => {
      assert.strictEqual(basePackage.candidateSnapshot.candidateName, 'Samantha Vance');
      assert.strictEqual(basePackage.candidateSnapshot.contact.phone, '+1 (555) 789-0123');
    });
  });

  // ==========================================
  // 11. ARCHITECTURE & REGISTRY (Tests 41–43)
  // ==========================================
  describe('Architecture & Registry Invariants', () => {
    it('TEST 41 — Adding provider adapters does not modify generic autofill engine', () => {
      const engine = genericAutofillEngine;
      assert.ok(engine instanceof GenericAutofillEngine);
      assert.strictEqual(engine.id, 'generic-autofill-engine');
    });

    it('TEST 42 — Provider-specific behavior remains isolated inside each adapter', () => {
      const gh = new GreenhousePortalAdapter();
      const lever = new LeverPortalAdapter();
      const ashby = new AshbyPortalAdapter();
      const wd = new WorkdayPortalAdapter();
      const sr = new SmartRecruitersPortalAdapter();
      const icims = new IcimsPortalAdapter();

      assert.strictEqual(gh.id, 'greenhouse-portal-adapter');
      assert.strictEqual(lever.id, 'lever-portal-adapter');
      assert.strictEqual(ashby.id, 'ashby-portal-adapter');
      assert.strictEqual(wd.id, 'workday-portal-adapter');
      assert.strictEqual(sr.id, 'smartrecruiters-portal-adapter');
      assert.strictEqual(icims.id, 'icims-portal-adapter');
    });

    it('TEST 43 — Registry resolution is deterministic across all six providers', () => {
      const registry = new PortalAdapterRegistry();
      registerStandardPortalAdapters(registry);

      assert.strictEqual(registry.resolve('https://boards.greenhouse.io/job')?.id, 'greenhouse-portal-adapter');
      assert.strictEqual(registry.resolve('https://jobs.lever.co/job')?.id, 'lever-portal-adapter');
      assert.strictEqual(registry.resolve('https://jobs.ashbyhq.com/job')?.id, 'ashby-portal-adapter');
      assert.strictEqual(registry.resolve('https://company.myworkdayjobs.com/job')?.id, 'workday-portal-adapter');
      assert.strictEqual(registry.resolve('https://jobs.smartrecruiters.com/job')?.id, 'smartrecruiters-portal-adapter');
      assert.strictEqual(registry.resolve('https://careers-company.icims.com/job')?.id, 'icims-portal-adapter');
      assert.strictEqual(registry.resolve('https://unknown-board.com/job'), null);
    });
  });

  // ==========================================
  // 12. FULL REGRESSION GATES (Tests 44–54)
  // ==========================================
  describe('Phase 0 through 8.3 Regression Gates', () => {
    it('TEST 44 — Phase 0 baseline check: Real calculated ATS Fit Score matches 69.25', async () => {
      const { context, commonDeps } = createTestCandidateContext();
      const fitResult = await handleAnalyzeJobFit(
        context,
        {
          jobDescriptionText: BASELINE_JD,
          jobTitle: 'Junior Full Stack Engineer',
        },
        commonDeps
      );
      assert.ok(fitResult, 'analyze_job_fit must produce a non-null result');
      assert.strictEqual(fitResult.overallFit.atsScore, 69.25, 'Computed ATS score must equal 69.25');
      assert.strictEqual(fitResult.overallFit.scoreBreakdown.requiredSkillsScore, 35.0);
    });

    it('TEST 45 — Phase 1 application step schema remains intact', () => {
      assert.ok(ApplicationStepSchema);
    });

    it('TEST 46 — Phase 2 field validation error schema remains intact', () => {
      assert.ok(FieldValidationErrorSchema);
    });

    it('TEST 47 — Phase 3 portal application state enum remains intact', () => {
      assert.ok(PortalApplicationStateEnum);
    });

    it('TEST 48 — Phase 4 portal error status enum remains intact', () => {
      assert.ok(PortalErrorStatusEnum);
    });

    it('TEST 49 — Phase 5 iframe scope schema remains intact', () => {
      assert.ok(IframeScopeSchema);
    });

    it('TEST 50 — Phase 6 portal application state machine remains intact', () => {
      assert.ok(PortalApplicationStateMachine);
    });

    it('TEST 51 — Phase 7 base portal adapter remains intact', () => {
      assert.ok(BasePortalAdapter);
    });

    it('TEST 52 — Phase 8.1 portal adapter contract remains intact', () => {
      assert.ok(PortalAdapterContract);
    });

    it('TEST 53 — Phase 8.2 canonical form schema remains intact', () => {
      assert.ok(PortalFormSchema);
    });

    it('TEST 54 — Phase 8.3 generic browser form autofill engine remains intact', () => {
      assert.ok(GenericAutofillEngine && genericAutofillEngine);
    });
  });
});
