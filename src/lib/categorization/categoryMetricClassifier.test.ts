import { describe, expect, it } from 'vitest';
import {
  rankCategoryMetricCandidates,
  resolveCategoryClassificationEnsemble,
  type CategoryMetricProfileEvidence,
} from './categoryMetricClassifier';

const evidence = (
  categoryId: string,
  patch: Partial<CategoryMetricProfileEvidence> = {}
): CategoryMetricProfileEvidence => ({
  categoryId,
  profileScore: 0,
  definitionScore: 0,
  aggregateScore: 0,
  memberCount: 0,
  acceptedNeighborScores: [],
  ...patch,
});

describe('category metric classifier', () => {
  it('accepts strong category profiles without requiring member examples', () => {
    const rows = rankCategoryMetricCandidates([
      evidence('airbnb', { profileScore: 0.61, definitionScore: 0.61 }),
      evidence('weak', { profileScore: 0.4, definitionScore: 0.4 }),
    ]);
    expect(rows.map((row) => row.categoryId)).toEqual(['airbnb']);
  });

  it('uses an accepted near neighbor to preserve a narrow category mode', () => {
    const rows = rankCategoryMetricCandidates([
      evidence('airbnb', {
        profileScore: 0.44,
        definitionScore: 0.35,
        aggregateScore: 0.63,
        memberCount: 1,
        acceptedNeighborScores: [0.65],
      }),
    ]);
    expect(rows[0]).toMatchObject({ categoryId: 'airbnb', exampleCount: 1 });
    expect(rows[0].score).toBeGreaterThan(0.63);
  });

  it('keeps broad and narrow Airbnb evidence while excluding an unsupported nearby label', () => {
    const rows = rankCategoryMetricCandidates([
      evidence('housing', {
        profileScore: 0.661,
        definitionScore: 0.337,
        aggregateScore: 0.668,
        memberCount: 19,
      }),
      evidence('airbnb', {
        profileScore: 0.44,
        definitionScore: 0.348,
        aggregateScore: 0.632,
        memberCount: 1,
        acceptedNeighborScores: [0.642],
      }),
      evidence('toronto-market', {
        profileScore: 0.479,
        definitionScore: 0.479,
        aggregateScore: 0,
        memberCount: 0,
      }),
    ]);
    expect(rows.map((row) => row.categoryId)).toEqual(['housing', 'airbnb']);
  });

  it('does not let a weak single example create a category result', () => {
    expect(rankCategoryMetricCandidates([
      evidence('noise', {
        profileScore: 0.3,
        definitionScore: 0.2,
        aggregateScore: 0.3,
        memberCount: 1,
        acceptedNeighborScores: [0.5],
      }),
    ])).toEqual([]);
  });

  it('removes rejected item-category pairs without suppressing the category globally', () => {
    const input = [evidence('airbnb', { profileScore: 0.7 })];
    expect(rankCategoryMetricCandidates(input, new Set(['airbnb']))).toEqual([]);
    expect(rankCategoryMetricCandidates(input).map((row) => row.categoryId)).toEqual(['airbnb']);
  });

  it('filters an item-local rejection from both LLM and metric ensemble inputs', () => {
    const metric = rankCategoryMetricCandidates([
      evidence('airbnb', { profileScore: 0.7 }),
      evidence('housing', { profileScore: 0.65 }),
    ]);
    expect(resolveCategoryClassificationEnsemble({
      llmCategoryIds: ['airbnb', 'housing'],
      metricCandidates: metric,
      rejectedCategoryIds: new Set(['airbnb']),
    }).categoryIds).toEqual(['housing']);
  });

  it('keeps compatible LLM and metric categories additively', () => {
    const metric = rankCategoryMetricCandidates([
      evidence('airbnb', { profileScore: 0.65 }),
    ]);
    expect(resolveCategoryClassificationEnsemble({
      llmCategoryIds: ['housing'],
      metricCandidates: metric,
    })).toMatchObject({
      categoryIds: ['housing', 'airbnb'],
      primaryCategoryId: 'housing',
    });
  });

  it('promotes a metric-specific category over an LLM General fallback', () => {
    const metric = rankCategoryMetricCandidates([
      evidence('airbnb', { profileScore: 0.65 }),
    ]);
    expect(resolveCategoryClassificationEnsemble({
      llmCategoryIds: ['travel-general'],
      metricCandidates: metric,
    }).categoryIds).toEqual(['airbnb', 'travel-general']);
  });

  it('can classify from embedding evidence when the LLM returns no category', () => {
    const metric = rankCategoryMetricCandidates([
      evidence('airbnb', { profileScore: 0.65 }),
    ]);
    expect(resolveCategoryClassificationEnsemble({ metricCandidates: metric })).toMatchObject({
      categoryIds: ['airbnb'],
      primaryCategoryId: 'airbnb',
    });
  });
});
