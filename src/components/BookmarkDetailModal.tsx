import React, { useState } from 'react';
import { X, ExternalLink, Save } from 'lucide-react';
import { Item, Collection } from '../lib/db';

interface BookmarkDetailModalProps {
  item: Item;
  collections: Collection[];
  onClose: () => void;
  onSave: (id: string, updates: { collectionId?: string; notes?: string }) => void;
  onDelete: (id: string) => void;
}

export const BookmarkDetailModal: React.FC<BookmarkDetailModalProps> = ({
  item,
  collections,
  onClose,
  onSave,
  onDelete,
}) => {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | undefined>(item.collectionId);
  const [notes, setNotes] = useState(item.notes || '');
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (field: 'collection' | 'notes', value: any) => {
    if (field === 'collection') setSelectedCollectionId(value);
    if (field === 'notes') setNotes(value);
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(item.id, { collectionId: selectedCollectionId, notes });
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '0.75rem',
          width: '500px',
          maxWidth: '90%',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {item.favicon && <img src={item.favicon} alt="" style={{ width: '24px', height: '24px' }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.title}
            </h3>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.75rem', color: '#6b7280', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              {new URL(item.url).hostname} <ExternalLink size={10} />
            </a>
          </div>
          <button onClick={onClose} style={{ padding: '0.25rem', border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af' }}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.25rem', flex: 1, overflowY: 'auto' }}>
          {/* Category */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#6b7280', marginBottom: '0.5rem' }}>
              Category
            </label>
            <select
              value={selectedCollectionId || ''}
              onChange={(e) => handleChange('collection', e.target.value || undefined)}
              style={{
                width: '100%',
                padding: '0.625rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
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
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#6b7280', marginBottom: '0.5rem' }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Add notes about this bookmark..."
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '0.625rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Meta info */}
          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            Saved: {new Date(item.created_at).toLocaleDateString()} • Source: {item.source}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
          <button
            onClick={() => { onDelete(item.id); onClose(); }}
            style={{ padding: '0.5rem 1rem', border: 'none', background: '#fee2e2', color: '#dc2626', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}
          >
            Delete
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={onClose}
              style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', background: 'white', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                background: hasChanges ? '#2563eb' : '#93c5fd',
                color: 'white',
                borderRadius: '0.375rem',
                cursor: hasChanges ? 'pointer' : 'default',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              <Save size={14} /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
