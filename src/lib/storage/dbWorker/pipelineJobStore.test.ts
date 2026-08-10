import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initSchema, initSqlite3, type Database } from '../sqlite/connectionShared';
import {
  PIPELINE_JOB_SCHEMA_SQL,
  acknowledgePipelineCancellation,
  claimNextPipelineTask,
  finishPipelineTask,
  getPipelineJobSnapshot,
  recoverExpiredPipelineTasks,
  requestPipelineCancellation,
  submitPipelineJob,
} from './pipelineJobStore';

let db: Database;

describe('durable pipeline job store', () => {
  beforeEach(async () => {
    const sqlite = await initSqlite3();
    db = new sqlite.oo1.DB();
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(PIPELINE_JOB_SCHEMA_SQL);
  });

  afterEach(() => db.close());

  it('migrates an existing schema-v4 database to the durable job tables', () => {
    db.exec('DROP TABLE pipeline_tasks; DROP TABLE pipeline_jobs;');
    db.exec(`
      CREATE TABLE app_meta (
        id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        device_id TEXT
      );
      INSERT INTO app_meta (id, schema_version, created_at) VALUES ('default', 4, 1);
      PRAGMA user_version = 4;
    `);
    initSchema(db, 5);
    const names = db.exec({
      sql: `SELECT name FROM sqlite_master
            WHERE type = 'table' AND name IN ('pipeline_jobs', 'pipeline_tasks')
            ORDER BY name;`,
      returnValue: 'resultRows',
      rowMode: 'array',
    }) as unknown[][];
    expect(names).toEqual([['pipeline_jobs'], ['pipeline_tasks']]);
    expect(db.exec({ sql: 'PRAGMA user_version;', returnValue: 'resultRows' })[0]?.[0]).toBe(5);
  });

  it('commits staged tasks before acknowledging and deduplicates active work', () => {
    const first = submitPipelineJob(db, {
      id: 'job-1',
      dedupeKey: 'full:item-1',
      action: 'full_enrich',
      source: 'hub',
      itemIds: ['item-1'],
      now: 100,
    });
    expect(first.accepted).toBe(true);
    expect(first.snapshot.job.status).toBe('queued');
    expect(first.snapshot.tasks.map((task) => task.stage)).toEqual([
      'preflight',
      'fetch',
      'content_store',
      'extract_ai',
      'enrichment_commit',
      'embed',
      'classify',
      'finalize',
    ]);

    const duplicate = submitPipelineJob(db, {
      id: 'job-2',
      dedupeKey: 'full:item-1',
      action: 'full_enrich',
      source: 'sidebar',
      itemIds: ['item-1'],
      now: 101,
    });
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.snapshot.job.id).toBe('job-1');
  });

  it('claims stages in order and rejects stale fenced commits', () => {
    submitPipelineJob(db, {
      id: 'job-1',
      dedupeKey: 'full:item-1',
      action: 'full_enrich',
      source: 'hub',
      itemIds: ['item-1'],
      stages: ['preflight', 'fetch'],
      now: 100,
    });
    const claim = claimNextPipelineTask(db, 'owner-a', 5_000, 200);
    expect(claim?.task.stage).toBe('preflight');

    const stale = finishPipelineTask(db, {
      jobId: 'job-1',
      itemId: 'item-1',
      stage: 'preflight',
      ownerId: 'owner-a',
      jobLeaseEpoch: claim!.jobLeaseEpoch,
      taskLeaseEpoch: claim!.taskLeaseEpoch + 1,
      outcome: 'completed',
      now: 300,
    });
    expect(stale.accepted).toBe(false);

    const committed = finishPipelineTask(db, {
      jobId: 'job-1',
      itemId: 'item-1',
      stage: 'preflight',
      ownerId: 'owner-a',
      jobLeaseEpoch: claim!.jobLeaseEpoch,
      taskLeaseEpoch: claim!.taskLeaseEpoch,
      outcome: 'completed',
      now: 301,
    });
    expect(committed.accepted).toBe(true);
    expect(claimNextPipelineTask(db, 'owner-a', 5_000, 400)?.task.stage).toBe('fetch');
  });

  it('makes cancellation durable before terminal acknowledgement and fences late work', () => {
    submitPipelineJob(db, {
      id: 'job-1',
      dedupeKey: 'full:item-1',
      action: 'full_enrich',
      source: 'hub',
      itemIds: ['item-1'],
      stages: ['fetch'],
      now: 100,
    });
    const claim = claimNextPipelineTask(db, 'owner-a', 5_000, 200)!;
    const requested = requestPipelineCancellation(db, 'job-1', 250);
    expect(requested?.job.status).toBe('cancel_requested');

    const late = finishPipelineTask(db, {
      jobId: 'job-1',
      itemId: 'item-1',
      stage: 'fetch',
      ownerId: 'owner-a',
      jobLeaseEpoch: claim.jobLeaseEpoch,
      taskLeaseEpoch: claim.taskLeaseEpoch,
      outcome: 'completed',
      now: 300,
    });
    expect(late.accepted).toBe(false);
    expect(acknowledgePipelineCancellation(db, 'job-1', 350)?.job.status).toBe('cancelled');
  });

  it('requeues expired safe work but leaves interrupted paid work uncertain', () => {
    submitPipelineJob(db, {
      id: 'safe-job',
      dedupeKey: 'fetch:item-1',
      action: 'fetch_only',
      source: 'hub',
      itemIds: ['item-1'],
      stages: ['fetch'],
      now: 100,
    });
    claimNextPipelineTask(db, 'owner-a', 5_000, 200);
    expect(recoverExpiredPipelineTasks(db, 5_201)).toMatchObject({ requeued: 1, uncertain: 0 });
    expect(getPipelineJobSnapshot(db, 'safe-job')?.tasks[0].status).toBe('pending');
    const recoveredSafe = claimNextPipelineTask(db, 'owner-a', 5_000, 5_300)!;
    finishPipelineTask(db, {
      jobId: recoveredSafe.job.id,
      itemId: recoveredSafe.task.item_id,
      stage: recoveredSafe.task.stage,
      ownerId: 'owner-a',
      jobLeaseEpoch: recoveredSafe.jobLeaseEpoch,
      taskLeaseEpoch: recoveredSafe.taskLeaseEpoch,
      outcome: 'completed',
      now: 5_400,
    });

    submitPipelineJob(db, {
      id: 'paid-job',
      dedupeKey: 'ai:item-2',
      action: 'full_enrich',
      source: 'hub',
      itemIds: ['item-2'],
      stages: ['extract_ai', 'enrichment_commit'],
      now: 6_000,
    });
    claimNextPipelineTask(db, 'owner-b', 5_000, 6_100);
    expect(recoverExpiredPipelineTasks(db, 11_101)).toMatchObject({ requeued: 0, uncertain: 1 });
    const paid = getPipelineJobSnapshot(db, 'paid-job');
    expect(paid?.job.status).toBe('failed');
    expect(paid?.job.failed_items).toBe(1);
    expect(paid?.tasks.map((task) => task.status)).toEqual(['uncertain', 'skipped']);
  });
});
