import React from 'react';
import { Trash2 } from 'lucide-react';
import { Item } from '../lib/db';

interface ItemCardProps {
  item: Item;
  onDelete: (id: string) => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item, onDelete }) => {
  const handleClick = () => {
    chrome.tabs.create({ url: item.url });
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem',
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        background: 'white',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#3b82f6';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e5e7eb';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {item.favicon && (
        <img
          src={item.favicon}
          alt=""
          style={{ width: '16px', height: '16px', flexShrink: 0 }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }} onClick={handleClick}>
        <div
          style={{
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#1f2937',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </div>
        <div
          style={{
            fontSize: '0.75rem',
            color: '#6b7280',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {new URL(item.url).hostname}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(item.id);
        }}
        style={{
          padding: '0.25rem',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: '#9ca3af',
          display: 'flex',
          alignItems: 'center',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#ef4444';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#9ca3af';
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};
