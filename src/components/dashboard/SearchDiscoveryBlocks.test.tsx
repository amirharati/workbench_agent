import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FindSimilarResult } from '../../lib/search';
import { SimilarItemsBlock } from './SearchDiscoveryBlocks';

const similar: FindSimilarResult = {
  itemId: 'source',
  anchorTitle: 'Source',
  anchorHasEmbedding: true,
  totalCandidates: 1,
  results: [{
    itemId: 'related',
    title: 'Related bookmark',
    url: 'https://example.com/related',
    domain: 'example.com',
    breakdown: { embedding: 0.9, category: 0.5, tags: 0.2, lexical: 0, finalScore: 0.7 },
    sources: ['embedding'],
  }],
};

describe('SimilarItemsBlock', () => {
  it('keeps similar links and uses the shared workspace action without an Inspect redirect', () => {
    const markup = renderToStaticMarkup(
      <SimilarItemsBlock
        similar={similar}
        renderWorkspaceAction={() => <button type="button">Add to workspace…</button>}
      />
    );

    expect(markup).toContain('Similar bookmarks');
    expect(markup).toContain('Related bookmark');
    expect(markup).toContain('Add to workspace…');
    expect(markup).toContain('ui-related-link-row__workspace');
    expect(markup).toContain('Semantic matches');
    expect(markup).not.toContain('Inspect');
    expect(markup).not.toContain('Open tab');
  });
});
