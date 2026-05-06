# Workbench Agent — Overview

Living summary of goals, architecture, and status. **Detailed history** lives in `docs/old/`; **product narrative** in [`workbench_agent.prd`](workbench_agent.prd) (refresh that file when the model below diverges).

---

## Vision

Chrome extension (same React app as **side panel** + **full-page dashboard**) to organize **tabs**, **bookmarks**, **workspace snapshots**, and eventually **notes** and an **AI assistant**—local-first, no required server.

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

---

## Chrome / New Tab limitation (accepted)

When Workbench overrides the **New Tab Page** (`chrome_url_overrides.newtab`), Chrome may show a persistent **extension footer / chrome UI** on that page. Workarounds such as a minimal “bouncer” page were tried and **removed** (no UX benefit, extra complexity). Hiding that bar is not reliably achievable inside MV3 for extension-hosted pages. If a Toby-style chrome-free full-screen experience is required later, the realistic path is a **hosted web dashboard** (normal `https://` tab) talking to the extension via messaging—not another HTML filename in the extension package.

---

## Gaps & intentional placeholders

| Area | Status |
|------|--------|
| **AI Agent** | UI placeholder only; no context pipeline or API wiring yet. |
| **Notes (first-class)** | `notes` store exists and is exported; **UI largely treats “notes” as items** (bookmark `notes` / empty URL). Align UI with `notes` store or simplify docs—decision pending. |
| **Quick access** | Recent items works; pinned / favorites / trash mostly placeholders (needs fields + UX). |
| **Sharing** | Model supports `collection.projectIds[]`; **detach/share UI** not fully built. |
| **Optional sync** | Initial file-based sync guard is implemented (envelope + conflict pause + resolve actions). Full scheduled rotation, runtime re-check while app stays open, and merge workflows are still pending. |

---

## Related docs

| Doc | Use |
|-----|-----|
| [`backlog.md`](backlog.md) | Prioritized work items (maintain this). |
| [`DATA_BACKUP_AND_INTEGRITY.md`](DATA_BACKUP_AND_INTEGRITY.md) | Backup / integrity design (file‑based now; swappable sinks later). |
| [`workbench_agent.prd`](workbench_agent.prd) | Full PRD; update when roadmap shifts. |
| `docs/old/` | Archived checkpoints (backlogs, UI plans, status snapshots). |

---

*Last updated: 2026-05-05*
