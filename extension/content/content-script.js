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
            }
          }
        },
        onJobUpdated: async () => {
          // Late DOM hydration or dynamic panel replacement
          const result = await performDetection();
          if (result.detected && result.jobData) {
            await notifyJobDetected(result.jobData);
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

  async function performDetectionWithHydration() {
    let res = await performDetection();

    // P70: Fully ready requires substantive description >= 50 chars for analysis
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
      return res;
    }

    return new Promise((resolve) => {
      let isResolved = false;
      let observer = null;
      const timerIds = [];
      const MAX_DURATION_MS = 5000;
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

      // Bounded backoff retry delays
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
        } else {
          activeJobData = null;
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
