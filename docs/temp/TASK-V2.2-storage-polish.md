# TASK-V2.2 — Storage & backup polish (single-device)

**Status:** ✅ **CLOSED** — 2026-05-30 (slices A–C + hardening E)  
**Slice D:** deferred (scheduled snapshots → backlog / D-36)  
**Parent:** [`TASK-V2-POST-ROADMAP.md`](TASK-V2-POST-ROADMAP.md)  
**Depends on:** V2.1 + V2.1.1 shipped  
**Not in scope:** Pipeline batch/classify/discover (→ **V3**)

---

## Goal

Close **low-hanging** gaps from storage migration without touching pipeline orchestration.

---

## Slices

### Slice A — Import `workbench.sqlite` from folder

- [x] Settings: **Restore from backup…** — `.sqlite` or `.json` → replace flow
- [x] Safety snapshot before replace (`safety-before-import-…`)
- [x] Success toast + item counts
- [x] Merge mode deferred (same engine as multi-device sync — V4)

**Acceptance:** User can restore from a copied `.sqlite` or `.json` file.

### Slice B — Settings & backup copy hygiene

- [x] Replace stale **`latest.json`** wording with **`workbench.sqlite`** + **`workbench.meta.json`**
- [x] Show last mirror time / mirror error (worker `getStatus`)
- [x] Conflict UI text matches OPFS + mirror model
- [x] Optional **Export JSON snapshot** button (`manual-*.json`)

**Acceptance:** Settings accurately describes how backup works today.

### Slice C — Atomic folder mirror

- [x] Mirror write: temp file + rename/replace for `workbench.sqlite`
- [x] Same for `workbench.meta.json`

**Acceptance:** Killing extension mid-mirror does not leave corrupt primary sqlite in folder.

### Slice D — D-36 starter (deferred)

- [ ] `chrome.alarms` daily → `manual-*.sqlite` + `manual-*.json` (rotation max N)
- [ ] Re-check remote meta on window focus (conflict pause)

**Acceptance:** Time-depth backups exist beyond live mirror.  
**Routing:** backlog item 7 / D-36 — not blocking V2.3 or V3.

### Slice E — Restore & startup hardening (dogfood session)

- [x] **Worker RPC mutex** — serialized handlers in `worker.ts`
- [x] **Startup race** — `ensureDbWorker()` waits for `db-owner-ready`; offscreen re-broadcasts ready; `db-owner-error` / `db-owner-lost` handling
- [x] **Live connection** — `connectionShared.ts` `selectAll`/`selectOne`/transactions use `resolveDatabase()`
- [x] **Post-import mirror** — blocking `mirrorNow(true)` after import/bootstrap; forced mirror queue; min interval **60s → 15s**
- [x] **OPFS import** — stale-generation retry; import deserialize-before-close; wait for live db
- [x] **Tab client retries** — `dbClient` + `loadData` on transient “SQLite database is not open”
- [x] **Write flush before destructive import** — `prepareForDestructiveImport()` flush + mirror
- [x] **Live-newer guard** — `importFingerprint.ts` byte-equal skip + live-newer confirm on replace
- [x] **Bootstrap** — re-import from folder when folder sqlite is newer than OPFS
- [x] **Restore stats UX** — separate bookmark vs note-item counts; combined line `412 bookmarks/notes, 1 projects, 1 collections, 1 workspaces` (`formatRestoreSummary`)

**Acceptance:** Restore from same backup no longer drops latest edits; startup errors largely gone; restore summary matches UI semantics.

---

## Explicitly out of scope (V2.2)

| Item | Where |
|------|--------|
| Pipeline hub, batch reliability | **V3** |
| Multi-device `devices/{id}/` layout | **V4** |
| Turso / cloud sync | **V4+** |
| Full D-35 scale (virtualized lists, paged hub) | V3+ / backlog |
| Restore **merge** mode | **V4** sync merge engine |
| Scheduled snapshot rotation | **Slice D** / D-36 backlog |

---

## Task return (for master)

| Field | Value |
|-------|-------|
| **Closed** | 2026-05-30 |
| **Slices shipped** | **A + B + C + E** |
| **Deferred** | **D** (daily alarms / rotation) |
| **User-visible** | Restore `.sqlite`/`.json`; atomic mirror; Settings copy + mirror status; safer replace import; clearer restore toast |
| **Known limits** | Full extension reload still required after deploy; merge restore → V4; Slice D not started |
| **Next milestone** | **V2.3** quick wins → **V3** pipeline |

### Files touched

| Area | Files |
|------|--------|
| Backup / restore | `backupCoordinator.ts`, `backupSinks.ts`, `backupFolder.ts`, `importFingerprint.ts`, `db.ts` |
| Worker / OPFS | `dbWorker/worker.ts`, `mirrorToFolder.ts`, `connectionOpfs.ts`, `connectionShared.ts`, `folderPersistence.ts` |
| Tab client | `dbClient/index.ts`, `dbClient/remoteStore.ts` |
| Offscreen / SW | `offscreen/offscreen.ts`, `public/service-worker.js` |
| Stats / UX | `itemQuickAccess.ts`, `SettingsView.tsx`, `App.tsx` |
| Layout props | `DashboardLayout.tsx`, `MainContent.tsx` (restore wiring) |

### Sample restore toast

```text
Database restored: 412 bookmarks/notes, 1 projects, 1 collections, 1 workspaces. Saved safety-before-import-….
```

---

*Report to master: V2.2 closed. Active thread → V2.3 then V3.*
