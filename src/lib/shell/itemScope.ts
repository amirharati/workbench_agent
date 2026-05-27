import type { Collection, Item } from '../db';

export function itemMatchesScope(
  item: Item,
  scopeProjectId: string | 'all',
  scopeCollectionId: string | 'all',
  collections: Collection[]
): boolean {
  if (scopeProjectId === 'all' && scopeCollectionId === 'all') return true;

  if (scopeCollectionId !== 'all') {
    return (item.collectionIds ?? []).includes(scopeCollectionId);
  }

  if (scopeProjectId !== 'all') {
    const projectCollectionIds = new Set(
      collections
        .filter(
          (c) =>
            c.primaryProjectId === scopeProjectId ||
            (Array.isArray(c.projectIds) && c.projectIds.includes(scopeProjectId))
        )
        .map((c) => c.id)
    );
    return (item.collectionIds ?? []).some((id) => projectCollectionIds.has(id));
  }

  return true;
}

export function isScopeNarrowed(
  scopeProjectId: string | 'all',
  scopeCollectionId: string | 'all'
): boolean {
  return scopeProjectId !== 'all' || scopeCollectionId !== 'all';
}

export function getItemPrimaryScope(
  item: Item,
  collections: Collection[]
): { projectId: string | 'all'; collectionId: string | 'all' } {
  const collectionId = item.collectionIds?.[0];
  if (!collectionId) return { projectId: 'all', collectionId: 'all' };
  const col = collections.find((c) => c.id === collectionId);
  return {
    projectId: col?.primaryProjectId ?? 'all',
    collectionId,
  };
}
