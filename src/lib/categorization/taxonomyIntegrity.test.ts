import { describe, expect, it } from 'vitest';
import { mergeDiscoveryLeaves } from './discoverTaxonomy';
import {
  getBundledSeedDocument,
  planMissingBundledHierarchyRepair,
  seedDocumentToCategories,
  validateTaxonomyInvariant,
} from './seedImport';
import { getAssignableLeaves } from './taxonomyCatalog';
import { TOPIC_FEW_SHOT } from './topicFewShot';
import type { AiCategory } from './types';

describe('taxonomy integrity', () => {
  it('accepts a complete freshly-created bundled taxonomy', () => {
    const bundled = seedDocumentToCategories(getBundledSeedDocument(), 10);

    expect(validateTaxonomyInvariant(bundled, bundled)).toEqual([]);
  });

  it('ships broad parent coverage with useful starter leaves and one fallback per topic parent', () => {
    const doc = getBundledSeedDocument();
    const topicalParents = doc.parents.filter((parent) => parent.id !== 'link-quality');

    expect(topicalParents).toHaveLength(23);
    for (const parent of topicalParents) {
      const children = doc.leaves.filter((leaf) => leaf.parentId === parent.id);
      expect(children.filter((leaf) => !leaf.isGeneralFallback).length).toBeGreaterThanOrEqual(3);
      expect(children.filter((leaf) => leaf.isGeneralFallback)).toHaveLength(1);
    }
    expect(doc.leaves.find((leaf) => leaf.id === 'movies-tv-streaming')?.parentId)
      .toBe('arts-media-entertainment');
    expect(doc.leaves.find((leaf) => leaf.id === 'government-services-immigration')?.parentId)
      .toBe('society-government-law');
    expect(doc.leaves.find((leaf) => leaf.id === 'adult-erotic-content')?.parentId)
      .toBe('relationships-sexuality');
  });

  it('keeps every classification example pointed at a bundled category', () => {
    const bundledIds = new Set(
      seedDocumentToCategories(getBundledSeedDocument(), 10).map((category) => category.id)
    );

    for (const example of TOPIC_FEW_SHOT) {
      for (const topicId of example.output.topicIds) {
        expect(bundledIds.has(topicId), `missing few-shot category ${topicId}`).toBe(true);
      }
    }
  });

  it('rejects a partially-created database instead of migrating it', () => {
    const bundled = seedDocumentToCategories(getBundledSeedDocument(), 10);
    const partial = bundled.filter(
      (category) =>
        category.id === 'link-quality' || category.id === 'seed_movies-tv-streaming'
    );

    const errors = validateTaxonomyInvariant(partial, bundled);
    expect(errors).toContain('missing bundled parent "machine-learning"');
    expect(errors).toContain('active leaf "seed_movies-tv-streaming" has no active parent');
  });

  it('repairs only seed-owned flat leaves while preserving their data', () => {
    const bundled = seedDocumentToCategories(getBundledSeedDocument(), 10);
    const target = bundled.find((category) => category.id === 'seed_model-apis-ai-platforms');
    expect(target?.parentId).toBe('ai-productivity');
    const flat = bundled.map((category) => category.id === target?.id
      ? {
          ...category,
          parentId: undefined,
          parentName: undefined,
          itemCount: 19,
          description: 'Preserve this existing description',
          updated_at: 11,
        }
      : category);

    const repairs = planMissingBundledHierarchyRepair(flat, bundled, 20);
    expect(repairs).toHaveLength(1);
    expect(repairs[0]).toMatchObject({
      id: 'seed_model-apis-ai-platforms',
      parentId: 'ai-productivity',
      itemCount: 19,
      description: 'Preserve this existing description',
      updated_at: 20,
    });
    const repaired = flat.map((category) => repairs.find((row) => row.id === category.id) ?? category);
    expect(validateTaxonomyInvariant(repaired, bundled)).toEqual([]);
  });

  it('does not silently reparent wrong or discovered rows', () => {
    const bundled = seedDocumentToCategories(getBundledSeedDocument(), 10);
    const target = bundled.find((category) => category.id === 'seed_model-apis-ai-platforms')!;
    const wrongParent = { ...target, parentId: 'business-product-marketing' };
    const discoveredFlat = { ...target, parentId: undefined, source: 'discovered' as const };

    expect(planMissingBundledHierarchyRepair([wrongParent], bundled)).toEqual([]);
    expect(planMissingBundledHierarchyRepair([discoveredFlat], bundled)).toEqual([]);
  });

  it('rejects invalid leaf hierarchy and never creates discovered error children', () => {
    const bundled = seedDocumentToCategories(getBundledSeedDocument(), 10);
    const movie: AiCategory = {
      id: 'seed_movies-tv-streaming',
      name: 'Movies, TV & streaming',
      kind: 'leaf',
      status: 'approved',
      assignable: true,
      parentId: 'arts-media-entertainment',
      source: 'seed',
      created_at: 1,
      updated_at: 1,
    };
    expect(getAssignableLeaves([movie])).toEqual([]);
    expect(validateTaxonomyInvariant([movie], bundled)).toContain(
      'active leaf "seed_movies-tv-streaming" has no active parent'
    );

    const linkQuality: AiCategory = {
      id: 'link-quality',
      name: 'Link quality',
      kind: 'parent',
      status: 'approved',
      assignable: false,
      source: 'seed',
      created_at: 1,
      updated_at: 1,
    };
    const merged = mergeDiscoveryLeaves(
      [linkQuality],
      [{ parentId: 'link-quality', name: 'Deep Learning Resources' }],
      new Set(['link-quality']),
      1,
      10
    );
    expect(merged.added).toEqual([]);
  });

  it('rejects normal discovered topics under the Link quality branch', () => {
    const bundled = seedDocumentToCategories(getBundledSeedDocument(), 10);
    const discovered: AiCategory = {
      id: 'deep-learning-resources',
      name: 'Deep Learning Resources',
      kind: 'leaf',
      status: 'ai_proposed',
      assignable: true,
      parentId: 'link-quality',
      parentName: 'Link quality & attention',
      source: 'discovered',
      created_at: 1,
      updated_at: 1,
    };

    expect(validateTaxonomyInvariant([...bundled, discovered], bundled)).toContain(
      'topic leaf "deep-learning-resources" cannot be under Link quality'
    );
  });
});
