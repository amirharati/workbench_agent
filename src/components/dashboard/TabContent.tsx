import React, { useState } from 'react';
import type { Item, Collection } from '../../lib/db';
import { getDomain } from '../../lib/utils';
import type { TabBarTab } from './TabBar';
import { CollectionsSpace } from './CollectionsSpace';

interface TabContentProps {
  tab: (TabBarTab & { itemId?: string; content?: string; collectionId?: string; type?: 'item' | 'collection' | 'system' }) | null;
  item?: Item | null;
  items?: Item[];
  collections?: Collection[];
  onMoveItemToCollection?: (itemId: string, targetCollectionId: string, sourceCollectionId?: string) => void;
  onDeleteCollection?: (collection: Collection) => void;
  onRenameCollection?: (collection: Collection, newName: string) => void;
  onOpenCollection?: (collection: Collection) => void;
  onOpenCollectionInTab?: (collection: Collection) => void;
  projectId?: string;
}

export const TabContent: React.FC<TabContentProps> = ({ 
  tab, 
  item, 
  items = [], 
  collections = [], 
  onMoveItemToCollection,
  onDeleteCollection,
  onRenameCollection,
  onOpenCollection,
  onOpenCollectionInTab,
  projectId,
}) => {
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverCollectionId, setDragOverCollectionId] = useState<string | null>(null);

  // Collections space tab (all collections)
  if (tab?.type === 'system' && (tab.id === 'collections' || tab.id === 'collections-all')) {
    return (
      <CollectionsSpace
        collections={collections}
        items={items}
        onDeleteCollection={onDeleteCollection}
        onRenameCollection={onRenameCollection}
        onOpenCollection={onOpenCollection}
        onOpenCollectionInTab={onOpenCollectionInTab}
        onMoveItemToCollection={onMoveItemToCollection}
        projectId={projectId}
      />
    );
  }

  if (!tab && !item) {
    return (
      <div
        style={{
          padding: '1.5rem',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: 'var(--bg-panel)',
          borderRadius: 10,
          border: '1px solid var(--border)',
        }}
      >
        No tab selected
      </div>
    );
  }

  // Collection tab
  if (tab?.type === 'collection' && tab.collectionId) {
    const collectionItems = items.filter((i) => (i.collectionIds || []).includes(tab.collectionId!));
    const otherCollections = collections.filter((c) => c.id !== tab.collectionId);

    const handleDragStart = (e: React.DragEvent, itemId: string) => {
      setDraggedItemId(itemId);
      e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, collectionId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverCollectionId(collectionId);
    };

    const handleDrop = (e: React.DragEvent, targetCollectionId: string) => {
      e.preventDefault();
      if (draggedItemId && onMoveItemToCollection) {
        onMoveItemToCollection(draggedItemId, targetCollectionId);
      }
      setDraggedItemId(null);
      setDragOverCollectionId(null);
    };

    const handleDragLeave = () => {
      setDragOverCollectionId(null);
    };

    return (
      <div
        style={{
          padding: '1.25rem',
          overflowY: 'auto',
          height: '100%',
          color: 'var(--text)',
          background: 'var(--bg-panel)',
          borderRadius: 10,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-panel)',
        }}
      >
        <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2, marginBottom: '1rem' }}>
          {tab.title || 'Collection'}
        </h2>
        
        {/* Drop zones for other collections */}
        {otherCollections.length > 0 && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-glass)', borderRadius: 8 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Move items to:
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {otherCollections.map((c) => (
                <div
                  key={c.id}
                  onDragOver={(e) => handleDragOver(e, c.id)}
                  onDrop={(e) => handleDrop(e, c.id)}
                  onDragLeave={handleDragLeave}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: 8,
                    border: `2px dashed ${dragOverCollectionId === c.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: dragOverCollectionId === c.id ? 'var(--accent-weak)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {c.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collection items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {collectionItems.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>
              No items in this collection
            </div>
          ) : (
            collectionItems.map((i) => (
              <div
                key={i.id}
                draggable
                onDragStart={(e) => handleDragStart(e, i.id)}
                style={{
                  padding: '0.75rem',
                  background: 'var(--bg-glass)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  cursor: 'grab',
                  opacity: draggedItemId === i.id ? 0.5 : 1,
                }}
              >
                <div style={{ fontWeight: 500, color: 'var(--text)' }}>{i.title || 'Untitled'}</div>
                {i.url && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {getDomain(i.url)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // System tab with content
  if (tab && !item && tab.type !== 'collection') {
    return (
      <div
        style={{
          padding: '1.25rem',
          overflowY: 'auto',
          height: '100%',
          color: 'var(--text)',
          background: 'var(--bg-panel)',
          borderRadius: 10,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-panel)',
        }}
      >
        <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2 }}>{tab.title || 'Untitled'}</h2>
        <div style={{ marginTop: '1rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>
          {tab.content || 'No content available.'}
        </div>
      </div>
    );
  }

  // Item tab
  const effectiveItem = item!;
  return (
    <div
      style={{
        padding: '1.25rem',
        overflowY: 'auto',
        height: '100%',
        background: 'var(--bg-panel)',
        borderRadius: 10,
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-panel)',
      }}
    >
      <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2 }}>
        {effectiveItem.title || 'Untitled'}
      </h2>
      <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        {getDomain(effectiveItem.url || '') || effectiveItem.source}
      </div>
      <div style={{ marginTop: '1rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
        {effectiveItem.notes || effectiveItem.url || 'No details available.'}
      </div>
    </div>
  );
};



