import { beforeAll, describe, expect, it } from 'vitest';
import {
  bootstrapContentDatabaseFromBytes,
  clearContentDatabase,
  deleteContentDocument,
  exportContentDatabaseBytes,
  getContentDatabaseStats,
  getContentDocumentByRef,
  putContentDocument,
  resetContentDatabaseConnectionForTests,
} from './contentDatabase';

let recoverySnapshot: Uint8Array;

describe('content sidecar database', () => {
  beforeAll(async () => {
    await clearContentDatabase();
  });

  it('compresses a large body without stream backpressure deadlock', async () => {
    let state = 0x12345678;
    const chars = new Array<string>(400_000);
    for (let index = 0; index < chars.length; index++) {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      chars[index] = String.fromCharCode(32 + (state % 95));
    }
    const body = chars.join('');
    const stored = await putContentDocument({
      itemId: 'large-body',
      kind: 'raw',
      body,
      contentHash: 'large-body-hash',
    });
    expect((await getContentDocumentByRef(stored.rawRef))?.body).toBe(body);
    await deleteContentDocument('large-body');
  }, 10_000);

  it('reports the selected folder as its sole durable storage mode', async () => {
    await expect(getContentDatabaseStats()).resolves.toMatchObject({ storageMode: 'folder' });
  });

  it('stores compressed immutable hash-addressed bodies and exact references', async () => {
    const body = '# Example\n\n' + 'repeatable fetched content '.repeat(300);
    const first = await putContentDocument({
      itemId: 'item:1',
      kind: 'raw',
      body,
      contentHash: 'clean/hash-1',
      fetchedAt: 123,
    });

    expect(first.rawRef).toContain('content:v1:raw:');
    expect(first.storedBytes).toBeLessThan(first.rawBytes);
    await expect(getContentDocumentByRef(first.rawRef)).resolves.toMatchObject({
      itemId: 'item:1',
      kind: 'raw',
      body,
      contentHash: 'clean/hash-1',
      fetchedAt: 123,
    });

    const idempotent = await putContentDocument({
      itemId: 'item:1',
      kind: 'raw',
      body,
      contentHash: 'clean/hash-1',
    });
    expect(idempotent.revision).toBe(first.revision);
    const repeatedIdentity = await putContentDocument({
      itemId: 'item:1',
      kind: 'raw',
      body: 'different body',
      contentHash: 'clean/hash-1',
    });
    expect(repeatedIdentity.rawRef).toBe(first.rawRef);
    await expect(getContentDocumentByRef(first.rawRef)).resolves.toMatchObject({ body });
  });

  it('keeps historical hashes and deletes body kinds independently', async () => {
    const second = await putContentDocument({
      itemId: 'item:1',
      kind: 'raw',
      body: 'new fetched body',
      contentHash: 'clean/hash-2',
    });
    await putContentDocument({ itemId: 'item:1', kind: 'review', body: 'review body' });
    expect(await getContentDocumentByRef(second.rawRef)).toMatchObject({ body: 'new fetched body' });
    expect(await getContentDatabaseStats()).toMatchObject({
      rowCount: 3,
      rawCount: 2,
      reviewCount: 1,
    });

    recoverySnapshot = await exportContentDatabaseBytes();
    expect(new TextDecoder().decode(recoverySnapshot.slice(0, 15))).toBe('SQLite format 3');

    await deleteContentDocument('item:1', 'review');
    expect(await getContentDatabaseStats()).toMatchObject({ rowCount: 2, reviewCount: 0 });
  });

  it('restores a validated snapshot only into an empty local sidecar', async () => {
    await expect(bootstrapContentDatabaseFromBytes(recoverySnapshot)).resolves.toMatchObject({
      imported: false,
      reason: 'local-has-state',
    });
    await clearContentDatabase();
    resetContentDatabaseConnectionForTests();
    await expect(bootstrapContentDatabaseFromBytes(recoverySnapshot)).resolves.toMatchObject({
      imported: true,
      rowCount: 3,
    });
  });
});
