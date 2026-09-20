/**
 * @file Background Service Worker for aicareershub Extension (P15-001).
 *
 * Ephemeral Manifest V3 background service worker.
 * Manages extension lifecycle, dynamic script injection fallbacks,
 * and external navigation requests.
 */

import { EXTENSION_ENV, PROD_BACKEND_URL, validateBackendUrl } from '../config.js';
import { DurableWorkflowStore } from '../lib/durable-workflow-store.js';

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
    chrome.runtime
      .sendMessage({
        type: 'ACTIVE_TAB_CHANGED',
        tabId: activeInfo.tabId,
        url: tab?.url,
      })
      .catch(() => {
        // No listener active, ignore
      });
  } catch {
    // Tab might have been closed
  }
});

// Forward active tab page reload or URL navigation
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    chrome.runtime
      .sendMessage({
        type: 'TAB_UPDATED',
        tabId,
        url: tab?.url || changeInfo.url,
        status: changeInfo.status,
      })
      .catch(() => {
        // No listener active, ignore
      });
  }
});

// Listener for messages from popup, content scripts, or side panel
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

        // Check if content script is already responsive
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

        // Verify readiness after injection
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const pong = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
            if (pong?.status === 'PONG') break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }

        sendResponse({ success: true, injected: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'JOB_DETECTED_ON_PAGE') {
    // P68: Duplicate forwarding path removed. DETECT_JOB_PAGE is the sole authoritative delivery path.
    sendResponse({ success: true, passive: true });
    return true;
  }

  if (message.type === 'JOB_DESCRIPTION_HYDRATED') {
    // P72-FIX & P73: Service worker receives JOB_DESCRIPTION_HYDRATED from content script,
    // persists the hydrated state to DurableWorkflowStore for the tab, and forwards it to sidebar.
    // Safe sender verification: strictly use sender.tab.id as the authoritative tab identity.
    const senderTabId = sender?.tab?.id;
    if (senderTabId) {
      (async () => {
        try {
          const store = new DurableWorkflowStore();
          const tabState = await store.getTabState(senderTabId);
          if (tabState) {
            tabState.jobData = {
              ...(tabState.jobData || {}),
              ...message.jobData,
              analysisReady: true,
            };
            tabState.normalizedJob = tabState.jobData;
            if (message.jobFingerprint) {
              tabState.jobFingerprint = message.jobFingerprint;
            }
            await store.saveTabState(senderTabId, tabState);
          }
        } catch (err) {
          console.warn('Could not persist hydrated state in service worker:', err);
        }
      })();

      chrome.runtime
        .sendMessage({
          type: 'JOB_DESCRIPTION_HYDRATED',
          tabId: senderTabId,
          jobData: message.jobData,
          jobFingerprint: message.jobFingerprint,
        })
        .catch(() => {
          // No listener active (e.g. sidebar closed), ignore
        });
      sendResponse({ success: true, hydrated: true, forwarded: true });
    } else {
      sendResponse({ success: false, error: 'Missing or invalid sender tab identity' });
    }
    return true;
  }
});
