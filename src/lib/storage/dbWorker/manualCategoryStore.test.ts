import { beforeAll, describe, expect, it } from 'vitest';
import type { AiCategory } from '../../categorization/types';
import { createConnectionFromDatabase, initSchema, initSqlite3 } from '../sqlite/connectionShared';
import { SqliteStore } from '../sqlite/store';
import {
  createManualCategoryInStore,
  deleteManualCategoryInStore,
  manageItemCategoryInStore,
  updateManualCategoryInStore,
} from './manualCategoryStore';

let sqlite3: Awaited<ReturnType<typeof initSqlite3>>;

beforeAll(async () => {
  sqlite3 = await initSqlite3();
});

function makeStore(): SqliteStore {
  const db = new sqlite3.oo1.DB();
  db.exec('PRAGMA foreign_keys = ON;');
  initSchema(db, 9);
  db.exec("INSERT INTO items (id, url, title, created_at, updated_at) VALUES ('item-1', 'https://example.com', 'Example', 1, 1)");
  const store = new SqliteStore(createConnectionFromDatabase(db, 'memory'));
  store.putCategory({
    id: 'technology',
    name: 'Technology',
    kind: 'parent',
    status: 'approved',
    source: 'seed',
    assignable: false,
    created_at: 1,
    updated_at: 1,
  });
  return store;
}

function leaf(id: string, name: string): AiCategory {
  return {
    id,
    name,
    kind: 'leaf',
    status: 'approved',
    source: 'seed',
    assignable: true,
    parentId: 'technology',
    parentName: 'Technology',
    created_at: 1,
    updated_at: 1,
  };
}

describe('manual category worker transactions', () => {
  it('atomically creates and attaches a manual child without erasing prior categories or vectors', () => {
    const store = makeStore();
    store.putCategory(leaf('existing', 'Existing topic'));
    store.putLink({
      id: 'link_item-1_existing', itemId: 'item-1', categoryId: 'existing', score: 0.8,
      isPrimary: true, source: 'ai', status: 'suggested', created_at: 2, updated_at: 2,
    });
    store.putSignal({
      itemId: 'item-1', textHash: 'hash', embeddingModel: 'model', embedding: [0.1, 0.2],
      derivedTags: ['saved'], signalStatus: 'ok', classifyState: 'classified',
      discoverState: 'done', lastProcessedAt: 2,
    });

    const result = createManualCategoryInStore(store, {
      name: 'Model serving',
      description: 'Operating deployed machine-learning models.',
      kind: 'leaf',
      parentId: 'technology',
      canonicalTags: ['ml', 'serving'],
    }, { itemId: 'item-1', makePrimary: true }, 10);

    expect(result.category).toMatchObject({
      id: 'manual_model-serving', status: 'manual', source: 'manual', parentId: 'technology',
    });
    const links = store.getLinksByItem('item-1');
    expect(links).toHaveLength(2);
    expect(links.find((link) => link.categoryId === 'existing')).toMatchObject({
      status: 'suggested', isPrimary: false,
    });
    expect(links.find((link) => link.categoryId === 'manual_model-serving')).toMatchObject({
      status: 'accepted', source: 'manual', isPrimary: true,
    });
    const storedSignal = store.getSignal('item-1');
    expect(storedSignal).toMatchObject({ derivedTags: ['saved'], classifyState: 'manual_only' });
    expect(storedSignal?.embedding[0]).toBeCloseTo(0.1);
    expect(storedSignal?.embedding[1]).toBeCloseTo(0.2);
  });

  it('rejects normalized duplicate names before writing anything', () => {
    const store = makeStore();
    store.putCategory(leaf('ml-infra', 'ML Infrastructure'));

    expect(() => createManualCategoryInStore(store, {
      name: ' ml-infrastructure ',
      description: '',
      kind: 'leaf',
      parentId: 'technology',
    })).toThrow('already exists');
    expect(store.getAllCategories()).toHaveLength(2);
  });

  it('allows the same child name under different parents while keeping each path distinct', () => {
    const store = makeStore();
    store.putCategory(leaf('technology-traders', 'Traders'));
    store.putCategory({
      id: 'finance', name: 'Finance', kind: 'parent', status: 'approved', source: 'seed',
      assignable: false, created_at: 1, updated_at: 1,
    });

    const result = createManualCategoryInStore(store, {
      name: 'Traders',
      description: 'People and communities engaged in financial trading.',
      kind: 'leaf',
      parentId: 'finance',
    }, {}, 10);

    expect(result.category).toMatchObject({
      id: 'manual_traders',
      name: 'Traders',
      parentId: 'finance',
      parentName: 'Finance',
    });
    expect(store.getCategory('technology-traders')).toMatchObject({ parentId: 'technology' });
  });

  it('adds categories without replacing the primary, then explicitly changes and removes it', () => {
    const store = makeStore();
    store.putCategory(leaf('one', 'One'));
    store.putCategory(leaf('two', 'Two'));
    store.putLink({
      id: 'link_item-1_one', itemId: 'item-1', categoryId: 'one', score: 0.9,
      isPrimary: true, source: 'ai', status: 'accepted', created_at: 2, updated_at: 2,
    });

    manageItemCategoryInStore(store, 'item-1', 'two', 'add', 3);
    expect(store.getLinksByItem('item-1').find((link) => link.categoryId === 'one')?.isPrimary).toBe(true);
    expect(store.getLinksByItem('item-1').find((link) => link.categoryId === 'two')).toMatchObject({
      status: 'accepted', source: 'manual', isPrimary: false,
    });

    manageItemCategoryInStore(store, 'item-1', 'two', 'primary', 4);
    expect(store.getLinksByItem('item-1').find((link) => link.categoryId === 'two')?.isPrimary).toBe(true);

    manageItemCategoryInStore(store, 'item-1', 'two', 'remove', 5);
    expect(store.getLinksByItem('item-1').find((link) => link.categoryId === 'two')).toMatchObject({
      status: 'rejected', isPrimary: false,
    });
    expect(store.getLinksByItem('item-1').find((link) => link.categoryId === 'one')?.isPrimary).toBe(true);
  });

  it('requires a valid active parent for every manually created child', () => {
    const store = makeStore();
    expect(() => createManualCategoryInStore(store, {
      name: 'Orphan', description: '', kind: 'leaf', parentId: 'missing',
    })).toThrow('Choose an active topic parent');
    expect(store.getCategory('manual_orphan')).toBeUndefined();
  });

  it('creates a usable fallback child with every new parent and attaches it in item context', () => {
    const store = makeStore();
    const result = createManualCategoryInStore(store, {
      name: 'Quantum computing',
      description: 'Quantum algorithms, systems, and research.',
      kind: 'parent',
    }, { itemId: 'item-1' }, 20);

    expect(result.category).toMatchObject({
      id: 'manual_quantum-computing', kind: 'parent', childLeafCount: 1,
    });
    expect(store.getCategory('manual_quantum-computing-general')).toMatchObject({
      name: 'Other (Quantum computing)',
      kind: 'leaf',
      parentId: 'manual_quantum-computing',
      isGeneralFallback: true,
    });
    expect(store.getLinksByItem('item-1')).toContainEqual(expect.objectContaining({
      categoryId: 'manual_quantum-computing-general',
      source: 'manual',
      status: 'accepted',
      isPrimary: true,
    }));
  });

  it('atomically creates a named parent and child structure and attaches the named child', () => {
    const store = makeStore();
    const result = createManualCategoryInStore(store, {
      name: 'Machine learning operations',
      description: '',
      kind: 'parent',
      child: {
        name: 'Model deployment',
        description: '',
      },
    }, { itemId: 'item-1' }, 25);

    expect(result.category).toMatchObject({
      name: 'Machine learning operations', kind: 'parent', childLeafCount: 2,
    });
    expect(result.attachedCategoryId).toBe('manual_model-deployment');
    expect(store.getCategory('manual_model-deployment')).toMatchObject({
      name: 'Model deployment',
      parentId: 'manual_machine-learning-operations',
      parentName: 'Machine learning operations',
    });
    expect(store.getCategory('manual_machine-learning-operations-general')).toBeDefined();
    expect(store.getLinksByItem('item-1')).toContainEqual(expect.objectContaining({
      categoryId: 'manual_model-deployment',
      status: 'accepted',
      isPrimary: true,
    }));
  });

  it('renames a user parent and keeps its children and fallback labels consistent', () => {
    const store = makeStore();
    createManualCategoryInStore(store, {
      name: 'Quantum computing', description: 'Old description', kind: 'parent',
    }, {}, 20);
    createManualCategoryInStore(store, {
      name: 'Quantum hardware', description: '', kind: 'leaf',
      parentId: 'manual_quantum-computing',
    }, {}, 21);

    const result = updateManualCategoryInStore(store, 'manual_quantum-computing', {
      name: 'Quantum systems', description: 'New description',
    }, 30);

    expect(result.category).toMatchObject({ name: 'Quantum systems', description: 'New description' });
    expect(store.getCategory('manual_quantum-computing-general')).toMatchObject({
      name: 'Other (Quantum systems)', parentName: 'Quantum systems',
    });
    expect(store.getCategory('manual_quantum-hardware')).toMatchObject({
      name: 'Quantum hardware', parentName: 'Quantum systems',
    });
  });

  it('deletes a user category branch without deleting bookmarks and repairs remaining primary state', () => {
    const store = makeStore();
    store.putCategory(leaf('existing', 'Existing topic'));
    store.putLink({
      id: 'link_item-1_existing', itemId: 'item-1', categoryId: 'existing', score: 0.7,
      isPrimary: false, source: 'ai', status: 'accepted', created_at: 2, updated_at: 2,
    });
    createManualCategoryInStore(store, {
      name: 'Quantum computing', description: '', kind: 'parent',
    }, { itemId: 'item-1' }, 20);

    const result = deleteManualCategoryInStore(store, 'manual_quantum-computing', 40);

    expect(result.deletedCategoryIds).toEqual([
      'manual_quantum-computing-general',
      'manual_quantum-computing',
    ]);
    expect(store.getItem('item-1')).toBeDefined();
    expect(store.getCategory('manual_quantum-computing')).toBeUndefined();
    expect(store.getCategory('manual_quantum-computing-general')).toBeUndefined();
    expect(store.getLinksByItem('item-1')).toEqual([
      expect.objectContaining({ categoryId: 'existing', isPrimary: true, status: 'accepted' }),
    ]);
    expect(store.getSignal('item-1')).toMatchObject({ classifyState: 'manual_only' });
  });

  it('does not allow bundled or automatic fallback categories to be renamed or deleted directly', () => {
    const store = makeStore();
    expect(() => updateManualCategoryInStore(store, 'technology', {
      name: 'Renamed technology',
    })).toThrow('Only categories created by you');

    createManualCategoryInStore(store, {
      name: 'Quantum computing', description: '', kind: 'parent',
    });
    expect(() => deleteManualCategoryInStore(
      store,
      'manual_quantum-computing-general'
    )).toThrow('automatic fallback');
  });
});
