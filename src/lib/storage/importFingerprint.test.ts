import { describe, expect, it } from 'vitest';
import { fingerprintsEqual, type DbContentFingerprint } from './importFingerprint';

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
