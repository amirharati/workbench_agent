import React, { useState } from 'react';
import type { Collection } from '../../lib/db';
import { Plus, FolderTree } from 'lucide-react';
import { CollectionContextMenu } from './CollectionContextMenu';

interface CollectionPillsProps {
  collections: Collection[];
  selectedId: string | 'all';
  onSelect: (id: string | 'all') => void;
  totalItems: number;
  getCountForCollection?: (collectionId: string) => number;
  onCreateCollection?: () => void;
  onDeleteCollection?: (collection: Collection) => void;
  onOpenCollectionInTab?: (collection: Collection) => void;
  onOpenAllCollections?: () => void;
}

export const CollectionPills: React.FC<CollectionPillsProps> = ({
  collections,
  selectedId,
  onSelect,
  totalItems,
  getCountForCollection,
  onCreateCollection,
  onDeleteCollection,
  onOpenCollectionInTab,
  onOpenAllCollections,
}) => {
  const [contextMenu, setContextMenu] = useState<{ collection: Collection; x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, collection: Collection) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ collection, x: e.clientX, y: e.clientY });
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
      {contextMenu && (
        <CollectionContextMenu
          collection={contextMenu.collection}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onDelete={onDeleteCollection}
          onOpenInTab={onOpenCollectionInTab}
        />
      )}
      <button
        onClick={() => onSelect('all')}
        style={{
          padding: '0.4rem 0.8rem',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.08)',
          background: selectedId === 'all' ? '#6366f1' : 'rgba(255,255,255,0.05)',
          color: selectedId === 'all' ? '#fff' : '#d1d5db',
          cursor: 'pointer',
        }}
      >
        All ({totalItems})
      </button>
      {collections.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          onContextMenu={(e) => handleContextMenu(e, c)}
          style={{
            padding: '0.4rem 0.8rem',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.08)',
            background: selectedId === c.id ? '#6366f1' : 'rgba(255,255,255,0.05)',
            color: selectedId === c.id ? '#fff' : '#d1d5db',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
          }}
        >
          <span>{c.name}</span>
          <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>
            {getCountForCollection ? getCountForCollection(c.id) : ''}
          </span>
        </button>
      ))}
      {onOpenAllCollections && (
        <button
          onClick={onOpenAllCollections}
          style={{
            padding: '0.4rem 0.6rem',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.05)',
            color: '#d1d5db',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
            e.currentTarget.style.color = '#d1d5db';
          }}
          title="Open all collections"
        >
          <FolderTree size={14} />
        </button>
      )}
      {onCreateCollection && (
        <button
          onClick={onCreateCollection}
          style={{
            padding: '0.4rem 0.6rem',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.05)',
            color: '#d1d5db',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
            e.currentTarget.style.color = '#d1d5db';
          }}
          title="Create new collection"
        >
          <Plus size={14} />
          <span style={{ fontSize: '0.85rem' }}>New</span>
        </button>
      )}
    </div>
  );
};


