import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

describe('authenticated X tab extraction', () => {
  it('retains the author handle after waiting for the rendered tweet', async () => {
    const dom = new JSDOM(
      `<!doctype html><body>
        <article data-testid="tweet">
          <div data-testid="User-Name"><a href="/private_author">Private Author</a></div>
          <div data-testid="tweetText">This protected post is visible because the browser session is logged in and contains useful context.</div>
          <a href="https://private.example.com/article">linked article</a>
          <img src="https://pbs.twimg.com/media/private-image.jpg" />
        </article>
      </body>`,
      { url: 'https://x.com/private_author/status/123', runScripts: 'outside-only' }
    );
    const source = readFileSync(
      new URL('../../../public/tab-page-extract.js', import.meta.url),
      'utf8'
    );
    dom.window.eval(source);

    const result = await (dom.window as typeof dom.window & {
      workbenchExtractPageContentAsync: () => Promise<{ ok: boolean; markdown: string }>;
    }).workbenchExtractPageContentAsync();

    expect(result.ok).toBe(true);
    expect(result.markdown).toContain('# @private_author');
    expect(result.markdown).not.toContain('@unknown');
    expect(result.markdown).toContain('Link: https://private.example.com/article');
    expect(result.markdown).toContain('Image: https://pbs.twimg.com/media/private-image.jpg');
    dom.window.close();
  });
});
