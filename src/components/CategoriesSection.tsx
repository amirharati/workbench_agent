import React, { useState } from 'react';
import { Plus, Folder, Trash2 } from 'lucide-react';
import { Collection, Item, addCollection, deleteCollection as deleteCollectionDB } from '../lib/db';
import { ItemCard } from './ItemCard';

interface CategoriesSectionProps {
  collections: Collection[];
  items: Item[];
  onDeleteItem: (id: string) => void;
  onRefresh: () => void;
}

export const CategoriesSection: React.FC<CategoriesSectionProps> = ({
  collections,
  items,
  onDeleteItem,
  onRefresh,
}) => {
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Group items by collection
  const unsortedItems = items.filter((item) => !item.collectionId);
  const itemsByCollection = collections.map((col) => ({
    ...col,
    items: items.filter((item) => item.collectionId === col.id),
  }));

  const handleAddCollection = async () => {
    if (newCollectionName.trim()) {
      await addCollection(newCollectionName.trim());
      setNewCollectionName('');
      setShowAddForm(false);
      onRefresh();
    }
  };

  const handleDeleteCollection = async (id: string) => {
    await deleteCollectionDB(id);
    onRefresh();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#1f2937' }}>Categories</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: '0.375rem 0.75rem',
            background: '#eff6ff',
            color: '#2563eb',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          <Plus size={14} /> New
        </button>
      </div>

      {showAddForm && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder="Category name..."
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCollection()}
            style={{
              flex: 1,
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          />
          <button
            onClick={handleAddCollection}
            style={{
              padding: '0.5rem 1rem',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Add
          </button>
        </div>
      )}

      {/* Unsorted / Draft */}
      <div
        style={{
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '0.75rem',
          padding: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Folder size={18} style={{ color: '#9ca3af' }} />
          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#6b7280' }}>Unsorted</span>
          <span
            style={{
              fontSize: '0.75rem',
              color: '#9ca3af',
              background: '#f3f4f6',
              padding: '0.125rem 0.5rem',
              borderRadius: '9999px',
            }}
          >
            {unsortedItems.length}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: '200px', overflowY: 'auto' }}>
          {unsortedItems.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.75rem' }}>
              No unsorted items
            </div>
          ) : (
            unsortedItems.slice(0, 10).map((item) => (
              <ItemCard key={item.id} item={item} onDelete={onDeleteItem} />
            ))
          )}
          {unsortedItems.length > 10 && (
            <div style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.75rem', padding: '0.5rem' }}>
              +{unsortedItems.length - 10} more items
            </div>
          )}
        </div>
      </div>

      {/* User Collections */}
      {itemsByCollection.map((col) => (
        <div
          key={col.id}
          style={{
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '0.75rem',
            padding: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Folder size={18} style={{ color: col.color || '#3b82f6' }} />
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1f2937', flex: 1 }}>{col.name}</span>
            <span
              style={{
                fontSize: '0.75rem',
                color: '#6b7280',
                background: '#f3f4f6',
                padding: '0.125rem 0.5rem',
                borderRadius: '9999px',
              }}
            >
              {col.items.length}
            </span>
            <button
              onClick={() => handleDeleteCollection(col.id)}
              style={{
                padding: '0.25rem',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: '#9ca3af',
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: '200px', overflowY: 'auto' }}>
            {col.items.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.75rem' }}>
                Drag items here
              </div>
            ) : (
              col.items.map((item) => <ItemCard key={item.id} item={item} onDelete={onDeleteItem} />)
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
