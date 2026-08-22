import { describe, expect, it } from 'vitest';
import type { AiItemSignal } from '../categorization/types';
import { getEmbeddingDimensions, resolvePipelineStageFromParts } from './pipelineStage';

function signal(overrides: Partial<AiItemSignal> = {}): AiItemSignal {
  return {
    itemId: 'item-1',
    textHash: 'hash',
    embeddingModel: 'model',
    embedding: [],
    derivedTags: [],
    signalStatus: 'ok',
    classifyState: 'pending_classify',
    lastProcessedAt: 1,
    ...overrides,
  };
}

const enrichment = {
  itemId: 'item-1',
  normalizedUrl: 'https://example.com',
  status: 'ok' as const,
  providerId: 'test',
  attempts: 1,
  hasRawBody: true,
  aiStatus: 'ok' as const,
  updated_at: 1,
};

describe('pipeline embedding status', () => {
  it('does not guess that hash/model metadata means a vector exists', () => {
    const stage = resolvePipelineStageFromParts({ enrichment, signal: signal() });
    expect(stage.embedded).toBe(false);
    expect(stage.missing).toContain('embed');
  });

  it('recognizes a worker-provided vector dimension count without vector bytes', () => {
    const metadataOnlySignal = signal({ embedding: [], embeddingDimensions: 1536 });
    expect(getEmbeddingDimensions(metadataOnlySignal)).toBe(1536);
    const stage = resolvePipelineStageFromParts({ enrichment, signal: metadataOnlySignal });
    expect(stage.embedded).toBe(true);
  });

  it('prefers locally available vector bytes when they are present', () => {
    expect(getEmbeddingDimensions(signal({ embedding: [0.1, 0.2], embeddingDimensions: 1536 }))).toBe(2);
  });
});
