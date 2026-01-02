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
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const spaces: Array<'primary' | 'secondary' | 'rightPrimary' | 'rightSecondary'> = [];
      if (availableSpaces.primary) spaces.push('primary');
      if (availableSpaces.secondary) spaces.push('secondary');
      if (availableSpaces.rightPrimary) spaces.push('rightPrimary');
      if (availableSpaces.rightSecondary) spaces.push('rightSecondary');
      
      if (spaces.length > 0) {
        onItemClick(item, spaces[0]);
      } else {
        onItemClick(item);
      }
    } else {
      onItemClick(item);
    }
  };

  return (
    <Panel className="scrollbar" style={{ padding: '4px', overflowY: 'auto' }}>
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
      
      {/* Header - compact */}
      <div
        style={{
          padding: '4px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          marginBottom: '4px',
          height: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text)', fontWeight: 600 }}>{title}</span>
          {currentCollectionId && currentCollectionId !== 'all' && onOpenCollectionInTab && (
            <button
              onClick={() => onOpenCollectionInTab(currentCollectionId)}
              style={{
                padding: '2px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                borderRadius: 3,
              }}
              title="Open collection in tab"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <FolderOpen size={12} />
            </button>
          )}
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>{items.length}</span>
        {onNew && (
          <button
            onClick={onNew}
            style={{
              marginLeft: 'auto',
              padding: '2px 8px',
              background: 'var(--accent-weak)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 'var(--text-xs)',
              height: 20,
            }}
          >
            + New
          </button>
        )}
      </div>

      {/* Items list - compact */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
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
                padding: '4px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                gap: '6px',
                alignItems: 'center',
                height: 28,
                background: isActive ? 'var(--accent-weak)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.1s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontSize: '11px', flexShrink: 0 }}>{iconForItem(item)}</span>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontWeight: 500,
                    fontSize: 'var(--text-sm)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: 1,
                    color: isActive ? 'var(--text)' : 'var(--text)',
                  }}
                >
                  {item.title || 'Untitled'}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', flexShrink: 0 }}>
                  {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <div style={{ color: 'var(--text-faint)', padding: '12px', textAlign: 'center', fontSize: 'var(--text-sm)' }}>
          No items
        </div>
      )}
    </Panel>
  );
};
