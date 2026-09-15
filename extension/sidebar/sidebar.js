/**
 * @file Persistent Sidebar Controller (P57.2).
 *
 * Implements the authoritative extension UI running in the Chrome MV3 Side Panel.
 * Communicates with DurableWorkflowStore to ensure state is never lost when closing the sidebar.
 * Renders authoritative backend-ranked recommendedProjects.
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

    // DOM Elements
    this.elements = {};
  }

  async init() {
    this._bindElements();
    this._attachEventListeners();
    this._listenToRuntimeMessages();

    // Determine current active tab
    await this._syncActiveTab();

    // Check backend connection
    await this._checkBackendConnection();

    // Hydrate state from durable store
    await this._hydrateFromStore();
  }

  _bindElements() {
    this.elements = {
      connectionBadge: document.getElementById('connectionBadge'),
      connectionText: document.getElementById('connectionText'),
      refreshBtn: document.getElementById('refreshBtn'),
      authNotice: document.getElementById('authNotice'),
      signInLink: document.getElementById('signInLink'),
      workflowStatusBar: document.getElementById('workflowStatusBar'),
      workflowStateText: document.getElementById('workflowStateText'),
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

      // Analysis Card
      analysisCard: document.getElementById('analysisCard'),
      matchBandBadge: document.getElementById('matchBandBadge'),
      scoreValue: document.getElementById('scoreValue'),
      matchedSkillsCount: document.getElementById('matchedSkillsCount'),
      missingSkillsCount: document.getElementById('missingSkillsCount'),
      experienceFitVal: document.getElementById('experienceFitVal'),
      matchedSkillsList: document.getElementById('matchedSkillsList'),
      missingSkillsList: document.getElementById('missingSkillsList'),

      // Recommended Projects Card (P57 Rule 1 & Rule 2)
      projectsCard: document.getElementById('projectsCard'),
      recommendedProjectsList: document.getElementById('recommendedProjectsList'),

      // Handoff Card
      handoffCard: document.getElementById('handoffCard'),
      handoffStatusBadge: document.getElementById('handoffStatusBadge'),
      prepareHandoffBtn: document.getElementById('prepareHandoffBtn'),
      prepareSpinner: document.getElementById('prepareSpinner'),
      prepareBtnText: document.getElementById('prepareBtnText'),
      artifactsContainer: document.getElementById('artifactsContainer'),
      downloadResumeBtn: document.getElementById('downloadResumeBtn'),
      downloadCoverLetterBtn: document.getElementById('downloadCoverLetterBtn'),
      downloadBundleBtn: document.getElementById('downloadBundleBtn'),

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
      await this._syncActiveTab();
      await this._requestDetectionFromTab();
    });

    this.elements.reanalyzeBtn?.addEventListener('click', async () => {
      await this._requestDetectionFromTab();
    });

    this.elements.analyzeJobBtn?.addEventListener('click', async () => {
      await this.runAnalyzeJob();
    });

    this.elements.prepareHandoffBtn?.addEventListener('click', async () => {
      await this.runPrepareHandoff();
    });

    this.elements.downloadResumeBtn?.addEventListener('click', () => {
      this._triggerDownload('resume');
    });

    this.elements.downloadCoverLetterBtn?.addEventListener('click', () => {
      this._triggerDownload('cover-letter');
    });

    this.elements.downloadBundleBtn?.addEventListener('click', () => {
      this._triggerDownload('bundle');
    });
  }

  _listenToRuntimeMessages() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'ACTIVE_TAB_CHANGED') {
        if (message.tabId && message.tabId !== this.activeTabId) {
          this.activeTabId = message.tabId;
          this._hydrateFromStore();
        }
      } else if (message.type === 'JOB_DETECTED_ON_PAGE') {
        this._handleJobDetectedEvent(message.jobData);
      } else if (message.type === 'APPLICATION_FORM_DETECTED') {
        this._handleFormDetectedEvent(message.formData);
      }
    });
  }

  async _syncActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        this.activeTabId = tab.id;
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
      } else {
        this._setConnectionStatus(false);
      }
    } catch {
      this._setConnectionStatus(false);
    }
  }

  _setConnectionStatus(isConnected) {
    if (isConnected) {
      this.elements.connectionBadge.className = 'status-badge connected';
      this.elements.connectionText.textContent = 'Connected';
      this.elements.authNotice.classList.add('hidden');
    } else {
      this.elements.connectionBadge.className = 'status-badge disconnected';
      this.elements.connectionText.textContent = 'Disconnected';
      this.elements.authNotice.classList.remove('hidden');
    }
  }

  async _hydrateFromStore() {
    if (!this.activeTabId) return;

    const durableState = await this.store.getTabState(this.activeTabId);
    if (durableState && durableState.jobData) {
      this.cachedState = durableState;
      this.activeJob = durableState.jobData;
      this.activeJobFingerprint = durableState.jobFingerprint;
      this.stateMachine.state = durableState.workflowState || WORKFLOW_STATES.JOB_DETECTED;

      this._renderAllFromState(durableState);
    } else {
      // Trigger injection and extraction on tab
      await this._requestDetectionFromTab();
    }
  }

  async _requestDetectionFromTab() {
    if (!this.activeTabId) return;

    try {
      // Ensure content script is ready
      await chrome.runtime.sendMessage({
        type: 'ENSURE_CONTENT_SCRIPT',
        tabId: this.activeTabId,
      });

      // Send request to extract page info
      const response = await chrome.tabs.sendMessage(this.activeTabId, {
        type: 'DETECT_JOB_PAGE',
      });

      if (response && response.success && response.jobData) {
        await this._handleJobDetectedEvent(response.jobData);
      } else {
        this._renderEmptyJobState();
      }
    } catch {
      // Content script may not be ready or page doesn't support extension
      this._renderEmptyJobState();
    }
  }

  async _handleJobDetectedEvent(jobData) {
    if (!jobData || !jobData.title) {
      this._renderEmptyJobState();
      return;
    }

    const fingerprint = JobIdentity.deriveJobFingerprint(jobData);
    this.activeJob = jobData;
    this.activeJobFingerprint = fingerprint;

    // Check if we have persistent state for this fingerprint
    const existingJobState = await this.store.getJobState(fingerprint);

    let stateToSave = {
      tabId: this.activeTabId,
      jobData,
      jobFingerprint: fingerprint,
      workflowState: existingJobState?.workflowState || WORKFLOW_STATES.JOB_DETECTED,
      fitAnalysis: existingJobState?.fitAnalysis || null,
      recommendedProjects: existingJobState?.recommendedProjects || [],
      applicationId: existingJobState?.applicationId || null,
      handoffData: existingJobState?.handoffData || null,
      portalMetadata: jobData.portalMetadata || {
        portalName: 'Generic Job Portal',
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
    this._renderWorkflowStatus(state.workflowState);
    this._renderPortalCard(state.portalMetadata || state.jobData?.portalMetadata);
    this._renderJobCard(state.jobData);

    if (state.fitAnalysis) {
      this._renderAnalysisCard(state.fitAnalysis);
    } else {
      this.elements.analysisCard.classList.add('hidden');
    }

    // P57 Rule 1 & Rule 2: Render authoritative recommendedProjects
    if (Array.isArray(state.recommendedProjects) && state.recommendedProjects.length > 0) {
      this._renderRecommendedProjects(state.recommendedProjects);
    } else {
      this.elements.projectsCard.classList.add('hidden');
    }

    if (state.handoffData || state.applicationId) {
      this._renderHandoffCard(state);
    } else {
      this.elements.handoffCard.classList.add('hidden');
    }

    if (state.formData) {
      this._renderFormCard(state.formData);
    }
  }

  _renderWorkflowStatus(stateName) {
    this.elements.workflowStateText.textContent = stateName || 'READY';
  }

  _renderPortalCard(portalMetadata) {
    if (!portalMetadata) return;

    this.elements.portalName.textContent = portalMetadata.portalName || 'Generic Job Portal';

    const confidence = (portalMetadata.confidence || 'medium').toLowerCase();
    this.elements.confidenceBadge.className = `confidence-badge ${confidence}`;
    this.elements.confidenceBadge.textContent = `Confidence: ${confidence.toUpperCase()}`;

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
    this.elements.jobNotDetectedState.classList.remove('hidden');
    this.elements.jobDetectedState.classList.add('hidden');
    this.elements.analysisCard.classList.add('hidden');
    this.elements.projectsCard.classList.add('hidden');
    this.elements.handoffCard.classList.add('hidden');
    this.elements.formDetectionCard.classList.add('hidden');
    this.elements.workflowStateText.textContent = 'NO_JOB_DETECTED';
  }

  _renderJobCard(jobData) {
    if (!jobData) {
      this._renderEmptyJobState();
      return;
    }

    this.elements.jobNotDetectedState.classList.add('hidden');
    this.elements.jobDetectedState.classList.remove('hidden');

    this.elements.jobTitle.textContent = jobData.title || 'Untitled Role';
    this.elements.jobCompany.textContent = jobData.company || 'Unknown Company';
    this.elements.jobLocation.textContent = `📍 ${jobData.location || 'Remote'}`;
    this.elements.jobType.textContent = `💼 ${jobData.employmentType || 'Full-time'}`;

    const shortId = (this.activeJobFingerprint || 'unknown').substring(0, 8);
    this.elements.jobIdTag.textContent = `ID: ${shortId}`;
  }

  _renderAnalysisCard(fitAnalysis) {
    if (!fitAnalysis) return;

    this.elements.analysisCard.classList.remove('hidden');

    const rawScore = fitAnalysis.overallScore ?? fitAnalysis.score;
    const isScoreNull = rawScore === null || rawScore === undefined;
    const score = isScoreNull ? null : Math.round(rawScore);
    this.elements.scoreValue.textContent = isScoreNull ? '--' : score;

    const band = isScoreNull
      ? (fitAnalysis.grade || 'INSUFFICIENT_DATA')
      : (fitAnalysis.recommendationBand ||
        fitAnalysis.grade ||
        (score >= 70 ? 'RECOMMENDED' : 'CONDITIONAL'));
    this.elements.matchBandBadge.textContent = band;

    const matched = fitAnalysis.matchedSkills || fitAnalysis.topMatchedSkills || [];
    const missing = fitAnalysis.missingSkills || fitAnalysis.topMissingSkills || [];

    this.elements.matchedSkillsCount.textContent = matched.length;
    this.elements.missingSkillsCount.textContent = missing.length;

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
    this.elements.experienceFitVal.textContent = expFitText;

    // Matched skills tags
    this.elements.matchedSkillsList.innerHTML = '';
    matched.slice(0, 8).forEach((skill) => {
      const pill = document.createElement('span');
      pill.className = 'tag-pill matched';
      pill.textContent = skill;
      this.elements.matchedSkillsList.appendChild(pill);
    });

    // Missing skills tags
    this.elements.missingSkillsList.innerHTML = '';
    missing.slice(0, 6).forEach((skill) => {
      const pill = document.createElement('span');
      pill.className = 'tag-pill missing';
      pill.textContent = skill;
      this.elements.missingSkillsList.appendChild(pill);
    });
  }

  /**
   * P57 Rule 1 & Rule 2: Authoritative Recommended Projects renderer.
   * Renders the canonical recommendedProjects array provided by the backend.
   */
  _renderRecommendedProjects(projects) {
    if (!Array.isArray(projects) || projects.length === 0) {
      this.elements.projectsCard.classList.add('hidden');
      return;
    }

    this.elements.projectsCard.classList.remove('hidden');
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
      footer.innerHTML = `<span>✓ Verified Project</span> • <span style="color: #94a3b8;">Canonical ID: ${(proj.id || '').substring(0, 8)}</span>`;
      item.appendChild(footer);

      this.elements.recommendedProjectsList.appendChild(item);
    });
  }

  _renderHandoffCard(state) {
    this.elements.handoffCard.classList.remove('hidden');

    if (state.handoffData?.artifacts || state.handoffData?.handoffKit) {
      this.elements.artifactsContainer.classList.remove('hidden');
      this.elements.prepareBtnText.textContent = 'Regenerate Handoff Kit';
      this.elements.handoffStatusBadge.textContent = 'KIT READY';
      this.elements.handoffStatusBadge.className = 'status-badge-sm ready';
    } else {
      this.elements.artifactsContainer.classList.add('hidden');
      this.elements.prepareBtnText.textContent = 'Prepare Handoff Kit';
      this.elements.handoffStatusBadge.textContent = 'UNPREPARED';
      this.elements.handoffStatusBadge.className = 'status-badge-sm';
    }
  }

  _renderFormCard(formData) {
    if (!formData) return;

    this.elements.formDetectionCard.classList.remove('hidden');
    this.elements.stepIndicator.textContent = `Step ${formData.step || 1} of ${formData.totalSteps || 1}`;
    this.elements.formStatusMessage.textContent = formData.statusMessage || 'Application form fields detected.';

    this.elements.formFieldsSummary.innerHTML = '';
    const fields = formData.mappedFields || [];
    fields.forEach((f) => {
      const pill = document.createElement('span');
      pill.className = 'tag-pill matched';
      pill.textContent = `${f.label || f.name}: ${f.verified ? '✓' : '?'}`;
      this.elements.formFieldsSummary.appendChild(pill);
    });

    if (fields.length > 0) {
      this.elements.autofillFormBtn.removeAttribute('disabled');
    }
  }

  // Action: Analyze Job
  async runAnalyzeJob() {
    if (!this.activeJob) return;

    this.elements.analyzeJobBtn.disabled = true;
    this.elements.analyzeJobBtn.textContent = 'Analyzing Match...';
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
        this.cachedState.workflowState = WORKFLOW_STATES.ANALYSIS_READY;
        this.stateMachine.state = WORKFLOW_STATES.ANALYSIS_READY;

        await this.store.saveTabState(this.activeTabId, this.cachedState);

        this._renderAllFromState(this.cachedState);
      }
    } catch (err) {
      console.error('Analyze job failed:', err);
      alert('Analysis failed: ' + (err.message || 'Check backend connection'));
    } finally {
      this.elements.analyzeJobBtn.disabled = false;
      this.elements.analyzeJobBtn.textContent = 'Analyze Job Match';
    }
  }

  // Action: Prepare Handoff Kit
  async runPrepareHandoff() {
    if (!this.activeJob) return;

    this.elements.prepareHandoffBtn.disabled = true;
    this.elements.prepareSpinner.classList.remove('hidden');
    this.elements.prepareBtnText.textContent = 'Preparing Handoff Kit...';
    this.stateMachine.state = WORKFLOW_STATES.APPLICATION_PREPARING;
    this._renderWorkflowStatus(WORKFLOW_STATES.APPLICATION_PREPARING);

    try {
      const result = await this.backendClient.prepareHandoff({
        job: this.activeJob,
        tailoringOptions: {
          includeCoverLetter: true,
          includeProjects: true,
        },
      });

      if (result) {
        this.cachedState.handoffData = result;
        this.cachedState.applicationId = result.applicationId;
        if (result.recommendedProjects && result.recommendedProjects.length > 0) {
          this.cachedState.recommendedProjects = result.recommendedProjects;
        }
        this.cachedState.workflowState = WORKFLOW_STATES.APPLICATION_READY;
        this.stateMachine.state = WORKFLOW_STATES.APPLICATION_READY;

        await this.store.saveTabState(this.activeTabId, this.cachedState);
        this._renderAllFromState(this.cachedState);
      }
    } catch (err) {
      console.error('Prepare handoff failed:', err);
      alert('Failed to prepare handoff kit: ' + (err.message || 'Check server logs'));
    } finally {
      this.elements.prepareHandoffBtn.disabled = false;
      this.elements.prepareSpinner.classList.add('hidden');
      this.elements.prepareBtnText.textContent = 'Regenerate Handoff Kit';
    }
  }

  _triggerDownload(artifactType) {
    if (!this.cachedState?.handoffData?.applicationId) {
      alert('No prepared application found to download.');
      return;
    }

    const appId = this.cachedState.handoffData.applicationId;
    const base = this.backendClient.backendUrl || 'http://localhost:3000';
    let url = '';

    if (artifactType === 'resume') {
      url = `${base}/api/applications/${appId}/artifacts/resume`;
    } else if (artifactType === 'cover-letter') {
      url = `${base}/api/applications/${appId}/artifacts/cover-letter`;
    } else {
      url = `${base}/api/applications/${appId}/artifacts/bundle`;
    }

    if (chrome.downloads && typeof chrome.downloads.download === 'function') {
      chrome.downloads.download({ url, filename: `application-${appId}-${artifactType}.pdf` });
    } else {
      window.open(url, '_blank');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new SidebarController();
  controller.init();
});

export { SidebarController };
