import React, { useCallback, useEffect, useState } from 'react';
import type { Item } from '../../lib/db';
import { Pin, Star } from 'lucide-react';
import { subscribeToDataChanges } from '../../lib/dataChangeNotifier';
import { getQuickAccessItems } from '../../lib/itemQuickAccess';
import { QuickAccessItemList } from './QuickAccessItemList';

interface QuickAccessTabProps {
  onItemClick?: (item: Item) => void;
}

export const QuickAccessTab: React.FC<QuickAccessTabProps> = ({ onItemClick }) => {
  const [items, setItems] = useState<Item[]>([]);

  const reload = useCallback(async () => {
    setItems(await getQuickAccessItems());
  }, []);

  useEffect(() => {
    void reload();
    return subscribeToDataChanges(() => {
      void reload();
    });
  }, [reload]);

  return (
    <QuickAccessItemList
      title="Favorites & pins"
      icon={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Star size={18} style={{ color: 'var(--favorite)', fill: 'var(--favorite)' }} />
          <Pin size={18} style={{ color: 'var(--accent)' }} />
        </span>
      }
      items={items}
      emptyIcon={
        <span style={{ display: 'flex', justifyContent: 'center', gap: 12, margin: '0 auto 1rem', opacity: 0.5 }}>
          <Star size={40} />
          <Pin size={40} />
        </span>
      }
      emptyTitle="Nothing starred or pinned yet"
      emptyHint="Use the star or pin buttons on an item, or right-click → Add to favorites / Pin."
      onItemClick={onItemClick}
      showQuickAccessMarkers
      dateField={(i) => i.favoriteAt ?? i.pinnedAt ?? i.updated_at}
      dateLabel="Updated"
      onOpenInNewTab={(item) => {
        if (item.url) chrome.tabs.create({ url: item.url });
      }}
    />
  );
};
