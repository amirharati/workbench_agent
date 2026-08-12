/** Shared progress presentation types. Pipeline execution lives in durablePipelineEngine. */
export type ItemPipelinePhase = 'prep' | 'enrich' | 'embed' | 'classify' | 'discover' | 'save' | 'done';

export interface ItemPipelineProgress {
  phase: ItemPipelinePhase;
  label: string;
  /** Stage-local progress, when the current domain operation exposes it. */
  current: number;
  total: number;
  /** Authoritative whole-job item progress. Prefer this for user-facing bars/counts. */
  overallCurrent?: number;
  overallTotal?: number;
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
  completed: number;
  percent: number;
} {
  const total = Math.max(1, Math.trunc(
    update.overallTotal && update.overallTotal > 0
      ? update.overallTotal
      : update.total
  ));
  const rawCurrent = update.overallCurrent ?? update.current;
  const completed = Math.min(total, Math.max(0, Math.trunc(
    Number.isFinite(rawCurrent) ? rawCurrent : 0
  )));
  const phaseFraction: Record<ItemPipelinePhase, number> = {
    prep: 0,
    enrich: 0.15,
    embed: 0.55,
    classify: 0.8,
    discover: 0.6,
    save: 0.95,
    done: 1,
  };
  // The fraction gives a useful one-link bar without allowing a stage-local
  // `1/1` update to masquerade as completion of a multi-thousand-item job.
  const current = completed >= total
    ? total
    : Math.min(total, completed + phaseFraction[update.phase]);
  const percent = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
  return { current, total, completed, percent };
}
