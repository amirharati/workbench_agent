import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('dbRpc priority propagation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', globalThis);
  });

  it('forwards the active low-priority context to the DB owner', async () => {
    const listeners = new Set<(message: unknown) => void>();
    const sendMessage = vi.fn(async (message: { method?: string }) => {
      if (message.method === 'ping') {
        for (const listener of listeners) listener({ type: 'db-owner-ready' });
        return { ok: true, result: 'pong' };
      }
      return { ok: true, result: { stored: true } };
    });
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
        onMessage: {
          addListener: (listener: (message: unknown) => void) => listeners.add(listener),
        },
      },
    });

    const [{ dbRpc }, { runWithDbPriority }] = await Promise.all([
      import('./index'),
      import('../dbRpcPriority'),
    ]);
    await runWithDbPriority('low', () => dbRpc('storeInvoke', ['putItem', []]));

    const mutation = sendMessage.mock.calls.find(
      ([message]) => (message as { method?: string }).method === 'storeInvoke'
    )?.[0] as { priority?: string } | undefined;
    expect(mutation?.priority).toBe('low');
  });

  it('uses high priority for ordinary interactive DB work', async () => {
    const listeners = new Set<(message: unknown) => void>();
    const sendMessage = vi.fn(async (message: { method?: string }) => {
      if (message.method === 'ping') {
        for (const listener of listeners) listener({ type: 'db-owner-ready' });
        return { ok: true, result: 'pong' };
      }
      return { ok: true, result: { stored: true } };
    });
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
        onMessage: {
          addListener: (listener: (message: unknown) => void) => listeners.add(listener),
        },
      },
    });

    const { dbRpc } = await import('./index');
    await dbRpc('storeInvoke', ['putItem', []]);

    const mutation = sendMessage.mock.calls.find(
      ([message]) => (message as { method?: string }).method === 'storeInvoke'
    )?.[0] as { priority?: string } | undefined;
    expect(mutation?.priority).toBe('high');
  });

  it('treats a successful shared-owner ping as ready in a newly opened dashboard', async () => {
    const sendMessage = vi.fn(async (message: { method?: string }) => {
      if (message.method === 'ping') return { ok: true, result: 'pong' };
      return { ok: true, result: { stored: true } };
    });
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
        onMessage: { addListener: vi.fn() },
      },
    });

    const { ensureDbWorker } = await import('./index');
    await Promise.all([ensureDbWorker(), ensureDbWorker(), ensureDbWorker()]);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ method: 'ping' }));
  });

  it('does not use a local transport before DB bootstrap is marked ready', async () => {
    const listeners = new Set<(message: unknown) => void>();
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: {
          addListener: (listener: (message: unknown) => void) => listeners.add(listener),
        },
      },
    });

    const { ensureDbWorker, markDbOwnerReady, setLocalDbRpcTransport } = await import('./index');
    const transport = vi.fn(async () => 'pong');
    setLocalDbRpcTransport(transport);

    let ready = false;
    const waiting = ensureDbWorker().then(() => {
      ready = true;
    });
    await Promise.resolve();
    expect(ready).toBe(false);

    markDbOwnerReady();
    await waiting;
    expect(ready).toBe(true);
    expect(transport).not.toHaveBeenCalled();
  });
});
