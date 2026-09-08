/**
 * @file Popup Controller for aicareershub Browser Extension (P15-001).
 *
 * Implements the state machine and user flow for job detection, authentication
 * verification, ATS fit analysis, portfolio recommendation, Handoff Kit preparation,
 * and artifact downloads.
 */

import { BackendClient } from '../api/backend-client.js';
import { AuthClient } from '../auth/auth-client.js';
import { DownloadManager } from '../downloads/download-manager.js';
import { isSubmittedApplicationStatus } from '../lib/application-status.constants.js';
import { selectJobTab } from './job-tab-selector.js';

export class PopupController {
  constructor() {
    this.backendClient = new BackendClient();
    this.authClient = new AuthClient(this.backendClient);
    this.downloadManager = new DownloadManager(this.backendClient);

    this.currentJob = null;
    this.analysisData = null;
    this.handoffData = null;
    this.existingApplication = null;
    this.authState = null;

    this._bindDomElements();
    this._attachEventListeners();
  }

  _bindDomElements() {
    // Header & Alert
    this.authStatusPill = document.getElementById('authStatusPill');
    this.authStatusText = document.getElementById('authStatusText');
    this.alertBox = document.getElementById('alertBox');
    this.alertMessage = document.getElementById('alertMessage');
    this.alertCloseBtn = document.getElementById('alertCloseBtn');

    // States
    this.stateLoading = document.getElementById('stateLoading');
    this.loadingMessage = document.getElementById('loadingMessage');
    this.stateNotAuth = document.getElementById('stateNotAuth');
    this.stateNoJob = document.getElementById('stateNoJob');
    this.stateDetected = document.getElementById('stateDetected');
    this.stateAnalysis = document.getElementById('stateAnalysis');
    this.stateHandoffReady = document.getElementById('stateHandoffReady');

    // Detected Job elements
    this.jobTitle = document.getElementById('jobTitle');
    this.jobCompany = document.getElementById('jobCompany');
    this.jobLocation = document.getElementById('jobLocation');
    this.jobProviderBadge = document.getElementById('jobProviderBadge');
    this.jobWorkplaceBadge = document.getElementById('jobWorkplaceBadge');
    this.existingAppBadge = document.getElementById('existingAppBadge');
    this.candidateStatusLabel = document.getElementById('candidateStatusLabel');
    this.submittedWarning = document.getElementById('submittedWarning');

    // Analysis elements
    this.fitScoreNum = document.getElementById('fitScoreNum');
    this.fitGradeBadge = document.getElementById('fitGradeBadge');
    this.analysisJobTitle = document.getElementById('analysisJobTitle');
    this.fitRecommendationText = document.getElementById('fitRecommendationText');
    this.matchedItems = document.getElementById('matchedItems');
    this.missingItems = document.getElementById('missingItems');
    this.blockersItems = document.getElementById('blockersItems');
    this.requirementsBlockersList = document.getElementById('requirementsBlockersList');
    this.featuredProjectsList = document.getElementById('featuredProjectsList');
    this.omittedProjectsSection = document.getElementById('omittedProjectsSection');
    this.omittedProjectsList = document.getElementById('omittedProjectsList');

    // Tabs
    this.tabRequirementsBtn = document.getElementById('tabRequirementsBtn');
    this.tabProjectsBtn = document.getElementById('tabProjectsBtn');
    this.requirementsTab = document.getElementById('requirementsTab');
    this.projectsTab = document.getElementById('projectsTab');

    // Handoff Ready elements
    this.lifecycleActionBadge = document.getElementById('lifecycleActionBadge');
    this.statusResumeBadge = document.getElementById('statusResumeBadge');
    this.statusCoverLetterBadge = document.getElementById('statusCoverLetterBadge');
    this.statusValidationBadge = document.getElementById('statusValidationBadge');
    this.telParseability = document.getElementById('telParseability');
    this.telJobMatch = document.getElementById('telJobMatch');
    this.telEvidenceCoverage = document.getElementById('telEvidenceCoverage');
    this.telLayoutProfile = document.getElementById('telLayoutProfile');

    // Action Buttons
    this.openAuthBtn = document.getElementById('openAuthBtn');
    this.retryDetectBtn = document.getElementById('retryDetectBtn');
    this.analyzeJobBtn = document.getElementById('analyzeJobBtn');
    this.prepareHandoffBtn = document.getElementById('prepareHandoffBtn');
    this.downloadResumeBtn = document.getElementById('downloadResumeBtn');
    this.downloadCoverLetterBtn = document.getElementById('downloadCoverLetterBtn');
    this.downloadBundleBtn = document.getElementById('downloadBundleBtn');
    this.openAppBtn = document.getElementById('openAppBtn');
  }

  _attachEventListeners() {
    this.alertCloseBtn.addEventListener('click', () => this.hideAlert());
    this.openAuthBtn.addEventListener('click', () => this.handleOpenAuth());
    this.retryDetectBtn.addEventListener('click', () => this.detectJobOnPage());
    this.analyzeJobBtn.addEventListener('click', () => this.handleAnalyzeJob());
    this.prepareHandoffBtn.addEventListener('click', () => this.handlePrepareHandoff());

    this.downloadResumeBtn.addEventListener('click', () => this.handleDownloadArtifact('resume'));
    this.downloadCoverLetterBtn.addEventListener('click', () => this.handleDownloadArtifact('cover-letter'));
    this.downloadBundleBtn.addEventListener('click', () => this.handleDownloadArtifact('bundle'));
    this.openAppBtn.addEventListener('click', () => this.handleOpenApp());

    // Tab switching
    this.tabRequirementsBtn.addEventListener('click', () => this.switchTab('requirements'));
    this.tabProjectsBtn.addEventListener('click', () => this.switchTab('projects'));

    // Auto-refresh auth status on window focus
    window.addEventListener('focus', () => {
      if (this.authState?.state !== 'AUTHENTICATED') {
        this.checkAuthAndProceed();
      }
    });
  }

  showAlert(msg) {
    this.alertMessage.textContent = msg;
    this.alertBox.classList.remove('hidden');
  }

  hideAlert() {
    this.alertBox.classList.add('hidden');
  }

  showState(stateElement, loadingMsg = null) {
    [
      this.stateLoading,
      this.stateNotAuth,
      this.stateNoJob,
      this.stateDetected,
      this.stateAnalysis,
      this.stateHandoffReady,
    ].forEach((el) => el.classList.add('hidden'));

    if (loadingMsg && this.loadingMessage) {
      this.loadingMessage.textContent = loadingMsg;
    }
    stateElement.classList.remove('hidden');
  }

  switchTab(tabName) {
    if (tabName === 'requirements') {
      this.tabRequirementsBtn.classList.add('active');
      this.tabProjectsBtn.classList.remove('active');
      this.requirementsTab.classList.remove('hidden');
      this.projectsTab.classList.add('hidden');
    } else {
      this.tabProjectsBtn.classList.add('active');
      this.tabRequirementsBtn.classList.remove('active');
      this.projectsTab.classList.remove('hidden');
      this.requirementsTab.classList.add('hidden');
    }
  }

  /**
   * Main entry point when extension popup is opened.
   */
  async init() {
    this.showState(this.stateLoading, 'Checking authentication...');
    await this.checkAuthAndProceed();
  }

  async checkAuthAndProceed() {
    try {
      this.authState = await this.authClient.checkSession();

      if (this.authState.state === 'AUTHENTICATED') {
        this.authStatusPill.className = 'status-pill status-connected';
        this.authStatusText.textContent = 'Connected';
        this.candidateStatusLabel.textContent = 'CONNECTED';
        this.candidateStatusLabel.className = 'status-val text-success';
        await this.detectJobOnPage();
      } else if (this.authState.state === 'SESSION_EXPIRED') {
        this.authStatusPill.className = 'status-pill status-offline';
        this.authStatusText.textContent = 'Expired';
        this.showAlert('Your session has expired. Please sign in again.');
        this.showState(this.stateNotAuth);
      } else {
        this.authStatusPill.className = 'status-pill status-offline';
        this.authStatusText.textContent = 'Sign In';
        this.showState(this.stateNotAuth);
      }
    } catch (err) {
      this.authStatusPill.className = 'status-pill status-offline';
      this.authStatusText.textContent = 'Offline';
      this.showAlert(`Connection check failed: ${err.message}`);
      this.showState(this.stateNotAuth);
    }
  }

  /**
   * Queries active tab and requests job extraction from content script.
   */
  async detectJobOnPage() {
    this.showState(this.stateLoading, 'Extracting job posting...');
    this.hideAlert();

    if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
      // Running in test / preview environment outside Chrome extension
      this.showState(this.stateNoJob);
      return;
    }

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const forcedTabId = urlParams.get('tabId') ? parseInt(urlParams.get('tabId'), 10) : null;
      let tab = null;

      if (forcedTabId) {
        try {
          tab = await chrome.tabs.get(forcedTabId);
        } catch {
          tab = null;
        }
      }

      if (!tab?.id) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        tab = activeTab;
        if (tab?.url?.startsWith('chrome-extension://') || !tab?.url) {
          // P15-002 Batch 3: deterministic multi-tab selection (no arbitrary
          // substring heuristics). ATS-provider hosts win; otherwise the first
          // eligible tab in query order. The chosen host is surfaced to the
          // user so the active page is never ambiguous.
          const allTabs = await chrome.tabs.query({});
          const selected = selectJobTab(allTabs);
          if (selected.id != null) {
            tab = { id: selected.id, url: selected.url };
            this.showState(this.stateLoading, `Detecting job on ${this.safeHost(selected.url)}...`);
          }
        }
      }

      if (!tab?.id) {
        this.showState(this.stateNoJob);
        return;
      }

      // Ensure content script is loaded
      await chrome.runtime.sendMessage({ type: 'ENSURE_CONTENT_SCRIPT', tabId: tab.id });

      // P15-002 Batch 3: bounded retry for SPA hydration — SPAs (Workday,
      // LinkedIn) fill job content after initial load, so a single immediate
      // extraction shows a false "no job". Retries stay inside this call;
      // the loading state keeps the user informed.
      const DETECTION_ATTEMPTS = 3;
      const DETECTION_RETRY_DELAY_MS = 1200;
      let response = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= DETECTION_ATTEMPTS; attempt++) {
        try {
          response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB' });
          lastErr = null;
        } catch (extractErr) {
          response = null;
          lastErr = extractErr;
        }
        if (response?.success && response.job && response.job.isConfident) break;
        if (attempt < DETECTION_ATTEMPTS) {
          this.showState(this.stateLoading, `Still detecting job page... (attempt ${attempt + 1} of ${DETECTION_ATTEMPTS})`);
          await new Promise((resolve) => setTimeout(resolve, DETECTION_RETRY_DELAY_MS));
        }
      }

      window._lastDetectionDebug = {
        tabId: tab.id,
        tabUrl: tab.url,
        response,
        attempts: DETECTION_ATTEMPTS,
        err: lastErr?.message || null,
      };

      if (response?.success && response.job && response.job.isConfident) {
        this.currentJob = response.job;
        this.renderDetectedJob(response.job);
      } else {
        this.showState(this.stateNoJob);
      }
    } catch (err) {
      window._lastDetectionDebug = {
        tabId: null,
        tabUrl: null,
        response: null,
        err: err?.message || String(err),
      };
      this.showState(this.stateNoJob);
    }
  }

  renderDetectedJob(job) {
    this.jobTitle.textContent = job.title || 'Untitled Role';
    this.jobCompany.textContent = job.company || 'Company';
    this.jobLocation.textContent = job.location || 'Not specified';
    this.jobProviderBadge.textContent = job.provider || 'CAREER';
    this.jobWorkplaceBadge.textContent = job.workplace || 'UNKNOWN';

    this.showState(this.stateDetected);
  }

  async handleAnalyzeJob() {
    if (!this.currentJob) return;

    this.showState(this.stateLoading, 'Analyzing job fit & recommendations...');
    this.hideAlert();

    try {
      const result = await this.backendClient.analyzeJob(this.currentJob);
      this.analysisData = result;
      this.existingApplication = result.existingApplication || null;

      // P15-002 zero-fabrication: an authoritative-analysis failure must be
      // surfaced as an error, never as a guessed score/grade.
      if (result.code === 'ANALYSIS_UNAVAILABLE' || !result.fitAnalysis) {
        const reason = result.message || 'Job fit analysis is temporarily unavailable.';
        this.showAlert(`Analysis unavailable: ${reason}`);
        this.showState(this.stateDetected);
        return;
      }

      if (result.existingApplication) {
        this.existingAppBadge.textContent = `SAVED v${result.existingApplication.packageVersion || 1}`;
        this.existingAppBadge.classList.remove('hidden');
      } else {
        this.existingAppBadge.classList.add('hidden');
      }

      // P15-002: protection state derived from the authoritative shared
      // predicate so the popup never drifts from backend semantics.
      const statusIsSubmitted =
        result.isSubmitted ||
        isSubmittedApplicationStatus(result.existingApplication?.status);
      if (statusIsSubmitted) {
        this.submittedWarning.classList.remove('hidden');
        this.prepareHandoffBtn.disabled = true;
        this.prepareHandoffBtn.textContent = 'Application Submitted (Protected)';
      } else {
        this.submittedWarning.classList.add('hidden');
        this.prepareHandoffBtn.disabled = false;
        this.prepareHandoffBtn.innerHTML = `<span>Prepare Handoff Kit</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>`;
      }

      this.renderAnalysisResults(result);
      this.showState(this.stateAnalysis);
    } catch (err) {
      this.showAlert(`Analysis failed: ${err.message}`);
      this.showState(this.stateDetected);
    }
  }

  renderAnalysisResults(result) {
    const fit = result.fitAnalysis || {};
    this.analysisJobTitle.textContent = `${result.canonicalJob?.title || 'Job'} at ${result.canonicalJob?.company || ''}`;
    this.fitScoreNum.textContent = fit.score != null ? Math.round(fit.score) : '--';
    this.fitGradeBadge.textContent = `Grade ${fit.grade || 'N/A'}`;
    this.fitRecommendationText.textContent = fit.recommendation?.replace(/_/g, ' ') || 'Assessment Complete';

    // Hard blockers
    this.blockersItems.innerHTML = '';
    if (fit.hardBlockers && fit.hardBlockers.length > 0) {
      this.requirementsBlockersList.classList.remove('hidden');
      fit.hardBlockers.forEach((b) => {
        const div = document.createElement('div');
        div.className = 'req-item';
        div.innerHTML = `<span class="req-icon text-danger">⚠️</span><span>${escapeHtml(b.requirement || b.name || b)}</span>`;
        this.blockersItems.appendChild(div);
      });
    } else {
      this.requirementsBlockersList.classList.add('hidden');
    }

    // Matches
    this.matchedItems.innerHTML = '';
    const matches = [...(fit.matches || []), ...(fit.partialMatches || [])];
    if (matches.length > 0) {
      matches.forEach((m) => {
        const div = document.createElement('div');
        div.className = 'req-item';
        const isFull = !m.status || m.status === 'MATCHED' || m.status === 'COVERED';
        div.innerHTML = `<span class="req-icon ${isFull ? 'text-success' : 'text-warning'}">${isFull ? '✓' : '◐'}</span><span>${escapeHtml(m.requirement || m.skill || m.name || '')}</span>`;
        this.matchedItems.appendChild(div);
      });
    } else {
      this.matchedItems.innerHTML = '<div class="req-item text-muted">No explicit requirement matches found.</div>';
    }

    // Missing
    this.missingItems.innerHTML = '';
    if (fit.missingRequirements && fit.missingRequirements.length > 0) {
      fit.missingRequirements.forEach((m) => {
        const div = document.createElement('div');
        div.className = 'req-item';
        div.innerHTML = `<span class="req-icon text-muted">○</span><span>${escapeHtml(m.requirement || m.skill || m.name || m)}</span>`;
        this.missingItems.appendChild(div);
      });
    } else {
      this.missingItems.innerHTML = '<div class="req-item text-muted">No hard missing requirements identified.</div>';
    }

    // Portfolio projects
    this.featuredProjectsList.innerHTML = '';
    const featured = result.portfolioRecommendations?.featuredProjects || [];
    if (featured.length > 0) {
      featured.forEach((p) => {
        const div = document.createElement('div');
        div.className = 'project-item';
        div.innerHTML = `
          <div class="proj-head">
            <span class="proj-name">${escapeHtml(p.displayName || p.name || 'Project')}</span>
            <span class="proj-score">${p.relevanceScore != null ? Math.round(p.relevanceScore) : '--'} pts</span>
          </div>
          <div class="proj-signals">${escapeHtml((p.primarySignals || p.technologies || []).slice(0, 4).join(', ') || 'Evidence verified')}</div>
        `;
        this.featuredProjectsList.appendChild(div);
      });
    } else {
      this.featuredProjectsList.innerHTML = '<div class="project-item text-muted">No verified portfolio projects linked.</div>';
    }

    // Omitted projects
    const omitted = result.portfolioRecommendations?.omittedProjects || [];
    this.omittedProjectsList.innerHTML = '';
    if (omitted.length > 0) {
      this.omittedProjectsSection.classList.remove('hidden');
      omitted.forEach((p) => {
        const div = document.createElement('div');
        div.className = 'project-item';
        div.innerHTML = `
          <div class="proj-head">
            <span class="proj-name text-muted">${escapeHtml(p.displayName || p.name || 'Project')}</span>
            <span class="badge badge-workplace">Omitted</span>
          </div>
          <div class="proj-signals text-muted">${escapeHtml(p.reason || '1-page budget optimization')}</div>
        `;
        this.omittedProjectsList.appendChild(div);
      });
    } else {
      this.omittedProjectsSection.classList.add('hidden');
    }
  }

  async handlePrepareHandoff() {
    if (!this.currentJob) return;

    this.showState(this.stateLoading, 'Preparing Handoff Kit & compiling PDF artifacts...');
    this.hideAlert();

    try {
      const existingId = this.existingApplication?.id;
      const handoffResult = await this.backendClient.prepareHandoff(this.currentJob, existingId);
      this.handoffData = handoffResult;

      // Validate exact package
      const valResult = await this.backendClient.validatePackage(
        handoffResult.applicationId,
        handoffResult.packageHash
      );

      this.renderHandoffKit(handoffResult, valResult);
      this.showState(this.stateHandoffReady);
    } catch (err) {
      if (err.code === 'APPLICATION_ALREADY_SUBMITTED' || err.status === 409) {
        this.showAlert('Application already submitted. Handoff kit is read-only.');
      } else {
        this.showAlert(`Preparation failed: ${err.message}`);
      }
      this.showState(this.stateAnalysis);
    }
  }

  renderHandoffKit(handoff, validation) {
    this.lifecycleActionBadge.textContent = handoff.lifecycleAction || 'READY';

    // Status badges
    this.statusResumeBadge.textContent = handoff.artifacts?.resume?.ready ? 'READY' : 'GENERATED';
    this.statusCoverLetterBadge.textContent = handoff.artifacts?.coverLetter?.ready ? 'READY' : 'GENERATED';

    const valPassed = validation?.overallStatus === 'PASSED' || (validation?.errors || []).length === 0;
    this.statusValidationBadge.textContent = valPassed ? 'PASSED' : 'WARNING';
    this.statusValidationBadge.className = `badge ${valPassed ? 'badge-success' : 'badge-saved'}`;

    // Telemetry
    const rq = handoff.resumeQuality || {};
    this.telParseability.textContent = rq.atsParseability?.score != null ? `${Math.round(rq.atsParseability.score)}/100` : '100/100';
    this.telJobMatch.textContent = rq.jobMatch?.score != null ? `${Math.round(rq.jobMatch.score)}/100` : '--/100';
    this.telEvidenceCoverage.textContent = rq.evidenceCoverage?.score != null ? `${Math.round(rq.evidenceCoverage.score)}/100` : '100/100';

    const ld = handoff.layoutDiagnostics || {};
    this.telLayoutProfile.textContent = ld.densityProfile ? ld.densityProfile.toUpperCase() : 'BALANCED';
  }

  async handleDownloadArtifact(artifactType) {
    if (!this.handoffData?.applicationId) {
      this.showAlert('No prepared package available to download.');
      return;
    }

    try {
      this.hideAlert();
      await this.downloadManager.downloadArtifact({
        applicationId: this.handoffData.applicationId,
        artifactType,
        packageHash: this.handoffData.packageHash,
        filename: artifactType === 'bundle'
          ? `handoff-kit-${this.handoffData.applicationId.slice(0, 8)}.zip`
          : artifactType === 'resume'
            ? 'tailored-resume.pdf'
            : 'tailored-cover-letter.pdf',
      });
    } catch (err) {
      this.showAlert(`Download failed: ${err.message}`);
    }
  }

  handleOpenAuth() {
    this.authClient.openLoginPortal();
  }

  handleOpenApp() {
    if (this.handoffData?.applicationId) {
      this.authClient.openApplication(this.handoffData.applicationId);
    } else {
      this.authClient.openLoginPortal('/dashboard');
    }
  }
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * P15-002 Batch 3: safe host display for tab-selection messaging.
 *
 * @param {string|null|undefined} urlString
 * @returns {string} Hostname or 'this page'
 */
export function safeHost(urlString) {
  try {
    const host = new URL(String(urlString || '')).host;
    return host || 'this page';
  } catch {
    return 'this page';
  }
}

// Only auto-bootstrap when running inside the real popup document (not under test).
if (typeof document !== 'undefined' && document.getElementById('authStatusPill')) {
  document.addEventListener('DOMContentLoaded', () => {
    const controller = new PopupController();
    controller.init();
  });
}
