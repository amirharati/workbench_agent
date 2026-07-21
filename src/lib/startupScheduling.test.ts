// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleStartupIdleWork, waitForStartupIdle } from './startupScheduling';

describe('startup idle scheduling', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps non-critical work off the immediate startup stack', async () => {
    vi.useFakeTimers();
    const work = vi.fn();

    scheduleStartupIdleWork(work);

    expect(work).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(work).toHaveBeenCalledOnce();
  });

  it('uses idle callbacks when the browser provides them', async () => {
    let idleWork: (() => void) | null = null;
    const cancelIdleCallback = vi.fn();
    Object.assign(window, {
      requestIdleCallback: vi.fn((callback: () => void) => {
        idleWork = callback;
        return 7;
      }),
      cancelIdleCallback,
    });

    let resolved = false;
    const waiting = waitForStartupIdle({ timeoutMs: 250 }).then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);
    idleWork?.();
    await waiting;
    expect(resolved).toBe(true);
    expect(window.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 250 });
  });
});
