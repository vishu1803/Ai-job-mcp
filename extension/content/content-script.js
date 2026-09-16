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

      chrome.runtime.sendMessage({
        type: 'JOB_DETECTED_ON_PAGE',
        jobData,
        url: window.location.href,
      }).catch(() => {});
    } catch {
      // Ignore background transmission errors if port closed
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

      // Initial local detection on document idle (immediate and fallback for late hydration)
      setTimeout(async () => {
        const result = await performDetection();
        if (result.detected && result.jobData) {
          await notifyJobDetected(result.jobData);
        }
      }, 100);

      setTimeout(async () => {
        if (!activeJobData) {
          const result = await performDetection();
          if (result.detected && result.jobData) {
            await notifyJobDetected(result.jobData);
          }
        }
      }, 500);
    } catch (err) {
      console.warn('Could not initialize NavigationObserver:', err);
    }
  })();

  // Message listener
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ status: 'PONG', loaded: true });
      return true;
    }

    if (message.type === 'DETECT_JOB_PAGE') {
      (async () => {
        let res = await performDetection();

        // P66: Delayed hydration grace period for SPA / LinkedIn job detail URLs
        if (!res.detected && typeof window !== 'undefined' && window.location) {
          const href = window.location.href.toLowerCase();
          const isPotentialJobUrl =
            href.includes('/jobs/view/') ||
            /[?&]currentjobid=\d+/i.test(window.location.search) ||
            href.includes('/careers/') ||
            href.includes('/posting/');

          if (isPotentialJobUrl) {
            // Wait 350ms for React DOM / detail pane hydration and retry once
            await new Promise((resolve) => setTimeout(resolve, 350));
            res = await performDetection();
          }
        }

        if (res.detected && res.jobData) {
          activeJobData = res.jobData;
          if (navigationObserver) {
            navigationObserver.setActiveJob(activeJobData);
          }
        }
        sendResponse(res);
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
