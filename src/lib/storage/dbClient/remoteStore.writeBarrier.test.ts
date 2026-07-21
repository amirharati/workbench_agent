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

  it('records the worker revision from a mutation acknowledgement', async () => {
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
      revision: 4,
    });
    dbRpc.mockResolvedValueOnce({ result: undefined, revision: 5 });

    store.putProject({
      id: 'project-1',
      name: 'Research',
      isDefault: false,
      created_at: 1,
      updated_at: 1,
    });
    await store.drainWrites();

    expect(dbRpc).toHaveBeenCalledWith('storeMutate', [
      'putProject',
      [expect.objectContaining({ id: 'project-1' })],
    ]);
    expect(store.getRevision()).toBe(5);
    await expect(store.hydrateIfBehind(5)).resolves.toBe(false);
    expect(dbRpc).toHaveBeenCalledTimes(1);
  });
});
