import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../../public/acquisition-v2-page-capture.js', import.meta.url),
  'utf8'
);

describe('v2 rendered-page evidence capture', () => {
  it('captures generic content, metadata, JSON-LD, and an exposed transcript without site parsing', async () => {
    const dom = new JSDOM(`<!doctype html>
      <head>
        <title>Rendered research page</title>
        <meta name="description" content="A useful rendered description" />
        <meta property="og:image" content="/preview.png" />
        <script type="application/ld+json">{"@type":"Article","headline":"Rendered research page"}</script>
      </head>
      <body>
        <main><h1>Rendered research page</h1><p>${'Substantive visible body. '.repeat(20)}</p></main>
        <section class="transcript-panel">${'Speaker explains the topic clearly. '.repeat(12)}</section>
        <script>globalThis.shouldNotBeSerialized = true;</script>
      </body>`, {
      url: 'https://video.example/watch/123',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    dom.window.eval(source);
    const capture = (dom.window as typeof dom.window & {
      workbenchCapturePageEvidenceV2: (options: object) => Promise<Record<string, unknown>>;
    }).workbenchCapturePageEvidenceV2;

    const result = await capture({ allowTranscriptInteraction: false });
    expect(result.ok).toBe(true);
    expect(result.visibleText).toContain('Substantive visible body');
    expect(result.transcript).toContain('Speaker explains the topic clearly');
    expect(result.metadata).toMatchObject({
      title: 'Rendered research page',
      description: 'A useful rendered description',
      previewImage: 'https://video.example/preview.png',
    });
    expect(result.html).toContain('application/ld+json');
    expect(result.html).not.toContain('shouldNotBeSerialized');
    dom.window.close();
  });

  it('captures visible heading title evidence separately from generic tab chrome', async () => {
    const dom = new JSDOM(`<!doctype html>
      <head><title>Gmail</title></head>
      <body><main><h2>Quarterly research review</h2><p>${'Message body. '.repeat(30)}</p></main></body>`, {
      url: 'https://mail.google.com/mail/u/0/#inbox/thread',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    dom.window.eval(source);
    const capture = (dom.window as typeof dom.window & {
      workbenchCapturePageEvidenceV2: (options: object) => Promise<Record<string, any>>;
    }).workbenchCapturePageEvidenceV2;
    const result = await capture({ allowTranscriptInteraction: false });
    expect(result.metadata).toMatchObject({
      title: 'Gmail',
      headingTitle: 'Quarterly research review',
    });
    dom.window.close();
  });
});
