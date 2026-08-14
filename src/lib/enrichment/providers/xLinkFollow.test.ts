import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendXLinkFollowBodies,
  extractXLinkFollowUrls,
  shouldFollowXLinks,
} from './xLinkFollow';

const originalChrome = globalThis.chrome;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: originalChrome,
  });
});
describe('X linked-page enrichment', () => {
  it('follows links only when the tweet/thread itself is thin', () => {
    expect(shouldFollowXLinks('# @author\n\nShort note https://example.com/article')).toBe(true);
    expect(
      shouldFollowXLinks(`# @author — thread (3 parts)\n\n${'Substantive thread context. '.repeat(30)}\n\nhttps://example.com/article`)
    ).toBe(false);
  });

  it('retains t.co as a resolvable external-link candidate', () => {
    expect(
      extractXLinkFollowUrls(
        '# @author\n\nShort post https://t.co/abc123',
        'https://x.com/author/status/123'
      )
    ).toEqual(['https://t.co/abc123']);
  });

  it('uses the bound authenticated browser window before headless link fetch', async () => {
    const sendMessage = vi.fn(async (message: Record<string, unknown>) => ({
      ok: true,
      title: 'Private linked article',
      markdown: `# Private linked article\n\n${'Authenticated article body. '.repeat(12)}`,
      pageUrl: message.url,
      fetchSourceId: 'tab-session',
    }));
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: { runtime: { sendMessage } },
    });

    const result = await appendXLinkFollowBodies(
      '# @author\n\nRead this https://private.example.com/article',
      'https://x.com/author/status/123',
      { browserWindowId: 17 }
    );

    expect(result).toContain('## Linked: Private linked article');
    expect(result).toContain('Authenticated article body.');
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'browser-fetch-service',
        action: 'extract',
        url: 'https://private.example.com/article',
        allowEphemeral: true,
        windowId: 17,
      })
    );
  });
});
