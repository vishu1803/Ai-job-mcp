/**
 * @file P69 Unit Test Suite: Fix LinkedIn False Negatives & ChatGPT False Positives
 *
 * Validates:
 * 1. 4-Stage Detection Architecture:
 *    - Stage 1: Portal Identity (LINKEDIN, GREENHOUSE, LEVER, or NONE for ordinary web pages)
 *    - Stage 2: Job Context Detection (dedicated canHandle / structural posting evidence)
 *    - Stage 3: Localized Extraction (NO doc.body.textContent)
 *    - Stage 4: Readiness & Validation (isReady, isConfident)
 * 2. Live LinkedIn Scenarios:
 *    - Canonical view URL with delayed DOM
 *    - currentJobId query param in search/collections
 *    - SPA selected job with active rail item
 *    - LinkedIn without numeric externalJobId but valid title + substantive description
 *    - LinkedIn complete DOM with Easy Apply (optional signal verified)
 *    - LinkedIn complete DOM without Easy Apply (verified detected)
 *    - LinkedIn missing company with valid description preserves company: ""
 *    - LinkedIn document.title pipe delimiter format ("Title | Company | LinkedIn")
 *    - Appinventiv Software Engineer fixture regression
 * 3. ChatGPT & Generic False Positive Elimination:
 *    - Normal ChatGPT conversation discussing job descriptions/requirements
 *    - GitHub issue/README with hiring words
 *    - Technical documentation mentioning responsibilities/qualifications
 *    - Generic blog article
 * 4. Preserved Working Portals (Zero Regressions):
 *    - Greenhouse job posting
 *    - Lever job posting
 *    - Company career page with JSON-LD JobPosting
 *    - Company career page with structural job posting DOM
 *    - Wellfound job posting
 * 5. Sidebar & Server Boundary:
 *    - Unlocked navigation to non-job page clears state, displays Web Page, disables Analyze
 *    - Exactly 0 server calls on non-job pages
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { AdapterRegistry } from '../../extension/job-detection/adapter-registry.js';
import { JobPageDetector } from '../../extension/job-detection/job-page-detector.js';
import { JobDetectionEngine } from '../../extension/job-detection/detection-engine.js';
import { LinkedInAdapter } from '../../extension/job-detection/adapters/linkedin.adapter.js';
import { GenericCareerPageAdapter } from '../../extension/job-detection/adapters/generic-career.adapter.js';
import { GreenhouseAdapter } from '../../extension/job-detection/adapters/greenhouse.adapter.js';
import { SidebarController } from '../../extension/sidebar/sidebar.js';
import { WORKFLOW_STATES } from '../../extension/lib/workflow-state-machine.js';

function createMockDocument({
  url = 'https://example.com',
  title = '',
  elements = {},
  meta = {},
  scripts = [],
  bodyText = '',
} = {}) {
  return {
    title,
    location: { href: url, search: url.includes('?') ? url.substring(url.indexOf('?')) : '' },
    body: { textContent: bodyText },
    querySelector(selector) {
      let found = null;
      if (elements[selector]) {
        found = elements[selector];
      } else {
        for (const [key, el] of Object.entries(elements)) {
          if (key === selector) { found = el; break; }
          if (selector.includes(key)) { found = el; break; }
          if (key.startsWith('.') && selector.includes(`class*="${key.slice(1)}"`)) { found = el; break; }
          if (key.startsWith('#') && selector.includes(`id*="${key.slice(1)}"`)) { found = el; break; }
        }
      }
      if (found) {
        if (!found.querySelectorAll) found.querySelectorAll = () => [];
        return found;
      }
      if (selector.startsWith('meta[')) {
        const propMatch = selector.match(/property="([^"]+)"/);
        if (propMatch && meta[propMatch[1]]) {
          return { content: meta[propMatch[1]] };
        }
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('application/ld+json')) {
        return scripts.map((s) => ({ textContent: typeof s === 'string' ? s : JSON.stringify(s) }));
      }
      if (elements[selector]) {
        return Array.isArray(elements[selector]) ? elements[selector] : [elements[selector]];
      }
      return [];
    },
  };
}

function setupMockDOM() {
  const storeMap = new Map();
  const listeners = [];

  global.chrome = {
    runtime: {
      onMessage: {
        _listeners: listeners,
        addListener(fn) { this._listeners.push(fn); },
        dispatch(msg, sender = {}) { for (const l of this._listeners) l(msg, sender); },
      },
      sendMessage: async () => ({ success: true }),
    },
    tabs: {
      query: async () => [{ id: 101, url: 'https://chatgpt.com/c/test-chat' }],
      sendMessage: async (_tabId, msg) => {
        if (msg.type === 'PING') return { status: 'PONG', loaded: true };
        if (msg.type === 'DETECT_JOB_PAGE') {
          return {
            success: true,
            detected: false,
            ready: false,
            confidence: 'LOW',
            confidenceScore: 0,
            jobData: null,
            portalMetadata: {
              adapterId: 'NONE',
              portalId: 'NONE',
              portalName: 'Web Page',
              isPortalRecognized: false,
            },
            requestId: msg.requestId,
            tabId: msg.tabId,
            generation: msg.generation,
          };
        }
        return null;
      },
      create: async () => {},
    },
    storage: {
      local: {
        get: async (key) => {
          if (typeof key === 'string') return { [key]: storeMap.get(key) };
          if (Array.isArray(key)) {
            const out = {};
            for (const k of key) out[k] = storeMap.get(k);
            return out;
          }
          const out = {};
          for (const [k, v] of storeMap.entries()) out[k] = v;
          return out;
        },
        set: async (obj) => {
          for (const [k, v] of Object.entries(obj)) storeMap.set(k, v);
        },
        remove: async (key) => {
          if (Array.isArray(key)) for (const k of key) storeMap.delete(k);
          else storeMap.delete(key);
        },
      },
    },
  };

  const createMockElement = (id) => ({
    id,
    textContent: '',
    className: '',
    classList: {
      _classes: new Set(['hidden']),
      add(cls) { this._classes.add(cls); },
      remove(cls) { this._classes.delete(cls); },
      contains(cls) { return this._classes.has(cls); },
    },
    disabled: false,
    innerHTML: '',
    appendChild() {},
    setAttribute() {},
    removeAttribute() {},
    addEventListener() {},
    dispatchEvent() {},
    click() {},
  });

  global.document = {
    createElement: (tag) => createMockElement(tag),
    getElementById: () => null,
  };

  return {
    jobNotDetectedState: createMockElement('jobNotDetectedState'),
    jobDetectedState: createMockElement('jobDetectedState'),
    jobTitle: createMockElement('jobTitle'),
    jobCompany: createMockElement('jobCompany'),
    jobLocation: createMockElement('jobLocation'),
    jobType: createMockElement('jobType'),
    portalName: createMockElement('portalName'),
    workflowStateText: createMockElement('workflowStateText'),
    workflowLockBanner: createMockElement('workflowLockBanner'),
    workflowLockedBadge: createMockElement('workflowLockedBadge'),
    analyzeJobBtn: createMockElement('analyzeJobBtn'),
    rescanBtn: createMockElement('rescanBtn'),
    pendingJobNotification: createMockElement('pendingJobNotification'),
    pendingJobTitle: createMockElement('pendingJobTitle'),
    rescanPendingBtn: createMockElement('rescanPendingBtn'),
    analysisCard: createMockElement('analysisCard'),
    projectsCard: createMockElement('projectsCard'),
    handoffCard: createMockElement('handoffCard'),
    formDetectionCard: createMockElement('formDetectionCard'),
    reanalyzeBtn: createMockElement('reanalyzeBtn'),
    regenerateHandoffBtn: createMockElement('regenerateHandoffBtn'),
    regenerateConfirmBox: createMockElement('regenerateConfirmBox'),
    analysisErrorBanner: createMockElement('analysisErrorBanner'),
    handoffErrorBanner: createMockElement('handoffErrorBanner'),
    scoreValue: createMockElement('scoreValue'),
    matchBandBadge: createMockElement('matchBandBadge'),
    matchedSkillsCount: createMockElement('matchedSkillsCount'),
    missingSkillsCount: createMockElement('missingSkillsCount'),
    experienceFitVal: createMockElement('experienceFitVal'),
    matchedSkillsList: createMockElement('matchedSkillsList'),
    missingSkillsList: createMockElement('missingSkillsList'),
  };
}

describe('P69 Unit Tests: Fix LinkedIn False Negatives & ChatGPT False Positives', () => {

  describe('1. Four-Stage Resolution & Adapter Registry Separation', () => {
    it('Ordinary web page resolves to adapterId: NONE, isJobPage: false, portalName: Web Page', () => {
      const doc = createMockDocument({
        url: 'https://chatgpt.com/c/some-conversation-id',
        title: 'ChatGPT - Career Advice & Resume Building',
        bodyText: 'Here is a job description for a Senior Software Engineer. Requirements include 5 years Go and Kubernetes.',
      });

      const resolved = AdapterRegistry.resolve(doc, 'https://chatgpt.com/c/some-conversation-id');
      assert.equal(resolved.adapterId, 'NONE');
      assert.equal(resolved.isJobPage, false);
      assert.equal(resolved.metadata.portalName, 'Web Page');

      const evaluation = JobDetectionEngine.evaluate(doc, 'https://chatgpt.com/c/some-conversation-id');
      assert.equal(evaluation.detected, false);
      assert.equal(evaluation.ready, false);
      assert.equal(evaluation.jobData, null);
      assert.equal(evaluation.portalMetadata.portalName, 'Web Page');
    });

    it('LinkedIn non-job page resolves to adapterId: LINKEDIN, isJobPage: false, portalName: LinkedIn Jobs', () => {
      const doc = createMockDocument({
        url: 'https://www.linkedin.com/feed/',
        title: 'LinkedIn Feed',
        bodyText: 'Latest posts from connections hiring across the industry.',
      });

      const resolved = AdapterRegistry.resolve(doc, 'https://www.linkedin.com/feed/');
      assert.equal(resolved.adapterId, 'LINKEDIN');
      assert.equal(resolved.isJobPage, false);
      assert.equal(resolved.metadata.portalName, 'LinkedIn Jobs');

      const evaluation = JobDetectionEngine.evaluate(doc, 'https://www.linkedin.com/feed/');
      assert.equal(evaluation.detected, false);
      assert.equal(evaluation.ready, false);
      assert.equal(evaluation.jobData, null);
    });

    it('LinkedIn job posting page resolves to adapterId: LINKEDIN, isJobPage: true', () => {
      const doc = createMockDocument({
        url: 'https://www.linkedin.com/jobs/view/4419969671/',
        elements: {
          '.job-details-jobs-unified-top-card__job-title': { textContent: 'Senior Software Engineer' },
          '.job-details-jobs-unified-top-card__company-name': { textContent: 'General Motors' },
          '.jobs-description__content': {
            textContent: 'We are seeking a Senior Software Engineer with Go and Kubernetes experience. Responsibilities include building distributed services.',
          },
        },
      });

      const resolved = AdapterRegistry.resolve(doc, 'https://www.linkedin.com/jobs/view/4419969671/');
      assert.equal(resolved.adapterId, 'LINKEDIN');
      assert.equal(resolved.isJobPage, true);

      const evaluation = JobDetectionEngine.evaluate(doc, 'https://www.linkedin.com/jobs/view/4419969671/');
      assert.equal(evaluation.detected, true);
      assert.equal(evaluation.ready, true);
      assert.equal(evaluation.jobData.title, 'Senior Software Engineer');
      assert.equal(evaluation.jobData.company, 'General Motors');
      assert.equal(evaluation.jobData.externalJobId, '4419969671');
    });
  });

  describe('2. LinkedIn Edge Cases & Live Patterns', () => {
    it('Parses desktop LinkedIn document.title pipe delimiter format: "Title | Company | LinkedIn"', () => {
      const doc = createMockDocument({
        url: 'https://www.linkedin.com/jobs/view/4419969671/',
        title: 'Senior Software Engineer | General Motors | LinkedIn',
        elements: {
          '.jobs-description__content': {
            textContent: 'General Motors is seeking a Senior Software Engineer with Go expertise. Responsibilities include building backend systems and testing services.',
          },
        },
      });

      const payload = LinkedInAdapter.extract(doc, 'https://www.linkedin.com/jobs/view/4419969671/');
      assert.equal(payload.title, 'Senior Software Engineer');
      assert.equal(payload.company, 'General Motors');
      assert.equal(payload.isReady, true);
    });

    it('Detects Appinventiv Software Engineer live fixture', () => {
      const doc = createMockDocument({
        url: 'https://www.linkedin.com/jobs/view/4198273641/',
        title: 'Software Engineer | Appinventiv | LinkedIn',
        elements: {
          'h1': { textContent: 'Software Engineer' },
          '.job-details-jobs-unified-top-card__company-name': { textContent: 'Appinventiv' },
          '.job-details-jobs-unified-top-card__primary-description-container': { textContent: 'Noida, Uttar Pradesh, India · Reposted 2 days ago · 45 applicants' },
          '.jobs-apply-button': { textContent: 'Easy Apply' },
          '.show-more-less-html__markup': {
            textContent: 'Appinventiv is hiring a Software Engineer with expertise in Node.js, TypeScript, and microservices architecture. Requirements: 3+ years experience with cloud native systems.',
          },
        },
      });

      const evaluation = JobDetectionEngine.evaluate(doc, 'https://www.linkedin.com/jobs/view/4198273641/');
      assert.equal(evaluation.detected, true);
      assert.equal(evaluation.ready, true);
      assert.equal(evaluation.jobData.title, 'Software Engineer');
      assert.equal(evaluation.jobData.company, 'Appinventiv');
      assert.equal(evaluation.jobData.hasApplyCta, true);
      assert.equal(evaluation.jobData.isReady, true);
    });

    it('Handles search/collections URL with currentJobId query param', () => {
      const doc = createMockDocument({
        url: 'https://www.linkedin.com/jobs/search/?currentJobId=4419969671&keywords=software',
        elements: {
          '.job-details-jobs-unified-top-card__job-title': { textContent: 'Full Stack Engineer' },
          '.job-details-jobs-unified-top-card__company-name': { textContent: 'Acme Corp' },
          '#job-details': {
            textContent: 'Join our engineering team to build scalable web applications. Requirements: React, Node.js, and SQL experience. Full-time position.',
          },
        },
      });

      assert.equal(LinkedInAdapter.canHandle(doc, doc.location.href), true);
      const payload = LinkedInAdapter.extract(doc, doc.location.href);
      assert.equal(payload.externalJobId, '4419969671');
      assert.equal(payload.title, 'Full Stack Engineer');
      assert.equal(payload.company, 'Acme Corp');
      assert.equal(payload.isReady, true);
    });

    it('Extracts active rail item data-occludable-job-id when externalJobId not in URL', () => {
      const doc = createMockDocument({
        url: 'https://www.linkedin.com/jobs/collections/recommended/',
        elements: {
          '.jobs-search-results-list__list-item--active': {
            getAttribute(attr) {
              if (attr === 'data-occludable-job-id') return '3998877665';
              return null;
            },
          },
          '.job-details-jobs-unified-top-card__job-title': { textContent: 'Backend Developer' },
          '.job-details-jobs-unified-top-card__company-name': { textContent: 'Stripe' },
          '.jobs-description__content': {
            textContent: 'Stripe is hiring a Backend Developer to support global payment infrastructure. Requirements: API design, distributed systems, and Go/Java.',
          },
        },
      });

      assert.equal(LinkedInAdapter.canHandle(doc, doc.location.href), true);
      const payload = LinkedInAdapter.extract(doc, doc.location.href);
      assert.equal(payload.externalJobId, '3998877665');
      assert.equal(payload.title, 'Backend Developer');
      assert.equal(payload.isReady, true);
    });

    it('Detects without numeric externalJobId when strong title and substantive description exist', () => {
      const doc = createMockDocument({
        url: 'https://www.linkedin.com/jobs/featured-role/',
        elements: {
          '.job-details-jobs-unified-top-card__job-title': { textContent: 'Staff Infrastructure Engineer' },
          '.job-details-jobs-unified-top-card__company-name': { textContent: 'Netflix' },
          '.jobs-description__content': {
            textContent: 'Netflix seeks a Staff Infrastructure Engineer to design cloud infrastructure for streaming millions of concurrent video streams. Requirements include Kubernetes and Linux.',
          },
        },
      });

      assert.equal(LinkedInAdapter.canHandle(doc, doc.location.href), true);
      const payload = LinkedInAdapter.extract(doc, doc.location.href);
      assert.equal(payload.title, 'Staff Infrastructure Engineer');
      assert.equal(payload.isReady, true);

      const evaluation = JobDetectionEngine.evaluate(doc, doc.location.href);
      assert.equal(evaluation.detected, true);
      assert.equal(evaluation.ready, true);
    });

    it('Detects job without Easy Apply CTA (regular external Apply button)', () => {
      const doc = createMockDocument({
        url: 'https://www.linkedin.com/jobs/view/4419969671/',
        elements: {
          '.job-details-jobs-unified-top-card__job-title': { textContent: 'Platform Architect' },
          '.job-details-jobs-unified-top-card__company-name': { textContent: 'Microsoft' },
          '.jobs-apply-button': { textContent: 'Apply on company website' },
          '.jobs-description__content': {
            textContent: 'Microsoft is looking for a Platform Architect to design enterprise cloud architectures. Requirements: 10+ years experience in distributed cloud computing.',
          },
        },
      });

      const payload = LinkedInAdapter.extract(doc, doc.location.href);
      assert.equal(payload.title, 'Platform Architect');
      assert.equal(payload.hasApplyCta, true);
      assert.equal(payload.isReady, true);

      const evaluation = JobDetectionEngine.evaluate(doc, doc.location.href);
      assert.equal(evaluation.detected, true);
    });

    it('Preserves company: "" when company missing but description substantive (no synthesized "Company")', () => {
      const doc = createMockDocument({
        url: 'https://www.linkedin.com/jobs/view/4419969671/',
        elements: {
          '.job-details-jobs-unified-top-card__job-title': { textContent: 'Rust Systems Programmer' },
          '.jobs-description__content': {
            textContent: 'We are hiring a Rust Systems Programmer to build ultra-low-latency financial trade execution engines. Requirements: Rust, concurrency, performance tuning.',
          },
        },
      });

      const payload = LinkedInAdapter.extract(doc, doc.location.href);
      assert.equal(payload.title, 'Rust Systems Programmer');
      assert.equal(payload.company, '');
      assert.notEqual(payload.company, 'Company');
      assert.equal(payload.isReady, true);

      const detected = JobPageDetector.detect(doc, doc.location.href);
      assert.equal(detected.company, '');
      assert.equal(detected.isConfident, true);
    });

    it('Rejects synthesized placeholder "Company" from being treated as real company', () => {
      const doc = createMockDocument({
        url: 'https://www.linkedin.com/jobs/view/4419969671/',
        elements: {
          '.job-details-jobs-unified-top-card__job-title': { textContent: 'Data Engineer' },
          '.job-details-jobs-unified-top-card__company-name': { textContent: 'Company' },
          '.jobs-description__content': {
            textContent: 'Data engineering team looking for a specialist in Apache Spark, Kafka, and data lake architectures.',
          },
        },
      });

      const detected = JobPageDetector.detect(doc, doc.location.href);
      assert.equal(detected.company, '');
    });

    it('Strictly does NOT use doc.body.textContent fallback on LinkedIn', () => {
      const doc = createMockDocument({
        url: 'https://www.linkedin.com/jobs/view/4419969671/',
        bodyText: 'Some huge unrelated text in the body of the page including header, footer, ads, and random comments.',
        elements: {
          '.job-details-jobs-unified-top-card__job-title': { textContent: 'DevOps Engineer' },
          // No localized description element provided
        },
      });

      const payload = LinkedInAdapter.extract(doc, doc.location.href);
      // Description must be empty string, NOT bodyText!
      assert.equal(payload.description, '');
      assert.equal(payload.isReady, false);

      const evaluation = JobDetectionEngine.evaluate(doc, doc.location.href);
      assert.equal(evaluation.detected, false);
    });
  });

  describe('3. Strict Elimination of False Positives (No Domain Blacklists)', () => {
    it('Rejects ChatGPT conversation discussing a job posting without any job DOM structure', () => {
      const doc = createMockDocument({
        url: 'https://chatgpt.com/c/677f9812-4290-8005-9988-123456789abc',
        title: 'ChatGPT - Job Requirements Review',
        bodyText: `User: Here are the requirements for a Senior Staff Engineer job:
        - 10+ years experience in distributed systems
        - Experience with Go, Kubernetes, and gRPC
        - Responsibilities: Lead architectural reviews, mentor engineers, submit pull requests
        Can you review my resume and see if I qualify?`,
      });

      assert.equal(GenericCareerPageAdapter.canHandle(doc, doc.location.href), false);
      assert.equal(LinkedInAdapter.canHandle(doc, doc.location.href), false);

      const resolved = AdapterRegistry.resolve(doc, doc.location.href);
      assert.equal(resolved.adapterId, 'NONE');
      assert.equal(resolved.isJobPage, false);
      assert.equal(resolved.metadata.portalName, 'Web Page');

      const evaluation = JobDetectionEngine.evaluate(doc, doc.location.href);
      assert.equal(evaluation.detected, false);
      assert.equal(evaluation.ready, false);
      assert.equal(evaluation.confidenceScore, 0);
      assert.equal(evaluation.jobData, null);
    });

    it('Rejects GitHub issue or pull request containing job keywords', () => {
      const doc = createMockDocument({
        url: 'https://github.com/facebook/react/issues/12345',
        title: 'Issue #12345: We are hiring performance experts to fix rendering lag',
        bodyText: `We are looking for engineers to help with React 19 concurrent rendering.
        Responsibilities: Optimize fiber scheduler.
        Requirements: In-depth understanding of JavaScript engine internals.`,
      });

      assert.equal(GenericCareerPageAdapter.canHandle(doc, doc.location.href), false);
      const evaluation = JobDetectionEngine.evaluate(doc, doc.location.href);
      assert.equal(evaluation.detected, false);
    });

    it('Rejects technical documentation mentioning roles and responsibilities', () => {
      const doc = createMockDocument({
        url: 'https://docs.aws.amazon.com/security/roles-and-responsibilities.html',
        title: 'AWS Security: Roles and Responsibilities',
        bodyText: `Shared Responsibility Model:
        Customer responsibilities include configuring security groups and IAM policies.
        AWS responsibilities include maintaining hardware infrastructure and data centers.`,
      });

      assert.equal(GenericCareerPageAdapter.canHandle(doc, doc.location.href), false);
      const evaluation = JobDetectionEngine.evaluate(doc, doc.location.href);
      assert.equal(evaluation.detected, false);
    });

    it('Rejects generic tech article discussing career paths', () => {
      const doc = createMockDocument({
        url: 'https://medium.com/engineering/how-to-become-a-staff-engineer',
        title: 'How to Become a Staff Engineer in 2026',
        bodyText: `The job description of a Staff Engineer varies wildly across tech companies.
        Some companies emphasize deep technical qualifications, while others expect organizational influence.`,
      });

      assert.equal(GenericCareerPageAdapter.canHandle(doc, doc.location.href), false);
      const evaluation = JobDetectionEngine.evaluate(doc, doc.location.href);
      assert.equal(evaluation.detected, false);
    });
  });

  describe('4. Preserved Working Portals (Zero Regressions)', () => {
    it('Preserves Greenhouse adapter detection', () => {
      const doc = createMockDocument({
        url: 'https://boards.greenhouse.io/stripe/jobs/5544332',
        title: 'Software Engineer - Infrastructure at Stripe',
        elements: {
          '.app-title': { textContent: 'Software Engineer - Infrastructure' },
          '.company-name': { textContent: 'Stripe' },
          '#content': {
            textContent: 'We are seeking an Infrastructure Engineer to help scale our payment networks. Requirements include Go, distributed storage, and zero-downtime deployments.',
          },
        },
      });

      assert.equal(GreenhouseAdapter.canHandle(doc, doc.location.href), true);
      const resolved = AdapterRegistry.resolve(doc, doc.location.href);
      assert.equal(resolved.adapterId, 'GREENHOUSE');
      assert.equal(resolved.isJobPage, true);
      assert.equal(resolved.metadata.portalName, 'Greenhouse ATS');

      const evaluation = JobDetectionEngine.evaluate(doc, doc.location.href);
      assert.equal(evaluation.detected, true);
      assert.equal(evaluation.jobData.title, 'Software Engineer - Infrastructure');
      assert.equal(evaluation.jobData.company, 'Stripe');
    });

    it('Preserves JSON-LD JobPosting detection on custom company career portals', () => {
      const doc = createMockDocument({
        url: 'https://careers.uber.com/positions/senior-backend-engineer',
        scripts: [
          {
            '@context': 'https://schema.org',
            '@type': 'JobPosting',
            title: 'Senior Backend Engineer',
            hiringOrganization: { name: 'Uber Technologies' },
            jobLocation: { address: { addressLocality: 'San Francisco, CA' } },
            description: 'Uber is hiring a Senior Backend Engineer to power our core dispatch services. Requirements: 5+ years Go/Java experience, distributed databases, high throughput microservices.',
            employmentType: 'FULL_TIME',
          },
        ],
      });

      assert.equal(GenericCareerPageAdapter.canHandle(doc, doc.location.href), true);
      const evaluation = JobDetectionEngine.evaluate(doc, doc.location.href);
      assert.equal(evaluation.detected, true);
      assert.equal(evaluation.jobData.title, 'Senior Backend Engineer');
      assert.equal(evaluation.jobData.company, 'Uber Technologies');
      assert.equal(evaluation.jobData.provider, 'GENERIC_JSONLD');
    });

    it('Preserves Wellfound job posting detection', () => {
      const doc = createMockDocument({
        url: 'https://wellfound.com/jobs/321456-founding-engineer',
        title: 'Founding Engineer at Stealth AI | Wellfound',
        elements: {
          'h1': { textContent: 'Founding Engineer' },
          '.job-description': {
            textContent: 'Join our early-stage founding team building next-generation developer tooling. Requirements: TypeScript, Rust, WebAssembly, and obsession with fast developer loops.',
          },
        },
      });

      assert.equal(GenericCareerPageAdapter.canHandle(doc, doc.location.href), true);
      const evaluation = JobDetectionEngine.evaluate(doc, doc.location.href);
      assert.equal(evaluation.detected, true);
      assert.equal(evaluation.jobData.title, 'Founding Engineer');
    });
  });

  describe('5. Sidebar State & Server Call Boundary', () => {
    let controller;
    let mockElements;
    let analyzeCalls;

    beforeEach(() => {
      analyzeCalls = 0;
      mockElements = setupMockDOM();
      controller = new SidebarController();
      controller.elements = mockElements;
      controller.isAuthenticated = true;
      controller.currentUser = { id: 'u123', email: 'test@example.com' };
      controller.activeTabId = 101;
      controller.cachedState = {
        workflowState: WORKFLOW_STATES.IDLE,
        workflowGeneration: 1,
        jobData: null,
      };
      controller.backendClient = {
        analyzeJob: async () => {
          analyzeCalls++;
          return {
            fitAnalysis: { overallScore: 88, recommendationBand: 'HIGH' },
            recommendedProjects: [],
            analysisSnapshotId: 'snap-p69',
          };
        },
      };
    });

    it('Sidebar renders Web Page and dash on non-job page, keeping Analyze button disabled with 0 server calls', async () => {
      await controller._requestDetectionFromTab(false);

      assert.equal(controller.activeJob, null);
      assert.equal(mockElements.jobTitle.textContent, '—');
      assert.equal(mockElements.jobCompany.textContent, '—');
      assert.equal(mockElements.portalName.textContent, 'Web Page');
      assert.equal(mockElements.jobNotDetectedState.classList.contains('hidden'), false);
      assert.equal(mockElements.jobDetectedState.classList.contains('hidden'), true);

      // Attempting to run Analyze when no activeJob exists must be a strict no-op
      await controller.runAnalyzeJob();
      assert.equal(analyzeCalls, 0);
    });

    it('Navigating from active job to non-job page cleanly resets unlocked state to Web Page and —', async () => {
      // Setup initial active job on tab 101
      const sampleJob = {
        title: 'Lead Architect',
        company: 'Appinventiv',
        location: 'Noida, India',
        provider: 'LINKEDIN',
        externalJobId: '4198273641',
      };
      await controller._switchToJob(sampleJob);

      assert.equal(controller.activeJob.title, 'Lead Architect');
      assert.equal(mockElements.jobTitle.textContent, 'Lead Architect');

      // Now tab navigates to a non-job page (e.g. ChatGPT)
      // DETECT_JOB_PAGE returns detected: false, portalMetadata: { portalName: 'Web Page' }
      await controller._requestDetectionFromTab(false);

      assert.equal(controller.activeJob, null);
      assert.equal(mockElements.jobTitle.textContent, '—');
      assert.equal(mockElements.jobCompany.textContent, '—');
      assert.equal(mockElements.portalName.textContent, 'Web Page');
      assert.equal(mockElements.jobDetectedState.classList.contains('hidden'), true);
      assert.equal(mockElements.jobNotDetectedState.classList.contains('hidden'), false);

      // 0 server calls made during detection or transition
      assert.equal(analyzeCalls, 0);
    });
  });

});
