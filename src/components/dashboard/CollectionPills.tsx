import React from 'react';
import type { Collection } from '../../lib/db';

interface CollectionPillsProps {
  collections: Collection[];
  selectedId: string | 'all';
  onSelect: (id: string | 'all') => void;
  totalItems: number;
  getCountForCollection?: (collectionId: string) => number;
}

export const CollectionPills: React.FC<CollectionPillsProps> = ({
  collections,
  selectedId,
  onSelect,
  totalItems,
  getCountForCollection,
}) => {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
    </div>
  );
};


