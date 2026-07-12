import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetClockForTests,
  __setNetworkOffsetForTests,
  getClockSource,
  nowMs,
  syncClock,
} from './clock';

describe('clock', () => {
  beforeEach(() => {
    __resetClockForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    __resetClockForTests();
    vi.unstubAllGlobals();
  });

  it('nowMs returns finite number ≈ system time when no network offset', () => {
    const before = Date.now();
    const n = nowMs();
    const after = Date.now();
    expect(Number.isFinite(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(before);
    expect(n).toBeLessThanOrEqual(after);
    expect(getClockSource()).toBe('system');
  });

  it('nowMs ≈ Date.now() + offset when network offset is set', () => {
    __setNetworkOffsetForTests(5_000);
    const before = Date.now();
    const n = nowMs();
    const after = Date.now();
    expect(n).toBeGreaterThanOrEqual(before + 5_000);
    expect(n).toBeLessThanOrEqual(after + 5_000);
    expect(getClockSource()).toBe('network');
  });

  it('nowMs never throws', () => {
    expect(() => nowMs()).not.toThrow();
  });

  it('syncClock failure does not throw and leaves system clock', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );
    await expect(syncClock()).resolves.toBeUndefined();
    expect(getClockSource()).toBe('system');
    const before = Date.now();
    const n = nowMs();
    expect(n).toBeGreaterThanOrEqual(before - 50);
    expect(n).toBeLessThanOrEqual(Date.now() + 50);
  });

  it('syncClock stores offset from Date header', async () => {
    const fixedLocal = 1_700_000_000_000;
    const serverMs = fixedLocal + 12_000;
    vi.spyOn(Date, 'now').mockReturnValue(fixedLocal);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        headers: {
          get: (name: string) => (name.toLowerCase() === 'date' ? new Date(serverMs).toUTCString() : null),
        },
      }))
    );
    await syncClock();
    expect(getClockSource()).toBe('network');
    expect(nowMs()).toBe(fixedLocal + 12_000);
  });
});
