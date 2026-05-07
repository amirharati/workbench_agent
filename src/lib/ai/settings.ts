import { AISettings } from './types';

const AI_SETTINGS_STORAGE_KEY = 'ai.settings.v1';

const DEFAULT_AI_SETTINGS: AISettings = {
  provider: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'openai/gpt-4o-mini',
  apiKey: '',
  timeoutMs: 25_000,
  temperature: 0.2,
  maxOutputTokens: 700,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const sanitizeSettings = (value: Partial<AISettings> | null | undefined): AISettings => {
  const provider = value?.provider === 'openrouter' ? 'openrouter' : DEFAULT_AI_SETTINGS.provider;
  const baseUrl = typeof value?.baseUrl === 'string' && value.baseUrl.trim()
    ? value.baseUrl.trim()
    : DEFAULT_AI_SETTINGS.baseUrl;
  const model = typeof value?.model === 'string' && value.model.trim()
    ? value.model.trim()
    : DEFAULT_AI_SETTINGS.model;
  const apiKey = typeof value?.apiKey === 'string' ? value.apiKey.trim() : '';
  const timeoutCandidate = value?.timeoutMs;
  const timeoutMs = Number.isFinite(timeoutCandidate)
    ? clamp(Math.round(timeoutCandidate as number), 3_000, 120_000)
    : DEFAULT_AI_SETTINGS.timeoutMs;
  const temperatureCandidate = value?.temperature;
  const temperature = Number.isFinite(temperatureCandidate)
    ? clamp(temperatureCandidate as number, 0, 2)
    : DEFAULT_AI_SETTINGS.temperature;
  const maxOutputTokensCandidate = value?.maxOutputTokens;
  const maxOutputTokens = Number.isFinite(maxOutputTokensCandidate)
    ? clamp(Math.round(maxOutputTokensCandidate as number), 64, 8_192)
    : DEFAULT_AI_SETTINGS.maxOutputTokens;

  return {
    provider,
    baseUrl,
    model,
    apiKey,
    timeoutMs,
    temperature,
    maxOutputTokens,
  };
};

export const getDefaultAISettings = (): AISettings => ({ ...DEFAULT_AI_SETTINGS });

export const loadAISettings = async (): Promise<AISettings> => {
  const result = await chrome.storage.local.get(AI_SETTINGS_STORAGE_KEY);
  return sanitizeSettings(result[AI_SETTINGS_STORAGE_KEY] as Partial<AISettings> | undefined);
};

export const saveAISettings = async (settings: AISettings): Promise<AISettings> => {
  const clean = sanitizeSettings(settings);
  await chrome.storage.local.set({ [AI_SETTINGS_STORAGE_KEY]: clean });
  return clean;
};
