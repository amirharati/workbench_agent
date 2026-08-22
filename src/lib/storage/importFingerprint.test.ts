import { describe, expect, it } from 'vitest';
import {
  fingerprintsEqual,
  snapshotSummaryFromStore,
  type DbContentFingerprint,
} from './importFingerprint';

describe('fingerprintsEqual', () => {
  const base: DbContentFingerprint = {
    maxUpdatedAt: 1000,
    itemCount: 42,
    notesRowCount: 10,
    itemsWithNotes: 5,
  };

  it('returns true for identical fingerprints', () => {
    expect(fingerprintsEqual(base, { ...base })).toBe(true);
  });

  it('returns false when any field differs', () => {
    expect(fingerprintsEqual(base, { ...base, itemCount: 43 })).toBe(false);
    expect(fingerprintsEqual(base, { ...base, maxUpdatedAt: 1001 })).toBe(false);
    expect(fingerprintsEqual(base, { ...base, notesRowCount: 11 })).toBe(false);
    expect(fingerprintsEqual(base, { ...base, itemsWithNotes: 6 })).toBe(false);
  });
});

describe('snapshotSummaryFromStore', () => {
  it('adds read-only organization inventory to the compact content fingerprint', () => {
    const summary = snapshotSummaryFromStore({
      getAllItems: () => [{ updated_at: 8, notes: 'kept', placements: {} }] as never,
      getAllNotes: () => [{ updated_at: 9 }] as never,
      getAllProjects: () => [{ id: 'p1' }, { id: 'p2' }] as never,
      getAllCollections: () => [{ id: 'c1' }] as never,
      getAllWorkspaces: () => [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }] as never,
    });

    expect(summary).toMatchObject({
      itemCount: 1,
      notesRowCount: 1,
      itemsWithNotes: 1,
      maxUpdatedAt: 9,
      projectCount: 2,
      collectionCount: 1,
      workspaceCount: 3,
    });
  });
});
