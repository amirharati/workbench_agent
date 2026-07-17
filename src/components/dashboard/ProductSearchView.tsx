import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, Search, X } from 'lucide-react';
import type { Collection, Item } from '../../lib/db';
import type { SearchResult } from '../../lib/search';
import type { LibrarySearchState } from '../../hooks/useLibrarySearch';
import type { SearchFilters } from '../../lib/search';
import { SearchRelatedPanel } from './SearchDiscoveryBlocks';
import { isValidBookmarkUrl } from '../../lib/utils';
import { usePipelineBadgeMap } from '../../hooks/usePipelineBadgeMap';
import { ListPipelineBadge } from './PipelineDisplayBlocks';
import { ItemContextMenu } from './ItemContextMenu';
import { ExtensionPageUrlLink } from './BookmarkUrlLink';

interface ProductSearchViewProps {
  items: Item[];
  collections: Collection[];
  state: LibrarySearchState;
  onQueryChange: (query: string) => void;
  onFiltersChange: (filters: SearchFilters) => void;
  onModeChange: (mode: 'hybrid' | 'lexical-only') => void;
  onSelectedItemIdChange: (id: string | null) => void;
  onRunSearch: (query?: string) => Promise<void>;
  onOpenItem: (item: Item) => void;
  onClearRecentQueries?: () => void;
  autofocus?: boolean;
  embedded?: boolean;
  showOpenInTab?: boolean;
  onOpenInTab?: () => void;
}

function getMatchReason(row: SearchResult): string {
  const { breakdown } = row;
  if (breakdown.matchedTerms.length && breakdown.lexical >= 0.25) return 'title match';
  if (breakdown.embedding >= 0.25) return 'similar topic';
  if (breakdown.category >= 0.15) return 'category match';
  if (breakdown.candidateSources.includes('lexical')) return 'text match';
  return 'related';
}

function getSnippet(item: Item | undefined): string {
  if (!item) return '';
  const metaSummary =
    typeof item.metadata?.enrichment?.summary === 'string'
      ? item.metadata.enrichment.summary.trim()
      : '';
  if (metaSummary) return metaSummary;
  return (item.notes || '').trim();
}

export const ProductSearchView: React.FC<ProductSearchViewProps> = ({
  items,
  collections,
  state,
  onQueryChange,
  onFiltersChange,
  onModeChange,
  onSelectedItemIdChange,
  onRunSearch,
  onOpenItem,
  onClearRecentQueries,
  autofocus = true,
  embedded = false,
  showOpenInTab = false,
  onOpenInTab,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{ item: Item; x: number; y: number } | null>(null);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const resultItemIds = useMemo(
    () => state.result?.results.map((r) => r.itemId) ?? [],
    [state.result]
  );
  const badgeMap = usePipelineBadgeMap(resultItemIds);

  useEffect(() => {
    if (autofocus) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [autofocus]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.loading) void onRunSearch();
  };

  const collectionFilter = state.filters.collectionId ?? 'all';
  const domainFilter = state.filters.domain ?? '';

  const showRecent = !state.query.trim() && !state.result;
  const hasResults = (state.result?.results.length ?? 0) > 0;

  return (
    <div
      className="scrollbar"
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: embedded ? '12px 16px' : '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: embedded ? 12 : 20,
      }}
    >
      <div>
        {!embedded && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: 'var(--text-lg)',
                fontWeight: 600,
                color: 'var(--text)',
              }}
            >
              Search
            </h1>
            {showOpenInTab && onOpenInTab && (
              <button
                type="button"
                onClick={onOpenInTab}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Open in tab
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <div style={{ position: 'relative', flex: 1 }}>
              <Search
                size={18}
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                ref={inputRef}
                type="text"
                value={state.query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search your library..."
                disabled={state.loading}
                style={{
                  width: '100%',
                  padding: '12px 40px 12px 44px',
                  fontSize: 'var(--text-base)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--input-bg, var(--bg-input))',
                  color: 'var(--text)',
                  outline: 'none',
                }}
              />
              {state.query && (
                <button
                  type="button"
                  onClick={() => onQueryChange('')}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    padding: 4,
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={state.loading || !state.query.trim()}
              style={{
                padding: '10px 18px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: state.loading ? 'var(--accent-weak)' : 'var(--accent)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 'var(--text-sm)',
                cursor: state.loading ? 'wait' : 'pointer',
                opacity: !state.query.trim() ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexShrink: 0,
              }}
            >
              {state.loading && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              {state.loading ? 'Searching…' : 'Search'}
            </button>
          </div>
        </form>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <select
            value={collectionFilter}
            onChange={(e) => {
              const val = e.target.value;
              onFiltersChange({
                ...state.filters,
                collectionId: val === 'all' ? undefined : val,
              });
            }}
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--input-bg, var(--bg-input))',
              color: 'var(--text)',
              fontSize: 'var(--text-xs)',
            }}
          >
            <option value="all">All collections</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={domainFilter}
            onChange={(e) =>
              onFiltersChange({
                ...state.filters,
                domain: e.target.value.trim() || undefined,
              })
            }
            placeholder="Domain filter"
            style={{
              width: 160,
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--input-bg, var(--bg-input))',
              color: 'var(--text)',
              fontSize: 'var(--text-xs)',
            }}
          />

          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {state.recentQueries.length > 0 && onClearRecentQueries && (
              <button
                type="button"
                onClick={onClearRecentQueries}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                }}
              >
                Clear recent
              </button>
            )}
            {(['hybrid', 'lexical-only'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onModeChange(m)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: `1px solid ${state.mode === m ? 'var(--accent)' : 'var(--border)'}`,
                  background: state.mode === m ? 'var(--accent-weak)' : 'transparent',
                  color: state.mode === m ? 'var(--text)' : 'var(--text-muted)',
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                }}
              >
                {m === 'hybrid' ? 'Hybrid' : 'Text only'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showRecent && (
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
          Search across your whole library — bookmarks, notes, tags, and AI categories.
          {state.recentQueries.length > 0 && (
            <span style={{ display: 'block', marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
              Recent queries are in the Inspector panel →
            </span>
          )}
        </div>
      )}

      {state.indexEmpty && !state.loading && (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 'var(--text-sm)',
          }}
        >
          No searchable bookmarks yet.
        </div>
      )}

      {state.error && (
        <div style={{ color: 'var(--error, #ef4444)', fontSize: 'var(--text-sm)' }}>{state.error}</div>
      )}

      {state.result && !state.loading && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
          {state.result.results.length} result{state.result.results.length !== 1 ? 's' : ''}
          {state.result.totalCandidates > state.result.results.length
            ? ` (top ${state.result.results.length} of ${state.result.totalCandidates})`
            : ''}
          {' · '}
          {state.result.mode === 'hybrid' ? 'hybrid' : 'text only'}
          {hasResults && (
            <span style={{ display: 'block', marginTop: 4, color: 'var(--text-muted)' }}>
              Click to inspect · Double-click or Enter to open in tab
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {state.result && !hasResults && state.query.trim() && !state.loading && (
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 'var(--text-sm)',
            }}
          >
            No matches. Try different words or clear filters.
          </div>
        )}

        {state.result?.results.map((row) => {
          const item = itemsById.get(row.itemId);
          const isSelected = state.selectedItemId === row.itemId;
          const snippet = getSnippet(item);

          return (
            <div
              key={row.itemId}
              role="button"
              tabIndex={0}
              onClick={() => onSelectedItemIdChange(row.itemId)}
              onDoubleClick={() => item && onOpenItem(item)}
              onContextMenu={(e) => {
                if (!item) return;
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ item, x: e.clientX, y: e.clientY });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  item && onOpenItem(item);
                } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && row.url) {
                  e.preventDefault();
                  window.open(row.url, '_blank');
                }
              }}
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                background: isSelected ? 'var(--accent-weak)' : 'var(--bg-panel)',
                cursor: 'pointer',
                transition: 'border-color 0.12s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 'var(--text-sm)',
                      color: 'var(--text)',
                      marginBottom: 4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.title || 'Untitled'}
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      flexWrap: 'wrap',
                    }}
                  >
                    <ListPipelineBadge badge={badgeMap.get(row.itemId)} />
                    <span>{row.domain}</span>
                    <span style={{ color: 'var(--text-faint)' }}>·</span>
                    <span style={{ color: 'var(--text-faint)' }}>{getMatchReason(row)}</span>
                    {row.primaryCategoryName && (
                      <>
                        <span style={{ color: 'var(--text-faint)' }}>·</span>
                        <span style={{ color: 'var(--text-muted)' }}>{row.primaryCategoryName}</span>
                      </>
                    )}
                  </div>
                  {snippet && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: 1.5,
                      }}
                    >
                      {snippet}
                    </div>
                  )}
                  {row.breakdown.matchedCategories.length > 1 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                      {row.breakdown.matchedCategories.slice(0, 4).map((cat) => (
                        <span
                          key={cat}
                          style={{
                            padding: '1px 6px',
                            borderRadius: 999,
                            border: '1px solid var(--border)',
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-faint)',
                          }}
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {row.url && isValidBookmarkUrl(row.url) && (
                  <ExtensionPageUrlLink
                    url={row.url}
                    stopPropagation
                    style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 2, display: 'inline-flex' }}
                    title="Open URL"
                  >
                    <ExternalLink size={14} />
                  </ExtensionPageUrlLink>
                )}
                {isSelected && item && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenItem(item);
                    }}
                    style={{
                      flexShrink: 0,
                      marginTop: 2,
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-glass)',
                      color: 'var(--text)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Open tab
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasResults && state.result && (
        <SearchRelatedPanel
          variant="product"
          related={state.result.related}
          onTopicClick={(name) => {
            onQueryChange(name);
            void onRunSearch(name);
          }}
          onTagClick={(tag) => {
            onQueryChange(tag);
            void onRunSearch(tag);
          }}
          onRelatedClick={(itemId) => {
            onSelectedItemIdChange(itemId);
            const item = itemsById.get(itemId);
            if (item) onOpenItem(item);
          }}
        />
      )}
      {contextMenu && (
        <ItemContextMenu
          item={contextMenu.item}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onOpenInNewTab={(it) => {
            if (it.url) window.open(it.url, '_blank');
          }}
        />
      )}
    </div>
  );
};
