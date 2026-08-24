import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const rawSource = readFileSync(
  new URL('../../../public/service-worker.js', import.meta.url),
  'utf8'
);
const source = rawSource.replace(
  /const OFFSCREEN_PROTOCOL_PROBE_DELAYS_MS = \[[^;]+;/,
  'const OFFSCREEN_PROTOCOL_PROBE_DELAYS_MS = [0, 0, 0, 0, 0];'
).replace(
  'const SIDE_PANEL_NAVIGATION_SYNC_DELAY_MS = 250;',
  'const SIDE_PANEL_NAVIGATION_SYNC_DELAY_MS = 0;'
);
const currentProtocolVersion = Number(
  rawSource.match(/const DB_OWNER_PROTOCOL_VERSION = (\d+);/)?.[1]
);

type ProtocolReply = {
  version: number;
  coreVersion?: number;
  contentVersion?: number;
  generation?: string;
  pipelineActiveJobId?: string | null;
};

function loadServiceWorker(options: {
  protocolReply: (created: boolean) => ProtocolReply | Promise<ProtocolReply>;
  activeTab?: { id: number; windowId: number; url?: string };
  existingTabs?: Array<{ id: number; windowId: number; url?: string }>;
}) {
  let offscreenExists = true;
  let created = false;
  const currentOffscreenGeneration =
    'chrome-extension://test-extension/assets/offscreen-current.js';
  const runtimeListeners: Array<(
    message: Record<string, unknown>,
    sender: Record<string, unknown>,
    sendResponse: (response: unknown) => void
  ) => boolean | void> = [];
  const installedListeners: Array<(details: { reason: string }) => void> = [];
  const actionClickedListeners: Array<(
    tab: { id?: number; windowId?: number; url?: string }
  ) => void> = [];
  const sidePanelOpenedListeners: Array<(info: { windowId: number; tabId?: number }) => void> = [];
  const sidePanelClosedListeners: Array<(info: { windowId: number; tabId?: number }) => void> = [];
  const tabActivatedListeners: Array<(info: { tabId: number; windowId: number }) => void> = [];
  const tabCreatedListeners: Array<(
    tab: { id?: number; windowId?: number; url?: string }
  ) => void> = [];
  const tabUpdatedListeners: Array<(
    tabId: number,
    changeInfo: { url?: string },
    tab: { id?: number; windowId?: number; url?: string }
  ) => void> = [];
  const closeDocument = vi.fn(async () => {
    offscreenExists = false;
  });
  const createDocument = vi.fn(async () => {
    offscreenExists = true;
    created = true;
  });
  const setPanelBehavior = vi.fn(async () => {});
  const closeSidePanel = vi.fn(async () => {});
  const openSidePanel = vi.fn(async () => {});
  const tabPanelOptions = new Map<number, { enabled?: boolean; path?: string }>();
  const getSidePanelOptions = vi.fn(async ({ tabId }: { tabId: number }) =>
    tabPanelOptions.get(tabId) ?? {
      enabled: true,
      path: 'index.html?surface=side-panel&hostTabId=42',
    }
  );
  const setSidePanelOptions = vi.fn(async (
    next: { tabId: number; enabled?: boolean; path?: string }
  ) => {
    tabPanelOptions.set(next.tabId, {
      ...(tabPanelOptions.get(next.tabId) ?? {}),
      ...next,
    });
  });
  const extract = vi.fn(async () => ({ ok: true }));
  const fetchPdf = vi.fn(async () => ({ ok: true, base64: 'JVBERg==' }));
  const setBadgeText = vi.fn(async () => {});
  const setActionTitle = vi.fn(async () => {});
  const createTab = vi.fn(async () => ({}));
  const updateTab = vi.fn(async () => ({}));
  const updateWindow = vi.fn(async () => ({}));
  const sessionValues: Record<string, unknown> = {};
  const sessionSet = vi.fn(async (values: Record<string, unknown>) => {
    Object.assign(sessionValues, values);
  });
  const runtimeSendMessage = vi.fn(async (message: Record<string, unknown>) => {
    if (message.target === 'db-owner-control') {
      return {
        generation: currentOffscreenGeneration,
        ...(await options.protocolReply(created)),
      };
    }
    if (message.target === 'db-owner') return { id: message.id, ok: true, result: 'pong' };
    if (message.target === 'pipeline-offscreen-owner') return { ok: true, active: false };
    return undefined;
  });
  const fetchRuntime = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () =>
      '<script type="module" crossorigin src="./assets/offscreen-current.js"></script>',
  }));

  const event = () => ({ addListener: vi.fn() });
  const chrome = {
    runtime: {
      id: 'test-extension',
      getURL: (path: string) => `chrome-extension://test-extension/${path}`,
      getContexts: async () => offscreenExists ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : [],
      sendMessage: runtimeSendMessage,
      onMessage: { addListener: (listener: typeof runtimeListeners[number]) => runtimeListeners.push(listener) },
      onInstalled: { addListener: (listener: typeof installedListeners[number]) => installedListeners.push(listener) },
      onStartup: event(),
    },
    offscreen: {
      hasDocument: async () => offscreenExists,
      closeDocument,
      createDocument,
    },
    sidePanel: {
      setPanelBehavior,
      close: closeSidePanel,
      open: openSidePanel,
      getOptions: getSidePanelOptions,
      setOptions: setSidePanelOptions,
      onOpened: { addListener: (listener: typeof sidePanelOpenedListeners[number]) => sidePanelOpenedListeners.push(listener) },
      onClosed: { addListener: (listener: typeof sidePanelClosedListeners[number]) => sidePanelClosedListeners.push(listener) },
    },
    action: {
      setBadgeText,
      setTitle: setActionTitle,
      onClicked: {
        addListener: (listener: typeof actionClickedListeners[number]) =>
          actionClickedListeners.push(listener),
      },
    },
    tabs: {
      onRemoved: event(),
      onActivated: { addListener: (listener: typeof tabActivatedListeners[number]) => tabActivatedListeners.push(listener) },
      onCreated: { addListener: (listener: typeof tabCreatedListeners[number]) => tabCreatedListeners.push(listener) },
      onUpdated: { addListener: (listener: typeof tabUpdatedListeners[number]) => tabUpdatedListeners.push(listener) },
      query: async (query: { active?: boolean; windowId?: number }) => {
        if (query.active) {
          if (!options.activeTab) return [];
          if (typeof query.windowId === 'number' && query.windowId !== options.activeTab.windowId) return [];
          return [options.activeTab];
        }
        const tabs = options.existingTabs ?? (options.activeTab ? [options.activeTab] : []);
        return typeof query.windowId === 'number'
          ? tabs.filter((tab) => tab.windowId === query.windowId)
          : tabs;
      },
      get: async (tabId: number) =>
        (options.existingTabs ?? (options.activeTab ? [options.activeTab] : []))
          .find((tab) => tab.id === tabId) ?? {},
      create: createTab,
      update: updateTab,
    },
    windows: { update: updateWindow, onRemoved: event() },
    alarms: { create: vi.fn(), onAlarm: event() },
    storage: {
      session: { get: async () => sessionValues, set: sessionSet },
      local: { set: async () => {} },
    },
  };
  const isolatedGlobal = {
    HomebaseBrowserFetchService: {
      createBrowserFetchService: () => ({
        cancel: async () => ({ ok: true }),
        extract,
        fetchPdf,
      }),
    },
    HomebaseAcquisitionV2BrowserService: {
      createAcquisitionV2BrowserService: () => ({
        cancel: async () => ({ ok: true }),
        capture: async () => ({ ok: true, evidence: { frames: [] } }),
        readDocument: async () => ({ ok: true, base64: 'JVBERg==' }),
      }),
    },
  };
  const evaluate = new Function('chrome', 'importScripts', 'globalThis', 'fetch', source);
  evaluate(chrome, () => {}, isolatedGlobal, fetchRuntime);

  async function pingDbOwner(): Promise<unknown> {
    const listener = runtimeListeners[0];
    return new Promise((resolve, reject) => {
      const handled = listener(
        { target: 'db-rpc', id: 1, method: 'ping', args: [] },
        {},
        resolve
      );
      if (handled !== true) reject(new Error('DB RPC was not handled asynchronously'));
    });
  }

  async function requestBrowserExtract(): Promise<unknown> {
    const listener = runtimeListeners[0];
    return new Promise((resolve, reject) => {
      const handled = listener(
        { target: 'browser-fetch-service', action: 'extract', requestId: 'fetch-1' },
        {},
        resolve
      );
      if (handled !== true) reject(new Error('Browser extract was not handled asynchronously'));
    });
  }

  async function requestBrowserPdf(): Promise<unknown> {
    const listener = runtimeListeners[0];
    return new Promise((resolve, reject) => {
      const handled = listener(
        { target: 'browser-fetch-service', action: 'fetch-pdf', requestId: 'pdf-1' },
        {},
        resolve
      );
      if (handled !== true) reject(new Error('Browser PDF fetch was not handled asynchronously'));
    });
  }

  async function startPipelineJob(): Promise<unknown> {
    const listener = runtimeListeners[0];
    return new Promise((resolve, reject) => {
      const handled = listener(
        {
          target: 'pipeline-offscreen',
          action: 'start-job',
          requestId: 'pipeline-test',
          itemIds: ['item-1'],
          options: {},
        },
        { tab: { id: 1, windowId: 1 } },
        resolve
      );
      if (handled !== true) reject(new Error('Pipeline request was not handled asynchronously'));
    });
  }

  async function requestPipelineRuntimeRestart(): Promise<unknown> {
    const listener = runtimeListeners[0];
    return new Promise((resolve, reject) => {
      const handled = listener(
        { type: 'pipeline-runtime-restart-required', requestId: 'pipeline-test' },
        {},
        resolve
      );
      if (handled !== true) reject(new Error('Runtime restart was not handled asynchronously'));
    });
  }

  return {
    actionClickedListeners,
    closeDocument,
    closeSidePanel,
    createTab,
    openSidePanel,
    createDocument,
    installedListeners,
    extract,
    fetchPdf,
    pingDbOwner,
    requestBrowserExtract,
    requestBrowserPdf,
    startPipelineJob,
    requestPipelineRuntimeRestart,
    runtimeSendMessage,
    sessionSet,
    sessionValues,
    setActionTitle,
    setBadgeText,
    getSidePanelOptions,
    setPanelBehavior,
    fetchRuntime,
    setSidePanelOptions,
    sidePanelClosedListeners,
    sidePanelOpenedListeners,
    tabActivatedListeners,
    tabCreatedListeners,
    tabUpdatedListeners,
    updateTab,
    updateWindow,
  };
}

describe('service-worker owner lifecycle', () => {
  it('reuses a current retained owner', async () => {
    const worker = loadServiceWorker({
      protocolReply: () => ({
        version: currentProtocolVersion,
        coreVersion: currentProtocolVersion,
        contentVersion: currentProtocolVersion,
      }),
    });
    await expect(worker.pingDbOwner()).resolves.toMatchObject({ ok: true, result: 'pong' });
    expect(worker.closeDocument).not.toHaveBeenCalled();
    expect(worker.createDocument).not.toHaveBeenCalled();
  });

  it('replaces an idle retained owner from an older built module generation before a new job', async () => {
    const worker = loadServiceWorker({
      protocolReply: (created) => ({
        version: currentProtocolVersion,
        coreVersion: currentProtocolVersion,
        contentVersion: currentProtocolVersion,
        generation: created
          ? 'chrome-extension://test-extension/assets/offscreen-current.js'
          : 'chrome-extension://test-extension/assets/offscreen-old.js',
        pipelineActiveJobId: null,
      }),
    });

    await expect(worker.startPipelineJob()).resolves.toMatchObject({ ok: true });
    expect(worker.closeDocument).toHaveBeenCalledTimes(1);
    expect(worker.createDocument).toHaveBeenCalledTimes(1);
  });

  it('does not interrupt an active durable stage solely to replace its runtime generation', async () => {
    const worker = loadServiceWorker({
      protocolReply: () => ({
        version: currentProtocolVersion,
        coreVersion: currentProtocolVersion,
        contentVersion: currentProtocolVersion,
        generation: 'chrome-extension://test-extension/assets/offscreen-old.js',
        pipelineActiveJobId: 'active-job',
      }),
    });

    await expect(worker.startPipelineJob()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('finishing a durable stage'),
    });
    expect(worker.closeDocument).not.toHaveBeenCalled();
    expect(worker.createDocument).not.toHaveBeenCalled();
  });

  it('replaces the coordinator and asks the fresh runtime to recover a safely requeued stage', async () => {
    const worker = loadServiceWorker({
      protocolReply: () => ({
        version: currentProtocolVersion,
        coreVersion: currentProtocolVersion,
        contentVersion: currentProtocolVersion,
      }),
    });

    await expect(worker.requestPipelineRuntimeRestart()).resolves.toMatchObject({ ok: true });
    expect(worker.closeDocument).toHaveBeenCalledTimes(1);
    expect(worker.createDocument).toHaveBeenCalledTimes(1);
    expect(worker.runtimeSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      target: 'pipeline-offscreen-owner',
      action: 'recover',
    }));
  });

  it('replaces an explicitly incompatible owner once', async () => {
    const worker = loadServiceWorker({
      protocolReply: (created) => created
        ? {
            version: currentProtocolVersion,
            coreVersion: currentProtocolVersion,
            contentVersion: currentProtocolVersion,
          }
        : { version: 0, coreVersion: currentProtocolVersion - 1, contentVersion: currentProtocolVersion },
    });
    await expect(worker.pingDbOwner()).resolves.toMatchObject({ ok: true, result: 'pong' });
    expect(worker.closeDocument).toHaveBeenCalledTimes(1);
    expect(worker.createDocument).toHaveBeenCalledTimes(1);
  });

  it('does not destroy an owner whose startup probe is unavailable', async () => {
    const worker = loadServiceWorker({
      protocolReply: async () => {
        throw new Error('receiving end does not exist');
      },
    });
    await expect(worker.pingDbOwner()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('DB owner is still starting'),
    });
    expect(worker.closeDocument).not.toHaveBeenCalled();
    expect(worker.createDocument).not.toHaveBeenCalled();
  });

  it('performs no native side-panel mutation during install/update', () => {
    const worker = loadServiceWorker({
      protocolReply: () => ({
        version: currentProtocolVersion,
        coreVersion: currentProtocolVersion,
        contentVersion: currentProtocolVersion,
      }),
    });
    worker.installedListeners[0]({ reason: 'update' });
    expect(worker.setPanelBehavior).not.toHaveBeenCalled();
    expect(worker.setSidePanelOptions).not.toHaveBeenCalled();
    expect(worker.openSidePanel).not.toHaveBeenCalled();
    expect(worker.closeSidePanel).not.toHaveBeenCalled();
    expect(worker.actionClickedListeners).toHaveLength(1);
    expect(worker.sidePanelOpenedListeners).toHaveLength(1);
    expect(worker.sidePanelClosedListeners).toHaveLength(1);
    expect(worker.tabActivatedListeners).toHaveLength(1);
    expect(worker.tabUpdatedListeners).toHaveLength(1);
    expect(worker.tabCreatedListeners).toHaveLength(1);
  });

  it('configures and opens only the eligible tabs present at the first icon click', async () => {
    const activeTab = { id: 42, windowId: 7, url: 'https://example.com/article' };
    const worker = loadServiceWorker({
      protocolReply: () => ({
        version: currentProtocolVersion,
        coreVersion: currentProtocolVersion,
        contentVersion: currentProtocolVersion,
      }),
      activeTab,
      existingTabs: [
        activeTab,
        { id: 43, windowId: 7, url: 'https://example.org/second' },
        { id: 44, windowId: 7, url: 'chrome-extension://test-extension/index.html' },
        { id: 45, windowId: 7, url: 'chrome://extensions/' },
      ],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    worker.actionClickedListeners[0](activeTab);

    expect(worker.setSidePanelOptions).toHaveBeenCalledWith({
      tabId: 42,
      enabled: true,
      path: 'index.html?surface=side-panel&hostTabId=42',
    });
    expect(worker.setSidePanelOptions).toHaveBeenCalledWith({
      tabId: 43,
      enabled: true,
      path: 'index.html?surface=side-panel&hostTabId=43',
    });
    expect(worker.setSidePanelOptions).not.toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 44 })
    );
    expect(worker.setSidePanelOptions).not.toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 45 })
    );
    expect(worker.openSidePanel).toHaveBeenCalledWith({ tabId: 42 });
    expect(worker.openSidePanel).toHaveBeenCalledWith({ tabId: 43 });
    await vi.waitFor(() => expect(worker.sessionValues).toMatchObject({
      armedContextualSidePanelWindowIds: [7],
    }));
    expect(worker.sessionValues.contextualSidePanelTabIds).toEqual(
      expect.arrayContaining([42, 43])
    );
  });

  it('opens the dashboard instead of attaching a panel to chrome extension management', async () => {
    const managementTab = { id: 45, windowId: 7, url: 'chrome://extensions/' };
    const worker = loadServiceWorker({
      protocolReply: () => ({
        version: currentProtocolVersion,
        coreVersion: currentProtocolVersion,
        contentVersion: currentProtocolVersion,
      }),
      activeTab: managementTab,
      existingTabs: [managementTab],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    worker.actionClickedListeners[0](managementTab);
    await vi.waitFor(() => expect(worker.createTab).toHaveBeenCalledWith({
      url: 'chrome-extension://test-extension/index.html',
      active: true,
      windowId: 7,
    }));

    expect(worker.setSidePanelOptions).not.toHaveBeenCalled();
    expect(worker.openSidePanel).not.toHaveBeenCalled();
  });

  it('focuses an existing dashboard from chrome extension management', async () => {
    const managementTab = { id: 45, windowId: 7, url: 'chrome://extensions/?id=test-extension' };
    const dashboardTab = {
      id: 46,
      windowId: 8,
      url: 'chrome-extension://test-extension/index.html?view=home',
    };
    const worker = loadServiceWorker({
      protocolReply: () => ({
        version: currentProtocolVersion,
        coreVersion: currentProtocolVersion,
        contentVersion: currentProtocolVersion,
      }),
      activeTab: managementTab,
      existingTabs: [managementTab, dashboardTab],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    worker.actionClickedListeners[0](managementTab);
    await vi.waitFor(() => expect(worker.updateWindow).toHaveBeenCalledWith(8, { focused: true }));
    expect(worker.updateTab).toHaveBeenCalledWith(46, { active: true });
    expect(worker.createTab).not.toHaveBeenCalled();
    expect(worker.setSidePanelOptions).not.toHaveBeenCalled();
    expect(worker.openSidePanel).not.toHaveBeenCalled();
  });

  it('does not arm or open when the icon is clicked on the dashboard', async () => {
    const dashboard = {
      id: 51,
      windowId: 7,
      url: 'chrome-extension://test-extension/index.html',
    };
    const worker = loadServiceWorker({
      protocolReply: () => ({
        version: currentProtocolVersion,
        coreVersion: currentProtocolVersion,
        contentVersion: currentProtocolVersion,
      }),
      activeTab: dashboard,
    });
    await Promise.resolve();
    worker.actionClickedListeners[0](dashboard);

    expect(worker.openSidePanel).not.toHaveBeenCalled();
    expect(worker.setSidePanelOptions).not.toHaveBeenCalled();
    expect(worker.setBadgeText).toHaveBeenCalledWith({ tabId: 51, text: 'APP' });
    expect(worker.sessionValues.armedContextualSidePanelWindowIds ?? []).toEqual([]);
  });

  it('keeps cohort membership when native close hides only one contextual tab', async () => {
    const activeTab = { id: 42, windowId: 7, url: 'https://example.com/article' };
    const worker = loadServiceWorker({
      protocolReply: () => ({
        version: currentProtocolVersion,
        coreVersion: currentProtocolVersion,
        contentVersion: currentProtocolVersion,
      }),
      activeTab,
      existingTabs: [
        activeTab,
        { id: 43, windowId: 7, url: 'https://example.org/second' },
      ],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    worker.actionClickedListeners[0](activeTab);
    worker.sidePanelOpenedListeners[0]({ windowId: 7, tabId: 42 });
    worker.sidePanelOpenedListeners[0]({ windowId: 7, tabId: 43 });
    await vi.waitFor(() => expect(worker.sessionValues.openContextualSidePanelTabIds).toEqual(
      expect.arrayContaining([42, 43])
    ));

    worker.sidePanelClosedListeners[0]({ windowId: 7, tabId: 42 });
    await vi.waitFor(() => expect(worker.sessionValues.openContextualSidePanelTabIds).toEqual([43]));
    expect(worker.sessionValues.contextualSidePanelTabIds).toEqual(
      expect.arrayContaining([42, 43])
    );
    expect(worker.closeSidePanel).not.toHaveBeenCalled();
  });

  it('leaves later tabs untouched until their own icon click', async () => {
    const activeTab = { id: 42, windowId: 7, url: 'https://example.com/article' };
    const worker = loadServiceWorker({
      protocolReply: () => ({
        version: currentProtocolVersion,
        coreVersion: currentProtocolVersion,
        contentVersion: currentProtocolVersion,
      }),
      activeTab,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    worker.actionClickedListeners[0](activeTab);
    await vi.waitFor(() => expect(worker.sessionValues.armedContextualSidePanelWindowIds).toEqual([7]));
    worker.setSidePanelOptions.mockClear();
    worker.openSidePanel.mockClear();

    const laterTab = { id: 60, windowId: 7, url: 'https://new.example/' };
    worker.tabCreatedListeners[0](laterTab);
    expect(worker.setSidePanelOptions).not.toHaveBeenCalled();
    expect(worker.openSidePanel).not.toHaveBeenCalled();

    worker.actionClickedListeners[0](laterTab);
    expect(worker.setSidePanelOptions).toHaveBeenCalledWith({
      tabId: 60,
      enabled: true,
      path: 'index.html?surface=side-panel&hostTabId=60',
    });
    expect(worker.openSidePanel).toHaveBeenCalledWith({ tabId: 60 });
  });

  it('blocks navigation mutations during reload and allows them after a toolbar gesture', async () => {
    const activeTab = { id: 42, windowId: 7, url: 'https://example.com/article' };
    const worker = loadServiceWorker({
      protocolReply: () => ({
        version: currentProtocolVersion,
        coreVersion: currentProtocolVersion,
        contentVersion: currentProtocolVersion,
      }),
      activeTab,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    worker.installedListeners[0]({ reason: 'update' });

    worker.tabUpdatedListeners[0](
      42,
      { url: 'chrome-extension://test-extension/index.html' },
      { ...activeTab, url: 'chrome-extension://test-extension/index.html' }
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(worker.setSidePanelOptions).not.toHaveBeenCalled();

    worker.actionClickedListeners[0](activeTab);
    await vi.waitFor(() => expect(worker.sessionValues.armedContextualSidePanelWindowIds).toEqual([7]));
    worker.setSidePanelOptions.mockClear();
    worker.tabUpdatedListeners[0](
      42,
      { url: 'chrome-extension://test-extension/index.html' },
      { ...activeTab, url: 'chrome-extension://test-extension/index.html' }
    );
    await vi.waitFor(() => expect(worker.setSidePanelOptions).toHaveBeenLastCalledWith({
      tabId: 42,
      enabled: false,
    }));

    worker.tabUpdatedListeners[0](
      42,
      { url: 'https://example.com/returned' },
      { ...activeTab, url: 'https://example.com/returned' }
    );
    await vi.waitFor(() => expect(worker.setSidePanelOptions).toHaveBeenLastCalledWith({
      tabId: 42,
      enabled: true,
      path: 'index.html?surface=side-panel&hostTabId=42',
    }));
  });

  it('resolves authenticated fetching to the active open contextual tab', async () => {
    const worker = loadServiceWorker({
      protocolReply: () => ({
        version: currentProtocolVersion,
        coreVersion: currentProtocolVersion,
        contentVersion: currentProtocolVersion,
      }),
      activeTab: { id: 42, windowId: 7, url: 'https://example.com/article' },
    });
    worker.sidePanelOpenedListeners[0]({ windowId: 7, tabId: 42 });
    await vi.waitFor(() => expect(worker.sessionSet).toHaveBeenCalled());
    await expect(worker.requestBrowserExtract()).resolves.toMatchObject({ ok: true });
    expect(worker.extract).toHaveBeenCalledWith(expect.objectContaining({
      sidePanelHostTabId: 42,
    }));
    await expect(worker.requestBrowserPdf()).resolves.toMatchObject({ ok: true });
    expect(worker.fetchPdf).toHaveBeenCalledWith(expect.objectContaining({
      sidePanelHostTabId: 42,
    }));
  });
});
