import React from 'react';
import { Trash2, GripVertical, Info } from 'lucide-react';
import { Item } from '../lib/db';

interface BookmarksGridProps {
  items: Item[];
  onDeleteItem: (id: string) => void;
  onSelectItem: (item: Item | null) => void;
  selectedItemId: string | null;
  title: string;
}

export const BookmarksGrid: React.FC<BookmarksGridProps> = ({ items, onDeleteItem, onSelectItem, selectedItemId, title }) => {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#1f2937' }}>{title}</h2>
        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{items.length} items</span>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            background: 'white',
            border: '2px dashed #e5e7eb',
            borderRadius: '0.75rem',
            padding: '3rem',
            textAlign: 'center',
            color: '#9ca3af',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.875rem' }}>No bookmarks in this category</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem' }}>Save tabs from the Open Windows section below</p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {items.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', item.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              style={{
                background: selectedItemId === item.id ? '#eff6ff' : 'white',
                border: selectedItemId === item.id ? '1px solid #3b82f6' : '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                transition: 'all 0.15s',
              }}
            >
              {/* Main content - click opens link */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                onClick={() => window.open(item.url, '_blank')}
                onMouseEnter={(e) => {
                  const target = e.currentTarget.parentElement;
                  if (target && selectedItemId !== item.id) {
                    target.style.borderColor = '#93c5fd';
                  }
                }}
                onMouseLeave={(e) => {
                  const target = e.currentTarget.parentElement;
                  if (target && selectedItemId !== item.id) {
                    target.style.borderColor = '#e5e7eb';
                  }
                }}
              >
                <div style={{ color: '#d1d5db', cursor: 'grab' }} onClick={(e) => e.stopPropagation()}>
                  <GripVertical size={14} />
                </div>
                {item.favicon && (
                  <img src={item.favicon} alt="" style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {new URL(item.url).hostname}
                  </div>
                </div>
              </div>

              {/* Action buttons row */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.25rem', borderTop: '1px solid #f3f4f6', paddingTop: '0.5rem' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectItem(selectedItemId === item.id ? null : item);
                  }}
                  title="View details"
                  style={{
                    padding: '0.25rem 0.5rem',
                    border: 'none',
                    background: selectedItemId === item.id ? '#dbeafe' : 'transparent',
                    cursor: 'pointer',
                    color: selectedItemId === item.id ? '#2563eb' : '#9ca3af',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    borderRadius: '0.25rem',
                    fontSize: '0.6875rem',
                  }}
                  onMouseEnter={(e) => {
                    if (selectedItemId !== item.id) e.currentTarget.style.color = '#2563eb';
                  }}
                  onMouseLeave={(e) => {
                    if (selectedItemId !== item.id) e.currentTarget.style.color = '#9ca3af';
                  }}
                >
                  <Info size={12} /> Info
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteItem(item.id);
                  }}
                  title="Delete"
                  style={{
                    padding: '0.25rem 0.5rem',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#9ca3af',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '0.25rem',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#ef4444';
                    e.currentTarget.style.background = '#fef2f2';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#9ca3af';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
