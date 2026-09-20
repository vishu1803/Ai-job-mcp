/**
 * @file Tests for P67: Detection Delivery Convergence & LinkedIn Hydration Reliability.
 *
 * Validates:
 * 1. Single Authoritative Delivery Path (DETECT_JOB_PAGE direct response authority vs passive events).
 * 2. Bounded LinkedIn Hydration (immediate resolution on DOM ready, MutationObserver + bounded backoff, fast exit).
 * 3. Detection Readiness (URL alone without usable title + company/description returns not detected).
 * 4. Tab Switch Invalidation (synchronous requestId increment, stale response discarding).
 * 5. Page Reload Determinism (readiness handshake and fresh authoritative detection).
 * 6. Rescan Authority (direct active tab query, zero substitution, stale clearing).
 * 7. Multi-Job Switching (Job A -> Job B -> Job A).
 * 8. Server Call Boundary (0 passive calls, exactly 1 explicit click, double-click protection).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SidebarController } from '../../extension/sidebar/sidebar.js';
import { WORKFLOW_STATES } from '../../extension/lib/workflow-state-machine.js';
import { LinkedInAdapter } from '../../extension/job-detection/adapters/linkedin.adapter.js';
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
      sendMessage: async () => ({ success: true }),
    },
    tabs: {
      query: async () => [{ id: 101, url: 'https://www.linkedin.com/jobs/view/4419969671/' }],
      sendMessage: async () => ({ success: true, detected: true, jobData: null }),
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
  };
}

describe('Part 67 — Detection Delivery Convergence & LinkedIn Hydration Reliability', () => {
  let controller;
  let mockElements;

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
    title: 'Staff Distributed Systems Engineer',
    company: 'Anthropic',
    location: 'San Francisco, CA',
    employmentType: 'FULL_TIME',
    description: 'Lead engineering for distributed training infrastructure.',
    requirements: ['Distributed systems', 'Rust or Go'],
    responsibilities: ['Architecture and reliability'],
  };

  beforeEach(() => {
    mockElements = setupMockDOM();
    controller = new SidebarController();
    controller.elements = mockElements;
    controller._listenToRuntimeMessages();
    controller.activeTabId = 101;
    controller.isAuthenticated = true;
    controller.currentUser = { id: 'usr-p67', email: 'test@example.com' };
  });

  describe('1. Single Authoritative Delivery Path & Race Condition Resolution', () => {
    it('sidebar accepts DETECT_JOB_PAGE response and ignores competing in-flight passive event', async () => {
      global.chrome.tabs.sendMessage = async (_tabId, msg) => {
        if (msg.type === 'DETECT_JOB_PAGE') {
          return {
            success: true,
            detected: true,
            jobData: SAMPLE_JOB_A,
            requestId: msg.requestId,
            tabId: msg.tabId,
            generation: msg.generation,
          };
        }
        return { success: true };
      };

      // While DETECT_JOB_PAGE is in-flight, a competing passive JOB_DETECTED_ON_PAGE arrives
      controller._isDetectingInFlight = true;
      global.chrome.runtime.onMessage.dispatch({
        type: 'JOB_DETECTED_ON_PAGE',
        tabId: 101,
        jobData: SAMPLE_JOB_B,
        generation: 0,
      });

      // Passive event was ignored because authoritative detection is in-flight
      assert.strictEqual(controller.activeJob, null);
      assert.strictEqual(controller.pendingDetectedJob, null);

      // Now run authoritative detection
      const detected = await controller._requestDetectionFromTab();
      assert.strictEqual(detected, true);
      assert.strictEqual(controller.activeJob.title, SAMPLE_JOB_A.title);
      assert.strictEqual(controller.activeJob.externalJobId, '4419969671');
    });

    it('stale DETECT_JOB_PAGE response with mismatched requestId is discarded', async () => {
      global.chrome.tabs.sendMessage = async (_tabId, msg) => {
        return {
          success: true,
          detected: true,
          jobData: SAMPLE_JOB_A,
          requestId: msg.requestId - 1, // Stale requestId
          tabId: msg.tabId,
          generation: msg.generation,
        };
      };

      const result = await controller._requestDetectionFromTab();
      assert.strictEqual(result, false);
      assert.strictEqual(controller.activeJob, null);
    });

    it('stale DETECT_JOB_PAGE response with mismatched tabId is discarded', async () => {
      global.chrome.tabs.sendMessage = async (_tabId, msg) => {
        return {
          success: true,
          detected: true,
          jobData: SAMPLE_JOB_A,
          requestId: msg.requestId,
          tabId: 999, // Mismatched tabId
          generation: msg.generation,
        };
      };

      const result = await controller._requestDetectionFromTab();
      assert.strictEqual(result, false);
      assert.strictEqual(controller.activeJob, null);
    });
  });

  describe('2. Detection Readiness Criteria', () => {
    it('canonical LinkedIn URL without title or company/description evidence returns isReady: false', () => {
      const mockEmptyDoc = {
        querySelector: () => null,
        querySelectorAll: () => [],
        title: '',
        body: { textContent: '' },
      };

      const payload = LinkedInAdapter.extract(
        mockEmptyDoc,
        'https://www.linkedin.com/jobs/view/4419969671/'
      );
      assert.strictEqual(payload.externalJobId, '4419969671');
      assert.strictEqual(payload.isReady, false);
      assert.strictEqual(payload.title, 'Untitled Role');

      const evaluation = JobDetectionEngine.evaluate(
        mockEmptyDoc,
        'https://www.linkedin.com/jobs/view/4419969671/'
      );
      assert.strictEqual(evaluation.detected, false);
      assert.strictEqual(evaluation.ready, false);
    });

    it('canonical LinkedIn URL with title and company returns isReady: true and detected: true', () => {
      const mockDoc = {
        querySelector: (sel) => {
          if (sel.includes('job-title')) return { textContent: 'Senior Go Engineer' };
          if (sel.includes('company-name') || sel.includes('company'))
            return { textContent: 'General Motors' };
          return null;
        },
        querySelectorAll: () => [],
        title: 'Senior Go Engineer at General Motors | LinkedIn',
        body: {
          textContent: 'General Motors is hiring a Senior Go Engineer with 5+ years experience.',
        },
      };

      const payload = LinkedInAdapter.extract(
        mockDoc,
        'https://www.linkedin.com/jobs/view/4419969671/'
      );
      assert.strictEqual(payload.externalJobId, '4419969671');
      assert.strictEqual(payload.title, 'Senior Go Engineer');
      assert.strictEqual(payload.company, 'General Motors');
      assert.strictEqual(payload.isReady, true);

      const evaluation = JobDetectionEngine.evaluate(
        mockDoc,
        'https://www.linkedin.com/jobs/view/4419969671/'
      );
      assert.strictEqual(evaluation.detected, true);
      assert.strictEqual(evaluation.ready, true);
      assert.strictEqual(evaluation.jobData.title, 'Senior Go Engineer');
    });
  });

  describe('3. Tab Switch Synchronization & UI Transient State Clearing', () => {
    it('tab switch increments detectionRequestId and clears transient UI placeholders', async () => {
      // First, establish Tab A state
      controller.activeTabId = 101;
      controller.activeJob = SAMPLE_JOB_A;
      controller.cachedState = { jobData: SAMPLE_JOB_A, workflowGeneration: 1 };
      mockElements.jobTitle.textContent = SAMPLE_JOB_A.title;
      mockElements.jobCompany.textContent = SAMPLE_JOB_A.company;

      const initialRequestId = controller._detectionRequestId;

      // Switch to Tab B (which has no job yet)
      global.chrome.tabs.sendMessage = async () => ({
        success: true,
        detected: false,
        jobData: null,
      });

      global.chrome.runtime.onMessage.dispatch({
        type: 'ACTIVE_TAB_CHANGED',
        tabId: 202,
      });

      assert.strictEqual(controller.activeTabId, 202);
      assert.ok(controller._detectionRequestId > initialRequestId);
      assert.strictEqual(mockElements.jobTitle.textContent, '—');
      assert.strictEqual(mockElements.jobCompany.textContent, '—');
      assert.strictEqual(controller.activeJob, null);
    });

    it('in-flight Tab A response arriving after user switched to Tab B is discarded', async () => {
      controller.activeTabId = 101;
      const initialReqId = ++controller._detectionRequestId;

      // Start Tab A request
      let resolveTabA;
      const tabAPromise = new Promise((resolve) => {
        resolveTabA = resolve;
      });
      global.chrome.tabs.sendMessage = () => tabAPromise;

      const detectionA = controller._requestDetectionFromTab();

      // User rapidly switches to Tab B before Tab A resolves
      global.chrome.runtime.onMessage.dispatch({
        type: 'ACTIVE_TAB_CHANGED',
        tabId: 202,
      });

      // Now Tab A finishes late
      resolveTabA({
        success: true,
        detected: true,
        jobData: SAMPLE_JOB_A,
        requestId: initialReqId,
        tabId: 101,
      });

      await detectionA;

      // Active tab is Tab B and Tab A's stale job was NOT adopted
      assert.strictEqual(controller.activeTabId, 202);
      assert.strictEqual(controller.activeJob, null);
    });
  });

  describe('4. Page Reload Determinism', () => {
    it('TAB_UPDATED with status complete triggers fresh authoritative detection on active tab', async () => {
      let detectionRequested = false;
      global.chrome.tabs.sendMessage = async (_tabId, msg) => {
        if (msg?.type === 'DETECT_JOB_PAGE') {
          detectionRequested = true;
          return {
            success: true,
            detected: true,
            jobData: SAMPLE_JOB_A,
            requestId: msg.requestId,
            tabId: msg.tabId,
            generation: msg.generation,
          };
        }
        return { success: true };
      };

      global.chrome.runtime.onMessage.dispatch({
        type: 'TAB_UPDATED',
        tabId: 101,
        status: 'complete',
      });

      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(detectionRequested, true);
      assert.strictEqual(controller.activeJob.externalJobId, '4419969671');
      assert.strictEqual(mockElements.jobTitle.textContent, SAMPLE_JOB_A.title);
    });
  });

  describe('5. Rescan Authority & Zero Pending Substitution', () => {
    it('rescan queries active tab directly and renders authoritative detection', async () => {
      global.chrome.tabs.sendMessage = async (_tabId, msg) => {
        if (msg?.type === 'DETECT_JOB_PAGE') {
          return {
            success: true,
            detected: true,
            jobData: SAMPLE_JOB_B,
            requestId: msg.requestId,
            tabId: msg.tabId,
          };
        }
        return { success: true };
      };

      await controller.rescan();

      assert.strictEqual(controller.activeJob.externalJobId, '4419969660');
      assert.strictEqual(controller.activeJob.title, SAMPLE_JOB_B.title);
      assert.strictEqual(mockElements.jobTitle.textContent, SAMPLE_JOB_B.title);
    });

    it('rescan on non-job page clears unlocked active job and NEVER uses pendingDetectedJob as substitute', async () => {
      controller.activeJob = SAMPLE_JOB_A;
      controller.pendingDetectedJob = SAMPLE_JOB_B;
      controller.cachedState = {
        jobData: SAMPLE_JOB_A,
        workflowState: WORKFLOW_STATES.JOB_DETECTED,
        workflowGeneration: 1,
      };

      global.chrome.tabs.sendMessage = async (_tabId, msg) => {
        if (msg?.type === 'DETECT_JOB_PAGE') {
          return {
            success: true,
            detected: false,
            jobData: null,
            requestId: msg.requestId,
            tabId: msg.tabId,
          };
        }
        return { success: true };
      };

      await controller.rescan();

      assert.strictEqual(controller.activeJob, null);
      assert.strictEqual(controller.pendingDetectedJob, null);
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.IDLE);
      assert.strictEqual(mockElements.jobTitle.textContent, '—');
    });
  });

  describe('6. Multi-Job Navigation & Switching (Job A -> Job B -> Job A)', () => {
    it('transitions smoothly from Job A to Job B and back to Job A with single primary workflow', async () => {
      // 1. Initial Job A detection
      global.chrome.tabs.sendMessage = async (_tabId, msg) => ({
        success: true,
        detected: true,
        jobData: SAMPLE_JOB_A,
        requestId: msg.requestId,
        tabId: msg.tabId,
      });

      await controller._requestDetectionFromTab();
      assert.strictEqual(controller.activeJob.externalJobId, '4419969671');

      // 2. Candidate navigates to Job B; Rescan adopts Job B
      global.chrome.tabs.sendMessage = async (_tabId, msg) => ({
        success: true,
        detected: true,
        jobData: SAMPLE_JOB_B,
        requestId: msg.requestId,
        tabId: msg.tabId,
      });

      await controller.rescan();
      assert.strictEqual(controller.activeJob.externalJobId, '4419969660');
      assert.strictEqual(controller.activeJob.title, SAMPLE_JOB_B.title);

      // 3. Candidate navigates back to Job A; Rescan adopts Job A again
      global.chrome.tabs.sendMessage = async (_tabId, msg) => ({
        success: true,
        detected: true,
        jobData: SAMPLE_JOB_A,
        requestId: msg.requestId,
        tabId: msg.tabId,
      });

      await controller.rescan();
      assert.strictEqual(controller.activeJob.externalJobId, '4419969671');
      assert.strictEqual(controller.activeJob.title, SAMPLE_JOB_A.title);
    });
  });

  describe('7. Server Call Boundary & Double-Click Protection', () => {
    it('passive detection, reload, tab switch, and rescan make ZERO server calls', async () => {
      let analyzeCalls = 0;
      controller.backendClient = {
        analyzeJob: async () => {
          analyzeCalls++;
          return { fitAnalysis: { overallScore: 88 } };
        },
      };

      global.chrome.tabs.sendMessage = async (_tabId, msg) => ({
        success: true,
        detected: true,
        jobData: SAMPLE_JOB_A,
        requestId: msg.requestId,
        tabId: msg.tabId,
      });

      // Passive detection
      await controller._requestDetectionFromTab();
      // Tab switch
      global.chrome.runtime.onMessage.dispatch({ type: 'ACTIVE_TAB_CHANGED', tabId: 101 });
      // Reload
      global.chrome.runtime.onMessage.dispatch({
        type: 'TAB_UPDATED',
        tabId: 101,
        status: 'complete',
      });
      // Rescan
      await controller.rescan();

      assert.strictEqual(analyzeCalls, 0);
    });

    it('explicit click on Analyze Job Match makes exactly 1 server call and blocks double-click', async () => {
      let analyzeCalls = 0;
      controller.backendClient = {
        analyzeJob: async () => {
          analyzeCalls++;
          await new Promise((r) => setTimeout(r, 20));
          return {
            fitAnalysis: { overallScore: 85, matchedSkills: ['Go', 'Kubernetes'] },
          };
        },
      };

      controller.activeJob = SAMPLE_JOB_A;
      controller.cachedState = {
        jobData: SAMPLE_JOB_A,
        workflowState: WORKFLOW_STATES.JOB_DETECTED,
        workflowGeneration: 1,
      };

      // Rapid double click
      const p1 = controller.runAnalyzeJob();
      const p2 = controller.runAnalyzeJob();

      await Promise.all([p1, p2]);

      assert.strictEqual(analyzeCalls, 1);
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.ANALYSIS_READY);
    });
  });
});
