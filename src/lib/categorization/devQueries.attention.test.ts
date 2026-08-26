import { describe, expect, it } from 'vitest';
import type { Item } from '../db';
import type { ItemEnrichment } from '../enrichment/types';
import type { PipelineCatalog } from '../pipeline/pipelineCatalog';
import type { AiCategory, AiItemCategoryLink, AiItemSignal } from './types';
import {
  buildPipelineQueueRowsFromCatalog,
  countPipelineQueueFilters,
  matchesPipelineQueueFilter,
} from './devQueries';

const item: Item = {
  id: 'item-1',
  url: 'https://short.example/listing',
  title: 'Apartment listing',
  collectionIds: ['inbox'],
  tags: [],
  created_at: 1,
  updated_at: 2,
  source: 'bookmark',
};

const enrichment: ItemEnrichment = {
  itemId: item.id,
  normalizedUrl: item.url,
  status: 'ok',
  providerId: 'hybrid',
  attempts: 1,
  summary:
    'A detailed final destination page about an apartment rental, lease terms, location, and housing availability.',
  hasRawBody: true,
  aiStatus: 'ok',
  pendingFetchReview: true,
  pendingFetchReviewReason: 'url_redirect',
  updated_at: 2,
};

function category(
  id: string,
  name: string,
  kind: 'parent' | 'leaf',
  parentId?: string
): AiCategory {
  return {
    id,
    name,
    kind,
    parentId,
    parentName: parentId === 'housing' ? 'Housing' : undefined,
    status: 'approved',
    assignable: kind === 'leaf',
    created_at: 1,
    updated_at: 1,
  };
}

function link(categoryId: string, isPrimary: boolean): AiItemCategoryLink {
  return {
    id: `link_${item.id}_${categoryId}`,
    itemId: item.id,
    categoryId,
    score: 0.9,
    isPrimary,
    source: 'ai',
    status: 'suggested',
    created_at: 2,
    updated_at: 2,
  };
}

describe('classification queue attention diagnostics', () => {
  it('keeps a topical item in Has topic and also exposes its secondary redirect warning', () => {
    const categories = [
      category('housing', 'Housing', 'parent'),
      category('housing-rentals', 'Rentals', 'leaf', 'housing'),
      category('link-quality', 'Link quality & attention', 'parent'),
      category(
        'seed_url-redirect-mismatch',
        'URL redirect mismatch',
        'leaf',
        'link-quality'
      ),
    ];
    const signal: AiItemSignal = {
      itemId: item.id,
      textHash: 'embed',
      classifyTextHash: 'classify',
      embeddingModel: 'model',
      embedding: [],
      derivedTags: [],
      signalStatus: 'ok',
      classifyState: 'classified',
      discoverState: 'none',
      lastProcessedAt: 2,
    };
    const links = [
      link('housing-rentals', true),
      link('seed_url-redirect-mismatch', false),
    ];
    const catalog: PipelineCatalog = {
      items: [item],
      enrichByItem: new Map([[item.id, enrichment]]),
      signalByItem: new Map([[item.id, signal]]),
      links,
      primaryByItem: new Map([[item.id, 'housing-rentals']]),
      categories,
      categoryById: new Map(categories.map((entry) => [entry.id, entry])),
      parentNameById: new Map([
        ['housing', 'Housing'],
        ['link-quality', 'Link quality & attention'],
      ]),
    };

    const [row] = buildPipelineQueueRowsFromCatalog(catalog);
    expect(row.topicPath).toBe('Housing › Rentals');
    expect(row.attentionCategoryNames).toEqual(['URL redirect mismatch']);
    expect(matchesPipelineQueueFilter('classified', row)).toBe(true);
    expect(matchesPipelineQueueFilter('classified_attention', row)).toBe(true);

    const counts = countPipelineQueueFilters([row]);
    expect(counts.classified).toBe(1);
    expect(counts.classified_attention).toBe(1);
  });
});
