import React, { useState, useMemo } from 'react';
import type { Item, Collection } from '../../lib/db';
import { getDomain, isValidHttpUrl } from '../../lib/utils';
import { Input } from '../../styles/primitives';
import { Search, X, ExternalLink } from 'lucide-react';

interface SearchTabProps {
  items: Item[];
  collections: Collection[];
  onItemClick?: (item: Item) => void;
}

export const SearchTab: React.FC<SearchTabProps> = ({
  items,
  collections,
  onItemClick,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | 'all'>('all');

  // Filter items based on search query and collection
  const filteredItems = useMemo(() => {
    let filtered = items;

    // Filter by collection
    if (selectedCollectionId !== 'all') {
      filtered = filtered.filter((item) =>
        (item.collectionIds || []).includes(selectedCollectionId)
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((item) => {
        const title = (item.title || '').toLowerCase();
        const url = (item.url || '').toLowerCase();
        const notes = (item.notes || '').toLowerCase();
        const tags = (item.tags || []).join(' ').toLowerCase();
        
        return (
          title.includes(query) ||
          url.includes(query) ||
          notes.includes(query) ||
          tags.includes(query)
        );
      });
    }

    // Sort by updated_at (most recent first)
    return filtered.sort((a, b) => b.updated_at - a.updated_at);
  }, [items, searchQuery, selectedCollectionId]);

  // Get collection name helper
  const getCollectionName = (collectionId: string) => {
    const collection = collections.find((c) => c.id === collectionId);
    return collection?.name || 'Unknown';
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
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, color: 'var(--text)', letterSpacing: 0.2, marginBottom: '1rem' }}>
          Search
        </h2>
        
        {/* Search Input */}
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <Search
            size={18}
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items by title, URL, notes, or tags..."
            style={{
              width: '100%',
              paddingLeft: '2.5rem',
            }}
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                padding: '0.25rem',
                borderRadius: 4,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-glass)';
                e.currentTarget.style.color = 'var(--text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Collection Filter */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button
            onClick={() => setSelectedCollectionId('all')}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: 16,
              border: `1px solid ${selectedCollectionId === 'all' ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}`,
              background: selectedCollectionId === 'all' ? 'var(--accent-weak)' : 'rgba(255,255,255,0.05)',
              color: selectedCollectionId === 'all' ? 'var(--text)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              transition: 'all 0.15s ease',
            }}
          >
            All Collections
          </button>
          {collections.map((collection) => {
            const isSelected = selectedCollectionId === collection.id;
            return (
              <button
                key={collection.id}
                onClick={() => setSelectedCollectionId(collection.id)}
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
              >
                {collection.name}
              </button>
            );
          })}
        </div>

        {/* Results Count */}
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'} found
          {searchQuery && ` for "${searchQuery}"`}
          {selectedCollectionId !== 'all' && ` in ${getCollectionName(selectedCollectionId)}`}
        </div>
      </div>

      {/* Results List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {filteredItems.length === 0 ? (
          <div
            style={{
              padding: '3rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            {searchQuery || selectedCollectionId !== 'all'
              ? 'No items found matching your search.'
              : 'Start typing to search items...'}
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => onItemClick?.(item)}
              style={{
                padding: '1rem',
                background: 'var(--bg-glass)',
                borderRadius: 8,
                border: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-glass)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '0.25rem' }}>
                    {item.title || 'Untitled'}
                  </div>
                  {item.url && isValidHttpUrl(item.url) && (
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-muted)',
                        marginBottom: '0.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <ExternalLink size={12} />
                      {getDomain(item.url)}
                    </div>
                  )}
                  {item.notes && (
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-muted)',
                        marginTop: '0.5rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {item.notes}
                    </div>
                  )}
                  {item.tags && item.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: 12,
                            background: 'var(--accent-weak)',
                            color: 'var(--accent)',
                            fontSize: '0.75rem',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

