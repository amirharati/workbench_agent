import React, { useState, useRef, useEffect } from 'react';
import type { Collection } from '../../lib/db';
import { Plus, FolderTree, ChevronDown } from 'lucide-react';
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
  maxVisible?: number; // How many pills to show before overflow
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
  maxVisible = 4, // Show 4 collections by default
}) => {
  const [contextMenu, setContextMenu] = useState<{ collection: Collection; x: number; y: number } | null>(null);
  const [showOverflow, setShowOverflow] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Close overflow dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
      }
    };
    if (showOverflow) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showOverflow]);

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
    whiteSpace: 'nowrap',
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

  // Split visible and overflow collections
  const visibleCollections = collections.slice(0, maxVisible);
  const overflowCollections = collections.slice(maxVisible);
  const hasOverflow = overflowCollections.length > 0;
  
  // Check if selected collection is in overflow
  const selectedInOverflow = overflowCollections.some(c => c.id === selectedId);

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
      
      {/* Visible collection pills */}
      {visibleCollections.map((c) => (
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

      {/* Overflow dropdown */}
      {hasOverflow && (
        <div ref={overflowRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowOverflow(!showOverflow)}
            style={{
              ...pillStyle(selectedInOverflow),
              background: selectedInOverflow ? 'var(--accent-weak)' : 'var(--bg-glass)',
              borderColor: selectedInOverflow ? 'var(--accent)' : 'var(--border)',
            }}
            onMouseEnter={(e) => {
              if (!selectedInOverflow) {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text)';
              }
            }}
            onMouseLeave={(e) => {
              if (!selectedInOverflow) {
                e.currentTarget.style.background = 'var(--bg-glass)';
                e.currentTarget.style.color = 'var(--text-muted)';
              }
            }}
          >
            +{overflowCollections.length} more
            <ChevronDown size={10} style={{ transform: showOverflow ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} />
          </button>
          
          {showOverflow && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                background: 'var(--bg-panel)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                boxShadow: 'var(--shadow-lg)',
                zIndex: 100,
                minWidth: 160,
                maxHeight: 200,
                overflowY: 'auto',
                padding: '4px',
              }}
              className="scrollbar"
            >
              {overflowCollections.map((c) => {
                const isActive = selectedId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      onSelect(c.id);
                      setShowOverflow(false);
                    }}
                    onContextMenu={(e) => handleContextMenu(e, c)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      border: 'none',
                      background: isActive ? 'var(--accent-weak)' : 'transparent',
                      color: isActive ? 'var(--text)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: 'var(--text-xs)',
                      textAlign: 'left',
                      borderRadius: 4,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span>{c.name}</span>
                    {getCountForCollection && (
                      <span style={{ opacity: 0.6 }}>({getCountForCollection(c.id)})</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      
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
