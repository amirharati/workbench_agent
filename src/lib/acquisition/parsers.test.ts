import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { candidatesFromBrowserEvidence, resolvedFrameTitle } from './parsers';
import type { BrowserEvidenceV2 } from './types';

describe('v2 isolated rendered-document parsers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('prefers a meaningful captured heading over a generic shell title', () => {
    expect(resolvedFrameTitle({
      frameId: 0,
      url: 'https://mail.google.com/mail/u/0/#inbox/thread',
      title: 'Gmail',
      html: '<main><h2>Quarterly research review</h2></main>',
      visibleText: 'Quarterly research review',
      semanticText: 'Quarterly research review',
      metadata: { title: 'Gmail', headingTitle: 'Quarterly research review', jsonLd: [] },
      transcriptState: 'not_applicable',
      truncated: false,
    })).toBe('Quarterly research review');
  });

  it('prefers fresh rendered YouTube evidence over stale Open Graph metadata', () => {
    expect(resolvedFrameTitle({
      frameId: 0,
      url: 'https://www.youtube.com/watch?v=new-video',
      title: 'New inference lecture - YouTube',
      html: '<main><h1>New inference lecture</h1></main>',
      visibleText: 'New inference lecture',
      semanticText: 'New inference lecture',
      metadata: {
        title: 'Previous inference lecture',
        headingTitle: 'New inference lecture',
        jsonLd: [],
      },
      transcriptState: 'not_available',
      truncated: false,
    })).toBe('New inference lecture');
  });

  it('runs generic visible, Defuddle, and Readability candidates over the same evidence', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('DOMParser', dom.window.DOMParser);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('HTMLMetaElement', dom.window.HTMLMetaElement);
    vi.stubGlobal('HTMLImageElement', dom.window.HTMLImageElement);
    vi.stubGlobal('HTMLAnchorElement', dom.window.HTMLAnchorElement);

    const body = 'A carefully rendered article paragraph with enough meaningful detail for extraction. '.repeat(30);
    const evidence: BrowserEvidenceV2 = {
      requestedUrl: 'https://example.com/research',
      finalUrl: 'https://example.com/research',
      usedExistingTab: true,
      frames: [{
        frameId: 0,
        url: 'https://example.com/research',
        title: 'Research article',
        html: `<!doctype html><html><head><title>Research article</title></head><body><article><h1>Research article</h1><p>${body}</p></article></body></html>`,
        visibleText: `Research article\n${body}`,
        semanticText: `# Research article\n\n${body}`,
        metadata: { title: 'Research article', jsonLd: [] },
        transcriptState: 'not_applicable',
        truncated: false,
      }],
    };

    const candidates = candidatesFromBrowserEvidence(evidence);
    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'browser-visible', 'defuddle', 'readability',
    ]);
    expect(candidates.find((candidate) => candidate.id === 'browser-visible')?.markdown)
      .toContain('carefully rendered article');
    expect(candidates.find((candidate) => candidate.id === 'defuddle')?.ok).toBe(true);
    expect(candidates.find((candidate) => candidate.id === 'readability')?.ok).toBe(true);
    dom.window.close();
  });
});
