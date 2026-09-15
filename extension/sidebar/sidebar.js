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
import { JobIdentity } from '../lib/job-identity.js';

class SidebarController {
  constructor() {
    this.backendClient = new BackendClient();
    this.store = new DurableWorkflowStore();
    this.stateMachine = new WorkflowStateMachine();
    this.activeTabId = null;
    this.activeJob = null;
    this.activeJobFingerprint = null;
    this.cachedState = null;
    this.isAuthenticated = false;
    this.currentUser = null;

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
  }

  _bindElements() {
    this.elements = {
      connectionBadge: document.getElementById('connectionBadge'),
      connectionText: document.getElementById('connectionText'),
      refreshBtn: document.getElementById('refreshBtn'),

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
      ctaPrepareHandoffBtn: document.getElementById('ctaPrepareHandoffBtn'),

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
    };
  }

  _attachEventListeners() {
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
      if (this.isWorkflowLocked()) return;
      await this.runAnalyzeJob();
    });

    this.elements.retryAnalysisBtn?.addEventListener('click', async () => {
      await this.runAnalyzeJob();
    });

    // Primary Next Action CTA in Analysis Card
    this.elements.ctaPrepareHandoffBtn?.addEventListener('click', async () => {
      await this.runPrepareHandoff();
    });

    this.elements.prepareHandoffBtn?.addEventListener('click', async () => {
      await this.runPrepareHandoff();
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

  _listenToRuntimeMessages() {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender) => {
        if (message.type === 'ACTIVE_TAB_CHANGED') {
          if (this.pinnedTabId) {
            return;
          }
          if (message.tabId && message.tabId !== this.activeTabId) {
            this.activeTabId = message.tabId;
            this._hydrateFromStore();
          }
        } else if (message.type === 'JOB_DETECTED_ON_PAGE') {
          if (this.isWorkflowLocked()) {
            return;
          }
          if (this.activeTabId && message.tabId && message.tabId !== this.activeTabId) {
            return;
          }
          if (this.activeTabId && sender?.tab?.id && sender.tab.id !== this.activeTabId) {
            return;
          }
          if (message.generation !== undefined && this.cachedState?.workflowGeneration !== undefined) {
            if (message.generation < this.cachedState.workflowGeneration) {
              return;
            }
          }
          this._handleJobDetectedEvent(message.jobData);
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
          if (message.generation !== undefined && this.cachedState?.workflowGeneration !== undefined) {
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

  async _hydrateFromStore() {
    if (!this.activeTabId) return;

    const currentUserId = this.currentUser?.id || null;
    const durableState = await this.store.getTabState(this.activeTabId, currentUserId);
    if (durableState && durableState.jobData) {
      this.cachedState = durableState;
      this.activeJob = durableState.jobData;
      this.activeJobFingerprint = durableState.jobFingerprint;
      this.stateMachine.state = durableState.workflowState || WORKFLOW_STATES.JOB_DETECTED;

      if (durableState.lockState === 'LOCKED' || durableState.isLocked === true) {
        this.stateMachine.lock();
      } else {
        this.stateMachine.unlock();
      }

      this._renderAllFromState(durableState);
    } else {
      // Trigger injection and extraction on tab if not locked
      if (!this.isWorkflowLocked()) {
        await this._requestDetectionFromTab();
      }
    }
  }

  async _requestDetectionFromTab() {
    if (!this.activeTabId) return;
    if (this.isWorkflowLocked()) return;

    if (this.activeTabId) {
      const persisted = await this.store.getTabState(this.activeTabId);
      if (this.store.isWorkflowLocked(persisted)) {
        this.cachedState = persisted;
        this.activeJob = persisted.jobData;
        this.activeJobFingerprint = persisted.jobFingerprint;
        this.stateMachine.state = persisted.workflowState;
        this.stateMachine.lock();
        this._renderAllFromState(persisted);
        return;
      }
    }

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        await chrome.runtime.sendMessage({
          type: 'ENSURE_CONTENT_SCRIPT',
          tabId: this.activeTabId,
        });
      }

      if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
        const response = await chrome.tabs.sendMessage(this.activeTabId, {
          type: 'DETECT_JOB_PAGE',
        });

        if (response && response.success && response.jobData) {
          await this._handleJobDetectedEvent(response.jobData);
        } else {
          this._renderEmptyJobState();
        }
      }
    } catch {
      this._renderEmptyJobState();
    }
  }

  async _handleJobDetectedEvent(jobData) {
    if (this.isWorkflowLocked()) return;
    if (!jobData || !jobData.title) {
      this._renderEmptyJobState();
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
        return;
      }
    }

    const fingerprint = JobIdentity.deriveJobFingerprint(jobData);
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
  }

  async _handleFormDetectedEvent(formData) {
    if (!this.cachedState) return;

    this.cachedState.formData = formData;
    this.cachedState.workflowState = WORKFLOW_STATES.FORM_DETECTED;
    await this.store.saveTabState(this.activeTabId, this.cachedState);

    this._renderFormCard(formData);
  }

  _renderAllFromState(state) {
    const isLocked = this.isWorkflowLocked() || state.lockState === 'LOCKED' || state.isLocked === true;

    this._renderWorkflowStatus(state.workflowState, isLocked);
    this._renderPortalCard(state.portalMetadata || state.jobData?.portalMetadata);
    this._renderJobCard(state.jobData);

    // Disable reanalyze and analyze controls when locked
    if (this.elements.reanalyzeBtn) {
      if (isLocked) {
        this.elements.reanalyzeBtn.disabled = true;
        this.elements.reanalyzeBtn.classList.add('disabled');
      } else {
        this.elements.reanalyzeBtn.disabled = false;
        this.elements.reanalyzeBtn.classList.remove('disabled');
      }
    }
    if (this.elements.analyzeJobBtn) {
      if (isLocked) {
        this.elements.analyzeJobBtn.disabled = true;
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
    if (this.elements.workflowStateText) {
      this.elements.workflowStateText.textContent = stateName || 'READY';
    }
    const locked = isLocked || this.isWorkflowLocked();
    if (this.elements.workflowLockedBadge) {
      if (locked) {
        this.elements.workflowLockedBadge.classList.remove('hidden');
      } else {
        this.elements.workflowLockedBadge.classList.add('hidden');
      }
    }
  }

  _renderPortalCard(portalMetadata) {
    if (!portalMetadata || !this.elements.portalName) return;

    this.elements.portalName.textContent = portalMetadata.portalName || 'Generic Career Portal';

    const confidence = (portalMetadata.confidence || 'medium').toLowerCase();
    if (this.elements.confidenceBadge) {
      this.elements.confidenceBadge.className = `confidence-badge ${confidence}`;
      this.elements.confidenceBadge.textContent = `Confidence: ${confidence.toUpperCase()}`;
    }

    const caps = portalMetadata.capabilities || {};
    this._updateCapPill(this.elements.capJob, caps.jobExtraction, 'Job Extraction');
    this._updateCapPill(this.elements.capApp, caps.applicationDetection, 'App Detection');
    this._updateCapPill(this.elements.capForm, caps.formExtraction, 'Form Extraction');
    this._updateCapPill(this.elements.capAutofill, caps.automaticFieldMapping, 'Field Mapping');
  }

  _updateCapPill(element, isSupported, label) {
    if (!element) return;
    if (isSupported === true) {
      element.className = 'capability-pill supported';
      element.textContent = `✓ ${label}`;
    } else if (isSupported === 'partial') {
      element.className = 'capability-pill partial';
      element.textContent = `~ ${label} (Partial)`;
    } else {
      element.className = 'capability-pill unsupported';
      element.textContent = `✗ ${label}`;
    }
  }

  _renderEmptyJobState() {
    this.elements.jobNotDetectedState?.classList.remove('hidden');
    this.elements.jobDetectedState?.classList.add('hidden');
    this.elements.analysisCard?.classList.add('hidden');
    this.elements.projectsCard?.classList.add('hidden');
    this.elements.handoffCard?.classList.add('hidden');
    this.elements.formDetectionCard?.classList.add('hidden');
    this._renderWorkflowStatus('NO_JOB_DETECTED');
  }

  _renderJobCard(jobData) {
    if (!jobData) {
      this._renderEmptyJobState();
      return;
    }

    this.elements.jobNotDetectedState?.classList.add('hidden');
    this.elements.jobDetectedState?.classList.remove('hidden');

    if (this.elements.jobTitle) this.elements.jobTitle.textContent = jobData.title || 'Untitled Role';
    if (this.elements.jobCompany) this.elements.jobCompany.textContent = jobData.company || 'Unknown Company';
    if (this.elements.jobLocation) this.elements.jobLocation.textContent = `📍 ${jobData.location || 'Remote'}`;
    if (this.elements.jobType) this.elements.jobType.textContent = `💼 ${jobData.employmentType || 'Full-time'}`;

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
      ? (fitAnalysis.grade || 'INSUFFICIENT_DATA')
      : (fitAnalysis.recommendationBand ||
        fitAnalysis.grade ||
        (score >= 70 ? 'RECOMMENDED' : 'CONDITIONAL'));
    if (this.elements.matchBandBadge) {
      this.elements.matchBandBadge.textContent = band;
    }

    const matched = fitAnalysis.matchedSkills || fitAnalysis.topMatchedSkills || [];
    const missing = fitAnalysis.missingSkills || fitAnalysis.topMissingSkills || [];

    if (this.elements.matchedSkillsCount) this.elements.matchedSkillsCount.textContent = matched.length;
    if (this.elements.missingSkillsCount) this.elements.missingSkillsCount.textContent = missing.length;

    let expFitText = 'Not Specified';
    if (typeof fitAnalysis.experienceFit === 'string') {
      expFitText = fitAnalysis.experienceFit;
    } else if (fitAnalysis.experienceFit && typeof fitAnalysis.experienceFit === 'object') {
      const status = fitAnalysis.experienceFit.status;
      if (status === 'ELIGIBLE' || status === 'MATCHED') expFitText = 'Eligible';
      else if (status === 'NOT_ELIGIBLE' || status === 'MISSING') expFitText = 'Not Eligible';
      else if (status === 'PARTIAL') expFitText = 'Partial';
      else if (status === 'NOT_SPECIFIED' || status === 'NOT_APPLICABLE') expFitText = 'Not Specified';
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
    const locked = isLocked || this.isWorkflowLocked() || state.lockState === 'LOCKED' || state.isLocked === true;

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
        const pkgHash = handoffData.packageHash ? handoffData.packageHash.substring(0, 8) : 'unknown';
        const pkgStatus = handoffData.packageStatus || 'SAVED';
        this.elements.handoffPackageMeta.textContent = `v${pkgVer} • ${pkgHash} (${pkgStatus})`;
      }

      if (this.elements.prepareBtnText) {
        this.elements.prepareBtnText.textContent = 'Regenerate Handoff Kit';
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
      this.elements.formStatusMessage.textContent = formData.statusMessage || 'Application form fields detected.';
    }

    if (this.elements.formFieldsSummary) {
      this.elements.formFieldsSummary.innerHTML = '';
      const fields = formData.mappedFields || [];
      fields.forEach((f) => {
        const pill = document.createElement('span');
        pill.className = 'tag-pill matched';
        pill.textContent = `${f.label || f.name}: ${f.verified ? '✓' : '?'}`;
        this.elements.formFieldsSummary.appendChild(pill);
      });

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

        // Update state in durable store
        this.cachedState.fitAnalysis = fitAnalysis;
        this.cachedState.recommendedProjects = recommendedProjects;
        if (result.analysisSnapshotId) {
          this.cachedState.analysisSnapshotId = result.analysisSnapshotId;
        }
        if (result.existingApplication?.id) {
          this.cachedState.applicationId = result.existingApplication.id;
        }

        this.cachedState.workflowState = WORKFLOW_STATES.ANALYSIS_READY;
        this.stateMachine.state = WORKFLOW_STATES.ANALYSIS_READY;

        await this.store.saveTabState(this.activeTabId, this.cachedState);
        this._renderAllFromState(this.cachedState);
      }
    } catch (err) {
      console.error('Analyze job failed:', err);
      if (err.status === 401 || err.code === 'UNAUTHENTICATED') {
        this._handleSessionExpired();
      } else {
        this.stateMachine.state = WORKFLOW_STATES.JOB_CONFIRMED;
        this._showAnalysisError(err.message || 'Analysis failed. Please check connection and retry.');
      }
    } finally {
      if (this.elements.analyzeJobBtn) {
        this.elements.analyzeJobBtn.disabled = false;
        this.elements.analyzeJobBtn.textContent = 'Analyze Job Match';
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
  async runPrepareHandoff() {
    // Authenticate gate
    if (!this.isAuthenticated) {
      this._handleSessionExpired();
      return;
    }

    if (!this.activeJob) return;

    if (this.elements.prepareHandoffBtn) this.elements.prepareHandoffBtn.disabled = true;
    if (this.elements.ctaPrepareHandoffBtn) this.elements.ctaPrepareHandoffBtn.disabled = true;
    this.elements.prepareSpinner?.classList.remove('hidden');
    if (this.elements.prepareBtnText) this.elements.prepareBtnText.textContent = 'Preparing Handoff Kit...';
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
        this.cachedState.workflowState = WORKFLOW_STATES.APPLICATION_READY;
        this.cachedState.lockState = 'LOCKED';
        this.cachedState.isLocked = true;
        this.stateMachine.state = WORKFLOW_STATES.APPLICATION_READY;
        this.stateMachine.lock();

        await this.store.saveTabState(this.activeTabId, this.cachedState);
        this._renderAllFromState(this.cachedState);
      }
    } catch (err) {
      console.error('Prepare handoff failed:', err);
      if (err.status === 401 || err.code === 'UNAUTHENTICATED') {
        this._handleSessionExpired();
      } else {
        this.stateMachine.state = WORKFLOW_STATES.ANALYSIS_READY;
        this._showHandoffError(err.message || 'Failed to prepare handoff kit. Please retry.');
      }
    } finally {
      if (this.elements.prepareHandoffBtn) this.elements.prepareHandoffBtn.disabled = false;
      if (this.elements.ctaPrepareHandoffBtn) this.elements.ctaPrepareHandoffBtn.disabled = false;
      this.elements.prepareSpinner?.classList.add('hidden');
      if (this.elements.prepareBtnText) {
        this.elements.prepareBtnText.textContent = this.cachedState?.handoffData ? 'Regenerate Handoff Kit' : 'Prepare Handoff Kit';
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

    const ext = artifactType === 'bundle' ? 'zip' : 'pdf';
    const filename = `application-${appId.substring(0, 8)}-${artifactType}.${ext}`;

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

    // Clear controller active job and references
    this.activeJob = null;
    this.activeJobFingerprint = null;
    this.cachedState = freshState;

    // Reset UI
    this.elements.workflowLockBanner?.classList.add('hidden');
    this.elements.workflowLockedBadge?.classList.add('hidden');
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
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const controller = new SidebarController();
    controller.init();
    if (typeof window !== 'undefined') {
      window.__sidebarController = controller;
    }
  });
}

export { SidebarController };
