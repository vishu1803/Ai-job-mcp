/**
 * @file Persistent Sidebar Controller (P57, P58, P59).
 *
 * Implements the authoritative extension UI running in the Chrome MV3 Side Panel.
 * Communicates with DurableWorkflowStore to ensure state is never lost when closing the sidebar.
 * Gated by canonical server authentication via /api/extension/session.
 * Preserves job and application state across session expiry and re-authentication.
 * Guarantees zero dead-ends: ANALYSIS_READY always exposes a prominent Prepare Handoff CTA.
 * Idempotently prepares handoff kits using canonical applicationId.
 */

import { BackendClient } from '../api/backend-client.js';
import { DurableWorkflowStore } from '../lib/durable-workflow-store.js';
import { WorkflowStateMachine, WORKFLOW_STATES } from '../lib/workflow-state-machine.js';
import {
  JobIdentity,
  JobIdentityAuthority,
  CanonicalJobIdentity,
  TRANSITION_ACTIONS,
  SIGNAL_TYPES,
} from '../lib/job-identity.js';
import { buildApplicationArtifactFilename } from '../lib/artifact-filename-builder.js';
import { DETECTION_REQUEST_TIMEOUT_MS } from '../lib/detection-timeouts.js';

class SidebarController {
  constructor() {
    this.backendClient = new BackendClient();
    this.store = new DurableWorkflowStore();
    this.stateMachine = new WorkflowStateMachine();
    this.activeTabId = null;
    this.activeJob = null;
    this.activeJobFingerprint = null;
    this.pendingDetectedJob = null;
    this.pendingDetectedFingerprint = null;
    this.cachedState = null;
    this.isAuthenticated = false;
    this.currentUser = null;
    this._isAnalyzing = false;
    this._detectionRequestId = 0;
    this._isDetectingInFlight = false;

    // DOM Elements
    this.elements = {};
  }

  async init() {
    this._bindElements();
    this._attachEventListeners();
    this._listenToRuntimeMessages();

    // Re-check authentication on window focus (e.g. after user logs in on a browser tab)
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', async () => {
        await this._checkAuthStatus();
      });
    }

    // Determine current active tab
    await this._syncActiveTab();

    // Check backend connection & authentication
    await this._checkBackendConnection();
    await this._checkAuthStatus();

    // Hydrate state from durable store
    await this._hydrateFromStore();

    // Reconcile with real page in current active tab
    await this._requestDetectionFromTab();
  }

  _bindElements() {
    this.elements = {
      connectionBadge: document.getElementById('connectionBadge'),
      connectionText: document.getElementById('connectionText'),
      refreshBtn: document.getElementById('refreshBtn'),
      rescanBtn: document.getElementById('rescanBtn'),

      // Pending Job Notification (Part 61)
      pendingJobNotification: document.getElementById('pendingJobNotification'),
      pendingJobTitle: document.getElementById('pendingJobTitle'),
      rescanPendingBtn: document.getElementById('rescanPendingBtn'),

      // Auth Elements (P59)
      authBar: document.getElementById('authBar'),
      authUnauthenticatedState: document.getElementById('authUnauthenticatedState'),
      authAuthenticatedState: document.getElementById('authAuthenticatedState'),
      loginBtn: document.getElementById('loginBtn'),
      logoutBtn: document.getElementById('logoutBtn'),
      userName: document.getElementById('userName'),
      userEmail: document.getElementById('userEmail'),
      userAvatar: document.getElementById('userAvatar'),
      sessionExpiredNotice: document.getElementById('sessionExpiredNotice'),
      reauthBtn: document.getElementById('reauthBtn'),

      // Status Bar
      workflowStatusBar: document.getElementById('workflowStatusBar'),
      workflowStateText: document.getElementById('workflowStateText'),
      workflowLockedBadge: document.getElementById('workflowLockedBadge'),
      syncIndicator: document.getElementById('syncIndicator'),

      // Portal Card
      portalCard: document.getElementById('portalCard'),
      portalName: document.getElementById('portalName'),
      confidenceBadge: document.getElementById('confidenceBadge'),
      capJob: document.getElementById('capJob'),
      capApp: document.getElementById('capApp'),
      capForm: document.getElementById('capForm'),
      capAutofill: document.getElementById('capAutofill'),

      // Job Card
      jobCard: document.getElementById('jobCard'),
      reanalyzeBtn: document.getElementById('reanalyzeBtn'),
      jobNotDetectedState: document.getElementById('jobNotDetectedState'),
      jobDetectedState: document.getElementById('jobDetectedState'),
      jobTitle: document.getElementById('jobTitle'),
      jobCompany: document.getElementById('jobCompany'),
      jobLocation: document.getElementById('jobLocation'),
      jobType: document.getElementById('jobType'),
      jobIdTag: document.getElementById('jobIdTag'),
      analyzeJobBtn: document.getElementById('analyzeJobBtn'),
      descriptionLoadingNotice: document.getElementById('descriptionLoadingNotice'),
      descriptionLoadingText: document.getElementById('descriptionLoadingText'),
      analysisErrorBanner: document.getElementById('analysisErrorBanner'),
      analysisErrorMessage: document.getElementById('analysisErrorMessage'),
      retryAnalysisBtn: document.getElementById('retryAnalysisBtn'),

      // Analysis Card
      analysisCard: document.getElementById('analysisCard'),
      matchBandBadge: document.getElementById('matchBandBadge'),
      scoreValue: document.getElementById('scoreValue'),
      matchedSkillsCount: document.getElementById('matchedSkillsCount'),
      missingSkillsCount: document.getElementById('missingSkillsCount'),
      experienceFitVal: document.getElementById('experienceFitVal'),
      matchedSkillsList: document.getElementById('matchedSkillsList'),
      missingSkillsList: document.getElementById('missingSkillsList'),
      analysisNextActionBox: document.getElementById('analysisNextActionBox'),

      // Recommended Projects Card
      projectsCard: document.getElementById('projectsCard'),
      recommendedProjectsList: document.getElementById('recommendedProjectsList'),

      // Handoff Card
      handoffCard: document.getElementById('handoffCard'),
      handoffStatusBadge: document.getElementById('handoffStatusBadge'),
      handoffTelemetryRow: document.getElementById('handoffTelemetryRow'),
      handoffAppId: document.getElementById('handoffAppId'),
      handoffPackageMeta: document.getElementById('handoffPackageMeta'),
      workflowLockBanner: document.getElementById('workflowLockBanner'),
      resetWorkflowBtn: document.getElementById('resetWorkflowBtn'),
      handoffErrorBanner: document.getElementById('handoffErrorBanner'),
      handoffErrorMessage: document.getElementById('handoffErrorMessage'),
      retryHandoffBtn: document.getElementById('retryHandoffBtn'),
      prepareHandoffBtn: document.getElementById('prepareHandoffBtn'),
      prepareSpinner: document.getElementById('prepareSpinner'),
      prepareBtnText: document.getElementById('prepareBtnText'),
      regenerateHandoffBtn: document.getElementById('regenerateHandoffBtn'),
      regenerateConfirmBox: document.getElementById('regenerateConfirmBox'),
      cancelRegenerateBtn: document.getElementById('cancelRegenerateBtn'),
      confirmRegenerateBtn: document.getElementById('confirmRegenerateBtn'),
      artifactsContainer: document.getElementById('artifactsContainer'),
      reviewResumeBtn: document.getElementById('reviewResumeBtn'),
      downloadResumeBtn: document.getElementById('downloadResumeBtn'),
      reviewCoverLetterBtn: document.getElementById('reviewCoverLetterBtn'),
      downloadCoverLetterBtn: document.getElementById('downloadCoverLetterBtn'),
      downloadBundleBtn: document.getElementById('downloadBundleBtn'),
      viewAppDashboardLink: document.getElementById('viewAppDashboardLink'),

      // Form Card
      formDetectionCard: document.getElementById('formDetectionCard'),
      stepIndicator: document.getElementById('stepIndicator'),
      formStatusMessage: document.getElementById('formStatusMessage'),
      formFieldsSummary: document.getElementById('formFieldsSummary'),
      autofillFormBtn: document.getElementById('autofillFormBtn'),
      sensitiveConfirmationBox: document.getElementById('sensitiveConfirmationBox'),
      confirmSensitiveAutofill: document.getElementById('confirmSensitiveAutofill'),

      // AI Assistant Card (5 Primary Dimensions)
      assistantCard: document.getElementById('assistantCard'),
      assistantStatusBadge: document.getElementById('assistantStatusBadge'),
      assistantUnavailableBanner: document.getElementById('assistantUnavailableBanner'),
      assistantUnavailableText: document.getElementById('assistantUnavailableText'),
      readinessScoreBadge: document.getElementById('readinessScoreBadge'),
      readinessSummaryText: document.getElementById('readinessSummaryText'),
      assistantMissingBox: document.getElementById('assistantMissingBox'),
      assistantMissingList: document.getElementById('assistantMissingList'),
      assistantConflictsBox: document.getElementById('assistantConflictsBox'),
      assistantConflictsList: document.getElementById('assistantConflictsList'),
      aiExplainJobBtn: document.getElementById('aiExplainJobBtn'),
      aiCheckReqsBtn: document.getElementById('aiCheckReqsBtn'),
      aiAutofillPlanBtn: document.getElementById('aiAutofillPlanBtn'),
      assistantResponseBox: document.getElementById('assistantResponseBox'),
      assistantResponseContent: document.getElementById('assistantResponseContent'),
      assistantQueryInput: document.getElementById('assistantQueryInput'),
      assistantSendBtn: document.getElementById('assistantSendBtn'),
    };
  }

  _attachEventListeners() {
    this.elements.rescanPendingBtn?.addEventListener('click', async () => {
      await this.rescan();
    });

    this.elements.rescanBtn?.addEventListener('click', async () => {
      await this.rescan();
    });

    this.elements.refreshBtn?.addEventListener('click', async () => {
      await this._checkBackendConnection();
      await this._checkAuthStatus();
      await this._syncActiveTab();
      if (!this.isWorkflowLocked()) {
        await this._requestDetectionFromTab();
      }
    });

    this.elements.loginBtn?.addEventListener('click', async () => {
      await this.login();
    });

    this.elements.reauthBtn?.addEventListener('click', async () => {
      await this.login();
    });

    this.elements.logoutBtn?.addEventListener('click', async () => {
      await this.logout();
    });

    this.elements.reanalyzeBtn?.addEventListener('click', async () => {
      if (this.isWorkflowLocked()) return;
      await this._requestDetectionFromTab();
    });

    this.elements.analyzeJobBtn?.addEventListener('click', async () => {
      await this.runAnalyzeJob();
    });

    this.elements.retryAnalysisBtn?.addEventListener('click', async () => {
      await this.runAnalyzeJob();
    });

    // AI Assistant Listeners
    this.elements.aiExplainJobBtn?.addEventListener('click', async () => {
      await this.handleExplainJob();
    });

    this.elements.aiCheckReqsBtn?.addEventListener('click', async () => {
      await this.handleCheckRequirements();
    });

    this.elements.aiAutofillPlanBtn?.addEventListener('click', async () => {
      await this.handlePreviewAutofillPlan();
    });

    this.elements.assistantSendBtn?.addEventListener('click', async () => {
      await this.handleAssistantQuery();
    });

    this.elements.assistantQueryInput?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await this.handleAssistantQuery();
      }
    });

    // Single Authoritative Handoff CTA (P62)
    this.elements.prepareHandoffBtn?.addEventListener('click', async () => {
      const handoffState = this.getHandoffState();
      if (handoffState === 'EXISTING') {
        await this.viewHandoffKit();
      } else {
        await this.runPrepareHandoff();
      }
    });

    // Deliberate Secondary Regeneration & In-card Confirmation (P62)
    this.elements.regenerateHandoffBtn?.addEventListener('click', () => {
      this.elements.regenerateConfirmBox?.classList.remove('hidden');
    });

    this.elements.cancelRegenerateBtn?.addEventListener('click', () => {
      this.elements.regenerateConfirmBox?.classList.add('hidden');
    });

    this.elements.confirmRegenerateBtn?.addEventListener('click', async () => {
      this.elements.regenerateConfirmBox?.classList.add('hidden');
      await this.runPrepareHandoff({ isRegeneration: true });
    });

    this.elements.retryHandoffBtn?.addEventListener('click', async () => {
      await this.runPrepareHandoff();
    });

    this.elements.reviewResumeBtn?.addEventListener('click', async () => {
      await this._triggerReview('resume');
    });

    this.elements.downloadResumeBtn?.addEventListener('click', async () => {
      await this._triggerDownload('resume');
    });

    this.elements.reviewCoverLetterBtn?.addEventListener('click', async () => {
      await this._triggerReview('cover-letter');
    });

    this.elements.downloadCoverLetterBtn?.addEventListener('click', async () => {
      await this._triggerDownload('cover-letter');
    });

    this.elements.downloadBundleBtn?.addEventListener('click', async () => {
      await this._triggerDownload('bundle');
    });

    this.elements.viewAppDashboardLink?.addEventListener('click', async (e) => {
      e.preventDefault();
      await this._openDashboardApplication();
    });

    this.elements.resetWorkflowBtn?.addEventListener('click', async () => {
      await this.resetWorkflow();
    });
  }

  isWorkflowLocked() {
    return (
      this.stateMachine?.isLocked === true ||
      this.cachedState?.lockState === 'LOCKED' ||
      this.cachedState?.isLocked === true
    );
  }

  getHandoffState(state = this.cachedState) {
    if (this.stateMachine?.state === WORKFLOW_STATES.APPLICATION_PREPARING) {
      return 'PREPARING';
    }
    const hasHandoff = Boolean(
      state?.handoffData && (state?.applicationId || state?.handoffData?.applicationId)
    );
    if (hasHandoff) {
      return 'EXISTING';
    }
    if (state?.workflowState === WORKFLOW_STATES.APPLICATION_READY && state?.handoffData) {
      return 'EXISTING';
    }
    if (state?.workflowState === WORKFLOW_STATES.ANALYSIS_READY || state?.fitAnalysis) {
      return 'AVAILABLE';
    }
    return 'UNAVAILABLE';
  }

  async viewHandoffKit() {
    if (this.elements.artifactsContainer) {
      this.elements.artifactsContainer.classList.remove('hidden');
      if (typeof this.elements.artifactsContainer.scrollIntoView === 'function') {
        this.elements.artifactsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  // _clearTransientTabState is defined after logout() below — single canonical definition (P71)

  _listenToRuntimeMessages() {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender) => {
        if (message.type === 'ACTIVE_TAB_CHANGED') {
          if (this.pinnedTabId) {
            return;
          }
          if (message.tabId && message.tabId !== this.activeTabId) {
            this._detectionRequestId++;
            this.activeTabId = message.tabId;
            this._clearTransientTabState();
            (async () => {
              await this._hydrateFromStore();
              await this._requestDetectionFromTab();
            })();
          }
        } else if (message.type === 'TAB_UPDATED') {
          if (this.pinnedTabId && message.tabId !== this.pinnedTabId) {
            return;
          }
          if (
            message.tabId === this.activeTabId &&
            (message.status === 'complete' || message.url)
          ) {
            (async () => {
              await this._requestDetectionFromTab();
            })();
          }
        } else if (message.type === 'JOB_DETECTED_ON_PAGE') {
          // P68: Passive event must NEVER mutate or reconcile sidebar state.
          // DETECT_JOB_PAGE is the ONLY authoritative current-page reconciliation result.
          return;
        } else if (message.type === 'JOB_DESCRIPTION_HYDRATED') {
          // P72-FIX: Sidebar validation:
          // Accept only when message.tabId === activeTabId AND message.jobFingerprint === activeJobFingerprint
          if (!this.activeTabId || !message.tabId || message.tabId !== this.activeTabId) {
            return;
          }
          if (sender?.tab?.id && sender.tab.id !== this.activeTabId) {
            return;
          }
          if (
            !this.activeJobFingerprint ||
            !message.jobFingerprint ||
            message.jobFingerprint !== this.activeJobFingerprint
          ) {
            return;
          }
          if (
            !message.jobData ||
            !message.jobData.title ||
            message.jobData.title === 'Untitled Role'
          ) {
            return;
          }
          (async () => {
            await this._handleHydratedDescription(message.jobData, message.jobFingerprint);
          })();
        } else if (message.type === 'APPLICATION_FORM_DETECTED') {
          if (this.isWorkflowLocked()) {
            return;
          }
          if (this.activeTabId && message.tabId && message.tabId !== this.activeTabId) {
            return;
          }
          if (this.activeTabId && sender?.tab?.id && sender.tab.id !== this.activeTabId) {
            return;
          }
          if (
            message.generation !== undefined &&
            this.cachedState?.workflowGeneration !== undefined
          ) {
            if (message.generation < this.cachedState.workflowGeneration) {
              return;
            }
          }
          this._handleFormDetectedEvent(message.formData);
        }
      });
    }
  }

  async _syncActiveTab() {
    try {
      if (typeof window !== 'undefined' && window.location?.search) {
        const urlParams = new URLSearchParams(window.location.search);
        const paramTabId = urlParams.get('tabId');
        if (paramTabId) {
          this.activeTabId = parseInt(paramTabId, 10) || paramTabId;
          this.pinnedTabId = this.activeTabId;
          return;
        }
      }

      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          this.activeTabId = tab.id;
        }
      }
    } catch (err) {
      console.warn('Could not query active tab:', err);
    }
  }

  async _checkBackendConnection() {
    try {
      const health = await this.backendClient.getHealth();
      if (health && (health.status === 'ok' || health.ok || health.healthy)) {
        this._setConnectionStatus(true);
        return true;
      } else {
        this._setConnectionStatus(false);
        return false;
      }
    } catch {
      this._setConnectionStatus(false);
      return false;
    }
  }

  _setConnectionStatus(isConnected) {
    if (isConnected) {
      this.elements.connectionBadge.className = 'status-badge connected';
      this.elements.connectionText.textContent = 'Connected';
    } else {
      this.elements.connectionBadge.className = 'status-badge disconnected';
      this.elements.connectionText.textContent = 'Disconnected';
    }
  }

  /**
   * Authoritative session verification via canonical /api/extension/session.
   * Ensures no fake "authenticated" state exists.
   */
  async _checkAuthStatus() {
    try {
      const auth = await this.backendClient.getAuthStatus();
      if (auth && auth.authenticated === true && auth.status === 'AUTHENTICATED') {
        this.isAuthenticated = true;
        this.currentUser = auth.user || auth.candidate || null;
        this._renderAuthState(true, auth);
        this.elements.sessionExpiredNotice?.classList.add('hidden');
        return true;
      } else {
        const wasAuthenticated = this.isAuthenticated;
        this.isAuthenticated = false;
        this.currentUser = null;
        this._renderAuthState(false);
        if (wasAuthenticated) {
          this._handleSessionExpired();
        }
        return false;
      }
    } catch (err) {
      const wasAuthenticated = this.isAuthenticated;
      this.isAuthenticated = false;
      this.currentUser = null;
      this._renderAuthState(false);
      if (wasAuthenticated) {
        this._handleSessionExpired();
      }
      return false;
    }
  }

  _renderAuthState(isAuthenticated, authData = null) {
    if (isAuthenticated && authData) {
      this.elements.authUnauthenticatedState?.classList.add('hidden');
      this.elements.authAuthenticatedState?.classList.remove('hidden');

      const displayName =
        authData.candidate?.displayName ||
        authData.user?.displayName ||
        authData.user?.email?.split('@')[0] ||
        'User';
      const email = authData.candidate?.canonicalEmail || authData.user?.email || '';

      if (this.elements.userName) this.elements.userName.textContent = displayName;
      if (this.elements.userEmail) this.elements.userEmail.textContent = email;
    } else {
      this.elements.authUnauthenticatedState?.classList.remove('hidden');
      this.elements.authAuthenticatedState?.classList.add('hidden');
      if (this.elements.userName) this.elements.userName.textContent = '—';
      if (this.elements.userEmail) this.elements.userEmail.textContent = '—';
    }
  }

  /**
   * Handles expired server sessions gracefully.
   * Gating: prompts login, but PRESERVES job + analysis + application state in DurableWorkflowStore.
   */
  _handleSessionExpired() {
    this.isAuthenticated = false;
    this._renderAuthState(false);
    this.elements.sessionExpiredNotice?.classList.remove('hidden');
    // Note: this.cachedState and this.activeJob are intentionally preserved.
  }

  async login() {
    const loginUrl = await this.backendClient.getLoginUrl();
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      await chrome.tabs.create({ url: loginUrl });
    } else if (typeof window !== 'undefined') {
      window.open(loginUrl, '_blank');
    }
  }

  async logout() {
    await this.backendClient.logout();
    this.isAuthenticated = false;
    this.currentUser = null;
    this._renderAuthState(false);
    this.elements.sessionExpiredNotice?.classList.add('hidden');
    // Note: Detected job on the current page remains visible.
  }

  _clearTransientTabState() {
    this.activeJob = null;
    this.activeJobFingerprint = null;
    this.pendingDetectedJob = null;
    this.pendingDetectedFingerprint = null;
    this.cachedState = null;
    this._isAnalyzing = false;
    this._isDetectingInFlight = false;
    this.stateMachine.reset();
    if (this.elements.jobTitle) this.elements.jobTitle.textContent = '—';
    if (this.elements.jobCompany) this.elements.jobCompany.textContent = '—';
    this._renderEmptyJobState();
    this._hidePendingJobNotification();
    this.elements.workflowLockBanner?.classList.add('hidden');
    this.elements.workflowLockedBadge?.classList.add('hidden');
    this.elements.regenerateConfirmBox?.classList.add('hidden');
    this.elements.regenerateHandoffBtn?.classList.add('hidden');
    this.elements.analysisErrorBanner?.classList.add('hidden');
    this.elements.handoffErrorBanner?.classList.add('hidden');
  }

  async _hydrateFromStore() {
    if (!this.activeTabId) return;

    const currentUserId = this.currentUser?.id || null;
    const durableState = await this.store.getTabState(this.activeTabId, currentUserId);

    // Completely switch in-memory controller state to this tab's state:
    this.cachedState = durableState || this.store.createInitialState(this.activeTabId);
    this.activeJob = durableState?.jobData || null;
    this.activeJobFingerprint = durableState?.jobFingerprint || null;
    this.stateMachine.state = durableState?.workflowState || WORKFLOW_STATES.IDLE;

    if (durableState?.lockState === 'LOCKED' || durableState?.isLocked === true) {
      this.stateMachine.lock();
    } else {
      this.stateMachine.unlock();
    }

    // Scoped pending detected job
    if (durableState?.pendingDetectedJob) {
      this.pendingDetectedJob = durableState.pendingDetectedJob;
      this.pendingDetectedFingerprint = durableState.pendingDetectedFingerprint;
      this._renderPendingJobNotification(durableState.pendingDetectedJob);
    } else {
      this.pendingDetectedJob = null;
      this.pendingDetectedFingerprint = null;
      this._hidePendingJobNotification();
    }

    if (durableState && durableState.jobData) {
      this._renderAllFromState(durableState);
    } else {
      this._renderEmptyJobState();
      this._renderWorkflowStatus(this.stateMachine.state, this.isWorkflowLocked());
    }
  }

  async _handleHydratedDescription(jobData, jobFingerprint) {
    if (!jobData || !jobFingerprint) return;

    const decision = JobIdentityAuthority.evaluateTransition(
      {
        activeJob: this.activeJob,
        cachedState: this.cachedState,
        stateMachineState: this.stateMachine?.state,
        isLocked: this.isWorkflowLocked(),
        pendingDetectedJob: this.pendingDetectedJob,
      },
      {
        type: SIGNAL_TYPES.HYDRATE_DESCRIPTION,
        detectedJob: jobData,
        jobFingerprint,
      }
    );

    if (decision.action !== TRANSITION_ACTIONS.RETAIN_AND_ENRICH) {
      return;
    }

    this.activeJob = decision.activeJob;

    if (this.pendingDetectedFingerprint === jobFingerprint) {
      this.pendingDetectedJob = null;
      this.pendingDetectedFingerprint = null;
      await this.store.setPendingDetectedJob(this.activeTabId, null);
      this._hidePendingJobNotification();
    }

    if (this.cachedState) {
      this.cachedState.jobData = this.activeJob;
      this.cachedState.jobFingerprint = this.activeJobFingerprint;
      await this.store.saveTabState(this.activeTabId, this.cachedState);
    } else {
      const stateToSave = {
        tabId: this.activeTabId,
        userId: this.currentUser?.id || null,
        workflowGeneration: 1,
        lockState: 'UNLOCKED',
        isLocked: false,
        jobData: this.activeJob,
        jobFingerprint: this.activeJobFingerprint,
        workflowState: WORKFLOW_STATES.JOB_DETECTED,
        fitAnalysis: null,
        recommendedProjects: [],
        applicationId: null,
        analysisSnapshotId: null,
        handoffData: null,
        portalMetadata: jobData.portalMetadata || {
          portalName: 'Generic Career Portal',
          confidence: 'MEDIUM',
        },
      };
      this.cachedState = stateToSave;
      await this.store.saveTabState(this.activeTabId, stateToSave);
    }

    this._renderAllFromState(this.cachedState);
  }

  _reconcileDetectedJob(jobData) {
    if (!jobData || !jobData.title) return;

    const decision = JobIdentityAuthority.evaluateTransition(
      {
        activeJob: this.activeJob,
        cachedState: this.cachedState,
        stateMachineState: this.stateMachine?.state,
        isLocked: this.isWorkflowLocked(),
        pendingDetectedJob: this.pendingDetectedJob,
      },
      {
        type: SIGNAL_TYPES.DETECTION_RESULT,
        detectedJob: jobData,
        isExplicitUserAction: false,
      }
    );

    if (decision.action === TRANSITION_ACTIONS.RETAIN_AND_ENRICH) {
      if (this.pendingDetectedFingerprint === decision.canonicalIdentity?.fingerprint) {
        this.pendingDetectedJob = null;
        this.pendingDetectedFingerprint = null;
        this.store.setPendingDetectedJob(this.activeTabId, null);
        this._hidePendingJobNotification();
      }

      // P70 & P72: If active job was missing substantive description and new jobData has hydrated it:
      const existingDesc = (this.activeJob?.description || '').trim();
      const newDesc = (jobData.description || '').trim();
      if (newDesc.length >= 50 && (existingDesc.length < 50 || !this.activeJob?.analysisReady)) {
        return this._handleHydratedDescription(
          jobData,
          decision.canonicalIdentity?.fingerprint || this.activeJobFingerprint
        );
      }
      return;
    }

    if (decision.action === TRANSITION_ACTIONS.QUEUE_PENDING_JOB) {
      this.pendingDetectedJob = decision.pendingDetectedJob;
      this.pendingDetectedFingerprint = decision.pendingDetectedFingerprint;
      this.store.setPendingDetectedJob(this.activeTabId, decision.pendingDetectedJob);
      this._renderPendingJobNotification(decision.pendingDetectedJob);
      return;
    }

    // No active workflow exists (IDLE / empty): adopt as active job
    return this._handleJobDetectedEvent(jobData);
  }

  async _requestDetectionFromTab(isExplicitRescan = false) {
    if (!this.activeTabId) return false;

    const requestId = ++this._detectionRequestId;
    const requestTabId = this.activeTabId;
    const requestGeneration = this.cachedState?.workflowGeneration || 0;
    this._isDetectingInFlight = true;

    const isStale = (resp = null) => {
      if (this._detectionRequestId !== requestId) return true;
      if (this.activeTabId !== requestTabId) return true;
      if (!isExplicitRescan && (this.cachedState?.workflowGeneration || 0) > requestGeneration)
        return true;
      if (resp) {
        if (resp.requestId !== undefined && resp.requestId !== requestId) return true;
        if (resp.tabId !== undefined && resp.tabId !== requestTabId) return true;
        if (
          !isExplicitRescan &&
          resp.generation !== undefined &&
          (this.cachedState?.workflowGeneration || 0) > resp.generation
        )
          return true;
      }
      return false;
    };

    try {
      // P71: Use shared timeout constant (7000ms > content-script 5000ms hydration deadline)
      const sendWithTimeout = (promise, ms = DETECTION_REQUEST_TIMEOUT_MS) =>
        Promise.race([
          promise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Detection request timed out')), ms)
          ),
        ]);

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        await sendWithTimeout(
          chrome.runtime.sendMessage({
            type: 'ENSURE_CONTENT_SCRIPT',
            tabId: requestTabId,
          })
        ).catch(() => null);
      }

      if (isStale()) {
        return false;
      }

      if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
        let response = null;
        let isTransportError = false;
        try {
          response = await sendWithTimeout(
            chrome.tabs.sendMessage(requestTabId, {
              type: 'DETECT_JOB_PAGE',
              requestId,
              tabId: requestTabId,
              generation: requestGeneration,
            })
          );
        } catch (err) {
          isTransportError = true;
        }

        if (isStale(response)) {
          return false;
        }

        if (response?.portalMetadata) {
          this._renderPortalCard(response.portalMetadata);
        } else if (!this.activeJob) {
          this._renderPortalCard({ portalName: 'Web Page', isPortalRecognized: false });
        }

        const decision = JobIdentityAuthority.evaluateTransition(
          {
            activeJob: this.activeJob,
            cachedState: this.cachedState,
            stateMachineState: this.stateMachine?.state,
            isLocked: this.isWorkflowLocked(),
            pendingDetectedJob: this.pendingDetectedJob,
          },
          {
            type: isTransportError ? SIGNAL_TYPES.TRANSPORT_ERROR : SIGNAL_TYPES.DETECTION_RESULT,
            detectedJob: response?.detected ? response.jobData : null,
            isExplicitUserAction: isExplicitRescan,
            isTransportError,
          }
        );

        if (decision.action === TRANSITION_ACTIONS.RETAIN_AND_ENRICH) {
          this.activeJob = decision.activeJob;
          if (this.cachedState) {
            this.cachedState.jobData = decision.activeJob;
            await this.store.saveTabState(requestTabId, this.cachedState);
          }
          this._renderJobCard(decision.activeJob);
          return true;
        }

        if (decision.action === TRANSITION_ACTIONS.BIND_NEW_JOB) {
          if (isExplicitRescan) {
            await this._switchToJob(decision.activeJob);
          } else {
            await this._reconcileDetectedJob(decision.activeJob);
          }
          return true;
        }

        if (decision.action === TRANSITION_ACTIONS.SWITCH_JOB) {
          await this._switchToJob(decision.activeJob);
          return true;
        }

        if (decision.action === TRANSITION_ACTIONS.QUEUE_PENDING_JOB) {
          this.pendingDetectedJob = decision.pendingDetectedJob;
          this.pendingDetectedFingerprint = decision.pendingDetectedFingerprint;
          await this.store.setPendingDetectedJob(requestTabId, decision.pendingDetectedJob);
          this._renderPendingJobNotification(decision.pendingDetectedJob);
          return true;
        }

        if (decision.action === TRANSITION_ACTIONS.PRESERVE_ACTIVE_SESSION) {
          if (decision.preserveActiveJob || this.activeJob) {
            if (this.cachedState && (this.cachedState.jobData || this.activeJob)) {
              this._renderJobCard(this.cachedState.jobData || this.activeJob);
            }
          } else if (!this.isWorkflowLocked()) {
            if (this.elements.descriptionLoadingNotice) {
              this.elements.descriptionLoadingNotice.classList.remove('hidden');
              if (this.elements.descriptionLoadingText) {
                this.elements.descriptionLoadingText.textContent =
                  'Detection still loading — click Rescan to retry';
              }
            }
          }
          return false;
        }

        if (decision.action === TRANSITION_ACTIONS.EXPLICIT_CLEAR) {
          this.pendingDetectedJob = null;
          this.pendingDetectedFingerprint = null;
          await this.store.setPendingDetectedJob(requestTabId, null);
          this._hidePendingJobNotification();

          this.activeJob = null;
          this.activeJobFingerprint = null;
          this.stateMachine.reset();
          if (this.cachedState) {
            this.cachedState.jobData = null;
            this.cachedState.jobFingerprint = null;
            this.cachedState.normalizedJob = null;
            this.cachedState.fitAnalysis = null;
            this.cachedState.recommendedProjects = null;
            this.cachedState.analysisSnapshotId = null;
            this.cachedState.workflowState = WORKFLOW_STATES.IDLE;
            await this.store.saveTabState(requestTabId, this.cachedState);
          }
          this._renderEmptyJobState();
          this._renderWorkflowStatus(WORKFLOW_STATES.IDLE, false);
          return false;
        }
      }
    } catch (err) {
      if (!isStale()) {
        if (!this.activeJob && !this.isWorkflowLocked()) {
          if (this.elements.descriptionLoadingNotice) {
            this.elements.descriptionLoadingNotice.classList.remove('hidden');
            if (this.elements.descriptionLoadingText) {
              this.elements.descriptionLoadingText.textContent =
                'Detection still loading — click Rescan to retry';
            }
          }
        }
      }
      return false;
    } finally {
      if (this._detectionRequestId === requestId) {
        this._isDetectingInFlight = false;
      }
    }
    return false;
  }

  async rescan() {
    if (!this.activeTabId) {
      await this._syncActiveTab();
    }
    if (!this.activeTabId) return;

    await this._requestDetectionFromTab(true);
  }

  async _switchToJob(newJob) {
    if (!newJob || !newJob.title) return;
    const fingerprint = JobIdentity.deriveJobFingerprint(newJob);

    // Switch active extension workflow to newJob:
    // increments workflow generation, clears active references, sets JOB_DETECTED, clears pending
    const switchedState = await this.store.switchWorkflow(this.activeTabId, newJob);

    this.activeJob = newJob;
    this.activeJobFingerprint = fingerprint;
    this.pendingDetectedJob = null;
    this.pendingDetectedFingerprint = null;
    this.cachedState = switchedState;

    this.stateMachine.unlock();
    this.stateMachine.state = WORKFLOW_STATES.JOB_DETECTED;

    this._hidePendingJobNotification();
    this.elements.workflowLockBanner?.classList.add('hidden');
    this.elements.workflowLockedBadge?.classList.add('hidden');

    this._renderAllFromState(switchedState);

    // P71: Content script is sole hydration owner — no sidebar hydration poll.
  }

  _renderPendingJobNotification(jobData) {
    if (!this.elements.pendingJobNotification) return;
    if (this.elements.pendingJobTitle) {
      const title = jobData.title || 'Untitled Role';
      const company = jobData.company ? ` • ${jobData.company}` : '';
      this.elements.pendingJobTitle.textContent = `${title}${company}`;
    }
    this.elements.pendingJobNotification.classList.remove('hidden');
  }

  _hidePendingJobNotification() {
    if (this.elements.pendingJobNotification) {
      this.elements.pendingJobNotification.classList.add('hidden');
    }
  }

  async _handleJobDetectedEvent(jobData) {
    if (!jobData || !jobData.title) {
      if (!this.activeJob) this._renderEmptyJobState();
      return;
    }

    const fingerprint = JobIdentity.deriveJobFingerprint(jobData);

    // If same job detected as active, do nothing
    if (this.activeJobFingerprint && fingerprint === this.activeJobFingerprint) {
      return;
    }

    // When detector sees a DIFFERENT job while an active workflow exists or workflow is locked:
    // preserve active workflow and store pending job
    if (this.activeJob || this.isWorkflowLocked()) {
      this.pendingDetectedJob = jobData;
      this.pendingDetectedFingerprint = fingerprint;
      await this.store.setPendingDetectedJob(this.activeTabId, jobData);
      this._renderPendingJobNotification(jobData);
      return;
    }

    if (this.activeTabId) {
      const persisted = await this.store.getTabState(this.activeTabId);
      if (this.store.isWorkflowLocked(persisted)) {
        this.cachedState = persisted;
        this.activeJob = persisted.jobData;
        this.activeJobFingerprint = persisted.jobFingerprint;
        this.stateMachine.state = persisted.workflowState;
        this.stateMachine.lock();
        this._renderAllFromState(persisted);

        if (fingerprint !== persisted.jobFingerprint) {
          this.pendingDetectedJob = jobData;
          this.pendingDetectedFingerprint = fingerprint;
          await this.store.setPendingDetectedJob(this.activeTabId, jobData);
          this._renderPendingJobNotification(jobData);
        }
        return;
      }
    }

    this.activeJob = jobData;
    this.activeJobFingerprint = fingerprint;

    const existingJobState = await this.store.getJobState(fingerprint);

    let stateToSave = {
      tabId: this.activeTabId,
      userId: this.currentUser?.id || null,
      workflowGeneration: this.cachedState?.workflowGeneration || 1,
      lockState: 'UNLOCKED',
      isLocked: false,
      jobData,
      jobFingerprint: fingerprint,
      workflowState: existingJobState?.workflowState || WORKFLOW_STATES.JOB_DETECTED,
      fitAnalysis: existingJobState?.fitAnalysis || null,
      recommendedProjects: existingJobState?.recommendedProjects || [],
      applicationId: existingJobState?.applicationId || null,
      analysisSnapshotId: existingJobState?.analysisSnapshotId || null,
      handoffData: existingJobState?.handoffData || null,
      portalMetadata: jobData.portalMetadata || {
        portalName: 'Generic Career Portal',
        confidence: 'MEDIUM',
        capabilities: {
          jobExtraction: true,
          applicationDetection: true,
          formExtraction: false,
          automaticFieldMapping: false,
        },
      },
    };

    await this.store.saveTabState(this.activeTabId, stateToSave);
    this.cachedState = stateToSave;
    this.stateMachine.state = stateToSave.workflowState;

    this._renderAllFromState(stateToSave);

    // P71: Content script is sole hydration owner — no sidebar hydration poll.
  }

  // P71: _scheduleDescriptionHydrationPoll REMOVED.
  // Content script performDetectionWithHydration() is the sole hydration owner.
  // Sidebar does not maintain a second independent hydration loop.

  async _handleFormDetectedEvent(formData) {
    if (!this.cachedState) return;

    this.cachedState.formData = formData;
    this.cachedState.workflowState = WORKFLOW_STATES.FORM_DETECTED;
    await this.store.saveTabState(this.activeTabId, this.cachedState);

    this._renderFormCard(formData);
  }

  _renderAllFromState(state = null) {
    if (!state)
      state = this.cachedState || {
        jobData: this.activeJob,
        workflowState: this.stateMachine?.state,
      };
    const isLocked =
      this.isWorkflowLocked() || state.lockState === 'LOCKED' || state.isLocked === true;

    this._renderWorkflowStatus(state.workflowState, isLocked);
    this._renderPortalCard(state.portalMetadata || state.jobData?.portalMetadata);
    this._renderJobCard(state.jobData);

    // Disable reanalyze control when locked
    if (this.elements.reanalyzeBtn) {
      if (isLocked) {
        this.elements.reanalyzeBtn.disabled = true;
        this.elements.reanalyzeBtn.classList.add('disabled');
      } else {
        this.elements.reanalyzeBtn.disabled = false;
        this.elements.reanalyzeBtn.classList.remove('disabled');
      }
    }

    // Dynamic Analyze Button state scoped to THIS tab (Parts 13 & 14 & P70)
    const job = state.jobData || this.activeJob;
    const desc = (job?.description || job?.rawText || '').trim();
    const hasValidJob = Boolean(job?.title && job.title !== 'Untitled Role');
    const isAnalysisReady = hasValidJob && (job?.analysisReady === true || desc.length >= 50);

    if (this.elements.descriptionLoadingNotice) {
      if (hasValidJob && !isAnalysisReady && !state.fitAnalysis && !isLocked) {
        this.elements.descriptionLoadingNotice.classList.remove('hidden');
      } else {
        this.elements.descriptionLoadingNotice.classList.add('hidden');
      }
    }

    if (this.elements.analyzeJobBtn) {
      const isAnalyzing = this._isAnalyzing || state.workflowState === WORKFLOW_STATES.ANALYZING;
      const isPreparing = state.workflowState === WORKFLOW_STATES.APPLICATION_PREPARING;
      const canAnalyze =
        hasValidJob && isAnalysisReady && this.isAuthenticated && !isAnalyzing && !isPreparing;

      this.elements.analyzeJobBtn.disabled = !canAnalyze;
      if (isAnalyzing) {
        this.elements.analyzeJobBtn.textContent = 'Analyzing Match...';
      } else if (
        state.fitAnalysis ||
        state.workflowState === WORKFLOW_STATES.APPLICATION_READY ||
        isLocked
      ) {
        this.elements.analyzeJobBtn.textContent = 'Analyze Again';
      } else {
        this.elements.analyzeJobBtn.textContent = 'Analyze Job Match';
      }
    }

    // Render ATS Fit Analysis if present
    if (state.fitAnalysis) {
      this._renderAnalysisCard(state.fitAnalysis);
    } else {
      this.elements.analysisCard?.classList.add('hidden');
    }

    // Render Authoritative Recommended Projects
    if (Array.isArray(state.recommendedProjects) && state.recommendedProjects.length > 0) {
      this._renderRecommendedProjects(state.recommendedProjects);
    } else {
      this.elements.projectsCard?.classList.add('hidden');
    }

    // HARD INVARIANT: fitAnalysis exists -> ANALYSIS_READY -> Handoff Kit card is ALWAYS visible!
    // Never depends on portfolioRecommendations.featuredProjects or any secondary response.
    if (state.fitAnalysis || state.handoffData || state.applicationId) {
      this._renderHandoffCard(state, isLocked);
    } else {
      this.elements.handoffCard?.classList.add('hidden');
    }

    if (state.formData) {
      this._renderFormCard(state.formData);
    }
  }

  _renderWorkflowStatus(stateName, isLocked = false) {
    const friendlyLabels = {
      [WORKFLOW_STATES.IDLE]: 'Ready',
      [WORKFLOW_STATES.JOB_DETECTED]: 'Job detected',
      [WORKFLOW_STATES.JOB_CONFIRMED]: 'Ready to analyze',
      [WORKFLOW_STATES.ANALYZING]: 'Analyzing match...',
      [WORKFLOW_STATES.ANALYSIS_READY]: 'Analysis complete',
      [WORKFLOW_STATES.APPLICATION_PREPARING]: 'Preparing handoff...',
      [WORKFLOW_STATES.APPLICATION_READY]: 'Application ready',
      [WORKFLOW_STATES.FORM_DETECTED]: 'Form detected',
      NO_JOB_DETECTED: 'Ready',
    };

    const displayText = friendlyLabels[stateName] || stateName || 'Ready';

    if (this.elements.workflowStateText) {
      this.elements.workflowStateText.textContent = displayText;
    }
    const locked = isLocked || this.isWorkflowLocked();
    if (this.elements.workflowLockedBadge) {
      if (locked) {
        this.elements.workflowLockedBadge.textContent = 'Workflow protected';
        this.elements.workflowLockedBadge.classList.remove('hidden');
      } else {
        this.elements.workflowLockedBadge.classList.add('hidden');
      }
    }
  }

  _renderPortalCard(portalMetadata) {
    if (!portalMetadata || !this.elements.portalName) return;

    // Display clean recognized portal name without diagnostic noise (Part 12)
    const name = portalMetadata.portalName;
    if (portalMetadata.isPortalRecognized === false || name === 'Web Page') {
      this.elements.portalName.textContent = 'Web Page';
    } else {
      this.elements.portalName.textContent = name || 'Career Portal';
    }

    // Keep raw diagnostic and capability badges hidden
    this.elements.confidenceBadge?.classList?.add('hidden');
    const portalCapsEl =
      typeof document !== 'undefined' ? document.getElementById('portalCapabilities') : null;
    portalCapsEl?.classList?.add('hidden');
  }

  _updateCapPill(element, isSupported, label) {
    if (!element) return;
    if (isSupported === true) {
      element.className = 'capability-pill supported';
      element.textContent = `${label}`;
    } else if (isSupported === 'partial') {
      element.className = 'capability-pill partial';
      element.textContent = `${label} (Partial)`;
    } else {
      element.className = 'capability-pill unsupported';
      element.textContent = `${label}`;
    }
  }

  _renderEmptyJobState() {
    this.elements.descriptionLoadingNotice?.classList.add('hidden');
    if (this.elements.analyzeJobBtn) {
      this.elements.analyzeJobBtn.disabled = true;
    }
    this.elements.jobNotDetectedState?.classList.remove('hidden');
    this.elements.jobDetectedState?.classList.add('hidden');
    this.elements.analysisCard?.classList.add('hidden');
    this.elements.projectsCard?.classList.add('hidden');
    this.elements.handoffCard?.classList.add('hidden');
    this.elements.formDetectionCard?.classList.add('hidden');
    if (this.elements.jobTitle) this.elements.jobTitle.textContent = '—';
    if (this.elements.jobCompany) this.elements.jobCompany.textContent = '—';
    this._renderWorkflowStatus('NO_JOB_DETECTED');
  }

  _renderJobCard(jobData) {
    if (!jobData) {
      this._renderEmptyJobState();
      return;
    }

    this.elements.jobNotDetectedState?.classList.add('hidden');
    this.elements.jobDetectedState?.classList.remove('hidden');

    if (this.elements.jobTitle)
      this.elements.jobTitle.textContent = jobData.title || 'Untitled Role';
    if (this.elements.jobCompany) {
      this.elements.jobCompany.textContent =
        jobData.company && jobData.company !== 'Company' ? jobData.company : '—';
    }
    if (this.elements.jobLocation)
      this.elements.jobLocation.textContent = jobData.location || 'Remote';
    if (this.elements.jobType)
      this.elements.jobType.textContent = jobData.employmentType || 'Full-time';

    const shortId = (this.activeJobFingerprint || 'unknown').substring(0, 8);
    if (this.elements.jobIdTag) this.elements.jobIdTag.textContent = `ID: ${shortId}`;
  }

  _renderAnalysisCard(fitAnalysis) {
    if (!fitAnalysis || !this.elements.analysisCard) return;

    this.elements.analysisCard.classList.remove('hidden');

    const rawScore = fitAnalysis.overallScore ?? fitAnalysis.score;
    const isScoreNull = rawScore === null || rawScore === undefined;
    const score = isScoreNull ? null : Math.round(rawScore);
    if (this.elements.scoreValue) {
      this.elements.scoreValue.textContent = isScoreNull ? '--' : score;
    }

    const band = isScoreNull
      ? fitAnalysis.grade || 'INSUFFICIENT_DATA'
      : fitAnalysis.recommendationBand ||
        fitAnalysis.grade ||
        (score >= 70 ? 'RECOMMENDED' : 'CONDITIONAL');
    if (this.elements.matchBandBadge) {
      this.elements.matchBandBadge.textContent = band;
    }

    const matched = fitAnalysis.matchedSkills || fitAnalysis.topMatchedSkills || [];
    const missing = fitAnalysis.missingSkills || fitAnalysis.topMissingSkills || [];

    if (this.elements.matchedSkillsCount)
      this.elements.matchedSkillsCount.textContent = matched.length;
    if (this.elements.missingSkillsCount)
      this.elements.missingSkillsCount.textContent = missing.length;

    let expFitText = 'Not Specified';
    if (typeof fitAnalysis.experienceFit === 'string') {
      expFitText = fitAnalysis.experienceFit;
    } else if (fitAnalysis.experienceFit && typeof fitAnalysis.experienceFit === 'object') {
      const status = fitAnalysis.experienceFit.status;
      if (status === 'ELIGIBLE' || status === 'MATCHED') expFitText = 'Eligible';
      else if (status === 'NOT_ELIGIBLE' || status === 'MISSING') expFitText = 'Not Eligible';
      else if (status === 'PARTIAL') expFitText = 'Partial';
      else if (status === 'NOT_SPECIFIED' || status === 'NOT_APPLICABLE')
        expFitText = 'Not Specified';
      else expFitText = status || 'Unknown';
    }
    if (this.elements.experienceFitVal) {
      this.elements.experienceFitVal.textContent = expFitText;
    }

    // Matched skills tags
    if (this.elements.matchedSkillsList) {
      this.elements.matchedSkillsList.innerHTML = '';
      matched.slice(0, 8).forEach((skill) => {
        const pill = document.createElement('span');
        pill.className = 'tag-pill matched';
        pill.textContent = skill;
        this.elements.matchedSkillsList.appendChild(pill);
      });
    }

    // Missing skills tags
    if (this.elements.missingSkillsList) {
      this.elements.missingSkillsList.innerHTML = '';
      missing.slice(0, 6).forEach((skill) => {
        const pill = document.createElement('span');
        pill.className = 'tag-pill missing';
        pill.textContent = skill;
        this.elements.missingSkillsList.appendChild(pill);
      });
    }

    // Ensure Next Action Box is visible
    this.elements.analysisNextActionBox?.classList.remove('hidden');
  }

  _renderRecommendedProjects(projects) {
    if (!Array.isArray(projects) || projects.length === 0 || !this.elements.projectsCard) {
      this.elements.projectsCard?.classList.add('hidden');
      return;
    }

    this.elements.projectsCard.classList.remove('hidden');
    if (this.elements.recommendedProjectsList) {
      this.elements.recommendedProjectsList.innerHTML = '';

      projects.forEach((proj) => {
        const item = document.createElement('div');
        item.className = 'project-card-item';

        const header = document.createElement('div');
        header.className = 'project-card-header';

        const nameEl = document.createElement('span');
        nameEl.className = 'project-name';
        nameEl.textContent = proj.name || proj.title || 'Portfolio Project';

        const relevanceEl = document.createElement('span');
        const score = Math.round(proj.relevanceScore ?? 80);
        const band = (proj.relevanceBand || (score >= 70 ? 'HIGH' : 'MEDIUM')).toLowerCase();
        relevanceEl.className = `project-relevance-pill ${band}`;
        relevanceEl.textContent = `${band.toUpperCase()} (${score}%)`;

        header.appendChild(nameEl);
        header.appendChild(relevanceEl);
        item.appendChild(header);

        // Technologies list
        const techList = document.createElement('div');
        techList.className = 'project-tech-list';
        const techs = proj.technologies || proj.techStack || [];
        techs.slice(0, 6).forEach((tech) => {
          const tag = document.createElement('span');
          tag.className = 'project-tech-tag';
          tag.textContent = tech;
          techList.appendChild(tag);
        });
        item.appendChild(techList);

        // Verified footer
        const footer = document.createElement('div');
        footer.className = 'project-verified-footer';
        footer.innerHTML = `<span>✓ Verified Project</span> • <span style="color: #94a3b8;">Canonical ID: ${(proj.projectId || proj.id || '').substring(0, 8)}</span>`;
        item.appendChild(footer);

        this.elements.recommendedProjectsList.appendChild(item);
      });
    }
  }

  _renderHandoffCard(state, isLocked = false) {
    if (!this.elements.handoffCard) return;
    this.elements.handoffCard.classList.remove('hidden');

    const handoffData = state.handoffData;
    const appId = state.applicationId || handoffData?.applicationId;
    const locked =
      isLocked ||
      this.isWorkflowLocked() ||
      state.lockState === 'LOCKED' ||
      state.isLocked === true;

    if (locked) {
      this.elements.workflowLockBanner?.classList.remove('hidden');
    } else {
      this.elements.workflowLockBanner?.classList.add('hidden');
    }

    if (handoffData && appId) {
      // Handoff is prepared
      this.elements.artifactsContainer?.classList.remove('hidden');
      this.elements.handoffTelemetryRow?.classList.remove('hidden');

      if (this.elements.handoffAppId) {
        this.elements.handoffAppId.textContent = appId;
      }
      if (this.elements.handoffPackageMeta) {
        const pkgVer = handoffData.packageVersion || 1;
        const pkgHash = handoffData.packageHash
          ? handoffData.packageHash.substring(0, 8)
          : 'unknown';
        const pkgStatus = handoffData.packageStatus || 'SAVED';
        this.elements.handoffPackageMeta.textContent = `v${pkgVer} • ${pkgHash} (${pkgStatus})`;
      }

      if (this.elements.prepareBtnText) {
        this.elements.prepareBtnText.textContent = 'View Handoff Kit';
      }
      if (this.elements.prepareHandoffBtn) {
        this.elements.prepareHandoffBtn.disabled = false;
      }
      if (this.elements.regenerateHandoffBtn) {
        this.elements.regenerateHandoffBtn.classList.remove('hidden');
      }
      if (this.elements.handoffStatusBadge) {
        this.elements.handoffStatusBadge.textContent = 'KIT READY';
        this.elements.handoffStatusBadge.className = 'status-badge-sm ready';
      }
    } else {
      // Handoff is unprepared but visible
      this.elements.artifactsContainer?.classList.add('hidden');
      this.elements.handoffTelemetryRow?.classList.add('hidden');
      if (this.elements.prepareBtnText) {
        this.elements.prepareBtnText.textContent = 'Prepare Handoff Kit';
      }
      if (this.elements.regenerateHandoffBtn) {
        this.elements.regenerateHandoffBtn.classList.add('hidden');
      }
      this.elements.regenerateConfirmBox?.classList.add('hidden');
      if (this.elements.handoffStatusBadge) {
        this.elements.handoffStatusBadge.textContent = 'UNPREPARED';
        this.elements.handoffStatusBadge.className = 'status-badge-sm';
      }
    }
  }

  _renderFormCard(formData) {
    if (!formData || !this.elements.formDetectionCard) return;

    this.elements.formDetectionCard.classList.remove('hidden');
    if (this.elements.stepIndicator) {
      this.elements.stepIndicator.textContent = `Step ${formData.step || 1} of ${formData.totalSteps || 1}`;
    }
    if (this.elements.formStatusMessage) {
      this.elements.formStatusMessage.textContent =
        formData.statusMessage || 'Application form fields detected.';
    }

    if (this.elements.formFieldsSummary) {
      this.elements.formFieldsSummary.innerHTML = '';
      const fields = formData.mappedFields || [];
      let hasSensitive = false;
      fields.forEach((f) => {
        const pill = document.createElement('span');
        pill.className = 'tag-pill matched';
        pill.textContent = `${f.label || f.name}: ${f.verified ? '✓' : '?'}`;
        if (f.isSensitive || f.requiresConfirmation) {
          hasSensitive = true;
          const sensTag = document.createElement('span');
          sensTag.className = 'autofill-meta-tag';
          sensTag.textContent = 'Confirm';
          pill.appendChild(sensTag);
        }
        this.elements.formFieldsSummary.appendChild(pill);
      });

      if (hasSensitive && this.elements.sensitiveConfirmationBox) {
        this.elements.sensitiveConfirmationBox.classList.remove('hidden');
      }

      if (fields.length > 0 && this.elements.autofillFormBtn) {
        this.elements.autofillFormBtn.removeAttribute('disabled');
      }
    }
  }

  // Action: Analyze Job
  async runAnalyzeJob() {
    // Authenticate gate
    if (!this.isAuthenticated) {
      this._handleSessionExpired();
      return;
    }

    if (!this.activeJob) return;

    // P70: Re-read local job description before sending request; abort if < 50
    const desc = (this.activeJob.description || this.activeJob.rawText || '').trim();
    if (desc.length < 50) {
      this.elements.descriptionLoadingNotice?.classList.remove('hidden');
      if (this.elements.analyzeJobBtn) {
        this.elements.analyzeJobBtn.disabled = true;
      }
      return;
    }

    // Double-click protection (Parts 15 & 18): only 1 request at a time
    if (this._isAnalyzing) return;
    this._isAnalyzing = true;

    if (this.elements.analyzeJobBtn) {
      this.elements.analyzeJobBtn.disabled = true;
      this.elements.analyzeJobBtn.textContent = 'Analyzing Match...';
    }
    this.elements.analysisErrorBanner?.classList.add('hidden');
    this.stateMachine.state = WORKFLOW_STATES.ANALYZING;
    this._renderWorkflowStatus(WORKFLOW_STATES.ANALYZING);

    try {
      const result = await this.backendClient.analyzeJob(this.activeJob);
      if (result) {
        const fitAnalysis = result.fitAnalysis || result;
        const recommendedProjects = result.recommendedProjects || [];

        // Affirm canonical identity and evaluate transition via authority
        const decision = JobIdentityAuthority.evaluateTransition(
          {
            activeJob: this.activeJob,
            cachedState: this.cachedState,
            stateMachineState: this.stateMachine?.state,
            isLocked: this.isWorkflowLocked(),
          },
          {
            type: SIGNAL_TYPES.ANALYZE_COMPLETE,
            detectedJob:
              result.canonicalJob || result.jobData || (result.title ? result : this.activeJob),
            existingHandoff:
              result.existingHandoff ||
              (this.cachedState?.handoffData && this.cachedState?.applicationId
                ? this.cachedState.handoffData
                : null),
            existingApplication: result.existingApplication || null,
          }
        );

        this.activeJob = decision.activeJob;
        this.cachedState.jobData = decision.activeJob;
        if (decision.activeJob?.title) {
          this.cachedState.jobIdentity = {
            title: decision.activeJob.title,
            company: decision.activeJob.company || '',
            jobFingerprint:
              decision.canonicalIdentity?.fingerprint ||
              this.activeJobFingerprint ||
              this.cachedState?.jobFingerprint,
          };
        }
        this.cachedState.jobFingerprint =
          decision.canonicalIdentity?.fingerprint || this.activeJobFingerprint;

        // Update state in durable store
        this.cachedState.fitAnalysis = fitAnalysis;
        this.cachedState.recommendedProjects = recommendedProjects;
        if (result.analysisSnapshotId) {
          this.cachedState.analysisSnapshotId = result.analysisSnapshotId;
        }
        if (result.existingApplication?.id) {
          this.cachedState.applicationId = result.existingApplication.id;
        }

        const existingHandoff = result.existingHandoff || result.existingApplication?.handoffData;
        if (existingHandoff && (existingHandoff.applicationId || result.existingApplication?.id)) {
          // Canonical application handoff kit already exists! Re-use without preparing/regenerating.
          this.cachedState.handoffData = existingHandoff;
          this.cachedState.applicationId =
            existingHandoff.applicationId || result.existingApplication.id;
          if (this.currentUser?.id) {
            this.cachedState.userId = this.currentUser.id;
          }
          this.cachedState.workflowState = WORKFLOW_STATES.APPLICATION_READY;
          this.cachedState.lockState = 'LOCKED';
          this.cachedState.isLocked = true;
          this.stateMachine.state = WORKFLOW_STATES.APPLICATION_READY;
          this.stateMachine.lock();
        } else {
          this.cachedState.workflowState = decision.targetWorkflowState;
          this.cachedState.lockState = decision.targetLockState;
          this.cachedState.isLocked = decision.targetLockState === 'LOCKED';
          this.stateMachine.state = decision.targetWorkflowState;
        }

        await this.store.saveTabState(this.activeTabId, this.cachedState);
        this._renderAllFromState(this.cachedState);

        // Hydrate compact AI assistant context (5 primary dimensions)
        this.loadAssistantContext().catch((err) =>
          console.warn('Assistant context hydration failed:', err)
        );
      }
    } catch (err) {
      console.error('Analyze job failed:', err);
      if (err.status === 401 || err.code === 'UNAUTHENTICATED') {
        this._handleSessionExpired();
      } else {
        this.stateMachine.state = WORKFLOW_STATES.JOB_CONFIRMED;
        this._showAnalysisError(
          err.message || 'Analysis failed. Please check connection and retry.'
        );
      }
    } finally {
      this._isAnalyzing = false;
      if (this.elements.analyzeJobBtn) {
        const hasExistingAnalysis = Boolean(this.cachedState?.fitAnalysis);
        const currentDesc = (this.activeJob?.description || this.activeJob?.rawText || '').trim();
        const hasValidJob = Boolean(
          this.activeJob?.title && this.activeJob.title !== 'Untitled Role'
        );
        const isAnalysisReady =
          hasValidJob && (this.activeJob?.analysisReady === true || currentDesc.length >= 50);
        this.elements.analyzeJobBtn.disabled = !isAnalysisReady || !this.isAuthenticated;
        this.elements.analyzeJobBtn.textContent = hasExistingAnalysis
          ? 'Analyze Again'
          : 'Analyze Job Match';
      }
    }
  }

  _showAnalysisError(message) {
    if (this.elements.analysisErrorMessage) {
      this.elements.analysisErrorMessage.textContent = message;
    }
    this.elements.analysisErrorBanner?.classList.remove('hidden');
  }

  // Action: Prepare Handoff Kit
  async runPrepareHandoff(options = {}) {
    // Authenticate gate
    if (!this.isAuthenticated) {
      this._handleSessionExpired();
      return;
    }

    if (!this.activeJob) return;

    const isRegen = options.isRegeneration === true;

    if (this.elements.prepareHandoffBtn) this.elements.prepareHandoffBtn.disabled = true;
    if (this.elements.regenerateHandoffBtn) this.elements.regenerateHandoffBtn.disabled = true;
    this.elements.prepareSpinner?.classList.remove('hidden');
    if (this.elements.prepareBtnText) {
      this.elements.prepareBtnText.textContent = isRegen
        ? 'Regenerating Handoff Kit...'
        : 'Preparing Handoff Kit...';
    }
    this.elements.handoffErrorBanner?.classList.add('hidden');

    this.stateMachine.state = WORKFLOW_STATES.APPLICATION_PREPARING;
    this._renderWorkflowStatus(WORKFLOW_STATES.APPLICATION_PREPARING);

    try {
      // Passes canonical job, existing applicationId (ensuring idempotency), and authoritative analysisSnapshotId
      const existingAppId = this.cachedState?.applicationId || null;
      const snapshotId = this.cachedState?.analysisSnapshotId || null;

      const result = await this.backendClient.prepareHandoff(
        this.activeJob,
        existingAppId,
        snapshotId
      );

      if (result) {
        this.cachedState.handoffData = result;
        this.cachedState.applicationId = result.applicationId;
        if (this.currentUser?.id) {
          this.cachedState.userId = this.currentUser.id;
        }
        if (result.analysisSnapshotId) {
          this.cachedState.analysisSnapshotId = result.analysisSnapshotId;
        }
        if (result.recommendedProjects && result.recommendedProjects.length > 0) {
          this.cachedState.recommendedProjects = result.recommendedProjects;
        }

        // Bind canonical job identity to prepared handoff package via authority
        const decision = JobIdentityAuthority.evaluateTransition(
          {
            activeJob: this.activeJob,
            cachedState: this.cachedState,
            stateMachineState: this.stateMachine?.state,
            isLocked: this.isWorkflowLocked(),
          },
          {
            type: SIGNAL_TYPES.HANDOFF_PREPARED,
            targetJob:
              result.targetJob || result.canonicalJob || (result.title ? result : this.activeJob),
            detectedJob:
              result.targetJob || result.canonicalJob || (result.title ? result : this.activeJob),
          }
        );

        this.activeJob = decision.activeJob;
        this.cachedState.jobData = decision.activeJob;
        if (decision.activeJob?.title) {
          this.cachedState.jobIdentity = {
            title: decision.activeJob.title,
            company: decision.activeJob.company || '',
            jobFingerprint:
              decision.canonicalIdentity?.fingerprint ||
              this.activeJobFingerprint ||
              this.cachedState?.jobFingerprint,
          };
        }
        this.cachedState.jobFingerprint =
          decision.canonicalIdentity?.fingerprint || this.activeJobFingerprint;

        this.cachedState.workflowState = decision.targetWorkflowState;
        this.cachedState.lockState = decision.targetLockState;
        this.cachedState.isLocked = decision.targetLockState === 'LOCKED';
        this.stateMachine.state = decision.targetWorkflowState;
        this.stateMachine.lock();

        await this.store.saveTabState(this.activeTabId, this.cachedState);
        this._renderAllFromState(this.cachedState);
      }
    } catch (err) {
      console.error('Prepare handoff failed:', err);
      if (err.status === 401 || err.code === 'UNAUTHENTICATED') {
        this._handleSessionExpired();
      } else {
        const prevState =
          this.cachedState?.handoffData && this.cachedState?.applicationId
            ? WORKFLOW_STATES.APPLICATION_READY
            : WORKFLOW_STATES.ANALYSIS_READY;
        this.stateMachine.state = prevState;
        this._showHandoffError(err.message || 'Failed to prepare handoff kit. Please retry.');
      }
    } finally {
      if (this.elements.prepareHandoffBtn) this.elements.prepareHandoffBtn.disabled = false;
      if (this.elements.regenerateHandoffBtn) this.elements.regenerateHandoffBtn.disabled = false;
      this.elements.prepareSpinner?.classList.add('hidden');
      if (this.elements.prepareBtnText) {
        const isExisting = Boolean(
          this.cachedState?.handoffData && this.cachedState?.applicationId
        );
        this.elements.prepareBtnText.textContent = isExisting
          ? 'View Handoff Kit'
          : 'Prepare Handoff Kit';
      }
    }
  }

  _showHandoffError(message) {
    if (this.elements.handoffErrorMessage) {
      this.elements.handoffErrorMessage.textContent = message;
    }
    this.elements.handoffErrorBanner?.classList.remove('hidden');
  }

  async _triggerDownload(artifactType) {
    const appId = this.cachedState?.applicationId || this.cachedState?.handoffData?.applicationId;
    if (!appId) {
      alert('No prepared application found to download.');
      return;
    }

    const packageHash = this.cachedState?.handoffData?.packageHash || '';
    const url = await this.backendClient.getArtifactDownloadUrl(appId, artifactType, packageHash);

    const candidateName =
      this.cachedState?.handoffData?.candidateName || this.currentUser?.displayName || 'Candidate';
    const jobTitle = this.activeJob?.title || 'Target Role';

    const filename = buildApplicationArtifactFilename({
      candidateName,
      jobTitle,
      artifactType,
    });

    if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
      chrome.downloads.download({ url, filename });
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  }

  async _triggerReview(artifactType) {
    const appId = this.cachedState?.applicationId || this.cachedState?.handoffData?.applicationId;
    if (!appId) {
      alert('No prepared application found to preview.');
      return;
    }

    const packageHash = this.cachedState?.handoffData?.packageHash || '';
    const url = await this.backendClient.getArtifactDownloadUrl(appId, artifactType, packageHash);

    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  }

  async resetWorkflow() {
    if (!this.activeTabId) return;

    // Reset workflow in durable store (increments generation, clears active tab state, preserves DB)
    const freshState = await this.store.resetWorkflow(this.activeTabId);

    // Reset state machine
    this.stateMachine.unlock();
    this.stateMachine.reset();

    // Clear controller active job and pending references
    this.activeJob = null;
    this.activeJobFingerprint = null;
    this.pendingDetectedJob = null;
    this.pendingDetectedFingerprint = null;
    this.cachedState = freshState;

    // Reset UI
    this._hidePendingJobNotification();
    this.elements.workflowLockBanner?.classList.add('hidden');
    this.elements.workflowLockedBadge?.classList.add('hidden');
    this.elements.regenerateConfirmBox?.classList.add('hidden');
    this.elements.regenerateHandoffBtn?.classList.add('hidden');
    if (this.elements.prepareBtnText) {
      this.elements.prepareBtnText.textContent = 'Prepare Handoff Kit';
    }
    if (this.elements.reanalyzeBtn) {
      this.elements.reanalyzeBtn.disabled = false;
      this.elements.reanalyzeBtn.classList.remove('disabled');
    }
    this._renderEmptyJobState();
    this._renderWorkflowStatus(WORKFLOW_STATES.IDLE, false);

    // Resume fresh job detection on current page
    await this._requestDetectionFromTab();
  }

  async _openDashboardApplication() {
    const appId = this.cachedState?.applicationId || this.cachedState?.handoffData?.applicationId;
    if (!appId) return;

    const url = await this.backendClient.getApplicationViewUrl(appId);
    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  }

  /**
   * Hydrates the compact 5-dimension AI assistant context.
   */
  async loadAssistantContext() {
    if (!this.isAuthenticated || !this.activeJob) return;
    if (typeof this.backendClient?.getAssistantContext !== 'function') return;

    try {
      const context = await this.backendClient.getAssistantContext({
        job: this.activeJob,
        formFields: this.cachedState?.detectedFormFields || [],
        applicationAnswers: this.cachedState?.applicationAnswers || {},
      });

      // 1. Application Readiness
      if (context.applicationReadiness) {
        if (this.elements.readinessScoreBadge) {
          this.elements.readinessScoreBadge.textContent = `${context.applicationReadiness.readinessScore}%`;
        }
        if (this.elements.readinessSummaryText) {
          this.elements.readinessSummaryText.textContent = context.applicationReadiness.summary;
        }
      }

      // 2. Missing Information
      if (this.elements.assistantMissingBox && this.elements.assistantMissingList) {
        const missing = context.missingInformation || [];
        if (missing.length > 0) {
          this.elements.assistantMissingList.innerHTML = '';
          missing.forEach((m) => {
            const li = document.createElement('li');
            li.textContent = `${m.label}: ${m.notes}`;
            this.elements.assistantMissingList.appendChild(li);
          });
          this.elements.assistantMissingBox.classList.remove('hidden');
        } else {
          this.elements.assistantMissingBox.classList.add('hidden');
        }
      }

      // 3. Pre-Submission Conflicts
      if (this.elements.assistantConflictsBox && this.elements.assistantConflictsList) {
        const conflicts = context.conflicts || [];
        if (conflicts.length > 0) {
          this.elements.assistantConflictsList.innerHTML = '';
          conflicts.forEach((c) => {
            const item = document.createElement('div');
            item.className = 'conflict-item';
            item.textContent = `${c.fieldLabel}: Profile has "${c.profileValue}", application specifies "${c.applicationValue}".`;
            this.elements.assistantConflictsList.appendChild(item);
          });
          this.elements.assistantConflictsBox.classList.remove('hidden');
        } else {
          this.elements.assistantConflictsBox.classList.add('hidden');
        }
      }

      // 4. AI Help Overview & Graceful Degradation
      if (context.aiHelp) {
        if (!context.aiHelp.available) {
          if (this.elements.assistantUnavailableBanner) {
            this.elements.assistantUnavailableBanner.classList.remove('hidden');
            if (this.elements.assistantUnavailableText && context.aiHelp.fallbackNotice) {
              this.elements.assistantUnavailableText.textContent = context.aiHelp.fallbackNotice;
            }
          }
        } else {
          this.elements.assistantUnavailableBanner?.classList.add('hidden');
        }
      }
    } catch (err) {
      console.warn('AI assistant context fetch failed:', err);
      // Fails gracefully - does not crash extension or block workflow
      if (this.elements.assistantUnavailableBanner) {
        this.elements.assistantUnavailableBanner.classList.remove('hidden');
      }
    }
  }

  /**
   * Explains current job posting page.
   */
  async handleExplainJob() {
    if (!this.activeJob) return;
    this._showAssistantResponse('Analyzing job page and responsibilities...');
    try {
      const explanation = await this.backendClient.explainJob(this.activeJob);
      const resps = (explanation.responsibilities || [])
        .slice(0, 3)
        .map((r) => `• ${r}`)
        .join('\n');
      this._showAssistantResponse(`**${explanation.summary}**\n\nCore responsibilities:\n${resps}`);
    } catch (err) {
      this._showAssistantResponse(
        `Could not generate AI explanation. Job details: ${this.activeJob.title} at ${this.activeJob.company}.`
      );
    }
  }

  /**
   * Compares requirements against verified profile.
   */
  async handleCheckRequirements() {
    if (!this.activeJob) return;
    this._showAssistantResponse('Comparing job requirements with your verified profile...');
    try {
      const comp = await this.backendClient.compareRequirements(this.activeJob);
      const matchLines = (comp.matches || []).map((m) =>
        m.satisfied
          ? `✓ ${m.requirement}: Satisfied (verified in profile)`
          : `✗ ${m.requirement}: Not available in your verified profile.`
      );
      this._showAssistantResponse(
        `**Requirement Analysis** (${comp.satisfiedCount}/${comp.totalRequirements} verified)\n\n${matchLines.join('\n')}`
      );
    } catch (err) {
      this._showAssistantResponse(
        'Requirement comparison failed. Please check your profile connection.'
      );
    }
  }

  /**
   * Previews safe autofill plan.
   */
  async handlePreviewAutofillPlan() {
    const fields = this.cachedState?.detectedFormFields || [];
    if (fields.length === 0) {
      this._showAssistantResponse('No application form fields detected on this page yet.');
      return;
    }
    this._showAssistantResponse('Building safe autofill plan with verified profile data...');
    try {
      const plan = await this.backendClient.getAutofillPlan(fields);
      const items = (plan.mappedFields || []).map((f) =>
        f.available
          ? `✓ ${f.label}: "${f.value}" [${f.source}]${f.requiresConfirmation ? ' (Confirmation required)' : ''}`
          : `✗ ${f.label}: Not available in your verified profile.`
      );
      this._showAssistantResponse(
        `**Safe Autofill Plan** (${plan.fillableCount} fillable, ${plan.sensitiveCount} sensitive)\n\n${items.join('\n')}`
      );
    } catch (err) {
      this._showAssistantResponse('Could not generate autofill plan.');
    }
  }

  /**
   * Interactive assistant query.
   */
  async handleAssistantQuery() {
    const query = (this.elements.assistantQueryInput?.value || '').trim();
    if (!query) return;

    this.elements.assistantQueryInput.value = '';
    this._showAssistantResponse('Thinking...');

    try {
      const response = await this.backendClient.askAssistant(query, this.activeJob);
      this._showAssistantResponse(response.content || response.message || 'Response received.');
    } catch (err) {
      this._showAssistantResponse(
        'The AI assistant is temporarily unavailable. The extension remains fully functional.'
      );
    }
  }

  _showAssistantResponse(text) {
    if (this.elements.assistantResponseBox && this.elements.assistantResponseContent) {
      this.elements.assistantResponseContent.textContent = text;
      this.elements.assistantResponseBox.classList.remove('hidden');
    }
  }
}

if (typeof document !== 'undefined') {
  const initSidebar = () => {
    if (typeof window !== 'undefined' && window.__sidebarController) return;
    const controller = new SidebarController();
    if (typeof window !== 'undefined') {
      window.__sidebarController = controller;
    }
    controller.init();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebar);
  } else {
    initSidebar();
  }
}

export { SidebarController };
