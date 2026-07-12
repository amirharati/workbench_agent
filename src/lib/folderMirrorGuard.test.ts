import { describe, expect, it } from 'vitest';
import {
  wouldMirrorLoseItems,
  wouldMirrorShrinkWorkbenchSqlite,
} from './folderMirrorGuard';

describe('wouldMirrorShrinkWorkbenchSqlite', () => {
  it('allows replace when existing is tiny (create / bootstrap)', () => {
    const existing = new Uint8Array(8_000);
    const incoming = new Uint8Array(4_000);
    expect(wouldMirrorShrinkWorkbenchSqlite(existing, incoming)).toBeNull();
  });

  it('blocks empty/near-empty schema over a real library file', () => {
    const existing = new Uint8Array(80 * 1024);
    const incoming = new Uint8Array(40 * 1024);
    expect(wouldMirrorShrinkWorkbenchSqlite(existing, incoming)).toMatch(/Refusing to overwrite/);
  });

  it('blocks shrinking a large file by byte ratio', () => {
    const existing = new Uint8Array(2 * 1024 * 1024);
    const incoming = new Uint8Array(500 * 1024);
    expect(wouldMirrorShrinkWorkbenchSqlite(existing, incoming)).toMatch(/Refusing to overwrite/);
  });

  it('allows similar-sized replace', () => {
    const existing = new Uint8Array(2 * 1024 * 1024);
    const incoming = new Uint8Array(1.95 * 1024 * 1024);
    expect(wouldMirrorShrinkWorkbenchSqlite(existing, incoming)).toBeNull();
  });

  it('blocks empty→full when item counts show wipe despite similar bytes', () => {
    const existing = new Uint8Array(500 * 1024);
    const incoming = new Uint8Array(480 * 1024);
    expect(
      wouldMirrorShrinkWorkbenchSqlite(existing, incoming, {
        existingItemCount: 694,
        incomingItemCount: 0,
      })
    ).toMatch(/empty library/);
  });

  it('allows create-sized write when counts say both empty', () => {
    const existing = new Uint8Array(8_000);
    const incoming = new Uint8Array(40 * 1024);
    expect(
      wouldMirrorShrinkWorkbenchSqlite(existing, incoming, {
        existingItemCount: 0,
        incomingItemCount: 0,
      })
    ).toBeNull();
  });
});

describe('wouldMirrorLoseItems', () => {
  it('refuses empty live over non-empty folder', () => {
    expect(wouldMirrorLoseItems(100, 0)).toMatch(/empty library/);
  });

  it('refuses near-total item wipe', () => {
    expect(wouldMirrorLoseItems(100, 4)).toMatch(/much smaller library/);
  });

  it('allows modest reductions and growth', () => {
    expect(wouldMirrorLoseItems(100, 50)).toBeNull();
    expect(wouldMirrorLoseItems(100, 120)).toBeNull();
    expect(wouldMirrorLoseItems(0, 0)).toBeNull();
    expect(wouldMirrorLoseItems(0, 10)).toBeNull();
  });

  it('allows small libraries to shrink without false refuse', () => {
    expect(wouldMirrorLoseItems(4, 1)).toBeNull();
  });
});
