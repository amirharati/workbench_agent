import { describe, expect, it } from 'vitest';
import { wouldMirrorShrinkWorkbenchSqlite } from './folderMirrorGuard';

describe('wouldMirrorShrinkWorkbenchSqlite', () => {
  it('allows replace when existing is small', () => {
    const existing = new Uint8Array(100_000);
    const incoming = new Uint8Array(50_000);
    expect(wouldMirrorShrinkWorkbenchSqlite(existing, incoming)).toBeNull();
  });

  it('blocks shrinking a large file to a tiny export', () => {
    const existing = new Uint8Array(2 * 1024 * 1024);
    const incoming = new Uint8Array(80 * 1024);
    expect(wouldMirrorShrinkWorkbenchSqlite(existing, incoming)).toMatch(/Refusing to overwrite/);
  });

  it('allows replace when incoming is a reasonable fraction of existing', () => {
    const existing = new Uint8Array(2 * 1024 * 1024);
    const incoming = new Uint8Array(1.2 * 1024 * 1024);
    expect(wouldMirrorShrinkWorkbenchSqlite(existing, incoming)).toBeNull();
  });
});
