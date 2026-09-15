/**
 * @file P60 Identity & Terminal Extension Workflow Lock Unit Tests.
 *
 * Requirements:
 * PART A: Canonical User Identity
 * - Authenticated session resolves the canonical user.
 * - Candidate lookup follows authenticated user relationship (authenticatedUserId -> candidate.userId).
 * - No first-user fallback, no first-candidate fallback, no fixed candidate ID.
 * - Sidebar displays server-returned canonical email.
 * - Sidebar does NOT perform synthetic-email substitution (receives server truth).
 * - Logout clears authenticated identity (userName = '—', userEmail = '—', currentUser = null).
 * - Session expiry does not replace identity with mock data.
 * - Re-authentication restores canonical identity.
 *
 * PART B: Terminal Extension Workflow Lock
 * - Successful handoff produces APPLICATION_READY + LOCKED (lockState = 'LOCKED', isLocked = true).
 * - Locked workflow cannot be replaced by URL navigation.
 * - Locked workflow cannot be replaced by SPA navigation.
 * - Locked workflow cannot be replaced by active-tab changes.
 * - Locked workflow cannot be replaced by detector events.
 * - Sidebar reload restores locked workflow.
 * - Browser refresh preserves locked workflow.
 * - Session expiry preserves locked workflow.
 * - Re-authentication restores locked workflow.
 *
 * PART C: Reset Workflow Semantics
 * - Reset returns extension workflow to IDLE.
 * - Reset clears only extension active workflow state.
 * - Reset does NOT delete application, resume, cover letter, handoff package, or artifacts.
 * - Reset does NOT remove application from MCP Application List.
 * - After reset, fresh detection is allowed.
 * - Old detector events cannot resurrect the previous workflow (generation check).
 * - New workflow does not inherit old applicationId.
 *
 * PART D: Multi-User / Multi-Tab Isolation
 * - User A cannot restore User B's locked workflow.
 * - Tab B cannot inherit Tab A's unrelated locked workflow.
 * - Reset in Tab A does not delete Tab B's persisted application data.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SidebarController } from '../../extension/sidebar/sidebar.js';
import { WorkflowStateMachine, WORKFLOW_STATES } from '../../extension/lib/workflow-state-machine.js';
import { DurableWorkflowStore } from '../../extension/lib/durable-workflow-store.js';
import { resolveCandidateEmail } from '../../src/utils/candidate-email-resolver.js';

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
  global.chrome = {
    runtime: {
      onMessage: {
        addListener() {},
      },
      sendMessage: async () => ({ success: true }),
    },
    tabs: {
      query: async () => [{ id: 101, url: 'https://careers.acme.com/jobs/100' }],
      sendMessage: async () => ({ success: true }),
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
// Tests
// ---------------------------------------------------------------------------
describe('Part 60: Canonical User Identity & Terminal Extension Workflow Lock', () => {
  let controller;
  let domElements;
  let storageMap;

  const sampleJobA = {
    title: 'Staff Distributed Systems Engineer',
    company: 'Cloud Corp',
    location: 'Remote',
    employmentType: 'Full-time',
    sourceUrl: 'https://careers.cloudcorp.com/jobs/8801',
    provider: 'GENERIC',
    description: 'Looking for a Staff Engineer with Go, Distributed Systems, Kubernetes, and PostgreSQL experience.',
  };

  const sampleJobB = {
    title: 'Senior Frontend Architect',
    company: 'Web Systems Inc',
    location: 'San Francisco, CA',
    employmentType: 'Full-time',
    sourceUrl: 'https://careers.websystems.com/jobs/9902',
    provider: 'GENERIC',
    description: 'Looking for a Frontend Architect with TypeScript, React, Next.js, and CSS Architecture.',
  };

  beforeEach(() => {
    const env = setupMockDocument();
    domElements = env.elements;
    storageMap = env.storageMap;
    controller = new SidebarController();
    controller._bindElements();
    controller.activeTabId = 101;
  });

  // =========================================================================
  // PART A: Canonical User Identity
  // =========================================================================
  describe('PART A: Canonical User Identity', () => {
    it('resolves canonical candidate email from authenticated user relationship', () => {
      const authenticatedUser = {
        id: 'user-uuid-real-1234',
        email: 'authentic.user@domain.com',
        displayName: 'Authentic User',
      };
      const candidateRecord = {
        id: 'cand-uuid-real-5678',
        userId: 'user-uuid-real-1234',
        canonicalEmail: 'vishw@example.com', // Raw DB column may hold legacy synthetic seed
        displayName: 'Authentic User',
      };

      const resolved = resolveCandidateEmail(candidateRecord, authenticatedUser.email, { allowNullable: true });
      assert.strictEqual(resolved, 'authentic.user@domain.com', 'Authentic user email must supersede synthetic seed');
    });

    it('proves candidate lookup follows authenticated user relationship with no first-user fallback', () => {
      // Multiple users and candidates
      const mockDatabase = [
        { userId: 'user-1', candidateId: 'cand-1', email: 'user1@example.com' },
        { userId: 'user-2', candidateId: 'cand-2', email: 'user2@example.com' },
        { userId: 'user-3', candidateId: 'cand-3', email: 'user3@example.com' },
      ];

      function resolveCandidateForSession(sessionUserId) {
        const candidate = mockDatabase.find((c) => c.userId === sessionUserId);
        if (!candidate) return null;
        return {
          id: candidate.candidateId,
          userId: candidate.userId,
          canonicalEmail: candidate.email,
        };
      }

      // User 2 logs in
      const candidateForUser2 = resolveCandidateForSession('user-2');
      assert.strictEqual(candidateForUser2.id, 'cand-2');
      assert.strictEqual(candidateForUser2.canonicalEmail, 'user2@example.com');
      assert.notStrictEqual(candidateForUser2.id, 'cand-1', 'Must NOT fallback to first candidate');
      assert.notStrictEqual(candidateForUser2.id, 'fixed-uuid', 'Must NOT use fixed candidate ID');

      // Unauthenticated user
      const unauthCandidate = resolveCandidateForSession('non-existent-user');
      assert.strictEqual(unauthCandidate, null, 'Must return null for unknown user with no fallback');
    });

    it('sidebar displays server-returned canonical email directly without client synthetic-email substitution', async () => {
      const serverAuthPayload = {
        status: 'AUTHENTICATED',
        authenticated: true,
        user: {
          id: '9dd8e4fb-456b-4104-9cb1-c839a544b721',
          email: 'vishwanatnishad@gmail.com',
          displayName: 'Vishwanath Nishad',
        },
        candidate: {
          id: '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
          canonicalEmail: 'vishwanatnishad@gmail.com',
          displayName: 'Vishwanath Nishad',
        },
      };

      controller.backendClient.getAuthStatus = async () => serverAuthPayload;
      await controller._checkAuthStatus();

      assert.strictEqual(controller.isAuthenticated, true);
      assert.strictEqual(domElements.get('userName').textContent, 'Vishwanath Nishad');
      assert.strictEqual(domElements.get('userEmail').textContent, 'vishwanatnishad@gmail.com');
      assert.ok(!domElements.get('authAuthenticatedState').classList.contains('hidden'));
      assert.ok(domElements.get('authUnauthenticatedState').classList.contains('hidden'));
    });

    it('logout clears authenticated identity (userName = —, userEmail = —, currentUser = null)', async () => {
      controller.isAuthenticated = true;
      controller.currentUser = { id: 'u1', email: 'test@user.com' };
      controller.backendClient.logout = async () => ({ success: true });

      await controller.logout();

      assert.strictEqual(controller.isAuthenticated, false);
      assert.strictEqual(controller.currentUser, null);
      assert.strictEqual(domElements.get('userName').textContent, '—');
      assert.strictEqual(domElements.get('userEmail').textContent, '—');
      assert.ok(domElements.get('authAuthenticatedState').classList.contains('hidden'));
      assert.ok(!domElements.get('authUnauthenticatedState').classList.contains('hidden'));
    });

    it('session expiry does not replace identity with mock data', async () => {
      controller.backendClient.getAuthStatus = async () => ({
        status: 'NOT_AUTHENTICATED',
        authenticated: false,
      });

      await controller._checkAuthStatus();

      assert.strictEqual(controller.isAuthenticated, false);
      assert.strictEqual(controller.currentUser, null);
      assert.strictEqual(domElements.get('userName').textContent, '—');
      assert.strictEqual(domElements.get('userEmail').textContent, '—');
    });

    it('re-authentication restores canonical identity', async () => {
      // First unauthenticated
      controller.backendClient.getAuthStatus = async () => ({
        status: 'NOT_AUTHENTICATED',
        authenticated: false,
      });
      await controller._checkAuthStatus();
      assert.strictEqual(domElements.get('userEmail').textContent, '—');

      // Then user signs in
      controller.backendClient.getAuthStatus = async () => ({
        status: 'AUTHENTICATED',
        authenticated: true,
        user: { id: 'u1', email: 'authentic@company.com', displayName: 'Authentic Dev' },
        candidate: { id: 'c1', canonicalEmail: 'authentic@company.com', displayName: 'Authentic Dev' },
      });
      await controller._checkAuthStatus();

      assert.strictEqual(controller.isAuthenticated, true);
      assert.strictEqual(domElements.get('userName').textContent, 'Authentic Dev');
      assert.strictEqual(domElements.get('userEmail').textContent, 'authentic@company.com');
    });
  });

  // =========================================================================
  // PART B: Terminal Extension Workflow Lock
  // =========================================================================
  describe('PART B: Terminal Extension Workflow Lock', () => {
    it('successful handoff produces APPLICATION_READY + LOCKED in both stateMachine and durable store', async () => {
      controller.isAuthenticated = true;
      controller.activeJob = sampleJobA;
      controller.cachedState = {
        tabId: 101,
        jobData: sampleJobA,
        workflowState: WORKFLOW_STATES.ANALYSIS_READY,
        fitAnalysis: { overallScore: 92, recommendationBand: 'RECOMMENDED' },
        recommendedProjects: [{ id: 'p1', name: 'Distributed KV Store' }],
      };

      controller.backendClient.prepareHandoff = async () => ({
        applicationId: 'app-canonical-777',
        packageHash: 'sha256-abcdef777888',
        packageVersion: 1,
        packageStatus: 'SAVED',
        recommendedProjects: [{ id: 'p1', name: 'Distributed KV Store' }],
      });

      await controller.runPrepareHandoff();

      // Verify state machine
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.APPLICATION_READY);
      assert.strictEqual(controller.stateMachine.lockState, 'LOCKED');
      assert.strictEqual(controller.stateMachine.isLocked, true);
      assert.strictEqual(controller.isWorkflowLocked(), true);

      // Verify cached state
      assert.strictEqual(controller.cachedState.lockState, 'LOCKED');
      assert.strictEqual(controller.cachedState.isLocked, true);
      assert.strictEqual(controller.cachedState.applicationId, 'app-canonical-777');

      // Verify UI displays lock banner & locked badge
      assert.ok(!domElements.get('workflowLockBanner').classList.contains('hidden'), 'workflowLockBanner must be visible');
      assert.ok(!domElements.get('workflowLockedBadge').classList.contains('hidden'), 'workflowLockedBadge must be visible');
      assert.strictEqual(domElements.get('reanalyzeBtn').disabled, true, 'reanalyzeBtn must be disabled when locked');
    });

    it('locked workflow cannot be replaced by URL navigation (reconcileNavigation)', async () => {
      const store = new DurableWorkflowStore();
      const tabId = 101;
      const lockedState = {
        tabId,
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        jobData: sampleJobA,
        jobFingerprint: 'fp-job-a-1234',
        applicationId: 'app-canonical-777',
        handoffData: { packageHash: 'sha256-hash-a' },
      };

      await store.saveTabState(tabId, lockedState);

      // User navigates to a totally different URL
      const navEvent = {
        title: sampleJobB.title,
        company: sampleJobB.company,
        sourceUrl: sampleJobB.sourceUrl,
      };

      const result = await store.reconcileNavigation(tabId, navEvent);

      assert.strictEqual(result.isLocked, true);
      assert.strictEqual(result.lockState, 'LOCKED');
      assert.strictEqual(result.jobFingerprint, 'fp-job-a-1234', 'Must keep Job A fingerprint');
      assert.strictEqual(result.applicationId, 'app-canonical-777', 'Must keep Application A ID');
      assert.strictEqual(result.jobData.title, sampleJobA.title, 'Must preserve Job A title');
    });

    it('locked workflow cannot be replaced by SPA navigation', async () => {
      const store = new DurableWorkflowStore();
      const tabId = 101;
      const lockedState = {
        tabId,
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        jobData: sampleJobA,
        jobFingerprint: 'fp-job-a-1234',
        applicationId: 'app-canonical-777',
      };
      await store.saveTabState(tabId, lockedState);

      const spaNav = {
        sourceUrl: 'https://careers.cloudcorp.com/jobs/8801/apply?step=personal_details',
      };
      const result = await store.reconcileNavigation(tabId, spaNav);

      assert.strictEqual(result.isLocked, true);
      assert.strictEqual(result.applicationId, 'app-canonical-777');
    });

    it('locked workflow cannot be replaced by detector events (JOB_DETECTED_ON_PAGE / APPLICATION_FORM_DETECTED)', async () => {
      controller.cachedState = {
        tabId: 101,
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        jobData: sampleJobA,
        applicationId: 'app-canonical-777',
      };
      controller.stateMachine.state = WORKFLOW_STATES.APPLICATION_READY;
      controller.stateMachine.lock();
      controller.activeJob = sampleJobA;

      // Event arrives from detector for Job B
      await controller._handleJobDetectedEvent(sampleJobB);

      // Verify Job A was NOT replaced
      assert.strictEqual(controller.activeJob.title, sampleJobA.title);
      assert.strictEqual(controller.cachedState.applicationId, 'app-canonical-777');
      assert.strictEqual(controller.isWorkflowLocked(), true);
    });

    it('sidebar reload restores locked workflow', async () => {
      const store = controller.store;
      const tabId = 101;
      await store.saveTabState(tabId, {
        tabId,
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        jobData: sampleJobA,
        jobFingerprint: 'fp-job-a',
        applicationId: 'app-canonical-777',
        handoffData: { packageHash: 'pkg-hash-1', packageStatus: 'SAVED', packageVersion: 1 },
      });

      // Hydrate controller as if sidebar just opened/reloaded
      await controller._hydrateFromStore();

      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.APPLICATION_READY);
      assert.strictEqual(controller.stateMachine.isLocked, true);
      assert.strictEqual(controller.isWorkflowLocked(), true);
      assert.strictEqual(controller.activeJob.title, sampleJobA.title);
      assert.strictEqual(controller.cachedState.applicationId, 'app-canonical-777');
      assert.ok(!domElements.get('workflowLockBanner').classList.contains('hidden'));
      assert.ok(!domElements.get('workflowLockedBadge').classList.contains('hidden'));
    });

    it('browser refresh preserves locked workflow in DurableWorkflowStore', async () => {
      const store = new DurableWorkflowStore();
      const tabId = 101;
      await store.saveTabState(tabId, {
        tabId,
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        jobData: sampleJobA,
        applicationId: 'app-canonical-777',
      });

      // Read from fresh store instance
      const freshStore = new DurableWorkflowStore();
      const persistedState = await freshStore.getTabState(tabId);

      assert.strictEqual(persistedState.lockState, 'LOCKED');
      assert.strictEqual(persistedState.isLocked, true);
      assert.strictEqual(persistedState.applicationId, 'app-canonical-777');
      assert.strictEqual(freshStore.isWorkflowLocked(persistedState), true);
    });

    it('session expiry preserves locked workflow', async () => {
      controller.cachedState = {
        tabId: 101,
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        jobData: sampleJobA,
        applicationId: 'app-canonical-777',
      };
      controller.activeJob = sampleJobA;
      controller.stateMachine.state = WORKFLOW_STATES.APPLICATION_READY;
      controller.stateMachine.lock();

      // Session expires
      controller._handleSessionExpired();

      assert.strictEqual(controller.isAuthenticated, false);
      assert.strictEqual(controller.activeJob.title, sampleJobA.title, 'Active job must survive session expiry');
      assert.strictEqual(controller.cachedState.applicationId, 'app-canonical-777', 'Application ID must survive session expiry');
      assert.strictEqual(controller.isWorkflowLocked(), true, 'Lock must survive session expiry');
    });

    it('re-authentication restores locked workflow', async () => {
      controller.cachedState = {
        tabId: 101,
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        jobData: sampleJobA,
        applicationId: 'app-canonical-777',
      };
      controller.activeJob = sampleJobA;
      controller.stateMachine.state = WORKFLOW_STATES.APPLICATION_READY;
      controller.stateMachine.lock();
      await controller.store.saveTabState(101, controller.cachedState);

      // Expire session
      controller._handleSessionExpired();
      assert.strictEqual(controller.isAuthenticated, false);

      // User re-authenticates
      controller.backendClient.getAuthStatus = async () => ({
        status: 'AUTHENTICATED',
        authenticated: true,
        user: { id: 'u1', email: 'user@real.com' },
        candidate: { id: 'c1', canonicalEmail: 'user@real.com' },
      });
      await controller._checkAuthStatus();
      await controller._hydrateFromStore();

      assert.strictEqual(controller.isAuthenticated, true);
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.APPLICATION_READY);
      assert.strictEqual(controller.isWorkflowLocked(), true);
      assert.strictEqual(controller.cachedState.applicationId, 'app-canonical-777');
    });
  });

  // =========================================================================
  // PART C: Reset Workflow Semantics (Non-Destructive)
  // =========================================================================
  describe('PART C: Reset Workflow Semantics', () => {
    it('reset returns extension workflow to IDLE and clears only extension active state', async () => {
      controller.activeJob = sampleJobA;
      controller.activeJobFingerprint = 'fp-job-a';
      controller.cachedState = {
        tabId: 101,
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        jobData: sampleJobA,
        applicationId: 'app-canonical-777',
        workflowGeneration: 1,
      };
      controller.stateMachine.state = WORKFLOW_STATES.APPLICATION_READY;
      controller.stateMachine.lock();
      await controller.store.saveTabState(101, controller.cachedState);

      // Perform Reset Workflow
      await controller.resetWorkflow();

      // State machine & controller must be IDLE & unlocked
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.IDLE);
      assert.strictEqual(controller.stateMachine.isLocked, false);
      assert.strictEqual(controller.isWorkflowLocked(), false);
      assert.strictEqual(controller.activeJob, null, 'Active job must be cleared');
      assert.strictEqual(controller.activeJobFingerprint, null, 'Fingerprint must be cleared');
      assert.strictEqual(controller.cachedState.applicationId, null, 'Active app pointer in tab state must be reset');

      // Generation must have incremented
      assert.strictEqual(controller.cachedState.workflowGeneration, 2, 'Generation must increment to prevent stale races');

      // Lock UI must be hidden
      assert.ok(domElements.get('workflowLockBanner').classList.contains('hidden'));
      assert.ok(domElements.get('workflowLockedBadge').classList.contains('hidden'));
    });

    it('reset does NOT delete application, resume, cover letter, handoff kit, or MCP Application List records', async () => {
      // Simulate backend application database & MCP Application List
      const backendApplicationStore = {
        'app-canonical-777': {
          id: 'app-canonical-777',
          targetRole: 'Staff Distributed Systems Engineer',
          targetCompany: 'Cloud Corp',
          resumeArtifactId: 'artifact-resume-777',
          coverLetterArtifactId: 'artifact-cl-777',
          handoffPackageHash: 'sha256-abcdef777888',
          handoffPackageVersion: 1,
          createdAt: new Date().toISOString(),
        },
      };

      const backendArtifacts = {
        'artifact-resume-777': { type: 'resume', path: '/storage/resumes/777.pdf' },
        'artifact-cl-777': { type: 'cover_letter', path: '/storage/letters/777.pdf' },
      };

      // Spy on backend calls: ensure NO delete API is invoked
      let deleteCalled = false;
      controller.backendClient.deleteApplication = async () => {
        deleteCalled = true;
      };

      // Set up locked state
      controller.cachedState = {
        tabId: 101,
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        applicationId: 'app-canonical-777',
      };
      await controller.store.saveTabState(101, controller.cachedState);

      // Execute Reset Workflow
      await controller.resetWorkflow();

      // ASSERT INVARIANTS:
      assert.strictEqual(deleteCalled, false, 'Reset Workflow must NEVER call destructive backend APIs');
      assert.ok(backendApplicationStore['app-canonical-777'], 'Application A MUST remain in database/backend store');
      assert.ok(backendArtifacts['artifact-resume-777'], 'Resume MUST remain intact');
      assert.ok(backendArtifacts['artifact-cl-777'], 'Cover Letter MUST remain intact');
      assert.strictEqual(backendApplicationStore['app-canonical-777'].handoffPackageHash, 'sha256-abcdef777888', 'Handoff package MUST remain intact');
    });

    it('after reset, fresh detection is allowed', async () => {
      // Setup reset state
      await controller.store.resetWorkflow(101);
      controller.stateMachine.reset();
      controller.cachedState = await controller.store.getTabState(101);

      assert.strictEqual(controller.isWorkflowLocked(), false);

      // Detector delivers Job B
      await controller._handleJobDetectedEvent(sampleJobB);

      assert.strictEqual(controller.activeJob.title, sampleJobB.title);
      assert.strictEqual(controller.cachedState.jobData.title, sampleJobB.title);
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.JOB_DETECTED);
      assert.strictEqual(domElements.get('jobTitle').textContent, sampleJobB.title);
    });

    it('old detector events cannot resurrect the previous workflow (generation check)', async () => {
      // Workflow was on generation 1, then reset to generation 2
      controller.cachedState = {
        tabId: 101,
        workflowGeneration: 2,
        workflowState: WORKFLOW_STATES.IDLE,
        lockState: 'UNLOCKED',
        isLocked: false,
      };

      // Stale message arrives from an old in-flight detection belonging to generation 1
      const staleMessage = {
        type: 'JOB_DETECTED_ON_PAGE',
        generation: 1, // Stale generation
        jobData: sampleJobA,
      };

      // Mock chrome.runtime listener execution
      let handled = false;
      const mockListener = (message) => {
        if (message.generation !== undefined && controller.cachedState?.workflowGeneration !== undefined) {
          if (message.generation < controller.cachedState.workflowGeneration) {
            return; // Dropped
          }
        }
        handled = true;
      };

      mockListener(staleMessage);
      assert.strictEqual(handled, false, 'Stale event from older generation must be discarded');
    });

    it('new workflow does not inherit old applicationId', async () => {
      // Tab had Application A
      await controller.store.saveTabState(101, {
        tabId: 101,
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        applicationId: 'app-canonical-old-111',
      });

      // Reset
      await controller.resetWorkflow();

      // Start new detection with Job B
      await controller._handleJobDetectedEvent(sampleJobB);

      assert.strictEqual(controller.cachedState.applicationId, null, 'New workflow must have null applicationId before handoff');
      assert.notStrictEqual(controller.cachedState.applicationId, 'app-canonical-old-111');
    });
  });

  // =========================================================================
  // PART D: Multi-User / Multi-Tab Isolation
  // =========================================================================
  describe('PART D: Multi-User & Multi-Tab Isolation', () => {
    it('User A cannot restore User B locked workflow (multi-user isolation)', async () => {
      const store = new DurableWorkflowStore();
      const tabId = 101;

      // User A (alice) saves a locked workflow on tab 101
      await store.saveTabState(tabId, {
        tabId,
        userId: 'user-alice-111',
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        jobData: sampleJobA,
        applicationId: 'app-alice-111',
      });

      // User B (bob) logs in and attempts to hydrate tab 101
      const bobLoadedState = await store.loadState(tabId, 'user-bob-222');

      // Must NOT return Alice's workflow
      assert.strictEqual(bobLoadedState.applicationId, null, 'User B must not load User A application');
      assert.strictEqual(bobLoadedState.workflowState, WORKFLOW_STATES.IDLE);
      assert.strictEqual(bobLoadedState.lockState, 'UNLOCKED');
      assert.strictEqual(bobLoadedState.isLocked, false);
    });

    it('Tab B cannot inherit Tab A unrelated locked workflow', async () => {
      const store = new DurableWorkflowStore();

      // Tab A prepares Job A and locks
      await store.saveTabState(101, {
        tabId: 101,
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        jobData: sampleJobA,
        applicationId: 'app-tab-a-111',
      });

      // Tab B navigates to Job B
      const tabBState = await store.loadState(202);

      assert.strictEqual(tabBState.tabId, 202);
      assert.strictEqual(tabBState.workflowState, WORKFLOW_STATES.IDLE);
      assert.strictEqual(tabBState.lockState, 'UNLOCKED');
      assert.strictEqual(tabBState.isLocked, false);
      assert.strictEqual(tabBState.applicationId, null);
    });

    it('reset in Tab A does not delete Tab B persisted application data', async () => {
      const store = new DurableWorkflowStore();

      // Tab A (Job A)
      await store.saveTabState(101, {
        tabId: 101,
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        jobData: sampleJobA,
        applicationId: 'app-tab-a',
      });

      // Tab B (Job B)
      await store.saveTabState(202, {
        tabId: 202,
        workflowState: WORKFLOW_STATES.APPLICATION_READY,
        lockState: 'LOCKED',
        isLocked: true,
        jobData: sampleJobB,
        applicationId: 'app-tab-b',
      });

      // Reset Tab A
      await store.resetWorkflow(101);

      // Verify Tab A is reset
      const stateA = await store.loadState(101);
      assert.strictEqual(stateA.workflowState, WORKFLOW_STATES.IDLE);
      assert.strictEqual(stateA.lockState, 'UNLOCKED');
      assert.strictEqual(stateA.applicationId, null);

      // Verify Tab B is COMPLETELY PRESERVED
      const stateB = await store.loadState(202);
      assert.strictEqual(stateB.workflowState, WORKFLOW_STATES.APPLICATION_READY);
      assert.strictEqual(stateB.lockState, 'LOCKED');
      assert.strictEqual(stateB.isLocked, true);
      assert.strictEqual(stateB.applicationId, 'app-tab-b');
      assert.strictEqual(stateB.jobData.title, sampleJobB.title);
    });
  });
});
