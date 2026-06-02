import type { Item } from '../db';
import { getDB } from '../db';
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
import type { ProcessingDigest } from './itemPipelineContext';
import { resolvePipelineStageFromParts } from './pipelineStage';
import type { AiItemSignal } from '../categorization/types';
import { primaryLeafIdFromLinks } from '../categorization/counts';
import type { AiItemCategoryLink } from '../categorization/types';

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
  statusBadge: { text: string; color: string };
  nextStep: string;
};

function buildStatusBadge(
  enrichment: ItemEnrichment | undefined,
  failureLabel: ReturnType<typeof resolveEnrichmentFailureLabel>,
  stageInput?: {
    signal?: AiItemSignal;
    primaryCategoryId?: string | null;
    suggestedLinkCount?: number;
    embedFailed?: boolean;
  }
): { text: string; color: string } {
  if (failureLabel) {
    const color =
      failureLabel.stage === 'embed'
        ? '#a371f7'
        : failureLabel.stage === 'ai' && enrichment?.status === 'ok'
          ? 'var(--er-warn, #d29922)'
          : 'var(--error, #f85149)';
    const text =
      failureLabel.stage === 'ai' && enrichment?.status === 'ok'
        ? `Fetch OK · ${FAILURE_CATEGORY_LABELS[failureLabel.category]}`
        : failureLabel.shortLabel;
    return { text, color };
  }
  if (enrichment?.pendingFetchReview) {
    return { text: 'Fetch review', color: 'var(--er-warn, #d29922)' };
  }

  const stage = resolvePipelineStageFromParts({
    enrichment,
    embedFailed: stageInput?.embedFailed,
    signal: stageInput?.signal,
    primaryCategoryId: stageInput?.primaryCategoryId,
    suggestedLinkCount: stageInput?.suggestedLinkCount,
  });

  if (stage.level === 'complete') {
    return { text: 'Enriched', color: 'var(--er-ok, #3fb950)' };
  }
  if (stage.level === 'summarized') {
    return { text: stage.label, color: 'var(--er-warn, #d29922)' };
  }
  if (stage.level === 'fetched') {
    return { text: 'Fetched', color: 'var(--text-muted)' };
  }

  const status = enrichment?.status ?? 'none';
  if (status === 'skipped') {
    return { text: 'Skipped', color: 'var(--er-warn, #d29922)' };
  }
  if (!enrichment || status === 'none') {
    return { text: 'Not enriched', color: 'var(--text-faint)' };
  }
  return { text: status, color: 'var(--text-muted)' };
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

function buildRowMetaFixed(
  enrichment: ItemEnrichment | undefined,
  embedFailed: boolean,
  stageInput?: {
    signal?: AiItemSignal;
    primaryCategoryId?: string | null;
    suggestedLinkCount?: number;
  }
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
  return {
    ...flags,
    ok: stage.level === 'complete',
    failureCategory: failureLabel?.category,
    failureStage: failureLabel?.stage,
    failureReason: failureLabel
      ? failureLabel.detail
        ? `${FAILURE_CATEGORY_LABELS[failureLabel.category]} — ${failureLabel.detail}`
        : FAILURE_CATEGORY_LABELS[failureLabel.category]
      : undefined,
    statusBadge: buildStatusBadge(enrichment, failureLabel, {
      ...stageInput,
      embedFailed,
    }),
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
    return {
      badge: 'Enriched',
      meaning: 'Fetch, AI summary, search embed, and category are all stored.',
      tryThis: 'No action required unless you want to refresh.',
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
    badge: 'Enriched',
    color: 'var(--er-ok, #3fb950)',
    meaning: 'Full pipeline: fetch + AI summary + search embed + category.',
    tryThis: 'No action required unless you want to refresh.',
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
  search: string;
  statusFilter: EnrichmentHubFilter;
  failureStageFilter: 'all' | FailureStage;
  failureCategoryFilter: 'all' | FailureCategory;
}

export function applyEnrichmentHubFilters(
  rows: EnrichmentHubRow[],
  filters: EnrichmentHubFilterState
): EnrichmentHubRow[] {
  let list = rows;
  const q = filters.search.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (r) =>
        (r.item.title || '').toLowerCase().includes(q) ||
        (r.item.url || '').toLowerCase().includes(q)
    );
  }
  if (filters.statusFilter !== 'all') {
    list = list.filter((r) => rowMatchesEnrichmentFilter(r, filters.statusFilter));
  }
  if (filters.failureStageFilter !== 'all') {
    list = list.filter((r) => r.meta.failureStage === filters.failureStageFilter);
  }
  if (filters.failureCategoryFilter !== 'all') {
    const category = filters.failureCategoryFilter;
    list = list.filter((r) => rowMatchesFailureCategory(r, category));
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

export async function loadEnrichmentHubData(
  items: Item[]
): Promise<{
  rows: EnrichmentHubRow[];
  counts: EnrichmentHubCounts;
}> {
  const [enrichments, signals, links] = await Promise.all([
    getAllEnrichments(),
    loadHubSignals(),
    loadHubPrimaryLinks(),
  ]);

  const enrichMap = new Map(enrichments.map((e) => [e.itemId, e]));
  const signalByItem = signals.byItem;
  const bookmarks = items
    .filter((i) => !!i.url?.trim() && i.deletedAt == null)
    .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));

  const rows: EnrichmentHubRow[] = bookmarks.map((item) => {
    const enrichment = enrichMap.get(item.id);
    const signal = signalByItem.get(item.id);
    const embedFailed = signal?.signalStatus === 'embed_failed';
    const itemLinks = links.get(item.id) ?? [];
    return {
      item,
      enrichment,
      embedFailed,
      meta: buildRowMetaFixed(enrichment, embedFailed, {
        signal,
        primaryCategoryId: primaryLeafIdFromLinks(itemLinks),
        suggestedLinkCount: itemLinks.filter((l) => l.status === 'suggested').length,
      }),
    };
  });

  let ok = 0;
  let failed = 0;
  let notEnriched = 0;
  let pendingFetchReview = 0;
  let skipped = 0;
  let embedFailed = 0;
  const failureByCategory: Partial<Record<FailureCategory, number>> = {};

  for (const row of rows) {
    const m = row.meta;
    if (m.ok) ok++;
    if (m.failed) {
      failed++;
      if (m.failureCategory) {
        failureByCategory[m.failureCategory] =
          (failureByCategory[m.failureCategory] ?? 0) + 1;
      }
    }
    if (m.notEnriched) notEnriched++;
    if (m.pendingFetchReview) pendingFetchReview++;
    if (m.skipped) skipped++;
    if (m.embedFailedLane) embedFailed++;
  }

  return {
    rows,
    counts: {
      digest: {
        manualReview: 0,
        suggestedCategories: 0,
        enrichFailed: failed,
        notEnriched,
        pendingClassify: 0,
        healthy: failed === 0 && notEnriched === 0,
        enrichFailedByCategory: failureByCategory,
      },
      total: rows.length,
      ok,
      failed,
      notEnriched,
      pendingFetchReview,
      skipped,
      embedFailed,
      failureByCategory,
    },
  };
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

