# Durable Pipeline Coordinator

> Status — 2026-08-09: the clean coordinator implementation is in real-extension acceptance. Initial
> runs prove durable execution advances and terminates; the first classification retest exposed and fixed
> an offscreen AI-settings handoff regression. Automated tests and the production build pass.

> Acceptance checkpoint — 2026-08-10: one-link processing and browser-first fetching passed, but the first
> large run exposed that Chrome inserted temporary tabs into whichever window was currently focused. Schema
> v6 now binds a job to the dashboard tab/window that started or resumed it. Closing that owner dashboard
> requests a safe stage-boundary pause; Resume rebinds the unfinished job to the new dashboard window. This
> window-affinity/pause behavior awaits real-extension acceptance.

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
The service worker is additionally a narrow browser capability provider: it may resolve, open, script, and
close a tab for one coordinator fetch request, but it owns no jobs and writes no application data.

```text
Import / Hub / sidebar / inspectors / maintenance UI
                 | submit IDs + options; observe; cancel
                 v
       service worker (routing + wake alarm + browser-tab capability)
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

       coordinator -- browser-fetch RPC --> service worker --> matching/temporary Chrome tab
```

## Implemented invariants

- One generic `start-job` message is used for single links, selections, imports, and maintenance actions.
- The job and all item/stage task rows commit before submission is acknowledged.
- One serialized offscreen lane executes every job; there is no separate single-link lane.
- Full-digest jobs use stage-major barriers: enrich the submitted scope, embed eligible items, run one Discover
  checkpoint, classify each eligible item once against the available taxonomy, then finalize. Scopes of at
  least three use exact-scope Discover; one/two-item jobs consult the global pending pool and no-op below its
  three-candidate minimum, so classification never waits for a one-item cluster. Maintenance operations retain
  item-major plans where a cross-item taxonomy barrier is unnecessary.
- Interactive one-link jobs have priority over bulk jobs. A running bulk commits its current durable stage,
  releases its fenced lease, runs queued urgent links first, and then resumes at its exact unfinished stage.
- Active jobs with overlapping item scopes are rejected instead of running concurrently.
- Dashboard navigation and refresh do not affect execution ownership. Closing the dashboard tab that owns
  browser placement requests a durable pause after the current stage commits; completed work is retained.
- Every dashboard polls the same durable job table and displays shared status, Cancel, and paused-job Resume.
- Cancellation is durable before the UI changes to terminal state, then Abort reaches fetch, extraction,
  browser-tab load/extraction, embedding, classification, and discovery. Cancellation closes only a
  temporary tab created for that request; an existing user tab is never closed.
- Pipeline progress events update presentation only; they do not trigger dashboard/library reloads.
- Content serialization and backup mirroring are not on the job-completion critical path.
- Saved AI settings cross the dashboard-to-offscreen boundary only in the internal submission message and
  are installed in memory for the serialized run. The API key is omitted from durable job/task storage.
- AI transport/configuration failures have one shared user-facing contract. Missing or invalid credentials,
  exhausted credits/quota, rate limits, timeouts, network failures, and provider/model errors are normalized
  once and surfaced by the initiating digest, classification/discovery, embedding, Search, Ask, or Settings
  view. A successful fetch remains `ok` and keyword-searchable when its AI step fails; it is reported as
  **Fetched**, never **Enriched**. Reruns retain prior good summaries/tags/key points, while the latest
  `aiStatus`/`aiError` records the failed attempt. Terminal backend errors stop dependent retries/batches.
- Automatic `pipeline-runs/` output has been removed from normal and test processing paths.

## Browser-session fetching

> Replacement plan — 2026-08-23: the browser-fetch/extraction implementation described below is the current
> production stack, not the final design. Do not extend it with more routing patches. The approved clean
> replacement, isolated build phases, acceptance corpus, atomic cutover, and legacy-removal criteria are in
> [V3 fetch service replacement roadmap](./FETCH_SERVICE_REBUILD.md).

The offscreen document cannot call `chrome.tabs` or `chrome.scripting`, so protocol v14 sends a cancellable
browser-fetch request to the service worker. Every URL uses the authenticated browser path first: reuse an
exact matching tab when one exists, otherwise open one inactive temporary tab in the user's Chrome profile,
extract the rendered page, and close it. X/video tab output still passes source-specific quality checks before
it can win; their public/specialized providers remain fallbacks. PDFs use the same browser-first policy without
scraping Chrome's viewer: the service fetches the PDF bytes inside an authenticated same-origin page and the
offscreen pipeline decodes them locally. Headless/Jina remain fallbacks after an unusable browser result.
Temporary tabs are serialized, bounded by the existing fetch timeout, and always closed after success,
failure, or cancellation.

At Start or Resume, the service worker derives the caller's tab and window from Chrome's trusted message
sender and stores that placement with the durable job. Matching-tab lookup and temporary-tab creation are
scoped to that window, so changing focus to another Chrome window cannot redirect pipeline tabs into it.
Closing the owner dashboard requests `pause_requested`; the active stage commits, the job becomes `paused`,
and no next stage starts. Resume from any dashboard replaces the stale placement with that dashboard's
tab/window IDs, resends AI settings ephemerally, and continues pending tasks. The API key is never merged
into the durable payload. Browser restart without a live session binding also pauses a hosted job instead of
guessing a window.

The service worker returns extracted markdown, title, final page URL, and `tab-session` source metadata. The
offscreen coordinator remains responsible for accepting the result and writing through the content/core
workers.

## Durable model

`pipeline_jobs` stores the job ID, versioned action, source, non-secret options payload, item counts, status, lease,
timestamps, and last error. `pipeline_tasks` stores `(job_id, item_id, stage)`, global ordinal, status,
attempt count, fenced lease generation, result reference, timestamps, and error.

The clean URL-processing stages are currently:

```text
enrich -> embed -> discover (exact batch or minimum-sized pending pool) -> classify -> finalize
```

`enrich` is one honest domain boundary around fetch, fetched-body persistence, AI extraction, and the core
enrichment write. It is not represented as smaller durable stages because those existing domain functions
have not yet been split into compute-plus-fenced-commit APIs. If sleep or process loss interrupts `enrich`,
the task becomes `uncertain` rather than risking a duplicate paid call.

For a bulk full digest of at least three items, each per-item stage is a wave: every `enrich` task precedes every
`embed` task; the single synthetic Discover task then reads every eligible item in the exact submitted scope—not
only the maintenance gap-fill/stuck pool—and the current stored taxonomy; only after it commits may the per-item
`classify` tasks run. A one/two-link full digest uses the same durable checkpoint, but that checkpoint reads the
global pending gap-fill pool and enforces the three-item minimum. Below the minimum it performs no AI call and
classification continues immediately against the complete seed/current taxonomy. There is exactly one classify
task per submitted item—no classify-before-Discover/reclassify cycle. Empty classifications from eligible content
receive one mandatory-assignment correction; a still-empty response may use a matching broad-domain General leaf,
while genuinely unmatched content remains pending evidence for a later multi-item Discover run.

Classify is read-only over the taxonomy and uses two batched AI passes. The first pass never sees the taxonomy: it
produces a neutral semantic label, the primary saved object, likely reason the user would retrieve the link, content
kind, secondary themes, atomic free topics, broad domain, evidence, and content-state assessment. Explicit user
notes or tags win when they state intent; otherwise the pass infers purpose conservatively from what the exact URL
lets the user do. The second pass sees that compact analysis plus the hierarchy, compares it against every parent,
reports ranked candidates, and selects a leaf beneath the best-fitting parent. Primary classification follows save
purpose and saved object; entities or themes merely depicted inside a film, episode, book, game, or other creative
work do not outrank its media identity unless the page itself analyzes that theme. When the parent fits but no
specific sibling does, it uses that parent's General leaf. When no parent fits, it records one durable novel-topic
suggestion and leaves the item for clustered Discover instead of force-fitting or creating a singleton category.
Unexpected model proposals can resolve only to an already-existing exact leaf or General leaf. Before a General
result is persisted, a taxonomy-wide parent-consistency check rejects a selected parent with no item evidence when
another seeded parent has direct evidence. Discover is the sole owner of taxonomy growth.

Stage-only actions use the same engine:

- `reextract -> embed -> classify -> finalize`
- `reembed -> finalize`
- `classify -> finalize`
- global/scoped `discover -> finalize`; optional follow-up classification is submitted as the next job

Classification commits are additive. The core DB worker merges deterministic item/category links,
never treats omission from a later stochastic response as deletion, never resurrects a rejected link,
and keeps accepted evidence locked. One primary is derived for presentation and queue state: an existing
specific remains stable across equal/weaker additions, while a newly discovered specific may promote over
a General fallback. Other active categories remain secondary and participate in browsing/search. Automated
pruning is intentionally deferred until after V3 and must be a separate explicit policy, not a side effect
of Full digest, Re-digest, Classify, or Discover.

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
4. Remaining tasks stay queued and continue from their first unfinished stage in the current wave.
5. A stale executor is fenced from committing and aborted when it learns that its lease is gone.

This means a 445-item job does not restart its completed acquisition, embedding, or classification work after
sleep. The one ambiguous in-flight item is reported for explicit retry, and the remaining stage wave continues.

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
2. Five links show the barrier order: all Fetch + AI work, all eligible embeddings, one Discover, then one
   classification per eligible link, with exact completed/failed counts.
3. During a five-link batch, submit a new side-panel link; the bulk finishes its current durable stage, the
   single runs next, and the bulk then resumes without repeating completed work.
4. Re-digest an authenticated URL already open in Chrome, then close it and confirm the temporary-tab path.
5. Cancel during temporary-tab load, another fetch, or embedding; wait for `Cancelled`, then start another job.
6. Navigate and refresh during a job; the shared banner remains stable and work continues.
7. Start from dashboard window A, work in window B, and confirm every temporary tab stays in A. Close the
   owner dashboard, confirm a safe pause, then click Resume in B and confirm remaining tabs stay in B.
8. Sleep/wake mid-batch while the owner dashboard remains open; completed items stay complete and remaining
   items continue. Restarting Chrome without the owner binding should pause until Resume.
9. Run a large batch; Hub/import reads remain responsive and no backup/content serialization blocks finish.

Do not increase concurrency or further split stages until this sequence passes.
