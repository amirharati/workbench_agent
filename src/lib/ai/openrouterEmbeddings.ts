import { AIClientError } from './types';
import { openRouterHeaders } from './openrouterHeaders';
import { normalizeAIBackendError } from './errors';

export interface EmbeddingSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
}

interface EmbeddingsResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
  error?: { message?: string };
}

const buildEmbeddingsEndpoint = (baseUrl: string): string => {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  return `${trimmed}/embeddings`;
};

export async function embedTexts(
  settings: EmbeddingSettings,
  inputs: string[],
  batchSize = 48,
  signal?: AbortSignal
): Promise<number[][]> {
  if (!settings.apiKey.trim()) {
    throw normalizeAIBackendError(
      new AIClientError('invalid-config', 'Missing API key for embeddings.')
    );
  }
  if (!inputs.length) return [];

  const endpoint = buildEmbeddingsEndpoint(settings.baseUrl);
  const all: number[][] = new Array(inputs.length);

  for (let offset = 0; offset < inputs.length; offset += batchSize) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const chunk = inputs.slice(offset, offset + batchSize);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), settings.timeoutMs ?? 60_000);
    const abortFromCaller = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abortFromCaller, { once: true });

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: openRouterHeaders(settings.apiKey, 'Homebase Embeddings'),
        signal: controller.signal,
        body: JSON.stringify({
          model: settings.model,
          input: chunk,
          encoding_format: 'float',
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new AIClientError(
          response.status === 401 || response.status === 403
            ? 'auth'
            : response.status === 402
              ? 'quota'
              : response.status === 429
                ? 'rate-limit'
                : 'provider',
          errText || `Embeddings HTTP ${response.status}`,
          { status: response.status }
        );
      }

      const json = (await response.json()) as EmbeddingsResponse;
      if (json.error?.message) {
        throw new AIClientError('provider', json.error.message);
      }

      const rows = json.data ?? [];
      for (const row of rows) {
        const idx = row.index ?? 0;
        if (row.embedding) all[offset + idx] = row.embedding;
      }
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      throw normalizeAIBackendError(error, 'The embeddings request failed.');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  if (all.some((v) => !v)) {
    throw normalizeAIBackendError(
      new AIClientError('provider', 'Embeddings response missing vectors.')
    );
  }

  return all;
}
