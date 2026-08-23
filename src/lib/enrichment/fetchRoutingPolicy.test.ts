import { describe, expect, it } from 'vitest';
import { acceptTabFetchResult, shouldUseBrowserSessionFirstForUrl } from './fetchService';

describe('pipeline browser-session fetch policy', () => {
  it('uses an authenticated Chrome tab first for ordinary URLs', () => {
    expect(shouldUseBrowserSessionFirstForUrl('https://github.com/org/private-repo')).toBe(true);
    expect(shouldUseBrowserSessionFirstForUrl('https://example.com/account/article')).toBe(true);
    expect(shouldUseBrowserSessionFirstForUrl('https://docs.google.com/document/d/private/edit')).toBe(true);
  });

  it('uses an authenticated Chrome tab first for X and video too', () => {
    expect(shouldUseBrowserSessionFirstForUrl('https://x.com/example/status/123')).toBe(true);
    expect(shouldUseBrowserSessionFirstForUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
  });

  it('uses the authenticated browser context first for scholarly PDFs', () => {
    expect(shouldUseBrowserSessionFirstForUrl('https://arxiv.org/pdf/2104.13478')).toBe(true);
    expect(
      shouldUseBrowserSessionFirstForUrl('https://openreview.net/pdf?id=paper123')
    ).toBe(true);
  });

  it('rejects a browser login shell so another provider can be tried', () => {
    expect(
      acceptTabFetchResult(
        {
          ok: true,
          title: 'Sign in',
          markdown:
            '# Sign in\n\nSign in to continue. Accept all cookies. Privacy policy. Create account. Forgot password.',
        },
        'https://example.com/private-paper'
      )
    ).toBe(false);
  });

  it('accepts a substantive browser article', () => {
    expect(
      acceptTabFetchResult(
        {
          ok: true,
          title: 'A useful research paper',
          markdown:
            '# A useful research paper\n\nThis paper presents a practical method for extracting reliable article content from difficult websites. The evaluation compares multiple routing strategies and reports substantial improvements on a broad benchmark.',
        },
        'https://example.com/paper'
      )
    ).toBe(true);
  });
});
