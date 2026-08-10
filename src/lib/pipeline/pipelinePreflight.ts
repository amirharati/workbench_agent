import { loadPipelineMaintenanceSnapshot } from './pipelineMaintenanceSnapshot';

export type PipelinePreflight = { ok: boolean; reason?: string };

export async function preflightPipelineStart(): Promise<PipelinePreflight> {
  const { blockers } = await loadPipelineMaintenanceSnapshot();
  if (blockers.needsApiKey) {
    return { ok: false, reason: 'Add AI API key in Settings.' };
  }
  return { ok: true };
}

/** Compatibility name for Import Studio call sites. */
export const preflightImportPipelineStart = preflightPipelineStart;
