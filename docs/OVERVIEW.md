# Workbench Agent — Overview

Living summary of goals, architecture, and status. **Detailed history** lives in `docs/old/`; **product narrative** in [`workbench_agent.prd`](workbench_agent.prd) (refresh that file when the model below diverges).

---

## Vision

Chrome extension (same React app as **side panel** + **full-page dashboard**) to organize **tabs**, **bookmarks**, **workspace snapshots**, and **notes**, with an **AI layer**—local-first for data; **optional cloud AI** via user-supplied API keys (no required server).

### Expanded direction (brainstorm reconciled here)

Today the app delivers **projects ↔ collections ↔ items**, **Tab Commander**, **workspaces**, **IndexedDB backup + file sync guards**, and a **bookmark-centric side panel**. Longer-term direction (polish UI after capabilities land):

| Theme | Direction |
|-------|-----------|
| **Bookmarks & sources** | Scale beyond one-off adds: **manual bulk import** (e.g. Netscape/HTML export, structured files) first; optional later **guided capture from a tab** (“harvest links on this page”) and per-site helpers—not a prerequisite for AI. |
| **Search / RAG** | **Hybrid is the default**: retrieval and storage local; embeddings can be API or **browser-side** later (tradeoffs on quality/size). Turns the corpus into a **personal searchable library** grounded in bookmarks. |
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
3. **AI on bookmarks** — Use infra to **ground** answers in selected bookmarks / library excerpts (titles, notes, optional fetched snippets later); citations visible to the user.
4. **Later (order TBD)** — Embeddings + vector RAG; optional in-browser embeddings; site capture importers; deeper agentic tools; workspace/study-path features; per-page content script or richer URL-keyed panels.

Details and checkboxes live in [`backlog.md`](backlog.md).

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
├── Background: `public/service-worker.js` (side panel per-tab on action click, tab-focus helpers)
├── Storage: IndexedDB `personal-tools-db` **v3** (`src/lib/db.ts`)
├── Entry: `index.html` — narrow width ≈ side panel; wide ≈ dashboard
└── New tab: `chrome_url_overrides.newtab` → same `index.html` (see limitation below)
```

**Dual UI**

- **Side panel**: bookmark-centric save flow (URL/title prefill from active tab; optional notes; project/collection pickers with inline create); “already saved” list with edit / remove copy / add new copy; duplicate prevention for same URL in the same collection; **Open Dashboard** and **Set Workbench as Home** (opens Chrome settings + copies extension dashboard URL). No backup UI in the panel (full dashboard only).
- **Dashboard**: single left nav — Home (placeholder), Projects, Bookmarks, Workspaces, Notes, Collections, **Tab Commander**, **Settings** (no separate footer strip).

**Stores (conceptual)** — see `src/lib/db.ts` for truth:

- `projects`, `collections`, `items` (bookmarks), `notes` (schema exists), `workspaces`, `snapshots`.

---

## What’s working (high level)

- Tab Commander: full-page live tab manager with multi-window actions, drag/move, list/gallery patterns, macOS Spaces mitigations (“Open Here”, find window).
- Bookmarks: items with `collectionIds[]`, tags, notes-on-bookmark, CRUD, search in project workspace, and top-level add dialog with inline project/collection creation.
- Projects + collections: hierarchy, default project, virtual “all projects” view.
- Top-level CRUD: create project, create collection, and create bookmark/note from dashboard modals (not only from project workspace).
- Notes/Bookmarks separation: both use the same `items` store, but UI classification is now exclusive — bookmarks require URL, notes are URL-empty items.
- Workspaces: save/restore session snapshots; optional `projectId` on workspace.
- Workspace save flow: Tab Commander save dialog supports selecting a project (or Detached) for new workspace snapshots.
- Side panel: tab-specific enablement (extension icon opens panel only for that tab); opening full-page dashboard disables the side panel on the **dashboard tab only**.
- Data safety: export/import, backup verification, debounced live backup to `latest.json`, manual named backups, envelope metadata (`revision` + `deviceId`), and startup conflict pause/resolution flow.
- AI infra baseline: pluggable client layer (`src/lib/ai`) with OpenRouter-compatible chat adapter plus optional Chrome native/on-device provider path, persisted AI Settings (provider/model/base URL/API key), timeout + error handling, strict model-match toggle, and Settings test prompt with provider-returned model display.
- Bookmark-grounded AI starter: Bookmarks view supports “Ask AI” over current filtered bookmark scope, with grounded context assembly and visible source refs (`[B1]`, `[B2]`, ...).
- Import Studio (preview): Bookmarks → Import — **file** (Netscape HTML, CSV, JSON), **Chrome bookmarks API** (`getTree`), preview table + stats; Raindrop-style CSV columns (`folder`/`collection`, **`cover`** image URL, `source` aliases). **No DB commit yet.** AI tab still mock only.

---

## Chrome / New Tab limitation (accepted)

When Workbench overrides the **New Tab Page** (`chrome_url_overrides.newtab`), Chrome may show a persistent **extension footer / chrome UI** on that page. Workarounds such as a minimal “bouncer” page were tried and **removed** (no UX benefit, extra complexity). Hiding that bar is not reliably achievable inside MV3 for extension-hosted pages. If a Toby-style chrome-free full-screen experience is required later, the realistic path is a **hosted web dashboard** (normal `https://` tab) talking to the extension via messaging—not another HTML filename in the extension package.

---

## Gaps & intentional placeholders

| Area | Status |
|------|--------|
| **AI Agent** | Infra baseline + first bookmark-grounded ask flow shipped. Next: explicit selection UX, richer citations, then broader RAG/embeddings later. |
| **Notes (first-class)** | `notes` store exists and is exported; **UI largely treats “notes” as items** (bookmark `notes` / empty URL). Align UI with `notes` store or simplify docs—decision pending. |
| **Quick access** | Recent items works; pinned / favorites / trash mostly placeholders (needs fields + UX). |
| **Sharing** | Model supports `collection.projectIds[]`; **detach/share UI** not fully built. |
| **Optional sync** | Initial file-based sync guard is implemented (envelope + conflict pause + resolve actions). Full scheduled rotation, runtime re-check while app stays open, and merge workflows are still pending. |
| **Bulk bookmark import** | Ingestion + preview done in Import Studio; **commit to DB** (with cover + import metadata) is the next slice. |

---

## Related docs

| Doc | Use |
|-----|-----|
| [`backlog.md`](backlog.md) | Prioritized work items (maintain this). |
| [`DATA_BACKUP_AND_INTEGRITY.md`](DATA_BACKUP_AND_INTEGRITY.md) | Backup / integrity design (file‑based now; swappable sinks later). |
| [`workbench_agent.prd`](workbench_agent.prd) | Full PRD; update when roadmap shifts. |
| `docs/old/` | Archived checkpoints (backlogs, UI plans, status snapshots). |

---

*Last updated: 2026-05-06 (session wrap-up) — Import Studio preview (file + Chrome API + Raindrop-ish CSV) documented; DB import commit still open.*
