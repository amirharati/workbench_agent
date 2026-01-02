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

  const pillStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '3px 10px',
    height: 24,
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: isActive ? 'var(--accent)' : 'var(--bg-glass)',
    color: isActive ? 'var(--accent-text)' : 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.1s ease',
  });

  const actionPillStyle: React.CSSProperties = {
    padding: '3px 8px',
    height: 24,
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--bg-glass)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 'var(--text-xs)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.1s ease',
  };

  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
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
      
      {/* All pill */}
      <button
        onClick={() => onSelect('all')}
        style={pillStyle(selectedId === 'all')}
        onMouseEnter={(e) => {
          if (selectedId !== 'all') {
            e.currentTarget.style.background = 'var(--bg-hover)';
            e.currentTarget.style.color = 'var(--text)';
          }
        }}
        onMouseLeave={(e) => {
          if (selectedId !== 'all') {
            e.currentTarget.style.background = 'var(--bg-glass)';
            e.currentTarget.style.color = 'var(--text-muted)';
          }
        }}
      >
        All <span style={{ opacity: 0.7 }}>({totalItems})</span>
      </button>
      
      {/* Collection pills */}
      {collections.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          onContextMenu={(e) => handleContextMenu(e, c)}
          style={pillStyle(selectedId === c.id)}
          onMouseEnter={(e) => {
            if (selectedId !== c.id) {
              e.currentTarget.style.background = 'var(--bg-hover)';
              e.currentTarget.style.color = 'var(--text)';
            }
          }}
          onMouseLeave={(e) => {
            if (selectedId !== c.id) {
              e.currentTarget.style.background = 'var(--bg-glass)';
              e.currentTarget.style.color = 'var(--text-muted)';
            }
          }}
        >
          {c.name}
          {getCountForCollection && (
            <span style={{ opacity: 0.6 }}>({getCountForCollection(c.id)})</span>
          )}
        </button>
      ))}
      
      {/* Open all collections button */}
      {onOpenAllCollections && (
        <button
          onClick={onOpenAllCollections}
          style={actionPillStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--accent-weak)';
            e.currentTarget.style.color = 'var(--text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-glass)';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
          title="Open all collections"
        >
          <FolderTree size={12} />
        </button>
      )}
      
      {/* Create new collection button */}
      {onCreateCollection && (
        <button
          onClick={onCreateCollection}
          style={actionPillStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--accent-weak)';
            e.currentTarget.style.color = 'var(--text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-glass)';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
          title="Create new collection"
        >
          <Plus size={12} />
          <span>New</span>
        </button>
      )}
    </div>
  );
};
