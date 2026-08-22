import type { AiItemSignal } from '../categorization/types';
import { dbRpc } from '../storage/dbClient';
import { getRemoteStore } from '../storage/dbClient/remoteStore';
import type {
  PipelineClassificationCommitInput,
  PipelineDownstreamReconcileResult,
  PipelineStageCommitResult,
} from '../storage/dbWorker/pipelineStageCommit';

function accept(result: PipelineStageCommitResult): void {
  getRemoteStore().acceptPipelineStageCommit(result);
}

export async function commitPipelineEmbeddingSignals(
  signals: AiItemSignal[]
): Promise<PipelineStageCommitResult> {
  const result = await dbRpc<PipelineStageCommitResult>(
    'pipelineCommitEmbeddingSignals',
    [signals]
  );
  accept(result);
  return result;
}

export async function commitPipelineClassification(
  input: PipelineClassificationCommitInput
): Promise<PipelineStageCommitResult> {
  const result = await dbRpc<PipelineStageCommitResult>(
    'pipelineCommitClassification',
    [input]
  );
  accept(result);
  return result;
}

export async function reconcilePipelineDownstream(): Promise<PipelineDownstreamReconcileResult> {
  const result = await dbRpc<PipelineDownstreamReconcileResult>(
    'pipelineReconcileDownstream',
    [],
    { priority: 'high' }
  );
  accept(result);
  return result;
}
