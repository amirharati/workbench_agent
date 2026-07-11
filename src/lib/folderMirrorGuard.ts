/**
 * Hard stop: automatic folder mirror must NEVER replace a substantial
 * workbench.sqlite with a much smaller export (empty OPFS / fresh schema).
 * Deliberate restore/import uses different code paths with explicit consent.
 */

/** Existing file must be at least this large before the shrink rule applies. */
const MIN_EXISTING_BYTES = 256 * 1024;
/** Incoming export must be at least this fraction of existing size. */
const MIN_INCOMING_RATIO = 0.5;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Returns an error message when a mirror write would be a destructive regression,
 * or null when the write is allowed.
 */
export function wouldMirrorShrinkWorkbenchSqlite(
  existing: Uint8Array,
  incoming: Uint8Array
): string | null {
  if (existing.byteLength < MIN_EXISTING_BYTES) return null;
  if (incoming.byteLength >= existing.byteLength * MIN_INCOMING_RATIO) return null;
  return (
    `Refusing to overwrite workbench.sqlite (${formatBytes(existing.byteLength)}) ` +
    `with a much smaller database (${formatBytes(incoming.byteLength)}). ` +
    `Use Settings → Restore from backup, or re-link your backup folder to load from disk.`
  );
}
