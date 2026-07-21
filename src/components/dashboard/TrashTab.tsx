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
import { uiPatterns } from '../../styles/uiPatterns';

const PERMANENT_DELETE_BODY =
  'The bookmark and its enrichment data will be removed. The URL stays on the import block list so Import Studio can skip it later.';

const EMPTY_TRASH_BODY =
  'Permanently delete every item in trash? URLs stay on the import block list; bookmark rows and enrichment are removed.';

interface TrashTabProps {
  onItemClick?: (item: Item) => void;
  /** Full-page Trash view (sidebar) vs utility tab on Home. */
  variant?: 'tab' | 'page';
}

type PendingConfirm =
  | { kind: 'permanent'; item: Item }
  | { kind: 'empty'; count: number };

export const TrashTab: React.FC<TrashTabProps> = ({ onItemClick, variant = 'tab' }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      await restoreItemFromTrash(item.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePermanentDelete = (e: React.MouseEvent, item: Item) => {
    e.stopPropagation();
    setError(null);
    setPending({ kind: 'permanent', item });
  };

  const handleEmptyTrash = () => {
    if (items.length === 0) return;
    setError(null);
    setPending({ kind: 'empty', count: items.length });
  };

  const runPending = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending.kind === 'permanent') {
        await permanentlyDeleteItem(pending.item.id);
      } else {
        await emptyTrash();
      }
      setPending(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const pageHint =
    'Restore brings the bookmark back to your library. Permanent delete removes the bookmark and enrichment but keeps the URL on the import block list until you restore or clear history.';

  return (
    <>
      <QuickAccessItemList
        title="Trash"
        icon={<Trash2 size={20} style={{ color: '#ef4444' }} />}
        items={items}
        emptyIcon={<Trash2 size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />}
        emptyTitle="Trash is empty"
        emptyHint={
          variant === 'page'
            ? 'Deleted bookmarks appear here. Use Restore or Delete permanently from the row actions or right-click menu.'
            : 'Deleted items appear here. Restore them or delete permanently.'
        }
        headerSubtitle={variant === 'page' ? pageHint : undefined}
        onItemClick={onItemClick}
        dateField={(i) => i.deletedAt ?? i.updated_at}
        dateLabel="Deleted"
        headerExtra={
          items.length > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleEmptyTrash()}
              style={{
                ...uiPatterns.dangerButton,
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
              style={uiPatterns.secondaryButton}
            >
              Restore
            </button>
            <button
              type="button"
              onClick={(e) => handlePermanentDelete(e, item)}
              style={uiPatterns.dangerButton}
            >
              Delete permanently
            </button>
          </div>
        )}
      />

      {error ? (
        <p
          role="alert"
          style={{
            margin: '8px 12px 0',
            color: '#dc2626',
            fontSize: 'var(--text-sm)',
          }}
        >
          {error}
        </p>
      ) : null}

      {pending ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            ...uiPatterns.modalBackdrop,
            zIndex: 100000,
          }}
          onClick={() => {
            if (!busy) setPending(null);
          }}
        >
          <div
            style={{
              ...uiPatterns.dialog,
              maxWidth: 420,
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 10px', fontSize: '1rem', fontWeight: 700 }}>
              {pending.kind === 'permanent'
                ? `Permanently delete “${pending.item.title || pending.item.url || 'Untitled'}”?`
                : `Empty trash (${pending.count} item${pending.count === 1 ? '' : 's'})?`}
            </h3>
            <p style={{ margin: '0 0 16px', lineHeight: 1.5, opacity: 0.9, fontSize: '0.9rem' }}>
              {pending.kind === 'permanent' ? PERMANENT_DELETE_BODY : EMPTY_TRASH_BODY}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending(null)}
                style={{ ...uiPatterns.secondaryButton, opacity: busy ? 0.7 : 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runPending()}
                style={{ ...uiPatterns.dangerButton, opacity: busy ? 0.7 : 1 }}
              >
                {busy ? 'Deleting…' : pending.kind === 'empty' ? 'Empty trash' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
