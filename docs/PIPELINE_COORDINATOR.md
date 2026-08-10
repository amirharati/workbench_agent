# Durable Pipeline Coordinator

> Status — 2026-08-09: the clean coordinator implementation is in real-extension acceptance. Initial
> runs prove durable execution advances and terminates; the first classification retest exposed and fixed
> an offscreen AI-settings handoff regression. Automated tests and the production build pass.

## Decision

Homebase has one extension-wide processing authority. Import Studio, Enrichment Hub, the side panel,
inspectors, review tools, taxonomy controls, and maintenance controls submit jobs to the same offscreen
coordinator. A page may submit, observe, or request cancellation; it never executes fetch, AI, embedding,
classification, or taxonomy-discovery work.

Three owners have deliberately separate lifecycles:

1. **Offscreen pipeline coordinator** — owns job scheduling and all processing calls.
2. **Core DB worker** — exclusively owns `workbench.sqlite`, including durable jobs/tasks and library data.
3. **Content worker** — exclusively owns the opaque-key fetched-content API and the selected folder's sole
   durable `workbench-content.sqlite` file.

The coordinator writes through those two storage owners. It does not open either database itself.

```text
Import / Hub / sidebar / inspectors / maintenance UI
                 | submit IDs + options; observe; cancel
                 v
       service worker (routing + wake alarm)
                 |
                 v
       one offscreen pipeline coordinator
                 |  one serialized execution lane
                 |
                 +--> core DB worker --> workbench.sqlite
                 |                     library + jobs/tasks
                 |
                 `--> content worker --> workbench-content.sqlite
                                       fetched bodies by opaque key
```

## Implemented invariants

- One generic `start-job` message is used for single links, selections, imports, and maintenance actions.
- The job and all item/stage task rows commit before submission is acknowledged.
- One serialized offscreen lane executes every job; there is no separate single-link lane.
- The coordinator processes all stages for item 1 before beginning item 2.
- Active jobs with overlapping item scopes are rejected instead of running concurrently.
- Dashboard navigation, refresh, or closure does not affect execution ownership.
- Every dashboard polls the same durable job table and displays a shared status/cancel banner.
- Cancellation is durable before the UI changes to terminal state, then Abort reaches fetch, extraction,
  embedding, classification, and discovery.
- Pipeline progress events update presentation only; they do not trigger dashboard/library reloads.
- Content serialization and backup mirroring are not on the job-completion critical path.
- Saved AI settings cross the dashboard-to-offscreen boundary only in the internal submission message and
  are installed in memory for the serialized run. The API key is omitted from durable job/task storage.
- Automatic `pipeline-runs/` output has been removed from normal and test processing paths.

## Durable model

`pipeline_jobs` stores the job ID, versioned action, source, non-secret options payload, item counts, status, lease,
timestamps, and last error. `pipeline_tasks` stores `(job_id, item_id, stage)`, global ordinal, status,
attempt count, fenced lease generation, result reference, timestamps, and error.

The clean URL-processing stages are currently:

```text
enrich -> embed -> classify -> finalize
```

`enrich` is one honest domain boundary around fetch, fetched-body persistence, AI extraction, and the core
enrichment write. It is not represented as smaller durable stages because those existing domain functions
have not yet been split into compute-plus-fenced-commit APIs. If sleep or process loss interrupts `enrich`,
the task becomes `uncertain` rather than risking a duplicate paid call.

Stage-only actions use the same engine:

- `reextract -> embed -> classify -> finalize`
- `reembed -> finalize`
- `classify -> finalize`
- global/scoped `discover -> finalize`; optional follow-up classification is submitted as the next job

A failed item skips only its later stages. The next item continues. Final job counts are derived from durable
task state rather than a page-owned counter.

## Recovery

The coordinator heartbeats its active task with a fenced lease. Recovery runs at offscreen startup, every
15 seconds while the offscreen document lives, from a one-minute service-worker wake alarm while work is
active, and on browser startup. Because API credentials are never written to a job row, a recovered job
reloads the saved extension-local AI settings before resuming.

On expiry:

1. A safe unfinished stage may return to `pending`.
2. An interrupted paid/ambiguous stage (`enrich`, `reextract`, `embed`, `classify`, or `discover`) becomes
   `uncertain` and is not charged again automatically.
3. Later stages for that item are skipped.
4. Remaining items stay queued and continue from their first unfinished task.
5. A stale executor is fenced from committing and aborted when it learns that its lease is gone.

This means a 445-item job does not restart at item 1 after sleep. Completed items remain complete, the one
ambiguous in-flight item is reported for explicit retry, and the remaining items continue.

## Cancellation

The coordinator first writes `cancel_requested`, revokes the job/task lease generation, and marks pending
tasks cancelled. Only then does it acknowledge the cancel request and abort the in-memory stage. The UI
shows `Cancelling…` until durable state no longer reports an active job. A late result from the revoked lease
cannot commit authoritative state.

## Storage and backup

The core database contains library metadata, enrichment state, search/classification state, and job control
rows. Fetched raw bodies live only in `workbench-content.sqlite`, accessed by opaque key through its own
worker. The content database has a different lifecycle and is not replicated into the core database.

The content worker may serialize its dirty SQLite image to the selected folder asynchronously and coarsely.
Neither that serialization nor a whole-library backup/checkpoint is awaited by normal processing completion,
cancellation, navigation, or recovery.

## Removed ownership model

The rebuild removes the dashboard-owned batch/single executors, import checkpoint files and Resume banner,
scoped/wave runners, page cross-window execution lock, independent single/bulk queues, and old monolithic
item/batch orchestration modules. The retained fetch, extraction, embedding, and classification functions are
domain operations called only by the coordinator—not alternative schedulers.

## Known deliberate limitation

The `enrich` domain call is still coarser than the eventual ideal fetch/content/AI/commit split. This is safe
but conservative: interruption can leave one item `uncertain` and require an explicit retry. It must not be
split into pretend checkpoints until each compute result and fenced commit can actually be separated.

## Acceptance sequence

Run in order on the real unpacked extension:

1. One Hub link completes and creates/updates both appropriate database records.
2. Five links finish sequentially with exact completed/failed counts.
3. Cancel during fetch or embedding; wait for `Cancelled`, then immediately start another job.
4. Navigate and refresh during a job; the shared banner remains stable and work continues.
5. Open another dashboard and close the initiator; the second dashboard observes the same job and result.
6. Sleep/wake mid-batch; completed items stay complete and remaining items continue.
7. Run a large batch; Hub/import reads remain responsive and no backup/content serialization blocks finish.

Do not increase concurrency or further split stages until this sequence passes.
