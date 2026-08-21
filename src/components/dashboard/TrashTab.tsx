import React, { useCallback, useEffect, useState } from 'react';
import type { ContainerTrashEntry, Item } from '../../lib/db';
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
import { DialogShell } from './DialogShell';
import { getContainerTrash, purgeContainerTrash, undoContainerDeletion } from '../../lib/db';
import { saveGlobalTabState, takeContainerTrashWorkspaceState } from './GlobalTabSystem';

const PERMANENT_DELETE_BODY =
  'The bookmark and its enrichment data will be removed. The URL stays on the import block list so Import Studio can skip it later.';

const EMPTY_TRASH_BODY =
  'Permanently delete every recovery entry in Trash? Bookmark URLs stay on the import block list; deleted project and collection recovery snapshots are removed.';

interface TrashTabProps {
  onItemClick?: (item: Item) => void;
  /** Full-page Trash view (sidebar) vs utility tab on Home. */
  variant?: 'tab' | 'page';
}

type PendingConfirm =
  | { kind: 'permanent'; item: Item }
  | { kind: 'container'; entry: ContainerTrashEntry }
  | { kind: 'empty'; count: number; containerCount: number };

export const TrashTab: React.FC<TrashTabProps> = ({ onItemClick, variant = 'tab' }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [containers, setContainers] = useState<ContainerTrashEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [trashedItems, trashedContainers] = await Promise.all([getTrashedItems(), getContainerTrash()]);
    setItems(trashedItems);
    setContainers(trashedContainers);
  }, []);

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : String(err)));
    return subscribeToDataChanges(() => {
      void reload().catch((err) => setError(err instanceof Error ? err.message : String(err)));
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
    if (items.length === 0 && containers.length === 0) return;
    setError(null);
    setPending({ kind: 'empty', count: items.length, containerCount: containers.length });
  };

  const handleRestoreContainer = async (entry: ContainerTrashEntry) => {
    setBusy(true);
    setError(null);
    try {
      const restored = await undoContainerDeletion(entry.id);
      if (!restored) throw new Error('This deleted container is no longer available.');
      const workspaceState = takeContainerTrashWorkspaceState(entry.id);
      if (workspaceState) {
        saveGlobalTabState(workspaceState);
      }
      // The dashboard owns canonical project/collection state.  Always signal
      // it, including collection restores that have no Home workspace state.
      window.dispatchEvent(new CustomEvent('workbench-container-trash-restored', { detail: workspaceState }));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runPending = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending.kind === 'permanent') {
        await permanentlyDeleteItem(pending.item.id);
      } else if (pending.kind === 'container') {
        await purgeContainerTrash(pending.entry.id);
      } else {
        await emptyTrash();
        await purgeContainerTrash();
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
    'Restore brings bookmarks back to your library. Deleted projects and collections can also be restored here as a complete container. Empty Trash permanently removes their recovery snapshots.';

  return (
    <>
      {containers.length > 0 ? (
        <section className="ui-panel" style={{ margin: variant === 'page' ? '16px 16px 0' : '8px 0', padding: 12 }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 8 }}>Deleted projects & collections</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {containers.map((entry) => (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</strong>
                  <small style={{ color: 'var(--text-muted)' }}>{entry.kind === 'project' ? 'Project' : 'Collection'} · {new Date(entry.deletedAt).toLocaleString()}</small>
                </div>
                <button className="ui-button ui-button--secondary" type="button" disabled={busy} onClick={() => void handleRestoreContainer(entry)}>Restore {entry.kind}</button>
                <button className="ui-button ui-button--danger" type="button" disabled={busy} onClick={() => setPending({ kind: 'container', entry })}>Delete permanently</button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <QuickAccessItemList
        title="Trash"
        icon={<Trash2 size={20} style={{ color: 'var(--danger)' }} />}
        items={items}
        allowItemDrag={false}
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
          items.length > 0 || containers.length > 0 ? (
            <button
              className="ui-button ui-button--danger"
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
              className="ui-button ui-button--secondary"
              type="button"
              onClick={(e) => void handleRestore(e, item)}
              style={uiPatterns.secondaryButton}
            >
              Restore
            </button>
            <button
              className="ui-button ui-button--danger"
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
            color: 'var(--danger)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {error}
        </p>
      ) : null}

      {pending ? (
        <DialogShell
          title={pending.kind === 'permanent'
            ? `Permanently delete “${pending.item.title || pending.item.url || 'Untitled'}”?`
            : pending.kind === 'container'
              ? `Permanently delete ${pending.entry.kind} “${pending.entry.name}”?`
              : `Empty trash (${pending.count} item${pending.count === 1 ? '' : 's'} and ${pending.containerCount} container${pending.containerCount === 1 ? '' : 's'})?`}
          description="This action cannot be undone."
          onClose={() => { if (!busy) setPending(null); }}
          maxWidth={430}
          raised
          footer={
            <>
              <button className="ui-button ui-button--secondary" type="button" disabled={busy} onClick={() => setPending(null)} style={{ ...uiPatterns.secondaryButton, opacity: busy ? 0.7 : 1 }}>Cancel</button>
              <button className="ui-button ui-button--danger" type="button" disabled={busy} onClick={() => void runPending()} style={{ ...uiPatterns.dangerButton, opacity: busy ? 0.7 : 1 }}>{busy ? 'Deleting…' : pending.kind === 'empty' ? 'Empty trash' : 'Delete permanently'}</button>
            </>
          }
        >
          <div className="ui-status" data-tone="error">
            {pending.kind === 'permanent' ? PERMANENT_DELETE_BODY : pending.kind === 'container' ? 'The saved project or collection recovery snapshot will be removed. Links are not separately deleted by this action.' : EMPTY_TRASH_BODY}
          </div>
        </DialogShell>
      ) : null}
    </>
  );
};
