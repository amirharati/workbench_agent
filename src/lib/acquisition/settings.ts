import type { FetchEngine } from './types';

const STORAGE_KEY = 'acquisition.fetch-engine.v1';
const DEFAULT_ENGINE: FetchEngine = 'v2';

export function normalizeFetchEngine(value: unknown): FetchEngine {
  return value === 'legacy' ? 'legacy' : DEFAULT_ENGINE;
}

export async function loadFetchEngine(): Promise<FetchEngine> {
  try {
    const local = globalThis.chrome?.storage?.local;
    if (!local) return DEFAULT_ENGINE;
    const stored = await local.get(STORAGE_KEY);
    return normalizeFetchEngine(stored[STORAGE_KEY]);
  } catch {
    return DEFAULT_ENGINE;
  }
}

export async function saveFetchEngine(engine: FetchEngine): Promise<FetchEngine> {
  const normalized = normalizeFetchEngine(engine);
  try {
    await globalThis.chrome?.storage?.local?.set({ [STORAGE_KEY]: normalized });
  } catch {
    // The Settings view keeps its current selection even if storage is unavailable.
  }
  return normalized;
}

export const getDefaultFetchEngine = (): FetchEngine => DEFAULT_ENGINE;
