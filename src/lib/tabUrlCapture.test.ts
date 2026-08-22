import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTabBookmarkContext } from './tabUrlCapture';

describe('tab URL capture context', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns Chrome-owned page context even when the URL is not bookmarkable', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        get: vi.fn(async () => ({
          id: 17,
          url: 'chrome://extensions/',
          title: 'Extensions',
        })),
      },
      scripting: {
        executeScript: vi.fn(),
      },
    });

    await expect(getTabBookmarkContext(17)).resolves.toEqual({
      tabId: 17,
      url: 'chrome://extensions/',
      title: 'Extensions',
      favIconUrl: undefined,
    });
  });
});
