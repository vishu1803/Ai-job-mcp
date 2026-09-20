/**
 * @file P59 Sidebar Workflow & Authentication Unit Tests.
 *
 * Verifies:
 * 1. Authentication: authenticated/unauthenticated, session restoration, session expiry, logout, no fake auth.
 * 2. Hard Invariant: fitAnalysis -> ANALYSIS_READY -> Handoff card visible & Prepare CTA active (No dead ends).
 * 3. State-Action Matrix: Every state has a mandatory primary action.
 * 4. Idempotent Prepare Handoff: Reuses existing canonical applicationId without duplication.
 * 5. Artifact Review & Download: Canonical URLs derived from server package identity.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SidebarController } from '../../extension/sidebar/sidebar.js';
import { WORKFLOW_STATES } from '../../extension/lib/workflow-state-machine.js';

// ---------------------------------------------------------------------------
// Minimal DOM Mocking
// ---------------------------------------------------------------------------
function createMockElement(id = '') {
  return {
    id,
    _textContent: '',
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
    addEventListener() {},
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

  global.chrome = {
    runtime: {
      onMessage: {
        addListener() {},
      },
      sendMessage() {},
    },
    tabs: {
      query: async () => [{ id: 101, url: 'https://www.linkedin.com/jobs/view/123456/' }],
      sendMessage: async () => ({ success: true }),
      create: async () => {},
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {},
      },
    },
    downloads: {
      download: () => {},
    },
  };

  return elements;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('P59: Sidebar Workflow Completion & Authentication', () => {
  let controller;
  let domElements;

  const sampleJob = {
    title: 'Senior Backend Engineer',
    company: 'Tech Corp',
    location: 'Remote',
    employmentType: 'Full-time',
    sourceUrl: 'https://www.linkedin.com/jobs/view/999888777/',
    provider: 'LINKEDIN',
    description:
      'Looking for a Senior Backend Engineer with Node.js, TypeScript, PostgreSQL, and AWS experience.',
  };

  beforeEach(() => {
    domElements = setupMockDocument();
    controller = new SidebarController();
    controller._bindElements();
  });

  describe('1. Authentication & Session Verification', () => {
    it('strictly renders unauthenticated state when /api/extension/session returns not authenticated (no fake auth)', async () => {
      controller.backendClient.getAuthStatus = async () => ({
        status: 'NOT_AUTHENTICATED',
        authenticated: false,
      });

      const isAuth = await controller._checkAuthStatus();
      assert.strictEqual(isAuth, false);
      assert.strictEqual(controller.isAuthenticated, false);
      assert.strictEqual(
        domElements.get('authUnauthenticatedState').classList.contains('hidden'),
        false
      );
      assert.strictEqual(
        domElements.get('authAuthenticatedState').classList.contains('hidden'),
        true
      );
    });

    it('renders authenticated state with candidate profile when session is valid', async () => {
      controller.backendClient.getAuthStatus = async () => ({
        status: 'AUTHENTICATED',
        authenticated: true,
        user: { id: 'u-1', email: 'vishwanath@example.com', displayName: 'Vishwanath' },
        candidate: {
          id: 'c-1',
          canonicalEmail: 'vishwanath@example.com',
          displayName: 'Vishwanath Nishad',
        },
      });

      const isAuth = await controller._checkAuthStatus();
      assert.strictEqual(isAuth, true);
      assert.strictEqual(controller.isAuthenticated, true);
      assert.strictEqual(
        domElements.get('authUnauthenticatedState').classList.contains('hidden'),
        true
      );
      assert.strictEqual(
        domElements.get('authAuthenticatedState').classList.contains('hidden'),
        false
      );
      assert.strictEqual(domElements.get('userName').textContent, 'Vishwanath Nishad');
      assert.strictEqual(domElements.get('userEmail').textContent, 'vishwanath@example.com');
    });

    it('clears authentication on logout without destroying active job or analysis state', async () => {
      let logoutCalled = false;
      controller.backendClient.logout = async () => {
        logoutCalled = true;
        return true;
      };

      // Set up existing authenticated session with detected job
      controller.isAuthenticated = true;
      controller.activeJob = sampleJob;
      controller.cachedState = {
        jobData: sampleJob,
        fitAnalysis: { overallScore: 88, grade: 'A' },
        applicationId: 'app-existing-123',
      };

      await controller.logout();

      assert.strictEqual(logoutCalled, true);
      assert.strictEqual(controller.isAuthenticated, false);
      assert.strictEqual(
        domElements.get('authUnauthenticatedState').classList.contains('hidden'),
        false
      );
      // State is preserved!
      assert.deepStrictEqual(controller.activeJob, sampleJob);
      assert.strictEqual(controller.cachedState.applicationId, 'app-existing-123');
    });

    it('handles session expiry during action gracefully by preserving state and prompting re-auth', async () => {
      controller.isAuthenticated = true;
      controller.activeJob = sampleJob;
      controller.cachedState = {
        tabId: 101,
        jobData: sampleJob,
        fitAnalysis: { overallScore: 85, grade: 'A' },
        applicationId: 'app-999',
      };

      controller._handleSessionExpired();

      assert.strictEqual(controller.isAuthenticated, false);
      assert.strictEqual(
        domElements.get('sessionExpiredNotice').classList.contains('hidden'),
        false
      );
      // All job and application data remains intact!
      assert.strictEqual(controller.cachedState.applicationId, 'app-999');
      assert.strictEqual(controller.cachedState.fitAnalysis.overallScore, 85);
    });
  });

  describe('2. Hard Invariant: Analysis Ready Must Never Be a Dead End', () => {
    it('fitAnalysis present -> ANALYSIS_READY -> Handoff Kit card is immediately visible with Prepare CTA', () => {
      const state = {
        workflowState: WORKFLOW_STATES.ANALYSIS_READY,
        jobData: sampleJob,
        fitAnalysis: {
          overallScore: 84,
          grade: 'RECOMMENDED',
          matchedSkills: ['Node.js', 'PostgreSQL'],
          missingSkills: ['AWS'],
        },
        recommendedProjects: [],
        handoffData: null,
        applicationId: null,
      };

      controller._renderAllFromState(state);

      // Analysis Card is visible
      assert.strictEqual(domElements.get('analysisCard').classList.contains('hidden'), false);

      // Primary Next Action CTA inside analysis card is visible
      assert.strictEqual(
        domElements.get('analysisNextActionBox').classList.contains('hidden'),
        false
      );

      // Handoff Card is visible even though handoffData is null!
      assert.strictEqual(domElements.get('handoffCard').classList.contains('hidden'), false);

      // Prepare Handoff button is enabled with "Prepare Handoff Kit"
      assert.strictEqual(domElements.get('prepareBtnText').textContent, 'Prepare Handoff Kit');
      assert.strictEqual(domElements.get('handoffStatusBadge').textContent, 'UNPREPARED');
    });

    it('visibility of handoff card does NOT depend on portfolioRecommendations or secondary properties', () => {
      const state = {
        workflowState: WORKFLOW_STATES.ANALYSIS_READY,
        jobData: sampleJob,
        fitAnalysis: {
          overallScore: 75,
          grade: 'CONDITIONAL',
          matchedSkills: ['Node.js'],
          missingSkills: ['AWS'],
        },
        // Intentionally empty / null secondary properties
        portfolioRecommendations: null,
        recommendedProjects: [],
        handoffData: null,
        applicationId: null,
      };

      controller._renderAllFromState(state);

      // Must still be visible!
      assert.strictEqual(domElements.get('handoffCard').classList.contains('hidden'), false);
    });
  });

  describe('3. State-Action Matrix (Every State Has a Valid Next Action)', () => {
    const stateActionMatrix = [
      {
        stateName: 'IDLE / NO_JOB_DETECTED',
        setup: () => controller._renderEmptyJobState(),
        verify: () => {
          assert.strictEqual(
            domElements.get('jobNotDetectedState').classList.contains('hidden'),
            false
          );
          assert.strictEqual(domElements.get('reanalyzeBtn').disabled, false);
        },
      },
      {
        stateName: 'JOB_DETECTED',
        setup: () => controller._renderJobCard(sampleJob),
        verify: () => {
          assert.strictEqual(
            domElements.get('jobDetectedState').classList.contains('hidden'),
            false
          );
          assert.strictEqual(domElements.get('analyzeJobBtn').disabled, false);
        },
      },
      {
        stateName: 'ANALYSIS_READY',
        setup: () =>
          controller._renderAllFromState({
            workflowState: WORKFLOW_STATES.ANALYSIS_READY,
            jobData: sampleJob,
            fitAnalysis: { overallScore: 80, grade: 'RECOMMENDED' },
          }),
        verify: () => {
          assert.strictEqual(
            domElements.get('analysisNextActionBox').classList.contains('hidden'),
            false
          );
          assert.strictEqual(domElements.get('handoffCard').classList.contains('hidden'), false);
          assert.strictEqual(domElements.get('prepareHandoffBtn').disabled, false);
        },
      },
      {
        stateName: 'APPLICATION_READY',
        setup: () =>
          controller._renderAllFromState({
            workflowState: WORKFLOW_STATES.APPLICATION_READY,
            jobData: sampleJob,
            fitAnalysis: { overallScore: 80, grade: 'RECOMMENDED' },
            applicationId: 'app-abc-123',
            handoffData: {
              applicationId: 'app-abc-123',
              packageStatus: 'SAVED',
              packageVersion: 2,
              packageHash: '8f9e2b1c4d5a',
            },
          }),
        verify: () => {
          assert.strictEqual(
            domElements.get('artifactsContainer').classList.contains('hidden'),
            false
          );
          assert.strictEqual(domElements.get('downloadResumeBtn').disabled, false);
          assert.strictEqual(domElements.get('downloadCoverLetterBtn').disabled, false);
          assert.strictEqual(domElements.get('downloadBundleBtn').disabled, false);
          assert.strictEqual(domElements.get('reviewResumeBtn').disabled, false);
        },
      },
      {
        stateName: 'Analysis Error',
        setup: () => controller._showAnalysisError('Service unavailable'),
        verify: () => {
          assert.strictEqual(
            domElements.get('analysisErrorBanner').classList.contains('hidden'),
            false
          );
          assert.strictEqual(domElements.get('retryAnalysisBtn').disabled, false);
        },
      },
      {
        stateName: 'Handoff Error',
        setup: () => controller._showHandoffError('LaTeX compilation failed'),
        verify: () => {
          assert.strictEqual(
            domElements.get('handoffErrorBanner').classList.contains('hidden'),
            false
          );
          assert.strictEqual(domElements.get('retryHandoffBtn').disabled, false);
        },
      },
      {
        stateName: 'Auth Expired',
        setup: () => controller._handleSessionExpired(),
        verify: () => {
          assert.strictEqual(
            domElements.get('sessionExpiredNotice').classList.contains('hidden'),
            false
          );
          assert.strictEqual(domElements.get('reauthBtn').disabled, false);
        },
      },
    ];

    for (const testCase of stateActionMatrix) {
      it(`enforces primary action for state: ${testCase.stateName}`, () => {
        testCase.setup();
        testCase.verify();
      });
    }
  });

  describe('4. Canonical & Idempotent Handoff Preparation', () => {
    it('passes canonical activeJob, existing applicationId, and snapshotId to prepareHandoff', async () => {
      let passedJob = null;
      let passedAppId = null;
      let passedSnapshotId = null;

      controller.backendClient.prepareHandoff = async (job, appId, snapId) => {
        passedJob = job;
        passedAppId = appId;
        passedSnapshotId = snapId;
        return {
          applicationId: appId || 'app-new-456',
          packageStatus: 'SAVED',
          packageVersion: 1,
          packageHash: 'aabbcc112233',
          artifacts: {
            resume: { ready: true },
            coverLetter: { ready: true },
            bundle: { ready: true },
          },
        };
      };

      controller.isAuthenticated = true;
      controller.activeJob = sampleJob;
      controller.activeTabId = 101;
      controller.cachedState = {
        tabId: 101,
        jobData: sampleJob,
        applicationId: 'app-existing-789',
        analysisSnapshotId: 'snap-12345',
      };

      await controller.runPrepareHandoff();

      // Verified exact canonical arguments passed
      assert.deepStrictEqual(passedJob, sampleJob);
      assert.strictEqual(passedAppId, 'app-existing-789');
      assert.strictEqual(passedSnapshotId, 'snap-12345');

      // State is updated with server return
      assert.strictEqual(controller.cachedState.applicationId, 'app-existing-789');
      assert.strictEqual(controller.cachedState.workflowState, WORKFLOW_STATES.APPLICATION_READY);
    });

    it('repeated clicks on Prepare Handoff reuse the same applicationId (idempotency proven)', async () => {
      const calls = [];
      controller.backendClient.prepareHandoff = async (job, appId, snapId) => {
        calls.push({ job, appId, snapId });
        return {
          applicationId: appId || 'app-first-id-001',
          packageStatus: 'SAVED',
          packageVersion: calls.length,
          packageHash: `hash-${calls.length}`,
        };
      };

      controller.isAuthenticated = true;
      controller.activeJob = sampleJob;
      controller.activeTabId = 101;
      controller.cachedState = {
        tabId: 101,
        jobData: sampleJob,
        applicationId: null, // First call creates ID
      };

      // Call 1
      await controller.runPrepareHandoff();
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].appId, null);
      assert.strictEqual(controller.cachedState.applicationId, 'app-first-id-001');

      // Call 2 (User clicks prepare again / retry / reload)
      await controller.runPrepareHandoff();
      assert.strictEqual(calls.length, 2);
      assert.strictEqual(
        calls[1].appId,
        'app-first-id-001',
        'Must reuse the exact existing applicationId!'
      );
      assert.strictEqual(
        controller.cachedState.applicationId,
        'app-first-id-001',
        'Must not generate a second ID'
      );
    });

    it('surfaces application ID, package hash, and package status in the UI', async () => {
      controller.backendClient.prepareHandoff = async () => ({
        applicationId: 'app-verified-999',
        packageStatus: 'SAVED',
        packageVersion: 3,
        packageHash: 'c0ffee123456789',
      });

      controller.isAuthenticated = true;
      controller.activeJob = sampleJob;
      controller.activeTabId = 101;
      controller.cachedState = {
        tabId: 101,
        jobData: sampleJob,
      };

      await controller.runPrepareHandoff();

      assert.strictEqual(domElements.get('handoffAppId').textContent, 'app-verified-999');
      assert.ok(domElements.get('handoffPackageMeta').textContent.includes('v3'));
      assert.ok(domElements.get('handoffPackageMeta').textContent.includes('c0ffee12'));
      assert.strictEqual(domElements.get('handoffStatusBadge').textContent, 'KIT READY');
    });
  });

  describe('5. Artifact Download and Review URLs', () => {
    it('constructs authenticated download URLs from server-returned package identity', async () => {
      let requestedType = null;
      let requestedAppId = null;
      let requestedHash = null;

      controller.backendClient.getArtifactDownloadUrl = async (appId, type, hash) => {
        requestedAppId = appId;
        requestedType = type;
        requestedHash = hash;
        return `http://localhost:3000/api/applications/${appId}/artifacts/${type}/download?packageHash=${hash}`;
      };

      controller.cachedState = {
        applicationId: 'app-xyz-555',
        handoffData: {
          applicationId: 'app-xyz-555',
          packageHash: 'hash-abc-777',
        },
      };

      await controller._triggerDownload('resume');
      assert.strictEqual(requestedAppId, 'app-xyz-555');
      assert.strictEqual(requestedType, 'resume');
      assert.strictEqual(requestedHash, 'hash-abc-777');

      await controller._triggerReview('cover-letter');
      assert.strictEqual(requestedType, 'cover-letter');
    });
  });
});
