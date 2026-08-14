import { describe, expect, it } from 'vitest';
import {
  mergeImportedPlacementNotes,
  mergeImportedPlacementTags,
  shouldPreferImportTitle,
} from './xImportHygiene';

describe('repeat import preservation policy', () => {
  it('keeps a user title even when the imported title is longer', () => {
    expect(
      shouldPreferImportTitle('My title', 'A much longer title from the imported file', 'https://example.com/')
    ).toBe(false);
  });

  it('fills an empty title but does not replace an existing title', () => {
    expect(shouldPreferImportTitle('https://example.com/', 'Imported title', 'https://example.com/')).toBe(true);
  });

  it('preserves both distinct notes and is idempotent on repeat import', () => {
    const merged = mergeImportedPlacementNotes('My later note', 'Original imported note');
    expect(merged).toBe('My later note\n\nOriginal imported note');
    expect(mergeImportedPlacementNotes(merged, 'Original imported note')).toBe(merged);
    expect(mergeImportedPlacementNotes('My later note', undefined)).toBe('My later note');
  });

  it('unions placement tags without changing existing spelling or order', () => {
    expect(mergeImportedPlacementTags(['Manual', 'Saved'], ['manual', 'Imported'])).toEqual([
      'Manual',
      'Saved',
      'Imported',
    ]);
  });
});
