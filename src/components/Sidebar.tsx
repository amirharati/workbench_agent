import React, { useState } from 'react';
import { Layout, Folder, Plus, Inbox } from 'lucide-react';
import { Collection } from '../lib/db';

interface SidebarProps {
  collections: Collection[];
  selectedCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
  onAddCollection: () => void;
  onMoveItem: (itemId: string, collectionId: string | undefined) => void;
  unsortedCount: number;
  totalCount: number;
  collectionCounts: Record<string, number>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collections,
  selectedCollectionId,
  onSelectCollection,
  onAddCollection,
  onMoveItem,
  unsortedCount,
  totalCount,
  collectionCounts,
}) => {
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, collectionId: string | undefined) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('text/plain');
    if (itemId) {
      onMoveItem(itemId, collectionId);
    }
    setDragOverId(null);
  };

  return (
    <aside
      style={{
        width: '240px',
        minWidth: '240px',
        background: '#1e293b',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
      }}
    >
      {/* Logo */}
      <div style={{ padding: '1.25rem 1rem', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Layout size={24} style={{ color: '#60a5fa' }} />
        <span style={{ fontSize: '1.125rem', fontWeight: 600 }}>Tab Manager</span>
      </div>

      {/* Nav Items */}
      <nav style={{ flex: 1, padding: '1rem 0.5rem', overflowY: 'auto' }}>
        {/* All Items */}
        <button
          onClick={() => onSelectCollection(null)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.625rem 0.75rem',
            background: selectedCollectionId === null ? '#334155' : 'transparent',
            border: 'none',
            borderRadius: '0.5rem',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.875rem',
            textAlign: 'left',
            marginBottom: '0.25rem',
          }}
        >
          <Inbox size={18} style={{ color: '#94a3b8' }} />
          <span style={{ flex: 1 }}>All Bookmarks</span>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{totalCount}</span>
        </button>

        {/* Unsorted - drop target */}
        <button
          onClick={() => onSelectCollection('unsorted')}
          onDragOver={(e) => handleDragOver(e, 'unsorted')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, undefined)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.625rem 0.75rem',
            background: dragOverId === 'unsorted' ? '#475569' : selectedCollectionId === 'unsorted' ? '#334155' : 'transparent',
            border: dragOverId === 'unsorted' ? '2px dashed #60a5fa' : '2px solid transparent',
            borderRadius: '0.5rem',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.875rem',
            textAlign: 'left',
            marginBottom: '0.25rem',
          }}
        >
          <Folder size={18} style={{ color: '#fbbf24' }} />
          <span style={{ flex: 1 }}>Unsorted</span>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{unsortedCount}</span>
        </button>

        {/* Divider */}
        <div style={{ borderBottom: '1px solid #334155', margin: '0.75rem 0' }} />

        {/* Categories Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', marginBottom: '0.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500, textTransform: 'uppercase' }}>Categories</span>
          <button onClick={onAddCollection} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center' }}>
            <Plus size={16} />
          </button>
        </div>

        {/* Categories List - drop targets */}
        {collections.map((col) => (
          <button
            key={col.id}
            onClick={() => onSelectCollection(col.id)}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.id)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.625rem 0.75rem',
              background: dragOverId === col.id ? '#475569' : selectedCollectionId === col.id ? '#334155' : 'transparent',
              border: dragOverId === col.id ? '2px dashed #60a5fa' : '2px solid transparent',
              borderRadius: '0.5rem',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.875rem',
              textAlign: 'left',
              marginBottom: '0.25rem',
            }}
          >
            <Folder size={18} style={{ color: col.color || '#60a5fa' }} />
            <span style={{ flex: 1 }}>{col.name}</span>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{collectionCounts[col.id] || 0}</span>
          </button>
        ))}

        {collections.length === 0 && (
          <div style={{ padding: '1rem 0.75rem', color: '#64748b', fontSize: '0.75rem', textAlign: 'center' }}>
            No categories yet
          </div>
        )}
      </nav>
    </aside>
  );
};
