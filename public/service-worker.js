// Background service worker

importScripts('browser-fetch-service.js');

const OFFSCREEN_URL = 'offscreen.html';
// Increment when the dashboard requires new DB-owner/worker RPC capabilities.
// Keep this in sync with src/offscreen/offscreen.ts and the DB worker response.
// Must match the DB and content worker protocol in src/offscreen/offscreen.ts.
// A mismatch makes each newly started service worker tear down the otherwise
// valid offscreen owner, which is especially disruptive during extension reloads.
const DB_OWNER_PROTOCOL_VERSION = 22;
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

// Side panels are contextual: every eligible browser tab owns an independent
// panel instance and native open/closed state. The global manifest entry stays
// disabled, so a panel never follows the user into another tab or the dashboard.
const enabledSidePanelTabIds = new Set();
const openSidePanelTabIds = new Set();
let sidePanelStateLoaded = false;
let lastSidePanelHost = null;
const SIDE_PANEL_HOST_KEY = 'sidePanelHost';
const SIDE_PANEL_ENABLED_TABS_KEY = 'sidePanelEnabledTabIds';
const SIDE_PANEL_OPEN_TABS_KEY = 'sidePanelOpenTabIds';
const SIDE_PANEL_PATH = 'index.html?surface=side-panel';

function isHomebaseDashboardUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false;
  try {
    const candidate = new URL(rawUrl);
    // Chrome keeps the visible tab URL as chrome://newtab/ when this extension's
    // new-tab override is rendering the Homebase dashboard.
    if (candidate.protocol === 'chrome:' && candidate.hostname === 'newtab') {
      return true;
    }
    const dashboard = new URL(chrome.runtime.getURL('index.html'));
    return (
      candidate.origin === dashboard.origin &&
      candidate.pathname === dashboard.pathname &&
      candidate.searchParams.get('surface') !== 'side-panel'
    );
  } catch {
    return false;
  }
}

function isSidePanelEligibleUrl(rawUrl) {
  if (isHomebaseDashboardUrl(rawUrl)) return false;
  try {
    // Chrome-owned pages (for example chrome://extensions) still get their own
    // panel. Bookmarkability is a UI/data concern, not a panel-availability rule.
    return Boolean(new URL(rawUrl));
  } catch {
    return false;
  }
}

async function closeDashboardSidePanels(tabId, windowId) {
  if (typeof chrome.sidePanel.close !== 'function') return;
  if (typeof tabId === 'number') {
    try {
      await chrome.sidePanel.close({ tabId });
    } catch {
      /* already closed or no contextual panel */
    }
  }
  // Clean up a global panel retained from a previous extension version.
  if (typeof windowId === 'number') {
    try {
      await chrome.sidePanel.close({ windowId });
    } catch {
      /* already closed or no legacy global panel */
    }
  }
}

async function persistSidePanelState() {
  try {
    await chrome.storage.session.set({
      [SIDE_PANEL_HOST_KEY]: lastSidePanelHost,
      [SIDE_PANEL_ENABLED_TABS_KEY]: [...enabledSidePanelTabIds],
      [SIDE_PANEL_OPEN_TABS_KEY]: [...openSidePanelTabIds],
    });
  } catch {
    /* session storage unavailable */
  }
}

async function loadSidePanelState() {
  if (sidePanelStateLoaded) return;
  sidePanelStateLoaded = true;
  try {
    const data = await chrome.storage.session.get([
      SIDE_PANEL_HOST_KEY,
      SIDE_PANEL_ENABLED_TABS_KEY,
      SIDE_PANEL_OPEN_TABS_KEY,
    ]);
    for (const id of data[SIDE_PANEL_ENABLED_TABS_KEY] ?? []) {
      if (typeof id === 'number') enabledSidePanelTabIds.add(id);
    }
    for (const id of data[SIDE_PANEL_OPEN_TABS_KEY] ?? []) {
      if (typeof id === 'number') openSidePanelTabIds.add(id);
    }
    const host = data[SIDE_PANEL_HOST_KEY];
    if (typeof host?.tabId === 'number' && typeof host?.windowId === 'number') {
      lastSidePanelHost = { tabId: host.tabId, windowId: host.windowId };
    }
  } catch {
    /* ignore */
  }
}

async function configureSidePanelForTab(tabId, rawUrl, windowId) {
  if (typeof tabId !== 'number' || typeof rawUrl !== 'string') return;
  await loadSidePanelState();
  const enabled = isSidePanelEligibleUrl(rawUrl);
  try {
    if (enabled) {
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: true,
        path: SIDE_PANEL_PATH,
      });
      enabledSidePanelTabIds.add(tabId);
    } else {
      await chrome.sidePanel.setOptions({ tabId, enabled: false });
      enabledSidePanelTabIds.delete(tabId);
      openSidePanelTabIds.delete(tabId);
      if (lastSidePanelHost?.tabId === tabId) lastSidePanelHost = null;
      if (isHomebaseDashboardUrl(rawUrl)) {
        await closeDashboardSidePanels(tabId, windowId);
      }
    }
    await persistSidePanelState();
  } catch (error) {
    console.warn('[side-panel] could not update contextual tab:', error);
  }
}

async function initializeContextualSidePanels() {
  try {
    await chrome.sidePanel.setOptions({ enabled: false, path: SIDE_PANEL_PATH });
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map((tab) =>
      configureSidePanelForTab(tab.id, tab.url, tab.windowId)
    ));
  } catch (error) {
    console.warn('[side-panel] could not initialize contextual panels:', error);
  }
}

async function rememberOpenedSidePanel(info) {
  await loadSidePanelState();
  let tabId = info.tabId;
  if (typeof tabId !== 'number') {
    try {
      const [active] = await chrome.tabs.query({ active: true, windowId: info.windowId });
      tabId = active?.id;
    } catch {
      /* ignore legacy/global event */
    }
  }
  if (typeof tabId !== 'number') return;
  enabledSidePanelTabIds.add(tabId);
  openSidePanelTabIds.add(tabId);
  lastSidePanelHost = { tabId, windowId: info.windowId };
  await persistSidePanelState();
}

async function forgetClosedSidePanel(info) {
  await loadSidePanelState();
  if (typeof info.tabId === 'number') openSidePanelTabIds.delete(info.tabId);
  else if (lastSidePanelHost?.windowId === info.windowId) {
    openSidePanelTabIds.delete(lastSidePanelHost.tabId);
  }
  if (
    lastSidePanelHost &&
    (lastSidePanelHost.tabId === info.tabId ||
      (typeof info.tabId !== 'number' && lastSidePanelHost.windowId === info.windowId))
  ) {
    lastSidePanelHost = null;
  }
  await persistSidePanelState();
}

async function readSidePanelHostTabId() {
  await loadSidePanelState();

  // A side-panel request comes from the visible contextual instance. Prefer its
  // active tab, while retaining the last opened tab as a reload fallback.
  try {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (
      typeof active?.id === 'number' &&
      typeof active?.windowId === 'number' &&
      enabledSidePanelTabIds.has(active.id)
    ) {
      lastSidePanelHost = { tabId: active.id, windowId: active.windowId };
      return active.id;
    }
  } catch {
    /* ignore */
  }

  return lastSidePanelHost?.tabId ?? null;
}

chrome.sidePanel.onOpened.addListener((info) => {
  void rememberOpenedSidePanel(info);
});

chrome.sidePanel.onClosed.addListener((info) => {
  void forgetClosedSidePanel(info);
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  void (async () => {
    try {
      const tab = await chrome.tabs.get(tabId);
      await configureSidePanelForTab(tabId, tab?.url, windowId);
    } catch {
      /* tab disappeared or URL is unavailable */
    }
    await loadSidePanelState();
    if (!openSidePanelTabIds.has(tabId)) return;
    lastSidePanelHost = { tabId, windowId };
    await persistSidePanelState();
  })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url;
  if (typeof url === 'string') void configureSidePanelForTab(tabId, url, tab?.windowId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  enabledSidePanelTabIds.delete(tabId);
  openSidePanelTabIds.delete(tabId);
  if (lastSidePanelHost?.tabId === tabId) {
    lastSidePanelHost = null;
  }
  void persistSidePanelState();
  void pausePipelinesOwnedByTab(tabId);
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({ backupFolderOnboarding: "pending" }).catch(() => {});
  }
  console.log("Homebase:", details.reason);
});

void initializeContextualSidePanels();

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
  if (message?.type === 'dashboard-surface-ready') {
    const tabId = sender.tab?.id;
    if (typeof tabId !== 'number') {
      sendResponse({ ok: false, error: 'Dashboard tab is unavailable' });
      return false;
    }
    configureSidePanelForTab(
      tabId,
      // This message is emitted only by the dashboard entry point. Do not use
      // sender.tab.url here: Chrome may expose the override as chrome://newtab/.
      chrome.runtime.getURL('index.html'),
      sender.tab?.windowId
    )
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
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
