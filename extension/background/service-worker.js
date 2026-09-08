/**
 * @file Background Service Worker for aicareershub Extension (P15-001).
 *
 * Ephemeral Manifest V3 background service worker.
 * Manages extension lifecycle, dynamic script injection fallbacks,
 * and external navigation requests.
 */

import { EXTENSION_ENV, PROD_BACKEND_URL, validateBackendUrl } from '../config.js';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // P15-002: the backend URL is credential-bearing configuration. Production
    // builds pin the exact https origin; development defaults to local backend.
    const defaultUrl = EXTENSION_ENV === 'production' ? PROD_BACKEND_URL : 'http://localhost:3000';
    chrome.storage.local.set({
      backendUrl: defaultUrl,
      installedAt: new Date().toISOString(),
    });
  }
});

// P15-002: re-validate any previously-stored backendUrl on every browser
// startup so a production build can never keep pointing session credentials
// at a development or arbitrary host.
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local
    .get('backendUrl')
    .then((data) => {
      if (data?.backendUrl && !validateBackendUrl(data.backendUrl).valid) {
        return chrome.storage.local.remove('backendUrl');
      }
      return undefined;
    })
    .catch(() => {
      // Storage unavailable — BackendClient re-validates on every use anyway.
    });
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
