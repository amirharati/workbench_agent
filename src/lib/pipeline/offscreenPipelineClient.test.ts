import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ai/settings', () => ({
  loadAISettings: vi.fn(async () => ({
    provider: 'openrouter',
    baseUrl: 'https://example.test',
    model: 'test-model',
    apiKey: 'test-key',
    timeoutMs: 10_000,
    temperature: 0,
    maxOutputTokens: 100,
    strictModelMatch: false,
    routingMode: 'single',
    taskModels: {},
  })),
}));

vi.mock('./singleLinkDigest', () => ({
  runSingleLinkDigest: vi.fn(),
}));

vi.mock('../storage/dbClient/remoteStore', () => ({
  getRemoteStore: () => ({
    createPipelineCacheSeed: vi.fn(async () => ({
      projects: [],
      collections: [],
      items: [],
      workspaces: [],
      enrichment: [],
      categories: [],
      links: [],
      signals: [],
      taxonomy: undefined,
      revision: 1,
    })),
  }),
}));

describe('offscreenPipelineClient', () => {
  const listeners = new Set<(message: unknown) => void>();
  const sendMessage = vi.fn(async (message: { action?: string; requestId?: string }) => {
    if (message.action === 'start-batch') {
      return { ok: true, requestId: message.requestId };
    }
    return { ok: true };
  });

  beforeEach(() => {
    listeners.clear();
    sendMessage.mockClear();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
        onMessage: {
          addListener: (listener: (message: unknown) => void) => listeners.add(listener),
          removeListener: (listener: (message: unknown) => void) => listeners.delete(listener),
        },
      },
    });
  });

  it('dispatches bulk offscreen and resolves only its matching completion event', async () => {
    const { runBatchOnOffscreen } = await import('./offscreenPipelineClient');
    const progress = vi.fn();
    const pending = runBatchOnOffscreen(['item-1'], { onProgress: progress });

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    const start = sendMessage.mock.calls[0][0] as {
      action: string;
      requestId: string;
      itemIds: string[];
      cacheSeed: { revision: number };
    };
    expect(start.action).toBe('start-batch');
    expect(start.itemIds).toEqual(['item-1']);
    expect(start.cacheSeed.revision).toBe(1);

    for (const listener of listeners) {
      listener({
        type: 'pipeline-offscreen-progress',
        requestId: start.requestId,
        progress: { phase: 'prep', label: 'Preparing', current: 0, total: 1 },
      });
      listener({
        type: 'pipeline-offscreen-done',
        requestId: start.requestId,
        ok: true,
        result: {
          enriched: 1,
          skipped: 0,
          failed: 0,
          classified: 1,
          message: 'done',
        },
      });
    }

    await expect(pending).resolves.toMatchObject({ enriched: 1, classified: 1 });
    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress.mock.calls[0][0].label).toBe('Preparing pipeline memory…');
    expect(listeners.size).toBe(0);
  });

  it('submits a single to offscreen and resolves from its observed completion', async () => {
    const { runSingleOnOffscreen } = await import('./offscreenPipelineClient');
    const progress = vi.fn();
    const pending = runSingleOnOffscreen('item-1', { onProgress: progress });

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    const start = sendMessage.mock.calls[0][0] as {
      action: string;
      requestId: string;
      itemId: string;
      options: { aiSettings?: { apiKey?: string } };
    };
    expect(start.action).toBe('start-single');
    expect(start.itemId).toBe('item-1');
    expect(start.options.aiSettings?.apiKey).toBe('test-key');

    for (const listener of listeners) {
      listener({
        type: 'pipeline-offscreen-progress',
        requestId: start.requestId,
        progress: { phase: 'enrich', label: 'Fetching', current: 0, total: 1 },
      });
      listener({
        type: 'pipeline-offscreen-done',
        requestId: start.requestId,
        ok: true,
        singleResult: {
          itemId: 'item-1',
          enrich: { itemId: 'item-1', status: 'ok' },
          classifyAttempted: true,
          classifyProcessed: 1,
          message: 'done',
        },
      });
    }

    await expect(pending).resolves.toMatchObject({ itemId: 'item-1', message: 'done' });
    expect(progress.mock.calls.map((call) => call[0].label)).toEqual([
      'Submitting durable pipeline…',
      'Fetching',
    ]);
    expect(listeners.size).toBe(0);
  });

  it('forwards single cancellation to the offscreen owner', async () => {
    const { runSingleOnOffscreen } = await import('./offscreenPipelineClient');
    const controller = new AbortController();
    const pending = runSingleOnOffscreen('item-2', { signal: controller.signal });

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    const start = sendMessage.mock.calls[0][0] as { requestId: string };
    controller.abort('user');
    await vi.waitFor(() => {
      expect(sendMessage.mock.calls.some(([message]) =>
        message.action === 'cancel' && message.requestId === start.requestId
      )).toBe(true);
    });

    for (const listener of listeners) {
      listener({
        type: 'pipeline-offscreen-done',
        requestId: start.requestId,
        ok: false,
        error: 'Cancelled',
      });
    }
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
