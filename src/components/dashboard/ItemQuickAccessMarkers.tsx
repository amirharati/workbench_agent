import React from 'react';
import { Pin, Star } from 'lucide-react';
import type { Item } from '../../lib/db';

export type ItemQuickAccessMarkersProps = {
  item: Item;
  size?: number;
  /** Hide when neither favorite nor pin is set (default). */
  hideWhenEmpty?: boolean;
  hideWhenTrashed?: boolean;
};

/** Favorite icon first, then pin when both are set. */
export const ItemQuickAccessMarkers: React.FC<ItemQuickAccessMarkersProps> = ({
  item,
  size = 10,
  hideWhenEmpty = true,
  hideWhenTrashed = false,
}) => {
  if (hideWhenTrashed && item.deletedAt) return null;

  const showFavorite = item.favoriteAt != null;
  const showPin = item.pinnedAt != null;
  if (!showFavorite && !showPin) {
    return hideWhenEmpty ? null : <span style={{ display: 'inline-flex', width: size, flexShrink: 0 }} />;
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      {showFavorite && <Star size={size} style={{ color: '#ef4444', fill: '#ef4444' }} />}
      {showPin && <Pin size={size} style={{ color: 'var(--accent)' }} />}
    </span>
  );
};
