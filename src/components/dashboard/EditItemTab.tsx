import React, { useState, useEffect } from 'react';
import type { Item, Collection } from '../../lib/db';
import { isValidHttpUrl } from '../../lib/utils';
import { Input, ButtonGhost } from '../../styles/primitives';
import { X } from 'lucide-react';

interface EditItemTabProps {
  item: Item;
  collections: Collection[];
  onSave: (id: string, data: { title: string; url?: string; notes?: string; collectionIds: string[] }) => Promise<void>;
  onCancel?: () => void;
}

export const EditItemTab: React.FC<EditItemTabProps> = ({
  item,
  collections,
  onSave,
  onCancel,
}) => {
  const [title, setTitle] = useState(item.title);
  const [url, setUrl] = useState(item.url || '');
  const [notes, setNotes] = useState(item.notes || '');
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>(
    item.collectionIds || []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update form when item changes
  useEffect(() => {
    setTitle(item.title);
    setUrl(item.url || '');
    setNotes(item.notes || '');
    setSelectedCollectionIds(item.collectionIds || []);
  }, [item.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (url.trim() && !isValidHttpUrl(url.trim())) {
      setError('URL must be a valid http:// or https:// URL');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(item.id, {
        title: title.trim(),
        url: url.trim() || undefined,
        notes: notes.trim() || undefined,
        collectionIds: selectedCollectionIds.length > 0 ? selectedCollectionIds : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update item');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleCollection = (collectionId: string) => {
    setSelectedCollectionIds((prev) =>
      prev.includes(collectionId)
        ? prev.filter((id) => id !== collectionId)
        : [...prev, collectionId]
    );
  };

  return (
    <div
      style={{
        padding: '1.25rem',
        overflowY: 'auto',
        height: '100%',
        color: 'var(--text)',
        background: 'var(--bg-panel)',
        borderRadius: 10,
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-panel)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2 }}>Edit Item</h2>
        {onCancel && (
          <ButtonGhost
            onClick={onCancel}
            style={{ padding: '0.25rem' }}
            title="Close"
          >
            <X size={16} />
          </ButtonGhost>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Title */}
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: 'var(--text)',
              }}
            >
              Title <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter item title"
              required
              style={{ width: '100%' }}
              autoFocus
            />
          </div>

          {/* URL */}
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: 'var(--text)',
              }}
            >
              URL (optional)
            </label>
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Leave empty for a note (no URL)
            </div>
          </div>

          {/* Notes */}
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: 'var(--text)',
              }}
            >
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes or description..."
              rows={6}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: 'var(--bg-glass)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text)',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Collections */}
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: 'var(--text)',
              }}
            >
              Collections
            </label>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                padding: '0.75rem',
                background: 'var(--bg-glass)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                minHeight: '3rem',
              }}
            >
              {collections.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No collections available
                </div>
              ) : (
                collections.map((collection) => {
                  const isSelected = selectedCollectionIds.includes(collection.id);
                  return (
                    <button
                      key={collection.id}
                      type="button"
                      onClick={() => toggleCollection(collection.id)}
                      style={{
                        padding: '0.4rem 0.8rem',
                        borderRadius: 16,
                        border: `1px solid ${isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}`,
                        background: isSelected ? 'var(--accent-weak)' : 'rgba(255,255,255,0.05)',
                        color: isSelected ? 'var(--text)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                        }
                      }}
                    >
                      {collection.name}
                    </button>
                  );
                })
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {selectedCollectionIds.length === 0
                ? 'Item will be moved to Unsorted if no collections selected'
                : `Selected: ${selectedCollectionIds.length} collection${selectedCollectionIds.length === 1 ? '' : 's'}`}
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div
              style={{
                padding: '0.75rem',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                borderRadius: 8,
                color: '#ef4444',
                fontSize: '0.9rem',
              }}
            >
              {error}
            </div>
          )}

          {/* Submit button */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            {onCancel && (
              <ButtonGhost
                type="button"
                onClick={onCancel}
                style={{ padding: '0.5rem 1rem' }}
              >
                Cancel
              </ButtonGhost>
            )}
            <button
              type="submit"
              disabled={isSaving || !title.trim()}
              style={{
                padding: '0.5rem 1.5rem',
                background: isSaving || !title.trim() ? 'var(--bg-glass)' : 'var(--accent)',
                color: isSaving || !title.trim() ? 'var(--text-muted)' : '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: isSaving || !title.trim() ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem',
                fontWeight: 600,
                transition: 'all 0.15s ease',
              }}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

