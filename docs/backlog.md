# Workbench Agent — Backlog

Condensed from `docs/old/` (`backlog.md`, `dashboard_backlog*.md`, `STATUS_REVIEW.md`, `CURRENT_STATE.md`, etc.). **Edit this file** as priorities change; keep `docs/old/` as read-only history.

**Maintenance:** When something ships, add a **one-line** bullet under **✅ Done** (and remove or check off the matching item below). Trim **Done** only if it grows unwieldy—optional archive line can point to `docs/old/` or a git tag.

**Legend:** 🔴 urgent quality / risk · 🟡 UX or features · 🟢 maintenance · ⏸ deferred / needs design

---

## Near-term roadmap (agreed with [`OVERVIEW.md`](OVERVIEW.md))

1. **🟡 AI infra (cloud first)** — Settings for provider/API key/model; secure persistence (`chrome.storage.local` pattern); thin HTTP client for chat/completions (OpenAI-compatible baseline); minimal UI smoke surface; no embeddings/RAG milestone requirement yet.
2. **🟡 Bookmarks manual-at-scale** — **Import commit + batch path shipped** (see Done). Next: **scale/backup posture** for huge libraries, **import polish** (cover/provenance/folder→collection), then **AI-assisted organization** (cluster → collections/projects) and **enrichment** (especially X-shaped links).
3. **🟡 AI + bookmarks** — Ground prompts over user’s bookmark set (titles, notes, snippets); cite source items; lightweight assists (summaries, tags) before heavier RAG; **auto-categorization** as an early high-leverage slice (see Items / AI backlog).
4. **⏸ Order TBD** — Local or API embeddings; vector index; guided tab capture agents; workspaces+AI; study-path entities; content scripts per-page.

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

---

## 🔴 Reliability & data

- [ ] **Error handling**: consistent try/catch on async paths (`App.tsx`, dashboard handlers, Chrome APIs); user-visible errors vs silent `console.error`.
- [ ] **DB transactions**: multi-step deletes (`deleteCollection`, `deleteProject`, bulk moves) reviewed for atomicity in `db.ts`.
- [ ] **Input validation**: URLs, IDs, text limits; centralize validation helpers (extend existing `src/lib/utils.ts` patterns as needed).
- [ ] **Very large bookmark libraries (scale spike)** — With current **full JSON backup/export** + in-memory item maps on bulk paths: assess limits (memory, UI list perf, backup time/size) for **5k–50k+** bookmarks; decide if we need **chunked export**, **paged reads**, **lazy list virtualization**, or **separate blob store** for heavy fields—vs keeping “good enough” for personal-scale only. Ties to backup coordinator and `db.ts` read patterns.

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
- [ ] **Pinned / favorites / trash**: add fields (`pinned`, `favorite`, `deletedAt` or equivalent), wire Quick Access tabs.

**AI (phased — see Near-term roadmap)**

- [x] **Phase A — Infra foundation**: provider + model + API key UI; key persisted in `chrome.storage.local` (not backup JSON); OpenAI-compatible `fetch` client with timeout/error handling; settings test prompt surface.
- [x] **Phase A — Next hardening**: strict model-id mismatch handling, task-based routing scaffold (`taskType`), and provider expansion beyond OpenRouter adapter (Chrome native added).
- [ ] **Phase A — Follow-up polish**: compatibility checks/UX hints for Chrome native model availability/warmup and lightweight request telemetry.
- [ ] **Phase B — Bookmarks**: current scope-grounded ask flow shipped; next add explicit bookmark selection UX, better source chips/links, and context-size controls per request.
- [ ] **Phase B — Auto-categorization (early AI product task)** — Given large import drops: AI-assisted **clustering** of bookmarks → propose **new collections / project groupings** (or map into existing), with **review/apply** UI and batch limits; prerequisite: stable item text (title + description/notes from imports + optional enrichment above). Good **first** user-visible AI workflow before heavier RAG.
- [ ] **Phase C — RAG / embeddings** (later): chunk store, vector or API embeddings, hybrid retrieval; optional **in-browser** embedding path (Transformers.js-class) as alternative to API.
- [ ] **Phase D — Agentic** (later, gated): chat + tools with session budgets; web search/fetch behind explicit toggles (align with user’s cost concerns).
- [ ] **Security spike (later):** evaluate optional `chrome.identity` / Google OAuth-assisted unlock flow for AI credentials (likely requires backend/key-broker; keep local-first default unless clear value).

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

- **Chrome new-tab chrome**: Persistent footer / browser chrome on extension new-tab override is not fixable in-repo; future option: hosted dashboard (`https://`) + extension bridge if “chrome-free” full-page is required.
- Animations, responsive polish, heavy styling refactors.
- Relationship graphs (notes ↔ bookmarks ↔ projects).
- **`HttpBackupSink` / BYO server** — same coordinator + JSON payload; optional auth — after file‑based backup ships (see [`DATA_BACKUP_AND_INTEGRITY.md`](DATA_BACKUP_AND_INTEGRITY.md)).
- Chrome Web Store / multi-browser—out of scope until explicitly chosen.

---

## Suggested order (adjust freely)

**Active product thread:** Near-term roadmap above (AI infra → **bulk import polish + scale assessment** → **auto-categorization** / enrichment → broader AI on bookmarks).

**Parallel / hygiene (pick as needed):**

1. Automated file backup — **scheduled `chrome.alarms` + rotation** when integrity work cycles back.
2. Error handling + validation (trust on import + AI paths).
3. Notes strategy + one implementation path (feeds AI context later).
4. Quick access (pinned / favorites / trash) if daily-use value is high.
5. Collection detach/share UI if multi-project workflows matter.

---

*Last updated: 2026-05-10 — Import Studio: **X adapter**, content **auto-detect**, **Commit to DB**, **`bulkImportBookmarks`** batch perf; backlog adds **scale/backup** spike, **bookmark enrichment** (X + fetch), and **AI auto-categorization**.*
