import { describe, expect, it } from 'vitest';
import type {
  AiCategory,
  AiCategorySearchProfile,
  AiItemSignal,
} from '../../categorization/types';
import { createConnectionFromDatabase, initSchema, initSqlite3 } from './connectionShared';
import { SqliteStore } from './store';

function signal(itemId: string, embedding: number[]): AiItemSignal {
  return {
    itemId,
    textHash: `hash-${itemId}`,
    embeddingModel: 'model-a',
    embedding,
    derivedTags: [],
    signalStatus: 'ok',
    classifyState: 'classified',
    lastProcessedAt: 20,
  };
}

describe('SQLite category search profiles', () => {
  it('persists profile vectors and selects only reliable category member evidence', async () => {
    const sqlite = await initSqlite3();
    const db = new sqlite.oo1.DB();
    db.exec('PRAGMA foreign_keys = ON;');
    initSchema(db, 9);
    const store = new SqliteStore(createConnectionFromDatabase(db, 'memory'));
    const category: AiCategory = {
      id: 'topic-a',
      name: 'Topic A',
      kind: 'leaf',
      status: 'approved',
      assignable: true,
      created_at: 1,
      updated_at: 1,
    };
    store.putCategory(category);
    for (const itemId of ['primary', 'weak', 'accepted']) {
      db.exec({
        sql: 'INSERT INTO items (id, url, created_at, updated_at) VALUES (?, ?, 1, 1)',
        bind: [itemId, `https://example.com/${itemId}`],
      });
      store.putSignal(signal(itemId, itemId === 'accepted' ? [0, 1] : [1, 0]));
    }
    store.putLink({
      id: 'link-primary', itemId: 'primary', categoryId: category.id,
      score: 0.8, isPrimary: true, source: 'ai', status: 'suggested',
      created_at: 10, updated_at: 10,
    });
    store.putLink({
      id: 'link-weak', itemId: 'weak', categoryId: category.id,
      score: 0.2, isPrimary: false, source: 'ai', status: 'suggested',
      created_at: 11, updated_at: 11,
    });
    store.putLink({
      id: 'link-accepted', itemId: 'accepted', categoryId: category.id,
      score: 0.3, isPrimary: false, source: 'manual', status: 'accepted',
      created_at: 12, updated_at: 12,
    });

    const stats = store.getCategorySearchMemberStats(category.id, 'model-a');
    expect(stats.memberCount).toBe(2);
    expect(store.getAllCategorySearchMemberStats('model-a')).toEqual([
      { categoryId: category.id, ...stats },
    ]);
    expect(store.getCategorySearchMemberEmbeddings(category.id, 'model-a')).toEqual([
      [0, 1],
      [1, 0],
    ]);

    const profile: AiCategorySearchProfile = {
      categoryId: category.id,
      embeddingModel: 'model-a',
      metadataTextHash: 'metadata-hash',
      metadataEmbedding: [1, 0],
      memberCentroid: [0.5, 0.5],
      prototypeEmbedding: [0.8, 0.2],
      memberCount: 2,
      memberSampleCount: 2,
      memberRevision: 'revision-a',
      updated_at: 30,
    };
    store.putCategorySearchProfile(profile);
    const stored = store.getCategorySearchProfile(category.id);
    expect(stored).toMatchObject({
      ...profile,
      metadataEmbedding: expect.any(Array),
      memberCentroid: expect.any(Array),
      prototypeEmbedding: expect.any(Array),
    });
    expect(stored?.metadataEmbedding[0]).toBeCloseTo(1);
    expect(stored?.memberCentroid[0]).toBeCloseTo(0.5);
    expect(stored?.prototypeEmbedding[0]).toBeCloseTo(0.8);
    expect(stored?.prototypeEmbedding[1]).toBeCloseTo(0.2);

    // Category edits and seed-hierarchy repair must update in place. SQLite
    // REPLACE would delete the category first and cascade-delete both links
    // and the persisted search profile.
    store.putCategory({ ...category, name: 'Topic A updated', updated_at: 40 });
    expect(store.getCategory(category.id)?.name).toBe('Topic A updated');
    expect(store.getLinksByCategory(category.id)).toHaveLength(3);
    expect(store.getCategorySearchProfile(category.id)?.metadataTextHash).toBe('metadata-hash');
    db.close();
  });
});
