import { withSearchCategoryCentroids } from './categoryCentroids';
import { buildSearchIndexFromBackupData } from './buildIndex';
import type { SearchIndex } from './types';

/** Load hybrid search index from backup `data` payload (centroids derived at load). */
export function loadSearchIndexFromBackupData(data: Record<string, unknown>): SearchIndex {
  return withSearchCategoryCentroids(buildSearchIndexFromBackupData(data));
}
