import { AISettings } from './types';

const AI_SETTINGS_STORAGE_KEY = 'ai.settings.v1';

const DEFAULT_AI_SETTINGS: AISettings = {
  provider: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'openai/gpt-4o-mini',
  apiKey: '',
  /** Enrich/single-shot; batch classify/discover use at least BATCH_AI_TIMEOUT_MS. */
  timeoutMs: 45_000,
  temperature: 0.2,
  maxOutputTokens: 700,
  strictModelMatch: false,
  routingMode: 'single',
  taskModels: {},
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const sanitizeSettings = (value: Partial<AISettings> | null | undefined): AISettings => {
  const provider =
    value?.provider === 'chrome-native' || value?.provider === 'openrouter'
      ? value.provider
      : DEFAULT_AI_SETTINGS.provider;
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
  const strictModelMatch = Boolean(value?.strictModelMatch);
  const routingMode = value?.routingMode === 'by-task' ? 'by-task' : 'single';
  const taskModels: AISettings['taskModels'] = {};
  const inputTaskModels = value?.taskModels;
  if (inputTaskModels && typeof inputTaskModels === 'object') {
    for (const key of ['general', 'summarize', 'tag', 'redirect_verdict', 'vision'] as const) {
      const modelValue = inputTaskModels[key];
      if (typeof modelValue === 'string' && modelValue.trim()) {
        taskModels[key] = modelValue.trim();
      }
    }
  }

  return {
    provider,
    baseUrl,
    model,
    apiKey,
    timeoutMs,
    temperature,
    maxOutputTokens,
    strictModelMatch,
    routingMode,
    taskModels,
  };
};

/** Large catalog + N summaries; OpenRouter often exceeds 25s. */
export const BATCH_AI_TIMEOUT_MS = 90_000;

export function aiSettingsForBatchJob(
  settings: AISettings,
  minOutputTokens = 4000
): AISettings {
  return {
    ...settings,
    timeoutMs: Math.max(settings.timeoutMs, BATCH_AI_TIMEOUT_MS),
    maxOutputTokens: Math.max(settings.maxOutputTokens, minOutputTokens),
  };
}

export const getDefaultAISettings = (): AISettings => ({ ...DEFAULT_AI_SETTINGS });

/** Offscreen/pipeline host can inject settings so jobs don't depend on chrome.storage there. */
let settingsOverride: AISettings | null = null;

export function setAISettingsOverride(settings: AISettings | null): void {
  settingsOverride = settings ? sanitizeSettings(settings) : null;
}

export const loadAISettings = async (): Promise<AISettings> => {
  if (settingsOverride) return { ...settingsOverride };
  try {
    const local = chrome?.storage?.local;
    if (!local) return getDefaultAISettings();
    const result = await local.get(AI_SETTINGS_STORAGE_KEY);
    return sanitizeSettings(result[AI_SETTINGS_STORAGE_KEY] as Partial<AISettings> | undefined);
  } catch {
    return getDefaultAISettings();
  }
};

export const saveAISettings = async (settings: AISettings): Promise<AISettings> => {
  const clean = sanitizeSettings(settings);
  try {
    const local = chrome?.storage?.local;
    if (local) await local.set({ [AI_SETTINGS_STORAGE_KEY]: clean });
  } catch {
    /* ignore — UI may still hold settings in memory */
  }
  return clean;
};
