import type { Collection, Item, Project, Workspace } from './db';

export const DASHBOARD_STARTUP_PROJECTION_VERSION = 1;
export const DASHBOARD_STARTUP_CACHE_KEY = 'homebase.dashboard-startup.v1';

export interface DashboardStartupProjection {
  version: typeof DASHBOARD_STARTUP_PROJECTION_VERSION;
  revision: number;
  generatedAt: number;
  projects: Project[];
  collections: Collection[];
  workspaces: Workspace[];
  /** Active items stripped to the fields needed by Home and project Browse. */
  items: Item[];
}

function compactStartupItem(item: Item): Item {
  const projectPins = item.metadata?.projectPins;
  return {
    id: item.id,
    url: item.url,
    ...(item.urlRaw ? { urlRaw: item.urlRaw } : {}),
    title: item.title,
    ...(item.favicon ? { favicon: item.favicon } : {}),
    collectionIds: [...(item.collectionIds ?? [])],
    tags: [],
    created_at: item.created_at,
    updated_at: item.updated_at,
    source: item.source,
    ...(projectPins && typeof projectPins === 'object'
      ? { metadata: { projectPins } }
      : {}),
    ...(item.pinnedAt != null ? { pinnedAt: item.pinnedAt } : {}),
    ...(item.favoriteAt != null ? { favoriteAt: item.favoriteAt } : {}),
  };
}

export function createDashboardStartupProjection(input: {
  revision: number;
  generatedAt?: number;
  projects: Project[];
  collections: Collection[];
  workspaces: Workspace[];
  items: Item[];
}): DashboardStartupProjection {
  return {
    version: DASHBOARD_STARTUP_PROJECTION_VERSION,
    revision: Number.isFinite(input.revision) ? input.revision : 0,
    generatedAt: input.generatedAt ?? Date.now(),
    projects: input.projects,
    collections: input.collections,
    workspaces: input.workspaces,
    items: input.items
      .filter((item) => item.deletedAt == null)
      .map(compactStartupItem)
      .sort((a, b) => b.created_at - a.created_at),
  };
}

export function isDashboardStartupProjection(value: unknown): value is DashboardStartupProjection {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DashboardStartupProjection>;
  return (
    candidate.version === DASHBOARD_STARTUP_PROJECTION_VERSION &&
    typeof candidate.revision === 'number' &&
    typeof candidate.generatedAt === 'number' &&
    Array.isArray(candidate.projects) &&
    Array.isArray(candidate.collections) &&
    Array.isArray(candidate.workspaces) &&
    Array.isArray(candidate.items)
  );
}

export async function loadPersistedDashboardStartupProjection(): Promise<DashboardStartupProjection | null> {
  try {
    const stored = await chrome.storage.local.get(DASHBOARD_STARTUP_CACHE_KEY);
    const value = stored[DASHBOARD_STARTUP_CACHE_KEY];
    return isDashboardStartupProjection(value) ? value : null;
  } catch {
    return null;
  }
}

export async function persistDashboardStartupProjection(
  projection: DashboardStartupProjection
): Promise<void> {
  try {
    await chrome.storage.local.set({ [DASHBOARD_STARTUP_CACHE_KEY]: projection });
  } catch (error) {
    console.warn('[startup] Could not persist dashboard projection:', error);
  }
}

/** Shared warm path: served and revision-cached by the single DB owner worker. */
export async function requestSharedDashboardStartupProjection(): Promise<DashboardStartupProjection> {
  const { dbRpc } = await import('./storage/dbClient');
  const projection = await dbRpc<DashboardStartupProjection>('getDashboardStartupProjection', []);
  if (!isDashboardStartupProjection(projection)) {
    throw new Error('Database owner returned an invalid dashboard startup projection');
  }
  return projection;
}
