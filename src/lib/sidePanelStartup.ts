import type { Collection, Project } from './db';
import { dbRpc } from './storage/dbClient';

export interface SidePanelStartupProjection {
  projects: Project[];
  collections: Collection[];
}

export async function requestSidePanelStartupProjection(): Promise<SidePanelStartupProjection> {
  const projection = await dbRpc<SidePanelStartupProjection>('getSidePanelStartupProjection', []);
  if (
    !projection ||
    !Array.isArray(projection.projects) ||
    !Array.isArray(projection.collections)
  ) {
    throw new Error('Database owner returned an invalid side-panel projection');
  }
  return projection;
}

