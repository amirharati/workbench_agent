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

// Contextual panels are presentation state only. Database, content, and pipeline
// ownership remain shared in the offscreen workers. There is deliberately no
// manifest-global panel: Chrome's native close button can then close one tab's
// contextual panel without closing the panels retained by other tabs.
//
// Reload safety is a separate invariant. Install/startup never call setOptions,
// open, or close. A user toolbar gesture is the only operation that creates and
// opens contextual instances. Normal navigation may only enable/disable a tab
// after a short guard confirms this was not an install/reload lifecycle event.
const SIDE_PANEL_PATH = 'index.html?surface=side-panel';
const SIDE_PANEL_NAVIGATION_SYNC_DELAY_MS = 250;
const contextualSidePanelTabIds = new Set();
const openContextualSidePanelTabIds = new Set();
const armedContextualSidePanelWindowIds = new Set();
const temporarilyDisabledSidePanelTabIds = new Set();
const knownBrowserTabs = new Map();
let knownBrowserTabsHydrated = false;
let sidePanelStateLoad = null;
let sidePanelStateHydrated = false;
let sidePanelLifecycleBlocked = false;
let lastSidePanelHost = null;
const SIDE_PANEL_HOST_KEY = 'sidePanelHost';
const SIDE_PANEL_CONTEXTUAL_TABS_KEY = 'contextualSidePanelTabIds';
const SIDE_PANEL_OPEN_TABS_KEY = 'openContextualSidePanelTabIds';
const SIDE_PANEL_ARMED_WINDOWS_KEY = 'armedContextualSidePanelWindowIds';

function sidePanelPathForTab(tabId) {
  return `${SIDE_PANEL_PATH}&hostTabId=${encodeURIComponent(String(tabId))}`;
}

function isHomebaseDashboardUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false;
  try {
    const candidate = new URL(rawUrl);
    if (
      candidate.protocol === 'chrome:' &&
      (candidate.hostname === 'newtab' || candidate.hostname === 'new-tab-page')
    ) {
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

function isExtensionManagementUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false;
  try {
    const candidate = new URL(rawUrl);
    return candidate.protocol === 'chrome:' && candidate.hostname === 'extensions';
  } catch {
    return false;
  }
}

function isSidePanelEligibleUrl(rawUrl) {
  if (isHomebaseDashboardUrl(rawUrl) || isExtensionManagementUrl(rawUrl)) return false;
  try {
    return Boolean(new URL(rawUrl));
  } catch {
    return false;
  }
}

async function persistSidePanelState() {
  try {
    await chrome.storage.session.set({
      [SIDE_PANEL_HOST_KEY]: lastSidePanelHost,
      [SIDE_PANEL_CONTEXTUAL_TABS_KEY]: [...contextualSidePanelTabIds],
      [SIDE_PANEL_OPEN_TABS_KEY]: [...openContextualSidePanelTabIds],
      [SIDE_PANEL_ARMED_WINDOWS_KEY]: [...armedContextualSidePanelWindowIds],
    });
  } catch {
    /* session storage unavailable */
  }
}

async function loadSidePanelState() {
  if (!sidePanelStateLoad) {
    sidePanelStateLoad = (async () => {
      try {
        const data = await chrome.storage.session.get([
          SIDE_PANEL_HOST_KEY,
          SIDE_PANEL_CONTEXTUAL_TABS_KEY,
          SIDE_PANEL_OPEN_TABS_KEY,
          SIDE_PANEL_ARMED_WINDOWS_KEY,
        ]);
        for (const id of data[SIDE_PANEL_CONTEXTUAL_TABS_KEY] ?? []) {
          if (typeof id === 'number') contextualSidePanelTabIds.add(id);
        }
        for (const id of data[SIDE_PANEL_OPEN_TABS_KEY] ?? []) {
          if (typeof id === 'number') openContextualSidePanelTabIds.add(id);
        }
        for (const id of data[SIDE_PANEL_ARMED_WINDOWS_KEY] ?? []) {
          if (typeof id === 'number') armedContextualSidePanelWindowIds.add(id);
        }
        const host = data[SIDE_PANEL_HOST_KEY];
        if (typeof host?.tabId === 'number' && typeof host?.windowId === 'number') {
          lastSidePanelHost = { tabId: host.tabId, windowId: host.windowId };
        }
      } catch {
        /* ignore */
      } finally {
        sidePanelStateHydrated = true;
      }
    })();
  }
  return sidePanelStateLoad;
}

function showDashboardSidePanelFeedback(tabId) {
  if (typeof tabId !== 'number') return;
  const title = 'Homebase dashboard is already open; use the side panel on another tab';
  chrome.action.setBadgeText({ tabId, text: 'APP' }).catch(() => {});
  chrome.action.setTitle({ tabId, title }).catch(() => {});
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    chrome.action.setTitle({ tabId, title: 'Open Homebase' }).catch(() => {});
  }, 1_800);
}

async function openOrFocusHomebaseDashboard(windowId) {
  const dashboardUrl = chrome.runtime.getURL('index.html');
  try {
    const tabs = await chrome.tabs.query({});
    const dashboards = tabs.filter((tab) => {
      if (typeof tab.id !== 'number' || typeof tab.url !== 'string') return false;
      try {
        const candidate = new URL(tab.url);
        const dashboard = new URL(dashboardUrl);
        return candidate.origin === dashboard.origin && candidate.pathname === dashboard.pathname;
      } catch {
        return false;
      }
    });
    const existing =
      dashboards.find((tab) => tab.windowId === windowId) ?? dashboards[0];
    if (existing?.id != null) {
      if (typeof existing.windowId === 'number') {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
      await chrome.tabs.update(existing.id, { active: true });
      return;
    }
    await chrome.tabs.create({ url: dashboardUrl, active: true, windowId });
  } catch (error) {
    console.warn('[side-panel] could not open Homebase dashboard:', error);
  }
}

function rememberKnownTab(tab) {
  if (typeof tab?.id !== 'number') return;
  knownBrowserTabs.set(tab.id, {
    id: tab.id,
    windowId: tab.windowId,
    url: tab.url,
  });
}

const knownBrowserTabsLoad = chrome.tabs
  .query({})
  .then((tabs) => {
    for (const tab of tabs) rememberKnownTab(tab);
  })
  .catch(() => {})
  .finally(() => {
    knownBrowserTabsHydrated = true;
  });

// State hydration and tab discovery are read-only and safe during reload.
void loadSidePanelState();

function reportContextualPanelResults(results) {
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[side-panel] contextual operation failed:', result.reason);
    }
  }
}

function configureAndOpenContextualTabsFromGesture(tabs, actionTabId) {
  const eligible = tabs.filter(
    (tab) =>
      typeof tab.id === 'number' &&
      typeof tab.windowId === 'number' &&
      isSidePanelEligibleUrl(tab.url)
  );
  if (!eligible.some((tab) => tab.id === actionTabId)) return [];

  // Invoke every configure/open call directly from the toolbar event. Do not
  // await between them: sidePanel.open requires the original user gesture.
  const configuring = eligible.map((tab) =>
    chrome.sidePanel.setOptions({
      tabId: tab.id,
      enabled: true,
      path: sidePanelPathForTab(tab.id),
    })
  );
  const ordered = [
    ...eligible.filter((tab) => tab.id === actionTabId),
    ...eligible.filter((tab) => tab.id !== actionTabId),
  ];
  const opening = ordered.map((tab) => chrome.sidePanel.open({ tabId: tab.id }));
  void Promise.allSettled([...configuring, ...opening]).then(reportContextualPanelResults);
  return eligible;
}

async function finishContextualSidePanelArm(windowId, tabs) {
  await loadSidePanelState();
  armedContextualSidePanelWindowIds.add(windowId);
  for (const tab of tabs) {
    if (typeof tab.id === 'number') contextualSidePanelTabIds.add(tab.id);
  }
  await persistSidePanelState();
}

function handleSidePanelActionClick(tab) {
  const { id: tabId, windowId, url } = tab;
  if (typeof tabId !== 'number' || typeof windowId !== 'number') return;
  if (isExtensionManagementUrl(url)) {
    void openOrFocusHomebaseDashboard(windowId);
    return;
  }
  if (!isSidePanelEligibleUrl(url)) {
    showDashboardSidePanelFeedback(tabId);
    return;
  }

  sidePanelLifecycleBlocked = false;
  rememberKnownTab(tab);

  if (sidePanelStateHydrated && knownBrowserTabsHydrated) {
    const firstArm = !armedContextualSidePanelWindowIds.has(windowId);
    const targets = firstArm
      ? [...knownBrowserTabs.values()].filter((candidate) => candidate.windowId === windowId)
      : [tab];
    const configured = configureAndOpenContextualTabsFromGesture(targets, tabId);
    void finishContextualSidePanelArm(windowId, configured);
    return;
  }

  // A cold service worker must still open the clicked tab synchronously. Once
  // read-only state settles, a genuinely first arm makes a best-effort cohort
  // call; Chrome may reject inactive-tab opens if it no longer retains gesture.
  const current = configureAndOpenContextualTabsFromGesture([tab], tabId);
  void Promise.all([loadSidePanelState(), knownBrowserTabsLoad]).then(() => {
    const firstArm = !armedContextualSidePanelWindowIds.has(windowId);
    if (!firstArm) {
      void finishContextualSidePanelArm(windowId, current);
      return;
    }
    const cohort = [...knownBrowserTabs.values()].filter(
      (candidate) => candidate.windowId === windowId
    );
    const configured = configureAndOpenContextualTabsFromGesture(cohort, tabId);
    void finishContextualSidePanelArm(windowId, configured);
  });
}

async function rememberOpenedContextualSidePanel(info) {
  if (typeof info.tabId !== 'number') return;
  await loadSidePanelState();
  contextualSidePanelTabIds.add(info.tabId);
  openContextualSidePanelTabIds.add(info.tabId);
  lastSidePanelHost = { tabId: info.tabId, windowId: info.windowId };
  await persistSidePanelState();
}

async function forgetClosedContextualSidePanel(info) {
  if (typeof info.tabId !== 'number') return;
  await loadSidePanelState();
  if (!temporarilyDisabledSidePanelTabIds.has(info.tabId)) {
    openContextualSidePanelTabIds.delete(info.tabId);
  }
  if (lastSidePanelHost?.tabId === info.tabId) lastSidePanelHost = null;
  await persistSidePanelState();
}

async function readSidePanelHostTabId() {
  await loadSidePanelState();

  // Each contextual panel remains pinned to its owning tab. Only the active
  // tab's visible instance may host authenticated browser-session fetching.
  try {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (
      typeof active?.id === 'number' &&
      typeof active?.windowId === 'number' &&
      openContextualSidePanelTabIds.has(active.id)
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
  void rememberOpenedContextualSidePanel(info);
});

chrome.sidePanel.onClosed.addListener((info) => {
  void forgetClosedContextualSidePanel(info);
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  void (async () => {
    await loadSidePanelState();
    if (!openContextualSidePanelTabIds.has(tabId)) return;
    lastSidePanelHost = { tabId, windowId };
    await persistSidePanelState();
  })();
});

chrome.tabs.onCreated.addListener((tab) => {
  rememberKnownTab(tab);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  rememberKnownTab(tab);
  const url = changeInfo.url ?? (changeInfo.status === 'complete' ? tab?.url : undefined);
  if (typeof url !== 'string' || typeof tab?.windowId !== 'number') return;
  setTimeout(() => {
    void (async () => {
      if (sidePanelLifecycleBlocked) return;
      await loadSidePanelState();
      if (!contextualSidePanelTabIds.has(tabId)) return;
      try {
        if (isSidePanelEligibleUrl(url)) {
          await chrome.sidePanel.setOptions({
            tabId,
            enabled: true,
            path: sidePanelPathForTab(tabId),
          });
          temporarilyDisabledSidePanelTabIds.delete(tabId);
        } else {
          temporarilyDisabledSidePanelTabIds.add(tabId);
          await chrome.sidePanel.setOptions({ tabId, enabled: false });
        }
      } catch (error) {
        console.warn('[side-panel] could not follow tab navigation:', error);
      }
    })();
  }, SIDE_PANEL_NAVIGATION_SYNC_DELAY_MS);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  knownBrowserTabs.delete(tabId);
  contextualSidePanelTabIds.delete(tabId);
  openContextualSidePanelTabIds.delete(tabId);
  temporarilyDisabledSidePanelTabIds.delete(tabId);
  if (lastSidePanelHost?.tabId === tabId) {
    lastSidePanelHost = null;
  }
  void persistSidePanelState();
  void pausePipelinesOwnedByTab(tabId);
});

chrome.windows.onRemoved.addListener((windowId) => {
  armedContextualSidePanelWindowIds.delete(windowId);
  if (lastSidePanelHost?.windowId === windowId) lastSidePanelHost = null;
  void persistSidePanelState();
});

chrome.action.onClicked.addListener(handleSidePanelActionClick);

chrome.runtime.onInstalled.addListener((details) => {
  // Do not touch native side-panel state during install/update/reload. The next
  // explicit toolbar gesture is the only operation allowed to unblock it.
  sidePanelLifecycleBlocked = true;
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
  sidePanelLifecycleBlocked = true;
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
        if (message.action !== 'extract' && message.action !== 'fetch-pdf') {
          sendResponse({ ok: false, error: 'Unknown browser-fetch action' });
          return;
        }
        const input = {
          ...message,
          sidePanelHostTabId: await readSidePanelHostTabId(),
        };
        sendResponse(message.action === 'fetch-pdf'
          ? await browserFetchService.fetchPdf(input)
          : await browserFetchService.extract(input));
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
