import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

type BrowserFetchService = {
  extract(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  fetchPdf(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  cancel(requestId: string): Promise<Record<string, unknown>>;
};

function loadFactory(): (chromeApi: unknown) => BrowserFetchService {
  const source = readFileSync(
    new URL('../../../public/browser-fetch-service.js', import.meta.url),
    'utf8'
  );
  const scope: Record<string, unknown> = {};
  new Function('globalThis', source)(scope);
  return (scope.HomebaseBrowserFetchService as {
    createBrowserFetchService(chromeApi: unknown): BrowserFetchService;
  }).createBrowserFetchService;
}

function eventHook() {
  const listeners = new Set<(...args: unknown[]) => void>();
  return {
    addListener: vi.fn((listener: (...args: unknown[]) => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: (...args: unknown[]) => void) => listeners.delete(listener)),
  };
}

function extractedBody() {
  return {
    ok: true,
    title: 'Private article',
    markdown: `# Private article\n\n${'authenticated content '.repeat(12)}`,
  };
}

describe('service-worker browser fetch capability', () => {
  it('downloads protected PDF bytes inside an authenticated same-origin page', async () => {
    const tab = { id: 31, url: 'https://openreview.net/forum?id=paper', status: 'complete' };
    const tabs = {
      query: vi.fn(async () => [tab]),
      get: vi.fn(async () => tab),
      create: vi.fn(),
      remove: vi.fn(async () => undefined),
      onUpdated: eventHook(),
      onRemoved: eventHook(),
    };
    const scripting = {
      executeScript: vi.fn(async () => [{
        result: {
          ok: true,
          base64: 'JVBERi0xLjQ=',
          contentType: 'application/pdf',
          finalUrl: 'https://openreview.net/pdf/paper.pdf',
        },
      }]),
    };
    const service = loadFactory()({ tabs, scripting });

    const result = await service.fetchPdf({
      requestId: 'protected-pdf',
      url: 'https://openreview.net/pdf/paper.pdf',
      allowEphemeral: true,
    });

    expect(result).toMatchObject({
      ok: true,
      base64: 'JVBERi0xLjQ=',
      fetchSourceId: 'tab-session-pdf',
    });
    expect(tabs.create).not.toHaveBeenCalled();
    expect(scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 31 },
      world: 'MAIN',
      args: ['https://openreview.net/pdf/paper.pdf', 25 * 1024 * 1024],
    }));
  });

  it('reuses a matching authenticated tab without opening a new one', async () => {
    const tab = { id: 41, url: 'https://private.example.com/article', status: 'complete' };
    const tabs = {
      query: vi.fn(async (query: { active?: boolean }) => query.active ? [tab] : [tab]),
      get: vi.fn(async () => tab),
      create: vi.fn(),
      remove: vi.fn(async () => undefined),
      onUpdated: eventHook(),
      onRemoved: eventHook(),
    };
    const scripting = {
      executeScript: vi.fn(async (details: { files?: string[] }) =>
        details.files ? [] : [{ result: extractedBody() }]
      ),
    };
    const service = loadFactory()({ tabs, scripting });

    const result = await service.extract({
      requestId: 'existing-tab',
      url: tab.url,
      allowEphemeral: false,
    });

    expect(result.ok).toBe(true);
    expect(result.fetchSourceId).toBe('tab-session');
    expect(tabs.create).not.toHaveBeenCalled();
    expect(scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 41 },
      files: ['tab-page-extract.js'],
    });
  });

  it('opens and closes one temporary authenticated tab when allowed', async () => {
    vi.useFakeTimers();
    try {
      const tab = { id: 52, url: 'https://private.example.com/other', status: 'complete' };
      const tabs = {
        query: vi.fn(async () => []),
        get: vi.fn(async () => tab),
        create: vi.fn(async () => tab),
        remove: vi.fn(async () => undefined),
        onUpdated: eventHook(),
        onRemoved: eventHook(),
      };
      const scripting = {
        executeScript: vi.fn(async (details: { files?: string[] }) =>
          details.files ? [] : [{ result: extractedBody() }]
        ),
      };
      const service = loadFactory()({ tabs, scripting });

      const pending = service.extract({
        requestId: 'temporary-tab',
        url: tab.url,
        allowEphemeral: true,
        windowId: 17,
      });
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.ok).toBe(true);
      expect(tabs.create).toHaveBeenCalledWith({ url: tab.url, active: false, windowId: 17 });
      expect(tabs.remove).toHaveBeenCalledWith(52);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels and closes a temporary tab that is still loading', async () => {
    const tab = { id: 63, url: 'https://private.example.com/loading', status: 'loading' };
    const tabs = {
      query: vi.fn(async () => []),
      get: vi.fn(async () => tab),
      create: vi.fn(async () => tab),
      remove: vi.fn(async () => undefined),
      onUpdated: eventHook(),
      onRemoved: eventHook(),
    };
    const scripting = { executeScript: vi.fn() };
    const service = loadFactory()({ tabs, scripting });

    const pending = service.extract({
      requestId: 'cancel-tab',
      url: tab.url,
      allowEphemeral: true,
    });
    for (let i = 0; i < 8 && tabs.create.mock.calls.length === 0; i++) await Promise.resolve();
    await service.cancel('cancel-tab');
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Fetch cancelled');
    expect(tabs.remove).toHaveBeenCalledWith(63);
    expect(scripting.executeScript).not.toHaveBeenCalled();
  });

  it('honors cancellation that arrives before the extract message starts', async () => {
    const tabs = {
      query: vi.fn(async () => []),
      get: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(async () => undefined),
      onUpdated: eventHook(),
      onRemoved: eventHook(),
    };
    const scripting = { executeScript: vi.fn() };
    const service = loadFactory()({ tabs, scripting });

    await service.cancel('cancel-before-start');
    const result = await service.extract({
      requestId: 'cancel-before-start',
      url: 'https://private.example.com/article',
      allowEphemeral: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Fetch cancelled');
    expect(tabs.query).not.toHaveBeenCalled();
    expect(tabs.create).not.toHaveBeenCalled();
  });
});
