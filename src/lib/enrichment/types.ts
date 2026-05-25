export type EnrichmentStatus =
  | 'none'
  | 'pending'
  | 'ok'
  | 'skipped'
  | 'failed'
  | 'stale';

export type EnrichmentErrorCode =
  | 'excluded'
  | 'parse_empty'
  | 'auth_required'
  | 'timeout'
  | 'rate_limited'
  | 'network'
  | 'provider_error'
  | 'oversized'
  | 'no_backup_folder';

export type SourceKind = 'article' | 'x' | 'video' | 'generic';

/** Result of the optional post-fetch LLM extraction step */
export type EnrichmentAIStatus =
  | 'ok'
  | 'not_configured'
  | 'content_too_short'
  | 'parse_failed'
  | 'empty_response'
  | 'api_error';

export type ContentHints = {
  sourceKind?: SourceKind;
  force?: boolean;
};

export interface ItemEnrichment {
  itemId: string;
  normalizedUrl: string;
  status: EnrichmentStatus;
  providerId: string;
  fetchedAt?: number;
  attempts: number;
  lastErrorCode?: EnrichmentErrorCode;
  nextRetryAt?: number;
  contentHash?: string;
  textHash?: string;
  snippet?: string;
  summary?: string;
  /** Parsed page title from fetch (before tier-2 copy to Item) */
  fetchedTitle?: string;
  sourceKind?: SourceKind;
  quotedText?: string;
  quotedAuthor?: string;
  channel?: string;
  description?: string;
  rawRef?: string;
  rawBytes?: number;
  hasRawBody: boolean;
  skipReason?: string;
  /** Item fields written by last successful tier-2 apply (e.g. title, metadata.platform) */
  tier2Applied?: string[];
  /** Sub-provider that returned usable content (local, jina, markdown-new) */
  fetchSourceId?: string;
  /** AI-generated tags (suggested; may be merged onto Item.tags) */
  aiTags?: string[];
  /** AI-extracted bullet points for search/categorization */
  aiKeyPoints?: string[];
  /** LLM extraction outcome (only set when fetch succeeded and AI step ran) */
  aiStatus?: EnrichmentAIStatus;
  aiError?: string;
  aiAt?: number;
  updated_at: number;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  skipFetch?: boolean;
  skipReason?: string;
  sourceKind?: SourceKind;
}

export interface EnrichmentResult {
  itemId: string;
  status: EnrichmentStatus;
  skipped?: boolean;
  errorCode?: EnrichmentErrorCode;
  message?: string;
}

export interface EnrichBatchOptions {
  mode?: 'smart' | 'full';
  force?: boolean;
  maxItems?: number;
  itemIds?: string[];
  collectionId?: string;
  onProgress?: (progress: EnrichBatchProgress) => void;
  signal?: AbortSignal;
}

export interface EnrichBatchProgress {
  runId: string;
  processed: number;
  skipped: number;
  failed: number;
  total: number;
  currentItemId?: string;
}

export interface EnrichBatchResult {
  runId: string;
  processed: number;
  skipped: number;
  failed: number;
  cancelled?: boolean;
}

export const ENRICHMENT_DEFAULTS = {
  snippetMaxChars: 12_000,
  smartCap: 50,
  fullCap: 200,
  concurrency: 2,
  timeoutMs: 25_000,
  maxAttempts: 4,
  maxResponseBytes: 2_000_000,
  richLocalMinChars: 400,
  minUsefulSnippetChars: 80,
  backoffBaseMs: 60_000,
} as const;
