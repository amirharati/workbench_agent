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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Returns an error message when a mirror write would destroy folder data,
 * or null when the write is allowed.
 */
export function wouldMirrorShrinkWorkbenchSqlite(
  existing: Uint8Array,
  incoming: Uint8Array
): string | null {
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
