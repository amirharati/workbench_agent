// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Item } from '../../lib/db';
import { ItemFavoriteButton } from './ItemFavoriteButton';

const item = (id: string, url: string, favoriteAt?: number): Item => ({
  id,
  url,
  title: url ? 'Saved link' : 'Saved note',
  collectionIds: [],
  tags: [],
  source: 'manual',
  created_at: 1,
  updated_at: 1,
  favoriteAt,
});

describe('ItemFavoriteButton', () => {
  it('offers the same global favorite action for links and notes', () => {
    const update = vi.fn();
    const markup = renderToStaticMarkup(
      <>
        <ItemFavoriteButton item={item('link', 'https://example.com')} onUpdateItem={update} />
        <ItemFavoriteButton item={item('note', '')} onUpdateItem={update} />
      </>
    );

    expect(markup).toContain('Add to favorites: Saved link');
    expect(markup).toContain('Add to favorites: Saved note');
  });

  it('shows the active library-level state', () => {
    const markup = renderToStaticMarkup(
      <ItemFavoriteButton item={item('favorite', '', 10)} onUpdateItem={vi.fn()} showLabel />
    );

    expect(markup).toContain('Remove from favorites: Saved note');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('Favorited');
  });
});
