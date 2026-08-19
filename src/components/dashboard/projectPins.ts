import type { Item } from '../../lib/db';

const PROJECT_PINS_KEY = 'projectPins';

export function getProjectPinTimestamp(item: Pick<Item, 'metadata'>, projectId: string): number | undefined {
  const value = item.metadata?.[PROJECT_PINS_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const timestamp = (value as Record<string, unknown>)[projectId];
  return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : undefined;
}

export function isItemPinnedToProject(item: Pick<Item, 'metadata'>, projectId: string): boolean {
  return getProjectPinTimestamp(item, projectId) != null;
}

export function updateProjectPinMetadata(
  metadata: Item['metadata'],
  projectId: string,
  pinnedAt?: number
): Item['metadata'] {
  const currentValue = metadata?.[PROJECT_PINS_KEY];
  const currentPins =
    currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
      ? { ...(currentValue as Record<string, unknown>) }
      : {};

  if (pinnedAt == null) delete currentPins[projectId];
  else currentPins[projectId] = pinnedAt;

  const next = { ...(metadata ?? {}) };
  if (Object.keys(currentPins).length === 0) delete next[PROJECT_PINS_KEY];
  else next[PROJECT_PINS_KEY] = currentPins;
  return Object.keys(next).length === 0 ? undefined : next;
}

/** Normal project lists stay in recency order; pinning is a marker, not a reorder action. */
export function sortProjectItemsByRecency(items: Item[]): Item[] {
  return [...items].sort(
    (a, b) => (b.updated_at ?? b.created_at) - (a.updated_at ?? a.created_at)
  );
}
