/**
 * Cross-window pipeline lock — one active runner at a time.
 * Stored in chrome.storage.session so all Homebase tabs/windows share it.
 *
 * Cancel uses a separate storage key so heartbeats can never clobber cancelRequested.
 *
 * kind:
 * - single — one-bookmark digest / re-AI (user-priority)
 * - bulk — Hub / import / multi-item jobs
 */

export type PipelineRunKind = 'single' | 'bulk';

export type PipelineRunLock = {
  ownerId: string;
  kind: PipelineRunKind;
  /** Matches import-pipeline-job.json when this is a scoped wave job. */
  importRunId: string | null;
  title: string;
  itemCount: number;
  startedAt: number;
  heartbeatAt: number;
  /** Legacy field — prefer pipelineRunCancel key for cross-window cancel. */
  cancelRequested: boolean;
};

type PipelineRunCancelSignal = {
  ownerId: string;
  at: number;
};

const STORAGE_KEY = 'pipelineRunLock';
const CANCEL_KEY = 'pipelineRunCancel';
/** Soft-pause the owner so a single digest can run; does not clear the job file. */
const YIELD_KEY = 'pipelineRunYield';
/** If no heartbeat for this long, treat the lock as orphaned (window crashed). */
export const PIPELINE_LOCK_STALE_MS = 25_000;
const HEARTBEAT_INTERVAL_MS = 4_000;

export function createPipelineOwnerId(): string {
  return `pw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isPipelineRunLockFresh(
  lock: PipelineRunLock | null | undefined,
  now = Date.now()
): boolean {
  if (!lock) return false;
  return now - lock.heartbeatAt < PIPELINE_LOCK_STALE_MS;
}

function parseKind(raw: unknown): PipelineRunKind {
  return raw === 'single' ? 'single' : 'bulk';
}

export async function readPipelineRunLock(): Promise<PipelineRunLock | null> {
  try {
    const data = await chrome.storage.session.get(STORAGE_KEY);
    const raw = data[STORAGE_KEY];
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.ownerId !== 'string' || typeof r.heartbeatAt !== 'number') return null;
    return {
      ownerId: r.ownerId,
      kind: parseKind(r.kind),
      importRunId: typeof r.importRunId === 'string' ? r.importRunId : null,
      title: typeof r.title === 'string' ? r.title : 'Pipeline',
      itemCount: typeof r.itemCount === 'number' ? r.itemCount : 0,
      startedAt: typeof r.startedAt === 'number' ? r.startedAt : r.heartbeatAt,
      heartbeatAt: r.heartbeatAt,
      cancelRequested: r.cancelRequested === true,
    };
  } catch {
    return null;
  }
}

async function readCancelSignal(): Promise<PipelineRunCancelSignal | null> {
  try {
    const data = await chrome.storage.session.get(CANCEL_KEY);
    const raw = data[CANCEL_KEY];
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.ownerId !== 'string' || typeof r.at !== 'number') return null;
    return { ownerId: r.ownerId, at: r.at };
  } catch {
    return null;
  }
}

async function readYieldSignal(): Promise<PipelineRunCancelSignal | null> {
  try {
    const data = await chrome.storage.session.get(YIELD_KEY);
    const raw = data[YIELD_KEY];
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.ownerId !== 'string' || typeof r.at !== 'number') return null;
    return { ownerId: r.ownerId, at: r.at };
  } catch {
    return null;
  }
}

export type AcquirePipelineLockResult =
  | { ok: true; lock: PipelineRunLock }
  | { ok: false; lock: PipelineRunLock; reason: 'held_by_other' };

export async function tryAcquirePipelineRunLock(input: {
  ownerId: string;
  title: string;
  kind?: PipelineRunKind;
  itemCount?: number;
  importRunId?: string | null;
}): Promise<AcquirePipelineLockResult> {
  const existing = await readPipelineRunLock();
  const now = Date.now();
  if (existing && isPipelineRunLockFresh(existing, now) && existing.ownerId !== input.ownerId) {
    return { ok: false, lock: existing, reason: 'held_by_other' };
  }
  const lock: PipelineRunLock = {
    ownerId: input.ownerId,
    kind: input.kind ?? 'bulk',
    importRunId: input.importRunId ?? null,
    title: input.title,
    itemCount: input.itemCount ?? 0,
    startedAt: existing?.ownerId === input.ownerId ? existing.startedAt : now,
    heartbeatAt: now,
    cancelRequested: false,
  };
  await chrome.storage.session.set({ [STORAGE_KEY]: lock });
  try {
    await chrome.storage.session.remove([CANCEL_KEY, YIELD_KEY]);
  } catch {
    try {
      await chrome.storage.session.remove(CANCEL_KEY);
      await chrome.storage.session.remove(YIELD_KEY);
    } catch {
      /* ignore */
    }
  }
  return { ok: true, lock };
}

export async function heartbeatPipelineRunLock(ownerId: string): Promise<boolean> {
  const existing = await readPipelineRunLock();
  if (!existing || existing.ownerId !== ownerId) return false;

  const cancel = await readCancelSignal();
  if (cancel?.ownerId === ownerId) return false;
  const yieldSig = await readYieldSignal();
  if (yieldSig?.ownerId === ownerId) return false;

  const lock: PipelineRunLock = {
    ...existing,
    heartbeatAt: Date.now(),
    cancelRequested: false,
  };
  await chrome.storage.session.set({ [STORAGE_KEY]: lock });

  const cancelAfter = await readCancelSignal();
  if (cancelAfter?.ownerId === ownerId) return false;
  const yieldAfter = await readYieldSignal();
  return !(yieldAfter?.ownerId === ownerId);
}

export async function releasePipelineRunLock(ownerId: string): Promise<void> {
  const existing = await readPipelineRunLock();
  if (!existing || existing.ownerId !== ownerId) return;
  try {
    await chrome.storage.session.remove([STORAGE_KEY, CANCEL_KEY, YIELD_KEY]);
  } catch {
    try {
      await chrome.storage.session.remove(STORAGE_KEY);
      await chrome.storage.session.remove(CANCEL_KEY);
      await chrome.storage.session.remove(YIELD_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Another window asks the owner to abort. Uses a separate key so heartbeats cannot clobber it. */
export async function requestCancelPipelineRun(): Promise<boolean> {
  const existing = await readPipelineRunLock();
  if (!existing || !isPipelineRunLockFresh(existing)) return false;
  const signal: PipelineRunCancelSignal = { ownerId: existing.ownerId, at: Date.now() };
  const lock: PipelineRunLock = {
    ...existing,
    cancelRequested: true,
    heartbeatAt: Date.now(),
  };
  await chrome.storage.session.set({
    [CANCEL_KEY]: signal,
    [STORAGE_KEY]: lock,
  });
  return true;
}

/** True when a hard-cancel signal is pending for the current lock owner. */
export async function hasActivePipelineCancelSignal(): Promise<boolean> {
  const lock = await readPipelineRunLock();
  if (!lock) {
    const cancel = await readCancelSignal();
    return Boolean(cancel);
  }
  const cancel = await readCancelSignal();
  return Boolean(cancel?.ownerId === lock.ownerId || lock.cancelRequested);
}

/**
 * Ask the bulk-job owner to soft-pause so a single digest can run.
 * Does not clear import-pipeline-job.json (unlike cancel).
 */
export async function requestYieldPipelineRunForSingle(): Promise<boolean> {
  const existing = await readPipelineRunLock();
  if (!existing || !isPipelineRunLockFresh(existing)) return false;
  if (existing.kind === 'single') return false;
  const signal: PipelineRunCancelSignal = { ownerId: existing.ownerId, at: Date.now() };
  await chrome.storage.session.set({ [YIELD_KEY]: signal });
  return true;
}

export function startPipelineLockHeartbeat(
  ownerId: string,
  onCancelRequested: () => void,
  onYieldRequested?: () => void
): () => void {
  let stopped = false;
  let cancelFired = false;
  let yieldFired = false;
  const fireCancel = () => {
    if (stopped || cancelFired) return;
    cancelFired = true;
    onCancelRequested();
  };
  const fireYield = () => {
    if (stopped || yieldFired || cancelFired) return;
    yieldFired = true;
    (onYieldRequested ?? onCancelRequested)();
  };
  const tick = async () => {
    if (stopped) return;
    const ok = await heartbeatPipelineRunLock(ownerId);
    if (!ok && !stopped) {
      const cancel = await readCancelSignal();
      if (cancel?.ownerId === ownerId) {
        fireCancel();
        return;
      }
      const yieldSig = await readYieldSignal();
      if (yieldSig?.ownerId === ownerId) fireYield();
    }
  };
  const onStorage = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string
  ) => {
    if (area !== 'session' || stopped) return;
    if (changes[CANCEL_KEY]) {
      const next = changes[CANCEL_KEY].newValue as PipelineRunCancelSignal | undefined;
      if (next?.ownerId === ownerId) fireCancel();
    }
    if (changes[YIELD_KEY]) {
      const next = changes[YIELD_KEY].newValue as PipelineRunCancelSignal | undefined;
      if (next?.ownerId === ownerId) fireYield();
    }
    if (changes[STORAGE_KEY]) {
      const next = changes[STORAGE_KEY].newValue as PipelineRunLock | undefined;
      if (next?.ownerId === ownerId && next.cancelRequested) fireCancel();
    }
  };
  const id = window.setInterval(() => void tick(), HEARTBEAT_INTERVAL_MS);
  try {
    chrome.storage.onChanged.addListener(onStorage);
  } catch {
    /* ignore */
  }
  void tick();
  return () => {
    stopped = true;
    window.clearInterval(id);
    try {
      chrome.storage.onChanged.removeListener(onStorage);
    } catch {
      /* ignore */
    }
  };
}

export function subscribePipelineRunLock(
  onChange: (lock: PipelineRunLock | null) => void
): () => void {
  const handler = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string
  ) => {
    if (area !== 'session') return;
    if (changes[STORAGE_KEY] || changes[CANCEL_KEY]) {
      void readPipelineRunLock().then(async (lock) => {
        if (!lock) {
          onChange(null);
          return;
        }
        const cancel = await readCancelSignal();
        if (cancel?.ownerId === lock.ownerId) {
          onChange({ ...lock, cancelRequested: true });
          return;
        }
        onChange(lock);
      });
    }
  };
  try {
    chrome.storage.onChanged.addListener(handler);
  } catch {
    /* ignore */
  }
  void readPipelineRunLock().then(onChange);
  return () => {
    try {
      chrome.storage.onChanged.removeListener(handler);
    } catch {
      /* ignore */
    }
  };
}

/** Clear session lock + cancel/yield signals (orphaned / deadlocked bulk). */
export async function forceClearPipelineRunLock(): Promise<void> {
  try {
    await chrome.storage.session.remove([STORAGE_KEY, CANCEL_KEY, YIELD_KEY]);
  } catch {
    try {
      await chrome.storage.session.remove(STORAGE_KEY);
      await chrome.storage.session.remove(CANCEL_KEY);
      await chrome.storage.session.remove(YIELD_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Poll until the shared lock is free (or stale), then try acquire. */
export async function waitAndAcquirePipelineRunLock(
  input: {
    ownerId: string;
    title: string;
    kind?: PipelineRunKind;
    itemCount?: number;
    importRunId?: string | null;
  },
  opts?: {
    signal?: AbortSignal;
    pollMs?: number;
    /** After this many ms, clear a stuck lock and retry once (singles jumping bulk). */
    maxWaitMs?: number;
    onWaiting?: (lock: PipelineRunLock) => void;
  }
): Promise<AcquirePipelineLockResult> {
  const pollMs = opts?.pollMs ?? 600;
  const started = Date.now();
  let forced = false;
  for (;;) {
    if (opts?.signal?.aborted) {
      const lock = (await readPipelineRunLock()) ?? {
        ownerId: 'unknown',
        kind: 'bulk' as const,
        importRunId: null,
        title: 'Cancelled',
        itemCount: 0,
        startedAt: Date.now(),
        heartbeatAt: Date.now(),
        cancelRequested: false,
      };
      return { ok: false, lock, reason: 'held_by_other' };
    }
    const acq = await tryAcquirePipelineRunLock(input);
    if (acq.ok) return acq;
    opts?.onWaiting?.(acq.lock);

    const maxWait = opts?.maxWaitMs;
    if (maxWait != null && !forced && Date.now() - started >= maxWait) {
      forced = true;
      await forceClearPipelineRunLock();
      const retry = await tryAcquirePipelineRunLock(input);
      if (retry.ok) return retry;
    }
    await new Promise<void>((r) => setTimeout(r, pollMs));
  }
}
