import { loadProjectEnvFromImportMeta } from '../../lib/loadProjectEnv.mjs';

export function loadEnvFile() {
  loadProjectEnvFromImportMeta(import.meta.url);
}

export function embeddingSettingsFromEnv() {
  return {
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_EMBEDDING_MODEL || 'openai/text-embedding-3-small',
    timeoutMs: 60_000,
  };
}

export function classifySettingsFromEnv() {
  return {
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    timeoutMs: 90_000,
    maxOutputTokens: 3200,
    temperature: 0.1,
  };
}
