import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initSchema, initSqlite3, type Database } from '../sqlite/connectionShared';
import {
  PIPELINE_JOB_SCHEMA_SQL,
  acknowledgePipelinePause,
  acknowledgePipelineCancellation,
  claimNextPipelineTask,
  finishPipelineTask,
  getPipelineJobSnapshot,
  recoverExpiredPipelineTasks,
  requeuePipelineTaskForRuntimeRestart,
  requestPipelinePause,
  requestPipelineCancellation,
  resumePipelineJob,
  submitPipelineJob,
  yieldPipelineJob,
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

  it('migrates an existing schema-v4 database to the current durable job tables', () => {
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
    initSchema(db, 9);
    const names = db.exec({
      sql: `SELECT name FROM sqlite_master
            WHERE type = 'table' AND name IN ('pipeline_jobs', 'pipeline_tasks')
            ORDER BY name;`,
      returnValue: 'resultRows',
      rowMode: 'array',
    }) as unknown[][];
    expect(names).toEqual([['pipeline_jobs'], ['pipeline_tasks']]);
    expect(db.exec({ sql: 'PRAGMA user_version;', returnValue: 'resultRows' })[0]?.[0]).toBe(9);
    const categoryProfileTable = db.exec({
      sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_category_search_profiles';",
      returnValue: 'resultRows',
      rowMode: 'array',
    }) as unknown[][];
    expect(categoryProfileTable).toEqual([['ai_category_search_profiles']]);
  });

  it('adds durable removed placements when upgrading a v6 database', () => {
    db.exec('DROP TABLE pipeline_tasks; DROP TABLE pipeline_jobs;');
    db.exec(`
      CREATE TABLE app_meta (
        id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        device_id TEXT
      );
      INSERT INTO app_meta (id, schema_version, created_at) VALUES ('default', 6, 1);
      CREATE TABLE items (
        id TEXT PRIMARY KEY,
        collection_ids TEXT NOT NULL DEFAULT '[]'
      );
      PRAGMA user_version = 6;
    `);
    initSchema(db, 9);
    const columns = db.exec({ sql: 'PRAGMA table_info(items);', returnValue: 'resultRows', rowMode: 'array' }) as unknown[][];
    expect(columns.some((column) => column[1] === 'removed_placements')).toBe(true);
    const tables = db.exec({ sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'container_trash';", returnValue: 'resultRows' }) as unknown[][];
    expect(tables).toEqual([['container_trash']]);
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

  it('requeues only the interrupted stage when the coordinator runtime changes', () => {
    submitPipelineJob(db, {
      id: 'runtime-job',
      dedupeKey: 'runtime:item-1',
      action: 'full_digest_v2',
      source: 'sidebar',
      itemIds: ['item-1'],
      stages: ['enrich', 'embed', 'classify', 'finalize'],
      now: 100,
    });
    const enrich = claimNextPipelineTask(db, 'old-runtime', 5_000, 200, 'runtime-job')!;
    finishPipelineTask(db, {
      jobId: 'runtime-job', itemId: 'item-1', stage: 'enrich', ownerId: 'old-runtime',
      jobLeaseEpoch: enrich.jobLeaseEpoch, taskLeaseEpoch: enrich.taskLeaseEpoch,
      outcome: 'completed', resultRef: 'enrich:ok:processed', now: 201,
    });
    const embed = claimNextPipelineTask(db, 'old-runtime', 5_000, 300, 'runtime-job')!;

    const requeued = requeuePipelineTaskForRuntimeRestart(db, {
      jobId: 'runtime-job', itemId: 'item-1', stage: 'embed', ownerId: 'old-runtime',
      jobLeaseEpoch: embed.jobLeaseEpoch, taskLeaseEpoch: embed.taskLeaseEpoch,
      error: 'Failed to fetch dynamically imported module: old-chunk.js', now: 301,
    });

    expect(requeued.accepted).toBe(true);
    expect(requeued.snapshot?.job.status).toBe('queued');
    expect(requeued.snapshot?.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'enrich', status: 'completed', result_ref: 'enrich:ok:processed' }),
      expect.objectContaining({ stage: 'embed', status: 'pending' }),
      expect.objectContaining({ stage: 'classify', status: 'pending' }),
      expect.objectContaining({ stage: 'finalize', status: 'pending' }),
    ]));
    expect(claimNextPipelineTask(db, 'new-runtime', 5_000, 400, 'runtime-job')?.task.stage)
      .toBe('embed');
  });

  it('can restrict a claim to the accepted job', () => {
    submitPipelineJob(db, {
      id: 'older-job', dedupeKey: 'full:item-1', action: 'full_enrich', source: 'hub',
      itemIds: ['item-1'], stages: ['full_digest'], now: 100,
    });
    submitPipelineJob(db, {
      id: 'requested-job', dedupeKey: 'full:item-2', action: 'full_enrich', source: 'hub',
      itemIds: ['item-2'], stages: ['full_digest'], now: 200,
    });

    const claim = claimNextPipelineTask(db, 'owner-a', 5_000, 300, 'requested-job');
    expect(claim?.job.id).toBe('requested-job');
    expect(claim?.task.item_id).toBe('item-2');
  });

  it('orders all stages for one item before starting the next and rejects overlapping scopes', () => {
    submitPipelineJob(db, {
      id: 'batch-job',
      dedupeKey: 'batch:1',
      action: 'full_digest_v2',
      source: 'hub',
      itemIds: ['item-1', 'item-2'],
      stages: ['enrich', 'embed'],
      now: 100,
    });
    const overlap = submitPipelineJob(db, {
      id: 'single-job',
      dedupeKey: 'single:item-2',
      action: 'full_digest_v2',
      source: 'sidebar',
      itemIds: ['item-2'],
      stages: ['enrich', 'embed'],
      now: 101,
    });
    expect(overlap.accepted).toBe(false);
    expect(overlap.snapshot.job.id).toBe('batch-job');

    const first = claimNextPipelineTask(db, 'owner-a', 5_000, 200, 'batch-job')!;
    expect([first.task.item_id, first.task.stage]).toEqual(['item-1', 'enrich']);
    finishPipelineTask(db, {
      jobId: 'batch-job', itemId: 'item-1', stage: 'enrich', ownerId: 'owner-a',
      jobLeaseEpoch: first.jobLeaseEpoch, taskLeaseEpoch: first.taskLeaseEpoch,
      outcome: 'completed', now: 201,
    });
    const second = claimNextPipelineTask(db, 'owner-a', 5_000, 300, 'batch-job')!;
    expect([second.task.item_id, second.task.stage]).toEqual(['item-1', 'embed']);
  });

  it('barriers a full batch so Discover runs once before any classification', () => {
    const submitted = submitPipelineJob(db, {
      id: 'batch-discover',
      dedupeKey: 'batch:discover',
      action: 'full_digest_v2',
      source: 'import',
      itemIds: ['item-1', 'item-2'],
      stages: ['enrich', 'embed', 'discover', 'classify', 'finalize'],
      taskOrder: 'stage-major',
      now: 100,
    });

    expect(submitted.snapshot.tasks.filter((task) => task.stage === 'discover'))
      .toEqual([expect.objectContaining({ item_id: '__taxonomy__', ordinal: 4 })]);
    expect(
      submitted.snapshot.tasks
        .slice()
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((task) => [task.item_id, task.stage, task.ordinal])
    ).toEqual([
      ['item-1', 'enrich', 0],
      ['item-2', 'enrich', 1],
      ['item-1', 'embed', 2],
      ['item-2', 'embed', 3],
      ['__taxonomy__', 'discover', 4],
      ['item-1', 'classify', 5],
      ['item-2', 'classify', 6],
      ['item-1', 'finalize', 7],
      ['item-2', 'finalize', 8],
    ]);

    let now = 200;
    for (let i = 0; i < 4; i++) {
      const claim = claimNextPipelineTask(db, 'owner-a', 5_000, now++, 'batch-discover')!;
      expect(claim.task.item_id).not.toBe('__taxonomy__');
      expect(claim.task.stage).not.toBe('classify');
      finishPipelineTask(db, {
        jobId: 'batch-discover',
        itemId: claim.task.item_id,
        stage: claim.task.stage,
        ownerId: 'owner-a',
        jobLeaseEpoch: claim.jobLeaseEpoch,
        taskLeaseEpoch: claim.taskLeaseEpoch,
        outcome: 'completed',
        now: now++,
      });
    }

    const discover = claimNextPipelineTask(db, 'owner-a', 5_000, now, 'batch-discover')!;
    expect([discover.task.item_id, discover.task.stage]).toEqual(['__taxonomy__', 'discover']);
    const discovered = finishPipelineTask(db, {
      jobId: 'batch-discover', itemId: '__taxonomy__', stage: 'discover', ownerId: 'owner-a',
      jobLeaseEpoch: discover.jobLeaseEpoch, taskLeaseEpoch: discover.taskLeaseEpoch,
      outcome: 'completed', now: now + 1,
    });
    expect(discovered.accepted).toBe(true);
    expect(claimNextPipelineTask(db, 'owner-a', 5_000, now + 2, 'batch-discover')?.task.stage)
      .toBe('classify');
  });

  it('uses the same pre-classify Discover barrier for a single link without double classification', () => {
    const submitted = submitPipelineJob(db, {
      id: 'single-digest',
      dedupeKey: 'single:digest',
      action: 'full_digest_v2',
      source: 'sidebar',
      itemIds: ['item-1'],
      stages: ['enrich', 'embed', 'discover', 'classify', 'finalize'],
      taskOrder: 'stage-major',
      now: 100,
    });

    expect(
      submitted.snapshot.tasks
        .slice()
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((task) => [task.item_id, task.stage])
    ).toEqual([
      ['item-1', 'enrich'],
      ['item-1', 'embed'],
      ['__taxonomy__', 'discover'],
      ['item-1', 'classify'],
      ['item-1', 'finalize'],
    ]);
    expect(submitted.snapshot.tasks.filter((task) => task.stage === 'classify')).toHaveLength(1);
  });

  it('yields a barriered bulk job after one committed stage so a priority single runs first', () => {
    submitPipelineJob(db, {
      id: 'bulk-job', dedupeKey: 'bulk:1', action: 'full_digest_v2', source: 'hub',
      priority: 50, itemIds: ['item-1', 'item-2'], stages: ['enrich', 'finalize'],
      taskOrder: 'stage-major', now: 100,
    });
    submitPipelineJob(db, {
      id: 'single-job', dedupeKey: 'single:1', action: 'full_digest_v2', source: 'sidebar',
      priority: 10, itemIds: ['item-3'], stages: ['enrich', 'finalize'], now: 101,
    });

    const enrich = claimNextPipelineTask(db, 'owner-a', 5_000, 200, 'bulk-job')!;
    const enriched = finishPipelineTask(db, {
      jobId: 'bulk-job', itemId: 'item-1', stage: 'enrich', ownerId: 'owner-a',
      jobLeaseEpoch: enrich.jobLeaseEpoch, taskLeaseEpoch: enrich.taskLeaseEpoch,
      outcome: 'completed', now: 201,
    });
    expect(enriched.snapshot?.job.completed_items).toBe(0);

    const yielded = yieldPipelineJob(db, {
      jobId: 'bulk-job', ownerId: 'owner-a',
      jobLeaseEpoch: enriched.snapshot!.job.lease_epoch, now: 202,
    });
    expect(yielded.accepted).toBe(true);
    expect(yielded.snapshot?.job.status).toBe('queued');
    expect(yielded.snapshot?.tasks.find(
      (task) => task.item_id === 'item-1' && task.stage === 'enrich'
    )?.status).toBe('completed');
    expect(yielded.snapshot?.tasks.filter((task) => task.status === 'pending')).toHaveLength(3);

    const urgent = claimNextPipelineTask(db, 'owner-b', 5_000, 300)!;
    expect([urgent.job.id, urgent.task.item_id]).toEqual(['single-job', 'item-3']);
    expect(enriched.accepted).toBe(true);
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

  it('pauses after a running stage commits and resumes with a new dashboard window', () => {
    submitPipelineJob(db, {
      id: 'job-pause', dedupeKey: 'pause:item-1', action: 'full_digest_v2', source: 'hub',
      itemIds: ['item-1', 'item-2'], stages: ['enrich', 'finalize'],
      payload: { browserOwnerTabId: 10, browserWindowId: 20 }, now: 100,
    });
    const claim = claimNextPipelineTask(db, 'owner-a', 5_000, 200, 'job-pause')!;
    expect(requestPipelinePause(db, 'job-pause', 210)?.job.status).toBe('pause_requested');

    const committed = finishPipelineTask(db, {
      jobId: 'job-pause', itemId: claim.task.item_id, stage: claim.task.stage,
      ownerId: 'owner-a', jobLeaseEpoch: claim.jobLeaseEpoch,
      taskLeaseEpoch: claim.taskLeaseEpoch, outcome: 'completed', now: 220,
    });
    expect(committed.accepted).toBe(true);
    expect(acknowledgePipelinePause(db, 'job-pause', 230)?.job.status).toBe('paused');
    expect(claimNextPipelineTask(db, 'owner-a', 5_000, 240, 'job-pause')).toBeNull();

    const duplicate = submitPipelineJob(db, {
      id: 'duplicate', dedupeKey: 'pause:item-1', action: 'full_digest_v2', source: 'hub',
      itemIds: ['item-1'], stages: ['enrich'], now: 250,
    });
    expect(duplicate.accepted).toBe(false);

    const resumed = resumePipelineJob(db, 'job-pause', 30, 40, 260);
    expect(resumed.accepted).toBe(true);
    expect(resumed.snapshot?.job.status).toBe('queued');
    expect(JSON.parse(resumed.snapshot!.job.payload_json)).toMatchObject({
      browserOwnerTabId: 30,
      browserWindowId: 40,
    });
    expect(claimNextPipelineTask(db, 'owner-b', 5_000, 270, 'job-pause')?.task.stage).toBe('finalize');
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

    submitPipelineJob(db, {
      id: 'coarse-job',
      dedupeKey: 'full:item-3',
      action: 'full_enrich',
      source: 'hub',
      itemIds: ['item-3'],
      stages: ['full_digest'],
      now: 12_000,
    });
    claimNextPipelineTask(db, 'owner-c', 5_000, 12_100, 'coarse-job');
    expect(recoverExpiredPipelineTasks(db, 17_101)).toMatchObject({ requeued: 0, uncertain: 1 });
    expect(getPipelineJobSnapshot(db, 'coarse-job')?.tasks[0].status).toBe('uncertain');
  });

  it('recovers an expired job lease between two safe task claims', () => {
    submitPipelineJob(db, {
      id: 'between-items', dedupeKey: 'between:1', action: 'full_digest_v2', source: 'hub',
      itemIds: ['item-1'], stages: ['finalize-a', 'finalize-b'], now: 100,
    });
    const first = claimNextPipelineTask(db, 'owner-a', 5_000, 200, 'between-items')!;
    finishPipelineTask(db, {
      jobId: first.job.id, itemId: first.task.item_id, stage: first.task.stage,
      ownerId: 'owner-a', jobLeaseEpoch: first.jobLeaseEpoch,
      taskLeaseEpoch: first.taskLeaseEpoch, outcome: 'completed', now: 300,
    });

    const recovered = recoverExpiredPipelineTasks(db, 5_201);
    expect(recovered.affectedJobs).toContain('between-items');
    expect(getPipelineJobSnapshot(db, 'between-items')?.job.status).toBe('queued');
    expect(claimNextPipelineTask(db, 'owner-b', 5_000, 5_300)?.task.stage).toBe('finalize-b');
  });

  it('continues a batch after an interrupted paid stage without restarting completed items', () => {
    submitPipelineJob(db, {
      id: 'batch-job',
      dedupeKey: 'batch:resume',
      action: 'full_digest_v2',
      source: 'hub',
      itemIds: ['item-1', 'item-2'],
      stages: ['enrich', 'finalize'],
      now: 100,
    });
    const interrupted = claimNextPipelineTask(db, 'owner-a', 5_000, 200, 'batch-job')!;
    expect([interrupted.task.item_id, interrupted.task.stage]).toEqual(['item-1', 'enrich']);

    expect(recoverExpiredPipelineTasks(db, 5_201)).toMatchObject({ uncertain: 1 });
    const recovered = getPipelineJobSnapshot(db, 'batch-job')!;
    expect(recovered.job.status).toBe('queued');
    expect(recovered.tasks.map((task) => [task.item_id, task.stage, task.status])).toEqual([
      ['item-1', 'enrich', 'uncertain'],
      ['item-1', 'finalize', 'skipped'],
      ['item-2', 'enrich', 'pending'],
      ['item-2', 'finalize', 'pending'],
    ]);

    const next = claimNextPipelineTask(db, 'owner-b', 5_000, 5_300, 'batch-job')!;
    expect([next.task.item_id, next.task.stage]).toEqual(['item-2', 'enrich']);
  });

  it('resumes a barriered batch in the same wave without repeating committed paid work', () => {
    submitPipelineJob(db, {
      id: 'barrier-resume',
      dedupeKey: 'barrier:resume',
      action: 'full_digest_v2',
      source: 'import',
      itemIds: ['item-1', 'item-2'],
      stages: ['enrich', 'embed', 'discover', 'classify', 'finalize'],
      taskOrder: 'stage-major',
      now: 100,
    });

    const first = claimNextPipelineTask(db, 'owner-a', 5_000, 200, 'barrier-resume')!;
    expect([first.task.item_id, first.task.stage]).toEqual(['item-1', 'enrich']);
    finishPipelineTask(db, {
      jobId: first.job.id, itemId: first.task.item_id, stage: first.task.stage,
      ownerId: 'owner-a', jobLeaseEpoch: first.jobLeaseEpoch,
      taskLeaseEpoch: first.taskLeaseEpoch, outcome: 'completed', now: 300,
    });

    const interrupted = claimNextPipelineTask(db, 'owner-a', 5_000, 400, 'barrier-resume')!;
    expect([interrupted.task.item_id, interrupted.task.stage]).toEqual(['item-2', 'enrich']);
    expect(recoverExpiredPipelineTasks(db, 5_401)).toMatchObject({ uncertain: 1 });

    const recovered = getPipelineJobSnapshot(db, 'barrier-resume')!;
    expect(recovered.tasks.find(
      (task) => task.item_id === 'item-1' && task.stage === 'enrich'
    )?.status).toBe('completed');
    expect(recovered.tasks.find(
      (task) => task.item_id === 'item-2' && task.stage === 'enrich'
    )?.status).toBe('uncertain');
    expect(recovered.tasks.filter(
      (task) => task.item_id === 'item-2' && ['embed', 'classify', 'finalize'].includes(task.stage)
    ).every((task) => task.status === 'skipped')).toBe(true);

    const next = claimNextPipelineTask(db, 'owner-b', 5_000, 5_500, 'barrier-resume')!;
    expect([next.task.item_id, next.task.stage]).toEqual(['item-1', 'embed']);
  });
});
