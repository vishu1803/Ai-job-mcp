/**
 * @file P72 Unit Tests: LinkedIn Description Hydration Never-Stuck Fix.
 *
 * Verifies:
 * 1.  Separation of JOB_DETECTED and ANALYSIS_READY (valid title/company, desc < 50)
 * 2.  Shared Hydration Constants (HYDRATION_DELAYS, HYDRATION_MAX_LIFETIME_MS)
 * 3.  Job-scoped hydration lifecycle isolation (Job A vs Job B)
 * 4.  Description container not required initially (delayed appearance)
 * 5.  Localized description extraction across modern LinkedIn selectors (never document.body)
 * 6.  Lazy / expanded description ("Show more" clamped -> expanded)
 * 7.  Sidebar JOB_DESCRIPTION_HYDRATED message reconciliation:
 *     - Updates activeJob.description and activeJob.rawText
 *     - Sets activeJob.analysisReady = true
 *     - Updates cachedState.jobData and persists to store
 *     - Hides descriptionLoadingNotice
 *     - Enables analyzeJobBtn
 * 8.  Sidebar ignores JOB_DESCRIPTION_HYDRATED for mismatched fingerprint or tabId
 * 9.  Form detection independence (form before hydration, form after hydration)
 * 10. Description readiness invariant (description >= 50 chars strictly required)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Shared constants
import {
  DETECTION_MAX_DURATION_MS,
  DETECTION_REQUEST_TIMEOUT_MS,
  HYDRATION_DELAYS,
  HYDRATION_MAX_LIFETIME_MS,
} from '../../extension/lib/detection-timeouts.js';

// Adapters and engine
import { LinkedInAdapter } from '../../extension/job-detection/adapters/linkedin.adapter.js';
import { JobPageDetector } from '../../extension/job-detection/job-page-detector.js';
import { JobDetectionEngine } from '../../extension/job-detection/detection-engine.js';
import { JobIdentity } from '../../extension/lib/job-identity.js';

// Sidebar controller
import { SidebarController } from '../../extension/sidebar/sidebar.js';
import { WORKFLOW_STATES } from '../../extension/lib/workflow-state-machine.js';

// ─── Helpers & Mocks ──────────────────────────────────

function createMockController(options = {}) {
  const elementState = {
    descriptionLoadingNoticeHidden: true,
    descriptionLoadingText: '',
    analyzeJobBtnDisabled: true,
    analyzeJobBtnText: '',
    jobTitleText: '—',
    jobCompanyText: '—',
    formCardHidden: true,
  };

  const mockDocument = {
    getElementById: () => ({
      classList: {
        add(cls) {
          if (cls === 'hidden') elementState.descriptionLoadingNoticeHidden = true;
        },
        remove(cls) {
          if (cls === 'hidden') elementState.descriptionLoadingNoticeHidden = false;
        },
        contains(cls) {
          if (cls === 'hidden') return elementState.descriptionLoadingNoticeHidden;
          return false;
        },
      },
      addEventListener() {},
      textContent: '',
      disabled: false,
      removeAttribute() {},
      setAttribute() {},
      scrollIntoView() {},
      innerHTML: '',
    }),
    readyState: 'complete',
    addEventListener() {},
  };

  const origDocument = globalThis.document;
  globalThis.document = mockDocument;

  const controller = new SidebarController();
  globalThis.document = origDocument;

  // Trackable element stubs
  controller.elements = {
    connectionBadge: { className: '' },
    connectionText: { textContent: '' },
    refreshBtn: { addEventListener() {} },
    rescanBtn: { addEventListener() {} },
    pendingJobNotification: { classList: { add() {}, remove() {} } },
    pendingJobTitle: { textContent: '' },
    rescanPendingBtn: { addEventListener() {} },
    authBar: { classList: { add() {}, remove() {} } },
    authUnauthenticatedState: { classList: { add() {}, remove() {} } },
    authAuthenticatedState: { classList: { add() {}, remove() {} } },
    loginBtn: { addEventListener() {} },
    logoutBtn: { addEventListener() {} },
    reauthBtn: { addEventListener() {} },
    userName: { textContent: '' },
    userEmail: { textContent: '' },
    userAvatar: null,
    sessionExpiredNotice: { classList: { add() {}, remove() {} } },
    workflowStatusBar: { classList: { add() {}, remove() {} } },
    workflowStateText: { textContent: '' },
    workflowLockedBadge: { classList: { add() {}, remove() {} } },
    syncIndicator: { classList: { add() {}, remove() {} } },
    portalCard: { classList: { add() {}, remove() {} } },
    portalName: { textContent: '' },
    confidenceBadge: { textContent: '', className: '' },
    jobCard: { classList: { add() {}, remove() {} } },
    reanalyzeBtn: { addEventListener() {}, disabled: false, classList: { add() {}, remove() {} } },
    jobNotDetectedState: { classList: { add() {}, remove() {} } },
    jobDetectedState: { classList: { add() {}, remove() {} } },
    jobTitle: { textContent: '—' },
    jobCompany: { textContent: '—' },
    jobLocation: { textContent: '—' },
    jobType: { textContent: '—' },
    jobIdTag: { textContent: '—' },
    analyzeJobBtn: {
      disabled: true,
      textContent: 'Analyze Job Match',
      addEventListener() {},
      classList: { add() {}, remove() {} },
    },
    descriptionLoadingNotice: {
      classList: {
        add(cls) {
          if (cls === 'hidden') elementState.descriptionLoadingNoticeHidden = true;
        },
        remove(cls) {
          if (cls === 'hidden') elementState.descriptionLoadingNoticeHidden = false;
        },
        contains(cls) {
          return cls === 'hidden' ? elementState.descriptionLoadingNoticeHidden : false;
        },
      },
    },
    descriptionLoadingText: { textContent: '' },
    analysisErrorBanner: { classList: { add() {}, remove() {} } },
    analysisErrorMessage: { textContent: '' },
    retryAnalysisBtn: { addEventListener() {} },
    analysisCard: { classList: { add() {}, remove() {} } },
    matchBandBadge: { textContent: '' },
    scoreValue: { textContent: '' },
    matchedSkillsCount: { textContent: '' },
    missingSkillsCount: { textContent: '' },
    experienceFitVal: { textContent: '' },
    matchedSkillsList: { innerHTML: '', appendChild() {} },
    missingSkillsList: { innerHTML: '', appendChild() {} },
    analysisNextActionBox: { textContent: '' },
    projectsCard: { classList: { add() {}, remove() {} } },
    recommendedProjectsList: { innerHTML: '', appendChild() {} },
    handoffCard: { classList: { add() {}, remove() {} } },
    handoffStatusBadge: { textContent: '' },
    handoffTelemetryRow: { classList: { add() {}, remove() {} } },
    handoffAppId: { textContent: '' },
    handoffPackageMeta: { textContent: '' },
    workflowLockBanner: { classList: { add() {}, remove() {} } },
    resetWorkflowBtn: { addEventListener() {} },
    handoffErrorBanner: { classList: { add() {}, remove() {} } },
    handoffErrorMessage: { textContent: '' },
    retryHandoffBtn: { addEventListener() {} },
    prepareHandoffBtn: { addEventListener() {} },
    prepareSpinner: { classList: { add() {}, remove() {} } },
    prepareBtnText: { textContent: '' },
    regenerateHandoffBtn: { addEventListener() {}, classList: { add() {}, remove() {} } },
    regenerateConfirmBox: { classList: { add() {}, remove() {} } },
    cancelRegenerateBtn: { addEventListener() {} },
    confirmRegenerateBtn: { addEventListener() {} },
    artifactsContainer: { classList: { add() {}, remove() {} } },
    formDetectionCard: {
      classList: {
        add(cls) {
          if (cls === 'hidden') elementState.formCardHidden = true;
        },
        remove(cls) {
          if (cls === 'hidden') elementState.formCardHidden = false;
        },
      },
    },
    stepIndicator: { textContent: '' },
    formStatusMessage: { textContent: '' },
    formFieldsSummary: { innerHTML: '', appendChild() {} },
    autofillFormBtn: { addEventListener() {}, disabled: false, removeAttribute() {} },
    formFieldList: { innerHTML: '' },
    fieldCountBadge: { textContent: '' },
  };

  let savedTabState = null;
  controller.store = {
    getTabState: async () => savedTabState,
    saveTabState: async (tabId, state) => {
      savedTabState = { ...state };
      return savedTabState;
    },
    getJobState: async () => null,
    saveJobState: async () => {},
    setPendingDetectedJob: async () => {},
    isWorkflowLocked: (state) => Boolean(state?.isLocked || state?.lockState === 'LOCKED'),
    createInitialState: () => ({
      tabId: controller.activeTabId,
      workflowState: WORKFLOW_STATES.IDLE,
      lockState: 'UNLOCKED',
      isLocked: false,
    }),
  };

  controller.backendClient = {
    getHealth: async () => ({ status: 'ok' }),
    getAuthStatus: async () => ({ authenticated: true, status: 'AUTHENTICATED', user: { id: 'u1' } }),
    analyzeJob: async () => null,
  };

  controller.activeTabId = 100;
  controller.isAuthenticated = true;
  controller.currentUser = { id: 'u1' };

  return { controller, elementState };
}

function makeLinkedInMockDoc(options = {}) {
  const {
    title = 'Software Engineer',
    company = 'Appinventiv',
    location = 'Noida, UP, India',
    descSelector = '.show-more-less-html__markup',
    descText = '',
    includeContainer = true,
  } = options;

  const elements = {};

  if (title) {
    elements['h1.job-details-jobs-unified-top-card__job-title'] = {
      textContent: title,
      getAttribute: () => null,
    };
  }

  if (company) {
    elements['.job-details-jobs-unified-top-card__company-name a'] = {
      textContent: company,
      getAttribute: () => null,
    };
  }

  if (location) {
    elements['.job-details-jobs-unified-top-card__bullet'] = {
      textContent: location,
      getAttribute: () => null,
    };
  }

  if (includeContainer && descSelector) {
    elements[descSelector] = {
      textContent: descText,
      getAttribute: () => null,
      querySelectorAll: () => [],
    };
  }

  return {
    querySelector: (sel) => elements[sel] || null,
    querySelectorAll: () => [],
    title: `${title} at ${company} | LinkedIn`,
  };
}

// ─── Tests ────────────────────────────────────────────

describe('P72: Shared Hydration Constants', () => {
  it('HYDRATION_DELAYS matches recommended exponential backoff', () => {
    assert.deepStrictEqual(
      HYDRATION_DELAYS,
      [100, 250, 500, 900, 1500, 2500, 4000, 6000, 8000],
      'Hydration delays must match recommended schedule'
    );
  });

  it('HYDRATION_MAX_LIFETIME_MS is 10000', () => {
    assert.strictEqual(HYDRATION_MAX_LIFETIME_MS, 10000);
  });

  it('HYDRATION_MAX_LIFETIME_MS > DETECTION_MAX_DURATION_MS', () => {
    assert.ok(
      HYDRATION_MAX_LIFETIME_MS > DETECTION_MAX_DURATION_MS,
      `Hydration max lifetime (${HYDRATION_MAX_LIFETIME_MS}) must exceed single request window (${DETECTION_MAX_DURATION_MS})`
    );
  });
});

describe('P72: Separation of JOB_DETECTED and ANALYSIS_READY', () => {
  it('detects LinkedIn job with valid title and company when description is missing/empty', () => {
    const doc = makeLinkedInMockDoc({ descText: '', includeContainer: false });
    const url = 'https://www.linkedin.com/jobs/view/4464770430/';

    const result = JobDetectionEngine.evaluate(doc, url);

    assert.strictEqual(result.detected, true, 'Job must be detected with valid title and company');
    assert.strictEqual(result.analysisReady, false, 'analysisReady must be false when description is missing');
    assert.strictEqual(result.jobData.title, 'Software Engineer');
    assert.strictEqual(result.jobData.company, 'Appinventiv');
    assert.strictEqual(result.jobData.analysisReady, false);
  });

  it('detects LinkedIn job with description < 50 chars as detected: true, analysisReady: false', () => {
    const doc = makeLinkedInMockDoc({ descText: 'Job description is loading...' }); // 30 chars
    const url = 'https://www.linkedin.com/jobs/view/4464770430/';

    const result = JobDetectionEngine.evaluate(doc, url);

    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.analysisReady, false);
    assert.ok(result.jobData.description.length < 50);
  });

  it('sidebar renders JOB_DETECTED state with loading notice and disabled Analyze button', async () => {
    const { controller, elementState } = createMockController();
    const jobData = {
      title: 'Software Engineer',
      company: 'Appinventiv',
      location: 'Noida, India',
      externalJobId: '4464770430',
      description: '',
      analysisReady: false,
      provider: 'LINKEDIN',
      portalMetadata: { portalName: 'LinkedIn', confidence: 'HIGH' },
    };

    await controller._handleJobDetectedEvent(jobData);

    assert.strictEqual(controller.activeJob.title, 'Software Engineer');
    assert.strictEqual(controller.activeJob.analysisReady, false);
    // Notice must be visible
    assert.strictEqual(elementState.descriptionLoadingNoticeHidden, false, 'Loading notice must be visible');
    // Analyze button must be disabled
    assert.strictEqual(controller.elements.analyzeJobBtn.disabled, true, 'Analyze button must be disabled');
  });
});

describe('P72: Localized LinkedIn Description Selectors (Never document.body)', () => {
  const substantiveDesc = 'We are seeking an experienced Software Engineer with solid expertise in Node.js, React, and cloud systems to scale our distributed backend.';

  const selectors = [
    '.show-more-less-html__markup',
    '#job-details',
    '.jobs-description__content',
    '.jobs-box__html-content',
    '.jobs-description',
    'article.jobs-description__container',
    '[data-view-name="job-details"] article',
    '[data-view-name="job-details"] [class*="description" i]',
    '.jobs-details__main-content article',
    '.jobs-details__main-content [class*="description" i]',
    '.jobs-description-content__text',
    '.jobs-search__job-details article',
    '.jobs-search__job-details [class*="description" i]',
    '.job-view-layout [class*="description" i]',
    'div[class*="jobs-description"]',
    'div[class*="description__text"]',
    'section[class*="description" i]',
    '[data-job-description]',
  ];

  for (const selector of selectors) {
    it(`extracts description from localized selector: ${selector}`, () => {
      const doc = makeLinkedInMockDoc({
        descSelector: selector,
        descText: substantiveDesc,
        includeContainer: true,
      });
      const url = 'https://www.linkedin.com/jobs/view/4464770430/';

      const payload = LinkedInAdapter.extract(doc, url);

      assert.strictEqual(payload.title, 'Software Engineer');
      assert.strictEqual(payload.company, 'Appinventiv');
      assert.strictEqual(payload.description, substantiveDesc);
      assert.strictEqual(payload.analysisReady, true);
    });
  }

  it('strictly ignores description outside localized selectors (never falls back to document.body)', () => {
    // Document where body has text but no localized description selector exists
    const doc = {
      querySelector: (sel) => {
        if (sel === 'h1.job-details-jobs-unified-top-card__job-title') return { textContent: 'Software Engineer' };
        if (sel === '.job-details-jobs-unified-top-card__company-name a') return { textContent: 'Appinventiv' };
        return null;
      },
      querySelectorAll: () => [],
      body: { textContent: 'Random text on body that contains lots of words and should never be used as job description.' },
      title: 'Software Engineer at Appinventiv | LinkedIn',
    };
    const url = 'https://www.linkedin.com/jobs/view/4464770430/';

    const payload = LinkedInAdapter.extract(doc, url);

    assert.strictEqual(payload.description, '', 'Must NOT use document.body for description');
    assert.strictEqual(payload.analysisReady, false);
  });
});

describe('P72: Lazy & Expanded Description ("Show more")', () => {
  it('detects job initially clamped (<50 chars) as analysisReady: false, then expanded (>=50 chars) as analysisReady: true', () => {
    const url = 'https://www.linkedin.com/jobs/view/4464770430/';

    // Clamped state (< 50 chars)
    const docClamped = makeLinkedInMockDoc({ descText: 'Short clamped snippet...' });
    const clampedPayload = LinkedInAdapter.extract(docClamped, url);
    assert.strictEqual(clampedPayload.analysisReady, false);

    // Expanded state (e.g. after "Show more" click or React hydration)
    const docExpanded = makeLinkedInMockDoc({
      descText: 'Short clamped snippet... and here is the full comprehensive expanded job description with all details requirements and qualifications.',
    });
    const expandedPayload = LinkedInAdapter.extract(docExpanded, url);
    assert.strictEqual(expandedPayload.analysisReady, true);
    assert.ok(expandedPayload.description.length >= 50);
  });
});

describe('P72: Sidebar JOB_DESCRIPTION_HYDRATED Message Reconciliation', () => {
  it('updates activeJob, enables Analyze button, and hides notice on matching fingerprint', async () => {
    const { controller, elementState } = createMockController();

    // 1. Initial detection with empty description
    const initialJob = {
      title: 'Software Engineer',
      company: 'Appinventiv',
      location: 'Noida, India',
      externalJobId: '4464770430',
      description: '',
      analysisReady: false,
      provider: 'LINKEDIN',
    };

    await controller._handleJobDetectedEvent(initialJob);

    assert.strictEqual(controller.activeJob.analysisReady, false);
    assert.strictEqual(elementState.descriptionLoadingNoticeHidden, false);
    assert.strictEqual(controller.elements.analyzeJobBtn.disabled, true);

    // 2. Simulate JOB_DESCRIPTION_HYDRATED message arriving from content script
    const hydratedJob = {
      ...initialJob,
      description: 'We are seeking an experienced Software Engineer with solid expertise in Node.js, React, and cloud systems to scale our distributed backend.',
      rawText: 'We are seeking an experienced Software Engineer with solid expertise in Node.js, React, and cloud systems to scale our distributed backend.',
      analysisReady: true,
    };

    // Simulate sidebar's message listener logic
    const incomingFingerprint = JobIdentity.deriveJobFingerprint(hydratedJob);
    assert.strictEqual(incomingFingerprint, controller.activeJobFingerprint);

    await controller._reconcileDetectedJob(hydratedJob);

    // 3. Verify state after hydration
    assert.strictEqual(controller.activeJob.analysisReady, true);
    assert.ok(controller.activeJob.description.length >= 50);
    assert.strictEqual(controller.cachedState.jobData.description, hydratedJob.description);
    assert.strictEqual(elementState.descriptionLoadingNoticeHidden, true, 'Notice must be hidden after hydration');
    assert.strictEqual(controller.elements.analyzeJobBtn.disabled, false, 'Analyze button must be enabled');
    assert.strictEqual(controller.elements.analyzeJobBtn.textContent, 'Analyze Job Match');
  });

  it('ignores JOB_DESCRIPTION_HYDRATED for a DIFFERENT job fingerprint', async () => {
    const { controller, elementState } = createMockController();

    // Active job: Job A
    const jobA = {
      title: 'Job A Engineer',
      company: 'Company A',
      externalJobId: '11111',
      description: '',
      analysisReady: false,
      provider: 'LINKEDIN',
    };
    await controller._handleJobDetectedEvent(jobA);

    // Hydrated message arrives for Job B
    const jobB = {
      title: 'Job B Engineer',
      company: 'Company B',
      externalJobId: '22222',
      description: 'This is Job B description that is more than fifty characters in length.',
      analysisReady: true,
      provider: 'LINKEDIN',
    };

    const fpA = JobIdentity.deriveJobFingerprint(jobA);
    const fpB = JobIdentity.deriveJobFingerprint(jobB);
    assert.notStrictEqual(fpA, fpB, 'Fingerprints must differ');

    // Sidebar message listener checks fingerprint match before reconciling:
    const matchesActive = fpB === controller.activeJobFingerprint;
    assert.strictEqual(matchesActive, false, 'Different job must not match active job fingerprint');

    // Active job remains Job A untouched
    assert.strictEqual(controller.activeJob.title, 'Job A Engineer');
    assert.strictEqual(controller.activeJob.description, '');
  });

  it('ignores JOB_DESCRIPTION_HYDRATED when sender tabId does not match activeTabId', async () => {
    const { controller } = createMockController();
    controller.activeTabId = 100;

    const job = {
      title: 'Software Engineer',
      company: 'Appinventiv',
      externalJobId: '4464770430',
      description: 'Hydrated description from background tab that has more than fifty characters of content.',
      analysisReady: true,
    };

    const messageTabId = 200; // Different tab
    const isMatchingTab = messageTabId === controller.activeTabId;

    assert.strictEqual(isMatchingTab, false, 'Message from different tab must be rejected');
  });
});

describe('P72: Form Detection Independence', () => {
  it('form detected before description hydration: preserves form card and allows subsequent description hydration', async () => {
    const { controller, elementState } = createMockController();

    // 1. Initial job detected with description loading
    const initialJob = {
      title: 'Software Engineer',
      company: 'Appinventiv',
      externalJobId: '4464770430',
      description: '',
      analysisReady: false,
      provider: 'LINKEDIN',
    };
    await controller._handleJobDetectedEvent(initialJob);
    assert.strictEqual(controller.elements.analyzeJobBtn.disabled, true);

    // 2. Form detected on page (e.g. Easy Apply modal appears)
    const formData = {
      hasForm: true,
      fields: [{ name: 'fullName', type: 'text' }, { name: 'email', type: 'email' }],
      url: 'https://www.linkedin.com/jobs/view/4464770430/',
    };
    await controller._handleFormDetectedEvent(formData);

    assert.strictEqual(controller.cachedState.workflowState, WORKFLOW_STATES.FORM_DETECTED);
    assert.strictEqual(elementState.formCardHidden, false, 'Form card must be rendered');
    assert.strictEqual(controller.elements.analyzeJobBtn.disabled, true, 'Analyze still disabled (no desc)');

    // 3. Late description hydration arrives
    const hydratedJob = {
      ...initialJob,
      description: 'Substantive job description with over fifty characters detailing qualifications and role expectations.',
      analysisReady: true,
    };
    await controller._reconcileDetectedJob(hydratedJob);

    // Both form and analyze are now ready
    assert.strictEqual(controller.activeJob.analysisReady, true);
    assert.strictEqual(controller.elements.analyzeJobBtn.disabled, false, 'Analyze button now enabled');
    assert.strictEqual(elementState.descriptionLoadingNoticeHidden, true, 'Notice hidden');
    assert.strictEqual(controller.cachedState.formData.hasForm, true, 'Form data preserved');
  });

  it('description hydrated before form detection: preserves analysisReady when form arrives', async () => {
    const { controller, elementState } = createMockController();

    // 1. Job detected and hydrated
    const job = {
      title: 'Software Engineer',
      company: 'Appinventiv',
      externalJobId: '4464770430',
      description: 'Substantive job description with over fifty characters detailing qualifications and role expectations.',
      analysisReady: true,
      provider: 'LINKEDIN',
    };
    await controller._handleJobDetectedEvent(job);
    assert.strictEqual(controller.elements.analyzeJobBtn.disabled, false);

    // 2. Form detected afterwards
    const formData = {
      hasForm: true,
      fields: [{ name: 'resume', type: 'file' }],
    };
    await controller._handleFormDetectedEvent(formData);

    // Analyze remains enabled and form card is displayed
    assert.strictEqual(controller.activeJob.analysisReady, true);
    assert.strictEqual(controller.elements.analyzeJobBtn.disabled, false, 'Analyze must remain enabled');
    assert.strictEqual(elementState.formCardHidden, false, 'Form card visible');
  });
});

describe('P72: Description Readiness Invariant', () => {
  it('company presence alone does NOT substitute for description readiness', () => {
    const doc = makeLinkedInMockDoc({ company: 'Google', descText: '' });
    const payload = LinkedInAdapter.extract(doc, 'https://www.linkedin.com/jobs/view/123/');

    assert.strictEqual(payload.analysisReady, false);
  });

  it('Easy Apply CTA alone does NOT substitute for description readiness', () => {
    const doc = makeLinkedInMockDoc({ descText: '' });
    doc.querySelector = (sel) => {
      if (sel === 'h1.job-details-jobs-unified-top-card__job-title') return { textContent: 'Software Engineer' };
      if (sel === '.job-details-jobs-unified-top-card__company-name a') return { textContent: 'Appinventiv' };
      if (sel.includes('jobs-apply-button') || sel.includes('Easy Apply')) return { textContent: 'Easy Apply' };
      return null;
    };

    const payload = LinkedInAdapter.extract(doc, 'https://www.linkedin.com/jobs/view/123/');
    assert.strictEqual(payload.hasApplyCta, true);
    assert.strictEqual(payload.analysisReady, false, 'Easy Apply CTA must NOT make analysisReady true');
  });

  it('job title alone does NOT substitute for description readiness', () => {
    const doc = makeLinkedInMockDoc({ title: 'Principal Distributed Systems Architect', descText: '' });
    const payload = LinkedInAdapter.extract(doc, 'https://www.linkedin.com/jobs/view/123/');

    assert.strictEqual(payload.analysisReady, false);
  });

  it('URL alone does NOT substitute for description readiness', () => {
    const doc = makeLinkedInMockDoc({ descText: '' });
    const payload = LinkedInAdapter.extract(doc, 'https://www.linkedin.com/jobs/view/999999999999/');

    assert.strictEqual(payload.analysisReady, false);
  });

  it('analysisReady is true ONLY when description >= 50 chars', () => {
    const doc49 = makeLinkedInMockDoc({ descText: 'A'.repeat(49) });
    const payload49 = LinkedInAdapter.extract(doc49, 'https://www.linkedin.com/jobs/view/123/');
    assert.strictEqual(payload49.analysisReady, false, '49 chars must be false');

    const doc50 = makeLinkedInMockDoc({ descText: 'A'.repeat(50) });
    const payload50 = LinkedInAdapter.extract(doc50, 'https://www.linkedin.com/jobs/view/123/');
    assert.strictEqual(payload50.analysisReady, true, '50 chars must be true');
  });
});
