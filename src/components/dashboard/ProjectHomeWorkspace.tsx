import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRightLeft, Check, Copy, ExternalLink, FileText, Folder, Layers3, MoveRight, Pin, Plus, RotateCcw, Search, Settings2, Trash2, X } from 'lucide-react';
import type { Collection, Item, Project, UpdateItemOptions, Workspace } from '../../lib/db';
import { BookmarkUrlLink, ExtensionPageUrlLink } from './BookmarkUrlLink';
import { ItemFavoriteButton } from './ItemFavoriteButton';
import { ItemWorkspace } from './ItemWorkspace';
import { ContentBrowser, type ContentBrowseEntry, useContentBrowseMode } from './ContentBrowser';
import type { GlobalTab, SavedWorkspaceSession } from './GlobalTabSystem';
import {
  getProjectPinTimestamp,
  isItemPinnedToProject,
  sortProjectItemsByRecency,
  updateProjectPinMetadata,
} from './projectPins';
import { getHomebaseWorkspaceSessionKey, getProjectSessionWorkspaceKey, getSavedWorkspaceSessionKey } from './workspaceSession';
import { uiPatterns } from '../../styles/uiPatterns';
import { loadPageUiState, projectPageUiKey, savePageUiState } from '../../lib/shell/pageUiState';
import { HubActionConfirmModal } from './HubActionConfirmModal';
import { WorkspaceDestinationPicker } from './WorkspaceDestinationPicker';
import type { WorkspaceDestination } from './workspaceDestinations';
import { buildItemQuickFilterText, buildQuickFilterText } from '../../lib/itemQuickFilter';
import {
  ProjectWorkspaceManagerDialog,
  type ProjectWorkspaceManagerEntry,
} from './ProjectWorkspaceManagerDialog';
import { SourceMenuTab } from './SourceMenuTab';
import { LinkVisual } from './LinkVisual';
import { DialogShell } from './DialogShell';
import { getTrashedItems } from '../../lib/itemQuickAccess';
import { subscribeToDataChanges } from '../../lib/dataChangeNotifier';

interface ProjectHomeWorkspaceProps {
  project: Project;
  items: Item[];
  organizationItems?: Item[];
  collections: Collection[];
  organizationProjects?: Project[];
  organizationCollections?: Collection[];
  selectedCollectionId: string | 'all';
  scopeNavigationRevision?: number;
  onSelectCollection: (collectionId: string | 'all') => void;
  sessionTabs: GlobalTab[];
  activeSessionTabId?: string | null;
  onAddItemToSession: (item: Item) => void;
  onRemoveSessionTab: (tabId: string) => void;
  workspaces: Workspace[];
  savedWorkspaceSessions: SavedWorkspaceSession[];
  activeWorkspaceKey: string;
  onActivateWorkspaceKey?: (workspaceKey: string) => void;
  onActivateWorkspace: (workspace: Workspace | null) => void;
  onActivateSavedWorkspace: (session: SavedWorkspaceSession) => void;
  workspaceManagerEntries?: ProjectWorkspaceManagerEntry[];
  onCreateWorkspace?: (name: string, copyCurrent: boolean) => string | void;
  onRenameSavedWorkspace?: (sessionId: string, name: string) => string | void;
  onMergeSavedWorkspace?: (sourceSessionId: string, targetWorkspaceKey: string) => void;
  onDeleteSavedWorkspace: (sessionId: string) => void;
  workspaceDestinations: Array<{ key: string; label: string }>;
  availableWorkspaceDestinations?: WorkspaceDestination[];
  recentWorkspaceDestinationKeys?: readonly string[];
  isItemInWorkspace?: (item: Item, destination: WorkspaceDestination) => boolean;
  onAddItemToWorkspaceDestination?: (item: Item, destination: WorkspaceDestination) => void;
  onViewItemInWorkspaceDestination?: (item: Item, destination: WorkspaceDestination) => void;
  onAddItemToWorkspace: (item: Item, targetWorkspaceKey: string) => void;
  onTransferSessionEntry: (
    entry: GlobalTab,
    targetWorkspaceKey: string,
    mode: 'copy' | 'move'
  ) => void;
  onSelectedItemChange?: (item: Item | null) => void;
  onSelectSessionEntry?: (tab: GlobalTab) => void;
  onUpdateItem?: (
    id: string,
    updates: Partial<Omit<Item, 'id' | 'created_at'>>,
    options?: UpdateItemOptions
  ) => Promise<void>;
  /** Opens the shared Library-removal decision; distinct from removing a workspace entry. */
  onRequestDeleteItem?: (item: Item) => void;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
}

/** URL-capable entries only; notes, saved searches, and lists remain in Homebase. */
export function getWorkspaceBrowserUrls(
  sessionTabs: readonly GlobalTab[],
  allItems: readonly Item[]
): string[] {
  const itemsById = new Map(allItems.map((item) => [item.id, item]));
  const urls = sessionTabs.flatMap((tab) => {
    if (tab.kind === 'url') return [tab.url];
    if (tab.kind === 'item') return [itemsById.get(tab.itemId)?.url];
    return [];
  });
  return [...new Set(urls.filter((url): url is string =>
    typeof url === 'string' && /^(https?:\/\/|file:\/\/)/i.test(url)
  ))];
}

export const ProjectHomeWorkspace: React.FC<ProjectHomeWorkspaceProps> = ({
  project,
  items,
  organizationItems,
  collections,
  organizationProjects,
  organizationCollections,
  selectedCollectionId,
  scopeNavigationRevision = 0,
  onSelectCollection,
  sessionTabs,
  activeSessionTabId,
  onRemoveSessionTab,
  workspaces,
  savedWorkspaceSessions,
  activeWorkspaceKey,
  onActivateWorkspaceKey,
  onActivateWorkspace,
  onActivateSavedWorkspace,
  workspaceManagerEntries = [],
  onCreateWorkspace = () => undefined,
  onRenameSavedWorkspace = () => undefined,
  onMergeSavedWorkspace = () => undefined,
  onDeleteSavedWorkspace,
  workspaceDestinations,
  availableWorkspaceDestinations = [],
  recentWorkspaceDestinationKeys,
  isItemInWorkspace,
  onAddItemToWorkspaceDestination,
  onViewItemInWorkspaceDestination,
  onTransferSessionEntry,
  onSelectedItemChange,
  onSelectSessionEntry,
  onUpdateItem,
  onRequestDeleteItem,
  onCreateProject,
  onCreateCollection,
}) => {
  const pageUiKey = projectPageUiKey(project.id, selectedCollectionId);
  const [initialPageUi] = useState(() => loadPageUiState(pageUiKey, {
    selectedItemId: null as string | null,
    selectedSessionTabId: null as string | null,
    browseSource: (selectedCollectionId === 'all' ? 'all' : 'collection') as 'workspace' | 'all' | 'pinned' | 'collection',
  }));
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initialPageUi.selectedItemId);
  const [selectedSessionTabId, setSelectedSessionTabId] = useState<string | null>(initialPageUi.selectedSessionTabId);
  const [pinningItemId, setPinningItemId] = useState<string | null>(null);
  const [workspaceManagerMode, setWorkspaceManagerMode] = useState<'list' | 'create' | null>(null);
  const [workspaceDeleteConfirm, setWorkspaceDeleteConfirm] = useState<SavedWorkspaceSession | null>(null);
  const [transferEntryId, setTransferEntryId] = useState<string | null>(null);
  const [transferTargetWorkspaceKey, setTransferTargetWorkspaceKey] = useState('');
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [trashedProjectItems, setTrashedProjectItems] = useState<Item[]>([]);
  const [restoringItemId, setRestoringItemId] = useState<string | null>(null);
  const [trashRestoreChoice, setTrashRestoreChoice] = useState<Item | null>(null);
  const [browseSource, setBrowseSource] = useState<'workspace' | 'all' | 'pinned' | 'collection'>(
    scopeNavigationRevision > 0
      ? selectedCollectionId === 'all' ? 'all' : 'collection'
      : initialPageUi.browseSource
  );
  const appliedScopeNavigationRevisionRef = useRef(scopeNavigationRevision);
  const [browseMode, setBrowseMode] = useContentBrowseMode('workbench:project-content-view');
  const showLegacyProjectBrowser = false as boolean;

  const filteredItems = useMemo(
    () =>
      selectedCollectionId === 'all'
        ? items
        : items.filter((item) => item.collectionIds.includes(selectedCollectionId)),
    [items, selectedCollectionId]
  );
  const orderedItems = useMemo(
    () => sortProjectItemsByRecency(filteredItems),
    [filteredItems, project.id]
  );
  const pinnedItems = useMemo(
    () =>
      items
        .filter((item) => isItemPinnedToProject(item, project.id))
        .sort(
          (a, b) =>
            (getProjectPinTimestamp(b, project.id) ?? 0) -
            (getProjectPinTimestamp(a, project.id) ?? 0)
        ),
    [items, project.id]
  );
  const allProjectItems = useMemo(
    () => sortProjectItemsByRecency(items),
    [items, project.id]
  );
  const allItems = organizationItems ?? items;
  const projectCollectionIds = useMemo(
    () => new Set(collections.map((collection) => collection.id)),
    [collections]
  );
  const removedProjectItems = useMemo(() => {
    return allItems.filter((item) =>
      Object.keys(item.removedPlacements || {}).some((collectionId) => projectCollectionIds.has(collectionId))
    );
  }, [allItems, projectCollectionIds]);
  const recoveryCount = removedProjectItems.length + trashedProjectItems.length;
  const selectedItem = allItems.find((item) => item.id === selectedItemId) ?? null;
  const selectedSessionTab = sessionTabs.find((tab) => tab.id === selectedSessionTabId) ?? null;
  const transferEntryTab = transferEntryId
    ? sessionTabs.find((tab) => tab.id === transferEntryId) ?? null
    : null;
  const transferEntryItem = transferEntryTab?.kind === 'item'
    ? allItems.find((item) => item.id === transferEntryTab.itemId)
    : null;
  const transferEntryLabel = transferEntryTab
    ? transferEntryItem?.title
      || (transferEntryTab.kind === 'url'
        ? transferEntryTab.title || transferEntryTab.url
        : transferEntryTab.kind === 'search'
          ? transferEntryTab.query || 'Search'
          : transferEntryTab.kind === 'list'
            ? transferEntryTab.title
            : 'Untitled')
    : '';
  const workspaceBrowserUrls = useMemo(
    () => getWorkspaceBrowserUrls(sessionTabs, allItems),
    [allItems, sessionTabs]
  );
  const activeWorkspace = workspaces.find(
    (workspace) => getSavedWorkspaceSessionKey(workspace.id) === activeWorkspaceKey
  );
  const activeSavedWorkspace = savedWorkspaceSessions.find(
    (session) => getHomebaseWorkspaceSessionKey(session.id) === activeWorkspaceKey
  );
  const activeWorkspaceDestination = availableWorkspaceDestinations.find(
    (destination) => destination.key === activeWorkspaceKey
  );
  const activeWorkspaceLabel = activeWorkspaceDestination?.path ??
    activeSavedWorkspace?.name ?? activeWorkspace?.name ?? `${project.name} · General`;
  const activeWorkspaceProjectId = activeWorkspaceDestination?.projectId ?? project.id;
  const hasWorkspaceChoices = savedWorkspaceSessions.length > 0 || workspaces.length > 0;
  const transferDestinations = workspaceDestinations.filter(
    (destination) => destination.key !== activeWorkspaceKey
  );
  const selectedCollection =
    selectedCollectionId === 'all'
      ? null
      : collections.find((collection) => collection.id === selectedCollectionId) ?? null;

  const reloadProjectTrash = useCallback(async () => {
    try {
      const trashed = await getTrashedItems();
      setTrashedProjectItems(
        trashed.filter((item) => (item.collectionIds || []).some((collectionId) => projectCollectionIds.has(collectionId)))
      );
    } catch {
      // Home can render before the folder-backed database is configured. Recovery
      // is simply empty until the canonical store becomes available.
      setTrashedProjectItems([]);
    }
  }, [projectCollectionIds]);

  useEffect(() => {
    void reloadProjectTrash();
    return subscribeToDataChanges(() => { void reloadProjectTrash(); });
  }, [reloadProjectTrash]);

  useEffect(() => {
    savePageUiState(pageUiKey, { selectedItemId, selectedSessionTabId, browseSource });
  }, [browseSource, pageUiKey, selectedItemId, selectedSessionTabId]);

  useEffect(() => {
    if (
      scopeNavigationRevision === 0 ||
      scopeNavigationRevision === appliedScopeNavigationRevisionRef.current
    ) return;
    appliedScopeNavigationRevisionRef.current = scopeNavigationRevision;
    setBrowseSource(selectedCollectionId === 'all' ? 'all' : 'collection');
    setSelectedItemId(null);
    setSelectedSessionTabId(null);
  }, [scopeNavigationRevision, selectedCollectionId]);

  useEffect(() => {
    if (selectedItemId && allItems.length > 0 && !allItems.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(null);
      return;
    }
    if (selectedSessionTabId && sessionTabs.length > 0 && !sessionTabs.some((tab) => tab.id === selectedSessionTabId)) {
      setSelectedSessionTabId(null);
      return;
    }
    onSelectedItemChange?.(selectedItem);
  }, [allItems, onSelectedItemChange, selectedItem, selectedItemId, selectedSessionTabId, sessionTabs]);

  useEffect(() => {
    if (!activeSessionTabId) return;
    const requestedEntry = sessionTabs.find((entry) => entry.id === activeSessionTabId);
    if (!requestedEntry) return;
    setBrowseSource('workspace');
    setSelectedSessionTabId(requestedEntry.id);
    setSelectedItemId(requestedEntry.kind === 'item' ? requestedEntry.itemId : null);
    onSelectedItemChange?.(
      requestedEntry.kind === 'item'
        ? allItems.find((item) => item.id === requestedEntry.itemId) ?? null
        : null
    );
  }, [activeSessionTabId, allItems, onSelectedItemChange, sessionTabs]);

  useEffect(() => {
    if (!transferDestinations.some((destination) => destination.key === transferTargetWorkspaceKey)) {
      setTransferTargetWorkspaceKey(transferDestinations[0]?.key ?? '');
    }
  }, [transferDestinations, transferTargetWorkspaceKey]);

  const openWorkspaceInBrowser = () => {
    if (workspaceBrowserUrls.length === 0) return;
    if (typeof chrome !== 'undefined' && chrome.windows?.create) {
      void chrome.windows.create({ url: workspaceBrowserUrls });
      return;
    }
    for (const url of workspaceBrowserUrls) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const switchWorkspace = (workspaceKey: string) => {
    if (onActivateWorkspaceKey) {
      onActivateWorkspaceKey(workspaceKey);
      return;
    }
    if (workspaceKey === getProjectSessionWorkspaceKey(project.id)) onActivateWorkspace(null);
  };

  const transferEntry = (entry: GlobalTab, mode: 'copy' | 'move') => {
    if (!transferTargetWorkspaceKey) return;
    onTransferSessionEntry(entry, transferTargetWorkspaceKey, mode);
    setTransferEntryId(null);
    if (mode === 'move' && selectedSessionTabId === entry.id) setSelectedSessionTabId(null);
  };

  const openTransferEntry = (entryId: string) => {
    setTransferEntryId(entryId);
    setTransferTargetWorkspaceKey(transferDestinations[0]?.key ?? '');
  };

  const selectSessionTab = (tab: GlobalTab) => {
    setBrowseSource('workspace');
    setSelectedSessionTabId(tab.id);
    setSelectedItemId(tab.kind === 'item' ? tab.itemId : null);
    onSelectedItemChange?.(
      tab.kind === 'item' ? allItems.find((item) => item.id === tab.itemId) ?? null : null
    );
    onSelectSessionEntry?.(tab);
  };

  const viewActiveWorkspace = () => {
    const activeTab = activeSessionTabId
      ? sessionTabs.find((tab) => tab.id === activeSessionTabId) ?? null
      : null;
    setBrowseSource('workspace');
    setSelectedSessionTabId(activeTab?.id ?? null);
    setSelectedItemId(activeTab?.kind === 'item' ? activeTab.itemId : null);
    onSelectedItemChange?.(
      activeTab?.kind === 'item'
        ? allItems.find((item) => item.id === activeTab.itemId) ?? null
        : null
    );
  };

  const selectProjectItem = (item: Item) => {
    setSelectedSessionTabId(null);
    setSelectedItemId(item.id);
    onSelectedItemChange?.(item);
  };

  const toggleProjectPin = async (item: Item) => {
    if (!onUpdateItem || pinningItemId) return;
    setPinningItemId(item.id);
    try {
      const pinned = isItemPinnedToProject(item, project.id);
      await onUpdateItem(
        item.id,
        {
          metadata: updateProjectPinMetadata(item.metadata, project.id, pinned ? undefined : Date.now()),
        },
        { preserveUpdatedAt: true }
      );
    } finally {
      setPinningItemId(null);
    }
  };

  const workspaceBrowseEntries: ContentBrowseEntry[] = sessionTabs.map((tab) => {
    const item = tab.kind === 'item' ? allItems.find((candidate) => candidate.id === tab.itemId) : undefined;
    const label = item?.title || (tab.kind === 'url' ? tab.title || tab.url : tab.kind === 'search' ? tab.query || 'Search' : tab.kind === 'list' ? tab.title : 'Untitled');
    const searchScope = tab.kind === 'search'
      ? tab.filters?.collectionId
        ? collections.find((collection) => collection.id === tab.filters?.collectionId)?.name ?? 'Collection'
        : tab.filters?.projectId
          ? tab.filters.projectId === project.id ? project.name : 'Project'
          : 'All Library'
      : undefined;
    const transferable = tab.scopeProjectId === project.id;
    return {
      id: tab.id,
      title: label,
      icon: tab.kind === 'search' ? <Search size={12} /> : tab.kind === 'url' ? <LinkVisual url={tab.url} title={tab.title} favicon={tab.favIconUrl} /> : item?.url ? <LinkVisual url={item.url} title={item.title} favicon={item.favicon} /> : <FileText size={12} />,
      subtitle: tab.kind === 'url'
        ? <ExtensionPageUrlLink url={tab.url} style={{ color: 'inherit' }} title={`Open ${tab.url}`}>{tab.url}</ExtensionPageUrlLink>
        : tab.kind === 'item' && item?.url
          ? <BookmarkUrlLink item={item} style={{ color: 'inherit' }} />
          : tab.kind === 'search'
            ? `Search · ${searchScope}`
            : tab.kind === 'list'
              ? 'Saved list'
              : item?.notes || 'Note',
      searchText: buildQuickFilterText(
        tab,
        searchScope,
        item ? buildItemQuickFilterText(item, organizationProjects ?? [project], organizationCollections ?? collections) : null
      ),
      dragSource: item ? {
        kind: 'workspace' as const,
        containerId: activeWorkspaceKey,
        containerLabel: activeWorkspaceLabel,
        projectId: activeWorkspaceProjectId,
      } : tab.kind === 'url' ? { kind: 'reference' as const, label: 'Browser snapshot' } : undefined,
      dragItem: item,
      dragUrl: tab.kind === 'url' ? tab.url : undefined,
      reorderTarget: item ? {
        kind: 'workspace' as const,
        containerId: activeWorkspaceKey,
        containerLabel: activeWorkspaceLabel,
        projectId: activeWorkspaceProjectId,
      } : undefined,
      actions: (
        <>
          {item ? <ItemFavoriteButton item={item} onUpdateItem={onUpdateItem} /> : null}
          {item ? (
            <button
              type="button"
              aria-label={isItemPinnedToProject(item, project.id) ? `Unpin ${item.title} from ${project.name}` : `Pin ${item.title} to ${project.name}`}
              title={isItemPinnedToProject(item, project.id) ? `Unpin from ${project.name}` : `Pin to ${project.name}`}
              disabled={!onUpdateItem || pinningItemId === item.id}
              onClick={() => void toggleProjectPin(item)}
              style={{ ...sessionIconButtonStyle, color: isItemPinnedToProject(item, project.id) ? 'var(--accent)' : 'var(--text-faint)' }}
            >
              <Pin size={12} fill={isItemPinnedToProject(item, project.id) ? 'currentColor' : 'none'} />
            </button>
          ) : null}
          {transferable && transferDestinations.length > 0 && <button type="button" onClick={() => openTransferEntry(tab.id)} title={`Copy or move ${label}`} aria-label={`Copy or move ${label}`} style={sessionIconButtonStyle}><ArrowRightLeft size={11} /></button>}
          {item && onRequestDeleteItem ? <button type="button" onClick={() => onRequestDeleteItem(item)} title="Remove from Library" aria-label={`Remove ${label} from Library`} style={{ ...sessionIconButtonStyle, color: 'var(--danger)' }}><Trash2 size={11} /></button> : null}
          {!activeWorkspace ? <button type="button" onClick={() => { if (selectedSessionTabId === tab.id) { setSelectedSessionTabId(null); setSelectedItemId(null); } onRemoveSessionTab(tab.id); }} title={`Remove ${label} from workspace`} aria-label={`Remove ${label} from workspace`} style={sessionIconButtonStyle}><X size={12} /></button> : null}
        </>
      ),
    };
  });
  const materialBrowseItems = browseSource === 'pinned'
    ? pinnedItems
    : browseSource === 'collection'
      ? orderedItems
      : allProjectItems;
  const restoreProjectPlacements = async (item: Item) => {
    if (!onUpdateItem || restoringItemId === item.id) return;
    const restoreIds = Object.keys(item.removedPlacements || {}).filter((id) => projectCollectionIds.has(id));
    if (!restoreIds.length) return;
    setRestoringItemId(item.id);
    try {
      await onUpdateItem(item.id, { collectionIds: [...new Set([...(item.collectionIds || []), ...restoreIds])] });
      setSelectedItemId(item.id);
    } finally {
      setRestoringItemId(null);
    }
  };
  const restoreTrashedToProject = async (item: Item) => {
    if (!onUpdateItem || restoringItemId === item.id) return;
    const projectIds = item.collectionIds.filter((id) => projectCollectionIds.has(id));
    if (!projectIds.length) return;
    setRestoringItemId(item.id);
    try {
      await onUpdateItem(item.id, { collectionIds: projectIds }, { clearItemMarkers: ['deletedAt'] });
      setTrashRestoreChoice(null);
      setRecoveryOpen(false);
    } finally {
      setRestoringItemId(null);
    }
  };
  const restoreTrashedEverywhere = async (item: Item) => {
    if (!onUpdateItem || restoringItemId === item.id) return;
    setRestoringItemId(item.id);
    try {
      await onUpdateItem(item.id, {}, { clearItemMarkers: ['deletedAt'] });
      setTrashRestoreChoice(null);
      setRecoveryOpen(false);
    } finally {
      setRestoringItemId(null);
    }
  };
  const requestTrashRestore = (item: Item) => {
    const hasOtherProjectLocations = item.collectionIds.some((id) => !projectCollectionIds.has(id));
    if (hasOtherProjectLocations) setTrashRestoreChoice(item);
    else void restoreTrashedToProject(item);
  };
  const materialBrowseEntries: ContentBrowseEntry[] = materialBrowseItems.map((item) => {
    const pinned = isItemPinnedToProject(item, project.id);
    return {
      id: item.id,
      title: item.title || 'Untitled',
      icon: item.url ? <LinkVisual url={item.url} title={item.title} favicon={item.favicon} /> : <FileText size={12} />,
      subtitle: item.url ? <BookmarkUrlLink item={item} style={{ color: 'inherit' }} /> : item.notes || 'Empty note',
      searchText: buildItemQuickFilterText(item, organizationProjects ?? [project], organizationCollections ?? collections),
      dragSource: browseSource === 'collection' && selectedCollection
        ? {
            kind: 'collection' as const,
            containerId: selectedCollection.id,
            containerLabel: `${project.name} · ${selectedCollection.name}`,
            projectId: project.id,
          }
        : { kind: 'reference' as const, label: browseSource === 'pinned' ? 'Pinned' : 'Project items' },
      dragItem: item,
      actions: (
        <>
          <ItemFavoriteButton item={item} onUpdateItem={onUpdateItem} />
          <button type="button" aria-label={pinned ? `Unpin ${item.title} from ${project.name}` : `Pin ${item.title} to ${project.name}`} title={pinned ? `Unpin from ${project.name}` : `Pin to ${project.name}`} disabled={!onUpdateItem || pinningItemId === item.id} onClick={() => void toggleProjectPin(item)} style={{ ...sessionIconButtonStyle, color: pinned ? 'var(--accent)' : 'var(--text-faint)' }}><Pin size={12} fill={pinned ? 'currentColor' : 'none'} /></button>
          {onRequestDeleteItem ? <button type="button" aria-label={`Remove ${item.title || 'item'} from Library`} title="Remove from Library" onClick={() => onRequestDeleteItem(item)} style={{ ...sessionIconButtonStyle, color: 'var(--danger)' }}><Trash2 size={11} /></button> : null}
        </>
      ),
    };
  });
  const browseEntries = browseSource === 'workspace' ? workspaceBrowseEntries : materialBrowseEntries;
  const browseTitle = browseSource === 'workspace'
    ? activeWorkspaceLabel
    : browseSource === 'pinned'
      ? `Pinned to ${project.name}`
      : browseSource === 'collection'
        ? selectedCollection?.name ?? 'Collection'
        : project.isDefault ? 'Incoming' : 'All project items';
  const browseSelectedId = browseSource === 'workspace' ? selectedSessionTabId : selectedItemId;
  const workspaceHeaderActions = browseSource === 'workspace' ? (
    <div className="ui-project-workspace-actions" data-project-workspace-actions role="toolbar" aria-label="Workspace actions">
      <button className="ui-button ui-button--primary" type="button" onClick={() => setWorkspaceManagerMode('create')}><Plus size={12} /> New workspace</button>
      <button className="ui-button ui-button--secondary" type="button" onClick={() => setWorkspaceManagerMode('list')}><Settings2 size={12} /> Manage</button>
      <button className="ui-button ui-button--secondary" type="button" disabled={workspaceBrowserUrls.length === 0} onClick={openWorkspaceInBrowser} title={workspaceBrowserUrls.length === 0 ? `${activeWorkspaceLabel} has no browser links` : `Open all ${workspaceBrowserUrls.length} link${workspaceBrowserUrls.length !== 1 ? 's' : ''} from ${activeWorkspaceLabel} in a new Chrome window`} aria-label="Open all workspace links in Chrome"><ExternalLink size={12} /> Open all links</button>
    </div>
  ) : undefined;

  const selectBrowseEntry = (id: string) => {
    if (browseSource === 'workspace') {
      const tab = sessionTabs.find((candidate) => candidate.id === id);
      if (tab) selectSessionTab(tab);
      return;
    }
    const item = materialBrowseItems.find((candidate) => candidate.id === id);
    if (item) selectProjectItem(item);
  };

  const clearDetailSelection = () => {
    setSelectedItemId(null);
    setSelectedSessionTabId(null);
  };

  const selectedItemWorkspaceAction = selectedItem &&
    availableWorkspaceDestinations.length > 0 &&
    isItemInWorkspace &&
    onAddItemToWorkspaceDestination ? (
      <WorkspaceDestinationPicker
        item={selectedItem}
        destinations={availableWorkspaceDestinations}
        recentDestinationKeys={recentWorkspaceDestinationKeys}
        isAdded={(destination) => isItemInWorkspace(selectedItem, destination)}
        onAdd={(destination) => onAddItemToWorkspaceDestination(selectedItem, destination)}
        onView={onViewItemInWorkspaceDestination ? (destination) => onViewItemInWorkspaceDestination(selectedItem, destination) : undefined}
      />
    ) : null;

  const detailPanel = (
    <section className="ui-panel ui-detail-panel" style={panelStyle} aria-label="Selected project content">
      {selectedItem ? (
        <>
          <div className="ui-detail-panel__header" style={panelHeaderStyle}>
            <span style={detailLabelStyle}>Item</span>
            <div className="ui-detail-panel__actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="ui-button ui-button--secondary ui-adaptive-detail-back" type="button" onClick={clearDetailSelection} style={secondaryButtonStyle}><ArrowLeft size={12} /> Browse</button>
              {onRequestDeleteItem ? <button className="ui-button ui-button--danger" type="button" onClick={() => onRequestDeleteItem(selectedItem)}><Trash2 size={12} /> Move to Trash</button> : null}
              {selectedItemWorkspaceAction}
            </div>
          </div>
          <div className="scrollbar ui-scroll-footer-safe ui-detail-panel__body" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 }}>
            <ItemWorkspace
              item={selectedItem}
              projects={organizationProjects ?? [project]}
              collections={organizationCollections ?? collections}
              onUpdateItem={onUpdateItem}
              onCreateProject={onCreateProject}
              onCreateCollection={onCreateCollection}
              trailingActions={
                <button type="button" disabled={!onUpdateItem || pinningItemId === selectedItem.id} onClick={() => void toggleProjectPin(selectedItem)} style={{ ...secondaryButtonStyle, flexShrink: 0 }}>
                  <Pin size={12} fill={isItemPinnedToProject(selectedItem, project.id) ? 'currentColor' : 'none'} />
                  {isItemPinnedToProject(selectedItem, project.id) ? 'Unpin' : 'Pin to project'}
                </button>
              }
            />
          </div>
        </>
      ) : selectedSessionTab ? (
        <>
          <div className="ui-detail-panel__header" style={panelHeaderStyle}>
            <span style={detailLabelStyle}>Workspace entry</span>
            <div className="ui-detail-panel__actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="ui-button ui-button--secondary ui-adaptive-detail-back" type="button" onClick={clearDetailSelection} style={secondaryButtonStyle}><ArrowLeft size={12} /> Browse</button>
            </div>
          </div>
          <div className="scrollbar ui-scroll-footer-safe" style={{ flex: 1, minHeight: 0, padding: 18, overflowY: 'auto' }}>
            <span style={{ width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: 'var(--accent-weak)', color: 'var(--accent)' }}>
              {selectedSessionTab.kind === 'search'
                ? <Search size={15} />
                : selectedSessionTab.kind === 'url'
                  ? <LinkVisual url={selectedSessionTab.url} title={selectedSessionTab.title} favicon={selectedSessionTab.favIconUrl} />
                  : <Layers3 size={15} />}
            </span>
            <h2 style={{ margin: '13px 0 0', color: 'var(--text)', fontSize: 'var(--text-lg)' }}>{selectedSessionTab.kind === 'url' ? selectedSessionTab.title || 'Web page' : selectedSessionTab.kind === 'search' ? selectedSessionTab.query || 'Search' : selectedSessionTab.kind === 'list' ? selectedSessionTab.title : 'Workspace item'}</h2>
            {selectedSessionTab.kind === 'url' ? (
              <ExtensionPageUrlLink url={selectedSessionTab.url} style={{ marginTop: 7, color: 'var(--accent)', fontSize: 'var(--text-sm)', overflowWrap: 'anywhere', textDecoration: 'none' }} title={`Open ${selectedSessionTab.url}`}>{selectedSessionTab.url}</ExtensionPageUrlLink>
            ) : (
              <p style={{ margin: '9px 0 0', maxWidth: 420, color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.55 }}>This workspace entry has no additional detail view.</p>
            )}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 28, textAlign: 'center', color: 'var(--text-faint)' }}>
          <Layers3 size={24} />
          <strong style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Select something to work with</strong>
          <span style={{ maxWidth: 300, fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>Links and notes are editable here. Select a workspace entry to inspect it without leaving this page.</span>
        </div>
      )}
    </section>
  );

  return (
    <div
      className="scrollbar ui-page-frame ui-project-home-page"
      style={{
        ...uiPatterns.pageFrame,
        overflow: 'hidden',
        overflowX: 'hidden',
      }}
    >
      <header className="ui-page-header ui-project-page-header" style={{ ...uiPatterns.pageHeader, width: '100%', maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-weak)', color: 'var(--accent)' }}>
              <Folder size={17} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 style={uiPatterns.pageTitle}>{project.name}</h1>
              <p style={uiPatterns.pageDescription}>
                {project.description || `${items.length} item${items.length !== 1 ? 's' : ''} · ${collections.length} collection${collections.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
        </div>
        <button
          className="ui-button ui-button--secondary"
          type="button"
          onClick={() => setRecoveryOpen(true)}
          title={`Review ${recoveryCount} item${recoveryCount === 1 ? '' : 's'} that can be restored in ${project.name}`}
        >
          <RotateCcw size={12} /> Recovery
          {recoveryCount > 0 ? <span aria-label={`${recoveryCount} recoverable item${recoveryCount === 1 ? '' : 's'}`}>{recoveryCount}</span> : null}
        </button>
      </header>

      <section style={{ width: '100%', maxWidth: 1120, minHeight: 0, flex: 1, margin: '0 auto', display: 'flex', flexDirection: 'column' }} aria-label="Project workspace">
        <div className="ui-project-view-bar">
        <div className="ui-tab-bar" data-project-view-tabs style={{ ...uiPatterns.tabBar, marginBottom: 8 }} role="tablist" aria-label="Project view">
          <button className="ui-view-tab" type="button" role="tab" aria-selected={browseSource === 'all'} onClick={() => { setBrowseSource('all'); setSelectedSessionTabId(null); if (selectedItemId && !allProjectItems.some((item) => item.id === selectedItemId)) setSelectedItemId(null); }} style={viewTabStyle(browseSource === 'all')}><Folder size={12} /> {project.isDefault ? 'Incoming' : 'All items'}</button>
          <button className="ui-view-tab" type="button" role="tab" aria-selected={browseSource === 'pinned'} onClick={() => { setBrowseSource('pinned'); setSelectedSessionTabId(null); if (selectedItemId && !pinnedItems.some((item) => item.id === selectedItemId)) setSelectedItemId(null); }} style={viewTabStyle(browseSource === 'pinned')}><Pin size={12} /> Pinned <span style={{ color: 'var(--text-faint)' }}>{pinnedItems.length}</span></button>
          {!project.isDefault && collections.length > 0 && (
            <SourceMenuTab
              label="Collection"
              icon={<Folder size={12} />}
              active={browseSource === 'collection'}
              selectedValue={selectedCollectionId === 'all' ? collections[0]?.id ?? '' : selectedCollectionId}
              options={collections.map((collection) => ({ value: collection.id, label: collection.name }))}
              onActivate={() => {
                const collectionId = selectedCollectionId === 'all' ? collections[0]?.id : selectedCollectionId;
                if (!collectionId) return;
                setBrowseSource('collection');
                setSelectedSessionTabId(null);
                setSelectedItemId(null);
                onSelectCollection(collectionId);
              }}
              onSelect={(collectionId) => {
                setBrowseSource('collection');
                setSelectedSessionTabId(null);
                setSelectedItemId(null);
                onSelectCollection(collectionId);
              }}
            />
          )}
          <SourceMenuTab
            label="Workspace"
            icon={<Layers3 size={12} />}
            active={browseSource === 'workspace'}
            selectedValue={activeWorkspaceKey}
            options={workspaceDestinations.map((destination) => ({ value: destination.key, label: destination.label }))}
            onActivate={viewActiveWorkspace}
            onSelect={(workspaceKey) => {
              if (workspaceKey === activeWorkspaceKey) {
                viewActiveWorkspace();
                return;
              }
              setBrowseSource('workspace');
              setSelectedSessionTabId(null);
              setSelectedItemId(null);
              switchWorkspace(workspaceKey);
            }}
          />
        </div>
        </div>
        {showLegacyProjectBrowser && hasWorkspaceChoices && <div className="scrollbar" data-browse-surface="project-workspaces" style={{ ...browseListStyle, marginBottom: 9 }} aria-label="Project workspaces">
          <button type="button" onClick={() => onActivateWorkspace(null)} style={browseRowStyle(activeWorkspaceKey === getProjectSessionWorkspaceKey(project.id))}>
            <span style={browseRowIconStyle}><Layers3 size={12} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={browseRowTitleStyle}>General</span>
              <span style={browseRowDetailStyle}>Project scratch workspace</span>
            </span>
            {activeWorkspaceKey === getProjectSessionWorkspaceKey(project.id) && <Check size={13} />}
          </button>
          {savedWorkspaceSessions.map((session) => {
            const active = activeWorkspaceKey === getHomebaseWorkspaceSessionKey(session.id);
            const savedCount = active
              ? sessionTabs.length
              : 0;
            return (
              <div key={session.id} role="button" tabIndex={0} onClick={() => onActivateSavedWorkspace(session)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onActivateSavedWorkspace(session); } }} title={`Activate ${session.name}`} style={{ ...browseRowStyle(active), display: 'flex' }}>
                <span style={browseRowIconStyle}><Layers3 size={12} /></span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={browseRowTitleStyle}>{session.name}</span>
                  <span style={browseRowDetailStyle}>{active ? `${savedCount} active item${savedCount !== 1 ? 's' : ''}` : 'Homebase workspace'}</span>
                </span>
                {active && <Check size={13} />}
                <button className="ui-button ui-button--icon ui-button--danger" type="button" onClick={(event) => { event.stopPropagation(); setWorkspaceDeleteConfirm(session); }} title={`Delete ${session.name}`} aria-label={`Delete ${session.name}`} style={sessionIconButtonStyle}><Trash2 size={11} /></button>
              </div>
            );
          })}
          {workspaces.map((workspace) => {
            const active = activeWorkspaceKey === getSavedWorkspaceSessionKey(workspace.id);
            return (
              <button key={workspace.id} type="button" onClick={() => onActivateWorkspace(workspace)} title={`Activate ${workspace.name}`} style={browseRowStyle(active)}>
                <span style={browseRowIconStyle}><Layers3 size={12} /></span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={browseRowTitleStyle}>{workspace.name}</span>
                <span style={browseRowDetailStyle}>Browser workspace · {workspace.windows.length} window{workspace.windows.length !== 1 ? 's' : ''}</span>
                </span>
                {active && <Check size={13} />}
              </button>
            );
          })}
        </div>}
        {showLegacyProjectBrowser && (<div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--bg-panel)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ minHeight: 39, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 11px', borderBottom: sessionTabs.length > 0 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ minWidth: 0, color: 'var(--text)', fontSize: 'var(--text-sm)', fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeSavedWorkspace?.name ?? activeWorkspace?.name ?? 'General'}
            </span>
            <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>{sessionTabs.length} item{sessionTabs.length !== 1 ? 's' : ''}</span>
          </div>
          {sessionTabs.length === 0 ? (
            <div style={{ padding: '14px 12px', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>This workspace is empty. Select project material and add what you want to work with.</div>
          ) : (
            <div className="scrollbar" style={{ maxHeight: 190, overflowY: 'auto' }}>
              {sessionTabs.map((tab) => {
                const item = tab.kind === 'item' ? items.find((candidate) => candidate.id === tab.itemId) : undefined;
                const label = item?.title || (tab.kind === 'url' ? tab.title || tab.url : tab.kind === 'search' ? tab.query || 'Search' : tab.kind === 'list' ? tab.title : 'Untitled');
                const searchScope = tab.kind === 'search'
                  ? tab.filters?.collectionId
                    ? collections.find((collection) => collection.id === tab.filters?.collectionId)?.name ?? 'Collection'
                    : tab.filters?.projectId
                      ? tab.filters.projectId === project.id ? project.name : 'Project'
                      : 'All Library'
                  : undefined;
                const detail = tab.kind === 'url' ? tab.url : tab.kind === 'search' ? `Search · ${searchScope}` : tab.kind === 'list' ? 'List' : item?.url || 'Note';
                const selected = selectedSessionTabId === tab.id;
                const transferable = tab.scopeProjectId === project.id;
                return (
                  <React.Fragment key={tab.id}>
                  <div role="button" tabIndex={0} onClick={() => selectSessionTab(tab)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectSessionTab(tab); } }} style={{ minHeight: 42, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 6px 11px', borderBottom: '1px solid var(--border)', background: selected ? 'var(--bg-active)' : 'transparent', cursor: 'pointer' }}>
                    <span style={{ width: 24, height: 24, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, background: 'var(--bg-hover)', color: selected ? 'var(--accent)' : 'var(--text-faint)' }}>
                      {tab.kind === 'search'
                        ? <Search size={11} />
                        : tab.kind === 'url'
                          ? <LinkVisual url={tab.url} title={tab.title} favicon={tab.favIconUrl} />
                          : item?.url
                            ? <LinkVisual url={item.url} title={item.title} favicon={item.favicon} />
                            : <FileText size={11} />}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', color: 'var(--text)', fontSize: 'var(--text-xs)', fontWeight: selected ? 650 : 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                      {tab.kind === 'url' ? (
                        <ExtensionPageUrlLink
                          url={tab.url}
                          style={{ display: 'inline-block', marginTop: 1, color: 'var(--accent)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={`Open ${tab.url}`}
                        >
                          {tab.url}
                        </ExtensionPageUrlLink>
                      ) : tab.kind === 'item' && item?.url ? (
                        <BookmarkUrlLink item={item} style={{ marginTop: 1, color: 'var(--accent)', fontSize: 10 }} />
                      ) : (
                        <span style={{ display: 'block', marginTop: 1, color: 'var(--text-faint)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</span>
                      )}
                    </span>
                    {transferable && transferDestinations.length > 0 && <button type="button" onClick={(event) => { event.stopPropagation(); openTransferEntry(tab.id); }} title={`Copy or move ${label}`} aria-label={`Copy or move ${label}`} style={sessionIconButtonStyle}><ArrowRightLeft size={11} /></button>}
                    <button type="button" onClick={(event) => { event.stopPropagation(); if (selectedSessionTabId === tab.id) setSelectedSessionTabId(null); onRemoveSessionTab(tab.id); }} title={`Remove ${label} from workspace`} aria-label={`Remove ${label} from workspace`} style={sessionIconButtonStyle}><X size={12} /></button>
                  </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>)}
        {showLegacyProjectBrowser && (<div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }} role="group" aria-label="Project content source">
          <button type="button" aria-pressed={browseSource === 'workspace'} onClick={() => { setBrowseSource('workspace'); setSelectedItemId(selectedSessionTab?.kind === 'item' ? selectedSessionTab.itemId : null); }} style={sourceButtonStyle(browseSource === 'workspace')}><Layers3 size={12} /> Workspace</button>
          <button type="button" aria-pressed={browseSource === 'all'} onClick={() => { setBrowseSource('all'); setSelectedSessionTabId(null); if (selectedItemId && !allProjectItems.some((item) => item.id === selectedItemId)) setSelectedItemId(null); }} style={sourceButtonStyle(browseSource === 'all')}><Folder size={12} /> {project.isDefault ? 'Incoming' : 'All items'}</button>
          <button type="button" aria-pressed={browseSource === 'pinned'} onClick={() => { setBrowseSource('pinned'); setSelectedSessionTabId(null); if (selectedItemId && !pinnedItems.some((item) => item.id === selectedItemId)) setSelectedItemId(null); }} style={sourceButtonStyle(browseSource === 'pinned')}><Pin size={12} /> Pinned <span style={{ color: 'var(--text-faint)' }}>{pinnedItems.length}</span></button>
          {!project.isDefault && collections.length > 0 && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <button type="button" aria-pressed={browseSource === 'collection'} onClick={() => { const collectionId = selectedCollectionId !== 'all' ? selectedCollectionId : collections[0]?.id; if (!collectionId) return; setBrowseSource('collection'); setSelectedSessionTabId(null); setSelectedItemId(null); onSelectCollection(collectionId); }} style={sourceButtonStyle(browseSource === 'collection')}><Folder size={12} /> Collection</button>
              <select value={browseSource === 'collection' ? selectedCollectionId : ''} onChange={(event) => { const collectionId = event.target.value; if (!collectionId) return; setBrowseSource('collection'); setSelectedSessionTabId(null); setSelectedItemId(null); onSelectCollection(collectionId); }} aria-label="Browse project collection" style={{ ...destinationSelectStyle, minWidth: 150 }}>
                <option value="">Choose collection…</option>
                {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
              </select>
            </label>
          )}
        </div>)}
        <div
          className="ui-working-canvas ui-adaptive-browser"
          data-project-working-canvas
          data-detail-open={selectedItem || selectedSessionTab ? 'true' : 'false'}
          style={{ flex: 1, minHeight: 360, display: 'grid', gridTemplateColumns: 'minmax(280px, 0.9fr) minmax(0, 1.35fr)', gap: 12 }}
        >
          <ContentBrowser
            title={browseTitle}
            entries={browseEntries}
            selectedId={browseSelectedId}
            onSelect={selectBrowseEntry}
            mode={browseMode}
            onModeChange={setBrowseMode}
            emptyMessage={browseSource === 'workspace' ? 'This workspace is empty. Add project material to begin.' : browseSource === 'pinned' ? 'Nothing is pinned to this project yet.' : 'No items in this source.'}
            ariaLabel={browseSource === 'workspace' ? 'Workspace contents' : 'Project material'}
            dropTarget={browseSource === 'workspace' && !activeWorkspace
              ? {
                  kind: 'workspace',
                  containerId: activeWorkspaceKey,
                  containerLabel: browseTitle,
                  projectId: activeWorkspaceProjectId,
                }
              : browseSource === 'collection' && selectedCollection
                ? {
                    kind: 'collection',
                    containerId: selectedCollection.id,
                    containerLabel: `${project.name} · ${selectedCollection.name}`,
                    projectId: project.id,
                  }
                : undefined}
            projectCollectionDropTarget={browseSource === 'all' && collections.length > 0
              ? {
                  kind: 'project-collections',
                  projectId: project.id,
                  projectLabel: project.name,
                  collections: collections.map((collection) => ({
                    kind: 'collection',
                    containerId: collection.id,
                    containerLabel: collection.name,
                    projectId: project.id,
                  })),
                }
              : undefined}
            headerActions={workspaceHeaderActions}
          />
          {detailPanel}
        </div>
      </section>

      {showLegacyProjectBrowser && pinnedItems.length > 0 && (
        <section style={{ width: '100%', maxWidth: 1120, margin: '0 auto' }} aria-labelledby="project-pinned-heading">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 id="project-pinned-heading" style={sectionHeadingStyle}><Pin size={13} /> Pinned to {project.name}</h2>
            <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{pinnedItems.length}</span>
          </div>
          <div className="scrollbar" data-browse-surface="project-pins" style={browseListStyle}>
            {pinnedItems.map((item) => (
              <button key={item.id} type="button" onClick={() => selectProjectItem(item)} style={browseRowStyle(selectedItemId === item.id)}>
                <span style={browseRowIconStyle}>{item.url ? <LinkVisual url={item.url} title={item.title} favicon={item.favicon} /> : <FileText size={12} />}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={browseRowTitleStyle}>{item.title || 'Untitled'}</span>
                  <span style={browseRowDetailStyle}>{item.url || item.notes || 'Note'}</span>
                </span>
                <Pin size={12} fill="currentColor" style={{ color: 'var(--accent)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </section>
      )}

      {showLegacyProjectBrowser && !project.isDefault && <section style={{ width: '100%', maxWidth: 1120, margin: '0 auto' }} aria-labelledby="project-collections-heading">
        <h2 id="project-collections-heading" style={{ ...sectionHeadingStyle, marginBottom: 8 }}><Folder size={13} /> Collections</h2>
        <div className="scrollbar" data-browse-surface="project-collections" style={browseListStyle}>
          <CollectionCard
            title="All items"
            count={items.length}
            active={selectedCollectionId === 'all'}
            onClick={() => { setBrowseSource('collection'); setSelectedSessionTabId(null); setSelectedItemId(null); onSelectCollection('all'); }}
            sample={items.slice(0, 2)}
          />
          {collections.map((collection) => {
            const collectionItems = items.filter((item) => item.collectionIds.includes(collection.id));
            return (
              <CollectionCard
                key={collection.id}
                title={collection.name}
                count={collectionItems.length}
                color={collection.color}
                active={selectedCollectionId === collection.id}
                onClick={() => { setBrowseSource('collection'); setSelectedSessionTabId(null); setSelectedItemId(null); onSelectCollection(collection.id); }}
                sample={collectionItems.slice(0, 2)}
              />
            );
          })}
        </div>
      </section>}

      {showLegacyProjectBrowser && (<section data-project-page-footer-content style={{ width: '100%', maxWidth: 1120, margin: '0 auto 64px', minHeight: 360, flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14, alignItems: 'stretch' }}>
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 'var(--text-sm)', fontWeight: 650 }}>{project.isDefault ? 'Incoming' : selectedCollection?.name ?? 'All items'}</h2>
              <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{orderedItems.length} item{orderedItems.length !== 1 ? 's' : ''}</span>
            </div>
            <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>Select to view or edit</span>
          </div>
          <div className="scrollbar" style={{ minHeight: 0, flex: 1, overflowY: 'auto' }}>
            {orderedItems.length === 0 ? (
              <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No items in this collection.</div>
            ) : orderedItems.map((item) => {
              const selected = selectedItemId === item.id;
              const pinned = isItemPinnedToProject(item, project.id);
              return (
                <div key={item.id} role="button" tabIndex={0} onClick={() => selectProjectItem(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectProjectItem(item); } }} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderBottom: '1px solid var(--border)', background: selected ? 'var(--bg-active)' : 'transparent', color: selected ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer' }}>
                  <span style={{ width: 25, height: 25, borderRadius: 6, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-hover)', color: selected ? 'var(--accent)' : 'var(--text-faint)' }}>
                    {item.url ? <LinkVisual url={item.url} title={item.title} favicon={item.favicon} /> : <FileText size={12} />}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? 'var(--text)' : 'inherit', fontSize: 'var(--text-sm)', fontWeight: selected ? 600 : 500 }}>{item.title || 'Untitled'}</span>
                    {item.url ? (
                      <BookmarkUrlLink item={item} style={{ marginTop: 2, color: 'var(--accent)', fontSize: 'var(--text-xs)' }} />
                    ) : (
                      <span style={{ display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{item.notes || 'Note'}</span>
                    )}
                  </span>
                  <ItemFavoriteButton item={item} onUpdateItem={onUpdateItem} />
                  <button type="button" aria-label={pinned ? `Unpin ${item.title} from ${project.name}` : `Pin ${item.title} to ${project.name}`} title={pinned ? `Unpin from ${project.name}` : `Pin to ${project.name}`} disabled={!onUpdateItem || pinningItemId === item.id} onClick={(event) => { event.stopPropagation(); void toggleProjectPin(item); }} style={{ width: 26, height: 26, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 5, background: pinned ? 'var(--accent-weak)' : 'transparent', color: pinned ? 'var(--accent)' : 'var(--text-faint)', cursor: onUpdateItem ? 'pointer' : 'default' }}>
                    <Pin size={12} fill={pinned ? 'currentColor' : 'none'} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div style={panelStyle}>
          {selectedItem ? (
            <>
              <div style={panelHeaderStyle}>
                <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Item</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{selectedItemWorkspaceAction}</div>
              </div>
              <div className="scrollbar ui-scroll-footer-safe ui-detail-panel__body" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px' }}>
                <ItemWorkspace
                  item={selectedItem}
                  projects={organizationProjects ?? [project]}
                  collections={organizationCollections ?? collections}
                  onUpdateItem={onUpdateItem}
                  onCreateProject={onCreateProject}
                  onCreateCollection={onCreateCollection}
                  trailingActions={
                    <button type="button" disabled={!onUpdateItem || pinningItemId === selectedItem.id} onClick={() => void toggleProjectPin(selectedItem)} style={{ ...secondaryButtonStyle, flexShrink: 0 }}>
                      <Pin size={12} fill={isItemPinnedToProject(selectedItem, project.id) ? 'currentColor' : 'none'} />
                      {isItemPinnedToProject(selectedItem, project.id) ? 'Unpin' : 'Pin to project'}
                    </button>
                  }
                />
              </div>
            </>
          ) : selectedSessionTab ? (
            <>
              <div style={panelHeaderStyle}>
                <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Workspace entry</span>
              </div>
              <div style={{ flex: 1, minHeight: 0, padding: 18, overflowY: 'auto' }} className="scrollbar">
                <span style={{ width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: 'var(--accent-weak)', color: 'var(--accent)' }}>
                  {selectedSessionTab.kind === 'search' ? <Search size={15} /> : selectedSessionTab.kind === 'url' ? <ExternalLink size={15} /> : <Layers3 size={15} />}
                </span>
                <h2 style={{ margin: '13px 0 0', color: 'var(--text)', fontSize: 'var(--text-lg)' }}>
                  {selectedSessionTab.kind === 'url'
                    ? selectedSessionTab.title || 'Web page'
                    : selectedSessionTab.kind === 'search'
                      ? selectedSessionTab.query || 'Search'
                      : selectedSessionTab.kind === 'list'
                        ? selectedSessionTab.title
                        : 'Workspace item'}
                </h2>
                {selectedSessionTab.kind === 'url' && (
                  <>
                    <ExtensionPageUrlLink
                      url={selectedSessionTab.url}
                      style={{ marginTop: 7, color: 'var(--accent)', fontSize: 'var(--text-sm)', overflowWrap: 'anywhere', textDecoration: 'none' }}
                      title={`Open ${selectedSessionTab.url}`}
                    >
                      {selectedSessionTab.url}
                    </ExtensionPageUrlLink>
                  </>
                )}
                {selectedSessionTab.kind !== 'url' && (
                  <p style={{ margin: '9px 0 0', maxWidth: 420, color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.55 }}>This workspace entry has no additional detail view.</p>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 28, textAlign: 'center', color: 'var(--text-faint)' }}>
              <Layers3 size={24} />
              <strong style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Select an item</strong>
              <span style={{ maxWidth: 270, fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>View, edit, favorite, and organize project material here.</span>
            </div>
          )}
        </div>
      </section>)}
      {workspaceDeleteConfirm ? (
        <HubActionConfirmModal
          title="Delete project workspace?"
          description={`“${workspaceDeleteConfirm.name}” will be removed from this project.`}
          warning="Its saved working set will be deleted. Library items are not removed."
          confirmLabel="Delete workspace"
          confirmVariant="danger"
          onCancel={() => setWorkspaceDeleteConfirm(null)}
          onConfirm={() => {
            const sessionId = workspaceDeleteConfirm.id;
            setWorkspaceDeleteConfirm(null);
            onDeleteSavedWorkspace(sessionId);
          }}
        />
      ) : null}
      {workspaceManagerMode ? (
        <ProjectWorkspaceManagerDialog
          projectName={project.name}
          activeWorkspaceKey={activeWorkspaceKey}
          entries={workspaceManagerEntries}
          canCopyActiveWorkspace={workspaceManagerEntries.some((entry) => entry.key === activeWorkspaceKey)}
          initialMode={workspaceManagerMode}
          onClose={() => setWorkspaceManagerMode(null)}
          onActivate={switchWorkspace}
          onCreate={onCreateWorkspace}
          onRename={onRenameSavedWorkspace}
          onMerge={onMergeSavedWorkspace}
          onDelete={onDeleteSavedWorkspace}
        />
      ) : null}
      {recoveryOpen ? (
        <DialogShell
          title={`${project.name} recovery`}
          description="Restore items removed from this project, including items that were moved to the global Trash from here."
          onClose={() => { if (!restoringItemId) setRecoveryOpen(false); }}
          closeDisabled={restoringItemId !== null}
          maxWidth={620}
          footer={<button className="ui-button ui-button--secondary" type="button" disabled={restoringItemId !== null} onClick={() => setRecoveryOpen(false)}>Done</button>}
        >
          <div style={{ display: 'grid', gap: 18 }}>
            <section style={recoverySectionStyle}>
              <div>
                <h3 style={recoveryHeadingStyle}>Removed from {project.name}</h3>
                <p style={recoveryDescriptionStyle}>These items remain in your Library or another project, but were removed from this project only.</p>
              </div>
              {removedProjectItems.length === 0 ? (
                <p style={recoveryEmptyStyle}>No project-only removals.</p>
              ) : (
                <div style={recoveryListStyle}>
                  {removedProjectItems.map((item) => (
                    <div key={item.id} style={recoveryRowStyle}>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <strong style={recoveryItemTitleStyle}>{item.title || item.url || 'Untitled item'}</strong>
                        {item.url ? <span style={recoveryItemDetailStyle}>{item.url}</span> : null}
                      </span>
                      <button className="ui-button ui-button--secondary" type="button" disabled={restoringItemId !== null} onClick={() => void restoreProjectPlacements(item)}>
                        <RotateCcw size={12} /> Restore to project
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section style={recoverySectionStyle}>
              <div>
                <h3 style={recoveryHeadingStyle}>In Trash from {project.name}</h3>
                <p style={recoveryDescriptionStyle}>These items were globally removed, but had a saved location in this project.</p>
              </div>
              {trashedProjectItems.length === 0 ? (
                <p style={recoveryEmptyStyle}>No globally trashed items from this project.</p>
              ) : (
                <div style={recoveryListStyle}>
                  {trashedProjectItems.map((item) => (
                    <div key={item.id} style={recoveryRowStyle}>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <strong style={recoveryItemTitleStyle}>{item.title || item.url || 'Untitled item'}</strong>
                        {item.url ? <span style={recoveryItemDetailStyle}>{item.url}</span> : null}
                      </span>
                      <button className="ui-button ui-button--secondary" type="button" disabled={restoringItemId !== null} onClick={() => requestTrashRestore(item)}>
                        <RotateCcw size={12} /> Restore…
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </DialogShell>
      ) : null}
      {trashRestoreChoice ? (
        <DialogShell
          title="Restore this item?"
          description={<>This item was also saved outside <strong>{project.name}</strong>. Choose the scope to restore.</>}
          onClose={() => { if (!restoringItemId) setTrashRestoreChoice(null); }}
          closeDisabled={restoringItemId !== null}
          maxWidth={520}
          footer={(
            <>
              <button className="ui-button ui-button--secondary" type="button" disabled={restoringItemId !== null} onClick={() => setTrashRestoreChoice(null)}>Cancel</button>
              <button className="ui-button ui-button--secondary" type="button" disabled={restoringItemId !== null} onClick={() => void restoreTrashedToProject(trashRestoreChoice)}><RotateCcw size={12} /> Restore to {project.name}</button>
              <button className="ui-button ui-button--primary" type="button" disabled={restoringItemId !== null} onClick={() => void restoreTrashedEverywhere(trashRestoreChoice)}><RotateCcw size={12} /> Restore all locations</button>
            </>
          )}
        >
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.55 }}>
            Restoring to {project.name} keeps the item removed from its other former projects. Restoring all locations returns every original project and collection placement.
          </p>
        </DialogShell>
      ) : null}
      {transferEntryTab && transferDestinations.length > 0 ? (
        <DialogShell
          title="Copy or move workspace item"
          description={<>Choose where to send <strong>{transferEntryLabel}</strong>. Nothing changes until you choose Copy or Move.</>}
          onClose={() => setTransferEntryId(null)}
          maxWidth={460}
          footer={(
            <>
              <button className="ui-button ui-button--secondary" type="button" onClick={() => setTransferEntryId(null)}>Cancel</button>
              <button className="ui-button ui-button--secondary" type="button" onClick={() => transferEntry(transferEntryTab, 'copy')} disabled={!transferTargetWorkspaceKey}><Copy size={12} /> Copy</button>
              <button className="ui-button ui-button--primary" type="button" onClick={() => transferEntry(transferEntryTab, 'move')} disabled={!transferTargetWorkspaceKey}><MoveRight size={12} /> Move</button>
            </>
          )}
        >
          <label style={{ display: 'grid', gap: 7, color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
            Destination workspace
            <select
              className="ui-field"
              data-dialog-initial-focus
              value={transferTargetWorkspaceKey}
              onChange={(event) => setTransferTargetWorkspaceKey(event.target.value)}
              aria-label="Destination workspace"
            >
              {transferDestinations.map((destination) => <option key={destination.key} value={destination.key}>{destination.label}</option>)}
            </select>
          </label>
          <p style={{ margin: '12px 0 0', color: 'var(--text-faint)', fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>
            Copy keeps the item in this workspace. Move removes it here after adding it to the destination.
          </p>
        </DialogShell>
      ) : null}
    </div>
  );
};

const CollectionCard: React.FC<{ title: string; count: number; active: boolean; onClick: () => void; sample: Item[]; color?: string }> = ({ title, count, active, onClick, sample, color }) => (
  <button type="button" onClick={onClick} style={browseRowStyle(active)}>
    <span style={{ ...browseRowIconStyle, color: color || 'var(--accent)' }}><Folder size={12} /></span>
    <span style={{ minWidth: 0, flex: 1 }}>
      <span style={browseRowTitleStyle}>{title}</span>
      <span style={browseRowDetailStyle}>
        {sample.length > 0 ? sample.map((item) => item.title || 'Untitled').join(' · ') : 'No items yet'}
      </span>
    </span>
    <span style={{ color: active ? 'var(--accent)' : 'var(--text-faint)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>{count}</span>
  </button>
);

const panelStyle: React.CSSProperties = { ...uiPatterns.panel, height: '100%' };
const detailLabelStyle: React.CSSProperties = { color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 };
const sourceButtonStyle = (active: boolean): React.CSSProperties => ({ minHeight: 30, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: active ? 'var(--accent-weak)' : 'var(--bg-panel)', color: active ? 'var(--accent)' : 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 650, cursor: 'pointer' });
const viewTabStyle = uiPatterns.viewTab;
const panelHeaderStyle: React.CSSProperties = { ...uiPatterns.panelHeader, minHeight: 48, padding: '8px 12px' };
const sectionHeadingStyle: React.CSSProperties = { margin: 0, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontWeight: 650 };
const browseListStyle: React.CSSProperties = { maxHeight: 190, overflowY: 'auto', overflowX: 'hidden', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-panel)', boxShadow: 'var(--shadow-sm)' };
const browseRowStyle = (active: boolean): React.CSSProperties => ({ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', border: 'none', borderBottom: '1px solid var(--border)', background: active ? 'var(--bg-active)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-muted)', textAlign: 'left', cursor: 'pointer' });
const browseRowIconStyle: React.CSSProperties = { width: 25, height: 25, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: 'var(--bg-hover)', color: 'inherit' };
const browseRowTitleStyle: React.CSSProperties = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)', fontSize: 'var(--text-sm)', fontWeight: 600 };
const browseRowDetailStyle: React.CSSProperties = { display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' };
const secondaryButtonStyle = uiPatterns.secondaryButton;
const sessionIconButtonStyle: React.CSSProperties = { ...uiPatterns.iconButton, width: 25, height: 25, border: 'none' };
const destinationSelectStyle: React.CSSProperties = { ...uiPatterns.select, maxWidth: 190 };
const recoverySectionStyle: React.CSSProperties = { display: 'grid', gap: 9 };
const recoveryHeadingStyle: React.CSSProperties = { margin: 0, color: 'var(--text)', fontSize: 'var(--text-sm)', fontWeight: 700 };
const recoveryDescriptionStyle: React.CSSProperties = { margin: '3px 0 0', color: 'var(--text-faint)', fontSize: 'var(--text-xs)', lineHeight: 1.45 };
const recoveryEmptyStyle: React.CSSProperties = { margin: 0, padding: '10px 12px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' };
const recoveryListStyle: React.CSSProperties = { overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' };
const recoveryRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderBottom: '1px solid var(--border)' };
const recoveryItemTitleStyle: React.CSSProperties = { display: 'block', color: 'var(--text)', fontSize: 'var(--text-sm)', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const recoveryItemDetailStyle: React.CSSProperties = { display: 'block', marginTop: 2, color: 'var(--text-faint)', fontSize: 'var(--text-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
