import { describe, expect, it } from 'vitest';
import { wouldMirrorShrinkWorkbenchSqlite } from './folderMirrorGuard';

describe('wouldMirrorShrinkWorkbenchSqlite', () => {
  it('allows replace when existing is tiny', () => {
    const existing = new Uint8Array(8_000);
    const incoming = new Uint8Array(4_000);
    expect(wouldMirrorShrinkWorkbenchSqlite(existing, incoming)).toBeNull();
  });

  it('blocks empty schema over a real library file', () => {
    const existing = new Uint8Array(80 * 1024);
    const incoming = new Uint8Array(40 * 1024);
    expect(wouldMirrorShrinkWorkbenchSqlite(existing, incoming)).toMatch(/Refusing to overwrite/);
  });

  it('blocks shrinking a large file', () => {
    const existing = new Uint8Array(2 * 1024 * 1024);
    const incoming = new Uint8Array(500 * 1024);
    expect(wouldMirrorShrinkWorkbenchSqlite(existing, incoming)).toMatch(/Refusing to overwrite/);
  });

  it('allows similar-sized replace', () => {
    const existing = new Uint8Array(2 * 1024 * 1024);
    const incoming = new Uint8Array(1.95 * 1024 * 1024);
    expect(wouldMirrorShrinkWorkbenchSqlite(existing, incoming)).toBeNull();
  });
});
