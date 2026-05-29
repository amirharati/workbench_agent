import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Item } from '../../lib/db';
import { Clock } from 'lucide-react';
import { subscribeToDataChanges } from '../../lib/dataChangeNotifier';
import { getActiveItems, getBookmarkOpenUrl } from '../../lib/itemQuickAccess';
import { QuickAccessItemList } from './QuickAccessItemList';

interface RecentTabProps {
  items?: Item[];
  onItemClick?: (item: Item) => void;
}

export const RecentTab: React.FC<RecentTabProps> = ({ items: itemsProp, onItemClick }) => {
  const [items, setItems] = useState<Item[]>(itemsProp ?? []);

  const reload = useCallback(async () => {
    const active = await getActiveItems();
    setItems(active);
  }, []);

  useEffect(() => {
    if (itemsProp?.length) {
      setItems(itemsProp);
    } else {
      void reload();
    }
    return subscribeToDataChanges(() => {
      void reload();
    });
  }, [itemsProp, reload]);

  const recentItems = useMemo(
    () =>
      [...items]
        .sort((a, b) => (b.updated_at ?? b.created_at) - (a.updated_at ?? a.created_at))
        .slice(0, 20),
    [items]
  );

  return (
    <QuickAccessItemList
      title="Recent Items"
      icon={<Clock size={20} style={{ color: 'var(--accent)' }} />}
      items={recentItems}
      emptyIcon={<Clock size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />}
      emptyTitle="No recent items yet"
      emptyHint="Recently updated bookmarks and notes appear here."
      onItemClick={onItemClick}
      onOpenInNewTab={(item) => {
        const openUrl = getBookmarkOpenUrl(item);
        if (openUrl) chrome.tabs.create({ url: openUrl });
      }}
    />
  );
};
