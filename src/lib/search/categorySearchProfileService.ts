import { embedTexts } from '../ai/openrouterEmbeddings';
import { loadAISettings } from '../ai/settings';
import { DEFAULT_EMBEDDING_MODEL } from '../categorization/service';
import { dbRpc } from '../storage/dbClient';
import type { RankedCategoryProfile } from './categorySearchProfiles';

type PendingCategoryMetadata = {
  categoryId: string;
  text: string;
  textHash: string;
};

let prepareInFlight: Promise<void> | null = null;

async function prepareCategorySearchProfiles(): Promise<void> {
  if (prepareInFlight) return prepareInFlight;
  prepareInFlight = (async () => {
    const prepared = await dbRpc<{
      pendingMetadata: PendingCategoryMetadata[];
      profileCount: number;
    }>('prepareCategorySearchProfiles', [DEFAULT_EMBEDDING_MODEL], { priority: 'low' });
    if (!prepared.pendingMetadata.length) return;

    const settings = await loadAISettings();
    if (!settings.apiKey.trim()) return;
    const vectors = await embedTexts(
      {
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: DEFAULT_EMBEDDING_MODEL,
        timeoutMs: 60_000,
      },
      prepared.pendingMetadata.map((row) => row.text)
    );
    await dbRpc('putCategorySearchMetadataEmbeddings', [
      prepared.pendingMetadata.map((row, index) => ({
        categoryId: row.categoryId,
        embeddingModel: DEFAULT_EMBEDDING_MODEL,
        textHash: row.textHash,
        embedding: vectors[index],
      })),
    ], { priority: 'low' });
  })().catch((error) => {
    // Category semantics enrich Search but must never make text/item-vector
    // search unavailable when the embedding provider is offline.
    console.warn('[Search] Category profile preparation deferred:', error);
  }).finally(() => {
    prepareInFlight = null;
  });
  return prepareInFlight;
}

/** Best-effort persisted metadata/member profile warm, safe outside critical paths. */
export async function warmCategorySearchProfiles(): Promise<void> {
  await prepareCategorySearchProfiles();
}

export async function rankQueryAgainstCategoryProfiles(
  queryEmbedding: number[],
  limit = 10
): Promise<{ matches: RankedCategoryProfile[]; profileCount: number }> {
  await prepareCategorySearchProfiles();
  return dbRpc('rankCategorySearchProfiles', [
    queryEmbedding,
    DEFAULT_EMBEDDING_MODEL,
    limit,
  ]);
}
