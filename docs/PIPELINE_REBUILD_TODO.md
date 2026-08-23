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
- Protocol-v14 service-worker browser-fetch capability for reusing matching authenticated tabs and opening
  one serialized temporary tab. All URL processing is browser-session first; source-specific providers remain
  fallbacks when the rendered/authenticated result is unavailable or fails its quality gate. PDFs fetch bytes
  in a first-party browser context and use the shared local decoder rather than scraping Chrome's viewer.
- Schema-v6 job/window affinity: Start and Resume bind temporary fetch tabs to the calling dashboard's
  Chrome window; owner-dashboard closure pauses safely after the current stage and preserves pending work.
  Resume also resends AI settings ephemerally without persisting the key.

Automated status: production build and focused coordinator/client/import/Hub tests pass. Real-extension
acceptance is in progress.

Real-extension checkpoint — 2026-08-10:

- One-link full digest completed in the installed extension.
- The first protocol-v13 five-link/urgent-single run appears to honor the intended priority boundary: finish
  the active bulk item, run the interactive link, and resume the bulk. Treat this as provisional until the
  final item counts are checked.
- Close/reopen also appears to preserve processing. The next audit exposed that tab-session code could not
  access `chrome.tabs` or `chrome.scripting` from the offscreen document. Protocol v14 now delegates only
  that browser capability to the service worker while leaving scheduling and writes in the coordinator.
  The first live bulk audit then showed all 23 ordinary URLs going headless after only a matching-tab probe;
  the policy is corrected so those URLs now create/reuse a serialized browser tab before headless fallback.
- The corrected browser-first policy recorded six consecutive `tab-session` completions in a live 451-link
  job, but temporary tabs followed the currently focused Chrome window. Window affinity plus cooperative
  owner-close pause/Resume passed its first live interaction test. Review then found seven post-Resume
  classification failures because Resume did not resend the AI settings; all seven fetches themselves
  succeeded with `tab-session`. The ephemeral Resume settings handoff is fixed and awaits retest.
- Taxonomy discovery and the existing `pending_discover` pool are a separate product issue and are not part
  of pipeline lifecycle acceptance.

## Preserve these design rules

- Clients send IDs/options only; never a full tab-built cache seed or AI key.
- Submission commits durable job/task rows before acknowledgement.
- Progress is presentation-only and never causes library hydration or page reload.
- The content worker owns fetched bodies; the core worker owns metadata and job state.
- The service worker may query/create/script/close browser tabs for a coordinator fetch request, but owns no
  pipeline state and performs no database writes.
- Folder serialization and backup mirroring stay outside processing completion/cancel/recovery.
- One serialized lane remains until the complete lifecycle acceptance suite passes.
- Interrupted ambiguous paid work becomes `uncertain`; other items continue without restarting completed work.
- Taxonomy discovery is an explicit coordinator action, not a hidden side effect owned by a page.

## Remaining work

1. Replace the current browser-fetch/extraction stack using the isolated
   [V3 fetch service replacement roadmap](./FETCH_SERVICE_REBUILD.md). Do not repair the local-PDF regression
   by adding another branch to the legacy router; local PDF is an acceptance case for the replacement.
2. Run the real-extension acceptance sequence below against the replacement service.
3. Fix only concrete failures observed at the current gate; do not reintroduce alternate runners.
4. After lifecycle acceptance, consider splitting `enrich` into real compute/commit boundaries:
   `fetch -> content commit -> AI extract -> enrichment commit`.
5. Add explicit UI for retrying `failed`/`uncertain` items after the base lifecycle is proven.
6. Remove the optional legacy pipeline-analysis folder/export feature after stabilization if it is no longer
   useful. Normal processing no longer creates `pipeline-runs/`.
7. Consider bounded concurrency only after the large-batch gate passes with one lane.

## Real-extension acceptance sequence

1. **One link:** full digest finishes; no repeated dashboard refresh; content/core records are present.
2. **Five links:** sequential execution, exact counts, no duplicate or `queued behind` residue.
3. **Cancel:** cancel during fetch or embedding, wait for durable terminal state, then start a new link.
4. **Navigation/refresh:** move between pages and reload while processing; work and shared banner persist.
5. **Window affinity / close dashboard:** start in window A, work in B, verify tabs stay in A; close the owner
   dashboard, verify `Paused`, then Resume from B and verify unfinished work continues there.
6. **Sleep/wake:** sleep during a multi-link run; completed items remain complete, one ambiguous active item
   may become `uncertain`, and later items continue.
7. **Large batch:** verify responsive UI/DB reads and that content serialization/backup does not delay finish.

Stop at the first failing gate and diagnose from durable job/task state. Do not compensate with uninstall,
manual lock deletion, checkpoint-file deletion, or another page-owned fallback runner.

## Exact resume point

Reload protocol v14, then run the authenticated-fetch gate:

1. Re-digest one login-protected URL that is already open at the matching page in Chrome.
2. Confirm the result records `tab-session` as its fetch source and contains the logged-in page content,
   not a login wall.
3. Close that page, then re-digest it again and confirm one inactive temporary tab opens, is extracted using
   the Chrome login session, and closes automatically.

Then run the cancellation gate:

1. Start a five-link full-digest job.
2. While a temporary browser tab is loading—or while another link is fetching, extracting, or embedding—
   press Cancel once.
3. Wait for the shared durable status to become `Cancelled`; do not reload to force the display.
4. Confirm the temporary tab closes and no queued item continues after cancellation.
5. Immediately submit one new link and confirm it starts without stale `queued behind` state and completes.

If this passes, continue with navigation/refresh, owner-close pause/Resume from a second dashboard,
sleep/wake, and finally a large batch. If it fails, inspect the durable job/task rows and
fix that concrete failure before advancing.
