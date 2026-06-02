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
  | 'bot_blocked'
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
  /** Human-readable detail for lastErrorCode (HTTP status, provider message, gate reason). */
  lastErrorDetail?: string;
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
  /** Re-fetch looked worse than saved snapshot; review raw may be stored separately. */
  pendingFetchReview?: boolean;
  pendingFetchReviewReason?: EnrichmentErrorCode;
  reviewRawRef?: string;
  /** Structured failure — for bulk review filters (derived on read if missing). */
  failureStage?: 'fetch' | 'ai' | 'embed';
  failureCategory?: string;
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
  collectItemResults?: boolean;
  /** Re-fetch saved URLs and compare content hash (import / digest refresh). */
  refetchCompare?: boolean;
  /** Fetch and parse only — do not run AI extract (Enrichment Hub per-step actions). */
  skipAi?: boolean;
  /** Batch mode: skip per-item embed/classify queue — run batch post-process instead. */
  deferPostProcess?: boolean;
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
  itemResults?: EnrichmentResult[];
}

export const ENRICHMENT_DEFAULTS = {
  snippetMaxChars: 12_000,
  smartCap: 50,
  fullCap: 200,
  /** Parallel enrich workers (fetch + AI per item). */
  concurrency: 2,
  /** @deprecated Use headlessTimeoutMs — kept for callers that read timeoutMs. */
  timeoutMs: 25_000,
  /** Headless local/jina/syndication budget per item. */
  headlessTimeoutMs: 25_000,
  /** Open-tab scrape or ephemeral background tab (load can take ~45s). */
  tabFetchTimeoutMs: 65_000,
  /** Outer cap for the whole fetch phase inside enrichOne. */
  fetchOverallTimeoutMs: 90_000,
  /** Only one ephemeral background tab at a time (Chrome load stability). */
  ephemeralMaxConcurrent: 1,
  maxAttempts: 4,
  /** Truncate fetched markdown above this before AI / storage (PDFs, huge pages). */
  maxFetchMarkdownChars: 150_000,
  maxResponseBytes: 2_000_000,
  richLocalMinChars: 400,
  minUsefulSnippetChars: 80,
  backoffBaseMs: 60_000,
} as const;
