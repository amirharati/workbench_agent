import { loadEnvFile, embeddingSettingsFromEnv } from '../../categorize/lib/loadEnv.mjs';
import { embedTexts } from '../../../src/lib/ai/openrouterEmbeddings';
import { DEFAULT_EMBEDDING_MODEL } from '../../../src/lib/categorization/service';

export { loadEnvFile, embeddingSettingsFromEnv };

export function cliEmbeddingSettings() {
  const env = embeddingSettingsFromEnv();
  return {
    apiKey: env.apiKey,
    baseUrl: env.baseUrl,
    model: env.model || DEFAULT_EMBEDDING_MODEL,
    timeoutMs: env.timeoutMs ?? 60_000,
  };
}

export async function embedQueryTexts(texts: string[]): Promise<number[][]> {
  const settings = cliEmbeddingSettings();
  if (!settings.apiKey.trim()) {
    throw new Error('Missing OPENROUTER_API_KEY for embeddings.');
  }
  return embedTexts(settings, texts, 48);
}

export async function embedSingleQuery(text: string): Promise<number[] | undefined> {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    const [vec] = await embedQueryTexts([trimmed]);
    return vec;
  } catch (err) {
    console.warn(`[search-cli] embed failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}
