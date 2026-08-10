# V3 content and pipeline rebuild

## Status

The implementation attempted after `33396e1` is preserved on a safety branch only. The active branch was
returned to that checkpoint and is rebuilding independently. Checkpoint 1 is accepted; checkpoint 2 is
implemented and awaiting real-extension acceptance.

Do not copy the safety patch wholesale. It is evidence and a source of tests and lessons, not an
implementation dependency.

## Restore deliberately

1. **Done / accepted:** reapply V3-006 as a small independent Search scope-restoration change and retest
   refresh plus later shell navigation.
2. **Done / storage smoke accepted — corrected content ownership:** keep `workbench-content.sqlite` behind its own content
   worker, but remove the rejected OPFS content replica. The selected-folder file is the only durable content
   copy; the worker uses an opaque-key API and a volatile working connection. Keep raw/review bodies compressed
   and hash-guarded; core-library startup must not depend on content availability.
3. **Partly implemented:** store immutable content rows keyed by `(item_id, kind, content_hash)`. The fenced
   core commit and asynchronous orphan cleanup arrive with the durable job API/coordinator.
4. **Done / storage smoke accepted:** serialize dirty content to the sole folder file asynchronously, coarsely, and atomically.
   The first dirty write starts a fixed maximum-latency timer that later writes do not postpone. No whole-file
   flush belongs on cancellation, completion, Resume, or dashboard-navigation paths.
5. **Implemented / API-only checkpoint:** add core-owned durable jobs and per-item, per-stage tasks in `workbench.sqlite`. Full processing stages are
   preflight, fetch, content store, AI extraction, enrichment commit, embedding, classification, and finalization.
6. Split existing write-through functions into compute plus fenced-commit operations. In particular,
   enrichment persistence must not implicitly trigger embedding.
7. **Implemented for one-link acceptance:** build one offscreen coordinator with one serialized executor. The
   Enrichment Hub one-item action submits/observes this job API; bulk and other surfaces remain on their legacy
   paths until the one-link gate passes.
8. **Implemented for one-link acceptance:** commit `cancel_requested`, abort every stage including embedding, fence
   stale lease owners, then publish `cancelled` only after work stops.
9. Implement recovery with renewable leases and a generation/fencing token. Safe stages resume automatically;
   interrupted paid AI stages become `uncertain` unless provider retry is idempotent.
10. Migrate Enrichment Hub single-link first, then five-link selection, Import, sidebar/Inspector, and finally
   maintenance/stage-only actions. Remove each legacy page runner only after its replacement is proven.
11. Keep taxonomy discovery as a separate coordinator action. Do not hide it inside ordinary URL processing.

## Discoveries to preserve when rebuilding

- Job acceptance must commit durable state before the caller receives success; submission sends IDs/options,
  never a large tab-built cache seed.
- Fetching a pipeline seed must use bounded bulk reads, not one DB request per item.
- Progress heartbeats are presentation-only. They must not trigger library hydration or dashboard reloads.
- Completion events need affected IDs/revision so every observing dashboard performs one scoped refresh.
- Bookmark import completion must refresh only its changed scope; it must not wait for a full cache hydrate.
- Hub page/count reads need a timeout and explicit Retry state rather than an indefinite spinner.
- No second single-item lane or extra concurrency until the one-lane acceptance suite passes.
- Pause is out of scope for the first rebuild. Cancellation, automatic recovery, and explicit Retry have
  distinct durable meanings.

## Implementation checkpoints

Each checkpoint is independently buildable and reviewable:

1. **Accepted — baseline restoration:** V3-006 only; user verified Search scope restoration.
2. **Accepted — content storage:** separate worker, one durable folder file (no OPFS content
   replica), immutable compressed values behind opaque keys, startup readiness, on-demand reads, clear/delete,
   and bounded asynchronous serialization. Existing pipeline ownership remains unchanged for this checkpoint.
3. **Implemented / automated acceptance — durable core API:** schema v5 plus atomic submit, ordered claim,
   heartbeat, durable cancel, fenced commit, safe-stage recovery, paid-stage uncertainty, deduplication, and
   query RPCs. No UI runner migration yet.
4. **Implemented / awaiting real-extension acceptance — one-link vertical slice:** a one-item Hub re-digest is
   committed before acknowledgement and runs in the shared serialized offscreen lane. Because the existing
   processor is still monolithic, this checkpoint deliberately uses one `full_digest` task rather than writing
   false per-stage completion rows. An interrupted task becomes `uncertain` and is not automatically retried.
   The next code checkpoint splits the processor into real compute/fenced-commit stages after this smoke test.
5. **Small-batch correctness:** five sequential items, exact final counts, deduplication, and durable cancel.
6. **Surface migration:** Import, sidebar, Inspector, re-extract, re-embed, classify, and discover all submit
   the shared job contract; then remove legacy locks/checkpoints/runners.
7. **Lifecycle hardening:** navigation, refresh, multiple dashboards, dashboard closure, sleep/wake, stale
   executor fencing, and uncertain paid-call handling.
8. **Scale:** large batch, responsive core DB reads, scoped refreshes, and async backup behavior. Only after
   this gate may bounded concurrency be considered.

## Acceptance gates

Run each gate manually in the real extension before proceeding to the next:

1. V3-006 Search scope: refresh preserves Search's scope; later explicit shell navigation updates it.
2. Content-store smoke test: one fetched body survives reload, Chrome restart, and clean reinstall restore.
3. One Hub link: completion, both database references, and one scoped UI refresh.
4. Five links: exact completed/failed counts and no duplicate execution.
5. Cancel during fetch and during embedding: no late writes or continued authoritative work.
6. Navigate and refresh while running: job and progress remain stable.
7. Close the initiating dashboard and observe from another dashboard: work continues and final scoped refresh
   reaches every observer.
8. Sleep/wake mid-stage: only unfinished safe work resumes and stale executors cannot commit.
9. Large batch: responsive Hub/import UI, durable recovery, no critical-path content/folder checkpoint.

## Explicitly do not restore

- dashboard-owned pipeline execution or cross-tab execution locks;
- independent bulk and single execution tails;
- folder checkpoint files as runtime Resume authority;
- `import-pipeline-job.json` as a durable source of truth;
- synchronous content export/run-summary writes on job completion.
