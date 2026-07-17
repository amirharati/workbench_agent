import type { Collection, Item, Project } from '../../lib/db';

export type HomeScopeId = string | 'all';
export const HOME_RECENT_SCOPE_LIMIT = 5;

export function rememberRecentProject(
  projectIds: string[],
  projectId: string,
  limit = HOME_RECENT_SCOPE_LIMIT
): string[] {
  return [projectId, ...projectIds.filter((id) => id !== projectId)].slice(0, limit);
}

export function rememberRecentCollection(
  collectionIds: string[],
  collectionId: string,
  limit = HOME_RECENT_SCOPE_LIMIT
): string[] {
  return [collectionId, ...collectionIds.filter((id) => id !== collectionId)].slice(0, limit);
}

export function collectionBelongsToProject(collection: Collection, projectId: string): boolean {
  return (
    collection.primaryProjectId === projectId ||
    (Array.isArray(collection.projectIds) && collection.projectIds.includes(projectId))
  );
}

export function getProjectCollections(
  collections: Collection[],
  projectId: HomeScopeId
): Collection[] {
  if (projectId === 'all') return collections;
  return collections.filter((collection) => collectionBelongsToProject(collection, projectId));
}

export function getHomeScopeItems(
  items: Item[],
  collections: Collection[],
  projectId: HomeScopeId,
  collectionId: HomeScopeId
): Item[] {
  if (collectionId !== 'all') {
    return items.filter((item) => (item.collectionIds || []).includes(collectionId));
  }
  if (projectId === 'all') return items;

  const projectCollectionIds = new Set(
    getProjectCollections(collections, projectId).map((collection) => collection.id)
  );
  return items.filter((item) =>
    (item.collectionIds || []).some((id) => projectCollectionIds.has(id))
  );
}

export function getProjectHomeSummary(
  project: Project,
  items: Item[],
  collections: Collection[]
): { project: Project; collectionCount: number; itemCount: number } {
  const projectCollections = getProjectCollections(collections, project.id);
  return {
    project,
    collectionCount: projectCollections.length,
    itemCount: getHomeScopeItems(items, projectCollections, project.id, 'all').length,
  };
}
