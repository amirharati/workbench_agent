import type { Collection, Item, Project, Workspace } from './db';

export const DASHBOARD_STARTUP_PROJECTION_VERSION = 2;
export const DASHBOARD_STARTUP_CACHE_KEY = 'homebase.dashboard-startup.v2';
export const DASHBOARD_STARTUP_IMMEDIATE_KEY = 'homebase.dashboard-startup.immediate.v2';
const LEGACY_DASHBOARD_STARTUP_CACHE_KEY = 'homebase.dashboard-startup.v1';
const LEGACY_DASHBOARD_STARTUP_IMMEDIATE_KEY = 'homebase.dashboard-startup.immediate.v1';

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

function compactStartupWorkspace(workspace: Workspace): Workspace {
  return {
    id: workspace.id,
    name: workspace.name,
    ...(workspace.projectId ? { projectId: workspace.projectId } : {}),
    created_at: workspace.created_at,
    updated_at: workspace.updated_at,
    // Full browser-window/tab snapshots can be large and are not needed to
    // paint Home. Canonical hydration restores them before workspace actions.
    windows: [],
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
    workspaces: input.workspaces.map(compactStartupWorkspace),
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

/**
 * Synchronous first-paint cache for dashboard pages.
 *
 * chrome.storage.local is the durable fallback, but its asynchronous read can
 * be delayed while Chrome wakes an extension context. localStorage lets React
 * seed the last known dashboard before it renders a blocking loading screen.
 */
export function loadImmediateDashboardStartupProjection(): DashboardStartupProjection | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(DASHBOARD_STARTUP_IMMEDIATE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (isDashboardStartupProjection(value)) return value;
    localStorage.removeItem(DASHBOARD_STARTUP_IMMEDIATE_KEY);
    return null;
  } catch {
    return null;
  }
}

export async function persistDashboardStartupProjection(
  projection: DashboardStartupProjection
): Promise<void> {
  // Write the synchronous mirror before the first await. Callers often fire
  // and forget this function, and the next dashboard should still be instant.
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LEGACY_DASHBOARD_STARTUP_IMMEDIATE_KEY);
      localStorage.setItem(DASHBOARD_STARTUP_IMMEDIATE_KEY, JSON.stringify(projection));
    }
  } catch {
    // Quota/security failures are non-fatal; chrome.storage remains canonical.
  }
  try {
    await chrome.storage.local.set({ [DASHBOARD_STARTUP_CACHE_KEY]: projection });
    await chrome.storage.local.remove(LEGACY_DASHBOARD_STARTUP_CACHE_KEY);
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
