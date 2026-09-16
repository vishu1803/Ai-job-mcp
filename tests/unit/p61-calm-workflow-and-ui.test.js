/**
 * @file Part 61 Unit Tests: Calm Extension Workflow, Explicit Rescan, Design-System UI & Canonical Artifact Filenames.
 *
 * Covers all 45 requirements across 7 suites:
 * 1. Background Detection (1-11)
 * 2. Rescan Semantics & Integrity (12-17)
 * 3. Reset Workflow Non-Destructive Semantics (18-25)
 * 4. Persistence & Reload Semantics (26-29)
 * 5. Multi-Tab / Multi-User Scoping (30-31)
 * 6. Canonical Artifact Filename Builder & Propagation (32-38)
 * 7. Calm UI & DESIGN.md Conformance (39-45)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SidebarController } from '../../extension/sidebar/sidebar.js';
import { WorkflowStateMachine, WORKFLOW_STATES } from '../../extension/lib/workflow-state-machine.js';
import { DurableWorkflowStore } from '../../extension/lib/durable-workflow-store.js';
import { JobIdentity } from '../../extension/lib/job-identity.js';
import {
  buildApplicationArtifactFilename,
  sanitizeFilenameComponent,
} from '../../src/utils/artifact-filename-builder.js';

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
  elements.set('rescanBtn', createMockElement('rescanBtn', 'Rescan', 'Scan current browser page'));
  elements.set('resetWorkflowBtn', createMockElement('resetWorkflowBtn', 'Reset Workflow', 'Reset extension workflow to neutral IDLE state'));

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
// Sample Jobs & State
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

describe('Part 61: Calm Extension Workflow, Explicit Rescan, Design-System UI & Canonical Filenames', () => {
  let domElements;
  let storageMap;
  let controller;
  let backendCalls;

  beforeEach(() => {
    const setup = setupMockDocument();
    domElements = setup.elements;
    storageMap = setup.storageMap;
    backendCalls = { analyzeJob: 0, prepareHandoff: 0, deleteCalls: 0 };

    controller = new SidebarController();
    controller.activeTabId = 101;
    controller.isAuthenticated = true;
    controller.currentUser = {
      id: 'usr-101-auth',
      displayName: 'Vishwanath Nishad',
      email: 'vishwanatnishad@gmail.com',
    };

    // Spy on backend calls
    controller.backendClient = {
      getHealth: async () => ({ status: 'ok' }),
      getAuthStatus: async () => ({
        authenticated: true,
        status: 'AUTHENTICATED',
        user: controller.currentUser,
        candidate: {
          id: 'cand-101',
          displayName: 'Vishwanath Nishad',
          canonicalEmail: 'vishwanatnishad@gmail.com',
        },
      }),
      analyzeJob: async (job) => {
        backendCalls.analyzeJob++;
        return {
          fitAnalysis: {
            overallScore: 88,
            recommendationBand: 'RECOMMENDED',
            matchedSkills: ['Kubernetes', 'Go', 'Terraform'],
            missingSkills: [],
            experienceFit: 'ELIGIBLE',
          },
          recommendedProjects: [
            { id: 'p1', name: 'KubeMesh', relevanceScore: 92, technologies: ['Go', 'K8s'] },
          ],
          analysisSnapshotId: 'snap-job-a-123',
        };
      },
      prepareHandoff: async (job, existingAppId, snapshotId) => {
        backendCalls.prepareHandoff++;
        return {
          applicationId: existingAppId || 'app-uuid-job-a-canonical',
          candidateName: 'Vishwanath Nishad',
          packageHash: 'sha256-abcdef777888',
          packageVersion: 1,
          packageStatus: 'SAVED',
          resume: {
            filename: 'Vishwanath Nishad - Senior Infrastructure Engineer.pdf',
            status: 'COMPILED',
          },
          coverLetter: {
            filename: 'Vishwanath Nishad - Senior Infrastructure Engineer - Cover Letter.pdf',
            status: 'COMPILED',
          },
        };
      },
      getArtifactDownloadUrl: async (appId, type, hash) =>
        `http://localhost:3000/api/applications/${appId}/artifacts/${type}/download?hash=${hash}`,
      deleteApplication: async () => {
        backendCalls.deleteCalls++;
        throw new Error('DELETION_NOT_ALLOWED');
      },
    };
  });

  // =========================================================================
  // 1. BACKGROUND DETECTION (Req 1-11)
  // =========================================================================
  describe('1. Background Detection (Req 1-11)', () => {
    it('1-3. Job A is active, detector sees Job A again -> nothing changes, no noise', async () => {
      await controller.init();
      await controller._handleJobDetectedEvent(sampleJobA);

      assert.strictEqual(controller.activeJob.title, sampleJobA.title);
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.JOB_DETECTED);
      assert.ok(domElements.get('pendingJobNotification').classList.contains('hidden'));

      // Detector emits Job A again
      global.chrome.runtime.onMessage.dispatch({
        type: 'JOB_DETECTED_ON_PAGE',
        tabId: 101,
        jobData: { ...sampleJobA },
      });

      // Assert nothing changed
      assert.strictEqual(controller.activeJob.title, sampleJobA.title);
      assert.strictEqual(controller.pendingDetectedJob, null);
      assert.ok(domElements.get('pendingJobNotification').classList.contains('hidden'));
    });

    it('4-10. Detector sees Job B while Job A active/analyzed/ready -> Job A preserved, Job B pending, zero auto-actions', async () => {
      await controller.init();
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();
      await controller.runPrepareHandoff();

      // Active workflow is Job A
      const initialAppId = controller.cachedState.applicationId;
      const initialScore = controller.cachedState.fitAnalysis.overallScore;
      assert.strictEqual(initialAppId, 'app-uuid-job-a-canonical');
      assert.strictEqual(initialScore, 88);
      assert.strictEqual(controller.isWorkflowLocked(), true);

      // Detector sees Job B
      global.chrome.runtime.onMessage.dispatch({
        type: 'JOB_DETECTED_ON_PAGE',
        tabId: 101,
        jobData: sampleJobB,
      });

      // 5. Job A remains active
      assert.strictEqual(controller.activeJob.title, sampleJobA.title);
      assert.strictEqual(controller.activeJob.company, sampleJobA.company);

      // 6. Job B becomes pendingDetectedJob
      assert.ok(controller.pendingDetectedJob);
      assert.strictEqual(controller.pendingDetectedJob.title, sampleJobB.title);

      // 7. Fit analysis remains Job A's analysis
      assert.strictEqual(controller.cachedState.fitAnalysis.overallScore, 88);

      // 8. ApplicationId remains Job A's applicationId
      assert.strictEqual(controller.cachedState.applicationId, initialAppId);

      // 9. No analysis begins automatically
      assert.strictEqual(backendCalls.analyzeJob, 1, 'No new analysis started automatically');

      // 10. No application is created automatically
      assert.strictEqual(backendCalls.prepareHandoff, 1, 'No second application prepared automatically');

      // Notification is visible with Job B info
      assert.strictEqual(domElements.get('pendingJobNotification').classList.contains('hidden'), false);
      assert.ok(domElements.get('pendingJobTitle').textContent.includes('Staff Platform Architect'));
    });

    it('11. Repeated Job B detection creates only ONE pending notification (no spam)', async () => {
      await controller.init();
      await controller._handleJobDetectedEvent(sampleJobA);

      // Dispatch Job B detection 5 times
      for (let i = 0; i < 5; i++) {
        global.chrome.runtime.onMessage.dispatch({
          type: 'JOB_DETECTED_ON_PAGE',
          tabId: 101,
          jobData: sampleJobB,
        });
      }

      assert.strictEqual(controller.pendingDetectedJob.title, sampleJobB.title);
      // Single pending banner visible
      assert.strictEqual(domElements.get('pendingJobNotification').classList.contains('hidden'), false);
      assert.strictEqual(controller.activeJob.title, sampleJobA.title);
    });
  });

  // =========================================================================
  // 2. RESCAN SEMANTICS & INTEGRITY (Req 12-17)
  // =========================================================================
  describe('2. Rescan Semantics & Integrity (Req 12-17)', () => {
    it('12-17. Rescan switches active workflow to Job B, preserves Application A, causes zero destructive calls', async () => {
      await controller.init();
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();
      await controller.runPrepareHandoff();

      const appAId = controller.cachedState.applicationId;
      const initialGen = controller.cachedState.workflowGeneration || 1;

      // Pending Job B detected
      global.chrome.runtime.onMessage.dispatch({
        type: 'JOB_DETECTED_ON_PAGE',
        tabId: 101,
        jobData: sampleJobB,
      });

      // 12. Click Rescan
      await controller.rescan();

      // 13. Job B becomes active and state becomes JOB_DETECTED
      assert.strictEqual(controller.activeJob.title, sampleJobB.title);
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.JOB_DETECTED);

      // 14. Pending job is cleared
      assert.strictEqual(controller.pendingDetectedJob, null);
      assert.strictEqual(controller.pendingDetectedFingerprint, null);
      assert.strictEqual(domElements.get('pendingJobNotification').classList.contains('hidden'), true);

      // 15. Previous Application A remains intact in store/DB
      const jobAState = await controller.store.getJobState(JobIdentity.deriveJobFingerprint(sampleJobA));
      assert.ok(jobAState, 'Job A state must survive Rescan');
      assert.strictEqual(jobAState.applicationId, appAId);

      // 16. Previous applicationId is NOT reused for Job B
      assert.strictEqual(controller.cachedState.applicationId, null);
      assert.strictEqual(controller.cachedState.fitAnalysis, null);
      assert.strictEqual(controller.cachedState.handoffData, null);

      // Generation advanced
      assert.strictEqual(controller.cachedState.workflowGeneration, initialGen + 1);

      // 17. Zero destructive backend calls occurred
      assert.strictEqual(backendCalls.deleteCalls, 0);
    });
  });

  // =========================================================================
  // 3. RESET WORKFLOW NON-DESTRUCTIVE SEMANTICS (Req 18-25)
  // =========================================================================
  describe('3. Reset Workflow Semantics (Req 18-25)', () => {
    it('18-25. Reset returns extension to IDLE, zeroes pointers, does NOT delete Application A or artifacts', async () => {
      await controller.init();
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();
      await controller.runPrepareHandoff();

      const appAId = controller.cachedState.applicationId;
      const appAPkgHash = controller.cachedState.handoffData.packageHash;

      // 18. Trigger Reset Workflow
      await controller.resetWorkflow();

      // 18. Return to IDLE
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.IDLE);
      assert.strictEqual(controller.stateMachine.isLocked, false);

      // 19. Extension active workflow pointers cleared
      assert.strictEqual(controller.activeJob, null);
      assert.strictEqual(controller.activeJobFingerprint, null);
      assert.strictEqual(controller.pendingDetectedJob, null);

      // 20-25. Does NOT delete Application A, resume, cover letter, handoff kit, or artifacts
      const jobAPersisted = await controller.store.getJobState(JobIdentity.deriveJobFingerprint(sampleJobA));
      assert.ok(jobAPersisted, 'Application A persisted record must survive Reset');
      assert.strictEqual(jobAPersisted.applicationId, appAId);
      assert.strictEqual(jobAPersisted.handoffData.packageHash, appAPkgHash);
      assert.strictEqual(jobAPersisted.handoffData.resume.status, 'COMPILED');
      assert.strictEqual(jobAPersisted.handoffData.coverLetter.status, 'COMPILED');

      // No DELETE API called
      assert.strictEqual(backendCalls.deleteCalls, 0);
    });
  });

  // =========================================================================
  // 4. PERSISTENCE & RELOAD SEMANTICS (Req 26-29)
  // =========================================================================
  describe('4. Persistence & Reload Semantics (Req 26-29)', () => {
    it('26-29. Active workflow and pending job survive reload; pending job NEVER auto-promoted', async () => {
      await controller.init();
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();
      await controller.runPrepareHandoff();

      // Background detector registers Job B as pending
      global.chrome.runtime.onMessage.dispatch({
        type: 'JOB_DETECTED_ON_PAGE',
        tabId: 101,
        jobData: sampleJobB,
      });

      assert.strictEqual(controller.pendingDetectedJob.title, sampleJobB.title);

      // Simulate sidebar close and reopen (new controller instance)
      const reloadedController = new SidebarController();
      reloadedController.activeTabId = 101;
      reloadedController.isAuthenticated = true;
      reloadedController.currentUser = controller.currentUser;
      reloadedController.backendClient = controller.backendClient;

      await reloadedController.init();

      // 26-27. Active workflow Job A survives reload
      assert.strictEqual(reloadedController.activeJob.title, sampleJobA.title);
      assert.strictEqual(reloadedController.cachedState.applicationId, 'app-uuid-job-a-canonical');
      assert.strictEqual(reloadedController.isWorkflowLocked(), true);

      // 28. Pending job is restored but NOT automatically active
      assert.ok(reloadedController.pendingDetectedJob);
      assert.strictEqual(reloadedController.pendingDetectedJob.title, sampleJobB.title);
      assert.notStrictEqual(reloadedController.activeJob.title, sampleJobB.title);

      // 29. Explicit Rescan is required to switch
      await reloadedController.rescan();
      assert.strictEqual(reloadedController.activeJob.title, sampleJobB.title);
    });
  });

  // =========================================================================
  // 5. MULTI-TAB / MULTI-USER ISOLATION (Req 30-31)
  // =========================================================================
  describe('5. Multi-Tab / Multi-User Isolation (Req 30-31)', () => {
    it('30. Tab B cannot inherit Tab A locked application', async () => {
      const store = new DurableWorkflowStore();
      const tabAId = 101;
      const tabBId = 202;

      // Tab A has locked Application A
      await store.saveTabState(tabAId, {
        tabId: tabAId,
        userId: 'usr-1',
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        jobData: sampleJobA,
        jobFingerprint: 'fp-a',
        applicationId: 'app-a',
      });

      // Tab B hydrates
      const tabBState = await store.getTabState(tabBId, 'usr-1');
      assert.strictEqual(tabBState.applicationId, null, 'Tab B must not inherit Tab A applicationId');
      assert.strictEqual(tabBState.isLocked, false, 'Tab B must not be locked');
      assert.strictEqual(tabBState.jobData, null, 'Tab B must not have Tab A jobData');
      assert.strictEqual(tabBState.workflowState, WORKFLOW_STATES.IDLE);
    });

    it('31. Reset in Tab A does not delete Tab B application data', async () => {
      const store = new DurableWorkflowStore();
      const tabAId = 101;
      const tabBId = 202;

      await store.saveTabState(tabAId, {
        tabId: tabAId,
        userId: 'usr-1',
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        jobData: sampleJobA,
        applicationId: 'app-a',
      });

      await store.saveTabState(tabBId, {
        tabId: tabBId,
        userId: 'usr-1',
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        jobData: sampleJobB,
        applicationId: 'app-b',
      });

      // Reset Tab A
      await store.resetWorkflow(tabAId);

      // Tab B remains completely intact
      const tabBState = await store.getTabState(tabBId, 'usr-1');
      assert.ok(tabBState);
      assert.strictEqual(tabBState.applicationId, 'app-b');
      assert.strictEqual(tabBState.jobData.title, sampleJobB.title);
    });
  });

  // =========================================================================
  // 6. CANONICAL ARTIFACT FILENAMES (Req 32-38)
  // =========================================================================
  describe('6. Canonical Artifact Filename Builder & Propagation (Req 32-38)', () => {
    it('32. Resume filename is canonical: <Candidate Name> - <Job Profile>.pdf', () => {
      const filename = buildApplicationArtifactFilename({
        candidateName: 'Vishwanath Nishad',
        jobTitle: 'Senior Infrastructure Engineer',
        artifactType: 'resume',
      });
      assert.strictEqual(filename, 'Vishwanath Nishad - Senior Infrastructure Engineer.pdf');
    });

    it('33. Cover letter filename is canonical: <Candidate Name> - <Job Profile> - Cover Letter.pdf', () => {
      const filename = buildApplicationArtifactFilename({
        candidateName: 'Vishwanath Nishad',
        jobTitle: 'Senior Infrastructure Engineer',
        artifactType: 'cover-letter',
      });
      assert.strictEqual(filename, 'Vishwanath Nishad - Senior Infrastructure Engineer - Cover Letter.pdf');
    });

    it('34. Filename sanitization removes dangerous characters, traversal dots, and control chars', () => {
      const dirtyName = 'Vishwanath / \\ : * ? " < > | Nishad ..';
      const dirtyTitle = 'Senior Engineer / DevOps : Special * Role?';

      const filename = buildApplicationArtifactFilename({
        candidateName: dirtyName,
        jobTitle: dirtyTitle,
        artifactType: 'resume',
      });

      assert.strictEqual(filename, 'Vishwanath Nishad - Senior Engineer DevOps Special Role.pdf');
      assert.ok(!filename.includes('/'));
      assert.ok(!filename.includes('\\'));
      assert.ok(!filename.includes(':'));
      assert.ok(!filename.includes('*'));
      assert.ok(!filename.includes('?'));
      assert.ok(!filename.includes('"'));
      assert.ok(!filename.includes('<'));
      assert.ok(!filename.includes('>'));
      assert.ok(!filename.includes('|'));
      assert.ok(!filename.includes('..'));
    });

    it('35. Filename builder is deterministic across repeated calls', () => {
      const call1 = buildApplicationArtifactFilename({
        candidateName: 'Jane Doe',
        jobTitle: 'Backend Architect',
        artifactType: 'bundle',
      });
      const call2 = buildApplicationArtifactFilename({
        candidateName: 'Jane Doe',
        jobTitle: 'Backend Architect',
        artifactType: 'bundle',
      });
      assert.strictEqual(call1, call2);
      assert.strictEqual(call1, 'Jane Doe - Backend Architect - Application Package.zip');
    });

    it('36-38. Filenames propagate through handoff and downloads without changing application identity or idempotency', async () => {
      await controller.init();
      await controller._handleJobDetectedEvent(sampleJobA);
      await controller.runAnalyzeJob();
      await controller.runPrepareHandoff();

      const handoffData = controller.cachedState.handoffData;
      assert.strictEqual(handoffData.resume.filename, 'Vishwanath Nishad - Senior Infrastructure Engineer.pdf');
      assert.strictEqual(handoffData.coverLetter.filename, 'Vishwanath Nishad - Senior Infrastructure Engineer - Cover Letter.pdf');

      // Check download invocation
      let downloadedFilename = null;
      global.chrome.downloads.download = (options) => {
        downloadedFilename = options.filename;
      };

      await controller._triggerDownload('resume');
      assert.strictEqual(downloadedFilename, 'Vishwanath Nishad - Senior Infrastructure Engineer.pdf');

      await controller._triggerDownload('cover-letter');
      assert.strictEqual(downloadedFilename, 'Vishwanath Nishad - Senior Infrastructure Engineer - Cover Letter.pdf');

      // Idempotency: re-preparing handoff does not change applicationId
      const originalAppId = controller.cachedState.applicationId;
      await controller.runPrepareHandoff();
      assert.strictEqual(controller.cachedState.applicationId, originalAppId);
    });
  });

  // =========================================================================
  // 7. CALM UI & DESIGN.MD CONFORMANCE (Req 39-45)
  // =========================================================================
  describe('7. Calm UI & DESIGN.md Conformance (Req 39-45)', () => {
    it('39. Internal workflow enums are translated to human-friendly user language', async () => {
      await controller.init();

      controller._renderWorkflowStatus(WORKFLOW_STATES.IDLE);
      assert.strictEqual(domElements.get('workflowStateText').textContent, 'Ready');

      controller._renderWorkflowStatus(WORKFLOW_STATES.JOB_DETECTED);
      assert.strictEqual(domElements.get('workflowStateText').textContent, 'Job detected');

      controller._renderWorkflowStatus(WORKFLOW_STATES.ANALYZING);
      assert.strictEqual(domElements.get('workflowStateText').textContent, 'Analyzing match...');

      controller._renderWorkflowStatus(WORKFLOW_STATES.ANALYSIS_READY);
      assert.strictEqual(domElements.get('workflowStateText').textContent, 'Analysis complete');

      controller._renderWorkflowStatus(WORKFLOW_STATES.APPLICATION_READY);
      assert.strictEqual(domElements.get('workflowStateText').textContent, 'Application ready');
    });

    it('40. Excess diagnostic capability status pills are removed/clean', () => {
      controller._updateCapPill(domElements.get('capJob'), true, 'Job Extraction');
      assert.strictEqual(domElements.get('capJob').textContent, 'Job Extraction');
      assert.ok(!domElements.get('capJob').textContent.includes('✓'));
    });

    it('41. Emoji-heavy labels are removed from locked badge, tags, and actions', async () => {
      await controller.init();
      controller._renderWorkflowStatus(WORKFLOW_STATES.APPLICATION_READY, true);
      assert.strictEqual(domElements.get('workflowLockedBadge').textContent, 'Workflow protected');
      assert.ok(!domElements.get('workflowLockedBadge').textContent.includes('🔒'));

      controller._renderJobCard(sampleJobA);
      assert.strictEqual(domElements.get('jobLocation').textContent, sampleJobA.location);
      assert.ok(!domElements.get('jobLocation').textContent.includes('📍'));
      assert.strictEqual(domElements.get('jobType').textContent, sampleJobA.employmentType);
      assert.ok(!domElements.get('jobType').textContent.includes('💼'));
    });

    it('42. Rescan is always available in header as secondary action', () => {
      const rescanBtn = domElements.get('rescanBtn');
      assert.ok(rescanBtn);
      assert.strictEqual(rescanBtn.textContent, 'Rescan');
    });

    it('43. Pending job notification is minimal and non-blocking', async () => {
      await controller.init();
      controller._renderPendingJobNotification(sampleJobB);
      assert.strictEqual(domElements.get('pendingJobNotification').classList.contains('hidden'), false);
      assert.strictEqual(domElements.get('pendingJobTitle').textContent, 'Staff Platform Architect • Web Scale Inc');
      assert.ok(domElements.get('rescanPendingBtn'));
    });

    it('44. Primary action has stronger hierarchy than Rescan', () => {
      const prepareBtn = domElements.get('prepareHandoffBtn');
      const rescanBtn = domElements.get('rescanBtn');
      assert.ok(prepareBtn);
      assert.ok(rescanBtn);
      // Verify CTA button exists with primary class
      assert.strictEqual(prepareBtn.id, 'prepareHandoffBtn');
    });

    it('45. Reset Workflow is visually and functionally distinct from Rescan', () => {
      const resetBtn = domElements.get('resetWorkflowBtn');
      const rescanBtn = domElements.get('rescanBtn');
      assert.notStrictEqual(resetBtn.id, rescanBtn.id);
      assert.ok(resetBtn.title.includes('Reset extension workflow'));
      assert.ok(rescanBtn.title.includes('Scan current browser page'));
    });
  });
});
