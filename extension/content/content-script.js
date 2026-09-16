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

  async function notifyJobDetected(jobData) {
    if (!jobData || !jobData.title) return;
    try {
      const { JobIdentity } = await import(
        chrome.runtime.getURL('lib/job-identity.js')
      );
      const fp = JobIdentity.deriveJobFingerprint(jobData);
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
    }

    async start() {
      try {
        const { JobIdentity } = await import(
          chrome.runtime.getURL('lib/job-identity.js')
        );
        this.targetFingerprint = JobIdentity.deriveJobFingerprint(this.targetJobData);
      } catch {
        this.targetFingerprint = this.targetJobData.externalJobId || this.targetJobData.title;
      }

      if (this.isCancelled) return;

      const desc = (this.targetJobData.description || this.targetJobData.rawText || '').trim();
      if (desc.length >= 50) {
        this.isCompleted = true;
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
        const tid = setTimeout(() => {
          this._attemptHydration(`delay-${delay}`);
        }, delay);
        this.timerIds.push(tid);
      });

      const maxTid = setTimeout(() => {
        this.cancel();
      }, maxLifetime);
      this.timerIds.push(maxTid);

      // Debounced MutationObserver with localized extraction (at most one extraction in flight)
      if (typeof MutationObserver !== 'undefined' && document.body) {
        this.observer = new MutationObserver(() => {
          if (this.isCancelled || this.isCompleted) return;
          if (this.mutationDebounceTimer) {
            clearTimeout(this.mutationDebounceTimer);
          }
          this.mutationDebounceTimer = setTimeout(() => {
            this._attemptHydration('mutation');
          }, 150);
        });

        try {
          this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
          });
        } catch {}
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
          const { JobIdentity } = await import(
            chrome.runtime.getURL('lib/job-identity.js')
          );
          currentFingerprint = JobIdentity.deriveJobFingerprint(result.jobData);
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
          this.cancel();

          const hydratedJob = {
            ...result.jobData,
            analysisReady: true,
          };

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
    }
  }

  let activeHydrationFingerprint = null;
  let activeHydrationLifecycle = null;

  function stopJobHydration() {
    if (activeHydrationLifecycle) {
      activeHydrationLifecycle.cancel();
      activeHydrationLifecycle = null;
    }
    activeHydrationFingerprint = null;
  }

  async function startJobHydration(jobData) {
    if (!jobData || !jobData.title || jobData.title === 'Untitled Role') {
      stopJobHydration();
      return;
    }

    const desc = (jobData.description || jobData.rawText || '').trim();
    if (desc.length >= 50) {
      stopJobHydration();
      return;
    }

    let fp = null;
    try {
      const { JobIdentity } = await import(
        chrome.runtime.getURL('lib/job-identity.js')
      );
      fp = JobIdentity.deriveJobFingerprint(jobData);
    } catch {
      fp = jobData.externalJobId || jobData.title;
    }

    if (
      activeHydrationLifecycle &&
      activeHydrationFingerprint === fp &&
      !activeHydrationLifecycle.isCancelled &&
      !activeHydrationLifecycle.isCompleted
    ) {
      return;
    }

    stopJobHydration();

    activeHydrationFingerprint = fp;
    activeHydrationLifecycle = new JobHydrationLifecycle(jobData, (hydratedJob, fingerprint) => {
      activeJobData = hydratedJob;
      if (navigationObserver) {
        navigationObserver.setActiveJob(activeJobData);
      }
      try {
        chrome.runtime.sendMessage({
          type: 'JOB_DESCRIPTION_HYDRATED',
          jobData: hydratedJob,
          jobFingerprint: fingerprint,
        }).catch(() => {});
      } catch {}
    });
    activeHydrationLifecycle.start();
  }

  if (typeof window !== 'undefined') {
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

    if (!isPotentialJobContext) {
      stopJobHydration();
      return res;
    }

    // P72: Start job-scoped background hydration immediately if job is detected with description < 50
    if (res.detected && res.jobData) {
      startJobHydration(res.jobData);
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

    return new Promise((resolve) => {
      let isResolved = false;
      let observer = null;
      const timerIds = [];
      const MAX_DURATION_MS = HYDRATION_DEADLINE;
      const startTime = Date.now();

      const finish = (result) => {
        if (isResolved) return;
        isResolved = true;
        if (observer) {
          try { observer.disconnect(); } catch {}
          observer = null;
        }
        timerIds.forEach((t) => clearTimeout(t));
        timerIds.length = 0;

        // P72: Do NOT kill background hydration if description is still loading!
        if (result.detected && result.jobData) {
          const desc = (result.jobData.description || result.jobData.rawText || '').trim();
          if (desc.length < 50) {
            startJobHydration(result.jobData);
          } else {
            stopJobHydration();
          }
        }
        resolve(result);
      };

      const checkNow = async () => {
        if (isResolved) return;
        const currentRes = await performDetection();
        if (isFullyReady(currentRes)) {
          finish(currentRes);
        } else if (Date.now() - startTime >= MAX_DURATION_MS) {
          finish(currentRes);
        }
      };

      if (typeof MutationObserver !== 'undefined' && document.body) {
        observer = new MutationObserver(() => {
          checkNow();
        });
        try {
          observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        } catch {}
      }

      // Bounded backoff retry delays within initial request window
      const delays = [100, 250, 500, 900, 1500, 2500, 3800];
      delays.forEach((delay) => {
        const tid = setTimeout(checkNow, delay);
        timerIds.push(tid);
      });

      const maxTid = setTimeout(async () => {
        if (!isResolved) {
          const finalRes = await performDetection();
          finish(finalRes);
        }
      }, MAX_DURATION_MS);
      timerIds.push(maxTid);
    });
  }

  // Message listener
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ status: 'PONG', loaded: true });
      return true;
    }

    if (message.type === 'DETECT_JOB_PAGE') {
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
