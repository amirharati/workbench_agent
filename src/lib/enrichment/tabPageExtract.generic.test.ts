import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

describe('generic authenticated tab extraction', () => {
  it('keeps visible body metadata when OG metadata exists but the page has no main element', () => {
    const dom = new JSDOM(
      `<!doctype html>
      <head>
        <title>Silo - Season 2 Episode 8</title>
        <meta property="og:title" content="Silo - Season 2 Episode 8" />
        <meta property="og:description" content="Juliette discovers something happened to Solo." />
      </head>
      <body>
        <header>Site navigation</header>
        <section>
          <h1>Silo - Season 2 Episode 8</h1>
          <h2>The Book of Quinn</h2>
          <p>Juliette discovers something happened to Solo. Bernard makes an offer to Walker.</p>
          <p>515 Votes (7.5)</p>
          <p>Episode Aired: 2025-01-02</p>
          <p>Certificate: TV-MA</p>
          <p>Country: United States</p>
          <p>Language: English</p>
          <p>Show Status: Returning Series</p>
          <p>Genre: Drama | Mystery</p>
          <p>Keywords: based on novel or book | politics | corruption | postapocalyptic future</p>
        </section>
        <footer>Privacy and account links</footer>
      </body>`,
      { url: 'https://example.test/watch/season/2/episode/8', runScripts: 'outside-only' }
    );
    const source = readFileSync(
      new URL('../../../public/tab-page-extract.js', import.meta.url),
      'utf8'
    );
    dom.window.eval(source);

    const result = (dom.window as typeof dom.window & {
      workbenchExtractPageContent: () => { ok: boolean; markdown: string };
    }).workbenchExtractPageContent();

    expect(result.ok).toBe(true);
    expect(result.markdown).toContain('Show Status: Returning Series');
    expect(result.markdown).toContain('Genre: Drama | Mystery');
    expect(result.markdown).toContain('Keywords: based on novel or book');
    expect(result.markdown).not.toContain('Site navigation');
    expect(result.markdown).not.toContain('Privacy and account links');
    dom.window.close();
  });
});
