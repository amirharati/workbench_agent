import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addItemWithMerge,
  Collection,
  findActiveItemsByUrlInReadBuffer,
  getActiveItemsByUrlFast,
  Item,
  normalizeBookmarkUrl,
  Project,
  updateItem,
} from '../lib/db';
import {
  lookupWorkingSetByUrl,
  pinItemsForUrl,
  syncOpenTabUrls,
} from '../lib/storage/workingSetCache';
import { getActiveTabBookmarkContext } from '../lib/tabUrlCapture';
import { usePipelineProgress } from './dashboard/PipelineProgressProvider';
import { SidePanelView } from './SidePanelView';
import type { SessionExternalLink } from './SidePanelExternalSection';

function toStatusMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function mergeItemsById(...lists: Item[][]): Item[] {
  const byId = new Map<string, Item>();
  for (const list of lists) {
    for (const item of list) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function itemsMatchingUrl(items: Item[], tabUrl: string): Item[] {
  const target = normalizeBookmarkUrl(tabUrl.trim());
  if (!target) return [];
  return items
    .filter(
      (item) =>
        item.deletedAt == null &&
        !!item.url &&
        normalizeBookmarkUrl(item.url) === target
    )
    .slice(0, 5);
}

async function refreshOpenTabsIntoWorkingSet(): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;
    const tabs = await chrome.tabs.query({});
    const urls = tabs.map((t) => t.url).filter((u): u is string => Boolean(u));
    syncOpenTabUrls(urls);
  } catch {
    /* ignore — side panel may lack tabs permission briefly */
  }
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
  /** Only true on true cold start with empty memory — never block on DB round-trip. */
  const [savedStatePending, setSavedStatePending] = useState(false);
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

  useEffect(() => {
    void refreshOpenTabsIntoWorkingSet();
  }, []);

  const handleHostTabContext = useCallback(
    async (tabUrl: string) => {
      const seq = ++lookupSeqRef.current;
      const instant = mergeItemsById(
        lookupWorkingSetByUrl(tabUrl) ?? [],
        findActiveItemsByUrlInReadBuffer(tabUrl),
        itemsMatchingUrl(items, tabUrl)
      );
      if (seq === lookupSeqRef.current) {
        setFastItems(instant);
        // Never gate Save on DB — memory answer is enough (empty = not saved yet).
        setSavedStatePending(false);
      }

      // Background pull — refresh working set without blocking UI.
      void getActiveItemsByUrlFast(tabUrl)
        .then((matches) => {
          if (seq !== lookupSeqRef.current) return;
          pinItemsForUrl(tabUrl, matches, { durable: true });
          setFastItems(matches);
        })
        .catch(() => {
          /* keep instant answer */
        });
    },
    [items]
  );

  const handleSaveCurrentTab = useCallback(
    async (collectionId?: string) => {
      showStatus('Saving…');
      await new Promise<void>((r) => setTimeout(r, 0));

      const ctx = await getActiveTabBookmarkContext();
      if (ctx?.url && (/^https?:\/\//i.test(ctx.url) || /^file:\/\//i.test(ctx.url))) {
        const collectionIds = collectionId ? [collectionId] : [];
        try {
          const result = await addItemWithMerge(
            {
              url: ctx.url,
              title: ctx.title || 'Untitled',
              favicon: ctx.favIconUrl,
              tags: [],
              source: 'tab',
              collectionIds,
            },
            { awaitDurable: false }
          );

          let statusPrefix = 'Tab saved';
          if (result.alreadyInCollections.length > 0 && result.addedToCollections.length === 0) {
            statusPrefix = 'Already saved in this collection';
          } else if (result.merged && result.addedToCollections.length > 0) {
            statusPrefix = 'Added to collection';
          }

          showStatus(statusPrefix);
          // Optimistic: pull item into fastItems from read buffer for instant Already saved.
          const optimistic = findActiveItemsByUrlInReadBuffer(ctx.url);
          if (optimistic.length) setFastItems(optimistic);

          void loadData({ quiet: true }).then(() => {
            void import('../lib/storage/flushDurableBackup').then(({ flushDurableBackupSoon }) => {
              flushDurableBackupSoon();
            });
          });

          if (result.itemId && /^https?:\/\//i.test(ctx.url)) {
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

        const result = await addItemWithMerge(
          {
            url: saveUrl,
            title,
            tags: [],
            source,
            collectionIds: data.collectionIds,
            ...(data.notes !== undefined ? { notes: data.notes } : {}),
          },
          { awaitDurable: false }
        );

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
          const optimistic = findActiveItemsByUrlInReadBuffer(saveUrl);
          if (optimistic.length) setFastItems(optimistic);
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
        const result = await addItemWithMerge(
          {
            url: saveUrl,
            title: saveUrl,
            tags: [],
            source: 'manual',
            collectionIds: data.collectionIds,
          },
          { awaitDurable: false }
        );

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
      showStatus('Saved');
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
