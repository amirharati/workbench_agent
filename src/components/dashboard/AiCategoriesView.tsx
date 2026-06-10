import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { subscribeToDataChanges } from '../../lib/dataChangeNotifier';
import {
  getTaxonomyTreeWithCounts,
  type TaxonomyLeafRow,
  type TaxonomyParentRow,
} from '../../lib/categorization/devQueries';

interface AiCategoriesViewProps {
  onBrowseCategory?: (categoryId: string, name: string) => void;
  /** When nested inside Enrichment Hub — hide page chrome. */
  embedded?: boolean;
}

const RELOAD_REASONS = new Set([
  'categorization.review',
  'categorization.update',
  'enrichment.update',
  'import.replace',
  'import.bulk',
  'pipeline.clear',
]);

export const AiCategoriesView: React.FC<AiCategoriesViewProps> = ({ onBrowseCategory, embedded = false }) => {
  const [taxonomy, setTaxonomy] = useState<Awaited<ReturnType<typeof getTaxonomyTreeWithCounts>> | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
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

    const hideEmpty = !showEmpty && !q;
    const match = (name: string) => name.toLowerCase().includes(q);

    const parents = taxonomy.parents
      .map((row) => {
        let leaves = row.leaves;
        if (q) {
          const parentMatch = match(row.category.name);
          leaves = row.leaves.filter((leaf) => parentMatch || match(leaf.category.name));
          if (!parentMatch && leaves.length === 0) return null;
          return { ...row, leaves: parentMatch ? row.leaves : leaves };
        }
        if (hideEmpty) {
          leaves = row.leaves.filter((leaf) => leaf.primaryItemCount > 0);
          if (row.primaryItemCount <= 0 && leaves.length === 0) return null;
        }
        return { ...row, leaves };
      })
      .filter((row): row is TaxonomyParentRow => row != null);

    let orphanLeaves = taxonomy.orphanLeaves;
    if (q) {
      orphanLeaves = orphanLeaves.filter((leaf) => match(leaf.category.name));
    } else if (hideEmpty) {
      orphanLeaves = orphanLeaves.filter((leaf) => leaf.primaryItemCount > 0);
    }

    return { ...taxonomy, parents, orphanLeaves };
  }, [taxonomy, q, showEmpty]);

  const data = filtered ?? taxonomy;

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
            <button
              type="button"
              onClick={() => void reload()}
              disabled={loading || refreshing}
              title="Refresh counts"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg-panel)',
                color: 'var(--text-muted)',
                fontSize: 'var(--text-xs)',
              cursor: loading || refreshing ? 'wait' : 'pointer',
              flexShrink: 0,
            }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : undefined} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 12,
            flexWrap: 'wrap',
          }}
        >
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5, flex: 1 }}>
            Browse AI-assigned topics library-wide. Counts include suggested and accepted links. Use{' '}
            <strong style={{ color: 'var(--text)' }}>Browse</strong> to filter bookmarks by topic.
          </p>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading || refreshing}
            title="Refresh counts"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-glass)',
              color: 'var(--text-muted)',
              fontSize: 'var(--text-xs)',
              cursor: loading || refreshing ? 'wait' : 'pointer',
              flexShrink: 0,
            }}
          >
            <RefreshCw size={13} className={refreshing ? 'spin' : undefined} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      )}

      {data && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: 16,
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
          }}
        >
          <span>
            <strong style={{ color: 'var(--text)' }}>{data.totals.parents}</strong> parent topics
          </span>
          <span>
            <strong style={{ color: 'var(--text)' }}>{data.totals.leaves}</strong> leaf topics
          </span>
          <span>
            <strong style={{ color: 'var(--text)' }}>{data.totals.itemsWithPrimary}</strong> bookmarks with a
            primary topic
            {data.totals.itemsWithPrimaryEnrichIncomplete > 0 ? (
              <>
                {' '}
                ·{' '}
                <strong style={{ color: 'var(--er-warn, #d29922)' }}>
                  {data.totals.itemsWithPrimaryEnrichIncomplete}
                </strong>{' '}
                topic assigned but enrich incomplete (see Enrichment tab)
              </>
            ) : null}
          </span>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: '1 1 200px',
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--input-bg)',
          }}
        >
          <Search size={16} color="var(--text-muted)" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name…"
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
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={showEmpty}
            onChange={(e) => setShowEmpty(e.target.checked)}
          />
          Show empty topics
        </label>
      </div>

      {loading && !data ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>Loading taxonomy…</p>
      ) : !data?.parents.length && !data?.orphanLeaves.length ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
          {taxonomy
            ? showEmpty || q
              ? 'No categories match your filter.'
              : 'No topics with assigned bookmarks yet. Run classify on imports, or enable Show empty topics to browse the full taxonomy.'
            : 'No AI categories yet. Import and classify bookmarks in Settings (dev setup) to build the taxonomy.'}
        </p>
      ) : (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            background: 'var(--bg-panel)',
            opacity: refreshing ? 0.72 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 8,
              padding: '8px 12px',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--text-faint)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg)',
            }}
          >
            <span style={{ flex: 1 }}>Topic</span>
            <span style={{ width: 52, textAlign: 'right' }}>Leaves</span>
            <span style={{ width: 56, textAlign: 'right' }}>Primary</span>
            <span style={{ width: 48, textAlign: 'right' }}>Total</span>
            {onBrowseCategory && <span style={{ width: 64 }} />}
          </div>

          {data.parents.map((row, i) => (
            <ParentRow
              key={row.category.id}
              row={row}
              defaultOpen={i < 2 || !!q}
              onBrowse={onBrowseCategory}
            />
          ))}

          {data.orphanLeaves.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
              <div
                style={{
                  padding: '4px 12px 8px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                }}
              >
                Other topics (no parent)
              </div>
              {data.orphanLeaves.map((leaf) => (
                <LeafRow key={leaf.category.id} leaf={leaf} onBrowse={onBrowseCategory} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function CountCell({ value, muted }: { value: number; muted?: boolean }) {
  return (
    <span
      style={{
        width: 48,
        textAlign: 'right',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        color: muted || value === 0 ? 'var(--text-faint)' : 'var(--text-muted)',
      }}
    >
      {value}
    </span>
  );
}

function BrowseButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  if (disabled) return <span style={{ width: 64 }} />;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 64,
        padding: '2px 6px',
        fontSize: 'var(--text-xs)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--accent)',
        cursor: 'pointer',
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

function ParentRow({
  row,
  defaultOpen,
  onBrowse,
}: {
  row: TaxonomyParentRow;
  defaultOpen?: boolean;
  onBrowse?: (categoryId: string, name: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen ?? row.itemCount > 0);
  const canBrowse = !!onBrowse && row.itemCount > 0;

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: open ? 'var(--accent-weak)' : 'transparent',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{
            all: 'unset',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: 1,
            cursor: 'pointer',
            minWidth: 0,
          }}
        >
          {open ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
          <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.category.name}
          </span>
        </button>
        <span style={{ width: 52, textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
          {row.childLeafCount}
        </span>
        <CountCell value={row.primaryItemCount} />
        <CountCell value={row.itemCount} muted />
        {onBrowse && (
          <BrowseButton
            label="Browse"
            disabled={!canBrowse}
            onClick={() => onBrowse(row.category.id, row.category.name)}
          />
        )}
      </div>
      {open && (
        <div style={{ paddingLeft: 20, paddingBottom: 4 }}>
          {row.leaves.map((leaf) => (
            <LeafRow key={leaf.category.id} leaf={leaf} onBrowse={onBrowse} indent />
          ))}
          {!row.leaves.length && (
            <p style={{ margin: '4px 12px', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>No leaf topics</p>
          )}
        </div>
      )}
    </div>
  );
}

function LeafRow({
  leaf,
  onBrowse,
  indent,
}: {
  leaf: TaxonomyLeafRow;
  onBrowse?: (categoryId: string, name: string) => void;
  indent?: boolean;
}) {
  const canBrowse = !!onBrowse && leaf.itemCount > 0;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: indent ? '4px 12px 4px 20px' : '6px 12px',
        fontSize: 'var(--text-sm)',
        color: leaf.primaryItemCount ? 'var(--text)' : 'var(--text-muted)',
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={leaf.category.name}
      >
        {leaf.category.isGeneralFallback ? '◦ ' : '• '}
        {leaf.category.name}
      </span>
      <span style={{ width: 52 }} />
      <CountCell value={leaf.primaryItemCount} />
      <CountCell value={leaf.itemCount} muted />
      {onBrowse && (
        <BrowseButton
          label="Browse"
          disabled={!canBrowse}
          onClick={() => onBrowse(leaf.category.id, leaf.category.name)}
        />
      )}
    </div>
  );
}
