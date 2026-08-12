# Homebase V3 — Release checklist and issue ledger

**Status:** active dogfood / release candidate  
**Owner:** Codex maintains this file from user testing reports  
**Opened:** 2026-08-08  
**Testing branch:** `design/ui-redesign`  
**Starting product commit:** `b1114b4` (`Improve scoped list filtering`)  
**Current test checkpoint:** `4506de7` (`Show progress and results after pipeline resume`)

This is the single operating document for closing V3. Historical V3 plans explain how
features were built; they do not determine the remaining release scope.

## How to use this document during dogfood

This file remains authoritative even when an individual session is diverted to diagnose
or fix a newly found issue:

1. Test against the current checkpoint above and work through sections A–G opportunistically.
2. Report findings as they occur; Codex adds or updates a `V3-###` ledger entry and identifies
   the affected release gate.
3. A fix is not considered finished merely because it builds: its ledger entry remains
   `READY TO RETEST` until the original browser scenario passes.
4. Checked test boxes, gate evidence, and the Run log record durable progress across sessions.
5. Return to the remaining unchecked boxes after each issue detour. V3 is complete only when
   G0–G6 pass or have explicit accepted exceptions and the Final signoff list is complete.

Current focus is ordinary daily-use testing across core workflows and UI/UX, while watching
data integrity continuously. Destructive restore/reinstall recovery should be tested only after
a recognizable baseline library and marker items have been recorded.

## V3 goal

V3 is done when Homebase is trustworthy and comfortable enough to become the user's
daily tool:

1. **Trust and recoverability:** ordinary use must not silently lose, replace, duplicate,
   or mis-associate data. A fresh install can recover the library from its data folder.
2. **Complete core usability:** capture, browse, organize, search, edit, workspaces,
   import, trash/restore, and settings form a coherent end-to-end workflow.
3. **Clean baseline UX/UI:** the redesigned dashboard and side panel are readable,
   responsive, internally consistent, and do not hide essential actions or content.
4. **Honest system behavior:** loading, backup, pipeline, error, paused, and incomplete
   states say what actually happened. Expensive AI actions remain user-triggered.
5. **Daily-use stability:** startup and common navigation feel responsive; reload,
   browser restart, extension reload, and a second dashboard do not break state.

After V3, work moves feature by feature through `docs/backlog.md`. A desirable feature
does not become a V3 blocker merely because it already has an old V3 planning document.

## Scope boundary

### Required for V3

- Single-device SQLite/OPFS durability and Dropbox-folder mirror/recovery.
- Protection against empty or stale state overwriting an existing `workbench.sqlite`.
- Manual backup and restore with a safety copy and understandable confirmation.
- Reliable item, note, project, collection, favorite/pin, workspace, and trash actions.
- Search and organization from global, project, and collection contexts.
- Usable Home, Library, Project, Workspaces, Tab Commander, Import, Enrichment Hub,
  Settings, Inspector/Item, and side-panel paths.
- Responsive large/small-display behavior, light/dark dashboard readability, and
  page-native side-panel styling.
- Honest progress/errors and no unbounded or mysteriously empty content regions.
- A production build and focused automated tests passing at final signoff.

### Not required for V3 unless testing exposes a trust or core-workflow failure

- Perfect taxonomy or classification quality.
- New-parent taxonomy generation, multi-topic classification, or user-signals Phase 2.
- Notes AI, workspace AI, pre-save AI digest, and agentic/RAG additions.
- Multi-device concurrent writing or automatic cross-device merge.
- Scheduled backup policy controls or advanced cloud-provider integrations.
- Semantic quick-filter expansion; current deterministic in-list filtering is sufficient.
- Visual perfection or feature expansion beyond a clean, coherent daily-use baseline.

An out-of-scope subsystem may still block release if its current UI falsely implies data
was deleted, charges unexpectedly, corrupts state, or prevents a core workflow. The V3
resolution may be a fix, clearer limitation, or temporarily disabling the unsafe action.

## Release gates

V3 closes only when every gate is **PASS** or has an explicit signed-off exception.

| Gate | Requirement | Status | Evidence / remaining work |
|------|-------------|--------|---------------------------|
| G0 | Clean build and fresh-install onboarding | IN PROGRESS | Build passed; fresh install pending |
| G1 | Data durability, Dropbox mirror, reinstall recovery, restore | NOT RUN | Zero-tolerance gate |
| G2 | Core daily workflows work end to end | NOT RUN | Run 01 + continued dogfood |
| G3 | UI/UX is readable, coherent, and responsive | NOT RUN | Large + small display review |
| G4 | Search, import, and AI pipeline are honest and controllable | IN PROGRESS | Shared pipeline and Resume mostly pass; continue bounded dogfood |
| G5 | Startup, reload, and normal use are stable and responsive | NOT RUN | Record cold/warm behavior |
| G6 | Blockers closed, limitations documented, version/release integrated | NOT RUN | Final signoff only |

### Gate rules

- Automated tests support a gate but never substitute for the manual scenario.
- A suspected data-loss event immediately sets G1 to **FAIL** until explained and retested.
- “Could not reproduce” is not a pass without recording the environment and attempts.
- A workaround can close P2/P3 friction. A P0/P1 issue needs a fix, removal/disablement
  of the unsafe path, or an explicit user decision before V3 closes.
- Do not check a manual box merely because the code appears to handle it.

## Dogfood environment — Run 01

Use disposable data, but treat every unexpected disappearance or mutation as a real P0.

| Field | Value |
|-------|-------|
| Date started | 2026-08-08 |
| Branch / commit | `design/ui-redesign` / `b1114b4` |
| Chrome version | TO RECORD |
| Install source | Local, non-synced `dist/` path — TO RECORD |
| Data folder | Fresh dedicated Dropbox subfolder — exact path TO RECORD |
| Chrome profile/device | One profile on one device — TO RECORD |
| Starting item/project counts | 0 expected; confirm after onboarding |
| Status | IN PROGRESS |

Important boundary: the **data folder** should be inside Dropbox for this test. The
unpacked extension's `dist/` must stay in a stable local, non-synced directory. Loading
unpacked code directly from Dropbox previously correlated with the extension vanishing
during rebuild/sync. V3 supports one active device writing the folder; multi-device
Dropbox synchronization is post-V3.

### A. Fresh setup

- [ ] Record current commit and Chrome version.
- [x] Run `npm run build` successfully. (2026-08-08)
- [ ] Uninstall the previous development extension.
- [ ] Load the fresh unpacked extension from a stable local `dist/`.
- [ ] Open Homebase and choose a new, empty, dedicated Dropbox data folder.
- [ ] Confirm onboarding clearly explains where data lives and completes without reload loops.
- [ ] Confirm the dashboard opens with a coherent empty state.
- [ ] After the first mutation and mirror interval, confirm the folder contains
      `workbench.sqlite` and expected metadata/snapshot files without conflict copies.
- [ ] Confirm the extension remains installed after closing and reopening Chrome.

### B. Establish a recognizable baseline library

Use unique names so recovery can be checked by content, not only counts.

- [ ] Create two normal projects plus Inbox.
- [ ] Create at least two collections in each normal project.
- [ ] Confirm Inbox cannot create or display extra collections.
- [ ] Save at least ten links from a mix of dashboard, Search, and side panel.
- [ ] Add at least three notes, including one long note.
- [ ] Put some items in multiple projects/collections.
- [ ] Mark global Favorites and project-local Pins independently.
- [ ] Create one named workspace with links and notes; create a second workspace.
- [ ] Copy and move items between workspaces; verify source/destination membership.
- [ ] Save one browser window from Tab Commander as a workspace.
- [ ] Import one small bookmark file and record imported/skipped/merged counts.
- [ ] Record baseline totals and several unique marker titles in the run log.

### C. Core workflow and state retention

- [ ] Home: switch Overview/Search and All Library/project contexts without losing state.
- [ ] Project: switch collections/workspaces and always understand which list is active.
- [ ] Library: switch All/Links/Notes/Favorites/Workspace and list/gallery views.
- [ ] Filter a long list using title, URL, notes, tags, placement, and metadata terms.
- [ ] Select/edit an item, reload, and confirm selection plus edits return.
- [ ] Search inside a project, widen to All Library, then organize the result; current
      project/collection remains the suggested destination.
- [ ] Add one item to several workspaces without changing permanent organization.
- [ ] Direct URL clicks open only from the URL target; card background clicks do not navigate.
- [ ] Trash and restore an item; confirm its expected organization and workspace behavior.
- [ ] Exercise focus mode, Inspector/Item editing, and direct external-link opening.
- [ ] Side panel: save, edit, Favorite, organize into any project/collection, and create a
      destination inline.
- [ ] Reload the extension and confirm the active page, scope, view, selected item, and
      meaningful search/workspace state restore where intended.

### D. Data safety and destructive recovery

Run these after the baseline is recorded. Before each destructive step, note counts and
two or three unique marker items.

- [ ] Make an edit, wait for mirror completion, reload the dashboard, and verify it.
- [ ] Make another edit, close Chrome, reopen, and verify it.
- [ ] Open a second dashboard while one is already open; both show the same committed data.
- [ ] Reload the unpacked extension from `chrome://extensions`; verify all baseline data.
- [ ] Revoke/pause folder permission if Chrome permits it; confirm Homebase clearly requests
      reconnection and does not overwrite or pretend the mirror succeeded.
- [ ] Reconnect the saved folder without accidentally selecting or creating another folder.
- [ ] Use **Backup now**; confirm the named `.sqlite` exists and Settings reports success.
- [ ] Mutate several records, restore the named snapshot, and verify counts, relationships,
      notes, favorites/pins, workspaces, and trash state.
- [ ] Confirm a safety/undo snapshot exists around restore and can recover the pre-restore state.
- [ ] Uninstall Homebase, reinstall from the same local `dist/`, choose the existing Dropbox
      folder, and verify the complete baseline library is recovered before making new edits.
- [ ] Confirm reinstall did not shrink or replace the existing folder database with an empty DB.
- [ ] Pause Dropbox sync, make ordinary edits, verify local folder writes, resume sync, and
      confirm no app error or OS conflict copy appears.
- [ ] Inspect Settings at the end: last mirror/backup/error state matches what actually happened.

### E. UX, responsiveness, and accessibility

- [ ] Large display: all major pages have clear hierarchy and usable list/detail balance.
- [ ] Small/laptop display: test every major page; no clipped actions, overlapping labels,
      unusable item details, or content hidden under Chrome's footer.
- [ ] Long lists and previews have bounded height, visible scrolling, and bottom breathing room.
- [ ] Light and dark dashboard themes maintain readable labels, badges, controls, and focus states.
- [ ] Side panel follows the current page appearance and remains readable on narrow width.
- [ ] Dialog focus returns correctly; no `aria-hidden` focused-descendant warning.
- [ ] Primary tabs, dialogs, list selection, and close actions are keyboard-usable.
- [ ] Empty, loading, error, paused, and completed states are distinguishable without DevTools.
- [ ] No repeated application-owned console exception during ordinary workflows. Third-party
      page warnings are logged only if Homebase caused them or they affect functionality.

### F. Performance and stability

- [ ] Record cold dashboard time to meaningful Home content.
- [ ] Record warm dashboard time with another dashboard already open.
- [ ] Record Library time to usable list and restored selection.
- [ ] No recurring 3–4 second blank/loading state on normal warm Library opens.
- [ ] Switching project, collection, workspace, and list/gallery view feels immediate.
- [ ] Filtering and selecting do not visibly stall on the current test library.
- [ ] Background hydrate/pipeline work does not reset navigation or selected-item state.
- [ ] Leave Homebase open during normal browsing for at least one extended session; no growing
      error loop, stale cross-window data, or stuck progress banner.

### G. Import and enrichment honesty

Keep AI runs small and explicitly initiated during release testing.

- [ ] Import preview identifies the input correctly and keeps Process controls visible.
- [ ] Commit progress, completion, cancellation, and partial outcomes match actual item counts.
- [ ] Enrich one or a small selection; inspect fetched content, AI result, status, and error detail.
- [ ] Retry a failed item and confirm the action/result scope is clear.
- [ ] Pause/cancel and reload a small batch; no permanently false “paused” banner remains.
- [ ] Run classification on a small eligible selection; assignments and suggestions remain distinct.
- [ ] Reproduce or clear Risk R2 below before signoff: Discover must not make General items
      appear deleted merely because downstream classification skipped them.
- [ ] No AI action runs unexpectedly or without an understandable cost-bearing user action.

## Issue policy

### Severity

| Level | Meaning | V3 disposition |
|-------|---------|----------------|
| **P0** | Suspected data loss/corruption, unsafe overwrite, unrecoverable startup, or destructive action without protection | Stop that test path; preserve files/logs; fix and retest before continuing toward release |
| **P1** | Core workflow broken, materially misleading trust state, repeated crash/error, unusable primary layout, or severe performance regression | Must fix in V3, or remove/disable the affected path with explicit approval |
| **P2** | Significant friction or inconsistency with a safe workaround | Fix in place when localized; otherwise group into one focused pre-close session or explicitly defer |
| **P3** | Cosmetic detail, refinement, or new capability | Usually post-V3 feature/backlog |

### Status lifecycle

`NEW` → `REPRODUCED` → `FIXING` → `READY TO RETEST` → `CLOSED`

Alternative terminal states require a note: `NOT REPRODUCED`, `DUPLICATE`,
`DEFERRED POST-V3`, or `ACCEPTED LIMITATION`.

### Fix-now versus defer

- Fix immediately when the issue is reproducible, localized, low-risk, and can be retested in
  the same workflow.
- Use a dedicated V3 session when the fix crosses storage boundaries, changes data semantics,
  affects several pages, or needs a migration/recovery test.
- Defer only when the current behavior remains safe, understandable, and usable. Record the
  workaround and destination backlog entry.
- Never use disposable test data as justification to defer a real durability defect.
- After every fix: rebuild, reload extension, retest the exact reproduction, then run the nearest
  neighboring workflow and relevant automated tests before marking it closed.

## Active issue ledger

| ID | Found | Area | Summary | Severity | Status | V3 decision | Fix / commit | Retest |
|----|-------|------|---------|----------|--------|-------------|--------------|--------|
| V3-001 | 2026-08-08 | Help / onboarding | Help is incomplete and describes pre-redesign workflows | P2 | READY TO RETEST | Text/icon Help shipped locally; media-ready | V3 checkpoint | User review pending |
| V3-002 | 2026-08-08 | Import / enrichment | Finished bulk run leaves a false resumable checkpoint (`443/445`) | P1 | READY TO RETEST | Reconcile terminal leftovers and report only final IDs | V3 checkpoint | Reload + next small import pending |
| V3-003 | 2026-08-08 | Organization / concurrency | Adding an item to a project/collection is slow or later appears applied/reverted during processing | P1 | READY TO RETEST | Atomic worker-side item patches, explicit UI priority, durable save feedback | `33396e1` | Parallel pipeline retest pending |
| V3-004 | 2026-08-08 | Search / organization | Cannot search All Library for material not already in a target project or collection | P2 | READY TO RETEST | Pre-ranking `Not in…` project/collection filter | `33396e1` | Contextual project/collection retest pending |
| V3-005 | 2026-08-08 | Search / query semantics | Multi-term Search syntax and result counts are unclear/non-monotonic | P2 | READY TO RETEST | Parsed AND/OR/phrase grammar, worker-owned semantic ranking, visible fallback | `33396e1` | Fixed-query and live-embedding retest pending |
| V3-006 | 2026-08-09 | Search / persistence | Search scope resets to the surrounding Home scope after refresh | P2 | CLOSED | Preserve restored Search scope; follow later shell navigation only | `cfad800` | PASS — refresh and later navigation, 2026-08-09 |
| V3-007 | 2026-08-09 | Storage / enrichment | Per-URL raw files and automatic run folders do not scale to 10k URLs or sync folders | P1 | READY TO RETEST | One folder-owned content DB; no per-URL files or automatic run trees | `e9aef10` + coordinator cleanup | Layout/content reads pass; Chrome restart/reinstall recovery remains |
| V3-008 | 2026-08-09 | Pipeline / resume recovery | System sleep can strand a batch; first coordinator build stalled at 5% and blocked Hub loading | P1 | READY TO RETEST | One shared serialized coordinator with durable jobs, tab fetching, pause/Resume, priority, and recovery | `2f9c4d0` through `6b503c3` + Resume UI checkpoint | Normal processing and pause/Resume mostly pass; cancel, sleep/restart, and final scale checks remain |
| V3-009 | 2026-08-12 | Pipeline / progress UI | Large-job bars appear nearly complete while item count is still low | P2 | READY TO RETEST | Use authoritative whole-job item progress across every pipeline surface | Uncommitted | Reload and compare bar with a large-job count |

### V3-001 — Replace stale Help with a comprehensive daily-use guide

- Found: 2026-08-08, Run 01
- Severity / gate: P2 / G2 + G3
- Status: REPRODUCED
- Environment: `design/ui-redesign` at `b1114b4`
- Reproduction:
  1. Open Help from the dashboard sidebar.
  2. Compare its Home, tab, navigation, workspace, backup, and pipeline guidance with the redesigned app.
- Expected: Help explains the current product model and gives task-based guidance for setup,
  capture, organization, projects/collections, workspaces/browser tabs, Search, item editing,
  import, enrichment, backup/recovery, shortcuts, and troubleshooting.
- Actual: Help v2 is brief and materially stale. It still describes the removed split Home landing/tab
  layout, bottom tab strip, draggable divider, and older navigation/workflow labels.
- Data-safety check: no loss observed; stale recovery guidance could nevertheless undermine user trust.
- Evidence: `src/components/dashboard/HelpView.tsx`.
- Decision: fix in V3. The first pass uses accurate text, task-based information architecture,
  search/contents navigation, icons, and optional image/video descriptors. Durable screenshots remain
  post-V3 tooling work after the workflows stabilize or a real extension-controlled Chrome surface is available.
- Fix: `HelpView.tsx`, `global.css`, and `HelpView.test.tsx`; production build passes and 4 focused tests pass. Included in the V3 checkpoint commit.
- Retest: pending user review on large/small screens and light/dark dashboard themes.

### V3-002 — Finished bulk import leaves a false Resume checkpoint

- Found: 2026-08-08, Run 01
- Severity / gate: P1 / G4 + G6
- Status: READY TO RETEST
- Environment: `design/ui-redesign` at `b1114b4`; fresh-install Dropbox-folder dogfood
- Reproduction:
  1. Import and process a large bookmark batch.
  2. Let the pipeline finish, then reopen the dashboard.
  3. Observe `445 links · 443 processed · 2 remaining · saved checkpoint` and a Resume action.
- Expected: a run that reached a terminal result for every selected item clears its checkpoint.
  Unsupported/skipped/failed items remain inspectable in Enrichment Hub but do not masquerade as
  interrupted work. A genuinely interrupted scope remains resumable.
- Actual: `enrichBatch` could return a terminal skip without persisting an enrichment record, while
  the scoped runner interpreted the absent record as never attempted. Import Studio separately marked
  every selected ID as processed in its report, creating two contradictory completion states.
- Data-safety check: no item loss or DB corruption observed; this is misleading checkpoint/report
  accounting. The affected items remain stored in the library.
- Evidence: user-reported banner text; `scopedPipelineJobRunner.ts` final accounting and
  `ImportStudioView.tsx` report handoff.
- Decision: fix immediately in V3 because pipeline state must be trustworthy.
- Fix: the scoped runner now captures per-item batch outcomes, finalizes deterministic terminal
  skips/failures, heals legacy no-error partial checkpoints on read, and reports only
  checkpoint-final item IDs. Nine focused Import/pipeline tests and the production build pass.
- Retest: reload should remove the existing false banner; then run a small batch containing an
  unsupported/ineligible URL and confirm completion without a stale checkpoint.

### V3-003 — Organization changes are unpredictable during parallel processing

- Found: 2026-08-08, Run 01
- Severity / gate: P1 / G3 + G4 + G6
- Status: READY TO RETEST
- Environment: `design/ui-redesign` after V3 checkpoint `e0ab965`; background link processing active
- Reproduction:
  1. Run enrichment/classification work in parallel.
  2. From Search, Item/Inspector, Project, or side panel, add a saved item to another project/collection.
  3. Observe that the action can remain disabled without a status, appear only later, or have an
     uncertain final result.
- Expected: organization paints immediately, visibly remains pending until the DB acknowledges it,
  and remains durable even when enrichment updates the same item concurrently.
- Actual: dashboard and offscreen pipeline realms each built and persisted a complete Item from their
  own cached copy. A later enrichment title/tag write could therefore overwrite newer collection
  membership. Organization also waited through redundant/legacy refresh work and exposed no durable
  saving state; its dialog could close while the write was still pending.
- Data-safety check: no specific lost item was confirmed, but a stale whole-item write could revert
  project/collection membership. Item records and content remained present. Treat as a release-blocking
  trust/concurrency defect until the parallel retest passes.
- Evidence: `db.ts`/`dbCore.ts` client-side read-modify-put path, enrichment's concurrent `updateItem`
  call, and ProjectDashboard's full-refresh update path.
- Decision: fix immediately in V3.
- Fix: all `updateItem` calls now send patches to one worker-side atomic update that reads the latest
  canonical row before merging, so enrichment changes cannot overwrite unrelated organization fields.
  Interactive dashboard and side-panel updates explicitly use the high-priority DB lane and consume
  the canonical acknowledgment without a full-library refresh. The shared organization editor shows
  `Saving organization…` and `Organization saved`; organization dialogs cannot close mid-save. The
  legacy Project page now uses the same shared update path. Thirty focused organization, Search,
  Home, Project, DB priority, and write-barrier tests plus the production build pass.
- Retest: while a multi-item pipeline is actively processing, add one item to two collections from
  Search and another from the Project page; wait for `Organization saved`, then revisit/reload both
  destinations during and after pipeline completion. Repeat once from the side panel.

### V3-004 — Search for material not already organized in a target

- Found: 2026-08-08, Run 01
- Severity / gate: P2 / G3
- Status: READY TO RETEST
- Environment: `design/ui-redesign` after V3 checkpoint `e0ab965`
- Reproduction:
  1. Open Search from a project or collection and widen its scope to All Library.
  2. Search for material to add to that location.
  3. Existing results already organized there remain mixed with genuinely new candidates.
- Expected: Search can exclude every item already belonging to a selected project or collection,
  while retaining matching items from elsewhere in the library.
- Actual: Search supported positive project/collection scope and domain filters only.
- Data-safety check: no data mutation or loss; this is a discovery/organization usability gap.
- Decision: add the localized filter in V3 because it directly supports the organization dogfood flow.
- Fix: Search now offers a contextual `Include existing` / `Not in current project` /
  `Not in current collection` selector instead of a global organization list. Exclusions run before
  lexical/embedding candidate ranking and travel with a search only while its project/collection
  context remains valid; switching context clears an old exclusion. The initial implementation only
  changed filter state while leaving stale results visible; the selector now immediately reruns the
  current query with the explicit new filter snapshot. Nine focused Search/filter/state tests pass.
- Retest: from a project, search All Library with `Not in <current project>` and confirm its existing
  material disappears while other matches remain. Add one result, rerun the same search, and confirm
  it disappears. Repeat with a collection exclusion.

### V3-005 — Multi-term Search has no clear query semantics

- Found: 2026-08-08, Run 01
- Severity / gate: P2 / G3
- Status: READY TO RETEST
- Environment: `design/ui-redesign` after V3 checkpoint `e0ab965`
- Reproduction: compare `sex,ai`, `sex,ai,ml`, `sex ai ml`, and `sex+ai+ml` in Hybrid and Text-only modes using an unchanged library scope.
- Expected: the UI states whether multiple terms mean Any, All, or an exact phrase; equivalent separators behave predictably; Hybrid fallback is visible.
- Actual: punctuation becomes a separator for lexical tokens, but the unparsed raw query is sent to the embedding model and used for a literal title-phrase boost. Terms are OR-like lexical signals rather than Boolean syntax; quotes, `+`, `AND`, `OR`, and `-term` are not operators. Adding a term can change the top-200 candidate pool, semantic vector, category expansion, and top-30 result set. Embedding failure silently falls back while the UI still labels the mode Hybrid.
- Data-safety check: no mutation or loss; this is search predictability and trust.
- Decision: fix in V3 with familiar query-box syntax and an on-screen interpretation rather than a separate advanced-search form.
- Fix: plain meaningful terms are deterministic AND; `AND` and a leading `+` are explicit required forms; `OR` creates alternative AND groups; quotes require a normalized exact phrase; `-term`/`-“phrase”` exclude; `site:domain` is a hard domain guard; commas are spaces. Primary results must satisfy these rules across title, URL/domain, tags, notes, summaries, key points, source kind, and category names. Hybrid mode embeds only positive operator-free text. Because tab hydration intentionally strips vectors, a new protocol-v6 read-only worker RPC ranks eligible item IDs against canonical full embeddings and returns only the top scores. Semantic discoveries outside positive exact rules appear separately, while negative/site/organization guards remain enforced. The UI displays its parsed interpretation and `semantic ranking`, `text fallback`, or `text only`; changing query text clears stale results. Search no longer returns an empty index during an active local digest—it uses the essential text index instead. Help and CLI evaluation use the same grammar. Thirty-nine focused parser, engine, Search UI, Help, state, Home, Project, and All Library tests pass.
- Retest: with an unchanged scope, confirm `ml in trading` excludes trading-only and ML-only items; `“machine learning in trading”` requires that exact normalized phrase; `ai OR quant`, `ai AND +quant`, `ai -beginner`, and `site:arxiv.org ai` follow the displayed interpretation. In Hybrid mode with embedded documents, confirm exact matches remain primary, semantic-only `ai quant` material appears under Related results, and the status says semantic ranking. Remove/disable the API key or test during a digest and confirm exact text results remain available with a visible text-fallback label.

### V3-006 — Search scope resets to the surrounding Home scope after refresh

- Found: 2026-08-09, Run 01
- Severity / gate: P2 / G3
- Status: CLOSED
- Environment: `design/ui-redesign` after architecture checkpoint `33ee5f5`
- Reproduction:
  1. Open Search while Home is scoped to Inbox or another project/collection.
  2. Change Search itself to All Library or a different project/collection.
  3. Refresh the dashboard.
- Expected: Search restores its latest query, mode, selected result, scope, and filters. The
  surrounding Home scope remains independent; a later explicit Home project/collection navigation
  may establish a new Search default.
- Actual: `useLibrarySearch` restored the saved filter state correctly, but Dashboard startup
  immediately replaced its project/collection filters with the surrounding shell scope.
- Data-safety check: no canonical data mutation or loss; only resumable Search UI context was reset.
- Decision: fix immediately because reliable state restoration is part of the V3 usability gate.
- Fix restored: Search continues using the same browser-local UI-state persistence as Home, Library, shell
  navigation, layout, and open-work state. Shell scope synchronization now ignores the initial mount
  (including React Strict Mode's repeated startup effect) and applies only after project/collection
  navigation actually changes. Existing domain and negative filters remain intact when that happens.
  Three focused hook tests and the production build pass.
- Retest: from Inbox Search choose All Library, set a collection/domain/negative filter, run a query,
  select a result, and refresh. Confirm all choices and the cached result return. Then explicitly
  navigate Home to another project and confirm Search adopts that new project as its default scope.
- Retest result: PASS on 2026-08-09 after a full extension reinstall. Search state survived refresh,
  and later explicit shell navigation updated the default scope as designed.

### V3-007 — Fetched content creates an unbounded sync-folder file set

- Found: 2026-08-09, pre-import storage review
- Severity / gate: P1 / G1 + G4 + G5
- Status: READY TO RETEST
- Environment: `design/ui-redesign` at `33396e1`; planned clean install before a 10k+ URL import
- Reproduction: enrich/import a large library while using a Dropbox or similar selected backup folder.
- Expected: Homebase remains provider-neutral, keeps one small bounded file set in the selected folder,
  preserves expensive fetched content across reinstall, and does not make dashboard hydration heavier.
- Actual: each fetched URL wrote `enrichment-cache/<item>.md`, suspicious fetches wrote another file,
  and automatic debug runs could add a multi-file `pipeline-runs/app-*` directory. At 10k URLs this
  creates sync churn and a failure surface unrelated to the core SQLite database.
- Data-safety check: content is rebuildable but expensive and sometimes impossible to fetch again;
  core user data remains more critical and keeps its existing recovery rotation.
- Decision: fix before the real import. No legacy migration is required because V3 is unreleased and
  testing will restart from a clean extension/folder.
- Rejected checkpoint: the first sidecar implementation kept a live OPFS content database and replicated it
  to the selected folder. That contradicted the intended lifecycle: fetched content needs one durable folder
  copy, not a second local database plus backup coordination. It also used an inactivity debounce, so a
  continuously running import could postpone the first folder publication indefinitely.
- Corrected checkpoint in progress: a dedicated content worker still owns immutable
  `(item_id, kind, content_hash)` values and opaque-key lookup, but its SQLite connection is volatile and the
  selected folder's `workbench-content.sqlite` is the only durable copy. The first dirty write starts a fixed
  maximum-latency atomic flush which later writes do not postpone. Content RPCs wait for folder load or empty
  file initialization; core-library startup remains independent. Protocol is v8. Existing pipeline runners
  remain unchanged until this storage checkpoint passes in the real extension.
- First extension retest: a 32-item selection reduced to three re-digest candidates but stalled at
  `Enriching 1/3`, and no folder snapshot appeared. The content worker awaited a compression-stream write
  before consuming its readable output, which deadlocked under backpressure for realistic bodies. The stream
  now pipes input and consumes output concurrently; a 400 KB incompressible-body regression test and the
  production build pass. Reloading the extension is required to replace the already blocked worker.
- Simplified acceptance: linking/reloading a writable selected folder creates a valid empty
  `workbench-content.sqlite` when none exists. This verifies worker/folder initialization independently;
  enrichment is tested only after the empty database file is visible.
- Clean-folder retest exposed that only the existing-`workbench.sqlite` load path invoked content setup;
  the fresh-folder `allowEmptyMirror` branch created the core DB and skipped the content worker. All successful
  folder-link paths now await content restore/initialization, and an empty-snapshot write failure is surfaced
  instead of reporting folder setup complete.
- Retest: on a clean install, confirm there is no content SQLite file in OPFS, enrich several links, and inspect
  raw content. Within 60 seconds of the first dirty write (or after Backup now),
  confirm the folder contains `workbench.sqlite`, `workbench.meta.json`, and one
  `workbench-content.sqlite`, with no new files in `enrichment-cache/`. Reload Chrome and re-open raw content. Then
  uninstall/reinstall, select the same folder, and confirm raw content opens without another fetch.
- Retest result: CONTENT STORAGE PASS on 2026-08-09. The folder-only database appeared and fetched content was
  readable. The first one-link processing attempt nevertheless stalled until Cancel and a second run; this is
  not attributed to the accepted storage layout. Source inspection confirms the remaining split ownership:
  singles still execute inside the invoking dashboard while bulk executes offscreen. The one-link coordinator
  gate therefore remains failed and is the next implementation checkpoint.
- Rebuild checkpoint after that result: core SQLite schema v5 now has independent `pipeline_jobs` and
  per-item/per-stage `pipeline_tasks` primitives. Submission is atomic and active work is deduplicated;
  claims are ordered and leased; heartbeat/finish requires matching job and task fencing epochs; cancellation
  is durable before acknowledgement and invalidates stale commits; expired safe work requeues while interrupted
  AI extraction or embedding becomes `uncertain`. These APIs do not yet execute work or alter any UI runner.
  Protocol is v9; five focused queue/migration tests and the production build pass.

### V3-008 — Interruption or refresh strands a running pipeline and Dashboard navigation

- Found: 2026-08-09, Run 01
- Severity / gate: P1 / G4 + G5
- Status: READY TO RETEST
- Environment: `design/ui-redesign` after `33396e1`; initially reported after an interrupted batch,
  then the false pause was reproduced while the computer was running normally
- Reproduction:
  1. Start a multi-item pipeline and refresh/reopen the dashboard while it is processing.
  2. Separately, allow one normal slow fetch/AI operation to remain quiet for more than 90 seconds.
  3. Observe a stalled job: Resume may be hidden, may wait indefinitely, or may not continue.
  4. From the side panel, press Dashboard; the existing panel can remain unchanged with no new tab.
- Expected: committed progress survives interruption; dashboard pages never own execution; one shared
  coordinator serializes bulk work, lets interactive singles start in a priority lane, and automatically
  resumes an expired lease without a duplicate runner. Manual Resume requeues durable work without
  destroying the DB owner. Dashboard navigation remains independent of processing.
- Actual: the authoritative checkpoint and banner depended on selected-folder permission, the page
  owned the cross-window heartbeat while the offscreen batch could outlive it, and resumed work ran
  in a different execution realm. The side-panel Dashboard action also waited for a forced folder
  mirror, so a slow/stalled worker prevented navigation. On the first coordinator retest, a 445-item
  request remained at 5%, refresh showed no recoverable work, and Enrichment Hub never finished loading:
  the dashboard performed roughly two SQL lookups per item before durable submission, monopolizing the
  single DB worker. A subsequent one-link Hub retest exposed three more coordinator integration failures:
  every two-second progress heartbeat invalidated shared state, offscreen enrichment writes caused peer
  dashboards to reload repeatedly, and pipeline completion synchronously waited for a whole content-sidecar
  export to the selected folder. Cancel also did not propagate into embedding, so work could continue after
  the user cancelled it.
- Data-safety check: no loss has been reported, but recovery was not trustworthy and duplicate/racing
  processing was possible. Pipeline database mutations remain committed independently of the UI page.
- Decision: fix immediately as a V3 stability/trust blocker.
- Prior attempt (not active branch): one extension-wide offscreen coordinator now owns all full bulk and interactive single-item digest
  execution. A SQLite `pipeline_jobs`/`pipeline_tasks` queue is committed before acknowledgement, bulk is
  serialized, and singles use an independent high-priority lane. Renewable leases make abandoned running
  jobs queued again on coordinator startup/wake; a one-minute Chrome alarm wakes recovery even with no
  dashboard open. Resume is a durable requeue and no longer closes/recreates the offscreen document or DB
  worker. Cancel and Pause are separate durable terminal/non-terminal transitions. The selected folder is
  only a later database mirror and is not read for runtime recovery. Dashboard banners read shared SQLite
  state and refresh across windows. Long fetch/AI operations retain the truthful two-second heartbeat.
  The side-panel Dashboard action remains independent of backup flushing. The retest regression is fixed
  by sending only IDs/options, committing queue state before acknowledgement, loading the cache seed in
  the coordinator after acceptance, replacing per-item seed reads with bounded bulk queries, and writing
  task checkpoints in 100-row statements rather than one statement per item. Hub page/count requests are
  now bounded to 15 seconds; a failure exits the spinner, preserves cached rows, and presents a Retry action
  instead of leaving an indefinite loading state. A follow-up audit found Import Studio was the final
  page-owned bulk runner; it now submits to the same coordinator client used by Home, Library, and the Hub.
  Bookmark import no longer performs a complete library-and-pipeline hydrate after its atomic save; it
  refreshes only Items and Trash, preventing an already-committed import from sitting on `Saving bookmarks…`.
  The coordinator also preserves a normally-returned paused/failed checkpoint instead of overwriting it as
  completed. Progress heartbeats now update progress only; durable state invalidates only on lifecycle
  transitions. Dashboard peers ignore intermediate enrichment/classification broadcasts and refresh once
  through the invoking completion path. Raw-body writes retain the worker's scheduled coarse mirror, but
  pipeline completion no longer waits for a full folder/Dropbox export. Cancellation is propagated through
  embedding fetches and the coordinator durably records Cancel before acknowledging it.
- Automated evidence: coordinator tests prove commit-before-acknowledgement, serialized bulk, an immediately
  independent single lane, and startup recovery of queued durable work. Real SQLite coverage also commits
  and reads a 445-task durable batch. Client/checkpoint lifecycle tests, TypeScript, `git diff --check`, and
  the production build are part of the release gate.
- Return retest — 2026-08-12: the worker/content-store paths mostly worked, but pressing Resume exposed a
  presentation gap: the banner sent a one-shot Resume command and did not attach the dashboard observer used
  by a normal Start, so users saw neither the live processing modal nor the final results modal. Resume now
  installs the same progress/completion observer before requeueing the existing durable job, opens the shared
  modal at its saved completed count, supports Cancel through the observer, and renders the normal final
  summary/report. The job is not duplicated and coordinator ownership is unchanged. Focused Resume client/UI
  coverage and the production build pass. Real-extension retest passed on 2026-08-12 for the live Resume
  and final-results modals; broader cancellation, sleep/restart, and large-batch checks remain part of normal
  release dogfood.
- Retest:
  1. Reload protocol-v12 `dist`; first process one link from Enrichment Hub. Confirm the page remains stable,
     the job reaches completion, and Cancel stops an in-flight fetch/embedding promptly. Then start the
     445-link pipeline and confirm it moves beyond submission/loading
     promptly. Open Enrichment Hub during preparation and confirm its links load normally.
  2. While it runs, start one single-link digest from another surface. Confirm the single starts promptly
     while bulk continues, and two dashboards show the same durable bulk state.
  3. Reload/close every dashboard during another batch. Reopen and confirm work continued without a page.
  4. Start another batch and put the Mac to sleep. On wake, allow automatic recovery first; if the job was
     deliberately paused/failed, press Resume and confirm only unfinished committed work continues.
  5. Test Pause and Cancel as different outcomes, then confirm completed/cancelled jobs leave no stale banner.
  6. Cancel a running Import Studio batch, immediately import the same file again, and confirm saving finishes
     promptly and the newly submitted processing job uses the shared coordinator rather than a dashboard tab.

### V3-009 — Pipeline progress bars disagree with completed item counts

- Found: 2026-08-12, Run 01 continuation
- Severity / gate: P2 / G3 + G4
- Status: READY TO RETEST
- Reproduction: run a large pipeline and compare the progress bar with a label such as `540/3000`.
- Expected: every pipeline bar reflects whole-job item progress, so `540/3000` displays about 18% regardless
  of whether the current link is fetching, embedding, classifying, or saving.
- Actual: nested one-item embedding/classification callbacks reported stage-local `1/1`; phase weighting treated
  that as whole-job progress and the monotonic UI then retained a nearly full bar.
- Data-safety check: presentation only; durable item/task counts and processing order were unaffected.
- Fix: progress events now carry separate stage-local and authoritative overall item counts. The shared progress
  calculation prefers the overall values, and the normal/Resume modal, Import Studio, categorization controls,
  enrichment review/test tools, and embedding backfill status all consume it. Determinate bars also expose
  consistent progressbar accessibility values. The obsolete Import wave-percentage model was removed.
- Automated evidence: 23 focused pipeline/client/job-store/Import/Resume tests pass, including `540/3000`
  regression coverage across enrich/embed/classify/save; TypeScript and production build pass.
- Retest: reload the extension and observe a running large job. The visible percentage and fill should track
  the item count throughout stage changes, remain monotonic, and reach 100% only when the job completes.

For substantial issues, add a section using this template:

```md
### V3-### — Short title

- Found: YYYY-MM-DD, Run ##
- Severity / gate: P# / G#
- Status: NEW
- Environment: branch, commit, Chrome version, screen size when relevant
- Reproduction:
  1. ...
- Expected: ...
- Actual: ...
- Data-safety check: counts/files/markers affected or confirmed intact
- Evidence: console excerpt, screenshot, file timestamps/sizes
- Decision: fix now / focused V3 session / proposed post-V3
- Fix: files and commit
- Retest: result and date
```

## Known pre-test risks to target

These are not counted as Run 01 failures until reproduced.

| Risk | Why it matters | Required disposition |
|------|----------------|----------------------|
| **R1 — Dropbox folder behavior** | Cloud-folder locks/delays can make atomic move fall back to copy or expose stale/conflict files | Complete G1 Dropbox cases; any failed move+copy or clobber becomes P0 |
| **R2 — Discover General-count drop (#13)** | Historical run moved many General items to `ineligible`, making categories appear deleted without successful reassignment | Reproduce and fix behavior, or disable/clearly constrain the unsafe combined action before signoff |
| **R3 — Unpacked extension lifecycle (#19)** | Loading `dist/` from a synced folder previously correlated with the extension disappearing | Keep code local; verify restart/reload/reinstall. Dropbox data folder remains the intended test |
| **R4 — Library startup regression** | Library previously showed a recurring 3–4 second load while other pages were fast | Measure cold/warm/second-dashboard behavior and state restoration |
| **R5 — Restore/merge complexity** | Current release path is replace/restore with safety snapshots; merge semantics are not a required V3 feature | Keep unimplemented merge clearly disabled; thoroughly test replace/undo paths |

## Test run log

### Automated preflight — 2026-08-08

- `npm run build`: PASS. Vite reported existing chunk-size/static-plus-dynamic import
  optimization warnings; no compile or build error.
- Focused storage safety tests: PASS — 4 files, 32 tests covering folder mirror guards,
  snapshot naming/rotation validation, backup-folder error formatting, and SQLite merge/tombstones.
- Manual gates: unchanged; no manual durability or UI scenario is credited by this preflight.

### Run 01 — Fresh install with Dropbox data folder

- Date: 2026-08-08
- Build: `design/ui-redesign` at `b1114b4`
- Purpose: establish a clean disposable library, begin daily-use testing, and exercise the
  single-device Dropbox mirror/recovery path.
- Result: IN PROGRESS
- Baseline counts/markers: bulk processing scope observed at 445 links; full library totals and
  unique marker titles remain to be recorded.
- Issues opened: V3-001, V3-002, V3-003, V3-004, V3-005, V3-006, V3-007, V3-008
- Notes: User will report findings incrementally; Codex will assign IDs, triage, update gates,
  implement approved fixes, and move larger safe items to a focused session or post-V3 backlog.

### Run 01 continuation — 2026-08-12 checkpoint

- Build: `design/ui-redesign` at `4506de7`.
- Pipeline architecture and folder-owned content database are implemented. Normal processing and
  pause/Resume are mostly accepted; broader Cancel, sleep/restart, reinstall recovery, and final
  large-batch checks remain open.
- Resume now shows both the live progress modal and final-results modal.
- Primary activity returns to general usability, UI/UX, state-retention, and data-integrity dogfood.
- New findings continue in the issue ledger; fixing one issue does not replace the A–G checklist.

## Final signoff

- [ ] G0–G6 are PASS or explicitly accepted exceptions are recorded.
- [ ] No open P0 or P1 issue.
- [ ] Every P2 has a fix or explicit disposition; P3 items are in the normal backlog if useful.
- [ ] Final production build passes.
- [ ] Relevant focused tests pass; known unrelated test debt is documented.
- [ ] `docs/OVERVIEW.md`, `docs/backlog.md`, and `docs/KNOWN_LIMITATIONS.md` match shipped behavior.
- [ ] Historical V3 dogfood/discover documents are marked closed, superseded, or parked.
- [ ] Version is chosen and release commit/tag created.
- [ ] `design/ui-redesign` is integrated through the agreed branch path and pushed.
- [ ] Begin feature-by-feature development; do not create another broad phase without a new
      explicit product reason.
