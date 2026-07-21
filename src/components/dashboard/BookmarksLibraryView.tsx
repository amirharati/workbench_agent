import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, FileText, Focus, Library, Link2, Pin, Plus, Search, Trash2, Upload } from 'lucide-react';
import type { Collection, Item, Project, UpdateItemOptions } from '../../lib/db';
import type { CategoryBrowseFilter, PipelineBrowseFilter } from '../../lib/pipeline';
import { BookmarkUrlLink, openBookmarkInBrowser } from './BookmarkUrlLink';
import { NewItemModal } from './CreateModals';
import type { GlobalTab, GlobalTabState, SavedWorkspaceSession } from './GlobalTabSystem';
import { getHomeScopeItems } from './homeScope';
import { ItemFavoriteButton } from './ItemFavoriteButton';
import { ItemWorkspace } from './ItemWorkspace';
import { ListPipelineBadge } from './PipelineDisplayBlocks';
import { ScopeChipsBar } from './ScopeChipsBar';
import { usePipelineBadgeMap } from '../../hooks/usePipelineBadgeMap';
import { isItemPinnedToProject, updateProjectPinMetadata } from './projectPins';
import { ContentBrowser, useContentBrowseMode } from './ContentBrowser';
import { uiPatterns } from '../../styles/uiPatterns';
import { libraryPageUiKey, loadPageUiState, savePageUiState } from '../../lib/shell/pageUiState';
import {
  activateProjectWorkspace,
  activateSavedProjectWorkspace,
  addEntryToProjectWorkspace,
  getActiveProjectWorkspaceKey,
  getHomebaseWorkspaceSessionKey,
  getProjectSessionWorkspaceKey,
} from './workspaceSession';
import { HubActionConfirmModal } from './HubActionConfirmModal';

const GLOBAL_WORKSPACE_KEY = 'global-session:all';

export interface BookmarkWorkspaceDestination {
  key: string;
  label: string;
  projectId: string | 'all';
  session?: SavedWorkspaceSession;
}

interface BookmarksLibraryViewProps {
  items: Item[];
  collections: Collection[];
  projects: Project[];
  scopeProjectId: string | 'all';
  scopeCollectionId: string | 'all';
  homeState: GlobalTabState;
  onHomeStateChange: (next: GlobalTabState) => void;
  onUpdateItem?: (
    id: string,
    updates: Partial<Omit<Item, 'id' | 'created_at'>>,
    options?: UpdateItemOptions
  ) => Promise<void>;
  onDeleteItem?: (id: string) => Promise<void>;
  onCreateItem?: (data: { title: string; url?: string; notes?: string; collectionIds: string[] }) => Promise<void>;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  onOpenImport?: () => void;
  onOpenHome?: () => void;
  onSelectProjectScope?: (projectId: string | 'all') => void;
  onResetScope?: () => void;
  onClearProjectScope?: () => void;
  onClearCollectionScope?: () => void;
  categoryBrowse?: CategoryBrowseFilter | null;
  pipelineBrowse?: PipelineBrowseFilter | null;
  onClearCategoryBrowse?: () => void;
  onClearPipelineBrowse?: () => void;
  onSelectedItemChange?: (item: Item | null) => void;
  initialTypeFilter?: LibraryTypeFilter;
}

export type LibraryTypeFilter = 'all' | 'links' | 'notes';

type LibraryPageUiState = {
  query: string;
  typeFilter: LibraryTypeFilter;
  selectedItemId: string | null;
  workspaceKey: string;
};

const LIBRARY_PAGE_UI_DEFAULT: LibraryPageUiState = {
  query: '',
  typeFilter: 'all',
  selectedItemId: null,
  workspaceKey: GLOBAL_WORKSPACE_KEY,
};

export function buildBookmarkWorkspaceDestinations(
  projects: readonly Project[],
  sessions: readonly SavedWorkspaceSession[]
): BookmarkWorkspaceDestination[] {
  return [
    { key: GLOBAL_WORKSPACE_KEY, label: 'All Library · Global workspace', projectId: 'all' },
    ...projects.flatMap((project) => [
      {
        key: getProjectSessionWorkspaceKey(project.id),
        label: `${project.name} · Live session`,
        projectId: project.id,
      },
      ...sessions
        .filter((session) => session.projectId === project.id)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((session) => ({
          key: getHomebaseWorkspaceSessionKey(session.id),
          label: `${project.name} · ${session.name}`,
          projectId: project.id,
          session,
        })),
    ]),
  ];
}

function destinationTab(item: Item, destination: BookmarkWorkspaceDestination): GlobalTab {
  const projectId = destination.projectId === 'all' ? undefined : destination.projectId;
  return {
    kind: 'item',
    id: `item-${item.id}${projectId ? `@project:${projectId}` : ''}`,
    itemId: item.id,
    ...(projectId ? { scopeProjectId: projectId } : {}),
  };
}

export function addBookmarkToWorkspace(
  state: GlobalTabState,
  item: Item,
  destination: BookmarkWorkspaceDestination,
  options: { focus?: boolean; items?: readonly Item[] } = {}
): GlobalTabState {
  const entry = destinationTab(item, destination);
  let next: GlobalTabState;

  if (destination.projectId === 'all') {
    const exists = state.tabs.some(
      (tab) => tab.kind === 'item' && tab.itemId === item.id && !tab.scopeProjectId
    );
    next = {
      ...state,
      tabs: exists ? state.tabs : [...state.tabs, entry],
      activeTabId: options.focus ? entry.id : null,
      lastActiveTabByProject: {
        ...(state.lastActiveTabByProject ?? {}),
        all: entry.id,
      },
    };
  } else {
    next = addEntryToProjectWorkspace({
      state,
      projectId: destination.projectId,
      targetWorkspaceKey: destination.key,
      entry,
    });

    if (options.focus && getActiveProjectWorkspaceKey(next, destination.projectId) !== destination.key) {
      next = destination.session
        ? activateSavedProjectWorkspace({ state: next, session: destination.session })
        : activateProjectWorkspace({
            state: next,
            projectId: destination.projectId,
            workspace: null,
            items: options.items ?? [],
          });
    }

    next = {
      ...next,
      activeTabId: options.focus ? entry.id : null,
      lastActiveTabByProject: {
        ...(next.lastActiveTabByProject ?? {}),
        [destination.projectId]: entry.id,
      },
    };
  }

  return next;
}

export const BookmarksLibraryView: React.FC<BookmarksLibraryViewProps> = ({
  items,
  collections,
  projects,
  scopeProjectId,
  scopeCollectionId,
  homeState,
  onHomeStateChange,
  onUpdateItem,
  onDeleteItem,
  onCreateItem,
  onCreateProject,
  onCreateCollection,
  onOpenImport,
  onOpenHome,
  onSelectProjectScope,
  onResetScope,
  onClearProjectScope,
  onClearCollectionScope,
  categoryBrowse,
  pipelineBrowse,
  onClearCategoryBrowse,
  onClearPipelineBrowse,
  onSelectedItemChange,
  initialTypeFilter = 'all',
}) => {
  const pageUiKey = libraryPageUiKey(
    initialTypeFilter === 'notes' ? 'notes' : 'library',
    scopeProjectId,
    scopeCollectionId
  );
  const [initialPageUi] = useState(() => loadPageUiState(pageUiKey, LIBRARY_PAGE_UI_DEFAULT));
  const [query, setQuery] = useState(initialPageUi.query);
  const [typeFilter, setTypeFilter] = useState<LibraryTypeFilter>(
    initialTypeFilter === 'all' ? initialPageUi.typeFilter : initialTypeFilter
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initialPageUi.selectedItemId);
  const [createKind, setCreateKind] = useState<'bookmark' | 'note' | null>(null);
  const [workspaceKey, setWorkspaceKey] = useState(initialPageUi.workspaceKey);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [pinningItemId, setPinningItemId] = useState<string | null>(null);
  const [trashConfirmItem, setTrashConfirmItem] = useState<Item | null>(null);
  const [browseMode, setBrowseMode] = useContentBrowseMode('workbench:library-content-view');

  const destinations = useMemo(
    () => buildBookmarkWorkspaceDestinations(projects, homeState.savedWorkspaceSessions ?? []),
    [homeState.savedWorkspaceSessions, projects]
  );
  const scopedItems = useMemo(() => {
    let result = getHomeScopeItems(items, collections, scopeProjectId, scopeCollectionId)
      .filter((item) => item.deletedAt == null);
    if (typeFilter === 'links') result = result.filter((item) => Boolean(item.url?.trim()));
    if (typeFilter === 'notes') result = result.filter((item) => !item.url?.trim());
    if (categoryBrowse) {
      const allowed = new Set(categoryBrowse.itemIds);
      result = result.filter((item) => allowed.has(item.id));
    }
    if (pipelineBrowse) {
      const allowed = new Set(pipelineBrowse.itemIds);
      result = result.filter((item) => allowed.has(item.id));
    }
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) {
      result = result.filter((item) =>
        [item.title, item.url, item.notes, ...(item.tags ?? [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      );
    }
    return [...result].sort(
      (left, right) =>
        Number(right.favoriteAt != null) - Number(left.favoriteAt != null) ||
        (right.updated_at ?? right.created_at) - (left.updated_at ?? left.created_at)
    );
  }, [categoryBrowse, collections, items, pipelineBrowse, query, scopeCollectionId, scopeProjectId, typeFilter]);
  const badgeMap = usePipelineBadgeMap(
    scopedItems.filter((item) => Boolean(item.url?.trim())).map((item) => item.id)
  );
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const activeProject = scopeProjectId === 'all'
    ? null
    : projects.find((project) => project.id === scopeProjectId) ?? null;
  const selectedDestination = destinations.find((destination) => destination.key === workspaceKey)
    ?? destinations[0];
  const browseEntries = scopedItems.map((item) => {
    const isLink = Boolean(item.url?.trim());
    return {
      id: item.id,
      title: item.title || 'Untitled',
      icon: isLink ? <ListPipelineBadge badge={badgeMap.get(item.id)} /> : <FileText size={12} />,
      subtitle: isLink
        ? <BookmarkUrlLink item={item} style={{ display: 'block', color: 'inherit' }} />
        : item.notes?.trim() || 'Empty note',
      meta: new Date(item.updated_at ?? item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      actions: (
        <>
          <ItemFavoriteButton item={item} onUpdateItem={onUpdateItem} stopPropagation />
          {isLink && <button className="ui-button ui-button--icon" type="button" onClick={() => void openBookmarkInBrowser(item)} title={`Open ${item.title || 'link'}`} aria-label={`Open ${item.title || 'link'}`} style={iconButtonStyle}><ExternalLink size={12} /></button>}
        </>
      ),
    };
  });

  useEffect(() => {
    const preferredKey = scopeProjectId === 'all'
      ? GLOBAL_WORKSPACE_KEY
      : getActiveProjectWorkspaceKey(homeState, scopeProjectId);
    setWorkspaceKey((current) =>
      destinations.some((destination) => destination.key === current)
        ? current
        : destinations.some((destination) => destination.key === preferredKey)
          ? preferredKey
          : scopeProjectId === 'all'
            ? GLOBAL_WORKSPACE_KEY
            : getProjectSessionWorkspaceKey(scopeProjectId)
    );
  }, [destinations, scopeProjectId]);

  useEffect(() => {
    if (selectedItemId && items.length > 0 && !scopedItems.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(null);
    }
  }, [items.length, scopedItems, selectedItemId]);

  useEffect(() => {
    savePageUiState<LibraryPageUiState>(pageUiKey, {
      query,
      typeFilter,
      selectedItemId,
      workspaceKey,
    });
  }, [pageUiKey, query, selectedItemId, typeFilter, workspaceKey]);

  useEffect(() => {
    if (initialTypeFilter !== 'all') setTypeFilter(initialTypeFilter);
  }, [initialTypeFilter]);

  useEffect(() => {
    onSelectedItemChange?.(selectedItem);
  }, [onSelectedItemChange, selectedItem]);

  const addToWorkspace = (focus = false) => {
    if (!selectedItem || !selectedDestination) return;
    onHomeStateChange(addBookmarkToWorkspace(homeState, selectedItem, selectedDestination, { focus, items }));
    setWorkspaceNotice(focus ? `Opening in ${selectedDestination.label}` : `Added to ${selectedDestination.label}`);
    if (focus) {
      if (selectedDestination.projectId === 'all') onResetScope?.();
      else onSelectProjectScope?.(selectedDestination.projectId);
      onOpenHome?.();
    }
  };

  const removeSelectedItem = () => {
    if (!selectedItem || !onDeleteItem) return;
    setTrashConfirmItem(selectedItem);
  };

  const toggleProjectPin = async () => {
    if (!selectedItem || !activeProject || !onUpdateItem || pinningItemId) return;
    setPinningItemId(selectedItem.id);
    try {
      const pinned = isItemPinnedToProject(selectedItem, activeProject.id);
      await onUpdateItem(selectedItem.id, {
        metadata: updateProjectPinMetadata(
          selectedItem.metadata,
          activeProject.id,
          pinned ? undefined : Date.now()
        ),
      });
    } finally {
      setPinningItemId(null);
    }
  };

  return (
    <div className="ui-page-frame" style={uiPatterns.pageFrame}>
      <header className="ui-page-header" style={uiPatterns.pageHeader}>
        <div>
          <h1 style={uiPatterns.pageTitle}>Library</h1>
          <p style={uiPatterns.pageDescription}>Browse and maintain your saved links and notes.</p>
        </div>
        <div className="ui-action-row" style={uiPatterns.actionRow}>
          {onOpenImport && <button className="ui-button ui-button--secondary" type="button" onClick={onOpenImport} style={secondaryButtonStyle}><Upload size={12} /> Import</button>}
          {onCreateItem && <button className="ui-button ui-button--secondary" type="button" onClick={() => setCreateKind('note')} style={secondaryButtonStyle}><FileText size={12} /> New note</button>}
          {onCreateItem && <button className="ui-button ui-button--primary" type="button" onClick={() => setCreateKind('bookmark')} style={primaryButtonStyle}><Plus size={12} /> Add link</button>}
        </div>
      </header>

      <div style={{ flexShrink: 0 }}>
        <div className="ui-tab-bar" data-library-view-tabs role="tablist" aria-label="Library view" style={{ ...uiPatterns.tabBar, marginBottom: 8 }}>
          <button className="ui-view-tab" type="button" role="tab" aria-selected={typeFilter === 'all'} onClick={() => setTypeFilter('all')} style={viewTabStyle(typeFilter === 'all')}><Library size={12} /> All items</button>
          <button className="ui-view-tab" type="button" role="tab" aria-selected={typeFilter === 'links'} onClick={() => setTypeFilter('links')} style={viewTabStyle(typeFilter === 'links')}><Link2 size={12} /> Links</button>
          <button className="ui-view-tab" type="button" role="tab" aria-selected={typeFilter === 'notes'} onClick={() => setTypeFilter('notes')} style={viewTabStyle(typeFilter === 'notes')}><FileText size={12} /> Notes</button>
        </div>
        <label style={{ ...uiPatterns.searchField, height: 36 }}>
          <Search size={14} color="var(--text-faint)" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by title, URL, note text, or tag…" aria-label="Filter library" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 'var(--text-sm)' }} />
        </label>
        <ScopeChipsBar
          scopeProjectId={scopeProjectId}
          scopeCollectionId={scopeCollectionId}
          projects={projects}
          collections={collections}
          categoryBrowse={categoryBrowse}
          pipelineBrowse={pipelineBrowse}
          itemCount={scopedItems.length}
          onClearProject={onClearProjectScope ?? (() => {})}
          onClearCollection={onClearCollectionScope ?? (() => {})}
          onResetScope={onResetScope ?? (() => {})}
          onClearCategoryBrowse={onClearCategoryBrowse}
          onClearPipelineBrowse={onClearPipelineBrowse}
        />
      </div>

      <div className="ui-split-canvas ui-adaptive-browser" data-detail-open={selectedItem ? 'true' : 'false'} style={uiPatterns.splitCanvas}>
        <ContentBrowser
          title={typeFilter === 'links' ? 'Saved links' : typeFilter === 'notes' ? 'Notes' : 'All items'}
          entries={browseEntries}
          selectedId={selectedItemId}
          onSelect={(id) => { setSelectedItemId(id); setWorkspaceNotice(null); }}
          mode={browseMode}
          onModeChange={setBrowseMode}
          emptyMessage={query.trim() ? 'No items match this filter.' : 'No items in this scope.'}
          ariaLabel="Item library"
        />

        <section className="ui-panel ui-detail-panel" style={panelStyle} aria-label="Selected library item">
          {selectedItem ? (
            <>
              <div className="ui-detail-panel__header" style={{ ...panelHeaderStyle, alignItems: 'center' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: 'block', color: 'var(--text)', fontSize: 'var(--text-sm)' }}>Item</strong>
                  {workspaceNotice && <span role="status" style={{ display: 'block', marginTop: 2, color: 'var(--accent)', fontSize: 'var(--text-xs)' }}>{workspaceNotice}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button className="ui-button ui-button--secondary ui-adaptive-detail-back" type="button" onClick={() => setSelectedItemId(null)} style={secondaryButtonStyle}><ArrowLeft size={12} /> Browse</button>
                  <select value={workspaceKey} onChange={(event) => { setWorkspaceKey(event.target.value); setWorkspaceNotice(null); }} aria-label={`Workspace for ${selectedItem.title || 'item'}`} style={destinationSelectStyle}>
                    {destinations.map((destination) => <option key={destination.key} value={destination.key}>{destination.label}</option>)}
                  </select>
                  <button className="ui-button ui-button--secondary" type="button" onClick={() => addToWorkspace(false)} style={secondaryButtonStyle}><Plus size={12} /> Add</button>
                  <button className="ui-button ui-button--primary" type="button" onClick={() => addToWorkspace(true)} style={primaryButtonStyle}><Focus size={12} /> Focus</button>
                  {onDeleteItem && <button className="ui-button ui-button--icon ui-button--danger" type="button" onClick={() => void removeSelectedItem()} title="Move to trash" aria-label={`Move ${selectedItem.title || 'item'} to trash`} style={{ ...iconButtonStyle, color: 'var(--danger)' }}><Trash2 size={13} /></button>}
                </div>
              </div>
              <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 }}>
                <ItemWorkspace
                  item={selectedItem}
                  projects={projects}
                  collections={collections}
                  onUpdateItem={onUpdateItem}
                  onCreateProject={onCreateProject}
                  onCreateCollection={onCreateCollection}
                  trailingActions={activeProject ? (
                    <button className="ui-button ui-button--secondary" type="button" disabled={!onUpdateItem || pinningItemId === selectedItem.id} onClick={() => void toggleProjectPin()} style={secondaryButtonStyle}>
                      <Pin size={12} fill={isItemPinnedToProject(selectedItem, activeProject.id) ? 'currentColor' : 'none'} />
                      {isItemPinnedToProject(selectedItem, activeProject.id) ? 'Unpin' : 'Pin to project'}
                    </button>
                  ) : undefined}
                />
              </div>
            </>
          ) : (
            <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', padding: 24, color: 'var(--text-faint)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>Select an item to inspect and edit it.</div>
          )}
        </section>
      </div>

      {onCreateItem && <NewItemModal open={createKind != null} onClose={() => setCreateKind(null)} kind={createKind ?? 'bookmark'} projects={projects} collections={collections} defaultProjectId={scopeProjectId !== 'all' ? scopeProjectId : undefined} defaultCollectionId={scopeCollectionId !== 'all' ? scopeCollectionId : undefined} onCreateProject={onCreateProject} onCreateCollection={onCreateCollection} onCreate={async (data) => { await onCreateItem(data); setCreateKind(null); }} />}
      {trashConfirmItem ? (
        <HubActionConfirmModal
          title="Move item to trash?"
          description={`“${trashConfirmItem.title || 'Untitled'}” will leave the active library view.`}
          warning="You can restore it later from Trash."
          confirmLabel="Move to trash"
          confirmVariant="danger"
          onCancel={() => setTrashConfirmItem(null)}
          onConfirm={() => {
            if (!onDeleteItem) return;
            const targetId = trashConfirmItem.id;
            setTrashConfirmItem(null);
            void onDeleteItem(targetId).then(() => {
              setSelectedItemId((current) => current === targetId ? null : current);
            });
          }}
        />
      ) : null}
    </div>
  );
};

const panelStyle = uiPatterns.panel;
const panelHeaderStyle = uiPatterns.panelHeader;
const secondaryButtonStyle = uiPatterns.secondaryButton;
const primaryButtonStyle = uiPatterns.primaryButton;
const iconButtonStyle = uiPatterns.iconButton;
const destinationSelectStyle: React.CSSProperties = { ...uiPatterns.select, minWidth: 155 };
const viewTabStyle = uiPatterns.viewTab;
