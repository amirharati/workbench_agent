import type { EnrichmentResult } from '../enrichment';
import { PIPELINE_STAGE_LABELS } from './pipelineDictionary';
import type { ItemPipelineProgress } from './itemPipeline';

export type SingleLinkDigestPhase = ItemPipelineProgress['phase'];
export interface SingleLinkDigestProgress extends ItemPipelineProgress {}

export interface SingleLinkDigestResult {
  itemId: string;
  enrich: EnrichmentResult;
  classifyAttempted: boolean;
  classifyProcessed: number;
  classifyError?: string;
  message: string;
}

// Compatibility signal for UI refresh guards. Execution is never owned here.
let activeClientJobs = 0;
export function setPipelineClientJobActive(active: boolean): void {
  activeClientJobs = Math.max(0, activeClientJobs + (active ? 1 : -1));
}
export function isAnyDigestInFlight(): boolean {
  return activeClientJobs > 0;
}
export function isDigestInFlight(_itemId: string): boolean {
  return activeClientJobs > 0;
}

export function formatDigestProgressLabel(phase: SingleLinkDigestPhase): string {
  switch (phase) {
    case 'prep': return 'Preparing…';
    case 'enrich': return `${PIPELINE_STAGE_LABELS.fetch} & ${PIPELINE_STAGE_LABELS.enrich}…`;
    case 'embed': return `${PIPELINE_STAGE_LABELS.embed}…`;
    case 'classify': return `${PIPELINE_STAGE_LABELS.classify}…`;
    case 'discover': return `${PIPELINE_STAGE_LABELS.discover}…`;
    case 'save': return 'Saving…';
    case 'done': return 'Complete';
    default: return 'Processing…';
  }
}
