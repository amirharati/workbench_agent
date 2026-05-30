import { getCategorizationQueueStats, getDiscoverPoolStats } from '../categorization';
import type { TopicClassifySummary } from '../categorization/types';

/** Key hub queue counters shown before/after maintenance actions. */
export type HubQueueSnapshot = {
  pendingClassify: number;
  pendingDiscover: number;
  manualReview: number;
  classifiedGeneral: number;
  stuckPool: number;
};

export type HubQueueAction =
  | 'classify_pending'
  | 'retry_manual'
  | 'discover'
  | 'discover_classify'
  | 'category_update';

export type HubQueueOutcome = {
  action: HubQueueAction;
  before: HubQueueSnapshot;
  after: HubQueueSnapshot;
  /** Bookmarks this run attempted (selected / sampled). */
  itemsRun: number;
  batch?: Pick<
    TopicClassifySummary,
    | 'processed'
    | 'classifiedSpecific'
    | 'classifiedGeneral'
    | 'pendingDiscover'
    | 'skippedHash'
    | 'skippedManualReview'
    | 'llmErrors'
    | 'unassigned'
  >;
  discover?: {
    newLeaves: number;
    newParents: number;
    itemsSampled: number;
    itemsMarkedForReclassify: number;
  };
};

export async function loadHubQueueSnapshot(): Promise<HubQueueSnapshot> {
  const [queue, pool] = await Promise.all([
    getCategorizationQueueStats(),
    getDiscoverPoolStats(),
  ]);
  return {
    pendingClassify: queue.pendingClassify,
    pendingDiscover: queue.pendingDiscover,
    manualReview: queue.manualReview,
    classifiedGeneral: queue.classifiedGeneral,
    stuckPool: pool.stuckPool,
  };
}

function delta(before: number, after: number): number {
  return after - before;
}

function fmtDelta(n: number): string {
  if (n === 0) return '—';
  return n > 0 ? `+${n}` : `${n}`;
}

export type HubQueueMetricRow = {
  id: keyof HubQueueSnapshot;
  label: string;
  hint: string;
  before: number;
  after: number;
  change: number;
  /** Highlight as primary metric for this action. */
  primary?: boolean;
};

const METRIC_META: Record<
  keyof HubQueueSnapshot,
  { label: string; hint: string }
> = {
  pendingClassify: {
    label: 'Classify queue',
    hint: 'Waiting for topic assignment',
  },
  pendingDiscover: {
    label: 'Need discover',
    hint: 'No topic match — taxonomy gap-fill may help',
  },
  manualReview: {
    label: 'Manual review',
    hint: 'Auto-classify stopped — needs retry or force',
  },
  classifiedGeneral: {
    label: 'General / Other',
    hint: 'Broad category only',
  },
  stuckPool: {
    label: 'Discover pool (stuck)',
    hint: 'General, unassigned, or pending discover',
  },
};

function primaryMetricForAction(action: HubQueueAction): keyof HubQueueSnapshot {
  switch (action) {
    case 'retry_manual':
      return 'manualReview';
    case 'discover':
    case 'discover_classify':
    case 'category_update':
      return 'stuckPool';
    default:
      return 'pendingClassify';
  }
}

/** Plain-language notes when buckets grew (new pool items). */
export function buildPoolChangeHighlights(
  before: HubQueueSnapshot,
  after: HubQueueSnapshot
): string[] {
  const lines: string[] = [];
  const dStuck = after.stuckPool - before.stuckPool;
  const dGeneral = after.classifiedGeneral - before.classifiedGeneral;
  const dPendingDiscover = after.pendingDiscover - before.pendingDiscover;
  const dPendingClassify = after.pendingClassify - before.pendingClassify;
  const dManual = after.manualReview - before.manualReview;

  if (dGeneral > 0) {
    lines.push(
      `${dGeneral} bookmark${dGeneral === 1 ? '' : 's'} now General/Other — broad bucket, may need another update or new topics.`
    );
  }
  if (dPendingDiscover > 0) {
    lines.push(
      `${dPendingDiscover} need discover (no matching topic yet) — included in the weak/unassigned pool.`
    );
  }
  if (dPendingClassify > 0) {
    lines.push(
      `${dPendingClassify} new in classify queue (fresh signals or re-queued after discover).`
    );
  }
  if (dStuck > 0) {
    lines.push(
      `Waiting pool grew by ${dStuck} — run Update categories again when you're ready.`
    );
  }
  if (dManual > 0) {
    lines.push(`${dManual} moved to manual review — use Retry manual if you want another pass.`);
  }
  if (dStuck < 0) {
    lines.push(
      `Waiting pool shrank by ${-dStuck} — ${after.stuckPool} weak/unassigned remaining.`
    );
  }
  if (dPendingClassify < 0) {
    lines.push(`Classify queue down by ${-dPendingClassify} (${after.pendingClassify} left).`);
  }
  return lines;
}

export function buildHubQueueMetricRows(outcome: HubQueueOutcome): HubQueueMetricRow[] {
  const primary = primaryMetricForAction(outcome.action);
  return (Object.keys(METRIC_META) as Array<keyof HubQueueSnapshot>).map((id) => ({
    id,
    ...METRIC_META[id],
    before: outcome.before[id],
    after: outcome.after[id],
    change: delta(outcome.before[id], outcome.after[id]),
    primary: id === primary,
  }));
}

export function explainHubQueueOutcome(outcome: HubQueueOutcome): {
  headline: string;
  lines: string[];
  poolHighlights: string[];
} {
  const { action, before, after, itemsRun, batch, discover } = outcome;
  const lines: string[] = [];
  const poolHighlights = buildPoolChangeHighlights(before, after);

  if (action === 'category_update') {
    if (discover && discover.itemsSampled > 0) {
      lines.push(
        `Topic discovery: ${discover.itemsSampled} weak/unassigned bookmark${discover.itemsSampled === 1 ? '' : 's'}.`
      );
      if (discover.newLeaves > 0 || discover.newParents > 0) {
        lines.push(
          `Added ${discover.newParents} parent(s) and ${discover.newLeaves} new topic(s).`
        );
      }
    }
    if (batch && batch.processed > 0) {
      lines.push(
        `Classification: ${batch.classifiedSpecific} specific topic${batch.classifiedSpecific === 1 ? '' : 's'}, ${batch.classifiedGeneral} General/Other.`
      );
    } else if (!discover?.itemsSampled) {
      lines.push(`Processed ${itemsRun} bookmark${itemsRun === 1 ? '' : 's'}.`);
    }
  } else if (batch && batch.processed > 0) {
    lines.push(
      `This run: ${batch.processed} LLM call${batch.processed === 1 ? '' : 's'} on ${itemsRun} selected bookmark${itemsRun === 1 ? '' : 's'}.`
    );
    if (batch.classifiedSpecific > 0) {
      lines.push(
        `${batch.classifiedSpecific} assigned a specific topic — they leave the classify queue.`
      );
    }
    if (batch.classifiedGeneral > 0) {
      lines.push(
        `${batch.classifiedGeneral} assigned General/Other — moved to that bucket (not “done”).`
      );
    }
    if (batch.pendingDiscover > 0 || (batch.unassigned ?? 0) > 0) {
      const n = batch.pendingDiscover + (batch.unassigned ?? 0);
      lines.push(`${n} routed toward discover (no good topic yet).`);
    }
    if (batch.skippedHash > 0) {
      lines.push(`${batch.skippedHash} skipped unchanged (no LLM).`);
    }
    if (batch.llmErrors > 0) {
      lines.push(`${batch.llmErrors} LLM error(s) — may land in manual review.`);
    }
  } else if (discover) {
    lines.push(
      `Discover processed all ${discover.itemsSampled} stuck bookmark${discover.itemsSampled === 1 ? '' : 's'} in scope.`
    );
    if (discover.newLeaves > 0 || discover.newParents > 0) {
      lines.push(
        `Added ${discover.newParents} parent(s) and ${discover.newLeaves} new topic(s) to taxonomy.`
      );
    } else {
      lines.push('No new topics added this run.');
    }
    if (discover.itemsMarkedForReclassify > 0) {
      lines.push(`${discover.itemsMarkedForReclassify} queued to reclassify with new topics.`);
    }
  } else {
    lines.push(`Processed ${itemsRun} bookmark${itemsRun === 1 ? '' : 's'}.`);
  }

  const primary = primaryMetricForAction(action);
  const d = delta(before[primary], after[primary]);
  if (d === 0) {
    if (
      (action === 'discover' || action === 'discover_classify') &&
      discover &&
      discover.itemsSampled > 0
    ) {
      lines.push(
        `${METRIC_META[primary].label} still ${after[primary]} — items leave when classify assigns a specific topic (not just from discover). Check the table below.`
      );
    } else {
      lines.push(
        `${METRIC_META[primary].label} stayed at ${after[primary]} — items often move between buckets instead of disappearing. Check the table below.`
      );
    }
  } else if (d < 0) {
    lines.push(`${METRIC_META[primary].label}: ${before[primary]} → ${after[primary]} (${fmtDelta(d)}).`);
  } else {
    lines.push(
      `${METRIC_META[primary].label} went up ${before[primary]} → ${after[primary]} (+${d}) — some bookmarks entered this bucket from the batch or other activity.`
    );
  }

  const moved: string[] = [];
  for (const id of Object.keys(METRIC_META) as Array<keyof HubQueueSnapshot>) {
    if (id === primary) continue;
    const c = delta(before[id], after[id]);
    if (c !== 0) moved.push(`${METRIC_META[id].label} ${fmtDelta(c)}`);
  }
  if (moved.length) {
    lines.push(`Other buckets: ${moved.join(' · ')}.`);
  }

  const headline =
    action === 'category_update'
      ? 'Category update complete'
      : action === 'retry_manual'
        ? 'Manual review retry'
        : action === 'discover' || action === 'discover_classify'
          ? 'Discover complete'
          : 'Classify complete';

  return { headline, lines, poolHighlights };
}

export { fmtDelta };
