import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import {
  buildSearchIndexFromBackupData,
  unwrapBackupPayload,
  type SearchIndex,
} from '../../../src/lib/search/buildIndex';
import { loadSearchIndexFromBackupData } from '../../../src/lib/search/loadBackupIndex';
import { withSearchCategoryCentroids } from '../../../src/lib/search/categoryCentroids';

export { unwrapBackupPayload, buildSearchIndexFromBackupData, loadSearchIndexFromBackupData };

export function resolveCliPath(p: string): string {
  if (p.startsWith('~')) return join(homedir(), p.slice(1).replace(/^\//, ''));
  return p;
}

export function readBackupFile(backupPath: string): {
  raw: Record<string, unknown>;
  data: Record<string, unknown>;
} {
  const resolved = resolveCliPath(backupPath);
  if (!existsSync(resolved)) {
    throw new Error(`Backup not found: ${resolved}`);
  }
  const raw = JSON.parse(readFileSync(resolved, 'utf8')) as Record<string, unknown>;
  const data = unwrapBackupPayload(raw);
  return { raw, data };
}

export function loadIndexFromBackupFile(backupPath: string): {
  index: SearchIndex;
  path: string;
} {
  const { data } = readBackupFile(backupPath);
  return {
    index: loadSearchIndexFromBackupData(data),
    path: resolveCliPath(backupPath),
  };
}

/** Corpus-only index (no embeddings/categories) — lexical baseline only. */
export function loadIndexFromCorpusPayload(payload: {
  items: unknown[];
  item_enrichment: unknown[];
}): SearchIndex {
  return withSearchCategoryCentroids(
    buildSearchIndexFromBackupData({
      items: payload.items,
      item_enrichment: payload.item_enrichment,
      ai_item_signals: [],
      ai_item_category_links: [],
      ai_categories: [],
      collections: [],
    })
  );
}
