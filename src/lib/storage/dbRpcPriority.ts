/**
 * DB RPC priority — high (save / UI / single digest) jumps ahead of low (bulk).
 * Work stays buffered in queues; nothing is cancelled for priority.
 *
 * Concurrent jobs: each runWithDbPriority registers a holder. getDbRpcPriority
 * returns high if any high holder is active (so save/single win), else low if
 * only bulk holders, else high (UI default).
 */
export type DbRpcPriority = 'high' | 'low';

const holders = new Set<{ priority: DbRpcPriority }>();

export function getDbRpcPriority(): DbRpcPriority {
  let sawLow = false;
  for (const h of holders) {
    if (h.priority === 'high') return 'high';
    if (h.priority === 'low') sawLow = true;
  }
  return sawLow ? 'low' : 'high';
}

/** Run fn with DB calls enqueued at this priority (captured at each dbRpc call). */
export async function runWithDbPriority<T>(
  priority: DbRpcPriority,
  fn: () => Promise<T>
): Promise<T> {
  const token = { priority };
  holders.add(token);
  try {
    return await fn();
  } finally {
    holders.delete(token);
  }
}
