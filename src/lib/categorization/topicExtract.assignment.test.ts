import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../ai/types';
import type { AiCategory } from './types';

const runAICompletionMock = vi.hoisted(() => vi.fn());

vi.mock('../ai/client', () => ({
  runAICompletion: runAICompletionMock,
}));

import { resolveTopicExtractBatchWithRetry } from './topicExtract';

const settings: AISettings = {
  provider: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'test-model',
  apiKey: 'test-key',
  timeoutMs: 45_000,
  temperature: 0.2,
  maxOutputTokens: 700,
  strictModelMatch: false,
  routingMode: 'single',
  taskModels: {},
};

const parent: AiCategory = {
  id: 'ai-productivity',
  name: 'AI tools, productivity & knowledge',
  kind: 'parent',
  status: 'approved',
  assignable: false,
  source: 'seed',
  created_at: 1,
  updated_at: 1,
};

const leaf: AiCategory = {
  id: 'seed_ai-productivity-general',
  name: 'Other (AI tools, productivity & knowledge)',
  kind: 'leaf',
  status: 'approved',
  assignable: true,
  parentId: parent.id,
  parentName: parent.name,
  source: 'seed',
  created_at: 1,
  updated_at: 1,
};

const artsParent: AiCategory = {
  ...parent,
  id: 'arts-media-entertainment',
  name: 'Arts, culture & entertainment',
};
const moviesLeaf: AiCategory = {
  ...leaf,
  id: 'seed_movies-tv-streaming',
  name: 'Movies, TV & streaming',
  parentId: artsParent.id,
  parentName: artsParent.name,
};
const relationshipsParent: AiCategory = {
  ...parent,
  id: 'relationships-sexuality',
  name: 'Relationships & sexuality',
};
const relationshipsLeaf: AiCategory = {
  ...leaf,
  id: 'seed_relationships-family',
  name: 'Relationships & family',
  parentId: relationshipsParent.id,
  parentName: relationshipsParent.name,
};

describe('required topic assignment correction', () => {
  beforeEach(() => runAICompletionMock.mockReset());

  it('retries one confident empty answer with a mandatory-assignment prompt', async () => {
    runAICompletionMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          results: [{
            itemId: 'one',
            semanticLabel: 'Human flourishing amid AI',
            freeTopics: ['human flourishing', 'meaningful work', 'AI and society'],
            broadDomain: 'philosophy of work and artificial intelligence',
            evidence: 'Purpose and values in professional life as AI changes work.',
            contentState: 'substantive',
          }],
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          results: [{
            itemId: 'one',
            skip: false,
            topicIds: [],
            proposed: [],
            confidence: 0.92,
            reason: 'Human flourishing in an AI context.',
          }],
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          results: [{
            itemId: 'one',
            skip: false,
            topicIds: [leaf.id],
            proposed: [],
            confidence: 0.9,
            reason: 'Broad AI productivity topic.',
          }],
        }),
      });

    const result = await resolveTopicExtractBatchWithRetry(
      settings,
      [parent, leaf],
      [{
        itemId: 'one',
        title: 'Growing on Purpose',
        textForClassification: 'Jeremy Howard discusses human flourishing in the age of AI.',
      }],
      new Set([leaf.id]),
      new Map([[leaf.id, leaf]]),
      [parent],
      1
    );

    expect(runAICompletionMock).toHaveBeenCalledTimes(3);
    expect(result.decisions.get('one')).toMatchObject({
      decisionType: 'existing',
      categoryIds: [leaf.id],
    });
    expect(runAICompletionMock.mock.calls[2]?.[1]?.messages?.[1]?.content)
      .toContain('REQUIRED CORRECTION');
    expect(runAICompletionMock.mock.calls[0]?.[1]?.messages?.[1]?.content)
      .toContain('without seeing or guessing any taxonomy');
    expect(runAICompletionMock.mock.calls[1]?.[1]?.messages?.[1]?.content)
      .toContain('Classify is read-only over taxonomy');
    expect(runAICompletionMock.mock.calls[1]?.[1]?.messages?.[1]?.content)
      .toContain('Personal growth/development/values” is not Personal finance');
    expect(runAICompletionMock.mock.calls[1]?.[1]?.messages?.[1]?.content)
      .not.toContain('Jeremy Howard discusses human flourishing');
  });

  it('records a genuinely unmatched free topic without creating or force-fitting a category', async () => {
    runAICompletionMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          results: [{
            itemId: 'novel',
            semanticLabel: 'Competitive memory sculpture',
            freeTopics: ['memory sculpture', 'competitive performance'],
            broadDomain: 'novel participatory art practice',
            evidence: 'The item documents a new competition built around sculpting physical memory objects.',
            contentState: 'substantive',
          }],
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          results: [{
            itemId: 'novel',
            matchStatus: 'NO_MATCH',
            skip: false,
            topicIds: [],
            topicPaths: [],
            parentCandidates: [
              { parentId: 'ai-productivity', similarity: 0.08, reason: 'No AI subject.' },
            ],
            novelTopicSuggestion: {
              name: 'Competitive memory sculpture',
              description: 'Participatory competitions involving physical memory sculptures.',
              canonicalTags: ['memory-sculpture', 'performance'],
            },
            confidence: 0.83,
            reason: 'No existing parent has a defensible fit.',
          }],
        }),
      });

    const result = await resolveTopicExtractBatchWithRetry(
      settings,
      [parent, leaf],
      [{
        itemId: 'novel',
        title: 'The Memory Sculpture League',
        textForClassification: 'A new competition involving physical memory sculptures.',
      }],
      new Set([leaf.id]),
      new Map([[leaf.id, leaf]]),
      [parent],
      1
    );

    expect(runAICompletionMock).toHaveBeenCalledTimes(2);
    expect(result.decisions.get('novel')).toMatchObject({
      decisionType: 'none',
      semanticLabel: 'Competitive memory sculpture',
      freeTopics: ['memory sculpture', 'competitive performance'],
      novelTopicSuggestion: {
        name: 'Competitive memory sculpture',
      },
    });
    expect(result.decisions.get('novel')?.categoryIds).toBeUndefined();
    expect(runAICompletionMock.mock.calls[1]?.[1]?.messages?.[1]?.content)
      .toContain('matchStatus: "NO_MATCH"');
  });

  it('classifies a watch page by its save purpose rather than its plot themes', async () => {
    runAICompletionMock
      .mockResolvedValueOnce({
        text: JSON.stringify({ results: [{
          itemId: 'episode',
          semanticLabel: 'Night Harbor TV episode',
          primarySubject: 'A watch page for one television episode',
          likelySavePurpose: 'Watch or return to this television episode',
          contentKind: 'TV episode page',
          secondaryThemes: ['family conflict', 'addiction'],
          freeTopics: ['television episode', 'drama series', 'streaming'],
          broadDomain: 'television and entertainment',
          evidence: 'Relationships and addiction are plot themes inside the saved episode.',
          contentState: 'substantive',
        }] }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ results: [{
          itemId: 'episode',
          skip: false,
          primaryParentId: artsParent.id,
          topicIds: [relationshipsLeaf.id],
          parentCandidates: [
            { parentId: artsParent.id, similarity: 0.97, reason: 'The saved object is a TV episode.' },
            { parentId: relationshipsParent.id, similarity: 0.2, reason: 'Relationship conflict is only a plot theme.' },
          ],
          confidence: 0.7,
          reason: 'Inconsistent leaf despite correct parent.',
        }] }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ results: [{
          itemId: 'episode',
          skip: false,
          primaryParentId: artsParent.id,
          topicPaths: [[artsParent.id, moviesLeaf.id]],
          topicIds: [moviesLeaf.id],
          parentCandidates: [
            { parentId: artsParent.id, similarity: 0.97, reason: 'The link exists to watch this TV episode.' },
            { parentId: relationshipsParent.id, similarity: 0.2, reason: 'Relationships are only depicted in the plot.' },
          ],
          confidence: 0.96,
          reason: 'Classify the saved media object, not plot themes.',
        }] }),
      });

    const categories = [artsParent, moviesLeaf, relationshipsParent, relationshipsLeaf];
    const result = await resolveTopicExtractBatchWithRetry(
      settings,
      categories,
      [{
        itemId: 'episode',
        title: 'Night Harbor - s2 e4 Watch Free',
        textForClassification: 'Episode plot: family conflict, addiction, and a fundraiser.',
      }],
      new Set([moviesLeaf.id, relationshipsLeaf.id]),
      new Map([
        [moviesLeaf.id, moviesLeaf],
        [relationshipsLeaf.id, relationshipsLeaf],
      ]),
      [artsParent, relationshipsParent],
      1
    );

    expect(runAICompletionMock).toHaveBeenCalledTimes(3);
    expect(result.decisions.get('episode')).toMatchObject({
      decisionType: 'existing',
      categoryIds: [moviesLeaf.id],
      primaryParentId: artsParent.id,
      likelySavePurpose: 'Watch or return to this television episode',
    });
    expect(runAICompletionMock.mock.calls[1]?.[1]?.messages?.[1]?.content)
      .toContain('why would the user save it');
  });
});
