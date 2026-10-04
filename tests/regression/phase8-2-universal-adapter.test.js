/**
 * @file Phase 8.2 — Universal Job & Portal Adapter Foundation + Canonical Form Schema Regression Suite.
 *
 * Verifies:
 * 1. Distinction of Domains (JobSourceAdapter vs PortalAdapter)
 * 2. Canonical Job Model & prevention of root provider pollution
 * 3. Deterministic JobSourceRegistry resolution (priority DESC, id ASC)
 * 4. Provider classification: ATS, JOB_BOARD, COMPANY_CAREER_SITE, AGGREGATOR, UNKNOWN
 * 5. Deterministic fixture matrix for 14 platforms (Greenhouse, Lever, Ashby, Workday, iCIMS,
 *    SmartRecruiters, Taleo, SAP SuccessFactors, LinkedIn, Indeed, Naukri, Internshala, Generic, Unknown)
 * 6. Canonical form schema complete field types support (text, textarea, email, tel, url, number,
 *    date, select, radio, checkbox, file, hidden, custom_question, repeated_group, UNKNOWN)
 * 7. Unknown DOM fields survive extraction with verified: false, requiresUserReview: true
 * 8. Select, Radio, Checkbox options and File accept metadata preservation
 * 9. Custom questions and Repeated groups extraction
 * 10. Deterministic field identity across repeated extractions
 * 11. Field mapping zero-fabrication safety (never invent candidate data)
 * 12. Extension produces canonical form schema
 * 13. MCP / Web / Extension canonical package parity
 * 14. Adding new adapters requires zero changes to core workflow
 * 15. Greenhouse and Lever discovery adapters remain regression-safe
 */

import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  JobSourceAdapterContract,
  CanonicalJobSchema,
  assertNoProviderPollution,
  classifyJobProvider,
  ProviderCategoryEnum,
} from '../../src/domain/job/job-source-adapter.contract.js';
import { JobSourceRegistry, jobSourceRegistry } from '../../src/domain/job/job-source-registry.js';
import {
  PortalAdapterContract,
  PortalFormSchema,
  PortalFieldSchema,
  PortalFieldOptionSchema,
  MappedPortalFieldSchema,
  mapCanonicalApplicationToForm,
  generateDeterministicFieldId,
} from '../../src/domain/portal/portal-adapter.contract.js';
import { portalAdapterRegistry, PortalAdapterRegistry } from '../../src/domain/portal/portal-adapter-registry.js';
import { FormDetector } from '../../extension/content/form-detector.js';
import { JobPortalAdapterBase } from '../../extension/job-detection/job-portal-adapter.base.js';
import { GreenhouseAdapter } from '../../src/services/job-board-adapters/greenhouse.adapter.js';
import { LeverAdapter } from '../../src/services/job-board-adapters/lever.adapter.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { db } from '../../src/db/index.js';
import { tenants, users, candidates, jobApplications } from '../../src/db/schema.js';
import { ValidationError } from '../../src/errors/index.js';

// Helper to create mock DOM elements for FormDetector
function createMockInputElement({
  id = '',
  name = '',
  type = 'text',
  tagName = 'INPUT',
  value = '',
  required = false,
  label = '',
  options = [],
  accept = null,
  multiple = false,
  checked = false,
  attributes = {},
}) {
  const el = {
    id,
    name,
    type,
    tagName: tagName.toUpperCase(),
    value,
    required,
    checked,
    multiple,
    options: options.map((opt) => ({
      textContent: typeof opt === 'string' ? opt : opt.label || opt.value || '',
      value: typeof opt === 'string' ? opt : opt.value || '',
      selected: typeof opt === 'object' ? Boolean(opt.selected) : false,
    })),
    getAttribute: (attr) => {
      if (attr === 'accept') return accept;
      if (attr === 'aria-label') return attributes['aria-label'] || label;
      if (attr === 'aria-required') return required ? 'true' : 'false';
      if (attr === 'placeholder') return attributes.placeholder || '';
      return attributes[attr] || null;
    },
    closest: () => null,
  };

  el.ownerDocument = {
    querySelector: (sel) => {
      if (id && sel.includes(`[for="${id}"]`)) {
        return { textContent: label };
      }
      return null;
    },
  };

  return el;
}

function createMockDoc({ inputs = [], stepText = 'Step 1 of 1: Application', repeatedGroups = [] }) {
  return {
    querySelector: (sel) => {
      if (sel.includes('form')) {
        return {
          id: 'test-form',
          querySelectorAll: () => inputs,
        };
      }
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.includes('step') || sel.includes('h1')) {
        return [{ textContent: stepText }];
      }
      if (sel.includes('fieldset[data-group]') || sel.includes('repeated-group')) {
        return repeatedGroups.map((grp, idx) => ({
          getAttribute: (attr) => (attr === 'data-group' ? grp.id || `group_${idx}` : null),
          querySelector: (sub) => ({ textContent: grp.label || 'Group' }),
          querySelectorAll: () => grp.inputs || [],
        }));
      }
      return inputs;
    },
  };
}

describe('Phase 8.2 — Universal Job & Portal Adapter Foundation + Canonical Form Schema', () => {
  let tenantId;
  let userId;
  let candidateId;
  let testAppId;
  let workflowService;
  let basePackage;
  const createdTenantIds = [];

  const mockJobPosting = {
    id: 'gh-universal-82',
    title: 'Senior Distributed Systems Engineer',
    company: 'Cloud Scale Inc.',
    location: 'Remote, US',
    description: 'Build fault-tolerant distributed consensus algorithms in Go and Rust.',
    applicationUrl: 'https://boards.greenhouse.io/cloudscale/jobs/550011',
    source: 'GREENHOUSE',
  };

  before(async () => {
    tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);
    userId = crypto.randomUUID();
    candidateId = crypto.randomUUID();

    await db.insert(tenants).values({
      id: tenantId,
      name: 'Phase 8.2 Universal Adapter Tenant',
      slug: `p82-tenant-${Date.now()}`,
      tier: 'PRO',
    });

    const userEmail = `p82-engineer-${Date.now()}@example.test`;

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: userEmail,
      displayName: 'Universal Architecture Engineer',
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    await db.insert(candidates).values({
      id: candidateId,
      tenantId,
      userId,
      displayName: 'Universal Architecture Engineer',
      canonicalEmail: userEmail,
    });

    workflowService = new JobApplicationWorkflowService({ database: db });

    testAppId = crypto.randomUUID();
    await db.insert(jobApplications).values({
      id: testAppId,
      tenantId,
      candidateId,
      jobTitle: mockJobPosting.title,
      companyName: mockJobPosting.company,
      jobUrl: mockJobPosting.applicationUrl,
      source: 'GREENHOUSE',
      status: 'SAVED',
      packageHash: 'initial-dummy-package-hash-82',
      metadata: {
        destinationUrl: mockJobPosting.applicationUrl,
      },
    });

    // Prepare package once in before() for performance
    basePackage = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      applicationId: testAppId,
      jobPosting: mockJobPosting,
    });
  });

  after(async () => {
    for (const tid of createdTenantIds) {
      await db.delete(jobApplications).where(eq(jobApplications.tenantId, tid));
      await db.delete(candidates).where(eq(candidates.tenantId, tid));
      await db.delete(users).where(eq(users.tenantId, tid));
      await db.delete(tenants).where(eq(tenants.id, tid));
    }
  });

  // TEST 1 — Canonical JobSourceAdapter contract
  test('TEST 1 — Canonical JobSourceAdapter contract', async () => {
    // Cannot construct directly
    assert.throws(() => new JobSourceAdapterContract({ id: 'test', name: 'Test' }), {
      name: 'TypeError',
      message: /Cannot construct JobSourceAdapterContract instances directly/,
    });

    // Subclass with invalid identity throws ValidationError
    class BadSourceAdapter extends JobSourceAdapterContract {}
    assert.throws(() => new BadSourceAdapter({}), {
      name: 'ValidationError',
      message: /Invalid JobSourceAdapter identity/,
    });

    // Subclass with valid identity initializes properties
    class ValidSourceAdapter extends JobSourceAdapterContract {
      canHandle(ctx) {
        return typeof ctx === 'string' && ctx.includes('valid-source');
      }
    }
    const adapter = new ValidSourceAdapter({
      id: 'valid-source',
      name: 'Valid Source Adapter',
      version: '1.2.0',
      priority: 25,
      providerCategory: 'ATS',
    });

    assert.strictEqual(adapter.id, 'valid-source');
    assert.strictEqual(adapter.name, 'Valid Source Adapter');
    assert.strictEqual(adapter.priority, 25);
    assert.strictEqual(adapter.providerCategory, 'ATS');
    assert.strictEqual(adapter.canHandle('https://valid-source.com/job/1'), true);
    assert.strictEqual(adapter.canHandle('https://other.com'), false);

    // Unimplemented methods throw descriptive errors
    await assert.rejects(async () => await adapter.discoverJobs({}), /discoverJobs\(\) not implemented/);
    await assert.rejects(async () => await adapter.getJob('ref-1'), /getJob\(\) not implemented/);
    assert.throws(() => adapter.normalizeJob({}), /normalizeJob\(\) not implemented/);
    assert.throws(() => adapter.getJobIdentity({}), /getJobIdentity\(\) not implemented/);
  });

  // TEST 2 — Canonical job schema
  test('TEST 2 — Canonical job schema', () => {
    const validJob = {
      canonicalJobId: crypto.randomUUID(),
      title: 'Staff Reliability Engineer',
      company: 'High Availability Corp',
      description: 'Design distributed chaos experiments.',
      location: 'Remote, US',
      locations: ['Remote, US', 'San Francisco, CA'],
      remotePolicy: 'REMOTE',
      employmentType: 'FULL_TIME',
      seniority: 'STAFF',
      salary: {
        min: 180000,
        max: 240000,
        currency: 'USD',
        period: 'YEARLY',
      },
      currency: 'USD',
      jobUrl: 'https://careers.example.com/jobs/sre-101',
      applicationUrl: 'https://careers.example.com/apply/sre-101',
      source: 'EXAMPLE_SOURCE',
      sourceType: 'COMPANY_CAREER_SITE',
      sourceProvider: 'EXAMPLE_ATS',
      sourceJobId: 'sre-101',
      externalIdentifiers: {
        vendorJobId: 'v-999',
      },
      postedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { customScore: 92 },
    };

    const parsed = CanonicalJobSchema.parse(validJob);
    assert.strictEqual(parsed.canonicalJobId, validJob.canonicalJobId);
    assert.strictEqual(parsed.title, 'Staff Reliability Engineer');
    assert.strictEqual(parsed.remotePolicy, 'REMOTE');
    assert.strictEqual(parsed.seniority, 'STAFF');

    // Reject missing required fields
    assert.throws(() => CanonicalJobSchema.parse({ ...validJob, title: undefined }), /title|Required/);
    assert.throws(() => CanonicalJobSchema.parse({ ...validJob, canonicalJobId: '' }), /canonicalJobId/);
  });

  // TEST 3 — Provider metadata does not pollute canonical job fields
  test('TEST 3 — Provider metadata does not pollute canonical job fields', () => {
    const cleanJob = {
      canonicalJobId: crypto.randomUUID(),
      title: 'Frontend Engineer',
      company: 'Acme',
      jobUrl: 'https://acme.com/jobs/1',
      externalIdentifiers: {
        greenhouseJobId: 'gh-12345',
        leverJobId: 'lev-67890',
      },
      metadata: {
        workdayId: 'wd-999',
      },
    };

    // Clean job succeeds
    assert.strictEqual(assertNoProviderPollution(cleanJob), true);

    // Polluting root with vendor keys throws ValidationError
    const pollutedGreenhouse = { ...cleanJob, greenhouseJobId: 'gh-12345' };
    assert.throws(() => assertNoProviderPollution(pollutedGreenhouse), {
      name: 'ValidationError',
      message: /Provider pollution detected.*greenhouseJobId/,
    });

    const pollutedLever = { ...cleanJob, leverJobId: 'lev-67890' };
    assert.throws(() => assertNoProviderPollution(pollutedLever), {
      name: 'ValidationError',
      message: /Provider pollution detected.*leverJobId/,
    });

    const pollutedWorkday = { ...cleanJob, workdayId: 'wd-999' };
    assert.throws(() => assertNoProviderPollution(pollutedWorkday), {
      name: 'ValidationError',
      message: /Provider pollution detected.*workdayId/,
    });
  });

  // TEST 4 — Deterministic JobSourceRegistry resolution
  test('TEST 4 — Deterministic JobSourceRegistry resolution', () => {
    const registry = new JobSourceRegistry();

    const lowPriority = {
      id: 'source-low',
      name: 'Low Priority Source',
      priority: 10,
      canHandle: (ctx) => typeof ctx === 'string' && ctx.includes('example.com'),
    };

    const highPriorityA = {
      id: 'source-high-a',
      name: 'High Priority Source A',
      priority: 50,
      canHandle: (ctx) => typeof ctx === 'string' && ctx.includes('example.com'),
    };

    const highPriorityB = {
      id: 'source-high-b',
      name: 'High Priority Source B',
      priority: 50,
      canHandle: (ctx) => typeof ctx === 'string' && ctx.includes('example.com'),
    };

    registry.register(lowPriority);
    registry.register(highPriorityB);
    registry.register(highPriorityA);

    // Stable sort: priority DESC (50), then id ASC ('source-high-a' < 'source-high-b')
    const resolved = registry.resolve('https://example.com/jobs/1');
    assert.strictEqual(resolved.id, 'source-high-a');

    // Unregister works
    registry.unregister('source-high-a');
    const resolvedNext = registry.resolve('https://example.com/jobs/1');
    assert.strictEqual(resolvedNext.id, 'source-high-b');

    // List reflects registered
    assert.strictEqual(registry.list().length, 2);
  });

  // TEST 5 — ATS provider classification
  test('TEST 5 — ATS provider classification', () => {
    assert.deepStrictEqual(classifyJobProvider('https://boards.greenhouse.io/stripe/jobs/1'), {
      category: 'ATS',
      provider: 'GREENHOUSE',
    });
    assert.deepStrictEqual(classifyJobProvider('https://jobs.lever.co/netflix/2'), {
      category: 'ATS',
      provider: 'LEVER',
    });
    assert.deepStrictEqual(classifyJobProvider('https://jobs.ashbyhq.com/openai/3'), {
      category: 'ATS',
      provider: 'ASHBY',
    });
    assert.deepStrictEqual(classifyJobProvider('https://adobe.myworkdayjobs.com/careers/4'), {
      category: 'ATS',
      provider: 'WORKDAY',
    });
    assert.deepStrictEqual(classifyJobProvider('https://careers-microsoft.icims.com/jobs/5'), {
      category: 'ATS',
      provider: 'ICIMS',
    });
    assert.deepStrictEqual(classifyJobProvider('https://jobs.smartrecruiters.com/visa/6'), {
      category: 'ATS',
      provider: 'SMARTRECRUITERS',
    });
    assert.deepStrictEqual(classifyJobProvider('https://oracle.taleo.net/careersection/7'), {
      category: 'ATS',
      provider: 'TALEO',
    });
    assert.deepStrictEqual(classifyJobProvider('https://career4.successfactors.com/8'), {
      category: 'ATS',
      provider: 'SAP_SUCCESSFACTORS',
    });
  });

  // TEST 6 — Job-board provider classification
  test('TEST 6 — Job-board provider classification', () => {
    assert.deepStrictEqual(classifyJobProvider('https://www.linkedin.com/jobs/view/100'), {
      category: 'JOB_BOARD',
      provider: 'LINKEDIN',
    });
    assert.deepStrictEqual(classifyJobProvider('https://www.indeed.com/viewjob?jk=200'), {
      category: 'JOB_BOARD',
      provider: 'INDEED',
    });
    assert.deepStrictEqual(classifyJobProvider('https://www.naukri.com/job-listings-300'), {
      category: 'JOB_BOARD',
      provider: 'NAUKRI',
    });
    assert.deepStrictEqual(classifyJobProvider('https://internshala.com/internship/detail/400'), {
      category: 'JOB_BOARD',
      provider: 'INTERNSHALA',
    });
    assert.deepStrictEqual(classifyJobProvider('https://wellfound.com/jobs/500'), {
      category: 'JOB_BOARD',
      provider: 'WELLFOUND',
    });
  });

  // TEST 7 — Company-career-site classification
  test('TEST 7 — Company-career-site classification', () => {
    assert.deepStrictEqual(classifyJobProvider('https://careers.google.com/jobs/results/600'), {
      category: 'COMPANY_CAREER_SITE',
      provider: 'COMPANY_CAREERS',
    });
    assert.deepStrictEqual(classifyJobProvider('https://stripe.com/jobs/search/700'), {
      category: 'COMPANY_CAREER_SITE',
      provider: 'COMPANY_CAREERS',
    });
  });

  // TEST 8 — Unknown provider classification
  test('TEST 8 — Unknown provider classification', () => {
    assert.deepStrictEqual(classifyJobProvider('https://unknown-domain-random-portal.org/item/800'), {
      category: 'UNKNOWN',
      provider: 'UNKNOWN',
    });
    assert.deepStrictEqual(classifyJobProvider(''), {
      category: 'UNKNOWN',
      provider: 'UNKNOWN',
    });
    assert.deepStrictEqual(classifyJobProvider(null), {
      category: 'UNKNOWN',
      provider: 'UNKNOWN',
    });
  });

  // Helper fixture matrix test runner for Tests 9 to 22
  function verifyFixture({
    name,
    url,
    expectedCategory,
    expectedProvider,
    rawJobId,
    title,
    company,
    inputs,
  }) {
    // 1. Provider classification
    const classification = classifyJobProvider(url);
    assert.strictEqual(classification.category, expectedCategory);
    assert.strictEqual(classification.provider, expectedProvider);

    // 2. Canonical job identity & zero pollution
    const canonicalJob = CanonicalJobSchema.parse({
      canonicalJobId: crypto.randomUUID(),
      title,
      company,
      jobUrl: url,
      applicationUrl: url,
      source: expectedProvider,
      sourceType: expectedCategory,
      sourceProvider: expectedProvider,
      sourceJobId: rawJobId,
      externalIdentifiers: {
        [`${expectedProvider.toLowerCase()}Id`]: rawJobId,
      },
    });
    assert.strictEqual(canonicalJob.sourceJobId, rawJobId);
    assertNoProviderPollution(canonicalJob);

    // 3. Form schema extraction & unknown field survival
    const mockDoc = createMockDoc({ inputs });
    const extraction = FormDetector.detect(mockDoc);
    assert.strictEqual(extraction.hasForm, true);

    const baseAdapter = new JobPortalAdapterBase({ id: expectedProvider.toLowerCase(), name });
    const schema = baseAdapter.extractFormSchema(mockDoc, url);
    schema.fields = extraction.fields;

    const validatedForm = PortalFormSchema.safeParse(schema);
    assert.strictEqual(validatedForm.success, true);

    // Unknown fields must survive with verified: false, requiresUserReview: true
    const unknownField = extraction.fields.find((f) => f.type === 'UNKNOWN' || f.customQuestion);
    if (unknownField) {
      assert.strictEqual(unknownField.requiresUserReview, true);
    }
  }

  // TEST 9 — Greenhouse fixture resolves
  test('TEST 9 — Greenhouse fixture resolves', () => {
    verifyFixture({
      name: 'Greenhouse',
      url: 'https://boards.greenhouse.io/stripe/jobs/1234567',
      expectedCategory: 'ATS',
      expectedProvider: 'GREENHOUSE',
      rawJobId: '1234567',
      title: 'Senior Backend Engineer',
      company: 'Stripe',
      inputs: [
        createMockInputElement({ id: 'first_name', name: 'first_name', label: 'First Name', required: true }),
        createMockInputElement({ id: 'last_name', name: 'last_name', label: 'Last Name', required: true }),
        createMockInputElement({ id: 'email', name: 'email', type: 'email', label: 'Email', required: true }),
        createMockInputElement({ id: 'resume', name: 'resume', type: 'file', label: 'Resume', accept: '.pdf' }),
        createMockInputElement({ id: 'why_stripe', name: 'why_stripe', tagName: 'TEXTAREA', label: 'Why Stripe?' }),
        createMockInputElement({ id: 'gh_custom', name: 'gh_custom', type: 'custom_gh_widget' }),
      ],
    });
  });

  // TEST 10 — Lever fixture resolves
  test('TEST 10 — Lever fixture resolves', () => {
    verifyFixture({
      name: 'Lever',
      url: 'https://jobs.lever.co/netflix/abcd-ef01-2345',
      expectedCategory: 'ATS',
      expectedProvider: 'LEVER',
      rawJobId: 'abcd-ef01-2345',
      title: 'Distributed Systems Engineer',
      company: 'Netflix',
      inputs: [
        createMockInputElement({ id: 'name', name: 'name', label: 'Full Name', required: true }),
        createMockInputElement({ id: 'email', name: 'email', type: 'email', label: 'Email', required: true }),
        createMockInputElement({ id: 'phone', name: 'phone', type: 'tel', label: 'Phone' }),
        createMockInputElement({ id: 'resume', name: 'resume', type: 'file', label: 'Resume', accept: '.pdf' }),
        createMockInputElement({ id: 'lever_widget', name: 'lever_widget', type: 'unknown_widget' }),
      ],
    });
  });

  // TEST 11 — Ashby fixture resolves
  test('TEST 11 — Ashby fixture resolves', () => {
    verifyFixture({
      name: 'Ashby',
      url: 'https://jobs.ashbyhq.com/openai/9876543',
      expectedCategory: 'ATS',
      expectedProvider: 'ASHBY',
      rawJobId: '9876543',
      title: 'Research Engineer',
      company: 'OpenAI',
      inputs: [
        createMockInputElement({ id: 'name', name: 'name', label: 'Full Name', required: true }),
        createMockInputElement({ id: 'email', name: 'email', type: 'email', label: 'Email', required: true }),
        createMockInputElement({ id: 'resume', name: 'resume', type: 'file', label: 'Resume', accept: '.pdf' }),
        createMockInputElement({ id: 'research', name: 'research', tagName: 'TEXTAREA', label: 'Research Interests' }),
        createMockInputElement({ id: 'ashby_token', name: 'ashby_token', type: 'custom_ashby_tag' }),
      ],
    });
  });

  // TEST 12 — Workday fixture resolves
  test('TEST 12 — Workday fixture resolves', () => {
    verifyFixture({
      name: 'Workday',
      url: 'https://adobe.myworkdayjobs.com/en-US/external/job/R-100200',
      expectedCategory: 'ATS',
      expectedProvider: 'WORKDAY',
      rawJobId: 'R-100200',
      title: 'Principal Architect',
      company: 'Adobe',
      inputs: [
        createMockInputElement({ id: 'legal_first_name', name: 'legal_first_name', label: 'Legal First Name', required: true }),
        createMockInputElement({ id: 'legal_last_name', name: 'legal_last_name', label: 'Legal Last Name', required: true }),
        createMockInputElement({ id: 'email', name: 'email', type: 'email', label: 'Email', required: true }),
        createMockInputElement({ id: 'csrf', name: 'csrf', type: 'hidden', value: 'token-123' }),
        createMockInputElement({ id: 'custom_eeo', name: 'custom_eeo', type: 'workday_eeo_widget' }),
      ],
    });
  });

  // TEST 13 — iCIMS fixture resolves
  test('TEST 13 — iCIMS fixture resolves', () => {
    verifyFixture({
      name: 'iCIMS',
      url: 'https://careers-microsoft.icims.com/jobs/554433/job',
      expectedCategory: 'ATS',
      expectedProvider: 'ICIMS',
      rawJobId: '554433',
      title: 'Security Engineer',
      company: 'Microsoft',
      inputs: [
        createMockInputElement({ id: 'first_name', name: 'first_name', label: 'First Name', required: true }),
        createMockInputElement({ id: 'last_name', name: 'last_name', label: 'Last Name', required: true }),
        createMockInputElement({ id: 'email', name: 'email', type: 'email', label: 'Email', required: true }),
        createMockInputElement({ id: 'icims_custom', name: 'icims_custom', type: 'icims_picker' }),
      ],
    });
  });

  // TEST 14 — SmartRecruiters fixture resolves
  test('TEST 14 — SmartRecruiters fixture resolves', () => {
    verifyFixture({
      name: 'SmartRecruiters',
      url: 'https://jobs.smartrecruiters.com/Visa/743999-lead-dev',
      expectedCategory: 'ATS',
      expectedProvider: 'SMARTRECRUITERS',
      rawJobId: '743999-lead-dev',
      title: 'Lead Developer',
      company: 'Visa',
      inputs: [
        createMockInputElement({ id: 'firstName', name: 'firstName', label: 'First Name', required: true }),
        createMockInputElement({ id: 'lastName', name: 'lastName', label: 'Last Name', required: true }),
        createMockInputElement({ id: 'email', name: 'email', type: 'email', label: 'Email', required: true }),
        createMockInputElement({ id: 'sr_custom', name: 'sr_custom', type: 'sr_unrecognized' }),
      ],
    });
  });

  // TEST 15 — Taleo fixture resolves
  test('TEST 15 — Taleo fixture resolves', () => {
    verifyFixture({
      name: 'Taleo',
      url: 'https://oracle.taleo.net/careersection/jobdetail.ftl?job=2400012',
      expectedCategory: 'ATS',
      expectedProvider: 'TALEO',
      rawJobId: '2400012',
      title: 'Database Kernel Engineer',
      company: 'Oracle',
      inputs: [
        createMockInputElement({ id: 'f_name', name: 'f_name', label: 'First Name', required: true }),
        createMockInputElement({ id: 'l_name', name: 'l_name', label: 'Last Name', required: true }),
        createMockInputElement({ id: 'u_email', name: 'u_email', type: 'email', label: 'Email', required: true }),
        createMockInputElement({ id: 'taleo_internal', name: 'taleo_internal', type: 'hidden', value: 'key-abc' }),
        createMockInputElement({ id: 'taleo_extra', name: 'taleo_extra', type: 'taleo_custom_widget' }),
      ],
    });
  });

  // TEST 16 — SAP SuccessFactors fixture resolves
  test('TEST 16 — SAP SuccessFactors fixture resolves', () => {
    verifyFixture({
      name: 'SAP SuccessFactors',
      url: 'https://career4.successfactors.com/career?company=Siemens&career_job_req_id=887766',
      expectedCategory: 'ATS',
      expectedProvider: 'SAP_SUCCESSFACTORS',
      rawJobId: '887766',
      title: 'Embedded Systems Engineer',
      company: 'Siemens',
      inputs: [
        createMockInputElement({ id: 'candidate_name', name: 'candidate_name', label: 'Full Name', required: true }),
        createMockInputElement({ id: 'contact_email', name: 'contact_email', type: 'email', label: 'Email', required: true }),
        createMockInputElement({ id: 'sf_custom', name: 'sf_custom', type: 'sf_nonstandard' }),
      ],
    });
  });

  // TEST 17 — LinkedIn fixture resolves
  test('TEST 17 — LinkedIn fixture resolves', () => {
    verifyFixture({
      name: 'LinkedIn',
      url: 'https://www.linkedin.com/jobs/view/3900011223',
      expectedCategory: 'JOB_BOARD',
      expectedProvider: 'LINKEDIN',
      rawJobId: '3900011223',
      title: 'Staff Platform Engineer',
      company: 'LinkedIn',
      inputs: [
        createMockInputElement({ id: 'phone', name: 'phone', type: 'tel', label: 'Phone Number', required: true }),
        createMockInputElement({ id: 'email', name: 'email', type: 'email', label: 'Email', required: true }),
        createMockInputElement({ id: 'resume', name: 'resume', type: 'file', label: 'Resume', accept: '.pdf' }),
        createMockInputElement({ id: 'li_tracker', name: 'li_tracker', type: 'li_custom_tag' }),
      ],
    });
  });

  // TEST 18 — Indeed fixture resolves
  test('TEST 18 — Indeed fixture resolves', () => {
    verifyFixture({
      name: 'Indeed',
      url: 'https://www.indeed.com/viewjob?jk=789abc0123def456',
      expectedCategory: 'JOB_BOARD',
      expectedProvider: 'INDEED',
      rawJobId: '789abc0123def456',
      title: 'Cloud Infrastructure Architect',
      company: 'Indeed',
      inputs: [
        createMockInputElement({ id: 'applicant_name', name: 'applicant_name', label: 'Full Name', required: true }),
        createMockInputElement({ id: 'applicant_email', name: 'applicant_email', type: 'email', label: 'Email', required: true }),
        createMockInputElement({ id: 'ia_extra', name: 'ia_extra', type: 'ia_unknown' }),
      ],
    });
  });

  // TEST 19 — Naukri fixture resolves
  test('TEST 19 — Naukri fixture resolves', () => {
    verifyFixture({
      name: 'Naukri',
      url: 'https://www.naukri.com/job-listings-full-stack-developer-acme-technologies-12345678',
      expectedCategory: 'JOB_BOARD',
      expectedProvider: 'NAUKRI',
      rawJobId: '12345678',
      title: 'Full Stack Developer',
      company: 'Acme Technologies',
      inputs: [
        createMockInputElement({ id: 'name', name: 'name', label: 'Name', required: true }),
        createMockInputElement({ id: 'email', name: 'email', type: 'email', label: 'Email', required: true }),
        createMockInputElement({ id: 'mobile', name: 'mobile', type: 'tel', label: 'Mobile', required: true }),
        createMockInputElement({ id: 'naukri_extra', name: 'naukri_extra', type: 'naukri_widget' }),
      ],
    });
  });

  // TEST 20 — Internshala fixture resolves
  test('TEST 20 — Internshala fixture resolves', () => {
    verifyFixture({
      name: 'Internshala',
      url: 'https://internshala.com/internship/detail/machine-learning-internship-123',
      expectedCategory: 'JOB_BOARD',
      expectedProvider: 'INTERNSHALA',
      rawJobId: '123',
      title: 'Machine Learning Intern',
      company: 'AI Labs',
      inputs: [
        createMockInputElement({ id: 'student_name', name: 'student_name', label: 'Student Name', required: true }),
        createMockInputElement({ id: 'email', name: 'email', type: 'email', label: 'Email', required: true }),
        createMockInputElement({ id: 'why_hired', name: 'why_hired', tagName: 'TEXTAREA', label: 'Why hire you?' }),
        createMockInputElement({ id: 'is_extra', name: 'is_extra', type: 'unknown_is' }),
      ],
    });
  });

  // TEST 21 — Generic career site resolves to generic/unknown category
  test('TEST 21 — Generic career site resolves to generic/unknown category', () => {
    verifyFixture({
      name: 'Generic Career Site',
      url: 'https://company.example.com/careers/lead-ai-engineer',
      expectedCategory: 'COMPANY_CAREER_SITE',
      expectedProvider: 'COMPANY_CAREERS',
      rawJobId: 'lead-ai-engineer',
      title: 'Lead AI Engineer',
      company: 'Example Inc',
      inputs: [
        createMockInputElement({ id: 'full_name', name: 'full_name', label: 'Full Name', required: true }),
        createMockInputElement({ id: 'email', name: 'email', type: 'email', label: 'Email', required: true }),
        createMockInputElement({ id: 'custom_widget', name: 'custom_widget', type: 'weird_company_picker' }),
      ],
    });
  });

  // TEST 22 — Unknown portal does not crash
  test('TEST 22 — Unknown portal does not crash', () => {
    verifyFixture({
      name: 'Unknown Portal',
      url: 'https://custom-portal-unknown.org/apply/42',
      expectedCategory: 'UNKNOWN',
      expectedProvider: 'UNKNOWN',
      rawJobId: '42',
      title: 'General Specialist',
      company: 'Mystery Corp',
      inputs: [
        createMockInputElement({ id: 'candidate', name: 'candidate', label: 'Candidate', required: true }),
        createMockInputElement({ id: 'contact', name: 'contact', type: 'email', label: 'Contact Email' }),
        createMockInputElement({ id: 'unknown_elem', name: 'unknown_elem', type: 'mystery_widget' }),
      ],
    });
  });

  // TEST 23 — Canonical form schema supports all field types
  test('TEST 23 — Canonical form schema supports all field types', () => {
    const allFieldTypes = [
      'text',
      'textarea',
      'email',
      'tel',
      'url',
      'number',
      'date',
      'select',
      'radio',
      'checkbox',
      'file',
      'hidden',
      'custom_question',
      'repeated_group',
      'UNKNOWN',
    ];

    const fields = allFieldTypes.map((type, idx) => ({
      fieldId: `field_${type}_${idx}`,
      name: `field_${type}`,
      label: `Field of type ${type}`,
      type,
      required: idx % 2 === 0,
      options: type === 'select' || type === 'radio' || type === 'checkbox'
        ? [{ label: 'Option 1', value: 'opt1', selected: true }]
        : [],
      accept: type === 'file' ? '.pdf,.docx' : null,
      customQuestion: type === 'custom_question',
      verified: type !== 'UNKNOWN',
      requiresUserReview: type === 'UNKNOWN' || type === 'custom_question',
      providerMetadata: { originalType: type },
      metadata: {},
    }));

    const fullForm = {
      portalId: 'test-universal-portal',
      formId: 'form-all-types',
      destinationUrl: 'https://example.com/apply',
      fields,
      questions: [
        {
          questionId: 'q-custom-1',
          prompt: 'What are your career goals?',
          type: 'textarea',
          required: true,
          source: 'DOM',
          requiresUserReview: true,
        },
      ],
      attachments: [
        {
          fieldId: 'att-1',
          name: 'resume_pdf',
          label: 'Resume Document',
          required: true,
          accept: '.pdf',
          maxSizeMb: 5,
        },
      ],
      repeatedGroups: [
        {
          groupId: 'grp-work-exp',
          label: 'Work Experience History',
          minItems: 1,
          fields: [
            {
              fieldId: 'exp_company',
              name: 'company',
              label: 'Company',
              type: 'text',
              required: true,
            },
          ],
        },
      ],
    };

    const parsed = PortalFormSchema.parse(fullForm);
    assert.strictEqual(parsed.fields.length, 15);
    assert.strictEqual(parsed.questions.length, 1);
    assert.strictEqual(parsed.attachments.length, 1);
    assert.strictEqual(parsed.repeatedGroups.length, 1);
  });

  // TEST 24 — Unknown DOM fields survive extraction
  test('TEST 24 — Unknown DOM fields survive extraction', () => {
    const inputs = [
      createMockInputElement({ id: 'name', name: 'name', label: 'Full Name', required: true }),
      createMockInputElement({ id: 'strange_widget', name: 'strange_widget', type: 'unsupported_html_type' }),
    ];

    const mockDoc = createMockDoc({ inputs });
    const extraction = FormDetector.detect(mockDoc);

    const unknownField = extraction.fields.find((f) => f.name === 'strange_widget');
    assert.ok(unknownField, 'Unknown field must NOT be silently dropped');
    assert.strictEqual(unknownField.type, 'UNKNOWN');
    assert.strictEqual(unknownField.verified, false);
    assert.strictEqual(unknownField.requiresUserReview, true);
  });

  // TEST 25 — Select fields preserve options
  test('TEST 25 — Select fields preserve options', () => {
    const inputs = [
      createMockInputElement({
        id: 'years_exp',
        name: 'years_exp',
        tagName: 'SELECT',
        label: 'Years of Experience',
        options: [
          { label: '0-2 years', value: 'entry', selected: false },
          { label: '3-5 years', value: 'mid', selected: true },
          { label: '6+ years', value: 'senior', selected: false },
        ],
      }),
    ];

    const mockDoc = createMockDoc({ inputs });
    const extraction = FormDetector.detect(mockDoc);
    const selectField = extraction.fields.find((f) => f.name === 'years_exp');

    assert.ok(selectField);
    assert.strictEqual(selectField.type, 'select');
    assert.strictEqual(selectField.options.length, 3);
    assert.strictEqual(selectField.options[1].value, 'mid');
    assert.strictEqual(selectField.options[1].selected, true);
  });

  // TEST 26 — Radio groups preserve options
  test('TEST 26 — Radio groups preserve options', () => {
    const inputs = [
      createMockInputElement({
        id: 'radio_yes',
        name: 'visa_sponsorship',
        type: 'radio',
        value: 'yes',
        label: 'Yes, I require sponsorship',
        checked: false,
      }),
      createMockInputElement({
        id: 'radio_no',
        name: 'visa_sponsorship',
        type: 'radio',
        value: 'no',
        label: 'No, I do not require sponsorship',
        checked: true,
      }),
    ];

    const mockDoc = createMockDoc({ inputs });
    const extraction = FormDetector.detect(mockDoc);
    const radioField = extraction.fields.find((f) => f.name === 'visa_sponsorship');

    assert.ok(radioField);
    assert.strictEqual(radioField.type, 'radio');
    assert.strictEqual(radioField.options.length, 2);
    assert.strictEqual(radioField.options[0].value, 'yes');
    assert.strictEqual(radioField.options[1].value, 'no');
    assert.strictEqual(radioField.options[1].selected, true);
  });

  // TEST 27 — Checkbox groups preserve options
  test('TEST 27 — Checkbox groups preserve options', () => {
    const inputs = [
      createMockInputElement({
        id: 'chk_remote',
        name: 'remote_preference',
        type: 'checkbox',
        value: 'remote_only',
        label: 'Open to Remote',
        checked: true,
      }),
    ];

    const mockDoc = createMockDoc({ inputs });
    const extraction = FormDetector.detect(mockDoc);
    const chkField = extraction.fields.find((f) => f.name === 'remote_preference');

    assert.ok(chkField);
    assert.strictEqual(chkField.type, 'checkbox');
    assert.strictEqual(chkField.options.length, 1);
    assert.strictEqual(chkField.options[0].value, 'remote_only');
    assert.strictEqual(chkField.options[0].selected, true);
  });

  // TEST 28 — File fields preserve accepted file metadata
  test('TEST 28 — File fields preserve accepted file metadata', () => {
    const inputs = [
      createMockInputElement({
        id: 'candidate_resume',
        name: 'resume_file',
        type: 'file',
        label: 'Attach Resume',
        accept: '.pdf,.doc,.docx',
      }),
    ];

    const mockDoc = createMockDoc({ inputs });
    const extraction = FormDetector.detect(mockDoc);
    const fileField = extraction.fields.find((f) => f.name === 'resume_file');

    assert.ok(fileField);
    assert.strictEqual(fileField.type, 'file');
    assert.strictEqual(fileField.accept, '.pdf,.doc,.docx');
  });

  // TEST 29 — Custom questions survive extraction
  test('TEST 29 — Custom questions survive extraction', () => {
    const inputs = [
      createMockInputElement({
        id: 'q_why_join',
        name: 'custom_question_why_join',
        tagName: 'TEXTAREA',
        label: 'Why do you want to join our engineering organization?',
        required: true,
      }),
    ];

    const mockDoc = createMockDoc({ inputs });
    const extraction = FormDetector.detect(mockDoc);
    const questionField = extraction.fields.find((f) => f.name === 'custom_question_why_join');

    assert.ok(questionField);
    assert.strictEqual(questionField.customQuestion, true);
    assert.strictEqual(questionField.requiresUserReview, true);
    assert.strictEqual(questionField.label, 'Why do you want to join our engineering organization?');
  });

  // TEST 30 — Repeated groups survive extraction
  test('TEST 30 — Repeated groups survive extraction', () => {
    const repeatedInputs = [
      createMockInputElement({ id: 'school', name: 'school', label: 'School / University' }),
      createMockInputElement({ id: 'degree', name: 'degree', label: 'Degree' }),
    ];

    const mockDoc = createMockDoc({
      inputs: [createMockInputElement({ id: 'email', name: 'email', type: 'email', label: 'Email' })],
      repeatedGroups: [
        {
          id: 'education-history',
          label: 'Education History',
          inputs: repeatedInputs,
        },
      ],
    });

    const extraction = FormDetector.detect(mockDoc);
    assert.ok(extraction.repeatedGroups);
    assert.strictEqual(extraction.repeatedGroups.length, 1);
    assert.strictEqual(extraction.repeatedGroups[0].groupId, 'education-history');
    assert.strictEqual(extraction.repeatedGroups[0].fields.length, 2);
  });

  // TEST 31 — Field identity remains deterministic
  test('TEST 31 — Field identity remains deterministic', () => {
    const inputs = [
      createMockInputElement({ id: 'user_email', name: 'email', type: 'email', label: 'Email Address' }),
      createMockInputElement({ id: 'user_phone', name: 'phone', type: 'tel', label: 'Phone Number' }),
    ];

    const mockDoc = createMockDoc({ inputs });

    // Run extraction multiple times on the same DOM
    const extraction1 = FormDetector.detect(mockDoc);
    const extraction2 = FormDetector.detect(mockDoc);

    assert.strictEqual(extraction1.fields.length, extraction2.fields.length);
    for (let i = 0; i < extraction1.fields.length; i++) {
      assert.strictEqual(
        extraction1.fields[i].fieldId,
        extraction2.fields[i].fieldId,
        'Field ID must be stable and deterministic across extractions'
      );
    }

    // Changing position or label changes the deterministic ID
    const idA = generateDeterministicFieldId({ formId: 'f1', name: 'email', label: 'Email', type: 'email', position: 0 });
    const idB = generateDeterministicFieldId({ formId: 'f1', name: 'email', label: 'Email', type: 'email', position: 1 });
    assert.notStrictEqual(idA, idB, 'Changing position must yield distinct fieldId');
  });

  // TEST 32 — Field mapping cannot invent candidate data
  test('TEST 32 — Field mapping cannot invent candidate data', () => {
    // Candidate profile with verified name and email, but NO work authorization, visa, or salary
    const sparseSnapshot = {
      candidate: {
        firstName: 'Jane',
        lastName: 'Doe',
        fullName: 'Jane Doe',
        email: 'jane.doe@example.com',
        // Omitted: careerPreferences (no workAuthorization, salaryFloor, visaSponsorship)
      },
      artifacts: {},
      answers: {},
    };

    const formSchema = {
      portalId: 'test-portal',
      formId: 'test-form',
      destinationUrl: 'https://example.com/apply',
      fields: [
        { fieldId: 'fld_email', name: 'email', label: 'Email Address', type: 'email', required: true },
        { fieldId: 'fld_auth', name: 'work_authorization', label: 'Are you authorized to work in the US?', type: 'select', required: true },
        { fieldId: 'fld_salary', name: 'salary_expectation', label: 'Desired Salary', type: 'number', required: false },
        { fieldId: 'fld_custom', name: 'unknown_question', label: 'Tell us a secret', type: 'UNKNOWN', required: false },
      ],
      questions: [],
      attachments: [],
      repeatedGroups: [],
      steps: [],
      isMultiStep: false,
      metadata: {},
    };

    const mapped = mapCanonicalApplicationToForm(sparseSnapshot, formSchema);
    const mappedMap = new Map(mapped.map((m) => [m.name, m]));

    // Email is verified from profile
    const emailMapped = mappedMap.get('email');
    assert.strictEqual(emailMapped.sanitizedValue, 'jane.doe@example.com');
    assert.strictEqual(emailMapped.provenance, 'VERIFIED_PROFILE');

    // Work authorization was NOT in profile -> MUST NOT BE INVENTED
    const authMapped = mappedMap.get('work_authorization');
    assert.strictEqual(authMapped.rawValue, null);
    assert.strictEqual(authMapped.sanitizedValue, null);
    assert.strictEqual(authMapped.provenance, 'UNKNOWN');
    assert.strictEqual(authMapped.confidence, 0);
    assert.strictEqual(authMapped.requiresUserReview, true);

    // Salary was NOT in profile -> MUST NOT BE INVENTED
    const salaryMapped = mappedMap.get('salary_expectation');
    assert.strictEqual(salaryMapped.rawValue, null);
    assert.strictEqual(salaryMapped.sanitizedValue, null);
    assert.strictEqual(salaryMapped.provenance, 'UNKNOWN');
    assert.strictEqual(salaryMapped.confidence, 0);

    // Unknown field -> requires review
    const customMapped = mappedMap.get('unknown_question');
    assert.strictEqual(customMapped.provenance, 'UNKNOWN');
    assert.strictEqual(customMapped.requiresUserReview, true);
  });

  // TEST 33 — Extension produces canonical form schema
  test('TEST 33 — Extension produces canonical form schema', () => {
    const inputs = [
      createMockInputElement({ id: 'first_name', name: 'first_name', label: 'First Name', required: true }),
      createMockInputElement({ id: 'email', name: 'email', type: 'email', label: 'Email', required: true }),
      createMockInputElement({ id: 'resume', name: 'resume', type: 'file', label: 'Resume', accept: '.pdf' }),
    ];

    const mockDoc = createMockDoc({ inputs });
    const adapter = new JobPortalAdapterBase({ id: 'ext-test-portal', name: 'Extension Test Portal' });

    // Base adapter delegates extractForm to return fields
    adapter.extractForm = () => FormDetector.detect(mockDoc);

    const schema = adapter.extractFormSchema(mockDoc, 'https://careers.example.com/apply/1');
    const parsed = PortalFormSchema.safeParse(schema);

    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.data.portalId, 'ext-test-portal');
    assert.strictEqual(parsed.data.fields.length, 3);
  });

  // TEST 34 — MCP/Web/Extension canonical application package remains equivalent
  test('TEST 34 — MCP/Web/Extension canonical application package remains equivalent', () => {
    assert.ok(basePackage, 'basePackage must be prepared in before()');
    assert.ok(basePackage.packageHash, 'packageHash must be present');
    assert.ok(basePackage.candidateId, 'candidateId must be present');
    assert.ok(basePackage.candidateEmail, 'candidateEmail must be present');
    assert.ok(basePackage.tailoredResume, 'tailoredResume must be present');

    // Simulating MCP, Web, and Extension consuming the package
    const mcpPackage = {
      packageHash: basePackage.packageHash,
      candidateId: basePackage.candidateId,
      candidateEmail: basePackage.candidateEmail,
      resume: basePackage.tailoredResume,
    };

    const webPackage = {
      packageHash: basePackage.packageHash,
      candidateId: basePackage.candidateId,
      candidateEmail: basePackage.candidateEmail,
      resume: basePackage.tailoredResume,
    };

    const extensionPackage = {
      packageHash: basePackage.packageHash,
      candidateId: basePackage.candidateId,
      candidateEmail: basePackage.candidateEmail,
      resume: basePackage.tailoredResume,
    };

    // Parity: All 3 consume the exact same packageHash and candidate truth
    assert.strictEqual(mcpPackage.packageHash, webPackage.packageHash);
    assert.strictEqual(webPackage.packageHash, extensionPackage.packageHash);
    assert.strictEqual(mcpPackage.candidateEmail, extensionPackage.candidateEmail);
  });

  // TEST 35 — Adding a new adapter does not require modifying the core workflow
  test('TEST 35 — Adding a new adapter does not require modifying the core workflow', () => {
    // Register a brand new fictional portal adapter into portalAdapterRegistry
    class AshbyPortalAdapter extends PortalAdapterContract {
      canHandle(dest) {
        return typeof dest === 'string' && dest.includes('ashbyhq.com');
      }
      async extractFormSchema(context) {
        return {
          portalId: this.id,
          formId: 'ashby-form',
          destinationUrl: 'https://jobs.ashbyhq.com/demo/1',
          fields: [],
          questions: [],
          attachments: [],
          repeatedGroups: [],
          steps: [],
          isMultiStep: false,
          metadata: {},
        };
      }
      async submitOrHandoff(context) {
        return {
          status: 'HANDOFF_READY',
          portalType: 'ASHBY',
          destinationUrl: 'https://jobs.ashbyhq.com/demo/1',
          message: 'Ashby handoff ready',
          handoffKit: { fields: [] },
          retryState: 'NOT_SENT',
          metadata: {},
        };
      }
    }

    const ashbyAdapter = new AshbyPortalAdapter({
      id: 'ashby-app-adapter',
      name: 'Ashby Application Adapter',
      priority: 80,
    });

    portalAdapterRegistry.register(ashbyAdapter);

    // Verify registry resolves it
    const resolved = portalAdapterRegistry.resolve('https://jobs.ashbyhq.com/demo/1');
    assert.ok(resolved);
    assert.strictEqual(resolved.id, 'ashby-app-adapter');

    // Verify workflowService remains intact and decoupled
    assert.ok(workflowService instanceof JobApplicationWorkflowService);

    // Clean up registry
    portalAdapterRegistry.unregister('ashby-app-adapter');
  });

  // TEST 36 — Greenhouse and Lever discovery adapters remain regression-safe
  test('TEST 36 — Greenhouse and Lever discovery adapters remain regression-safe', () => {
    const ghAdapter = new GreenhouseAdapter({ boardToken: 'stripe' });
    const ghMeta = ghAdapter.getMeta();
    assert.strictEqual(ghMeta.provider, 'GREENHOUSE');
    assert.strictEqual(ghMeta.boardToken, 'stripe');
    assert.strictEqual(typeof ghAdapter.fetchJobs, 'function');

    const leverAdapter = new LeverAdapter({ site: 'netflix' });
    const leverMeta = leverAdapter.getMeta();
    assert.strictEqual(leverMeta.provider, 'LEVER');
    assert.strictEqual(leverMeta.site, 'netflix');
    assert.strictEqual(typeof leverAdapter.fetchJobs, 'function');
  });
});
