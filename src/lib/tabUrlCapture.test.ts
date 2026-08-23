import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chooseLiveBookmarkTitle,
  ensureTabContextMonitor,
  getTabBookmarkContext,
} from './tabUrlCapture';

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

  it('uses generic page evidence when browser tab chrome is not the content title', () => {
    expect(chooseLiveBookmarkTitle(
      'Gmail',
      'https://mail.google.com/mail/u/0/#inbox/thread',
      { headingTitle: 'Quarterly research review', documentTitle: 'Gmail' }
    )).toBe('Quarterly research review');
    expect(chooseLiveBookmarkTitle(
      'YouTube',
      'https://www.youtube.com/watch?v=abc',
      { metadataTitle: 'Probabilistic inference lecture', documentTitle: 'YouTube' }
    )).toBe('Probabilistic inference lecture');
  });

  it('does not let stale SPA metadata replace the current YouTube document title', () => {
    expect(chooseLiveBookmarkTitle(
      'New inference lecture - YouTube',
      'https://www.youtube.com/watch?v=new-video',
      {
        metadataTitle: 'Previous inference lecture',
        headingTitle: 'New inference lecture',
        documentTitle: 'New inference lecture - YouTube',
      }
    )).toBe('New inference lecture');
  });

  it('installs the SPA context monitor in the panel owner tab', async () => {
    const executeScript = vi.fn(async () => []);
    vi.stubGlobal('chrome', { scripting: { executeScript } });
    await ensureTabContextMonitor(29);
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript.mock.calls[0][0]).toMatchObject({ target: { tabId: 29 } });
    expect(typeof executeScript.mock.calls[0][0].func).toBe('function');
  });
});
