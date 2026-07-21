import React, { useState } from 'react';
import { Star } from 'lucide-react';
import type { Item, UpdateItemOptions } from '../../lib/db';

interface ItemFavoriteButtonProps {
  item: Item;
  onUpdateItem?: (
    id: string,
    updates: Partial<Omit<Item, 'id' | 'created_at'>>,
    options?: UpdateItemOptions
  ) => Promise<void>;
  showLabel?: boolean;
  stopPropagation?: boolean;
  style?: React.CSSProperties;
}

/** Global-library favorite action, distinct from project-local pinning. */
export const ItemFavoriteButton: React.FC<ItemFavoriteButtonProps> = ({
  item,
  onUpdateItem,
  showLabel = false,
  stopPropagation = false,
  style,
}) => {
  const [pending, setPending] = useState(false);
  const favorite = item.favoriteAt != null;
  const label = favorite ? 'Remove from favorites' : 'Add to favorites';

  if (!onUpdateItem || item.deletedAt != null) return null;

  return (
    <button
      className="ui-button ui-button--icon"
      type="button"
      aria-label={`${label}: ${item.title || 'Untitled'}`}
      aria-pressed={favorite}
      title={label}
      disabled={pending}
      onClick={(event) => {
        if (stopPropagation) event.stopPropagation();
        if (pending) return;
        setPending(true);
        void onUpdateItem(item.id, { favoriteAt: favorite ? undefined : Date.now() })
          .finally(() => setPending(false));
      }}
      style={{
        minWidth: showLabel ? 88 : 26,
        height: showLabel ? 29 : 26,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: showLabel ? '0 9px' : 0,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        background: favorite ? 'var(--favorite-weak)' : 'transparent',
        color: favorite ? 'var(--favorite)' : 'var(--text-faint)',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        cursor: pending ? 'wait' : 'pointer',
        opacity: pending ? 0.6 : 1,
        ...style,
      }}
    >
      <Star size={showLabel ? 13 : 12} fill={favorite ? 'currentColor' : 'none'} />
      {showLabel && (favorite ? 'Favorited' : 'Favorite')}
    </button>
  );
};
