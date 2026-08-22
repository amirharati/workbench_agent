import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Loader2, Search, X } from 'lucide-react';
import type { Collection, Item, Project, UpdateItemOptions } from '../../lib/db';
import type { SearchResult } from '../../lib/search';
import type { LibrarySearchState } from '../../hooks/useLibrarySearch';
import type { SearchFilters } from '../../lib/search';
import { describeParsedSearchQuery, parseSearchQuery } from '../../lib/search';
import { SearchRelatedPanel } from './SearchDiscoveryBlocks';
import { isValidBookmarkUrl } from '../../lib/utils';
import { usePipelineBadgeMap } from '../../hooks/usePipelineBadgeMap';
import { ListPipelineBadge } from './PipelineDisplayBlocks';
import { ItemContextMenu } from './ItemContextMenu';
import { ExtensionPageUrlLink } from './BookmarkUrlLink';
import { ItemOrganizationDialog } from './ItemOrganizationDialog';
import { WorkspaceDestinationPicker } from './WorkspaceDestinationPicker';
import type { WorkspaceDestination } from './workspaceDestinations';
import { ItemResultRow } from './ItemResultRow';
import { useItemPeek } from './ItemPeekProvider';
import { LinkVisual } from './LinkVisual';

interface ProductSearchViewProps {
  items: Item[];
  collections: Collection[];
  projects?: Project[];
  organizationCollections?: Collection[];
  state: LibrarySearchState;
  onQueryChange: (query: string) => void;
  onFiltersChange: (filters: SearchFilters) => void;
  onModeChange: (mode: 'hybrid' | 'lexical-only') => void;
  onSelectedItemIdChange: (id: string | null) => void;
  onRunSearch: (query?: string, filters?: SearchFilters) => Promise<void>;
  onOpenItem: (item: Item) => void;
  onUpdateItem?: (
    id: string,
    updates: Partial<Omit<Item, 'id' | 'created_at'>>,
    options?: UpdateItemOptions
  ) => Promise<void>;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  organizationContextProjectId?: string;
  organizationContextCollectionId?: string;
  onClearRecentQueries?: () => void;
  scopeLabel?: string;
  autofocus?: boolean;
  embedded?: boolean;
  workspaceAction?: React.ReactNode;
  scopeOptions?: Array<{ value: string; label: string }>;
  scopeValue?: string;
  onScopeValueChange?: (value: string) => void;
  workspaceDestinations?: WorkspaceDestination[];
  recentWorkspaceDestinationKeys?: readonly string[];
  isItemInWorkspace?: (item: Item, destination: WorkspaceDestination) => boolean;
  onAddItemToWorkspace?: (item: Item, destination: WorkspaceDestination) => void;
  onViewItemInWorkspace?: (item: Item, destination: WorkspaceDestination) => void;
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
  projects = [],
  organizationCollections = collections,
  state,
  onQueryChange,
  onFiltersChange,
  onModeChange,
  onSelectedItemIdChange,
  onRunSearch,
  onUpdateItem,
  onCreateProject,
  onCreateCollection,
  organizationContextProjectId,
  organizationContextCollectionId,
  onClearRecentQueries,
  scopeLabel,
  autofocus = true,
  embedded = false,
  workspaceAction,
  scopeOptions,
  scopeValue,
  onScopeValueChange,
  workspaceDestinations = [],
  recentWorkspaceDestinationKeys,
  isItemInWorkspace,
  onAddItemToWorkspace,
  onViewItemInWorkspace,
}) => {
  const { openPeek } = useItemPeek();
  const inputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{ item: Item; x: number; y: number } | null>(null);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const resultItemIds = useMemo(
    () => state.result?.results.map((r) => r.itemId) ?? [],
    [state.result]
  );
  const contextProject = projects.find((project) => project.id === organizationContextProjectId);
  const contextCollection = organizationCollections.find(
    (collection) => collection.id === organizationContextCollectionId
  );
  const onFiltersChangeRef = useRef(onFiltersChange);
  const onRunSearchRef = useRef(onRunSearch);
  onFiltersChangeRef.current = onFiltersChange;
  onRunSearchRef.current = onRunSearch;
  const badgeMap = usePipelineBadgeMap(resultItemIds);
  const parsedQuery = useMemo(() => parseSearchQuery(state.query), [state.query]);
  const queryInterpretation = useMemo(
    () => describeParsedSearchQuery(parsedQuery),
    [parsedQuery]
  );

  useEffect(() => {
    if (autofocus) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [autofocus]);

  useEffect(() => {
    const exclusionBelongsToContext =
      (!state.filters.excludeProjectId || state.filters.excludeProjectId === organizationContextProjectId) &&
      (!state.filters.excludeCollectionId || state.filters.excludeCollectionId === organizationContextCollectionId);
    if (exclusionBelongsToContext) return;

    const nextFilters: SearchFilters = {
      ...state.filters,
      excludeProjectId: undefined,
      excludeCollectionId: undefined,
    };
    onFiltersChangeRef.current(nextFilters);
    if (state.query.trim()) void onRunSearchRef.current(undefined, nextFilters);
  }, [organizationContextCollectionId, organizationContextProjectId, state.filters.excludeCollectionId, state.filters.excludeProjectId, state.query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.loading) void onRunSearch();
  };

  const collectionFilter = state.filters.collectionId ?? 'all';
  const exclusionFilter = organizationContextCollectionId && state.filters.excludeCollectionId === organizationContextCollectionId
    ? 'current-collection'
    : organizationContextProjectId && state.filters.excludeProjectId === organizationContextProjectId
      ? 'current-project'
      : 'none';
  const domainFilter = state.filters.domain ?? '';

  const showRecent = !state.query.trim() && !state.result;
  const hasResults = (state.result?.results.length ?? 0) > 0;

  return (
    <div
      className={`scrollbar${embedded ? '' : ' ui-scroll-footer-safe'}`}
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: embedded ? '12px 16px 28px' : '24px 28px var(--scroll-footer-safe-bottom)',
        scrollPaddingBottom: embedded ? 28 : 'var(--scroll-footer-safe-bottom)',
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
            {workspaceAction}
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
                  className="ui-button ui-button--icon"
                  aria-label="Clear search"
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
              className="ui-button ui-button--primary"
              disabled={state.loading || !state.query.trim()}
              style={{
                padding: '10px 18px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: state.loading ? 'var(--accent-weak)' : 'var(--accent)',
                color: 'var(--accent-text)',
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
          {scopeOptions && scopeOptions.length > 1 && scopeValue && onScopeValueChange ? (
            <select
              aria-label="Search scope"
              value={scopeValue}
              onChange={(event) => onScopeValueChange(event.target.value)}
              style={{ padding: '5px 9px', borderRadius: 999, border: '1px solid var(--accent)', background: 'var(--accent-weak)', color: 'var(--accent)', fontSize: 'var(--text-xs)', fontWeight: 600 }}
              title={`Search scope: ${scopeLabel ?? 'All Library'}`}
            >
              {scopeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ) : scopeLabel ? (
            <span
              style={{
                padding: '4px 9px',
                borderRadius: 999,
                border: '1px solid var(--accent)',
                background: 'var(--accent-weak)',
                color: 'var(--accent)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
              }}
              title={`Search scope: ${scopeLabel}`}
            >
              {scopeLabel}
            </span>
          ) : null}
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

          {(organizationContextProjectId || organizationContextCollectionId) && (
            <select
              aria-label="Exclude organization"
              value={exclusionFilter}
              onChange={(event) => {
                const value = event.target.value;
                const nextFilters: SearchFilters = {
                  ...state.filters,
                  excludeProjectId: value === 'current-project' ? organizationContextProjectId : undefined,
                  excludeCollectionId: value === 'current-collection' ? organizationContextCollectionId : undefined,
                };
                onFiltersChange(nextFilters);
                // A discrete exclusion should visibly affect the current result
                // set immediately. Pass the snapshot explicitly so React state
                // timing cannot make this rerun use the previous filters.
                if (state.query.trim()) void onRunSearch(undefined, nextFilters);
              }}
              title="Show only results not already organized in the selected location"
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${exclusionFilter === 'none' ? 'var(--border)' : 'var(--accent)'}`,
                background: exclusionFilter === 'none'
                  ? 'var(--input-bg, var(--bg-input))'
                  : 'var(--accent-weak)',
                color: exclusionFilter === 'none' ? 'var(--text)' : 'var(--accent)',
                fontSize: 'var(--text-xs)',
                fontWeight: exclusionFilter === 'none' ? 400 : 600,
              }}
            >
              <option value="none">Include existing</option>
              {organizationContextProjectId && (
                <option value="current-project">
                  Not in current project{contextProject?.name ? ` · ${contextProject.name}` : ''}
                </option>
              )}
              {organizationContextCollectionId && (
                <option value="current-collection">
                  Not in current collection{contextCollection?.name ? ` · ${contextCollection.name}` : ''}
                </option>
              )}
            </select>
          )}

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
        {state.query.trim() && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '4px 10px',
              marginTop: 9,
              color: 'var(--text-faint)',
              fontSize: 'var(--text-xs)',
              lineHeight: 1.45,
            }}
          >
            {queryInterpretation && (
              <strong style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                {queryInterpretation}
              </strong>
            )}
            <span>Syntax: “exact phrase” · OR · AND / + · -exclude · site:domain</span>
          </div>
        )}
      </div>

      {showRecent && (
        <div style={{ padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-panel)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
          <strong style={{ display: 'block', color: 'var(--text)', fontSize: 'var(--text-sm)' }}>Find anything in this scope</strong>
          <span style={{ display: 'block', marginTop: 3, color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>Search bookmarks, notes, tags, and AI categories.</span>
          {state.recentQueries.length > 0 && (
            <div style={{ marginTop: 13 }}>
              <span style={{ display: 'block', marginBottom: 6, color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>Recent searches</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {state.recentQueries.slice(0, 8).map((query) => (
                  <button
                    key={query}
                    type="button"
                    onClick={() => {
                      onQueryChange(query);
                      void onRunSearch(query);
                    }}
                    title={`Search again for ${query}`}
                    style={{ minHeight: 28, maxWidth: 240, padding: '0 9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid var(--border)', borderRadius: 999, background: 'var(--bg)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                  >
                    {query}
                  </button>
                ))}
              </div>
            </div>
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
        <div style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>{state.error}</div>
      )}

      {state.restoring && !state.result && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
          <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
          Restoring previous results…
        </div>
      )}

      {state.result && !state.loading && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
          {state.result.results.length} result{state.result.results.length !== 1 ? 's' : ''}
          {state.result.totalCandidates > state.result.results.length
            ? ` (top ${state.result.results.length} of ${state.result.totalCandidates})`
            : ''}
          {' · '}
          {state.result.mode === 'lexical-only'
            ? 'text only · exact rules'
            : state.result.embeddingPathUsed
              ? 'semantic ranking · exact rules'
              : 'text fallback · exact rules'}
          {hasResults && (
            <span style={{ display: 'block', marginTop: 4, color: 'var(--text-muted)' }}>
              Click to inspect · Click the URL to open the website · Double-click, Enter, or use Preview
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
            {state.result.related.relatedLinks.length > 0
              ? 'No exact matches. Related semantic results are shown below.'
              : 'No exact matches. Try OR, different words, or clear filters.'}
          </div>
        )}

        {state.result?.results.map((row) => {
          const item = itemsById.get(row.itemId);
          const isSelected = state.selectedItemId === row.itemId;
          const snippet = getSnippet(item);

          return (
            <ItemResultRow
              key={row.itemId}
              item={item ?? { id: row.itemId, title: row.title, url: row.url }}
              dragSource={item ? { kind: 'reference', label: 'Search results' } : undefined}
              selected={isSelected}
              onSelectItem={() => onSelectedItemIdChange(row.itemId)}
              onDoubleClick={() => openPeek(row.itemId, { itemIds: resultItemIds, sourceLabel: 'Search results' })}
              onContextMenu={(e) => {
                if (!item) return;
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ item, x: e.clientX, y: e.clientY });
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
                  {row.url && isValidBookmarkUrl(row.url) && (
                    <ExtensionPageUrlLink
                      url={row.url}
                      stopPropagation
                      style={{
                        maxWidth: '100%',
                        marginBottom: 6,
                        color: 'var(--accent)',
                        fontSize: 'var(--text-xs)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        textDecoration: 'none',
                      }}
                      title={`Open ${row.url}`}
                    >
                      <LinkVisual url={row.url} title={row.title} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.url}</span>
                    </ExtensionPageUrlLink>
                  )}
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
                <div
                  style={{ flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    className="ui-button ui-button--secondary ui-button--compact"
                    type="button"
                    onClick={() => openPeek(row.itemId, { itemIds: resultItemIds, sourceLabel: 'Search results' })}
                    aria-label={`Preview ${row.title || 'Untitled'}`}
                    title="Preview without leaving Search"
                  >
                    <Eye size={12} /> Preview
                  </button>
                  {isSelected && item ? (
                    <>
                      {onUpdateItem && projects.length > 0 && organizationCollections.length > 0 ? (
                      <ItemOrganizationDialog
                        item={item}
                        projects={projects}
                        collections={organizationCollections}
                        onUpdateItem={onUpdateItem}
                        onCreateProject={onCreateProject}
                        onCreateCollection={onCreateCollection}
                        defaultProjectId={organizationContextProjectId}
                        defaultCollectionId={organizationContextCollectionId}
                      />
                      ) : null}
                      {workspaceDestinations.length > 0 && isItemInWorkspace && onAddItemToWorkspace ? (
                      <WorkspaceDestinationPicker
                        item={item}
                        destinations={workspaceDestinations}
                        recentDestinationKeys={recentWorkspaceDestinationKeys}
                        isAdded={(destination) => isItemInWorkspace(item, destination)}
                        onAdd={(destination) => onAddItemToWorkspace(item, destination)}
                        onView={onViewItemInWorkspace ? (destination) => onViewItemInWorkspace(item, destination) : undefined}
                      />
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </ItemResultRow>
          );
        })}
      </div>

      {state.result && (
        <SearchRelatedPanel
          variant="product"
          related={state.result.related}
          semanticRelated={state.result.embeddingPathUsed}
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
