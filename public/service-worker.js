// Background service worker

const OFFSCREEN_URL = 'offscreen.html';
// Increment when the dashboard requires new DB-owner/worker RPC capabilities.
// Keep this in sync with src/offscreen/offscreen.ts and the DB worker response.
const DB_OWNER_PROTOCOL_VERSION = 7;
let offscreenCreating = null;
let offscreenProtocolVerified = false;

async function notifyDbOwnerLost() {
  try {
    await chrome.runtime.sendMessage({ type: 'db-owner-lost' });
  } catch {
    // no listeners yet
  }
}

async function hasCurrentDbOwnerProtocol() {
  try {
    const response = await chrome.runtime.sendMessage({
      target: 'db-owner-control',
      type: 'get-protocol-version',
    });
    return response?.version === DB_OWNER_PROTOCOL_VERSION;
  } catch {
    return false;
  }
}

async function ensureOffscreenDocument() {
  if (offscreenCreating) return offscreenCreating;
  offscreenCreating = (async () => {
    const exists = await chrome.offscreen.hasDocument();
    if (exists) {
      if (offscreenProtocolVerified || await hasCurrentDbOwnerProtocol()) {
        offscreenProtocolVerified = true;
        return;
      }
      // Chrome may preserve an offscreen document across a rebuilt/reloaded
      // dashboard. Replace it before a new caller reaches an older RPC table.
      await chrome.offscreen.closeDocument();
      offscreenProtocolVerified = false;
    }
    await notifyDbOwnerLost();
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['WORKERS'],
      justification: 'Shared core and content SQLite workers with OPFS persistence',
    });
    offscreenProtocolVerified = true;
  })();
  try {
    await offscreenCreating;
  } finally {
    offscreenCreating = null;
  }
}

// Side panel starts disabled globally; enable per-tab when the user clicks the
// action. Multiple tabs may keep the panel enabled — do not close others.
const enabledSidePanelTabIds = new Set();
/** Last tab where the user opened the panel (fallback for host-tab queries). */
let lastSidePanelHostTabId = null;
const SIDE_PANEL_HOST_TAB_KEY = 'sidePanelHostTabId';
const SIDE_PANEL_ENABLED_TABS_KEY = 'sidePanelEnabledTabIds';

async function persistSidePanelTabs() {
  try {
    await chrome.storage.session.set({
      [SIDE_PANEL_HOST_TAB_KEY]: lastSidePanelHostTabId,
      [SIDE_PANEL_ENABLED_TABS_KEY]: [...enabledSidePanelTabIds],
    });
  } catch {
    /* session storage unavailable */
  }
}

async function setSidePanelHostTabId(tabId) {
  lastSidePanelHostTabId = tabId;
  enabledSidePanelTabIds.add(tabId);
  await persistSidePanelTabs();
}

async function clearSidePanelHostTabId(tabId) {
  if (typeof tabId === 'number') {
    enabledSidePanelTabIds.delete(tabId);
    if (lastSidePanelHostTabId === tabId) {
      lastSidePanelHostTabId = enabledSidePanelTabIds.values().next().value ?? null;
    }
  } else {
    enabledSidePanelTabIds.clear();
    lastSidePanelHostTabId = null;
  }
  await persistSidePanelTabs();
}

async function readSidePanelHostTabId() {
  if (enabledSidePanelTabIds.size === 0) {
    try {
      const data = await chrome.storage.session.get([
        SIDE_PANEL_HOST_TAB_KEY,
        SIDE_PANEL_ENABLED_TABS_KEY,
      ]);
      const ids = data[SIDE_PANEL_ENABLED_TABS_KEY];
      if (Array.isArray(ids)) {
        for (const id of ids) {
          if (typeof id === 'number') enabledSidePanelTabIds.add(id);
        }
      }
      const host = data[SIDE_PANEL_HOST_TAB_KEY];
      if (typeof host === 'number') lastSidePanelHostTabId = host;
    } catch {
      /* ignore */
    }
  }

  // Prefer the focused active tab if we enabled the panel there.
  try {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (typeof active?.id === 'number' && enabledSidePanelTabIds.has(active.id)) {
      return active.id;
    }
  } catch {
    /* ignore */
  }

  if (typeof lastSidePanelHostTabId === 'number') return lastSidePanelHostTabId;
  return enabledSidePanelTabIds.values().next().value ?? null;
}

chrome.sidePanel
  .setOptions({ enabled: false, path: 'index.html?surface=side-panel' })
  .catch((error) => console.error(error));

chrome.action.onClicked.addListener((tab) => {
  if (typeof tab.id !== 'number') return;
  // Enable + open on this tab only — leave other tabs' panels alone.
  chrome.sidePanel
    .setOptions({ tabId: tab.id, enabled: true, path: 'index.html?surface=side-panel' })
    .catch((error) => console.error(error));
  chrome.sidePanel
    .open({ tabId: tab.id })
    .catch((error) => console.error(error));
  void setSidePanelHostTabId(tab.id);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (enabledSidePanelTabIds.has(tabId)) {
    void clearSidePanelHostTabId(tabId);
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({ backupFolderOnboarding: "pending" }).catch(() => {});
  }
  console.log("Homebase:", details.reason);
});
// Listen for focus-tab messages (must be at top level, not inside onInstalled)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target === 'db-owner' || message?.target === 'content-owner') {
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
          priority: message.priority === 'low' ? 'low' : 'high',
        });
        sendResponse(response ?? { ok: false, error: 'No response from DB owner' });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  if (message?.target === 'content-rpc') {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const response = await chrome.runtime.sendMessage({
          target: 'content-owner',
          id: message.id,
          method: message.method,
          args: message.args ?? [],
        });
        sendResponse(response ?? { ok: false, error: 'No response from content owner' });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  if (message?.target === 'pipeline-offscreen') {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const response = await chrome.runtime.sendMessage({
          ...message,
          target: 'pipeline-offscreen-owner',
        });
        sendResponse(response ?? { ok: false, error: 'No response from pipeline host' });
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
