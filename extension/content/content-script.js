/**
 * @file Content Script for aicareershub Extension (P15-001 / P57).
 *
 * Runs inside the webpage tab. Coordinates multi-signal job detection,
 * application form inspection, and SPA route navigation observation.
 */

// Avoid duplicate registration
if (!window.__aicareershub_content_script_loaded) {
  window.__aicareershub_content_script_loaded = true;

  let activeJobData = null;
  let navigationObserver = null;
  let lastNotifiedFingerprint = null;
  let currentTabId = null;

  let jobIdentityModulePromise = null;
  function getJobIdentityModule() {
    if (!jobIdentityModulePromise) {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
          jobIdentityModulePromise = import(chrome.runtime.getURL('lib/job-identity.js')).catch(() => null);
        } else {
          jobIdentityModulePromise = Promise.resolve(null);
        }
      } catch {
        jobIdentityModulePromise = Promise.resolve(null);
      }
    }
    return jobIdentityModulePromise;
  }

  async function notifyJobDetected(jobData) {
    if (!jobData || !jobData.title) return;
    try {
      const mod = await getJobIdentityModule();
      let fp = null;
      if (mod && mod.JobIdentity) {
        fp = mod.JobIdentity.deriveJobFingerprint(jobData);
      } else {
        fp = jobData.externalJobId || jobData.title;
      }
      if (fp === lastNotifiedFingerprint) {
        return;
      }
      lastNotifiedFingerprint = fp;
      activeJobData = jobData;
      if (navigationObserver) {
        navigationObserver.setActiveJob(activeJobData);
      }
      // P68: Passive forwarding removed. DETECT_JOB_PAGE is the sole authoritative delivery path.
    } catch {
      // Ignore background errors
    }
  }

  async function performDetection() {
    try {
      const { JobDetectionEngine } = await import(
        chrome.runtime.getURL('job-detection/detection-engine.js')
      );
      const detectionResult = JobDetectionEngine.evaluate(document, window.location.href);

      if (detectionResult.detected && detectionResult.jobData) {
        activeJobData = detectionResult.jobData;
        if (navigationObserver) {
          navigationObserver.setActiveJob(activeJobData);
        }
      }

      return {
        success: true,
        detected: detectionResult.detected,
        confidence: detectionResult.confidence,
        confidenceScore: detectionResult.confidenceScore,
        jobData: detectionResult.jobData,
        portalMetadata: detectionResult.portalMetadata,
      };
    } catch (err) {
      return {
        success: false,
        detected: false,
        error: err.message || 'Detection failed',
      };
    }
  }

  async function performFormDetection() {
    try {
      const { FormDetector } = await import(
        chrome.runtime.getURL('content/form-detector.js')
      );
      const formInfo = FormDetector.detect(document);
      return formInfo;
    } catch {
      return { hasForm: false, fields: [] };
    }
  }

  // Setup Navigation Observer & Initial Local Page Detection
  (async () => {
    try {
      const { NavigationObserver } = await import(
        chrome.runtime.getURL('content/navigation-observer.js')
      );

      navigationObserver = new NavigationObserver({
        onNavigation: async ({ oldUrl, newUrl, isSameJob }) => {
          if (!isSameJob) {
            stopJobHydration();
          }
          if (isSameJob) {
            // Check if application form appeared on navigation (e.g. /jobs/123 -> /jobs/123/apply)
            const formInfo = await performFormDetection();
            if (formInfo.hasForm) {
              chrome.runtime.sendMessage({
                type: 'APPLICATION_FORM_DETECTED',
                formData: {
                  ...formInfo,
                  url: newUrl,
                },
              }).catch(() => {});
            }
          } else {
            // New job page navigation: re-evaluate locally
            const result = await performDetection();
            if (result.detected && result.jobData) {
              await notifyJobDetected(result.jobData);
              const desc = (result.jobData.description || result.jobData.rawText || '').trim();
              if (desc.length < 50) {
                startJobHydration(result.jobData);
              }
            }
          }
        },
        onJobUpdated: async () => {
          // Late DOM hydration or dynamic panel replacement
          const result = await performDetection();
          if (result.detected && result.jobData) {
            await notifyJobDetected(result.jobData);
            const desc = (result.jobData.description || result.jobData.rawText || '').trim();
            if (desc.length < 50) {
              startJobHydration(result.jobData);
            }
          }
        },
        onFormDetected: async () => {
          const formInfo = await performFormDetection();
          if (formInfo.hasForm) {
            chrome.runtime.sendMessage({
              type: 'APPLICATION_FORM_DETECTED',
              formData: formInfo,
            }).catch(() => {});
          }
        },
      });

      navigationObserver.start();
    } catch (err) {
      console.warn('Could not initialize NavigationObserver:', err);
    }
  })();

  /**
   * P72: Job-Scoped Description Hydration Lifecycle.
   *
   * Coordinates bounded hydration retries and debounced DOM observation for a specific
   * job fingerprint. Ensures description hydration is observed even if delayed past 5s,
   * while preventing concurrent extraction thrash, stale cross-job leakage, or unbounded polling.
   */
  let linkedInAdapterModulePromise = null;
  function getLinkedInAdapterModule() {
    if (!linkedInAdapterModulePromise) {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
          linkedInAdapterModulePromise = import(
            chrome.runtime.getURL('job-detection/adapters/linkedin.adapter.js')
          ).catch(() => null);
        } else {
          linkedInAdapterModulePromise = Promise.resolve(null);
        }
      } catch {
        linkedInAdapterModulePromise = Promise.resolve(null);
      }
    }
    return linkedInAdapterModulePromise;
  }

  async function getActiveJobRoot() {
    try {
      const mod = await getLinkedInAdapterModule();
      if (mod && typeof mod.findActiveLinkedInJobRoot === 'function') {
        return mod.findActiveLinkedInJobRoot(document);
      }
    } catch {}
    return null;
  }

  /**
   * P72 & P73: Single Job-Scoped Description Hydration Lifecycle.
   *
   * Coordinates bounded hydration retries and debounced DOM observation for a specific
   * job fingerprint. Observes the active job root once present (falling back to document.body
   * only until active root appears). Stops immediately when description >= 50.
   */
  class JobHydrationLifecycle {
    constructor(targetJobData, onHydrated) {
      this.targetJobData = targetJobData;
      this.onHydrated = onHydrated;
      this.targetFingerprint = null;
      this.isCancelled = false;
      this.isCompleted = false;
      this.isExtractionInFlight = false;
      this.timerIds = [];
      this.observer = null;
      this.mutationDebounceTimer = null;
      this.observedTarget = 'NONE';
      this.lastHydratedJob = null;
      this.waiters = [];
    }

    async start() {
      try {
        const mod = await getJobIdentityModule();
        if (mod && mod.JobIdentity) {
          this.targetFingerprint = mod.JobIdentity.deriveJobFingerprint(this.targetJobData);
        } else {
          this.targetFingerprint = this.targetJobData.externalJobId || this.targetJobData.title;
        }
      } catch {
        this.targetFingerprint = this.targetJobData.externalJobId || this.targetJobData.title;
      }

      if (this.isCancelled) return;

      const desc = (this.targetJobData.description || this.targetJobData.rawText || '').trim();
      if (desc.length >= 50) {
        this.isCompleted = true;
        this.lastHydratedJob = { ...this.targetJobData, analysisReady: true };
        this._notifyWaiters(this.lastHydratedJob);
        return;
      }

      // Scheduled hydration attempts (100ms, 250ms, 500ms, 900ms, 1500ms, 2500ms, 4000ms, 6000ms, 8000ms)
      let delays = [100, 250, 500, 900, 1500, 2500, 4000, 6000, 8000];
      let maxLifetime = 10000;
      try {
        const timeouts = await import(chrome.runtime.getURL('lib/detection-timeouts.js'));
        if (Array.isArray(timeouts.HYDRATION_DELAYS)) delays = timeouts.HYDRATION_DELAYS;
        if (timeouts.HYDRATION_MAX_LIFETIME_MS) maxLifetime = timeouts.HYDRATION_MAX_LIFETIME_MS;
      } catch {}

      delays.forEach((delay) => {
        const tid = setTimeout(async () => {
          if (this.isCancelled || this.isCompleted) return;
          // If we are currently observing body, check if active root appeared
          if (this.observedTarget !== 'ACTIVE_ROOT') {
            const root = await getActiveJobRoot();
            if (root && root !== document.body && root !== document.documentElement) {
              setupObserver(root, true);
            }
          }
          this._attemptHydration(`delay-${delay}`);
        }, delay);
        this.timerIds.push(tid);
      });

      const maxTid = setTimeout(() => {
        this.cancel();
      }, maxLifetime);
      this.timerIds.push(maxTid);

      // P73: Relevant DOM Observation (observe active job root once it exists)
      const setupObserver = (targetNode, isRootNode) => {
        if (this.isCancelled || this.isCompleted) return;
        if (this.observer) {
          try { this.observer.disconnect(); } catch {}
          this.observer = null;
        }
        if (!targetNode || typeof MutationObserver === 'undefined') return;

        this.observer = new MutationObserver(() => {
          if (this.isCancelled || this.isCompleted) return;
          if (this.mutationDebounceTimer) {
            clearTimeout(this.mutationDebounceTimer);
          }
          this.mutationDebounceTimer = setTimeout(async () => {
            if (this.isCancelled || this.isCompleted) return;
            // If observing body because root was not yet present, check if root appeared
            if (!isRootNode) {
              const root = await getActiveJobRoot();
              if (root && root !== document.body && root !== document.documentElement) {
                setupObserver(root, true);
              }
            }
            this._attemptHydration('mutation');
          }, 150);
        });

        try {
          this.observer.observe(targetNode, {
            childList: true,
            subtree: true,
            characterData: true,
          });
          this.observedTarget = isRootNode ? 'ACTIVE_ROOT' : 'BODY';
        } catch {}
      };

      const initialRoot = await getActiveJobRoot();
      if (initialRoot && initialRoot !== document.body && initialRoot !== document.documentElement) {
        setupObserver(initialRoot, true);
      } else if (typeof document !== 'undefined' && document.body) {
        setupObserver(document.body, false);
      }
    }

    async _attemptHydration(source = 'timer') {
      if (this.isCancelled || this.isCompleted) return;
      if (this.isExtractionInFlight) return;

      this.isExtractionInFlight = true;
      try {
        const result = await performDetection();
        if (this.isCancelled || this.isCompleted) return;

        if (!result || !result.detected || !result.jobData) {
          return;
        }

        let currentFingerprint = null;
        try {
          const mod = await getJobIdentityModule();
          if (mod && mod.JobIdentity) {
            currentFingerprint = mod.JobIdentity.deriveJobFingerprint(result.jobData);
          } else {
            currentFingerprint = result.jobData.externalJobId || result.jobData.title;
          }
        } catch {
          currentFingerprint = result.jobData.externalJobId || result.jobData.title;
        }

        // Invalidate if page navigated to a different job
        if (this.targetFingerprint && currentFingerprint && currentFingerprint !== this.targetFingerprint) {
          this.cancel();
          startJobHydration(result.jobData);
          return;
        }

        const currentDesc = (result.jobData.description || result.jobData.rawText || '').trim();
        if (currentDesc.length >= 50) {
          this.isCompleted = true;

          const hydratedJob = {
            ...result.jobData,
            analysisReady: true,
          };
          this.lastHydratedJob = hydratedJob;
          activeJobData = hydratedJob;

          this.cancel();
          this._notifyWaiters(hydratedJob);

          if (typeof this.onHydrated === 'function') {
            this.onHydrated(hydratedJob, this.targetFingerprint);
          }
        }
      } catch (err) {
        // Safe ignore
      } finally {
        this.isExtractionInFlight = false;
      }
    }

    waitForInitialWindow(maxDurationMs) {
      if (this.isCompleted) {
        return Promise.resolve(this.lastHydratedJob || this.targetJobData);
      }
      if (this.isCancelled) {
        return Promise.resolve(null);
      }

      return new Promise((resolve) => {
        let isDone = false;
        const tid = setTimeout(() => {
          if (!isDone) {
            isDone = true;
            this.waiters = this.waiters.filter((w) => w.resolve !== safeResolve);
            resolve(this.lastHydratedJob || activeJobData || this.targetJobData);
          }
        }, maxDurationMs);

        const safeResolve = (job) => {
          if (!isDone) {
            isDone = true;
            clearTimeout(tid);
            resolve(job);
          }
        };

        this.waiters.push({ resolve: safeResolve, tid });
      });
    }

    _notifyWaiters(job) {
      const pending = [...this.waiters];
      this.waiters.length = 0;
      pending.forEach(({ resolve, tid }) => {
        try { clearTimeout(tid); } catch {}
        try { resolve(job); } catch {}
      });
    }

    cancel() {
      this.isCancelled = true;
      if (this.observer) {
        try { this.observer.disconnect(); } catch {}
        this.observer = null;
      }
      if (this.mutationDebounceTimer) {
        clearTimeout(this.mutationDebounceTimer);
        this.mutationDebounceTimer = null;
      }
      this.timerIds.forEach((t) => clearTimeout(t));
      this.timerIds.length = 0;
      this._notifyWaiters(null);
    }
  }

  function deriveProvisionalJobKey(jobData) {
    if (!jobData) return '';
    const provider = (jobData.provider || '').trim().toLowerCase();
    const extId = (jobData.externalJobId || '').trim();
    const title = (jobData.title || '').trim().toLowerCase();
    const company = (jobData.company || '').trim().toLowerCase();
    if (provider && extId) {
      return `${provider}:${extId}`;
    }
    return `${provider}:${title}:${company}`;
  }

  let activeHydrationKey = null;
  let activeHydrationFingerprint = null;
  let activeHydrationLifecycle = null;
  let activeHydrationStartPromise = null;

  function stopJobHydration() {
    if (activeHydrationLifecycle) {
      activeHydrationLifecycle.cancel();
      activeHydrationLifecycle = null;
    }
    activeHydrationFingerprint = null;
    activeHydrationKey = null;
    activeHydrationStartPromise = null;
  }

  function startJobHydration(jobData) {
    if (!jobData || !jobData.title || jobData.title === 'Untitled Role') {
      stopJobHydration();
      return Promise.resolve();
    }

    const desc = (jobData.description || jobData.rawText || '').trim();
    if (desc.length >= 50) {
      stopJobHydration();
      return Promise.resolve();
    }

    const provisionalKey = deriveProvisionalJobKey(jobData);

    // If an active uncancelled lifecycle already exists for this exact job:
    if (
      activeHydrationKey === provisionalKey &&
      activeHydrationLifecycle &&
      !activeHydrationLifecycle.isCancelled &&
      !activeHydrationLifecycle.isCompleted
    ) {
      return Promise.resolve(activeHydrationLifecycle);
    }

    // P72-FIX: If a start promise is currently in flight for this exact job, reuse it:
    if (activeHydrationKey === provisionalKey && activeHydrationStartPromise) {
      return activeHydrationStartPromise;
    }

    // Different job or new lifecycle needed: cancel old lifecycle immediately
    if (activeHydrationLifecycle) {
      activeHydrationLifecycle.cancel();
      activeHydrationLifecycle = null;
    }
    activeHydrationKey = provisionalKey;
    activeHydrationFingerprint = null;

    const currentKey = provisionalKey;
    const startPromise = (async () => {
      try {
        let fp = null;
        try {
          const mod = await getJobIdentityModule();
          if (mod && mod.JobIdentity) {
            fp = mod.JobIdentity.deriveJobFingerprint(jobData);
          } else {
            fp = jobData.externalJobId || jobData.title;
          }
        } catch {
          fp = jobData.externalJobId || jobData.title;
        }

        // Check if aborted, superseded, or changed while awaiting import
        if (activeHydrationKey !== currentKey) {
          return null;
        }

        // Check if an uncancelled/uncompleted lifecycle was already assigned
        if (
          activeHydrationLifecycle &&
          activeHydrationFingerprint === fp &&
          !activeHydrationLifecycle.isCancelled &&
          !activeHydrationLifecycle.isCompleted
        ) {
          return activeHydrationLifecycle;
        }

        if (activeHydrationLifecycle) {
          activeHydrationLifecycle.cancel();
          activeHydrationLifecycle = null;
        }

        activeHydrationFingerprint = fp;
        const lifecycle = new JobHydrationLifecycle(jobData, (hydratedJob, fingerprint) => {
          activeJobData = hydratedJob;
          if (navigationObserver) {
            navigationObserver.setActiveJob(activeJobData);
          }
          try {
            chrome.runtime.sendMessage({
              type: 'JOB_DESCRIPTION_HYDRATED',
              tabId: currentTabId,
              jobData: hydratedJob,
              jobFingerprint: fingerprint,
            }).catch(() => {});
          } catch {}
        });

        activeHydrationLifecycle = lifecycle;
        await lifecycle.start();
        return lifecycle;
      } finally {
        if (activeHydrationStartPromise === startPromise) {
          activeHydrationStartPromise = null;
        }
      }
    })();

    activeHydrationStartPromise = startPromise;
    return startPromise;
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', () => stopJobHydration());
    window.addEventListener('pagehide', () => stopJobHydration());
  }

  async function performDetectionWithHydration() {
    let res = await performDetection();

    // P70 & P72: Fully ready requires substantive description >= 50 chars for analysis
    const isFullyReady = (result) => {
      if (!result || !result.detected || !result.jobData) {
        return false;
      }
      const jd = result.jobData;
      if (!jd.title || jd.title === 'Untitled Role') return false;
      const desc = (jd.description || jd.rawText || '').trim();
      return desc.length >= 50;
    };

    if (isFullyReady(res)) {
      stopJobHydration();
      return res;
    }

    if (typeof window === 'undefined' || !window.location) {
      return res;
    }

    const hostname = window.location.hostname.toLowerCase();
    const href = window.location.href.toLowerCase();
    const isPotentialJobContext =
      href.includes('/jobs/view/') ||
      /[?&]currentjobid=\d+/i.test(window.location.search) ||
      (hostname.includes('linkedin.com') && href.includes('/jobs/')) ||
      href.includes('/careers/') ||
      href.includes('/posting/') ||
      Boolean(
        typeof document !== 'undefined' &&
        document.querySelector &&
        document.querySelector(
          '.jobs-search-results-list__list-item--active, [data-occludable-job-id], .job-details-jobs-unified-top-card, .jobs-description__content, #job-details, .show-more-less-html__markup, .job-posting, [itemtype*="JobPosting"]'
        )
      );

    if (!isPotentialJobContext || !res.detected || !res.jobData) {
      stopJobHydration();
      return res;
    }

    // P73: Start SINGLE job-scoped hydration lifecycle
    const lifecycle = await startJobHydration(res.jobData);
    if (!lifecycle) {
      return res;
    }

    // P71: Import shared detection timeout constant
    let HYDRATION_DEADLINE = 5000;
    try {
      const { DETECTION_MAX_DURATION_MS } = await import(
        chrome.runtime.getURL('lib/detection-timeouts.js')
      );
      HYDRATION_DEADLINE = DETECTION_MAX_DURATION_MS;
    } catch {
      // Fallback to default if import fails
    }

    // Await single hydration lifecycle up to initial request deadline
    const hydratedJob = await lifecycle.waitForInitialWindow(HYDRATION_DEADLINE);

    if (hydratedJob && (hydratedJob.description || hydratedJob.rawText || '').trim().length >= 50) {
      return {
        ...res,
        detected: true,
        confidence: res.confidence,
        confidenceScore: res.confidenceScore,
        jobData: hydratedJob,
        portalMetadata: res.portalMetadata,
      };
    }

    // Initial window expired while description continues hydrating in background
    return {
      ...res,
      detected: true,
      jobData: activeJobData || res.jobData,
    };
  }

  // Message listener
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'PING') {
        sendResponse({ status: 'PONG', loaded: true });
        return true;
      }

      if (message.type === 'DETECT_JOB_PAGE') {
        if (message.tabId) {
          currentTabId = message.tabId;
        }
        (async () => {
          const res = await performDetectionWithHydration();

          if (res.detected && res.jobData) {
            activeJobData = res.jobData;
            if (navigationObserver) {
              navigationObserver.setActiveJob(activeJobData);
            }
            // P72: If job is detected with description < 50, ensure background hydration lifecycle is running
            const desc = (res.jobData.description || res.jobData.rawText || '').trim();
            if (desc.length < 50) {
              startJobHydration(res.jobData);
            }
          } else {
            activeJobData = null;
            stopJobHydration();
            if (navigationObserver) {
              navigationObserver.setActiveJob(null);
            }
          }
          sendResponse({
            ...res,
            requestId: message.requestId,
            tabId: message.tabId,
            generation: message.generation,
          });
        })();
        return true;
      }

      if (message.type === 'EXTRACT_JOB') {
        performDetection().then((res) => {
          sendResponse({
            success: res.success && res.detected,
            job: res.jobData,
            error: res.error,
          });
        });
        return true;
      }

      if (message.type === 'DETECT_FORM') {
        performFormDetection().then((formInfo) => {
          sendResponse({ success: true, formInfo });
        });
        return true;
      }
    });
  }
  if (typeof window !== 'undefined') {
    window.__aicareershub_hydration = {
      JobHydrationLifecycle,
      startJobHydration,
      stopJobHydration,
      getActiveHydrationLifecycle: () => activeHydrationLifecycle,
      getActiveHydrationFingerprint: () => activeHydrationFingerprint,
      getActiveHydrationKey: () => activeHydrationKey,
      deriveProvisionalJobKey,
      setCurrentTabId: (id) => { currentTabId = id; },
      getCurrentTabId: () => currentTabId,
    };
  }
}
