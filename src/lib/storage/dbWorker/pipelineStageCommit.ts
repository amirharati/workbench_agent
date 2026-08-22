import type {
  AiCategory,
  AiItemCategoryLink,
  AiItemSignal,
  ClassifyState,
} from '../../categorization/types';

const CLASSIFIED_STATES = new Set<ClassifyState>([
  'classified',
  'classified_general',
  'classified_removal',
  'classified_attention',
]);

export interface PipelineClassificationWrite {
  itemId: string;
  signal: AiItemSignal;
  links: AiItemCategoryLink[];
  removeAiSuggested: boolean;
}

export interface PipelineClassificationCommitInput {
  categories: AiCategory[];
  itemWrites: PipelineClassificationWrite[];
}

export interface PipelineStageCommitResult {
  itemIds: string[];
  signals: AiItemSignal[];
  links: AiItemCategoryLink[];
  categories: AiCategory[];
  revision: number;
}

export interface PipelineDownstreamReconcileResult extends PipelineStageCommitResult {
  linksRestored: number;
  signalsRequeued: number;
  missingEmbeddings: number;
}

export interface PipelineCommitStore {
  getSignal(itemId: string): AiItemSignal | undefined;
  putSignal(signal: AiItemSignal): void;
  getLinksByItem(itemId: string): AiItemCategoryLink[];
  putLink(link: AiItemCategoryLink): void;
  deleteLink(id: string): void;
  putCategory(category: AiCategory): void;
  withTransaction<T>(fn: () => T): T;
}

/** Embedding owns only vector-search fields; it must preserve classification work. */
export function mergeEmbeddingSignal(
  existing: AiItemSignal | undefined,
  incoming: AiItemSignal
): AiItemSignal {
  return {
    ...incoming,
    classifyTextHash: existing?.classifyTextHash ?? incoming.classifyTextHash,
    classifyState: existing?.classifyState ?? incoming.classifyState,
    discoverState: existing?.discoverState ?? incoming.discoverState,
    isNovelty: existing?.isNovelty ?? incoming.isNovelty,
    classifyRetryCount: existing?.classifyRetryCount ?? incoming.classifyRetryCount,
    lastClassifySkipReason:
      existing?.lastClassifySkipReason ?? incoming.lastClassifySkipReason,
    eligibilityReason: existing?.eligibilityReason ?? incoming.eligibilityReason,
    inputQualityTier: existing?.inputQualityTier ?? incoming.inputQualityTier,
    lastClassifiedAt: existing?.lastClassifiedAt ?? incoming.lastClassifiedAt,
    llmReview: existing?.llmReview ?? incoming.llmReview,
  };
}

/** Classification owns queue/category fields; it must never replace a stored vector. */
export function mergeClassificationSignal(
  existing: AiItemSignal | undefined,
  incoming: AiItemSignal
): AiItemSignal {
  if (!existing) return incoming;
  return {
    ...incoming,
    textHash: existing.textHash,
    embeddingModel: existing.embeddingModel,
    embedding: existing.embedding,
    derivedTags: existing.derivedTags,
    tagConfidence: existing.tagConfidence,
    signalStatus: existing.signalStatus,
  };
}

export function classifyStateRequiresPrimary(state?: ClassifyState): boolean {
  return state != null && CLASSIFIED_STATES.has(state);
}

export function isCountableAiPrimary(link: AiItemCategoryLink): boolean {
  return (
    link.source === 'ai' &&
    link.isPrimary &&
    (link.status === 'suggested' || link.status === 'accepted')
  );
}

export function signalMetaOnly(signal: AiItemSignal): AiItemSignal {
  return signal.embedding.length
    ? { ...signal, embedding: [], embeddingDimensions: signal.embedding.length }
    : signal;
}

export function commitEmbeddingSignalsInStore(
  store: PipelineCommitStore,
  incoming: AiItemSignal[]
): AiItemSignal[] {
  const committed: AiItemSignal[] = [];
  store.withTransaction(() => {
    for (const signal of incoming) {
      if (!signal?.itemId) throw new Error('Embedding commit requires itemId');
      if (
        signal.signalStatus === 'ok' &&
        (!signal.embedding?.length || signal.embedding.some((value) => !Number.isFinite(value)))
      ) {
        throw new Error(`Embedding commit for ${signal.itemId} has no valid vector`);
      }
      const next = mergeEmbeddingSignal(store.getSignal(signal.itemId), signal);
      store.putSignal(next);
      committed.push(next);
    }
    for (const signal of committed) {
      const stored = store.getSignal(signal.itemId);
      if (!stored) throw new Error(`Embedding commit lost signal ${signal.itemId}`);
      if (
        signal.signalStatus === 'ok' &&
        (stored.embedding.length !== signal.embedding.length ||
          stored.embeddingModel !== signal.embeddingModel ||
          stored.textHash !== signal.textHash)
      ) {
        throw new Error(`Embedding commit verification failed for ${signal.itemId}`);
      }
    }
  });
  return committed;
}

export function commitClassificationInStore(
  store: PipelineCommitStore,
  input: PipelineClassificationCommitInput
): AiItemSignal[] {
  const committedSignals: AiItemSignal[] = [];
  store.withTransaction(() => {
    for (const category of input.categories) store.putCategory(category);
    for (const write of input.itemWrites) {
      if (!write.itemId || write.signal.itemId !== write.itemId) {
        throw new Error('Classification commit itemId mismatch');
      }
      const existingSignal = store.getSignal(write.itemId);
      const existingLinks = store.getLinksByItem(write.itemId);
      const existingPrimary = existingLinks.find(isCountableAiPrimary);
      const incomingHasPrimary = write.links.some(isCountableAiPrimary);
      const preservePreviousAssignment = Boolean(
        write.removeAiSuggested && existingPrimary && !incomingHasPrimary
      );
      if (write.removeAiSuggested && !preservePreviousAssignment) {
        for (const link of existingLinks) {
          if (link.source === 'ai' && link.status === 'suggested') store.deleteLink(link.id);
        }
      }
      for (const link of write.links) {
        if (link.itemId !== write.itemId) {
          throw new Error(`Classification link itemId mismatch for ${write.itemId}`);
        }
        store.putLink(link);
      }
      const merged = mergeClassificationSignal(existingSignal, write.signal);
      const next = preservePreviousAssignment && existingSignal
        ? {
            ...merged,
            classifyTextHash: existingSignal.classifyTextHash,
            classifyState: classifyStateRequiresPrimary(existingSignal.classifyState)
              ? existingSignal.classifyState
              : 'classified',
            discoverState: existingSignal.discoverState,
            isNovelty: existingSignal.isNovelty,
            classifyRetryCount: existingSignal.classifyRetryCount,
            eligibilityReason: existingSignal.eligibilityReason,
            lastClassifiedAt: existingSignal.lastClassifiedAt,
            llmReview: existingSignal.llmReview,
            lastClassifySkipReason:
              write.signal.lastClassifySkipReason ??
              'Kept previous category because reclassification produced no replacement',
          }
        : merged;
      store.putSignal(next);
      committedSignals.push(next);
    }
    for (const signal of committedSignals) {
      if (!classifyStateRequiresPrimary(signal.classifyState)) continue;
      const primary = store.getLinksByItem(signal.itemId).find(isCountableAiPrimary);
      if (!primary) {
        throw new Error(
          `Classification commit refused ${signal.classifyState} without a primary link for ${signal.itemId}`
        );
      }
    }
  });
  return committedSignals;
}
