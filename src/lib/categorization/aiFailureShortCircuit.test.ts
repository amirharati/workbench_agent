import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../ai/types';
import { AIClientError } from '../ai/types';

const runAICompletionMock = vi.hoisted(() => vi.fn());

vi.mock('../ai/client', () => ({
  runAICompletion: runAICompletionMock,
}));

import { runDiscoverMapReduce } from './discoverMapReduce';
import { resolveTopicExtractBatchWithRetry } from './topicExtract';

const settings: AISettings = {
  provider: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'test-model',
  apiKey: 'bad-key',
  timeoutMs: 45_000,
  temperature: 0.2,
  maxOutputTokens: 700,
  strictModelMatch: false,
  routingMode: 'single',
  taskModels: {},
};

function authError(): AIClientError {
  return new AIClientError(
    'auth',
    'AI authentication failed: Invalid API key. Check the API key in Settings > AI.',
    { status: 401 }
  );
}

describe('terminal AI backend failures', () => {
  beforeEach(() => {
    runAICompletionMock.mockReset();
    runAICompletionMock.mockRejectedValue(authError());
  });

  it('does not retry classification once the provider rejects authentication', async () => {
    const result = await resolveTopicExtractBatchWithRetry(
      settings,
      [],
      [
        { itemId: 'one', title: 'One', textForClassification: 'First item text' },
        { itemId: 'two', title: 'Two', textForClassification: 'Second item text' },
      ],
      new Set(),
      new Map(),
      [],
      1
    );

    expect(runAICompletionMock).toHaveBeenCalledTimes(1);
    expect(result.terminalError).toBe(true);
    expect(result.unresolvedItemIds).toEqual(['one', 'two']);
    expect(result.lastError).toContain('AI authentication failed');
  });

  it('stops discovery map batches after the first backend rejection', async () => {
    const result = await runDiscoverMapReduce(
      settings,
      [],
      [
        { itemId: 'one', title: 'One', aiSummary: 'First summary' },
        { itemId: 'two', title: 'Two', aiSummary: 'Second summary' },
      ],
      { mapBatchSize: 1, maxMapBatches: 2 }
    );

    expect(runAICompletionMock).toHaveBeenCalledTimes(1);
    expect(result.llmErrors).toBe(1);
    expect(result.errors[0]).toContain('AI authentication failed');
  });
});
