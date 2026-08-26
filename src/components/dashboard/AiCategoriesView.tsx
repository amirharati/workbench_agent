import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronRight, Plus, RefreshCw, Search } from 'lucide-react';
import { subscribeToDataChanges } from '../../lib/dataChangeNotifier';
import { isLinkQualityTaxonomyParent } from '../../lib/categorization/classificationPresentation';
import {
  findSimilarCategories,
  type CategorySimilarityMatch,
} from '../../lib/categorization/categoryManagement';
import {
  getTaxonomyTreeWithCounts,
  type TaxonomyLeafRow,
  type TaxonomyParentRow,
} from '../../lib/categorization/devQueries';
import type { Item } from '../../lib/db';
import { ManageCategoriesDialog } from './ManageCategoriesDialog';
import { categoryColorStyle } from '../shared/categoryColor';

interface AiCategoriesViewProps {
  onBrowseCategory?: (categoryId: string, name: string) => void;
  /** Current Inspector item when this taxonomy is opened from an item-aware surface. */
  targetItem?: Pick<Item, 'id' | 'title' | 'url'> | null;
  /** When nested inside Enrichment Hub — hide page chrome. */
  embedded?: boolean;
}

function splitTaxonomyParents(parents: TaxonomyParentRow[]): {
  topicParents: TaxonomyParentRow[];
  pipelineParents: TaxonomyParentRow[];
} {
  const topicParents: TaxonomyParentRow[] = [];
  const pipelineParents: TaxonomyParentRow[] = [];
  for (const row of parents) {
    if (isLinkQualityTaxonomyParent(row.category.id)) pipelineParents.push(row);
    else topicParents.push(row);
  }
  return { topicParents, pipelineParents };
}

const RELOAD_REASONS = new Set([
  'categorization.review',
  'categorization.update',
  'enrichment.update',
  'import.replace',
  'import.bulk',
  'pipeline.clear',
]);
const ORPHAN_PARENT_ID = '__categories_without_parent__';

export const AiCategoriesView: React.FC<AiCategoriesViewProps> = ({
  onBrowseCategory,
  targetItem = null,
  embedded = false,
}) => {
  const [taxonomy, setTaxonomy] = useState<Awaited<ReturnType<typeof getTaxonomyTreeWithCounts>> | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [searchMatches, setSearchMatches] = useState<CategorySimilarityMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchWarning, setSearchWarning] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const taxonomyRef = useRef(taxonomy);
  taxonomyRef.current = taxonomy;
  const reloadSeqRef = useRef(0);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    const seq = ++reloadSeqRef.current;
    const hasData = taxonomyRef.current != null;
    const silent = opts?.silent === true && hasData;
    if (!silent) {
      if (!hasData) setLoading(true);
      else setRefreshing(true);
    }
    try {
      const next = await getTaxonomyTreeWithCounts();
      if (seq !== reloadSeqRef.current) return;
      const prev = taxonomyRef.current;
      const looksLikeHydrateRace =
        prev != null &&
        prev.totals.itemsWithPrimary > 0 &&
        next.totals.itemsWithPrimary === 0 &&
        next.parents.every((p) => p.primaryItemCount === 0);
      if (!looksLikeHydrateRace) {
        setTaxonomy(next);
      }
    } finally {
      if (seq === reloadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    return subscribeToDataChanges((event) => {
      if (RELOAD_REASONS.has(event.reason)) void reload({ silent: true });
    });
  }, [reload]);

  const searchQuery = query.trim();
  const allCategories = useMemo(
    () => taxonomy
      ? [
          ...taxonomy.parents.flatMap((row) => [row.category, ...row.leaves.map((leaf) => leaf.category)]),
          ...taxonomy.orphanLeaves.map((leaf) => leaf.category),
        ]
      : [],
    [taxonomy]
  );
  const { topicParents, pipelineParents } = useMemo(
    () => splitTaxonomyParents(taxonomy?.parents ?? []),
    [taxonomy]
  );
  const orphanLeaves = taxonomy?.orphanLeaves ?? [];
  const selectedParent = useMemo(
    () => taxonomy?.parents.find((row) => row.category.id === selectedParentId) ?? null,
    [taxonomy, selectedParentId]
  );
  const hasTaxonomyRows =
    (taxonomy?.parents.length ?? 0) > 0 || orphanLeaves.length > 0;

  useEffect(() => {
    if (!taxonomy) return;
    if (!taxonomy.parents.length) {
      const next = orphanLeaves.length ? ORPHAN_PARENT_ID : null;
      if (selectedParentId !== next) setSelectedParentId(next);
      return;
    }
    if (selectedParentId === ORPHAN_PARENT_ID && orphanLeaves.length) return;
    if (selectedParentId && taxonomy.parents.some((row) => row.category.id === selectedParentId)) return;
    setSelectedParentId(
      topicParents[0]?.category.id
      ?? pipelineParents[0]?.category.id
      ?? (orphanLeaves.length ? ORPHAN_PARENT_ID : null)
    );
  }, [taxonomy, selectedParentId, topicParents, pipelineParents, orphanLeaves.length]);

  useEffect(() => {
    if (!searchQuery || !allCategories.length) {
      setSearchMatches([]);
      setSearching(false);
      setSearchWarning(undefined);
      return;
    }
    setSearchMatches([]);
    setSearchWarning(undefined);
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      const normalized = searchQuery.toLocaleLowerCase();
      const directMatches: CategorySimilarityMatch[] = allCategories
        .map((category) => {
          const name = category.name.toLocaleLowerCase();
          const description = (category.description ?? '').toLocaleLowerCase();
          const exact = name === normalized;
          const score = exact ? 1 : name.includes(normalized) ? 0.78 : description.includes(normalized) ? 0.52 : 0;
          return { category, score, lexicalScore: score, semanticScore: 0, exact };
        })
        .filter((match) => match.score > 0);
      setSearchMatches(
        directMatches
          .sort((left, right) => Number(right.exact) - Number(left.exact) || right.score - left.score)
          .slice(0, 40)
      );

      void findSimilarCategories(
        { name: searchQuery, description: '', kind: 'leaf' },
        allCategories
      ).then((result) => {
        if (!active) return;
        const byId = new Map<string, CategorySimilarityMatch>();
        for (const match of [...directMatches, ...result.matches]) {
          const existing = byId.get(match.category.id);
          if (!existing || match.score > existing.score) byId.set(match.category.id, match);
        }
        setSearchMatches(
          [...byId.values()]
            .sort((left, right) => Number(right.exact) - Number(left.exact) || right.score - left.score)
            .slice(0, 40)
        );
        setSearchWarning(result.semanticWarning);
      }).catch((error) => {
        if (!active) return;
        setSearchMatches(directMatches);
        setSearchWarning(`Semantic search unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }).finally(() => {
        if (active) setSearching(false);
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [allCategories, searchQuery]);

  return (
    <div
      className="scrollbar"
      style={{
        height: embedded ? 'auto' : '100%',
        overflow: embedded ? 'visible' : 'auto',
        padding: embedded ? 0 : '20px 24px 32px',
        maxWidth: embedded ? 'none' : 900,
        margin: embedded ? 0 : '0 auto',
      }}
    >
      {!embedded ? (
        <header style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text)' }}>
                AI Categories
              </h1>
              <p style={{ margin: '8px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                AI categories are semantic tags assigned by enrichment.{' '}
                <strong style={{ fontWeight: 600, color: 'var(--text)' }}>Collections</strong> are your manual folders.
                Counts include suggested and accepted links.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" className="ui-button ui-button--primary" onClick={() => setCreateOpen(true)}>
                <Plus size={14} /> {targetItem ? 'Add category to current bookmark' : 'New category'}
              </button>
              <button
                type="button"
                onClick={() => void reload()}
                disabled={loading || refreshing}
                title="Refresh counts"
                className="ui-button ui-button--secondary"
              >
                <RefreshCw size={14} className={refreshing ? 'spin' : undefined} />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
        </div>
      </header>
      ) : (
        <div className="ui-taxonomy__intro">
          <div>
            <h2>All categories</h2>
            <p>Complete parent and child hierarchy, including categories with no bookmarks yet.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" className="ui-button ui-button--primary" onClick={() => setCreateOpen(true)}>
              <Plus size={13} /> {targetItem ? 'Add category to current bookmark' : 'New category'}
            </button>
            <button
              type="button"
              onClick={() => void reload()}
              disabled={loading || refreshing}
              title="Refresh counts"
              className="ui-button ui-button--secondary"
            >
              <RefreshCw size={13} className={refreshing ? 'spin' : undefined} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      )}

      {taxonomy && (
        <div className="ui-taxonomy__summary">
          <span>
            <strong>{taxonomy.totals.parents}</strong> parent categories
          </span>
          <span>
            <strong>{taxonomy.totals.leaves}</strong> child categories
          </span>
          <span>
            <strong>{taxonomy.totals.itemsWithPrimary}</strong> bookmarks assigned
          </span>
        </div>
      )}

      <div className="ui-taxonomy__controls">
        <div className="ui-taxonomy__search">
          <Search size={16} color="var(--text-muted)" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search parents and children by name or meaning…"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--text)',
              fontSize: 'var(--text-sm)',
            }}
          />
        </div>
      </div>

      {loading && !taxonomy ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>Loading categories…</p>
      ) : !hasTaxonomyRows ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
          {taxonomy
            ? searchQuery
              ? 'No categories match your filter.'
              : 'The starter categories are still loading. Reopen this view if they do not appear shortly.'
            : 'Loading categories…'}
        </p>
      ) : (
        <div className="ui-taxonomy__browser" data-refreshing={refreshing ? 'true' : 'false'}>
          {searchQuery ? (
            <CategorySearchResults
              matches={searchMatches}
              parents={taxonomy?.parents ?? []}
              searching={searching}
              warning={searchWarning}
              onBrowse={onBrowseCategory}
            />
          ) : (
            <div className="ui-taxonomy__hierarchy">
              <nav className="ui-taxonomy__parent-nav" aria-label="Category parents">
                <ParentNavSection
                  label="Topics"
                  rows={topicParents}
                  selectedParentId={selectedParentId}
                  onSelect={setSelectedParentId}
                />
                {pipelineParents.length ? (
                  <ParentNavSection
                    label="Page status"
                    rows={pipelineParents}
                    selectedParentId={selectedParentId}
                    onSelect={setSelectedParentId}
                    variant="status"
                  />
                ) : null}
                {orphanLeaves.length ? (
                  <section className="ui-taxonomy__parent-nav-section">
                    <h3>Needs organization</h3>
                    <div className="ui-taxonomy__parent-nav-list">
                      <button
                        type="button"
                        className="ui-taxonomy__parent-nav-item"
                        data-selected={selectedParentId === ORPHAN_PARENT_ID ? 'true' : 'false'}
                        onClick={() => setSelectedParentId(ORPHAN_PARENT_ID)}
                      >
                        <span>
                          <strong>Without a parent</strong>
                          <small>{orphanLeaves.length} {orphanLeaves.length === 1 ? 'category' : 'categories'}</small>
                        </span>
                        <ChevronRight size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </section>
                ) : null}
              </nav>
              <div className="ui-taxonomy__parent-detail">
                {selectedParent ? (
                  <CategoryGroup
                    row={selectedParent}
                    variant={isLinkQualityTaxonomyParent(selectedParent.category.id) ? 'status' : 'topic'}
                    onBrowse={onBrowseCategory}
                  />
                ) : null}
                {selectedParentId === ORPHAN_PARENT_ID && orphanLeaves.length > 0 ? (
                  <section className="ui-taxonomy__orphans">
                    <div className="ui-taxonomy__section-heading">
                      <div>
                        <h3>Categories without a parent</h3>
                        <p>Categories not attached to a parent yet.</p>
                      </div>
                      <span>{orphanLeaves.length}</span>
                    </div>
                    <div className="ui-taxonomy__children ui-taxonomy__children--standalone">
                      {orphanLeaves.map((leaf) => (
                        <CategoryLeaf key={leaf.category.id} leaf={leaf} onBrowse={onBrowseCategory} />
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
      {createOpen ? (
        <ManageCategoriesDialog
          itemId={targetItem?.id}
          itemTitle={targetItem?.title || targetItem?.url}
          onClose={() => setCreateOpen(false)}
          onChanged={() => void reload({ silent: true })}
        />
      ) : null}
    </div>
  );
};

function sourceLabel(source?: string): string {
  if (source === 'seed') return 'Seed';
  if (source === 'discovered') return 'Discovered';
  if (source === 'manual') return 'Manual';
  if (source === 'bootstrap') return 'Bootstrap';
  return 'Existing';
}

function CategoryCount({ value }: { value: number }) {
  return (
    <span className="ui-taxonomy__bookmark-count" data-empty={value === 0 ? 'true' : 'false'}>
      <strong>{value}</strong> {value === 1 ? 'bookmark' : 'bookmarks'}
    </span>
  );
}

function ParentNavSection({
  label,
  rows,
  selectedParentId,
  onSelect,
  variant = 'topic',
}: {
  label: string;
  rows: TaxonomyParentRow[];
  selectedParentId: string | null;
  onSelect: (categoryId: string) => void;
  variant?: 'topic' | 'status';
}) {
  return (
    <section className="ui-taxonomy__parent-nav-section" data-variant={variant}>
      <h3>{label}</h3>
      <div className="ui-taxonomy__parent-nav-list">
        {rows.map((row) => (
          <button
            key={row.category.id}
            type="button"
            className="ui-taxonomy__parent-nav-item"
            style={categoryColorStyle({
              categoryId: row.category.id,
              label: row.category.name,
            })}
            data-selected={selectedParentId === row.category.id ? 'true' : 'false'}
            onClick={() => onSelect(row.category.id)}
          >
            <span>
              <strong>{row.category.name}</strong>
              <small>{row.leaves.length} {row.leaves.length === 1 ? 'child' : 'children'} · {row.itemCount} saved</small>
            </span>
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

function CategorySearchResults({
  matches,
  parents,
  searching,
  warning,
  onBrowse,
}: {
  matches: CategorySimilarityMatch[];
  parents: TaxonomyParentRow[];
  searching: boolean;
  warning?: string;
  onBrowse?: (categoryId: string, name: string) => void;
}) {
  const parentById = new Map(parents.map((row) => [row.category.id, row]));
  const countsById = new Map<string, number>();
  for (const parent of parents) {
    countsById.set(parent.category.id, parent.itemCount);
    for (const leaf of parent.leaves) countsById.set(leaf.category.id, leaf.itemCount);
  }

  return (
    <section className="ui-taxonomy__search-results" aria-live="polite">
      <div className="ui-taxonomy__section-heading">
        <div>
          <h3>Category investigation</h3>
          <p>Keyword and semantic matches across parents and children.</p>
        </div>
        <span>{searching ? 'Comparing meaning…' : `${matches.length} matches`}</span>
      </div>
      {warning ? <p className="ui-taxonomy__search-warning">{warning}</p> : null}
      {!searching && matches.length === 0 ? (
        <p className="ui-taxonomy__empty-search">No matching parent or child categories.</p>
      ) : (
        <div className="ui-taxonomy__search-grid">
          {matches.map((match) => {
            const parent = match.category.kind === 'leaf' && match.category.parentId
              ? parentById.get(match.category.parentId)
              : undefined;
            const content = (
              <>
                <div className="ui-taxonomy__search-result-copy">
                  <span>{match.category.kind === 'parent' ? 'Parent' : parent?.category.name ?? 'Child without parent'}</span>
                  <strong>{match.category.name}</strong>
                  {match.category.description ? <p>{match.category.description}</p> : null}
                </div>
                <div className="ui-taxonomy__search-result-meta">
                  <span>{Math.round(match.score * 100)}% match</span>
                  <CategoryCount value={countsById.get(match.category.id) ?? match.category.itemCount ?? 0} />
                  {onBrowse ? <ArrowRight size={14} /> : null}
                </div>
              </>
            );
            return onBrowse ? (
              <button
                type="button"
                key={match.category.id}
                className="ui-taxonomy__search-result"
                style={categoryColorStyle({
                  categoryId: match.category.id,
                  label: match.category.name,
                  parentLabel: parent?.category.name,
                })}
                onClick={() => onBrowse(match.category.id, match.category.name)}
              >
                {content}
              </button>
            ) : (
              <div
                key={match.category.id}
                className="ui-taxonomy__search-result"
                style={categoryColorStyle({
                  categoryId: match.category.id,
                  label: match.category.name,
                  parentLabel: parent?.category.name,
                })}
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CategoryGroup({
  row,
  onBrowse,
  variant = 'topic',
}: {
  row: TaxonomyParentRow;
  onBrowse?: (categoryId: string, name: string) => void;
  variant?: 'topic' | 'status';
}) {
  return (
    <section
      className="ui-taxonomy__group"
      data-variant={variant}
      style={categoryColorStyle({ categoryId: row.category.id, label: row.category.name })}
    >
      <header className="ui-taxonomy__group-header">
        <div className="ui-taxonomy__group-copy">
          <div className="ui-taxonomy__category-meta">
            <span className="ui-taxonomy__level">Parent</span>
            <span className="ui-taxonomy__source" data-source={row.category.source ?? 'existing'}>
              {sourceLabel(row.category.source)}
            </span>
          </div>
          <h4>{row.category.name}</h4>
          {row.category.description ? <p>{row.category.description}</p> : null}
        </div>
        <div className="ui-taxonomy__group-stats">
          <span>{row.leaves.length} {row.leaves.length === 1 ? 'child' : 'children'}</span>
          <CategoryCount value={row.itemCount} />
          {onBrowse ? (
            <button
              type="button"
              className="ui-taxonomy__browse-parent"
              onClick={() => onBrowse(row.category.id, row.category.name)}
            >
              View all <ArrowRight size={13} />
            </button>
          ) : null}
        </div>
      </header>
      <div className="ui-taxonomy__children">
        {row.leaves.map((leaf) => (
          <CategoryLeaf key={leaf.category.id} leaf={leaf} onBrowse={onBrowse} />
        ))}
        {!row.leaves.length ? (
          <p className="ui-taxonomy__empty-children">No child categories</p>
        ) : null}
      </div>
    </section>
  );
}

function CategoryLeaf({
  leaf,
  onBrowse,
}: {
  leaf: TaxonomyLeafRow;
  onBrowse?: (categoryId: string, name: string) => void;
}) {
  const content = (
    <>
      <div className="ui-taxonomy__leaf-copy">
        <div className="ui-taxonomy__category-meta">
          <span className="ui-taxonomy__level">Child</span>
          <span className="ui-taxonomy__source" data-source={leaf.category.source ?? 'existing'}>
            {sourceLabel(leaf.category.source)}
          </span>
        </div>
        <strong>{leaf.category.name}</strong>
        {leaf.category.description ? <span>{leaf.category.description}</span> : null}
      </div>
      <CategoryCount value={leaf.itemCount} />
      {onBrowse ? <ArrowRight className="ui-taxonomy__leaf-arrow" size={14} /> : null}
    </>
  );

  return onBrowse ? (
    <button
      type="button"
      className="ui-taxonomy__leaf"
      style={categoryColorStyle({
        categoryId: leaf.category.id,
        label: leaf.category.name,
        parentLabel: leaf.category.parentName ?? undefined,
      })}
      onClick={() => onBrowse(leaf.category.id, leaf.category.name)}
    >
      {content}
    </button>
  ) : (
    <div
      className="ui-taxonomy__leaf"
      style={categoryColorStyle({
        categoryId: leaf.category.id,
        label: leaf.category.name,
        parentLabel: leaf.category.parentName ?? undefined,
      })}
    >
      {content}
    </div>
  );
}
