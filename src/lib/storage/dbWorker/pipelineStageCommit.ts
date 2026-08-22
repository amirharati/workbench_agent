import type {
  AiCategory,
  AiItemCategoryLink,
  AiItemSignal,
  ClassifyState,
} from '../../categorization/types';
import {
  classifyStateForLinkQualityLeaf,
  isLinkQualityLeafId,
} from '../../categorization/linkQuality';
import { isGeneralLeafId } from '../../categorization/taxonomyCatalog';

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

function isCountableAiLink(link: AiItemCategoryLink): boolean {
  return (
    link.source === 'ai' &&
    (link.status === 'suggested' || link.status === 'accepted')
  );
}

function categoryStrength(categoryId: string): number {
  if (isLinkQualityLeafId(categoryId)) return 0;
  if (isGeneralLeafId(categoryId)) return 1;
  return 2;
}

/**
 * Pick one stable UI/queue primary from an additive category set.
 * Accepted evidence is locked. Otherwise an existing primary remains stable
 * until a more specific category arrives; equal-strength reruns only add
 * secondaries and never churn the primary.
 */
export function selectAdditivePrimary(
  links: AiItemCategoryLink[],
  previousPrimaryId?: string
): AiItemCategoryLink | undefined {
  const active = links.filter(isCountableAiLink);
  if (!active.length) return undefined;

  const acceptedPrimary = active.find(
    (link) => link.status === 'accepted' && link.isPrimary
  );
  if (acceptedPrimary) return acceptedPrimary;

  const accepted = active
    .filter((link) => link.status === 'accepted')
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0];
  if (accepted) return accepted;

  const previous = previousPrimaryId
    ? active.find((link) => link.id === previousPrimaryId || link.categoryId === previousPrimaryId)
    : undefined;
  const strongest = Math.max(...active.map((link) => categoryStrength(link.categoryId)));
  if (previous && categoryStrength(previous.categoryId) >= strongest) return previous;

  return active
    .filter((link) => categoryStrength(link.categoryId) === strongest)
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return b.score - a.score || a.created_at - b.created_at || a.id.localeCompare(b.id);
    })[0];
}

function stateForAdditivePrimary(
  primary: AiItemCategoryLink,
  existingSignal: AiItemSignal | undefined
): Pick<
  AiItemSignal,
  'classifyState' | 'discoverState' | 'isNovelty' | 'classifyRetryCount'
> {
  if (primary.status === 'accepted' || existingSignal?.classifyState === 'manual_only') {
    return {
      classifyState: 'manual_only',
      discoverState: 'none',
      isNovelty: false,
      classifyRetryCount: 0,
    };
  }
  if (isLinkQualityLeafId(primary.categoryId)) {
    return {
      classifyState: classifyStateForLinkQualityLeaf(primary.categoryId),
      discoverState: 'none',
      isNovelty: false,
      classifyRetryCount: 0,
    };
  }
  if (isGeneralLeafId(primary.categoryId)) {
    return {
      classifyState: 'classified_general',
      discoverState: 'pending',
      isNovelty: true,
      classifyRetryCount: 0,
    };
  }
  return {
    classifyState: 'classified',
    discoverState: 'none',
    isNovelty: false,
    classifyRetryCount: 0,
  };
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
      const additive = !write.removeAiSuggested && write.links.length > 0;
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
        const previous = existingLinks.find((row) => row.id === link.id);
        // A user rejection is durable negative evidence. Normal reruns may add
        // other categories but must never silently resurrect this one.
        if (additive && previous?.status === 'rejected') continue;
        store.putLink(
          additive && previous
            ? {
                ...previous,
                score: Math.max(previous.score, link.score),
                status: previous.status === 'accepted' ? 'accepted' : link.status,
                updated_at: Math.max(previous.updated_at, link.updated_at),
              }
            : link
        );
      }
      let additivePrimary: AiItemCategoryLink | undefined;
      let additiveLinks: AiItemCategoryLink[] = [];
      if (additive) {
        additiveLinks = store.getLinksByItem(write.itemId).filter(isCountableAiLink);
        additivePrimary = selectAdditivePrimary(additiveLinks, existingPrimary?.categoryId);
        if (additivePrimary) {
          const updatedAt = Math.max(
            write.signal.lastProcessedAt,
            ...additiveLinks.map((link) => link.updated_at)
          );
          for (const link of additiveLinks) {
            const shouldBePrimary = link.id === additivePrimary.id;
            if (link.isPrimary !== shouldBePrimary) {
              store.putLink({ ...link, isPrimary: shouldBePrimary, updated_at: updatedAt });
            }
          }
          additiveLinks = store.getLinksByItem(write.itemId).filter(isCountableAiLink);
          additivePrimary = additiveLinks.find(isCountableAiPrimary);
        }
      }
      const merged = mergeClassificationSignal(existingSignal, write.signal);
      const next = additive && additivePrimary
        ? {
            ...merged,
            ...stateForAdditivePrimary(additivePrimary, existingSignal),
            llmReview: {
              ...merged.llmReview,
              categoryIds: additiveLinks.map((link) => link.categoryId),
            },
            lastClassifySkipReason:
              existingPrimary && additivePrimary.id === existingPrimary.id
                ? `Added classification evidence; kept primary ${additivePrimary.categoryId}`
                : merged.lastClassifySkipReason,
          }
        : additive
        ? {
            ...merged,
            classifyState:
              existingSignal && !classifyStateRequiresPrimary(existingSignal.classifyState)
                ? existingSignal.classifyState
                : 'pending_discover',
            discoverState: existingSignal?.discoverState ?? 'pending',
            isNovelty: true,
            llmReview: {
              ...merged.llmReview,
              categoryIds: [],
            },
            lastClassifySkipReason:
              'Classification produced only previously rejected categories; kept them rejected',
          }
        : preservePreviousAssignment && existingSignal
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
