/** AI semantic layer — parallel to projects/collections (Task 02). */

export type AiCategoryKind = 'parent' | 'leaf';
export type AiCategoryStatus = 'ai_proposed' | 'approved' | 'manual' | 'deprecated';
export type AiCategorySource = 'seed' | 'discovered' | 'manual' | 'bootstrap';
export type AiLinkSource = 'manual' | 'ai';
export type AiLinkStatus = 'suggested' | 'accepted' | 'rejected';
export type AiSignalStatus =
  | 'ok'
  | 'insufficient_text'
  | 'insufficient_enrichment'
  | 'embed_failed'
  | 'skipped';

export type ClassifyState =
  | 'ineligible'
  | 'skipped'
  | 'pending_classify'
  | 'pending_reclassify'
  | 'classified'
  | 'classified_general'
  | 'classified_removal'
  /** link-quality login/auth wall — keep bookmark; may enrich after browser login */
  | 'classified_attention'
  | 'pending_discover'
  | 'manual_review'
  | 'manual_only';

export type ClassifyInputQualityTier = 'high' | 'medium' | 'low';

export type DiscoverState = 'none' | 'pending' | 'done';

export interface AiCategory {
  id: string;
  name: string;
  kind: AiCategoryKind;
  status: AiCategoryStatus;
  assignable: boolean;
  parentId?: string | null;
  parentName?: string | null;
  description?: string;
  source?: AiCategorySource;
  /** L2-normalized centroid (leaves only; optional for seed until embed). */
  centroid?: number[];
  canonicalTags?: string[];
  isGeneralFallback?: boolean;
  /** Junk/broken links — UI may suggest removal; not a topic leaf. */
  isRemovalCandidate?: boolean;
  itemCount?: number;
  primaryItemCount?: number;
  secondaryItemCount?: number;
  childLeafCount?: number;
  created_at: number;
  updated_at: number;
}

export interface AiItemCategoryLink {
  id: string;
  itemId: string;
  categoryId: string;
  score: number;
  isPrimary: boolean;
  source: AiLinkSource;
  status: AiLinkStatus;
  created_at: number;
  updated_at: number;
}

export interface LlmReviewSnapshot {
  decisionType?: string;
  categoryIds?: string[];
  confidence?: number;
  reason?: string;
  classifyMode?: string;
}

export interface AiItemSignal {
  itemId: string;
  textHash: string;
  classifyTextHash?: string;
  embeddingModel: string;
  embedding: number[];
  /** Read-cache metadata when worker strips the actual vector payload. Not persisted. */
  embeddingDimensions?: number;
  derivedTags: string[];
  tagConfidence?: number;
  signalStatus: AiSignalStatus;
  classifyState?: ClassifyState;
  discoverState?: DiscoverState;
  isNovelty?: boolean;
  /** How many times item landed general/unassigned/error (auto retry cap). */
  classifyRetryCount?: number;
  /** Why last classify run skipped this item (dev/CLI diagnostics). */
  lastClassifySkipReason?: string;
  /** Deterministic eligibility gate reason when classifyState=ineligible. */
  eligibilityReason?: string;
  inputQualityTier?: ClassifyInputQualityTier;
  lastProcessedAt: number;
  lastClassifiedAt?: number;
  llmReview?: LlmReviewSnapshot;
}

export interface AiTaxonomyState {
  id: 'default';
  taxonomyVersion: number;
  classifyMode: 'topic-extract' | 'embed';
  embeddingModel: string;
  discoverBatchThreshold: number;
  bulkImportThreshold: number;
  bulkModeActive: boolean;
  bulkDiscoverRuns: number;
  maxBulkDiscoverRuns: number;
  maxNewLeavesPerDiscover: number;
  maxNewParentsPerDiscover: number;
  unassignedThresholdPercent: number;
  lastDiscoverAt?: number;
  lastClassifyAt?: number;
  lastClassifyRun?: ClassifyRunSnapshot;
  lastDiscoverRun?: DiscoverRunSnapshot;
  updated_at: number;
}

export interface ClassifyRunSnapshot {
  at: number;
  summary: TopicClassifySummary;
}

export interface DiscoverRunSummary {
  totalConsidered: number;
  eligiblePool: number;
  stuckPool: number;
  skippedIneligible: number;
  skippedNotStuck: number;
  skippedManualReview: number;
  skippedTooShort: number;
  itemsSampled: number;
  discoverBatches: number;
  newParents: number;
  newLeaves: number;
  proposedParentsRaw: number;
  proposedLeavesRaw: number;
  reduceCalls?: number;
  reduceLeafCalls?: number;
  reduceMode?: string;
  leavesKeptPct?: number;
  taxonomyMergeParents?: number;
  taxonomyMergeLeaves?: number;
  mergeAuditCount?: number;
  duplicateLeavesSkipped: number;
  llmErrors: number;
  itemsMarkedForReclassify: number;
  failureBuckets: Record<string, number>;
  stuckKindBreakdown: {
    pending_discover: number;
    general: number;
    unassigned: number;
    manual_review: number;
  };
}

export interface DiscoverRunSnapshot {
  at: number;
  summary: DiscoverRunSummary;
}

export const DEFAULT_TAXONOMY_STATE: AiTaxonomyState = {
  id: 'default',
  taxonomyVersion: 0,
  classifyMode: 'topic-extract',
  embeddingModel: 'openai/text-embedding-3-small',
  discoverBatchThreshold: 50,
  bulkImportThreshold: 200,
  bulkModeActive: false,
  bulkDiscoverRuns: 0,
  maxBulkDiscoverRuns: 3,
  maxNewLeavesPerDiscover: 36,
  maxNewParentsPerDiscover: 5,
  unassignedThresholdPercent: 15,
  updated_at: 0,
};

export interface CategorizationThresholds {
  primaryMin: number;
  secondaryMin: number;
  secondaryMaxGapFromPrimary: number;
  maxSecondaries: number;
  noveltyMaxPrimary: number;
  minTextLength: number;
  bootstrapK: number;
  mergeCentroidMin: number;
  tagCap: number;
  minSemanticSubstance: number;
}

export const DEFAULT_THRESHOLDS: CategorizationThresholds = {
  primaryMin: 0.38,
  secondaryMin: 0.34,
  secondaryMaxGapFromPrimary: 0.05,
  maxSecondaries: 2,
  noveltyMaxPrimary: 0.48,
  minTextLength: 40,
  minSemanticSubstance: 100,
  bootstrapK: 8,
  mergeCentroidMin: 0.88,
  tagCap: 5,
};

export interface PipelineItemInput {
  itemId: string;
  title: string;
  url: string;
  text: string;
  notes?: string;
  enrichmentAiTags?: string[];
  substantiveLength?: number;
  categorizationEligible?: boolean;
  eligibilityReason?: string;
  semanticLength?: number;
}

export interface CategoryAssignment {
  categoryId: string;
  score: number;
  isPrimary: boolean;
}

export interface PipelineItemResult {
  itemId: string;
  textHash: string;
  embedding: number[];
  signalStatus: AiSignalStatus;
  assignments: CategoryAssignment[];
  derivedTags: string[];
  isNovelty: boolean;
  skipReason?: string;
}

export interface CategorizationRunSummary {
  processed: number;
  embedded: number;
  skippedInsufficient: number;
  skippedInsufficientEnrichment: number;
  embedFailed: number;
  assignedPrimary: number;
  assignedSecondary: number;
  novelty: number;
  categoriesCount: number;
  bootstrapCreated: number;
  categoriesMerged?: number;
}

export interface TopicClassifySummary {
  totalConsidered: number;
  processed: number;
  skippedIneligible: number;
  skippedHash: number;
  skippedLlm: number;
  skippedManualReview: number;
  assignedPrimary: number;
  classifiedSpecific: number;
  classifiedGeneral: number;
  /** link-quality parent — removal candidates */
  classifiedRemoval: number;
  assignedSecondary: number;
  multiLabel: number;
  unassigned: number;
  pendingDiscover: number;
  llmErrors: number;
  batches: number;
  failureBuckets: Record<string, number>;
  inputQuality: { high: number; medium: number; low: number };
}

export interface TopicClassifyResult {
  summary: TopicClassifySummary;
  categories: AiCategory[];
}

export interface CategorizationRunResult {
  summary: CategorizationRunSummary;
  categories: AiCategory[];
  itemResults: PipelineItemResult[];
  embeddingModel: string;
}

export interface DiscoverBatchResult {
  newParents: number;
  newLeaves: number;
  itemsSampled: number;
  discoverBatches: number;
  proposedParents: number;
  proposedLeaves: number;
  llmErrors: number;
  taxonomyLeafCount: number;
  taxonomyVersion: number;
  shouldReclassify: boolean;
  /** Stuck bookmarks included in this discover run (for follow-up classify). */
  sampledItemIds?: string[];
  /** Subset of sampled items queued for reclassify after discover. */
  reclassifyItemIds?: string[];
  batchErrors?: string[];
  summary?: DiscoverRunSummary;
}

export interface ClassifyProgressUpdate {
  phase: 'prepare' | 'classify' | 'discover' | 'save' | 'done';
  label: string;
  current: number;
  total: number;
}

export interface ClassifyIncrementalOptions {
  itemIds?: string[];
  maxItems?: number;
  reviewBatchSize?: number;
  autoDiscover?: boolean;
  /** Re-run LLM even when a primary category already exists (same text hash). */
  forceReclassify?: boolean;
  /** Include manual_review bucket items (CLI-style controlled retry). */
  retryManualReview?: boolean;
  onProgress?: (update: ClassifyProgressUpdate) => void;
  signal?: AbortSignal;
}

/** Counts for a Results list scope (e.g. AI-ready bookmarks in review). */
export interface ScopedCategorizationStats {
  inScope: number;
  aiReady: number;
  categorized: number;
  needsClassify: number;
  ineligible: number;
  /** Item ids that would enter the next Classify pending batch (same logic as the button). */
  readyItemIds: string[];
}

export interface CategorizationQueueStats {
  pendingClassify: number;
  pendingReclassify: number;
  pendingDiscover: number;
  ineligible: number;
  skipped: number;
  classified: number;
  classifiedGeneral: number;
  manualReview: number;
  unassignedEligible: number;
  leafCount: number;
  parentCount: number;
  bulkModeActive: boolean;
  lastClassifyRun?: ClassifyRunSnapshot;
  lastDiscoverRun?: DiscoverRunSnapshot;
  discoverPool?: DiscoverRunSummary;
}

export interface ProposedCategoryDraft {
  name: string;
  description?: string;
  canonicalTags: string[];
  parentId?: string;
}

export interface TopicExtractDecision {
  itemId: string;
  decisionType: 'existing' | 'none' | 'new_category';
  categoryIds?: string[];
  proposedCategory?: ProposedCategoryDraft;
  confidence?: number;
  reason?: string;
  needsReclassify?: boolean;
  status?: 'ok' | 'error';
}
