import { describe, expect, it } from 'vitest';
import { parseFetchedContent } from './parse';

describe('parseFetchedContent canonical body', () => {
  it('preserves useful short-line playlist evidence for video pages', () => {
    const markdown = [
      '# AUB Spring 2021 El Hajj',
      '',
      'Recordings of the Spring 2021 offering at the American University of Beirut',
      '',
      '24 videos Last updated on Apr 18, 2026',
      'Lecture 01 - Introduction',
      'Lecture 02 - Data Parallel Programming',
      'Lecture 03 - Multidimensional Grids and Data',
      'Lecture 04 - GPU Architecture',
      'Lecture 05 - Memory and Tiling',
      'Lecture 18 - Graph Processing',
      'Lecture 23 - Potpourri',
      'Supplementary Lecture - Advanced Optimizations for Matrix Multiplication',
    ].join('\n');

    const parsed = parseFetchedContent(markdown, 'video', 'AUB Spring 2021 El Hajj');

    expect(parsed.snippet.length).toBeGreaterThan(80);
    expect(parsed.snippet).toContain('# AUB Spring 2021 El Hajj');
    expect(parsed.snippet).toContain('American University of Beirut');
    expect(parsed.snippet).toContain('Lecture 03 - Multidimensional Grids and Data');
    expect(parsed.snippet).toContain('Supplementary Lecture');
    expect(parsed.snippet).not.toBe('AUB Spring 2021 El Hajj');
  });

  it('uses the same body extraction for article, video, and generic sources', () => {
    const markdown = [
      '# Shared title',
      '',
      'Shared substantive content arranged as several ordinary lines.',
      'A second line supplies additional context without source-specific parsing.',
    ].join('\n');

    const article = parseFetchedContent(markdown, 'article').snippet;
    expect(parseFetchedContent(markdown, 'video').snippet).toBe(article);
    expect(parseFetchedContent(markdown, 'generic').snippet).toBe(article);
  });

  it('normalizes whitespace without deleting URLs, images, or page text', () => {
    const markdown = [
      '# Example\r',
      'A line with trailing spaces.   \r',
      'https://example.com/reference\r',
      '![Useful diagram](https://example.com/diagram.png)\r',
      'Sign in to view account-specific material\r',
      '',
      '',
      '',
      '',
      'Final line',
    ].join('\n');

    const parsed = parseFetchedContent(markdown, 'article');
    expect(parsed.snippet).toContain('https://example.com/reference');
    expect(parsed.snippet).toContain('![Useful diagram]');
    expect(parsed.snippet).toContain('Sign in to view account-specific material');
    expect(parsed.snippet).not.toContain('\r');
    expect(parsed.snippet).not.toContain('spaces.   ');
    expect(parsed.snippet).not.toContain('\n\n\n\n');
  });
});
