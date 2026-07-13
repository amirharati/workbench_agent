/**
 * Durable truth is the user backup folder (`workbench.sqlite`).
 *
 * Default path is soft (debounced) mirror — same as main after digest.
 * A few seconds of lag is OK; hours of stall is not.
 * Forced flush is only for pagehide / explicit leave checkpoints.
 */

let inFlightForce: Promise<{ ok: boolean; error?: string }> | null = null;

/** Soft: schedule the normal debounced folder mirror (seconds, not a blocking dump). */
export async function scheduleDurableBackup(): Promise<{ ok: boolean }> {
  try {
    const { scheduleFolderMirror } = await import('./dbClient');
    await scheduleFolderMirror();
    return { ok: true };
  } catch (e) {
    console.warn('[scheduleDurableBackup]', e instanceof Error ? e.message : e);
    return { ok: false };
  }
}

/** Fire-and-forget soft schedule for UI / pipeline checkpoints. */
export function flushDurableBackupSoon(): void {
  void scheduleDurableBackup();
}

/**
 * Forced immediate mirror. Prefer soft schedule for digest / save / import.
 * Keep for pagehide so the folder is as current as possible when the tab goes away.
 */
export async function flushDurableBackup(): Promise<{ ok: boolean; error?: string }> {
  if (inFlightForce) return inFlightForce;
  inFlightForce = (async () => {
    try {
      const { mirrorNow } = await import('./dbClient');
      return await mirrorNow(true);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.warn('[flushDurableBackup]', error);
      return { ok: false, error };
    } finally {
      inFlightForce = null;
    }
  })();
  return inFlightForce;
}
