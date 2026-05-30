import { getDB } from '../db';
import { notifyDataChanged } from '../dataChangeNotifier';
import type { AiTaxonomyState } from './types';
import { DEFAULT_TAXONOMY_STATE } from './types';

const STORE = 'ai_taxonomy_state';
const KEY = 'default';

export async function getTaxonomyState(): Promise<AiTaxonomyState> {
  const db = await getDB();
  if (!db.objectStoreNames.contains(STORE)) {
    return { ...DEFAULT_TAXONOMY_STATE, updated_at: Date.now() };
  }
  const row = await db.get(STORE, KEY);
  if (!row) return { ...DEFAULT_TAXONOMY_STATE, updated_at: Date.now() };
  return { ...DEFAULT_TAXONOMY_STATE, ...row };
}

export async function saveTaxonomyState(
  patch: Partial<Omit<AiTaxonomyState, 'id'>>
): Promise<AiTaxonomyState> {
  const db = await getDB();
  const prev = await getTaxonomyState();
  const next: AiTaxonomyState = {
    ...prev,
    ...patch,
    id: KEY,
    updated_at: Date.now(),
  };
  if (db.objectStoreNames.contains(STORE)) {
    await db.put(STORE, next);
    notifyDataChanged('categorization.update');
  }
  return next;
}

export function effectiveDiscoverThreshold(state: AiTaxonomyState): number {
  return state.bulkModeActive
    ? Math.min(state.discoverBatchThreshold, 30)
    : state.discoverBatchThreshold;
}

export function shouldTriggerDiscover(
  pendingDiscover: number,
  unassignedEligible: number,
  eligibleTotal: number,
  state: AiTaxonomyState
): boolean {
  if (state.bulkModeActive && state.bulkDiscoverRuns >= state.maxBulkDiscoverRuns) return false;
  const threshold = effectiveDiscoverThreshold(state);
  if (pendingDiscover >= threshold) return true;
  if (
    state.bulkModeActive &&
    eligibleTotal > 0 &&
    unassignedEligible >= 80 &&
    unassignedEligible / eligibleTotal >= state.unassignedThresholdPercent / 100
  ) {
    return true;
  }
  return false;
}
