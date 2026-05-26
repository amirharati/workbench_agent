import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tags, Loader2 } from 'lucide-react';
import {
  classifyIncremental,
  discoverBatch,
  getAiCategories,
  getAiLinksForItem,
  getCategorizationQueueStats,
  getScopedCategorizationStats,
  getTaxonomyState,
  importSeedTaxonomy,
} from '../../lib/categorization';
import {
  clearPipelineData,
  syncClassifySignalsFromLinks,
} from '../../lib/enrichment';
import type {
  CategorizationQueueStats,
  ClassifyProgressUpdate,
  ScopedCategorizationStats,
} from '../../lib/categorization';
import type { TopicClassifyResult } from '../../lib/categorization/types';

export type CategorizationPanelProps = {
  /** Items with AI summary in enrichment Results list. */
  scopedItemIds?: string[];
  scopeLabel?: string;
};

/** Run categorization on enriched bookmarks (Enrichment → Results only). */
export function CategorizationPanel({
  scopedItemIds,
  scopeLabel = 'results',
}: CategorizationPanelProps = {}) {
  const scopeCount = scopedItemIds?.length ?? 0;
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ClassifyProgressUpdate | null>(null);
  const [result, setResult] = useState<TopicClassifyResult | null>(null);
  const [queue, setQueue] = useState<CategorizationQueueStats | null>(null);
  const [scoped, setScoped] = useState<ScopedCategorizationStats | null>(null);
  const [taxonomyVersion, setTaxonomyVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [maxItems, setMaxItems] = useState(() =>
    scopeCount > 0 ? Math.min(scopeCount, 200) : 100
  );

  useEffect(() => {
    if (scopeCount > 0) setMaxItems((prev) => Math.min(prev, scopeCount));
  }, [scopeCount]);

  const loadStats = useCallback(async () => {
    try {
      const [stats, meta, scopeStats] = await Promise.all([
        getCategorizationQueueStats(),
        getTaxonomyState(),
        scopedItemIds?.length
          ? getScopedCategorizationStats(scopedItemIds)
          : Promise.resolve(null),
      ]);
      setQueue(stats);
      setScoped(scopeStats);
      setTaxonomyVersion(meta.taxonomyVersion);
    } catch {
      /* non-fatal */
    }
  }, [scopedItemIds]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const onProgress = useCallback((u: ClassifyProgressUpdate) => {
    setProgress(u);
  }, []);

  const classifyOpts = useMemo(
    () => ({
      itemIds: scopedItemIds?.length ? scopedItemIds : undefined,
      maxItems: scopedItemIds?.length ? Math.min(maxItems, scopedItemIds.length) : maxItems,
      autoDiscover: true as const,
      onProgress,
    }),
    [scopedItemIds, maxItems, onProgress]
  );

  const runWithProgress = async (label: string, fn: () => Promise<void>) => {
    setRunning(true);
    setError(null);
    setInfo(null);
    setProgress({ phase: 'prepare', label, current: 0, total: 1 });
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : label);
      setProgress(null);
    } finally {
      setRunning(false);
      await loadStats();
    }
  };

  const handleImportSeed = () =>
    runWithProgress('Import seed', async () => {
      const r = await importSeedTaxonomy(true);
      setInfo(`Imported taxonomy v${r.taxonomyVersion} (${r.parents} parents, ${r.leaves} leaves).`);
      setProgress({ phase: 'done', label: 'Seed imported', current: 1, total: 1 });
    });

  const handleClassify = (mode: 'pending' | 'batch' | 'force') =>
    runWithProgress('Classify', async () => {
      const pending = scoped?.needsClassify ?? 0;
      let limit = maxItems;
      if (mode === 'pending') {
        limit = pending > 0 ? pending : maxItems;
      } else if (mode === 'force' && scopeCount > 0) {
        limit = scopeCount;
      } else if (mode === 'batch') {
        limit = Math.min(maxItems, pending > 0 ? pending : maxItems);
      }
      const r = await classifyIncremental({
        ...classifyOpts,
        forceReclassify: mode === 'force',
        maxItems: scopedItemIds?.length ? Math.min(limit, scopedItemIds.length) : limit,
      });
      setResult(r);
      if (r.summary.processed === 0 && r.summary.batches === 0) {
        setInfo(
          mode === 'force'
            ? 'Nothing eligible to re-classify in this scope.'
            : 'Nothing left to classify — all AI-ready items in this list already have a topic (use Re-classify all to redo LLM).'
        );
      } else {
        setInfo(
          `Done: ${r.summary.processed} processed · ${r.summary.assignedPrimary} assigned · ` +
            `${r.summary.unassigned} unassigned · ${r.summary.batches} LLM batches`
        );
      }
    });

  const handleDiscover = () =>
    runWithProgress('Discover', async () => {
      const d = await discoverBatch({
        itemIds: scopedItemIds?.length ? scopedItemIds : undefined,
        onProgress,
      });
      if (d.newParents || d.newLeaves) {
        setInfo(
          `Discover scanned ${d.itemsSampled} items (${d.discoverBatches} LLM batches), ` +
            `+${d.newParents ?? 0} parents, +${d.newLeaves ?? 0} leaves. Running classify…`
        );
        const r = await classifyIncremental({ ...classifyOpts, autoDiscover: false });
        setResult(r);
        setInfo(
          `Discover + classify: ${d.itemsSampled} items · ${d.discoverBatches} batches · ` +
            `+${d.newParents ?? 0} parents · +${d.newLeaves ?? 0} leaves · ` +
            `${r.summary.assignedPrimary} newly assigned`
        );
      } else {
        const parts = [
          `${d.itemsSampled} items`,
          `${d.discoverBatches} batches`,
          `${d.taxonomyLeafCount} leaves in taxonomy`,
        ];
        if (d.proposedParents || d.proposedLeaves) {
          parts.push(
            `LLM proposed ${d.proposedParents} parents / ${d.proposedLeaves} leaves (all already exist)`
          );
        } else if (d.llmErrors) {
          parts.push(`${d.llmErrors} batch error(s) — check Settings → AI`);
        } else {
          parts.push(
            'LLM returned no new labels (catalog likely covers your corpus — see scripts/categorize/experiments/discover-*)'
          );
        }
        setInfo(`Discover: 0 added · ${parts.join(' · ')}`);
        if (d.batchErrors?.length) {
          setError(d.batchErrors.join('; '));
        }
      }
    });

  const pct =
    progress && progress.total > 0
      ? Math.round((Math.min(progress.current + 1, progress.total) / progress.total) * 100)
      : running
        ? 8
        : 0;

  const leafCount = queue?.leafCount ?? 0;
  const needsSeed = leafCount === 0;

  return (
    <>
      <style>{`@keyframes wb-spin { to { transform: rotate(360deg); } }`}</style>
    <div
      style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        {running ? (
          <Loader2
            size={16}
            style={{
              flexShrink: 0,
              marginTop: 2,
              animation: 'wb-spin 1s linear infinite',
            }}
          />
        ) : (
          <Tags size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 'var(--text-sm)' }}>Step 3 — Categorize topics</strong>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Assigns each bookmark to a <strong>parent domain + leaf topic</strong> (seed ~9 parents /
            ~40 topics). <strong>Classify</strong> assigns topics; <strong>Discover</strong> adds new
            labels when items are stuck on <strong>Other / *-general</strong> or unassigned (gap-fill
            mode). Not failed fetch or missing AI text. API key in{' '}
            <strong>Settings → AI</strong>.
          </p>
        </div>
      </div>

      <p style={{ margin: '0 0 4px', fontSize: 'var(--text-xs)' }}>
        This list ({scopeLabel}): <strong>{scopeCount}</strong> with AI summary
        {scoped ? (
          <>
            {' '}
            · <strong>{scoped.categorized}</strong> have a topic ·{' '}
            <strong style={{ color: scoped.needsClassify ? 'var(--accent)' : undefined }}>
              {scoped.needsClassify}
            </strong>{' '}
            need classify
          </>
        ) : null}
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        Taxonomy: v{taxonomyVersion ?? '—'} · <strong>{leafCount}</strong> topic labels
        {queue ? (
          <>
            {' '}
            (library-wide: {queue.classified + queue.classifiedGeneral} classified,{' '}
            {queue.unassignedEligible} unassigned)
          </>
        ) : null}
        {needsSeed ? (
          <span style={{ color: 'var(--er-warn, #d29922)' }}> — import seed first</span>
        ) : null}
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 10, color: 'var(--text-muted)' }}>
        Left filters (ok / failed / other) are <strong>fetch</strong> status, not topics. Use{' '}
        <strong>No topic</strong> below to see uncategorized items.
      </p>

      {(running || progress) && (
        <div
          style={{
            marginBottom: 10,
            padding: '8px 10px',
            borderRadius: 6,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: 'var(--border)',
              overflow: 'hidden',
              marginBottom: 6,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                background: running ? 'var(--accent, #3b82f6)' : 'var(--er-ok, #3fb950)',
                transition: 'width 0.25s ease',
              }}
            />
          </div>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text)' }}>
            {progress?.label ?? 'Working…'}
            {progress && progress.total > 0 ? ` (${pct}%)` : ''}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--text-muted)' }}>
            Each batch calls OpenRouter (up to ~90s per batch). Large lists can take several minutes —
            keep this tab open. If you see timeouts, raise <strong>Settings → AI → Timeout (ms)</strong>{' '}
            (e.g. 90000).
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          disabled={running}
          onClick={() => void handleImportSeed()}
          style={btnStyle(needsSeed)}
          title="Load categories.seed.json (first time)"
        >
          1. Import seed
        </button>
        <button
          type="button"
          disabled={running || needsSeed || !(scoped?.needsClassify ?? 0)}
          onClick={() => void handleClassify('pending')}
          style={btnStyle(false, true)}
          title="Only items without a topic yet (skips already classified)"
        >
          {running ? 'Running…' : `2. Classify pending (${scoped?.needsClassify ?? 0})`}
        </button>
        <label
          className="er-field-label"
          style={{ fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          batch
          <input
            type="number"
            className="er-field"
            min={1}
            max={scoped?.needsClassify || scopeCount || 2000}
            value={maxItems}
            disabled={running}
            onChange={(e) => setMaxItems(Number(e.target.value) || 1)}
            style={{
              width: 64,
              padding: '6px 8px',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
            }}
          />
        </label>
        <button
          type="button"
          disabled={running || needsSeed || scopeCount === 0}
          onClick={() => void handleClassify('batch')}
          style={btnStyle()}
          title="Next N items that still need a topic"
        >
          Classify N
        </button>
        <button
          type="button"
          disabled={running || needsSeed || scopeCount === 0}
          onClick={() => {
            if (
              !window.confirm(
                `Re-run topic LLM on up to ${scopeCount} AI-ready items even if they already have a topic?`
              )
            ) {
              return;
            }
            void handleClassify('force');
          }}
          style={btnStyle()}
          title="Re-assign topics even when already classified"
        >
          Re-classify all
        </button>
        <button
          type="button"
          disabled={running || needsSeed}
          onClick={() => void handleDiscover()}
          style={btnStyle()}
          title="Scan every AI-ready item in this list (50 per LLM batch), propose new parents and leaf topics, then classify"
        >
          {running ? '…' : '3. Discover'}
        </button>
      </div>

      {info && (
        <p style={{ margin: '8px 0 0', fontSize: 'var(--text-xs)', color: 'var(--er-ok, #3fb950)' }}>
          {info}
        </p>
      )}
      {error && (
        <p style={{ margin: '8px 0 0', fontSize: 'var(--text-xs)', color: 'var(--error)' }}>
          {error}
        </p>
      )}
      {result && !running && (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Last: {result.summary.processed} processed · {result.summary.assignedPrimary} primary ·{' '}
          {result.summary.unassigned} unassigned
        </p>
      )}
    </div>
    </>
  );
}

function btnStyle(highlight = false, primary = false): React.CSSProperties {
  return {
    padding: primary ? '5px 12px' : '4px 10px',
    fontSize: 'var(--text-xs)',
    fontWeight: primary || highlight ? 600 : 400,
    border: `1px solid ${highlight ? 'var(--er-warn, #d29922)' : 'var(--border)'}`,
    borderRadius: 4,
    background: primary ? 'var(--bg)' : 'var(--bg-panel)',
    cursor: 'pointer',
  };
}

/** Settings: one-time taxonomy setup + pointer to Results (no duplicate run controls). */
export function CategorizationSetupSection() {
  const [running, setRunning] = useState(false);
  const [meta, setMeta] = useState<{ version: number; leaves: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [stats, tax] = await Promise.all([getCategorizationQueueStats(), getTaxonomyState()]);
    setMeta({ version: tax.taxonomyVersion, leaves: stats.leafCount });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleImport = async () => {
    setRunning(true);
    setMessage(null);
    try {
      const r = await importSeedTaxonomy(true);
      setMessage(`Imported v${r.taxonomyVersion}: ${r.leaves} topics.`);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setRunning(false);
    }
  };

  const repairSignals = async () => {
    setRunning(true);
    setMessage(null);
    try {
      const n = await syncClassifySignalsFromLinks();
      setMessage(`Synced classify state for ${n} item(s) that already have a topic.`);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Repair failed');
    } finally {
      setRunning(false);
    }
  };

  const clearTaxonomyOnly = async () => {
    if (
      !window.confirm(
        'Delete taxonomy, all category links, signals, AND enrichments? Bookmarks stay. Re-import seed after.'
      )
    ) {
      return;
    }
    setRunning(true);
    try {
      const r = await clearPipelineData({ clearTaxonomy: true });
      setMessage(
        `Full pipeline reset: ${r.enrichmentsRemoved} enrichments, ${r.linksRemoved} links, taxonomy cleared.`
      );
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Clear failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 8,
        padding: 10,
        borderRadius: 6,
        border: '1px dashed var(--border)',
        background: 'var(--bg)',
      }}
    >
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 6 }}>
        AI categorization (setup)
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        <strong>Run classify here → Bookmarks toolbar → Results</strong> (after Enrich + AI summary).
        This section is only for loading the topic list and checking API key above.
      </p>
      {meta && (
        <p style={{ margin: '0 0 8px', fontSize: 'var(--text-xs)' }}>
          Taxonomy v{meta.version} · {meta.leaves} topics loaded
        </p>
      )}
      <button
        type="button"
        disabled={running}
        onClick={() => void handleImport()}
        style={{ padding: '4px 10px', fontSize: 'var(--text-xs)' }}
      >
        {running ? 'Importing…' : 'Import / reset seed taxonomy'}
      </button>
      {message && (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {message}
        </p>
      )}
      <p style={{ margin: '8px 0 0', fontSize: 10, color: 'var(--text-muted)' }}>
        Backups include <code>ai_categories</code>, links, signals, counts — see{' '}
        <code>_pipelineExportCounts</code> in <code>latest.json</code>.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        <button
          type="button"
          disabled={running}
          onClick={() => void repairSignals()}
          style={{ padding: '4px 10px', fontSize: 'var(--text-xs)' }}
        >
          Fix signal/link mismatch
        </button>
        <button
          type="button"
          disabled={running}
          onClick={() => void clearTaxonomyOnly()}
          style={{ padding: '4px 10px', fontSize: 'var(--text-xs)', color: 'var(--error)' }}
        >
          Clear taxonomy too
        </button>
      </div>
    </div>
  );
}

/** Show primary/secondary category links for one item in enrichment detail. */
export function ItemCategoryLinks({ itemId }: { itemId: string }) {
  const [links, setLinks] = useState<
    Array<{ categoryId: string; isPrimary: boolean; score: number }>
  >([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      const [itemLinks, cats] = await Promise.all([
        getAiLinksForItem(itemId),
        getAiCategories(),
      ]);
      const ai = itemLinks.filter((l) => l.source === 'ai' && l.status !== 'rejected');
      setNames(new Map(cats.map((c) => [c.id, c.name])));
      setLinks(
        ai
          .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || b.score - a.score)
          .map((l) => ({
            categoryId: l.categoryId,
            isPrimary: l.isPrimary,
            score: l.score,
          }))
      );
      setLoading(false);
    })();
  }, [itemId]);

  if (loading) {
    return (
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 12 }}>
        Loading categories…
      </p>
    );
  }

  if (!links.length) {
    return (
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 12 }}>
        No categories yet — use <strong>Classify pending</strong> in the bar above.
      </p>
    );
  }

  return (
    <section style={{ marginBottom: 16 }}>
      <h3
        style={{
          margin: '0 0 8px',
          fontSize: 'var(--text-xs)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--text-muted)',
        }}
      >
        AI categories
      </h3>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-sm)' }}>
        {links.map((l) => (
          <li key={l.categoryId}>
            {names.get(l.categoryId) ?? l.categoryId}
            {l.isPrimary ? ' (primary)' : ''}
          </li>
        ))}
      </ul>
    </section>
  );
}
