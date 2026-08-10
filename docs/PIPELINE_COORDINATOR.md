# Durable Pipeline Coordinator

> Status — 2026-08-09: approved rebuild design. Core schema-v5 durable job/task primitives are implemented
> and tested, but no UI runner uses them yet. The previous coordinator attempt is retained only as a safety
> snapshot. The first rebuilt executor has one serialized lane; priority is queue ordering, not a parallel
> single-item runner.

## Decision

Homebase has one extension-wide pipeline authority. Dashboard tabs, side panels, and import pages are
clients: they may submit, cancel, or inspect work, but they never own or execute a pipeline job.

The runtime has three intentionally separate authorities:

1. **Pipeline coordinator (offscreen document):** owns scheduling and all fetch/AI/embed/classify work.
2. **Core DB worker:** exclusively owns `workbench.sqlite`, including library state and durable jobs/tasks.
3. **Content worker:** exclusively owns the opaque-key content store, its volatile SQLite connection, and
   serialization to the folder's sole durable `workbench-content.sqlite` file.

There is one logical pipeline coordinator, not one thread for orchestration and storage. It performs actual
fetch/AI/embed/classify work but owns neither database. Tabs never run jobs themselves.

## Invariants

- Exactly one coordinator is active per installed extension profile.
- Exactly one stage attempt executes at a time in the first implementation.
- Interactive and bulk work use the same executor. Priority is reconsidered only at an item boundary; an
  interactive item never starts a second lane or interrupts a stage already in flight.
- File parsing and import preview may remain page-local; post-import processing is coordinator-owned.
- The core SQLite database is authoritative for job, task, lease, and progress state.
- The selected folder is a recovery mirror, never a live coordination mechanism.
- UI state, `chrome.storage.session`, and `import-pipeline-job.json` are not authoritative checkpoints.
- A dashboard can close or reload without changing job ownership.
- Every completed stage is committed before the coordinator reports it complete.
- Recovery is idempotent: committed stages are not intentionally repeated.

Submission messages stay small: clients send item IDs and options only. The coordinator commits the
job/task rows before acknowledging the request, then loads its pipeline cache seed directly from SQLite.
Seed reads use bounded bulk queries; they never perform one worker RPC or one SQL statement per item. This
keeps ordinary library/Hub reads responsive while a large job is being accepted and removes the pre-durable
"preparing" window in which a dashboard refresh could lose the request.

## Runtime shape

```text
Dashboard tabs / side panel / Import Studio
          |  submit IDs/options, cancel, subscribe
          v
Extension service worker (routing and wake-up only)
          |
          v
One offscreen Pipeline Coordinator
          |-- one serialized executor
          |-- AbortController + lease generation
          |-- no permanent data ownership
          |
          |-- Core DB worker ------> workbench.sqlite
          |                          jobs, tasks, library, derived metadata
          |
          `-- Content worker ------> selected folder/workbench-content.sqlite
                                     sole durable compressed-content file
```

The service worker does not own mutable pipeline state. It only ensures the offscreen document exists and
forwards messages. Chrome may suspend it freely. The content worker and pipeline coordinator are separate
authorities: processing can call the content API, but it cannot open or mutate the content database itself.

## Durable model

### `pipeline_jobs`

- `id` — stable job/run ID
- `action` — versioned operation such as `full_enrich`, `fetch_only`, `reextract`, `reembed`,
  `classify`, or `discover`
- `source` — informational UI origin; it never selects a different runner
- `priority` — interactive work sorts before bulk work
- `status` — `queued`, `running`, `cancel_requested`, `cancelling`, `completed`, `failed`, or `cancelled`
- `payload_json` — versioned execution options only, not a second progress checkpoint
- `total_tasks`, `completed_tasks`, `failed_tasks`
- `lease_owner`, `lease_epoch`, `lease_expires_at`, `heartbeat_at`
- `created_at`, `started_at`, `updated_at`, `finished_at`
- `last_error`

### `pipeline_tasks`

- `(job_id, item_id, stage)` — stable task identity
- `priority`, `ordinal`
- `status` — `pending`, `running`, `completed`, `skipped`, `failed`, `uncertain`, or `cancelled`
- `attempts`
- `lease_owner`, `lease_epoch`, `lease_expires_at`
- `input_hash` / `result_ref` where a stage has an idempotency identity
- timestamps and `last_error`

The normalized task rows are the only progress checkpoint. Item progress shown as `N/M` is derived from
finalized items, not from the number of internal stage rows.

## Stage boundaries

A full URL-processing item uses explicit compute/commit boundaries:

```text
preflight -> fetch -> content_store -> extract_ai
          -> enrichment_commit -> embed -> classify -> finalize
```

- Network/AI stages compute a result without directly mutating permanent tables.
- The content worker commits a fetched body before paid extraction begins.
- Core writes use one RPC that verifies `(job_id, item_id, stage, lease_epoch)` and atomically writes the
  domain result plus task completion.
- `putEnrichment` must not implicitly launch embedding; embedding and classification are coordinator stages.
- Taxonomy discovery is a separate coordinator action, not a hidden side effect of every enrichment job.
- A failed item is finalized and counted without preventing the coordinator from continuing other items.

## Scheduling and priority

Priority order (queue order only in the first implementation):

1. Interactive single-link work
2. Small explicit user selections
3. Bulk import and library processing
4. Maintenance/backfill

The first coordinator completes one item at a time. At the next item boundary it may select a higher-priority
queued job, then later continue the bulk job from its next unfinished item. There is never more than one
active stage attempt. Additional concurrency is a later optimization behind the same durable model.

The coordinator deduplicates the same active item/action request. Different actions for the same item may be
queued explicitly rather than silently discarded.

## Recovery

An active job and task receive renewable leases plus a lease generation/fencing token. On coordinator startup
or wake:

1. Expire leases whose deadline passed and increment the lease epoch.
2. Abort and discard any stale in-memory executor owned by the old epoch.
3. Return safe, idempotent stages such as fetch to `pending`.
4. Mark an interrupted paid AI stage `uncertain` unless the provider guarantees idempotent retry.
5. Continue other runnable items from committed stage state.
6. Reject every core commit from an older epoch and broadcast the canonical snapshot to all open clients.

If an offscreen document survives system sleep, its timers and network requests may continue or time out
normally. If it is destroyed, the replacement coordinator performs the same lease recovery. Extension reload
and browser restart use the same path.

Normal interruption recovery is automatic. Explicit **Retry** requeues failed or uncertain work; it does not
destroy a worker, clear a cross-tab lock, or reconstruct ownership in a dashboard.

## Cancellation

- The coordinator durably records `cancel_requested` before the caller receives acknowledgement.
- It increments/revokes the lease epoch, aborts fetch, tab extraction, AI, embedding, and classification, and
  rejects any late result from the prior epoch.
- Pending tasks become `cancelled`; completed outputs remain.
- The UI displays `Cancelling...` until the durable terminal state is visible.
- Pause is deliberately excluded from the first implementation.
- A tab disappearing is neither Pause nor Cancel.

## Progress

All clients observe the same coordinator snapshot:

- queued/running/cancelling state
- total, completed, failed, and pending counts
- active task count and current stage
- heartbeat/elapsed time
- latest bounded error summary

Long fetch/AI operations emit a heartbeat without falsely incrementing completed work.

## Cost and idempotency

Fetch, AI, embedding, and classification stages check their durable result identity before repeating work.
Where an AI provider supports an idempotency key, Homebase uses the stable task/attempt ID. A browser crash
after a provider accepted a request but before its response committed is recorded as `uncertain`; the batch
continues, but that item is not automatically charged again without an explicit retry.

## Removal of the old ownership model

After the coordinator path is active:

- dashboard-owned bulk and single runners are removed;
- the cross-window pipeline execution lock is removed from job ownership;
- folder checkpoint reads/writes are removed from runtime Resume;
- `import-pipeline-job.json` becomes obsolete;
- restarting the shared DB owner is not a Resume operation;
- page-local progress is a presentation of shared coordinator state only.

## Acceptance criteria

- Starting jobs from multiple dashboards still produces one global executor.
- A single-link digest submitted during bulk may run at the next item boundary without overlapping the bulk
  stage already in flight.
- Closing every dashboard does not cancel processing.
- All dashboards display the same active job and progress after reopening.
- Sleep, offscreen loss, extension reload, and browser restart recover expired work from SQLite.
- Recovery continues only unfinished safe tasks and never waits on a page-owned lock.
- Cancel is durable before acknowledgement and stale executors cannot commit late results.
- A 10,000-link job does not require a large runtime message or one file per item.
- Accepting/preparing a bulk job does not monopolize the SQLite worker or block Enrichment Hub reads.
- Folder permission/sync delay does not block live processing, recovery, or explicit Retry.
- Production tests prove serialization, single priority, lease recovery, deduplication, and cross-client status.
