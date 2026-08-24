import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Plus, RefreshCw, Search } from 'lucide-react';
import { subscribeToDataChanges } from '../../lib/dataChangeNotifier';
import { isLinkQualityTaxonomyParent } from '../../lib/categorization/classificationPresentation';
import {
  getTaxonomyTreeWithCounts,
  type TaxonomyLeafRow,
  type TaxonomyParentRow,
} from '../../lib/categorization/devQueries';
import type { Item } from '../../lib/db';
import { ManageCategoriesDialog } from './ManageCategoriesDialog';

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

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!taxonomy) return taxonomy;

    const matchesCategory = (category: TaxonomyParentRow['category'] | TaxonomyLeafRow['category']) =>
      [category.name, category.description, category.source]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));

    const parents = taxonomy.parents
      .map((row) => {
        let leaves = row.leaves;
        if (q) {
          const parentMatch = matchesCategory(row.category);
          leaves = row.leaves.filter((leaf) => parentMatch || matchesCategory(leaf.category));
          if (!parentMatch && leaves.length === 0) return null;
          return { ...row, leaves: parentMatch ? row.leaves : leaves };
        }
        return { ...row, leaves };
      })
      .filter((row): row is TaxonomyParentRow => row != null);

    let orphanLeaves = taxonomy.orphanLeaves;
    if (q) {
      orphanLeaves = orphanLeaves.filter((leaf) => matchesCategory(leaf.category));
    }

    return { ...taxonomy, parents, orphanLeaves };
  }, [taxonomy, q]);

  const data = filtered ?? taxonomy;
  const { topicParents, pipelineParents } = splitTaxonomyParents(data?.parents ?? []);
  const orphanLeaves = data?.orphanLeaves ?? [];
  const hasTaxonomyRows =
    (data?.parents.length ?? 0) > 0 || orphanLeaves.length > 0;

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

      {data && (
        <div className="ui-taxonomy__summary">
          <span>
            <strong>{data.totals.parents}</strong> parent categories
          </span>
          <span>
            <strong>{data.totals.leaves}</strong> child categories
          </span>
          <span>
            <strong>{data.totals.itemsWithPrimary}</strong> bookmarks assigned
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
            placeholder="Search categories…"
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

      {loading && !data ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>Loading categories…</p>
      ) : !hasTaxonomyRows ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
          {taxonomy
            ? q
              ? 'No categories match your filter.'
              : 'The starter categories are still loading. Reopen this view if they do not appear shortly.'
            : 'Loading categories…'}
        </p>
      ) : (
        <div className="ui-taxonomy__browser" data-refreshing={refreshing ? 'true' : 'false'}>
          <div className="ui-taxonomy__section-heading">
            <div>
              <h3>Topic hierarchy</h3>
              <p>Parent categories contain the child categories used to organize bookmarks.</p>
            </div>
            <span>{topicParents.length} parents</span>
          </div>
          <div className="ui-taxonomy__groups">
          {topicParents.map((row) => (
            <CategoryGroup
              key={row.category.id}
              row={row}
              onBrowse={onBrowseCategory}
            />
          ))}
          </div>

          {pipelineParents.length > 0 ? (
            <PageStatusCategories
              parents={pipelineParents}
              onBrowse={onBrowseCategory}
            />
          ) : null}

          {orphanLeaves.length > 0 && (
            <section className="ui-taxonomy__orphans">
              <div className="ui-taxonomy__section-heading">
                <div>
                  <h3>Categories without a parent</h3>
                  <p>These categories are part of the hierarchy but are not attached to a parent yet.</p>
                </div>
                <span>{orphanLeaves.length} categories</span>
              </div>
              <div className="ui-taxonomy__children ui-taxonomy__children--standalone">
                {orphanLeaves.map((leaf) => (
                  <CategoryLeaf key={leaf.category.id} leaf={leaf} onBrowse={onBrowseCategory} />
                ))}
              </div>
            </section>
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

function PageStatusCategories({
  parents,
  onBrowse,
}: {
  parents: TaxonomyParentRow[];
  onBrowse?: (categoryId: string, name: string) => void;
}) {
  return (
    <section className="ui-taxonomy__status-section">
      <div className="ui-taxonomy__section-heading">
        <div>
          <h3>Page status hierarchy</h3>
          <p>Non-topic categories for broken, low-content, redirected, or sign-in-only pages.</p>
        </div>
        <span>{parents.length} {parents.length === 1 ? 'parent' : 'parents'}</span>
      </div>
      <div className="ui-taxonomy__groups">
        {parents.map((row) => (
          <CategoryGroup key={row.category.id} row={row} variant="status" onBrowse={onBrowse} />
        ))}
      </div>
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
    <section className="ui-taxonomy__group" data-variant={variant}>
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
      onClick={() => onBrowse(leaf.category.id, leaf.category.name)}
    >
      {content}
    </button>
  ) : (
    <div className="ui-taxonomy__leaf">{content}</div>
  );
}
