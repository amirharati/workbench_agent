/**
 * Durable truth is the user backup folder (`workbench.sqlite`).
 * Call at explicit app checkpoints — not on every pipeline satellite write.
 *
 * Checkpoints:
 * - add / save new link
 * - bulk import commit
 * - item update / Save
 * - end of AI pipeline
 * - page hide (best-effort, wired in App)
 */

let inFlight: Promise<{ ok: boolean; error?: string }> | null = null;

export async function flushDurableBackup(): Promise<{ ok: boolean; error?: string }> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const { mirrorNow } = await import('./dbClient');
      return await mirrorNow(true);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.warn('[flushDurableBackup]', error);
      return { ok: false, error };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Fire-and-forget for UI paths that must not block on folder I/O. */
export function flushDurableBackupSoon(): void {
  void flushDurableBackup();
}
