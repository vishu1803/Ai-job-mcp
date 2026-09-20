/**
 * @file P78 Unit Tests: Analysis Title Preservation & Passive Detection Protection.
 *
 * Validates:
 * 1. Post-Analysis Title Preservation:
 *    - runAnalyzeJob() persists and anchors title: "Full Stack Engineer" in activeJob,
 *      cachedState.jobData, cachedState.jobIdentity, and renders #jobTitle textContent.
 * 2. Background Transport Timeout / Error Immunity:
 *    - Passive _requestDetectionFromTab() on TAB_UPDATED or hydration when sendWithTimeout
 *      throws (network delay, port disconnection, script injection lag) NEVER resets
 *      activeJob or cachedState.jobData, keeping #jobTitle === "Full Stack Engineer".
 * 3. Passive Non-Job Detection Protection:
 *    - When content script returns { detected: false } during passive background checks
 *      (scrolling, modal open, tab focus), activeJob and analysis state are preserved.
 * 4. Explicit Rescan Reset Compliance:
 *    - When the user explicitly clicks "Rescan" (isExplicitRescan === true) on a non-job page,
 *      unlocked state is safely reset to IDLE and cleared.
 * 5. Handoff Kit Title Anchoring:
 *    - runPrepareHandoff() maintains activeJob.title and cachedState.jobData.title,
 *      anchoring canonical targetJob data.
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
    'formDetectionCard',
    'stepIndicator',
    'formStatusMessage',
    'formFieldsSummary',
    'autofillFormBtn',
    'autofillFormSpinner',
    'autofillBtnText',
    'autofillSuccessBanner',
    'autofillErrorBanner',
    'autofillErrorMessage',
    'viewApplicationLink',
    'sidebarVersionTag',
    'exportLogsBtn',
  ];

  for (const id of elementIds) {
    elements.set(id, createMockElement(id));
  }

  global.document = {
    getElementById: (id) => elements.get(id) || null,
    querySelectorAll: () => [],
    createElement: (tag) => createMockElement(tag),
  };

  return elements;
}

const sampleJobgether = {
  title: 'Full Stack Engineer',
  company: 'Jobgether',
  location: 'India',
  workplace: 'REMOTE',
  employmentType: 'FULL_TIME',
  sourceUrl: 'https://www.linkedin.com/jobs/view/4466834190/',
  description:
    'Jobgether is seeking a Full Stack Engineer to build scalable, maintainable architectures. Remote opportunity.',
  requirements: ['Architecture design', 'Web applications', 'Full stack depth'],
  responsibilities: ['Design scalable architectures'],
  analysisReady: true,
};

describe('P78: Analysis Title Preservation & Passive Detection Protection', () => {
  let domElements;
  let mockStorage;
  let controller;

  beforeEach(() => {
    domElements = setupMockDocument();
    mockStorage = new Map();

    global.chrome = {
      storage: {
        local: {
          get: (keys, cb) => {
            const res = {};
            if (typeof keys === 'string') res[keys] = mockStorage.get(keys);
            else if (Array.isArray(keys))
              keys.forEach((k) => {
                res[k] = mockStorage.get(k);
              });
            else if (typeof keys === 'object' && keys !== null) {
              Object.keys(keys).forEach((k) => {
                res[k] = mockStorage.has(k) ? mockStorage.get(k) : keys[k];
              });
            }
            if (cb) cb(res);
            return Promise.resolve(res);
          },
          set: (items, cb) => {
            Object.entries(items).forEach(([k, v]) => mockStorage.set(k, v));
            if (cb) cb();
            return Promise.resolve();
          },
          remove: (keys, cb) => {
            const arr = Array.isArray(keys) ? keys : [keys];
            arr.forEach((k) => mockStorage.delete(k));
            if (cb) cb();
            return Promise.resolve();
          },
        },
      },
      tabs: {
        _currentActiveTabId: 101,
        query: (opts, cb) => {
          const tabs = [
            {
              id: global.chrome.tabs._currentActiveTabId,
              active: true,
              windowId: 1,
              url: sampleJobgether.sourceUrl,
            },
          ];
          if (cb) cb(tabs);
          return Promise.resolve(tabs);
        },
        sendMessage: (tabId, msg, cb) => {
          const res = {
            success: true,
            detected: true,
            confidence: 'HIGH',
            jobData: sampleJobgether,
            portalMetadata: { portalName: 'LinkedIn Jobs', confidence: 'HIGH' },
          };
          if (cb) cb(res);
          return Promise.resolve(res);
        },
      },
      runtime: {
        sendMessage: (msg, cb) => {
          if (cb) cb({ success: true });
          return Promise.resolve({ success: true });
        },
        onMessage: { addListener: () => {} },
      },
      sidePanel: { open: () => Promise.resolve() },
    };

    controller = new SidebarController();
    controller.isAuthenticated = true;
    controller.currentUser = { id: 'usr-1', email: 'vishu@test.com', displayName: 'Vishu' };

    controller.backendClient = {
      getHealth: async () => ({ status: 'ok' }),
      checkConnection: () => Promise.resolve(true),
      getAuthStatus: async () => ({
        authenticated: true,
        status: 'AUTHENTICATED',
        user: controller.currentUser,
      }),
      analyzeJob: async (job) => {
        return {
          analysisSnapshotId: 'snap-4466834190',
          title: job.title,
          company: job.company,
          jobData: { ...job },
          canonicalJob: {
            canonicalJobId: 'canon-4466834190',
            normalizedJobUrl: job.sourceUrl,
            title: job.title,
            company: job.company,
            location: job.location,
            workplace: job.workplace,
            employmentType: job.employmentType,
            provider: 'LINKEDIN',
          },
          existingApplication: null,
          existingHandoff: null,
          isSubmitted: false,
          fitAnalysis: {
            score: 88,
            grade: 'A',
            recommendation: 'RECOMMENDED',
            matchedSkills: ['JavaScript', 'Node.js', 'React'],
            missingSkills: ['Kubernetes'],
            experienceFit: 'Eligible',
          },
          recommendedProjects: [],
        };
      },
      prepareHandoff: async (job, appId, snapId) => {
        return {
          applicationId: appId || 'app-4466834190',
          canonicalJobId: 'canon-4466834190',
          analysisSnapshotId: snapId || 'snap-4466834190',
          title: job.title,
          jobTitle: job.title,
          company: job.company,
          companyName: job.company,
          targetJob: {
            title: job.title,
            company: job.company,
            location: job.location,
            directPortalUrl: job.sourceUrl,
          },
          packageVersion: 1,
          packageStatus: 'SAVED',
          reviewUrl: '/applications/app-4466834190/review',
          artifacts: { resumePdf: true, coverLetterPdf: true },
        };
      },
    };
  });

  it('1. runAnalyzeJob preserves title: "Full Stack Engineer" in UI and state', async () => {
    await controller.init();
    assert.equal(domElements.get('jobTitle').textContent, 'Full Stack Engineer');

    await controller.runAnalyzeJob();

    assert.equal(domElements.get('jobTitle').textContent, 'Full Stack Engineer');
    assert.equal(controller.activeJob.title, 'Full Stack Engineer');
    assert.equal(controller.cachedState.jobData.title, 'Full Stack Engineer');
    assert.equal(controller.cachedState.workflowState, WORKFLOW_STATES.ANALYSIS_READY);
    assert.equal(domElements.get('scoreValue').textContent, '88');
  });

  it('2. Passive detection transport timeout/error does NOT wipe title or reset state', async () => {
    await controller.init();
    await controller.runAnalyzeJob();
    assert.equal(domElements.get('jobTitle').textContent, 'Full Stack Engineer');

    // Simulate network delay or background port failure throwing error
    global.chrome.tabs.sendMessage = () =>
      Promise.reject(new Error('Extension context invalidated or timeout'));

    const res = await controller._requestDetectionFromTab();
    assert.equal(res, false);

    // Title must remain strictly preserved
    assert.equal(domElements.get('jobTitle').textContent, 'Full Stack Engineer');
    assert.equal(controller.activeJob.title, 'Full Stack Engineer');
    assert.equal(controller.cachedState.jobData.title, 'Full Stack Engineer');
    assert.equal(controller.cachedState.workflowState, WORKFLOW_STATES.ANALYSIS_READY);
    assert.equal(domElements.get('scoreValue').textContent, '88');
  });

  it('3. Passive detection returning detected: false does NOT wipe active job or analysis', async () => {
    await controller.init();
    await controller.runAnalyzeJob();
    assert.equal(domElements.get('jobTitle').textContent, 'Full Stack Engineer');

    // Simulate content script returning detected: false while scrolling or viewing comments
    global.chrome.tabs.sendMessage = () => Promise.resolve({ detected: false });

    const res = await controller._requestDetectionFromTab(false); // passive
    assert.equal(res, false);

    // Title and analysis state must remain fully preserved
    assert.equal(domElements.get('jobTitle').textContent, 'Full Stack Engineer');
    assert.equal(controller.activeJob.title, 'Full Stack Engineer');
    assert.equal(controller.cachedState.jobData.title, 'Full Stack Engineer');
    assert.equal(controller.cachedState.workflowState, WORKFLOW_STATES.ANALYSIS_READY);
    assert.equal(domElements.get('jobNotDetectedState').classList.contains('hidden'), true);
    assert.equal(domElements.get('jobDetectedState').classList.contains('hidden'), false);
  });

  it('4. Explicit rescan on non-job page cleanly resets unlocked state', async () => {
    await controller.init();
    assert.equal(domElements.get('jobTitle').textContent, 'Full Stack Engineer');

    // Now user navigates to a non-job page and explicitly clicks Rescan
    global.chrome.tabs.sendMessage = () => Promise.resolve({ detected: false });

    await controller._requestDetectionFromTab(true); // explicit rescan

    assert.equal(controller.activeJob, null);
    assert.equal(controller.cachedState.jobData, null);
    assert.equal(controller.cachedState.workflowState, WORKFLOW_STATES.IDLE);
    assert.equal(domElements.get('jobTitle').textContent, '—');
    assert.equal(domElements.get('jobNotDetectedState').classList.contains('hidden'), false);
  });

  it('5. runPrepareHandoff anchors targetJob and preserves job title', async () => {
    await controller.init();
    await controller.runAnalyzeJob();
    await controller.runPrepareHandoff();

    assert.equal(domElements.get('jobTitle').textContent, 'Full Stack Engineer');
    assert.equal(controller.activeJob.title, 'Full Stack Engineer');
    assert.equal(controller.cachedState.jobData.title, 'Full Stack Engineer');
    assert.equal(controller.cachedState.handoffData.title, 'Full Stack Engineer');
    assert.equal(controller.cachedState.handoffData.targetJob.title, 'Full Stack Engineer');
    assert.equal(controller.isWorkflowLocked(), true);
    assert.equal(controller.cachedState.workflowState, WORKFLOW_STATES.APPLICATION_READY);
  });
});
