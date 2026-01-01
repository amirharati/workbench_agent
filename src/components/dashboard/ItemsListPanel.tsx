import React from 'react';
import type { Item } from '../../lib/db';
import { Panel } from '../../styles/primitives';

interface ItemsListPanelProps {
  items: Item[];
  activeItemId: string | null;
  onItemClick: (item: Item) => void;
  title?: string;
  onNew?: () => void;
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
}) => {
  return (
    <Panel className="scrollbar" style={{ padding: '0.5rem', overflowY: 'auto' }}>
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
        <span style={{ fontSize: '0.8rem', color: 'var(--text)', fontWeight: 600 }}>{title}</span>
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
            onClick={() => onItemClick(item)}
            style={{
              padding: '0.6rem 0.75rem',
              borderRadius: 8,
              cursor: 'pointer',
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


