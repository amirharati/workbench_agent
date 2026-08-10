import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchThroughBrowserService,
  shouldUseEphemeralTab,
} from './tabSessionExtract';
import { sharedAuthSessionPathPrefix, urlsMatchForTabSession } from './tabSessionMatch';

describe('tab-session URL matching', () => {
  it('matches equivalent Udemy lecture URLs', () => {
    expect(
      urlsMatchForTabSession(
        'https://www.udemy.com/course/my-course/learn/lecture/12345',
        'https://udemy.com/course/my-course/learn/lecture/12345/'
      )
    ).toBe(true);
  });

  it('allows a shared authenticated Udemy course path', () => {
    expect(
      sharedAuthSessionPathPrefix(
        'https://www.udemy.com/course/python-bootcamp/learn/lecture/111111',
        'https://www.udemy.com/course/python-bootcamp/'
      )
    ).toBe(true);
  });

  it('does not match unrelated GitHub paths', () => {
    expect(
      sharedAuthSessionPathPrefix(
        'https://github.com/org/repo',
        'https://github.com/settings/profile'
      )
    ).toBe(false);
  });

  it('keeps Reddit thread and Google document matching behavior', () => {
    expect(
      urlsMatchForTabSession(
        'https://www.reddit.com/r/machinelearning/comments/abc123/post/',
        'https://reddit.com/r/machinelearning/comments/abc123/post'
      )
    ).toBe(true);
    expect(
      urlsMatchForTabSession(
        'https://docs.google.com/document/d/ABC123/edit',
        'https://docs.google.com/document/d/ABC123/'
      )
    ).toBe(true);
  });
});

describe('ephemeral browser-tab policy', () => {
  it('does not create hidden tabs for ordinary public pages', () => {
    expect(shouldUseEphemeralTab('https://www.apartmentguide.com/')).toBe(false);
    expect(shouldUseEphemeralTab('https://www.dell.com/')).toBe(false);
    expect(shouldUseEphemeralTab('https://www.kadenze.com/')).toBe(false);
  });

  it('retains the fallback for sources that require a browser session', () => {
    expect(shouldUseEphemeralTab('https://www.reddit.com/r/typescript/')).toBe(true);
    expect(shouldUseEphemeralTab('https://docs.google.com/document/d/example/edit')).toBe(true);
    expect(shouldUseEphemeralTab('https://mail.google.com/mail/u/0/')).toBe(true);
  });
});

describe('offscreen browser-fetch client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('routes authenticated extraction through the service worker', async () => {
    const sendMessage = vi.fn(async (message: { action?: string }) => {
      expect(message.action).toBe('extract');
      return {
        ok: true,
        markdown: '# Private\n\nAuthenticated article body '.repeat(5),
        title: 'Private',
        pageUrl: 'https://private.example.com/article',
        fetchSourceId: 'tab-session',
      };
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    const result = await fetchThroughBrowserService(
      'https://private.example.com/article',
      { allowEphemeral: true }
    );

    expect(result.ok).toBe(true);
    expect(result.fetchSourceId).toBe('tab-session');
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      target: 'browser-fetch-service',
      action: 'extract',
      allowEphemeral: true,
    }));
  });
});
