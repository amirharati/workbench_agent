import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Item } from '../../lib/db';
import { QuickAccessItemList } from './QuickAccessItemList';

const item: Item = {
  id: 'item-a',
  title: 'Readable article',
  url: 'https://example.com/article',
  collectionIds: ['collection-a'],
  tags: [],
  source: 'manual',
  created_at: 1,
  updated_at: 2,
};

describe('QuickAccessItemList', () => {
  it('renders interactive utility rows with the shared readable hierarchy', () => {
    const markup = renderToStaticMarkup(
      <QuickAccessItemList
        title="Favorites"
        icon="F"
        items={[item]}
        emptyIcon="E"
        emptyTitle="No favorites"
        emptyHint="Favorite something first."
        onItemClick={vi.fn()}
        renderRowActions={() => <button type="button">Remove</button>}
      />
    );

    expect(markup).toContain('ui-quick-access-list__row');
    expect(markup).toContain('role="button"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('Readable article');
    expect(markup).toContain('example.com');
    expect(markup).toContain('ui-quick-access-list__actions');
    expect(markup).toContain('aria-label="Filter Favorites"');
  });
});
