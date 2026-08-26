/** Canonical names for system-owned organization in a clean installation. */
export const INBOX_PROJECT_NAME = 'Inbox';
export const INCOMING_COLLECTION_NAME = 'Incoming';
export const DEFAULT_COLLECTION_NAME = 'Default';

export const INBOX_COLLECTION_LIMIT_MESSAGE =
  'Inbox uses its single Incoming collection. Choose another project for new collections.';

/** Inbox is a capture surface, so it must never acquire user-created collections. */
export const assertCanCreateCollectionInProject = (
  projectId: string,
  inboxProjectId: string
) => {
  if (projectId === inboxProjectId) {
    throw new Error(INBOX_COLLECTION_LIMIT_MESSAGE);
  }
};
