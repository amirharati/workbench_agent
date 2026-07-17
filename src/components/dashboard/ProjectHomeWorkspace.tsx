import React, { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, FileText, Folder, Layers3, Link2, Maximize2, Pin, Plus, Search, X } from 'lucide-react';
import type { Collection, Item, Project, UpdateItemOptions, Workspace } from '../../lib/db';
import { BookmarkUrlLink, ExtensionPageUrlLink } from './BookmarkUrlLink';
import type { GlobalTab } from './GlobalTabSystem';
import {
  getProjectPinTimestamp,
  isItemPinnedToProject,
  sortItemsWithProjectPins,
  updateProjectPinMetadata,
} from './projectPins';
import { getProjectSessionWorkspaceKey, getSavedWorkspaceSessionKey } from './workspaceSession';

interface ProjectHomeWorkspaceProps {
  project: Project;
  items: Item[];
  collections: Collection[];
  selectedCollectionId: string | 'all';
  onSelectCollection: (collectionId: string | 'all') => void;
  sessionTabs: GlobalTab[];
  onAddItemToSession: (item: Item) => void;
  onRemoveSessionTab: (tabId: string) => void;
  onFocusSession: (tabId?: string) => void;
  onOpenSearch: () => void;
  workspaces: Workspace[];
  activeWorkspaceKey: string;
  onActivateWorkspace: (workspace: Workspace | null) => void;
  onUpdateItem?: (
    id: string,
    updates: Partial<Omit<Item, 'id' | 'created_at'>>,
    options?: UpdateItemOptions
  ) => Promise<void>;
}

export const ProjectHomeWorkspace: React.FC<ProjectHomeWorkspaceProps> = ({
  project,
  items,
  collections,
  selectedCollectionId,
  onSelectCollection,
  sessionTabs,
  onAddItemToSession,
  onRemoveSessionTab,
  onFocusSession,
  onOpenSearch,
  workspaces,
  activeWorkspaceKey,
  onActivateWorkspace,
  onUpdateItem,
}) => {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedSessionTabId, setSelectedSessionTabId] = useState<string | null>(null);
  const [pinningItemId, setPinningItemId] = useState<string | null>(null);

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
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const selectedSessionTab = sessionTabs.find((tab) => tab.id === selectedSessionTabId) ?? null;
  const selectedItemSessionTab = selectedItem
    ? sessionTabs.find((tab) => tab.kind === 'item' && tab.itemId === selectedItem.id)
    : undefined;
  const activeWorkspace = workspaces.find(
    (workspace) => getSavedWorkspaceSessionKey(workspace.id) === activeWorkspaceKey
  );
  const selectedCollection =
    selectedCollectionId === 'all'
      ? null
      : collections.find((collection) => collection.id === selectedCollectionId) ?? null;

  useEffect(() => {
    setSelectedItemId(null);
  }, [project.id, selectedCollectionId]);

  useEffect(() => {
    setSelectedSessionTabId(null);
  }, [project.id, activeWorkspaceKey]);

  const selectSessionTab = (tab: GlobalTab) => {
    setSelectedSessionTabId(tab.id);
    setSelectedItemId(tab.kind === 'item' ? tab.itemId : null);
  };

  const selectProjectItem = (item: Item) => {
    setSelectedSessionTabId(null);
    setSelectedItemId(item.id);
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

  return (
    <div
      className="scrollbar"
      style={{
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <header style={{ width: '100%', maxWidth: 1120, margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-weak)', color: 'var(--accent)' }}>
              <Folder size={17} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, color: 'var(--text)', fontSize: 'var(--text-xl)', lineHeight: 1.2 }}>{project.name}</h1>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                {project.description || `${items.length} item${items.length !== 1 ? 's' : ''} · ${collections.length} collection${collections.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
        </div>
        <button type="button" onClick={onOpenSearch} style={secondaryButtonStyle}>
          <Search size={13} />
          {selectedCollectionId === 'all' ? 'Search project' : 'Search collection'}
        </button>
      </header>

      <section style={{ width: '100%', maxWidth: 1120, margin: '0 auto' }} aria-labelledby="project-workspaces-heading">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 9 }}>
          <div>
            <h2 id="project-workspaces-heading" style={sectionHeadingStyle}><Layers3 size={13} /> Workspaces</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>Switch working sets here. The workspace you leave is preserved automatically.</p>
          </div>
          <button type="button" disabled={sessionTabs.length === 0} onClick={() => onFocusSession(selectedSessionTab?.id)} style={{ ...primaryButtonStyle, opacity: sessionTabs.length === 0 ? 0.45 : 1, cursor: sessionTabs.length === 0 ? 'default' : 'pointer' }}>
            <Maximize2 size={12} /> Focus workspace
          </button>
        </div>
        <div className="hide-scrollbar" style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 9 }} aria-label="Project workspaces">
          <button type="button" onClick={() => onActivateWorkspace(null)} style={workspaceSwitchStyle(activeWorkspaceKey === getProjectSessionWorkspaceKey(project.id))}>
            {activeWorkspaceKey === getProjectSessionWorkspaceKey(project.id) && <Check size={11} />}
            Project session
          </button>
          {workspaces.map((workspace) => {
            const active = activeWorkspaceKey === getSavedWorkspaceSessionKey(workspace.id);
            return (
              <button key={workspace.id} type="button" onClick={() => onActivateWorkspace(workspace)} title={`Activate ${workspace.name}`} style={workspaceSwitchStyle(active)}>
                {active && <Check size={11} />}
                <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workspace.name}</span>
              </button>
            );
          })}
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--bg-panel)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ minHeight: 39, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 11px', borderBottom: sessionTabs.length > 0 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ minWidth: 0, color: 'var(--text)', fontSize: 'var(--text-sm)', fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeWorkspace?.name ?? 'Project session'}
            </span>
            <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>{sessionTabs.length} item{sessionTabs.length !== 1 ? 's' : ''}</span>
          </div>
          {sessionTabs.length === 0 ? (
            <div style={{ padding: '14px 12px', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>This workspace is empty. Preview project material and add what you want to work with.</div>
          ) : (
            <div className="scrollbar" style={{ maxHeight: 190, overflowY: 'auto' }}>
              {sessionTabs.map((tab) => {
                const item = tab.kind === 'item' ? items.find((candidate) => candidate.id === tab.itemId) : undefined;
                const label = item?.title || (tab.kind === 'url' ? tab.title || tab.url : tab.kind === 'search' ? tab.query || 'Search' : tab.kind === 'list' ? tab.title : 'Untitled');
                const detail = tab.kind === 'url' ? tab.url : tab.kind === 'search' ? 'Search' : tab.kind === 'list' ? 'List' : item?.url || 'Note';
                const selected = selectedSessionTabId === tab.id;
                return (
                  <div key={tab.id} role="button" tabIndex={0} onClick={() => selectSessionTab(tab)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectSessionTab(tab); } }} style={{ minHeight: 42, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 6px 11px', borderBottom: '1px solid var(--border)', background: selected ? 'var(--bg-active)' : 'transparent', cursor: 'pointer' }}>
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
                    <button type="button" onClick={(event) => { event.stopPropagation(); if (selectedSessionTabId === tab.id) setSelectedSessionTabId(null); onRemoveSessionTab(tab.id); }} title={`Remove ${label} from workspace`} aria-label={`Remove ${label} from workspace`} style={sessionIconButtonStyle}><X size={12} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {pinnedItems.length > 0 && (
        <section style={{ width: '100%', maxWidth: 1120, margin: '0 auto' }} aria-labelledby="project-pinned-heading">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 id="project-pinned-heading" style={sectionHeadingStyle}><Pin size={13} /> Pinned to {project.name}</h2>
            <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{pinnedItems.length}</span>
          </div>
          <div className="hide-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            {pinnedItems.map((item) => (
              <button key={item.id} type="button" onClick={() => selectProjectItem(item)} style={{ ...miniCardStyle, borderColor: selectedItemId === item.id ? 'var(--accent)' : 'var(--border)' }}>
                {item.url ? <Link2 size={12} /> : <FileText size={12} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || 'Untitled'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section style={{ width: '100%', maxWidth: 1120, margin: '0 auto' }} aria-labelledby="project-collections-heading">
        <h2 id="project-collections-heading" style={{ ...sectionHeadingStyle, marginBottom: 8 }}><Folder size={13} /> Collections</h2>
        <div className="hide-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          <CollectionCard
            title="All items"
            count={items.length}
            active={selectedCollectionId === 'all'}
            onClick={() => onSelectCollection('all')}
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
                onClick={() => onSelectCollection(collection.id)}
                sample={collectionItems.slice(0, 2)}
              />
            );
          })}
        </div>
      </section>

      <section style={{ width: '100%', maxWidth: 1120, margin: '0 auto', minHeight: 360, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14, alignItems: 'stretch' }}>
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 'var(--text-sm)', fontWeight: 650 }}>{selectedCollection?.name ?? 'All items'}</h2>
              <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{orderedItems.length} item{orderedItems.length !== 1 ? 's' : ''}</span>
            </div>
            <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>Select to preview</span>
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
                <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Preview</span>
                {selectedItemSessionTab ? (
                  <button type="button" onClick={() => onFocusSession(selectedItemSessionTab.id)} style={primaryButtonStyle}>
                    <Maximize2 size={12} /> Focus
                  </button>
                ) : (
                  <button type="button" onClick={() => onAddItemToSession(selectedItem)} style={primaryButtonStyle}>
                    <Plus size={12} /> Add to workspace
                  </button>
                )}
              </div>
              <div className="scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 'var(--text-lg)', lineHeight: 1.35 }}>{selectedItem.title || 'Untitled'}</h2>
                    {selectedItem.url && <BookmarkUrlLink item={selectedItem} style={{ marginTop: 6 }} />}
                  </div>
                  <button type="button" disabled={!onUpdateItem || pinningItemId === selectedItem.id} onClick={() => void toggleProjectPin(selectedItem)} style={{ ...secondaryButtonStyle, flexShrink: 0 }}>
                    <Pin size={12} fill={isItemPinnedToProject(selectedItem, project.id) ? 'currentColor' : 'none'} />
                    {isItemPinnedToProject(selectedItem, project.id) ? 'Unpin' : 'Pin to project'}
                  </button>
                </div>
                {selectedItem.notes ? (
                  <div style={{ marginTop: 18, color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{selectedItem.notes}</div>
                ) : (
                  <div style={{ marginTop: 18, padding: '16px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>No notes yet. Add this item to the active workspace when you want to keep working with it.</div>
                )}
                {selectedItem.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 18 }}>
                    {selectedItem.tags.map((tag) => <span key={tag} style={{ padding: '2px 6px', borderRadius: 999, background: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{tag}</span>)}
                  </div>
                )}
                <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--border)', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
                  {collections.filter((collection) => selectedItem.collectionIds.includes(collection.id)).map((collection) => collection.name).join(' · ') || project.name}
                </div>
              </div>
            </>
          ) : selectedSessionTab ? (
            <>
              <div style={panelHeaderStyle}>
                <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Workspace preview</span>
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
              <strong style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Select an item to preview</strong>
              <span style={{ maxWidth: 270, fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>Browse project material or choose something from the active workspace. Nothing leaves this page until you explicitly enter Focus.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

const CollectionCard: React.FC<{ title: string; count: number; active: boolean; onClick: () => void; sample: Item[]; color?: string }> = ({ title, count, active, onClick, sample, color }) => (
  <button type="button" onClick={onClick} style={{ width: 190, minWidth: 190, minHeight: 92, padding: '10px 11px', border: '1px solid', borderColor: active ? 'var(--accent)' : 'var(--border)', borderRadius: 'var(--radius-md)', background: active ? 'var(--accent-weak)' : 'var(--bg-panel)', color: active ? 'var(--text)' : 'var(--text-muted)', textAlign: 'left', cursor: 'pointer', boxShadow: active ? '0 0 0 1px var(--accent-weak)' : 'var(--shadow-sm)' }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', fontWeight: 650 }}>
      <span style={{ width: 8, height: 8, borderRadius: 3, background: color || 'var(--accent)', flexShrink: 0 }} />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{title}</span>
      <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontWeight: 500 }}>{count}</span>
    </span>
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8, color: 'var(--text-faint)', fontSize: 10 }}>
      {sample.length > 0 ? sample.map((item) => <span key={item.id} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || 'Untitled'}</span>) : <span>No items yet</span>}
    </span>
  </button>
);

const panelStyle: React.CSSProperties = { minHeight: 360, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-panel)', boxShadow: 'var(--shadow-sm)' };
const panelHeaderStyle: React.CSSProperties = { minHeight: 48, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)' };
const sectionHeadingStyle: React.CSSProperties = { margin: 0, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontWeight: 650 };
const miniCardStyle: React.CSSProperties = { minWidth: 155, maxWidth: 210, height: 34, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 9px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-panel)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' };
const secondaryButtonStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 29, padding: '0 9px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' };
const primaryButtonStyle: React.CSSProperties = { ...secondaryButtonStyle, borderColor: 'var(--accent)', background: 'var(--accent)', color: '#fff' };
const workspaceSwitchStyle = (active: boolean): React.CSSProperties => ({ minHeight: 28, display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, padding: '0 9px', border: '1px solid', borderColor: active ? 'var(--border-active)' : 'var(--border)', borderRadius: 999, background: active ? 'var(--accent-weak)' : 'var(--bg-panel)', color: active ? 'var(--accent)' : 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: active ? 650 : 550, cursor: 'pointer' });
const sessionIconButtonStyle: React.CSSProperties = { width: 25, height: 25, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 5, background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer' };
