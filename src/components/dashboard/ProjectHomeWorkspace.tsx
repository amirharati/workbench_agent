import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Folder, Link2, PanelRightOpen, Pin, Search } from 'lucide-react';
import type { Collection, Item, Project, UpdateItemOptions } from '../../lib/db';
import { BookmarkUrlLink } from './BookmarkUrlLink';
import {
  getProjectPinTimestamp,
  isItemPinnedToProject,
  sortItemsWithProjectPins,
  updateProjectPinMetadata,
} from './projectPins';

interface ProjectHomeWorkspaceProps {
  project: Project;
  items: Item[];
  collections: Collection[];
  selectedCollectionId: string | 'all';
  onSelectCollection: (collectionId: string | 'all') => void;
  onOpenItem: (item: Item) => void;
  onOpenSearch: () => void;
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
  onOpenItem,
  onOpenSearch,
  onUpdateItem,
}) => {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
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
  const selectedCollection =
    selectedCollectionId === 'all'
      ? null
      : collections.find((collection) => collection.id === selectedCollectionId) ?? null;

  useEffect(() => {
    setSelectedItemId(null);
  }, [project.id, selectedCollectionId]);

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

      {pinnedItems.length > 0 && (
        <section style={{ width: '100%', maxWidth: 1120, margin: '0 auto' }} aria-labelledby="project-pinned-heading">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 id="project-pinned-heading" style={sectionHeadingStyle}><Pin size={13} /> Pinned to {project.name}</h2>
            <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{pinnedItems.length}</span>
          </div>
          <div className="hide-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            {pinnedItems.map((item) => (
              <button key={item.id} type="button" onClick={() => setSelectedItemId(item.id)} style={{ ...miniCardStyle, borderColor: selectedItemId === item.id ? 'var(--accent)' : 'var(--border)' }}>
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
                <div key={item.id} role="button" tabIndex={0} onClick={() => setSelectedItemId(item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedItemId(item.id); } }} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderBottom: '1px solid var(--border)', background: selected ? 'var(--bg-active)' : 'transparent', color: selected ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer' }}>
                  <span style={{ width: 25, height: 25, borderRadius: 6, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-hover)', color: selected ? 'var(--accent)' : 'var(--text-faint)' }}>
                    {item.url ? <Link2 size={12} /> : <FileText size={12} />}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? 'var(--text)' : 'inherit', fontSize: 'var(--text-sm)', fontWeight: selected ? 600 : 500 }}>{item.title || 'Untitled'}</span>
                    <span style={{ display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{item.url || item.notes || 'Note'}</span>
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
                <button type="button" onClick={() => onOpenItem(selectedItem)} style={primaryButtonStyle}>
                  <PanelRightOpen size={13} /> Open in tab
                </button>
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
                  <div style={{ marginTop: 18, padding: '16px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>No notes yet. Open in a tab for the full item workspace.</div>
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
          ) : (
            <div style={{ flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 28, textAlign: 'center', color: 'var(--text-faint)' }}>
              <PanelRightOpen size={24} />
              <strong style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Select an item to preview</strong>
              <span style={{ maxWidth: 250, fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>Preview links and notes here. Open a tab only when you want to keep the item in Open work.</span>
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
