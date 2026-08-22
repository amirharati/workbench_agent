import { describe, expect, it } from 'vitest';
import type { AiCategory, AiItemSignal } from '../../categorization/types';
import { createConnectionFromDatabase, initSchema, initSqlite3 } from '../sqlite/connectionShared';
import { SqliteStore } from '../sqlite/store';
import {
  classifyStateRequiresPrimary,
  commitClassificationInStore,
  mergeClassificationSignal,
  mergeEmbeddingSignal,
  signalMetaOnly,
} from './pipelineStageCommit';

function signal(overrides: Partial<AiItemSignal> = {}): AiItemSignal {
  return {
    itemId: 'item-1',
    textHash: 'embed-hash',
    classifyTextHash: 'classify-hash',
    embeddingModel: 'embed-model',
    embedding: [0.1, 0.2, 0.3],
    derivedTags: ['saved-tag'],
    signalStatus: 'ok',
    classifyState: 'classified',
    discoverState: 'done',
    lastProcessedAt: 10,
    lastClassifiedAt: 9,
    llmReview: { decisionType: 'existing', categoryIds: ['topic-1'] },
    ...overrides,
  };
}

describe('pipeline stage signal ownership', () => {
  it('classification cannot erase a stored embedding from a meta-only seed', () => {
    const existing = signal();
    const incoming = signal({
      textHash: '',
      embeddingModel: '',
      embedding: [],
      derivedTags: [],
      classifyState: 'classified_general',
      llmReview: { decisionType: 'existing', categoryIds: ['general-1'] },
    });

    const merged = mergeClassificationSignal(existing, incoming);

    expect(merged.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(merged.embeddingModel).toBe('embed-model');
    expect(merged.textHash).toBe('embed-hash');
    expect(merged.derivedTags).toEqual(['saved-tag']);
    expect(merged.classifyState).toBe('classified_general');
    expect(merged.llmReview?.categoryIds).toEqual(['general-1']);
  });

  it('embedding cannot erase an existing classification', () => {
    const existing = signal();
    const incoming = signal({
      textHash: 'new-embed-hash',
      embedding: [0.9, 0.8],
      classifyTextHash: '',
      classifyState: 'pending_classify',
      discoverState: 'none',
      lastClassifiedAt: undefined,
      llmReview: undefined,
    });

    const merged = mergeEmbeddingSignal(existing, incoming);

    expect(merged.textHash).toBe('new-embed-hash');
    expect(merged.embedding).toEqual([0.9, 0.8]);
    expect(merged.classifyState).toBe('classified');
    expect(merged.classifyTextHash).toBe('classify-hash');
    expect(merged.llmReview?.categoryIds).toEqual(['topic-1']);
  });

  it('requires durable primary links for every assigned classification state', () => {
    expect(classifyStateRequiresPrimary('classified')).toBe(true);
    expect(classifyStateRequiresPrimary('classified_general')).toBe(true);
    expect(classifyStateRequiresPrimary('classified_attention')).toBe(true);
    expect(classifyStateRequiresPrimary('classified_removal')).toBe(true);
    expect(classifyStateRequiresPrimary('pending_classify')).toBe(false);
    expect(classifyStateRequiresPrimary('manual_review')).toBe(false);
  });

  it('retains authoritative vector presence when stripping payload bytes', () => {
    const meta = signalMetaOnly(signal());
    expect(meta.embedding).toEqual([]);
    expect(meta.embeddingDimensions).toBe(3);
  });

  it('atomically stores a primary link while preserving the SQLite vector', async () => {
    const sqlite = await initSqlite3();
    const db = new sqlite.oo1.DB();
    db.exec('PRAGMA foreign_keys = ON;');
    initSchema(db, 8);
    db.exec("INSERT INTO items (id, url, created_at, updated_at) VALUES ('item-1', 'https://example.com', 1, 1)");
    const store = new SqliteStore(createConnectionFromDatabase(db, 'memory'));
    const category: AiCategory = {
      id: 'topic-1',
      name: 'Topic',
      kind: 'leaf',
      status: 'approved',
      assignable: true,
      created_at: 1,
      updated_at: 1,
    };
    store.putSignal(signal({ classifyState: 'pending_classify', llmReview: undefined }));

    commitClassificationInStore(store, {
      categories: [category],
      itemWrites: [{
        itemId: 'item-1',
        removeAiSuggested: true,
        links: [{
          id: 'link_item-1_topic-1',
          itemId: 'item-1',
          categoryId: 'topic-1',
          score: 0.9,
          isPrimary: true,
          source: 'ai',
          status: 'suggested',
          created_at: 2,
          updated_at: 2,
        }],
        signal: signal({ embedding: [], embeddingModel: '', textHash: '' }),
      }],
    });

    expect(store.getSignal('item-1')?.embedding).toHaveLength(3);
    expect(store.getSignal('item-1')?.embedding[0]).toBeCloseTo(0.1);
    expect(store.getSignalMetadataForItemIds(['item-1'])[0]?.embedding).toEqual([]);
    expect(store.getSignalMetadataForItemIds(['item-1'])[0]?.embeddingDimensions).toBe(3);
    expect(store.getLinksByItem('item-1')).toHaveLength(1);

    commitClassificationInStore(store, {
      categories: [],
      itemWrites: [{
        itemId: 'item-1',
        removeAiSuggested: true,
        links: [],
        signal: signal({
          classifyTextHash: 'new-text-with-no-match',
          classifyState: 'pending_discover',
          discoverState: 'pending',
          llmReview: { decisionType: 'none', reason: 'No replacement found' },
        }),
      }],
    });

    expect(store.getLinksByItem('item-1')).toHaveLength(1);
    expect(store.getSignal('item-1')?.classifyState).toBe('classified');
    expect(store.getSignal('item-1')?.classifyTextHash).toBe('classify-hash');
    expect(store.getSignal('item-1')?.llmReview?.categoryIds).toEqual(['topic-1']);
    db.close();
  });

  it('rolls back a classified signal when no primary link was committed', async () => {
    const sqlite = await initSqlite3();
    const db = new sqlite.oo1.DB();
    initSchema(db, 8);
    db.exec("INSERT INTO items (id, url, created_at, updated_at) VALUES ('item-1', 'https://example.com', 1, 1)");
    const store = new SqliteStore(createConnectionFromDatabase(db, 'memory'));
    store.putSignal(signal({ classifyState: 'pending_classify', llmReview: undefined }));

    expect(() => commitClassificationInStore(store, {
      categories: [],
      itemWrites: [{
        itemId: 'item-1',
        removeAiSuggested: true,
        links: [],
        signal: signal({ embedding: [], embeddingModel: '', textHash: '' }),
      }],
    })).toThrow(/without a primary link/);
    expect(store.getSignal('item-1')?.classifyState).toBe('pending_classify');
    expect(store.getSignal('item-1')?.embedding).toHaveLength(3);
    expect(store.getSignal('item-1')?.embedding[0]).toBeCloseTo(0.1);
    db.close();
  });
});
