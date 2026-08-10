# V3 content and pipeline rebuild

## Status

The implementation attempted after `33396e1` is preserved on a safety branch only. The active branch returns
to that checkpoint for application code; this document is the independent restoration plan.

Do not copy the safety patch wholesale. It is evidence and a source of tests and lessons, not an
implementation dependency.

## Restore deliberately

1. Reapply V3-006 as a small independent Search scope-restoration change and retest refresh plus later shell
   navigation.
2. Create `workbench-content.sqlite` with its own content worker. Keep raw/review bodies compressed and
   hash-guarded; core-library startup must not depend on content availability.
3. Make content-folder snapshots asynchronous, coarse, and atomically replaced. No folder I/O belongs on
   fetch, cancellation, completion, Resume, or dashboard-navigation paths.
4. Add core-owned durable jobs and per-item, per-stage tasks in `workbench.sqlite`. Required stages are fetch,
   content save, enrichment/core save, embedding, classification, and finalization.
5. Build one offscreen coordinator with one serialized lane. All surfaces submit/observe the same job API;
   none executes fetch/AI/embed/classify locally.
6. Implement durable cancellation: commit `cancel_requested`, abort every stage including embedding, fence
   stale lease owners, then publish `cancelled` only after work stops.
7. Implement recovery with renewable leases and a generation/fencing token. Wake recovery must replace a
   stale in-memory executor and resume only uncompleted stages.
8. Migrate Enrichment Hub single-link first, then five-link selection, Import, sidebar/Inspector, and finally
   maintenance/stage-only actions. Remove each legacy page runner only after its replacement is proven.

## Discoveries to preserve when rebuilding

- Job acceptance must commit durable state before the caller receives success; submission sends IDs/options,
  never a large tab-built cache seed.
- Fetching a pipeline seed must use bounded bulk reads, not one DB request per item.
- Progress heartbeats are presentation-only. They must not trigger library hydration or dashboard reloads.
- Completion events need affected IDs/revision so every observing dashboard performs one scoped refresh.
- Bookmark import completion must refresh only its changed scope; it must not wait for a full cache hydrate.
- Hub page/count reads need a timeout and explicit Retry state rather than an indefinite spinner.
- No second single-item lane or extra concurrency until the one-lane acceptance suite passes.

## Acceptance gates

Run each gate manually in the real extension before proceeding to the next:

1. One Hub link: completion, both database records, refresh.
2. Five links: exact completed/failed counts and no duplicate execution.
3. Cancel during fetch and during embedding: no late writes or continued provider work.
4. Navigate and refresh while running: job and progress remain stable.
5. Close the initiating dashboard and observe from another dashboard: work continues and final scoped refresh
   reaches every observer.
6. Sleep/wake mid-stage: only unfinished work resumes and stale executors cannot commit.
7. Large batch: responsive Hub/import UI, durable recovery, no critical-path content/folder checkpoint.

## Explicitly do not restore

- dashboard-owned pipeline execution or cross-tab execution locks;
- independent bulk and single execution tails;
- folder checkpoint files as runtime Resume authority;
- `import-pipeline-job.json` as a durable source of truth;
- synchronous content export/run-summary writes on job completion.
