import React from 'react';
import { Folder } from 'lucide-react';
import { Item } from '../lib/db';
import { ItemCard } from './ItemCard';

interface CollectionViewProps {
  title: string;
  items: Item[];
  onDeleteItem: (id: string) => void;
}

export const CollectionView: React.FC<CollectionViewProps> = ({
  title,
  items,
  onDeleteItem,
}) => {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.75rem',
          paddingBottom: '0.5rem',
          borderBottom: '2px solid #e5e7eb',
        }}
      >
        <Folder size={18} style={{ color: '#3b82f6' }} />
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#1f2937' }}>
          {title}
        </h2>
        <span
          style={{
            fontSize: '0.75rem',
            color: '#6b7280',
            background: '#f3f4f6',
            padding: '0.125rem 0.5rem',
            borderRadius: '9999px',
          }}
        >
          {items.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.length === 0 ? (
          <div
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: '0.875rem',
            }}
          >
            No items yet
          </div>
        ) : (
          items.map((item) => (
            <ItemCard key={item.id} item={item} onDelete={onDeleteItem} />
          ))
        )}
      </div>
    </div>
  );
};
