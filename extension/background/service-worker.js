/**
 * @file Background Service Worker for aicareershub Extension (P15-001).
 *
 * Ephemeral Manifest V3 background service worker.
 * Manages extension lifecycle, dynamic script injection fallbacks,
 * and external navigation requests.
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default configuration in local storage
    chrome.storage.local.set({
      backendUrl: 'http://localhost:3000',
      installedAt: new Date().toISOString(),
    });
  }
});

// Listener for messages from popup or other extension pages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ENSURE_CONTENT_SCRIPT') {
    (async () => {
      try {
        let tabId = message.tabId;
        if (!tabId) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          tabId = tab?.id;
        }
        if (!tabId) {
          sendResponse({ success: false, error: 'No active tab found' });
          return;
        }

        // Check if content script is responsive
        try {
          const pong = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
          if (pong?.status === 'PONG') {
            sendResponse({ success: true, alreadyInjected: true });
            return;
          }
        } catch {
          // Script not injected yet, inject it
        }

        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content/content-script.js'],
        });

        sendResponse({ success: true, injected: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep channel open for async response
  }
});
