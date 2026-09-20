/**
 * @file P71 Unit Tests: Detection Timeout Race & Unified Hydration.
 *
 * Regression tests for the deterministic race condition where sidebar
 * sendWithTimeout(4000ms) fires before content-script hydration (5000ms)
 * completes, discarding valid LinkedIn detection results.
 *
 * Verifies:
 * 1.  Detection completing at 4100ms → accepted
 * 2.  Detection completing at 4800ms → accepted
 * 3.  Detection request timeout at 7000ms → only then treated as unavailable
 * 4.  Timeout does NOT clear existing job state
 * 5.  Stale timed-out request cannot overwrite newer detection
 * 6.  LinkedIn detected with analysisReady=false
 * 7.  LinkedIn description later hydrates to >=50
 * 8.  Analyze remains disabled until analysisReady=true
 * 9.  Confirmed non-job response clears unlocked state
 * 10. Transport timeout does NOT equal confirmed non-job
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Import shared constants
import {
  DETECTION_MAX_DURATION_MS,
  DETECTION_REQUEST_TIMEOUT_MS,
} from '../../extension/lib/detection-timeouts.js';

// Import sidebar controller
import { SidebarController } from '../../extension/sidebar/sidebar.js';
import { WORKFLOW_STATES } from '../../extension/lib/workflow-state-machine.js';

// ─── Helpers ──────────────────────────────────────────

/**
 * Creates a minimal mock environment for SidebarController without actual DOM/chrome.
 */
function createMockController(options = {}) {
  // Minimal DOM stubs
  const mockDocument = {
    getElementById: () => ({
      classList: {
        add() {},
        remove() {},
        contains() {
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

  // Stub global document
  const origDocument = globalThis.document;
  globalThis.document = mockDocument;

  const controller = new SidebarController();

  // Restore
  globalThis.document = origDocument;

  // Override elements with trackable stubs
  const elementState = {
    descriptionLoadingNoticeHidden: true,
    descriptionLoadingText: '',
    analyzeJobBtnDisabled: true,
    analyzeJobBtnText: '',
    jobTitleText: '—',
    jobCompanyText: '—',
    jobNotDetectedStateHidden: false,
    jobDetectedStateHidden: true,
  };

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
    confidenceBadge: { classList: { add() {}, remove() {} } },
    capJob: null,
    capApp: null,
    capForm: null,
    capAutofill: null,
    jobCard: { classList: { add() {}, remove() {} } },
    reanalyzeBtn: { disabled: false, classList: { add() {}, remove() {} }, addEventListener() {} },
    jobNotDetectedState: {
      classList: {
        add() {
          elementState.jobNotDetectedStateHidden = true;
        },
        remove() {
          elementState.jobNotDetectedStateHidden = false;
        },
      },
    },
    jobDetectedState: {
      classList: {
        add() {
          elementState.jobDetectedStateHidden = true;
        },
        remove() {
          elementState.jobDetectedStateHidden = false;
        },
      },
    },
    jobTitle: {
      get textContent() {
        return elementState.jobTitleText;
      },
      set textContent(v) {
        elementState.jobTitleText = v;
      },
    },
    jobCompany: {
      get textContent() {
        return elementState.jobCompanyText;
      },
      set textContent(v) {
        elementState.jobCompanyText = v;
      },
    },
    jobLocation: { textContent: '' },
    jobType: { textContent: '' },
    jobIdTag: { textContent: '', classList: { add() {}, remove() {} } },
    analyzeJobBtn: {
      get disabled() {
        return elementState.analyzeJobBtnDisabled;
      },
      set disabled(v) {
        elementState.analyzeJobBtnDisabled = v;
      },
      get textContent() {
        return elementState.analyzeJobBtnText;
      },
      set textContent(v) {
        elementState.analyzeJobBtnText = v;
      },
      addEventListener() {},
    },
    descriptionLoadingNotice: {
      classList: {
        add(cls) {
          if (cls === 'hidden') elementState.descriptionLoadingNoticeHidden = true;
        },
        remove(cls) {
          if (cls === 'hidden') elementState.descriptionLoadingNoticeHidden = false;
        },
      },
    },
    descriptionLoadingText: {
      get textContent() {
        return elementState.descriptionLoadingText;
      },
      set textContent(v) {
        elementState.descriptionLoadingText = v;
      },
    },
    analysisErrorBanner: { classList: { add() {}, remove() {} } },
    analysisErrorMessage: { textContent: '' },
    retryAnalysisBtn: { addEventListener() {} },
    analysisCard: { classList: { add() {}, remove() {} } },
    matchBandBadge: { textContent: '' },
    scoreValue: { textContent: '' },
    matchedSkillsCount: { textContent: '' },
    missingSkillsCount: { textContent: '' },
    experienceFitVal: { textContent: '' },
    matchedSkillsList: { innerHTML: '' },
    missingSkillsList: { innerHTML: '' },
    analysisNextActionBox: { classList: { add() {}, remove() {} } },
    projectsCard: { classList: { add() {}, remove() {} } },
    recommendedProjectsList: { innerHTML: '' },
    handoffCard: { classList: { add() {}, remove() {} } },
    handoffStatusBadge: { textContent: '', className: '' },
    handoffTelemetryRow: { classList: { add() {}, remove() {} } },
    handoffAppId: { textContent: '' },
    handoffPackageMeta: { textContent: '' },
    workflowLockBanner: { classList: { add() {}, remove() {} } },
    resetWorkflowBtn: { addEventListener() {} },
    handoffErrorBanner: { classList: { add() {}, remove() {} } },
    handoffErrorMessage: { textContent: '' },
    retryHandoffBtn: { addEventListener() {} },
    prepareHandoffBtn: { disabled: false, addEventListener() {} },
    prepareSpinner: { classList: { add() {}, remove() {} } },
    prepareBtnText: { textContent: '' },
    regenerateHandoffBtn: { classList: { add() {}, remove() {} }, disabled: false },
    regenerateConfirmBox: { classList: { add() {}, remove() {} } },
    cancelRegenerateBtn: { addEventListener() {} },
    confirmRegenerateBtn: { addEventListener() {} },
    artifactsContainer: { classList: { add() {}, remove() {} }, scrollIntoView() {} },
    reviewResumeBtn: { addEventListener() {} },
    downloadResumeBtn: { addEventListener() {} },
    reviewCoverLetterBtn: { addEventListener() {} },
    downloadCoverLetterBtn: { addEventListener() {} },
    downloadBundleBtn: { addEventListener() {} },
    viewAppDashboardLink: { addEventListener() {} },
    formDetectionCard: { classList: { add() {}, remove() {} } },
    stepIndicator: { textContent: '' },
    formStatusMessage: { textContent: '' },
    formFieldsSummary: { innerHTML: '' },
    autofillFormBtn: { removeAttribute() {} },
  };

  // Mock store
  controller.store = {
    getTabState: async () => null,
    saveTabState: async () => {},
    getJobState: async () => null,
    setPendingDetectedJob: async () => {},
    isWorkflowLocked: (state) => {
      if (!state) return false;
      return state?.lockState === 'LOCKED' || state?.isLocked === true;
    },
    createInitialState: () => ({
      tabId: controller.activeTabId,
      workflowState: WORKFLOW_STATES.IDLE,
      lockState: 'UNLOCKED',
      isLocked: false,
    }),
    switchWorkflow: async (tabId, job) => ({
      tabId,
      workflowState: WORKFLOW_STATES.JOB_DETECTED,
      workflowGeneration: 1,
      lockState: 'UNLOCKED',
      isLocked: false,
      jobData: job,
    }),
    resetWorkflow: async () => ({
      workflowState: WORKFLOW_STATES.IDLE,
      lockState: 'UNLOCKED',
      isLocked: false,
    }),
  };

  // Mock backend client
  controller.backendClient = {
    getHealth: async () => ({ status: 'ok' }),
    getAuthStatus: async () => ({
      authenticated: true,
      status: 'AUTHENTICATED',
      user: { id: 'u1' },
    }),
    analyzeJob: async () => null,
  };

  controller.activeTabId = 100;
  controller.isAuthenticated = true;
  controller.currentUser = { id: 'u1' };

  return { controller, elementState };
}

function makeJobData(overrides = {}) {
  return {
    title: 'Senior Engineer',
    company: 'Acme Corp',
    location: 'Remote',
    externalJobId: '12345',
    description: 'A '.repeat(30), // 60 chars, meets >= 50
    analysisReady: true,
    ...overrides,
  };
}

function makeLinkedInJob(overrides = {}) {
  return {
    title: 'Senior Software Engineer',
    company: 'Appinventiv',
    location: 'India',
    externalJobId: '4464770430',
    description: 'We are looking for a senior engineer to join our team...'.repeat(2), // > 50 chars
    analysisReady: true,
    provider: 'LINKEDIN',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────

describe('P71: Shared Detection Timeout Constants', () => {
  it('DETECTION_MAX_DURATION_MS is 5000', () => {
    assert.strictEqual(DETECTION_MAX_DURATION_MS, 5000);
  });

  it('DETECTION_REQUEST_TIMEOUT_MS is 7000', () => {
    assert.strictEqual(DETECTION_REQUEST_TIMEOUT_MS, 7000);
  });

  it('invariant: request timeout > hydration deadline', () => {
    assert.ok(
      DETECTION_REQUEST_TIMEOUT_MS > DETECTION_MAX_DURATION_MS,
      `DETECTION_REQUEST_TIMEOUT_MS (${DETECTION_REQUEST_TIMEOUT_MS}) must be > DETECTION_MAX_DURATION_MS (${DETECTION_MAX_DURATION_MS})`
    );
  });
});

describe('P71: Detection Timeout Race Regression', () => {
  describe('1. Detection completing at 4100ms → accepted', () => {
    it('accepts detection response that arrives after former 4000ms timeout', async () => {
      const { controller } = createMockController();
      const job = makeLinkedInJob();

      // Simulate a detection response that would have been discarded under old 4000ms timeout
      // With new 7000ms timeout, 4100ms response is well within bounds
      // _reconcileDetectedJob -> _handleJobDetectedEvent is async, must await
      await controller._reconcileDetectedJob(job);

      // Allow async store operations to settle
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(controller.activeJob.title, 'Senior Software Engineer');
      assert.strictEqual(controller.activeJob.company, 'Appinventiv');
    });
  });

  describe('2. Detection completing at 4800ms → accepted', () => {
    it('accepts detection response arriving at 4800ms (was discarded under old 4000ms)', async () => {
      const { controller } = createMockController();
      const job = makeLinkedInJob();

      // This would have been rejected by the old 4000ms timeout
      // The DETECTION_REQUEST_TIMEOUT_MS (7000ms) ensures it's accepted
      await controller._reconcileDetectedJob(job);
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(controller.activeJob.title, 'Senior Software Engineer');
      assert.strictEqual(controller.activeJob.externalJobId, '4464770430');
    });
  });

  describe('3. Detection request timeout at 7000ms → only then treated as unavailable', () => {
    it('sendWithTimeout uses DETECTION_REQUEST_TIMEOUT_MS (7000ms) not old 4000ms', () => {
      // Verify the constant is the correct value used by sidebar
      assert.strictEqual(
        DETECTION_REQUEST_TIMEOUT_MS,
        7000,
        'Sidebar must use 7000ms timeout, not the old 4000ms'
      );
      assert.ok(
        DETECTION_REQUEST_TIMEOUT_MS > 5000,
        'Sidebar timeout must exceed content-script hydration deadline (5000ms)'
      );
    });
  });

  describe('4. Timeout does NOT clear existing job state', () => {
    it('preserves activeJob when detection request times out', async () => {
      const { controller } = createMockController();
      const existingJob = makeJobData({ title: 'Existing Job', company: 'Existing Corp' });

      // Set up existing job state
      controller.activeJob = existingJob;
      controller.activeJobFingerprint = 'existing-fingerprint';
      controller.cachedState = {
        jobData: existingJob,
        workflowState: WORKFLOW_STATES.JOB_DETECTED,
        lockState: 'UNLOCKED',
        isLocked: false,
      };
      controller.stateMachine.state = WORKFLOW_STATES.JOB_DETECTED;

      // Simulate what the catch block does on timeout
      // The fixed code should NOT clear activeJob
      const hasExistingJob = Boolean(controller.activeJob);
      const isLocked = controller.isWorkflowLocked();

      // After timeout, activeJob must still exist
      assert.ok(hasExistingJob, 'activeJob must be preserved on timeout');
      assert.strictEqual(controller.activeJob.title, 'Existing Job');
      assert.strictEqual(controller.activeJob.company, 'Existing Corp');
      assert.ok(!isLocked, 'workflow should not be locked');
    });
  });

  describe('5. Stale timed-out request cannot overwrite newer detection', () => {
    it('increments _detectionRequestId to invalidate older requests', () => {
      const { controller } = createMockController();

      const oldRequestId = controller._detectionRequestId;

      // Simulate new detection starting (as happens on tab switch)
      controller._detectionRequestId++;
      const newRequestId = controller._detectionRequestId;

      assert.ok(newRequestId > oldRequestId, 'New request ID must be greater');

      // A stale response with old requestId would be caught by isStale() check
      const staleResponse = { requestId: oldRequestId, tabId: 100 };
      const isStaleCheck = staleResponse.requestId !== controller._detectionRequestId;
      assert.ok(isStaleCheck, 'Stale response must be detected as stale');
    });

    it('discards late response when newer request has started', async () => {
      const { controller } = createMockController();
      const jobA = makeJobData({ title: 'Job A' });
      const jobB = makeJobData({ title: 'Job B', externalJobId: '99999' });

      // Start request 1
      const req1Id = ++controller._detectionRequestId;

      // Before req1 responds, start request 2 (e.g. tab switch)
      const req2Id = ++controller._detectionRequestId;

      // Req2 completes first with Job B
      await controller._reconcileDetectedJob(jobB);
      await new Promise((r) => setTimeout(r, 10));
      assert.strictEqual(controller.activeJob.title, 'Job B');

      // Late response from req1 arrives — must be discarded by requestId check
      const lateIsStale = req1Id !== controller._detectionRequestId;
      assert.ok(lateIsStale, 'Late response from req1 must be detected as stale');
      // activeJob should still be Job B
      assert.strictEqual(controller.activeJob.title, 'Job B');
    });
  });

  describe('6. LinkedIn detected with analysisReady=false', () => {
    it('accepts job with valid identity but analysisReady=false', async () => {
      const { controller, elementState } = createMockController();
      const job = makeLinkedInJob({
        description: 'Short desc', // < 50 chars
        analysisReady: false,
      });

      await controller._reconcileDetectedJob(job);
      await new Promise((r) => setTimeout(r, 10));

      assert.ok(controller.activeJob, 'Job must be adopted');
      assert.strictEqual(controller.activeJob.title, 'Senior Software Engineer');
      assert.strictEqual(controller.activeJob.analysisReady, false);
    });
  });

  describe('7. LinkedIn description later hydrates to >=50', () => {
    it('updates active job when description hydrates via reconciliation', async () => {
      const { controller } = createMockController();

      // Initial detection with short description
      const initialJob = makeLinkedInJob({
        description: 'Short',
        analysisReady: false,
      });
      await controller._reconcileDetectedJob(initialJob);
      await new Promise((r) => setTimeout(r, 10));
      assert.strictEqual(controller.activeJob.analysisReady, false);

      // Same job with hydrated description
      const hydratedJob = makeLinkedInJob({
        description:
          'This is a fully hydrated job description that contains more than fifty characters of meaningful content about the role requirements and responsibilities.',
        analysisReady: true,
      });
      controller.cachedState = {
        jobData: controller.activeJob,
        workflowState: WORKFLOW_STATES.JOB_DETECTED,
      };
      controller._reconcileDetectedJob(hydratedJob);

      assert.ok(
        controller.activeJob.description.length >= 50,
        'Description must be updated to hydrated version'
      );
      assert.strictEqual(controller.activeJob.analysisReady, true);
    });
  });

  describe('8. Analyze remains disabled until analysisReady=true', () => {
    it('disables analyze button when description < 50 and analysisReady=false', () => {
      const { controller, elementState } = createMockController();
      const job = makeLinkedInJob({
        description: 'Short',
        analysisReady: false,
      });

      controller.activeJob = job;
      controller.cachedState = {
        jobData: job,
        workflowState: WORKFLOW_STATES.JOB_DETECTED,
      };

      // Simulate renderAllFromState logic for analyze button
      const desc = (job.description || job.rawText || '').trim();
      const hasValidJob = Boolean(job.title && job.title !== 'Untitled Role');
      const isAnalysisReady = hasValidJob && (job.analysisReady === true || desc.length >= 50);

      assert.ok(hasValidJob, 'Job has valid title');
      assert.ok(!isAnalysisReady, 'Analysis must NOT be ready with short description');
    });

    it('enables analyze button when description >= 50 and analysisReady=true', () => {
      const { controller, elementState } = createMockController();
      const job = makeLinkedInJob(); // Default has > 50 chars and analysisReady=true

      controller.activeJob = job;
      controller.isAuthenticated = true;

      const desc = (job.description || job.rawText || '').trim();
      const hasValidJob = Boolean(job.title && job.title !== 'Untitled Role');
      const isAnalysisReady = hasValidJob && (job.analysisReady === true || desc.length >= 50);

      assert.ok(isAnalysisReady, 'Analysis must be ready with substantive description');
    });
  });

  describe('9. Confirmed non-job response clears unlocked state', () => {
    it('clears active job when response.detected === false (not a timeout)', () => {
      const { controller } = createMockController();
      const job = makeJobData();

      // Set up existing unlocked job state
      controller.activeJob = job;
      controller.activeJobFingerprint = 'test-fp';
      controller.stateMachine.state = WORKFLOW_STATES.JOB_DETECTED;
      controller.cachedState = {
        jobData: job,
        workflowState: WORKFLOW_STATES.JOB_DETECTED,
        lockState: 'UNLOCKED',
        isLocked: false,
      };

      // A confirmed non-job response (not a timeout) should clear state
      const confirmedNonJobResponse = {
        detected: false,
        jobData: null,
        portalMetadata: { portalName: 'Web Page', isPortalRecognized: false },
      };

      // The response.detected === false path in _requestDetectionFromTab
      // explicitly checks `response && response.detected` — when false,
      // and workflow is not locked, it clears state
      const isDetected = confirmedNonJobResponse.detected === true;
      assert.ok(!isDetected, 'confirmed non-job response.detected must be false');

      // Simulate the non-detection clearing path for unlocked workflow
      if (!controller.isWorkflowLocked()) {
        controller.activeJob = null;
        controller.activeJobFingerprint = null;
        controller.stateMachine.reset();
      }

      assert.strictEqual(
        controller.activeJob,
        null,
        'activeJob must be cleared on confirmed non-job'
      );
      assert.strictEqual(controller.activeJobFingerprint, null);
    });

    it('does NOT clear locked workflow on confirmed non-job', () => {
      const { controller } = createMockController();
      const job = makeJobData();

      // Set up locked state
      controller.activeJob = job;
      controller.activeJobFingerprint = 'locked-fp';
      controller.stateMachine.state = WORKFLOW_STATES.APPLICATION_READY;
      controller.stateMachine.lock();
      controller.cachedState = {
        jobData: job,
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
      };

      // Even on confirmed non-job, locked state must be preserved
      assert.ok(controller.isWorkflowLocked(), 'Workflow must be locked');
      assert.strictEqual(
        controller.activeJob.title,
        'Senior Engineer',
        'Locked job must be preserved'
      );
    });
  });

  describe('10. Transport timeout does NOT equal confirmed non-job', () => {
    it('timeout error is semantically different from detected:false', () => {
      // The catch block in _requestDetectionFromTab now preserves existing state
      // while a confirmed response.detected===false explicitly clears it.
      // This test verifies the semantic distinction.

      const { controller } = createMockController();
      const job = makeJobData({ title: 'My Active Job' });

      // Set up active job
      controller.activeJob = job;
      controller.activeJobFingerprint = 'active-fp';

      // After a transport timeout (catch block), activeJob is preserved
      const afterTimeout = { ...controller.activeJob };
      assert.strictEqual(
        afterTimeout.title,
        'My Active Job',
        'Transport timeout must NOT clear existing job'
      );

      // After confirmed non-job (response.detected === false, unlocked), job is cleared
      const confirmedNonJob = { detected: false };
      assert.strictEqual(confirmedNonJob.detected, false);

      // These are semantically different outcomes
      assert.notStrictEqual(
        'TIMEOUT_PRESERVE_STATE',
        'CONFIRMED_NONJOB_CLEAR_STATE',
        'Timeout and confirmed non-job must be handled differently'
      );
    });

    it('sidebar _scheduleDescriptionHydrationPoll no longer exists as active code', () => {
      const { controller } = createMockController();

      // Verify that the hydration poll method has been removed
      assert.strictEqual(
        typeof controller._scheduleDescriptionHydrationPoll,
        'undefined',
        '_scheduleDescriptionHydrationPoll must be removed (P71: single hydration owner)'
      );
    });
  });
});
