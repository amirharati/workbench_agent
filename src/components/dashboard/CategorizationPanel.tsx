import { useCallback, useEffect, useState } from 'react';
import { Tags, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  ensurePendingClassifySignals,
  getAiCategories,
  getAiLinksForItem,
  getAiSignal,
  getCategorizationQueueStats,
  getDiscoverPoolStats,
  getScopedCategorizationStats,
  getTaxonomyState,
  importSeedTaxonomy,
  ensureSeedTaxonomy,
} from '../../lib/categorization';
import { ClassifyQueueReasonBlock } from './ClassifyQueueReasonBlock';
import { assessCategorizationEligibility } from '../../lib/enrichment/categorizationEligibility';
import { getEnrichment } from '../../lib/enrichment/storage';
import { getAllItems, getItem } from '../../lib/db';
import { loadItemIdsForPipelineQueue, pipelineProgressBar } from '../../lib/pipeline';
import { runPipelineActionOnOffscreen } from '../../lib/pipeline/offscreenPipelineClient';
import {
  clearPipelineData,
  syncClassifySignalsFromLinks,
} from '../../lib/enrichment';
import type {
  CategorizationQueueStats,
  ClassifyProgressUpdate,
  DiscoverBatchResult,
  DiscoverRunSummary,
  ScopedCategorizationStats,
} from '../../lib/categorization';
import type { TopicClassifyResult } from '../../lib/categorization/types';
import { HubActionConfirmModal } from './HubActionConfirmModal';
import { CategoryChip } from '../shared/CategoryReviewRows';

export type CategorizationPanelProps = {
  /** Items with AI summary in enrichment Results list. */
  scopedItemIds?: string[];
  scopeLabel?: string;
  /** Called after classify/discover/import finishes (e.g. refresh dev lists). */
  onPipelineComplete?: () => void;
  /** Start collapsed so the bookmark list stays visible (Enrichment Results). */
  defaultCollapsed?: boolean;
};

/** Run categorization on enriched bookmarks (Enrichment → Results only). */
export function CategorizationPanel({
  scopedItemIds,
  scopeLabel = 'results',
  onPipelineComplete,
  defaultCollapsed = false,
}: CategorizationPanelProps = {}) {
  const scopeCount = scopedItemIds?.length ?? 0;
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ClassifyProgressUpdate | null>(null);
  const [result, setResult] = useState<TopicClassifyResult | null>(null);
  const [discoverResult, setDiscoverResult] = useState<DiscoverBatchResult | null>(null);
  const [queue, setQueue] = useState<CategorizationQueueStats | null>(null);
  const [discoverPool, setDiscoverPool] = useState<DiscoverRunSummary | null>(null);
  const [scoped, setScoped] = useState<ScopedCategorizationStats | null>(null);
  const [taxonomyVersion, setTaxonomyVersion] = useState<number | null>(null);
  const [lastDiscoverRun, setLastDiscoverRun] = useState<
    import('../../lib/categorization/types').DiscoverRunSnapshot | null | undefined
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [autoDiscover, setAutoDiscover] = useState(true);
  const [maxDiscoverBatches, setMaxDiscoverBatches] = useState(2);
  const [maxItems, setMaxItems] = useState(() =>
    scopeCount > 0 ? Math.min(scopeCount, 200) : 100
  );
  const [runConfirm, setRunConfirm] = useState<'retry-manual' | 'force' | null>(null);

  useEffect(() => {
    if (scopeCount > 0) setMaxItems((prev) => Math.min(prev, scopeCount));
  }, [scopeCount]);

  const loadStats = useCallback(async () => {
    try {
      await ensurePendingClassifySignals();
      const [stats, meta, scopeStats, poolStats] = await Promise.all([
        getCategorizationQueueStats(),
        getTaxonomyState(),
        scopedItemIds?.length
          ? getScopedCategorizationStats(scopedItemIds)
          : Promise.resolve(null),
        getDiscoverPoolStats(scopedItemIds?.length ? scopedItemIds : undefined),
      ]);
      setQueue(stats);
      setScoped(scopeStats);
      setDiscoverPool(poolStats);
      setTaxonomyVersion(meta.taxonomyVersion);
      setLastDiscoverRun(meta.lastDiscoverRun);
    } catch {
      /* non-fatal */
    }
  }, [scopedItemIds]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const onCoordinatorProgress = useCallback((update: import('../../lib/pipeline').BatchDigestProgress) => {
    const bar = pipelineProgressBar(update);
    const phase: ClassifyProgressUpdate['phase'] =
      update.phase === 'prep' ? 'prepare'
        : update.phase === 'save' ? 'save'
          : update.phase === 'done' ? 'done'
            : update.phase === 'discover' ? 'discover'
              : 'classify';
    setProgress({ ...update, phase, current: bar.current, total: bar.total });
  }, []);

  const resolveClassifyIds = async (
    mode: 'pending' | 'batch' | 'force' | 'manual',
    limit: number
  ): Promise<string[]> => {
    if (scopedItemIds?.length) return scopedItemIds.slice(0, limit);
    if (mode === 'force') {
      return (await getAllItems()).filter((item) => item.url?.trim()).slice(0, limit).map((item) => item.id);
    }
    return (await loadItemIdsForPipelineQueue(mode === 'manual' ? 'manual_review' : 'pending_classify'))
      .slice(0, limit);
  };

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
      onPipelineComplete?.();
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
      const ids = await resolveClassifyIds(mode, limit);
      const batch = await runPipelineActionOnOffscreen('classify', ids, {
        classify: true,
        forceReclassify: mode === 'force',
        onProgress: onCoordinatorProgress,
      });
      const r: TopicClassifyResult = {
        summary: batch.classifySummary ?? {
          totalConsidered: 0, processed: 0, skippedIneligible: 0, skippedHash: 0,
          skippedLlm: 0, skippedManualReview: 0, assignedPrimary: 0,
          classifiedSpecific: 0, classifiedGeneral: 0, classifiedRemoval: 0,
          assignedSecondary: 0, multiLabel: 0, unassigned: 0, pendingDiscover: 0,
          llmErrors: 0, batches: 0, failureBuckets: {},
          inputQuality: { high: 0, medium: 0, low: 0 },
        },
        categories: [],
      };
      setResult(r);
      if (autoDiscover && r.summary.pendingDiscover > 0) {
        const discovered = await runPipelineActionOnOffscreen('discover', ids, {
          discoverStuckOnly: true,
          discoverMaxBatches: maxDiscoverBatches,
          onProgress: onCoordinatorProgress,
        });
        setDiscoverResult(discovered.discoverResult ?? null);
        if ((discovered.discoverResult?.newLeaves ?? 0) > 0) {
          const retried = await runPipelineActionOnOffscreen('classify', ids, {
            classify: true,
            forceReclassify: true,
            onProgress: onCoordinatorProgress,
          });
          if (retried.classifySummary) setResult({ summary: retried.classifySummary, categories: [] });
        }
      }
      if (r.summary.processed === 0 && r.summary.batches === 0) {
        setInfo(
          mode === 'force'
            ? 'Nothing eligible to re-classify in this scope.'
            : 'Nothing left to classify — all AI-ready items in this list already have a topic (use Re-classify all to redo LLM).'
        );
      } else {
        setInfo(
          `Done: ${r.summary.processed} LLM · ${r.summary.skippedHash} skipped unchanged · ` +
            `${r.summary.classifiedSpecific} specific · ${r.summary.classifiedGeneral} general · ` +
            `${r.summary.unassigned} unassigned · ${r.summary.batches} batches`
        );
      }
    });

  const handleDiscoverStuck = (andClassify: boolean) =>
    runWithProgress('Discover', async () => {
      setDiscoverResult(null);
      const discovered = await runPipelineActionOnOffscreen('discover', scopedItemIds ?? [], {
        discoverStuckOnly: true,
        discoverMaxBatches: maxDiscoverBatches,
        onProgress: onCoordinatorProgress,
      });
      const d = discovered.discoverResult;
      if (!d) throw new Error('Taxonomy discovery completed without a result');
      setDiscoverResult(d);
      const s = d.summary;
      if (d.newParents || d.newLeaves) {
        let msg =
          `Discover (gap-fill): ${s?.itemsSampled ?? d.itemsSampled} stuck sampled · ` +
          `+${d.newParents} parents · +${d.newLeaves} leaves · ` +
          `${s?.itemsMarkedForReclassify ?? 0} queued reclassify`;
        if (andClassify && (d.shouldReclassify || d.newLeaves)) {
          const classifyIds = d.sampledItemIds?.length
            ? d.sampledItemIds
            : d.reclassifyItemIds ?? [];
          const classified = await runPipelineActionOnOffscreen('classify', classifyIds, {
            classify: true,
            forceReclassify: true,
            onProgress: onCoordinatorProgress,
          });
          const r: TopicClassifyResult = {
            summary: classified.classifySummary!,
            categories: [],
          };
          setResult(r);
          msg +=
            ` · classify: ${r.summary.processed} LLM · ${r.summary.classifiedSpecific} specific`;
        }
        setInfo(msg);
      } else {
        const parts = [
          `${s?.stuckPool ?? discoverPool?.stuckPool ?? 0} stuck in pool`,
          `${d.itemsSampled} sampled`,
          `${d.discoverBatches} batches`,
        ];
        if (d.proposedParents || d.proposedLeaves) {
          parts.push(`proposed ${d.proposedParents}/${d.proposedLeaves} (duplicates)`);
        } else if (d.llmErrors) {
          parts.push(`${d.llmErrors} batch error(s)`);
        } else if ((s?.stuckPool ?? 0) < 3) {
          parts.push('need ≥3 stuck items');
        } else {
          parts.push('0 new labels');
        }
        setInfo(`Discover: ${parts.join(' · ')}`);
        if (d.batchErrors?.length) setError(d.batchErrors.join('; '));
      }
    });

  const handleRetryManualReview = () =>
    runWithProgress('Retry manual review', async () => {
      const n = queue?.manualReview ?? 0;
      const ids = await resolveClassifyIds('manual', scopedItemIds?.length ? scopedItemIds.length : n || maxItems);
      const classified = await runPipelineActionOnOffscreen('classify', ids, {
        classify: true,
        retryManualReview: true,
        forceReclassify: true,
        onProgress: onCoordinatorProgress,
      });
      const r: TopicClassifyResult = { summary: classified.classifySummary!, categories: [] };
      setResult(r);
      setInfo(
        `Manual review retry: ${r.summary.processed} LLM · ${r.summary.classifiedSpecific} specific · ` +
          `${r.summary.skippedManualReview} still skipped`
      );
    });

  const pct =
    progress && progress.total > 0
      ? Math.round((Math.min(progress.current, progress.total) / progress.total) * 100)
      : 0;

  const leafCount = queue?.leafCount ?? 0;
  const needsSeed = leafCount === 0;

  return (
    <>
      <style>{`@keyframes wb-spin { to { transform: rotate(360deg); } }`}</style>
    <div
      style={{
        padding: expanded ? '10px 16px' : '8px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: expanded ? 8 : 0 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 'var(--dev-fs-base)' }}>Step 3 — Categorize topics</strong>
            {!expanded ? (
              <span style={{ fontSize: 'var(--dev-fs-sm)', color: 'var(--text-muted)' }}>
                · {scoped?.needsClassify ?? queue?.pendingClassify ?? 0} ready to classify
                {queue ? ` · ${queue.pendingClassify} pending (library)` : ''}
              </span>
            ) : null}
          </div>
          {expanded ? (
          <p style={{ margin: '4px 0 0', fontSize: 'var(--dev-fs-sm)', color: 'var(--text-muted)' }}>
            Assigns each bookmark to a <strong>parent domain + leaf topic</strong> (seed ~9 parents /
            ~40 topics). <strong>Classify</strong> assigns topics; <strong>Discover</strong> adds new
            labels when items are stuck on <strong>Other / *-general</strong> or unassigned (gap-fill
            mode). Not failed fetch or missing AI text. API key in{' '}
            <strong>Settings → AI</strong>.
          </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            fontSize: 'var(--dev-fs-sm)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--bg)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {expanded ? (
            <>
              <ChevronUp size={14} /> Hide
            </>
          ) : (
            <>
              <ChevronDown size={14} /> Show pipeline
            </>
          )}
        </button>
      </div>

      {expanded ? (
      <>
      <p style={{ margin: '0 0 4px', fontSize: 'var(--dev-fs-sm)' }}>
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
      <p style={{ margin: '0 0 8px', fontSize: 'var(--dev-fs-sm)', color: 'var(--text-muted)' }}>
        Taxonomy: v{taxonomyVersion ?? '—'} · <strong>{leafCount}</strong> topic labels
        {queue ? (
          <>
            {' '}
            (library-wide: {queue.classified + queue.classifiedGeneral} classified ·{' '}
            {queue.classified} specific · {queue.classifiedGeneral} general ·{' '}
            {queue.unassignedEligible} unassigned · {queue.manualReview} manual review)
          </>
        ) : null}
        {needsSeed ? (
          <span style={{ color: 'var(--er-warn, #d29922)' }}> — import seed first</span>
        ) : null}
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)' }}>
        Left filters (ok / failed / other) are <strong>fetch</strong> status, not topics. Use{' '}
        <strong>No topic</strong> below to see uncategorized items.
      </p>

      {(queue || discoverPool) && (
        <div
          style={{
            marginBottom: 10,
            padding: '8px 10px',
            borderRadius: 6,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            fontSize: 'var(--dev-fs-caption)',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: 'var(--text)', fontSize: 'var(--dev-fs-sm)' }}>
            Pipeline stats (dev)
          </strong>
          {queue ? (
            <div style={{ marginTop: 4 }}>
              Classify: {queue.classified} specific · {queue.classifiedGeneral} general ·{' '}
              {queue.pendingDiscover} pending discover · {queue.pendingClassify} pending classify ·{' '}
              {queue.ineligible} ineligible · {queue.manualReview} manual review
            </div>
          ) : null}
          {discoverPool ? (
            <div>
              Discover pool (stuck): <strong>{discoverPool.stuckPool}</strong> — general{' '}
              {discoverPool.stuckKindBreakdown.general} · pending discover{' '}
              {discoverPool.stuckKindBreakdown.pending_discover} · unassigned{' '}
              {discoverPool.stuckKindBreakdown.unassigned} · skipped specific{' '}
              {discoverPool.skippedNotStuck}
            </div>
          ) : null}
          {queue?.lastClassifyRun ? (
            <div>
              Last classify ({new Date(queue.lastClassifyRun.at).toLocaleString()}):{' '}
              {queue.lastClassifyRun.summary.skippedHash} skipped ·{' '}
              {queue.lastClassifyRun.summary.classifiedSpecific} specific ·{' '}
              {queue.lastClassifyRun.summary.classifiedGeneral} general
            </div>
          ) : null}
          {lastDiscoverRun ? (
            <div>
              Last discover ({new Date(lastDiscoverRun.at).toLocaleString()}): +{' '}
              {lastDiscoverRun.summary.newLeaves} leaves · {lastDiscoverRun.summary.itemsSampled}{' '}
              sampled · {lastDiscoverRun.summary.itemsMarkedForReclassify} reclassify queued
            </div>
          ) : null}
        </div>
      )}

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
            role="progressbar"
            aria-label={progress?.label ?? 'Classification progress'}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
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
          <p style={{ margin: 0, fontSize: 'var(--dev-fs-sm)', color: 'var(--text)' }}>
            {progress?.label ?? 'Working…'}
            {progress && progress.total > 0 ? ` (${pct}%)` : ''}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)' }}>
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
          style={{ fontSize: 'var(--dev-fs-sm)', display: 'flex', alignItems: 'center', gap: 4 }}
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
              fontSize: 'var(--dev-fs-base)',
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
          onClick={() => setRunConfirm('force')}
          style={btnStyle()}
          title="Re-assign topics even when already classified"
        >
          Re-classify all
        </button>
        <button
          type="button"
          disabled={running || needsSeed || !(discoverPool?.stuckPool ?? 0)}
          onClick={() => void handleDiscoverStuck(true)}
          style={btnStyle()}
          title="Gap-fill discover on general/unassigned only, then reclassify sampled items"
        >
          {running ? '…' : `3. Discover stuck (${discoverPool?.stuckPool ?? 0})`}
        </button>
        <label
          className="er-field-label"
          style={{ fontSize: 'var(--dev-fs-caption)', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          disc batches
          <input
            type="number"
            className="er-field"
            min={1}
            max={8}
            value={maxDiscoverBatches}
            disabled={running}
            onChange={(e) => setMaxDiscoverBatches(Number(e.target.value) || 1)}
            style={{ width: 44, padding: '4px 6px', fontSize: 'var(--dev-fs-sm)' }}
          />
        </label>
        <button
          type="button"
          disabled={running || needsSeed || !(queue?.manualReview ?? 0)}
          onClick={() => setRunConfirm('retry-manual')}
          style={btnStyle()}
          title="Re-classify items in manual-review bucket (controlled LLM retry)"
        >
          Retry manual ({queue?.manualReview ?? 0})
        </button>
        <label
          style={{ fontSize: 'var(--dev-fs-caption)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={autoDiscover}
            disabled={running}
            onChange={(e) => setAutoDiscover(e.target.checked)}
          />
          auto-discover after classify
        </label>
      </div>

      {info && (
        <p style={{ margin: '8px 0 0', fontSize: 'var(--dev-fs-sm)', color: 'var(--er-ok, #3fb950)' }}>
          {info}
        </p>
      )}
      {error && (
        <p style={{ margin: '8px 0 0', fontSize: 'var(--dev-fs-sm)', color: 'var(--error)' }}>
          {error}
        </p>
      )}
      {result && !running && (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--dev-fs-sm)', color: 'var(--text-muted)' }}>
          Last run: {result.summary.processed} LLM · {result.summary.skippedHash} skipped (unchanged) ·{' '}
          {result.summary.classifiedSpecific} specific · {result.summary.classifiedGeneral} general ·{' '}
          {result.summary.unassigned} unassigned · {result.summary.skippedIneligible} ineligible
          {result.summary.skippedManualReview
            ? ` · ${result.summary.skippedManualReview} manual review (use CLI --retry-stuck)`
            : ''}
        </p>
      )}
      {discoverResult && !running && discoverResult.summary && (
        <p style={{ margin: '4px 0 0', fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)' }}>
          Last discover: pool {discoverResult.summary.stuckPool} · sampled{' '}
          {discoverResult.summary.itemsSampled} · +{discoverResult.newLeaves} leaves ·{' '}
          {discoverResult.summary.itemsMarkedForReclassify} reclassify queued
        </p>
      )}
      </>
      ) : null}
      {(running || info || error) && !expanded ? (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--dev-fs-sm)', color: running ? 'var(--text)' : info ? 'var(--er-ok, #3fb950)' : 'var(--error)' }}>
          {running ? progress?.label ?? 'Pipeline running…' : info ?? error}
        </p>
      ) : null}
    </div>
    {runConfirm ? (
      <HubActionConfirmModal
        title={runConfirm === 'force' ? 'Re-classify this scope?' : 'Retry manual-review items?'}
        description={runConfirm === 'force'
          ? `Topic classification will run again for up to ${scopeCount} AI-ready items, including items that already have a topic.`
          : `Classification will run again for up to ${queue?.manualReview ?? 0} manual-review items.`}
        warning="This action uses the configured AI provider and may cost money."
        confirmLabel={runConfirm === 'force' ? 'Re-classify all' : 'Retry manual review'}
        confirmVariant="warn"
        onCancel={() => setRunConfirm(null)}
        onConfirm={() => {
          const action = runConfirm;
          setRunConfirm(null);
          if (action === 'force') void handleClassify('force');
          else void handleRetryManualReview();
        }}
      />
    ) : null}
    </>
  );
}

function btnStyle(highlight = false, primary = false): React.CSSProperties {
  return {
    padding: primary ? '5px 12px' : '4px 10px',
    fontSize: 'var(--dev-fs-sm)',
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
  const [setupConfirm, setSetupConfirm] = useState<'reset' | 'clear' | null>(null);

  const refresh = useCallback(async () => {
    // The bundled taxonomy is a zero-cost local default. This is also run at
    // application startup; keeping the guard here makes this view truthful if
    // it opens before the background startup task finishes.
    await ensureSeedTaxonomy();
    const [stats, tax] = await Promise.all([getCategorizationQueueStats(), getTaxonomyState()]);
    setMeta({ version: tax.taxonomyVersion, leaves: stats.leafCount });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleImport = async () => {
    setSetupConfirm(null);
    setRunning(true);
    setMessage(null);
    try {
      const r = await importSeedTaxonomy(true);
      setMessage(`Reset to starter taxonomy v${r.taxonomyVersion}: ${r.leaves} topics.`);
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
    setSetupConfirm(null);
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
      <div style={{ fontSize: 'var(--dev-fs-base)', fontWeight: 600, marginBottom: 6 }}>
        Taxonomy
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 'var(--dev-fs-sm)', color: 'var(--text-muted)' }}>
        Homebase loads the bundled starter taxonomy automatically when a library has no topics.
        Reset is only needed when you intentionally want to discard a customized topic structure.
      </p>
      {meta && (
        <p style={{ margin: '0 0 8px', fontSize: 'var(--dev-fs-sm)' }}>
          Taxonomy v{meta.version} · {meta.leaves} topics loaded
        </p>
      )}
      <button
        type="button"
        disabled={running}
        onClick={() => setSetupConfirm('reset')}
        style={{ padding: '4px 10px', fontSize: 'var(--dev-fs-sm)' }}
      >
        {running ? 'Resetting…' : 'Reset to starter taxonomy'}
      </button>
      {message && (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--dev-fs-sm)', color: 'var(--text-muted)' }}>
          {message}
        </p>
      )}
      <p style={{ margin: '8px 0 0', fontSize: 'var(--dev-fs-caption)', color: 'var(--text-muted)' }}>
        Automatic and manual library backups include the current taxonomy, assignments, signals,
        and counts. Restoring a full backup restores that taxonomy as well.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        <button
          type="button"
          disabled={running}
          onClick={() => void repairSignals()}
          style={{ padding: '4px 10px', fontSize: 'var(--dev-fs-sm)' }}
        >
          Fix signal/link mismatch
        </button>
        <button
          type="button"
          disabled={running}
          onClick={() => setSetupConfirm('clear')}
          style={{ padding: '4px 10px', fontSize: 'var(--dev-fs-sm)', color: 'var(--error)' }}
        >
          Clear taxonomy too
        </button>
      </div>
      {setupConfirm ? (
        <HubActionConfirmModal
          title={setupConfirm === 'reset' ? 'Reset to starter taxonomy?' : 'Clear the full AI taxonomy?'}
          description={setupConfirm === 'reset'
            ? 'Custom and discovered topic definitions will be replaced by the bundled starter taxonomy.'
            : 'The taxonomy, category links, classification signals, and enrichment results will be deleted.'}
          warning={setupConfirm === 'reset'
            ? 'Full library backups preserve the current taxonomy if you need to restore it.'
            : 'Bookmarks remain, but the AI pipeline data must be rebuilt afterward.'}
          confirmLabel={setupConfirm === 'reset' ? 'Reset taxonomy' : 'Clear taxonomy and results'}
          confirmVariant={setupConfirm === 'reset' ? 'warn' : 'danger'}
          onCancel={() => setSetupConfirm(null)}
          onConfirm={() => {
            if (setupConfirm === 'reset') void handleImport();
            else void clearTaxonomyOnly();
          }}
        />
      ) : null}
    </div>
  );
}

/** Classify queue hint when item has no category links yet. */
function ItemCategoryQueueHint({ itemId }: { itemId: string }) {
  const [payload, setPayload] = useState<{
    classifyState?: import('../../lib/categorization/types').ClassifyState;
    signal?: Parameters<typeof ClassifyQueueReasonBlock>[0]['signal'];
    eligibleNow?: boolean;
    eligibilityReasonNow?: string;
  } | null>(null);

  useEffect(() => {
    void loadPayload();
  }, [itemId]);

  const loadPayload = () =>
    void (async () => {
      const [item, enrichment, signal] = await Promise.all([
        getItem(itemId),
        getEnrichment(itemId),
        getAiSignal(itemId),
      ]);
      if (!item) return;
      const eligibility = assessCategorizationEligibility(item, enrichment);
      setPayload({
        classifyState: signal?.classifyState,
        signal: signal ?? undefined,
        eligibleNow: eligibility.eligible,
        eligibilityReasonNow: eligibility.reason,
      });
    })();

  if (!payload) {
    return (
      <p style={{ fontSize: 'var(--dev-fs-sm)', color: 'var(--text-muted)', marginBottom: 12 }}>
        Loading classify status…
      </p>
    );
  }

  return (
    <ClassifyQueueReasonBlock
      compact={false}
      style={{ marginBottom: 12 }}
      itemId={itemId}
      onActionComplete={loadPayload}
      classifyState={payload.classifyState}
      signal={payload.signal}
      eligibleNow={payload.eligibleNow}
      eligibilityReasonNow={payload.eligibilityReasonNow}
    />
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
      <p style={{ fontSize: 'var(--dev-fs-sm)', color: 'var(--text-muted)', marginBottom: 12 }}>
        Loading categories…
      </p>
    );
  }

  if (!links.length) {
    return (
      <ItemCategoryQueueHint itemId={itemId} />
    );
  }

  return (
    <section style={{ marginBottom: 16 }}>
      <h3
        style={{
          margin: '0 0 8px',
          fontSize: 'var(--dev-fs-sm)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--text-muted)',
        }}
      >
        AI categories
      </h3>
      <ul style={{ margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 5, listStyle: 'none' }}>
        {links.map((l) => (
          <li key={l.categoryId}>
            <CategoryChip
              label={`${names.get(l.categoryId) ?? l.categoryId}${l.isPrimary ? ' (primary)' : ''}`}
              categoryId={l.categoryId}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
