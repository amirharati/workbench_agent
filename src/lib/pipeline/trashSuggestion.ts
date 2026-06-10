import {
  isLinkQualityAttentionLeafId,
  isLinkQualityRemovalLeafId,
  LINK_QUALITY_LEAF_IDS,
} from '../categorization/linkQuality';
import { isGeneralLeafId } from '../categorization/taxonomyCatalog';
import type { ClassifyState } from '../categorization/types';
import {
  FAILURE_CATEGORY_LABELS,
  resolveEnrichmentFailureLabel,
  type FailureCategory,
} from '../enrichment/failureLabels';
import type { ItemEnrichment } from '../enrichment/types';
import type { Item } from '../db';
import type { PipelineBadge } from './pipelineBadge';

const NOT_FOUND_DETAIL_RE =
  /\b(?:HTTP\s*404|HTTP\s*410|404\s*[-—–]|page not found|page removed|410\s*[-—–]|gone)\b/i;

const DEAD_NETWORK_DETAIL_RE =
  /\b(?:ENOTFOUND|ECONNREFUSED|ERR_NAME_NOT_RESOLVED|NXDOMAIN|could not resolve|getaddrinfo|host not found|unable to resolve|name or service not known|network is unreachable)\b/i;

const PROVIDER_NETWORK_NOISE_RE =
  /\b(?:Jina reader|reaching Jina|rate limit|CORS|Failed to fetch)\b/i;

export type TrashSuggestionRowInput = {
  item: Pick<Item, 'url'>;
  enrichment?: ItemEnrichment;
  embedFailed: boolean;
  meta: {
    failureCategory?: FailureCategory;
    failureReason?: string;
    pipelineBadge: PipelineBadge;
    failed?: boolean;
  };
  primaryCategoryId?: string | null;
  classifyState?: ClassifyState;
};

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

function isGeneralFallbackOnly(input: TrashSuggestionRowInput): boolean {
  return (
    input.classifyState === 'classified_general' ||
    Boolean(input.primaryCategoryId && isGeneralLeafId(input.primaryCategoryId))
  );
}

function trashUrlIneligibilityReason(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return 'No URL';
  try {
    const parsed = new URL(trimmed);
    if (!/^https?:$/i.test(parsed.protocol)) return 'Invalid URL';
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(host)) return 'Localhost URL';
    return null;
  } catch {
    return 'Invalid URL';
  }
}

function isTrashExcluded(input: TrashSuggestionRowInput): boolean {
  if (isLinkQualityAttentionLeafId(input.primaryCategoryId)) return true;
  if (input.classifyState === 'classified_attention') return true;
  if (input.meta.pipelineBadge.label === 'Needs attention') return true;
  return false;
}

function linkQualityRemovalReason(primaryCategoryId: string | null | undefined): string {
  const raw = primaryCategoryId?.startsWith('seed_')
    ? primaryCategoryId.slice(5)
    : primaryCategoryId;
  switch (raw) {
    case LINK_QUALITY_LEAF_IDS.PAGE_NOT_FOUND:
      return 'Page not found (404)';
    case LINK_QUALITY_LEAF_IDS.ENRICH_FETCH_FAILED:
      return 'Fetch or enrich failed';
    case LINK_QUALITY_LEAF_IDS.PLACEHOLDER_JUNK:
      return 'Placeholder / junk URL';
    case LINK_QUALITY_LEAF_IDS.GENERIC_LOW_SIGNAL:
      return 'Low-signal page';
    case LINK_QUALITY_LEAF_IDS.SOCIAL_NO_TOPIC:
      return 'Social — no durable topic';
    default:
      return 'Removal candidate';
  }
}

function removalCandidateReason(input: TrashSuggestionRowInput): string {
  if (isLinkQualityRemovalLeafId(input.primaryCategoryId)) {
    return linkQualityRemovalReason(input.primaryCategoryId);
  }
  if (input.meta.pipelineBadge.label === 'Removal candidate') {
    const detail =
      input.meta.failureReason?.trim() ||
      (input.meta.failureCategory
        ? FAILURE_CATEGORY_LABELS[input.meta.failureCategory]
        : undefined);
    return detail ? `Removal candidate — ${detail}` : 'Removal candidate';
  }
  if (input.classifyState === 'classified_removal') {
    return linkQualityRemovalReason(input.primaryCategoryId);
  }
  return 'Removal candidate';
}

function isRemovalAssignment(input: TrashSuggestionRowInput): boolean {
  return (
    isLinkQualityRemovalLeafId(input.primaryCategoryId) ||
    input.classifyState === 'classified_removal' ||
    input.meta.pipelineBadge.label === 'Removal candidate'
  );
}

function enrichFailureReason(input: TrashSuggestionRowInput): string | null {
  const failureLabel = resolveEnrichmentFailureLabel(input.enrichment, input.embedFailed);
  if (!failureLabel) return null;
  return FAILURE_CATEGORY_LABELS[failureLabel.category] ?? failureLabel.shortLabel;
}

function hasHardEnrichFailure(input: TrashSuggestionRowInput): boolean {
  return (
    input.enrichment?.status === 'failed' ||
    input.embedFailed ||
    input.meta.pipelineBadge.kind === 'failed' ||
    input.meta.failed === true
  );
}

/** Short label for why this row is a trash candidate (dead link, removal bucket, enrich fail, etc.). */
export function resolveTrashSuggestionFromInput(
  input: TrashSuggestionRowInput
): string | null {
  if (isTrashExcluded(input)) return null;

  const urlIneligible = trashUrlIneligibilityReason(input.item.url || '');
  if (urlIneligible) return urlIneligible;

  if (isRemovalAssignment(input)) {
    return removalCandidateReason(input);
  }

  const enrichment = input.enrichment;
  const detail = failureDetailText(enrichment, input.meta.failureReason);

  if (isNotFoundFailure(enrichment, input.meta.failureReason)) {
    if (/410|page removed|gone/i.test(detail)) return 'Page removed (410)';
    return 'Page not found (404)';
  }

  if (isClearDeadNetworkFailure(enrichment, input.meta.failureReason)) {
    return 'Site unreachable';
  }

  if (isGeneralFallbackOnly(input) && !hasHardEnrichFailure(input)) {
    return null;
  }

  if (hasHardEnrichFailure(input)) {
    const reason = enrichFailureReason(input);
    if (reason) return reason;
    if (input.meta.failureCategory) {
      return FAILURE_CATEGORY_LABELS[input.meta.failureCategory];
    }
    if (input.meta.pipelineBadge.label) {
      return input.meta.pipelineBadge.label;
    }
  }

  return null;
}

