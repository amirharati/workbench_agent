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
  | 'pending_discover'
  | 'manual_only';

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
  derivedTags: string[];
  tagConfidence?: number;
  signalStatus: AiSignalStatus;
  classifyState?: ClassifyState;
  discoverState?: DiscoverState;
  isNovelty?: boolean;
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
  updated_at: number;
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
  maxNewLeavesPerDiscover: 20,
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
  processed: number;
  skippedIneligible: number;
  skippedHash: number;
  skippedLlm: number;
  assignedPrimary: number;
  assignedSecondary: number;
  multiLabel: number;
  unassigned: number;
  pendingDiscover: number;
  llmErrors: number;
  batches: number;
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
  /** How many LLM discover calls ran (one per sample chunk). */
  discoverBatches: number;
  /** Raw counts from LLM JSON before dedupe/merge. */
  proposedParents: number;
  proposedLeaves: number;
  /** Batches where the LLM call or JSON parse failed. */
  llmErrors: number;
  /** Leaf labels already in taxonomy (import seed includes prior discovery runs). */
  taxonomyLeafCount: number;
  taxonomyVersion: number;
  shouldReclassify: boolean;
  /** Set when one or more batches failed (API/parse). */
  batchErrors?: string[];
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
  onProgress?: (update: ClassifyProgressUpdate) => void;
}

/** Counts for a Results list scope (e.g. AI-ready bookmarks in review). */
export interface ScopedCategorizationStats {
  inScope: number;
  aiReady: number;
  categorized: number;
  needsClassify: number;
  ineligible: number;
}

export interface CategorizationQueueStats {
  pendingClassify: number;
  pendingReclassify: number;
  pendingDiscover: number;
  ineligible: number;
  skipped: number;
  classified: number;
  classifiedGeneral: number;
  unassignedEligible: number;
  leafCount: number;
  parentCount: number;
  bulkModeActive: boolean;
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
