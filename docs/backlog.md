# Workbench Agent — Backlog

Condensed from `docs/old/` (`backlog.md`, `dashboard_backlog*.md`, `STATUS_REVIEW.md`, `CURRENT_STATE.md`, etc.). **Edit this file** as priorities change; keep `docs/old/` as read-only history.

**Maintenance:** When something ships, add a **one-line** bullet under **✅ Done** (and remove or check off the matching item below). Trim **Done** only if it grows unwieldy—optional archive line can point to `docs/old/` or a git tag.

**Legend:** 🔴 urgent quality / risk · 🟡 UX or features · 🟢 maintenance · ⏸ deferred / needs design

---

## Near-term roadmap (agreed with [`OVERVIEW.md`](OVERVIEW.md))

**V1 backend foundation — closed (Tasks 01–04):** fetch → AI extract → doc embed → classify/discover → hybrid search (dev). Good enough for testing; not production-perfect.

**V2 (active) — product first, then refine backend:**

1. **🟡 V2-A — UX / UI** — Major IA and shell polish ([`UI_IDE_REDESIGN.md`](UI_IDE_REDESIGN.md) phases 2–4): one understandable flow for browse, enrich, categorize, search; fold or retire dev-only surfaces (`PipelineDevView`, scattered modals). Spec: [`docs/temp/TASK-05-v2-product-ux.md`](temp/TASK-05-v2-product-ux.md) (draft).
2. **🟡 V2-B — Data model cleanup** — Align UI with truth in `db.ts`: notes store vs bookmark-items, AI semantic layer vs projects/collections, provenance/metadata; small migrations only where necessary.
3. **🟡 V2-C — V1 backend refinement** — *After* V2-A/B baseline: fetch coverage/quality, pipeline automation (auto-embed, import hooks), search tuning (`04-defer-*`), embed/classify text unify, accept/reject for AI categories. CLI track continues in parallel.

**V3 (deferred) — scale AI:** chunk RAG, ANN, concept DAG taxonomy, cloud `Embedder`, agentic RAG — see **AI — V3** below. Not a gate for V2 UX.

---

## ✅ Done (shipped)

- **Chrome app**: MV3 extension; React/Vite UI; side panel + full-page; service worker opens panel + `focus-tab` helper.
- **IndexedDB v3→v4** (`db.ts`): projects, collections (`primaryProjectId`, `projectIds`), items (`collectionIds[]`, tags, placement-aware notes), workspaces, `notes` object store (schema + export/import), snapshots; migrations incl. legacy default project id cleanup and **v4 placements / canonical URL dedup** (`placements`, `addItemWithMerge`, `removeItemFromCollection`) per [`DATA_MODEL_DEDUP.md`](DATA_MODEL_DEDUP.md).
- **Backup / import**: JSON export/import, `verifyBackup`, confirmation + counts, backup-before-import, best-effort pre-migration dump + console warnings.
- **Tab Commander**: Multi-window navigator, bulk selection, drag-move tabs between windows, list/gallery, mitigations for macOS Spaces (e.g. Open Here / find window).
- **Bookmarks & collections**: Item/collection/project CRUD; Unsorted per project; “All projects” aggregate view; collection pills + filters; in-place edit; context menus.
- **Project workspace**: Multi-space tabs, drag/reorder, system tabs (Search, Add Item, Collections manager), **Recent** items tab; Search across title/URL/notes/tags.
- **Workspaces**: Save/restore session snapshots; optional `projectId`; list + detail UI.
- **Design baseline**: Compact IDE-style layout, theme tokens / CSS variables, dark–light toggle usage across dashboard.
- **Shared libs**: `src/lib/utils.ts`, `src/lib/constants.ts` (domains, dates, UI/DB constants—extend as needed).
- **Backup architecture (phase 1)**: `BackupSink` + `FileSystemBackupSink`, `BackupCoordinator`, `dataChangeNotifier`, `revisionTracker`, backup envelope metadata, startup conflict detection, pause-and-resolve flow, and safety snapshot (`safety-before-import-...json`) before sync-driven remote import.
- **Backup UX**: Dashboard **Settings** view (`SettingsView`) — backup status panel, manual backup button (`manual-YYYY-MM-DD_HHMMSS.json`), and conflict resolution actions (Load remote / Keep local overwrite). **Home** is a placeholder until product decides what belongs there.
- **Dashboard IA cleanup**: Tab Commander and Settings live in the **main** left nav (after Collections); duplicate Tab Commander page header removed; no separate dashboard footer strip for chrome/actions.
- **Workspace save UX**: Tab Commander "Save..." flow now supports selecting project vs detached for new workspaces.
- **Top-level create flows**: Added dashboard modals for create project, create collection, add bookmark, and add note; bookmark/note create dialogs support inline project/collection creation.
- **Bookmark vs note behavior**: UI classification is now exclusive (`bookmark = URL`, `note = no URL`), including corrected bookmark project counters.
- **Collections route fix**: `collections` view is now reachable from sidebar (was previously bypassed by switch fallthrough/return ordering).
- **Side panel polish**: Themed like dashboard (CSS variables / primitives); bookmark-only flow with notes under URL; active-tab prefill + refresh on tab switch; “already saved” with edit / remove / add new copy; after save, latest version selected; duplicate bookmark blocked for same URL in same collection; tab-specific side panel open; Open Dashboard disables panel only on dashboard tab; Set Workbench as Home helper (settings tabs + clipboard URL).
- **New tab**: `manifest` uses `chrome_url_overrides.newtab` → `index.html`. **NTP bouncer** experiment (`newtab.html` / `dashboard.html` split) **removed** — simpler build, no extra tab churn; Chrome footer on extension NTP remains a known limitation.
- **AI infra foundation (phase 2a start)**: Added pluggable AI client layer (`src/lib/ai/*`) with OpenRouter adapter, persisted Settings controls (provider/model/base URL/API key + timeout/temperature/tokens), test prompt runner, provider-returned model visibility, and key storage/security note + show/hide toggle.
- **AI infra hardening slice**: strict model-match option, task-based routing scaffold (`single` vs `by-task` with overrides), and optional Chrome native/on-device provider path (graceful fallback when unavailable).
- **Phase B starter (AI + bookmarks)**: Bookmarks view now supports "Ask AI" over current filtered bookmark scope with grounded prompt assembly and visible source refs (`[B1]`, `[B2]`, ...).
- **Import Studio (commit + adapters)**: Bookmarks → **Import** — **file** ingest (Netscape HTML, CSV, JSON incl. loose/JS-assignment wrappers, `.js`/`.txt`), **content-based auto-detect** (JSON vs CSV vs HTML), **X bookmarks export** adapter (`tweet_url`, tweet text → title `screen_name: …`, **description** column + notes for DB), **Chrome `bookmarks.getTree`**, unified preview (first 300 rows) + stats, optional project/collection target, **`Commit to DB`** via **`bulkImportBookmarks`**: single IndexedDB transaction + in-memory normalized-URL index (large drops ~8k+). **Still mock:** Import Studio AI tab. **Follow-ups:** persist cover/favicon + structured import provenance on `metadata`; folder→collection mapping; commit progress UI.
- **Dashboard shell — IDE iteration 1**: Three-region layout with **project dropdown** + collections-in-scope + Content/Tools nav; middle area uses **list pane + item-tab detail** for Bookmarks/Notes/Workspaces (open **item** tabs persist across scope changes); **full-page** Tab Commander and Settings; workspace tabs as single link-list with selection/bookmark/remove; aggregate “open list as tab”; bookmark/note **edit-in-tab**; Tab Commander (`BottomPanel`) **theme-aligned** via CSS variables + `global.css` tokens (`--error`, `--bg-input`). Supersedes earlier “module tabs + bookmarks split” milestones. Spec: [`UI_IDE_REDESIGN.md`](UI_IDE_REDESIGN.md).
- **Delete UX (placements)**: `DeleteConfirmDialog` paths for **remove from this collection** vs **delete everywhere** on dashboard, project/collections views, item tabs, and tab content where context applies.
- **Side panel — copies & notes**: “Add a new copy” clears project/collection until chosen; auto-switch to edit existing copy when selecting a collection that already holds the URL; notes merge/update wired to placement-aware DB helpers; visible scrollbar on saved-cards list; URL normalization matches `normalizeBookmarkUrl`.
- **Cross-surface refresh**: `BroadcastChannel` + focus/visibility hooks keep sidebar/dashboard lists in sync after mutations (pattern used across app surfaces).
- **Workspace save — append**: Choosing an **existing** workspace **appends** unique tab URLs (deduped via `normalizeBookmarkUrl`), not full replace.
- **Aggregate & common tabs**: “Open as tab” uses **distinct tab titles** (project/collection context); **list vs grid** toggle for bookmark-list / note-list tabs; **Common tab** merges multiple scopes into one tab with **sections** per project/collection (list/grid supported).
- **Item tab strip — reorder**: Open bookmark/note/workspace/list tabs reorder by **drag-and-drop** (HTML5 DnD), not icon buttons.
- **Fetch enrichment v1 (Task 01 — closed 2026-05-20):** Plug-and-play `src/lib/enrichment/` service — hybrid fetch (X CDN→syndication, video/article local→jina), IDB `item_enrichment` + disk cache, OpenRouter AI extract, `buildItemText()` for Task 02. CLI experiments complete. Dev UI only (Enrich/Results modals) — **product UX TBD**. Spec: [`docs/temp/TASK-01-fetch-enrichment-v1.md`](temp/TASK-01-fetch-enrichment-v1.md).
- **AI extraction tuning + eval harness (Task 01.5 — closed 2026-05-24):** SourceKind-aware prompt package (`v2`/`v2.1`), CLI eval harness over saved bodies (`npm run fetch-ai-eval`), AI-only rerun (`reextractAI`), `buildItemText` upgrades (summary + key points), and in-app validation on review flow. Spec: [`docs/temp/TASK-01.5-ai-extraction-tuning.md`](temp/TASK-01.5-ai-extraction-tuning.md).
- **V1.5 search foundation (Task 04 — closed 2026-05-26):** Hybrid retrieval (`src/lib/search/`) — lexical + doc embedding + category expansion, explainable rerank, CLI eval (`npm run search-eval`), Search (dev) tab + discovery (similar items, topics/tags, related links). Dev-only — product search UX deferred to V2. Spec + return: [`docs/temp/TASK-04-search-foundation-v1.5.md`](temp/TASK-04-search-foundation-v1.5.md).
- **Doc embedding step (Task 04 — shared pipeline stage):** Incremental backfill of `ai_item_signals.embedding` from **title + AI summary** (`buildSearchEmbedText`, `embedBackfillPlan.ts`) — same queue in app (`EmbedBackfillBlock`) and CLI (`npm run embed-incremental`). Powers hybrid search, similar-items, and related-links; **reuse for categorize shortlist/centroids deferred to V2+** (see AI — V3).
- **V2-A product UX (Task 05):** **05.1–05.7 + D-40** shipped — Home, search, enrichment read, category review, digest, import/batch, shell polish. Spec: [`temp/TASK-05-v2-product-ux.md`](temp/TASK-05-v2-product-ux.md).
- **V2-B quick access (Task 05.B — 2026-05-27):** Pins, favorites, trash on `Item` (DB v8: `pinnedAt`, `favoriteAt`, `deletedAt`); utility tabs; Home card; context menu + side panel; soft delete. Spec: [`temp/TASK-05.B-pins-favorites-trash.md`](temp/TASK-05.B-pins-favorites-trash.md). **Adjacent same session:** Help v1, Home vertical split (not D-01–03).
- **V2 polish bundle (Task 05.C — 2026-05-27):** Pin sort-to-top; Home classify-queue batch + confirm modal + progress UI; batch cancel (enrich); taxonomy `notifyDataChanged`; Help v2 + shortcuts; AI vs Collections labels. Follow-on: digest browse on Home, `processAll` Home batches. Spec: [`temp/TASK-05.C-v2-polish-bundle.md`](temp/TASK-05.C-v2-polish-bundle.md).
- **V2.1 + V2.1.1 storage (2026-05-29):** SQLite WASM schema + JSON bridge; **single DB worker on OPFS**; mandatory backup folder; debounced mirror to `workbench.sqlite` + `workbench.meta.json`; bootstrap folder → OPFS on startup. Specs: [`temp/TASK-V2.1-sqlite-wasm-storage.md`](temp/TASK-V2.1-sqlite-wasm-storage.md), [`temp/TASK-V2.1.1-opfs-db-worker.md`](temp/TASK-V2.1.1-opfs-db-worker.md). Design: [`DATA_BACKUP_AND_INTEGRITY.md`](DATA_BACKUP_AND_INTEGRITY.md).

---

## 🔴 Reliability & data

- [ ] **Error handling**: consistent try/catch on async paths (`App.tsx`, dashboard handlers, Chrome APIs); user-visible errors vs silent `console.error`.
- [ ] **DB transactions**: multi-step deletes (`deleteCollection`, `deleteProject`, bulk moves) reviewed for atomicity in `db.ts`.
- [ ] **Input validation**: URLs, IDs, text limits; centralize validation helpers (extend existing `src/lib/utils.ts` patterns as needed).
- [ ] **Very large bookmark libraries (scale spike)** — Broader than D-35 alone: UI list virtualization, paged reads, bulk-import memory — assess **5k–50k+** paths; ties to backup coordinator and `db.ts`.

---

## 🟡 Product features

**Data integrity — automated file backup** — design: [`DATA_BACKUP_AND_INTEGRITY.md`](DATA_BACKUP_AND_INTEGRITY.md)

- [x] **`BackupSink` abstraction** — interface + `FileSystemBackupSink` (writes serialized JSON).
- [ ] **`BackupCoordinator`** — debounced live + manual + conflict checks shipped; **scheduled (`chrome.alarms`) + rotation (max N)** still pending.
- [ ] **Settings / persistence** — persisted folder handle + revision/device metadata shipped; **user-configurable debounce/schedule/retention/provider toggles** still pending.
- [ ] **Design spike: optional local `.workbench` config directory (separate from backup folder)** — evaluate usefulness/risk for reinstall recovery and local app config; keep backup target independent (e.g. user may still choose Dropbox for backups).
- [x] **UI** — backup folder picker, backup status, manual backup action, conflict banner/actions shipped.
- [x] **Mutation hooks** — coordinator wired from DB write paths via `notifyDataChanged`.
- [ ] **Manifest** — add `alarms` permission; document any new host permissions only when adding HTTP sink later.
- [ ] **Runtime remote re-check** — currently checks startup/folder-change; add focus/visibility (or timer) re-check while app stays open.

**Notes**

- [ ] **Decide**: first-class `Note` entities (`notes` store + CRUD in UI) *vs* bookmark-notes-only; migrate UI accordingly.
- [ ] Optional: page context capture when creating a note from the active tab.

**Known data-model / schema debt (deferred)**

- [ ] Reconcile `notes` object-store model vs current UI behavior (many notes still tied to `items.notes`).
- [ ] Review import/merge semantics for multi-collection and note-link consistency (especially before implementing merge restore mode).
- [ ] Add tighter validation around legacy backup shape normalization during import.

**Collections & projects**

- [ ] **Detach collection from project** (remove project from `projectIds` without deleting collection).
- [ ] **Share collections across projects** UI (`projectIds` management, indicators).

**UI architecture — IDE shell refresh** — design: [`UI_IDE_REDESIGN.md`](UI_IDE_REDESIGN.md)

- [x] **Iteration 1 — shipped** — project dropdown + collections; Content/Tools sections; middle **split** (list + item tabs) for bookmarks/notes/workspaces; item tabs persist across scope; full-page Tab Commander + Settings; workspace link-list tab UX + aggregate list tabs + edit-in-tab; Tab Commander themed with shared tokens.
- [x] **Tab strip polish (mini)** — drag-and-drop reorder for open **item** tabs; aggregate list titles scoped by project/collection; list/grid for aggregate + common tab.
- [ ] **Phase 2 polish** — unify shared split primitives/resizers; optional persisted divider width.
- [ ] **Phase 2 scope model** — explicit virtual aggregate scope chips (`All Collections`, etc.) beyond current dropdown behavior; clear scope state presentation.
- [ ] **Phase 3 right pane contract** — consistent AI/inspector side panel behavior (pin/collapse/context).
- [ ] **Phase 3 tab/scope interaction polish** — out-of-scope tab affordances + reveal/switch actions.
- [ ] **Phase 4 decomposition** — split `MainContent.tsx` and remaining dashboard mega-components into domain containers.

**Items (bookmarks)**

- [x] **Bulk import (manual-first) — core path** — Import Studio: preview + **Commit to DB**, dedupe/merge via `normalizeBookmarkUrl`, target collection or project **Unsorted**; batch **`bulkImportBookmarks`** (single `readwrite` transaction + URL index) for large imports.
- [ ] **Bulk import polish** — Persist **cover / image URL** and **import provenance** on `Item.metadata` (not only placement notes); optional **CSV folder path → multiple collections**; commit **progress** + cancel for huge files; surface invalid/skipped rows in UI.
- [ ] **Bookmark enrichment (X-first + generic links)** — Background or explicit action: for **X/Twitter-shaped** bookmarks (and to a lesser degree normal URLs), optionally **fetch** / resolve **threads, quotes, outbound links** to a configurable depth; fill **missing summary**, **keywords**, structured fields for **AI context**—with clear **CORS/host permission**, **rate limits**, **auth walls**, and **fallback when fetch fails** (complex; likely staged: metadata-only → optional fetch).
- [ ] **Multi-collection / share-item UX** if still desired (dashboard backlog “B4”).
- [x] **Pinned / favorites / trash** — **05.B + 05.C:** fields + UX; pin sort-to-top (05.C). Open: 30-day auto-purge, project-scoped quick-access filters (design).

**AI (phased — see Near-term roadmap)**

- [x] **Phase A — Infra foundation**: provider + model + API key UI; key persisted in `chrome.storage.local` (not backup JSON); OpenAI-compatible `fetch` client with timeout/error handling; settings test prompt surface.
- [x] **Phase A — Next hardening**: strict model-id mismatch handling, task-based routing scaffold (`taskType`), and provider expansion beyond OpenRouter adapter (Chrome native added).
- [ ] **Phase A — Follow-up polish**: compatibility checks/UX hints for Chrome native model availability/warmup and lightweight request telemetry.
- [ ] **Phase B — Bookmarks**: current scope-grounded ask flow shipped; next add explicit bookmark selection UX, better source chips/links, and context-size controls per request.
- [ ] **Phase B — Auto-categorization (early AI product task)** — Given large import drops: AI-assisted **clustering** of bookmarks → propose **new collections / project groupings** (or map into existing), with **review/apply** UI and batch limits; prerequisite: stable item text (title + description/notes from imports + optional enrichment above). Good **first** user-visible AI workflow before heavier RAG. **Note:** parallel track below (**AI categories / semantic layer**) defers mapping to manual collections when we want less noise; both can coexist later.
- [x] **Phase B — Fetch enrichment v1:** **Done (Task 01 closed 2026-05-20)** — see [`docs/temp/TASK-01-fetch-enrichment-v1.md`](temp/TASK-01-fetch-enrichment-v1.md) handoff. **Follow-ups remaining:** enrichment **product UX** (replace dev modals), **deep fetch**, tab provider in extension, failure stats/aggregates, t.co unroll, pick-best provider, import enrich hook. **AI prompt tuning completed in Task 01.5 (2026-05-24)**: [`docs/temp/TASK-01.5-ai-extraction-tuning.md`](temp/TASK-01.5-ai-extraction-tuning.md).
- [ ] **Phase C — RAG / embeddings** (later): see **AI — V2** below for concrete scope (chunk store, hybrid retrieval, scale). High-level: move from “doc-level only” to **chunk-level + search** when local perf and backup size stay acceptable.
- [ ] **Phase D — Agentic** (later, gated): chat + tools with session budgets; web search/fetch behind explicit toggles (align with user’s cost concerns).
- [ ] **Security spike (later):** evaluate optional `chrome.identity` / Google OAuth-assisted unlock flow for AI credentials (likely requires backend/key-broker; keep local-first default unless clear value).

**AI — V1 (semantic categorization + retrieval foundation; local-first)**

- [x] **Task 02 V1 shipped (2026-05-25):** Categorization is delivered in app + CLI with DB stores, taxonomy seed/discover, topic-extract classify, and backup integration. **Approach pivot:** now **LLM-first taxonomy/classification** with embeddings as supporting signals (hash/skip, shortlist/ordering), not centroid-only assignment. See [`docs/temp/TASK-02-ai-categorization-v1.md`](temp/TASK-02-ai-categorization-v1.md) and [`docs/temp/TASK-02-app-implementation-plan.md`](temp/TASK-02-app-implementation-plan.md).
- [x] **Data model (parallel semantic layer):** `ai_categories`, `ai_item_category_links`, `ai_item_signals` landed (v6+), linked to `items` by `itemId`; manual `projects`/`collections` remain separate workflow containers.
- [x] **Backup / export:** `exportDB` / `importDB` include AI stores + pipeline counts; raw fetch bodies remain disk-side cache.
- [x] **Pipeline (V1):** `buildItemText` + enrichment signals feed classify/discover loops. V1 default is LLM topic-extract + discover (seed + gap-fill); embeddings remain stored and reused (`textHash` skip logic, signals, optional shortlist modes).
- [x] **Tags after category:** Category-aware signals/tags flow is active in V1; quality polish continues in 02.1.
- [x] **Bootstrap empty library:** Seed taxonomy + discover flow provide immediate category coverage; no k-means-only bootstrap required for normal runs.
- [ ] **Compute UX** → moved to **V2-C** (Web Worker embed/classify batches).
- [ ] **Pluggable interfaces** → moved to **V2-C** (`Embedder`, `Fetcher`, `Retriever`, `Indexer`).
- [x] **V1.1 / Task 03 — Pipeline hardening (done 2026-05-26):** Incremental classify-by-hash, quality gate tiers, retry→`manual_review`, run stats, discover CLI loop, **Enrichment dev hub** (Bookmarks: Results / Enrich / Categories), queue reconcilers, LLM no-topic→`pending_discover`, discover pool includes unassigned. Spec + return: [`docs/temp/TASK-03-v1.1-pipeline-hardening.md`](temp/TASK-03-v1.1-pipeline-hardening.md). **Still open from original 02.1 scope:** accept/reject UX for suggested links, guided in-app workflow, product (non-dev) enrichment UI.
- [x] **V1.5 / Task 04 — Search foundation (done 2026-05-26):** Hybrid lexical + doc-embedding + category retrieval, CLI eval harness, dev Search tab + discovery (similar/related). **Baseline good enough for R&D** — formal weight tuning deferred. Spec + return: [`docs/temp/TASK-04-search-foundation-v1.5.md`](temp/TASK-04-search-foundation-v1.5.md).
- [x] **V1.5 / Doc embedding step (done 2026-05-26, Task 04):** Shared incremental embed queue — `src/lib/enrichment/embedBackfillPlan.ts`, `searchEmbedText.ts`, `embedItemSignal.ts`; app `EmbedBackfillBlock`; CLI `npm run embed-incremental`. Input: enriched items with `aiStatus === 'ok'` and min text length; output: `ai_item_signals.embedding` + `textHash` skip. OpenRouter / `DEFAULT_EMBEDDING_MODEL`. CLI workflow: [`CLI_WORKFLOW.md`](CLI_WORKFLOW.md#doc-embedding-step-shared-pipeline).
- [x] **V1.5 / Task 04 follow-ups** — tracked under **V2-C** (`04-defer-1` … `04-defer-3`); product search UX under **V2-A** (`04-defer-4`). See [`TASK-04`](temp/TASK-04-search-foundation-v1.5.md#master-backlog-handoff-deferred--not-blockers-for-closing-task-04).

## V2 — Product (UX/UI + data model + backend refinement)

**Goal:** Make the app usable daily; expose V1 pipeline without dev-hub complexity. Backend refinement is **V2-C**, not a prerequisite for starting V2-A.

### V2-A — UX / UI (umbrella — **TASK-05**)

**Policy:** **V2 closed** 2026-05-29. **Active:** [`temp/TASK-POST-V2.md`](temp/TASK-POST-V2.md). **Storage shipped:** V2.1 + V2.1.1 + **V2.2** (2026-05-30). **Next:** V2.3 → V3. **Sync:** V4 deferred. Tracker: [`V2-DEFERRED-TRACKER.md`](temp/V2-DEFERRED-TRACKER.md).

| Subtask | Status | Focus |
|---------|--------|--------|
| 05.0 spec | done | [`V2-PRODUCT-DESIGN-SPEC.md`](temp/V2-PRODUCT-DESIGN-SPEC.md) |
| 05.1 shell | done (iter 1) | Home, right panel, toasts |
| 05.2 search | done | W5 |
| **05.3 enrichment UI** | **done** | W1 read paths |
| **05.40 presentation (D-40)** | **done** | List badges, digest copy, Inspector dedupe |
| **05.4 category review** | **done** | Accept/reject; digest queues; AI Categories |
| **05.5 single-link digest** | **done** | Hash-aware digest; side panel |
| **05.6 import/batch** | **done** | Import confirm + report; Home batch |
| **05.7 shell polish** | **done** | Layout, scope chips, Ctrl+W |
| **05.B pins/favs/trash** | **done** | D-01…D-03; v8 schema; live backup on writes |
| **05.C polish bundle** | **done** | Pin sort, classify batch + confirm/progress, Help, hygiene — [`TASK-05.C`](temp/TASK-05.C-v2-polish-bundle.md) |
| 05.8 Advanced gate | **deferred** | Dev hub on Bookmarks toolbar |

Workflow checklist (product, no new schema first):

- [x] **W5 Search** — 05.2
- [x] **W1 Daily library** — 05.3–05.4 + **D-40** presentation; D-41 search clicks optional
- [x] **W6 User signals (MVP)** — accept/reject in Inspector (05.4); Change category / un-accept deferred
- [x] **W7 Shell (Phase 2)** — 05.7; Help shortcuts (05.C); nav auto-collapse on browse **cancelled** (manual chevron only)
- [x] **W2 Single digest** — 05.5 (hash-aware digest, side panel panel, toasts); auth fetch → **D-25**
- [x] **W3 Import post-processing** — 05.6 (opt-in pipeline, confirm panel, report)
- [x] **W4 Batch maintenance** — 05.6 Home **Process not enriched**; **05.C** classify-queue batch, confirm modal, cancel (enrich), progress UI; per-item via 05.5 Inspector. Open: classify mid-batch cancel, unified orchestrator

### V2-B — Data model cleanup

- [x] **Quick access (D-01…D-03)** — **05.B:** pin, favorite, trash on `Item`; see [`TASK-05.B`](temp/TASK-05.B-pins-favorites-trash.md).
- [ ] **Notes strategy (D-04)** — First-class `notes` store vs URL-empty `items`; one UI path; migration/export rules documented.
- [ ] **Schema / import debt (D-05)** — Reconcile backup normalization, multi-collection merge semantics, validation.
- [ ] **AI layer presentation** — Document and UI-label: `projects`/`collections` (manual) vs `ai_categories` (semantic); no forced DAG in V2-B (DAG → V3).
- [ ] **D-35 — Storage & backup** — **V2.1 + V2.1.1 shipped** (single-device). Optional polish: mirror tmp+replace, Settings sync status, `.sqlite` import UI. Umbrella: [`temp/TASK-POST-V2-D35-storage-backup.md`](temp/TASK-POST-V2-D35-storage-backup.md).

### V2-C — V1 backend refinement (after V2-A usable baseline)

- [ ] **Fetch / enrichment improvement** — Coverage, retries, import hook, failure stats (lifts classify + search more than ranker-only work).
- [ ] **Task 04 follow-ups (`04-defer-1` … `04-defer-3`)** — Re-run `search-eval` on embedded corpus; optional ranking mini-task; spot-check doc.
- [ ] **Embed pipeline** — Auto-embed after extract; unify `buildSearchEmbedText` vs `buildItemText`; Web Worker batches (moved from V1 open items).
- [ ] **Pluggable interfaces** — `Embedder`, `Retriever`, `Indexer` stubs when refactoring for product automation.

Brief: [`docs/temp/TASK-05-v2-product-ux.md`](temp/TASK-05-v2-product-ux.md).

---

**AI — V3 (scale & advanced AI; deferred until V2 product baseline)**

- [ ] **V3 boundary:** Chunk retrieval, ANN, concept DAG, cloud embedder offload — **not** required for V2 UX launch.
- [ ] **Embed pipeline — categorization reuse (V3):** Use stored doc vectors for LLM shortlist ordering, nearest-category hints, centroid maintenance, and duplicate-category merge (embedding distance).
- [ ] **Two-stage retrieval:** **Coarse:** doc-level embedding + **lexical index** (e.g. MiniSearch / FlexSearch / Orama-style inverted index in worker) + filters (project, domain, tags, date). **Fine:** for **top-K** items only, load **chunk embeddings** (cap **K×M** chunks per query, e.g. K≈200, M≈8) — compare query to chunks in-memory; neighbors primarily **chunks within same item**, optional small expansion within same AI category.
- [ ] **Chunk storage:** Chunk text + vectors in IndexedDB **or** side store; **lazy** chunking (only after fetch, only for long content, max chunks per URL). Quantization (fp16/int8) if needed for footprint.
- [ ] **Centroid maintenance (V3):** Recompute category centroids when memberships change; prefer **shared doc embeddings**; merge near-duplicate AI categories (embedding distance + user merge).
- [ ] **When IndexedDB + brute-force is not enough (V3):** Add **ANN** (WASM / bundled index) or narrowed candidate sets — avoid full-corpus scan on every keystroke at 10k–100k×chunks.

**AI — Later (optional cloud; minimal custom backend)**

- [ ] **Optional cloud upgrade path:** Same **`Embedder` / `Retriever` / `Indexer`** interfaces with backends that call **hosted embedding + ANN + rerank** APIs (user-supplied API keys first — matches existing LLM pattern). Use for: heavy global semantic search, large batch re-embed, GPU-heavy jobs — **explicit opt-in + budgets + privacy mode** (what text leaves device: snippet-only vs full).
- [ ] **Pay-per-task / ephemeral compute:** If first-party billing or “no user API key” is required, expect a **minimal orchestration endpoint** (short-lived tokens, quotas) — pure browser-to-GPU without any gate is unrealistic for abuse/cost reasons. Document “tiny proxy vs BYO key” tradeoff.
- [ ] **Sync / multi-device (if ever):** Treat cloud index as **optional replica**; local DB remains source of truth unless product explicitly chooses otherwise. **Master design (deferred to V4):** per-device replicas + app merge layer — see **Multi-device sync (master design)** below and [`temp/TASK-V4-sync-replicas.md`](temp/TASK-V4-sync-replicas.md).

- [ ] **V3 — taxonomy data-model upgrade (concept hierarchy / DAG):** Capture discussion decisions explicitly so we do not lose context. **Why deferred:** ship value first with V1 tag/collection suggestions and review/apply UX, then harden taxonomy. **Semantics split:** `projects/collections` remain manual workflow containers; AI taxonomy is a separate semantic layer. **Graph shape:** one **shared** concept DAG for the library (not per-item DAG), concept nodes support multiple parents (`parentIds[]`) for cases like `computer -> coding -> c++` while still allowing cross-branch links. **Candidate schema:** `ConceptNode { id, name, slug, parentIds[], synonyms[]?, createdBy }`, plus item↔concept links with `{ source: manual|ai, confidence, status: suggested|accepted|rejected, timestamps }`. **Rules:** prevent cycles on writes, keep aliases/synonyms mapped to canonical concepts, never auto-delete manual mappings during recategorization. **Migration path from V1:** keep existing `tags` and project/collection mappings; add a staged migration that maps stable/high-frequency tags to concepts and preserves provenance for rollback/audit. **Entry points after V2 exists:** optional post-import categorization, subset categorization (selected links / collection / project), and batched global recategorization.

**Workspaces / tabs**

- [ ] Optional: tighter linking from Tab Commander / workspaces to **projects** (beyond optional `workspace.projectId`).

---

## 🟢 Engineering hygiene

- [ ] **Loading states** for `loadData`, long imports (commit progress / chunked UI), workspace restore.
- [ ] **Listener cleanup audit** (`useEffect` + Chrome listeners) on hot paths.
- [ ] **Split large components** incrementally (`MainContent.tsx`, layout/tab files)—only when touching those areas.
- [ ] **Types**: tighten migration/`any` in `db.ts`; legacy shape types if useful.
- [ ] **A11y**: keyboard nav and labels where cheap wins exist.
- [ ] **Tests** (when worth it): Vitest + RTL; start with `db` helpers and pure utils.

**Docs consistency checklist (lightweight, per shipped slice)**

- [x] If roadmap/status changed, update `docs/OVERVIEW.md` (“What’s working”, “Gaps”, and last-updated line).
- [x] If product narrative or phase status changed, update `docs/workbench_agent.prd`.
- [x] Add/remove matching item in backlog sections (`✅ Done` and relevant active section) to avoid drift.

---

## ⏸ Deferred / polish

### Multi-device sync — master design (deferred → **V4**)

**Status:** Direction locked **2026-05-29**; **not part of V3** (pipeline); scheduled as **V4** when multi-device is needed. Full brief: [`temp/TASK-V4-sync-replicas.md`](temp/TASK-V4-sync-replicas.md). Umbrella: [`temp/TASK-POST-V2-D35-storage-backup.md`](temp/TASK-POST-V2-D35-storage-backup.md).

**Problem:** Two machines must not both write one shared `workbench.sqlite` (Dropbox/iCloud/Turso) — SQLite is not a multi-writer sync file.

**Approach (when we ever need it):**

| Layer | Rule |
|-------|------|
| **Live truth (each device)** | OPFS in single DB worker — same as V2.1.1 |
| **Portable replica (each device)** | One snapshot per `deviceId`, not one shared live DB |
| **Shared backend** | Transport only — sync folder, Dropbox API, Turso blobs, HTTP BYO |
| **Sync layer (app)** | Read all device replicas → merge (single-user, few devices) → import into local OPFS → each device writes **only its** replica again |
| **Not doing** | One shared cloud SQL DB all clients write to live |

**Target sync-root layout:**

```text
{sync-root}/devices/{deviceId}/workbench.sqlite
{sync-root}/devices/{deviceId}/workbench.meta.json
{sync-root}/devices/{deviceId}/enrichment-cache/…   # policy TBD
```

**Backends (same model for all):** Dropbox/iCloud folder, Dropbox API, Turso as blob store, HTTP BYO, future mobile app — per-device subfolders; merge in app, not OS “conflicted copy” semantics.

**Hooks already shipped:** `deviceId`, `revision`, `workbench.meta.json`, `backupCoordinator` conflict kinds, worker `forceImportFromFolderBytes`.

**V3/V4 scope:** Stay single-device; use folder mirror + manual export. Revisit multi-device only when product explicitly needs laptop + phone (etc.).

---

- **Chrome new-tab chrome**: Persistent footer / browser chrome on extension new-tab override is not fixable in-repo; future option: hosted dashboard (`https://`) + extension bridge if “chrome-free” full-page is required.
- Animations, responsive polish, heavy styling refactors.
- Relationship graphs (notes ↔ bookmarks ↔ projects).
- **`HttpBackupSink` / BYO server** — same coordinator + JSON payload; optional auth — after file‑based backup ships (see [`DATA_BACKUP_AND_INTEGRITY.md`](DATA_BACKUP_AND_INTEGRITY.md)).
- **⏸ D-45 — Local folder library (tracked):** Scan a folder tree (PDFs/papers/books) → preview map → import as `file://` bookmarks + optional batch digest (Import Studio or new tab). **Foundation shipped:** single-file `file://` save + tab digest (D10, 2026-05-28). **Not shipped:** directory picker, recursive scan, folder→collection mapping, PDF full-text (`pdf.js`). Brief: [`docs/temp/TASK-V2C-D45-local-folder-library.md`](temp/TASK-V2C-D45-local-folder-library.md). Tracker: [`V2-DEFERRED-TRACKER.md`](temp/V2-DEFERRED-TRACKER.md) Tier D.
- Chrome Web Store / multi-browser—out of scope until explicitly chosen.

---

## Suggested order (adjust freely)

**Active product thread:** **V2.2 ✅** → **V2.3** quick wins → **V3** pipeline (main) → **V4** sync. Roadmap: [`temp/TASK-V2-POST-ROADMAP.md`](temp/TASK-V2-POST-ROADMAP.md).

**Post-V2 (active):** [`temp/TASK-POST-V2.md`](temp/TASK-POST-V2.md)

1. **V2.3** — quick wins ([`temp/TASK-V2.3-quick-wins.md`](temp/TASK-V2.3-quick-wins.md)).
2. **V3** — pipeline: discover map→reduce shipped; dogfood reliability (chunked worker sync, Hub bulk Run steps); next staging workflow + import scale.
3. **V4** — multi-device sync ([`temp/TASK-V4-sync-replicas.md`](temp/TASK-V4-sync-replicas.md)) — deferred.
4. **D-45** local folder library — when ready.
5. Notes strategy (D-04) + import provenance (D-05).
6. Optional: D10.4b headless — not a V2 gate.
7. Scheduled backup rotation (D-36 / V2.2 slice D) — [`temp/TASK-V2.2-storage-polish.md`](temp/TASK-V2.2-storage-polish.md).
8. Collection detach/share UI if multi-project workflows matter.

**Adjacent UX (no task id):** Help v1, Home vertical split (shipped with 05.B session — optional polish later).

---

*Last updated: 2026-06-04 — V3 dogfood fixes shipped (chunked DB sync, Hub bulk UX). V4 multi-device still deferred.*
