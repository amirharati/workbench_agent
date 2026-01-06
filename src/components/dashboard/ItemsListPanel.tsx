import React, { useState } from 'react';
import type { Item } from '../../lib/db';
import { Panel } from '../../styles/primitives';
import { ItemContextMenu } from './ItemContextMenu';
import { FolderOpen, List, Grid } from 'lucide-react';

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
  layout?: 'vertical' | 'horizontal' | 'grid';
  viewMode?: 'list' | 'grid';
  onViewModeChange?: (mode: 'list' | 'grid') => void;
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
  layout = 'vertical',
  viewMode = 'list',
  onViewModeChange,
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

  const isGrid = viewMode === 'grid' || layout === 'grid';

  return (
    <Panel 
      className="scrollbar" 
      style={{ 
        padding: '4px', 
        overflowY: 'auto',
        overflowX: 'hidden',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>{items.length}</span>
          {/* View mode toggle (list/grid) */}
          {onViewModeChange && (
            <div style={{ display: 'flex', gap: '2px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px' }}>
              <button
                onClick={() => onViewModeChange('list')}
                style={{
                  background: viewMode === 'list' ? 'var(--accent-weak)' : 'transparent',
                  color: viewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)',
                  border: 'none',
                  padding: '2px 6px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 'var(--text-xs)',
                  height: 20,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="List view"
              >
                <List size={12} />
              </button>
              <button
                onClick={() => onViewModeChange('grid')}
                style={{
                  background: viewMode === 'grid' ? 'var(--accent-weak)' : 'transparent',
                  color: viewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)',
                  border: 'none',
                  padding: '2px 6px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 'var(--text-xs)',
                  height: 20,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Grid view"
              >
                <Grid size={12} />
              </button>
            </div>
          )}
          {onNew && (
            <button
              onClick={onNew}
              style={{
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
      </div>

      {/* Items list - layout dependent */}
      {isGrid ? (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gridAutoRows: '110px',
          gap: '8px',
          padding: '4px',
          flex: 1,
          overflowY: 'auto',
          alignContent: 'start',
        }}>
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
                  width: '100%',
                  height: '110px',
                  padding: '8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  background: isActive ? 'var(--accent-weak)' : 'var(--bg-panel)',
                  border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
                  transition: 'all 0.1s ease',
                  overflow: 'hidden',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--bg-panel)';
                }}
              >
                {/* Title with icon - allows wrapping */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', minHeight: 0 }}>
                  <span style={{ fontSize: '12px', flexShrink: 0, marginTop: '1px' }}>{iconForItem(item)}</span>
                  <span
                    style={{
                      fontWeight: 500,
                      fontSize: 'var(--text-sm)',
                      color: 'var(--text)',
                      lineHeight: 1.3,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      flex: 1,
                      wordBreak: 'break-word',
                    }}
                  >
                    {item.title || 'Untitled'}
                  </span>
                </div>
                
                {/* URL - shows if available, wraps if needed */}
                {item.url && (
                  <div 
                    style={{ 
                      fontSize: 'var(--text-xs)', 
                      color: 'var(--text-muted)', 
                      lineHeight: 1.3,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'break-all',
                    }}
                  >
                    {item.url}
                  </div>
                )}
                
                {/* Notes preview - shows if available */}
                {item.notes && !item.url && (
                  <div 
                    style={{ 
                      fontSize: 'var(--text-xs)', 
                      color: 'var(--text-muted)', 
                      lineHeight: 1.3,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'break-word',
                    }}
                  >
                    {item.notes}
                  </div>
                )}
                
                {/* Date - always at bottom */}
                <div 
                  style={{ 
                    fontSize: 'var(--text-xs)', 
                    color: 'var(--text-faint)', 
                    marginTop: 'auto',
                    flexShrink: 0,
                    lineHeight: 1.2,
                  }}
                >
                  {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '1px',
          flex: 1,
          overflowY: 'auto',
        }}>
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
      )}

      {items.length === 0 && (
        <div style={{ color: 'var(--text-faint)', padding: '12px', textAlign: 'center', fontSize: 'var(--text-sm)' }}>
          No items
        </div>
      )}
    </Panel>
  );
};
