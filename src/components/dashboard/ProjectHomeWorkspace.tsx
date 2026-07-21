import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Check, Copy, ExternalLink, FileText, Folder, Globe2, Layers3, Link2, Maximize2, MoveRight, Pin, Plus, Save, Search, Trash2, X } from 'lucide-react';
import type { Collection, Item, Project, UpdateItemOptions, Workspace } from '../../lib/db';
import { BookmarkUrlLink, ExtensionPageUrlLink } from './BookmarkUrlLink';
import { ItemFavoriteButton } from './ItemFavoriteButton';
import { ItemWorkspace } from './ItemWorkspace';
import { ContentBrowser, type ContentBrowseEntry, useContentBrowseMode } from './ContentBrowser';
import type { GlobalTab, SavedWorkspaceSession } from './GlobalTabSystem';
import {
  getProjectPinTimestamp,
  isItemPinnedToProject,
  sortItemsWithProjectPins,
  updateProjectPinMetadata,
} from './projectPins';
import { getHomebaseWorkspaceSessionKey, getProjectSessionWorkspaceKey, getSavedWorkspaceSessionKey } from './workspaceSession';
import { uiPatterns } from '../../styles/uiPatterns';
import { loadPageUiState, projectPageUiKey, savePageUiState } from '../../lib/shell/pageUiState';

interface ProjectHomeWorkspaceProps {
  project: Project;
  items: Item[];
  organizationItems?: Item[];
  collections: Collection[];
  organizationProjects?: Project[];
  organizationCollections?: Collection[];
  selectedCollectionId: string | 'all';
  onSelectCollection: (collectionId: string | 'all') => void;
  sessionTabs: GlobalTab[];
  activeSessionTabId?: string | null;
  onAddItemToSession: (item: Item) => void;
  onRemoveSessionTab: (tabId: string) => void;
  onFocusSession: (tabId?: string) => void;
  onOpenSearch: () => void;
  workspaces: Workspace[];
  savedWorkspaceSessions: SavedWorkspaceSession[];
  activeWorkspaceKey: string;
  onActivateWorkspace: (workspace: Workspace | null) => void;
  onActivateSavedWorkspace: (session: SavedWorkspaceSession) => void;
  onSaveWorkspace: (name: string) => string | void;
  onDeleteSavedWorkspace: (sessionId: string) => void;
  workspaceDestinations: Array<{ key: string; label: string }>;
  onAddItemToWorkspace: (item: Item, targetWorkspaceKey: string) => void;
  onTransferSessionEntry: (
    entry: GlobalTab,
    targetWorkspaceKey: string,
    mode: 'copy' | 'move'
  ) => void;
  onSelectedItemChange?: (item: Item | null) => void;
  onSelectSessionEntry?: (tab: GlobalTab) => void;
  includeGlobalWork?: boolean;
  onToggleIncludeGlobalWork?: () => void;
  onUpdateItem?: (
    id: string,
    updates: Partial<Omit<Item, 'id' | 'created_at'>>,
    options?: UpdateItemOptions
  ) => Promise<void>;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
}

export const ProjectHomeWorkspace: React.FC<ProjectHomeWorkspaceProps> = ({
  project,
  items,
  organizationItems,
  collections,
  organizationProjects,
  organizationCollections,
  selectedCollectionId,
  onSelectCollection,
  sessionTabs,
  activeSessionTabId,
  onAddItemToSession,
  onRemoveSessionTab,
  onFocusSession,
  onOpenSearch,
  workspaces,
  savedWorkspaceSessions,
  activeWorkspaceKey,
  onActivateWorkspace,
  onActivateSavedWorkspace,
  onSaveWorkspace,
  onDeleteSavedWorkspace,
  workspaceDestinations,
  onAddItemToWorkspace,
  onTransferSessionEntry,
  onSelectedItemChange,
  onSelectSessionEntry,
  includeGlobalWork = false,
  onToggleIncludeGlobalWork,
  onUpdateItem,
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
  const [showSaveWorkspace, setShowSaveWorkspace] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [itemTargetWorkspaceKey, setItemTargetWorkspaceKey] = useState('');
  const [transferEntryId, setTransferEntryId] = useState<string | null>(null);
  const [transferTargetWorkspaceKey, setTransferTargetWorkspaceKey] = useState('');
  const [browseSource, setBrowseSource] = useState<'workspace' | 'all' | 'pinned' | 'collection'>(
    initialPageUi.browseSource
  );
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
    () => sortItemsWithProjectPins(filteredItems, project.id),
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
    () => sortItemsWithProjectPins(items, project.id),
    [items, project.id]
  );
  const allItems = organizationItems ?? items;
  const selectedItem = allItems.find((item) => item.id === selectedItemId) ?? null;
  const selectedSessionTab = sessionTabs.find((tab) => tab.id === selectedSessionTabId) ?? null;
  const selectedItemSessionTab = selectedItem
    ? sessionTabs.find((tab) => tab.kind === 'item' && tab.itemId === selectedItem.id)
    : undefined;
  const workspaceBrowserUrls = useMemo(() => {
    const urls = sessionTabs.flatMap((tab) => {
      if (tab.kind === 'url') return [tab.url];
      if (tab.kind === 'item') {
        const url = items.find((item) => item.id === tab.itemId)?.url;
        return url ? [url] : [];
      }
      return [];
    });
    return [...new Set(urls.filter((url) => /^(https?:\/\/|file:\/\/)/i.test(url)))];
  }, [items, sessionTabs]);
  const activeWorkspace = workspaces.find(
    (workspace) => getSavedWorkspaceSessionKey(workspace.id) === activeWorkspaceKey
  );
  const activeSavedWorkspace = savedWorkspaceSessions.find(
    (session) => getHomebaseWorkspaceSessionKey(session.id) === activeWorkspaceKey
  );
  const hasWorkspaceChoices = savedWorkspaceSessions.length > 0 || workspaces.length > 0;
  const transferDestinations = workspaceDestinations.filter(
    (destination) => destination.key !== activeWorkspaceKey
  );
  const selectedCollection =
    selectedCollectionId === 'all'
      ? null
      : collections.find((collection) => collection.id === selectedCollectionId) ?? null;

  useEffect(() => {
    savePageUiState(pageUiKey, { selectedItemId, selectedSessionTabId, browseSource });
  }, [browseSource, pageUiKey, selectedItemId, selectedSessionTabId]);

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
    if (!workspaceDestinations.some((destination) => destination.key === itemTargetWorkspaceKey)) {
      setItemTargetWorkspaceKey(
        workspaceDestinations.find((destination) => destination.key !== activeWorkspaceKey)?.key
          ?? workspaceDestinations[0]?.key
          ?? ''
      );
    }
  }, [activeWorkspaceKey, itemTargetWorkspaceKey, workspaceDestinations]);

  useEffect(() => {
    if (!transferDestinations.some((destination) => destination.key === transferTargetWorkspaceKey)) {
      setTransferTargetWorkspaceKey(transferDestinations[0]?.key ?? '');
    }
  }, [transferDestinations, transferTargetWorkspaceKey]);

  useEffect(() => {
    if (browseSource !== 'workspace') setShowSaveWorkspace(false);
  }, [browseSource]);

  const saveWorkspace = () => {
    const name = workspaceName.trim();
    if (!name) {
      setWorkspaceError('Workspace name is required.');
      return;
    }
    const error = onSaveWorkspace(name);
    if (error) {
      setWorkspaceError(error);
      return;
    }
    setShowSaveWorkspace(false);
    setWorkspaceName('');
    setWorkspaceError(null);
  };

  const openWorkspaceInBrowser = () => {
    if (workspaceBrowserUrls.length === 0) return;
    if (typeof chrome !== 'undefined' && chrome.windows?.create) {
      void chrome.windows.create({ url: workspaceBrowserUrls });
      return;
    }
    for (const url of workspaceBrowserUrls) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const switchWorkspace = (workspaceKey: string) => {
    if (workspaceKey === getProjectSessionWorkspaceKey(project.id)) {
      onActivateWorkspace(null);
      return;
    }
    const savedSession = savedWorkspaceSessions.find(
      (session) => getHomebaseWorkspaceSessionKey(session.id) === workspaceKey
    );
    if (savedSession) {
      onActivateSavedWorkspace(savedSession);
      return;
    }
    const browserWorkspace = workspaces.find(
      (workspace) => getSavedWorkspaceSessionKey(workspace.id) === workspaceKey
    );
    if (browserWorkspace) onActivateWorkspace(browserWorkspace);
  };

  const transferEntry = (entry: GlobalTab, mode: 'copy' | 'move') => {
    if (!transferTargetWorkspaceKey) return;
    onTransferSessionEntry(entry, transferTargetWorkspaceKey, mode);
    setTransferEntryId(null);
    if (mode === 'move') setSelectedSessionTabId(null);
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
      await onUpdateItem(item.id, {
        metadata: updateProjectPinMetadata(item.metadata, project.id, pinned ? undefined : Date.now()),
      });
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
      icon: tab.kind === 'search' ? <Search size={12} /> : tab.kind === 'url' ? <ExternalLink size={12} /> : item?.url ? <Link2 size={12} /> : <FileText size={12} />,
      subtitle: tab.kind === 'url'
        ? <ExtensionPageUrlLink url={tab.url} style={{ color: 'inherit' }} title={`Open ${tab.url}`}>{tab.url}</ExtensionPageUrlLink>
        : tab.kind === 'item' && item?.url
          ? <BookmarkUrlLink item={item} style={{ color: 'inherit' }} />
          : tab.kind === 'search'
            ? `Search · ${searchScope}`
            : tab.kind === 'list'
              ? 'Saved list'
              : item?.notes || 'Note',
      actions: (
        <>
          <button type="button" onClick={() => onFocusSession(tab.id)} title={`Focus ${label}`} aria-label={`Focus ${label}`} style={sessionIconButtonStyle}><Maximize2 size={11} /></button>
          {transferable && transferDestinations.length > 0 && <button type="button" onClick={() => { setTransferEntryId((current) => current === tab.id ? null : tab.id); setTransferTargetWorkspaceKey(transferDestinations[0]?.key ?? ''); }} title={`Copy or move ${label}`} aria-label={`Copy or move ${label}`} style={sessionIconButtonStyle}><ArrowRightLeft size={11} /></button>}
          <button type="button" onClick={() => { if (selectedSessionTabId === tab.id) { setSelectedSessionTabId(null); setSelectedItemId(null); } onRemoveSessionTab(tab.id); }} title={`Remove ${label} from workspace`} aria-label={`Remove ${label} from workspace`} style={sessionIconButtonStyle}><X size={12} /></button>
        </>
      ),
    };
  });
  const materialBrowseItems = browseSource === 'pinned'
    ? pinnedItems
    : browseSource === 'collection'
      ? orderedItems
      : allProjectItems;
  const materialBrowseEntries: ContentBrowseEntry[] = materialBrowseItems.map((item) => {
    const pinned = isItemPinnedToProject(item, project.id);
    return {
      id: item.id,
      title: item.title || 'Untitled',
      icon: item.url ? <Link2 size={12} /> : <FileText size={12} />,
      subtitle: item.url ? <BookmarkUrlLink item={item} style={{ color: 'inherit' }} /> : item.notes || 'Empty note',
      actions: (
        <>
          <ItemFavoriteButton item={item} onUpdateItem={onUpdateItem} stopPropagation />
          <button type="button" aria-label={pinned ? `Unpin ${item.title} from ${project.name}` : `Pin ${item.title} to ${project.name}`} title={pinned ? `Unpin from ${project.name}` : `Pin to ${project.name}`} disabled={!onUpdateItem || pinningItemId === item.id} onClick={() => void toggleProjectPin(item)} style={{ ...sessionIconButtonStyle, color: pinned ? 'var(--accent)' : 'var(--text-faint)' }}><Pin size={12} fill={pinned ? 'currentColor' : 'none'} /></button>
        </>
      ),
    };
  });
  const browseEntries = browseSource === 'workspace' ? workspaceBrowseEntries : materialBrowseEntries;
  const browseTitle = browseSource === 'workspace'
    ? activeSavedWorkspace?.name ?? activeWorkspace?.name ?? 'Live session'
    : browseSource === 'pinned'
      ? `Pinned to ${project.name}`
      : browseSource === 'collection'
        ? selectedCollection?.name ?? 'Collection'
        : project.isDefault ? 'Incoming' : 'All project items';
  const browseSelectedId = browseSource === 'workspace' ? selectedSessionTabId : selectedItemId;

  const selectBrowseEntry = (id: string) => {
    if (browseSource === 'workspace') {
      const tab = sessionTabs.find((candidate) => candidate.id === id);
      if (tab) selectSessionTab(tab);
      return;
    }
    const item = materialBrowseItems.find((candidate) => candidate.id === id);
    if (item) selectProjectItem(item);
  };

  const detailPanel = (
    <section style={panelStyle} aria-label="Selected project content">
      {selectedItem ? (
        <>
          <div style={panelHeaderStyle}>
            <span style={detailLabelStyle}>Item</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {selectedItemSessionTab && <button type="button" onClick={() => onFocusSession(selectedItemSessionTab.id)} style={secondaryButtonStyle}><Maximize2 size={12} /> Focus</button>}
              {workspaceDestinations.length > 1 ? (
                <>
                  <select value={itemTargetWorkspaceKey} onChange={(event) => setItemTargetWorkspaceKey(event.target.value)} aria-label={`Workspace for ${selectedItem.title || 'item'}`} style={destinationSelectStyle}>
                    {workspaceDestinations.map((destination) => <option key={destination.key} value={destination.key}>{destination.label}{destination.key === activeWorkspaceKey ? ' (current)' : ''}</option>)}
                  </select>
                  <button type="button" onClick={() => onAddItemToWorkspace(selectedItem, itemTargetWorkspaceKey)} disabled={!itemTargetWorkspaceKey} style={primaryButtonStyle}><Plus size={12} /> Add</button>
                </>
              ) : !selectedItemSessionTab ? (
                <button type="button" onClick={() => onAddItemToSession(selectedItem)} style={primaryButtonStyle}><Plus size={12} /> Add to workspace</button>
              ) : null}
            </div>
          </div>
          <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 }}>
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
            <span style={detailLabelStyle}>Workspace entry</span>
            <button type="button" onClick={() => onFocusSession(selectedSessionTab.id)} style={primaryButtonStyle}><Maximize2 size={12} /> Focus</button>
          </div>
          {transferEntryId === selectedSessionTab.id && transferDestinations.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 8, borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
              <select value={transferTargetWorkspaceKey} onChange={(event) => setTransferTargetWorkspaceKey(event.target.value)} aria-label="Workspace destination" style={destinationSelectStyle}>
                {transferDestinations.map((destination) => <option key={destination.key} value={destination.key}>{destination.label}</option>)}
              </select>
              <button type="button" onClick={() => transferEntry(selectedSessionTab, 'copy')} disabled={!transferTargetWorkspaceKey} style={secondaryButtonStyle}><Copy size={11} /> Copy</button>
              <button type="button" onClick={() => transferEntry(selectedSessionTab, 'move')} disabled={!transferTargetWorkspaceKey} style={secondaryButtonStyle}><MoveRight size={11} /> Move</button>
            </div>
          )}
          <div className="scrollbar" style={{ flex: 1, minHeight: 0, padding: 18, overflowY: 'auto' }}>
            <span style={{ width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: 'var(--accent-weak)', color: 'var(--accent)' }}>
              {selectedSessionTab.kind === 'search' ? <Search size={15} /> : selectedSessionTab.kind === 'url' ? <ExternalLink size={15} /> : <Layers3 size={15} />}
            </span>
            <h2 style={{ margin: '13px 0 0', color: 'var(--text)', fontSize: 'var(--text-lg)' }}>{selectedSessionTab.kind === 'url' ? selectedSessionTab.title || 'Web page' : selectedSessionTab.kind === 'search' ? selectedSessionTab.query || 'Search' : selectedSessionTab.kind === 'list' ? selectedSessionTab.title : 'Workspace item'}</h2>
            {selectedSessionTab.kind === 'url' ? (
              <ExtensionPageUrlLink url={selectedSessionTab.url} style={{ marginTop: 7, color: 'var(--accent)', fontSize: 'var(--text-sm)', overflowWrap: 'anywhere', textDecoration: 'none' }} title={`Open ${selectedSessionTab.url}`}>{selectedSessionTab.url}</ExtensionPageUrlLink>
            ) : (
              <p style={{ margin: '9px 0 0', maxWidth: 420, color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.55 }}>This workspace entry uses its full interactive view in Focus mode.</p>
            )}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 28, textAlign: 'center', color: 'var(--text-faint)' }}>
          <Layers3 size={24} />
          <strong style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Select something to work with</strong>
          <span style={{ maxWidth: 300, fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>Links and notes are editable here. Searches and saved lists can open in Focus when you need their full view.</span>
        </div>
      )}
    </section>
  );

  return (
    <div
      className="scrollbar ui-page-frame"
      style={{
        ...uiPatterns.pageFrame,
        overflow: 'hidden',
        overflowX: 'hidden',
      }}
    >
      <header className="ui-page-header" style={{ ...uiPatterns.pageHeader, width: '100%', maxWidth: 1120, margin: '0 auto' }}>
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
        <button className="ui-button ui-button--secondary" type="button" onClick={onOpenSearch} style={secondaryButtonStyle}>
          <Search size={13} />
          {browseSource === 'collection' ? 'Search collection' : 'Search project'}
        </button>
      </header>

      <section style={{ width: '100%', maxWidth: 1120, minHeight: 0, flex: 1, margin: '0 auto', display: 'flex', flexDirection: 'column' }} aria-label="Project workspace">
        <div className="ui-tab-bar" data-project-view-tabs style={{ ...uiPatterns.tabBar, marginBottom: 8 }} role="tablist" aria-label="Project view">
          <button className="ui-view-tab" type="button" role="tab" aria-selected={browseSource === 'all'} onClick={() => { setBrowseSource('all'); setSelectedSessionTabId(null); if (selectedItemId && !allProjectItems.some((item) => item.id === selectedItemId)) setSelectedItemId(null); if (selectedCollectionId !== 'all') onSelectCollection('all'); }} style={viewTabStyle(browseSource === 'all')}><Folder size={12} /> {project.isDefault ? 'Incoming' : 'All items'}</button>
          <button className="ui-view-tab" type="button" role="tab" aria-selected={browseSource === 'pinned'} onClick={() => { setBrowseSource('pinned'); setSelectedSessionTabId(null); if (selectedItemId && !pinnedItems.some((item) => item.id === selectedItemId)) setSelectedItemId(null); }} style={viewTabStyle(browseSource === 'pinned')}><Pin size={12} /> Pinned <span style={{ color: 'var(--text-faint)' }}>{pinnedItems.length}</span></button>
          {!project.isDefault && collections.length > 0 && (
            <div style={compoundTabStyle(browseSource === 'collection')}>
              <button type="button" role="tab" aria-selected={browseSource === 'collection'} onClick={() => { const collectionId = selectedCollectionId !== 'all' ? selectedCollectionId : collections[0]?.id; if (!collectionId) return; setBrowseSource('collection'); setSelectedSessionTabId(null); setSelectedItemId(null); onSelectCollection(collectionId); }} style={compoundTabButtonStyle}><Folder size={12} /> Collection</button>
              <select value={selectedCollectionId === 'all' ? '' : selectedCollectionId} onChange={(event) => { const collectionId = event.target.value; if (!collectionId) return; setBrowseSource('collection'); setSelectedSessionTabId(null); setSelectedItemId(null); onSelectCollection(collectionId); }} aria-label="Collection view" style={tabSelectStyle}>
                <option value="">Choose…</option>
                {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
              </select>
            </div>
          )}
          <div style={compoundTabStyle(browseSource === 'workspace')}>
            <button type="button" role="tab" aria-selected={browseSource === 'workspace'} onClick={viewActiveWorkspace} style={compoundTabButtonStyle}><Layers3 size={12} /> Workspace</button>
            <select value={activeWorkspaceKey} onChange={(event) => { setBrowseSource('workspace'); setSelectedSessionTabId(null); setSelectedItemId(null); switchWorkspace(event.target.value); }} aria-label="Workspace view" style={{ ...tabSelectStyle, minWidth: 120 }}>
              <option value={getProjectSessionWorkspaceKey(project.id)}>Live session</option>
              {savedWorkspaceSessions.map((session) => <option key={session.id} value={getHomebaseWorkspaceSessionKey(session.id)}>{session.name}</option>)}
              {workspaces.map((workspace) => <option key={workspace.id} value={getSavedWorkspaceSessionKey(workspace.id)}>{workspace.name} · browser</option>)}
            </select>
          </div>
          {browseSource === 'workspace' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {activeSavedWorkspace && <button type="button" onClick={() => { if (window.confirm(`Delete workspace “${activeSavedWorkspace.name}”?`)) onDeleteSavedWorkspace(activeSavedWorkspace.id); }} title={`Delete ${activeSavedWorkspace.name}`} style={secondaryButtonStyle}><Trash2 size={11} /> Delete</button>}
            <button type="button" onClick={() => { setShowSaveWorkspace((visible) => !visible); setWorkspaceError(null); }} style={secondaryButtonStyle}>
              <Save size={12} /> Save as workspace
            </button>
            {onToggleIncludeGlobalWork && (
              <button type="button" onClick={onToggleIncludeGlobalWork} aria-pressed={includeGlobalWork} style={{ ...secondaryButtonStyle, borderColor: includeGlobalWork ? 'var(--border-active)' : 'var(--border)', background: includeGlobalWork ? 'var(--accent-weak)' : 'transparent', color: includeGlobalWork ? 'var(--accent)' : 'var(--text-muted)' }}>
                <Globe2 size={12} /> {includeGlobalWork ? 'Including global' : 'Include global work'}
              </button>
            )}
            <button type="button" disabled={workspaceBrowserUrls.length === 0} onClick={openWorkspaceInBrowser} title={workspaceBrowserUrls.length === 0 ? 'This workspace has no browser links' : `Open ${workspaceBrowserUrls.length} link${workspaceBrowserUrls.length !== 1 ? 's' : ''} in a new browser window`} style={{ ...secondaryButtonStyle, opacity: workspaceBrowserUrls.length === 0 ? 0.45 : 1, cursor: workspaceBrowserUrls.length === 0 ? 'default' : 'pointer' }}>
              <ExternalLink size={12} /> Open links
            </button>
            <button type="button" disabled={sessionTabs.length === 0} onClick={() => onFocusSession(selectedSessionTab?.id)} style={{ ...primaryButtonStyle, opacity: sessionTabs.length === 0 ? 0.45 : 1, cursor: sessionTabs.length === 0 ? 'default' : 'pointer' }}>
              <Maximize2 size={12} /> Focus
            </button>
          </div>}
        </div>
        {showSaveWorkspace && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 9, padding: 9, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-panel)' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <input
                autoFocus
                value={workspaceName}
                onChange={(event) => { setWorkspaceName(event.target.value); setWorkspaceError(null); }}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveWorkspace(); } }}
                placeholder="Workspace name"
                aria-label="Workspace name"
                style={{ width: '100%', height: 31, padding: '0 9px', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--text-sm)' }}
              />
              {workspaceError && <div role="alert" style={{ marginTop: 5, color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>{workspaceError}</div>}
            </div>
            <button type="button" onClick={saveWorkspace} disabled={!workspaceName.trim()} style={{ ...primaryButtonStyle, opacity: workspaceName.trim() ? 1 : 0.5 }}>
              Save
            </button>
            <button type="button" onClick={() => { setShowSaveWorkspace(false); setWorkspaceName(''); setWorkspaceError(null); }} aria-label="Cancel saving workspace" style={sessionIconButtonStyle}>
              <X size={13} />
            </button>
          </div>
        )}
        {showLegacyProjectBrowser && hasWorkspaceChoices && <div className="scrollbar" data-browse-surface="project-workspaces" style={{ ...browseListStyle, marginBottom: 9 }} aria-label="Project workspaces">
          <button type="button" onClick={() => onActivateWorkspace(null)} style={browseRowStyle(activeWorkspaceKey === getProjectSessionWorkspaceKey(project.id))}>
            <span style={browseRowIconStyle}><Layers3 size={12} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={browseRowTitleStyle}>Live session</span>
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
                <button type="button" onClick={(event) => { event.stopPropagation(); if (window.confirm(`Delete workspace “${session.name}”?`)) onDeleteSavedWorkspace(session.id); }} title={`Delete ${session.name}`} aria-label={`Delete ${session.name}`} style={sessionIconButtonStyle}><Trash2 size={11} /></button>
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
              {activeSavedWorkspace?.name ?? activeWorkspace?.name ?? 'Live session'}
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
                      {tab.kind === 'search' ? <Search size={11} /> : tab.kind === 'url' ? <ExternalLink size={11} /> : item?.url ? <Link2 size={11} /> : <FileText size={11} />}
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
                    <button type="button" onClick={(event) => { event.stopPropagation(); onFocusSession(tab.id); }} title={`Focus ${label}`} aria-label={`Focus ${label}`} style={sessionIconButtonStyle}><Maximize2 size={11} /></button>
                    {transferable && transferDestinations.length > 0 && <button type="button" onClick={(event) => { event.stopPropagation(); setTransferEntryId((current) => current === tab.id ? null : tab.id); setTransferTargetWorkspaceKey(transferDestinations[0]?.key ?? ''); }} title={`Copy or move ${label}`} aria-label={`Copy or move ${label}`} style={sessionIconButtonStyle}><ArrowRightLeft size={11} /></button>}
                    <button type="button" onClick={(event) => { event.stopPropagation(); if (selectedSessionTabId === tab.id) setSelectedSessionTabId(null); onRemoveSessionTab(tab.id); }} title={`Remove ${label} from workspace`} aria-label={`Remove ${label} from workspace`} style={sessionIconButtonStyle}><X size={12} /></button>
                  </div>
                  {transferable && transferEntryId === tab.id && transferDestinations.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px 7px 42px', borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
                      <select value={transferTargetWorkspaceKey} onChange={(event) => setTransferTargetWorkspaceKey(event.target.value)} onClick={(event) => event.stopPropagation()} aria-label={`Destination for ${label}`} style={destinationSelectStyle}>
                        {transferDestinations.map((destination) => <option key={destination.key} value={destination.key}>{destination.label}</option>)}
                      </select>
                      <button type="button" onClick={(event) => { event.stopPropagation(); transferEntry(tab, 'copy'); }} disabled={!transferTargetWorkspaceKey} style={secondaryButtonStyle}><Copy size={11} /> Copy</button>
                      <button type="button" onClick={(event) => { event.stopPropagation(); transferEntry(tab, 'move'); }} disabled={!transferTargetWorkspaceKey} style={secondaryButtonStyle}><MoveRight size={11} /> Move</button>
                    </div>
                  )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>)}
        {showLegacyProjectBrowser && (<div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }} role="group" aria-label="Project content source">
          <button type="button" aria-pressed={browseSource === 'workspace'} onClick={() => { setBrowseSource('workspace'); setSelectedItemId(selectedSessionTab?.kind === 'item' ? selectedSessionTab.itemId : null); }} style={sourceButtonStyle(browseSource === 'workspace')}><Layers3 size={12} /> Workspace</button>
          <button type="button" aria-pressed={browseSource === 'all'} onClick={() => { setBrowseSource('all'); setSelectedSessionTabId(null); if (selectedItemId && !allProjectItems.some((item) => item.id === selectedItemId)) setSelectedItemId(null); if (selectedCollectionId !== 'all') onSelectCollection('all'); }} style={sourceButtonStyle(browseSource === 'all')}><Folder size={12} /> {project.isDefault ? 'Incoming' : 'All items'}</button>
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
        <div className="ui-working-canvas" data-project-working-canvas style={{ flex: 1, minHeight: 360, display: 'grid', gridTemplateColumns: 'minmax(280px, 0.9fr) minmax(0, 1.35fr)', gap: 12 }}>
          <ContentBrowser
            title={browseTitle}
            entries={browseEntries}
            selectedId={browseSelectedId}
            onSelect={selectBrowseEntry}
            mode={browseMode}
            onModeChange={setBrowseMode}
            emptyMessage={browseSource === 'workspace' ? 'This workspace is empty. Add project material to begin.' : browseSource === 'pinned' ? 'Nothing is pinned to this project yet.' : 'No items in this source.'}
            ariaLabel={browseSource === 'workspace' ? 'Workspace contents' : 'Project material'}
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
                <span style={browseRowIconStyle}>{item.url ? <Link2 size={12} /> : <FileText size={12} />}</span>
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
                    {item.url ? <Link2 size={12} /> : <FileText size={12} />}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? 'var(--text)' : 'inherit', fontSize: 'var(--text-sm)', fontWeight: selected ? 600 : 500 }}>{item.title || 'Untitled'}</span>
                    {item.url ? (
                      <BookmarkUrlLink item={item} style={{ marginTop: 2, color: 'var(--accent)', fontSize: 'var(--text-xs)' }} />
                    ) : (
                      <span style={{ display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{item.notes || 'Note'}</span>
                    )}
                  </span>
                  <ItemFavoriteButton item={item} onUpdateItem={onUpdateItem} stopPropagation />
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {selectedItemSessionTab && <button type="button" onClick={() => onFocusSession(selectedItemSessionTab.id)} style={secondaryButtonStyle}><Maximize2 size={12} /> Focus</button>}
                  {workspaceDestinations.length > 1 ? (
                    <>
                      <select value={itemTargetWorkspaceKey} onChange={(event) => setItemTargetWorkspaceKey(event.target.value)} aria-label={`Workspace for ${selectedItem.title || 'item'}`} style={destinationSelectStyle}>
                        {workspaceDestinations.map((destination) => <option key={destination.key} value={destination.key}>{destination.label}{destination.key === activeWorkspaceKey ? ' (current)' : ''}</option>)}
                      </select>
                      <button type="button" onClick={() => onAddItemToWorkspace(selectedItem, itemTargetWorkspaceKey)} disabled={!itemTargetWorkspaceKey} style={primaryButtonStyle}><Plus size={12} /> Add</button>
                    </>
                  ) : !selectedItemSessionTab ? (
                    <button type="button" onClick={() => onAddItemToSession(selectedItem)} style={primaryButtonStyle}><Plus size={12} /> Add to workspace</button>
                  ) : null}
                </div>
              </div>
              <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px' }}>
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
                <button type="button" onClick={() => onFocusSession(selectedSessionTab.id)} style={primaryButtonStyle}>
                  <Maximize2 size={12} /> Focus
                </button>
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
                  <p style={{ margin: '9px 0 0', maxWidth: 420, color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.55 }}>This workspace entry uses its full interactive view in Focus mode.</p>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 28, textAlign: 'center', color: 'var(--text-faint)' }}>
              <Layers3 size={24} />
              <strong style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Select an item</strong>
              <span style={{ maxWidth: 270, fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>View, edit, favorite, and organize project material here. Focus opens the same work on a larger canvas.</span>
            </div>
          )}
        </div>
      </section>)}
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
const compoundTabStyle = (active: boolean): React.CSSProperties => ({ minHeight: 31, display: 'inline-flex', alignItems: 'center', overflow: 'hidden', border: active ? '1px solid var(--border-active)' : '1px solid transparent', borderRadius: 'var(--radius-sm)', background: active ? 'var(--accent-weak)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-muted)' });
const compoundTabButtonStyle: React.CSSProperties = { height: 29, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 7px 0 9px', border: 'none', background: 'transparent', color: 'inherit', fontSize: 'var(--text-xs)', fontWeight: 650, cursor: 'pointer' };
const tabSelectStyle: React.CSSProperties = { minWidth: 96, maxWidth: 155, height: 25, marginRight: 3, padding: '0 5px', border: 'none', borderLeft: '1px solid var(--border)', outline: 'none', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--text-xs)' };
const panelHeaderStyle: React.CSSProperties = { ...uiPatterns.panelHeader, minHeight: 48, padding: '8px 12px' };
const sectionHeadingStyle: React.CSSProperties = { margin: 0, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontWeight: 650 };
const browseListStyle: React.CSSProperties = { maxHeight: 190, overflowY: 'auto', overflowX: 'hidden', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-panel)', boxShadow: 'var(--shadow-sm)' };
const browseRowStyle = (active: boolean): React.CSSProperties => ({ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', border: 'none', borderBottom: '1px solid var(--border)', background: active ? 'var(--bg-active)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-muted)', textAlign: 'left', cursor: 'pointer' });
const browseRowIconStyle: React.CSSProperties = { width: 25, height: 25, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: 'var(--bg-hover)', color: 'inherit' };
const browseRowTitleStyle: React.CSSProperties = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)', fontSize: 'var(--text-sm)', fontWeight: 600 };
const browseRowDetailStyle: React.CSSProperties = { display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' };
const secondaryButtonStyle = uiPatterns.secondaryButton;
const primaryButtonStyle = uiPatterns.primaryButton;
const sessionIconButtonStyle: React.CSSProperties = { ...uiPatterns.iconButton, width: 25, height: 25, border: 'none' };
const destinationSelectStyle: React.CSSProperties = { ...uiPatterns.select, maxWidth: 190 };
