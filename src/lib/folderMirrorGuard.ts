/**
 * Hard stop: automatic folder mirror must NEVER clobber an existing
 * workbench.sqlite with an empty / much smaller export.
 */

/** Any on-disk DB above this is treated as real user data. */
const MIN_EXISTING_BYTES = 16 * 1024;
/** Typical empty/schema-only SQLite is well under this. */
const EMPTY_SCHEMA_MAX_BYTES = 200 * 1024;
/** Incoming must be at least this fraction of existing size. */
const MIN_INCOMING_RATIO = 0.9;
/** Folder libraries this large treat a near-total item wipe as refuse. */
const MIN_ITEMS_FOR_COUNT_GUARD = 5;
/** Incoming must keep at least this fraction of existing items when counts are known. */
const MIN_INCOMING_ITEM_RATIO = 0.1;

export type MirrorItemCounts = {
  existingItemCount: number;
  incomingItemCount: number;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Item-count guard when byte sizes alone are ambiguous (e.g. similar file
 * size but live library is empty / nearly empty).
 * Returns an error message, or null when the write is allowed.
 */
export function wouldMirrorLoseItems(
  existingItemCount: number,
  incomingItemCount: number
): string | null {
  if (existingItemCount > 0 && incomingItemCount === 0) {
    return (
      `Refusing to overwrite workbench.sqlite (${existingItemCount} items) ` +
      `with an empty library (0 items). Homebase loads from the folder — it must not wipe it.`
    );
  }

  if (
    existingItemCount >= MIN_ITEMS_FOR_COUNT_GUARD &&
    incomingItemCount < existingItemCount * MIN_INCOMING_ITEM_RATIO
  ) {
    return (
      `Refusing to overwrite workbench.sqlite (${existingItemCount} items) ` +
      `with a much smaller library (${incomingItemCount} items). ` +
      `Use Settings → Restore only when you intentionally replace the library.`
    );
  }

  return null;
}

/**
 * Returns an error message when a mirror write would destroy folder data,
 * or null when the write is allowed.
 *
 * Pass `counts` when fingerprints are cheaply available — preferred when
 * byte sizes alone would allow a wipe.
 */
export function wouldMirrorShrinkWorkbenchSqlite(
  existing: Uint8Array,
  incoming: Uint8Array,
  counts?: MirrorItemCounts
): string | null {
  if (counts) {
    const lost = wouldMirrorLoseItems(counts.existingItemCount, counts.incomingItemCount);
    if (lost) return lost;
  }

  if (existing.byteLength < MIN_EXISTING_BYTES) return null;

  // Empty / near-empty live DB must never replace a real folder file.
  if (incoming.byteLength < EMPTY_SCHEMA_MAX_BYTES && incoming.byteLength < existing.byteLength) {
    return (
      `Refusing to overwrite workbench.sqlite (${formatBytes(existing.byteLength)}) ` +
      `with an empty/near-empty database (${formatBytes(incoming.byteLength)}). ` +
      `Homebase loads from the folder — it must not wipe it.`
    );
  }

  if (incoming.byteLength < existing.byteLength * MIN_INCOMING_RATIO) {
    return (
      `Refusing to overwrite workbench.sqlite (${formatBytes(existing.byteLength)}) ` +
      `with a smaller database (${formatBytes(incoming.byteLength)}). ` +
      `Use Settings → Restore only when you intentionally replace the library.`
    );
  }

  return null;
}
