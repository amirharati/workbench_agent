import { describe, expect, it } from 'vitest';
import type { AiCategory } from './types';
import { planTaxonomyMerge } from './taxonomyMergeCore';

function parent(
  id: string,
  name: string,
  source: 'seed' | 'discovered'
): AiCategory {
  return {
    id,
    name,
    kind: 'parent',
    status: 'approved',
    assignable: false,
    source,
    created_at: 1,
    updated_at: 1,
  };
}

describe('broad seed parent merge routing', () => {
  it('absorbs discovered subdomains into the matching broad seed parent', () => {
    const plan = planTaxonomyMerge([
      parent('machine-learning', 'Machine learning & AI research', 'seed'),
      parent('data-analytics', 'Data, databases & analytics', 'seed'),
      parent('science-math', 'Science & mathematics', 'seed'),
      parent('environment-nature', 'Environment, nature & agriculture', 'seed'),
      parent('history-philosophy-religion', 'History, philosophy & religion', 'seed'),
      parent('arts-media-entertainment', 'Arts, culture & entertainment', 'seed'),
      parent('hardware', 'Hardware & electronics', 'seed'),
      parent('proposed-databases', 'Database engineering', 'discovered'),
      parent('proposed-math', 'Mathematics resources', 'discovered'),
      parent('proposed-film', 'Movie and television guides', 'discovered'),
      parent('proposed-hardware', 'Embedded systems hardware', 'discovered'),
      parent('proposed-climate', 'Climate and sustainability', 'discovered'),
      parent('proposed-philosophy', 'Philosophy and ethics', 'discovered'),
    ]);

    expect(plan.audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ absorbed: 'proposed-databases', canonical: 'data-analytics' }),
      expect.objectContaining({ absorbed: 'proposed-math', canonical: 'science-math' }),
      expect.objectContaining({ absorbed: 'proposed-film', canonical: 'arts-media-entertainment' }),
      expect.objectContaining({ absorbed: 'proposed-hardware', canonical: 'hardware' }),
      expect.objectContaining({ absorbed: 'proposed-climate', canonical: 'environment-nature' }),
      expect.objectContaining({ absorbed: 'proposed-philosophy', canonical: 'history-philosophy-religion' }),
    ]));
  });

  it('does not collapse statistics or data domains into machine learning', () => {
    const plan = planTaxonomyMerge([
      parent('machine-learning', 'Machine learning & AI research', 'seed'),
      parent('data-analytics', 'Data, databases & analytics', 'seed'),
      parent('science-math', 'Science & mathematics', 'seed'),
      parent('proposed-statistics', 'Statistics and mathematics', 'discovered'),
      parent('proposed-data', 'Data analytics', 'discovered'),
    ]);

    expect(plan.audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ absorbed: 'proposed-statistics', canonical: 'science-math' }),
      expect.objectContaining({ absorbed: 'proposed-data', canonical: 'data-analytics' }),
    ]));
    expect(plan.audit).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ absorbed: 'proposed-statistics', canonical: 'machine-learning' }),
      expect.objectContaining({ absorbed: 'proposed-data', canonical: 'machine-learning' }),
    ]));
  });
});
