/**
 * @file P65 Unit Tests: Deterministic Tab/Reload Detection & LinkedIn Delivery Fix
 *
 * Validates:
 * 1. Single Source of Current Page Detection (content script owns detection, background forwards, sidebar reconciles).
 * 2. Tab Switch Reconciles Real Page (clears prior tab transients, hydrates target, requests fresh detection).
 * 3. Page Reload Reconciles Real Page (TAB_UPDATED triggers fresh detection without timing luck).
 * 4. Manual Rescan is Deterministic (ensures script, requests DETECT_JOB_PAGE, handles job vs no-job, 0 analyze calls).
 * 5. LinkedIn Delivery Fix (canonical /jobs/view/, currentJobId, resilient selectors, non-job rejection).
 * 6. Strict Server Boundary (0 calls on passive/switch/reload/rescan, exactly 1 call on Analyze, double-click protection).
 * 7. Race Condition Protection (Tab A -> Tab B in flight discards Tab A; generation counter protects against stale responses).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { LinkedInAdapter } from '../../extension/job-detection/adapters/linkedin.adapter.js';
import { JobDetectionEngine } from '../../extension/job-detection/detection-engine.js';
import { JobIdentity } from '../../extension/lib/job-identity.js';
import { DurableWorkflowStore } from '../../extension/lib/durable-workflow-store.js';
import { WorkflowStateMachine, WORKFLOW_STATES } from '../../extension/lib/workflow-state-machine.js';
import { SidebarController } from '../../extension/sidebar/sidebar.js';

function createMockDocument({
  elements = {},
  meta = {},
  scripts = [],
  bodyText = '',
} = {}) {
  const doc = {
    body: { textContent: bodyText },
    querySelector(selector) {
      if (elements[selector]) return elements[selector];
      if (selector.includes(',')) {
        for (const sub of selector.split(',')) {
          const res = this.querySelector(sub.trim());
          if (res) return res;
        }
      }
      const cleanSelector = selector.replace(/\s+i\]/g, ']');
      if (elements[cleanSelector]) return elements[cleanSelector];
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
        return scripts.map((s) => ({
          textContent: typeof s === 'string' ? s : JSON.stringify(s),
        }));
      }
      if (selector.includes(',')) {
        const res = [];
        for (const sub of selector.split(',')) {
          res.push(...this.querySelectorAll(sub.trim()));
        }
        return res;
      }
      if (elements[selector]) {
        return Array.isArray(elements[selector]) ? elements[selector] : [elements[selector]];
      }
      const cleanSelector = selector.replace(/\s+i\]/g, ']');
      if (elements[cleanSelector]) {
        return Array.isArray(elements[cleanSelector]) ? elements[cleanSelector] : [elements[cleanSelector]];
      }
      return [];
    },
  };
  doc.body.querySelectorAll = (sel) => doc.querySelectorAll(sel);
  return doc;
}

describe('Part 65 — Deterministic Tab/Reload Detection & LinkedIn Delivery Fix', () => {
  let controller;
  let mockStore;
  let mockBackendClient;
  let analyzeCalls = 0;
  let chromeRuntimeListeners = [];
  let sentMessages = [];
  let tabMessageHandlers = new Map();

  beforeEach(() => {
    analyzeCalls = 0;
    chromeRuntimeListeners = [];
    sentMessages = [];
    tabMessageHandlers = new Map();

    global.chrome = {
      runtime: {
        onMessage: {
          addListener(fn) {
            chromeRuntimeListeners.push(fn);
          },
          dispatch(msg, sender = {}) {
            for (const l of chromeRuntimeListeners) l(msg, sender);
          },
        },
        sendMessage: async (msg) => {
          sentMessages.push(msg);
          return { success: true };
        },
      },
      tabs: {
        query: async () => [{ id: 101, url: 'https://www.linkedin.com/jobs/view/1001' }],
        sendMessage: async (tabId, msg) => {
          const handler = tabMessageHandlers.get(tabId);
          if (handler) {
            return await handler(msg);
          }
          return { success: true, detected: false, jobData: null };
        },
      },
      storage: {
        local: {
          _map: new Map(),
          get: async (key) => {
            if (typeof key === 'string') return { [key]: global.chrome.storage.local._map.get(key) };
            return Object.fromEntries(global.chrome.storage.local._map.entries());
          },
          set: async (items) => {
            for (const [k, v] of Object.entries(items)) {
              global.chrome.storage.local._map.set(k, v);
            }
          },
          remove: async (key) => {
            global.chrome.storage.local._map.delete(key);
          },
        },
      },
    };

    mockBackendClient = {
      getHealth: async () => ({ status: 'ok' }),
      getAuthStatus: async () => ({
        authenticated: true,
        status: 'AUTHENTICATED',
        user: { id: 'usr-123', email: 'test@example.com' },
      }),
      analyzeJob: async () => {
        analyzeCalls++;
        return {
          fitScore: 85,
          recommendedProjects: [{ id: 'p1', name: 'Scale Pipeline' }],
          analysisSnapshotId: 'snap-123',
        };
      },
    };

    mockStore = new DurableWorkflowStore();
    controller = new SidebarController();
    controller.backendClient = mockBackendClient;
    controller.store = mockStore;
    controller.stateMachine = new WorkflowStateMachine();
    controller.activeTabId = 101;
    controller.isAuthenticated = true;
    controller.currentUser = { id: 'usr-123', email: 'test@example.com' };

    controller.elements = {
      workflowStateText: { textContent: '' },
      workflowLockedBadge: { classList: { add() {}, remove() {} } },
      workflowLockBanner: { classList: { add() {}, remove() {} } },
      portalName: { textContent: '' },
      jobTitle: { textContent: '' },
      jobCompany: { textContent: '' },
      jobNotDetectedState: { classList: { add() {}, remove() {}, contains: () => false } },
      jobDetectedState: { classList: { add() {}, remove() {}, contains: () => true } },
      analysisCard: { classList: { add() {}, remove() {} } },
      projectsCard: { classList: { add() {}, remove() {} } },
      handoffCard: { classList: { add() {}, remove() {} } },
      pendingJobNotification: {
        _hidden: true,
        classList: {
          add(c) { if (c === 'hidden') controller.elements.pendingJobNotification._hidden = true; },
          remove(c) { if (c === 'hidden') controller.elements.pendingJobNotification._hidden = false; },
          contains(c) { return c === 'hidden' ? controller.elements.pendingJobNotification._hidden : false; },
        },
      },
      pendingJobTitle: { textContent: '' },
      analyzeJobBtn: { disabled: false, textContent: 'Analyze Job Match' },
      prepareHandoffBtn: { disabled: false },
      prepareBtnText: { textContent: '' },
    };

    controller._listenToRuntimeMessages();
  });

  describe('1. Single Source of Current Page Detection', () => {
    it('content script detection event updates active job when workflow is empty', async () => {
      const job = {
        title: 'Staff Platform Engineer',
        company: 'Apex Systems',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1001',
      };

      await controller._reconcileDetectedJob(job);

      assert.strictEqual(controller.activeJob.title, 'Staff Platform Engineer');
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.JOB_DETECTED);
      assert.strictEqual(analyzeCalls, 0, 'Must not trigger analyze-job');
    });

    it('same job detection is idempotent and does not thrash state', async () => {
      const job = {
        title: 'Staff Platform Engineer',
        company: 'Apex Systems',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1001',
      };

      await controller._handleJobDetectedEvent(job);
      const fp1 = controller.activeJobFingerprint;

      // Reconcile identical job detection
      await controller._reconcileDetectedJob(job);

      assert.strictEqual(controller.activeJobFingerprint, fp1);
      assert.strictEqual(controller.pendingDetectedJob, null);
      assert.strictEqual(analyzeCalls, 0);
    });

    it('different job detected while active job exists preserves active and sets pending', async () => {
      const jobA = {
        title: 'Senior Backend Engineer',
        company: 'Alpha Corp',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1001',
      };
      const jobB = {
        title: 'Lead Architect',
        company: 'Beta Inc',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1002',
      };

      await controller._handleJobDetectedEvent(jobA);
      assert.strictEqual(controller.activeJob.title, jobA.title);

      // Job B detected on page
      await controller._reconcileDetectedJob(jobB);

      assert.strictEqual(controller.activeJob.title, jobA.title, 'Active job must be preserved');
      assert.strictEqual(controller.pendingDetectedJob.title, jobB.title, 'Job B must be stored as pending');
      assert.strictEqual(controller.elements.pendingJobNotification.classList.contains('hidden'), false);
      assert.strictEqual(analyzeCalls, 0, 'No analyze call on pending detection');
    });
  });

  describe('2. Tab Switch Reconciles Real Page', () => {
    it('switching tabs clears prior tab transient state and hydrates target tab state', async () => {
      // Tab 101 has Job A
      const jobA = {
        title: 'Job A - Backend Engineer',
        company: 'Alpha Corp',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1001',
      };
      await controller._handleJobDetectedEvent(jobA);
      assert.strictEqual(controller.activeJob.title, jobA.title);

      // Tab 102 has Job B in store
      const jobB = {
        title: 'Job B - Frontend Architect',
        company: 'Beta Inc',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1002',
      };
      const stateTab102 = mockStore.createInitialState(102);
      stateTab102.jobData = jobB;
      stateTab102.jobFingerprint = JobIdentity.deriveJobFingerprint(jobB);
      stateTab102.workflowState = WORKFLOW_STATES.JOB_DETECTED;
      await mockStore.saveTabState(102, stateTab102);

      // Setup tab 102 response
      tabMessageHandlers.set(102, async (msg) => {
        if (msg.type === 'DETECT_JOB_PAGE') {
          return { success: true, detected: true, jobData: jobB };
        }
        return { success: true };
      });

      // Switch to Tab 102
      global.chrome.runtime.onMessage.dispatch({
        type: 'ACTIVE_TAB_CHANGED',
        tabId: 102,
      });

      // Allow async hydration
      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.strictEqual(controller.activeTabId, 102);
      assert.strictEqual(controller.activeJob.title, jobB.title);
      assert.strictEqual(controller.pendingDetectedJob, null);
      assert.strictEqual(analyzeCalls, 0);
    });

    it('switching to non-job tab renders empty job state when unlocked', async () => {
      const jobA = {
        title: 'Job A - Backend Engineer',
        company: 'Alpha Corp',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1001',
      };
      await controller._handleJobDetectedEvent(jobA);

      // Tab 103 is a non-job page (e.g. ChatGPT or feed)
      tabMessageHandlers.set(103, async (msg) => {
        if (msg.type === 'DETECT_JOB_PAGE') {
          return { success: true, detected: false, jobData: null };
        }
        return { success: true };
      });

      global.chrome.runtime.onMessage.dispatch({
        type: 'ACTIVE_TAB_CHANGED',
        tabId: 103,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.strictEqual(controller.activeTabId, 103);
      assert.strictEqual(controller.activeJob, null);
      assert.strictEqual(analyzeCalls, 0);
    });
  });

  describe('3. Page Reload Reconciles Real Page', () => {
    it('TAB_UPDATED event triggers fresh page detection on the active tab', async () => {
      const refreshedJob = {
        title: 'Staff Distributed Systems Engineer',
        company: 'InfraScale Corp',
        sourceUrl: 'https://www.linkedin.com/jobs/view/2001',
      };

      tabMessageHandlers.set(101, async (msg) => {
        if (msg.type === 'DETECT_JOB_PAGE') {
          return { success: true, detected: true, jobData: refreshedJob };
        }
        return { success: true };
      });

      // Page reload completes
      global.chrome.runtime.onMessage.dispatch({
        type: 'TAB_UPDATED',
        tabId: 101,
        status: 'complete',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.strictEqual(controller.activeJob.title, refreshedJob.title);
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.JOB_DETECTED);
      assert.strictEqual(analyzeCalls, 0, 'Page reload must never trigger analyze');
    });
  });

  describe('4. Manual Rescan is Deterministic', () => {
    it('manual rescan calls ENSURE_CONTENT_SCRIPT and reconciles job immediately', async () => {
      const newJobOnPage = {
        title: 'Principal AI Engineer',
        company: 'Neural Labs',
        sourceUrl: 'https://www.linkedin.com/jobs/view/3001',
      };

      tabMessageHandlers.set(101, async (msg) => {
        if (msg.type === 'DETECT_JOB_PAGE') {
          return { success: true, detected: true, jobData: newJobOnPage };
        }
        return { success: true };
      });

      await controller.rescan();

      assert.strictEqual(controller.activeJob.title, newJobOnPage.title);
      assert.strictEqual(controller.pendingDetectedJob, null);
      assert.strictEqual(analyzeCalls, 0, 'Rescan must generate 0 analyze calls');

      const ensureScriptMsg = sentMessages.find((m) => m.type === 'ENSURE_CONTENT_SCRIPT');
      assert.ok(ensureScriptMsg, 'Rescan must call ENSURE_CONTENT_SCRIPT');
    });

    it('manual rescan on non-job page explicitly clears unlocked job and renders empty state', async () => {
      const initialJob = {
        title: 'Temporary Role',
        company: 'Temp Corp',
        sourceUrl: 'https://www.linkedin.com/jobs/view/9999',
      };
      await controller._handleJobDetectedEvent(initialJob);
      assert.strictEqual(controller.activeJob.title, initialJob.title);

      // Tab is now on a non-job page
      tabMessageHandlers.set(101, async (msg) => {
        if (msg.type === 'DETECT_JOB_PAGE') {
          return { success: true, detected: false, jobData: null };
        }
        return { success: true };
      });

      await controller.rescan();

      assert.strictEqual(controller.activeJob, null, 'Active job must be cleared on non-job page');
      assert.strictEqual(controller.pendingDetectedJob, null);
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.IDLE);
      assert.strictEqual(analyzeCalls, 0);
    });
  });

  describe('5. LinkedIn Delivery Fix', () => {
    it('extracts job with resilient unified top card h2 selector and company link', () => {
      const dom = createMockDocument({
        elements: {
          'h2.job-details-jobs-unified-top-card__job-title': {
            textContent: 'Staff Backend Architect',
          },
          '.jobs-details__main-content a[href*="/company/"]': {
            textContent: 'Apex Cloud Solutions',
          },
          'article.jobs-description__container': {
            textContent: 'We are seeking a Staff Architect to scale our cloud platforms. Responsibilities include architecture, mentoring, and technical leadership across all services.',
            querySelectorAll: () => [{ textContent: '10+ years backend experience' }],
          },
        },
      });
      const url = 'https://www.linkedin.com/jobs/view/4211998877';

      assert.strictEqual(LinkedInAdapter.canHandle(dom, url), true);

      const detection = JobDetectionEngine.evaluate(dom, url);
      assert.strictEqual(detection.detected, true);
      assert.strictEqual(detection.jobData.title, 'Staff Backend Architect');
      assert.strictEqual(detection.jobData.company, 'Apex Cloud Solutions');
      assert.strictEqual(detection.jobData.externalJobId, '4211998877');
      assert.strictEqual(detection.portalMetadata.portalName, 'LinkedIn Jobs');
    });

    it('extracts job with currentJobId parameter and delayed description container', () => {
      const dom = createMockDocument({
        elements: {
          '.jobs-details__main-content h1': {
            textContent: 'Site Reliability Director',
          },
          '.jobs-details__main-content [data-tracking-control-name*="company"]': {
            textContent: 'Reliability Labs',
          },
          '.jobs-description__content': {
            textContent: 'Leading global SRE initiatives. Kubernetes, distributed databases.',
            querySelectorAll: () => [{ textContent: 'SRE leadership experience' }],
          },
        },
      });
      const url = 'https://www.linkedin.com/jobs/search/?currentJobId=3887766554&geoId=103644278';

      assert.strictEqual(LinkedInAdapter.canHandle(dom, url), true);

      const detection = JobDetectionEngine.evaluate(dom, url);
      assert.strictEqual(detection.detected, true);
      assert.strictEqual(detection.jobData.title, 'Site Reliability Director');
      assert.strictEqual(detection.jobData.company, 'Reliability Labs');
      assert.strictEqual(detection.jobData.externalJobId, '3887766554');
    });

    it('strictly rejects non-job sections: feed, in profile, messaging, notifications', () => {
      const nonJobUrls = [
        'https://www.linkedin.com/feed/',
        'https://www.linkedin.com/in/johndoe/',
        'https://www.linkedin.com/messaging/thread/123/',
        'https://www.linkedin.com/notifications/',
        'https://www.linkedin.com/mynetwork/',
      ];

      for (const url of nonJobUrls) {
        const dom = createMockDocument({
          elements: {
            'h1': { textContent: 'Welcome to Feed' },
          },
        });
        assert.strictEqual(LinkedInAdapter.canHandle(dom, url), false, `Should reject ${url}`);
        const detection = JobDetectionEngine.evaluate(dom, url);
        assert.strictEqual(detection.detected, false);
      }
    });
  });

  describe('6. Strict Server Boundary & Race Condition Protection', () => {
    it('passive operations produce ZERO /analyze-job calls, explicit Analyze produces 1', async () => {
      const job = {
        title: 'Distributed Systems Engineer',
        company: 'CloudScale',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1001',
        description: 'We are looking for a senior distributed systems engineer to join our infrastructure team and build resilient services.',
        analysisReady: true,
      };

      await controller._handleJobDetectedEvent(job);
      assert.strictEqual(analyzeCalls, 0, 'Detection produces 0 analyze calls');

      // User explicitly clicks Analyze
      await controller.runAnalyzeJob();
      assert.strictEqual(analyzeCalls, 1, 'Explicit click produces exactly 1 call');

      // Double-click protection: second rapid click during or after does not fire second call
      controller._isAnalyzing = true;
      await controller.runAnalyzeJob();
      assert.strictEqual(analyzeCalls, 1, 'Double click blocked by guard');
    });

    it('race condition: Tab A detection response arriving after user switched to Tab B is discarded', async () => {
      // User is initially on Tab 101
      controller.activeTabId = 101;

      // Delayed response handler for Tab 101
      let finishTab101Detection;
      const delayedDetectionPromise = new Promise((resolve) => {
        finishTab101Detection = resolve;
      });
      tabMessageHandlers.set(101, () => delayedDetectionPromise);

      // Start detection on Tab 101 in flight
      const detectionPromise = controller._requestDetectionFromTab();

      // Wait microtask for ENSURE_CONTENT_SCRIPT to resolve and DETECT_JOB_PAGE to be dispatched
      await new Promise((resolve) => setTimeout(resolve, 10));

      // User immediately switches to Tab 102 before Tab 101 resolves
      controller.activeTabId = 102;
      controller.activeJob = null;

      // Tab 101 finally resolves with a job
      finishTab101Detection({
        success: true,
        detected: true,
        jobData: {
          title: 'Stale Tab 101 Job',
          company: 'Old Corp',
          sourceUrl: 'https://www.linkedin.com/jobs/view/101',
        },
      });

      await detectionPromise;

      // Tab 102 must NOT adopt Tab 101's stale job
      assert.strictEqual(controller.activeJob, null, 'Tab 101 result must be discarded for Tab 102');
      assert.strictEqual(analyzeCalls, 0);
    });
  });
});
