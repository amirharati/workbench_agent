import type { Item } from '../db';
import { AI_STATUS_HINTS } from '../enrichment/errorMessages';
import type { ItemEnrichment } from '../enrichment/types';
import type { ClassifyState } from './types';

export type ClassifyPendingBlocker =
  | 'not_enriched'
  | 'fetch_failed'
  | 'fetch_review'
  | 'no_ai_summary'
  | 'quality_ineligible'
  | 'ready_for_classify'
  | 'reclassify_queued'
  | 'no_signal';

export type ClassifyBlockerFilter = 'all' | ClassifyPendingBlocker;

const BLOCKER_LABELS: Record<ClassifyPendingBlocker, string> = {
  not_enriched: 'Not fetched yet',
  fetch_failed: 'Fetch failed',
  fetch_review: 'Fetch needs review',
  no_ai_summary: 'No AI summary',
  quality_ineligible: 'Not enough text for classify',
  ready_for_classify: 'Ready to classify',
  reclassify_queued: 'Reclassify queued',
  no_signal: 'Missing classify signal',
};

const BLOCKER_HINTS: Record<ClassifyPendingBlocker, string> = {
  not_enriched: 'Run digest or re-fetch first',
  fetch_failed: 'Fix fetch or delete bookmark',
  fetch_review: 'Accept prior fetch or re-fetch',
  no_ai_summary: 'Run AI extract after fetch succeeds',
  quality_ineligible: 'Add notes, re-fetch, or re-run AI',
  ready_for_classify: 'Run classify on this item',
  reclassify_queued: 'Bookmark text changed — run classify',
  no_signal: 'Reload queue or run classify to create signal',
};

export type ClassifyQueueBlockerInfo = {
  code: ClassifyPendingBlocker;
  label: string;
  detail: string;
  hint: string;
  /** Short label for table state column */
  stateLabel: string;
};

function aiDetail(enrichment?: ItemEnrichment): string {
  const st = enrichment?.aiStatus;
  if (!st || st === 'ok') return 'AI summary not ready';
  if (st === 'not_configured') return AI_STATUS_HINTS.not_configured;
  return AI_STATUS_HINTS[st] ?? st.replace(/_/g, ' ');
}

export function resolveClassifyQueueBlocker(input: {
  item: Item;
  enrichment?: ItemEnrichment;
  classifyState?: ClassifyState;
  hasSignal: boolean;
  eligible: boolean;
  eligibilityReason?: string;
}): ClassifyQueueBlockerInfo {
  const st = input.classifyState;
  const enrichment = input.enrichment;
  const status = enrichment?.status ?? 'none';

  if (st === 'pending_reclassify') {
    return pack('reclassify_queued', 'Text or summary changed since last classification');
  }

  if (st === 'classified_general') {
    return {
      code: 'ready_for_classify',
      label: 'General / Other topic',
      detail: 'Assigned to a broad category — run discover or force reclassify for a specific topic',
      hint: 'Run discover or force reclassify',
      stateLabel: 'General / Other',
    };
  }

  if (st === 'classified_removal') {
    return {
      code: 'ready_for_classify',
      label: 'Removal candidate (broken/junk link)',
      detail: 'Classified as junk or broken — not a completed topic assignment',
      hint: 'Review for trash or re-fetch if the link is still useful',
      stateLabel: 'Removal candidate',
    };
  }

  if (st === 'classified_attention') {
    return {
      code: 'ready_for_classify',
      label: 'Login/auth required (re-fetch when signed in)',
      detail: 'Sign-in wall or auth shell — keep bookmark; re-digest after signing in',
      hint: 'Open in browser tab, sign in, then re-digest',
      stateLabel: 'Needs attention',
    };
  }

  if (st === 'ineligible') {
    return pack(
      'quality_ineligible',
      input.eligibilityReason ?? 'Failed categorization quality gate'
    );
  }

  if (!input.hasSignal && enrichment?.aiStatus === 'ok') {
    return pack('no_signal', 'Enrichment ok but classify signal row missing');
  }

  if (!enrichment || status === 'none') {
    return pack('not_enriched', 'No fetch or digest run yet');
  }

  if (status === 'failed') {
    const detail =
      enrichment.lastErrorDetail?.trim() ||
      (enrichment.lastErrorCode ? `Fetch error: ${enrichment.lastErrorCode}` : 'Fetch failed');
    return pack('fetch_failed', detail);
  }

  if (
    enrichment.pendingFetchReview &&
    enrichment.pendingFetchReviewReason !== 'url_redirect'
  ) {
    return pack(
      'fetch_review',
      enrichment.pendingFetchReviewReason?.replace(/_/g, ' ') ?? 'Suspicious re-fetch vs prior content'
    );
  }

  if (enrichment.aiStatus !== 'ok') {
    return pack('no_ai_summary', aiDetail(enrichment));
  }

  if (!input.eligible) {
    return pack(
      'quality_ineligible',
      input.eligibilityReason ?? 'Semantic text too short for classify'
    );
  }

  if (st === 'pending_classify' || !st) {
    return pack('ready_for_classify', 'AI summary ready — waiting for classify batch');
  }

  return {
    code: 'ready_for_classify',
    label: BLOCKER_LABELS.ready_for_classify,
    detail: st ? `State: ${st.replace(/_/g, ' ')}` : 'Waiting for classify',
    hint: BLOCKER_HINTS.ready_for_classify,
    stateLabel: st?.replace(/_/g, ' ') ?? 'Pending',
  };
}

function pack(code: ClassifyPendingBlocker, detail: string): ClassifyQueueBlockerInfo {
  return {
    code,
    label: BLOCKER_LABELS[code],
    detail,
    hint: BLOCKER_HINTS[code],
    stateLabel: BLOCKER_LABELS[code],
  };
}

export function classifyBlockerMatchesFilter(
  filter: ClassifyBlockerFilter,
  blocker: ClassifyPendingBlocker
): boolean {
  if (filter === 'all') return true;
  return blocker === filter;
}

/** Map pending-classify sub-filters to blocker codes. */
export function pendingSubFilterMatchesBlocker(
  filter: 'pending_not_enriched' | 'pending_no_ai' | 'pending_ready',
  blocker: ClassifyPendingBlocker
): boolean {
  switch (filter) {
    case 'pending_not_enriched':
      return blocker === 'not_enriched' || blocker === 'fetch_failed' || blocker === 'fetch_review';
    case 'pending_no_ai':
      return blocker === 'no_ai_summary';
    case 'pending_ready':
      return blocker === 'ready_for_classify';
    default:
      return false;
  }
}

const ENRICHMENT_QUEUE_BLOCKERS = new Set<ClassifyPendingBlocker>([
  'not_enriched',
  'fetch_failed',
  'fetch_review',
  'no_ai_summary',
]);

/** True when classify queue should show enrich/fetch status instead of a classify bucket name. */
export function isEnrichmentQueueBlocker(blocker: ClassifyPendingBlocker): boolean {
  return ENRICHMENT_QUEUE_BLOCKERS.has(blocker);
}

const BLOCKER_STATE_LABEL_CLASSIFY_STATES = new Set<ClassifyState>([
  'classified_general',
  'classified_removal',
  'classified_attention',
  'pending_discover',
  'manual_review',
  'ineligible',
  'skipped',
]);

export function displayClassifyStateLabel(
  classifyState: ClassifyState | undefined,
  blocker: ClassifyQueueBlockerInfo,
  enrichmentStatusLabel?: string | null
): string {
  if (enrichmentStatusLabel) return enrichmentStatusLabel;
  if (ENRICHMENT_QUEUE_BLOCKERS.has(blocker.code)) {
    return blocker.stateLabel;
  }
  if (
    classifyState === 'pending_classify' ||
    classifyState === 'pending_reclassify' ||
    !classifyState ||
    (classifyState && BLOCKER_STATE_LABEL_CLASSIFY_STATES.has(classifyState))
  ) {
    return blocker.stateLabel;
  }
  return classifyState.replace(/_/g, ' ');
}
