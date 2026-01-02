import React, { useState } from 'react';
import type { Item } from '../../lib/db';
import { Panel } from '../../styles/primitives';
import { ItemContextMenu } from './ItemContextMenu';
import { FolderOpen } from 'lucide-react';

interface ItemsListPanelProps {
  items: Item[];
  activeItemId: string | null;
  onItemClick: (item: Item, targetSpace?: 'primary' | 'secondary' | 'rightPrimary' | 'rightSecondary') => void;
  title?: string;
  onNew?: () => void;
  onEdit?: (item: Item) => void;
  onDelete?: (item: Item) => void;
  onOpenInNewTab?: (item: Item) => void;
  onDuplicate?: (item: Item) => void;
  availableSpaces?: {
    primary?: boolean;
    secondary?: boolean;
    rightPrimary?: boolean;
    rightSecondary?: boolean;
  };
  currentCollectionId?: string | 'all';
  onOpenCollectionInTab?: (collectionId: string | 'all') => void;
}

const iconForItem = (item: Item) => {
  switch (item.source) {
    case 'tab':
    case 'bookmark':
    case 'twitter':
      return '🔗';
    case 'manual':
    default:
      return '📝';
  }
};

export const ItemsListPanel: React.FC<ItemsListPanelProps> = ({
  items,
  activeItemId,
  onItemClick,
  title = 'Items',
  onNew,
  onEdit,
  onDelete,
  onOpenInNewTab,
  onDuplicate,
  availableSpaces = { primary: true },
  currentCollectionId,
  onOpenCollectionInTab,
}) => {
  const [contextMenu, setContextMenu] = useState<{ item: Item; x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, item: Item) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ item, x: e.clientX, y: e.clientY });
  };

  const handleItemClick = (e: React.MouseEvent, item: Item) => {
    // Ctrl/Cmd + Click: cycle through available spaces
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const spaces: Array<'primary' | 'secondary' | 'rightPrimary' | 'rightSecondary'> = [];
      if (availableSpaces.primary) spaces.push('primary');
      if (availableSpaces.secondary) spaces.push('secondary');
      if (availableSpaces.rightPrimary) spaces.push('rightPrimary');
      if (availableSpaces.rightSecondary) spaces.push('rightSecondary');
      
      if (spaces.length > 0) {
        // For now, just open in the first available space (could be enhanced with cycling)
        onItemClick(item, spaces[0]);
      } else {
        onItemClick(item);
      }
    } else {
      onItemClick(item);
    }
  };

  return (
    <Panel className="scrollbar" style={{ padding: '0.5rem', overflowY: 'auto' }}>
      {contextMenu && (
        <ItemContextMenu
          item={contextMenu.item}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onEdit={onEdit}
          onDelete={onDelete}
          onOpenInNewTab={onOpenInNewTab}
          onDuplicate={onDuplicate}
          onOpenInSpace={(item, space) => onItemClick(item, space)}
          availableSpaces={availableSpaces}
        />
      )}
      <div
        style={{
          padding: '0.5rem 0.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border)',
          marginBottom: '0.5rem',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text)', fontWeight: 600 }}>{title}</span>
          {currentCollectionId && currentCollectionId !== 'all' && onOpenCollectionInTab && (
            <button
              onClick={() => onOpenCollectionInTab(currentCollectionId)}
              style={{
                padding: '0.25rem',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                borderRadius: 4,
                transition: 'all 0.15s ease',
              }}
              title="Open collection in tab"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-glass)';
                e.currentTarget.style.color = 'var(--text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <FolderOpen size={14} />
            </button>
          )}
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{items.length} items</span>
        {onNew && (
          <button
            onClick={onNew}
            style={{
              marginLeft: 'auto',
              padding: '6px 10px',
              background: 'var(--accent-weak)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            + New
          </button>
        )}
      </div>

      {items.map((item) => {
        const isActive = activeItemId === item.id;
        return (
          <div
            key={item.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', item.id);
            }}
            onClick={(e) => handleItemClick(e, item)}
            onContextMenu={(e) => handleContextMenu(e, item)}
            style={{
              padding: '0.6rem 0.75rem',
              borderRadius: 8,
              cursor: 'grab',
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              background: isActive ? 'var(--accent-weak)' : 'var(--bg-glass)',
              borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
              marginBottom: '0.2rem',
              transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.background = 'var(--bg-glass)';
            }}
          >
            <span style={{ fontSize: '0.95rem' }}>{iconForItem(item)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.title || 'Untitled'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {new Date(item.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
        );
      })}

      {items.length === 0 && (
        <div style={{ color: 'var(--text-muted)', padding: '1rem', textAlign: 'center' }}>
          No items found
        </div>
      )}
    </Panel>
  );
};


