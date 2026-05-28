import React, { useCallback, useEffect, useState } from 'react';
import type { Item } from '../../lib/db';
import { Trash2 } from 'lucide-react';
import { subscribeToDataChanges } from '../../lib/dataChangeNotifier';
import {
  emptyTrash,
  getTrashedItems,
  permanentlyDeleteItem,
  restoreItemFromTrash,
} from '../../lib/itemQuickAccess';
import { QuickAccessItemList } from './QuickAccessItemList';

interface TrashTabProps {
  onItemClick?: (item: Item) => void;
}

export const TrashTab: React.FC<TrashTabProps> = ({ onItemClick }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setItems(await getTrashedItems());
  }, []);

  useEffect(() => {
    void reload();
    return subscribeToDataChanges(() => {
      void reload();
    });
  }, [reload]);

  const handleRestore = async (e: React.MouseEvent, item: Item) => {
    e.stopPropagation();
    await restoreItemFromTrash(item.id);
  };

  const handlePermanentDelete = async (e: React.MouseEvent, item: Item) => {
    e.stopPropagation();
    if (!window.confirm(`Permanently delete "${item.title || 'Untitled'}"? This cannot be undone.`)) return;
    await permanentlyDeleteItem(item.id);
  };

  const handleEmptyTrash = async () => {
    if (items.length === 0) return;
    if (!window.confirm(`Permanently delete all ${items.length} item${items.length === 1 ? '' : 's'} in trash?`)) return;
    setBusy(true);
    try {
      await emptyTrash();
    } finally {
      setBusy(false);
    }
  };

  return (
    <QuickAccessItemList
      title="Trash"
      icon={<Trash2 size={20} style={{ color: '#ef4444' }} />}
      items={items}
      emptyIcon={<Trash2 size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />}
      emptyTitle="Trash is empty"
      emptyHint="Deleted items appear here. Restore them or delete permanently."
      onItemClick={onItemClick}
      dateField={(i) => i.deletedAt ?? i.updated_at}
      dateLabel="Deleted"
      headerExtra={
        items.length > 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleEmptyTrash()}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid rgba(239, 68, 68, 0.45)',
              background: 'rgba(239, 68, 68, 0.08)',
              color: '#ef4444',
              fontSize: 'var(--text-xs)',
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            Empty trash
          </button>
        ) : null
      }
      renderRowActions={(item) => (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => void handleRestore(e, item)}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
            }}
          >
            Restore
          </button>
          <button
            type="button"
            onClick={(e) => void handlePermanentDelete(e, item)}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid rgba(239, 68, 68, 0.45)',
              background: 'transparent',
              color: '#ef4444',
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      )}
    />
  );
};
