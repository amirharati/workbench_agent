// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
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
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

  it('sends an explicit serializable clear instruction when removing a favorite', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const parentClick = vi.fn();
    const parent = document.createElement('div');
    const host = document.createElement('div');
    parent.addEventListener('click', parentClick);
    parent.appendChild(host);
    document.body.appendChild(parent);
    const root = createRoot(host);

    await act(async () => {
      root.render(<ItemFavoriteButton item={item('favorite', '', 10)} onUpdateItem={update} />);
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button')?.click();
    });

    expect(update).toHaveBeenCalledWith(
      'favorite',
      {},
      { preserveUpdatedAt: true, clearItemMarkers: ['favoriteAt'] }
    );
    expect(parentClick).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    parent.remove();
  });
});
