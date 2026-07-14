import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  addItemWithMerge,
  Collection,
  getActiveItemsByUrlFast,
  Item,
  Project,
  updateItem,
} from '../lib/db';
import { getActiveTabBookmarkContext } from '../lib/tabUrlCapture';
import { usePipelineProgress } from './dashboard/PipelineProgressProvider';
import { SidePanelView } from './SidePanelView';
import type { SessionExternalLink } from './SidePanelExternalSection';

function toStatusMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export interface SidePanelConnectedProps {
  projects: Project[];
  collections: Collection[];
  items: Item[];
  onDeleteItem: (id: string, collectionId?: string) => Promise<void>;
  onCreateProject: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection: (data: { name: string; projectId: string }) => Promise<string | void>;
  onOpenFullPage: () => void;
  onSetAsBrowserHome: () => Promise<void>;
  loadData: (opts?: { quiet?: boolean }) => Promise<void>;
}

export const SidePanelConnected: React.FC<SidePanelConnectedProps> = ({
  projects,
  collections,
  items,
  onDeleteItem,
  onCreateProject,
  onCreateCollection,
  onOpenFullPage,
  onSetAsBrowserHome,
  loadData,
}) => {
  const pipeline = usePipelineProgress();
  const [status, setStatus] = useState('');
  const [externalLinks, setExternalLinks] = useState<SessionExternalLink[]>([]);
  const [fastItems, setFastItems] = useState<Item[]>([]);
  const [savedStatePending, setSavedStatePending] = useState(true);
  const lookupSeqRef = useRef(0);
  const statusClearRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = useCallback((message: string, holdMs = 2500) => {
    if (statusClearRef.current) clearTimeout(statusClearRef.current);
    setStatus(message);
    statusClearRef.current = setTimeout(() => setStatus(''), holdMs);
  }, []);

  const clearExternalLinks = useCallback(() => {
    setExternalLinks([]);
  }, []);

  const visibleItems = useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const item of fastItems) byId.set(item.id, item);
    return [...byId.values()];
  }, [items, fastItems]);

  const handleHostTabContext = useCallback(async (tabUrl: string) => {
    const seq = ++lookupSeqRef.current;
    setSavedStatePending(true);
    try {
      const matches = await getActiveItemsByUrlFast(tabUrl);
      if (seq === lookupSeqRef.current) setFastItems(matches);
    } catch {
      if (seq === lookupSeqRef.current) setFastItems([]);
    } finally {
      if (seq === lookupSeqRef.current) setSavedStatePending(false);
    }
  }, []);

  const handleSaveCurrentTab = useCallback(
    async (collectionId?: string) => {
      // Paint immediately — bulk on the UI thread can delay the first await by seconds.
      showStatus('Saving…');
      await new Promise<void>((r) => setTimeout(r, 0));

      const ctx = await getActiveTabBookmarkContext();
      if (ctx?.url && (/^https?:\/\//i.test(ctx.url) || /^file:\/\//i.test(ctx.url))) {
        const collectionIds = collectionId ? [collectionId] : [];
        try {
          const result = await addItemWithMerge({
            url: ctx.url,
            title: ctx.title || 'Untitled',
            favicon: ctx.favIconUrl,
            tags: [],
            source: 'tab',
            collectionIds,
          });

          let statusPrefix = 'Tab saved';
          if (result.alreadyInCollections.length > 0 && result.addedToCollections.length === 0) {
            statusPrefix = 'Already saved in this collection';
          } else if (result.merged && result.addedToCollections.length > 0) {
            statusPrefix = 'Added to collection';
          }

          showStatus(statusPrefix);
          void loadData({ quiet: true }).then(() => {
            void import('../lib/storage/flushDurableBackup').then(({ flushDurableBackupSoon }) => {
              flushDurableBackupSoon();
            });
          });

          if (result.itemId && /^https?:\/\//i.test(ctx.url)) {
            // Defer digest so save feedback isn't blocked by offscreen handshake.
            window.setTimeout(() => {
              void pipeline
                .runSingle(result.itemId, {
                  title: 'Digest',
                  preferTabSession: true,
                  tabId: ctx.tabId,
                  itemLabel: ctx.title || ctx.url,
                })
                .catch(() => {});
            }, 0);
          }
        } catch (error) {
          showStatus(toStatusMessage(error, 'Could not save tab'));
        }
      } else {
        showStatus('Cannot save this page');
      }
    },
    [loadData, pipeline, showStatus]
  );

  const handleCreateItem = useCallback(
    async (data: { title: string; url?: string; notes?: string; collectionIds: string[] }) => {
      try {
        const saveUrl = (data.url || '').trim();
        let source: Item['source'] = 'tab';
        let title = data.title;

        const ctx = await getActiveTabBookmarkContext();
        if (ctx) {
          if (!title.trim() || title.trim() === saveUrl) {
            title = ctx.title || title;
          }
        }

        const result = await addItemWithMerge({
          url: saveUrl,
          title,
          tags: [],
          source,
          collectionIds: data.collectionIds,
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        });

        if (saveUrl && /^https?:\/\//i.test(saveUrl)) {
          let statusPrefix = 'Bookmark added';
          if (result.updatedPlacementNotes && result.addedToCollections.length === 0) {
            statusPrefix = 'Notes saved';
          } else if (result.alreadyInCollections.length > 0 && result.addedToCollections.length === 0) {
            statusPrefix = 'Already saved in this collection';
          } else if (result.merged && result.addedToCollections.length > 0) {
            statusPrefix = 'Added to collection';
          }
          showStatus(statusPrefix);
          void loadData({ quiet: true }).then(() => {
            void import('../lib/storage/flushDurableBackup').then(({ flushDurableBackupSoon }) => {
              flushDurableBackupSoon();
            });
          });
          window.setTimeout(() => {
            void pipeline
              .runSingle(result.itemId, {
                title: 'Digest',
                preferTabSession: true,
                tabId: ctx?.tabId,
                itemLabel: title || saveUrl,
              })
              .catch(() => {});
          }, 0);
        } else {
          showStatus('Note added');
          void loadData({ quiet: true }).then(() => {
            void import('../lib/storage/flushDurableBackup').then(({ flushDurableBackupSoon }) => {
              flushDurableBackupSoon();
            });
          });
        }
      } catch (error) {
        showStatus(toStatusMessage(error, 'Could not add item'));
        throw error;
      }
    },
    [loadData, pipeline, showStatus]
  );

  const handleCreateExternalLink = useCallback(
    async (data: { url: string; collectionIds: string[] }) => {
      const saveUrl = data.url.trim();
      try {
        const result = await addItemWithMerge({
          url: saveUrl,
          title: saveUrl,
          tags: [],
          source: 'manual',
          collectionIds: data.collectionIds,
        });

        let statusPrefix = 'External link saved';
        if (result.alreadyInCollections.length > 0 && result.addedToCollections.length === 0) {
          statusPrefix = 'Already saved in this collection';
        } else if (result.merged && result.addedToCollections.length > 0) {
          statusPrefix = 'Added to collection';
        }

        setExternalLinks((prev) => [
          ...prev,
          { itemId: result.itemId, url: saveUrl },
        ]);
        showStatus(statusPrefix);
        void loadData().then(() => {
          void import('../lib/storage/flushDurableBackup').then(({ flushDurableBackupSoon }) => {
            flushDurableBackupSoon();
          });
        });
        if (/^https?:\/\//i.test(saveUrl)) {
          void pipeline
            .runSingle(result.itemId, {
              title: 'Digest',
              itemLabel: saveUrl,
            })
            .catch(() => {});
        }
        return result.itemId;
      } catch (error) {
        showStatus(toStatusMessage(error, 'Could not save external link'));
        throw error;
      }
    },
    [loadData, pipeline, showStatus]
  );

  const handleUpdateItem = useCallback(
    async (
      id: string,
      data: {
        title: string;
        url?: string;
        notes?: string;
        collectionIds: string[];
        notesPlacementCollectionId?: string;
      }
    ) => {
      await updateItem(
        id,
        {
          title: data.title,
          url: data.url || '',
          notes: data.notes,
          collectionIds: data.collectionIds,
        },
        data.notesPlacementCollectionId
          ? { notesPlacementCollectionId: data.notesPlacementCollectionId }
          : undefined
      );
      await loadData();
      const { flushDurableBackupSoon } = await import('../lib/storage/flushDurableBackup');
      flushDurableBackupSoon();
      showStatus('Bookmark updated');
    },
    [loadData, showStatus]
  );

  return (
    <SidePanelView
      projects={projects}
      collections={collections}
      items={visibleItems}
      onSaveTab={handleSaveCurrentTab}
      onCreateItem={handleCreateItem}
      onCreateExternalLink={handleCreateExternalLink}
      onUpdateItem={handleUpdateItem}
      onDeleteItem={onDeleteItem}
      onCreateProject={onCreateProject}
      onCreateCollection={onCreateCollection}
      onOpenFullPage={onOpenFullPage}
      onSetAsBrowserHome={onSetAsBrowserHome}
      status={status}
      externalLinks={externalLinks}
      onHostTabNavigate={clearExternalLinks}
      onHostTabContext={handleHostTabContext}
      savedStatePending={savedStatePending}
    />
  );
};
