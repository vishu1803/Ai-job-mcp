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

  // Setup Navigation Observer
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
            // New job page navigation: re-evaluate
            const result = await performDetection();
            if (result.detected && result.jobData) {
              chrome.runtime.sendMessage({
                type: 'JOB_DETECTED_ON_PAGE',
                jobData: result.jobData,
              }).catch(() => {});
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

  // Message listener
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ status: 'PONG', loaded: true });
      return true;
    }

    if (message.type === 'DETECT_JOB_PAGE') {
      performDetection().then((res) => sendResponse(res));
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
