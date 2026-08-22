import {
  getTaxonomyState,
  getAiCategories,
  effectiveDiscoverThreshold,
  saveTaxonomyState,
} from '../categorization';
import {
  computeCategorizationQueueStats,
  computeDiscoverPoolStats,
  getPipelineCatalog,
} from './pipelineCatalog';
import { APP_DISCOVER_MAP_BATCH_SIZE, MIN_DISCOVER_POOL } from '../categorization/discoverPolicy';
import { loadAISettings } from '../ai/settings';
import { loadItemIdsForPipelineQueue } from './itemPipelineContext';
import { ensurePipelineHydrated } from '../db';

/** LLM chunk size for hub discover (v3 MAP batches; full pool across ceil(n / size) calls). */
export const HUB_DISCOVER_SAMPLE_BATCH_SIZE = APP_DISCOVER_MAP_BATCH_SIZE;
export const HUB_CLASSIFY_BATCH_SIZE = 12;
import type { CategorizationQueueStats, DiscoverRunSummary, DiscoverRunSnapshot } from '../categorization/types';
import type { AiTaxonomyState } from '../categorization/types';

export type PipelineMaintenanceBlockers = {
  needsSeed: boolean;
  needsApiKey: boolean;
  discoverCapReached: boolean;
  discoverCapMax: number;
  discoverRunsUsed: number;
};

export type PipelineMaintenanceSnapshot = {
  queue: CategorizationQueueStats;
  discoverPool: DiscoverRunSummary;
  taxonomy: AiTaxonomyState;
  leafCount: number;
  blockers: PipelineMaintenanceBlockers;
  discoverThreshold: number;
  discoverRecommended: boolean;
  lastDiscoverRun?: DiscoverRunSnapshot;
};

export type PipelineRecommendationAction =
  | 'discover'
  | 'discover_classify'
  | 'classify'
  | 'retry_manual';

export type PipelineRecommendation = {
  id: string;
  tone: 'info' | 'warn' | 'action';
  message: string;
  action?: PipelineRecommendationAction;
  actionLabel?: string;
};

export type DiscoverActionPlan = {
  scopeLabel: string;
  /** Stuck pool for this run (scoped when selection/project scope active). */
  stuckPool: number;
  /** Library-wide stuck pool when run scope is narrower (for mismatch callout). */
  libraryStuckPool?: number;
  pendingClassifyTotal: number;
  discoverBatches: number;
  /** All stuck bookmarks in scope — every one is processed this run. */
  discoverItemsProcessed: number;
  sampleBatchSize: number;
  /** Typical discover LLM calls (batch requests). */
  discoverLlmCallsTypical: number;
  andClassify: boolean;
  /** Bookmarks classify will touch after discover (same as processed when andClassify). */
  classifyItemCap: number;
  /** Rough classify LLM batch count after discover. */
  classifyLlmBatchesEstimate: number;
  /** True when classify queue is much larger than the post-discover cap. */
  skipsBulkClassifyQueue: boolean;
  stuckKindBreakdown: {
    pending_discover: number;
    general: number;
    unassigned: number;
  };
};

export type CategoryUpdatePlan = {
  scopeLabel: string;
  libraryStuckPool?: number;
  stuckPool: number;
  stuckKindBreakdown: {
    pending_discover: number;
    general: number;
    unassigned: number;
  };
  /** New / ready signals waiting for topic assignment. */
  pendingClassifyInScope: number;
  willRunDiscover: boolean;
  discoverItems: number;
  discoverBatches: number;
  /** Bookmarks that will get classify LLM (pending + discover set, approximate). */
  classifyItemsEstimate: number;
  classifyBatchesEstimate: number;
  manualReviewLibrary: number;
  sampleBatchSize: number;
};

export async function loadCategoryUpdatePlan(input: {
  snapshot: PipelineMaintenanceSnapshot;
  scopeLabel?: string;
  itemIds?: string[];
  runStuckPool?: number;
  stuckKindBreakdown?: CategoryUpdatePlan['stuckKindBreakdown'];
}): Promise<CategoryUpdatePlan> {
  const sampleBatchSize = HUB_DISCOVER_SAMPLE_BATCH_SIZE;
  const stuckPool = input.runStuckPool ?? input.snapshot.discoverPool.stuckPool;
  const kb = input.stuckKindBreakdown ?? {
    pending_discover: input.snapshot.discoverPool.stuckKindBreakdown.pending_discover,
    general: input.snapshot.discoverPool.stuckKindBreakdown.general,
    unassigned: input.snapshot.discoverPool.stuckKindBreakdown.unassigned,
  };

  let pendingIds = await loadItemIdsForPipelineQueue('pending_classify');
  if (input.itemIds?.length) {
    const scope = new Set(input.itemIds);
    pendingIds = pendingIds.filter((id) => scope.has(id));
  }

  const willRunDiscover = stuckPool >= MIN_DISCOVER_POOL;
  const discoverItems = willRunDiscover ? stuckPool : 0;
  const discoverBatches =
    discoverItems > 0 ? Math.ceil(discoverItems / sampleBatchSize) : 0;
  const classifyItemsEstimate = pendingIds.length + discoverItems;

  return {
    scopeLabel: input.scopeLabel ?? 'Entire library',
    libraryStuckPool:
      input.runStuckPool != null && input.runStuckPool !== input.snapshot.discoverPool.stuckPool
        ? input.snapshot.discoverPool.stuckPool
        : undefined,
    stuckPool,
    stuckKindBreakdown: kb,
    pendingClassifyInScope: pendingIds.length,
    willRunDiscover,
    discoverItems,
    discoverBatches,
    classifyItemsEstimate,
    classifyBatchesEstimate: Math.max(
      0,
      Math.ceil(classifyItemsEstimate / HUB_CLASSIFY_BATCH_SIZE)
    ),
    manualReviewLibrary: input.snapshot.queue.manualReview,
    sampleBatchSize,
  };
}

export function categoryUpdateBlockedReason(
  snapshot: PipelineMaintenanceSnapshot,
  plan: CategoryUpdatePlan
): string | null {
  const { blockers } = snapshot;
  if (blockers.needsSeed) return 'Import taxonomy seed first (Settings).';
  if (blockers.needsApiKey) return 'Add AI API key in Settings.';
  if (plan.pendingClassifyInScope === 0 && !plan.willRunDiscover) {
    return 'Nothing waiting in this scope — add links or change selection.';
  }
  return null;
}

export function buildDiscoverActionPlan(input: {
  snapshot: PipelineMaintenanceSnapshot;
  andClassify: boolean;
  scopeLabel?: string;
  /** Stuck pool for the bookmarks this run will consider (defaults to snapshot). */
  runStuckPool?: number;
  libraryStuckPool?: number;
  sampleBatchSize?: number;
  stuckKindBreakdown?: DiscoverActionPlan['stuckKindBreakdown'];
}): DiscoverActionPlan {
  const sampleBatchSize = input.sampleBatchSize ?? HUB_DISCOVER_SAMPLE_BATCH_SIZE;
  const stuckPool = input.runStuckPool ?? input.snapshot.discoverPool.stuckPool;
  const discoverItemsProcessed =
    stuckPool >= MIN_DISCOVER_POOL ? stuckPool : 0;
  const discoverBatches =
    discoverItemsProcessed > 0
      ? Math.ceil(discoverItemsProcessed / sampleBatchSize)
      : 0;
  const pendingClassifyTotal = input.snapshot.queue.pendingClassify;
  const classifyItemCap = input.andClassify ? discoverItemsProcessed : 0;
  const classifyLlmBatchesEstimate = input.andClassify
    ? Math.max(0, Math.ceil(classifyItemCap / HUB_CLASSIFY_BATCH_SIZE))
    : 0;
  const kb = input.stuckKindBreakdown ?? {
    pending_discover: input.snapshot.discoverPool.stuckKindBreakdown.pending_discover,
    general: input.snapshot.discoverPool.stuckKindBreakdown.general,
    unassigned: input.snapshot.discoverPool.stuckKindBreakdown.unassigned,
  };

  return {
    scopeLabel: input.scopeLabel ?? 'Entire library',
    stuckPool,
    libraryStuckPool: input.libraryStuckPool,
    pendingClassifyTotal,
    discoverBatches,
    discoverItemsProcessed,
    sampleBatchSize,
    discoverLlmCallsTypical: discoverBatches,
    andClassify: input.andClassify,
    classifyItemCap,
    classifyLlmBatchesEstimate,
    skipsBulkClassifyQueue: input.andClassify && pendingClassifyTotal > classifyItemCap,
    stuckKindBreakdown: kb,
  };
}

export async function loadPipelineMaintenanceSnapshot(opts?: {
  itemIds?: string[];
}): Promise<PipelineMaintenanceSnapshot> {
  // The maintenance counts are a projection of enrichment, signals, and
  // category links. Never treat an initial essential-only tab cache as a
  // real zero-count classification queue after reload.
  await ensurePipelineHydrated();
  const [catalog, taxonomyRaw, categories, aiSettings] = await Promise.all([
    getPipelineCatalog(),
    getTaxonomyState(),
    getAiCategories(),
    loadAISettings(),
  ]);
  const queue = computeCategorizationQueueStats(catalog, taxonomyRaw);
  const discoverPool = computeDiscoverPoolStats(
    catalog,
    opts?.itemIds?.length ? opts.itemIds : undefined
  );

  let taxonomy = taxonomyRaw;
  if (!taxonomy.bulkModeActive && taxonomy.bulkDiscoverRuns > 0) {
    await saveTaxonomyState({ bulkDiscoverRuns: 0 });
    taxonomy = { ...taxonomy, bulkDiscoverRuns: 0 };
  }

  const leafCount = categories.filter((c) => c.kind === 'leaf').length;
  const discoverThreshold = effectiveDiscoverThreshold(taxonomy);
  const bulkImportCapActive = taxonomy.bulkModeActive;
  const blockers: PipelineMaintenanceBlockers = {
    needsSeed: leafCount === 0,
    needsApiKey: !aiSettings.apiKey.trim(),
    discoverCapReached:
      bulkImportCapActive && taxonomy.bulkDiscoverRuns >= taxonomy.maxBulkDiscoverRuns,
    discoverCapMax: taxonomy.maxBulkDiscoverRuns,
    discoverRunsUsed: taxonomy.bulkDiscoverRuns,
  };

  const discoverRecommended =
    !blockers.needsSeed &&
    !blockers.needsApiKey &&
    !blockers.discoverCapReached &&
    discoverPool.stuckPool >= MIN_DISCOVER_POOL &&
    (queue.pendingDiscover >= discoverThreshold ||
      queue.classifiedGeneral >= 10 ||
      discoverPool.stuckPool >= discoverThreshold);

  return {
    queue,
    discoverPool,
    taxonomy,
    leafCount,
    blockers,
    discoverThreshold,
    discoverRecommended,
    lastDiscoverRun: taxonomy.lastDiscoverRun,
  };
}

export function getPipelineRecommendations(
  snapshot: PipelineMaintenanceSnapshot
): PipelineRecommendation[] {
  const { queue, discoverPool, blockers, discoverThreshold } = snapshot;
  const out: PipelineRecommendation[] = [];

  if (blockers.needsSeed) {
    out.push({
      id: 'needs_seed',
      tone: 'warn',
      message: 'Import taxonomy seed in Settings before classify or discover.',
    });
    return out;
  }

  if (blockers.needsApiKey) {
    out.push({
      id: 'needs_api_key',
      tone: 'warn',
      message: 'Add an AI API key in Settings to run classify or discover.',
    });
    return out;
  }

  if (
    blockers.discoverCapReached &&
    snapshot.taxonomy.bulkModeActive &&
    discoverPool.stuckPool >= MIN_DISCOVER_POOL
  ) {
    out.push({
      id: 'discover_cap',
      tone: 'info',
      message: `Bulk import auto-discover cap (${blockers.discoverRunsUsed}/${blockers.discoverCapMax} runs). Run discover manually below — no cap when you click.`,
    });
  } else if (
    discoverPool.stuckPool >= MIN_DISCOVER_POOL &&
    (queue.pendingDiscover >= discoverThreshold || queue.classifiedGeneral >= 5)
  ) {
    out.push({
      id: 'discover_recommended',
      tone: 'action',
      message: `${discoverPool.stuckPool} bookmarks stuck on General/Other or unassigned — run discover to propose new topics (uses AI, processes all stuck in scope).`,
      action: 'discover_classify',
      actionLabel: 'Review discover plan…',
    });
  } else if (discoverPool.stuckPool >= MIN_DISCOVER_POOL) {
    out.push({
      id: 'discover_available',
      tone: 'info',
      message: `${discoverPool.stuckPool} in discover pool (${queue.pendingDiscover} pending discover state).`,
      action: 'discover',
      actionLabel: 'Run discover',
    });
  }

  if (queue.pendingClassify > 0 && discoverPool.stuckPool < MIN_DISCOVER_POOL) {
    out.push({
      id: 'classify_ready',
      tone: 'info',
      message: `${queue.pendingClassify} waiting to classify.`,
      action: 'classify',
      actionLabel: 'Classify pending',
    });
  }

  if (queue.manualReview > 0) {
    out.push({
      id: 'manual_review',
      tone: 'warn',
      message: `${queue.manualReview} in manual review — retry classify if you disagree with skips.`,
      action: 'retry_manual',
      actionLabel: 'Retry manual',
    });
  }

  return out.slice(0, 2);
}

export function discoverBlockedReason(snapshot: PipelineMaintenanceSnapshot): string | null {
  const { blockers, discoverPool } = snapshot;
  if (blockers.needsSeed) return 'Import taxonomy seed first (Settings).';
  if (blockers.needsApiKey) return 'Add AI API key in Settings.';
  if (blockers.discoverCapReached && snapshot.taxonomy.bulkModeActive) {
    return 'Bulk import auto-discover cap reached — use Run discover below (manual runs are uncapped).';
  }
  if (discoverPool.stuckPool < MIN_DISCOVER_POOL) {
    return `Need at least ${MIN_DISCOVER_POOL} stuck items (have ${discoverPool.stuckPool}).`;
  }
  return null;
}
