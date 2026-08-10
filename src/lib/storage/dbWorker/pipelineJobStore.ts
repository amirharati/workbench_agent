import type { Database } from '../sqlite/connectionShared';

export const PIPELINE_SCHEMA_VERSION = 5;

export const PIPELINE_JOB_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS pipeline_jobs (
    id TEXT PRIMARY KEY,
    dedupe_key TEXT NOT NULL,
    action TEXT NOT NULL,
    source TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100,
    status TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    total_items INTEGER NOT NULL DEFAULT 0,
    completed_items INTEGER NOT NULL DEFAULT 0,
    failed_items INTEGER NOT NULL DEFAULT 0,
    lease_owner TEXT,
    lease_epoch INTEGER NOT NULL DEFAULT 0,
    lease_expires_at INTEGER,
    heartbeat_at INTEGER,
    cancel_requested_at INTEGER,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    updated_at INTEGER NOT NULL,
    finished_at INTEGER,
    last_error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_queue
    ON pipeline_jobs(status, priority, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_jobs_active_dedupe
    ON pipeline_jobs(dedupe_key)
    WHERE status IN ('queued', 'running', 'cancel_requested', 'cancelling');

  CREATE TABLE IF NOT EXISTS pipeline_tasks (
    job_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    lease_owner TEXT,
    lease_epoch INTEGER NOT NULL DEFAULT 0,
    lease_expires_at INTEGER,
    input_hash TEXT,
    result_ref TEXT,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    updated_at INTEGER NOT NULL,
    finished_at INTEGER,
    last_error TEXT,
    PRIMARY KEY (job_id, item_id, stage),
    FOREIGN KEY (job_id) REFERENCES pipeline_jobs(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_pipeline_tasks_runnable
    ON pipeline_tasks(status, job_id, ordinal, item_id);
  CREATE INDEX IF NOT EXISTS idx_pipeline_tasks_lease
    ON pipeline_tasks(status, lease_expires_at);
`;

export const FULL_ENRICH_STAGES = [
  'preflight',
  'fetch',
  'content_store',
  'extract_ai',
  'enrichment_commit',
  'embed',
  'classify',
  'finalize',
] as const;

export type PipelineStage = (typeof FULL_ENRICH_STAGES)[number];
export type PipelineJobStatus =
  | 'queued'
  | 'running'
  | 'cancel_requested'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type PipelineTaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'skipped'
  | 'failed'
  | 'uncertain'
  | 'cancelled';

export type SubmitPipelineJobInput = {
  id: string;
  dedupeKey: string;
  action: string;
  source: string;
  priority?: number;
  payload?: unknown;
  itemIds: string[];
  stages?: string[];
  now?: number;
};

export type PipelineJobRow = {
  id: string;
  dedupe_key: string;
  action: string;
  source: string;
  priority: number;
  status: PipelineJobStatus;
  payload_json: string;
  total_items: number;
  completed_items: number;
  failed_items: number;
  lease_owner: string | null;
  lease_epoch: number;
  lease_expires_at: number | null;
  heartbeat_at: number | null;
  cancel_requested_at: number | null;
  created_at: number;
  started_at: number | null;
  updated_at: number;
  finished_at: number | null;
  last_error: string | null;
};

export type PipelineTaskRow = {
  job_id: string;
  item_id: string;
  stage: string;
  ordinal: number;
  status: PipelineTaskStatus;
  attempts: number;
  lease_owner: string | null;
  lease_epoch: number;
  lease_expires_at: number | null;
  input_hash: string | null;
  result_ref: string | null;
  created_at: number;
  started_at: number | null;
  updated_at: number;
  finished_at: number | null;
  last_error: string | null;
};

export type PipelineJobSnapshot = { job: PipelineJobRow; tasks: PipelineTaskRow[] };
export type ClaimedPipelineTask = {
  job: PipelineJobRow;
  task: PipelineTaskRow;
  jobLeaseEpoch: number;
  taskLeaseEpoch: number;
};

function rows<T>(db: Database, sql: string, bind: unknown[] = []): T[] {
  return db.exec({
    sql,
    bind: bind as Parameters<Database['exec']>[0]['bind'],
    returnValue: 'resultRows',
    rowMode: 'object',
  }) as unknown as T[];
}

function one<T>(db: Database, sql: string, bind: unknown[] = []): T | null {
  return rows<T>(db, sql, bind)[0] ?? null;
}

function transaction<T>(db: Database, work: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = work();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* ignore rollback failure */ }
    throw error;
  }
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

export function getPipelineJobSnapshot(db: Database, jobId: string): PipelineJobSnapshot | null {
  const job = one<PipelineJobRow>(db, 'SELECT * FROM pipeline_jobs WHERE id = ?;', [jobId]);
  if (!job) return null;
  const tasks = rows<PipelineTaskRow>(
    db,
    'SELECT * FROM pipeline_tasks WHERE job_id = ? ORDER BY item_id, ordinal;',
    [jobId]
  );
  return { job, tasks };
}

export function submitPipelineJob(
  db: Database,
  input: SubmitPipelineJobInput
): { accepted: boolean; snapshot: PipelineJobSnapshot } {
  const id = required(input.id, 'Job id');
  const dedupeKey = required(input.dedupeKey, 'Dedupe key');
  const action = required(input.action, 'Job action');
  const source = required(input.source, 'Job source');
  const itemIds = [...new Set(input.itemIds.map((value) => value.trim()).filter(Boolean))];
  const stages = [...new Set((input.stages?.length ? input.stages : FULL_ENRICH_STAGES)
    .map((value) => value.trim()).filter(Boolean))];
  if (!itemIds.length) throw new Error('At least one item is required');
  if (!stages.length) throw new Error('At least one pipeline stage is required');
  const now = input.now ?? Date.now();
  const priority = Number.isFinite(input.priority) ? Math.trunc(input.priority!) : 100;
  const payloadJson = JSON.stringify(input.payload ?? {});

  return transaction(db, () => {
    const existing = one<PipelineJobRow>(
      db,
      `SELECT * FROM pipeline_jobs
       WHERE id = ? OR (dedupe_key = ? AND status IN
         ('queued', 'running', 'cancel_requested', 'cancelling'))
       ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1;`,
      [id, dedupeKey, id]
    );
    if (existing) {
      const snapshot = getPipelineJobSnapshot(db, existing.id);
      if (!snapshot) throw new Error('Existing pipeline job disappeared');
      return { accepted: false, snapshot };
    }

    const overlapping = one<PipelineJobRow>(
      db,
      `SELECT j.* FROM pipeline_jobs j
       JOIN pipeline_tasks t ON t.job_id = j.id
       WHERE j.status IN ('queued', 'running', 'cancel_requested', 'cancelling')
         AND t.item_id IN (${itemIds.map(() => '?').join(', ')})
       ORDER BY j.priority ASC, j.created_at ASC LIMIT 1;`,
      itemIds
    );
    if (overlapping) {
      const snapshot = getPipelineJobSnapshot(db, overlapping.id);
      if (!snapshot) throw new Error('Overlapping pipeline job disappeared');
      return { accepted: false, snapshot };
    }

    db.exec({
      sql: `INSERT INTO pipeline_jobs
        (id, dedupe_key, action, source, priority, status, payload_json,
         total_items, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?);`,
      bind: [id, dedupeKey, action, source, priority, payloadJson, itemIds.length, now, now],
    });
    itemIds.forEach((itemId, itemIndex) => {
      stages.forEach((stage, ordinal) => {
        db.exec({
          sql: `INSERT INTO pipeline_tasks
            (job_id, item_id, stage, ordinal, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'pending', ?, ?);`,
          bind: [id, itemId, stage, itemIndex * stages.length + ordinal, now, now],
        });
      });
    });
    const snapshot = getPipelineJobSnapshot(db, id);
    if (!snapshot) throw new Error('Submitted pipeline job could not be read back');
    return { accepted: true, snapshot };
  });
}

export function claimNextPipelineTask(
  db: Database,
  ownerId: string,
  leaseMs = 30_000,
  now = Date.now(),
  jobId?: string
): ClaimedPipelineTask | null {
  const owner = required(ownerId, 'Lease owner');
  const duration = Math.max(5_000, Math.trunc(leaseMs));
  return transaction(db, () => {
    const candidate = one<{ job_id: string; item_id: string; stage: string }>(
      db,
      `SELECT t.job_id, t.item_id, t.stage
       FROM pipeline_tasks t
       JOIN pipeline_jobs j ON j.id = t.job_id
       WHERE t.status = 'pending'
         AND j.status IN ('queued', 'running')
         AND j.cancel_requested_at IS NULL
         AND (? IS NULL OR t.job_id = ?)
         AND NOT EXISTS (
           SELECT 1 FROM pipeline_tasks earlier
           WHERE earlier.job_id = t.job_id AND earlier.item_id = t.item_id
             AND earlier.ordinal < t.ordinal
             AND earlier.status NOT IN ('completed', 'skipped')
         )
       ORDER BY j.priority ASC, j.created_at ASC, t.ordinal ASC, t.item_id ASC
       LIMIT 1;`,
      [jobId ?? null, jobId ?? null]
    );
    if (!candidate) return null;
    const expiresAt = now + duration;
    db.exec({
      sql: `UPDATE pipeline_jobs
            SET status = 'running', lease_owner = ?, lease_epoch = lease_epoch + 1,
                lease_expires_at = ?, heartbeat_at = ?, started_at = COALESCE(started_at, ?),
                updated_at = ?
            WHERE id = ? AND status IN ('queued', 'running') AND cancel_requested_at IS NULL;`,
      bind: [owner, expiresAt, now, now, now, candidate.job_id],
    });
    const job = one<PipelineJobRow>(db, 'SELECT * FROM pipeline_jobs WHERE id = ?;', [candidate.job_id]);
    if (!job || job.status !== 'running' || job.lease_owner !== owner) return null;
    db.exec({
      sql: `UPDATE pipeline_tasks
            SET status = 'running', attempts = attempts + 1, lease_owner = ?,
                lease_epoch = lease_epoch + 1, lease_expires_at = ?,
                started_at = COALESCE(started_at, ?), updated_at = ?
            WHERE job_id = ? AND item_id = ? AND stage = ? AND status = 'pending';`,
      bind: [owner, expiresAt, now, now, candidate.job_id, candidate.item_id, candidate.stage],
    });
    if (db.changes() !== 1) return null;
    const task = one<PipelineTaskRow>(
      db,
      'SELECT * FROM pipeline_tasks WHERE job_id = ? AND item_id = ? AND stage = ?;',
      [candidate.job_id, candidate.item_id, candidate.stage]
    );
    if (!task) throw new Error('Claimed task could not be read back');
    return {
      job,
      task,
      jobLeaseEpoch: Number(job.lease_epoch),
      taskLeaseEpoch: Number(task.lease_epoch),
    };
  });
}

export function heartbeatPipelineTask(
  db: Database,
  input: {
    jobId: string;
    itemId: string;
    stage: string;
    ownerId: string;
    jobLeaseEpoch: number;
    taskLeaseEpoch: number;
    leaseMs?: number;
    now?: number;
  }
): { accepted: boolean; cancelRequested: boolean; leaseExpiresAt?: number } {
  const now = input.now ?? Date.now();
  const expiresAt = now + Math.max(5_000, Math.trunc(input.leaseMs ?? 30_000));
  return transaction(db, () => {
    const job = one<PipelineJobRow>(db, 'SELECT * FROM pipeline_jobs WHERE id = ?;', [input.jobId]);
    if (!job) return { accepted: false, cancelRequested: false };
    const cancelRequested = job.cancel_requested_at != null || job.status === 'cancel_requested';
    if (
      cancelRequested || job.status !== 'running' || job.lease_owner !== input.ownerId ||
      Number(job.lease_epoch) !== input.jobLeaseEpoch
    ) {
      return { accepted: false, cancelRequested };
    }
    db.exec({
      sql: `UPDATE pipeline_tasks SET lease_expires_at = ?, updated_at = ?
            WHERE job_id = ? AND item_id = ? AND stage = ? AND status = 'running'
              AND lease_owner = ? AND lease_epoch = ?;`,
      bind: [expiresAt, now, input.jobId, input.itemId, input.stage, input.ownerId, input.taskLeaseEpoch],
    });
    if (db.changes() !== 1) return { accepted: false, cancelRequested: false };
    db.exec({
      sql: `UPDATE pipeline_jobs SET lease_expires_at = ?, heartbeat_at = ?, updated_at = ?
            WHERE id = ? AND lease_owner = ? AND lease_epoch = ?;`,
      bind: [expiresAt, now, now, input.jobId, input.ownerId, input.jobLeaseEpoch],
    });
    return { accepted: true, cancelRequested: false, leaseExpiresAt: expiresAt };
  });
}

function refreshJobCounts(db: Database, jobId: string, now: number): PipelineJobSnapshot {
  const counts = one<{ total_items: number; completed_items: number; failed_items: number; active_tasks: number }>(
    db,
    `SELECT
       COUNT(DISTINCT item_id) AS total_items,
       COUNT(DISTINCT CASE WHEN NOT EXISTS (
         SELECT 1 FROM pipeline_tasks x
         WHERE x.job_id = t.job_id AND x.item_id = t.item_id
           AND x.status NOT IN ('completed', 'skipped')
       ) THEN item_id END) AS completed_items,
       COUNT(DISTINCT CASE WHEN EXISTS (
         SELECT 1 FROM pipeline_tasks x
         WHERE x.job_id = t.job_id AND x.item_id = t.item_id
           AND x.status IN ('failed', 'uncertain')
       ) THEN item_id END) AS failed_items,
       SUM(CASE WHEN status IN ('pending', 'running') THEN 1 ELSE 0 END) AS active_tasks
     FROM pipeline_tasks t WHERE job_id = ?;`,
    [jobId]
  );
  const job = one<PipelineJobRow>(db, 'SELECT * FROM pipeline_jobs WHERE id = ?;', [jobId]);
  if (!job) throw new Error('Pipeline job not found');
  const activeTasks = Number(counts?.active_tasks ?? 0);
  const cancelRequested = job.cancel_requested_at != null || job.status === 'cancel_requested';
  const failedItems = Number(counts?.failed_items ?? 0);
  const nextStatus: PipelineJobStatus = activeTasks === 0
    ? (cancelRequested ? 'cancelled' : failedItems > 0 ? 'failed' : 'completed')
    : job.status;
  db.exec({
    sql: `UPDATE pipeline_jobs
          SET total_items = ?, completed_items = ?, failed_items = ?, status = ?, updated_at = ?,
              finished_at = CASE WHEN ? IN ('completed', 'cancelled', 'failed') THEN ? ELSE finished_at END,
              lease_owner = CASE WHEN ? IN ('completed', 'cancelled', 'failed') THEN NULL ELSE lease_owner END,
              lease_expires_at = CASE WHEN ? IN ('completed', 'cancelled', 'failed') THEN NULL ELSE lease_expires_at END
          WHERE id = ?;`,
    bind: [
      Number(counts?.total_items ?? 0),
      Number(counts?.completed_items ?? 0),
      Number(counts?.failed_items ?? 0),
      nextStatus,
      now,
      nextStatus,
      now,
      nextStatus,
      nextStatus,
      jobId,
    ],
  });
  const snapshot = getPipelineJobSnapshot(db, jobId);
  if (!snapshot) throw new Error('Updated pipeline job could not be read back');
  return snapshot;
}

export function finishPipelineTask(
  db: Database,
  input: {
    jobId: string;
    itemId: string;
    stage: string;
    ownerId: string;
    jobLeaseEpoch: number;
    taskLeaseEpoch: number;
    outcome: 'completed' | 'failed' | 'skipped';
    resultRef?: string;
    error?: string;
    now?: number;
  }
): { accepted: boolean; snapshot: PipelineJobSnapshot | null } {
  const now = input.now ?? Date.now();
  return transaction(db, () => {
    db.exec({
      sql: `UPDATE pipeline_tasks
            SET status = ?, result_ref = ?, last_error = ?, finished_at = ?, updated_at = ?,
                lease_owner = NULL, lease_expires_at = NULL
            WHERE job_id = ? AND item_id = ? AND stage = ? AND status = 'running'
              AND lease_owner = ? AND lease_epoch = ?
              AND EXISTS (
                SELECT 1 FROM pipeline_jobs j WHERE j.id = pipeline_tasks.job_id
                  AND j.status = 'running' AND j.cancel_requested_at IS NULL
                  AND j.lease_owner = ? AND j.lease_epoch = ?
              );`,
      bind: [
        input.outcome,
        input.resultRef ?? null,
        input.error ?? null,
        now,
        now,
        input.jobId,
        input.itemId,
        input.stage,
        input.ownerId,
        input.taskLeaseEpoch,
        input.ownerId,
        input.jobLeaseEpoch,
      ],
    });
    if (db.changes() !== 1) {
      return { accepted: false, snapshot: getPipelineJobSnapshot(db, input.jobId) };
    }
    if (input.outcome === 'failed') {
      const current = one<{ ordinal: number }>(
        db,
        'SELECT ordinal FROM pipeline_tasks WHERE job_id = ? AND item_id = ? AND stage = ?;',
        [input.jobId, input.itemId, input.stage]
      );
      db.exec({
        sql: `UPDATE pipeline_tasks SET status = 'skipped', finished_at = ?, updated_at = ?,
                    last_error = 'Blocked by earlier failed stage'
              WHERE job_id = ? AND item_id = ? AND ordinal > ? AND status = 'pending';`,
        bind: [now, now, input.jobId, input.itemId, current?.ordinal ?? -1],
      });
    }
    return { accepted: true, snapshot: refreshJobCounts(db, input.jobId, now) };
  });
}

export function requestPipelineCancellation(
  db: Database,
  jobId: string,
  now = Date.now()
): PipelineJobSnapshot | null {
  return transaction(db, () => {
    const job = one<PipelineJobRow>(db, 'SELECT * FROM pipeline_jobs WHERE id = ?;', [jobId]);
    if (!job) return null;
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      return getPipelineJobSnapshot(db, jobId);
    }
    db.exec({
      sql: `UPDATE pipeline_jobs
            SET status = 'cancel_requested', cancel_requested_at = ?, lease_epoch = lease_epoch + 1,
                updated_at = ? WHERE id = ?;`,
      bind: [now, now, jobId],
    });
    db.exec({
      sql: `UPDATE pipeline_tasks SET status = 'cancelled', finished_at = ?, updated_at = ?
            WHERE job_id = ? AND status = 'pending';`,
      bind: [now, now, jobId],
    });
    db.exec({
      sql: `UPDATE pipeline_tasks SET lease_epoch = lease_epoch + 1, updated_at = ?
            WHERE job_id = ? AND status = 'running';`,
      bind: [now, jobId],
    });
    return getPipelineJobSnapshot(db, jobId);
  });
}

export function acknowledgePipelineCancellation(
  db: Database,
  jobId: string,
  now = Date.now()
): PipelineJobSnapshot | null {
  return transaction(db, () => {
    db.exec({
      sql: `UPDATE pipeline_tasks
            SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL,
                finished_at = ?, updated_at = ?
            WHERE job_id = ? AND status IN ('pending', 'running');`,
      bind: [now, now, jobId],
    });
    db.exec({
      sql: `UPDATE pipeline_jobs
            SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL,
                finished_at = ?, updated_at = ?
            WHERE id = ? AND status IN ('cancel_requested', 'cancelling');`,
      bind: [now, now, jobId],
    });
    return getPipelineJobSnapshot(db, jobId);
  });
}

export function recoverExpiredPipelineTasks(
  db: Database,
  now = Date.now()
): { requeued: number; uncertain: number; affectedJobs: string[] } {
  return transaction(db, () => {
    const expired = rows<{ job_id: string; item_id: string; stage: string; ordinal: number }>(
      db,
      `SELECT job_id, item_id, stage, ordinal FROM pipeline_tasks
       WHERE status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?;`,
      [now]
    );
    const affectedJobs = [...new Set(expired.map((task) => task.job_id))];
    let requeued = 0;
    let uncertain = 0;
    for (const task of expired) {
      // `full_digest` is the intentionally coarse task used by the first
      // coordinator vertical slice. It can include paid AI/embedding calls, so
      // an interrupted lease must never be retried automatically.
      const paid = [
        'enrich',
        'reextract',
        'discover',
        'extract_ai',
        'embed',
        'classify',
        'full_digest',
      ].includes(task.stage);
      db.exec({
        sql: `UPDATE pipeline_tasks
              SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
                  lease_epoch = lease_epoch + 1, updated_at = ?,
                  finished_at = CASE WHEN ? THEN ? ELSE NULL END,
                  last_error = CASE WHEN ? THEN 'Interrupted paid stage requires explicit retry' ELSE NULL END
              WHERE job_id = ? AND item_id = ? AND stage = ? AND status = 'running';`,
        bind: [paid ? 'uncertain' : 'pending', now, paid ? 1 : 0, now, paid ? 1 : 0, task.job_id, task.item_id, task.stage],
      });
      if (paid) {
        uncertain++;
        db.exec({
          sql: `UPDATE pipeline_tasks SET status = 'skipped', finished_at = ?, updated_at = ?,
                      last_error = 'Blocked by uncertain paid stage'
                WHERE job_id = ? AND item_id = ? AND ordinal > ? AND status = 'pending';`,
          bind: [now, now, task.job_id, task.item_id, task.ordinal],
        });
      } else {
        requeued++;
      }
    }
    for (const jobId of affectedJobs) {
      const hasUncertain = one<{ count: number }>(
        db,
        `SELECT COUNT(*) AS count FROM pipeline_tasks
         WHERE job_id = ? AND status = 'uncertain';`,
        [jobId]
      );
      const hasPending = one<{ count: number }>(
        db,
        `SELECT COUNT(*) AS count FROM pipeline_tasks
         WHERE job_id = ? AND status = 'pending';`,
        [jobId]
      );
      const shouldContinue = Number(hasPending?.count ?? 0) > 0;
      db.exec({
        sql: `UPDATE pipeline_jobs
              SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
                  lease_epoch = lease_epoch + 1, updated_at = ?,
                  finished_at = CASE WHEN ? THEN ? ELSE NULL END,
                  last_error = CASE WHEN ? THEN 'Interrupted paid stage requires explicit retry' ELSE last_error END
              WHERE id = ? AND status = 'running';`,
        bind: [
          shouldContinue ? 'queued' : Number(hasUncertain?.count ?? 0) > 0 ? 'failed' : 'queued',
          now,
          shouldContinue ? 0 : Number(hasUncertain?.count ?? 0) > 0 ? 1 : 0,
          now,
          shouldContinue ? 0 : Number(hasUncertain?.count ?? 0) > 0 ? 1 : 0,
          jobId,
        ],
      });
      refreshJobCounts(db, jobId, now);
    }
    return { requeued, uncertain, affectedJobs };
  });
}

export function listRecoverablePipelineJobs(db: Database): PipelineJobSnapshot[] {
  const jobs = rows<{ id: string }>(
    db,
    `SELECT id FROM pipeline_jobs
     WHERE status IN ('queued', 'running', 'cancel_requested', 'cancelling')
     ORDER BY priority ASC, created_at ASC;`
  );
  return jobs.flatMap(({ id }) => {
    const snapshot = getPipelineJobSnapshot(db, id);
    return snapshot ? [snapshot] : [];
  });
}
