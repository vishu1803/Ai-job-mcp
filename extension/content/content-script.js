/**
 * @file Content Script for aicareershub Extension (P15-001).
 *
 * Runs inside the webpage tab when activated by the user.
 * On message EXTRACT_JOB, executes the JobPageDetector and returns the
 * sanitized NormalizedJobPayload.
 */

// Avoid duplicate registration
if (!window.__aicareershub_content_script_loaded) {
  window.__aicareershub_content_script_loaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'EXTRACT_JOB') {
      (async () => {
        try {
          const { JobPageDetector } = await import(
            chrome.runtime.getURL('job-detection/job-page-detector.js')
          );
          const job = JobPageDetector.detect(document, window.location.href);
          sendResponse({ success: true, job });
        } catch (err) {
          sendResponse({
            success: false,
            error: err.message || 'Failed to extract job description from page',
          });
        }
      })();
      return true; // Asynchronous sendResponse
    }

    if (message.type === 'PING') {
      sendResponse({ status: 'PONG', loaded: true });
      return true;
    }
  });
}
