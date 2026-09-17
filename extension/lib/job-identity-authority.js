/**
 * @file Canonical Job Identity & State-Transition Authority (P79).
 *
 * Serves as the single state-transition authority across the extension and backend.
 * Replaces fragmented, ad-hoc state guards with a unified decision engine governed
 * exclusively by Canonical Job Identity and explicit candidate intent.
 */

import {
  isSameJobIdentity,
  deriveJobFingerprint,
  normalizeJobPostingUrl,
} from './job-identity.js';
import { WORKFLOW_STATES } from './workflow-state-machine.js';

export const TRANSITION_ACTIONS = Object.freeze({
  RETAIN_AND_ENRICH: 'RETAIN_AND_ENRICH',             // Same job identity: enrich metadata/description, retain workflow state
  PRESERVE_ACTIVE_SESSION: 'PRESERVE_ACTIVE_SESSION', // Passive signal / non-job / transport timeout: preserve active job & DOM
  QUEUE_PENDING_JOB: 'QUEUE_PENDING_JOB',             // Different job detected while active workflow exists: queue as pending
  BIND_NEW_JOB: 'BIND_NEW_JOB',                       // First valid job bound to an IDLE workflow
  SWITCH_JOB: 'SWITCH_JOB',                           // Explicit switch to a new target job
  EXPLICIT_CLEAR: 'EXPLICIT_CLEAR',                   // Explicit user rescan/reset on non-job or unanalyzed reload
});

export const SIGNAL_TYPES = Object.freeze({
  DETECTION_RESULT: 'DETECTION_RESULT',
  TAB_RELOAD: 'TAB_RELOAD',
  TAB_SWITCH: 'TAB_SWITCH',
  EXPLICIT_RESCAN: 'EXPLICIT_RESCAN',
  HYDRATE_DESCRIPTION: 'HYDRATE_DESCRIPTION',
  FORM_DETECTED: 'FORM_DETECTED',
  ANALYZE_COMPLETE: 'ANALYZE_COMPLETE',
  HANDOFF_PREPARED: 'HANDOFF_PREPARED',
  USER_RESET: 'USER_RESET',
  TRANSPORT_ERROR: 'TRANSPORT_ERROR',
});

/**
 * Immutable value object representing canonical job identity.
 */
export class CanonicalJobIdentity {
  constructor(job = {}) {
    this.canonicalJobId = job.canonicalJobId || null;
    this.provider = job.provider ? String(job.provider).toUpperCase() : null;
    this.externalJobId = job.externalJobId ? String(job.externalJobId) : null;
    this.title = (job.title || job.jobTitle || '').trim();
    this.company = (job.company && job.company !== 'Company') ? String(job.company).trim() : '';
    this.url = job.sourceUrl || job.url || '';
    this.normalizedUrl = normalizeJobPostingUrl(this.url);
    this.location = job.location || '';
    this.workplace = job.workplace || '';
    this.employmentType = job.employmentType || '';

    this.fingerprint = job.fingerprint || job.jobFingerprint || deriveJobFingerprint({
      canonicalJobId: this.canonicalJobId,
      provider: this.provider,
      externalJobId: this.externalJobId,
      title: this.title,
      company: this.company,
      url: this.normalizedUrl,
    });
  }

  isValid() {
    const hasBasicFields = Boolean(
      this.title &&
      this.title !== 'Untitled Role' &&
      this.fingerprint &&
      this.fingerprint !== '0'.repeat(64)
    );
    if (!hasBasicFields) return false;

    // Strong Canonical Identity requirement (Requirement 2):
    // Must satisfy at least one authoritative identity anchor:
    const hasProviderAndExternalId = Boolean(this.provider && this.externalJobId);
    const hasCanonicalId = Boolean(this.canonicalJobId);
    const hasNormalizedUrl = Boolean(this.normalizedUrl && this.normalizedUrl.length > 0);
    const hasValidatedTitleCompanyUrl = Boolean(
      this.title &&
      this.company &&
      this.company !== 'Company' &&
      (this.url || this.normalizedUrl)
    );

    return Boolean(
      hasProviderAndExternalId ||
      hasCanonicalId ||
      hasNormalizedUrl ||
      hasValidatedTitleCompanyUrl
    );
  }

  isSameAs(other) {
    if (!other) return false;
    return isSameJobIdentity(this, other);
  }

  toObject() {
    return {
      fingerprint: this.fingerprint,
      canonicalJobId: this.canonicalJobId,
      provider: this.provider,
      externalJobId: this.externalJobId,
      title: this.title,
      company: this.company,
      url: this.url,
      normalizedUrl: this.normalizedUrl,
      location: this.location,
      workplace: this.workplace,
      employmentType: this.employmentType,
    };
  }
}

/**
 * Single State-Transition Authority.
 */
export class JobIdentityAuthority {
  /**
   * Helper to create a CanonicalJobIdentity value object.
   */
  static createIdentity(job) {
    return new CanonicalJobIdentity(job);
  }

  /**
   * Evaluates any incoming signal against the current workflow context, returning
   * a deterministic transition decision and new state payload.
   *
   * @param {object} context
   * @param {object} [context.activeJob] Currently active job
   * @param {object} [context.cachedState] Tab durable workflow state
   * @param {string} [context.stateMachineState] Current state machine state
   * @param {boolean} [context.isLocked] Whether workflow is locked
   * @param {object} [context.pendingDetectedJob] Currently queued pending job
   * @param {object} signal
   * @param {string} signal.type One of SIGNAL_TYPES
   * @param {object} [signal.detectedJob] Newly detected job data from page/backend
   * @param {string} [signal.jobFingerprint] Fingerprint for hydration
   * @param {boolean} [signal.isExplicitUserAction] Whether user explicitly invoked action
   * @param {boolean} [signal.isTransportError] Whether a transport error occurred
   * @returns {object} Transition Decision { action, reason, targetJob, targetWorkflowState, targetLockState }
   */
  static evaluateTransition(context = {}, signal = {}) {
    const {
      activeJob = null,
      cachedState = null,
      stateMachineState = WORKFLOW_STATES.IDLE,
      isLocked = false,
      pendingDetectedJob = null,
    } = context;

    const {
      type = SIGNAL_TYPES.DETECTION_RESULT,
      detectedJob = null,
      jobFingerprint = null,
      isExplicitUserAction = false,
      isTransportError = false,
    } = signal;

    const activeIdentity = activeJob ? new CanonicalJobIdentity(activeJob) : null;
    const hasActiveJob = Boolean(activeIdentity && activeIdentity.isValid());

    const hasAnalysis = Boolean(
      cachedState?.fitAnalysis ||
      stateMachineState === WORKFLOW_STATES.ANALYSIS_READY
    );
    const hasHandoff = Boolean(
      cachedState?.handoffData ||
      stateMachineState === WORKFLOW_STATES.APPLICATION_READY
    );
    const isWorkflowLocked = Boolean(
      isLocked ||
      cachedState?.lockState === 'LOCKED' ||
      cachedState?.isLocked === true
    );

    // =========================================================================
    // 1. TRANSPORT ERROR HANDLING (P71 Invariant)
    // =========================================================================
    if (isTransportError || type === SIGNAL_TYPES.TRANSPORT_ERROR) {
      return {
        action: TRANSITION_ACTIONS.PRESERVE_ACTIVE_SESSION,
        reason: 'Transport timeout or communication failure does not evict active session',
        preserveActiveJob: hasActiveJob,
        activeJob: hasActiveJob ? activeJob : null,
        targetWorkflowState: stateMachineState,
        targetLockState: isWorkflowLocked ? 'LOCKED' : 'UNLOCKED',
      };
    }

    // =========================================================================
    // 2. EXPLICIT USER WORKFLOW RESET
    // =========================================================================
    if (type === SIGNAL_TYPES.USER_RESET) {
      return {
        action: TRANSITION_ACTIONS.EXPLICIT_CLEAR,
        reason: 'User explicitly reset the workflow',
        activeJob: null,
        pendingDetectedJob: null,
        targetWorkflowState: WORKFLOW_STATES.IDLE,
        targetLockState: 'UNLOCKED',
      };
    }

    // =========================================================================
    // 3. BACKEND ANALYSIS COMPLETION SYNCHRONIZATION
    // =========================================================================
    if (type === SIGNAL_TYPES.ANALYZE_COMPLETE) {
      if (!hasActiveJob) {
        return {
          action: TRANSITION_ACTIONS.PRESERVE_ACTIVE_SESSION,
          reason: 'Analyze complete rejected: no active job identity bound',
          activeJob: null,
          targetWorkflowState: stateMachineState,
          targetLockState: isWorkflowLocked ? 'LOCKED' : 'UNLOCKED',
        };
      }

      // Verify same identity before enriching (Requirement 3)
      if (detectedJob) {
        const responseIdentity = new CanonicalJobIdentity(detectedJob);
        if (responseIdentity.isValid() && !activeIdentity.isSameAs(responseIdentity)) {
          return {
            action: TRANSITION_ACTIONS.PRESERVE_ACTIVE_SESSION,
            reason: 'Analyze complete rejected: response job identity does not match active canonical identity',
            activeJob,
            canonicalIdentity: activeIdentity,
            targetWorkflowState: stateMachineState,
            targetLockState: isWorkflowLocked ? 'LOCKED' : 'UNLOCKED',
          };
        }
      }

      const mergedJob = {
        ...(activeJob || {}),
        ...(cachedState?.jobData || {}),
      };

      // Enrich safe non-identity fields if provided
      if (detectedJob) {
        if (detectedJob.description && (!mergedJob.description || mergedJob.description.length < 50)) {
          mergedJob.description = detectedJob.description;
        }
        if (detectedJob.rawText && !mergedJob.rawText) {
          mergedJob.rawText = detectedJob.rawText;
        }
        if (Array.isArray(detectedJob.requirements) && detectedJob.requirements.length > 0 && (!mergedJob.requirements || mergedJob.requirements.length === 0)) {
          mergedJob.requirements = detectedJob.requirements;
        }
        if (Array.isArray(detectedJob.responsibilities) && detectedJob.responsibilities.length > 0 && (!mergedJob.responsibilities || mergedJob.responsibilities.length === 0)) {
          mergedJob.responsibilities = detectedJob.responsibilities;
        }
        if (detectedJob.location && !mergedJob.location) {
          mergedJob.location = detectedJob.location;
        }
        if (detectedJob.normalizedJob) {
          mergedJob.normalizedJob = detectedJob.normalizedJob;
        }
      }

      // Hard Invariant (Requirement 3): Never allow analysis response to replace canonical title or company
      mergedJob.title = activeIdentity.title;
      mergedJob.company = activeIdentity.company || mergedJob.company || '';
      mergedJob.fingerprint = activeIdentity.fingerprint;
      if (detectedJob?.canonicalJobId && !mergedJob.canonicalJobId) {
        mergedJob.canonicalJobId = detectedJob.canonicalJobId;
      }

      const canonical = new CanonicalJobIdentity({
        ...activeIdentity.toObject(),
        canonicalJobId: activeIdentity.canonicalJobId || detectedJob?.canonicalJobId || null,
        title: activeIdentity.title,
        company: activeIdentity.company,
        fingerprint: activeIdentity.fingerprint,
      });

      const hasExistingHandoff = Boolean(
        signal.existingHandoff ||
        signal.existingApplication?.handoffData ||
        (cachedState?.handoffData && cachedState?.applicationId)
      );
      const nextWorkflowState = hasExistingHandoff
        ? WORKFLOW_STATES.APPLICATION_READY
        : WORKFLOW_STATES.ANALYSIS_READY;
      const nextLockState = hasExistingHandoff ? 'LOCKED' : 'UNLOCKED';

      return {
        action: TRANSITION_ACTIONS.RETAIN_AND_ENRICH,
        reason: 'Affirming canonical job identity on analysis completion',
        activeJob: mergedJob,
        canonicalIdentity: canonical,
        targetWorkflowState: nextWorkflowState,
        targetLockState: nextLockState,
      };
    }

    // =========================================================================
    // 4. BACKEND HANDOFF PREPARATION SYNCHRONIZATION
    // =========================================================================
    if (type === SIGNAL_TYPES.HANDOFF_PREPARED) {
      if (!hasActiveJob) {
        return {
          action: TRANSITION_ACTIONS.PRESERVE_ACTIVE_SESSION,
          reason: 'Handoff preparation rejected: no active job identity bound',
          activeJob: null,
          targetWorkflowState: stateMachineState,
          targetLockState: 'UNLOCKED',
        };
      }

      const targetJob = signal.targetJob || detectedJob || {};
      const targetIdentity = new CanonicalJobIdentity(targetJob);

      // Verify same identity before enriching (Requirement 4)
      if (targetIdentity.isValid() && !activeIdentity.isSameAs(targetIdentity)) {
        return {
          action: TRANSITION_ACTIONS.PRESERVE_ACTIVE_SESSION,
          reason: 'Handoff preparation rejected: target job identity does not match active canonical identity',
          activeJob,
          canonicalIdentity: activeIdentity,
          targetWorkflowState: stateMachineState,
          targetLockState: isWorkflowLocked ? 'LOCKED' : 'UNLOCKED',
        };
      }

      const mergedJob = {
        ...(activeJob || {}),
        ...(cachedState?.jobData || {}),
      };

      // Hard Invariant (Requirement 4): Never allow handoff preparation to replace canonical title or company
      mergedJob.title = activeIdentity.title;
      mergedJob.company = activeIdentity.company || mergedJob.company || '';
      mergedJob.fingerprint = activeIdentity.fingerprint;
      if (targetJob?.canonicalJobId && !mergedJob.canonicalJobId) {
        mergedJob.canonicalJobId = targetJob.canonicalJobId;
      }

      const canonical = new CanonicalJobIdentity({
        ...activeIdentity.toObject(),
        canonicalJobId: activeIdentity.canonicalJobId || targetJob?.canonicalJobId || null,
        title: activeIdentity.title,
        company: activeIdentity.company,
        fingerprint: activeIdentity.fingerprint,
      });

      return {
        action: TRANSITION_ACTIONS.RETAIN_AND_ENRICH,
        reason: 'Binding canonical job identity to prepared handoff package',
        activeJob: mergedJob,
        canonicalIdentity: canonical,
        targetWorkflowState: WORKFLOW_STATES.APPLICATION_READY,
        targetLockState: 'LOCKED',
      };
    }

    // =========================================================================
    // 5. HYDRATION MESSAGE VALIDATION
    // =========================================================================
    if (type === SIGNAL_TYPES.HYDRATE_DESCRIPTION) {
      if (!hasActiveJob) {
        return {
          action: TRANSITION_ACTIONS.PRESERVE_ACTIVE_SESSION,
          reason: 'Hydration ignored: no active job bound',
          activeJob: null,
          targetWorkflowState: stateMachineState,
        };
      }

      // Strict hydration fingerprint requirement (Requirement 1):
      // Supplied fingerprint must match active canonical fingerprint exactly.
      const incomingFingerprint = jobFingerprint || signal.fingerprint;
      if (!incomingFingerprint || activeIdentity.fingerprint !== incomingFingerprint) {
        return {
          action: TRANSITION_ACTIONS.PRESERVE_ACTIVE_SESSION,
          reason: 'Hydration rejected: supplied fingerprint does not match active canonical job fingerprint exactly',
          activeJob,
          targetWorkflowState: stateMachineState,
          targetLockState: isWorkflowLocked ? 'LOCKED' : 'UNLOCKED',
        };
      }

      const enrichedJob = {
        ...activeJob,
        description: detectedJob?.description || activeJob.description,
        rawText: detectedJob?.rawText || activeJob.rawText,
        requirements: detectedJob?.requirements || activeJob.requirements,
        responsibilities: detectedJob?.responsibilities || activeJob.responsibilities,
        analysisReady: detectedJob?.analysisReady === true || (detectedJob?.description?.length >= 50),
        isReady: true,
        title: activeIdentity.title,
        company: activeIdentity.company || activeJob.company,
        fingerprint: activeIdentity.fingerprint,
      };

      return {
        action: TRANSITION_ACTIONS.RETAIN_AND_ENRICH,
        reason: 'Enriching description on active canonical job identity',
        activeJob: enrichedJob,
        canonicalIdentity: activeIdentity,
        targetWorkflowState: stateMachineState,
        targetLockState: isWorkflowLocked ? 'LOCKED' : 'UNLOCKED',
      };
    }

    // =========================================================================
    // 6. PAGE DETECTION & NAVIGATION RECONCILIATION
    // =========================================================================
    const incomingIdentity = detectedJob ? new CanonicalJobIdentity(detectedJob) : null;
    const isIncomingValid = Boolean(incomingIdentity && incomingIdentity.isValid());
    const isExplicit = Boolean(isExplicitUserAction || type === SIGNAL_TYPES.EXPLICIT_RESCAN);

    // Case A: Valid Job Detected on Page
    if (isIncomingValid) {
      if (!hasActiveJob) {
        // IDLE tab receives first job
        return {
          action: isExplicit ? TRANSITION_ACTIONS.SWITCH_JOB : TRANSITION_ACTIONS.BIND_NEW_JOB,
          reason: 'First canonical job detected on IDLE tab',
          activeJob: detectedJob,
          canonicalIdentity: incomingIdentity,
          targetWorkflowState: WORKFLOW_STATES.JOB_DETECTED,
          targetLockState: 'UNLOCKED',
          pendingDetectedJob: null,
        };
      }

      // Both active and incoming exist: evaluate identity relationship
      const isSameJob = activeIdentity.isSameAs(incomingIdentity);

      if (isSameJob) {
        // SAME JOB: Preserve existing workflow state & analysis; enrich description/metadata
        const enrichedJob = {
          ...activeJob,
          ...detectedJob,
          // Preserve authentic fields if detectedJob is missing them
          title: activeIdentity.title,
          company: activeIdentity.company || detectedJob.company,
          description: detectedJob.description || activeJob.description,
          requirements: detectedJob.requirements || activeJob.requirements,
          responsibilities: detectedJob.responsibilities || activeJob.responsibilities,
        };

        return {
          action: TRANSITION_ACTIONS.RETAIN_AND_ENRICH,
          reason: 'Same canonical job identity detected: preserving session and enriching metadata',
          activeJob: enrichedJob,
          canonicalIdentity: activeIdentity,
          targetWorkflowState: stateMachineState,
          targetLockState: isWorkflowLocked ? 'LOCKED' : 'UNLOCKED',
        };
      }

      // DIFFERENT JOB:
      if (isExplicit) {
        // Candidate explicitly commanded: Switch to this new role
        return {
          action: TRANSITION_ACTIONS.SWITCH_JOB,
          reason: 'Candidate explicitly switched to newly detected job',
          activeJob: detectedJob,
          canonicalIdentity: incomingIdentity,
          pendingDetectedJob: null,
          targetWorkflowState: WORKFLOW_STATES.JOB_DETECTED,
          targetLockState: 'UNLOCKED',
        };
      }

      // Passive detection of different job: Calm Workflow Invariant
      if (hasAnalysis || hasHandoff || isWorkflowLocked) {
        // High-investment workflow active: DO NOT interrupt; queue as pending
        return {
          action: TRANSITION_ACTIONS.QUEUE_PENDING_JOB,
          reason: 'Different job detected while active workflow is in progress: queuing as pending',
          activeJob,
          canonicalIdentity: activeIdentity,
          pendingDetectedJob: detectedJob,
          pendingDetectedFingerprint: incomingIdentity.fingerprint,
          targetWorkflowState: stateMachineState,
          targetLockState: isWorkflowLocked ? 'LOCKED' : 'UNLOCKED',
        };
      }

      // Unanalyzed, unlocked job: if detector sees a genuinely different role during navigation
      return {
        action: TRANSITION_ACTIONS.QUEUE_PENDING_JOB,
        reason: 'Different job detected on page: preserving active and queuing pending',
        activeJob,
        canonicalIdentity: activeIdentity,
        pendingDetectedJob: detectedJob,
        pendingDetectedFingerprint: incomingIdentity.fingerprint,
        targetWorkflowState: stateMachineState,
        targetLockState: 'UNLOCKED',
      };
    }

    // Case B: No Job Detected on Page (detected: false, empty, non-job URL)
    if (isExplicit) {
      // User explicitly clicked Rescan on a non-job page
      if (!isWorkflowLocked) {
        return {
          action: TRANSITION_ACTIONS.EXPLICIT_CLEAR,
          reason: 'Candidate explicitly rescanned a confirmed non-job page',
          activeJob: null,
          pendingDetectedJob: null,
          targetWorkflowState: WORKFLOW_STATES.IDLE,
          targetLockState: 'UNLOCKED',
        };
      }
      return {
        action: TRANSITION_ACTIONS.PRESERVE_ACTIVE_SESSION,
        reason: 'Workflow is locked by prepared handoff kit: explicit rescan cannot discard session',
        activeJob,
        targetWorkflowState: stateMachineState,
        targetLockState: 'LOCKED',
      };
    }

    // Passive detection on non-job page (scroll, tab update, background message)
    if (hasActiveJob) {
      if (hasAnalysis || isWorkflowLocked) {
        // High-investment workflow active: NEVER evict active session on passive signals!
        return {
          action: TRANSITION_ACTIONS.PRESERVE_ACTIVE_SESSION,
          reason: 'Passive background detection must never evict an analyzed or locked active session',
          activeJob,
          canonicalIdentity: activeIdentity,
          targetWorkflowState: stateMachineState,
          targetLockState: isWorkflowLocked ? 'LOCKED' : 'UNLOCKED',
        };
      }

      // Unanalyzed, unlocked job: page reloaded into an expired/non-job page (P75 contract)
      return {
        action: TRANSITION_ACTIONS.EXPLICIT_CLEAR,
        reason: 'Unanalyzed, unlocked tab reloaded into a confirmed non-job page',
        activeJob: null,
        pendingDetectedJob: null,
        targetWorkflowState: WORKFLOW_STATES.IDLE,
        targetLockState: 'UNLOCKED',
      };
    }

    // No active job was present: remains IDLE
    return {
      action: TRANSITION_ACTIONS.EXPLICIT_CLEAR,
      reason: 'No active job and no job detected: remains IDLE',
      activeJob: null,
      pendingDetectedJob: null,
      targetWorkflowState: WORKFLOW_STATES.IDLE,
      targetLockState: 'UNLOCKED',
    };
  }
}
