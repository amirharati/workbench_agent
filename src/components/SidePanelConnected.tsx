import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addItemWithMerge,
  Collection,
  findActiveItemsByUrlInReadBuffer,
  getActiveItemsByUrlFast,
  getItem,
  Item,
  normalizeBookmarkUrl,
  Project,
  updateItem,
} from '../lib/db';
import {
  lookupWorkingSetByUrl,
  pinItemsForUrl,
  pinSavedItem,
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
  return items.filter(
    (item) =>
      item.deletedAt == null &&
      !!item.url &&
      normalizeBookmarkUrl(item.url) === target
  );
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

function mergePreferNewer(base: Item[], overlay: Item[]): Item[] {
  const byId = new Map(base.map((item) => [item.id, item]));
  for (const item of overlay) {
    const prev = byId.get(item.id);
    if (!prev || (item.updated_at ?? 0) >= (prev.updated_at ?? 0)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
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
  const [localCollections, setLocalCollections] = useState<Collection[]>([]);
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
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
    // Prefer fresher rows — stale fastItems must not clobber loadData after org edits.
    return mergePreferNewer(items, fastItems);
  }, [items, fastItems]);

  const visibleCollections = useMemo(() => {
    if (localCollections.length === 0) return collections;
    const byId = new Map(collections.map((c) => [c.id, c]));
    for (const c of localCollections) {
      if (!byId.has(c.id)) byId.set(c.id, c);
    }
    return [...byId.values()];
  }, [collections, localCollections]);

  const visibleProjects = useMemo(() => {
    if (localProjects.length === 0) return projects;
    const byId = new Map(projects.map((p) => [p.id, p]));
    for (const p of localProjects) {
      if (!byId.has(p.id)) byId.set(p.id, p);
    }
    return [...byId.values()];
  }, [projects, localProjects]);

  useEffect(() => {
    if (localCollections.length === 0) return;
    setLocalCollections((prev) => prev.filter((c) => !collections.some((x) => x.id === c.id)));
  }, [collections, localCollections.length]);

  useEffect(() => {
    if (localProjects.length === 0) return;
    setLocalProjects((prev) => prev.filter((p) => !projects.some((x) => x.id === p.id)));
  }, [projects, localProjects.length]);

  const handleCreateProjectLocal = useCallback(
    async (data: { name: string; description?: string }) => {
      const id = await onCreateProject(data);
      if (id) {
        const now = Date.now();
        setLocalProjects((prev) => [
          ...prev.filter((p) => p.id !== id),
          {
            id,
            name: data.name.trim(),
            description: data.description,
            isDefault: false,
            created_at: now,
            updated_at: now,
          },
        ]);
      }
      return id;
    },
    [onCreateProject]
  );

  const handleCreateCollectionLocal = useCallback(
    async (data: { name: string; projectId: string }) => {
      const id = await onCreateCollection(data);
      if (id) {
        const now = Date.now();
        setLocalCollections((prev) => [
          ...prev.filter((c) => c.id !== id),
          {
            id,
            name: data.name.trim(),
            created_at: now,
            updated_at: now,
            primaryProjectId: data.projectId,
            projectIds: [data.projectId],
            isDefault: false,
            color: '#3b82f6',
          },
        ]);
      }
      return id;
    },
    [onCreateCollection]
  );

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
        // Merge — never replace; optimistic org edits must survive tab-context refresh.
        setFastItems((prev) => mergePreferNewer(prev, instant));
        // Never gate Save on DB — memory answer is enough (empty = not saved yet).
        setSavedStatePending(false);
      }

      // Background pull — refresh working set without blocking UI.
      void getActiveItemsByUrlFast(tabUrl)
        .then((matches) => {
          if (seq !== lookupSeqRef.current) return;
          pinItemsForUrl(tabUrl, matches, { durable: true });
          setFastItems((prev) => mergePreferNewer(prev, matches));
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
        tags?: string[];
        notesPlacementCollectionId?: string;
      }
    ) => {
      // Paint membership / notes changes immediately (Already saved + org chips).
      setFastItems((prev) => {
        const cur =
          prev.find((i) => i.id === id) ??
          items.find((i) => i.id === id) ??
          (data.url
            ? findActiveItemsByUrlInReadBuffer(data.url).find((i) => i.id === id)
            : undefined);
        if (!cur) return prev;
        const optimistic: Item = {
          ...cur,
          title: data.title,
          url: data.url || cur.url,
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          collectionIds: data.collectionIds,
          ...(data.tags !== undefined ? { tags: data.tags } : {}),
          updated_at: Date.now(),
        };
        if (optimistic.url) pinSavedItem(optimistic.url, optimistic, { durable: true });
        return mergePreferNewer(
          prev.filter((i) => i.id !== id),
          [optimistic]
        );
      });

      await updateItem(
        id,
        {
          title: data.title,
          url: data.url || '',
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          collectionIds: data.collectionIds,
          ...(data.tags !== undefined ? { tags: data.tags } : {}),
        },
        data.notesPlacementCollectionId
          ? { notesPlacementCollectionId: data.notesPlacementCollectionId }
          : undefined
      );
      const fresh = await getItem(id);
      if (fresh?.url) {
        pinSavedItem(fresh.url, fresh, { durable: true });
        setFastItems((prev) => {
          const others = prev.filter((i) => i.id !== fresh.id);
          return mergePreferNewer(others, [fresh]);
        });
      }
      await loadData({ quiet: true });
      const { flushDurableBackupSoon } = await import('../lib/storage/flushDurableBackup');
      flushDurableBackupSoon();
      showStatus('Saved');
    },
    [items, loadData, showStatus]
  );

  return (
    <SidePanelView
      projects={visibleProjects}
      collections={visibleCollections}
      items={visibleItems}
      onSaveTab={handleSaveCurrentTab}
      onCreateItem={handleCreateItem}
      onCreateExternalLink={handleCreateExternalLink}
      onUpdateItem={handleUpdateItem}
      onDeleteItem={onDeleteItem}
      onCreateProject={handleCreateProjectLocal}
      onCreateCollection={handleCreateCollectionLocal}
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
