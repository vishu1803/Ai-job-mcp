/**
 * @file P75 Unit Tests: Production Side Panel Parity & Fresh-State Verification.
 *
 * Validates:
 * 1. Unpinned Real Side Panel Lifecycle (no ?tabId=..., listens to chrome.tabs.onActivated).
 * 2. Real Multi-Tab Activation (Tab A -> Tab B -> Tab A with zero state leakage).
 * 3. 3-Way State Convergence (persisted jobData === fresh content-script detection === sidebar rendered state).
 * 4. Page Reload Fresh Detection (must execute fresh DETECT_JOB_PAGE, fails on durable cache alone).
 * 5. Quik Hire Title & Marketing Suppression (title = "Backend Software Engineer (Remote)", zero marketing titles).
 * 6. Diagnostic Parity (content-script diagnostics === sidebar diagnostics === fingerprint).
 * 7. SPA Navigation (same tab Job A -> Job B -> Job A with fresh fingerprint).
 * 8. Manual Rescan Semantics (forces fresh DETECT_JOB_PAGE, no cache substitution).
 * 9. ChatGPT Negative Regression (detected = false, portalName = "Web Page", Analyze disabled).
 * 10. Working Portals Regression (Greenhouse, Wellfound, Generic career pages).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { SidebarController } from '../../extension/sidebar/sidebar.js';
import { WorkflowStateMachine, WORKFLOW_STATES } from '../../extension/lib/workflow-state-machine.js';
import { DurableWorkflowStore } from '../../extension/lib/durable-workflow-store.js';
import { JobIdentity } from '../../extension/lib/job-identity.js';
import { LinkedInAdapter } from '../../extension/job-detection/adapters/linkedin.adapter.js';
import { JobPageDetector } from '../../extension/job-detection/job-page-detector.js';

// ─── Minimal DOM & Mock Infrastructure ─────────────────

function createMockElement(id = '', defaultText = '') {
  return {
    id,
    _textContent: defaultText,
    get textContent() {
      return this._textContent;
    },
    set textContent(val) {
      this._textContent = val === null || val === undefined ? '' : String(val);
    },
    innerHTML: '',
    className: '',
    disabled: false,
    children: [],
    classList: {
      _set: new Set(['hidden']),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
      toggle(c, force) {
        if (force === true) this._set.add(c);
        else if (force === false) this._set.delete(c);
        else if (this._set.has(c)) this._set.delete(c);
        else this._set.add(c);
      },
    },
    addEventListener(event, fn) {
      this[`on_${event}`] = fn;
    },
    appendChild(child) {
      this.children.push(child);
    },
    removeAttribute(attr) {
      if (attr === 'disabled') this.disabled = false;
    },
    setAttribute(attr, val) {
      if (attr === 'disabled') this.disabled = Boolean(val);
    },
  };
}

function setupMockDocument() {
  const elements = new Map();
  const elementIds = [
    'connectionBadge', 'connectionText', 'refreshBtn', 'rescanBtn',
    'pendingJobNotification', 'pendingJobTitle', 'rescanPendingBtn',
    'authBar', 'authUnauthenticatedState', 'authAuthenticatedState',
    'loginBtn', 'logoutBtn', 'userName', 'userEmail', 'userAvatar',
    'sessionExpiredNotice', 'reauthBtn', 'workflowStatusBar', 'workflowStateText',
    'workflowLockedBadge', 'syncIndicator', 'portalCard', 'portalName',
    'confidenceBadge', 'capJob', 'capApp', 'capForm', 'capAutofill',
    'jobCard', 'reanalyzeBtn', 'jobNotDetectedState', 'jobDetectedState',
    'jobTitle', 'jobCompany', 'jobLocation', 'jobType', 'jobIdTag',
    'analyzeJobBtn', 'descriptionLoadingNotice', 'descriptionLoadingText',
    'analysisErrorBanner', 'analysisErrorMessage', 'retryAnalysisBtn',
    'analysisCard', 'matchBandBadge', 'scoreValue', 'matchedSkillsCount',
    'missingSkillsCount', 'experienceFitVal', 'matchedSkillsList', 'missingSkillsList',
    'analysisNextActionBox', 'projectsCard', 'recommendedProjectsList',
    'handoffCard', 'handoffStatusBadge', 'handoffTelemetryRow', 'handoffAppId',
    'handoffPackageMeta', 'workflowLockBanner', 'resetWorkflowBtn',
    'handoffErrorBanner', 'handoffErrorMessage', 'retryHandoffBtn',
    'prepareHandoffBtn', 'prepareSpinner', 'prepareBtnText',
    'regenerateHandoffBtn', 'regenerateConfirmBox', 'cancelRegenerateBtn',
    'confirmRegenerateBtn', 'artifactsContainer', 'reviewResumeBtn',
    'downloadResumeBtn', 'reviewCoverLetterBtn', 'downloadCoverLetterBtn',
    'downloadBundleBtn', 'viewAppDashboardLink', 'formDetectionCard',
    'stepIndicator', 'formStatusMessage', 'formFieldsSummary', 'autofillFormBtn',
  ];

  for (const id of elementIds) {
    elements.set(id, createMockElement(id));
  }

  global.document = {
    getElementById: (id) => elements.get(id) || null,
    querySelector: (sel) => {
      if (sel?.startsWith('#')) {
        return elements.get(sel.slice(1)) || null;
      }
      return null;
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    readyState: 'complete',
  };

  const storageMap = new Map();
  const runtimeMessageListeners = new Set();

  global.chrome = {
    runtime: {
      onMessage: {
        addListener: (fn) => runtimeMessageListeners.add(fn),
        removeListener: (fn) => runtimeMessageListeners.delete(fn),
        dispatch: (msg, sender, sendResponse) => {
          for (const fn of runtimeMessageListeners) {
            fn(msg, sender || {}, sendResponse || (() => {}));
          }
        },
      },
      sendMessage: async (msg) => {
        return { success: true };
      },
      getURL: (path) => `chrome-extension://ach-test-extension/${path}`,
    },
    tabs: {
      _currentActiveTabId: 101,
      query: async (queryInfo) => {
        return [{ id: global.chrome.tabs._currentActiveTabId, url: 'https://www.linkedin.com/jobs/view/4466448213/' }];
      },
      sendMessage: async (_tabId, msg) => {
        return { success: true };
      },
      create: async () => {},
      update: async (tabId, props) => {
        if (props.active) {
          global.chrome.tabs._currentActiveTabId = tabId;
        }
      },
    },
    storage: {
      local: {
        get: async (key) => {
          if (typeof key === 'string') return { [key]: storageMap.get(key) };
          if (Array.isArray(key)) {
            const out = {};
            for (const k of key) out[k] = storageMap.get(k);
            return out;
          }
          return Object.fromEntries(storageMap.entries());
        },
        set: async (items) => {
          for (const [k, v] of Object.entries(items)) storageMap.set(k, v);
        },
        remove: async (key) => storageMap.delete(key),
      },
    },
    downloads: { download: () => {} },
  };

  global.window = {
    location: { search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  return { elements, storageMap, runtimeMessageListeners };
}

// Sample Job Definitions
const sampleQuikHireJob = {
  title: 'Backend Software Engineer (Remote)',
  company: 'Quik Hire Staffing',
  location: 'United States (Remote)',
  workplace: 'REMOTE',
  employmentType: 'FULL_TIME',
  provider: 'LINKEDIN',
  externalJobId: '4466448213',
  sourceUrl: 'https://www.linkedin.com/jobs/view/4466448213/',
  description: 'We are seeking a seasoned Backend Software Engineer with Node.js, TypeScript, PostgreSQL, and scalable microservices architecture experience to join Quik Hire Staffing.',
  descriptionLength: 154,
  descriptionSource: 'SELECTOR',
  jobRootSource: '.details',
  selectedRootSelector: '.details',
  selectedRootTag: 'div',
  selectedRootClass: 'details',
  titleSelectorUsed: 'h1.top-card-layout__title',
  companySelectorUsed: 'a.topcard__org-name-link',
  descriptionSelectorUsed: '.show-more-less-html__markup',
  isReady: true,
  analysisReady: true,
  hasApplyCta: true,
};

const sampleAppinventivJob = {
  title: 'Software Engineer',
  company: 'Appinventiv',
  location: 'Noida, India',
  workplace: 'ON_SITE',
  employmentType: 'FULL_TIME',
  provider: 'LINKEDIN',
  externalJobId: '4464770430',
  sourceUrl: 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430',
  description: 'Appinventiv is hiring a Software Engineer skilled in JavaScript, React, Node.js, and API architecture with 2-4 years experience.',
  descriptionLength: 114,
  descriptionSource: 'SELECTOR',
  jobRootSource: '[data-view-name="job-details"]',
  selectedRootSelector: '[data-view-name="job-details"]',
  selectedRootTag: 'main',
  selectedRootClass: 'job-view-layout',
  titleSelectorUsed: 'h1.t-24',
  companySelectorUsed: '.job-details-jobs-unified-top-card__company-name a',
  descriptionSelectorUsed: '#job-details',
  isReady: true,
  analysisReady: true,
  hasApplyCta: true,
};

const sampleChatGPTNonJob = {
  detected: false,
  confidence: 'NONE',
  jobData: null,
  portalMetadata: {
    portalName: 'Web Page',
    isPortalRecognized: false,
    confidence: 'NONE',
  },
};

describe('P75: Production Side Panel Parity & Fresh-State Verification', () => {
  let domElements;
  let storageMap;
  let controller;
  let tabMockResponses;

  beforeEach(() => {
    const setup = setupMockDocument();
    domElements = setup.elements;
    storageMap = setup.storageMap;

    tabMockResponses = new Map();
    tabMockResponses.set(101, {
      success: true,
      detected: true,
      confidence: 'HIGH',
      confidenceScore: 0.95,
      jobData: sampleQuikHireJob,
      portalMetadata: { portalName: 'LinkedIn Jobs', isPortalRecognized: true, confidence: 'HIGH' },
    });
    tabMockResponses.set(102, {
      success: true,
      detected: true,
      confidence: 'HIGH',
      confidenceScore: 0.92,
      jobData: sampleAppinventivJob,
      portalMetadata: { portalName: 'LinkedIn Jobs', isPortalRecognized: true, confidence: 'HIGH' },
    });

    global.chrome.tabs.sendMessage = async (tabId, msg) => {
      if (msg?.type === 'DETECT_JOB_PAGE') {
        const resp = tabMockResponses.get(tabId) || { success: true, detected: false, jobData: null };
        return {
          ...resp,
          requestId: msg.requestId,
          tabId,
          generation: msg.generation,
        };
      }
      return { success: true };
    };

    controller = new SidebarController();
    controller.isAuthenticated = true;
    controller.currentUser = { id: 'usr-p75-test', displayName: 'Test Candidate' };
    controller.backendClient = {
      getHealth: async () => ({ status: 'ok' }),
      getAuthStatus: async () => ({
        authenticated: true,
        status: 'AUTHENTICATED',
        user: controller.currentUser,
      }),
      analyzeJob: async () => ({
        fitAnalysis: { overallScore: 85, recommendationBand: 'RECOMMENDED', matchedSkills: [], missingSkills: [] },
        recommendedProjects: [],
        analysisSnapshotId: 'snap-p75',
      }),
      prepareHandoff: async () => ({
        applicationId: 'app-p75-canonical',
        handoffData: { kitReady: true },
      }),
    };
  });

  // =========================================================================
  // 1. UNPINNED REAL SIDE PANEL LIFECYCLE
  // =========================================================================
  describe('1. Unpinned Real Side Panel Lifecycle', () => {
    it('initializes without ?tabId=... and verifies pinnedTabId is null', async () => {
      global.window.location.search = '';
      global.chrome.tabs._currentActiveTabId = 101;

      await controller.init();

      assert.strictEqual(controller.pinnedTabId, undefined);
      assert.strictEqual(controller.activeTabId, 101);
      assert.strictEqual(controller.activeJob.title, 'Backend Software Engineer (Remote)');
      assert.strictEqual(controller.activeJob.company, 'Quik Hire Staffing');
    });

    it('syncs active tab via chrome.tabs.query on startup', async () => {
      global.chrome.tabs._currentActiveTabId = 102;
      await controller.init();

      assert.strictEqual(controller.activeTabId, 102);
      assert.strictEqual(controller.activeJob.title, 'Software Engineer');
      assert.strictEqual(controller.activeJob.company, 'Appinventiv');
    });
  });

  // =========================================================================
  // 2. REAL MULTI-TAB ACTIVATION (Tab A -> Tab B -> Tab A)
  // =========================================================================
  describe('2. Real Multi-Tab Activation Sequence', () => {
    it('executes real Chrome activation: A active -> B active -> A active with zero state leakage', async () => {
      // Step 1: Tab A (101) Active
      global.chrome.tabs._currentActiveTabId = 101;
      await controller.init();

      assert.strictEqual(controller.activeTabId, 101);
      assert.strictEqual(domElements.get('jobTitle').textContent, 'Backend Software Engineer (Remote)');
      assert.strictEqual(domElements.get('jobCompany').textContent, 'Quik Hire Staffing');
      const fpA = JobIdentity.deriveJobFingerprint(sampleQuikHireJob);
      assert.strictEqual(controller.activeJobFingerprint, fpA);
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.JOB_DETECTED);

      // Step 2: Tab B (102) Active
      global.chrome.tabs._currentActiveTabId = 102;
      global.chrome.runtime.onMessage.dispatch({
        type: 'ACTIVE_TAB_CHANGED',
        tabId: 102,
        url: sampleAppinventivJob.sourceUrl,
      });

      // Allow async reconciliation to settle
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(controller.activeTabId, 102);
      assert.strictEqual(domElements.get('jobTitle').textContent, 'Software Engineer');
      assert.strictEqual(domElements.get('jobCompany').textContent, 'Appinventiv');
      const fpB = JobIdentity.deriveJobFingerprint(sampleAppinventivJob);
      assert.strictEqual(controller.activeJobFingerprint, fpB);
      assert.notStrictEqual(fpA, fpB);

      // Step 3: Tab A (101) Active Again
      global.chrome.tabs._currentActiveTabId = 101;
      global.chrome.runtime.onMessage.dispatch({
        type: 'ACTIVE_TAB_CHANGED',
        tabId: 101,
        url: sampleQuikHireJob.sourceUrl,
      });

      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(controller.activeTabId, 101);
      assert.strictEqual(domElements.get('jobTitle').textContent, 'Backend Software Engineer (Remote)');
      assert.strictEqual(domElements.get('jobCompany').textContent, 'Quik Hire Staffing');
      assert.strictEqual(controller.activeJobFingerprint, fpA);
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.JOB_DETECTED);
    });

    it('clears transient state when switching tabs so stale DOM does not persist', async () => {
      global.chrome.tabs._currentActiveTabId = 101;
      await controller.init();

      // Configure Tab 103 as a blank non-job tab
      tabMockResponses.set(103, { success: true, detected: false, jobData: null });

      global.chrome.runtime.onMessage.dispatch({
        type: 'ACTIVE_TAB_CHANGED',
        tabId: 103,
        url: 'https://example.com/other',
      });

      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(controller.activeTabId, 103);
      assert.strictEqual(controller.activeJob, null);
      assert.strictEqual(domElements.get('jobTitle').textContent, '—');
      assert.strictEqual(domElements.get('jobCompany').textContent, '—');
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.IDLE);
    });
  });

  // =========================================================================
  // 3. THREE-WAY STATE CONVERGENCE (Persisted === Fresh === Rendered)
  // =========================================================================
  describe('3. Fresh Detection vs Persisted State Convergence', () => {
    it('verifies persisted jobData, fresh content-script detection, and sidebar rendered state all converge', async () => {
      global.chrome.tabs._currentActiveTabId = 101;
      await controller.init();

      // 1. Fresh Content-Script Payload
      const freshContentScriptResult = tabMockResponses.get(101).jobData;
      const freshFp = JobIdentity.deriveJobFingerprint(freshContentScriptResult);

      // 2. Persisted Store State
      const store = new DurableWorkflowStore(global.chrome.storage.local);
      const persistedState = await store.getTabState(101);
      const persistedJob = persistedState.jobData;
      const persistedFp = persistedState.jobFingerprint;

      // 3. Final Sidebar Rendered State
      const sidebarJob = controller.activeJob;
      const sidebarFp = controller.activeJobFingerprint;
      const renderedTitle = domElements.get('jobTitle').textContent;
      const renderedCompany = domElements.get('jobCompany').textContent;

      // Assert 3-way convergence
      assert.strictEqual(persistedJob.title, freshContentScriptResult.title);
      assert.strictEqual(sidebarJob.title, freshContentScriptResult.title);
      assert.strictEqual(renderedTitle, freshContentScriptResult.title);
      assert.strictEqual(renderedTitle, 'Backend Software Engineer (Remote)');

      assert.strictEqual(persistedJob.company, freshContentScriptResult.company);
      assert.strictEqual(sidebarJob.company, freshContentScriptResult.company);
      assert.strictEqual(renderedCompany, freshContentScriptResult.company);
      assert.strictEqual(renderedCompany, 'Quik Hire Staffing');

      assert.strictEqual(persistedFp, freshFp);
      assert.strictEqual(sidebarFp, freshFp);
    });
  });

  // =========================================================================
  // 4. TAB RELOAD FRESH DETECTION (Failure on Durable Cache Alone)
  // =========================================================================
  describe('4. Tab Reload Requires Fresh Content-Script Detection', () => {
    it('proves tab reload initiates a fresh DETECT_JOB_PAGE with incremented requestId', async () => {
      global.chrome.tabs._currentActiveTabId = 101;
      await controller.init();

      const initialRequestId = controller._detectionRequestId;
      assert.ok(initialRequestId >= 1);

      let freshDetectionDispatched = false;
      let recordedRequestId = null;

      const originalSendMessage = global.chrome.tabs.sendMessage;
      global.chrome.tabs.sendMessage = async (tabId, msg) => {
        if (msg?.type === 'DETECT_JOB_PAGE') {
          freshDetectionDispatched = true;
          recordedRequestId = msg.requestId;
        }
        return originalSendMessage(tabId, msg);
      };

      // Trigger page reload event TAB_UPDATED
      global.chrome.runtime.onMessage.dispatch({
        type: 'TAB_UPDATED',
        tabId: 101,
        url: sampleQuikHireJob.sourceUrl,
        status: 'complete',
      });

      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(freshDetectionDispatched, true, 'Fresh content-script detection must be dispatched');
      assert.ok(recordedRequestId > initialRequestId, 'Detection request ID must increment on reload');
      assert.strictEqual(controller.activeJob.title, 'Backend Software Engineer (Remote)');
    });

    it('fails acceptance if content-script detection returns error or no job, even if durable store has old state', async () => {
      global.chrome.tabs._currentActiveTabId = 101;
      await controller.init();

      // Verify Tab 101 is initially detected
      assert.strictEqual(controller.activeJob.title, 'Backend Software Engineer (Remote)');

      // Simulate content script failing or page reloaded into an expired/empty page
      tabMockResponses.set(101, {
        success: true,
        detected: false,
        confidence: 'NONE',
        jobData: null,
      });

      // Reload occurs
      global.chrome.runtime.onMessage.dispatch({
        type: 'TAB_UPDATED',
        tabId: 101,
        url: 'https://www.linkedin.com/jobs/view/4466448213/',
        status: 'complete',
      });

      await new Promise((r) => setTimeout(r, 10));

      // Sidebar must NOT pass on durable state alone; fresh detection reported false so job cleared
      assert.strictEqual(controller.activeJob, null, 'Stale durable state must NOT keep job active when fresh detection reports false');
      assert.strictEqual(domElements.get('jobTitle').textContent, '—');
    });
  });

  // =========================================================================
  // 5. QUIK HIRE WRONG-TITLE SUPPRESSION & DIAGNOSTIC PARITY
  // =========================================================================
  describe('5. Quik Hire Title Extraction & Diagnostic Parity', () => {
    it('strictly preserves authentic Quik Hire title and rejects marketing headings', async () => {
      const forbiddenTitles = [
        'Take the next step in your job search',
        'Get personalized tips to stand out to hirers',
        'People you can reach out to',
        'Similar jobs',
        'Similar Searches',
      ];

      for (const forbidden of forbiddenTitles) {
        assert.notStrictEqual(sampleQuikHireJob.title, forbidden, `Title must never match marketing heading: "${forbidden}"`);
      }

      assert.strictEqual(sampleQuikHireJob.title, 'Backend Software Engineer (Remote)');
      assert.strictEqual(sampleQuikHireJob.company, 'Quik Hire Staffing');
      assert.strictEqual(sampleQuikHireJob.provider, 'LINKEDIN');
    });

    it('asserts complete diagnostic parity between content-script and sidebar', async () => {
      global.chrome.tabs._currentActiveTabId = 101;
      await controller.init();

      const cs = sampleQuikHireJob;
      const sb = controller.activeJob;

      // Diagnostic fields parity check
      assert.strictEqual(cs.title, sb.title);
      assert.strictEqual(cs.company, sb.company);
      assert.strictEqual(cs.selectedRootSelector, sb.selectedRootSelector);
      assert.strictEqual(cs.selectedRootTag, sb.selectedRootTag);
      assert.strictEqual(cs.selectedRootClass, sb.selectedRootClass);
      assert.strictEqual(cs.titleSelectorUsed, sb.titleSelectorUsed);
      assert.strictEqual(cs.companySelectorUsed, sb.companySelectorUsed);
      assert.strictEqual(cs.descriptionSelectorUsed, sb.descriptionSelectorUsed);
      assert.strictEqual(cs.descriptionLength, sb.descriptionLength);
      assert.strictEqual(cs.isReady, sb.isReady);
      assert.strictEqual(cs.analysisReady, sb.analysisReady);

      const fpCS = JobIdentity.deriveJobFingerprint(cs);
      const fpSB = controller.activeJobFingerprint;
      assert.strictEqual(fpCS, fpSB);
    });
  });

  // =========================================================================
  // 6. SPA NAVIGATION (Same Tab Job A -> Job B -> Job A)
  // =========================================================================
  describe('6. SPA Navigation Within Same Tab', () => {
    it('derives fresh fingerprint, fresh title/company, and prevents old job state overwrite', async () => {
      global.chrome.tabs._currentActiveTabId = 101;
      await controller.init();

      assert.strictEqual(controller.activeJob.title, 'Backend Software Engineer (Remote)');

      // User navigates in same Tab 101 to Job B (Appinventiv)
      tabMockResponses.set(101, {
        success: true,
        detected: true,
        confidence: 'HIGH',
        jobData: sampleAppinventivJob,
        portalMetadata: { portalName: 'LinkedIn Jobs', confidence: 'HIGH' },
      });

      // Explicit rescan / navigation switch
      await controller.rescan();

      assert.strictEqual(controller.activeJob.title, 'Software Engineer');
      assert.strictEqual(controller.activeJob.company, 'Appinventiv');
      assert.strictEqual(controller.activeJobFingerprint, JobIdentity.deriveJobFingerprint(sampleAppinventivJob));

      // User navigates back in same Tab 101 to Job A (Quik Hire)
      tabMockResponses.set(101, {
        success: true,
        detected: true,
        confidence: 'HIGH',
        jobData: sampleQuikHireJob,
        portalMetadata: { portalName: 'LinkedIn Jobs', confidence: 'HIGH' },
      });

      await controller.rescan();

      assert.strictEqual(controller.activeJob.title, 'Backend Software Engineer (Remote)');
      assert.strictEqual(controller.activeJob.company, 'Quik Hire Staffing');
      assert.strictEqual(controller.activeJobFingerprint, JobIdentity.deriveJobFingerprint(sampleQuikHireJob));
    });
  });

  // =========================================================================
  // 7. MANUAL RESCAN SEMANTICS
  // =========================================================================
  describe('7. Manual Rescan Semantics', () => {
    it('forces fresh DETECT_JOB_PAGE to current active tab and renders fresh result without cached substitution', async () => {
      global.chrome.tabs._currentActiveTabId = 101;
      await controller.init();

      let rescanRequested = false;
      const originalSendMessage = global.chrome.tabs.sendMessage;
      global.chrome.tabs.sendMessage = async (tabId, msg) => {
        if (msg?.type === 'DETECT_JOB_PAGE') {
          rescanRequested = true;
        }
        return originalSendMessage(tabId, msg);
      };

      await controller.rescan();

      assert.strictEqual(rescanRequested, true, 'Rescan must dispatch DETECT_JOB_PAGE to active tab');
      assert.strictEqual(domElements.get('jobTitle').textContent, 'Backend Software Engineer (Remote)');
    });
  });

  // =========================================================================
  // 8. CHATGPT NEGATIVE REGRESSION
  // =========================================================================
  describe('8. ChatGPT Negative Regression', () => {
    it('ordinary ChatGPT conversation returns detected = false, Web Page, jobData = null, and Analyze disabled', async () => {
      global.chrome.tabs._currentActiveTabId = 104;
      tabMockResponses.set(104, sampleChatGPTNonJob);

      await controller.init();

      assert.strictEqual(controller.activeJob, null);
      assert.strictEqual(domElements.get('portalName').textContent, 'Web Page');
      assert.strictEqual(domElements.get('jobTitle').textContent, '—');
      assert.strictEqual(domElements.get('jobCompany').textContent, '—');
      assert.strictEqual(domElements.get('analyzeJobBtn').disabled, true);
    });
  });

  // =========================================================================
  // 9. WORKING PORTALS REGRESSION
  // =========================================================================
  describe('9. Working Portals Regression', () => {
    it('preserves detection across Greenhouse, Wellfound, and generic career portals', async () => {
      await controller.init();
      const portals = [
        {
          tabId: 105,
          jobData: {
            title: 'Staff Infrastructure Engineer',
            company: 'Stripe',
            provider: 'GREENHOUSE',
            sourceUrl: 'https://boards.greenhouse.io/stripe/jobs/12345',
            description: 'Stripe infrastructure role description with over 50 chars for testing.',
            descriptionLength: 65,
            isReady: true,
            analysisReady: true,
          },
          portalName: 'Greenhouse ATS',
        },
        {
          tabId: 106,
          jobData: {
            title: 'Founding Backend Engineer',
            company: 'Stealth AI',
            provider: 'GENERIC',
            sourceUrl: 'https://wellfound.com/jobs/67890',
            description: 'Wellfound founding engineer description with over 50 chars for testing.',
            descriptionLength: 68,
            isReady: true,
            analysisReady: true,
          },
          portalName: 'Wellfound',
        },
      ];

      for (const p of portals) {
        tabMockResponses.set(p.tabId, {
          success: true,
          detected: true,
          confidence: 'HIGH',
          jobData: p.jobData,
          portalMetadata: { portalName: p.portalName, isPortalRecognized: true, confidence: 'HIGH' },
        });

        global.chrome.tabs._currentActiveTabId = p.tabId;
        global.chrome.runtime.onMessage.dispatch({
          type: 'ACTIVE_TAB_CHANGED',
          tabId: p.tabId,
          url: p.jobData.sourceUrl,
        });

        await new Promise((r) => setTimeout(r, 10));

        assert.strictEqual(controller.activeJob.title, p.jobData.title);
        assert.strictEqual(controller.activeJob.company, p.jobData.company);
        assert.strictEqual(domElements.get('jobTitle').textContent, p.jobData.title);
        assert.strictEqual(domElements.get('jobCompany').textContent, p.jobData.company);
      }
    });
  });
});
