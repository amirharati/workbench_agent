import type { Item, Collection } from '../db';
import { getDB } from '../db';
import { ensurePipelineHydrated } from '../db';
import { getAllEnrichments, type ItemEnrichment } from '../enrichment';
import { checkUrlEligibility } from '../enrichment/eligibility';
import { formatEnrichmentFailureMessage } from '../enrichment/errorMessages';
import {
  FAILURE_CATEGORY_LABELS,
  isEnrichmentFailure,
  resolveEnrichmentFailureLabel,
  type FailureCategory,
  type FailureStage,
} from '../enrichment/failureLabels';
import { primaryLeafIdFromLinks, verifiedPrimaryLeafIdFromLinks } from '../categorization/counts';
import {
  pipelineBadgeToStatusChip,
  resolvePipelineStatus,
  type PipelineBadge,
} from './pipelineBadge';
import type { ProcessingDigest } from './itemPipelineContext';
import { pipelineStatusColorForLabel } from './pipelineDictionary';
import { resolvePipelineStageFromParts, type PipelineStageInfo } from './pipelineStage';
import type { AiItemCategoryLink, AiItemSignal } from '../categorization/types';
import { itemMatchesScope } from '../shell/itemScope';

/** Rows materialized on first Hub paint; display shows HUB_DISPLAY_PAGE_SIZE at a time. */
export const HUB_DISPLAY_PAGE_SIZE = 100;
export const HUB_INITIAL_BUILD = 250;
export const HUB_BUILD_CHUNK = 200;

export type EnrichmentHubFilter =
  | 'all'
  | 'ok'
  | 'failed'
  | 'not_enriched'
  | 'pending_fetch_review'
  | 'skipped'
  | 'embed_failed';

export type EnrichmentHubRow = {
  item: Item;
  enrichment?: ItemEnrichment;
  embedFailed: boolean;
  /** Precomputed at load — avoids heavy work on every render/filter. */
  meta: EnrichmentHubRowMeta;
};

export type EnrichmentHubRowMeta = {
  ok: boolean;
  failed: boolean;
  notEnriched: boolean;
  pendingFetchReview: boolean;
  skipped: boolean;
  embedFailedLane: boolean;
  failureCategory?: FailureCategory;
  failureStage?: FailureStage;
  failureReason?: string;
  pipelineBadge: PipelineBadge;
  pipelineStage: PipelineStageInfo;
  statusBadge: { text: string; color: string };
  nextStep: string;
};

function resolveRowPipelineBadge(
  enrichment: ItemEnrichment | undefined,
  stageInput?: {
    signal?: AiItemSignal;
    primaryCategoryId?: string | null;
    verifiedPrimaryCategoryId?: string | null;
    suggestedLinkCount?: number;
    embedFailed?: boolean;
  }
): PipelineBadge {
  return resolvePipelineStatus({
    enrichment,
    embedFailed: stageInput?.embedFailed,
    signal: stageInput?.signal,
    primaryCategoryId: stageInput?.primaryCategoryId,
    verifiedPrimaryCategoryId: stageInput?.verifiedPrimaryCategoryId,
    suggestedLinkCount: stageInput?.suggestedLinkCount,
    classifyState: stageInput?.signal?.classifyState,
  });
}

function computeRowFlags(
  enrichment: ItemEnrichment | undefined,
  embedFailed: boolean
): Pick<
  EnrichmentHubRowMeta,
  'ok' | 'failed' | 'notEnriched' | 'pendingFetchReview' | 'skipped' | 'embedFailedLane'
> {
  const status = enrichment?.status ?? 'none';
  return {
    ok:
      status === 'ok' &&
      enrichment?.aiStatus === 'ok' &&
      !enrichment?.pendingFetchReview &&
      !embedFailed &&
      !isEnrichmentFailure(enrichment, embedFailed),
    failed: isEnrichmentFailure(enrichment, embedFailed) || status === 'failed',
    notEnriched: !enrichment || status === 'none',
    pendingFetchReview: enrichment?.pendingFetchReview === true,
    skipped: status === 'skipped',
    embedFailedLane: embedFailed,
  };
}

export type HubStatusStageInput = {
  signal?: AiItemSignal;
  primaryCategoryId?: string | null;
  verifiedPrimaryCategoryId?: string | null;
  suggestedLinkCount?: number;
};

function buildRowMetaFixed(
  enrichment: ItemEnrichment | undefined,
  embedFailed: boolean,
  stageInput?: HubStatusStageInput
): EnrichmentHubRowMeta {
  const failureLabel = enrichment
    ? resolveEnrichmentFailureLabel(enrichment, embedFailed)
    : null;
  const flags = computeRowFlags(enrichment, embedFailed);
  const stage = resolvePipelineStageFromParts({
    enrichment,
    embedFailed,
    signal: stageInput?.signal,
    primaryCategoryId: stageInput?.primaryCategoryId,
    suggestedLinkCount: stageInput?.suggestedLinkCount,
  });
  const pipelineBadge = resolveRowPipelineBadge(enrichment, {
    ...stageInput,
    embedFailed,
  });
  const statusBadge = pipelineBadgeToStatusChip(pipelineBadge, enrichment);
  return {
    ...flags,
    ok: pipelineBadge.kind === 'verified' || pipelineBadge.kind === 'ready',
    failureCategory: failureLabel?.category,
    failureStage: failureLabel?.stage,
    failureReason: failureLabel
      ? failureLabel.detail
        ? `${FAILURE_CATEGORY_LABELS[failureLabel.category]} — ${failureLabel.detail}`
        : FAILURE_CATEGORY_LABELS[failureLabel.category]
      : undefined,
    pipelineBadge,
    pipelineStage: stage,
    statusBadge,
    nextStep: describeEnrichmentNextStep(enrichment, embedFailed, stage),
  };
}

export type EnrichmentHubCounts = {
  digest: ProcessingDigest;
  total: number;
  ok: number;
  failed: number;
  notEnriched: number;
  pendingFetchReview: number;
  skipped: number;
  embedFailed: number;
  failureByCategory: Partial<Record<FailureCategory, number>>;
};

export function describeEnrichmentNextStep(
  enrichment: ItemEnrichment | undefined,
  embedFailed: boolean,
  stage?: ReturnType<typeof resolvePipelineStageFromParts>
): string {
  if (embedFailed) {
    return 'Embed failed — run Re-embed';
  }
  if (!enrichment || enrichment.status === 'none') {
    return 'Not enriched — run digest';
  }
  if (enrichment.pendingFetchReview) {
    const reason = enrichment.pendingFetchReviewReason;
    return reason
      ? `Fetch review — ${reason.replace(/_/g, ' ')}`
      : 'Fetch review — accept prior or re-fetch';
  }
  if (enrichment.status === 'skipped') {
    return enrichment.lastErrorCode
      ? `Skipped — ${enrichment.lastErrorCode.replace(/_/g, ' ')}`
      : 'Skipped';
  }
  const failureLabel = resolveEnrichmentFailureLabel(enrichment, embedFailed);
  if (failureLabel) {
    return failureLabel.detail
      ? `${failureLabel.label} — ${failureLabel.detail}`
      : failureLabel.label;
  }
  if (enrichment.status === 'failed') {
    return formatEnrichmentFailureMessage(enrichment) ?? 'Fetch failed';
  }
  if (enrichment.aiStatus && enrichment.aiStatus !== 'ok' && enrichment.aiStatus !== 'not_configured') {
    return `AI — ${enrichment.aiStatus.replace(/_/g, ' ')}`;
  }
  if (stage?.level === 'complete') {
    return 'Fully enriched — fetch, summary, embed, and category';
  }
  if (stage?.level === 'summarized') {
    if (stage.missing.includes('embed') && stage.missing.includes('classify')) {
      return 'Summarized — run Classify and Re-embed';
    }
    if (stage.missing.includes('classify')) {
      return 'Summarized — run Classify';
    }
    if (stage.missing.includes('embed')) {
      return 'Summarized — run Re-embed';
    }
    return 'Summarized';
  }
  if (enrichment.status === 'ok' && enrichment.aiStatus === 'ok') {
    return 'Summarized — finish classify and embed for full enrichment';
  }
  if (enrichment.status === 'ok') {
    return 'Fetched — AI summary pending';
  }
  return enrichment.status ?? 'Unknown';
}

export type RowStatusHelp = {
  badge: string;
  meaning: string;
  detail?: string;
  tryThis: string;
};

export function describeRowStatusHelp(row: EnrichmentHubRow): RowStatusHelp {
  const { enrichment, embedFailed } = row;
  const failureLabel = enrichment
    ? resolveEnrichmentFailureLabel(enrichment, embedFailed)
    : null;

  if (failureLabel) {
    const fetchOkAiFailed =
      failureLabel.stage === 'ai' && enrichment?.status === 'ok';
    return {
      badge: fetchOkAiFailed
        ? `Fetch OK · ${FAILURE_CATEGORY_LABELS[failureLabel.category]}`
        : failureLabel.shortLabel,
      meaning: fetchOkAiFailed
        ? 'The page downloaded successfully, but AI could not produce a usable summary from the fetched text.'
        : failureLabel.label,
      detail: failureLabel.detail,
      tryThis: failureLabel.reviewHint,
    };
  }

  if (enrichment?.pendingFetchReview) {
    const reason = enrichment.pendingFetchReviewReason?.replace(/_/g, ' ') ?? 'suspicious change';
    return {
      badge: 'Fetch review',
      meaning:
        'A re-fetch looked worse or very different than the saved summary. The prior summary was kept until you review.',
      detail: `Reason: ${reason}`,
      tryThis: 'Open the page in your browser and re-digest with tab session, or force re-fetch if the new content is correct.',
    };
  }

  const status = enrichment?.status ?? 'none';
  const stage = resolvePipelineStageFromParts({
    enrichment,
    embedFailed,
  });
  if (stage.level === 'complete') {
    const verified = row.meta.pipelineBadge.kind === 'verified';
    return {
      badge: verified ? 'Verified' : 'Enriched',
      meaning: verified
        ? 'You accepted the primary category. Fetch, AI summary, embed, and classification are complete.'
        : 'AI pipeline finished (fetch, summary, embed, classify). Accept a primary category in Inspector to reach Verified.',
      tryThis: verified
        ? 'No action required unless you want to refresh or change categories.'
        : 'Open Inspector → review AI categories → accept primary.',
    };
  }
  if (stage.level === 'summarized') {
    return {
      badge: stage.label,
      meaning: 'Fetch and AI summary succeeded, but the full pipeline is not finished yet.',
      detail: stage.missing.length
        ? `Missing: ${stage.missing.map((m) => (m === 'embed' ? 'search embed' : 'category')).join(', ')}`
        : undefined,
      tryThis:
        stage.missing.includes('classify') && stage.missing.includes('embed')
          ? 'Run Classify and Re-embed from Inspector.'
          : stage.missing.includes('classify')
            ? 'Run Classify from Inspector or Pipeline Hub.'
            : 'Run Re-embed from Inspector.',
    };
  }
  if (status === 'skipped') {
    return {
      badge: 'Skipped',
      meaning: 'Enrichment was intentionally skipped for this URL (excluded type, policy, or unchanged).',
      detail: enrichment?.lastErrorCode?.replace(/_/g, ' '),
      tryThis: 'Check the URL type or use force re-fetch if you still want a summary.',
    };
  }
  if (!enrichment || status === 'none') {
    return {
      badge: 'Not enriched',
      meaning: 'This bookmark has never been through the digest pipeline (fetch + AI summary).',
      tryThis: 'Select the row and use Re-digest, or run Process not enriched from Home.',
    };
  }
  if (status === 'ok') {
    return {
      badge: 'Fetched',
      meaning: 'The page was fetched but AI summary is not ready yet (or AI is not configured).',
      tryThis: 'Add an AI key in Settings, then Re-run AI on this row.',
    };
  }
  return {
    badge: status,
    meaning: describeEnrichmentNextStep(enrichment, embedFailed),
    tryThis: 'Open Inspector for more detail, or try Re-digest.',
  };
}

export const ENRICHMENT_STATUS_GUIDE: Array<{
  badge: string;
  color: string;
  meaning: string;
  tryThis: string;
}> = [
  {
    badge: 'Verified',
    color: '#a371f7',
    meaning: 'You accepted the primary category; AI pipeline is complete.',
    tryThis: 'No action required unless you want to refresh or recategorize.',
  },
  {
    badge: 'Enriched',
    color: 'var(--er-ok, #3fb950)',
    meaning: 'AI pipeline complete (fetch + summary + embed + classify). Review categories to verify.',
    tryThis: 'Open Inspector → accept primary category when ready.',
  },
  {
    badge: 'AI categories',
    color: '#f97316',
    meaning: 'Classify produced suggestions; waiting for you to accept or change.',
    tryThis: 'Inspector → Categories → accept primary or edit.',
  },
  {
    badge: 'Summarized',
    color: 'var(--er-warn, #d29922)',
    meaning: 'Fetch and AI summary only — classify and/or embed still missing.',
    tryThis: 'Run Classify and Re-embed to reach full Enriched.',
  },
  {
    badge: 'Not enriched',
    color: 'var(--text-faint)',
    meaning: 'Never digested — no fetch or summary yet.',
    tryThis: 'Run Re-digest on selected rows.',
  },
  {
    badge: 'Fetch OK · …',
    color: 'var(--er-warn, #d29922)',
    meaning: 'Page downloaded OK, but AI extract/summary failed (empty page, login wall, API error, etc.).',
    tryThis: 'Try Re-run AI; for login walls open in browser tab first.',
  },
  {
    badge: 'Fetch · …',
    color: 'var(--error, #f85149)',
    meaning: 'The fetch step failed (network, bot block, paywall, parse empty, etc.).',
    tryThis: 'See failure type chip for specific guidance; often retry or tab session helps.',
  },
  {
    badge: 'Fetch review',
    color: 'var(--er-warn, #d29922)',
    meaning: 'Re-fetch looked suspicious vs saved summary; prior content kept.',
    tryThis: 'Review in Inspector; accept prior or force re-fetch.',
  },
  {
    badge: 'Skipped',
    color: 'var(--er-warn, #d29922)',
    meaning: 'Pipeline skipped this URL by policy or because content was unchanged.',
    tryThis: 'Force re-fetch if you still want processing.',
  },
  {
    badge: 'Embed · …',
    color: '#a371f7',
    meaning: 'Search embedding failed after enrich/classify.',
    tryThis: 'Re-digest or re-classify may rebuild the embed index.',
  },
];

export function rowMatchesEnrichmentFilter(
  row: EnrichmentHubRow,
  filter: EnrichmentHubFilter
): boolean {
  const m = row.meta;
  switch (filter) {
    case 'all':
      return true;
    case 'ok':
      return m.ok;
    case 'failed':
      return m.failed;
    case 'not_enriched':
      return m.notEnriched;
    case 'pending_fetch_review':
      return m.pendingFetchReview;
    case 'skipped':
      return m.skipped;
    case 'embed_failed':
      return m.embedFailedLane;
    default:
      return true;
  }
}

export function rowMatchesFailureCategory(
  row: EnrichmentHubRow,
  category: FailureCategory
): boolean {
  return row.meta.failureCategory === category;
}

export function rowMatchesFailureStage(row: EnrichmentHubRow, stage: FailureStage): boolean {
  return row.meta.failureStage === stage;
}

export interface EnrichmentHubFilterState {
  /** Exact row status badge label (e.g. "Summarized · no category"). */
  outcomeLabel: string | 'all';
  search?: string;
  trashSuggestionsOnly?: boolean;
}

export type HubOutcomeChipTone = 'ok' | 'error' | 'warn' | 'info' | 'neutral';

export interface HubOutcomeChip {
  label: string;
  count: number;
  tone: HubOutcomeChipTone;
  /** When set, used for chip tint (e.g. Verified purple vs Enriched green). */
  color?: string;
}

/**
 * Full pipeline status catalog — hub summary always lists these (count may be 0).
 * Matches row badges from buildStatusBadge / pipelineStage labels.
 */
export const HUB_PIPELINE_STATUS_LABELS: readonly string[] = [
  'Verified',
  'Enriched',
  'Summarized · no category',
  'Summarized · no embed',
  'Summarized · pending pipeline',
  'Summarized',
  'Pending classify',
  'Pending discover',
  'Manual review',
  'AI categories',
  'Fetched',
  'Not enriched',
  'Not processed',
  'Skipped',
  'Fetch review',
];

/** @deprecated Use HUB_PIPELINE_STATUS_LABELS */
export const HUB_OUTCOME_CHIP_ORDER = HUB_PIPELINE_STATUS_LABELS;

export function hubOutcomeToneForLabel(label: string): HubOutcomeChipTone {
  if (label === 'Verified') return 'info';
  if (label === 'Enriched') return 'ok';
  if (label === 'Not enriched' || label === 'Not processed') return 'neutral';
  if (
    label.startsWith('Fetch ·') ||
    label.startsWith('Embed ·') ||
    label.includes('failed')
  ) {
    return 'error';
  }
  if (label.startsWith('Fetch OK ·')) return 'warn';
  if (
    label.includes('no category') ||
    label.includes('no embed') ||
    label.includes('pending') ||
    label.startsWith('Pending')
  ) {
    return 'info';
  }
  if (label === 'Summarized') return 'warn';
  if (label === 'Manual review' || label === 'AI categories') return 'warn';
  if (label === 'Skipped' || label === 'Fetch review') return 'warn';
  if (label === 'Removal candidate') return 'error';
  if (label === 'Needs attention' || label === 'General / Other') return 'warn';
  return 'neutral';
}

/** Status label shown in hub table — use for chips, filters, and counts (must match). */
export function hubRowStatusLabel(row: EnrichmentHubRow): string {
  return row.meta.statusBadge.text;
}

/** Same badge text/color as the enrichment hub table (for digest batch reports). */
export function hubStatusBadgeForEnrichment(
  enrichment: ItemEnrichment | undefined,
  embedFailed: boolean,
  stageInput?: HubStatusStageInput
): { text: string; color: string } {
  return buildRowMetaFixed(enrichment, embedFailed, stageInput).statusBadge;
}

const HUB_PRIMARY_STATUS_LABELS = ['Verified', 'Enriched'] as const;

export function buildHubOutcomeChips(rows: EnrichmentHubRow[]): HubOutcomeChip[] {
  const counts = new Map<string, number>();
  const colors = new Map<string, string>();
  for (const row of rows) {
    const label = hubRowStatusLabel(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
    if (!colors.has(label)) colors.set(label, row.meta.statusBadge.color);
  }
  return buildHubOutcomeChipsFromLabelCounts(counts, colors);
}

export function buildHubOutcomeChipsFromLabelCounts(
  counts: Map<string, number>,
  colors: Map<string, string>
): HubOutcomeChip[] {
  const chipFor = (label: string, count: number): HubOutcomeChip => ({
    label,
    count,
    tone: hubOutcomeToneForLabel(label),
    color: colors.get(label) ?? pipelineStatusColorForLabel(label),
  });

  const chips: HubOutcomeChip[] = [];
  for (const label of HUB_PRIMARY_STATUS_LABELS) {
    chips.push(chipFor(label, counts.get(label) ?? 0));
    counts.delete(label);
  }

  for (const label of HUB_PIPELINE_STATUS_LABELS) {
    if ((HUB_PRIMARY_STATUS_LABELS as readonly string[]).includes(label)) continue;
    const count = counts.get(label) ?? 0;
    if (count > 0) {
      chips.push(chipFor(label, count));
      counts.delete(label);
    }
  }

  const extra = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => chipFor(label, count));

  return [...chips, ...extra];
}

export function applyEnrichmentHubFilters(
  rows: EnrichmentHubRow[],
  filters: EnrichmentHubFilterState
): EnrichmentHubRow[] {
  let list = rows;
  const q = (filters.search ?? '').trim().toLowerCase();
  if (q) {
    list = list.filter(
      (r) =>
        (r.item.title || '').toLowerCase().includes(q) ||
        (r.item.url || '').toLowerCase().includes(q)
    );
  }
  if (filters.trashSuggestionsOnly) {
    list = list.filter((r) => rowMatchesTrashSuggestion(r));
  }
  if (filters.outcomeLabel !== 'all') {
    list = list.filter((r) => hubRowStatusLabel(r) === filters.outcomeLabel);
  }
  return list;
}

export function enrichmentHubRowMatchesFilters(
  row: EnrichmentHubRow,
  filters: EnrichmentHubFilterState
): boolean {
  return applyEnrichmentHubFilters([row], filters).length > 0;
}

const NOT_FOUND_DETAIL_RE =
  /\b(?:HTTP\s*404|HTTP\s*410|404\s*[-—–]|page not found|page removed|410\s*[-—–]|gone)\b/i;

/** DNS / host-dead signals — not generic provider or CORS noise. */
const DEAD_NETWORK_DETAIL_RE =
  /\b(?:ENOTFOUND|ECONNREFUSED|ERR_NAME_NOT_RESOLVED|NXDOMAIN|could not resolve|getaddrinfo|host not found|unable to resolve|name or service not known|network is unreachable)\b/i;

const PROVIDER_NETWORK_NOISE_RE =
  /\b(?:Jina reader|reaching Jina|rate limit|CORS|Failed to fetch)\b/i;

function failureDetailText(
  enrichment: ItemEnrichment | undefined,
  failureReason?: string
): string {
  return [enrichment?.lastErrorDetail, failureReason].filter(Boolean).join(' ').trim();
}

function isNotFoundFailure(
  enrichment: ItemEnrichment | undefined,
  failureReason?: string
): boolean {
  const detail = failureDetailText(enrichment, failureReason);
  if (NOT_FOUND_DETAIL_RE.test(detail)) return true;
  if (
    enrichment?.lastErrorCode === 'parse_empty' &&
    /could not resolve t\.co/i.test(detail)
  ) {
    return true;
  }
  return false;
}

function isClearDeadNetworkFailure(
  enrichment: ItemEnrichment | undefined,
  failureReason?: string
): boolean {
  if (enrichment?.lastErrorCode !== 'network') return false;
  const detail = failureDetailText(enrichment, failureReason);
  if (!detail || PROVIDER_NETWORK_NOISE_RE.test(detail)) return false;
  return DEAD_NETWORK_DETAIL_RE.test(detail);
}

/** Short label for why this row is a trash candidate (dead link, bad URL, etc.). */
export function resolveTrashSuggestion(row: EnrichmentHubRow): string | null {
  const url = (row.item.url || '').trim();
  if (!url) return 'No URL';

  const urlCheck = checkUrlEligibility(url);
  if (!urlCheck.eligible) {
    switch (urlCheck.reason) {
      case 'invalid_url':
        return 'Invalid URL';
      case 'excluded_localhost':
        return 'Localhost URL';
      case 'no_url':
        return 'No URL';
      default:
        return null;
    }
  }

  const enrichment = row.enrichment;
  const detail = failureDetailText(enrichment, row.meta.failureReason);

  if (isNotFoundFailure(enrichment, row.meta.failureReason)) {
    if (/410|page removed|gone/i.test(detail)) return 'Page removed (410)';
    return 'Page not found (404)';
  }

  if (isClearDeadNetworkFailure(enrichment, row.meta.failureReason)) {
    return 'Site unreachable';
  }

  return null;
}

export function rowMatchesTrashSuggestion(row: EnrichmentHubRow): boolean {
  return resolveTrashSuggestion(row) != null;
}

export type EnrichmentHubIndex = {
  bookmarks: Item[];
  metaByItemId: Map<string, EnrichmentHubRowMeta>;
  enrichMap: Map<string, ItemEnrichment>;
  signalByItem: Map<string, AiItemSignal>;
  linksByItem: Map<string, AiItemCategoryLink[]>;
};

export function buildEnrichmentRowMetaForItem(
  enrichMap: Map<string, ItemEnrichment>,
  signalByItem: Map<string, AiItemSignal>,
  linksByItem: Map<string, AiItemCategoryLink[]>,
  item: Item
): EnrichmentHubRowMeta {
  const enrichment = enrichMap.get(item.id);
  const signal = signalByItem.get(item.id);
  const embedFailed = signal?.signalStatus === 'embed_failed';
  const itemLinks = linksByItem.get(item.id) ?? [];
  return buildRowMetaFixed(enrichment, embedFailed, {
    signal,
    primaryCategoryId: primaryLeafIdFromLinks(itemLinks),
    verifiedPrimaryCategoryId: verifiedPrimaryLeafIdFromLinks(itemLinks),
    suggestedLinkCount: itemLinks.filter((l) => l.status === 'suggested').length,
  });
}

function accumulateCountsFromMeta(
  meta: EnrichmentHubRowMeta,
  acc: {
    ok: number;
    failed: number;
    notEnriched: number;
    pendingFetchReview: number;
    skipped: number;
    embedFailed: number;
    failureByCategory: Partial<Record<FailureCategory, number>>;
  }
): void {
  if (meta.ok) acc.ok++;
  if (meta.failed) {
    acc.failed++;
    if (meta.failureCategory) {
      acc.failureByCategory[meta.failureCategory] =
        (acc.failureByCategory[meta.failureCategory] ?? 0) + 1;
    }
  }
  if (meta.notEnriched) acc.notEnriched++;
  if (meta.pendingFetchReview) acc.pendingFetchReview++;
  if (meta.skipped) acc.skipped++;
  if (meta.embedFailedLane) acc.embedFailed++;
}

export function buildCountsFromMetaMap(
  bookmarks: Item[],
  metaByItemId: Map<string, EnrichmentHubRowMeta>
): EnrichmentHubCounts {
  const acc = {
    ok: 0,
    failed: 0,
    notEnriched: 0,
    pendingFetchReview: 0,
    skipped: 0,
    embedFailed: 0,
    failureByCategory: {} as Partial<Record<FailureCategory, number>>,
  };
  for (const item of bookmarks) {
    const meta = metaByItemId.get(item.id);
    if (meta) accumulateCountsFromMeta(meta, acc);
  }
  const { failed, notEnriched, failureByCategory } = acc;
  return {
    digest: {
      manualReview: 0,
      suggestedCategories: 0,
      enrichFailed: failed,
      notEnriched,
      pendingClassify: 0,
      healthy: failed === 0 && notEnriched === 0,
      enrichFailedByCategory: failureByCategory,
    },
    total: bookmarks.length,
    ...acc,
  };
}

export function materializeHubRow(index: EnrichmentHubIndex, item: Item): EnrichmentHubRow {
  const enrichment = index.enrichMap.get(item.id);
  const signal = index.signalByItem.get(item.id);
  const embedFailed = signal?.signalStatus === 'embed_failed';
  const meta = index.metaByItemId.get(item.id) ?? buildEnrichmentRowMetaForItem(
    index.enrichMap,
    index.signalByItem,
    index.linksByItem,
    item
  );
  return { item, enrichment, embedFailed, meta };
}

export function scopedHubBookmarks(
  index: EnrichmentHubIndex,
  scopeProjectId: string | 'all',
  scopeCollectionId: string | 'all',
  collections: Collection[]
): Item[] {
  return index.bookmarks.filter((item) =>
    itemMatchesScope(item, scopeProjectId, scopeCollectionId, collections)
  );
}

export function materializeScopedHubRows(
  index: EnrichmentHubIndex,
  scopeProjectId: string | 'all',
  scopeCollectionId: string | 'all',
  collections: Collection[],
  offset: number,
  limit: number
): EnrichmentHubRow[] {
  const scoped = scopedHubBookmarks(index, scopeProjectId, scopeCollectionId, collections);
  return scoped.slice(offset, offset + limit).map((item) => materializeHubRow(index, item));
}

function hubIndexEntryMatchesFilters(
  index: EnrichmentHubIndex,
  item: Item,
  filters: EnrichmentHubFilterState
): boolean {
  const meta = index.metaByItemId.get(item.id);
  if (!meta) return false;
  const q = (filters.search ?? '').trim().toLowerCase();
  if (q) {
    const title = (item.title || '').toLowerCase();
    const url = (item.url || '').toLowerCase();
    if (!title.includes(q) && !url.includes(q)) return false;
  }
  if (filters.trashSuggestionsOnly && !rowMatchesTrashSuggestion(materializeHubRow(index, item))) {
    return false;
  }
  if (filters.outcomeLabel !== 'all' && meta.statusBadge.text !== filters.outcomeLabel) {
    return false;
  }
  return true;
}

export function materializeFilteredScopedHubRows(
  index: EnrichmentHubIndex,
  scopeProjectId: string | 'all',
  scopeCollectionId: string | 'all',
  collections: Collection[],
  filters: EnrichmentHubFilterState
): EnrichmentHubRow[] {
  const scoped = scopedHubBookmarks(index, scopeProjectId, scopeCollectionId, collections);
  const rows: EnrichmentHubRow[] = [];
  for (const item of scoped) {
    if (hubIndexEntryMatchesFilters(index, item, filters)) {
      rows.push(materializeHubRow(index, item));
    }
  }
  return rows;
}

export function buildHubOutcomeChipsForScope(
  index: EnrichmentHubIndex,
  scopeProjectId: string | 'all',
  scopeCollectionId: string | 'all',
  collections: Collection[],
  search?: string
): HubOutcomeChip[] {
  const counts = new Map<string, number>();
  const colors = new Map<string, string>();
  const q = (search ?? '').trim().toLowerCase();
  for (const item of scopedHubBookmarks(index, scopeProjectId, scopeCollectionId, collections)) {
    if (q) {
      const title = (item.title || '').toLowerCase();
      const url = (item.url || '').toLowerCase();
      if (!title.includes(q) && !url.includes(q)) continue;
    }
    const meta = index.metaByItemId.get(item.id);
    if (!meta) continue;
    const label = meta.statusBadge.text;
    counts.set(label, (counts.get(label) ?? 0) + 1);
    if (!colors.has(label)) colors.set(label, meta.statusBadge.color);
  }
  return buildHubOutcomeChipsFromLabelCounts(counts, colors);
}

/** Load maps + precompute per-item meta (counts/chips) without materializing every row. */
export async function loadEnrichmentHubIndex(
  items: Item[]
): Promise<{ index: EnrichmentHubIndex; counts: EnrichmentHubCounts }> {
  await ensurePipelineHydrated();
  const [enrichments, signals, links] = await Promise.all([
    getAllEnrichments(),
    loadHubSignals(),
    loadHubPrimaryLinks(),
  ]);

  const enrichMap = new Map(enrichments.map((e) => [e.itemId, e]));
  const signalByItem = signals.byItem;
  const linksByItem = links;
  const bookmarks = items
    .filter((i) => !!i.url?.trim() && i.deletedAt == null)
    .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));

  const metaByItemId = new Map<string, EnrichmentHubRowMeta>();
  for (const item of bookmarks) {
    metaByItemId.set(item.id, buildEnrichmentRowMetaForItem(enrichMap, signalByItem, linksByItem, item));
  }

  const index: EnrichmentHubIndex = {
    bookmarks,
    metaByItemId,
    enrichMap,
    signalByItem,
    linksByItem,
  };

  return {
    index,
    counts: buildCountsFromMetaMap(bookmarks, metaByItemId),
  };
}

export async function loadEnrichmentHubData(
  items: Item[],
  opts?: { rowLimit?: number }
): Promise<{
  index: EnrichmentHubIndex;
  rows: EnrichmentHubRow[];
  counts: EnrichmentHubCounts;
}> {
  const { index, counts } = await loadEnrichmentHubIndex(items);
  const limit = opts?.rowLimit ?? index.bookmarks.length;
  const rows = index.bookmarks.slice(0, limit).map((item) => materializeHubRow(index, item));
  return { index, rows, counts };
}

export async function loadEmbedFailedIds(): Promise<Set<string>> {
  const { failedIds } = await loadHubSignals();
  return failedIds;
}

async function loadHubPrimaryLinks(): Promise<Map<string, AiItemCategoryLink[]>> {
  const db = await getDB();
  const byItem = new Map<string, AiItemCategoryLink[]>();
  if (!db.objectStoreNames.contains('ai_item_category_links')) return byItem;
  const links = await db.getAll('ai_item_category_links');
  for (const link of links) {
    if (link.status !== 'suggested' && link.status !== 'accepted') continue;
    const list = byItem.get(link.itemId) ?? [];
    list.push(link);
    byItem.set(link.itemId, list);
  }
  return byItem;
}

async function loadHubSignals(): Promise<{
  byItem: Map<string, AiItemSignal>;
  failedIds: Set<string>;
}> {
  const db = await getDB();
  const byItem = new Map<string, AiItemSignal>();
  const failedIds = new Set<string>();
  if (!db.objectStoreNames.contains('ai_item_signals')) {
    return { byItem, failedIds };
  }
  const signals = await db.getAll('ai_item_signals');
  for (const s of signals) {
    byItem.set(s.itemId, s);
    if (s.signalStatus === 'embed_failed') failedIds.add(s.itemId);
  }
  return { byItem, failedIds };
}

