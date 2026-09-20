/**
 * @file P79 Unit Tests: Canonical Job Identity State-Transition Authority.
 *
 * Validates:
 * 1. CanonicalJobIdentity value object contract (fingerprint derivation, equality, validation).
 * 2. JobIdentityAuthority state-transition decision matrix:
 *    - Same job re-detection -> RETAIN_AND_ENRICH (preserves analysis & handoff).
 *    - Transport timeout / error -> PRESERVE_ACTIVE_SESSION (P71 immunity).
 *    - Passive non-job signal with analyzed job -> PRESERVE_ACTIVE_SESSION (P78 immunity).
 *    - Passive non-job signal with unanalyzed job -> EXPLICIT_CLEAR (P75 compatibility).
 *    - Different job detected during active workflow -> QUEUE_PENDING_JOB (Calm Workflow).
 *    - Explicit rescan on non-job -> EXPLICIT_CLEAR (Requirement 4 compliance).
 *    - Analysis complete -> RETAIN_AND_ENRICH (canonical identity affirmation).
 *    - Handoff prepared -> RETAIN_AND_ENRICH (locks workflow and anchors targetJob).
 *    - User reset -> EXPLICIT_CLEAR (clean IDLE reset).
 * 3. SidebarController integration with JobIdentityAuthority.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  CanonicalJobIdentity,
  JobIdentityAuthority,
  TRANSITION_ACTIONS,
  SIGNAL_TYPES,
  JobIdentity,
} from '../../extension/lib/job-identity.js';
import { SidebarController } from '../../extension/sidebar/sidebar.js';
import { WORKFLOW_STATES } from '../../extension/lib/workflow-state-machine.js';

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

const sampleJobA = {
  title: 'Full Stack Engineer',
  company: 'Jobgether',
  location: 'India',
  workplace: 'REMOTE',
  employmentType: 'FULL_TIME',
  sourceUrl: 'https://www.linkedin.com/jobs/view/4466834190/',
  description: 'Jobgether seeking Full Stack Engineer to build scalable distributed architectures.',
  requirements: ['Architecture', 'JavaScript', 'Node.js'],
  analysisReady: true,
};

const sampleJobB = {
  title: 'Backend Software Engineer',
  company: 'Particle41',
  location: 'Remote',
  workplace: 'REMOTE',
  employmentType: 'FULL_TIME',
  sourceUrl: 'https://www.linkedin.com/jobs/view/4467464995/',
  description: 'Particle41 seeking Backend Software Engineer for cloud microservices.',
  requirements: ['Node.js', 'PostgreSQL'],
  analysisReady: true,
};

describe('P79: Canonical Job Identity & State-Transition Authority', () => {
  describe('1. CanonicalJobIdentity Value Object', () => {
    it('creates valid identity with deterministic 64-character fingerprint', () => {
      const identity = new CanonicalJobIdentity(sampleJobA);
      assert.strictEqual(identity.isValid(), true);
      assert.strictEqual(identity.title, 'Full Stack Engineer');
      assert.strictEqual(identity.company, 'Jobgether');
      assert.strictEqual(identity.fingerprint.length, 64);
    });

    it('identifies identical jobs correctly even with tracking query params', () => {
      const jobA1 = {
        ...sampleJobA,
        sourceUrl: 'https://www.linkedin.com/jobs/view/4466834190/?utm_source=feed&refId=abc',
      };
      const jobA2 = {
        ...sampleJobA,
        sourceUrl: 'https://www.linkedin.com/jobs/view/4466834190/?trackingId=xyz',
      };
      const id1 = new CanonicalJobIdentity(jobA1);
      const id2 = new CanonicalJobIdentity(jobA2);
      assert.strictEqual(id1.isSameAs(id2), true);
    });

    it('distinguishes different jobs at different companies', () => {
      const idA = new CanonicalJobIdentity(sampleJobA);
      const idB = new CanonicalJobIdentity(sampleJobB);
      assert.strictEqual(idA.isSameAs(idB), false);
    });

    it('marks untitled or empty jobs as invalid', () => {
      const invalidJob = new CanonicalJobIdentity({ title: 'Untitled Role', company: 'Unknown' });
      assert.strictEqual(invalidJob.isValid(), false);
    });

    it('requires at least one authoritative anchor for validity (provider+extId, canonicalJobId, provider+url, title+company+url)', () => {
      // Valid with provider + externalJobId
      const idProvider = new CanonicalJobIdentity({
        title: 'Software Engineer',
        provider: 'LINKEDIN',
        externalJobId: '12345',
      });
      assert.strictEqual(idProvider.isValid(), true);

      // Valid with canonicalJobId
      const idCanonical = new CanonicalJobIdentity({
        title: 'Software Engineer',
        canonicalJobId: 'canon-123',
      });
      assert.strictEqual(idCanonical.isValid(), true);

      // Valid with provider + normalizedUrl
      const idProviderUrl = new CanonicalJobIdentity({
        title: 'Software Engineer',
        provider: 'GREENHOUSE',
        sourceUrl: 'https://careers.company.com/job/1',
      });
      assert.strictEqual(idProviderUrl.isValid(), true);

      // Valid with validated title + company + url
      const idFull = new CanonicalJobIdentity({
        title: 'Software Engineer',
        company: 'Acme',
        url: 'https://acme.org/jobs/42',
      });
      assert.strictEqual(idFull.isValid(), true);

      // Invalid with normalizedUrl alone (no provider, no company)
      const idUrlAlone = new CanonicalJobIdentity({
        title: 'Software Engineer',
        sourceUrl: 'https://careers.company.com/job/1',
      });
      assert.strictEqual(idUrlAlone.isValid(), false);
    });

    it('rejects unanchored identity with only title and no identity anchors', () => {
      const unanchored = new CanonicalJobIdentity({ title: 'Software Engineer' });
      assert.strictEqual(unanchored.isValid(), false);
    });
  });

  describe('2. JobIdentityAuthority Transition Decisions', () => {
    it('RETAIN_AND_ENRICH on same-job re-detection', () => {
      const context = {
        activeJob: sampleJobA,
        cachedState: { jobData: sampleJobA, fitAnalysis: { score: 85 } },
        stateMachineState: WORKFLOW_STATES.ANALYSIS_READY,
        isLocked: false,
      };
      const signal = {
        type: SIGNAL_TYPES.DETECTION_RESULT,
        detectedJob: { ...sampleJobA, description: 'Updated longer description text' },
        isExplicitUserAction: false,
      };

      const decision = JobIdentityAuthority.evaluateTransition(context, signal);
      assert.strictEqual(decision.action, TRANSITION_ACTIONS.RETAIN_AND_ENRICH);
      assert.strictEqual(decision.activeJob.title, 'Full Stack Engineer');
      assert.strictEqual(decision.targetWorkflowState, WORKFLOW_STATES.ANALYSIS_READY);
    });

    it('PRESERVE_ACTIVE_SESSION on transport timeout / error (P71 immunity)', () => {
      const context = {
        activeJob: sampleJobA,
        cachedState: { jobData: sampleJobA },
        stateMachineState: WORKFLOW_STATES.JOB_DETECTED,
        isLocked: false,
      };
      const signal = {
        type: SIGNAL_TYPES.TRANSPORT_ERROR,
        isTransportError: true,
      };

      const decision = JobIdentityAuthority.evaluateTransition(context, signal);
      assert.strictEqual(decision.action, TRANSITION_ACTIONS.PRESERVE_ACTIVE_SESSION);
      assert.strictEqual(decision.preserveActiveJob, true);
    });

    it('PRESERVE_ACTIVE_SESSION on passive non-job signal when analysis exists (P78 immunity)', () => {
      const context = {
        activeJob: sampleJobA,
        cachedState: { jobData: sampleJobA, fitAnalysis: { score: 88 } },
        stateMachineState: WORKFLOW_STATES.ANALYSIS_READY,
        isLocked: false,
      };
      const signal = {
        type: SIGNAL_TYPES.DETECTION_RESULT,
        detectedJob: null, // non-job
        isExplicitUserAction: false, // passive scroll or tab focus
      };

      const decision = JobIdentityAuthority.evaluateTransition(context, signal);
      assert.strictEqual(decision.action, TRANSITION_ACTIONS.PRESERVE_ACTIVE_SESSION);
      assert.strictEqual(decision.activeJob.title, 'Full Stack Engineer');
      assert.strictEqual(decision.targetWorkflowState, WORKFLOW_STATES.ANALYSIS_READY);
    });

    it('EXPLICIT_CLEAR on passive reload of unanalyzed tab on non-job page (P75 contract)', () => {
      const context = {
        activeJob: sampleJobA,
        cachedState: { jobData: sampleJobA, fitAnalysis: null },
        stateMachineState: WORKFLOW_STATES.JOB_DETECTED,
        isLocked: false,
      };
      const signal = {
        type: SIGNAL_TYPES.DETECTION_RESULT,
        detectedJob: null, // page reloaded into empty non-job
        isExplicitUserAction: false,
      };

      const decision = JobIdentityAuthority.evaluateTransition(context, signal);
      assert.strictEqual(decision.action, TRANSITION_ACTIONS.EXPLICIT_CLEAR);
      assert.strictEqual(decision.activeJob, null);
      assert.strictEqual(decision.targetWorkflowState, WORKFLOW_STATES.IDLE);
    });

    it('QUEUE_PENDING_JOB when different job is detected during active workflow (Calm Workflow)', () => {
      const context = {
        activeJob: sampleJobA,
        cachedState: { jobData: sampleJobA, fitAnalysis: { score: 90 } },
        stateMachineState: WORKFLOW_STATES.ANALYSIS_READY,
        isLocked: false,
      };
      const signal = {
        type: SIGNAL_TYPES.DETECTION_RESULT,
        detectedJob: sampleJobB,
        isExplicitUserAction: false,
      };

      const decision = JobIdentityAuthority.evaluateTransition(context, signal);
      assert.strictEqual(decision.action, TRANSITION_ACTIONS.QUEUE_PENDING_JOB);
      assert.strictEqual(decision.activeJob.title, 'Full Stack Engineer'); // active untouched!
      assert.strictEqual(decision.pendingDetectedJob.title, 'Backend Software Engineer'); // queued as pending
    });

    it('EXPLICIT_CLEAR when user explicitly rescans a non-job page', () => {
      const context = {
        activeJob: sampleJobA,
        cachedState: { jobData: sampleJobA },
        stateMachineState: WORKFLOW_STATES.JOB_DETECTED,
        isLocked: false,
      };
      const signal = {
        type: SIGNAL_TYPES.EXPLICIT_RESCAN,
        detectedJob: null,
        isExplicitUserAction: true,
      };

      const decision = JobIdentityAuthority.evaluateTransition(context, signal);
      assert.strictEqual(decision.action, TRANSITION_ACTIONS.EXPLICIT_CLEAR);
      assert.strictEqual(decision.activeJob, null);
      assert.strictEqual(decision.targetWorkflowState, WORKFLOW_STATES.IDLE);
    });

    it('RETAIN_AND_ENRICH affirms canonical identity upon analysis completion', () => {
      const context = {
        activeJob: sampleJobA,
        cachedState: { jobData: sampleJobA },
        stateMachineState: WORKFLOW_STATES.ANALYZING,
        isLocked: false,
      };
      const canonicalBackendJob = {
        ...sampleJobA,
        canonicalJobId: 'canon-4466834190',
        normalizedJobUrl: sampleJobA.sourceUrl,
      };
      const signal = {
        type: SIGNAL_TYPES.ANALYZE_COMPLETE,
        detectedJob: canonicalBackendJob,
      };

      const decision = JobIdentityAuthority.evaluateTransition(context, signal);
      assert.strictEqual(decision.action, TRANSITION_ACTIONS.RETAIN_AND_ENRICH);
      assert.strictEqual(decision.activeJob.title, 'Full Stack Engineer');
      assert.strictEqual(decision.canonicalIdentity.canonicalJobId, 'canon-4466834190');
      assert.strictEqual(decision.targetWorkflowState, WORKFLOW_STATES.ANALYSIS_READY);
    });

    it('RETAIN_AND_ENRICH binds canonical identity and locks workflow on handoff preparation', () => {
      const context = {
        activeJob: sampleJobA,
        cachedState: { jobData: sampleJobA, fitAnalysis: { score: 92 } },
        stateMachineState: WORKFLOW_STATES.APPLICATION_PREPARING,
        isLocked: false,
      };
      const signal = {
        type: SIGNAL_TYPES.HANDOFF_PREPARED,
        targetJob: { title: 'Full Stack Engineer', company: 'Jobgether' },
      };

      const decision = JobIdentityAuthority.evaluateTransition(context, signal);
      assert.strictEqual(decision.action, TRANSITION_ACTIONS.RETAIN_AND_ENRICH);
      assert.strictEqual(decision.activeJob.title, 'Full Stack Engineer');
      assert.strictEqual(decision.targetWorkflowState, WORKFLOW_STATES.APPLICATION_READY);
      assert.strictEqual(decision.targetLockState, 'LOCKED');
    });

    it('EXPLICIT_CLEAR resets workflow to IDLE on user reset', () => {
      const context = {
        activeJob: sampleJobA,
        cachedState: { jobData: sampleJobA },
        stateMachineState: WORKFLOW_STATES.APPLICATION_READY,
        isLocked: true,
      };
      const signal = {
        type: SIGNAL_TYPES.USER_RESET,
      };

      const decision = JobIdentityAuthority.evaluateTransition(context, signal);
      assert.strictEqual(decision.action, TRANSITION_ACTIONS.EXPLICIT_CLEAR);
      assert.strictEqual(decision.activeJob, null);
      assert.strictEqual(decision.targetWorkflowState, WORKFLOW_STATES.IDLE);
      assert.strictEqual(decision.targetLockState, 'UNLOCKED');
    });

    it('HYDRATE_DESCRIPTION accepts exact fingerprint match and enriches description', () => {
      const idA = new CanonicalJobIdentity(sampleJobA);
      const context = {
        activeJob: sampleJobA,
        cachedState: { jobData: sampleJobA },
        stateMachineState: WORKFLOW_STATES.JOB_DETECTED,
        isLocked: false,
      };
      const signal = {
        type: SIGNAL_TYPES.HYDRATE_DESCRIPTION,
        jobFingerprint: idA.fingerprint,
        detectedJob: {
          description:
            'A newly hydrated detailed description with more than 50 characters for this exact role.',
        },
      };

      const decision = JobIdentityAuthority.evaluateTransition(context, signal);
      assert.strictEqual(decision.action, TRANSITION_ACTIONS.RETAIN_AND_ENRICH);
      assert.strictEqual(
        decision.activeJob.description.includes('newly hydrated detailed description'),
        true
      );
      assert.strictEqual(decision.activeJob.title, sampleJobA.title);
      assert.strictEqual(decision.activeJob.company, sampleJobA.company);
    });

    it('HYDRATE_DESCRIPTION rejects when fingerprint does not match active canonical identity exactly', () => {
      const context = {
        activeJob: sampleJobA,
        cachedState: { jobData: sampleJobA },
        stateMachineState: WORKFLOW_STATES.JOB_DETECTED,
        isLocked: false,
      };
      const signal = {
        type: SIGNAL_TYPES.HYDRATE_DESCRIPTION,
        jobFingerprint: 'f'.repeat(64), // mismatched fingerprint
        detectedJob: {
          title: sampleJobA.title, // even with same title!
          description: 'Attempt to hydrate with mismatched fingerprint',
        },
      };

      const decision = JobIdentityAuthority.evaluateTransition(context, signal);
      assert.strictEqual(decision.action, TRANSITION_ACTIONS.PRESERVE_ACTIVE_SESSION);
      assert.strictEqual(decision.reason.includes('fingerprint does not match'), true);
      assert.strictEqual(decision.activeJob.description, sampleJobA.description);
    });

    it('ANALYZE_COMPLETE rejects analysis response if job identity does not match active canonical job', () => {
      const context = {
        activeJob: sampleJobA,
        cachedState: { jobData: sampleJobA },
        stateMachineState: WORKFLOW_STATES.ANALYZING,
        isLocked: false,
      };
      const signal = {
        type: SIGNAL_TYPES.ANALYZE_COMPLETE,
        detectedJob: sampleJobB, // divergent role
      };

      const decision = JobIdentityAuthority.evaluateTransition(context, signal);
      assert.strictEqual(decision.action, TRANSITION_ACTIONS.PRESERVE_ACTIVE_SESSION);
      assert.strictEqual(
        decision.reason.includes('does not match active canonical identity'),
        true
      );
      assert.strictEqual(decision.activeJob.title, sampleJobA.title);
    });

    it('ANALYZE_COMPLETE strictly freezes canonical title and company against divergent backend response', () => {
      const context = {
        activeJob: sampleJobA,
        cachedState: { jobData: sampleJobA },
        stateMachineState: WORKFLOW_STATES.ANALYZING,
        isLocked: false,
      };
      const signal = {
        type: SIGNAL_TYPES.ANALYZE_COMPLETE,
        detectedJob: {
          ...sampleJobA,
          title: 'Divergent Title That Must Be Ignored',
          company: 'Divergent Company That Must Be Ignored',
          description: sampleJobA.description,
        },
      };

      const decision = JobIdentityAuthority.evaluateTransition(context, signal);
      assert.strictEqual(decision.action, TRANSITION_ACTIONS.RETAIN_AND_ENRICH);
      // Hard invariant: Title and company remain strictly canonical
      assert.strictEqual(decision.activeJob.title, sampleJobA.title);
      assert.strictEqual(decision.activeJob.company, sampleJobA.company);
    });

    it('HANDOFF_PREPARED rejects prepared handoff if target job identity does not match active canonical job', () => {
      const context = {
        activeJob: sampleJobA,
        cachedState: { jobData: sampleJobA },
        stateMachineState: WORKFLOW_STATES.APPLICATION_PREPARING,
        isLocked: false,
      };
      const signal = {
        type: SIGNAL_TYPES.HANDOFF_PREPARED,
        targetJob: sampleJobB, // completely different job
      };

      const decision = JobIdentityAuthority.evaluateTransition(context, signal);
      assert.strictEqual(decision.action, TRANSITION_ACTIONS.PRESERVE_ACTIVE_SESSION);
      assert.strictEqual(
        decision.reason.includes('does not match active canonical identity'),
        true
      );
      assert.strictEqual(decision.activeJob.title, sampleJobA.title);
    });

    it('HANDOFF_PREPARED strictly freezes canonical title and company against divergent handoff target', () => {
      const context = {
        activeJob: sampleJobA,
        cachedState: { jobData: sampleJobA },
        stateMachineState: WORKFLOW_STATES.APPLICATION_PREPARING,
        isLocked: false,
      };
      const signal = {
        type: SIGNAL_TYPES.HANDOFF_PREPARED,
        targetJob: {
          ...sampleJobA,
          title: 'Handoff Title Mutation Attempt',
          company: 'Handoff Company Mutation Attempt',
        },
      };

      const decision = JobIdentityAuthority.evaluateTransition(context, signal);
      assert.strictEqual(decision.action, TRANSITION_ACTIONS.RETAIN_AND_ENRICH);
      assert.strictEqual(decision.activeJob.title, sampleJobA.title);
      assert.strictEqual(decision.activeJob.company, sampleJobA.company);
      assert.strictEqual(decision.targetLockState, 'LOCKED');
    });
  });

  describe('3. SidebarController End-to-End Authority Integration', () => {
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
            const tabs = [{ id: 101, active: true, windowId: 1, url: sampleJobA.sourceUrl }];
            if (cb) cb(tabs);
            return Promise.resolve(tabs);
          },
          sendMessage: (tabId, msg, cb) => {
            const res = {
              success: true,
              detected: true,
              confidence: 'HIGH',
              jobData: sampleJobA,
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
      controller.currentUser = { id: 'usr-1', email: 'vishu@test.com' };
      controller.backendClient = {
        getHealth: async () => ({ status: 'ok' }),
        checkConnection: () => Promise.resolve(true),
        getAuthStatus: async () => ({
          authenticated: true,
          status: 'AUTHENTICATED',
          user: controller.currentUser,
        }),
        analyzeJob: async (job) => ({
          analysisSnapshotId: 'snap-p79',
          title: job.title,
          company: job.company,
          canonicalJob: { ...job, canonicalJobId: 'canon-p79' },
          fitAnalysis: { score: 88, grade: 'A', recommendation: 'RECOMMENDED' },
          recommendedProjects: [],
        }),
        prepareHandoff: async (job, appId, snapId) => ({
          applicationId: 'app-p79',
          canonicalJobId: 'canon-p79',
          analysisSnapshotId: snapId || 'snap-p79',
          title: job.title,
          targetJob: { title: job.title, company: job.company },
          packageVersion: 1,
          packageStatus: 'SAVED',
        }),
      };
    });

    it('maintains title stability across full lifecycle from detection to analysis and passive events', async () => {
      await controller.init();
      assert.strictEqual(domElements.get('jobTitle').textContent, 'Full Stack Engineer');

      // Run analyze
      await controller.runAnalyzeJob();
      assert.strictEqual(domElements.get('jobTitle').textContent, 'Full Stack Engineer');
      assert.strictEqual(controller.activeJob.title, 'Full Stack Engineer');
      assert.strictEqual(controller.cachedState.workflowState, WORKFLOW_STATES.ANALYSIS_READY);

      // Passive detection timeout event
      global.chrome.tabs.sendMessage = () => Promise.reject(new Error('timeout'));
      await controller._requestDetectionFromTab(false);
      assert.strictEqual(domElements.get('jobTitle').textContent, 'Full Stack Engineer');

      // Passive detected: false event
      global.chrome.tabs.sendMessage = () => Promise.resolve({ detected: false });
      await controller._requestDetectionFromTab(false);
      assert.strictEqual(domElements.get('jobTitle').textContent, 'Full Stack Engineer');
      assert.strictEqual(controller.activeJob.title, 'Full Stack Engineer');

      // Prepare handoff
      await controller.runPrepareHandoff();
      assert.strictEqual(domElements.get('jobTitle').textContent, 'Full Stack Engineer');
      assert.strictEqual(controller.isWorkflowLocked(), true);
      assert.strictEqual(controller.cachedState.workflowState, WORKFLOW_STATES.APPLICATION_READY);
    });
  });
});
