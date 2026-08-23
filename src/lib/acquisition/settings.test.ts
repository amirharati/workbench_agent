import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultFetchEngine, loadFetchEngine, normalizeFetchEngine, saveFetchEngine } from './settings';

describe('acquisition engine settings', () => {
  const get = vi.fn();
  const set = vi.fn();

  beforeEach(() => {
    get.mockReset();
    set.mockReset();
    vi.stubGlobal('chrome', { storage: { local: { get, set } } });
  });

  it('defaults unknown and missing values to v2', async () => {
    get.mockResolvedValue({});
    expect(getDefaultFetchEngine()).toBe('v2');
    expect(normalizeFetchEngine('future')).toBe('v2');
    await expect(loadFetchEngine()).resolves.toBe('v2');
  });

  it('preserves legacy as an explicit fallback selection', async () => {
    get.mockResolvedValue({ 'acquisition.fetch-engine.v1': 'legacy' });
    await expect(loadFetchEngine()).resolves.toBe('legacy');
    await expect(saveFetchEngine('legacy')).resolves.toBe('legacy');
    expect(set).toHaveBeenCalledWith({ 'acquisition.fetch-engine.v1': 'legacy' });
  });
});
