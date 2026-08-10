import { describe, expect, it } from 'vitest';
import { shouldUseBrowserSessionFirstForUrl } from './fetchService';

describe('pipeline browser-session fetch policy', () => {
  it('uses an authenticated Chrome tab first for ordinary URLs', () => {
    expect(shouldUseBrowserSessionFirstForUrl('https://github.com/org/private-repo')).toBe(true);
    expect(shouldUseBrowserSessionFirstForUrl('https://example.com/account/article')).toBe(true);
    expect(shouldUseBrowserSessionFirstForUrl('https://docs.google.com/document/d/private/edit')).toBe(true);
  });

  it('keeps X and video on their specialized provider-first routes', () => {
    expect(shouldUseBrowserSessionFirstForUrl('https://x.com/example/status/123')).toBe(false);
    expect(shouldUseBrowserSessionFirstForUrl('https://www.youtube.com/watch?v=abc')).toBe(false);
  });
});
