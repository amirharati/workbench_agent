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

type ProtocolReply = {
  version: number;
  coreVersion?: number;
  contentVersion?: number;
};

function loadServiceWorker(options: {
  protocolReply: (created: boolean) => ProtocolReply | Promise<ProtocolReply>;
}) {
  let offscreenExists = true;
  let created = false;
  const runtimeListeners: Array<(
    message: Record<string, unknown>,
    sender: Record<string, unknown>,
    sendResponse: (response: unknown) => void
  ) => boolean | void> = [];
  const actionListeners: Array<(tab: { id?: number }) => void> = [];
  const closeDocument = vi.fn(async () => {
    offscreenExists = false;
  });
  const createDocument = vi.fn(async () => {
    offscreenExists = true;
    created = true;
  });
  const openSidePanel = vi.fn(async () => {});
  const setSidePanelOptions = vi.fn(async () => {});

  const event = () => ({ addListener: vi.fn() });
  const chrome = {
    runtime: {
      id: 'test-extension',
      getURL: (path: string) => `chrome-extension://test-extension/${path}`,
      getContexts: async () => offscreenExists ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : [],
      sendMessage: async (message: Record<string, unknown>) => {
        if (message.target === 'db-owner-control') return options.protocolReply(created);
        if (message.target === 'db-owner') return { id: message.id, ok: true, result: 'pong' };
        return undefined;
      },
      onMessage: { addListener: (listener: typeof runtimeListeners[number]) => runtimeListeners.push(listener) },
      onInstalled: event(),
      onStartup: event(),
    },
    offscreen: {
      hasDocument: async () => offscreenExists,
      closeDocument,
      createDocument,
    },
    sidePanel: {
      open: openSidePanel,
      setOptions: setSidePanelOptions,
    },
    action: { onClicked: { addListener: (listener: typeof actionListeners[number]) => actionListeners.push(listener) } },
    tabs: {
      onRemoved: event(),
      query: async () => [],
      get: async () => ({}),
      update: async () => ({}),
    },
    windows: { update: async () => ({}) },
    alarms: { create: vi.fn(), onAlarm: event() },
    storage: {
      session: { get: async () => ({}), set: async () => {} },
      local: { set: async () => {} },
    },
  };
  const isolatedGlobal = {
    HomebaseBrowserFetchService: {
      createBrowserFetchService: () => ({
        cancel: async () => ({ ok: true }),
        extract: async () => ({ ok: true }),
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

  return {
    actionListeners,
    closeDocument,
    createDocument,
    openSidePanel,
    pingDbOwner,
    setSidePanelOptions,
  };
}

describe('service-worker owner lifecycle', () => {
  it('reuses a current retained owner', async () => {
    const worker = loadServiceWorker({
      protocolReply: () => ({ version: 16, coreVersion: 16, contentVersion: 16 }),
    });
    await expect(worker.pingDbOwner()).resolves.toMatchObject({ ok: true, result: 'pong' });
    expect(worker.closeDocument).not.toHaveBeenCalled();
    expect(worker.createDocument).not.toHaveBeenCalled();
  });

  it('replaces an explicitly incompatible owner once', async () => {
    const worker = loadServiceWorker({
      protocolReply: (created) => created
        ? { version: 16, coreVersion: 16, contentVersion: 16 }
        : { version: 0, coreVersion: 15, contentVersion: 16 },
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

  it('opens the manifest panel without a setOptions race', () => {
    const worker = loadServiceWorker({
      protocolReply: () => ({ version: 16, coreVersion: 16, contentVersion: 16 }),
    });
    worker.actionListeners[0]({ id: 42 });
    expect(worker.openSidePanel).toHaveBeenCalledWith({ tabId: 42 });
    expect(worker.setSidePanelOptions).not.toHaveBeenCalled();
  });
});

