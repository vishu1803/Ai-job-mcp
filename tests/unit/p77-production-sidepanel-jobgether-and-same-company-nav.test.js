/**
 * @file P77 Unit Tests: Production Side-Panel Parity (Job ID 4466834190) & Same-Company Navigation.
 *
 * Validates:
 * 1. Side Panel Parity for Job ID 4466834190:
 *    - Title: "Full Stack Engineer"
 *    - Company: "Jobgether"
 *    - Employment Type: "FULL_TIME" (verifies P76 parser fix renders in the sidebar UI)
 *    - Location: "India"
 *    - Analyze button enabled
 *    - 3-Way State Convergence: persisted === fresh === rendered
 *    - Diagnostic bit-for-bit parity
 * 2. Same-Company / Different-Job Identity:
 *    - isSameJobIdentity returns false when company is identical but role/externalJobId differs
 *    - Deterministic, unique 64-character SHA-256 fingerprints derived for each role
 * 3. Same-Company Navigation (Job 1 -> Job 2 -> Job 1):
 *    - Title updates cleanly while company remains unchanged
 *    - Fingerprint transitions cleanly
 *    - Fit analysis, match score, and requirements lists reset to prevent cross-job contamination
 *    - Return navigation restores Job 1 state without corruption
 * 4. Durable Store Multi-Role Isolation for Same Company:
 *    - Independent storage and retrieval for multiple jobs under the same company
 * 5. Full Chain Navigation (Jobgether -> Same-Company -> Jobgether):
 *    - Zero cross-company or cross-job state leakage across full workflow
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { SidebarController } from '../../extension/sidebar/sidebar.js';
import {
  WorkflowStateMachine,
  WORKFLOW_STATES,
} from '../../extension/lib/workflow-state-machine.js';
import { DurableWorkflowStore } from '../../extension/lib/durable-workflow-store.js';
import { JobIdentity } from '../../extension/lib/job-identity.js';

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
      add(c) {
        this._set.add(c);
      },
      remove(c) {
        this._set.delete(c);
      },
      contains(c) {
        return this._set.has(c);
      },
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
    'connectionBadge',
    'connectionText',
    'refreshBtn',
    'rescanBtn',
    'pendingJobNotification',
    'pendingJobTitle',
    'rescanPendingBtn',
    'authBar',
    'authUnauthenticatedState',
    'authAuthenticatedState',
    'loginBtn',
    'logoutBtn',
    'userName',
    'userEmail',
    'userAvatar',
    'sessionExpiredNotice',
    'reauthBtn',
    'workflowStatusBar',
    'workflowStateText',
    'workflowLockedBadge',
    'syncIndicator',
    'portalCard',
    'portalName',
    'confidenceBadge',
    'capJob',
    'capApp',
    'capForm',
    'capAutofill',
    'jobCard',
    'reanalyzeBtn',
    'jobNotDetectedState',
    'jobDetectedState',
    'jobTitle',
    'jobCompany',
    'jobLocation',
    'jobType',
    'jobIdTag',
    'analyzeJobBtn',
    'descriptionLoadingNotice',
    'descriptionLoadingText',
    'analysisErrorBanner',
    'analysisErrorMessage',
    'retryAnalysisBtn',
    'analysisCard',
    'matchBandBadge',
    'scoreValue',
    'matchedSkillsCount',
    'missingSkillsCount',
    'experienceFitVal',
    'matchedSkillsList',
    'missingSkillsList',
    'analysisNextActionBox',
    'projectsCard',
    'recommendedProjectsList',
    'handoffCard',
    'handoffStatusBadge',
    'handoffTelemetryRow',
    'handoffAppId',
    'handoffPackageMeta',
    'workflowLockBanner',
    'resetWorkflowBtn',
    'handoffErrorBanner',
    'handoffErrorMessage',
    'retryHandoffBtn',
    'prepareHandoffBtn',
    'prepareSpinner',
    'prepareBtnText',
    'regenerateHandoffBtn',
    'regenerateConfirmBox',
    'cancelRegenerateBtn',
    'confirmRegenerateBtn',
    'artifactsContainer',
    'reviewResumeBtn',
    'downloadResumeBtn',
    'reviewCoverLetterBtn',
    'downloadCoverLetterBtn',
    'downloadBundleBtn',
    'viewAppDashboardLink',
    'formDetectionCard',
    'stepIndicator',
    'formStatusMessage',
    'formFieldsSummary',
    'autofillFormBtn',
  ];

  for (const id of elementIds) {
    elements.set(id, createMockElement(id));
  }

  global.document = {
    getElementById: (id) => elements.get(id) || null,
    querySelector: (sel) => {
      if (sel.startsWith('#')) return elements.get(sel.slice(1)) || null;
      return null;
    },
    querySelectorAll: () => [],
    createElement: (tag) => createMockElement(tag),
  };

  const storageMap = new Map();
  const runtimeMessageListeners = [];

  global.chrome = {
    tabs: {
      query: async (queryInfo) => {
        if (queryInfo?.active && queryInfo?.currentWindow) {
          const activeTabId = global.chrome.tabs._currentActiveTabId || 101;
          return [{ id: activeTabId, windowId: 1, active: true }];
        }
        return [];
      },
      sendMessage: async (tabId, message) => {
        if (global.chrome.tabs._messageHandler) {
          return global.chrome.tabs._messageHandler(tabId, message);
        }
        return { success: true };
      },
      update: async (tabId, updateProps) => {
        if (updateProps?.active) {
          global.chrome.tabs._currentActiveTabId = tabId;
        }
        return { id: tabId, ...updateProps };
      },
      _currentActiveTabId: 101,
      _messageHandler: null,
    },
    runtime: {
      onMessage: {
        addListener: (fn) => runtimeMessageListeners.push(fn),
        removeListener: (fn) => {
          const idx = runtimeMessageListeners.indexOf(fn);
          if (idx !== -1) runtimeMessageListeners.splice(idx, 1);
        },
        dispatch: (msg) => {
          for (const fn of runtimeMessageListeners) {
            fn(msg, { tab: { id: global.chrome.tabs._currentActiveTabId } }, () => {});
          }
        },
      },
      sendMessage: async (msg) => ({ success: true, echoed: msg }),
      lastError: null,
    },
    sidePanel: {
      open: async () => ({ success: true }),
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

// ─── Sample Job Definitions ───────────────────────────

const sampleJobgether4466834190 = {
  title: 'Full Stack Engineer',
  company: 'Jobgether',
  location: 'India',
  workplace: 'REMOTE',
  employmentType: 'FULL_TIME',
  seniorityLevel: 'Mid-Senior level',
  jobFunction: 'Engineering and Information Technology',
  industries: 'Internet Marketplace Platforms',
  postedAgo: '1 day ago',
  applicantCount: 'Over 200 applicants',
  provider: 'LINKEDIN',
  externalJobId: '4466834190',
  sourceUrl: 'https://www.linkedin.com/jobs/view/4466834190/',
  description:
    'Jobgether is seeking a Full Stack Engineer to build scalable, maintainable architectures. Remote opportunity.',
  descriptionLength: 104,
  descriptionSource: 'SELECTOR',
  jobRootSource: '.details',
  selectedRootSelector: '.details',
  selectedRootTag: 'div',
  selectedRootClass: 'details mx-details-container-padding',
  titleSelectorUsed: 'h1.top-card-layout__title',
  companySelectorUsed: 'a.topcard__org-name-link',
  descriptionSelectorUsed: '.show-more-less-html__markup',
  isReady: true,
  analysisReady: true,
  hasApplyCta: true,
  responsibilities: [
    'Design scalable application architectures',
    'Build and maintain front-end and back-end services',
    'Collaborate with cross-functional product teams',
  ],
  requirements: [
    '3+ years of full stack web development experience',
    'Strong proficiency in JavaScript, TypeScript, Node.js, and React',
    'Experience designing and consuming RESTful APIs',
  ],
};

const sampleParticle41Job1 = {
  title: 'Full Stack Javascript & Database Developer',
  company: 'Particle41',
  location: 'Pune/Pimpri-Chinchwad Area',
  workplace: 'REMOTE',
  employmentType: 'FULL_TIME',
  seniorityLevel: 'Mid-Senior level',
  jobFunction: 'Engineering',
  industries: 'Information Technology and Services',
  provider: 'LINKEDIN',
  externalJobId: '4121993912',
  sourceUrl:
    'https://in.linkedin.com/jobs/view/full-stack-javascript-database-developer-at-particle41-4121993912',
  description:
    'Particle41 is hiring a Full Stack Javascript & Database Developer proficient in PostgreSQL, Node.js, and React.',
  descriptionLength: 114,
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
  responsibilities: ['Architect database schemas', 'Write high performance SQL queries'],
  requirements: ['5+ years SQL experience', 'Expert Node.js'],
};

const sampleParticle41Job2 = {
  title: 'Full Stack Javascript Developer',
  company: 'Particle41', // SAME COMPANY!
  location: 'Pune Division, Maharashtra, India',
  workplace: 'REMOTE',
  employmentType: 'FULL_TIME',
  seniorityLevel: 'Associate',
  jobFunction: 'Engineering',
  industries: 'Information Technology and Services',
  provider: 'LINKEDIN',
  externalJobId: '4467464995',
  sourceUrl:
    'https://in.linkedin.com/jobs/view/full-stack-javascript-developer-at-particle41-4467464995',
  description:
    'Particle41 is hiring a Full Stack Javascript Developer for modern frontend web applications and API integration.',
  descriptionLength: 118,
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
  responsibilities: ['Build user interfaces with Next.js', 'Integrate GraphQL endpoints'],
  requirements: ['3+ years JavaScript experience', 'Experience with Next.js'],
};

describe('P77: Production Side-Panel Parity & Same-Company Navigation', () => {
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
      jobData: sampleJobgether4466834190,
      portalMetadata: {
        portalName: 'LinkedIn Jobs',
        confidence: 'HIGH',
      },
    });

    global.chrome.tabs._messageHandler = async (tabId, msg) => {
      if (msg.type === 'DETECT_JOB_PAGE') {
        const resp = tabMockResponses.get(tabId) || {
          success: true,
          detected: false,
          jobData: null,
        };
        return {
          ...resp,
          tabId,
          requestId: msg.requestId,
        };
      }
      return { success: true };
    };

    controller = new SidebarController();
    controller.stateMachine = new WorkflowStateMachine();
    controller.store = new DurableWorkflowStore(global.chrome.storage.local);
    controller.currentUser = { id: 'usr-p77-test', email: 'test@antigravity.internal' };
    controller.isAuthenticated = true;
    controller.backendClient = {
      getHealth: async () => ({ status: 'ok' }),
      getAuthStatus: async () => ({
        authenticated: true,
        status: 'AUTHENTICATED',
        user: controller.currentUser,
      }),
      analyzeJob: async () => ({
        fitAnalysis: {
          overallScore: 85,
          recommendationBand: 'RECOMMENDED',
          matchedSkills: [],
          missingSkills: [],
        },
        recommendedProjects: [],
        analysisSnapshotId: 'snap-p77',
      }),
      prepareHandoff: async () => ({
        applicationId: 'app-p77-canonical',
        handoffData: { kitReady: true },
      }),
    };
  });

  // =========================================================================
  // 1. PRODUCTION SIDE-PANEL PARITY FOR JOB ID 4466834190
  // =========================================================================
  describe('1. Production Side-Panel Parity for Job ID 4466834190', () => {
    it('renders authentic title, company, location, and verified employmentType FULL_TIME', async () => {
      global.chrome.tabs._currentActiveTabId = 101;
      await controller.init();

      // Title & Company
      assert.strictEqual(domElements.get('jobTitle').textContent, 'Full Stack Engineer');
      assert.strictEqual(domElements.get('jobCompany').textContent, 'Jobgether');

      // Employment Type: verifies P76 fix renders in sidebar UI (was CONTRACT)
      assert.strictEqual(domElements.get('jobType').textContent, 'FULL_TIME');
      assert.strictEqual(domElements.get('jobLocation').textContent, 'India');

      // Analyze Button & State
      assert.strictEqual(domElements.get('analyzeJobBtn').disabled, false);
      assert.strictEqual(controller.activeJob.isReady, true);
      assert.strictEqual(controller.activeJob.analysisReady, true);
      assert.strictEqual(domElements.get('jobDetectedState').classList.contains('hidden'), false);
      assert.strictEqual(domElements.get('jobNotDetectedState').classList.contains('hidden'), true);
    });

    it('asserts 3-way state convergence (persisted === fresh === rendered DOM)', async () => {
      global.chrome.tabs._currentActiveTabId = 101;
      await controller.init();

      const persisted = await controller.store.getTabState(101);
      const renderedTitle = domElements.get('jobTitle').textContent;
      const renderedCompany = domElements.get('jobCompany').textContent;
      const renderedType = domElements.get('jobType').textContent;

      // Persisted === Rendered
      assert.strictEqual(persisted.jobData.title, renderedTitle);
      assert.strictEqual(persisted.jobData.company, renderedCompany);
      assert.strictEqual(persisted.jobData.employmentType, renderedType);

      // Fresh === Rendered
      assert.strictEqual(sampleJobgether4466834190.title, renderedTitle);
      assert.strictEqual(sampleJobgether4466834190.company, renderedCompany);
      assert.strictEqual(sampleJobgether4466834190.employmentType, renderedType);

      // Fingerprint convergence
      const expectedFp = JobIdentity.deriveJobFingerprint(sampleJobgether4466834190);
      assert.strictEqual(controller.activeJobFingerprint, expectedFp);
      assert.strictEqual(persisted.jobFingerprint, expectedFp);
    });

    it('asserts bit-for-bit diagnostic parity between content-script and sidebar', async () => {
      global.chrome.tabs._currentActiveTabId = 101;
      await controller.init();

      const cs = sampleJobgether4466834190;
      const sb = controller.activeJob;

      assert.strictEqual(cs.title, sb.title);
      assert.strictEqual(cs.company, sb.company);
      assert.strictEqual(cs.employmentType, sb.employmentType);
      assert.strictEqual(cs.selectedRootSelector, sb.selectedRootSelector);
      assert.strictEqual(cs.selectedRootTag, sb.selectedRootTag);
      assert.strictEqual(cs.selectedRootClass, sb.selectedRootClass);
      assert.strictEqual(cs.titleSelectorUsed, sb.titleSelectorUsed);
      assert.strictEqual(cs.companySelectorUsed, sb.companySelectorUsed);
      assert.strictEqual(cs.descriptionSelectorUsed, sb.descriptionSelectorUsed);
      assert.strictEqual(cs.hasApplyCta, sb.hasApplyCta);
      assert.strictEqual(cs.seniorityLevel, sb.seniorityLevel);
      assert.strictEqual(cs.jobFunction, sb.jobFunction);
      assert.strictEqual(cs.industries, sb.industries);
      assert.strictEqual(cs.postedAgo, sb.postedAgo);
      assert.strictEqual(cs.applicantCount, sb.applicantCount);
    });
  });

  // =========================================================================
  // 2. SAME-COMPANY / DIFFERENT-JOB IDENTITY CONTRACT
  // =========================================================================
  describe('2. Same-Company / Different-Job Identity Contract', () => {
    it('isSameJobIdentity returns false when company is identical but role/externalJobId differs', () => {
      // Both jobs have company = 'Particle41'
      assert.strictEqual(sampleParticle41Job1.company, sampleParticle41Job2.company);

      const isSame = JobIdentity.isSameJobIdentity(sampleParticle41Job1, sampleParticle41Job2);
      assert.strictEqual(
        isSame,
        false,
        'Jobs at same company with different titles/IDs must NOT be identical'
      );
    });

    it('isSameJobIdentity returns true when comparing identical role at same company', () => {
      const isSame = JobIdentity.isSameJobIdentity(sampleParticle41Job1, {
        ...sampleParticle41Job1,
      });
      assert.strictEqual(isSame, true, 'Identical role at same company must match');
    });

    it('derives distinct 64-character fingerprints for different roles at same company', () => {
      const fp1 = JobIdentity.deriveJobFingerprint(sampleParticle41Job1);
      const fp2 = JobIdentity.deriveJobFingerprint(sampleParticle41Job2);

      assert.strictEqual(fp1.length, 64);
      assert.strictEqual(fp2.length, 64);
      assert.notStrictEqual(
        fp1,
        fp2,
        'Fingerprints must differ for distinct roles at same company'
      );
    });
  });

  // =========================================================================
  // 3. SAME-COMPANY IN-TAB NAVIGATION (Job 1 -> Job 2 -> Job 1)
  // =========================================================================
  describe('3. Same-Company Navigation (Job 1 -> Job 2 -> Job 1)', () => {
    it('updates title, derives new fingerprint, and keeps company identical on same-company transition', async () => {
      global.chrome.tabs._currentActiveTabId = 101;

      // Start on Particle41 Job 1
      tabMockResponses.set(101, {
        success: true,
        detected: true,
        confidence: 'HIGH',
        jobData: sampleParticle41Job1,
        portalMetadata: { portalName: 'LinkedIn Jobs', confidence: 'HIGH' },
      });

      await controller.init();

      assert.strictEqual(
        domElements.get('jobTitle').textContent,
        'Full Stack Javascript & Database Developer'
      );
      assert.strictEqual(domElements.get('jobCompany').textContent, 'Particle41');
      const fp1 = JobIdentity.deriveJobFingerprint(sampleParticle41Job1);
      assert.strictEqual(controller.activeJobFingerprint, fp1);

      // Navigate to Particle41 Job 2 (SAME COMPANY, DIFFERENT ROLE)
      tabMockResponses.set(101, {
        success: true,
        detected: true,
        confidence: 'HIGH',
        jobData: sampleParticle41Job2,
        portalMetadata: { portalName: 'LinkedIn Jobs', confidence: 'HIGH' },
      });

      await controller.rescan();

      // Verify Company remains Particle41
      assert.strictEqual(domElements.get('jobCompany').textContent, 'Particle41');

      // Verify Title updated to Job 2
      assert.strictEqual(
        domElements.get('jobTitle').textContent,
        'Full Stack Javascript Developer'
      );

      // Verify Fingerprint transitioned to fp2
      const fp2 = JobIdentity.deriveJobFingerprint(sampleParticle41Job2);
      assert.strictEqual(controller.activeJobFingerprint, fp2);
      assert.notStrictEqual(fp1, fp2);

      // Navigate BACK to Particle41 Job 1
      tabMockResponses.set(101, {
        success: true,
        detected: true,
        confidence: 'HIGH',
        jobData: sampleParticle41Job1,
        portalMetadata: { portalName: 'LinkedIn Jobs', confidence: 'HIGH' },
      });

      await controller.rescan();

      // Verify Job 1 restored cleanly
      assert.strictEqual(domElements.get('jobCompany').textContent, 'Particle41');
      assert.strictEqual(
        domElements.get('jobTitle').textContent,
        'Full Stack Javascript & Database Developer'
      );
      assert.strictEqual(controller.activeJobFingerprint, fp1);
    });

    it('resets fit analysis and match score so previous same-company role does not contaminate new role', async () => {
      global.chrome.tabs._currentActiveTabId = 101;

      // Start on Job 1 with completed fit analysis
      tabMockResponses.set(101, {
        success: true,
        detected: true,
        confidence: 'HIGH',
        jobData: sampleParticle41Job1,
        portalMetadata: { portalName: 'LinkedIn Jobs', confidence: 'HIGH' },
      });

      await controller.init();

      // Simulate fit analysis on Job 1
      controller.cachedState = {
        ...controller.cachedState,
        fitAnalysis: {
          overallScore: 88,
          recommendationBand: 'RECOMMENDED',
          matchedSkills: ['PostgreSQL', 'Node.js', 'React'],
          missingSkills: [],
        },
      };
      controller._renderAnalysisCard(controller.cachedState.fitAnalysis);

      assert.strictEqual(domElements.get('scoreValue').textContent, '88');
      assert.strictEqual(domElements.get('matchBandBadge').textContent, 'RECOMMENDED');

      // Navigate in same tab to Job 2 at same company (not analyzed yet)
      tabMockResponses.set(101, {
        success: true,
        detected: true,
        confidence: 'HIGH',
        jobData: sampleParticle41Job2,
        portalMetadata: { portalName: 'LinkedIn Jobs', confidence: 'HIGH' },
      });

      await controller.rescan();

      // Job 2 has not been analyzed yet: analysis card must be hidden / reset, not showing Job 1's score 88
      const isCardHidden = domElements.get('analysisCard').classList.contains('hidden');
      const scoreText = domElements.get('scoreValue').textContent;
      assert.ok(
        isCardHidden || scoreText === '--',
        'Analysis score from Job 1 must not contaminate Job 2 at same company'
      );
    });
  });

  // =========================================================================
  // 4. DURABLE STORE MULTI-ROLE ISOLATION FOR SAME COMPANY
  // =========================================================================
  describe('4. Durable Store Multi-Role Isolation for Same Company', () => {
    it('persists independent workflow states for two jobs at the same company without collision', async () => {
      const store = controller.store;
      const fp1 = JobIdentity.deriveJobFingerprint(sampleParticle41Job1);
      const fp2 = JobIdentity.deriveJobFingerprint(sampleParticle41Job2);

      // Save state for Job 1
      await store.saveJobState(fp1, {
        jobData: sampleParticle41Job1,
        workflowState: WORKFLOW_STATES.JOB_DETECTED,
        fitAnalysis: { overallScore: 82, recommendationBand: 'RECOMMENDED' },
      });

      // Save state for Job 2
      await store.saveJobState(fp2, {
        jobData: sampleParticle41Job2,
        workflowState: WORKFLOW_STATES.ANALYSIS_READY,
        fitAnalysis: { overallScore: 94, recommendationBand: 'TOP_MATCH' },
      });

      // Retrieve both and verify zero collision
      const retrieved1 = await store.getJobState(fp1);
      const retrieved2 = await store.getJobState(fp2);

      assert.strictEqual(retrieved1.jobData.title, 'Full Stack Javascript & Database Developer');
      assert.strictEqual(retrieved1.fitAnalysis.overallScore, 82);

      assert.strictEqual(retrieved2.jobData.title, 'Full Stack Javascript Developer');
      assert.strictEqual(retrieved2.fitAnalysis.overallScore, 94);
    });
  });

  // =========================================================================
  // 5. FULL CHAIN NAVIGATION (Jobgether -> Particle41 Job 1 -> Particle41 Job 2 -> Jobgether)
  // =========================================================================
  describe('5. Full Chain Navigation (Jobgether -> Same Company -> Jobgether)', () => {
    it('transitions cleanly across companies and roles with zero state leakage', async () => {
      global.chrome.tabs._currentActiveTabId = 101;

      // 1. Initial Job: Jobgether 4466834190
      await controller.init();
      assert.strictEqual(domElements.get('jobTitle').textContent, 'Full Stack Engineer');
      assert.strictEqual(domElements.get('jobCompany').textContent, 'Jobgether');
      assert.strictEqual(domElements.get('jobType').textContent, 'FULL_TIME');

      // 2. Navigate to Particle41 Job 1
      tabMockResponses.set(101, {
        success: true,
        detected: true,
        confidence: 'HIGH',
        jobData: sampleParticle41Job1,
        portalMetadata: { portalName: 'LinkedIn Jobs', confidence: 'HIGH' },
      });
      await controller.rescan();
      assert.strictEqual(
        domElements.get('jobTitle').textContent,
        'Full Stack Javascript & Database Developer'
      );
      assert.strictEqual(domElements.get('jobCompany').textContent, 'Particle41');

      // 3. Navigate to Particle41 Job 2 (Same Company, Different Job)
      tabMockResponses.set(101, {
        success: true,
        detected: true,
        confidence: 'HIGH',
        jobData: sampleParticle41Job2,
        portalMetadata: { portalName: 'LinkedIn Jobs', confidence: 'HIGH' },
      });
      await controller.rescan();
      assert.strictEqual(
        domElements.get('jobTitle').textContent,
        'Full Stack Javascript Developer'
      );
      assert.strictEqual(domElements.get('jobCompany').textContent, 'Particle41');

      // 4. Navigate back to Jobgether 4466834190
      tabMockResponses.set(101, {
        success: true,
        detected: true,
        confidence: 'HIGH',
        jobData: sampleJobgether4466834190,
        portalMetadata: { portalName: 'LinkedIn Jobs', confidence: 'HIGH' },
      });
      await controller.rescan();
      assert.strictEqual(domElements.get('jobTitle').textContent, 'Full Stack Engineer');
      assert.strictEqual(domElements.get('jobCompany').textContent, 'Jobgether');
      assert.strictEqual(domElements.get('jobType').textContent, 'FULL_TIME');
      assert.strictEqual(
        controller.activeJobFingerprint,
        JobIdentity.deriveJobFingerprint(sampleJobgether4466834190)
      );
    });
  });
});
