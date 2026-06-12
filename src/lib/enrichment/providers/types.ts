import type { RedirectContext } from '../fetchRedirect';
import type { ContentHints, EnrichmentErrorCode } from '../types';

export interface FetchProviderResult {
  ok: boolean;
  markdown?: string;
  title?: string;
  errorCode?: EnrichmentErrorCode;
  /** Provider-specific detail (HTTP status line, parse reason, etc.). */
  error?: string;
  rawBytesApprox?: number;
  /** Which sub-provider produced a successful hybrid fetch */
  fetchSourceId?: string;
  /** Bookmark URL before fetch-time resolution. */
  requestedUrl?: string;
  /** URL after HTTP redirects (when known). */
  finalUrl?: string;
  redirectContext?: RedirectContext;
}

export interface FetchProviderInput {
  url: string;
  normalizedUrl: string;
  hints?: ContentHints;
  signal?: AbortSignal;
}

export interface FetchProvider {
  id: string;
  fetchUrl(input: FetchProviderInput): Promise<FetchProviderResult>;
}
