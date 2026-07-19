import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Save, RefreshCw, Pin, Star } from 'lucide-react';
import { Collection, Item, Project, normalizeBookmarkUrl } from '../lib/db';
import { getActiveTabBookmarkContext } from '../lib/tabUrlCapture';
import { favoriteItem, pinItem, unfavoriteItem, unpinItem } from '../lib/itemQuickAccess';
import { Panel, Input, ButtonGhost, ButtonPrimary, Divider } from '../styles/primitives';
import { isValidBookmarkUrl } from '../lib/utils';
import { SidePanelDigestPanel } from './SidePanelDigestPanel';
import { SidePanelExternalSection, type SessionExternalLink } from './SidePanelExternalSection';
import { ItemOrganizationEditor } from './dashboard/ItemOrganizationEditor';

interface SidePanelViewProps {
  projects: Project[];
  collections: Collection[];
  items: Item[];
  onSaveTab: (collectionId?: string) => Promise<void>;
  onCreateItem: (data: { title: string; url?: string; notes?: string; collectionIds: string[] }) => Promise<void>;
  onCreateExternalLink: (data: { url: string; collectionIds: string[] }) => Promise<string | void>;
  onUpdateItem: (id: string, data: {
    title: string;
    url?: string;
    notes?: string;
    collectionIds: string[];
    tags?: string[];
    notesPlacementCollectionId?: string;
  }) => Promise<void>;
  onDeleteItem: (id: string, collectionId?: string) => Promise<void>;
  onCreateProject: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection: (data: { name: string; projectId: string }) => Promise<string | void>;
  onOpenFullPage: () => void;
  onSetAsBrowserHome: () => Promise<void>;
  status: string;
  tabDigestItemId?: string | null;
  tabDigestStatus?: string;
  externalLinks?: SessionExternalLink[];
  onHostTabUrlChange?: () => void;
  onHostTabNavigate?: () => void;
  onHostTabContext?: (url: string) => void;
  savedStatePending?: boolean;
}

function itemPlacementCount(item: Item): number {
  if (item.placements) return Object.keys(item.placements).length;
  return item.collectionIds?.length || 0;
}

const sidePanelIconBtn: React.CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--bg-glass)',
  color: 'var(--text)',
  borderRadius: 6,
  padding: '2px 6px',
  fontSize: 'var(--text-xs)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const ItemPinFavoriteButtons: React.FC<{
  item: Item;
  compact?: boolean;
}> = ({ item, compact }) => {
  if (item.deletedAt) return null;
  const iconSize = compact ? 12 : 14;
  return (
    <>
      <button
        type="button"
        title={item.favoriteAt ? 'Remove from favorites' : 'Add to favorites'}
        onClick={(e) => {
          e.stopPropagation();
          void (item.favoriteAt ? unfavoriteItem(item.id) : favoriteItem(item.id));
        }}
        style={{
          ...sidePanelIconBtn,
          color: item.favoriteAt ? '#ef4444' : 'var(--text-muted)',
          background: item.favoriteAt ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-glass)',
        }}
      >
        <Star size={iconSize} fill={item.favoriteAt ? '#ef4444' : 'none'} />
      </button>
      <button
        type="button"
        title={item.pinnedAt ? 'Unpin' : 'Pin'}
        onClick={(e) => {
          e.stopPropagation();
          void (item.pinnedAt ? unpinItem(item.id) : pinItem(item.id));
        }}
        style={{
          ...sidePanelIconBtn,
          background: item.pinnedAt ? 'var(--accent-weak)' : 'var(--bg-glass)',
        }}
      >
        <Pin size={iconSize} style={{ opacity: item.pinnedAt ? 1 : 0.55 }} />
      </button>
    </>
  );
};

export const SidePanelView: React.FC<SidePanelViewProps> = ({
  projects,
  collections,
  items,
  onSaveTab,
  onCreateItem,
  onCreateExternalLink,
  onUpdateItem,
  onDeleteItem,
  onCreateProject,
  onCreateCollection,
  onOpenFullPage,
  onSetAsBrowserHome,
  status,
  tabDigestItemId,
  tabDigestStatus,
  externalLinks = [],
  onHostTabUrlChange,
  onHostTabNavigate,
  onHostTabContext,
  savedStatePending = false,
}) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showNewProjectInline, setShowNewProjectInline] = useState(false);
  const [showNewCollectionInline, setShowNewCollectionInline] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoSaveFlash, setAutoSaveFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedExistingItemId, setSelectedExistingItemId] = useState<string | null>(null);
  const [selectedPlacementCollectionId, setSelectedPlacementCollectionId] = useState<string | null>(null);
  const [forceNewCopyMode, setForceNewCopyMode] = useState(false);
  const [externalSectionOpen, setExternalSectionOpen] = useState(false);
  const prefillSeqRef = useRef(0);
  const hostTabIdRef = useRef<number | null>(null);
  const lastPrefilledRef = useRef<{ url: string; title: string }>({ url: '', title: '' });
  const activeTabUrlRef = useRef('');
  /** Last item title mirrored into the form — used to apply digest tier2 upgrades without clobbering edits. */
  const syncedItemTitleRef = useRef('');
  /** Snapshot of last persisted edit fields — skips no-op autosaves after load/select. */
  const editBaselineRef = useRef<{
    itemId: string;
    title: string;
    notes: string;
    collectionId: string;
  } | null>(null);
  const autoSaveFlashTimerRef = useRef<number | null>(null);
  const autoSaveInFlightRef = useRef(false);

  const themedSelectStyle: React.CSSProperties = {
    width: '100%',
    height: 30,
    padding: '0 0.5rem',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--input-bg)',
    color: 'var(--text)',
    fontSize: 'var(--text-sm)',
  };

  const themedOptionStyle: React.CSSProperties = {
    background: 'var(--bg-panel)',
    color: 'var(--text)',
  };

  const collectionsForProject = (pid: string) =>
    collections.filter(
      (c) => c.primaryProjectId === pid || (Array.isArray(c.projectIds) && c.projectIds.includes(pid))
    );
  const isUnsorted = (c: Collection) => c.isDefault || /^unsorted$/i.test(c.name);

  const defaultProjectId = useMemo(() => {
    const def = projects.find((p) => p.isDefault)?.id;
    return def || projects[0]?.id || '';
  }, [projects]);
  const selectedProjectIsInbox = projects.find((project) => project.id === projectId)?.isDefault === true;

  // Auto-set project to default only on initial mount, not when user clears it
  useEffect(() => {
    if (!projectId && defaultProjectId && !forceNewCopyMode) {
      setProjectId(defaultProjectId);
    }
  }, [projectId, defaultProjectId, forceNewCopyMode]);

  const scopedCollections = useMemo(() => collectionsForProject(projectId), [collections, projectId]);
  const matchingItems = useMemo(() => {
    const trimmed = url.trim();
    if (!trimmed || !isValidBookmarkUrl(trimmed)) return [];
    const target = normalizeBookmarkUrl(trimmed);
    return items.filter((item) => item.url && normalizeBookmarkUrl(item.url) === target);
  }, [items, url]);

  // Expand matching items into placement rows - one per (item, collection) pair
  type PlacementRow = {
    item: Item;
    collectionId: string;
    collection: Collection | undefined;
    project: Project | undefined;
  };
  const matchingPlacements = useMemo((): PlacementRow[] => {
    const rows: PlacementRow[] = [];
    for (const item of matchingItems) {
      const collectionIds = item.collectionIds || [];
      for (const cid of collectionIds) {
        const collection = collections.find((c) => c.id === cid);
        const project = collection
          ? projects.find((p) => p.id === collection.primaryProjectId)
          : undefined;
        // Still list the placement while a just-created collection is catching up in props.
        rows.push({
          item,
          collectionId: cid,
          collection: collection ?? {
            id: cid,
            name: 'Saving…',
            created_at: 0,
            updated_at: 0,
            primaryProjectId: '',
            projectIds: [],
            isDefault: false,
          },
          project,
        });
      }
    }
    return rows;
  }, [matchingItems, collections, projects]);

  const selectedExistingItem = useMemo(
    () => matchingItems.find((item) => item.id === selectedExistingItemId) || null,
    [matchingItems, selectedExistingItemId]
  );
  /** Fresh pin/fav flags from `items` after BroadcastChannel refresh */
  const selectedItemLive = useMemo(() => {
    if (!selectedExistingItemId) return null;
    return items.find((i) => i.id === selectedExistingItemId) ?? selectedExistingItem;
  }, [items, selectedExistingItemId, selectedExistingItem]);
  const hasExistingForUrl = matchingItems.length > 0;

  const tabPipelineItemId = useMemo(() => {
    if (tabDigestItemId) return tabDigestItemId;
    if (
      selectedExistingItemId &&
      matchingItems.some((item) => item.id === selectedExistingItemId)
    ) {
      return selectedExistingItemId;
    }
    return matchingItems[0]?.id ?? null;
  }, [tabDigestItemId, selectedExistingItemId, matchingItems]);

  const showTabPipelinePanel =
    !!tabPipelineItemId &&
    (tabDigestItemId === tabPipelineItemId ||
      (!!url.trim() && isValidBookmarkUrl(url.trim())));

  // Auto-set collection when project changes, but not in new copy mode (user must pick explicitly)
  useEffect(() => {
    if (!projectId) return;
    if (forceNewCopyMode) return; // Don't auto-fill in new copy mode
    if (scopedCollections.some((c) => c.id === collectionId)) return;
    const unsorted = scopedCollections.find(isUnsorted);
    setCollectionId(unsorted?.id || scopedCollections[0]?.id || '');
  }, [projectId, scopedCollections, collectionId, forceNewCopyMode]);

  const selectExistingItemForEdit = useCallback((item: Item, placementCollectionId?: string) => {
    setForceNewCopyMode(false);
    setSelectedExistingItemId(item.id);
    const itemTitle = item.title || '';
    syncedItemTitleRef.current = itemTitle;
    setTitle(itemTitle);
    setUrl(item.url || '');

    const targetCollectionId = placementCollectionId || item.collectionIds?.[0];
    setSelectedPlacementCollectionId(targetCollectionId || null);

    const placementNotes = targetCollectionId ? item.placements?.[targetCollectionId]?.notes : undefined;
    const nextNotes = placementNotes || item.notes || '';
    setNotes(nextNotes);

    if (targetCollectionId) {
      setCollectionId(targetCollectionId);
      const col = collections.find((c) => c.id === targetCollectionId);
      if (col) {
        setProjectId((prev) => {
          const stays =
            !!prev &&
            (col.primaryProjectId === prev ||
              (Array.isArray(col.projectIds) && col.projectIds.includes(prev)));
          return stays ? prev : col.primaryProjectId;
        });
      }
    }
    editBaselineRef.current = {
      itemId: item.id,
      title: (itemTitle || item.url || '').trim(),
      notes: nextNotes.trim(),
      collectionId: targetCollectionId || '',
    };
    setError(null);
  }, [collections]);

  // In new copy mode: if user selects a collection that already has a placement,
  // switch to edit mode for that existing copy instead of creating a duplicate
  useEffect(() => {
    if (!forceNewCopyMode) return;
    if (!collectionId) return;

    const existingPlacement = matchingPlacements.find((p) => p.collectionId === collectionId);
    if (existingPlacement) {
      // This collection already has the bookmark — switch to editing it
      selectExistingItemForEdit(existingPlacement.item, existingPlacement.collectionId);
    }
  }, [forceNewCopyMode, collectionId, matchingPlacements, selectExistingItemForEdit]);

  // Keep highlighted card + form in sync with Project / Collection dropdowns (normal mode)
  useEffect(() => {
    if (forceNewCopyMode) return;

    if (matchingPlacements.length === 0) {
      if (selectedExistingItemId !== null || selectedPlacementCollectionId !== null) {
        setSelectedExistingItemId(null);
        setSelectedPlacementCollectionId(null);
        editBaselineRef.current = null;
      }
      return;
    }

    if (!collectionId) return;

    const placementForCollection = matchingPlacements.find((p) => p.collectionId === collectionId);

    if (placementForCollection) {
      const formUrl = url.trim();
      const sameResource =
        !formUrl ||
        normalizeBookmarkUrl(formUrl) ===
          normalizeBookmarkUrl(placementForCollection.item.url || '');
      if (!sameResource) {
        if (selectedExistingItemId !== null || selectedPlacementCollectionId !== null) {
          setSelectedExistingItemId(null);
          setSelectedPlacementCollectionId(null);
          editBaselineRef.current = null;
        }
        return;
      }
      if (
        selectedExistingItemId !== placementForCollection.item.id ||
        selectedPlacementCollectionId !== placementForCollection.collectionId
      ) {
        selectExistingItemForEdit(placementForCollection.item, placementForCollection.collectionId);
      }
      return;
    }

    // Collection has no placement yet — keep editing the current item so changing
    // project/collection can add membership and autosave (don't drop selection).
    if (
      selectedExistingItemId &&
      matchingItems.some((i) => i.id === selectedExistingItemId)
    ) {
      return;
    }

    if (selectedExistingItemId !== null || selectedPlacementCollectionId !== null) {
      setSelectedExistingItemId(null);
      setSelectedPlacementCollectionId(null);
      editBaselineRef.current = null;
    }
  }, [
    matchingPlacements,
    matchingItems,
    collectionId,
    forceNewCopyMode,
    url,
    selectedExistingItemId,
    selectedPlacementCollectionId,
    selectExistingItemForEdit,
  ]);

  // Reflect DB title changes (digest / tier2) in the form without waiting for a tab switch.
  useEffect(() => {
    if (forceNewCopyMode) return;
    const id = tabPipelineItemId;
    if (!id) return;
    const live = items.find((i) => i.id === id);
    if (!live) return;
    const formUrl = url.trim();
    if (
      formUrl &&
      live.url &&
      normalizeBookmarkUrl(formUrl) !== normalizeBookmarkUrl(live.url)
    ) {
      return;
    }

    const liveTitle = (live.title || '').trim();
    const synced = syncedItemTitleRef.current;
    if (liveTitle === synced) return;

    syncedItemTitleRef.current = liveTitle;
    setTitle((current) => {
      const cur = current.trim();
      if (cur !== synced && cur !== '') return current;
      return liveTitle;
    });
    lastPrefilledRef.current.title = liveTitle;
  }, [items, tabPipelineItemId, url, forceNewCopyMode]);

  const createProjectInline = async () => {
    const name = newProjectName.trim();
    if (!name || creatingProject) return;
    setCreatingProject(true);
    setError(null);
    try {
      const createdId = await onCreateProject({ name });
      if (createdId) setProjectId(createdId);
      setNewProjectName('');
      setShowNewProjectInline(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  const createCollectionInline = async () => {
    const name = newCollectionName.trim();
    if (!name || !projectId || selectedProjectIsInbox || creatingCollection) return;
    setCreatingCollection(true);
    setError(null);
    try {
      const createdId = await onCreateCollection({ name, projectId });
      if (createdId) setCollectionId(createdId);
      setNewCollectionName('');
      setShowNewCollectionInline(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create collection');
    } finally {
      setCreatingCollection(false);
    }
  };

  const flashAutoSaved = useCallback(() => {
    setAutoSaveFlash(true);
    if (autoSaveFlashTimerRef.current != null) {
      window.clearTimeout(autoSaveFlashTimerRef.current);
    }
    autoSaveFlashTimerRef.current = window.setTimeout(() => {
      setAutoSaveFlash(false);
      autoSaveFlashTimerRef.current = null;
    }, 1600);
  }, []);

  const persistExistingIfDirty = useCallback(async () => {
    if (forceNewCopyMode || !selectedExistingItemId || submitting) return;
    if (autoSaveInFlightRef.current) return;

    const trimmedUrl = url.trim();
    if (!trimmedUrl || !isValidBookmarkUrl(trimmedUrl)) return;

    const existingItem =
      items.find((i) => i.id === selectedExistingItemId) ??
      matchingItems.find((i) => i.id === selectedExistingItemId);
    const membershipIds = existingItem?.collectionIds?.length
      ? existingItem.collectionIds
      : collectionId
        ? [collectionId]
        : [];
    if (membershipIds.length === 0) return;

    const notesPlacementId =
      (selectedPlacementCollectionId && membershipIds.includes(selectedPlacementCollectionId)
        ? selectedPlacementCollectionId
        : null) ||
      (collectionId && membershipIds.includes(collectionId) ? collectionId : null) ||
      membershipIds[0];

    const trimmedTitle = (title.trim() || trimmedUrl).trim();
    const trimmedNotes = notes.trim();
    const baseline = editBaselineRef.current;
    if (
      baseline &&
      baseline.itemId === selectedExistingItemId &&
      baseline.title === trimmedTitle &&
      baseline.notes === trimmedNotes &&
      baseline.collectionId === notesPlacementId
    ) {
      return;
    }

    autoSaveInFlightRef.current = true;
    setAutoSaving(true);
    setError(null);
    try {
      await onUpdateItem(selectedExistingItemId, {
        title: trimmedTitle,
        url: trimmedUrl,
        notes: trimmedNotes || undefined,
        collectionIds: membershipIds,
        notesPlacementCollectionId: notesPlacementId,
      });
      editBaselineRef.current = {
        itemId: selectedExistingItemId,
        title: trimmedTitle,
        notes: trimmedNotes,
        collectionId: notesPlacementId,
      };
      setSelectedPlacementCollectionId(notesPlacementId);
      if (notesPlacementId) setCollectionId(notesPlacementId);
      flashAutoSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update bookmark');
    } finally {
      autoSaveInFlightRef.current = false;
      setAutoSaving(false);
    }
  }, [
    forceNewCopyMode,
    selectedExistingItemId,
    submitting,
    collectionId,
    selectedPlacementCollectionId,
    url,
    title,
    notes,
    items,
    matchingItems,
    onUpdateItem,
    flashAutoSaved,
  ]);

  const persistOrganizationPatch = useCallback(
    async (patch: { collectionIds?: string[]; tags?: string[] }) => {
      if (forceNewCopyMode || !selectedExistingItemId) return;
      const existingItem =
        items.find((i) => i.id === selectedExistingItemId) ??
        matchingItems.find((i) => i.id === selectedExistingItemId);
      if (!existingItem) return;

      const trimmedUrl = (url.trim() || existingItem.url || '').trim();
      const trimmedTitle = (title.trim() || existingItem.title || trimmedUrl).trim();
      const nextCollectionIds = patch.collectionIds ?? existingItem.collectionIds ?? [];
      if (nextCollectionIds.length === 0) {
        setError('Keep at least one collection');
        return;
      }

      const notesPlacementId =
        (selectedPlacementCollectionId && nextCollectionIds.includes(selectedPlacementCollectionId)
          ? selectedPlacementCollectionId
          : null) || nextCollectionIds[0];

      // Optimistic item membership so "Already saved" list updates before loadData.
      setSelectedPlacementCollectionId(notesPlacementId);
      setCollectionId(notesPlacementId);
      const col = collections.find((c) => c.id === notesPlacementId);
      if (col) setProjectId(col.primaryProjectId);

      setAutoSaving(true);
      setError(null);
      try {
        await onUpdateItem(selectedExistingItemId, {
          title: trimmedTitle,
          url: trimmedUrl || undefined,
          collectionIds: nextCollectionIds,
          ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
          notesPlacementCollectionId: notesPlacementId,
        });
        editBaselineRef.current = {
          itemId: selectedExistingItemId,
          title: trimmedTitle,
          notes: notes.trim(),
          collectionId: notesPlacementId,
        };
        flashAutoSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update organization');
        throw err;
      } finally {
        setAutoSaving(false);
      }
    },
    [
      forceNewCopyMode,
      selectedExistingItemId,
      items,
      matchingItems,
      url,
      title,
      notes,
      selectedPlacementCollectionId,
      collections,
      onUpdateItem,
      flashAutoSaved,
    ]
  );

  // Autosave title/notes for an already-saved link (membership via organization editor).
  useEffect(() => {
    if (!selectedExistingItemId || forceNewCopyMode) return;
    const handle = window.setTimeout(() => {
      void persistExistingIfDirty();
    }, 450);
    return () => window.clearTimeout(handle);
  }, [title, notes, selectedExistingItemId, forceNewCopyMode, persistExistingIfDirty]);

  useEffect(() => {
    return () => {
      if (autoSaveFlashTimerRef.current != null) {
        window.clearTimeout(autoSaveFlashTimerRef.current);
      }
    };
  }, []);

  const submitItem = async () => {
    setError(null);
    const trimmedTitle = title.trim();
    const trimmedUrl = url.trim();
    const trimmedNotes = notes.trim();

    if (!projectId) {
      setError('Pick a project first');
      return;
    }
    if (!collectionId) {
      setError('Pick a collection');
      return;
    }
    if (!trimmedUrl) {
      setError('Bookmark requires a URL');
      return;
    }
    if (trimmedUrl && !isValidBookmarkUrl(trimmedUrl)) {
      setError('URL must be http(s) or a local file (file://)');
      return;
    }

    // Existing copy: flush any pending edits (same path as autosave).
    if (selectedExistingItemId && !forceNewCopyMode) {
      await persistExistingIfDirty();
      return;
    }

    setSubmitting(true);
    try {
      await onCreateItem({
        title: trimmedTitle || trimmedUrl,
        url: trimmedUrl,
        collectionIds: [collectionId],
        ...(trimmedNotes.length > 0 ? { notes: trimmedNotes } : {}),
      });
      setForceNewCopyMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add item');
    } finally {
      setSubmitting(false);
    }
  };

  const applyHostTabContext = useCallback(
    (tabUrl: string, tabTitle: string) => {
      const trimmedUrl = tabUrl.trim();
      if (!trimmedUrl || !isValidBookmarkUrl(trimmedUrl)) return;

      const tabChanged =
        normalizeBookmarkUrl(trimmedUrl) !== normalizeBookmarkUrl(activeTabUrlRef.current);

      if (tabChanged) {
        activeTabUrlRef.current = trimmedUrl;
        setForceNewCopyMode(false);
        setSelectedExistingItemId(null);
        setSelectedPlacementCollectionId(null);
        editBaselineRef.current = null;
        setNotes('');
        syncedItemTitleRef.current = '';
        onHostTabNavigate?.();
        onHostTabUrlChange?.();
      }

      const trimmedTitle = tabTitle.trim() || trimmedUrl;
      lastPrefilledRef.current = { url: trimmedUrl, title: trimmedTitle };
      setUrl(trimmedUrl);
      setTitle(trimmedTitle);
      syncedItemTitleRef.current = trimmedTitle;
      onHostTabContext?.(trimmedUrl);
    },
    [onHostTabContext, onHostTabNavigate, onHostTabUrlChange]
  );

  const prefillFromHostTab = useCallback(async () => {
    const seq = ++prefillSeqRef.current;
    try {
      const ctx = await getActiveTabBookmarkContext();
      if (seq !== prefillSeqRef.current || !ctx) return;
      hostTabIdRef.current = ctx.tabId;
      applyHostTabContext(ctx.url, ctx.title);
    } catch {
      // Ignore prefill failures in restricted contexts.
    }
  }, [applyHostTabContext]);

  useEffect(() => {
    void prefillFromHostTab();
  }, [prefillFromHostTab]);

  useEffect(() => {
    const onFocus = () => {
      void prefillFromHostTab();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void prefillFromHostTab();
      }
    };
    const onActivated = () => {
      void prefillFromHostTab();
    };
    const onUpdated = (
      tabId: number,
      changeInfo: { url?: string; title?: string; status?: string }
    ) => {
      if (hostTabIdRef.current != null && tabId !== hostTabIdRef.current) return;
      if (changeInfo.url || changeInfo.title || changeInfo.status === 'complete') {
        void prefillFromHostTab();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [prefillFromHostTab]);

  return (
    <div
      style={{
        padding: '0.65rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
        color: 'var(--text)',
        minHeight: '100vh',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      <SidePanelExternalSection
        open={externalSectionOpen}
        onToggleOpen={() => setExternalSectionOpen((v) => !v)}
        links={externalLinks}
        canSave={!!projectId && !!collectionId}
        saveHint={
          !projectId || !collectionId
            ? 'Pick a project and collection in “This page” below first'
            : undefined
        }
        onSave={async (externalUrl) => {
          await onCreateExternalLink({ url: externalUrl, collectionIds: [collectionId] });
          setExternalSectionOpen(true);
        }}
        onOpenInApp={onOpenFullPage}
      />

      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontWeight: 600,
          padding: '0.15rem 0.25rem',
        }}
      >
        This page
      </div>

      <ButtonPrimary
        onClick={() => {
          if (hasExistingForUrl) {
            if (selectedExistingItemId) void submitItem();
            return;
          }
          void (async () => {
            setForceNewCopyMode(false);
            setSelectedExistingItemId(null);
            editBaselineRef.current = null;
            try {
              await onSaveTab(collectionId || undefined);
            } finally {
              void prefillFromHostTab();
            }
          })();
        }}
        disabled={
          savedStatePending ||
          autoSaving ||
          submitting ||
          (hasExistingForUrl && !selectedExistingItemId && !forceNewCopyMode)
        }
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: '0.625rem',
          borderRadius: 8,
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
        }}
      >
        <Save size={16} />{' '}
        {savedStatePending
          ? 'Checking saved state…'
          : autoSaving || submitting
            ? 'Saving…'
            : hasExistingForUrl && !forceNewCopyMode
              ? selectedExistingItemId
                ? autoSaveFlash
                  ? 'Saved'
                  : 'Saved — edits auto-save'
                : 'Already saved'
              : 'Save This Tab'}
      </ButtonPrimary>

      {status && (
        <Panel
          style={{
            padding: '0.5rem',
            background: 'var(--accent-subtle, var(--bg-glass))',
            color: 'var(--text)',
            fontSize: 'var(--text-xs)',
            textAlign: 'center',
          }}
        >
          {status}
        </Panel>
      )}

      <Panel style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (selectedExistingItemId && !forceNewCopyMode) {
              void persistExistingIfDirty();
            }
          }}
          placeholder="Page title (optional)"
          style={{ height: 30, fontSize: 'var(--text-sm)' }}
        />

        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>
            Current page URL
          </div>
          <Input
            value={url}
            readOnly
            placeholder="Waiting for tab…"
            style={{
              height: 30,
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              cursor: 'default',
            }}
          />
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (selectedExistingItemId && !forceNewCopyMode) {
              void persistExistingIfDirty();
            }
          }}
          rows={5}
          placeholder="Notes (optional)"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            minHeight: 120,
            padding: '0.5rem 0.6rem',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--input-bg)',
            color: 'var(--text)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'inherit',
            lineHeight: 1.5,
            resize: 'vertical',
          }}
        />

        {selectedExistingItemId && !forceNewCopyMode ? (
          <div style={{ fontSize: '10px', color: 'var(--text-faint)', lineHeight: 1.35 }}>
            {autoSaving
              ? 'Saving changes…'
              : autoSaveFlash
                ? 'Saved'
                : 'Editing saved bookmark — title, notes, and organization save automatically.'}
          </div>
        ) : null}

        {selectedItemLive && !forceNewCopyMode ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              padding: '0.35rem 0.45rem',
              background: 'var(--bg-glass)',
              border: '1px solid var(--border)',
              borderRadius: 6,
            }}
          >
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flex: 1, minWidth: 0 }}>
              Quick access
            </span>
            <ItemPinFavoriteButtons item={selectedItemLive} />
          </div>
        ) : null}

        {selectedItemLive && selectedExistingItemId && !forceNewCopyMode ? (
          <div style={{ width: '100%', minWidth: 0 }}>
            <ItemOrganizationEditor
              item={selectedItemLive}
              collections={collections}
              projects={projects}
              editable
              compact
              onCreateProject={onCreateProject}
              onCreateCollection={onCreateCollection}
              onUpdate={persistOrganizationPatch}
            />
            <div style={{ fontSize: '10px', color: 'var(--text-faint)', marginTop: 4, lineHeight: 1.35 }}>
              Add the link to more projects/collections here — same as the dashboard. Notes below apply to the
              selected copy in the list.
            </div>
          </div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Project</span>
              <button
                type="button"
                onClick={() => setShowNewProjectInline((v) => !v)}
                style={{ border: 'none', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 'var(--text-xs)' }}
              >
                + New
              </button>
            </div>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              style={{
                ...themedSelectStyle,
                ...(forceNewCopyMode && !projectId ? { borderColor: 'var(--accent)', background: 'var(--accent-weak)' } : {}),
              }}
            >
              <option value="" style={themedOptionStyle}>
                {projects.length === 0 ? 'No projects' : '— Select project —'}
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id} style={themedOptionStyle}>
                  {p.name}
                  {p.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
            {showNewProjectInline && (
              <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  style={{
                    width: '100%',
                    height: 28,
                    padding: '0 0.45rem',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: 'var(--text-xs)',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void createProjectInline();
                  }}
                />
                <ButtonPrimary
                  onClick={() => void createProjectInline()}
                  disabled={!newProjectName.trim() || creatingProject}
                  style={{ padding: '0 0.45rem', fontSize: 'var(--text-xs)' }}
                >
                  {creatingProject ? '…' : 'Add'}
                </ButtonPrimary>
              </div>
            )}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Collection</span>
              {!selectedProjectIsInbox && <button
                type="button"
                onClick={() => setShowNewCollectionInline((v) => !v)}
                style={{ border: 'none', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 'var(--text-xs)' }}
              >
                + New
              </button>}
            </div>
            <select
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              style={{
                ...themedSelectStyle,
                ...(forceNewCopyMode && !collectionId ? { borderColor: 'var(--accent)', background: 'var(--accent-weak)' } : {}),
              }}
              disabled={!projectId}
            >
              <option value="" style={themedOptionStyle}>
                {!projectId ? 'Pick a project first' : scopedCollections.length === 0 ? 'No collections' : '— Select collection —'}
              </option>
              {scopedCollections.map((c) => (
                <option key={c.id} value={c.id} style={themedOptionStyle}>
                  {c.name}
                  {isUnsorted(c) ? ' (default)' : ''}
                </option>
              ))}
            </select>
            {showNewCollectionInline && !selectedProjectIsInbox && (
              <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                <input
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="Collection name"
                  style={{
                    width: '100%',
                    height: 28,
                    padding: '0 0.45rem',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: 'var(--text-xs)',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void createCollectionInline();
                  }}
                />
                <ButtonPrimary
                  onClick={() => void createCollectionInline()}
                  disabled={!newCollectionName.trim() || creatingCollection || !projectId}
                  style={{ padding: '0 0.45rem', fontSize: 'var(--text-xs)' }}
                >
                  {creatingCollection ? '…' : 'Add'}
                </ButtonPrimary>
              </div>
            )}
          </div>
        </div>
        )}

        {forceNewCopyMode && matchingPlacements.length > 0 && (
          <Panel
            style={{
              padding: '0.5rem',
              background: 'var(--accent-weak)',
              border: '1px solid var(--accent)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
            }}
          >
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 600 }}>
              Creating new copy
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.3 }}>
              Select a project and collection, add notes, then save.
            </div>
            <ButtonGhost
              type="button"
              onClick={() => {
                setForceNewCopyMode(false);
                // Re-select the first existing placement
                if (matchingPlacements[0]) {
                  selectExistingItemForEdit(matchingPlacements[0].item, matchingPlacements[0].collectionId);
                }
              }}
              style={{ padding: '0.25rem 0.4rem', fontSize: 'var(--text-xs)' }}
            >
              Cancel — edit existing copy instead
            </ButtonGhost>
          </Panel>
        )}

        {matchingPlacements.length > 0 && !forceNewCopyMode && (
          <Panel
            style={{
              padding: '0.5rem',
              background: 'var(--bg-glass)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem',
            }}
          >
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>
              Already saved ({matchingPlacements.length} {matchingPlacements.length === 1 ? 'copy' : 'copies'})
            </div>
            {matchingPlacements.length > 2 ? (
              <div style={{ fontSize: '10px', color: 'var(--text-faint)', lineHeight: 1.3 }}>
                Scroll the list below to see every copy.
              </div>
            ) : null}
            <div
              style={{
                maxHeight: 'min(220px, 42vh)',
                minHeight: 72,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                padding: '6px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--bg)',
                scrollbarWidth: 'auto',
                scrollbarGutter: 'stable',
              }}
            >
            {matchingPlacements.map((row) => {
              const { item, collectionId: rowCollectionId, collection, project } = row;
              const itemLive = items.find((i) => i.id === item.id) ?? item;
              const placementNotes = item.placements?.[rowCollectionId]?.notes;
              const notePreview = placementNotes?.trim();
              const placementCount = itemPlacementCount(itemLive);
              const isSelected = selectedExistingItemId === item.id && selectedPlacementCollectionId === rowCollectionId;
              
              return (
                <div
                  key={`${item.id}-${rowCollectionId}`}
                  onClick={() => selectExistingItemForEdit(item, rowCollectionId)}
                  style={{
                    padding: '0.4rem 0.45rem',
                    borderRadius: 6,
                    borderLeft: `3px solid ${collection?.color || 'var(--accent)'}`,
                    border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: isSelected ? 'var(--accent-weak)' : 'var(--bg-panel)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem',
                    cursor: 'pointer',
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--bg-panel)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', fontWeight: 600, flex: 1 }}>
                      {item.title || '(Untitled)'}
                    </div>
                  </div>
                  {/* Collection badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '1px 6px',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 3,
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: collection?.color || 'var(--accent)' }} />
                      {project?.name || 'Unassigned'} / {collection?.name || 'Unknown'}
                    </span>
                  </div>
                  {isSelected ? (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 600 }}>
                      Editing this version
                    </div>
                  ) : null}
                  {notePreview ? (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Note: {notePreview.slice(0, 80)}
                      {notePreview.length > 80 ? '…' : ''}
                    </div>
                  ) : null}
                  <div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <ItemPinFavoriteButtons item={itemLive} compact />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectExistingItemForEdit(item, rowCollectionId);
                        }}
                        style={{
                          border: '1px solid var(--border)',
                          background: 'var(--bg-glass)',
                          color: 'var(--text)',
                          borderRadius: 6,
                          padding: '2px 8px',
                          fontSize: 'var(--text-xs)',
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const msg =
                            placementCount > 1
                              ? 'Remove this bookmark from this collection?'
                              : 'Move this bookmark to trash?';
                          if (!window.confirm(msg)) return;
                          await onDeleteItem(item.id, rowCollectionId);
                          if (
                            selectedExistingItemId === item.id &&
                            selectedPlacementCollectionId === rowCollectionId
                          ) {
                            setSelectedExistingItemId(null);
                            setSelectedPlacementCollectionId(null);
                          }
                        }}
                        style={{
                          border: '1px solid rgba(220, 38, 38, 0.45)',
                          background: 'rgba(220, 38, 38, 0.08)',
                          color: '#dc2626',
                          borderRadius: 6,
                          padding: '2px 8px',
                          fontSize: 'var(--text-xs)',
                          cursor: 'pointer',
                        }}
                      >
                        {placementCount > 1 ? 'Remove' : 'Trash'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
            <ButtonGhost
              type="button"
              onClick={() => {
                setForceNewCopyMode(true);
                setSelectedExistingItemId(null);
                setSelectedPlacementCollectionId(null);
                editBaselineRef.current = null;
                setNotes('');
                // Clear project/collection so user must pick where to save the new copy
                setProjectId('');
                setCollectionId('');
                setError(null);
              }}
              style={{ padding: '0.35rem 0.5rem', fontSize: 'var(--text-xs)' }}
            >
              Add a new copy with different notes
            </ButtonGhost>
          </Panel>
        )}

        {error ? (
          <div
            style={{
              fontSize: 'var(--text-xs)',
              color: '#ef4444',
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.35)',
              padding: '0.35rem 0.45rem',
              borderRadius: 6,
            }}
          >
            {error}
          </div>
        ) : null}

        <ButtonPrimary
          onClick={() => void submitItem()}
          disabled={
            submitting ||
            autoSaving ||
            savedStatePending ||
            (hasExistingForUrl && !forceNewCopyMode && !selectedExistingItem)
          }
          style={{ width: '100%', padding: '0.5rem', fontWeight: 600, fontSize: 'var(--text-sm)' }}
        >
          {savedStatePending
            ? 'Checking saved state…'
            : submitting || autoSaving
            ? 'Saving…'
            : hasExistingForUrl && !forceNewCopyMode && !selectedExistingItem
              ? 'Already saved'
            : forceNewCopyMode
              ? 'Save new copy'
              : selectedExistingItem
                ? autoSaveFlash
                  ? 'Saved'
                  : 'Saved — edits auto-save'
                : 'Save this page'}
        </ButtonPrimary>
      </Panel>

      {showTabPipelinePanel && tabPipelineItemId ? (
        <SidePanelDigestPanel
          itemId={tabPipelineItemId}
          statusLabel={
            tabDigestItemId === tabPipelineItemId ? tabDigestStatus || status : undefined
          }
          onOpenInApp={onOpenFullPage}
        />
      ) : null}

      </div>

      <Divider style={{ margin: '0.25rem 0', flexShrink: 0 }} />

      <ButtonGhost
        onClick={onOpenFullPage}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: '0.75rem',
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        <RefreshCw size={16} /> Open Dashboard
      </ButtonGhost>
      <ButtonGhost
        onClick={() => void onSetAsBrowserHome()}
        style={{
          padding: '0.55rem',
          fontSize: 'var(--text-xs)',
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        Set Homebase as Home
      </ButtonGhost>
    </div>
  );
};
