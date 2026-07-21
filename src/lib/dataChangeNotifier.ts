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
  | 'item.trash.bulk'
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
  | 'import.bulk'
  | 'enrichment.update'
  | 'categorization.update'
  | 'categorization.review'
  | 'pipeline.clear'
  | 'unknown';

export interface DataChangeEvent {
  reason: DataChangeReason;
  at: number;
  /** Document instance that emitted the event, used to ignore its own broadcast. */
  sourceId?: string;
  /** Primary domain row touched by an ordinary CRUD operation. */
  entityId?: string;
  /** Worker revision acknowledged for this mutation, when available. */
  revision?: number;
}

export type DataChangeDetail = Pick<DataChangeEvent, 'entityId' | 'revision'>;

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
export const DATA_CHANGE_SOURCE_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function notifyDataChanged(
  reason: DataChangeReason = 'unknown',
  detail?: DataChangeDetail
): void {
  const event: DataChangeEvent = {
    reason,
    at: Date.now(),
    sourceId: DATA_CHANGE_SOURCE_ID,
    ...detail,
  };
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
      ch.postMessage(event);
      ch.close();
    } catch {
      // ignore
    }
  }
}
