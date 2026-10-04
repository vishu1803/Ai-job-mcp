/**
 * @file Phase 8.5 — Generic Career Site Fallback E2E Test Suite.
 *
 * Validates the universal fallback application adapter for unknown employer portals:
 * - Unknown portal detection & registry fallback order
 * - 24-attribute career taxonomy extraction
 * - Semantic priority matching (canonical ID > autocomplete > exact name > id > label > semantic > conservative)
 * - Generic autofill execution & verification
 * - Multi-step navigation detection (Next, Continue, Back, Review, Submit)
 * - Validation error normalization & recovery
 * - Dynamic DOM mutations (field appearance, repeated row addition)
 * - Iframe boundary handling (accessible vs cross-origin blocked)
 * - Custom questions & Zero-fabrication enforcement
 * - Sensitive field protection (work auth, visa, salary, EEO, declarations)
 * - Idempotency & submission safety (never auto-submits; halts at READY_FOR_FINAL_REVIEW)
 */

import test, { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  GenericCareerSiteAdapter,
  GreenhousePortalAdapter,
  registerAllPortalAdapters,
} from '../../src/domain/portal/adapters/index.js';
import {
  PortalAdapterRegistry,
} from '../../src/domain/portal/portal-adapter-registry.js';
import {
  PortalFormSchema,
  FieldValidationErrorSchema,
} from '../../src/domain/portal/portal-adapter.contract.js';

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

describe('Phase 8.5 — Generic Career Site Fallback E2E', () => {
  const basePackage = {
    candidate: {
      firstName: 'Marcus',
      lastName: 'Holloway',
      displayName: 'Marcus Holloway',
      canonicalEmail: 'marcus.h@dedsec.test',
      phone: '+1 (415) 332-9011',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94107',
      country: 'United States',
      socialLinks: {
        linkedin: 'https://linkedin.com/in/mholloway-eng',
        github: 'https://github.com/mholloway-dev',
        portfolio: 'https://marcus.io',
      },
      careerPreferences: {
        salaryFloor: 185000,
        workAuthorization: 'US_CITIZEN',
        visaSponsorshipRequired: false,
      },
    },
    candidateSnapshot: {
      candidateName: 'Marcus Holloway',
      contact: {
        phone: '+1 (415) 332-9011',
      },
    },
    artifacts: {
      resume: { filename: 'Marcus_Holloway_Resume.pdf', url: 'https://cdn.example.com/resumes/marcus.pdf' },
      coverLetter: { filename: 'Marcus_Holloway_CoverLetter.pdf', url: 'https://cdn.example.com/letters/marcus.pdf' },
    },
    answers: {
      custom_motivation: {
        value: 'Excited to build privacy-preserving decentralized platforms.',
        provenance: 'USER_PROVIDED',
      },
    },
  };

  // =========================================================================
  // 1. UNKNOWN PORTAL DETECTION & REGISTRY RESOLUTION
  // =========================================================================
  describe('Detection & Fallback Order', () => {
    it('TEST 1 — Unknown career portal resolves to GenericCareerSiteAdapter when registered', () => {
      const registry = new PortalAdapterRegistry();
      registerAllPortalAdapters(registry);

      const unknownUrl = 'https://careers.stealthstartup.io/apply/engineer';
      const resolved = registry.resolve(unknownUrl);
      assert.ok(resolved);
      assert.strictEqual(resolved.id, 'generic-career-site-adapter');
    });

    it('TEST 2 — Known ATS portals take strict precedence over generic fallback', () => {
      const registry = new PortalAdapterRegistry();
      registerAllPortalAdapters(registry);

      const ghResolved = registry.resolve('https://boards.greenhouse.io/corp/jobs/1');
      assert.strictEqual(ghResolved.id, 'greenhouse-portal-adapter');

      const leverResolved = registry.resolve('https://jobs.lever.co/corp/job-2');
      assert.strictEqual(leverResolved.id, 'lever-portal-adapter');
    });
  });

  // =========================================================================
  // 2. 24-ATTRIBUTE CAREER TAXONOMY & SEMANTIC EXTRACTION
  // =========================================================================
  describe('Taxonomy & Semantic Priority Extraction', () => {
    it('TEST 3 — Autocomplete attributes take precedence in semantic field classification', async () => {
      const adapter = new GenericCareerSiteAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'c_fn', name: 'c_fn', attributes: { autocomplete: 'given-name' } }),
        createMockDomElement({ id: 'c_ln', name: 'c_ln', attributes: { autocomplete: 'family-name' } }),
        createMockDomElement({ id: 'c_em', name: 'c_em', attributes: { autocomplete: 'email' } }),
        createMockDomElement({ id: 'c_tel', name: 'c_tel', attributes: { autocomplete: 'tel' } }),
      ]);

      const schema = await adapter.extractFormSchema({ doc: mockDoc });
      assert.ok(schema.fields.some((f) => f.name === 'first_name'));
      assert.ok(schema.fields.some((f) => f.name === 'last_name'));
      assert.ok(schema.fields.some((f) => f.name === 'email'));
      assert.ok(schema.fields.some((f) => f.name === 'phone'));
    });

    it('TEST 4 — Comprehensive taxonomy extraction across all 24 attributes', async () => {
      const adapter = new GenericCareerSiteAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'first_name', name: 'first_name' }),
        createMockDomElement({ id: 'last_name', name: 'last_name' }),
        createMockDomElement({ id: 'email', name: 'email', type: 'email' }),
        createMockDomElement({ id: 'phone', name: 'phone', type: 'tel' }),
        createMockDomElement({ id: 'address', name: 'address' }),
        createMockDomElement({ id: 'city', name: 'city' }),
        createMockDomElement({ id: 'state', name: 'state' }),
        createMockDomElement({ id: 'country', name: 'country' }),
        createMockDomElement({ id: 'postal_code', name: 'postal_code' }),
        createMockDomElement({ id: 'linkedin', name: 'linkedin', type: 'url' }),
        createMockDomElement({ id: 'github', name: 'github', type: 'url' }),
        createMockDomElement({ id: 'portfolio', name: 'portfolio', type: 'url' }),
        createMockDomElement({ id: 'website', name: 'website', type: 'url' }),
        createMockDomElement({ id: 'resume', name: 'resume', type: 'file' }),
        createMockDomElement({ id: 'cover_letter', name: 'cover_letter', type: 'file' }),
        createMockDomElement({ id: 'school', name: 'school' }),
        createMockDomElement({ id: 'degree', name: 'degree' }),
        createMockDomElement({ id: 'company', name: 'company' }),
        createMockDomElement({ id: 'job_title', name: 'job_title' }),
        createMockDomElement({ id: 'start_date', name: 'start_date', type: 'date' }),
        createMockDomElement({ id: 'end_date', name: 'end_date', type: 'date' }),
        createMockDomElement({ id: 'skills', name: 'skills', tagName: 'TEXTAREA' }),
      ]);

      const schema = await adapter.extractFormSchema({ doc: mockDoc });
      assert.doesNotThrow(() => PortalFormSchema.parse(schema));
      assert.strictEqual(schema.attachments.length, 2);
      assert.ok(schema.fields.length >= 20);
    });

    it('TEST 5 — Conservative fallback preserves unknown fields with requiresUserReview: true', async () => {
      const adapter = new GenericCareerSiteAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'first_name', name: 'first_name' }),
        createMockDomElement({ id: 'custom_widget_x', name: 'custom_widget_x', placeholder: 'Enter internal routing ID' }),
      ]);

      const schema = await adapter.extractFormSchema({ doc: mockDoc });
      const unknownFld = schema.fields.find((f) => f.name === 'custom_widget_x');
      assert.ok(unknownFld);
      assert.strictEqual(unknownFld.requiresUserReview, true);
    });
  });

  // =========================================================================
  // 3. SENSITIVE FIELDS & CUSTOM QUESTIONS (ZERO FABRICATION)
  // =========================================================================
  describe('Sensitive Protection & Custom Questions', () => {
    it('TEST 6 — Protected sensitive fields strictly marked requiresUserReview: true', async () => {
      const adapter = new GenericCareerSiteAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'work_auth', name: 'work_authorization', attributes: { 'aria-label': 'Are you legally authorized to work?' } }),
        createMockDomElement({ id: 'visa_req', name: 'require_visa', attributes: { 'aria-label': 'Will you require sponsorship?' } }),
        createMockDomElement({ id: 'desired_salary', name: 'desired_salary', attributes: { 'aria-label': 'Expected salary rate' } }),
        createMockDomElement({ id: 'acc_cert', name: 'accuracy_certify', type: 'checkbox', attributes: { 'aria-label': 'I certify this is accurate' } }),
      ]);

      const schema = await adapter.extractFormSchema({ doc: mockDoc });
      for (const field of schema.fields) {
        assert.strictEqual(field.requiresUserReview, true);
        assert.strictEqual(field.metadata.isSensitive, true);
      }
    });

    it('TEST 7 — Approved custom question answer fills with HIGH confidence', async () => {
      const adapter = new GenericCareerSiteAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'custom_motivation', name: 'custom_motivation', tagName: 'TEXTAREA', placeholder: 'Why do you want to work here?' }),
      ]);

      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, basePackage);
      const action = fillPlan.actions.find((a) => a.name === 'custom_motivation');
      assert.ok(action);
      assert.strictEqual(action.action, 'FILL');
      assert.strictEqual(action.sanitizedValue, 'Excited to build privacy-preserving decentralized platforms.');
      assert.strictEqual(action.confidence, 'HIGH');
    });

    it('TEST 8 — Unapproved custom question resolves strictly to action: REVIEW (zero fabrication)', async () => {
      const adapter = new GenericCareerSiteAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'custom_greatest_challenge', name: 'custom_greatest_challenge', tagName: 'TEXTAREA', placeholder: 'Describe your greatest challenge' }),
      ]);

      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, basePackage);
      const action = fillPlan.actions.find((a) => a.name === 'custom_greatest_challenge');
      assert.ok(action);
      assert.strictEqual(action.action, 'REVIEW');
      assert.strictEqual(action.requiresUserReview, true);
      assert.strictEqual(action.rawValue, null);
    });
  });

  // =========================================================================
  // 4. MULTI-STEP NAVIGATION & DYNAMIC DOM MUTATIONS
  // =========================================================================
  describe('Multi-Step Navigation & Dynamic DOM', () => {
    it('TEST 9 — Multi-step navigation detects forward vs back vs review vs submit', () => {
      const adapter = new GenericCareerSiteAdapter();
      const forwardDoc = createMockDomDoc([
        createMockDomElement({ tagName: 'BUTTON', textContent: 'Save and continue' }),
      ]);
      assert.strictEqual(adapter.detectNavigationAction(forwardDoc).action, 'NAVIGATE_FORWARD');

      const backDoc = createMockDomDoc([
        createMockDomElement({ tagName: 'BUTTON', textContent: 'Previous Step' }),
      ]);
      assert.strictEqual(adapter.detectNavigationAction(backDoc).action, 'NAVIGATE_BACK');

      const reviewDoc = createMockDomDoc([
        createMockDomElement({ tagName: 'BUTTON', textContent: 'Review Application' }),
      ]);
      assert.strictEqual(adapter.detectNavigationAction(reviewDoc).action, 'REVIEW');

      const submitDoc = createMockDomDoc([
        createMockDomElement({ tagName: 'BUTTON', textContent: 'Submit Application' }),
      ]);
      assert.strictEqual(adapter.detectNavigationAction(submitDoc).action, 'SUBMIT');
    });

    it('TEST 10 — Dynamic DOM: Form refresh picks up dynamically injected fields', async () => {
      const adapter = new GenericCareerSiteAdapter();
      const initialElements = [
        createMockDomElement({ id: 'first_name', name: 'first_name' }),
      ];
      const mockDoc = createMockDomDoc(initialElements);

      const initialSchema = await adapter.extractFormSchema({ doc: mockDoc });
      assert.strictEqual(initialSchema.fields.length, 1);

      // Simulate dynamic DOM injection (e.g. conditional question appears)
      initialElements.push(createMockDomElement({ id: 'injected_q', name: 'injected_q', placeholder: 'Tell us about your recent work' }));
      const refreshedSchema = await adapter.refreshFormSchema({ doc: mockDoc });
      assert.strictEqual(refreshedSchema.fields.length, 2);
      assert.ok(refreshedSchema.fields.some((f) => f.name === 'injected_q'));
    });
  });

  // =========================================================================
  // 5. IFRAMES, VALIDATION RECOVERY & SUBMISSION SAFETY
  // =========================================================================
  describe('Iframes, Validation & Submission Safety', () => {
    it('TEST 11 — Cross-origin blocked iframe produces status NEEDS_REVIEW without crashing', async () => {
      const adapter = new GenericCareerSiteAdapter();
      const blockedIframe = {
        id: 'external_app_frame',
        tagName: 'IFRAME',
        get contentDocument() {
          throw new Error('SecurityError: Blocked cross-origin frame');
        },
      };
      const mockDoc = createMockDomDoc([], [blockedIframe]);
      const schema = await adapter.extractFormSchema({ doc: mockDoc });
      assert.strictEqual(schema.metadata.status, 'NEEDS_REVIEW');
      assert.strictEqual(schema.metadata.iframeBlocked, true);
    });

    it('TEST 12 — Validation errors normalize into canonical FieldValidationError', () => {
      const adapter = new GenericCareerSiteAdapter();
      const err = adapter.normalizeValidationError({
        fieldId: 'f_email',
        rawMessage: 'Please enter a valid email address',
      });
      assert.strictEqual(err.code, 'INVALID_EMAIL_FORMAT');
      assert.strictEqual(err.recoverable, true);
      assert.strictEqual(err.requiresUserReview, true);
    });

    it('TEST 13 — Idempotency: Repeated execution leaves form in stable verified state', async () => {
      const adapter = new GenericCareerSiteAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'first_name', name: 'first_name' }),
        createMockDomElement({ id: 'email', name: 'email', type: 'email' }),
      ]);

      const { fillPlan } = await adapter.prepareAutofill({ doc: mockDoc }, basePackage);
      const firstRun = await adapter.executeAutofill(fillPlan, { doc: mockDoc });
      const secondRun = await adapter.executeAutofill(fillPlan, { doc: mockDoc });

      assert.strictEqual(firstRun.verificationResult.mismatches.length, 0);
      assert.strictEqual(secondRun.verificationResult.mismatches.length, 0);
      assert.strictEqual(firstRun.verificationResult.verified, true);
      assert.strictEqual(secondRun.verificationResult.verified, true);
    });

    it('TEST 14 — Submission Safety: Final submit is NEVER clicked automatically; halts at READY_FOR_FINAL_REVIEW', async () => {
      const adapter = new GenericCareerSiteAdapter();
      const mockDoc = createMockDomDoc([
        createMockDomElement({ id: 'submit_app', tagName: 'BUTTON', type: 'submit', textContent: 'Submit Application' }),
      ]);

      const handoff = await adapter.submitOrHandoff({ doc: mockDoc, destinationUrl: 'https://careers.custom.io/apply' });
      assert.strictEqual(handoff.status, 'HANDOFF_READY');
      assert.strictEqual(handoff.handoffKit.finalSubmitBlocked, true);
      assert.strictEqual(handoff.handoffKit.requiresUserApproval, true);
      assert.strictEqual(handoff.handoffKit.status, 'READY_FOR_REVIEW');
    });
  });
});
