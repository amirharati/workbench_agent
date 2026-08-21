// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from './htmlExtract';

describe('htmlToMarkdown social preview metadata', () => {
  it('keeps an absolute OG image alongside the extracted document', () => {
    const result = htmlToMarkdown(
      '<html><head><meta property="og:image" content="/card.jpg"><title>Example</title></head><body><article><p>' + 'Useful text '.repeat(20) + '</p></article></body></html>',
      'https://example.com/posts/a'
    );
    expect(result?.previewImage).toBe('https://example.com/card.jpg');
  });
});
