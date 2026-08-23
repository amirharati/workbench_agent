# Homebase — Overview

> **Rename (V3):** Product name is **Homebase** (formerly Tab Manager / Workbench Agent). On-disk filenames such as `workbench.sqlite` are unchanged for compatibility. Historical notes in `docs/old/` may still say Workbench.

Living summary of goals, architecture, and status. **Detailed history** lives in `docs/old/`; **product narrative** in [`workbench_agent.prd`](workbench_agent.prd) (refresh that file when the model below diverges).

> **Current release focus (2026-08-08):** close product V3 through real-use testing,
> single-device data-safety/recovery verification, and UX stabilization. The managed
> checklist and issue ledger is [`V3_RELEASE_ISSUES.md`](V3_RELEASE_ISSUES.md). After
> signoff, work returns to small feature-by-feature tickets. Historical references to
> “AI V3” scale work are post-release ideas, not this release gate.

---

## Vision

Chrome extension (same React app as **side panel** + **full-page dashboard**) to organize **tabs**, **bookmarks**, **workspace snapshots**, and **notes**, with an **AI layer**—local-first for data; **optional cloud AI** via user-supplied API keys (no required server).

### Expanded direction (brainstorm reconciled here)

Today the app delivers **projects ↔ collections ↔ items**, **Tab Commander**, **workspaces**, **IndexedDB backup + file sync guards**, and a **bookmark-centric side panel**. Longer-term direction (polish UI after capabilities land):

| Theme | Direction |
|-------|-----------|
| **Bookmarks & sources** | Scale beyond one-off adds: **manual bulk import** (e.g. Netscape/HTML export, structured files) first; optional later **guided capture from a tab** (“harvest links on this page”) and per-site helpers—not a prerequisite for AI. |
| **Search / categories / RAG** | **Hybrid is the default**: parsed exact rules stay deterministic, while query embeddings rank matches and surface separately labelled related material against worker-owned document vectors. Topical categories have persisted worker-owned semantic profiles that blend taxonomy text with reliable member-vector centroids; pipeline quality/attention labels are explicitly excluded. Search suggests categories and tags as exact Search-local tabs, preserves the originating query for back-and-forth review, and uses query-to-category confidence to rank linked Related results. Home also provides a dedicated topical-category browser, scoped to All Library or the current project, with multi-select OR browsing. Retrieval/storage remain local; query/category-text embedding uses optional key-backed AI and visibly falls back to text. |
| **Agentic research** | Separate from always-on search: **user-triggered**, budgeted flows (simple chat + optional tools)—not silent crawling. Cost and scope stay explicit in settings. |
| **Workspaces + tabs + AI** | Summaries, naming, clustering open tabs/workspaces onto projects—additive metadata and assists, building on existing workspace model. |
| **Planning & study paths** | Ordered views / “playlists” over items plus AI-drafted outlines; human edits—comes after robust bookmark corpus + basic chat. |
| **Per-page memory** | Notes and AI overlays **keyed to URL** (and later **same-site / hierarchy**) so revisits reload context—builds on items + normalized URL patterns already in use. |

Nothing above requires abandoning **local-first** or **CLIENT AI** assumptions in the backlog: hosted models are optional and key-backed.

---

## Near-term roadmap (agreed sequencing)

Order is deliberate: **infra before features**, **bookmark volume before retrieval**.

1. **AI infrastructure** — Wire **cloud LLM APIs** first (provider + model + API key in settings; client module; errors/timeouts). Minimal UX (e.g. Settings section + slim **chat or “test prompt” surface**). *No embeddings/RAG required for this milestone.*
2. **Bookmarks at scale (manual-first)** — **Bulk / manual import** and dedupe against existing `normalizeBookmarkUrl` rules; improve organization UX as library grows.
3. **AI on bookmarks** — Use infra to **ground** answers in selected bookmarks / library excerpts (titles, notes, optional fetched snippets later); citations visible to the user. **Search dev baseline (Task 04)** exists in Enrichment dev hub; product search UX later.
4. **V2 (active)** — **UX/UI + data model cleanup first**, then V1 backend refinement (fetch, tuning, automation). See [`BACKLOG.md`](BACKLOG.md) V2-A/B/C. (Detailed task briefs: local `docs/temp/`, not in git.)
5. **V3 (deferred)** — Chunk RAG, ANN, concept DAG, cloud embedder; optional in-browser embeddings; deeper agentic tools.

Details and checkboxes live in [`BACKLOG.md`](BACKLOG.md).

---

## Principles

| Principle | Meaning |
|-----------|---------|
| Personal tool first | Optimize for your workflow, not a generic launch. |
| Local-first | IndexedDB is source of truth; JSON export/import + folder backup for portability. |
| Client-only AI (future) | API keys and calls from the extension; optional sync later (e.g. Dropbox). |
| Simple over clever | Ship usable flows; polish and split large files incrementally. |

---

## Architecture (snapshot)

```
Chrome MV3 extension
├── UI: React + TypeScript + Vite (`src/`)
├── Background: `public/service-worker.js` (lazy contextual side-panel visibility, tab-focus helpers)
├── Storage: IndexedDB `personal-tools-db` **v4** (`src/lib/db.ts`; placements + canonical URL dedup; see [`DATA_MODEL_DEDUP.md`](DATA_MODEL_DEDUP.md))
├── Entry: `index.html` — narrow width ≈ side panel; wide ≈ dashboard
└── New tab: `chrome_url_overrides.newtab` → same `index.html` (see limitation below)
```

**Dual UI**

- **Side panel**: bookmark-centric save flow (URL/title prefill from its owning browser tab; optional notes; project/collection pickers with inline create); “already saved” list with edit / remove copy / **add new copy** (placement-aware notes); duplicate prevention for the same URL in the same collection; **Open Dashboard** and **Set Homebase as Home**. Panels are lazy contextual presentation instances over the same shared database/pipeline system. The first explicit toolbar click on a normal page configures/opens only eligible tabs already present in that window; later tabs remain untouched until explicitly opened; native close changes only that tab’s visibility and does not remove cohort membership or stop processing. Dashboard tabs and `chrome://extensions` never join the cohort; clicking the toolbar action on extension management opens or focuses the dashboard instead. Install/startup/reload perform no native panel configuration, open, or close calls. No backup UI appears in the panel (full dashboard only). Mutations sync with the dashboard via **`BroadcastChannel`** and focus/visibility refresh patterns.
- **Dashboard**: IDE-style **three-region shell** — left navigation (**project dropdown**, collections for selected project, **Content** vs **Tools**); a shared active Homebase workspace in the middle; and a persistent **right assistant** panel. Homebase has one Global workspace, one automatic General workspace per project, and project-owned named workspaces. Internal work is presented as workspace entries, not tabs. Browser-window snapshots and live Chrome tabs remain separate. See [`PROJECT_SESSIONS_AND_WORKSPACES.md`](PROJECT_SESSIONS_AND_WORKSPACES.md).

**Stores (conceptual)** — see `src/lib/db.ts` for truth:

- `projects`, `collections`, `items` (bookmarks; **v4** merges by normalized URL + **`placements`** for per-collection fields), `notes` (schema exists), `workspaces`, `snapshots`.

---

## What’s working (high level)

- Tab Commander: full-page live tab manager with multi-window actions, drag/move, list/gallery patterns, macOS Spaces mitigations (“Open Here”, find window).
- Bookmarks: items with `collectionIds[]`, tags, notes-on-bookmark, CRUD, search in project workspace, and top-level add dialog with inline project/collection creation.
- Projects + collections: hierarchy, default project, virtual “all projects” view.
- Top-level CRUD: create project, create collection, and create bookmark/note from dashboard modals (not only from project workspace).
- Notes/Bookmarks separation: both use the same `items` store, but UI classification is now exclusive — bookmarks require URL, notes are URL-empty items.
- Homebase workspaces: one shared Global workspace, one automatic General workspace for every project, project-owned named workspaces, and one explicit app-level active workspace. Project/page navigation does not silently switch it.
- Browser snapshots: Tab Commander can capture Chrome windows and tabs with optional project metadata; snapshots are separate from Homebase workspaces and can explicitly seed one.
- **Dashboard shell (workspace-model checkpoint)**: Left navigation remains project/collection scoped, while open work belongs to the active Homebase workspace. Entry rows/lists use explicit Add, Open, Move, Copy, and Remove workspace actions; no internal tab UI remains on the active path.
- **Data model (v4)**: Items merge on **normalized URL**; **`placements`** hold per-collection metadata (notes/tags); removing from one collection vs deleting the item is explicit in UI—see [`DATA_MODEL_DEDUP.md`](DATA_MODEL_DEDUP.md).
- Data safety: export/import, backup verification, debounced live backup to `latest.json`, manual named backups, envelope metadata (`revision` + `deviceId`), and startup conflict pause/resolution flow.
- AI infra baseline: pluggable client layer (`src/lib/ai`) with OpenRouter-compatible chat adapter plus optional Chrome native/on-device provider path, persisted AI Settings (provider/model/base URL/API key), timeout + error handling, strict model-match toggle, and Settings test prompt with provider-returned model display.
- Bookmark-grounded AI starter: Bookmarks view supports “Ask AI” over current filtered bookmark scope, with grounded context assembly and visible source refs (`[B1]`, `[B2]`, ...).
- Import Studio: Bookmarks → Import — **file** (Netscape HTML, CSV, JSON; content-based **auto-detect**; `.js`/`.txt` JSON-like payloads), **X bookmarks export** adapter, **Chrome bookmarks API** (`getTree`), preview + stats, optional project/collection target, **`Commit to DB`** with dedupe/merge (`bulkImportBookmarks`, batch IndexedDB transaction). Import Studio **AI tab** still mock only. **Follow-ups:** cover/provenance on `metadata`, folder→collection mapping, very-large-library scale (see [`BACKLOG.md`](BACKLOG.md)).
- Fetch enrichment service (Task 01): `src/lib/enrichment` shipped with hybrid provider routing (X/video/article), `item_enrichment` IndexedDB store, disk raw cache (`rawRef`), and `buildItemText()` contract for downstream AI categorization.
- AI extraction tuning (Task 01.5): sourceKind-aware prompts (`v2`/`v2.1`), CLI eval harness (`npm run fetch-ai-eval`) on saved corpus, AI-only rerun path (`reextractAI`), and richer extraction fields (`summary`, `keyPoints`, `improvedTitle`, `tags`) validated in-app.
- AI categorization V1 (Task 02): app + CLI pipeline ships a clean broad scaffold of 23 topical parents, 90 durable starter leaves, one generated General leaf per parent, and a separate non-topical Link-quality branch. Discover extends children and may add genuinely missing parents before topic-extract classification. AI stores (`ai_categories`, `ai_item_category_links`, `ai_item_signals`) and backup/export integration are included. Current runtime uses **LLM-first** assignment with embeddings as supporting signals.
- AI pipeline hardening V1.1 (Task 03): incremental classify-by-hash, quality gate tiers, run stats, discover CLI loop, **Enrichment dev hub** (Bookmarks toolbar: Results / Enrich / Categories), queue reconcilers, `pending_discover` for no-topic outcomes.
- Hybrid search foundation V1.5 (Task 04): `src/lib/search/` — lexical + doc-embedding + category expansion; CLI eval; dev `SearchDevPanel` for R&D.
- **Doc embedding step (Task 04):** `embedBackfillPlan` + `embed-incremental` CLI; vectors in `ai_item_signals`.
- **V2 product UX (Task 05):** **V2 closed 2026-05-29**. **Active:** V2.3 → **V3 pipeline** — discover map→reduce shipped; large-library staged hydrate + Hub worker paging; next staging workflow + import scale. See [`BACKLOG.md`](BACKLOG.md).

---

## Chrome / New Tab limitation (accepted)

When Homebase overrides the **New Tab Page** (`chrome_url_overrides.newtab`), Chrome may show a persistent **extension footer / chrome UI** on that page. Workarounds such as a minimal “bouncer” page were tried and **removed** (no UX benefit, extra complexity). Hiding that bar is not reliably achievable inside MV3 for extension-hosted pages. If a Toby-style chrome-free full-screen experience is required later, the realistic path is a **hosted web dashboard** (normal `https://` tab) talking to the extension via messaging—not another HTML filename in the extension package.

---

## Gaps & intentional placeholders

| Area | Status |
|------|--------|
| **AI Agent** | Infra baseline + first bookmark-grounded ask flow shipped. Next: explicit selection UX, richer citations, then broader RAG/embeddings later. |
| **V2 — Product** | ✅ **Closed** 2026-05-29. **Active:** V3 pipeline — discover algo mostly done; staged hydrate + Hub SQL paging for large libraries; staging workflow + import waves next — [`BACKLOG.md`](BACKLOG.md). |
| **AI Categorization (V1)** | Backend shipped. Product: browse taxonomy (Tools), accept/reject suggestions (Inspector), digest queues (Home). |
| **Search / Categories** | Product parsed hybrid search shipped: default AND, exact phrases, OR/AND/`+`, exclusions, `site:`, composable exact `tag:` / `category:` membership fields, scoped negative organization filters, worker-owned bookmark and topical category-profile ranking, Search-local category/tag tabs, related semantic/category results, and visible text fallback. Category/tag tabs initialize that same editable query syntax rather than holding hidden constraints. Home Categories provides an All Library or per-project hierarchical browse page with persistent multi-select OR results. Pipeline-quality labels never participate as topics. Dev score breakdown remains in `SearchDevPanel`. |
| **Enrichment / fetch** | **D-10 shipped:** headless hardening, X threads, tab-session + `file://` single-file. **D-45 tracked:** bulk folder scan for local PDFs/papers (not implemented). |
| **Notes (first-class)** | `notes` store exists and is exported; **UI largely treats “notes” as items** (bookmark `notes` / empty URL). Align UI with `notes` store or simplify docs—decision pending. |
| **Quick access** | **Shipped (05.B + 05.C):** pin/fav/trash; pin sort-to-top; batch classify from Home. Open: 30-day purge, per-project quick-access filters. |
| **Sharing** | Model supports `collection.projectIds[]`; **detach/share UI** not fully built. |
| **Storage / backup** | **Shipped:** SQLite WASM + OPFS worker + atomic folder mirror + Settings restore (V2.1–V2.2); two-phase folder selection lists recognized files before persistence and ends with an explicit setup receipt. **Next:** V2.3 polish. **Later:** multi-device (**V4**), D-36 rotation — [`BACKLOG.md`](BACKLOG.md). |
| **Bulk bookmark import** | **Commit path shipped** (batch merge/dedupe). **Next:** import polish (**D-38**), **local folder library (D-45)**, provenance (**D-05**), scale/backup (**D-35**). |

---

## Related docs

| Doc | Use |
|-----|-----|
| [`BACKLOG.md`](BACKLOG.md) | Prioritized work items (maintain this). |
| [`CLI_WORKFLOW.md`](CLI_WORKFLOW.md) | Parallel CLI R&D workflow (step-by-step) across Tasks 01–04; search CLI shares `src/lib/search/*` with app. |
| [`DATA_BACKUP_AND_INTEGRITY.md`](DATA_BACKUP_AND_INTEGRITY.md) | Backup / integrity design (file‑based now; swappable sinks later). |
| [`workbench_agent.prd`](workbench_agent.prd) | Full PRD; update when roadmap shifts. |
| `docs/old/` | Archived checkpoints (backlogs, UI plans, status snapshots). |

---

*Last updated: 2026-06-04 — V3 large-library load (staged hydrate, Hub worker paging). Session planning is local-only (gitignored).*
