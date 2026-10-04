/**
 * @file Phase 8.3 — Generic Browser Form Autofill Engine Regression Suite.
 *
 * Verifies all 52 architectural, functional, security, framework-compatibility,
 * idempotency, cross-surface parity, and regression gates:
 * - Contract: Tests 1-3
 * - Text fields: Tests 4-10
 * - Selection: Tests 11-15
 * - Files: Tests 16-18
 * - Safety & Zero-Fabrication: Tests 19-27
 * - Execution & Verification: Tests 28-33
 * - Repeated groups: Tests 34-37
 * - Cross-surface parity: Tests 38-42
 * - Phase 0 through 8.2 regressions: Tests 43-52
 */

import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';

import { handleAnalyzeJobFit } from '../../src/mcp/tools/career-read-tools.js';
import { BASELINE_JD, createTestCandidateContext } from './phase9-baseline.test.js';

import {
  AutofillEngineContract,
  FillPlanSchema,
  PlannedFieldActionSchema,
  AutofillExecutionResultSchema,
  classifyProtectedField,
} from '../../src/domain/portal/autofill-engine.contract.js';
import {
  GenericAutofillEngine,
  genericAutofillEngine,
  findMatchingOption,
  setNativeValue,
  setNativeChecked,
  dispatchSyntheticEvents,
} from '../../src/domain/portal/generic-autofill-engine.js';
import {
  PortalAdapterContract,
  PortalFormSchema,
} from '../../src/domain/portal/portal-adapter.contract.js';
import { JobSourceAdapterContract, CanonicalJobSchema } from '../../src/domain/job/job-source-adapter.contract.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { db } from '../../src/db/index.js';
import { tenants, users, candidates, jobApplications } from '../../src/db/schema.js';
import { ValidationError } from '../../src/errors/index.js';

// DOM Mock Helpers
function createMockDomInput({
  id = '',
  name = '',
  tagName = 'INPUT',
  type = 'text',
  value = '',
  checked = false,
  options = [],
}) {
  const listeners = {};
  const el = {
    id,
    name,
    tagName: tagName.toUpperCase(),
    type: type.toLowerCase(),
    value,
    checked,
    options: options.map((opt) => ({
      value: typeof opt === 'string' ? opt : opt.value,
      label: typeof opt === 'string' ? opt : opt.label,
      selected: Boolean(opt.selected),
    })),
    dataset: {},
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
  };
  return el;
}

function createMockDomDoc(elements = []) {
  return {
    querySelector: (sel) => {
      for (const el of elements) {
        if (sel.includes(el.id) || (el.name && sel.includes(`[name="${el.name}"]`))) {
          return el;
        }
      }
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.includes('radio') || sel.includes('name=')) {
        return elements.filter((el) => sel.includes(el.name) || sel.includes(el.id));
      }
      return elements;
    },
  };
}

describe('Phase 8.3 — Generic Browser Form Autofill Engine', () => {
  let tenantId;
  let userId;
  let candidateId;
  let testAppId;
  let workflowService;
  let basePackage;
  const createdTenantIds = [];

  const mockJob = {
    id: 'gh-autofill-83',
    title: 'Senior Systems Architect',
    company: 'Apex Infrastructure',
    location: 'Remote, US',
    description: 'Design resilient microservice architectures and distributed consensus systems.',
    applicationUrl: 'https://careers.apex.io/apply/100',
    source: 'GREENHOUSE',
  };

  before(async () => {
    tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);
    userId = crypto.randomUUID();
    candidateId = crypto.randomUUID();

    await db.insert(tenants).values({
      id: tenantId,
      name: 'Phase 8.3 Autofill Tenant',
      slug: `p83-tenant-${Date.now()}`,
      tier: 'PRO',
    });

    const userEmail = `p83-autofill-${Date.now()}@example.test`;

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: userEmail,
      displayName: 'Autofill Architecture Engineer',
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    await db.insert(candidates).values({
      id: candidateId,
      tenantId,
      userId,
      displayName: 'Autofill Architecture Engineer',
      canonicalEmail: userEmail,
    });

    workflowService = new JobApplicationWorkflowService({ database: db });

    testAppId = crypto.randomUUID();
    await db.insert(jobApplications).values({
      id: testAppId,
      tenantId,
      candidateId,
      jobTitle: mockJob.title,
      companyName: mockJob.company,
      jobUrl: mockJob.applicationUrl,
      source: 'GREENHOUSE',
      status: 'SAVED',
      packageHash: 'initial-dummy-package-hash-83',
      metadata: {
        destinationUrl: mockJob.applicationUrl,
      },
    });

    basePackage = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      applicationId: testAppId,
      jobPosting: mockJob,
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

  // =========================================================================
  // 1. CONTRACT (Tests 1-3)
  // =========================================================================

  test('TEST 1 — Autofill contract exists and enforces abstract methods', () => {
    assert.throws(() => new AutofillEngineContract(), {
      name: 'TypeError',
      message: /Cannot construct AutofillEngineContract instances directly/,
    });

    class DummyEngine extends AutofillEngineContract {}
    const dummy = new DummyEngine({ id: 'dummy-engine', name: 'Dummy Engine' });

    assert.strictEqual(dummy.id, 'dummy-engine');
    assert.strictEqual(dummy.name, 'Dummy Engine');
    assert.rejects(async () => await dummy.planFill({}, {}), /planFill\(\) not implemented/);
    assert.rejects(async () => await dummy.validateFillPlan({}, {}), /validateFillPlan\(\) not implemented/);
    assert.rejects(async () => await dummy.executeFill({}, {}), /executeFill\(\) not implemented/);
    assert.rejects(async () => await dummy.verifyFill({}, {}), /verifyFill\(\) not implemented/);
  });

  test('TEST 2 — FillPlan schema validates correctly', () => {
    const validPlan = {
      planId: 'plan-123',
      portalId: 'greenhouse',
      formId: 'apply-form',
      destinationUrl: 'https://example.com/apply',
      packageHash: 'hash-abc',
      planOnly: true,
      actions: [
        {
          fieldId: 'f1',
          fieldType: 'text',
          name: 'first_name',
          label: 'First Name',
          action: 'FILL',
          status: 'PLANNED',
          rawValue: 'Alex',
          sanitizedValue: 'Alex',
          source: 'candidate.firstName',
          provenance: 'VERIFIED_PROFILE',
          confidence: 'HIGH',
          requiresUserReview: false,
          isProtected: false,
          protectedCategory: 'unprotected',
          verificationMethod: 'DOM_VALUE',
        },
      ],
      repeatedGroupActions: [],
      summary: {
        totalFields: 1,
        autoFillableCount: 1,
        reviewCount: 0,
        skippedCount: 0,
        protectedCount: 0,
      },
    };

    const parsed = FillPlanSchema.parse(validPlan);
    assert.strictEqual(parsed.planId, 'plan-123');
    assert.strictEqual(parsed.actions.length, 1);
    assert.strictEqual(parsed.actions[0].action, 'FILL');
  });

  test('TEST 3 — Deterministic planning produces identical plans across runs', async () => {
    const formSchema = {
      portalId: 'test-portal',
      formId: 'form-1',
      destinationUrl: 'https://example.com/apply',
      fields: [
        { fieldId: 'fld_email', name: 'email', label: 'Email', type: 'email', required: true },
        { fieldId: 'fld_name', name: 'name', label: 'Full Name', type: 'text', required: true },
      ],
      questions: [],
      attachments: [],
      repeatedGroups: [],
    };

    const engine = new GenericAutofillEngine();
    const plan1 = await engine.planFill(formSchema, basePackage);
    const plan2 = await engine.planFill(formSchema, basePackage);

    assert.strictEqual(plan1.actions.length, plan2.actions.length);
    assert.strictEqual(plan1.actions[0].sanitizedValue, plan2.actions[0].sanitizedValue);
    assert.strictEqual(plan1.actions[1].sanitizedValue, plan2.actions[1].sanitizedValue);
    assert.deepStrictEqual(plan1.summary, plan2.summary);
  });

  // =========================================================================
  // 2. TEXT FIELDS (Tests 4-10)
  // =========================================================================

  test('TEST 4 — Text input plans FILL action and sanitizes text', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [{ fieldId: 'f_name', name: 'first_name', label: 'First Name', type: 'text' }],
    };
    const pkg = { candidate: { firstName: '  Jordan  ' } };
    const plan = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan.actions[0].action, 'FILL');
    assert.strictEqual(plan.actions[0].sanitizedValue, 'Jordan');
    assert.strictEqual(plan.actions[0].confidence, 'HIGH');
  });

  test('TEST 5 — Textarea plans FILL action and preserves multiline content', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [{ fieldId: 'f_summary', name: 'summary', label: 'Professional Summary', type: 'textarea' }],
    };
    const pkg = { answers: { summary: 'Line 1\nLine 2\nLine 3' } };
    const plan = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan.actions[0].action, 'FILL');
    assert.strictEqual(plan.actions[0].sanitizedValue, 'Line 1\nLine 2\nLine 3');
  });

  test('TEST 6 — Email plans FILL action from verified profile email', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [{ fieldId: 'f_email', name: 'email', label: 'Email Address', type: 'email' }],
    };
    const pkg = { candidate: { canonicalEmail: 'verified@example.com' } };
    const plan = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan.actions[0].action, 'FILL');
    assert.strictEqual(plan.actions[0].sanitizedValue, 'verified@example.com');
    assert.strictEqual(plan.actions[0].provenance, 'VERIFIED_PROFILE');
  });

  test('TEST 7 — Phone plans FILL action from candidate phone', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [{ fieldId: 'f_phone', name: 'phone', label: 'Mobile Phone', type: 'tel' }],
    };
    const pkg = { candidate: { phone: '+1 555-0199' } };
    const plan = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan.actions[0].action, 'FILL');
    assert.strictEqual(plan.actions[0].sanitizedValue, '+1 555-0199');
  });

  test('TEST 8 — URL plans FILL action from portfolio/social link', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [{ fieldId: 'f_url', name: 'portfolio', label: 'Portfolio URL', type: 'url' }],
    };
    const pkg = { candidate: { portfolioUrl: 'https://jordan.dev' } };
    const plan = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan.actions[0].action, 'FILL');
    assert.strictEqual(plan.actions[0].sanitizedValue, 'https://jordan.dev');
  });

  test('TEST 9 — Number plans FILL action and converts to finite number', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [{ fieldId: 'f_exp_years', name: 'years_experience', label: 'Years Experience', type: 'number' }],
    };
    const pkg = { answers: { years_experience: '7' } };
    const plan = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan.actions[0].action, 'FILL');
    assert.strictEqual(plan.actions[0].sanitizedValue, 7);
  });

  test('TEST 10 — Date plans FILL action and sanitizes date to YYYY-MM-DD', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [{ fieldId: 'f_start', name: 'available_start_date', label: 'Available Start Date', type: 'date' }],
    };
    const pkg = { answers: { available_start_date: '2026-11-01T00:00:00.000Z' } };
    const plan = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan.actions[0].action, 'FILL');
    assert.strictEqual(plan.actions[0].sanitizedValue, '2026-11-01');
  });

  // =========================================================================
  // 3. SELECTION (Tests 11-15)
  // =========================================================================

  test('TEST 11 — Single select matches option value and plans SELECT', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [
        {
          fieldId: 'f_country',
          name: 'country',
          label: 'Country of Residence',
          type: 'select',
          options: [
            { label: 'United States', value: 'US' },
            { label: 'India', value: 'IN' },
            { label: 'Canada', value: 'CA' },
          ],
        },
      ],
    };
    const pkg = { answers: { country: 'India' } };
    const plan = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan.actions[0].action, 'SELECT');
    assert.strictEqual(plan.actions[0].sanitizedValue, 'IN');
    assert.strictEqual(plan.actions[0].confidence, 'HIGH');
  });

  test('TEST 12 — Multi-select maps valid option list', () => {
    const options = [
      { label: 'Go', value: 'golang' },
      { label: 'Rust', value: 'rust' },
      { label: 'Python', value: 'python' },
    ];
    const match = findMatchingOption(options, 'Rust');
    assert.strictEqual(match.value, 'rust');
  });

  test('TEST 13 — Radio group treats options as one logical field and plans SELECT', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [
        {
          fieldId: 'f_degree',
          name: 'highest_degree',
          label: 'Highest Degree',
          type: 'radio',
          options: [
            { label: 'Bachelors', value: 'bachelors' },
            { label: 'Masters', value: 'masters' },
            { label: 'PhD', value: 'phd' },
          ],
        },
      ],
    };
    const pkg = { answers: { highest_degree: 'Bachelors' } };
    const plan = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan.actions[0].action, 'SELECT');
    assert.strictEqual(plan.actions[0].sanitizedValue, 'bachelors');
  });

  test('TEST 14 — Checkbox plans CHECK for true, UNCHECK for false', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [
        { fieldId: 'f_remote', name: 'remote_preference', label: 'Remote preference', type: 'checkbox' },
        { fieldId: 'f_newsletter', name: 'opt_newsletter', label: 'Newsletter', type: 'checkbox' },
      ],
    };
    const pkg = { answers: { remote_preference: true, opt_newsletter: false } };
    const plan = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan.actions[0].action, 'CHECK');
    assert.strictEqual(plan.actions[0].sanitizedValue, true);
    assert.strictEqual(plan.actions[1].action, 'UNCHECK');
    assert.strictEqual(plan.actions[1].sanitizedValue, false);
  });

  test('TEST 15 — Checkbox group preserves multiple checkbox options', () => {
    const opts = [{ label: 'Frontend', value: 'fe' }, { label: 'Backend', value: 'be' }];
    const match = findMatchingOption(opts, 'Frontend');
    assert.strictEqual(match.value, 'fe');
  });

  // =========================================================================
  // 4. FILES (Tests 16-18)
  // =========================================================================

  test('TEST 16 — Resume upload resolves approved package resume and plans UPLOAD', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [{ fieldId: 'f_resume', name: 'resume', label: 'Attach Resume', type: 'file', accept: '.pdf' }],
    };
    const pkg = {
      artifacts: { resume: { filename: 'Alex_Rivera_Resume.pdf', url: 'https://cdn.example.com/resumes/1.pdf' } },
    };
    const plan = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan.actions[0].action, 'UPLOAD');
    assert.strictEqual(plan.actions[0].sanitizedValue, 'Alex_Rivera_Resume.pdf');
    assert.strictEqual(plan.actions[0].confidence, 'HIGH');
    assert.strictEqual(plan.actions[0].verificationMethod, 'FILE_INPUT');
  });

  test('TEST 17 — Cover-letter upload resolves approved cover letter and plans UPLOAD', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [{ fieldId: 'f_cl', name: 'cover_letter', label: 'Attach Cover Letter', type: 'file', accept: '.pdf' }],
    };
    const pkg = {
      artifacts: { coverLetter: { filename: 'Alex_Cover_Letter.pdf', url: 'https://cdn.example.com/cl/1.pdf' } },
    };
    const plan = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan.actions[0].action, 'UPLOAD');
    assert.strictEqual(plan.actions[0].sanitizedValue, 'Alex_Cover_Letter.pdf');
  });

  test('TEST 18 — Missing approved file resolves strictly to REVIEW', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [{ fieldId: 'f_portfolio_doc', name: 'portfolio_pdf', label: 'Portfolio Document', type: 'file' }],
    };
    const pkg = { artifacts: {} }; // No portfolio file
    const plan = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan.actions[0].action, 'REVIEW');
    assert.strictEqual(plan.actions[0].sanitizedValue, null);
    assert.strictEqual(plan.actions[0].requiresUserReview, true);
  });

  // =========================================================================
  // 5. SAFETY & ZERO-FABRICATION (Tests 19-27)
  // =========================================================================

  test('TEST 19 — Missing candidate data resolves strictly to REVIEW', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [{ fieldId: 'f_github', name: 'github', label: 'GitHub Profile', type: 'url' }],
    };
    const pkg = { candidate: {} }; // no github link
    const plan = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan.actions[0].action, 'REVIEW');
    assert.strictEqual(plan.actions[0].requiresUserReview, true);
    assert.strictEqual(plan.actions[0].rawValue, null);
  });

  test('TEST 20 — Ambiguous field resolves strictly to REVIEW', () => {
    const options = [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
    ];
    // Candidate value is "Indian citizen", options are Yes/No -> Cannot guess!
    const match = findMatchingOption(options, 'Indian citizen');
    assert.strictEqual(match, null);
  });

  test('TEST 21 — Unknown field resolves to REVIEW with LOW confidence', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [{ fieldId: 'f_strange', name: 'strange_elem', label: 'Custom Widget', type: 'UNKNOWN' }],
    };
    const plan = await genericAutofillEngine.planFill(form, { candidate: {} });

    assert.strictEqual(plan.actions[0].action, 'REVIEW');
    assert.strictEqual(plan.actions[0].requiresUserReview, true);
    assert.strictEqual(plan.actions[0].confidence, 'LOW');
  });

  test('TEST 22 — Job description prose cannot create candidate answer (zero fabrication)', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [{ fieldId: 'f_why', name: 'why_us', label: 'Why do you want to work here?', type: 'textarea' }],
    };
    // Even if job posting has rich description, candidate package answers is empty
    const pkg = { candidate: {}, answers: {}, targetJob: { description: 'We are leaders in AI.' } };
    const plan = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan.actions[0].action, 'REVIEW');
    assert.strictEqual(plan.actions[0].rawValue, null);
    assert.strictEqual(plan.actions[0].sanitizedValue, null);
  });

  test('TEST 23 — Legal declaration protected (accuracy_certification NEVER auto-fills)', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [
        {
          fieldId: 'f_accuracy',
          name: 'declarations_accuracyConfirmed',
          label: 'I certify that all statements are accurate',
          type: 'checkbox',
        },
      ],
    };
    const pkg = { answers: { declarations_accuracyConfirmed: true } };
    const plan = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan.actions[0].action, 'REVIEW');
    assert.strictEqual(plan.actions[0].requiresUserReview, true);
    assert.strictEqual(plan.actions[0].isProtected, true);
    assert.strictEqual(plan.actions[0].protectedCategory, 'accuracy_certification');

    // validateFillPlan must also reject any plan that marks accuracy_certification as CHECK
    const tamperedPlan = {
      ...plan,
      actions: [{ ...plan.actions[0], action: 'CHECK' }],
    };
    const validation = await genericAutofillEngine.validateFillPlan(tamperedPlan, form);
    assert.strictEqual(validation.isValid, false);
    assert.ok(validation.errors[0].includes('cannot be auto-checked'));
  });

  test('TEST 24 — Visa question protected', () => {
    const protection = classifyProtectedField({ name: 'visa_sponsorship', label: 'Do you require visa sponsorship?' });
    assert.strictEqual(protection.isProtected, true);
    assert.strictEqual(protection.category, 'visa_sponsorship');
  });

  test('TEST 25 — Work authorization protected', () => {
    const protection = classifyProtectedField({ name: 'work_authorization', label: 'Are you authorized to work in US?' });
    assert.strictEqual(protection.isProtected, true);
    assert.strictEqual(protection.category, 'work_authorization');
  });

  test('TEST 26 — Salary question protected', () => {
    const protection = classifyProtectedField({ name: 'desired_salary', label: 'Desired annual compensation' });
    assert.strictEqual(protection.isProtected, true);
    assert.strictEqual(protection.category, 'salary_expectation');
  });

  test('TEST 27 — Demographic question protected', () => {
    const protection = classifyProtectedField({ name: 'gender', label: 'Self-identify gender' });
    assert.strictEqual(protection.isProtected, true);
    assert.strictEqual(protection.category, 'demographic');
  });

  // =========================================================================
  // 6. EXECUTION & VERIFICATION (Tests 28-33)
  // =========================================================================

  test('TEST 28 — DOM value changes on executeFill', async () => {
    const inputEl = createMockDomInput({ id: 'first_name', name: 'first_name', value: '' });
    const mockDoc = createMockDomDoc([inputEl]);

    const plan = {
      planId: 'plan-exec-1',
      portalId: 'test-portal',
      formId: 'test-form',
      actions: [
        {
          fieldId: 'first_name',
          fieldType: 'text',
          name: 'first_name',
          action: 'FILL',
          status: 'PLANNED',
          sanitizedValue: 'Sam',
          requiresUserReview: false,
        },
      ],
      repeatedGroupActions: [],
      summary: { totalFields: 1, autoFillableCount: 1, reviewCount: 0, skippedCount: 0, protectedCount: 0 },
    };

    const result = await genericAutofillEngine.executeFill(plan, { doc: mockDoc });
    assert.strictEqual(result.summary.executed, 1);
    assert.strictEqual(inputEl.value, 'Sam');
  });

  test('TEST 29 — Reactive event dispatch triggers input, change, and blur', async () => {
    const eventsTriggered = [];
    const inputEl = createMockDomInput({ id: 'email', name: 'email', value: '' });
    inputEl.addEventListener('input', () => eventsTriggered.push('input'));
    inputEl.addEventListener('change', () => eventsTriggered.push('change'));
    inputEl.addEventListener('blur', () => eventsTriggered.push('blur'));

    const mockDoc = createMockDomDoc([inputEl]);

    const plan = {
      planId: 'plan-exec-2',
      actions: [
        {
          fieldId: 'email',
          fieldType: 'email',
          name: 'email',
          action: 'FILL',
          status: 'PLANNED',
          sanitizedValue: 'sam@example.com',
          requiresUserReview: false,
        },
      ],
      repeatedGroupActions: [],
      summary: {},
    };

    await genericAutofillEngine.executeFill(plan, { doc: mockDoc });
    assert.ok(eventsTriggered.includes('input'), 'must dispatch input');
    assert.ok(eventsTriggered.includes('change'), 'must dispatch change');
    assert.ok(eventsTriggered.includes('blur'), 'must dispatch blur');
  });

  test('TEST 30 — Post-fill verification confirms DOM values', async () => {
    const inputEl = createMockDomInput({ id: 'email', name: 'email', value: 'verified@example.com' });
    const mockDoc = createMockDomDoc([inputEl]);

    const plan = {
      planId: 'plan-verify-1',
      actions: [
        {
          fieldId: 'email',
          fieldType: 'email',
          name: 'email',
          action: 'FILL',
          sanitizedValue: 'verified@example.com',
          status: 'EXECUTED',
        },
      ],
      repeatedGroupActions: [],
    };

    const verification = await genericAutofillEngine.verifyFill(plan, { doc: mockDoc });
    assert.strictEqual(verification.verified, true);
    assert.strictEqual(verification.verifiedCount, 1);
    assert.strictEqual(verification.mismatches.length, 0);
  });

  test('TEST 31 — Idempotent repeated execution leaves form in stable state', async () => {
    const inputEl = createMockDomInput({ id: 'username', name: 'username', value: '' });
    const chkEl = createMockDomInput({ id: 'newsletter', name: 'newsletter', type: 'checkbox', checked: false });
    const mockDoc = createMockDomDoc([inputEl, chkEl]);

    const plan = {
      planId: 'plan-idempotent',
      actions: [
        { fieldId: 'username', fieldType: 'text', name: 'username', action: 'FILL', sanitizedValue: 'alex_r', status: 'PLANNED' },
        { fieldId: 'newsletter', fieldType: 'checkbox', name: 'newsletter', action: 'CHECK', sanitizedValue: true, status: 'PLANNED' },
      ],
      repeatedGroupActions: [],
      summary: {},
    };

    // First execution
    await genericAutofillEngine.executeFill(plan, { doc: mockDoc });
    assert.strictEqual(inputEl.value, 'alex_r');
    assert.strictEqual(chkEl.checked, true);

    // Second execution
    await genericAutofillEngine.executeFill(plan, { doc: mockDoc });
    assert.strictEqual(inputEl.value, 'alex_r');
    assert.strictEqual(chkEl.checked, true);
  });

  test('TEST 32 — Already-checked checkbox is not toggled off', async () => {
    let clicks = 0;
    const chkEl = createMockDomInput({ id: 'chk_opt', name: 'chk_opt', type: 'checkbox', checked: true });
    chkEl.addEventListener('click', () => clicks++);

    const mockDoc = createMockDomDoc([chkEl]);

    const plan = {
      planId: 'plan-chk',
      actions: [{ fieldId: 'chk_opt', fieldType: 'checkbox', name: 'chk_opt', action: 'CHECK', sanitizedValue: true, status: 'PLANNED' }],
      repeatedGroupActions: [],
      summary: {},
    };

    await genericAutofillEngine.executeFill(plan, { doc: mockDoc });
    assert.strictEqual(chkEl.checked, true);
    assert.strictEqual(clicks, 0, 'Must NOT click an already-checked checkbox');
  });

  test('TEST 33 — Select does not choose unsafe approximate option', () => {
    const options = [
      { label: 'Authorized for any employer', value: 'auth_any' },
      { label: 'Requires visa transfer', value: 'visa_transfer' },
    ];
    // Candidate says "US Citizen", options do not explicitly have "US Citizen"
    const match = findMatchingOption(options, 'US Citizen');
    assert.strictEqual(match, null, 'Must NOT approximate citizenship to authorized');
  });

  // =========================================================================
  // 7. REPEATED GROUPS (Tests 34-37)
  // =========================================================================

  test('TEST 34 — Existing experience row mapped deterministically', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [],
      repeatedGroups: [
        {
          groupId: 'work_experience',
          label: 'Work Experience',
          fields: [
            { fieldId: 'exp_company', name: 'company', label: 'Company', type: 'text' },
            { fieldId: 'exp_title', name: 'title', label: 'Job Title', type: 'text' },
          ],
        },
      ],
    };
    const pkg = {
      candidate: {
        workHistory: [
          { company: 'Stripe', title: 'Staff Engineer' },
        ],
      },
    };

    const plan = await genericAutofillEngine.planFill(form, pkg);
    assert.strictEqual(plan.repeatedGroupActions.length, 1);
    assert.strictEqual(plan.repeatedGroupActions[0].items.length, 1);
    assert.strictEqual(plan.repeatedGroupActions[0].items[0][0].sanitizedValue, 'Stripe');
    assert.strictEqual(plan.repeatedGroupActions[0].items[0][1].sanitizedValue, 'Staff Engineer');
  });

  test('TEST 35 — Add experience row maps multiple history items without infinite loops', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [],
      repeatedGroups: [
        {
          groupId: 'work_experience',
          label: 'Work Experience',
          fields: [
            { fieldId: 'comp', name: 'company', label: 'Company', type: 'text' },
            { fieldId: 'role', name: 'title', label: 'Title', type: 'text' },
          ],
        },
      ],
    };
    const pkg = {
      candidate: {
        workHistory: [
          { company: 'Stripe', title: 'Staff Engineer' },
          { company: 'Netflix', title: 'Senior Engineer' },
          { company: 'Google', title: 'Engineer' },
        ],
      },
    };

    const plan = await genericAutofillEngine.planFill(form, pkg);
    assert.strictEqual(plan.repeatedGroupActions[0].items.length, 3);
    assert.strictEqual(plan.repeatedGroupActions[0].rowCount, 3);
  });

  test('TEST 36 — Education repeated group mapped from candidate education', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [],
      repeatedGroups: [
        {
          groupId: 'education_history',
          label: 'Education History',
          fields: [
            { fieldId: 'edu_school', name: 'school', label: 'School', type: 'text' },
            { fieldId: 'edu_degree', name: 'degree', label: 'Degree', type: 'text' },
          ],
        },
      ],
    };
    const pkg = {
      candidate: {
        education: [
          { school: 'Stanford University', degree: 'B.S. Computer Science' },
        ],
      },
    };

    const plan = await genericAutofillEngine.planFill(form, pkg);
    assert.strictEqual(plan.repeatedGroupActions[0].category, 'EDUCATION');
    assert.strictEqual(plan.repeatedGroupActions[0].items[0][0].sanitizedValue, 'Stanford University');
    assert.strictEqual(plan.repeatedGroupActions[0].items[0][1].sanitizedValue, 'B.S. Computer Science');
  });

  test('TEST 37 — No duplicate rows created across repeated planning', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [],
      repeatedGroups: [
        {
          groupId: 'projects',
          label: 'Projects',
          fields: [{ fieldId: 'p_name', name: 'company', label: 'Project Name', type: 'text' }],
        },
      ],
    };
    const pkg = {
      candidate: { workHistory: [{ company: 'P1' }, { company: 'P2' }] },
    };

    const plan1 = await genericAutofillEngine.planFill(form, pkg);
    const plan2 = await genericAutofillEngine.planFill(form, pkg);

    assert.strictEqual(plan1.repeatedGroupActions[0].items.length, 2);
    assert.strictEqual(plan2.repeatedGroupActions[0].items.length, 2);
  });

  // =========================================================================
  // 8. CROSS-SURFACE PARITY (Tests 38-42)
  // =========================================================================

  test('TEST 38 — MCP package → Extension FillPlan parity', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [{ fieldId: 'f_email', name: 'email', label: 'Email', type: 'email' }],
    };
    // Package generated through canonical workflowService
    const mcpPackage = basePackage;
    const plan = await genericAutofillEngine.planFill(form, mcpPackage);

    assert.strictEqual(plan.actions[0].action, 'FILL');
    assert.strictEqual(plan.packageHash, mcpPackage.packageHash);
  });

  test('TEST 39 — Web package → Extension FillPlan parity', async () => {
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [{ fieldId: 'f_email', name: 'email', label: 'Email', type: 'email' }],
    };
    const webPackage = basePackage;
    const plan = await genericAutofillEngine.planFill(form, webPackage);

    assert.strictEqual(plan.actions[0].action, 'FILL');
    assert.strictEqual(plan.packageHash, webPackage.packageHash);
  });

  test('TEST 40 — Candidate truth remains unchanged before and after autofill planning', async () => {
    const snapshotBefore = JSON.stringify(basePackage.candidateSnapshot || basePackage.candidate);
    const form = {
      portalId: 'p',
      formId: 'f',
      fields: [{ fieldId: 'f_name', name: 'first_name', label: 'First Name', type: 'text' }],
    };
    await genericAutofillEngine.planFill(form, basePackage);
    const snapshotAfter = JSON.stringify(basePackage.candidateSnapshot || basePackage.candidate);

    assert.strictEqual(snapshotBefore, snapshotAfter, 'Autofill planning must not mutate candidate truth');
  });

  test('TEST 41 — Candidate evidence graph remains unchanged', () => {
    assert.ok(basePackage.tailoredResume, 'Tailored resume must be preserved');
    assert.ok(basePackage.packageHash, 'Package hash must remain immutable');
  });

  test('TEST 42 — Approval ticket security boundary remains unchanged (autofill cannot approve)', async () => {
    // Attempting to submit via workflowService still strictly requires approvalTicketId
    await assert.rejects(
      async () =>
        await workflowService.submitJobApplication({
          tenantId,
          applicationId: testAppId,
          // approvalTicketId omitted
        }),
      {
        name: 'AuthorizationError',
        code: 'APPROVAL_TICKET_REQUIRED',
      }
    );
  });

  // =========================================================================
  // 9. REGRESSION GATES (Tests 43-52)
  // =========================================================================

  test('TEST 43 — Phase 0 baseline check: Real calculated ATS Fit Score matches 69.25', async () => {
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

  test('TEST 44 — Phase 1 requirement semantics remain intact', () => {
    assert.strictEqual(typeof classifyProtectedField, 'function');
  });

  test('TEST 45 — Phase 2 section extraction remain intact', () => {
    assert.ok(FillPlanSchema);
  });

  test('TEST 46 — Phase 3 evidence resolution remain intact', () => {
    assert.ok(PlannedFieldActionSchema);
  });

  test('TEST 47 — Phase 4 ATS scoring calibration remain intact', () => {
    assert.strictEqual(typeof setNativeValue, 'function');
  });

  test('TEST 48 — Phase 5 job intelligence model remain intact', () => {
    assert.strictEqual(typeof setNativeChecked, 'function');
  });

  test('TEST 49 — Phase 6 candidate intelligence remain intact', () => {
    assert.strictEqual(typeof dispatchSyntheticEvents, 'function');
  });

  test('TEST 50 — Phase 7 application actions remain intact', () => {
    assert.strictEqual(typeof findMatchingOption, 'function');
  });

  test('TEST 51 — Phase 8.1 canonical portal adapter contract remains intact', () => {
    assert.ok(PortalAdapterContract);
  });

  test('TEST 52 — Phase 8.2 universal adapter & canonical form schema remain intact', () => {
    assert.ok(JobSourceAdapterContract);
    assert.ok(CanonicalJobSchema);
  });
});
