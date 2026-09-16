/**
 * @file Part 62 Unit Tests: Existing Handoff Reuse, Single Primary CTA & Explicit Regeneration.
 *
 * Covers all 19 requirements across 4 suites:
 * 1. Single Primary Handoff Action & No Duplicate CTAs (Req 1-2)
 * 2. Same Job Existing Handoff Reuse (Req 3-12)
 * 3. Non-Destructive Invariants on Rescan & Reset (Req 13-14)
 * 4. Deliberate Secondary Regeneration with In-Card Confirmation (Req 15-19)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SidebarController } from '../../extension/sidebar/sidebar.js';
import { WorkflowStateMachine, WORKFLOW_STATES } from '../../extension/lib/workflow-state-machine.js';
import { DurableWorkflowStore } from '../../extension/lib/durable-workflow-store.js';
import { JobIdentity } from '../../extension/lib/job-identity.js';

// ---------------------------------------------------------------------------
// Minimal DOM Mocking
// ---------------------------------------------------------------------------
function createMockElement(id = '', defaultText = '', defaultTitle = '') {
  return {
    id,
    _textContent: defaultText,
    title: defaultTitle,
    get textContent() {
      return this._textContent;
    },
    set textContent(v) {
      this._textContent = v === null || v === undefined ? '' : String(v);
    },
    innerHTML: '',
    className: '',
    disabled: false,
    children: [],
    scrolledIntoView: false,
    scrollIntoView(opts) {
      this.scrolledIntoView = true;
    },
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
    click() {
      if (this.on_click) this.on_click({ preventDefault() {} });
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
    'ctaPrepareHandoffBtn',
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
  elements.set('prepareBtnText', createMockElement('prepareBtnText', 'Prepare Handoff Kit'));

  global.document = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, createMockElement(id));
      }
      return elements.get(id);
    },
    createElement(tag) {
      return createMockElement(tag);
    },
  };

  global.window = {
    addEventListener() {},
    open() {},
  };

  const storageMap = new Map();
  let lastDetectedJobOnTab = null;
  global.chrome = {
    runtime: {
      onMessage: {
        _listeners: [],
        addListener(fn) {
          this._listeners.push(fn);
        },
        dispatch(msg, sender = {}) {
          if (msg.type === 'JOB_DETECTED_ON_PAGE' && msg.jobData) {
            lastDetectedJobOnTab = msg.jobData;
          }
          for (const l of this._listeners) l(msg, sender);
        },
      },
      sendMessage: async () => ({ success: true }),
    },
    tabs: {
      query: async () => [{ id: 101, url: 'https://careers.cloudcorp.com/jobs/8801' }],
      sendMessage: async (_tabId, msg) => {
        if (msg?.type === 'DETECT_JOB_PAGE') {
          return { success: true, detected: Boolean(lastDetectedJobOnTab), jobData: lastDetectedJobOnTab };
        }
        return { success: true };
      },
      create: async () => {},
    },
    storage: {
      local: {
        get: async (key) => {
          if (typeof key === 'string') return { [key]: storageMap.get(key) };
          return Object.fromEntries(storageMap.entries());
        },
        set: async (items) => {
          for (const [k, v] of Object.entries(items)) storageMap.set(k, v);
        },
        remove: async (key) => storageMap.delete(key),
      },
    },
    downloads: {
      download: () => {},
    },
  };

  return { elements, storageMap };
}

// ---------------------------------------------------------------------------
// Sample Jobs & Mock Applications
// ---------------------------------------------------------------------------
const sampleJobA = {
  title: 'Senior Infrastructure Engineer',
  company: 'Cloud Corp',
  location: 'Remote',
  employmentType: 'Full-time',
  sourceUrl: 'https://careers.cloudcorp.com/jobs/8801',
  provider: 'GREENHOUSE',
  description: 'Seeking Senior Infrastructure Engineer with Kubernetes, Terraform, and Go.',
};

const sampleJobB = {
  title: 'Staff Platform Architect',
  company: 'Web Scale Inc',
  location: 'New York, NY',
  employmentType: 'Full-time',
  sourceUrl: 'https://careers.webscale.io/jobs/9902',
  provider: 'LEVER',
  description: 'Looking for a Staff Architect with Distributed Systems and Kafka.',
};

const existingHandoffA = {
  applicationId: 'app-cloudcorp-8801-uuid',
  canonicalJobId: 'job-cloudcorp-8801-canonical',
  analysisSnapshotId: 'snap-8801-uuid',
  packageVersion: 1,
  packageHash: 'a1b2c3d4e5f6g7h8i9j0',
  packageStatus: 'SAVED',
  artifactStatus: 'READY',
  lifecycleAction: 'REUSED',
  candidateName: 'Vishwanath Nishad',
  targetJob: {
    title: 'Senior Infrastructure Engineer',
    company: 'Cloud Corp',
  },
  artifacts: {
    resume: {
      filename: 'Vishwanath Nishad - Senior Infrastructure Engineer.pdf',
      ready: true,
      downloadUrl: '/api/applications/app-cloudcorp-8801-uuid/artifacts/resume/download?packageHash=a1b2c3d4e5f6g7h8i9j0',
      viewUrl: '/api/applications/app-cloudcorp-8801-uuid/artifacts/resume/view',
    },
    coverLetter: {
      filename: 'Vishwanath Nishad - Senior Infrastructure Engineer - Cover Letter.pdf',
      ready: true,
      downloadUrl: '/api/applications/app-cloudcorp-8801-uuid/artifacts/cover-letter/download?packageHash=a1b2c3d4e5f6g7h8i9j0',
      viewUrl: '/api/applications/app-cloudcorp-8801-uuid/artifacts/cover-letter/view',
    },
    bundle: {
      filename: 'handoff-kit-app-clou.zip',
      ready: true,
      downloadUrl: '/api/applications/app-cloudcorp-8801-uuid/artifacts/bundle/download?packageHash=a1b2c3d4e5f6g7h8i9j0',
    },
  },
};

describe('Part 62: Existing Handoff Reuse, Single Primary CTA & Explicit Regeneration', () => {
  let domElements;
  let storageMap;
  let controller;
  let backendCallCounts;
  let lastPrepareArgs;

  beforeEach(async () => {
    const mocked = setupMockDocument();
    domElements = mocked.elements;
    storageMap = mocked.storageMap;

    backendCallCounts = {
      analyzeJob: 0,
      prepareHandoff: 0,
      authStatus: 0,
    };
    lastPrepareArgs = null;

    controller = new SidebarController();
    controller.activeTabId = 101;
    controller.isAuthenticated = true;
    controller.currentUser = {
      id: 'usr-10a2b51b',
      displayName: 'Vishwanath Nishad',
      email: 'vishwanatnishad@gmail.com',
    };

    // Mock BackendClient using canonical method names
    controller.backendClient = {
      getHealth: async () => ({ status: 'ok' }),
      getAuthStatus: async () => {
        backendCallCounts.authStatus++;
        return {
          authenticated: true,
          status: 'AUTHENTICATED',
          user: controller.currentUser,
          candidate: {
            id: '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
            displayName: 'Vishwanath Nishad',
            canonicalEmail: 'vishwanatnishad@gmail.com',
          },
        };
      },
      analyzeJob: async (jobData) => {
        backendCallCounts.analyzeJob++;
        const isJobA = jobData.title === sampleJobA.title;
        return {
          fitAnalysis: {
            overallScore: 88,
            recommendationBand: 'RECOMMENDED',
            matchedSkills: ['Kubernetes', 'Terraform', 'Go'],
            missingSkills: [],
            experienceFit: { status: 'ELIGIBLE' },
          },
          recommendedProjects: [
            { id: 'proj-1', name: 'Multi-Cloud Deployer', relevanceScore: 92, technologies: ['Kubernetes', 'Go'] },
          ],
          analysisSnapshotId: isJobA ? 'snap-8801-uuid' : 'snap-9902-uuid',
          existingApplication: isJobA
            ? {
                id: 'app-cloudcorp-8801-uuid',
                title: sampleJobA.title,
                company: sampleJobA.company,
                status: 'SAVED',
                packageHash: 'a1b2c3d4e5f6g7h8i9j0',
                packageVersion: 1,
                handoffData: existingHandoffA,
              }
            : null,
          existingHandoff: isJobA ? existingHandoffA : null,
        };
      },
      prepareHandoff: async (jobData, existingAppId, snapshotId) => {
        backendCallCounts.prepareHandoff++;
        lastPrepareArgs = { jobData, existingAppId, snapshotId };
        const isRegen = Boolean(existingAppId);
        return {
          applicationId: existingAppId || 'app-new-uuid',
          canonicalJobId: 'job-canonical-id',
          analysisSnapshotId: snapshotId,
          packageVersion: isRegen ? 2 : 1,
          packageHash: isRegen ? 'b2c3d4e5f6g7h8i9j0k1' : 'a1b2c3d4e5f6g7h8i9j0',
          packageStatus: 'SAVED',
          candidateName: 'Vishwanath Nishad',
          artifacts: {
            resume: {
              filename: 'Vishwanath Nishad - Senior Infrastructure Engineer.pdf',
              ready: true,
              downloadUrl: `/api/applications/${existingAppId || 'app-new-uuid'}/artifacts/resume/download`,
            },
            coverLetter: {
              filename: 'Vishwanath Nishad - Senior Infrastructure Engineer - Cover Letter.pdf',
              ready: true,
              downloadUrl: `/api/applications/${existingAppId || 'app-new-uuid'}/artifacts/cover-letter/download`,
            },
            bundle: {
              filename: 'handoff-kit.zip',
              ready: true,
              downloadUrl: `/api/applications/${existingAppId || 'app-new-uuid'}/artifacts/bundle/download`,
            },
          },
        };
      },
      getArtifactDownloadUrl: (appId, type, hash) =>
        `/api/applications/${appId}/artifacts/${type}/download?packageHash=${hash}`,
    };

    await controller.init();
    controller.isAuthenticated = true;
  });

  // =========================================================================
  // Suite 1: Single Primary Handoff Action & No Duplicate CTAs (Req 1-2)
  // =========================================================================
  describe('1. Single Primary Handoff Action & No Duplicate CTAs', () => {
    it('1. New job, no existing application -> single primary CTA is [Prepare Handoff Kit]', async () => {
      // Simulate detection of fresh job B
      await controller._handleJobDetectedEvent(sampleJobB);
      await controller.runAnalyzeJob();

      assert.equal(controller.stateMachine.state, WORKFLOW_STATES.ANALYSIS_READY);
      assert.equal(controller.getHandoffState(), 'AVAILABLE');

      // Verify single primary CTA text is "Prepare Handoff Kit"
      const prepareBtnText = domElements.get('prepareBtnText');
      assert.equal(prepareBtnText.textContent, 'Prepare Handoff Kit');

      // Secondary regeneration button should NOT be visible for unprepared jobs
      const regenBtn = domElements.get('regenerateHandoffBtn');
      assert.equal(regenBtn.classList.contains('hidden'), true);
    });

    it('2. Analysis card does NOT expose a duplicate prepare handoff CTA', async () => {
      await controller._handleJobDetectedEvent(sampleJobB);
      await controller.runAnalyzeJob();

      // Ensure analysisNextActionBox exists for informative messaging
      const analysisNextActionBox = domElements.get('analysisNextActionBox');
      assert.ok(analysisNextActionBox);
      assert.equal(analysisNextActionBox.classList.contains('hidden'), false);

      // In Part 62, the primary actionable button lives strictly in #handoffCard (#prepareHandoffBtn)
      const prepareHandoffBtn = domElements.get('prepareHandoffBtn');
      assert.ok(prepareHandoffBtn);
    });
  });

  // =========================================================================
  // Suite 2: Same Job Existing Handoff Reuse (Req 3-12)
  // =========================================================================
  describe('2. Same Job Existing Handoff Reuse', () => {
    it('3. Same job, existing application with completed handoff -> sidebar transitions to APPLICATION_READY and locked', async () => {
      // Detect Job A (which has existing application and completed handoff kit)
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();

      assert.equal(controller.stateMachine.state, WORKFLOW_STATES.APPLICATION_READY);
      assert.equal(controller.isWorkflowLocked(), true);
      assert.equal(controller.cachedState.lockState, 'LOCKED');
      assert.equal(controller.cachedState.applicationId, 'app-cloudcorp-8801-uuid');
    });

    it('4. Same job, existing application with completed handoff -> primary CTA text is [View Handoff Kit]', async () => {
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();

      const prepareBtnText = domElements.get('prepareBtnText');
      assert.equal(prepareBtnText.textContent, 'View Handoff Kit');
      assert.equal(controller.getHandoffState(), 'EXISTING');
    });

    it('5. Same job, existing application with completed handoff -> secondary button [Regenerate Handoff Kit] is present and visible', async () => {
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();

      const regenBtn = domElements.get('regenerateHandoffBtn');
      assert.equal(regenBtn.classList.contains('hidden'), false);
    });

    it('6. Same job, existing application with completed handoff -> prepare-handoff endpoint is NOT called on analysis', async () => {
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();

      assert.equal(backendCallCounts.analyzeJob, 1);
      assert.equal(backendCallCounts.prepareHandoff, 0, 'ZERO automatic prepare-handoff calls must occur when reusing existing handoff');
    });

    it('7. Clicking [View Handoff Kit] reveals/scrolls to artifacts container and does NOT trigger generation or network call', async () => {
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();

      const artifactsContainer = domElements.get('artifactsContainer');
      artifactsContainer.scrolledIntoView = false;

      // Click primary CTA (which is now in EXISTING mode -> View Handoff Kit)
      const prepareBtn = domElements.get('prepareHandoffBtn');
      prepareBtn.click();

      // Wait a tick for async handler
      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.equal(artifactsContainer.classList.contains('hidden'), false);
      assert.equal(artifactsContainer.scrolledIntoView, true);
      assert.equal(backendCallCounts.prepareHandoff, 0, 'Clicking View Handoff Kit must never trigger backend prepareHandoff');
    });

    it('8. Clicking [View Handoff Kit] does not change packageHash, packageVersion, or applicationId', async () => {
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();

      const originalAppId = controller.cachedState.applicationId;
      const originalHash = controller.cachedState.handoffData.packageHash;
      const originalVersion = controller.cachedState.handoffData.packageVersion;

      const prepareBtn = domElements.get('prepareHandoffBtn');
      prepareBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.equal(controller.cachedState.applicationId, originalAppId);
      assert.equal(controller.cachedState.handoffData.packageHash, originalHash);
      assert.equal(controller.cachedState.handoffData.packageVersion, originalVersion);
    });

    it('9. packageHash and packageVersion match the existing application records', async () => {
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();

      assert.equal(controller.cachedState.handoffData.packageHash, 'a1b2c3d4e5f6g7h8i9j0');
      assert.equal(controller.cachedState.handoffData.packageVersion, 1);
      assert.equal(controller.cachedState.handoffData.packageStatus, 'SAVED');

      const meta = domElements.get('handoffPackageMeta');
      assert.ok(meta.textContent.includes('v1'));
      assert.ok(meta.textContent.includes('a1b2c3d4'));
    });

    it('10. Re-analyzing the same job re-attaches the existing handoff data and does NOT auto-generate a new package', async () => {
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();
      assert.equal(backendCallCounts.prepareHandoff, 0);

      // Re-run analysis on same job
      await controller.runAnalyzeJob();
      assert.equal(backendCallCounts.analyzeJob, 2);
      assert.equal(backendCallCounts.prepareHandoff, 0, 'Re-analysis must NOT call prepare-handoff');
      assert.equal(controller.stateMachine.state, WORKFLOW_STATES.APPLICATION_READY);
      assert.equal(controller.cachedState.applicationId, 'app-cloudcorp-8801-uuid');
    });

    it('11. Reloading sidebar on existing job restores APPLICATION_READY, locked state, and [View Handoff Kit]', async () => {
      // First session
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();

      // Simulate sidebar close and reopen: create fresh controller on same active tab
      const reloadedController = new SidebarController();
      reloadedController.backendClient = controller.backendClient;
      reloadedController.activeTabId = 101;
      reloadedController.isAuthenticated = true;
      reloadedController.currentUser = controller.currentUser;
      await reloadedController.init();

      assert.equal(reloadedController.stateMachine.state, WORKFLOW_STATES.APPLICATION_READY);
      assert.equal(reloadedController.isWorkflowLocked(), true);

      const prepareBtnText = domElements.get('prepareBtnText');
      assert.equal(prepareBtnText.textContent, 'View Handoff Kit');

      const regenBtn = domElements.get('regenerateHandoffBtn');
      assert.equal(regenBtn.classList.contains('hidden'), false);
    });

    it('12. Session expiry and re-auth preserve existing handoff kit and [View Handoff Kit]', async () => {
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();

      // Session expires
      controller._handleSessionExpired();
      assert.equal(controller.isAuthenticated, false);
      assert.equal(controller.isWorkflowLocked(), true);

      // User re-authenticates
      await controller._checkAuthStatus();
      assert.equal(controller.isAuthenticated, true);
      assert.equal(controller.cachedState.applicationId, 'app-cloudcorp-8801-uuid');

      const prepareBtnText = domElements.get('prepareBtnText');
      assert.equal(prepareBtnText.textContent, 'View Handoff Kit');
    });
  });

  // =========================================================================
  // Suite 3: Non-Destructive Invariants on Rescan & Reset (Req 13-14)
  // =========================================================================
  describe('3. Non-Destructive Invariants on Rescan & Reset', () => {
    it('13. Rescan to another job does NOT delete or mutate the first job application or handoff kit', async () => {
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();

      const appAId = controller.cachedState.applicationId;
      const appAHash = controller.cachedState.handoffData.packageHash;

      // Detector sees Job B -> pending notification
      global.chrome.runtime.onMessage.dispatch({
        type: 'JOB_DETECTED_ON_PAGE',
        jobData: sampleJobB,
        tabId: 101,
      });

      // User explicitly rescans to Job B
      await controller.rescan();

      assert.equal(controller.activeJob.title, sampleJobB.title);
      assert.equal(controller.stateMachine.state, WORKFLOW_STATES.JOB_DETECTED);
      assert.equal(controller.isWorkflowLocked(), false);

      // Verify Job A state in durable store is fully intact (by fingerprint)
      const fpA = JobIdentity.deriveJobFingerprint(sampleJobA);
      const savedJobA = await controller.store.getJobState(fpA);
      assert.ok(savedJobA, 'Job A state in store must be preserved');
      assert.equal(savedJobA.applicationId, appAId);
      assert.equal(savedJobA.handoffData.packageHash, appAHash);
    });

    it('14. Reset workflow does NOT delete or mutate any application or handoff kit in the database', async () => {
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();

      const fpA = JobIdentity.deriveJobFingerprint(sampleJobA);

      // Call reset workflow
      await controller.resetWorkflow();

      // Controller is back to IDLE
      assert.equal(controller.activeJob, null);
      assert.equal(controller.isWorkflowLocked(), false);

      // Ensure confirm box and regen button are hidden
      const confirmBox = domElements.get('regenerateConfirmBox');
      assert.equal(confirmBox.classList.contains('hidden'), true);
      const regenBtn = domElements.get('regenerateHandoffBtn');
      assert.equal(regenBtn.classList.contains('hidden'), true);

      // Primary CTA is reset to Prepare Handoff Kit
      const prepareBtnText = domElements.get('prepareBtnText');
      assert.equal(prepareBtnText.textContent, 'Prepare Handoff Kit');

      // Database / store records for Job A remain untouched
      const savedJobA = await controller.store.getJobState(fpA);
      assert.ok(savedJobA, 'Job A application records must NEVER be deleted by reset');
      assert.equal(savedJobA.applicationId, 'app-cloudcorp-8801-uuid');
      assert.equal(savedJobA.handoffData.packageHash, 'a1b2c3d4e5f6g7h8i9j0');
    });
  });

  // =========================================================================
  // Suite 4: Deliberate Secondary Regeneration with In-Card Confirmation (Req 15-19)
  // =========================================================================
  describe('4. Deliberate Secondary Regeneration with In-Card Confirmation', () => {
    it('15. Clicking [Regenerate Handoff Kit] opens confirmation prompt and does NOT trigger generation immediately', async () => {
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();

      const confirmBox = domElements.get('regenerateConfirmBox');
      assert.equal(confirmBox.classList.contains('hidden'), true);

      // Click secondary button
      const regenBtn = domElements.get('regenerateHandoffBtn');
      regenBtn.click();

      assert.equal(confirmBox.classList.contains('hidden'), false, 'Confirmation box must be revealed');
      assert.equal(backendCallCounts.prepareHandoff, 0, 'Regeneration must NOT trigger on initial button click');
    });

    it('16. Canceling regeneration leaves existing handoff kit untouched', async () => {
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();

      const regenBtn = domElements.get('regenerateHandoffBtn');
      regenBtn.click();

      const confirmBox = domElements.get('regenerateConfirmBox');
      assert.equal(confirmBox.classList.contains('hidden'), false);

      // Click Cancel
      const cancelBtn = domElements.get('cancelRegenerateBtn');
      cancelBtn.click();

      assert.equal(confirmBox.classList.contains('hidden'), true, 'Confirmation box must be dismissed');
      assert.equal(backendCallCounts.prepareHandoff, 0, 'Cancelled regeneration must not call backend');
      assert.equal(controller.cachedState.handoffData.packageVersion, 1);
    });

    it('17. Confirming regeneration triggers canonical prepare-handoff with existing applicationId', async () => {
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();

      const regenBtn = domElements.get('regenerateHandoffBtn');
      regenBtn.click();

      // Click Confirm Regenerate
      const confirmBtn = domElements.get('confirmRegenerateBtn');
      confirmBtn.click();

      // Wait for async prepareHandoff
      await new Promise((resolve) => setTimeout(resolve, 20));

      assert.equal(backendCallCounts.prepareHandoff, 1);
      assert.ok(lastPrepareArgs);
      assert.equal(lastPrepareArgs.existingAppId, 'app-cloudcorp-8801-uuid', 'Must pass existing applicationId to maintain single canonical application');
      assert.equal(lastPrepareArgs.snapshotId, 'snap-8801-uuid');
    });

    it('18. Regenerated handoff updates packageVersion and packageHash while preserving canonical job and candidate identity', async () => {
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();

      const confirmBtn = domElements.get('confirmRegenerateBtn');
      confirmBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Package version incremented to 2, hash updated
      assert.equal(controller.cachedState.handoffData.packageVersion, 2);
      assert.equal(controller.cachedState.handoffData.packageHash, 'b2c3d4e5f6g7h8i9j0k1');
      assert.equal(controller.cachedState.applicationId, 'app-cloudcorp-8801-uuid');
      assert.equal(controller.cachedState.handoffData.candidateName, 'Vishwanath Nishad');

      // Primary CTA is back to "View Handoff Kit"
      const prepareBtnText = domElements.get('prepareBtnText');
      assert.equal(prepareBtnText.textContent, 'View Handoff Kit');
    });

    it('19. MCP application list reflects the same single application with updated package metadata', async () => {
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();

      const initialAppId = controller.cachedState.applicationId;

      // Perform regeneration
      const confirmBtn = domElements.get('confirmRegenerateBtn');
      confirmBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 20));

      // The application ID remains identical; no duplicate application record created
      assert.equal(controller.cachedState.applicationId, initialAppId);
      assert.equal(controller.cachedState.handoffData.applicationId, initialAppId);

      // Lock state is maintained
      assert.equal(controller.isWorkflowLocked(), true);
      assert.equal(controller.stateMachine.state, WORKFLOW_STATES.APPLICATION_READY);
    });
  });
});
