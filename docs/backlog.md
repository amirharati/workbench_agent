# Workbench Agent — Backlog

Condensed from `docs/old/` (`backlog.md`, `dashboard_backlog*.md`, `STATUS_REVIEW.md`, `CURRENT_STATE.md`, etc.). **Edit this file** as priorities change; keep `docs/old/` as read-only history.

**Maintenance:** When something ships, add a **one-line** bullet under **✅ Done** (and remove or check off the matching item below). Trim **Done** only if it grows unwieldy—optional archive line can point to `docs/old/` or a git tag.

**Legend:** 🔴 urgent quality / risk · 🟡 UX or features · 🟢 maintenance · ⏸ deferred / needs design

---

## ✅ Done (shipped)

- **Chrome app**: MV3 extension; React/Vite UI; side panel + full-page; service worker opens panel + `focus-tab` helper.
- **IndexedDB v3** (`db.ts`): projects, collections (`primaryProjectId`, `projectIds`), items (`collectionIds[]`, tags, notes-on-bookmark), workspaces, `notes` object store (schema + export/import), snapshots; migrations incl. legacy default project id cleanup.
- **Backup / import**: JSON export/import, `verifyBackup`, confirmation + counts, backup-before-import, best-effort pre-migration dump + console warnings.
- **Tab Commander**: Multi-window navigator, bulk selection, drag-move tabs between windows, list/gallery, mitigations for macOS Spaces (e.g. Open Here / find window).
- **Bookmarks & collections**: Item/collection/project CRUD; Unsorted per project; “All projects” aggregate view; collection pills + filters; in-place edit; context menus.
- **Project workspace**: Multi-space tabs, drag/reorder, system tabs (Search, Add Item, Collections manager), **Recent** items tab; Search across title/URL/notes/tags.
- **Workspaces**: Save/restore session snapshots; optional `projectId`; list + detail UI.
- **Design baseline**: Compact IDE-style layout, theme tokens / CSS variables, dark–light toggle usage across dashboard.
- **Shared libs**: `src/lib/utils.ts`, `src/lib/constants.ts` (domains, dates, UI/DB constants—extend as needed).

---

## 🔴 Reliability & data

- [ ] **Error handling**: consistent try/catch on async paths (`App.tsx`, dashboard handlers, Chrome APIs); user-visible errors vs silent `console.error`.
- [ ] **DB transactions**: multi-step deletes (`deleteCollection`, `deleteProject`, bulk moves) reviewed for atomicity in `db.ts`.
- [ ] **Input validation**: URLs, IDs, text limits; centralize validation helpers (extend existing `src/lib/utils.ts` patterns as needed).

---

## 🟡 Product features

**Data integrity — automated file backup** — design: [`DATA_BACKUP_AND_INTEGRITY.md`](DATA_BACKUP_AND_INTEGRITY.md)

- [ ] **`BackupSink` abstraction** — interface + `FileSystemBackupSink` (writes serialized JSON); stub or `NoOpSink` when disabled.
- [ ] **`BackupCoordinator`** — single owner: debounced **live** push + **`chrome.alarms`** **scheduled** push + rotation (max **N** files); calls only `exportDB()` → sink(s).
- [ ] **Settings / persistence** — enable live + interval debounce; enable schedule + period + **N**; store prefs (`chrome.storage.local` / small DB key); persist **`FileSystemDirectoryHandle`** for backup folder (re‑prompt if permission revoked).
- [ ] **UI** — dashboard or settings strip: “Backup folder…” picker, toggles, last success/failure status (non‑blocking).
- [ ] **Mutation hooks** — wire coordinator `notifyChanged()` (or equivalent) from DB write paths without duplicating export logic across components.
- [ ] **Manifest** — add `alarms` permission; document any new host permissions only when adding HTTP sink later.

**Notes**

- [ ] **Decide**: first-class `Note` entities (`notes` store + CRUD in UI) *vs* bookmark-notes-only; migrate UI accordingly.
- [ ] Optional: page context capture when creating a note from the active tab.

**Collections & projects**

- [ ] **Detach collection from project** (remove project from `projectIds` without deleting collection).
- [ ] **Share collections across projects** UI (`projectIds` management, indicators).

**Items (bookmarks)**

- [ ] **Multi-collection / share-item UX** if still desired (dashboard backlog “B4”).
- [ ] **Pinned / favorites / trash**: add fields (`pinned`, `favorite`, `deletedAt` or equivalent), wire Quick Access tabs.

**AI (when ready)**

- [ ] Minimal slice: settings (API key, model), single “ask about current tab + related bookmarks” flow.
- [ ] Then: Agent tab, context assembly (page + projects + items), richer prompts.

**Workspaces / tabs**

- [ ] Optional: tighter linking from Tab Commander / workspaces to **projects** (beyond optional `workspace.projectId`).

---

## 🟢 Engineering hygiene

- [ ] **Loading states** for `loadData`, long imports, workspace restore.
- [ ] **Listener cleanup audit** (`useEffect` + Chrome listeners) on hot paths.
- [ ] **Split large components** incrementally (`MainContent.tsx`, layout/tab files)—only when touching those areas.
- [ ] **Types**: tighten migration/`any` in `db.ts`; legacy shape types if useful.
- [ ] **A11y**: keyboard nav and labels where cheap wins exist.
- [ ] **Tests** (when worth it): Vitest + RTL; start with `db` helpers and pure utils.

---

## ⏸ Deferred / polish

- Animations, responsive polish, heavy styling refactors.
- Relationship graphs (notes ↔ bookmarks ↔ projects).
- **`HttpBackupSink` / BYO server** — same coordinator + JSON payload; optional auth — after file‑based backup ships (see [`DATA_BACKUP_AND_INTEGRITY.md`](DATA_BACKUP_AND_INTEGRITY.md)).
- Chrome Web Store / multi-browser—out of scope until explicitly chosen.

---

## Suggested order (adjust freely)

1. **Automated file backup** (coordinator + live + scheduled) — highest leverage for data integrity.  
2. Error handling + validation (quick trust wins).  
3. Notes strategy + one implementation path.  
4. Quick access (pinned / favorites / trash) if daily-use value is high.  
5. Collection detach/share UI if multi-project workflows matter.  
6. AI thin slice after notes/context story is clear.

---

*Last updated: 2026-05-02 — backup design doc + backlog tasks*
