import React, { useCallback, useEffect, useState } from 'react';
import type { Item } from '../../lib/db';
import { Heart, HeartOff } from 'lucide-react';
import { subscribeToDataChanges } from '../../lib/dataChangeNotifier';
import { getFavoriteItems } from '../../lib/itemQuickAccess';
import { QuickAccessItemList } from './QuickAccessItemList';

interface FavoritesTabProps {
  onItemClick?: (item: Item) => void;
}

export const FavoritesTab: React.FC<FavoritesTabProps> = ({ onItemClick }) => {
  const [items, setItems] = useState<Item[]>([]);

  const reload = useCallback(async () => {
    setItems(await getFavoriteItems());
  }, []);

  useEffect(() => {
    void reload();
    return subscribeToDataChanges(() => {
      void reload();
    });
  }, [reload]);

  return (
    <QuickAccessItemList
      title="Favorites"
      icon={<Heart size={20} style={{ color: '#ef4444', fill: '#ef4444' }} />}
      items={items}
      emptyIcon={<HeartOff size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />}
      emptyTitle="No favorites yet"
      emptyHint="Right-click any item and select Add to favorites."
      onItemClick={onItemClick}
      dateField={(i) => i.favoriteAt ?? i.updated_at}
      dateLabel="Favorited"
    />
  );
};
