import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbRpc = vi.fn();

vi.mock('./index', () => ({ dbRpc }));

describe('RemoteIdbCompatStore write barrier', () => {
  beforeEach(() => {
    dbRpc.mockReset();
  });

  it('reports a queued worker write failure from drainWrites', async () => {
    const { RemoteIdbCompatStore } = await import('./remoteStore');
    const store = new RemoteIdbCompatStore();
    store.installPipelineCacheSeed({
      projects: [],
      collections: [],
      items: [],
      workspaces: [],
      enrichment: [],
      categories: [],
      links: [],
      signals: [],
      taxonomy: undefined,
      revision: 1,
    });
    dbRpc.mockRejectedValueOnce(new Error('worker write rejected'));

    store.putItem({
      id: 'item-1',
      url: 'https://example.test',
      title: 'Example',
      collectionIds: [],
      tags: [],
      created_at: 1,
      updated_at: 1,
      source: 'manual',
    });

    await expect(store.drainWrites()).rejects.toThrow('worker write rejected');
  });
});
