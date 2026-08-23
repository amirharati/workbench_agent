import { describe, expect, it } from 'vitest';
import {
  explainHardFetchFailure,
  isFetchBodySubstantive,
  isHttpErrorPageBody,
  isPdfBinaryBody,
  rewriteDocumentFetchUrl,
  rewriteLinkFollowUrl,
} from './fetchQuality';

describe('fetch quality and document URL routing', () => {
  it('detects binary PDFs and HTTP error pages', () => {
    const pdfGarbage = '%PDF-1.5\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>';
    expect(isPdfBinaryBody(pdfGarbage)).toBe(true);
    expect(
      explainHardFetchFailure(pdfGarbage, {
        url: 'https://arxiv.org/pdf/2012.07149',
      })?.code
    ).toBe('parse_empty');

    expect(isHttpErrorPageBody('# 404 - Page not found\n\nNothing here', '404')).toBe(true);
    expect(
      explainHardFetchFailure('# 404 - Page not found\n\nNothing here', {
        url: 'http://www.51x.ai',
        title: '404',
      })?.detail
    ).toContain('error page');
  });

  it('rewrites scholarly PDF URLs to readable landing pages', () => {
    expect(rewriteLinkFollowUrl('https://arxiv.org/pdf/2012.07149')).toBe(
      'https://arxiv.org/abs/2012.07149'
    );
    expect(rewriteDocumentFetchUrl('https://arxiv.org/pdf/2104.13478.pdf')).toBe(
      'https://arxiv.org/abs/2104.13478'
    );
    expect(rewriteDocumentFetchUrl('https://openreview.net/pdf?id=paper123')).toBe(
      'https://openreview.net/forum?id=paper123'
    );
    expect(rewriteDocumentFetchUrl('https://openreview.net/pdf/paper123.pdf')).toBe(
      'https://openreview.net/pdf/paper123.pdf'
    );
    expect(rewriteDocumentFetchUrl('https://aclanthology.org/2024.acl-long.1.pdf')).toBe(
      'https://aclanthology.org/2024.acl-long.1/'
    );
  });

  it('accepts only article text that the downstream AI can use', () => {
    expect(
      isFetchBodySubstantive(
        '# Sign in\n\nSign in to continue. Accept all cookies. Privacy policy. Create account. Forgot password.',
        { url: 'https://example.com/private-paper', title: 'Sign in' }
      )
    ).toBe(false);
    expect(
      isFetchBodySubstantive(
        '# A useful research paper\n\nThis paper presents a practical method for extracting reliable article content from difficult websites. The evaluation compares multiple routing strategies and reports substantial improvements on a broad benchmark.',
        { url: 'https://example.com/paper', title: 'A useful research paper' }
      )
    ).toBe(true);
    expect(
      isFetchBodySubstantive(
        '# Descriptive paper title\n\nA brief abstract with too little text.',
        { url: 'https://example.com/short-paper', title: 'A descriptive research paper title' }
      )
    ).toBe(false);
  });

  it('does not block a normal article', () => {
    expect(
      explainHardFetchFailure(
        'A normal article with enough text to pass the minimum length gate for fetch quality checks and continue.',
        { url: 'https://example.com' }
      )
    ).toBeUndefined();
  });

});
