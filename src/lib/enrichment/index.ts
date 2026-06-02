export {
  describeEnrichmentError,
  describeAiFailure,
  formatEnrichmentFailureMessage,
  ENRICHMENT_ERROR_HINTS,
  AI_STATUS_HINTS,
} from './errorMessages';
export {
  resolveEnrichmentFailureLabel,
  isEnrichmentFailure,
  countFailuresByCategory,
  formatFailureCategoryBreakdown,
  failureFieldsFromEnrichment,
  FAILURE_CATEGORY_LABELS,
  FAILURE_CATEGORY_REVIEW_HINTS,
} from './failureLabels';
export type { EnrichmentFailureLabel, FailureCategory, FailureStage } from './failureLabels';
export * from './types';
export * from './eligibility';
export { getPlacementNotes } from './itemText';
export {
  buildCategorizationText,
  CATEGORIZATION_SNIPPET_MAX_CHARS,
} from './categorizationText';
export {
  buildSearchEmbedText,
  searchEmbedTextLength,
  MIN_SEARCH_EMBED_TEXT_LENGTH,
} from './searchEmbedText';
export { ensureItemEmbedding, embedIncrementalBatch, getEmbedBackfillStats } from './embedItemSignal';
export type {
  EnsureItemEmbeddingResult,
  EmbedBatchSummary,
  EmbedBackfillStats,
  EmbedBackfillProgress,
} from './embedItemSignal';
export type { BuildCategorizationTextOptions } from './categorizationText';
export {
  buildAllDataModelFields,
  buildFillableFields,
  labelColor,
  summarizeDataModel,
  dataModelLabelColor,
} from './fieldInventory';
export type {
  DataModelRow,
  FieldStore,
  FillableFieldRow,
  FillableFieldState,
} from './fieldInventory';
export * from './parse';
export {
  clearPipelineData,
  clearItemPipelineStage,
  syncClassifySignalsFromLinks,
  type ClearPipelineDataOptions,
  type ClearPipelineDataResult,
  type ClearItemPipelineStageResult,
  type PipelineStageClear,
} from './pipelineReset';
export {
  enrichOne,
  enrichBatch,
  reextractAI,
  isSnippetTooShortForAI,
  checkEligibility,
  checkUrlEligibility,
  getEnrichmentState,
  listNeedsAttention,
  registerFetchProvider,
  getFetchProvider,
  useNoopProvider,
  useJinaProvider,
  useHybridProvider,
  deleteEnrichmentForItem,
  buildItemText,
  buildItemTextAsync,
  loadRawBody,
  getEnrichment,
  getAllEnrichments,
} from './fetchService';
export {
  isPipelineDebugEnabled,
  setPipelineDebugEnabled,
  PIPELINE_DEBUG_DEFAULT_ENABLED,
  getPipelineDebugCount,
  purgeAllPipelineDebug,
  getAllPipelineDebugRecords,
  type PipelineDebugRecord,
  type PipelineDebugPayload,
} from './pipelineDebug';
