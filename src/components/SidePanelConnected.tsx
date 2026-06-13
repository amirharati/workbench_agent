import React, { useCallback, useState } from 'react';
import { addItemWithMerge, Collection, Item, Project, updateItem } from '../lib/db';
import { preferTabSessionForDigest } from '../lib/enrichment/xFetchHeuristics';
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
  const [tabDigestItemId, setTabDigestItemId] = useState<string | null>(null);
  const [tabDigestStatus, setTabDigestStatus] = useState('');
  const [externalLinks, setExternalLinks] = useState<SessionExternalLink[]>([]);
  const statusClearRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = useCallback((message: string, holdMs = 2500) => {
    if (statusClearRef.current) clearTimeout(statusClearRef.current);
    setStatus(message);
    statusClearRef.current = setTimeout(() => setStatus(''), holdMs);
  }, []);

  const clearTabDigest = useCallback(() => {
    setTabDigestItemId(null);
    setTabDigestStatus('');
  }, []);

  const clearExternalLinks = useCallback(() => {
    setExternalLinks([]);
  }, []);

  const runTabDigest = useCallback(
    async (
      itemId: string,
      opts?: { preferTabSession?: boolean; tabId?: number; statusPrefix?: string }
    ) => {
      const item = items.find((i) => i.id === itemId);
      const itemLabel = item?.title?.trim() || item?.url || itemId;
      setTabDigestItemId(itemId);
      setTabDigestStatus('Starting digest…');
      if (opts?.statusPrefix) {
        showStatus(`${opts.statusPrefix} — digesting…`, 4000);
      }
      try {
        const result = await pipeline.runSingle(itemId, {
          title: 'Digesting bookmark',
          preferTabSession: opts?.preferTabSession,
          tabId: opts?.tabId,
          itemLabel,
          forceEnrich: true,
        });
        setTabDigestStatus(result.message);
        return result;
      } catch (error) {
        const msg = toStatusMessage(error, 'Digest failed');
        setTabDigestStatus(msg);
        throw error;
      }
    },
    [items, pipeline, showStatus]
  );

  const runExternalDigest = useCallback(
    async (itemId: string, url: string, statusPrefix: string) => {
      const item = items.find((i) => i.id === itemId);
      const itemLabel = item?.title?.trim() || url;
      setExternalLinks((prev) =>
        prev.map((entry) =>
          entry.itemId === itemId ? { ...entry, digestStatus: 'Starting digest…' } : entry
        )
      );
      showStatus(`${statusPrefix} — digesting…`, 4000);
      try {
        const result = await pipeline.runSingle(itemId, {
          title: 'Digesting external link',
          preferTabSession: false,
          itemLabel,
          forceEnrich: true,
        });
        setExternalLinks((prev) =>
          prev.map((entry) =>
            entry.itemId === itemId ? { ...entry, digestStatus: result.message } : entry
          )
        );
        return result;
      } catch (error) {
        const msg = toStatusMessage(error, 'Digest failed');
        setExternalLinks((prev) =>
          prev.map((entry) =>
            entry.itemId === itemId ? { ...entry, digestStatus: msg } : entry
          )
        );
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
          void runTabDigest(result.itemId, {
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
    [loadData, runTabDigest, showStatus]
  );

  const handleCreateItem = useCallback(
    async (data: { title: string; url?: string; notes?: string; collectionIds: string[] }) => {
      try {
        const saveUrl = (data.url || '').trim();
        let tabId: number | undefined;
        let source: Item['source'] = 'tab';
        let title = data.title;

        const ctx = await getActiveTabBookmarkContext();
        if (ctx) {
          tabId = ctx.tabId;
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
          void runTabDigest(result.itemId, {
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
    [loadData, runTabDigest, showStatus]
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
        await loadData();

        let statusPrefix = 'External link saved';
        if (result.alreadyInCollections.length > 0 && result.addedToCollections.length === 0) {
          statusPrefix = 'Already saved in this collection';
        } else if (result.merged && result.addedToCollections.length > 0) {
          statusPrefix = 'Added to collection';
        }

        setExternalLinks((prev) => [
          ...prev,
          { itemId: result.itemId, url: saveUrl, digestStatus: 'Starting digest…' },
        ]);

        void runExternalDigest(result.itemId, saveUrl, statusPrefix);
        return result.itemId;
      } catch (error) {
        showStatus(toStatusMessage(error, 'Could not save external link'));
        throw error;
      }
    },
    [loadData, runExternalDigest, showStatus]
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
        void runTabDigest(id, { statusPrefix: 'Bookmark updated' });
      } else {
        showStatus('Bookmark updated');
      }
    },
    [loadData, runTabDigest, showStatus]
  );

  const displayStatus = status || tabDigestStatus;

  return (
    <SidePanelView
      projects={projects}
      collections={collections}
      items={items}
      onSaveTab={handleSaveCurrentTab}
      onCreateItem={handleCreateItem}
      onCreateExternalLink={handleCreateExternalLink}
      onUpdateItem={handleUpdateItem}
      onDeleteItem={onDeleteItem}
      onCreateProject={onCreateProject}
      onCreateCollection={onCreateCollection}
      onOpenFullPage={onOpenFullPage}
      onSetAsBrowserHome={onSetAsBrowserHome}
      status={displayStatus}
      tabDigestItemId={tabDigestItemId}
      tabDigestStatus={tabDigestStatus}
      externalLinks={externalLinks}
      digestRunning={pipeline.isRunning}
      onHostTabUrlChange={clearTabDigest}
      onHostTabNavigate={clearExternalLinks}
    />
  );
};
