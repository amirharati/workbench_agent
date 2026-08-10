/** Shared progress presentation types. Pipeline execution lives in durablePipelineEngine. */
export type ItemPipelinePhase = 'prep' | 'enrich' | 'embed' | 'classify' | 'discover' | 'save' | 'done';

export interface ItemPipelineProgress {
  phase: ItemPipelinePhase;
  label: string;
  current: number;
  total: number;
}

export function formatItemPipelineProgress(update: ItemPipelineProgress): string {
  if (update.label?.trim()) return update.label;
  switch (update.phase) {
    case 'prep': return 'Preparing…';
    case 'enrich': return update.total > 1
      ? `Fetch & AI: ${update.current}/${update.total}`
      : 'Fetching & extracting…';
    case 'embed': return 'Building search embeddings…';
    case 'classify': return update.total > 1
      ? `Classify: ${update.current}/${update.total}`
      : 'Classifying…';
    case 'discover': return 'Discovering topics…';
    case 'save': return 'Saving…';
    case 'done': return 'Complete';
    default: return 'Processing…';
  }
}

export function pipelineProgressBar(update: ItemPipelineProgress): {
  current: number;
  total: number;
} {
  switch (update.phase) {
    case 'prep': return { current: 0, total: 4 };
    case 'enrich': return {
      current: update.total > 0 ? update.current : 0,
      total: Math.max(update.total, 1),
    };
    case 'embed': return { current: 2, total: 4 };
    case 'classify': return {
      current: update.total > 1 ? update.current : 3,
      total: Math.max(update.total, 4),
    };
    case 'discover': return { current: 3, total: 4 };
    case 'save':
    case 'done': return { current: 4, total: 4 };
    default: return { current: update.current, total: Math.max(update.total, 1) };
  }
}
