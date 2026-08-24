import { dbRpc } from '../storage/dbClient';
import type { ItemCategoryMetricEvidenceResult } from './categoryMetricClassifier';
import { DEFAULT_EMBEDDING_MODEL } from './service';

let preparePromise: Promise<void> | null = null;
let lastPreparedAt = 0;

/** Refresh local member centroids/revisions without waiting for missing metadata embeddings. */
export async function prepareCategoryMetricProfiles(): Promise<void> {
  if (Date.now() - lastPreparedAt < 5_000) return;
  if (!preparePromise) {
    preparePromise = dbRpc('prepareCategorySearchProfiles', [DEFAULT_EMBEDDING_MODEL], {
      priority: 'low',
    })
      .then(() => {
        lastPreparedAt = Date.now();
      })
      .catch(() => undefined)
      .finally(() => {
        preparePromise = null;
      });
  }
  await preparePromise;
}

/** Best-effort local evidence; metric unavailability must not fail LLM classify. */
export async function getItemCategoryMetricEvidence(
  itemId: string
): Promise<ItemCategoryMetricEvidenceResult> {
  try {
    return await dbRpc<ItemCategoryMetricEvidenceResult>(
      'rankItemCategoryMetricEvidence',
      [itemId],
      { priority: 'low' }
    );
  } catch (error) {
    return {
      itemId,
      embeddingAvailable: false,
      candidates: [],
      rejectedCategoryIds: [],
      profileCount: 0,
      acceptedExampleCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
