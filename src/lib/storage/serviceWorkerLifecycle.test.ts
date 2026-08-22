import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const rawSource = readFileSync(
  new URL('../../../public/service-worker.js', import.meta.url),
  'utf8'
);
const source = rawSource.replace(
  /const OFFSCREEN_PROTOCOL_PROBE_DELAYS_MS = \[[^;]+;/,
  'const OFFSCREEN_PROTOCOL_PROBE_DELAYS_MS = [0, 0, 0, 0, 0];'
);
const currentProtocolVersion = Number(
  rawSource.match(/const DB_OWNER_PROTOCOL_VERSION = (\d+);/)?.[1]
);

type ProtocolReply = {
  version: number;
  coreVersion?: number;
  contentVersion?: number;
};

function loadServiceWorker(options: {
  protocolReply: (created: boolean) => ProtocolReply | Promise<ProtocolReply>;
  activeTab?: { id: number; windowId: number; url?: string };
}) {
  let offscreenExists = true;
  let created = false;
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
  const tabPanelOptions = new Map<number, { enabled?: boolean; path?: string }>();
  const getSidePanelOptions = vi.fn(async ({ tabId }: { tabId: number }) =>
    tabPanelOptions.get(tabId) ?? {
      enabled: true,
      path: 'index.html?surface=side-panel',
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
  const sessionValues: Record<string, unknown> = {};
  const sessionSet = vi.fn(async (values: Record<string, unknown>) => {
    Object.assign(sessionValues, values);
  });
  const runtimeSendMessage = vi.fn(async (message: Record<string, unknown>) => {
    if (message.target === 'db-owner-control') return options.protocolReply(created);
    if (message.target === 'db-owner') return { id: message.id, ok: true, result: 'pong' };
    return undefined;
  });

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
      getOptions: getSidePanelOptions,
      setOptions: setSidePanelOptions,
      onOpened: { addListener: (listener: typeof sidePanelOpenedListeners[number]) => sidePanelOpenedListeners.push(listener) },
      onClosed: { addListener: (listener: typeof sidePanelClosedListeners[number]) => sidePanelClosedListeners.push(listener) },
    },
    action: {
      onClicked: {
        addListener: (listener: typeof actionClickedListeners[number]) =>
          actionClickedListeners.push(listener),
      },
    },
    tabs: {
      onRemoved: event(),
      onActivated: { addListener: (listener: typeof tabActivatedListeners[number]) => tabActivatedListeners.push(listener) },
      onUpdated: { addListener: (listener: typeof tabUpdatedListeners[number]) => tabUpdatedListeners.push(listener) },
      query: async (query: { windowId?: number }) => {
        if (!options.activeTab) return [];
        if (typeof query.windowId === 'number' && query.windowId !== options.activeTab.windowId) return [];
        return [options.activeTab];
      },
      get: async (tabId: number) => options.activeTab?.id === tabId ? options.activeTab : {},
      update: async () => ({}),
    },
    windows: { update: async () => ({}) },
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
      }),
    },
  };
  const evaluate = new Function('chrome', 'importScripts', 'globalThis', source);
  evaluate(chrome, () => {}, isolatedGlobal);

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

  return {
    actionClickedListeners,
    closeDocument,
    closeSidePanel,
    createDocument,
    installedListeners,
    extract,
    pingDbOwner,
    requestBrowserExtract,
    runtimeSendMessage,
    sessionSet,
    getSidePanelOptions,
    setPanelBehavior,
    setSidePanelOptions,
    sidePanelClosedListeners,
    sidePanelOpenedListeners,
    tabActivatedListeners,
    tabUpdatedListeners,
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

  it('initializes native toolbar toggling for a pure contextual panel', async () => {
    const worker = loadServiceWorker({
      protocolReply: () => ({
        version: currentProtocolVersion,
        coreVersion: currentProtocolVersion,
        contentVersion: currentProtocolVersion,
      }),
      activeTab: { id: 42, windowId: 7, url: 'https://example.com/article' },
    });
    worker.installedListeners[0]({ reason: 'update' });
    await vi.waitFor(() => expect(worker.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    }));
    await vi.waitFor(() => expect(worker.setSidePanelOptions).toHaveBeenCalledWith({
      tabId: 42,
      enabled: true,
      path: 'index.html?surface=side-panel',
    }));
    expect(worker.closeSidePanel).not.toHaveBeenCalled();
    expect(worker.actionClickedListeners).toHaveLength(0);
    expect(worker.sidePanelOpenedListeners).toHaveLength(1);
    expect(worker.sidePanelClosedListeners).toHaveLength(1);
    expect(worker.tabActivatedListeners).toHaveLength(1);
    expect(worker.tabUpdatedListeners).toHaveLength(1);
  });

  it('hides the contextual panel on Homebase without closing other tabs', async () => {
    const worker = loadServiceWorker({
      protocolReply: () => ({
        version: currentProtocolVersion,
        coreVersion: currentProtocolVersion,
        contentVersion: currentProtocolVersion,
      }),
      activeTab: { id: 51, windowId: 7, url: 'chrome://newtab/' },
    });
    worker.installedListeners[0]({ reason: 'update' });
    await vi.waitFor(() => expect(worker.setSidePanelOptions).toHaveBeenCalledWith({
      tabId: 51,
      enabled: false,
    }));
    expect(worker.closeSidePanel).not.toHaveBeenCalled();
  });

  it('updates eligibility when a tab navigates between dashboard and web content', async () => {
    const worker = loadServiceWorker({
      protocolReply: () => ({
        version: currentProtocolVersion,
        coreVersion: currentProtocolVersion,
        contentVersion: currentProtocolVersion,
      }),
    });
    worker.tabUpdatedListeners[0](
      42,
      { url: 'chrome://newtab/' },
      { id: 42, windowId: 7, url: 'chrome://newtab/' }
    );
    await vi.waitFor(() => expect(worker.setSidePanelOptions).toHaveBeenCalledWith({
      tabId: 42,
      enabled: false,
    }));

    worker.tabUpdatedListeners[0](
      42,
      { url: 'chrome://extensions/' },
      { id: 42, windowId: 7, url: 'chrome://extensions/' }
    );
    await vi.waitFor(() => expect(worker.setSidePanelOptions).toHaveBeenLastCalledWith({
      tabId: 42,
      enabled: true,
      path: 'index.html?surface=side-panel',
    }));
    expect(worker.closeSidePanel).not.toHaveBeenCalled();
  });

  it('resolves a contextual panel to its owning active tab', async () => {
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
  });
});
