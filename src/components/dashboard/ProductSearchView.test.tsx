// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProductSearchView } from './ProductSearchView';

describe('ProductSearchView empty state', () => {
  it('keeps recent-search discovery inside Search', () => {
    const markup = renderToStaticMarkup(
      <ProductSearchView
        items={[]}
        collections={[]}
        state={{
          query: '',
          filters: {},
          mode: 'hybrid',
          loading: false,
          error: null,
          result: null,
          selectedItemId: null,
          recentQueries: ['local first', 'browser research'],
          indexEmpty: false,
          restoring: false,
        }}
        onQueryChange={vi.fn()}
        onFiltersChange={vi.fn()}
        onModeChange={vi.fn()}
        onSelectedItemIdChange={vi.fn()}
        onRunSearch={vi.fn()}
        onOpenItem={vi.fn()}
        onClearRecentQueries={vi.fn()}
      />
    );

    expect(markup).toContain('Find anything in this scope');
    expect(markup).toContain('Recent searches');
    expect(markup).toContain('local first');
    expect(markup).toContain('browser research');
    expect(markup).not.toContain('Inspector panel');
    expect(markup).toContain('class="scrollbar ui-scroll-footer-safe"');
    expect(markup).toContain('padding:24px 28px var(--scroll-footer-safe-bottom)');
  });
});
