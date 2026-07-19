import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, Focus, Pin, Plus, Search, Trash2, Upload } from 'lucide-react';
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
import {
  activateProjectWorkspace,
  activateSavedProjectWorkspace,
  addEntryToProjectWorkspace,
  getActiveProjectWorkspaceKey,
  getHomebaseWorkspaceSessionKey,
  getProjectSessionWorkspaceKey,
} from './workspaceSession';

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
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<LibraryTypeFilter>(initialTypeFilter);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [createKind, setCreateKind] = useState<'bookmark' | 'note' | null>(null);
  const [workspaceKey, setWorkspaceKey] = useState(GLOBAL_WORKSPACE_KEY);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [pinningItemId, setPinningItemId] = useState<string | null>(null);

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

  useEffect(() => {
    const preferredKey = scopeProjectId === 'all'
      ? GLOBAL_WORKSPACE_KEY
      : getActiveProjectWorkspaceKey(homeState, scopeProjectId);
    setWorkspaceKey(
      destinations.some((destination) => destination.key === preferredKey)
        ? preferredKey
        : scopeProjectId === 'all'
          ? GLOBAL_WORKSPACE_KEY
          : getProjectSessionWorkspaceKey(scopeProjectId)
    );
  }, [destinations, scopeProjectId]);

  useEffect(() => {
    if (selectedItemId && !scopedItems.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(null);
    }
  }, [scopedItems, selectedItemId]);

  useEffect(() => {
    setTypeFilter(initialTypeFilter);
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

  const removeSelectedItem = async () => {
    if (!selectedItem || !onDeleteItem) return;
    if (!window.confirm(`Move “${selectedItem.title || 'Untitled'}” to trash?`)) return;
    await onDeleteItem(selectedItem.id);
    setSelectedItemId(null);
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
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px 18px 72px', boxSizing: 'border-box', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--text)', fontSize: 'var(--text-xl)', fontWeight: 700 }}>Library</h1>
          <p style={{ margin: '3px 0 0', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>Browse and maintain your saved links and notes.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {onOpenImport && <button type="button" onClick={onOpenImport} style={secondaryButtonStyle}><Upload size={12} /> Import</button>}
          {onCreateItem && <button type="button" onClick={() => setCreateKind('note')} style={secondaryButtonStyle}><FileText size={12} /> New note</button>}
          {onCreateItem && <button type="button" onClick={() => setCreateKind('bookmark')} style={primaryButtonStyle}><Plus size={12} /> Add link</button>}
        </div>
      </header>

      <div style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ height: 36, width: 'min(560px, 100%)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 11px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--input-bg)', boxSizing: 'border-box' }}>
            <Search size={14} color="var(--text-faint)" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by title, URL, note text, or tag…" aria-label="Filter library" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 'var(--text-sm)' }} />
          </label>
          <div role="group" aria-label="Library item type" style={{ height: 34, display: 'inline-flex', alignItems: 'center', padding: 2, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-panel)' }}>
            {(['all', 'links', 'notes'] as const).map((filter) => (
              <button key={filter} type="button" aria-pressed={typeFilter === filter} onClick={() => setTypeFilter(filter)} style={{ height: 28, padding: '0 10px', border: 'none', borderRadius: 'var(--radius-sm)', background: typeFilter === filter ? 'var(--accent-weak)' : 'transparent', color: typeFilter === filter ? 'var(--accent)' : 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 650, cursor: 'pointer', textTransform: 'capitalize' }}>{filter}</button>
            ))}
          </div>
        </div>
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

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(280px, 390px) minmax(0, 1fr)', gap: 12 }}>
        <section style={panelStyle} aria-label="Item library">
          <div style={panelHeaderStyle}>
            <strong style={{ color: 'var(--text)', fontSize: 'var(--text-sm)' }}>{typeFilter === 'links' ? 'Saved links' : typeFilter === 'notes' ? 'Notes' : 'All items'}</strong>
            <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{scopedItems.length}</span>
          </div>
          <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {scopedItems.length === 0 ? (
              <div style={{ padding: 24, color: 'var(--text-faint)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>{query.trim() ? 'No items match this filter.' : 'No items in this scope.'}</div>
            ) : scopedItems.map((item) => {
              const selected = selectedItemId === item.id;
              const isLink = Boolean(item.url?.trim());
              return (
                <div key={item.id} role="button" tabIndex={0} aria-current={selected ? 'true' : undefined} onClick={() => { setSelectedItemId(item.id); setWorkspaceNotice(null); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedItemId(item.id); setWorkspaceNotice(null); } }} style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 54, padding: '7px 9px', borderBottom: '1px solid var(--border)', borderLeft: selected ? '3px solid var(--accent)' : '3px solid transparent', background: selected ? 'var(--accent-weak)' : 'transparent', cursor: 'pointer' }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: selected ? 'var(--accent)' : 'var(--text)', fontSize: 'var(--text-sm)', fontWeight: selected ? 700 : 600 }}>
                      {isLink ? <ListPipelineBadge badge={badgeMap.get(item.id)} /> : <FileText size={12} color="var(--text-faint)" />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || 'Untitled'}</span>
                    </span>
                    {isLink ? <BookmarkUrlLink item={item} style={{ display: 'block', color: 'var(--text-faint)' }} /> : <span style={{ display: '-webkit-box', marginTop: 2, overflow: 'hidden', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, color: 'var(--text-faint)', fontSize: 'var(--text-xs)', lineHeight: 1.35 }}>{item.notes?.trim() || 'Empty note'}</span>}
                  </span>
                  <ItemFavoriteButton item={item} onUpdateItem={onUpdateItem} stopPropagation />
                  {isLink && <button type="button" onClick={(event) => { event.stopPropagation(); void openBookmarkInBrowser(item); }} title={`Open ${item.title || 'link'}`} aria-label={`Open ${item.title || 'link'}`} style={iconButtonStyle}><ExternalLink size={12} /></button>}
                </div>
              );
            })}
          </div>
        </section>

        <section style={panelStyle} aria-label="Selected library item">
          {selectedItem ? (
            <>
              <div style={{ ...panelHeaderStyle, alignItems: 'center' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: 'block', color: 'var(--text)', fontSize: 'var(--text-sm)' }}>Item</strong>
                  {workspaceNotice && <span role="status" style={{ display: 'block', marginTop: 2, color: 'var(--accent)', fontSize: 'var(--text-xs)' }}>{workspaceNotice}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <select value={workspaceKey} onChange={(event) => { setWorkspaceKey(event.target.value); setWorkspaceNotice(null); }} aria-label={`Workspace for ${selectedItem.title || 'item'}`} style={destinationSelectStyle}>
                    {destinations.map((destination) => <option key={destination.key} value={destination.key}>{destination.label}</option>)}
                  </select>
                  <button type="button" onClick={() => addToWorkspace(false)} style={secondaryButtonStyle}><Plus size={12} /> Add</button>
                  <button type="button" onClick={() => addToWorkspace(true)} style={primaryButtonStyle}><Focus size={12} /> Focus</button>
                  {onDeleteItem && <button type="button" onClick={() => void removeSelectedItem()} title="Move to trash" aria-label={`Move ${selectedItem.title || 'item'} to trash`} style={{ ...iconButtonStyle, color: '#ef4444' }}><Trash2 size={13} /></button>}
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
                    <button type="button" disabled={!onUpdateItem || pinningItemId === selectedItem.id} onClick={() => void toggleProjectPin()} style={secondaryButtonStyle}>
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
    </div>
  );
};

const panelStyle: React.CSSProperties = { minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-panel)', boxShadow: 'var(--shadow-sm)' };
const panelHeaderStyle: React.CSSProperties = { minHeight: 42, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 11px', borderBottom: '1px solid var(--border)', boxSizing: 'border-box' };
const secondaryButtonStyle: React.CSSProperties = { minHeight: 29, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 9px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const primaryButtonStyle: React.CSSProperties = { ...secondaryButtonStyle, borderColor: 'var(--accent)', background: 'var(--accent)', color: '#fff' };
const iconButtonStyle: React.CSSProperties = { width: 27, height: 27, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer' };
const destinationSelectStyle: React.CSSProperties = { minWidth: 155, maxWidth: 230, height: 29, padding: '0 7px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--text-xs)' };
