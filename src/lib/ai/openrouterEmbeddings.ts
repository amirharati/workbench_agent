import { AIClientError } from './types';
import { openRouterHeaders } from './openrouterHeaders';

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
  batchSize = 48
): Promise<number[][]> {
  if (!settings.apiKey.trim()) {
    throw new AIClientError('invalid-config', 'Missing API key for embeddings.');
  }
  if (!inputs.length) return [];

  const endpoint = buildEmbeddingsEndpoint(settings.baseUrl);
  const all: number[][] = new Array(inputs.length);

  for (let offset = 0; offset < inputs.length; offset += batchSize) {
    const chunk = inputs.slice(offset, offset + batchSize);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), settings.timeoutMs ?? 60_000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: openRouterHeaders(settings.apiKey, 'Workbench Agent Embeddings'),
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
          response.status === 429 ? 'rate-limit' : 'provider',
          errText || `Embeddings HTTP ${response.status}`
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
    } finally {
      clearTimeout(timeout);
    }
  }

  if (all.some((v) => !v)) {
    throw new AIClientError('provider', 'Embeddings response missing vectors.');
  }

  return all;
}
