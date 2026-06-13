import type { EnrichmentAIStatus, EnrichmentErrorCode, ItemEnrichment } from './types';
import { describeAiFailure, describeEnrichmentError } from './errorMessages';

/** Pipeline step that failed — for bulk review filters. */
export type FailureStage = 'fetch' | 'ai' | 'embed';

/** Stable slug for grouping failures (mass review / delete). */
export type FailureCategory =
  | 'auth'
  | 'bot'
  | 'parse'
  | 'network'
  | 'rate_limit'
  | 'provider'
  | 'oversized'
  | 'excluded'
  | 'ai_short'
  | 'ai_parse'
  | 'ai_empty'
  | 'ai_api'
  | 'ai_config'
  | 'embed'
  | 'unknown';

export type EnrichmentFailureLabel = {
  stage: FailureStage;
  category: FailureCategory;
  /** Machine code: lastErrorCode or aiStatus */
  code: string;
  /** Compact badge text, e.g. "Fetch · auth" */
  shortLabel: string;
  /** Human-readable line for Inspector / review lists */
  label: string;
  detail?: string;
  /** Hint for bulk actions */
  reviewHint: string;
};

export const FAILURE_CATEGORY_LABELS: Record<FailureCategory, string> = {
  auth: 'Login / paywall',
  bot: 'Bot blocked',
  parse: 'No content extracted',
  network: 'Network / timeout',
  rate_limit: 'Rate limited',
  provider: 'Fetch provider error',
  oversized: 'Response too large',
  excluded: 'Excluded URL',
  ai_short: 'AI — text too short',
  ai_parse: 'AI — bad JSON',
  ai_empty: 'AI — no usable content',
  ai_api: 'AI — API error',
  ai_config: 'AI — not configured',
  embed: 'Embed failed',
  unknown: 'Unknown failure',
};

export const FAILURE_CATEGORY_REVIEW_HINTS: Record<FailureCategory, string> = {
  auth: 'Open page in browser tab, then re-digest — or delete if not needed',
  bot: 'Open page in browser tab (Reddit, etc.) — headless cannot fetch',
  parse: 'Page may be empty, JS-only, or wrong URL — re-digest or delete',
  network: 'Transient — retry digest later',
  rate_limit: 'Wait and retry — provider quota',
  provider: 'Check fetch provider / URL — retry or delete',
  oversized: 'Very large page — unlikely to enrich; consider delete',
  excluded: 'Non-http or blocked URL type',
  ai_short: 'Fetch returned too little text — tab session may help',
  ai_parse: 'AI response malformed — retry digest',
  ai_empty: 'Login wall or chrome only — tab session or delete',
  ai_api: 'AI provider error — check Settings > AI',
  ai_config: 'Add API key in Settings > AI',
  embed: 'Search embed failed — re-classify may fix',
  unknown: 'Inspect raw fetch or retry digest',
};

const FETCH_CATEGORY: Record<EnrichmentErrorCode, FailureCategory> = {
  auth_required: 'auth',
  bot_blocked: 'bot',
  parse_empty: 'parse',
  timeout: 'network',
  rate_limited: 'rate_limit',
  network: 'network',
  provider_error: 'provider',
  url_redirect: 'parse',
  oversized: 'oversized',
  excluded: 'excluded',
  no_backup_folder: 'provider',
};

const AI_CATEGORY: Record<EnrichmentAIStatus, FailureCategory> = {
  ok: 'unknown',
  not_configured: 'ai_config',
  content_too_short: 'ai_short',
  parse_failed: 'ai_parse',
  empty_response: 'ai_empty',
  api_error: 'ai_api',
};

function stagePrefix(stage: FailureStage): string {
  if (stage === 'fetch') return 'Fetch';
  if (stage === 'ai') return 'AI';
  return 'Embed';
}

function buildLabel(
  stage: FailureStage,
  category: FailureCategory,
  code: string,
  detail?: string
): EnrichmentFailureLabel {
  const catLabel = FAILURE_CATEGORY_LABELS[category];
  const shortCat = category.replace(/^ai_/, '');
  return {
    stage,
    category,
    code,
    shortLabel: `${stagePrefix(stage)} · ${shortCat}`,
    label: `${stagePrefix(stage)}: ${catLabel}`,
    detail: detail?.trim() || undefined,
    reviewHint: FAILURE_CATEGORY_REVIEW_HINTS[category],
  };
}

function labelForFetch(code: EnrichmentErrorCode, detail?: string): EnrichmentFailureLabel {
  const category = FETCH_CATEGORY[code] ?? 'unknown';
  const label = buildLabel('fetch', category, code, describeEnrichmentError(code, detail));
  if (code === 'url_redirect') {
    return { ...label, shortLabel: 'Fetch · redirect', label: 'Fetch: Redirect mismatch' };
  }
  if (detail === 'tweet_unavailable') {
    return {
      ...label,
      shortLabel: 'Fetch · tweet unavailable',
      label: 'Fetch: Tweet unavailable (deleted or private)',
      detail: 'This tweet was deleted, is private, or is otherwise unavailable on X',
    };
  }
  return label;
}

function labelForAi(status: EnrichmentAIStatus, detail?: string): EnrichmentFailureLabel {
  const category = AI_CATEGORY[status] ?? 'unknown';
  return buildLabel('ai', category, status, describeAiFailure(status, detail));
}

/** Resolve structured failure label from enrichment record (works on legacy rows too). */
export function resolveEnrichmentFailureLabel(
  enrichment?: Pick<
    ItemEnrichment,
    | 'status'
    | 'lastErrorCode'
    | 'lastErrorDetail'
    | 'aiStatus'
    | 'aiError'
    | 'snippet'
    | 'failureStage'
    | 'failureCategory'
  > | null,
  embedFailed?: boolean
): EnrichmentFailureLabel | null {
  if (!enrichment && !embedFailed) return null;

  if (embedFailed) {
    return buildLabel('embed', 'embed', 'embed_failed');
  }

  if (!enrichment) return null;

  const fetchFailed = enrichment.status === 'failed' && enrichment.lastErrorCode;
  const aiStatus = enrichment.aiStatus;
  const aiFailed = aiStatus && aiStatus !== 'ok' && aiStatus !== 'not_configured';
  const hasSnippet = (enrichment.snippet?.trim().length ?? 0) >= 40;

  if (aiFailed && (!fetchFailed || hasSnippet)) {
    return labelForAi(aiStatus, enrichment.aiError);
  }
  if (fetchFailed && enrichment.lastErrorCode) {
    return labelForFetch(enrichment.lastErrorCode, enrichment.lastErrorDetail);
  }
  if (aiFailed && aiStatus) {
    return labelForAi(aiStatus, enrichment.aiError);
  }
  if (enrichment.status === 'failed') {
    return buildLabel('fetch', 'unknown', 'failed', enrichment.lastErrorDetail);
  }

  return null;
}

/** Persist-friendly fields — call when writing failed enrichment. */
export function failureFieldsFromEnrichment(
  enrichment: Pick<
    ItemEnrichment,
    'status' | 'lastErrorCode' | 'lastErrorDetail' | 'aiStatus' | 'aiError' | 'snippet'
  >
): Pick<ItemEnrichment, 'failureStage' | 'failureCategory'> {
  const label = resolveEnrichmentFailureLabel(enrichment);
  if (!label) return {};
  return { failureStage: label.stage, failureCategory: label.category };
}

/** Same status text as Enrichment Hub → Status column (e.g. Fetch OK · AI — text too short). */
export function hubAlignedEnrichmentStatusLabel(
  enrichment?: Pick<
    ItemEnrichment,
    | 'status'
    | 'lastErrorCode'
    | 'lastErrorDetail'
    | 'aiStatus'
    | 'aiError'
    | 'snippet'
    | 'failureStage'
    | 'failureCategory'
  > | null,
  embedFailed?: boolean
): string | null {
  const failureLabel = resolveEnrichmentFailureLabel(enrichment, embedFailed);
  if (!failureLabel) return null;
  const fetchOkAiFailed = enrichment?.status === 'ok' && failureLabel.stage === 'ai';
  return fetchOkAiFailed
    ? `Fetch OK · ${FAILURE_CATEGORY_LABELS[failureLabel.category]}`
    : failureLabel.shortLabel;
}

export function isEnrichmentFailure(
  enrichment?: Pick<ItemEnrichment, 'status' | 'aiStatus'> | null,
  embedFailed?: boolean
): boolean {
  if (embedFailed) return true;
  if (!enrichment) return false;
  if (enrichment.status === 'failed') return true;
  return (
    enrichment.aiStatus === 'api_error' ||
    enrichment.aiStatus === 'parse_failed' ||
    enrichment.aiStatus === 'empty_response' ||
    enrichment.aiStatus === 'content_too_short'
  );
}

export type FailureCategoryCounts = Partial<Record<FailureCategory, number>>;

/** Count failures by category for digest / bulk review headers. */
export function countFailuresByCategory(
  enrichments: Array<
    Pick<
      ItemEnrichment,
      | 'itemId'
      | 'status'
      | 'lastErrorCode'
      | 'lastErrorDetail'
      | 'aiStatus'
      | 'aiError'
      | 'snippet'
      | 'failureStage'
      | 'failureCategory'
    >
  >,
  embedFailedItemIds?: Set<string>
): FailureCategoryCounts {
  const counts: FailureCategoryCounts = {};
  for (const e of enrichments) {
    const embed = embedFailedItemIds?.has(e.itemId);
    const label = resolveEnrichmentFailureLabel(e, embed);
    if (!label) continue;
    counts[label.category] = (counts[label.category] ?? 0) + 1;
  }
  return counts;
}

export function formatFailureCategoryBreakdown(counts: FailureCategoryCounts): string {
  const entries = Object.entries(counts)
    .filter(([, n]) => (n ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)) as Array<[FailureCategory, number]>;
  if (!entries.length) return '';
  return entries
    .slice(0, 5)
    .map(([cat, n]) => `${FAILURE_CATEGORY_LABELS[cat]} (${n})`)
    .join(' · ');
}
