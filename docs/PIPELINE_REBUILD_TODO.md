# V3 content and pipeline rebuild

## Current checkpoint

The failed coordinator attempt remains only on the safety branch. The active branch now contains an
independent clean rebuild based on the accepted content-store and durable-job primitives.

Completed in code:

- Search scope restoration and folder-only `workbench-content.sqlite` storage.
- Dedicated core DB worker and dedicated content worker.
- Schema-v5 durable jobs/tasks, ordered item stages, leases, fencing, cancellation, and recovery.
- One generic offscreen coordinator and one serialized execution lane.
- One/many links, Import Studio, Hub, side panel, inspectors, review/debug tools, re-extract, re-embed,
  classify, discovery, and embedding backfill migrated to that coordinator.
- Old page runners, import checkpoint/Resume UI, wave/scoped runners, cross-tab execution lock, and automatic
  run-artifact generation removed from processing.
- Shared read-only dashboard job banner and durable cross-tab cancellation.
- Service-worker wake alarm plus browser-start recovery.

Automated status: production build and focused coordinator/client/import/Hub tests pass. Real-extension
acceptance is pending.

Real-extension checkpoint — 2026-08-10:

- One-link full digest completed in the installed extension.
- The first protocol-v13 five-link/urgent-single run appears to honor the intended priority boundary: finish
  the active bulk item, run the interactive link, and resume the bulk. Treat this as provisional until the
  final item counts are checked.
- No further coordinator implementation is planned before the remaining lifecycle gates. Stop and diagnose
  durable job/task state at the first failure.
- Taxonomy discovery and the existing `pending_discover` pool are a separate product issue and are not part
  of pipeline lifecycle acceptance.

## Preserve these design rules

- Clients send IDs/options only; never a full tab-built cache seed or AI key.
- Submission commits durable job/task rows before acknowledgement.
- Progress is presentation-only and never causes library hydration or page reload.
- The content worker owns fetched bodies; the core worker owns metadata and job state.
- Folder serialization and backup mirroring stay outside processing completion/cancel/recovery.
- One serialized lane remains until the complete lifecycle acceptance suite passes.
- Interrupted ambiguous paid work becomes `uncertain`; other items continue without restarting completed work.
- Taxonomy discovery is an explicit coordinator action, not a hidden side effect owned by a page.

## Remaining work

1. Run the real-extension acceptance sequence below.
2. Fix only concrete failures observed at the current gate; do not reintroduce alternate runners.
3. After lifecycle acceptance, consider splitting `enrich` into real compute/commit boundaries:
   `fetch -> content commit -> AI extract -> enrichment commit`.
4. Add explicit UI for retrying `failed`/`uncertain` items after the base lifecycle is proven.
5. Remove the optional legacy pipeline-analysis folder/export feature after stabilization if it is no longer
   useful. Normal processing no longer creates `pipeline-runs/`.
6. Consider bounded concurrency only after the large-batch gate passes with one lane.

## Real-extension acceptance sequence

1. **One link:** full digest finishes; no repeated dashboard refresh; content/core records are present.
2. **Five links:** sequential execution, exact counts, no duplicate or `queued behind` residue.
3. **Cancel:** cancel during fetch or embedding, wait for durable terminal state, then start a new link.
4. **Navigation/refresh:** move between pages and reload while processing; work and shared banner persist.
5. **Close dashboards:** observe from a second dashboard, close the initiator, and confirm completion.
6. **Sleep/wake:** sleep during a multi-link run; completed items remain complete, one ambiguous active item
   may become `uncertain`, and later items continue.
7. **Large batch:** verify responsive UI/DB reads and that content serialization/backup does not delay finish.

Stop at the first failing gate and diagnose from durable job/task state. Do not compensate with uninstall,
manual lock deletion, checkpoint-file deletion, or another page-owned fallback runner.

## Exact resume point

Run the cancellation gate next:

1. Start a five-link full-digest job.
2. While a link is actively fetching, extracting, or embedding, press Cancel once.
3. Wait for the shared durable status to become `Cancelled`; do not reload to force the display.
4. Confirm no queued item continues after cancellation.
5. Immediately submit one new link and confirm it starts without stale `queued behind` state and completes.

If this passes, continue with navigation/refresh, closing the initiating dashboard while observing from a
second dashboard, sleep/wake, and finally a large batch. If it fails, inspect the durable job/task rows and
fix that concrete failure before advancing.
