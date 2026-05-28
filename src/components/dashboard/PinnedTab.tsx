import React, { useCallback, useEffect, useState } from 'react';
import type { Item } from '../../lib/db';
import { Pin, PinOff } from 'lucide-react';
import { subscribeToDataChanges } from '../../lib/dataChangeNotifier';
import { getPinnedItems } from '../../lib/itemQuickAccess';
import { QuickAccessItemList } from './QuickAccessItemList';

interface PinnedTabProps {
  onItemClick?: (item: Item) => void;
}

export const PinnedTab: React.FC<PinnedTabProps> = ({ onItemClick }) => {
  const [items, setItems] = useState<Item[]>([]);

  const reload = useCallback(async () => {
    setItems(await getPinnedItems());
  }, []);

  useEffect(() => {
    void reload();
    return subscribeToDataChanges(() => {
      void reload();
    });
  }, [reload]);

  return (
    <QuickAccessItemList
      title="Pinned Items"
      icon={<Pin size={20} style={{ color: 'var(--accent)' }} />}
      items={items}
      emptyIcon={<PinOff size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />}
      emptyTitle="No pinned items"
      emptyHint="Right-click any item and select Pin to add it here."
      onItemClick={onItemClick}
      dateField={(i) => i.pinnedAt ?? i.updated_at}
      dateLabel="Pinned"
    />
  );
};
