import React, { useCallback, useState } from 'react';
import { addItemWithMerge, Collection, Item, Project, updateItem, normalizeBookmarkUrl } from '../lib/db';
import { preferTabSessionForDigest } from '../lib/enrichment/xFetchHeuristics';
import { getActiveTabBookmarkContext, resolveTabBookmarkUrl } from '../lib/tabUrlCapture';
import { usePipelineProgress } from './dashboard/PipelineProgressProvider';
import { SidePanelView } from './SidePanelView';

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
  loadData: () => Promise<void>;
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
  const [digestItemId, setDigestItemId] = useState<string | null>(null);
  const [digestStatus, setDigestStatus] = useState('');
  const statusClearRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = useCallback((message: string, holdMs = 2500) => {
    if (statusClearRef.current) clearTimeout(statusClearRef.current);
    setStatus(message);
    statusClearRef.current = setTimeout(() => setStatus(''), holdMs);
  }, []);

  const runDigestWithModal = useCallback(
    async (
      itemId: string,
      opts?: { preferTabSession?: boolean; tabId?: number; statusPrefix?: string }
    ) => {
      const item = items.find((i) => i.id === itemId);
      const itemLabel = item?.title?.trim() || item?.url || itemId;
      setDigestItemId(itemId);
      setDigestStatus('Starting digest…');
      if (opts?.statusPrefix) {
        showStatus(`${opts.statusPrefix} — digesting…`, 4000);
      }
      try {
        const result = await pipeline.runSingle(itemId, {
          title: 'Digesting bookmark',
          preferTabSession: opts?.preferTabSession,
          tabId: opts?.tabId,
          itemLabel,
        });
        setDigestStatus(result.message);
        return result;
      } catch (error) {
        const msg = toStatusMessage(error, 'Digest failed');
        setDigestStatus(msg);
        throw error;
      }
    },
    [items, pipeline, showStatus]
  );

  const handleSaveCurrentTab = useCallback(
    async (collectionId?: string) => {
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

          await loadData();
          const preferTab = preferTabSessionForDigest(ctx.url);
          void runDigestWithModal(result.itemId, {
            preferTabSession: preferTab,
            tabId: preferTab ? ctx.tabId : undefined,
            statusPrefix,
          });
        } catch (error) {
          showStatus(toStatusMessage(error, 'Could not save tab'));
        }
      } else {
        showStatus('Cannot save this page');
      }
    },
    [loadData, runDigestWithModal, showStatus]
  );

  const handleCreateItem = useCallback(
    async (data: { title: string; url?: string; notes?: string; collectionIds: string[] }) => {
      try {
        let saveUrl = (data.url || '').trim();
        let tabId: number | undefined;
        let source: Item['source'] = 'manual';
        let title = data.title;

        const ctx = await getActiveTabBookmarkContext();
        if (ctx && saveUrl) {
          tabId = ctx.tabId;
          saveUrl = await resolveTabBookmarkUrl(ctx.tabId, saveUrl);
          if (!title.trim() || title.trim() === data.url?.trim()) {
            title = ctx.title || title;
          }
          if (normalizeBookmarkUrl(saveUrl) === normalizeBookmarkUrl(ctx.url)) {
            source = 'tab';
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
        await loadData();

        if (saveUrl && /^https?:\/\//i.test(saveUrl)) {
          let statusPrefix = 'Bookmark added';
          if (result.updatedPlacementNotes && result.addedToCollections.length === 0) {
            statusPrefix = 'Notes saved';
          } else if (result.alreadyInCollections.length > 0 && result.addedToCollections.length === 0) {
            statusPrefix = 'Already saved in this collection';
          } else if (result.merged && result.addedToCollections.length > 0) {
            statusPrefix = 'Added to collection';
          }
          const preferTab = preferTabSessionForDigest(saveUrl);
          void runDigestWithModal(result.itemId, {
            preferTabSession: preferTab,
            tabId: preferTab ? tabId : undefined,
            statusPrefix,
          });
        } else {
          showStatus('Note added');
        }
      } catch (error) {
        showStatus(toStatusMessage(error, 'Could not add item'));
        throw error;
      }
    },
    [loadData, runDigestWithModal, showStatus]
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
      const url = (data.url || '').trim();
      if (url && /^https?:\/\//i.test(url)) {
        void runDigestWithModal(id, { statusPrefix: 'Bookmark updated' });
      } else {
        showStatus('Bookmark updated');
      }
    },
    [loadData, runDigestWithModal, showStatus]
  );

  const displayStatus = status || digestStatus;

  return (
    <SidePanelView
      projects={projects}
      collections={collections}
      items={items}
      onSaveTab={handleSaveCurrentTab}
      onCreateItem={handleCreateItem}
      onUpdateItem={handleUpdateItem}
      onDeleteItem={onDeleteItem}
      onCreateProject={onCreateProject}
      onCreateCollection={onCreateCollection}
      onOpenFullPage={onOpenFullPage}
      onSetAsBrowserHome={onSetAsBrowserHome}
      status={displayStatus}
      digestItemId={digestItemId}
      digestStatus={digestStatus}
      digestRunning={pipeline.isRunning}
    />
  );
};
