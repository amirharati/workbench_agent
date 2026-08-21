// Background service worker

importScripts('browser-fetch-service.js');

const OFFSCREEN_URL = 'offscreen.html';
// Increment when the dashboard requires new DB-owner/worker RPC capabilities.
// Keep this in sync with src/offscreen/offscreen.ts and the DB worker response.
// Must match the DB and content worker protocol in src/offscreen/offscreen.ts.
// A mismatch makes each newly started service worker tear down the otherwise
// valid offscreen owner, which is especially disruptive during extension reloads.
const DB_OWNER_PROTOCOL_VERSION = 16;
const PIPELINE_RECOVERY_ALARM = 'pipeline-recovery-wake';
const PIPELINE_JOB_HOSTS_KEY = 'pipelineJobHosts';
let offscreenCreating = null;
let offscreenProtocolVerified = false;
const browserFetchService = globalThis.HomebaseBrowserFetchService.createBrowserFetchService(chrome);
const pipelineJobHosts = new Map();
let pipelineJobHostsLoaded = false;
const OFFSCREEN_PROTOCOL_PROBE_DELAYS_MS = [0, 150, 350, 700, 1_200];
const OFFSCREEN_PROTOCOL_PROBE_TIMEOUT_MS = 1_500;

async function loadPipelineJobHosts() {
  if (pipelineJobHostsLoaded) return;
  pipelineJobHostsLoaded = true;
  try {
    const stored = (await chrome.storage.session.get(PIPELINE_JOB_HOSTS_KEY))[PIPELINE_JOB_HOSTS_KEY];
    if (!stored || typeof stored !== 'object') return;
    for (const [jobId, host] of Object.entries(stored)) {
      if (host && typeof host.tabId === 'number' && typeof host.windowId === 'number') {
        pipelineJobHosts.set(jobId, host);
      }
    }
  } catch {
    // Session storage is an optimization; durable job state remains in SQLite.
  }
}

async function persistPipelineJobHosts() {
  try {
    await chrome.storage.session.set({
      [PIPELINE_JOB_HOSTS_KEY]: Object.fromEntries(pipelineJobHosts),
    });
  } catch {
    // Ignore unavailable session storage.
  }
}

async function bindPipelineJobHost(jobId, tabId, windowId) {
  await loadPipelineJobHosts();
  if (typeof tabId !== 'number' || typeof windowId !== 'number') return;
  pipelineJobHosts.set(jobId, { tabId, windowId });
  await persistPipelineJobHosts();
}

async function unbindPipelineJobHost(jobId) {
  await loadPipelineJobHosts();
  if (!pipelineJobHosts.delete(jobId)) return;
  await persistPipelineJobHosts();
}

async function pausePipelinesOwnedByTab(tabId) {
  await loadPipelineJobHosts();
  const jobIds = [...pipelineJobHosts]
    .filter(([, host]) => host.tabId === tabId)
    .map(([jobId]) => jobId);
  for (const jobId of jobIds) {
    try {
      await ensureOffscreenDocument();
      await chrome.runtime.sendMessage({
        target: 'pipeline-offscreen-owner',
        action: 'pause',
        requestId: jobId,
        reason: 'owner-dashboard-closed',
      });
    } catch (error) {
      console.error('[pipeline] owner-close pause failed:', error);
    } finally {
      pipelineJobHosts.delete(jobId);
    }
  }
  if (jobIds.length) await persistPipelineJobHosts();
}

async function notifyDbOwnerLost() {
  try {
    await chrome.runtime.sendMessage({ type: 'db-owner-lost' });
  } catch {
    // no listeners yet
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getOffscreenContexts() {
  if (chrome.runtime.getContexts) {
    try {
      return await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
      });
    } catch {
      // Fall through to the older API.
    }
  }
  return (await chrome.offscreen.hasDocument()) ? [{ documentUrl: OFFSCREEN_URL }] : [];
}

async function probeDbOwnerProtocol() {
  let timeoutId;
  try {
    const response = await Promise.race([
      chrome.runtime.sendMessage({
        target: 'db-owner-control',
        type: 'get-protocol-version',
      }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('DB owner protocol probe timed out')),
          OFFSCREEN_PROTOCOL_PROBE_TIMEOUT_MS
        );
      }),
    ]);
    if (response?.version === DB_OWNER_PROTOCOL_VERSION) {
      return { status: 'current', response };
    }
    if (
      typeof response?.version === 'number' &&
      typeof response?.coreVersion === 'number' &&
      typeof response?.contentVersion === 'number'
    ) {
      return { status: 'mismatch', response };
    }
    return { status: 'unavailable', response };
  } catch (error) {
    return { status: 'unavailable', error };
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function waitForCurrentDbOwnerProtocol() {
  let mismatchSignature = null;
  let mismatchConfirmations = 0;
  for (const waitMs of OFFSCREEN_PROTOCOL_PROBE_DELAYS_MS) {
    if (waitMs > 0) await delay(waitMs);
    const probe = await probeDbOwnerProtocol();
    if (probe.status === 'current') return { status: 'current', probe };
    if (probe.status === 'mismatch') {
      const signature = `${probe.response.coreVersion}:${probe.response.contentVersion}`;
      if (signature === mismatchSignature) mismatchConfirmations += 1;
      else {
        mismatchSignature = signature;
        mismatchConfirmations = 1;
      }
      // Never tear down an owner based on one response during extension reload.
      if (mismatchConfirmations >= 2) return { status: 'mismatch', probe };
    }
  }
  return { status: 'unavailable' };
}

async function waitForOffscreenClose() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await getOffscreenContexts()).length === 0) return;
    await delay(50);
  }
  throw new Error('Offscreen owner did not finish closing');
}

async function ensureOffscreenDocument() {
  if (offscreenCreating) return offscreenCreating;
  offscreenCreating = (async () => {
    const existingContexts = await getOffscreenContexts();
    if (existingContexts.length > 0) {
      if (offscreenProtocolVerified) return;
      const protocol = await waitForCurrentDbOwnerProtocol();
      if (protocol.status === 'current') {
        offscreenProtocolVerified = true;
        return;
      }
      if (protocol.status !== 'mismatch') {
        // A retained owner may still be loading or being invalidated by Chrome.
        // Let the caller retry; destroying it here races the browser's reload path.
        throw new Error('DB owner is still starting; retry');
      }
      // Chrome may preserve an offscreen document across a rebuilt/reloaded
      // extension. Replace only after two explicit incompatible-version replies.
      await chrome.offscreen.closeDocument();
      await waitForOffscreenClose();
      offscreenProtocolVerified = false;
    }
    await notifyDbOwnerLost();
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['WORKERS'],
      justification: 'Shared core SQLite, folder content-store, and pipeline workers',
    });
    const createdProtocol = await waitForCurrentDbOwnerProtocol();
    if (createdProtocol.status !== 'current') {
      throw new Error(
        createdProtocol.status === 'mismatch'
          ? 'New DB owner started with an incompatible protocol'
          : 'New DB owner is still starting; retry'
      );
    }
    offscreenProtocolVerified = true;
  })();
  try {
    await offscreenCreating;
  } finally {
    offscreenCreating = null;
  }
}

// Track the tabs where the user explicitly opened Homebase. Chrome owns the
// panel's enabled/open state; this set only binds browser-session fetches.
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

chrome.action.onClicked.addListener((tab) => {
  if (typeof tab.id !== 'number') return;
  // The manifest already enables the panel and supplies its path. Opening it
  // directly avoids racing setOptions() against open() in Chrome's native UI.
  chrome.sidePanel
    .open({ tabId: tab.id })
    .catch((error) => console.error(error));
  void setSidePanelHostTabId(tab.id);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (enabledSidePanelTabIds.has(tabId)) {
    void clearSidePanelHostTabId(tabId);
  }
  void pausePipelinesOwnedByTab(tabId);
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({ backupFolderOnboarding: "pending" }).catch(() => {});
  }
  console.log("Homebase:", details.reason);
});

function armPipelineRecoveryAlarm() {
  chrome.alarms.create(PIPELINE_RECOVERY_ALARM, { when: Date.now() + 60_000 });
}

async function wakePipelineCoordinator() {
  await ensureOffscreenDocument();
  await loadPipelineJobHosts();
  const response = await chrome.runtime.sendMessage({
    target: 'pipeline-offscreen-owner',
    action: 'recover',
    hostedJobIds: [...pipelineJobHosts.keys()],
  });
  if (response?.active) armPipelineRecoveryAlarm();
  return response;
}

chrome.runtime.onStartup.addListener(() => {
  void wakePipelineCoordinator().catch((error) => {
    console.error('[pipeline] startup recovery failed:', error);
    armPipelineRecoveryAlarm();
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== PIPELINE_RECOVERY_ALARM) return;
  void (async () => {
    try {
      await wakePipelineCoordinator();
    } catch (error) {
      console.error('[pipeline] wake recovery failed:', error);
      armPipelineRecoveryAlarm();
    }
  })();
});
// Listen for focus-tab messages (must be at top level, not inside onInstalled)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'pipeline-offscreen-done' && typeof message.requestId === 'string') {
    void unbindPipelineJobHost(message.requestId);
    return false;
  }
  if (message?.type === 'pipeline-recovery-arm') {
    armPipelineRecoveryAlarm();
    sendResponse({ ok: true });
    return false;
  }
  if (message?.target === 'db-owner' || message?.target === 'content-owner') {
    return false;
  }

  if (message?.target === 'browser-fetch-service') {
    (async () => {
      try {
        if (message.action === 'cancel') {
          sendResponse(await browserFetchService.cancel(message.requestId));
          return;
        }
        if (message.action !== 'extract') {
          sendResponse({ ok: false, error: 'Unknown browser-fetch action' });
          return;
        }
        sendResponse(await browserFetchService.extract({
          ...message,
          sidePanelHostTabId: await readSidePanelHostTabId(),
        }));
      } catch (error) {
        sendResponse({ ok: false, error: String(error), errorCode: 'provider_error' });
      }
    })();
    return true;
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
        const ownerTabId = sender.tab?.id;
        const ownerWindowId = sender.tab?.windowId;
        const forwarded = message.action === 'start-job'
          ? {
              ...message,
              target: 'pipeline-offscreen-owner',
              options: {
                ...(message.options ?? {}),
                browserOwnerTabId: ownerTabId,
                browserWindowId: ownerWindowId,
              },
            }
          : message.action === 'resume'
            ? {
                ...message,
                target: 'pipeline-offscreen-owner',
                browserOwnerTabId: ownerTabId,
                browserWindowId: ownerWindowId,
              }
            : { ...message, target: 'pipeline-offscreen-owner' };
        const bindsDashboard = message.action === 'start-job' || message.action === 'resume';
        if (bindsDashboard) {
          await bindPipelineJobHost(message.requestId, ownerTabId, ownerWindowId);
        }
        const response = await chrome.runtime.sendMessage({
          ...forwarded,
        });
        if (!response?.ok && bindsDashboard) {
          await unbindPipelineJobHost(message.requestId);
        }
        if (response?.ok && message.action === 'cancel') {
          await unbindPipelineJobHost(message.requestId);
        }
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
