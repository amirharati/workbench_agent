import React, { useState, useEffect } from 'react';
import { X, ExternalLink, Save } from 'lucide-react';
import { Item, Collection } from '../lib/db';

interface BookmarkDetailPanelProps {
  item: Item;
  collections: Collection[];
  onClose: () => void;
  onSave: (id: string, updates: { collectionId?: string; notes?: string }) => void;
  onDelete: (id: string) => void;
}

export const BookmarkDetailPanel: React.FC<BookmarkDetailPanelProps> = ({
  item,
  collections,
  onClose,
  onSave,
  onDelete,
}) => {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | undefined>(item.collectionId);
  const [notes, setNotes] = useState(item.notes || '');
  const [hasChanges, setHasChanges] = useState(false);

  // Reset when item changes
  useEffect(() => {
    setSelectedCollectionId(item.collectionId);
    setNotes(item.notes || '');
    setHasChanges(false);
  }, [item.id]);

  const handleChange = (field: 'collection' | 'notes', value: any) => {
    if (field === 'collection') setSelectedCollectionId(value);
    if (field === 'notes') setNotes(value);
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(item.id, { collectionId: selectedCollectionId, notes });
    setHasChanges(false);
  };

  return (
    <div
      style={{
        width: '320px',
        minWidth: '320px',
        background: 'white',
        borderLeft: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Header */}
      <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        {item.favicon && <img src={item.favicon} alt="" style={{ width: '24px', height: '24px', marginTop: '2px' }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.3 }}>
            {item.title}
          </h3>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.75rem', color: '#6b7280', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}
          >
            {new URL(item.url).hostname} <ExternalLink size={10} />
          </a>
        </div>
        <button onClick={onClose} style={{ padding: '0.25rem', border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af' }}>
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '1rem', flex: 1, overflowY: 'auto' }}>
        {/* Category */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280', marginBottom: '0.375rem', textTransform: 'uppercase' }}>
            Category
          </label>
          <select
            value={selectedCollectionId || ''}
            onChange={(e) => handleChange('collection', e.target.value || undefined)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.8125rem',
              background: 'white',
            }}
          >
            <option value="">Unsorted</option>
            {collections.map((col) => (
              <option key={col.id} value={col.id}>
                {col.name}
              </option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280', marginBottom: '0.375rem', textTransform: 'uppercase' }}>
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="Add notes..."
            style={{
              width: '100%',
              minHeight: '120px',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.8125rem',
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Meta info */}
        <div style={{ fontSize: '0.6875rem', color: '#9ca3af' }}>
          Saved: {new Date(item.created_at).toLocaleDateString()} • Source: {item.source}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
        <button
          onClick={() => { onDelete(item.id); onClose(); }}
          style={{ padding: '0.375rem 0.75rem', border: 'none', background: '#fee2e2', color: '#dc2626', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.75rem' }}
        >
          Delete
        </button>
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          style={{
            padding: '0.375rem 0.75rem',
            border: 'none',
            background: hasChanges ? '#2563eb' : '#93c5fd',
            color: 'white',
            borderRadius: '0.375rem',
            cursor: hasChanges ? 'pointer' : 'default',
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          <Save size={12} /> Save
        </button>
      </div>
    </div>
  );
};
