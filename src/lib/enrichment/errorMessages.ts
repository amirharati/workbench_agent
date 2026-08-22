import type { EnrichmentAIStatus, EnrichmentErrorCode, ItemEnrichment } from './types';
import { resolveEnrichmentFailureLabel } from './failureLabels';

export const AI_NOT_CONFIGURED_AFTER_FETCH_MESSAGE =
  'Page fetched and saved for keyword search. AI enrichment was skipped — add an API key in Settings > AI.';

export const ENRICHMENT_ERROR_HINTS: Record<EnrichmentErrorCode, string> = {
  excluded: 'This URL type is excluded from fetch',
  parse_empty: 'No usable article text could be extracted from the page',
  auth_required: 'Login, paywall, or permission required — keep the page open and save again',
  bot_blocked: 'Site blocked automated access — opening the page in your browser…',
  timeout: 'Request timed out',
  rate_limited: 'Provider rate limit (try again later)',
  network: 'Network error — check connection or CORS',
  provider_error: 'Fetch provider failed',
  url_redirect: 'Saved URL redirected to a different page',
  oversized: 'Response too large to store',
  no_backup_folder: 'Set backup folder in Settings for disk dumps',
};

export const AI_STATUS_HINTS: Record<EnrichmentAIStatus, string> = {
  ok: 'Summary, title, and/or tags extracted',
  not_configured: 'OpenRouter API key missing — set in Settings > AI',
  content_too_short: 'Fetched text too short for AI extraction',
  parse_failed: 'AI response was not valid JSON',
  empty_response: 'AI found no usable content (login wall, empty page, or chrome only)',
  api_error: 'AI provider request failed',
};

export function httpStatusToErrorCode(status: number): EnrichmentErrorCode {
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'auth_required';
  if (status === 404 || status === 410) return 'parse_empty';
  if (status === 451 || status === 503) return 'bot_blocked';
  if (status >= 500) return 'provider_error';
  return 'provider_error';
}

/** Human-readable message for HTTP failures from local fetch or remote providers. */
export function describeHttpFetchError(
  status: number,
  provider?: string,
  bodyPreview?: string
): string {
  const prefix = provider ? `${provider}: ` : '';
  const preview = (bodyPreview || '').trim();

  if (status === 404) return `${prefix}HTTP 404 — page not found`;
  if (status === 410) return `${prefix}HTTP 410 — page removed`;
  if (status === 403) return `${prefix}HTTP 403 — access forbidden (login or bot wall possible)`;
  if (status === 401) return `${prefix}HTTP 401 — authentication required`;
  if (status === 429) return `${prefix}HTTP 429 — rate limited`;
  if (status === 451) {
    if (/Anonymous access to domain/i.test(preview)) {
      const domain = preview.match(/domain ([^\s]+) blocked/i)?.[1];
      return domain
        ? `Jina blocked ${domain} (provider policy — not your account). Local fetch may still work on article URLs.`
        : `${prefix}HTTP 451 — provider blocked this domain`;
    }
    return `${prefix}HTTP 451 — unavailable (provider or legal restriction)`;
  }
  if (status === 503) return `${prefix}HTTP 503 — service unavailable`;
  if (status >= 500) return `${prefix}HTTP ${status} — upstream server error`;
  if (preview && preview.length < 120) return `${prefix}HTTP ${status} — ${preview}`;
  return `${prefix}HTTP ${status} — request failed`;
}

export function describeEnrichmentError(
  code?: EnrichmentErrorCode,
  detail?: string
): string {
  if (!code) return 'Fetch failed';
  if (detail?.trim() === 'tweet_unavailable') {
    return 'Tweet unavailable — deleted, private, or suspended';
  }
  const base = ENRICHMENT_ERROR_HINTS[code] ?? code;
  if (!detail?.trim()) return base;
  if (detail.trim().startsWith('Could not resolve t.co')) return detail.trim();
  if (detail.trim().startsWith(base) || base.includes(detail.trim().slice(0, 24))) {
    return detail.trim();
  }
  return `${base}. ${detail.trim()}`;
}

export function describeAiFailure(status?: EnrichmentAIStatus, error?: string): string | undefined {
  if (!status || status === 'ok' || status === 'not_configured') return undefined;
  if (error?.trim()) return error.trim();
  return AI_STATUS_HINTS[status] ?? status;
}

/** Best user-facing failure line for Inspector, digest, and review UI. */
export function formatEnrichmentFailureMessage(
  enrichment?: Pick<
    ItemEnrichment,
    'status' | 'lastErrorCode' | 'lastErrorDetail' | 'aiStatus' | 'aiError' | 'fetchSourceId' | 'providerId' | 'snippet' | 'failureStage' | 'failureCategory'
  > | null
): string | undefined {
  const label = resolveEnrichmentFailureLabel(enrichment ?? undefined);
  if (label) {
    if (label.detail && !label.detail.startsWith(label.label)) {
      return `${label.label}. ${label.detail}`;
    }
    return label.detail ?? label.label;
  }

  if (!enrichment || enrichment.status !== 'failed') {
    if (enrichment?.aiStatus && enrichment.aiStatus !== 'ok' && enrichment.aiStatus !== 'not_configured') {
      return describeAiFailure(enrichment.aiStatus, enrichment.aiError);
    }
    return undefined;
  }

  if (
    enrichment.aiStatus &&
    enrichment.aiStatus !== 'ok' &&
    enrichment.aiStatus !== 'not_configured'
  ) {
    return describeAiFailure(enrichment.aiStatus, enrichment.aiError);
  }

  let detail = enrichment.lastErrorDetail;
  if (!detail && enrichment.fetchSourceId && enrichment.lastErrorCode === 'provider_error') {
    detail = `Last provider: ${enrichment.fetchSourceId}`;
  }

  return describeEnrichmentError(enrichment.lastErrorCode, detail);
}
