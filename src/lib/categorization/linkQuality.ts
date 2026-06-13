/**
 * Link-quality parent: two baskets under one tree —
 * - removal candidates (404, placeholder, fetch fail)
 * - needs attention (login/auth shell — keep; may re-fetch when user is signed in)
 */

import type { Item } from '../db';
import { MIN_AI_SUMMARY_LENGTH } from '../enrichment/categorizationEligibility';
import type { EnrichmentStatus, ItemEnrichment } from '../enrichment/types';
import type { AiCategory } from './types';

export const LINK_QUALITY_PARENT_ID = 'link-quality';

/** Seed leaf ids (without seed_ prefix). */
export const LINK_QUALITY_LEAF_IDS = {
  PAGE_NOT_FOUND: 'page-not-found',
  ENRICH_FETCH_FAILED: 'enrich-fetch-failed',
  PLACEHOLDER_JUNK: 'placeholder-junk',
  GENERIC_LOW_SIGNAL: 'generic-low-signal',
  SOCIAL_NO_TOPIC: 'social-no-topic',
  LOGIN_AUTH_REQUIRED: 'login-auth-required',
  /** Saved URL clearly resolves to a different page (article→hub) — attention only, not removal. */
  URL_REDIRECT_MISMATCH: 'url-redirect-mismatch',
} as const;

export type LinkQualityLeafId =
  (typeof LINK_QUALITY_LEAF_IDS)[keyof typeof LINK_QUALITY_LEAF_IDS];

const REMOVAL_LEAF_SET = new Set<string>([
  LINK_QUALITY_LEAF_IDS.PAGE_NOT_FOUND,
  LINK_QUALITY_LEAF_IDS.ENRICH_FETCH_FAILED,
  LINK_QUALITY_LEAF_IDS.PLACEHOLDER_JUNK,
  LINK_QUALITY_LEAF_IDS.GENERIC_LOW_SIGNAL,
  LINK_QUALITY_LEAF_IDS.SOCIAL_NO_TOPIC,
]);

const ATTENTION_LEAF_SET = new Set<string>([
  LINK_QUALITY_LEAF_IDS.LOGIN_AUTH_REQUIRED,
  LINK_QUALITY_LEAF_IDS.URL_REDIRECT_MISMATCH,
]);

const ALL_LINK_QUALITY_LEAF_SET = new Set<string>([
  ...REMOVAL_LEAF_SET,
  ...ATTENTION_LEAF_SET,
]);

function linkQualityLeafRaw(categoryId: string | null | undefined): string | null {
  if (!categoryId) return null;
  return categoryId.startsWith('seed_') ? categoryId.slice(5) : categoryId;
}

export function isLinkQualityLeafId(categoryId: string | null | undefined): boolean {
  const raw = linkQualityLeafRaw(categoryId);
  return raw !== null && ALL_LINK_QUALITY_LEAF_SET.has(raw);
}

export function isLinkQualityRemovalLeafId(categoryId: string | null | undefined): boolean {
  const raw = linkQualityLeafRaw(categoryId);
  return raw !== null && REMOVAL_LEAF_SET.has(raw);
}

export function isLinkQualityAttentionLeafId(categoryId: string | null | undefined): boolean {
  const raw = linkQualityLeafRaw(categoryId);
  return raw !== null && ATTENTION_LEAF_SET.has(raw);
}

export function isLinkQualityRedirectMismatchLeafId(
  categoryId: string | null | undefined
): boolean {
  const raw = linkQualityLeafRaw(categoryId);
  return raw === LINK_QUALITY_LEAF_IDS.URL_REDIRECT_MISMATCH;
}

export function classifyStateForLinkQualityLeaf(
  categoryId: string | null | undefined
): 'classified_removal' | 'classified_attention' {
  return isLinkQualityAttentionLeafId(categoryId) ? 'classified_attention' : 'classified_removal';
}

export function isLinkQualityParentId(parentId: string | null | undefined): boolean {
  return parentId === LINK_QUALITY_PARENT_ID;
}

export function seedLinkQualityCategoryId(leafId: LinkQualityLeafId): string {
  return `seed_${leafId}`;
}

export interface LinkQualitySeedParent {
  id: typeof LINK_QUALITY_PARENT_ID;
  name: string;
  description: string;
}

export interface LinkQualitySeedLeaf {
  id: LinkQualityLeafId;
  parentId: typeof LINK_QUALITY_PARENT_ID;
  name: string;
  description: string;
  canonicalTags: string[];
  isRemovalCandidate: boolean;
}

export const LINK_QUALITY_SEED_PARENT: LinkQualitySeedParent = {
  id: LINK_QUALITY_PARENT_ID,
  name: 'Link quality & attention',
  description:
    'Not topic taxonomy: (1) removal candidates — dead/placeholder/fetch-failed links; (2) needs attention — login/auth shells and clear URL redirect mismatches (keep bookmark).',
};

export const LINK_QUALITY_SEED_LEAVES: LinkQualitySeedLeaf[] = [
  {
    id: LINK_QUALITY_LEAF_IDS.PAGE_NOT_FOUND,
    parentId: LINK_QUALITY_PARENT_ID,
    name: 'Page not found / dead link',
    description: '404, “page not found”, removed content, or clear dead-end URLs.',
    canonicalTags: ['404', 'dead-link', 'removal-candidate'],
    isRemovalCandidate: true,
  },
  {
    id: LINK_QUALITY_LEAF_IDS.ENRICH_FETCH_FAILED,
    parentId: LINK_QUALITY_PARENT_ID,
    name: 'Fetch or AI enrich failed',
    description: 'Could not extract usable summary (empty_response, parse error, or quality gate failed).',
    canonicalTags: ['enrich-failed', 'removal-candidate'],
    isRemovalCandidate: true,
  },
  {
    id: LINK_QUALITY_LEAF_IDS.PLACEHOLDER_JUNK,
    parentId: LINK_QUALITY_PARENT_ID,
    name: 'Reserved placeholder domain',
    description:
      'ONLY IANA reserved hosts (example.com, example.org, example.net) — never real sites with a summary topic.',
    canonicalTags: ['placeholder', 'junk', 'removal-candidate'],
    isRemovalCandidate: true,
  },
  {
    id: LINK_QUALITY_LEAF_IDS.LOGIN_AUTH_REQUIRED,
    parentId: LINK_QUALITY_PARENT_ID,
    name: 'Login or auth required',
    description:
      'Sign-in wall / auth gate with no public content yet — keep bookmark; pipeline may fetch after user logs in same browser. Not removal junk.',
    canonicalTags: ['login', 'auth', 'attention'],
    isRemovalCandidate: false,
  },
  {
    id: LINK_QUALITY_LEAF_IDS.URL_REDIRECT_MISMATCH,
    parentId: LINK_QUALITY_PARENT_ID,
    name: 'URL redirect mismatch',
    description:
      'Saved bookmark URL clearly no longer points at that resource (e.g. article URL lands on hub/homepage). ' +
      'Fetch pipeline AI confirmed mismatch — not www/https or benign redirects. Keep bookmark; update URL or accept fetched page.',
    canonicalTags: ['redirect', 'stale-url', 'attention'],
    isRemovalCandidate: false,
  },
  {
    id: LINK_QUALITY_LEAF_IDS.GENERIC_LOW_SIGNAL,
    parentId: LINK_QUALITY_PARENT_ID,
    name: 'Empty page (no subject)',
    description:
      'Blank or zero-subject page (not a login gate): corporate splash with no content. Never for link lists, guides, or adult.',
    canonicalTags: ['generic', 'low-signal', 'removal-candidate'],
    isRemovalCandidate: true,
  },
  {
    id: LINK_QUALITY_LEAF_IDS.SOCIAL_NO_TOPIC,
    parentId: LINK_QUALITY_PARENT_ID,
    name: 'Social post (no topic)',
    description:
      'Social URL where enrich/classify found no durable subject (reactions, hype, empty thread). ' +
      'Substantive tweets/threads with a real topic should use normal topic leaves, not this bucket.',
    canonicalTags: ['social', 'removal-candidate'],
    isRemovalCandidate: true,
  },
];

export interface LinkQualityDetectInput {
  title?: string | null;
  url?: string | null;
  aiStatus?: string | null;
  aiSummary?: string | null;
  aiTags?: string[] | null;
  aiKeyPoints?: string[] | null;
  quotedText?: string | null;
  eligibilityReason?: string | null;
  llmReason?: string | null;
  enrichmentStatus?: EnrichmentStatus | null;
  lastErrorDetail?: string | null;
  snippet?: string | null;
  hasRawBody?: boolean;
}

/** Link-quality heuristics require a fetch attempt — never title/URL-only on fresh imports. */
export function fetchAttemptedForLinkQuality(enrichment?: ItemEnrichment | null): boolean {
  const status = enrichment?.status;
  return Boolean(status && status !== 'none');
}

function hasFetchContentSignal(input: LinkQualityDetectInput): boolean {
  if (input.enrichmentStatus === 'ok') return true;
  return Boolean(
    input.snippet?.trim() ||
      (input.aiSummary?.trim() && input.aiStatus === 'ok') ||
      input.hasRawBody
  );
}

export interface LinkQualityDetection {
  leafId: LinkQualityLeafId;
  reason: string;
}

const FAILED_AI = new Set(['empty_response', 'parse_failed', 'api_error', 'content_too_short']);

/** IANA / reserved hosts only — not real sites that happen to look “generic”. */
const RESERVED_PLACEHOLDER_HOSTS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'example.edu',
]);

export function isReservedPlaceholderHost(url: string | null | undefined): boolean {
  const raw = (url ?? '').trim();
  if (!raw) return false;
  try {
    const h = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
    return RESERVED_PLACEHOLDER_HOSTS.has(h);
  } catch {
    return false;
  }
}

/** True when enrich produced real topical content — do not use link-quality (except 404/5xx). */
export function summaryLooksSubstantive(input: LinkQualityDetectInput): boolean {
  const summary = (input.aiSummary ?? '').trim();
  if (input.aiStatus === 'ok' && summary.length >= MIN_AI_SUMMARY_LENGTH) {
    if (summary.length >= 100) return true;
    const blob = linkQualityTextBlob(input);
    if (
      /\b(movies?|tv\b|streaming|visa|immigrant|embassy|petition|tutorial|guide|algorithm|trading|software|health|nutrition|learning|research)\b/.test(
        blob
      )
    ) {
      return true;
    }
    return summary.length >= 80;
  }
  return false;
}

/** Gate link-quality assignments so useful pages never land in removal buckets. */
export function linkQualityLeafAllowed(
  leafId: LinkQualityLeafId,
  input: LinkQualityDetectInput
): boolean {
  if (leafId === LINK_QUALITY_LEAF_IDS.PLACEHOLDER_JUNK) {
    return (
      isReservedPlaceholderHost(input.url) || norm(input.title ?? '') === 'example domain'
    );
  }
  if (
    leafId === LINK_QUALITY_LEAF_IDS.LOGIN_AUTH_REQUIRED ||
    leafId === LINK_QUALITY_LEAF_IDS.URL_REDIRECT_MISMATCH
  ) {
    return true;
  }
  if (
    leafId === LINK_QUALITY_LEAF_IDS.PAGE_NOT_FOUND ||
    leafId === LINK_QUALITY_LEAF_IDS.ENRICH_FETCH_FAILED
  ) {
    return true;
  }
  if (summaryLooksSubstantive(input)) return false;
  return true;
}

export function linkQualityCategoryAllowed(
  categoryId: string,
  input: LinkQualityDetectInput
): boolean {
  const raw = categoryId.startsWith('seed_') ? categoryId.slice(5) : categoryId;
  if (!isLinkQualityLeafId(raw)) return true;
  return linkQualityLeafAllowed(raw as LinkQualityLeafId, input);
}

function norm(s: string): string {
  return s.toLowerCase();
}

/** Enrich succeeded — classify should use Summary (thread/quote/article), not mechanical junk rules. */
function hasUsableAiSummary(input: LinkQualityDetectInput): boolean {
  const summary = (input.aiSummary ?? '').trim();
  return input.aiStatus === 'ok' && summary.length >= MIN_AI_SUMMARY_LENGTH;
}

function linkQualityTextBlob(input: LinkQualityDetectInput): string {
  return norm(
    [
      input.title,
      input.aiSummary,
      input.eligibilityReason,
      input.llmReason,
      input.lastErrorDetail,
      ...(input.aiKeyPoints ?? []),
      ...(input.aiTags ?? []),
    ]
      .filter(Boolean)
      .join(' ')
  );
}

const LOGIN_AUTH_GATE_RE =
  /\b(?:sign[\s-]?in to continue|login required|log in to view|log in to continue|verify your identity|identity verification|authentication required|create an account to|join linkedin|members only|subscribe to (?:read|view)|paywall|registration required)\b/i;

/** Auth/login shell — attention bucket; runs before substantive-summary skip. */
export function detectLoginAuthGate(input: LinkQualityDetectInput): LinkQualityDetection | null {
  const blob = linkQualityTextBlob(input);
  if (!LOGIN_AUTH_GATE_RE.test(blob)) return null;
  const summary = (input.aiSummary ?? '').trim();
  if (summary.length > 200 && !LOGIN_AUTH_GATE_RE.test(summary.slice(0, 280))) {
    return null;
  }
  return {
    leafId: LINK_QUALITY_LEAF_IDS.LOGIN_AUTH_REQUIRED,
    reason: 'Login or auth required — keep bookmark; may re-enrich when signed in',
  };
}

/** 404/5xx/dead-link signals — run before hasUsableAiSummary so error-page summaries still bucket. */
function detectDeadOrErrorPage(input: LinkQualityDetectInput): LinkQualityDetection | null {
  const blob = linkQualityTextBlob(input);
  const titleL = norm(input.title ?? '');

  if (
    /page not found|\b404\b|not found\b|dead link|no longer available|\b410\b|\bgone\b|unavailable\b/.test(
      blob
    ) ||
    /\b404\b|not found/.test(titleL)
  ) {
    return {
      leafId: LINK_QUALITY_LEAF_IDS.PAGE_NOT_FOUND,
      reason: 'Dead link or 404 page',
    };
  }

  const withoutSp500 = blob.replace(/\bs&p\s*500\b/gi, '');
  if (
    /\b500\b|internal server error|\b502\b|\b503\b|\b504\b|bad gateway|service unavailable|gateway timeout/.test(
      withoutSp500
    )
  ) {
    return {
      leafId: LINK_QUALITY_LEAF_IDS.PAGE_NOT_FOUND,
      reason: 'Server error page (5xx) — no usable content',
    };
  }

  return null;
}

export function detectLinkQualityIssue(input: LinkQualityDetectInput): LinkQualityDetection | null {
  const enrichStatus = input.enrichmentStatus;
  if (!enrichStatus || enrichStatus === 'none') {
    return null;
  }

  const title = (input.title ?? '').trim();
  const url = (input.url ?? '').trim();
  const reason = norm([input.eligibilityReason, input.llmReason].filter(Boolean).join(' '));
  const titleL = norm(title);
  const host = (() => {
    try {
      return norm(new URL(url).hostname);
    } catch {
      return '';
    }
  })();

  const aiStatus = (input.aiStatus ?? '').trim();
  const summary = (input.aiSummary ?? '').trim();

  if (isReservedPlaceholderHost(url) || titleL === 'example domain') {
    const det: LinkQualityDetection = {
      leafId: LINK_QUALITY_LEAF_IDS.PLACEHOLDER_JUNK,
      reason: 'Reserved placeholder domain (example.com)',
    };
    return linkQualityLeafAllowed(det.leafId, input) ? det : null;
  }

  if (enrichStatus === 'failed' && input.lastErrorDetail?.trim()) {
    const deadFromFetch = detectDeadOrErrorPage({
      ...input,
      eligibilityReason: input.lastErrorDetail,
    });
    if (deadFromFetch && linkQualityLeafAllowed(deadFromFetch.leafId, input)) {
      return deadFromFetch;
    }
  }

  if (enrichStatus === 'failed' && !hasFetchContentSignal(input)) {
    const det: LinkQualityDetection = {
      leafId: LINK_QUALITY_LEAF_IDS.ENRICH_FETCH_FAILED,
      reason:
        input.lastErrorDetail?.trim() ||
        'Fetch failed — no usable body for topic classification',
    };
    return linkQualityLeafAllowed(det.leafId, input) ? det : null;
  }

  const loginAuth = detectLoginAuthGate(input);
  if (loginAuth && linkQualityLeafAllowed(loginAuth.leafId, input)) return loginAuth;

  // Substantive AI summary — prefer classify over mechanical dead/error regex (avoids false removals).
  if (hasUsableAiSummary(input)) {
    return null;
  }

  const deadOrError = detectDeadOrErrorPage(input);
  if (deadOrError && linkQualityLeafAllowed(deadOrError.leafId, input)) return deadOrError;

  if (
    enrichStatus === 'ok' &&
    (FAILED_AI.has(aiStatus) || reason.includes('extraction failed'))
  ) {
    return {
      leafId: LINK_QUALITY_LEAF_IDS.ENRICH_FETCH_FAILED,
      reason: 'Enrich/fetch failed or insufficient text for topic classification',
    };
  }

  // Only trust LLM “no topic” heuristics when there is no usable summary (avoid mis-bucketing substantive pages).
  if (
    /sign in to continue|login required|log in to view|create an account to|empty login|no video or channel topic/.test(
      reason
    )
  ) {
    const det: LinkQualityDetection = {
      leafId: LINK_QUALITY_LEAF_IDS.LOGIN_AUTH_REQUIRED,
      reason: 'Login/auth required — keep for re-fetch when signed in',
    };
    return linkQualityLeafAllowed(det.leafId, input) ? det : null;
  }

  const social = /t\.co|twitter\.com|x\.com|linkedin\.com|facebook\.com/.test(host + url);
  if (
    social &&
    /no topic|no durable|personal post|generic excitement|reactions only/.test(reason)
  ) {
    const det: LinkQualityDetection = {
      leafId: LINK_QUALITY_LEAF_IDS.SOCIAL_NO_TOPIC,
      reason: 'Social post without durable topic',
    };
    return linkQualityLeafAllowed(det.leafId, input) ? det : null;
  }

  if (!summary.length && (titleL.length < 12 || /^(welcome|home|sign\s*in|log\s*in)$/i.test(titleL))) {
    const det: LinkQualityDetection = {
      leafId: LINK_QUALITY_LEAF_IDS.GENERIC_LOW_SIGNAL,
      reason: 'Very low signal (no AI summary)',
    };
    return linkQualityLeafAllowed(det.leafId, input) ? det : null;
  }

  return null;
}

/**
 * Clear-cut redirect mismatch only — same bar as enrich `pendingFetchReview` + `url_redirect`
 * (explicit AI verdict/summary mismatch, not mechanical path hints).
 */
/** Login/auth attention — eligible classify path (before topic LLM). */
export function detectLoginAuthAttentionFromItem(
  item: Pick<Item, 'title' | 'url'>,
  enrichment?: ItemEnrichment | null
): LinkQualityDetection | null {
  if (!enrichment || enrichment.status !== 'ok') return null;
  if (enrichment.pendingFetchReviewReason === 'url_redirect') return null;
  const det = detectLoginAuthGate({
    title: item.title,
    url: item.url,
    aiStatus: enrichment.aiStatus,
    aiSummary: enrichment.summary,
    aiTags: enrichment.aiTags,
    aiKeyPoints: enrichment.aiKeyPoints,
    enrichmentStatus: enrichment.status,
    lastErrorDetail: enrichment.lastErrorDetail,
    snippet: enrichment.snippet,
    hasRawBody: enrichment.hasRawBody,
  });
  return det && linkQualityLeafAllowed(det.leafId, {
    title: item.title,
    url: item.url,
    aiStatus: enrichment.aiStatus,
    aiSummary: enrichment.summary,
    lastErrorDetail: enrichment.lastErrorDetail,
  })
    ? det
    : null;
}

export function detectUrlRedirectMismatchAttention(
  enrichment?: ItemEnrichment | null
): LinkQualityDetection | null {
  if (!enrichment || enrichment.status !== 'ok') return null;
  if (!enrichment.pendingFetchReview) return null;
  if (enrichment.pendingFetchReviewReason !== 'url_redirect') return null;
  const detail = enrichment.lastErrorDetail?.trim();
  const blob = [detail, enrichment.summary].filter(Boolean).join(' ');
  if (blob && LOGIN_AUTH_GATE_RE.test(blob)) return null;
  return {
    leafId: LINK_QUALITY_LEAF_IDS.URL_REDIRECT_MISMATCH,
    reason:
      detail ||
      'Saved URL redirected to a different page (fetch AI confirmed mismatch)',
  };
}

export function detectLinkQualityFromItem(
  item: Pick<Item, 'title' | 'url'>,
  enrichment?: ItemEnrichment | null,
  extra?: { eligibilityReason?: string; llmReason?: string }
): LinkQualityDetection | null {
  return detectLinkQualityIssue({
    title: item.title,
    url: item.url,
    aiStatus: enrichment?.aiStatus,
    aiSummary: enrichment?.summary,
    aiTags: enrichment?.aiTags,
    aiKeyPoints: enrichment?.aiKeyPoints,
    quotedText: enrichment?.quotedText,
    eligibilityReason: extra?.eligibilityReason,
    llmReason: extra?.llmReason,
    enrichmentStatus: enrichment?.status,
    lastErrorDetail: enrichment?.lastErrorDetail,
    snippet: enrichment?.snippet,
    hasRawBody: enrichment?.hasRawBody,
  });
}

export function findLinkQualityCategory(
  categories: AiCategory[],
  leafId: LinkQualityLeafId
): AiCategory | undefined {
  const want = seedLinkQualityCategoryId(leafId);
  return categories.find((c) => c.id === want || c.id === leafId);
}

export function categoryIsRemovalCandidate(category: AiCategory | undefined): boolean {
  if (!category) return false;
  if (category.isRemovalCandidate === false) return false;
  if (category.isRemovalCandidate === true) return true;
  return isLinkQualityRemovalLeafId(category.id);
}

