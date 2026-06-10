// Background service worker

const OFFSCREEN_URL = 'offscreen.html';
let offscreenCreating = null;

async function ensureOffscreenDocument() {
  if (offscreenCreating) return offscreenCreating;
  offscreenCreating = (async () => {
    const exists = await chrome.offscreen.hasDocument();
    if (exists) return;
    try {
      await chrome.runtime.sendMessage({ type: 'db-owner-lost' });
    } catch {
      // no listeners yet
    }
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['WORKERS'],
      justification: 'Shared SQLite database worker with OPFS persistence',
    });
  })();
  try {
    await offscreenCreating;
  } finally {
    offscreenCreating = null;
  }
}

// Keep side panel disabled by default; enable it only for the tab where
// the user explicitly clicks the extension action.
let sidePanelEnabledTabId = null;
const SIDE_PANEL_HOST_TAB_KEY = 'sidePanelHostTabId';

async function setSidePanelHostTabId(tabId) {
  sidePanelEnabledTabId = tabId;
  try {
    await chrome.storage.session.set({ [SIDE_PANEL_HOST_TAB_KEY]: tabId });
  } catch {
    /* session storage unavailable */
  }
}

async function clearSidePanelHostTabId() {
  sidePanelEnabledTabId = null;
  try {
    await chrome.storage.session.remove(SIDE_PANEL_HOST_TAB_KEY);
  } catch {
    /* ignore */
  }
}

async function readSidePanelHostTabId() {
  if (typeof sidePanelEnabledTabId === 'number') return sidePanelEnabledTabId;
  try {
    const data = await chrome.storage.session.get(SIDE_PANEL_HOST_TAB_KEY);
    const id = data[SIDE_PANEL_HOST_TAB_KEY];
    if (typeof id === 'number') {
      sidePanelEnabledTabId = id;
      return id;
    }
  } catch {
    /* ignore */
  }
  return null;
}

chrome.sidePanel
  .setOptions({ enabled: false, path: 'index.html' })
  .catch((error) => console.error(error));

chrome.action.onClicked.addListener((tab) => {
  if (typeof tab.id !== 'number') return;
  if (typeof sidePanelEnabledTabId === 'number' && sidePanelEnabledTabId !== tab.id) {
    chrome.sidePanel
      .setOptions({ tabId: sidePanelEnabledTabId, enabled: false })
      .catch((error) => console.error(error));
  }
  chrome.sidePanel
    .setOptions({ tabId: tab.id, enabled: true, path: 'index.html' })
    .catch((error) => console.error(error));
  chrome.sidePanel
    .open({ tabId: tab.id })
    .catch((error) => console.error(error));
  void setSidePanelHostTabId(tab.id);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (sidePanelEnabledTabId === tabId) {
    void clearSidePanelHostTabId();
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({ backupFolderOnboarding: "pending" }).catch(() => {});
  }
  console.log("Tab Manager AI:", details.reason);
});
// Listen for focus-tab messages (must be at top level, not inside onInstalled)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target === 'db-owner') {
    return false;
  }

  if (message?.target === 'db-rpc') {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const response = await chrome.runtime.sendMessage({
          target: 'db-owner',
          id: message.id,
          method: message.method,
          args: message.args ?? [],
        });
        sendResponse(response ?? { ok: false, error: 'No response from DB owner' });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  if (message?.type === 'resolve-short-url' && typeof message.url === 'string') {
    (async () => {
      try {
        for (const method of ['HEAD', 'GET']) {
          try {
            const res = await fetch(message.url, { method, redirect: 'follow' });
            if (res.url && res.url !== message.url && !res.url.includes('://t.co/')) {
              sendResponse({ url: res.url });
              return;
            }
          } catch {
            /* try GET */
          }
        }
        sendResponse({ url: null });
      } catch (e) {
        sendResponse({ url: null, error: String(e) });
      }
    })();
    return true;
  }

  if (message?.type === 'side-panel-host-tab') {
    readSidePanelHostTabId()
      .then((tabId) => sendResponse({ tabId }))
      .catch(() => sendResponse({ tabId: null }));
    return true;
  }

  if (message?.type === 'focus-tab' && typeof message.tabId === 'number') {
    // Fire and forget - don't send response back to avoid waking up the dashboard
    (async () => {
      try {
        const tab = await chrome.tabs.get(message.tabId);
        if (tab.windowId !== undefined) {
          // Focus window first, then activate tab
          await chrome.windows.update(tab.windowId, { focused: true });
          await chrome.tabs.update(tab.id, { active: true });
          // Small delay to let macOS "settle" on the new Space
          await new Promise(resolve => setTimeout(resolve, 150));
        } else {
          await chrome.tabs.update(tab.id, { active: true });
        }
      } catch (e) {
        console.error('focus-tab failed', e);
      }
    })();
    // Don't return true - we're not sending a response
    return false;
  }
});

