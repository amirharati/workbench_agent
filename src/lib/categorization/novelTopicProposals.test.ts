import { describe, expect, it } from 'vitest';
import type { AiItemSignal } from './types';
import {
  aggregateNovelTopicProposals,
  novelTopicProposalKey,
  queueNovelTopicProposalSignals,
} from './novelTopicProposals';

function signal(
  itemId: string,
  name: string,
  overrides: Partial<AiItemSignal> = {}
): AiItemSignal {
  return {
    itemId,
    textHash: `hash-${itemId}`,
    embeddingModel: 'model',
    embedding: [0.1],
    derivedTags: [],
    signalStatus: 'ok',
    classifyState: 'pending_discover',
    discoverState: 'pending',
    isNovelty: true,
    lastProcessedAt: 10,
    llmReview: {
      decisionType: 'none',
      novelTopicSuggestion: {
        name,
        description: `${name} description`,
        canonicalTags: [name.toLowerCase()],
      },
    },
    ...overrides,
  };
}

describe('durable novel-topic proposals', () => {
  it('groups per-bookmark no-match evidence without creating category-shaped rows', () => {
    const groups = aggregateNovelTopicProposals({
      signals: [
        signal('one', 'Habit tracking'),
        signal('two', ' habit-tracking ', { lastProcessedAt: 20 }),
        signal('resolved', 'Habit tracking'),
      ],
      items: [
        { id: 'one', title: 'Q4 habits' },
        { id: 'two', title: 'Weekly habits' },
        { id: 'resolved', title: 'Resolved item' },
      ],
      activeCategoryItemIds: new Set(['resolved']),
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: '::habit tracking',
      proposal: { name: 'Habit tracking' },
      itemCount: 2,
      sampleItems: [
        { itemId: 'one', title: 'Q4 habits' },
        { itemId: 'two', title: 'Weekly habits' },
      ],
    });
    expect(groups[0]).not.toHaveProperty('id');
    expect(groups[0]).not.toHaveProperty('status');
  });

  it('queues only the selected unresolved proposal group for reclassification', () => {
    const habit = signal('habit', 'Habit tracking', { classifyRetryCount: 2 });
    const sculpture = signal('sculpture', 'Memory sculpture');
    const resolved = signal('resolved', 'Habit tracking');
    const queued = queueNovelTopicProposalSignals({
      signals: [habit, sculpture, resolved],
      proposalKey: novelTopicProposalKey({ name: 'Habit tracking' }),
      activeCategoryItemIds: new Set(['resolved']),
      now: 50,
    });

    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      itemId: 'habit',
      classifyState: 'pending_reclassify',
      discoverState: 'pending',
      isNovelty: true,
      classifyRetryCount: 0,
      lastProcessedAt: 50,
    });
    expect(queued[0]?.embedding).toEqual([0.1]);
    expect(queued[0]?.llmReview?.novelTopicSuggestion?.name).toBe('Habit tracking');
  });
});
