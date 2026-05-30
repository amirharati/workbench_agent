/**
 * Forward-compat checks for JSON backup import (verifyBackup).
 */

const KNOWN_ITEM_KEYS = new Set([
  'id',
  'url',
  'urlRaw',
  'title',
  'favicon',
  'collectionIds',
  'tags',
  'notes',
  'placements',
  'created_at',
  'updated_at',
  'source',
  'metadata',
  'pinnedAt',
  'favoriteAt',
  'deletedAt',
]);

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'projects',
  'collections',
  'items',
  'notes',
  'workspaces',
  'item_enrichment',
  'ai_categories',
  'ai_item_category_links',
  'ai_item_signals',
  'ai_taxonomy_state',
  'trash_history',
  '_pipelineExportCounts',
  'envelope',
]);

const MAX_WARNINGS = 8;

export function collectBackupVerifyWarnings(data: Record<string, unknown>): string[] {
  const warnings: string[] = [];

  for (const key of Object.keys(data)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      warnings.push(`Unknown top-level key "${key}" (will be ignored on import).`);
      if (warnings.length >= MAX_WARNINGS) return warnings;
    }
  }

  const items = Array.isArray(data.items) ? data.items : [];
  const unknownByItem = new Map<string, number>();

  for (let i = 0; i < items.length && warnings.length < MAX_WARNINGS; i++) {
    const row = items[i];
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row as Record<string, unknown>)) {
      if (KNOWN_ITEM_KEYS.has(key)) continue;
      unknownByItem.set(key, (unknownByItem.get(key) ?? 0) + 1);
    }
  }

  for (const [key, count] of unknownByItem) {
    warnings.push(
      `Unknown item field "${key}" on ${count} row(s) — kept if present; future versions may rename.`
    );
    if (warnings.length >= MAX_WARNINGS) break;
  }

  return warnings;
}
