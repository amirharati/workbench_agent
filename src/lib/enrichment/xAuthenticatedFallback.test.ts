import { describe, expect, it } from 'vitest';
import { isXTabFetchAcceptable } from './xFetchHeuristics';
import {
  shouldAllowEphemeralTabRetry,
  shouldRetryWithBrowserTab,
} from './fetchService';

describe('authenticated X fallback', () => {
  it('retains public syndication but opens a temporary tab after unavailable public X', () => {
    expect(
      shouldRetryWithBrowserTab(
        {
          ok: true,
          markdown: '# @author\n\nPublic thread body',
          fetchSourceId: 'syndication-expanded',
        },
        'https://x.com/author/status/123',
        '# @author\n\nPublic thread body'
      )
    ).toBe(false);
    expect(
      shouldRetryWithBrowserTab(
        {
          ok: false,
          errorCode: 'parse_empty',
          error: 'tweet_unavailable',
          fetchSourceId: 'local',
        },
        'https://x.com/private_author/status/123'
      )
    ).toBe(true);
    expect(shouldAllowEphemeralTabRetry('https://x.com/private_author/status/123', false)).toBe(true);
  });

  it('accepts a substantive protected single post from a known author', () => {
    expect(
      isXTabFetchAcceptable(
        '# @private_author\n\nThis protected post is visible in the authenticated browser and contains useful saved context.',
        'https://x.com/private_author/status/123'
      )
    ).toBe(true);
  });

  it('rejects unknown-author and X chrome-shell captures', () => {
    expect(
      isXTabFetchAcceptable(
        '# @unknown\n\nThis text cannot be safely attributed to the bookmarked protected post.',
        'https://x.com/private_author/status/123'
      )
    ).toBe(false);
    expect(
      isXTabFetchAcceptable(
        'Post See new posts Relevant Post your reply Everyone can reply Subscribe Click to subscribe',
        'https://x.com/private_author/status/123'
      )
    ).toBe(false);
  });
});
