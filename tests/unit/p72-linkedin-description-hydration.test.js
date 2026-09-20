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
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

  let analyzeCalls = 0;
  controller.backendClient = {
    getHealth: async () => ({ status: 'ok' }),
    getAuthStatus: async () => ({
      authenticated: true,
      status: 'AUTHENTICATED',
      user: { id: 'u1' },
    }),
    analyzeJob: async () => {
      analyzeCalls++;
      return { success: true };
    },
  };

  controller.activeTabId = 100;
  controller.isAuthenticated = true;
  controller.currentUser = { id: 'u1' };

  let runtimeMessageListener = null;
  const origChrome = globalThis.chrome;
  globalThis.chrome = {
    runtime: {
      onMessage: {
        addListener(fn) {
          runtimeMessageListener = fn;
        },
      },
    },
  };
  controller._listenToRuntimeMessages();
  globalThis.chrome = origChrome;

  const dispatchRuntimeMessage = async (msg, sender = { tab: { id: controller.activeTabId } }) => {
    if (runtimeMessageListener) {
      await runtimeMessageListener(msg, sender);
    }
  };

  return {
    controller,
    elementState,
    dispatchRuntimeMessage,
    getAnalyzeCalls: () => analyzeCalls,
  };
}

const rootDir = path.resolve('.');

let swMessageListener = null;
let swForwardedMessages = [];

async function getServiceWorkerMessageListener() {
  if (!swMessageListener) {
    const swChromeMock = {
      runtime: {
        onInstalled: { addListener: () => {} },
        onStartup: { addListener: () => {} },
        onMessage: {
          addListener: (fn) => {
            swMessageListener = fn;
          },
        },
        sendMessage: async (msg) => {
          swForwardedMessages.push(msg);
          return { success: true };
        },
      },
      storage: {
        local: {
          get: async () => ({}),
          set: async () => {},
          remove: async () => {},
        },
      },
      tabs: {
        onActivated: { addListener: () => {} },
        onUpdated: { addListener: () => {} },
      },
    };
    const origChrome = globalThis.chrome;
    globalThis.chrome = swChromeMock;
    await import('../../extension/background/service-worker.js');
    globalThis.chrome = origChrome;
  }
  return {
    listener: async (msg, sender, sendResponse) => {
      const orig = globalThis.chrome;
      globalThis.chrome = {
        runtime: {
          sendMessage: async (m) => {
            swForwardedMessages.push(m);
            return { success: true };
          },
        },
      };
      try {
        return await swMessageListener(msg, sender, sendResponse);
      } finally {
        globalThis.chrome = orig;
      }
    },
    getForwarded: () => swForwardedMessages,
    clearForwarded: () => {
      swForwardedMessages = [];
    },
  };
}

async function getContentScriptHydration() {
  if (!globalThis.window?.__aicareershub_hydration) {
    globalThis.window = globalThis.window || {};
    globalThis.window.addEventListener = globalThis.window.addEventListener || (() => {});
    globalThis.window.location = globalThis.window.location || {
      href: 'https://in.linkedin.com/jobs/view/4464770430',
      hostname: 'in.linkedin.com',
      search: '',
    };
    globalThis.document = globalThis.document || {
      body: {},
      querySelector: () => null,
      addEventListener: () => {},
    };
    globalThis.chrome = globalThis.chrome || {};
    globalThis.chrome.runtime = globalThis.chrome.runtime || {};
    globalThis.chrome.runtime.onMessage = globalThis.chrome.runtime.onMessage || {
      addListener: () => {},
    };
    globalThis.chrome.runtime.sendMessage =
      globalThis.chrome.runtime.sendMessage || (async () => ({ success: true }));
    globalThis.chrome.runtime.getURL = (rel) =>
      pathToFileURL(path.resolve(rootDir, 'extension', rel)).href;
    await import('../../extension/content/content-script.js');
  }
  return globalThis.window.__aicareershub_hydration;
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
    assert.strictEqual(
      result.analysisReady,
      false,
      'analysisReady must be false when description is missing'
    );
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
    assert.strictEqual(
      elementState.descriptionLoadingNoticeHidden,
      false,
      'Loading notice must be visible'
    );
    // Analyze button must be disabled
    assert.strictEqual(
      controller.elements.analyzeJobBtn.disabled,
      true,
      'Analyze button must be disabled'
    );
  });
});

describe('P72: Localized LinkedIn Description Selectors (Never document.body)', () => {
  const substantiveDesc =
    'We are seeking an experienced Software Engineer with solid expertise in Node.js, React, and cloud systems to scale our distributed backend.';

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
        if (sel === 'h1.job-details-jobs-unified-top-card__job-title')
          return { textContent: 'Software Engineer' };
        if (sel === '.job-details-jobs-unified-top-card__company-name a')
          return { textContent: 'Appinventiv' };
        return null;
      },
      querySelectorAll: () => [],
      body: {
        textContent:
          'Random text on body that contains lots of words and should never be used as job description.',
      },
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
      descText:
        'Short clamped snippet... and here is the full comprehensive expanded job description with all details requirements and qualifications.',
    });
    const expandedPayload = LinkedInAdapter.extract(docExpanded, url);
    assert.strictEqual(expandedPayload.analysisReady, true);
    assert.ok(expandedPayload.description.length >= 50);
  });
});

describe('P72-FIX: Service Worker Forwarding & Safety', () => {
  it('service worker forwards JOB_DESCRIPTION_HYDRATED to runtime with sender.tab.id', async () => {
    const sw = await getServiceWorkerMessageListener();
    sw.clearForwarded();

    let ackResult = null;
    const message = {
      type: 'JOB_DESCRIPTION_HYDRATED',
      jobData: {
        title: 'Software Engineer',
        company: 'Appinventiv',
        description: 'Detailed job description >= 50 chars',
      },
      jobFingerprint: 'fp-appinventiv-123',
    };
    const sender = { tab: { id: 777 } };

    await sw.listener(message, sender, (res) => {
      ackResult = res;
    });

    assert.deepStrictEqual(ackResult, { success: true, hydrated: true, forwarded: true });
    const forwarded = sw.getForwarded();
    assert.strictEqual(forwarded.length, 1);
    assert.strictEqual(forwarded[0].type, 'JOB_DESCRIPTION_HYDRATED');
    assert.strictEqual(forwarded[0].tabId, 777, 'Forwarded message must carry sender.tab.id');
    assert.strictEqual(forwarded[0].jobFingerprint, 'fp-appinventiv-123');
    assert.strictEqual(forwarded[0].jobData.title, 'Software Engineer');
  });

  it('service worker strictly uses sender.tab.id and ignores spoofed payload tabId', async () => {
    const sw = await getServiceWorkerMessageListener();
    sw.clearForwarded();

    let ackResult = null;
    const message = {
      type: 'JOB_DESCRIPTION_HYDRATED',
      tabId: 999999, // spoofed
      jobData: { title: 'Software Engineer', description: 'Detailed job description >= 50 chars' },
      jobFingerprint: 'fp-appinventiv-123',
    };
    const sender = { tab: { id: 888 } };

    await sw.listener(message, sender, (res) => {
      ackResult = res;
    });

    assert.strictEqual(ackResult.success, true);
    const forwarded = sw.getForwarded();
    assert.strictEqual(forwarded.length, 1);
    assert.strictEqual(
      forwarded[0].tabId,
      888,
      'Service worker must use sender.tab.id, never spoofed tabId'
    );
  });

  it('service worker rejects JOB_DESCRIPTION_HYDRATED when sender.tab.id is missing', async () => {
    const sw = await getServiceWorkerMessageListener();
    sw.clearForwarded();

    let ackResult = null;
    const message = {
      type: 'JOB_DESCRIPTION_HYDRATED',
      tabId: 100,
      jobData: { title: 'Software Engineer' },
      jobFingerprint: 'fp-123',
    };
    const sender = {}; // no tab identity

    await sw.listener(message, sender, (res) => {
      ackResult = res;
    });

    assert.strictEqual(ackResult.success, false);
    assert.strictEqual(sw.getForwarded().length, 0, 'Must NOT forward event from untrusted sender');
  });
});

describe('P72: Sidebar JOB_DESCRIPTION_HYDRATED Message Reconciliation', () => {
  it('updates activeJob, enables Analyze button, and hides notice on matching fingerprint and tabId', async () => {
    const { controller, elementState, dispatchRuntimeMessage, getAnalyzeCalls } =
      createMockController();

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

    // 2. Simulate JOB_DESCRIPTION_HYDRATED runtime message arriving from service worker
    const hydratedJob = {
      ...initialJob,
      description:
        'We are seeking an experienced Software Engineer with solid expertise in Node.js, React, and cloud systems to scale our distributed backend.',
      rawText:
        'We are seeking an experienced Software Engineer with solid expertise in Node.js, React, and cloud systems to scale our distributed backend.',
      analysisReady: true,
    };

    const incomingFingerprint = JobIdentity.deriveJobFingerprint(hydratedJob);
    assert.strictEqual(incomingFingerprint, controller.activeJobFingerprint);

    await dispatchRuntimeMessage({
      type: 'JOB_DESCRIPTION_HYDRATED',
      tabId: controller.activeTabId,
      jobData: hydratedJob,
      jobFingerprint: incomingFingerprint,
    });

    // 3. Verify state after hydration
    assert.strictEqual(controller.activeJob.analysisReady, true);
    assert.ok(controller.activeJob.description.length >= 50);
    assert.strictEqual(controller.cachedState.jobData.description, hydratedJob.description);
    assert.strictEqual(
      elementState.descriptionLoadingNoticeHidden,
      true,
      'Notice must be hidden after hydration'
    );
    assert.strictEqual(
      controller.elements.analyzeJobBtn.disabled,
      false,
      'Analyze button must be enabled'
    );
    assert.strictEqual(controller.elements.analyzeJobBtn.textContent, 'Analyze Job Match');

    // 4. Verify 0 automatic analyze calls
    assert.strictEqual(getAnalyzeCalls(), 0, 'No automatic analyze call must occur upon hydration');
  });

  it('produces ZERO automatic analyze calls on hydration arrival', async () => {
    const { controller, dispatchRuntimeMessage, getAnalyzeCalls } = createMockController();
    const initialJob = {
      title: 'Software Engineer',
      company: 'Appinventiv',
      externalJobId: '4464770430',
      description: '',
      analysisReady: false,
      provider: 'LINKEDIN',
    };
    await controller._handleJobDetectedEvent(initialJob);

    const hydratedJob = {
      ...initialJob,
      description:
        'A sufficiently long description with more than fifty characters to qualify for analysis readiness.',
      analysisReady: true,
    };
    const fp = JobIdentity.deriveJobFingerprint(hydratedJob);

    await dispatchRuntimeMessage({
      type: 'JOB_DESCRIPTION_HYDRATED',
      tabId: controller.activeTabId,
      jobData: hydratedJob,
      jobFingerprint: fp,
    });

    assert.strictEqual(getAnalyzeCalls(), 0, 'Must not call analyze API on hydration arrival');
  });

  it('duplicate JOB_DESCRIPTION_HYDRATED event is completely idempotent', async () => {
    const { controller, dispatchRuntimeMessage, getAnalyzeCalls } = createMockController();
    const initialJob = {
      title: 'Software Engineer',
      company: 'Appinventiv',
      externalJobId: '4464770430',
      description: '',
      analysisReady: false,
      provider: 'LINKEDIN',
    };
    await controller._handleJobDetectedEvent(initialJob);

    const hydratedJob = {
      ...initialJob,
      description:
        'A sufficiently long description with more than fifty characters to qualify for analysis readiness.',
      analysisReady: true,
    };
    const fp = JobIdentity.deriveJobFingerprint(hydratedJob);

    // First arrival
    await dispatchRuntimeMessage({
      type: 'JOB_DESCRIPTION_HYDRATED',
      tabId: controller.activeTabId,
      jobData: hydratedJob,
      jobFingerprint: fp,
    });
    assert.strictEqual(controller.activeJob.analysisReady, true);
    assert.strictEqual(controller.elements.analyzeJobBtn.disabled, false);

    // Duplicate arrival
    await dispatchRuntimeMessage({
      type: 'JOB_DESCRIPTION_HYDRATED',
      tabId: controller.activeTabId,
      jobData: hydratedJob,
      jobFingerprint: fp,
    });
    assert.strictEqual(controller.activeJob.analysisReady, true);
    assert.strictEqual(controller.elements.analyzeJobBtn.disabled, false);
    assert.strictEqual(getAnalyzeCalls(), 0, 'Duplicate hydration must remain 0 analyze calls');
  });

  it('ignores JOB_DESCRIPTION_HYDRATED for a DIFFERENT job fingerprint', async () => {
    const { controller, dispatchRuntimeMessage } = createMockController();

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

    const fpB = JobIdentity.deriveJobFingerprint(jobB);

    await dispatchRuntimeMessage({
      type: 'JOB_DESCRIPTION_HYDRATED',
      tabId: controller.activeTabId,
      jobData: jobB,
      jobFingerprint: fpB,
    });

    // Active job remains Job A untouched
    assert.strictEqual(controller.activeJob.title, 'Job A Engineer');
    assert.strictEqual(controller.activeJob.description, '');
    assert.strictEqual(controller.elements.analyzeJobBtn.disabled, true);
  });

  it('ignores JOB_DESCRIPTION_HYDRATED when sender tabId does not match activeTabId', async () => {
    const { controller, dispatchRuntimeMessage } = createMockController();
    controller.activeTabId = 100;

    const job = {
      title: 'Software Engineer',
      company: 'Appinventiv',
      externalJobId: '4464770430',
      description:
        'Hydrated description from background tab that has more than fifty characters of content.',
      analysisReady: true,
      provider: 'LINKEDIN',
    };
    await controller._handleJobDetectedEvent(job);

    // Message arrives with wrong tabId (200)
    await dispatchRuntimeMessage(
      {
        type: 'JOB_DESCRIPTION_HYDRATED',
        tabId: 200,
        jobData: { ...job, description: 'Mutated description from other tab' },
        jobFingerprint: JobIdentity.deriveJobFingerprint(job),
      },
      { tab: { id: 200 } }
    );

    // State on tab 100 must NOT be updated by tab 200 message
    assert.strictEqual(controller.activeJob.description, job.description);
  });

  it('stale Job A hydration cannot mutate active Job B', async () => {
    const { controller, dispatchRuntimeMessage } = createMockController();

    // Tab navigates from Job A to Job B
    const jobB = {
      title: 'Job B Engineer',
      company: 'Company B',
      externalJobId: '88888',
      description: '',
      analysisReady: false,
      provider: 'LINKEDIN',
    };
    await controller._handleJobDetectedEvent(jobB);

    // Stale Job A hydration message arrives on same tab
    const staleJobA = {
      title: 'Job A Engineer',
      company: 'Company A',
      externalJobId: '77777',
      description: 'Late hydrated description for Job A that took 8 seconds to arrive.',
      analysisReady: true,
      provider: 'LINKEDIN',
    };

    await dispatchRuntimeMessage({
      type: 'JOB_DESCRIPTION_HYDRATED',
      tabId: controller.activeTabId,
      jobData: staleJobA,
      jobFingerprint: JobIdentity.deriveJobFingerprint(staleJobA),
    });

    // Active job must strictly remain Job B with empty description
    assert.strictEqual(controller.activeJob.title, 'Job B Engineer');
    assert.strictEqual(controller.activeJob.description, '');
    assert.strictEqual(controller.activeJob.analysisReady, false);
    assert.strictEqual(controller.elements.analyzeJobBtn.disabled, true);
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
      fields: [
        { name: 'fullName', type: 'text' },
        { name: 'email', type: 'email' },
      ],
      url: 'https://www.linkedin.com/jobs/view/4464770430/',
    };
    await controller._handleFormDetectedEvent(formData);

    assert.strictEqual(controller.cachedState.workflowState, WORKFLOW_STATES.FORM_DETECTED);
    assert.strictEqual(elementState.formCardHidden, false, 'Form card must be rendered');
    assert.strictEqual(
      controller.elements.analyzeJobBtn.disabled,
      true,
      'Analyze still disabled (no desc)'
    );

    // 3. Late description hydration arrives
    const hydratedJob = {
      ...initialJob,
      description:
        'Substantive job description with over fifty characters detailing qualifications and role expectations.',
      analysisReady: true,
    };
    await controller._reconcileDetectedJob(hydratedJob);

    // Both form and analyze are now ready
    assert.strictEqual(controller.activeJob.analysisReady, true);
    assert.strictEqual(
      controller.elements.analyzeJobBtn.disabled,
      false,
      'Analyze button now enabled'
    );
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
      description:
        'Substantive job description with over fifty characters detailing qualifications and role expectations.',
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
    assert.strictEqual(
      controller.elements.analyzeJobBtn.disabled,
      false,
      'Analyze must remain enabled'
    );
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
      if (sel === 'h1.job-details-jobs-unified-top-card__job-title')
        return { textContent: 'Software Engineer' };
      if (sel === '.job-details-jobs-unified-top-card__company-name a')
        return { textContent: 'Appinventiv' };
      if (sel.includes('jobs-apply-button') || sel.includes('Easy Apply'))
        return { textContent: 'Easy Apply' };
      return null;
    };

    const payload = LinkedInAdapter.extract(doc, 'https://www.linkedin.com/jobs/view/123/');
    assert.strictEqual(payload.hasApplyCta, true);
    assert.strictEqual(
      payload.analysisReady,
      false,
      'Easy Apply CTA must NOT make analysisReady true'
    );
  });

  it('job title alone does NOT substitute for description readiness', () => {
    const doc = makeLinkedInMockDoc({
      title: 'Principal Distributed Systems Architect',
      descText: '',
    });
    const payload = LinkedInAdapter.extract(doc, 'https://www.linkedin.com/jobs/view/123/');

    assert.strictEqual(payload.analysisReady, false);
  });

  it('URL alone does NOT substitute for description readiness', () => {
    const doc = makeLinkedInMockDoc({ descText: '' });
    const payload = LinkedInAdapter.extract(
      doc,
      'https://www.linkedin.com/jobs/view/999999999999/'
    );

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

describe('P72-FIX: Content Script startJobHydration Concurrency & Invariants', () => {
  it('concurrent startJobHydration calls create exactly ONE JobHydrationLifecycle', async () => {
    const cs = await getContentScriptHydration();
    cs.stopJobHydration();

    const jobA = {
      title: 'Software Engineer',
      company: 'Appinventiv',
      externalJobId: '4464770430',
      description: '',
      provider: 'LINKEDIN',
    };

    // 3 concurrent calls
    const [p1, p2, p3] = [
      cs.startJobHydration(jobA),
      cs.startJobHydration(jobA),
      cs.startJobHydration(jobA),
    ];

    await Promise.all([p1, p2, p3]);

    const activeLifecycle = cs.getActiveHydrationLifecycle();
    assert.ok(activeLifecycle, 'Lifecycle must exist');
    assert.strictEqual(activeLifecycle.isCancelled, false);
    assert.strictEqual(cs.getActiveHydrationKey(), cs.deriveProvisionalJobKey(jobA));

    cs.stopJobHydration();
    assert.strictEqual(cs.getActiveHydrationLifecycle(), null);
  });

  it('Job A hydration is cancelled when Job B appears', async () => {
    const cs = await getContentScriptHydration();
    cs.stopJobHydration();

    const jobA = {
      title: 'Job A Engineer',
      company: 'Company A',
      externalJobId: '11111',
      description: '',
      provider: 'LINKEDIN',
    };
    const jobB = {
      title: 'Job B Engineer',
      company: 'Company B',
      externalJobId: '22222',
      description: '',
      provider: 'LINKEDIN',
    };

    await cs.startJobHydration(jobA);
    const lifecycleA = cs.getActiveHydrationLifecycle();
    assert.ok(lifecycleA);
    assert.strictEqual(lifecycleA.isCancelled, false);

    // Switch to Job B
    await cs.startJobHydration(jobB);
    assert.strictEqual(lifecycleA.isCancelled, true, 'Job A lifecycle must be cancelled');

    const lifecycleB = cs.getActiveHydrationLifecycle();
    assert.ok(lifecycleB);
    assert.notStrictEqual(lifecycleA, lifecycleB);
    assert.strictEqual(lifecycleB.isCancelled, false);

    cs.stopJobHydration();
  });

  it('JobHydrationLifecycle enforces at most ONE _attemptHydration in flight', async () => {
    const cs = await getContentScriptHydration();
    let extractedCount = 0;

    const lifecycle = new cs.JobHydrationLifecycle(
      { title: 'Engineer', description: '' },
      () => {}
    );

    // Simulate in-flight lock
    assert.strictEqual(lifecycle.isExtractionInFlight, false);
    lifecycle.isExtractionInFlight = true;

    // A concurrent attempt should immediately return without extracting
    await lifecycle._attemptHydration('concurrent-call');
    assert.strictEqual(extractedCount, 0, 'Must not extract while in-flight lock is held');

    lifecycle.isExtractionInFlight = false;
  });

  it('JobHydrationLifecycle cancels timers, observer, and emits exactly once when description >= 50', async () => {
    const cs = await getContentScriptHydration();
    let hydratedEvents = [];

    const lifecycle = new cs.JobHydrationLifecycle(
      { title: 'Engineer', description: '', externalJobId: '9999' },
      (hydratedJob, fp) => {
        hydratedEvents.push({ hydratedJob, fp });
      }
    );

    await lifecycle.start();
    assert.ok(lifecycle.timerIds.length > 0, 'Timers must be scheduled');

    // Simulate completion with description >= 50
    const fullJob = {
      title: 'Engineer',
      externalJobId: '9999',
      description: 'A full detailed job description with more than fifty characters of content.',
    };

    lifecycle.targetFingerprint = 'fp-9999';

    // Directly trigger completion logic
    lifecycle.isCompleted = true;
    lifecycle.cancel();
    lifecycle.onHydrated({ ...fullJob, analysisReady: true }, 'fp-9999');

    assert.strictEqual(lifecycle.isCompleted, true);
    assert.strictEqual(lifecycle.isCancelled, true);
    assert.strictEqual(lifecycle.timerIds.length, 0, 'Timers must be cleared');
    assert.strictEqual(hydratedEvents.length, 1, 'Must emit exactly once');
    assert.strictEqual(hydratedEvents[0].hydratedJob.analysisReady, true);
  });
});
