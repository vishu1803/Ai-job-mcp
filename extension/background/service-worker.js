/**
 * @file Background Service Worker for aicareershub Extension (P15-001).
 *
 * Ephemeral Manifest V3 background service worker.
 * Manages extension lifecycle, dynamic script injection fallbacks,
 * and external navigation requests.
 */

import { EXTENSION_ENV, PROD_BACKEND_URL, validateBackendUrl } from '../config.js';

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // P15-002: the backend URL is credential-bearing configuration. Production
    // builds pin the exact https origin; development defaults to local backend.
    const defaultUrl = EXTENSION_ENV === 'production' ? PROD_BACKEND_URL : 'http://localhost:3000';
    chrome.storage.local.set({
      backendUrl: defaultUrl,
      installedAt: new Date().toISOString(),
    });
  }

  // P57.2: Enable persistent side panel when clicking the extension action icon
  if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (err) {
      console.warn('Could not set openPanelOnActionClick:', err);
    }
  }
});

// P15-002: re-validate any previously-stored backendUrl on every browser
// startup so a production build can never keep pointing session credentials
// at a development or arbitrary host.
chrome.runtime.onStartup.addListener(async () => {
  if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (err) {
      console.warn('Could not set openPanelOnActionClick:', err);
    }
  }

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

// Forward active tab changes to side panel / content scripts
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    chrome.runtime.sendMessage({
      type: 'ACTIVE_TAB_CHANGED',
      tabId: activeInfo.tabId,
      url: tab?.url,
    }).catch(() => {
      // No listener active, ignore
    });
  } catch {
    // Tab might have been closed
  }
});

// Listener for messages from popup or other extension pages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDE_PANEL') {
    (async () => {
      try {
        let windowId = message.windowId;
        if (!windowId) {
          const currentWindow = await chrome.windows.getCurrent();
          windowId = currentWindow?.id;
        }
        if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function' && windowId) {
          await chrome.sidePanel.open({ windowId });
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'sidePanel API not available' });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

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

