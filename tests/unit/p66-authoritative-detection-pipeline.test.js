/**
 * @file P66 Unit Tests: Real LinkedIn Detection & Single Detection Reconciliation Pipeline
 *
 * Validates:
 * 1. Single Authoritative Detection Pipeline (content script DETECT_JOB_PAGE -> sidebar reconciles/persists).
 * 2. Tab Switch Race Condition (stale async responses discarded via requestId, tabId, generation).
 * 3. Page Reload Race Condition (TAB_UPDATED status=complete triggers fresh authoritative detection).
 * 4. Rescan Current-Page Authority (fresh DETECT_JOB_PAGE, clears unlocked state on non-job, 0 analyze calls, no pending substitution).
 * 5. Stale Response Protection (requestId, tabId, workflowGeneration check).
 * 6. LinkedIn Delayed DOM & Hydration Grace Period (/jobs/view/<id> and currentJobId).
 * 7. LinkedIn SPA Selected Job & Non-Job Rejection (/feed, /in/, /messaging).
 * 8. Server Boundary (0 calls on switch/reload/rescan/hydration; exactly 1 on explicit Analyze).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { LinkedInAdapter } from '../../extension/job-detection/adapters/linkedin.adapter.js';
import { JobDetectionEngine } from '../../extension/job-detection/detection-engine.js';
import { JobIdentity } from '../../extension/lib/job-identity.js';
import { DurableWorkflowStore } from '../../extension/lib/durable-workflow-store.js';
import {
  WorkflowStateMachine,
  WORKFLOW_STATES,
} from '../../extension/lib/workflow-state-machine.js';
import { SidebarController } from '../../extension/sidebar/sidebar.js';

function createMockDocument({
  elements = {},
  meta = {},
  scripts = [],
  bodyText = '',
  title = '',
} = {}) {
  const doc = {
    title,
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
        return Array.isArray(elements[cleanSelector])
          ? elements[cleanSelector]
          : [elements[cleanSelector]];
      }
      return [];
    },
  };
  doc.body.querySelectorAll = (sel) => doc.querySelectorAll(sel);
  return doc;
}

describe('Part 66 — Real LinkedIn Detection & Single Detection Reconciliation Pipeline', () => {
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
        query: async () => [{ id: 101, url: 'https://www.linkedin.com/jobs/view/4419969671/' }],
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
            if (typeof key === 'string')
              return { [key]: global.chrome.storage.local._map.get(key) };
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
        user: { id: 'usr-p66', email: 'canonical@example.com', displayName: 'Canonical User' },
      }),
      analyzeJob: async (job) => {
        analyzeCalls++;
        return {
          fitAnalysis: { overallScore: 92, matchedSkills: ['Go', 'Kubernetes'], missingSkills: [] },
          recommendedProjects: [{ id: 'p1', name: 'Go Backend', relevanceScore: 95 }],
          analysisSnapshotId: 'snap-p66',
        };
      },
      prepareHandoff: async () => ({
        applicationId: 'app-p66-canonical',
        packageVersion: 1,
        packageHash: 'hash-p66',
      }),
    };

    mockStore = new DurableWorkflowStore();
    controller = new SidebarController();
    controller.backendClient = mockBackendClient;
    controller.store = mockStore;
    controller.stateMachine = new WorkflowStateMachine();
    controller.activeTabId = 101;
    controller.isAuthenticated = true;
    controller.currentUser = { id: 'usr-p66', email: 'canonical@example.com' };

    controller.elements = {
      connectionBadge: { className: '' },
      connectionText: { textContent: '' },
      workflowStatusBar: { classList: { add() {}, remove() {} } },
      workflowStateText: { textContent: '' },
      workflowLockedBadge: { classList: { add() {}, remove() {} } },
      portalName: { textContent: '' },
      confidenceBadge: { textContent: '', className: '' },
      jobTitle: { textContent: '—' },
      jobCompany: { textContent: '—' },
      jobLocation: { textContent: '—' },
      jobType: { textContent: '—' },
      jobNotDetectedState: { classList: { add() {}, remove() {} } },
      jobDetectedState: { classList: { add() {}, remove() {} } },
      analysisCard: { classList: { add() {}, remove() {} } },
      projectsCard: { classList: { add() {}, remove() {} } },
      handoffCard: { classList: { add() {}, remove() {} } },
      pendingJobNotification: {
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
        },
      },
      pendingJobTitle: { textContent: '' },
      analyzeJobBtn: { disabled: false, textContent: 'Analyze Job Match' },
      prepareHandoffBtn: { disabled: false },
      prepareBtnText: { textContent: 'Prepare Handoff Kit' },
      sessionExpiredNotice: { classList: { add() {}, remove() {} } },
      workflowLockBanner: { classList: { add() {}, remove() {} } },
    };

    controller._listenToRuntimeMessages();
  });

  describe('1. Single Authoritative Detection Pipeline', () => {
    it('sidebar sends DETECT_JOB_PAGE and reconciles authoritative response', async () => {
      const liveJob = {
        title: 'Senior Software Engineer – Go (Golang)',
        company: 'General Motors',
        location: 'Warren, MI',
        externalJobId: '4419969671',
        sourceUrl: 'https://www.linkedin.com/jobs/view/4419969671/',
        provider: 'LINKEDIN',
        description: 'Design, develop and maintain distributed microservices in Go.',
      };

      tabMessageHandlers.set(101, async (msg) => {
        if (msg.type === 'DETECT_JOB_PAGE') {
          return {
            success: true,
            detected: true,
            jobData: liveJob,
          };
        }
        return { success: true };
      });

      const detected = await controller._requestDetectionFromTab();

      assert.strictEqual(detected, true);
      assert.strictEqual(controller.activeJob.title, liveJob.title);
      assert.strictEqual(controller.activeJob.company, liveJob.company);
      assert.strictEqual(controller.activeJob.externalJobId, '4419969671');
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.JOB_DETECTED);
      assert.strictEqual(analyzeCalls, 0, 'Detection must make ZERO analyze calls');
    });

    it('passive JOB_DETECTED_ON_PAGE does not mutate or reconcile sidebar state (DETECT_JOB_PAGE is sole authority)', async () => {
      const jobA = {
        title: 'Cloud Systems Architect',
        company: 'Apex Systems',
        sourceUrl: 'https://www.linkedin.com/jobs/view/5555',
      };

      // Dispatched by passive event
      global.chrome.runtime.onMessage.dispatch({
        type: 'JOB_DETECTED_ON_PAGE',
        tabId: 101,
        jobData: jobA,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.strictEqual(controller.activeJob, null, 'Passive event must not mutate activeJob');
      assert.strictEqual(
        controller.stateMachine.state,
        WORKFLOW_STATES.IDLE,
        'State must remain IDLE'
      );
      assert.strictEqual(analyzeCalls, 0);
    });
  });

  describe('2. Tab Switch Race Condition & Stale Invalidation', () => {
    it('Tab A response arriving after user switched to Tab B is discarded via requestId and tabId', async () => {
      const jobA = {
        title: 'Senior Backend Engineer',
        company: 'Company A',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1001',
      };
      const jobB = {
        title: 'Staff Security Engineer',
        company: 'Company B',
        sourceUrl: 'https://www.linkedin.com/jobs/view/2002',
      };

      let resolveTabA;
      const tabAPromise = new Promise((resolve) => {
        resolveTabA = resolve;
      });

      tabMessageHandlers.set(101, async (msg) => {
        if (msg.type === 'DETECT_JOB_PAGE') {
          await tabAPromise;
          return { success: true, detected: true, jobData: jobA };
        }
        return { success: true };
      });

      tabMessageHandlers.set(202, async (msg) => {
        if (msg.type === 'DETECT_JOB_PAGE') {
          return { success: true, detected: true, jobData: jobB };
        }
        return { success: true };
      });

      // User triggers detection on Tab 101
      const flightA = controller._requestDetectionFromTab();

      // Before Tab 101 responds, user switches to Tab 202
      global.chrome.runtime.onMessage.dispatch({
        type: 'ACTIVE_TAB_CHANGED',
        tabId: 202,
        url: 'https://www.linkedin.com/jobs/view/2002',
      });

      assert.strictEqual(controller.activeTabId, 202);

      // Wait for Tab 202 switch and detection to complete
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.strictEqual(controller.activeJob.title, jobB.title);

      // Now Tab A finishes late
      resolveTabA();
      await flightA;

      // Active job on Tab 202 must NOT be overwritten by stale Tab 101 response
      assert.strictEqual(
        controller.activeJob.title,
        jobB.title,
        'Tab B active job must be preserved'
      );
      assert.strictEqual(controller.activeTabId, 202);
      assert.strictEqual(analyzeCalls, 0);
    });
  });

  describe('3. Page Reload Race Condition', () => {
    it('TAB_UPDATED status=complete triggers fresh authoritative detection on active tab', async () => {
      const reloadedJob = {
        title: 'Senior Distributed Systems Engineer',
        company: 'NextGen Tech',
        sourceUrl: 'https://www.linkedin.com/jobs/view/7777',
      };

      tabMessageHandlers.set(101, async (msg) => {
        if (msg.type === 'DETECT_JOB_PAGE') {
          return { success: true, detected: true, jobData: reloadedJob };
        }
        return { success: true };
      });

      global.chrome.runtime.onMessage.dispatch({
        type: 'TAB_UPDATED',
        tabId: 101,
        status: 'complete',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.strictEqual(controller.activeJob.title, reloadedJob.title);
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.JOB_DETECTED);
      assert.strictEqual(analyzeCalls, 0);
    });
  });

  describe('4. Deterministic Rescan Authority & Stale State Clearing', () => {
    it('rescan queries ONLY active tab and clears unlocked job state when page is not a job', async () => {
      // Initially Tab 101 had a detected job
      await controller._handleJobDetectedEvent({
        title: 'Old Unlocked Job',
        company: 'Old Corp',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1111',
      });
      assert.strictEqual(controller.activeJob.title, 'Old Unlocked Job');

      // Now active tab navigates to a non-job page
      tabMessageHandlers.set(101, async (msg) => {
        if (msg.type === 'DETECT_JOB_PAGE') {
          return { success: true, detected: false, jobData: null };
        }
        return { success: true };
      });

      await controller.rescan();

      assert.strictEqual(
        controller.activeJob,
        null,
        'Unlocked active job must be cleared on non-job page'
      );
      assert.strictEqual(controller.pendingDetectedJob, null);
      assert.strictEqual(controller.elements.jobTitle.textContent, '—');
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.IDLE);
      assert.strictEqual(analyzeCalls, 0);
    });

    it('rescan NEVER uses pendingDetectedJob as a substitute when active page returns detected: false', async () => {
      // Simulate pendingDetectedJob left in memory from prior event
      controller.pendingDetectedJob = {
        title: 'Ghost Role',
        company: 'Phantom Inc',
      };

      // Content script on current active tab confirms NO job on page
      tabMessageHandlers.set(101, async (msg) => {
        if (msg.type === 'DETECT_JOB_PAGE') {
          return { success: true, detected: false, jobData: null };
        }
        return { success: true };
      });

      await controller.rescan();

      assert.strictEqual(
        controller.activeJob,
        null,
        'Must NOT substitute pending job for active detection'
      );
      assert.strictEqual(controller.pendingDetectedJob, null, 'Pending job must be cleared');
      assert.strictEqual(analyzeCalls, 0);
    });
  });

  describe('5. LinkedIn Detection Resiliency & Fallback', () => {
    it('detects live LinkedIn canonical job detail page with unified title and topcard org link', () => {
      const dom = createMockDocument({
        elements: {
          'h1.top-card-layout__title': { textContent: 'Senior Software Engineer – Go (Golang)' },
          'a.topcard__org-name-link': { textContent: 'General Motors' },
          'span.topcard__flavor--bullet': { textContent: 'Warren, MI' },
          '.show-more-less-html__markup': {
            textContent:
              'About General Motors: We are hiring a Senior Software Engineer specializing in Go microservices. Requirements: 5+ years Go, Kubernetes, event architectures.',
            querySelectorAll: () => [
              { textContent: '5+ years experience in Golang' },
              { textContent: 'Experience with Kubernetes and microservices' },
            ],
          },
        },
      });
      const url = 'https://www.linkedin.com/jobs/view/4419969671/';

      assert.strictEqual(LinkedInAdapter.canHandle(dom, url), true);
      const detection = JobDetectionEngine.evaluate(dom, url);
      assert.strictEqual(detection.detected, true);
      assert.strictEqual(detection.jobData.title, 'Senior Software Engineer – Go (Golang)');
      assert.strictEqual(detection.jobData.company, 'General Motors');
      assert.strictEqual(detection.jobData.location, 'Warren, MI');
      assert.strictEqual(detection.jobData.externalJobId, '4419969671');
      assert.strictEqual(detection.jobData.provider, 'LINKEDIN');
      assert.strictEqual(detection.confidence, 'HIGH');
    });

    it('detects LinkedIn page via currentJobId query parameter with delayed description container', () => {
      const dom = createMockDocument({
        elements: {
          'h2.job-details-jobs-unified-top-card__job-title': {
            textContent: 'Principal Distributed Systems Architect',
          },
          '.job-details-jobs-unified-top-card__company-name': { textContent: 'NextEra Energy' },
          '#job-details': {
            textContent:
              'NextEra Energy is seeking a Principal Distributed Systems Architect. Requirements include cloud-native distributed databases and zero-trust security.',
            querySelectorAll: () => [{ textContent: 'Cloud-native distributed databases' }],
          },
        },
      });
      const url = 'https://www.linkedin.com/jobs/search/?currentJobId=4419969671&geoId=103644278';

      assert.strictEqual(LinkedInAdapter.canHandle(dom, url), true);
      const detection = JobDetectionEngine.evaluate(dom, url);
      assert.strictEqual(detection.detected, true);
      assert.strictEqual(detection.jobData.title, 'Principal Distributed Systems Architect');
      assert.strictEqual(detection.jobData.company, 'NextEra Energy');
      assert.strictEqual(detection.jobData.externalJobId, '4419969671');
    });

    it('extracts job details from JSON-LD JobPosting metadata on LinkedIn', () => {
      const dom = createMockDocument({
        scripts: [
          {
            '@context': 'http://schema.org',
            '@type': 'JobPosting',
            title: 'Lead Platform Architect',
            hiringOrganization: { name: 'AutoTech Robotics' },
            jobLocation: { address: { addressLocality: 'Detroit', addressRegion: 'MI' } },
            description:
              '<p>Lead Platform Architect responsible for autonomous vehicle cloud infrastructure. Requirements: Go, Rust, distributed storage.</p>',
          },
        ],
      });
      const url = 'https://www.linkedin.com/jobs/view/4419969671/';

      assert.strictEqual(LinkedInAdapter.canHandle(dom, url), true);
      const detection = JobDetectionEngine.evaluate(dom, url);
      assert.strictEqual(detection.detected, true);
      assert.strictEqual(detection.jobData.title, 'Lead Platform Architect');
      assert.strictEqual(detection.jobData.company, 'AutoTech Robotics');
      assert.strictEqual(detection.jobData.externalJobId, '4419969671');
    });

    it('extracts title and company from document.title as resilient fallback during late hydration', () => {
      const dom = createMockDocument({
        title:
          'General Motors hiring Senior Software Engineer – Go (Golang) in Warren, MI | LinkedIn',
        elements: {
          '.show-more-less-html__markup': {
            textContent:
              'Join General Motors engineering team. We are hiring a Senior Software Engineer for Go services. Requirements: Go, Docker, gRPC.',
          },
        },
      });
      const url = 'https://www.linkedin.com/jobs/view/4419969671/';

      assert.strictEqual(LinkedInAdapter.canHandle(dom, url), true);
      const detection = JobDetectionEngine.evaluate(dom, url);
      assert.strictEqual(detection.detected, true);
      assert.strictEqual(detection.jobData.title, 'Senior Software Engineer – Go (Golang)');
      assert.strictEqual(detection.jobData.company, 'General Motors');
      assert.strictEqual(detection.jobData.location, 'Warren, MI');
    });

    it('strictly rejects non-job sections on LinkedIn (/feed, /in/, /messaging, /notifications, /mynetwork)', () => {
      const nonJobUrls = [
        'https://www.linkedin.com/feed/',
        'https://www.linkedin.com/feed/update/urn:li:activity:123456789/',
        'https://www.linkedin.com/in/satyanadella/',
        'https://www.linkedin.com/messaging/thread/2-12345/',
        'https://www.linkedin.com/notifications/',
        'https://www.linkedin.com/mynetwork/',
        'https://www.linkedin.com/settings/',
      ];

      for (const url of nonJobUrls) {
        const dom = createMockDocument({ bodyText: 'LinkedIn feed content' });
        assert.strictEqual(LinkedInAdapter.canHandle(dom, url), false, `Must reject ${url}`);
        const result = JobDetectionEngine.evaluate(dom, url);
        assert.strictEqual(result.detected, false);
      }
    });
  });

  describe('6. Server Boundary & Single Analyze Call Verification', () => {
    it('passive operations make ZERO server calls, explicit Analyze makes exactly 1 call', async () => {
      const job = {
        title: 'Staff Site Reliability Engineer',
        company: 'CloudScale Infrastructure',
        sourceUrl: 'https://www.linkedin.com/jobs/view/8899',
        description:
          'Staff Site Reliability Engineer wanted to scale distributed infrastructure across Kubernetes clusters with high availability requirements.',
      };

      tabMessageHandlers.set(101, async (msg) => {
        if (msg.type === 'DETECT_JOB_PAGE') {
          return { success: true, detected: true, jobData: job };
        }
        return { success: true };
      });

      // Passive detection
      await controller._requestDetectionFromTab();
      assert.strictEqual(analyzeCalls, 0);

      // Reload
      global.chrome.runtime.onMessage.dispatch({
        type: 'TAB_UPDATED',
        tabId: 101,
        status: 'complete',
      });
      await new Promise((r) => setTimeout(r, 50));
      assert.strictEqual(analyzeCalls, 0);

      // Rescan
      await controller.rescan();
      assert.strictEqual(analyzeCalls, 0);

      // Explicit Analyze click
      await controller.runAnalyzeJob();
      assert.strictEqual(analyzeCalls, 1, 'Exactly one server call on explicit click');

      // Double-click protection
      controller._isAnalyzing = true;
      await controller.runAnalyzeJob();
      assert.strictEqual(analyzeCalls, 1, 'Double click must be guarded');
    });
  });
});
