import type { EnrichmentHubRow } from './pipelineHubQueries';

export type HubBulkStageKey = 'fetch' | 'summarize' | 'embed' | 'classify';

export type HubBulkScopeMode = 'missing' | 'all';

export const HUB_BULK_STAGE_LABELS: Record<HubBulkStageKey, string> = {
  fetch: 'Re-fetch',
  summarize: 'Re-summarize (AI)',
  embed: 'Re-embed',
  classify: 'Classify',
};

/** Confirm before running when target count exceeds this. */
export const HUB_BULK_CONFIRM_THRESHOLD = 100;

export function hubRowNeedsFetch(row: EnrichmentHubRow): boolean {
  const e = row.enrichment;
  if (!e || e.status === 'none') return true;
  if (e.pendingFetchReview) return true;
  if (e.status === 'failed' || e.status === 'skipped') return true;
  if (row.meta.failed && row.meta.failureStage === 'fetch') return true;
  if (e.status !== 'ok') return true;
  return false;
}

export function hubRowNeedsSummarize(row: EnrichmentHubRow): boolean {
  const e = row.enrichment;
  if (!e || e.status !== 'ok') return false;
  if (e.pendingFetchReview) return false;
  if (e.aiStatus !== 'ok') return true;
  return false;
}

export function hubRowNeedsEmbed(row: EnrichmentHubRow): boolean {
  const stage = row.meta.pipelineStage;
  if (!stage.summarized) return false;
  if (row.embedFailed || row.meta.embedFailedLane) return true;
  return stage.missing.includes('embed');
}

export function hubRowNeedsClassify(row: EnrichmentHubRow): boolean {
  const stage = row.meta.pipelineStage;
  if (!stage.summarized) return false;
  if (stage.missing.includes('classify')) return true;
  const badge = row.meta.pipelineBadge;
  if (badge.label === 'Pending classify') return true;
  if (badge.kind === 'needs_review' || badge.kind === 'partial') return true;
  return !stage.classified;
}

const NEEDS_FN: Record<HubBulkStageKey, (row: EnrichmentHubRow) => boolean> = {
  fetch: hubRowNeedsFetch,
  summarize: hubRowNeedsSummarize,
  embed: hubRowNeedsEmbed,
  classify: hubRowNeedsClassify,
};

export type HubBulkStageCounts = {
  key: HubBulkStageKey;
  label: string;
  selectedTotal: number;
  missingCount: number;
  targetIds: string[];
};

/** Per-step targets only — no automatic earlier pipeline stages. */
export function resolveHubBulkTargetIds(
  rows: EnrichmentHubRow[],
  stage: HubBulkStageKey,
  mode: HubBulkScopeMode
): string[] {
  if (mode === 'all') {
    return rows.map((r) => r.item.id);
  }
  const needs = NEEDS_FN[stage];
  return rows.filter((r) => needs(r)).map((r) => r.item.id);
}

export function computeHubBulkStageCounts(
  rows: EnrichmentHubRow[],
  mode: HubBulkScopeMode
): HubBulkStageCounts[] {
  const selectedTotal = rows.length;
  return (Object.keys(HUB_BULK_STAGE_LABELS) as HubBulkStageKey[]).map((key) => {
    const targetIds = resolveHubBulkTargetIds(rows, key, mode);
    return {
      key,
      label: HUB_BULK_STAGE_LABELS[key],
      selectedTotal,
      missingCount: targetIds.length,
      targetIds,
    };
  });
}

export function itemLabelsFromRows(rows: EnrichmentHubRow[]): Record<string, string> {
  return Object.fromEntries(
    rows.map((r) => [r.item.id, r.item.title || r.item.url || r.item.id])
  );
}

export function hubRowNeedsAnyBulkStage(row: EnrichmentHubRow): boolean {
  return (
    hubRowNeedsFetch(row) ||
    hubRowNeedsSummarize(row) ||
    hubRowNeedsEmbed(row) ||
    hubRowNeedsClassify(row)
  );
}

export function countHubRowsCompleteForBulk(rows: EnrichmentHubRow[]): number {
  return rows.filter((r) => !hubRowNeedsAnyBulkStage(r)).length;
}

/** Left-to-right order when multiple steps are checked. */
export const HUB_BULK_STAGE_ORDER: HubBulkStageKey[] = [
  'fetch',
  'summarize',
  'embed',
  'classify',
];

/** Fill gaps between checked stages (fetch → summarize → embed → classify). */
export function fillPipelineGaps(
  checked: ReadonlySet<HubBulkStageKey>
): Set<HubBulkStageKey> {
  const indices = HUB_BULK_STAGE_ORDER.map((k, i) =>
    checked.has(k) ? i : -1
  ).filter((i) => i >= 0);
  if (indices.length === 0) {
    return new Set();
  }
  const min = Math.min(...indices);
  const max = Math.max(...indices);
  const filled = new Set<HubBulkStageKey>();
  for (let i = min; i <= max; i++) {
    filled.add(HUB_BULK_STAGE_ORDER[i]!);
  }
  return filled;
}

export function isGapFilledStage(
  key: HubBulkStageKey,
  userChecked: ReadonlySet<HubBulkStageKey>,
  effective: ReadonlySet<HubBulkStageKey>
): boolean {
  return effective.has(key) && !userChecked.has(key);
}

export function unionTargetIds(...lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}

/**
 * Left-to-right chain: step i runs on (items missing step i) ∪ (every item step i−1 ran on).
 * Preview and execute share this map.
 */
export function computeChainedHubBulkTargets(
  rows: EnrichmentHubRow[],
  steps: readonly HubBulkStageKey[],
  mode: HubBulkScopeMode
): Map<HubBulkStageKey, string[]> {
  const stepSet = new Set(steps);
  let carried: string[] = [];
  const out = new Map<HubBulkStageKey, string[]>();

  for (const key of HUB_BULK_STAGE_ORDER) {
    if (!stepSet.has(key)) continue;
    const stepOnly = resolveHubBulkTargetIds(rows, key, mode);
    const targetIds = unionTargetIds(stepOnly, carried);
    out.set(key, targetIds);
    carried = targetIds;
  }
  return out;
}

/** How many would run on this step if the user checks it (with current selection + gap fill). */
export function previewChainedCountIfStepChecked(
  rows: EnrichmentHubRow[],
  userChecked: ReadonlySet<HubBulkStageKey>,
  key: HubBulkStageKey,
  mode: HubBulkScopeMode
): number {
  const hypothetical = fillPipelineGaps(new Set([...userChecked, key]));
  const steps = HUB_BULK_STAGE_ORDER.filter((k) => hypothetical.has(k));
  return computeChainedHubBulkTargets(rows, steps, mode).get(key)?.length ?? 0;
}
