import { describe, expect, it } from 'vitest';
import { INBOX_PROJECT_NAME, INCOMING_COLLECTION_NAME, UNFILED_COLLECTION_NAME } from './systemDataModel';

describe('clean-install system organization', () => {
  it('uses distinct friendly names for unassigned and project-scoped captures', () => {
    expect(INBOX_PROJECT_NAME).toBe('Inbox');
    expect(INCOMING_COLLECTION_NAME).toBe('Incoming');
    expect(UNFILED_COLLECTION_NAME).toBe('Unfiled');
    expect(new Set([INBOX_PROJECT_NAME, INCOMING_COLLECTION_NAME, UNFILED_COLLECTION_NAME]).size).toBe(3);
  });
});
