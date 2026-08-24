import { describe, expect, it } from 'vitest';
import { resolveSidePanelSavedPageStatus } from './SidePanelConnected';

const freshResult = {
  updatedPlacementNotes: false,
  addedToCollections: ['incoming'],
  alreadyInCollections: [],
  merged: false,
};

describe('resolveSidePanelSavedPageStatus', () => {
  it('treats local files as saved bookmarks rather than notes', () => {
    expect(resolveSidePanelSavedPageStatus(
      'file:///Users/test/Documents/paper.pdf',
      freshResult
    )).toBe('Local file saved');
  });

  it('preserves normal bookmark and merge statuses', () => {
    expect(resolveSidePanelSavedPageStatus('https://example.com', freshResult))
      .toBe('Bookmark added');
    expect(resolveSidePanelSavedPageStatus('file:///paper.pdf', {
      ...freshResult,
      addedToCollections: [],
      alreadyInCollections: ['incoming'],
    })).toBe('Already saved in this collection');
  });

  it('returns no bookmark status for a note-only item', () => {
    expect(resolveSidePanelSavedPageStatus('', freshResult)).toBeNull();
  });
});
