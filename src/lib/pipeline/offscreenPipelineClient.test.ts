import { beforeEach, describe, expect, it, vi } from 'vitest';

const pipelineClientMocks = vi.hoisted(() => ({
  commitPendingDbWrites: vi.fn(async () => {}),
}));

vi.mock('../db', () => ({
  commitPendingDbWrites: pipelineClientMocks.commitPendingDbWrites,
}));

describe('offscreenPipelineClient', () => {
  const listeners = new Set<(message: unknown) => void>();
  const storedAISettings = {
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'stored-model',
    apiKey: 'stored-key',
    timeoutMs: 45_000,
    temperature: 0.2,
    maxOutputTokens: 700,
    strictModelMatch: false,
    routingMode: 'single',
    taskModels: {},
  };
  const sendMessage = vi.fn(async (message: { action?: string; requestId?: string }) => {
    if (message.action === 'start-job') {
      return { ok: true, requestId: message.requestId };
    }
    return { ok: true };
  });

  beforeEach(() => {
    listeners.clear();
    sendMessage.mockClear();
    pipelineClientMocks.commitPendingDbWrites.mockClear();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ 'ai.settings.v1': storedAISettings })),
        },
      },
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
    expect(pipelineClientMocks.commitPendingDbWrites).toHaveBeenCalledTimes(1);
    expect(pipelineClientMocks.commitPendingDbWrites.mock.invocationCallOrder[0]).toBeLessThan(
      sendMessage.mock.invocationCallOrder[0]!
    );
    const start = sendMessage.mock.calls[0][0] as {
      action: string;
      requestId: string;
      itemIds: string[];
      options: { aiSettings?: { apiKey?: string; model?: string } };
    };
    expect(start.action).toBe('start-job');
    expect(start.itemIds).toEqual(['item-1']);
    expect(start.options.aiSettings).toMatchObject({
      model: 'stored-model',
      apiKey: 'stored-key',
    });

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
    expect(progress.mock.calls[0][0].label).toBe('Submitting durable pipeline…');
    expect(listeners.size).toBe(0);
  });

  it('submits a single to offscreen and resolves from its observed completion', async () => {
    const { runSingleOnOffscreen } = await import('./offscreenPipelineClient');
    const progress = vi.fn();
    const pending = runSingleOnOffscreen('item-1', {
      onProgress: progress,
      aiSettings: {
        provider: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'test-model',
        apiKey: 'test-key',
        timeoutMs: 45_000,
        temperature: 0.2,
        maxOutputTokens: 700,
        strictModelMatch: false,
        routingMode: 'single',
        taskModels: {},
      },
    });

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    const start = sendMessage.mock.calls[0][0] as {
      action: string;
      requestId: string;
      itemIds: string[];
      options: Record<string, unknown>;
    };
    expect(start.action).toBe('start-job');
    expect(start.itemIds).toEqual(['item-1']);
    expect(start.options.aiSettings).toMatchObject({
      model: 'test-model',
      apiKey: 'test-key',
    });
    expect(start.options).not.toHaveProperty('signal');
    expect(start.options).not.toHaveProperty('onProgress');

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

  it('submits taxonomy discovery through the same coordinator even with a global scope', async () => {
    const { runPipelineActionOnOffscreen } = await import('./offscreenPipelineClient');
    const pending = runPipelineActionOnOffscreen('discover', [], { discoverMaxBatches: 2 });

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    const start = sendMessage.mock.calls[0][0] as {
      action: string;
      operation: string;
      requestId: string;
      itemIds: string[];
    };
    expect(start).toMatchObject({ action: 'start-job', operation: 'discover', itemIds: [] });

    for (const listener of listeners) {
      listener({
        type: 'pipeline-offscreen-done',
        requestId: start.requestId,
        ok: true,
        result: {
          enriched: 0,
          skipped: 0,
          failed: 0,
          classified: 0,
          message: '0 processed',
          discoverResult: { itemsSampled: 0, newParents: 0, newLeaves: 0 },
        },
      });
    }
    await expect(pending).resolves.toMatchObject({ discoverResult: { itemsSampled: 0 } });
  });

  it('observes progress and completion after Resume', async () => {
    const { resumePipelineJobOnOffscreen } = await import('./offscreenPipelineClient');
    const progress = vi.fn();
    const pending = resumePipelineJobOnOffscreen('paused-job', { onProgress: progress });

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith({
      target: 'pipeline-offscreen',
      action: 'resume',
      requestId: 'paused-job',
      aiSettings: storedAISettings,
    });
    expect(listeners.size).toBe(1);
    for (const listener of listeners) {
      listener({
        type: 'pipeline-offscreen-progress',
        requestId: 'paused-job',
        progress: { phase: 'embed', label: 'Building search embedding… 3/5', current: 2, total: 5 },
      });
      listener({
        type: 'pipeline-offscreen-done',
        requestId: 'paused-job',
        ok: true,
        result: {
          enriched: 5,
          skipped: 0,
          failed: 0,
          classified: 5,
          message: '5 enriched · 5 classified',
        },
      });
    }

    await expect(pending).resolves.toMatchObject({
      ok: true,
      result: { enriched: 5, classified: 5 },
    });
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({
      label: 'Building search embedding… 3/5',
    }));
    expect(listeners.size).toBe(0);
  });
});
