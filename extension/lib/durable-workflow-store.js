/**
 * @file Durable Workflow Store (P57).
 *
 * Persists extension workflow state using chrome.storage.local so that:
 * 1. State survives page navigation, reloads, and tab switches.
 * 2. Closing and reopening the sidebar restores the exact application workflow.
 * 3. Moving between multi-step application pages preserves applicationId, handoff kit, and projects.
 */

import { WORKFLOW_STATES } from './workflow-state-machine.js';
import { deriveJobFingerprint, isSameJobIdentity } from './job-identity.js';

const STORAGE_PREFIX_TAB = 'ach_wf_tab_';
const STORAGE_PREFIX_JOB = 'ach_wf_job_';

export class DurableWorkflowStore {
  constructor(storage = null) {
    this.storage = storage || (typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null);
    this._inMemoryFallback = new Map();
  }

  async _get(key) {
    if (this.storage) {
      const res = await this.storage.get(key);
      return res ? res[key] : null;
    }
    return this._inMemoryFallback.get(key) || null;
  }

  async _set(key, value) {
    if (this.storage) {
      await this.storage.set({ [key]: value });
      return;
    }
    this._inMemoryFallback.set(key, value);
  }

  async _remove(key) {
    if (this.storage) {
      await this.storage.remove(key);
      return;
    }
    this._inMemoryFallback.delete(key);
  }

  /**
   * Generates a blank initial state container.
   *
   * @param {number|string} [tabId]
   * @returns {object}
   */
  createInitialState(tabId = null) {
    return {
      version: 1,
      tabId,
      workflowState: WORKFLOW_STATES.IDLE,
      jobIdentity: null,
      normalizedJob: null,
      fitAnalysis: null,
      recommendedProjects: [],
      analysisSnapshotId: null,
      existingApplication: null,
      applicationId: null,
      applicationData: null,
      detectedForm: null,
      portalCapabilities: null,
      lastError: null,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Loads state for a given tab ID, attempting to recover by job fingerprint if available.
   *
   * @param {number|string} tabId
   * @returns {Promise<object>}
   */
  async loadState(tabId) {
    if (!tabId) return this.createInitialState();

    const tabState = await this._get(`${STORAGE_PREFIX_TAB}${tabId}`);
    if (tabState) {
      return tabState;
    }

    return this.createInitialState(tabId);
  }

  async getTabState(tabId) {
    return this.loadState(tabId);
  }

  async getJobState(fingerprint) {
    if (!fingerprint) return null;
    return this._get(`${STORAGE_PREFIX_JOB}${fingerprint}`);
  }

  async saveJobState(fingerprint, state) {
    if (!fingerprint || !state) return;
    await this._set(`${STORAGE_PREFIX_JOB}${fingerprint}`, state);
  }

  /**
   * Persists state for both the tab and the canonical job fingerprint.
   *
   * @param {number|string} tabId
   * @param {object} state
   * @returns {Promise<void>}
   */
  async saveState(tabId, state) {
    if (!state) return;
    state.lastUpdated = new Date().toISOString();

    if (tabId) {
      await this._set(`${STORAGE_PREFIX_TAB}${tabId}`, state);
    }

    const fp = state.jobIdentity?.fingerprint || state.jobFingerprint || (state.normalizedJob ? deriveJobFingerprint(state.normalizedJob) : (state.jobData ? deriveJobFingerprint(state.jobData) : null));
    if (fp && fp !== 'unknown-job') {
      await this._set(`${STORAGE_PREFIX_JOB}${fp}`, state);
    }
  }

  async saveTabState(tabId, state) {
    return this.saveState(tabId, state);
  }

  /**
   * Reconciles current page with persisted state upon navigation or hydration.
   * Supports both ({ tabId, currentUrl, ... }) and (tabId, navEvent) signatures.
   */
  async reconcileNavigation(arg1, arg2) {
    let tabId, currentUrl, detectedJob, detectedForm;
    if (typeof arg1 === 'object' && arg1 !== null) {
      ({ tabId, currentUrl, detectedJob, detectedForm } = arg1);
    } else {
      tabId = arg1;
      detectedJob = arg2;
      currentUrl = arg2?.sourceUrl || arg2?.url || '';
      detectedForm = arg2?.detectedForm || null;
    }

    const activeState = await this.loadState(tabId);
    const trackedJob = activeState.normalizedJob || activeState.jobData;

    // If no active job was previously tracked and new job is found
    if (!trackedJob && detectedJob) {
      const fp = deriveJobFingerprint(detectedJob);
      const savedJobState = await this._get(`${STORAGE_PREFIX_JOB}${fp}`);
      if (savedJobState && savedJobState.workflowState !== WORKFLOW_STATES.IDLE) {
        savedJobState.tabId = tabId;
        await this.saveState(tabId, savedJobState);
        return {
          ...savedJobState,
          state: savedJobState,
          isNewJob: false,
          reconciled: true,
          jobFingerprint: fp,
        };
      }

      activeState.normalizedJob = detectedJob;
      activeState.jobData = detectedJob;
      activeState.jobFingerprint = fp;
      activeState.jobIdentity = {
        fingerprint: fp,
        title: detectedJob.title,
        company: detectedJob.company,
        url: detectedJob.sourceUrl || currentUrl,
        provider: detectedJob.provider,
        canonicalJobId: detectedJob.canonicalJobId || null,
      };
      activeState.workflowState = WORKFLOW_STATES.JOB_DETECTED;
      await this.saveState(tabId, activeState);
      return {
        ...activeState,
        state: activeState,
        isNewJob: true,
        reconciled: false,
        jobFingerprint: fp,
      };
    }

    // If an active job exists, check if new page is the same job
    if (trackedJob) {
      const targetIdentity = detectedJob || { url: currentUrl, sourceUrl: currentUrl };
      const sameJob = isSameJobIdentity(trackedJob, targetIdentity);

      if (sameJob) {
        // SAME JOB: Preserve analysis, application state, and recommended projects!
        if (detectedForm) {
          activeState.detectedForm = detectedForm;
          activeState.formData = detectedForm;
          if (activeState.workflowState === WORKFLOW_STATES.APPLICATION_READY) {
            activeState.workflowState = WORKFLOW_STATES.FORM_DETECTED;
          }
        }
        await this.saveState(tabId, activeState);
        return {
          ...activeState,
          state: activeState,
          isNewJob: false,
          reconciled: true,
          jobFingerprint: activeState.jobIdentity?.fingerprint || activeState.jobFingerprint,
        };
      }

      // If detectedJob represents a genuinely different role
      if (detectedJob && detectedJob.title && detectedJob.title !== trackedJob.title) {
        const newFp = deriveJobFingerprint(detectedJob);
        const newJobState = this.createInitialState(tabId);
        newJobState.normalizedJob = detectedJob;
        newJobState.jobData = detectedJob;
        newJobState.jobFingerprint = newFp;
        newJobState.jobIdentity = {
          fingerprint: newFp,
          title: detectedJob.title,
          company: detectedJob.company,
          url: detectedJob.sourceUrl || currentUrl,
          provider: detectedJob.provider,
          canonicalJobId: detectedJob.canonicalJobId || null,
        };
        newJobState.workflowState = WORKFLOW_STATES.JOB_DETECTED;
        await this.saveState(tabId, newJobState);
        return {
          ...newJobState,
          state: newJobState,
          isNewJob: true,
          reconciled: false,
          jobFingerprint: newFp,
        };
      }
    }

    // Default: return current active state
    return {
      ...activeState,
      state: activeState,
      isNewJob: false,
      reconciled: true,
      jobFingerprint: activeState.jobIdentity?.fingerprint || activeState.jobFingerprint,
    };
  }

  /**
   * Resets tab workflow state to IDLE.
   *
   * @param {number|string} tabId
   * @returns {Promise<object>}
   */
  async resetTab(tabId) {
    const fresh = this.createInitialState(tabId);
    await this.saveState(tabId, fresh);
    return fresh;
  }
}
