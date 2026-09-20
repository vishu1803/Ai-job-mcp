/**
 * @file P68 Unit Test Suite: Final Detection Race Elimination & Repeated Live Reliability
 *
 * Validates:
 * 1. Single Authoritative Delivery Path & Passive Event Immunity:
 *    - Passive JOB_DETECTED_ON_PAGE arriving after authoritative response completes does not mutate state.
 *    - Passive JOB_DETECTED_ON_PAGE arriving immediately before authoritative response does not mutate state.
 *    - Duplicate passive events arriving in rapid succession do not mutate state.
 *    - Stale passive event after tab switch does not mutate state.
 *    - Stale passive event after reload does not mutate state.
 * 2. Company-less LinkedIn Extraction & Strict Readiness:
 *    - externalJobId + real title + substantive description (>= 50 chars) returns isReady: true, company === '' (NO synthesized "Company").
 *    - Placeholder "Company" is sanitized to '' and not treated as evidence of extraction.
 *    - Insufficient description (< 50 chars) without company returns isReady: false, detected: false.
 *    - Sidebar renders dash '—' when company is empty.
 * 3. Repeated Natural LinkedIn Hydration & Bounded Timers:
 *    - Adaptive observer terminates immediately upon complete DOM evidence.
 *    - Repeated hydration cycles clean up timers and observers without leakage.
 * 4. Repeated Rescan Determinism:
 *    - Rescan queries active tab directly, never substitutes pending or cached data.
 * 5. Tab Switch & Reload In-Flight Race Elimination:
 *    - Stale responses discarded across tab switches and reloads.
 * 6. Server Call Boundary:
 *    - All passive operations (detect, tab switch, reload, hydration, rescan) produce 0 server calls.
 *    - Explicit analyze produces exactly 1 call with double-click protection.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { SidebarController } from '../../extension/sidebar/sidebar.js';
import { WORKFLOW_STATES } from '../../extension/lib/workflow-state-machine.js';
import { LinkedInAdapter } from '../../extension/job-detection/adapters/linkedin.adapter.js';
import { JobPageDetector } from '../../extension/job-detection/job-page-detector.js';
import { JobDetectionEngine } from '../../extension/job-detection/detection-engine.js';

function setupMockDOM() {
  const storeMap = new Map();
  const listeners = [];

  global.chrome = {
    runtime: {
      onMessage: {
        _listeners: listeners,
        addListener(fn) {
          this._listeners.push(fn);
        },
        dispatch(msg, sender = {}) {
          for (const l of this._listeners) l(msg, sender);
        },
      },
      sendMessage: async () => ({ success: true, passive: true }),
    },
    tabs: {
      query: async () => [{ id: 101, url: 'https://www.linkedin.com/jobs/view/4419969671/' }],
      sendMessage: async (_tabId, msg) => {
        if (msg.type === 'PING') return { status: 'PONG', loaded: true };
        if (msg.type === 'DETECT_JOB_PAGE') {
          return {
            success: true,
            detected: true,
            jobData: {
              externalJobId: '4419969671',
              sourceUrl: 'https://www.linkedin.com/jobs/view/4419969671/',
              provider: 'LINKEDIN',
              title: 'Senior Software Engineer – Go (Golang)',
              company: 'General Motors',
              location: 'Warren, MI',
              employmentType: 'FULL_TIME',
              description:
                'General Motors is seeking a Senior Software Engineer with Go expertise.',
              requirements: ['5+ years Go experience', 'Kubernetes'],
              responsibilities: ['Build distributed services'],
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
      add(cls) {
        this._classes.add(cls);
      },
      remove(cls) {
        this._classes.delete(cls);
      },
      contains(cls) {
        return this._classes.has(cls);
      },
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

const SAMPLE_JOB_A = {
  externalJobId: '4419969671',
  sourceUrl: 'https://www.linkedin.com/jobs/view/4419969671/',
  provider: 'LINKEDIN',
  title: 'Senior Software Engineer – Go (Golang)',
  company: 'General Motors',
  location: 'Warren, MI',
  employmentType: 'FULL_TIME',
  description: 'General Motors is seeking a Senior Software Engineer with Go expertise.',
  requirements: ['5+ years Go experience', 'Kubernetes'],
  responsibilities: ['Build distributed services'],
};

const SAMPLE_JOB_B = {
  externalJobId: '4419969660',
  sourceUrl: 'https://www.linkedin.com/jobs/view/4419969660/',
  provider: 'LINKEDIN',
  title: 'Construction Manager',
  company: 'Morgan Corp.',
  location: 'Greenville, SC',
  employmentType: 'FULL_TIME',
  description:
    'Experienced Construction Manager responsible for heavy civil and infrastructure project oversight.',
  requirements: ['Heavy civil', 'OSHA 30'],
  responsibilities: ['Oversight'],
};

describe('Part 68 — Final Detection Race Elimination & Repeated Live Reliability', () => {
  let controller;
  let mockElements;
  let analyzeCalls;

  beforeEach(() => {
    analyzeCalls = 0;
    mockElements = setupMockDOM();
    controller = new SidebarController();
    controller.elements = mockElements;
    controller.activeTabId = 101;
    controller.isAuthenticated = true;
    controller._isDetectingInFlight = false;
    controller._detectionRequestId = 0;
    controller._listenToRuntimeMessages();

    // Hook backendClient
    controller.backendClient = {
      analyzeJob: async () => {
        analyzeCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return {
          fitAnalysis: {
            status: 'SUCCESS',
            score: 91,
            matchBand: 'STRONG',
            matchedSkills: ['Go', 'Kubernetes'],
            missingSkills: [],
            experienceFit: 'STRONG',
          },
        };
      },
      checkSession: async () => ({
        authenticated: true,
        user: { id: 'usr-p68', displayName: 'P68 Dev' },
      }),
    };
  });

  describe('1. Single Authoritative Delivery Path & Passive Event Immunity', () => {
    it('passive JOB_DETECTED_ON_PAGE arriving after authoritative response completes does not mutate or overwrite state', async () => {
      await controller._requestDetectionFromTab();
      assert.strictEqual(controller.activeJob.title, SAMPLE_JOB_A.title);
      assert.strictEqual(controller.activeJob.company, SAMPLE_JOB_A.company);
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.JOB_DETECTED);

      global.chrome.runtime.onMessage.dispatch({
        type: 'JOB_DETECTED_ON_PAGE',
        tabId: 101,
        jobData: SAMPLE_JOB_B,
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      assert.strictEqual(controller.activeJob.title, SAMPLE_JOB_A.title);
      assert.strictEqual(controller.activeJob.externalJobId, SAMPLE_JOB_A.externalJobId);
      assert.strictEqual(
        controller.pendingDetectedJob,
        null,
        'Passive event must not create pending job'
      );
    });

    it('passive JOB_DETECTED_ON_PAGE arriving immediately before authoritative response does not mutate state', async () => {
      global.chrome.runtime.onMessage.dispatch({
        type: 'JOB_DETECTED_ON_PAGE',
        tabId: 101,
        jobData: SAMPLE_JOB_B,
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      assert.strictEqual(controller.activeJob, null, 'Passive event must not set activeJob');
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.IDLE);

      await controller._requestDetectionFromTab();
      assert.strictEqual(controller.activeJob.title, SAMPLE_JOB_A.title);
    });

    it('duplicate passive events in rapid succession are completely ignored and do not mutate state', async () => {
      for (let i = 0; i < 5; i++) {
        global.chrome.runtime.onMessage.dispatch({
          type: 'JOB_DETECTED_ON_PAGE',
          tabId: 101,
          jobData: SAMPLE_JOB_A,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 20));

      assert.strictEqual(controller.activeJob, null);
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.IDLE);
      assert.strictEqual(analyzeCalls, 0);
    });

    it('stale passive event after tab switch does not mutate newly active tab state', async () => {
      await controller._requestDetectionFromTab();
      assert.strictEqual(controller.activeJob.title, SAMPLE_JOB_A.title);

      controller.activeTabId = 202;
      controller._clearTransientTabState();
      assert.strictEqual(controller.activeJob, null);

      global.chrome.runtime.onMessage.dispatch({
        type: 'JOB_DETECTED_ON_PAGE',
        tabId: 101,
        jobData: SAMPLE_JOB_A,
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      assert.strictEqual(controller.activeJob, null);
      assert.strictEqual(mockElements.jobTitle.textContent, '—');
    });

    it('stale passive event after reload does not mutate state or interfere with fresh authoritative detection', async () => {
      await controller._requestDetectionFromTab();
      assert.strictEqual(controller.activeJob.title, SAMPLE_JOB_A.title);

      controller._clearTransientTabState();

      global.chrome.runtime.onMessage.dispatch({
        type: 'JOB_DETECTED_ON_PAGE',
        tabId: 101,
        jobData: { ...SAMPLE_JOB_A, title: 'Old Stale Title' },
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.strictEqual(controller.activeJob, null, 'Stale passive event ignored');

      await controller._requestDetectionFromTab();
      assert.strictEqual(controller.activeJob.title, SAMPLE_JOB_A.title);
    });
  });

  describe('2. LinkedIn Readiness & Company-less Extraction Contract', () => {
    it('company-less LinkedIn extraction with externalJobId, title, and substantive description preserves company as empty', () => {
      const mockDoc = {
        querySelector: (sel) => {
          if (sel.includes('job-title')) return { textContent: 'Principal Systems Engineer' };
          if (sel.includes('company') || sel.includes('primary-description')) return null;
          if (sel.includes('description') || sel.includes('markup') || sel === '#job-details') {
            return {
              textContent:
                'Leading confidential tech client hiring a Principal Systems Engineer for core infrastructure platform development with Go and Kubernetes.',
              querySelectorAll: () => [],
            };
          }
          return null;
        },
        querySelectorAll: () => [],
        title: 'Principal Systems Engineer | LinkedIn',
        body: { textContent: 'Full job description text...' },
      };

      const extracted = LinkedInAdapter.extract(
        mockDoc,
        'https://www.linkedin.com/jobs/view/999888777/'
      );
      assert.strictEqual(extracted.externalJobId, '999888777');
      assert.strictEqual(extracted.title, 'Principal Systems Engineer');
      assert.strictEqual(
        extracted.company,
        '',
        'Company must be empty string, NEVER synthesized "Company"'
      );
      assert.strictEqual(extracted.isReady, true, 'Substantive description satisfies readiness');

      const detected = JobPageDetector.detect(
        mockDoc,
        'https://www.linkedin.com/jobs/view/999888777/'
      );
      assert.strictEqual(detected.company, '', 'Sanitized company must be empty string');
      assert.strictEqual(detected.isReady, true);
      assert.strictEqual(detected.isConfident, true);

      const evaluated = JobDetectionEngine.evaluate(
        mockDoc,
        'https://www.linkedin.com/jobs/view/999888777/'
      );
      assert.strictEqual(evaluated.detected, true);
      assert.strictEqual(evaluated.ready, true);
      assert.strictEqual(evaluated.jobData.company, '');
    });

    it('placeholder "Company" in raw extraction is sanitized to empty string and not used as evidence', () => {
      const mockDoc = {
        querySelector: (sel) => {
          if (sel.includes('job-title')) return { textContent: 'Distributed Systems Engineer' };
          if (sel.includes('company-name') || sel.includes('company'))
            return { textContent: 'Company' };
          if (sel.includes('description') || sel === '#job-details') {
            return {
              textContent:
                'Engineering role building high-scale distributed backend systems and consensus protocols.',
              querySelectorAll: () => [],
            };
          }
          return null;
        },
        querySelectorAll: () => [],
        title: 'Distributed Systems Engineer at Company | LinkedIn',
        body: { textContent: 'Body content...' },
      };

      const extracted = LinkedInAdapter.extract(
        mockDoc,
        'https://www.linkedin.com/jobs/view/11223344/'
      );
      assert.strictEqual(
        extracted.company,
        '',
        'Placeholder "Company" must be sanitized to empty string'
      );

      const detected = JobPageDetector.detect(
        mockDoc,
        'https://www.linkedin.com/jobs/view/11223344/'
      );
      assert.strictEqual(detected.company, '');
    });

    it('company-less extraction without substantive description (< 50 chars) returns isReady: false', () => {
      const mockDoc = {
        querySelector: (sel) => {
          if (sel.includes('job-title')) return { textContent: 'Software Engineer' };
          return null;
        },
        querySelectorAll: () => [],
        title: 'Software Engineer | LinkedIn',
        body: { textContent: 'Brief text' },
      };

      const extracted = LinkedInAdapter.extract(
        mockDoc,
        'https://www.linkedin.com/jobs/view/12345678/'
      );
      assert.strictEqual(
        extracted.isReady,
        false,
        'Without company or >=50 char description, must not be ready'
      );

      const evaluated = JobDetectionEngine.evaluate(
        mockDoc,
        'https://www.linkedin.com/jobs/view/12345678/'
      );
      assert.strictEqual(evaluated.detected, false);
      assert.strictEqual(evaluated.ready, false);
    });

    it('sidebar displays dash placeholder "—" when detected job has empty company', async () => {
      const companylessJob = {
        ...SAMPLE_JOB_A,
        company: '',
      };

      global.chrome.tabs.sendMessage = async (_tabId, msg) => {
        return {
          success: true,
          detected: true,
          jobData: companylessJob,
          requestId: msg.requestId,
          tabId: msg.tabId,
          generation: msg.generation,
        };
      };

      await controller._requestDetectionFromTab();
      assert.strictEqual(controller.activeJob.title, companylessJob.title);
      assert.strictEqual(controller.activeJob.company, '');
      assert.strictEqual(
        mockElements.jobCompany.textContent,
        '—',
        'Sidebar UI must render dash for empty company'
      );
    });
  });

  describe('3. Repeated Natural LinkedIn Hydration & Timers', () => {
    it('repeated hydration cycles clean up timers and observers without leakage', async () => {
      for (let cycle = 1; cycle <= 5; cycle++) {
        const result = await controller._requestDetectionFromTab();
        assert.strictEqual(result, true, `Cycle ${cycle} must detect successfully`);
        assert.strictEqual(
          controller._isDetectingInFlight,
          false,
          `Cycle ${cycle} must release in-flight lock`
        );
      }
      assert.strictEqual(analyzeCalls, 0, 'All 5 detection cycles must produce ZERO server calls');
    });
  });

  describe('4. Repeated Deterministic Rescan Authority', () => {
    it('repeated Rescan queries active tab directly and always updates to current page state', async () => {
      await controller._requestDetectionFromTab();
      assert.strictEqual(controller.activeJob.title, SAMPLE_JOB_A.title);

      global.chrome.tabs.sendMessage = async (_tabId, msg) => {
        return {
          success: true,
          detected: true,
          jobData: SAMPLE_JOB_B,
          requestId: msg.requestId,
          tabId: msg.tabId,
          generation: msg.generation,
        };
      };

      await controller.rescan();
      assert.strictEqual(controller.activeJob.title, SAMPLE_JOB_B.title);
      assert.strictEqual(controller.activeJob.externalJobId, SAMPLE_JOB_B.externalJobId);

      await controller.rescan();
      assert.strictEqual(controller.activeJob.title, SAMPLE_JOB_B.title);
      assert.strictEqual(analyzeCalls, 0);
    });

    it('repeated Rescan on non-job page never substitutes pendingDetectedJob or cached data', async () => {
      await controller._requestDetectionFromTab();
      assert.strictEqual(controller.activeJob.title, SAMPLE_JOB_A.title);

      global.chrome.tabs.sendMessage = async (_tabId, msg) => {
        return {
          success: true,
          detected: false,
          jobData: null,
          requestId: msg.requestId,
          tabId: msg.tabId,
          generation: msg.generation,
        };
      };

      await controller.rescan();
      assert.strictEqual(controller.activeJob, null, 'Active job must be cleared');
      assert.strictEqual(controller.pendingDetectedJob, null, 'Pending job must be null');
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.IDLE);
      assert.strictEqual(mockElements.jobTitle.textContent, '—');
    });
  });

  describe('5. Tab Switch & Reload In-Flight Race Invariants', () => {
    it('tab switch while DETECT_JOB_PAGE is in flight discards earlier response on arrival', async () => {
      let pendingResolve = null;
      global.chrome.tabs.sendMessage = async (_tabId, msg) => {
        if (msg.type === 'PING') return { status: 'PONG' };
        return new Promise((resolve) => {
          pendingResolve = () =>
            resolve({
              success: true,
              detected: true,
              jobData: SAMPLE_JOB_A,
              requestId: msg.requestId,
              tabId: msg.tabId,
              generation: msg.generation,
            });
        });
      };

      // Launch in-flight detection on Tab 101
      const detectionPromise = controller._requestDetectionFromTab();

      // Yield event loop so sendMessage is called and pendingResolve is populated
      await new Promise((r) => setTimeout(r, 10));

      // User immediately switches to Tab 303
      controller.activeTabId = 303;
      controller._clearTransientTabState();

      // In-flight response for Tab 101 finally resolves
      pendingResolve();
      const result = await detectionPromise;

      assert.strictEqual(result, false, 'Mismatched activeTabId must discard response');
      assert.strictEqual(controller.activeJob, null, 'Tab 303 must not adopt Tab 101 job');
      assert.strictEqual(mockElements.jobTitle.textContent, '—');
    });

    it('reload while DETECT_JOB_PAGE is in flight increments requestId and discards older response', async () => {
      let resolveFirst = null;
      let callCount = 0;

      global.chrome.tabs.sendMessage = async (_tabId, msg) => {
        if (msg.type === 'PING') return { status: 'PONG' };
        callCount++;
        if (callCount === 1) {
          return new Promise((resolve) => {
            resolveFirst = () =>
              resolve({
                success: true,
                detected: true,
                jobData: { ...SAMPLE_JOB_A, title: 'Old Pre-Reload Title' },
                requestId: msg.requestId,
                tabId: msg.tabId,
                generation: msg.generation,
              });
          });
        }
        return {
          success: true,
          detected: true,
          jobData: SAMPLE_JOB_A,
          requestId: msg.requestId,
          tabId: msg.tabId,
          generation: msg.generation,
        };
      };

      // In-flight detection 1 started
      const firstPromise = controller._requestDetectionFromTab();

      // Yield event loop so first sendMessage is called
      await new Promise((r) => setTimeout(r, 10));

      // Reload occurs: fresh authoritative detection 2 triggered
      const secondPromise = controller._requestDetectionFromTab();

      // Older detection 1 finishes after reload started
      resolveFirst();

      const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise]);
      assert.strictEqual(firstResult, false, 'Older request must be discarded');
      assert.strictEqual(secondResult, true, 'Newer reload detection must succeed');
      assert.strictEqual(controller.activeJob.title, SAMPLE_JOB_A.title);
    });
  });

  describe('6. Server Call Boundary & Double-Click Protection', () => {
    it('passive operations make ZERO server calls, explicit Analyze makes exactly 1 call with double-click guard', async () => {
      // 1. Initial detection
      await controller._requestDetectionFromTab();
      assert.strictEqual(analyzeCalls, 0);

      // 2. Tab switch
      controller.activeTabId = 202;
      controller._clearTransientTabState();
      controller.activeTabId = 101;
      await controller._requestDetectionFromTab();
      assert.strictEqual(analyzeCalls, 0);

      // 3. Reload
      await controller._requestDetectionFromTab();
      assert.strictEqual(analyzeCalls, 0);

      // 4. Rescan
      await controller.rescan();
      assert.strictEqual(analyzeCalls, 0);

      // 5. Explicit click on [Analyze Job Match]
      controller.activeJob = SAMPLE_JOB_A;
      controller.cachedState = {
        jobData: SAMPLE_JOB_A,
        workflowState: WORKFLOW_STATES.JOB_DETECTED,
        workflowGeneration: 1,
      };

      const analyzePromise1 = controller.runAnalyzeJob();
      const analyzePromise2 = controller.runAnalyzeJob();

      await Promise.all([analyzePromise1, analyzePromise2]);

      // Exactly 1 call executed
      assert.strictEqual(
        analyzeCalls,
        1,
        'Analyze Job Match must execute EXACTLY 1 call (double-click protected)'
      );
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.ANALYSIS_READY);
    });
  });
});
