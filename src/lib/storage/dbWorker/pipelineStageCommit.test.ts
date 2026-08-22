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

function category(id: string): AiCategory {
  return {
    id,
    name: id,
    kind: 'leaf',
    status: 'approved',
    assignable: true,
    created_at: 1,
    updated_at: 1,
  };
}

function link(
  categoryId: string,
  overrides: Partial<ReturnType<SqliteStore['getLinksByItem']>[number]> = {}
) {
  return {
    id: `link_item-1_${categoryId}`,
    itemId: 'item-1',
    categoryId,
    score: 0.9,
    isPrimary: true,
    source: 'ai' as const,
    status: 'suggested' as const,
    created_at: 2,
    updated_at: 2,
    ...overrides,
  };
}

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

  it('adds repeated classifications without replacing an equally strong or stronger primary', async () => {
    const sqlite = await initSqlite3();
    const db = new sqlite.oo1.DB();
    db.exec('PRAGMA foreign_keys = ON;');
    initSchema(db, 8);
    db.exec("INSERT INTO items (id, url, created_at, updated_at) VALUES ('item-1', 'https://example.com', 1, 1)");
    const store = new SqliteStore(createConnectionFromDatabase(db, 'memory'));
    store.putSignal(signal({ classifyState: 'pending_classify', llmReview: undefined }));

    commitClassificationInStore(store, {
      categories: [category('nlp-transformers')],
      itemWrites: [{
        itemId: 'item-1',
        removeAiSuggested: false,
        links: [link('nlp-transformers')],
        signal: signal({ llmReview: { decisionType: 'existing', categoryIds: ['nlp-transformers'] } }),
      }],
    });
    commitClassificationInStore(store, {
      categories: [category('machine-learning-general'), category('speech-asr')],
      itemWrites: [{
        itemId: 'item-1',
        removeAiSuggested: false,
        links: [link('machine-learning-general', { updated_at: 3 })],
        signal: signal({
          classifyState: 'classified_general',
          llmReview: { decisionType: 'existing', categoryIds: ['machine-learning-general'] },
        }),
      }, {
        itemId: 'item-1',
        removeAiSuggested: false,
        links: [link('speech-asr', { updated_at: 4 })],
        signal: signal({ llmReview: { decisionType: 'existing', categoryIds: ['speech-asr'] } }),
      }],
    });

    const links = store.getLinksByItem('item-1');
    expect(links).toHaveLength(3);
    expect(links.find((row) => row.isPrimary)?.categoryId).toBe('nlp-transformers');
    expect(links.filter((row) => row.isPrimary)).toHaveLength(1);
    expect(store.getSignal('item-1')?.classifyState).toBe('classified');
    expect(new Set(store.getSignal('item-1')?.llmReview?.categoryIds)).toEqual(
      new Set(['nlp-transformers', 'machine-learning-general', 'speech-asr'])
    );
    db.close();
  });

  it('promotes a newly added specific category over a General primary', async () => {
    const sqlite = await initSqlite3();
    const db = new sqlite.oo1.DB();
    db.exec('PRAGMA foreign_keys = ON;');
    initSchema(db, 8);
    db.exec("INSERT INTO items (id, url, created_at, updated_at) VALUES ('item-1', 'https://example.com', 1, 1)");
    const store = new SqliteStore(createConnectionFromDatabase(db, 'memory'));
    store.putSignal(signal({ classifyState: 'pending_classify', llmReview: undefined }));

    commitClassificationInStore(store, {
      categories: [category('machine-learning-general')],
      itemWrites: [{
        itemId: 'item-1',
        removeAiSuggested: false,
        links: [link('machine-learning-general')],
        signal: signal({ classifyState: 'classified_general' }),
      }],
    });
    expect(store.getSignal('item-1')?.classifyState).toBe('classified_general');

    commitClassificationInStore(store, {
      categories: [category('speech-asr')],
      itemWrites: [{
        itemId: 'item-1',
        removeAiSuggested: false,
        links: [link('speech-asr', { updated_at: 3 })],
        signal: signal({ llmReview: { decisionType: 'existing', categoryIds: ['speech-asr'] } }),
      }],
    });

    const links = store.getLinksByItem('item-1');
    expect(links).toHaveLength(2);
    expect(links.find((row) => row.isPrimary)?.categoryId).toBe('speech-asr');
    expect(links.find((row) => row.categoryId === 'machine-learning-general')?.isPrimary).toBe(false);
    expect(store.getSignal('item-1')?.classifyState).toBe('classified');
    db.close();
  });

  it('keeps accepted evidence primary and never resurrects rejected evidence', async () => {
    const sqlite = await initSqlite3();
    const db = new sqlite.oo1.DB();
    db.exec('PRAGMA foreign_keys = ON;');
    initSchema(db, 8);
    db.exec("INSERT INTO items (id, url, created_at, updated_at) VALUES ('item-1', 'https://example.com', 1, 1)");
    const store = new SqliteStore(createConnectionFromDatabase(db, 'memory'));
    store.putSignal(signal({ classifyState: 'manual_only' }));
    store.putCategory(category('accepted-topic'));
    store.putCategory(category('rejected-topic'));
    store.putLink(link('accepted-topic', { status: 'accepted' }));
    store.putLink(link('rejected-topic', { status: 'rejected', isPrimary: false }));

    commitClassificationInStore(store, {
      categories: [category('new-topic')],
      itemWrites: [{
        itemId: 'item-1',
        removeAiSuggested: false,
        links: [
          link('new-topic', { updated_at: 3 }),
          link('rejected-topic', { updated_at: 3 }),
        ],
        signal: signal({ classifyState: 'classified' }),
      }],
    });

    const links = store.getLinksByItem('item-1');
    expect(links.find((row) => row.isPrimary)?.categoryId).toBe('accepted-topic');
    expect(links.find((row) => row.categoryId === 'rejected-topic')?.status).toBe('rejected');
    expect(links.find((row) => row.categoryId === 'new-topic')?.isPrimary).toBe(false);
    expect(store.getSignal('item-1')?.classifyState).toBe('manual_only');
    db.close();
  });

  it('keeps a rejected-only rerun unassigned instead of resurrecting or claiming classification', async () => {
    const sqlite = await initSqlite3();
    const db = new sqlite.oo1.DB();
    db.exec('PRAGMA foreign_keys = ON;');
    initSchema(db, 8);
    db.exec("INSERT INTO items (id, url, created_at, updated_at) VALUES ('item-1', 'https://example.com', 1, 1)");
    const store = new SqliteStore(createConnectionFromDatabase(db, 'memory'));
    store.putCategory(category('rejected-topic'));
    store.putSignal(signal({ classifyState: 'pending_discover', discoverState: 'pending' }));
    store.putLink(link('rejected-topic', { status: 'rejected', isPrimary: false }));

    expect(() => commitClassificationInStore(store, {
      categories: [],
      itemWrites: [{
        itemId: 'item-1',
        removeAiSuggested: false,
        links: [link('rejected-topic', { updated_at: 3 })],
        signal: signal({ classifyState: 'classified' }),
      }],
    })).not.toThrow();

    expect(store.getLinksByItem('item-1')).toHaveLength(1);
    expect(store.getLinksByItem('item-1')[0]?.status).toBe('rejected');
    expect(store.getSignal('item-1')?.classifyState).toBe('pending_discover');
    expect(store.getSignal('item-1')?.llmReview?.categoryIds).toEqual([]);
    db.close();
  });
});
