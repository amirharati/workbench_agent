/**
 * Lightweight in-process pub/sub for "the database changed" events.
 *
 * Why this exists:
 * - The DB layer (`db.ts`) is the only place that truly knows when a write
 *   happened. UI code shouldn't have to remember to "ping the backup system"
 *   after every action.
 * - Keeps backup, telemetry, and any future side-effect concerns decoupled
 *   from the data layer (Dependency Inversion: DB depends on this small
 *   abstraction, not on the BackupCoordinator directly).
 */

export type DataChangeReason =
  | 'item.add'
  | 'item.update'
  | 'item.delete'
  | 'project.add'
  | 'project.update'
  | 'project.delete'
  | 'collection.add'
  | 'collection.update'
  | 'collection.delete'
  | 'workspace.add'
  | 'workspace.update'
  | 'workspace.delete'
  | 'snapshot.add'
  | 'import.replace'
  | 'enrichment.update'
  | 'categorization.update'
  | 'categorization.review'
  | 'pipeline.clear'
  | 'unknown';

export interface DataChangeEvent {
  reason: DataChangeReason;
  at: number;
}

type Listener = (event: DataChangeEvent) => void;

const listeners = new Set<Listener>();

export function subscribeToDataChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Same name in every extension page (side panel, new tab, etc.) for cross-document refresh. */
export const DATA_CHANGED_BROADCAST_CHANNEL = 'workbench-agent-data-changed';

export function notifyDataChanged(reason: DataChangeReason = 'unknown'): void {
  const event: DataChangeEvent = { reason, at: Date.now() };
  // Best-effort: never let a buggy listener break a DB write.
  for (const listener of Array.from(listeners)) {
    try {
      listener(event);
    } catch (e) {
      console.error('Data change listener threw:', e);
    }
  }
  // Other extension documents (side panel vs tab) have separate JS heaps — notify them.
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const ch = new BroadcastChannel(DATA_CHANGED_BROADCAST_CHANNEL);
      ch.postMessage({ reason, at: event.at });
      ch.close();
    } catch {
      // ignore
    }
  }
}
