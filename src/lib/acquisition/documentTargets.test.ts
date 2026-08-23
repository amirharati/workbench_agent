import { describe, expect, it } from 'vitest';
import { remoteDocumentTargetsV2 } from './documentTargets';

describe('v2 remote document targets', () => {
  it('keeps the original OpenReview URL and adds its alternate document representations', () => {
    const id = '1cfaa7fe8d48f5b256d6894b0e27688521a274c9';
    expect(remoteDocumentTargetsV2(`https://openreview.net/pdf/${id}.pdf`)).toEqual([
      { url: `https://openreview.net/pdf/${id}.pdf`, sessionUrl: 'https://openreview.net/' },
      { url: `https://api2.openreview.net/pdf/${id}.pdf`, sessionUrl: 'https://api2.openreview.net/notes?limit=1' },
      { url: `https://api2.openreview.net/pdf/${id}`, sessionUrl: 'https://api2.openreview.net/notes?limit=1' },
    ]);
  });

  it('uses one same-origin target for ordinary remote PDFs', () => {
    expect(remoteDocumentTargetsV2('https://papers.example/research/paper.pdf')).toEqual([
      { url: 'https://papers.example/research/paper.pdf', sessionUrl: 'https://papers.example/' },
    ]);
  });
});
