# Data integrity & backup design

Living design for how Workbench protects user data and optionally mirrors it outside IndexedDB. **Implementation status:** not built yet (see [`BACKLOG.md`](BACKLOG.md)).

---

## Goals

| Priority | Goal |
|----------|------|
| **P0** | **Integrity** — avoid silent loss; recover from mistakes, uninstalls, bad merges via multiple snapshots. |
| **P1** | **Portability** — move data between machines via explicit import/export and/or user‑chosen sync folder (best effort). |
| **Simplicity (this phase)** | File‑based backup only: **live** (debounced) + **scheduled** rotating snapshots — no custom server required. |

Non‑goals for this phase: perfect multi‑writer sync, conflict‑free merge across devices, cloud OAuth backends.

---

## Principles

1. **IndexedDB remains the runtime source of truth** while the extension is installed and loaded.
2. **Canonical snapshot format** is the existing JSON from `exportDB()` / consumed by `importDB()` + `verifyBackup()` — one pipeline for manual export, auto backup, and any future provider.
3. **Backup is snapshot export**, not a live second database. Cross‑machine consistency via shared folders (e.g. Dropbox) is **transport + redundancy**, not ACID sync — **accepted limitation** to avoid heavy merge logic now.
4. **Defense in depth:** manual export (existing) + live backup + scheduled rotated backups + import verification.

---

## This phase: two backup modes

### 1) Live backup (auto‑save on change)

- After local writes (mutations to projects/collections/items/workspaces/notes), trigger a **debounced** export (e.g. 3–10 s idle configurable).
- Write **`latest.json`** (name configurable) to the user‑chosen directory via **File System Access API** (directory handle stored after one‑time picker).
- Debouncing avoids hammering disk/sync when many edits arrive quickly.

### 2) Scheduled backup (rotation)

- **`chrome.alarms`** (or equivalent) fires on a user‑configurable cadence (default: once per day).
- Write a timestamped file (e.g. `workbench-backup-YYYYMMDD-HHmmss.json`) **or** rotate fixed slots `backup-01.json` … `backup-N.json`.
- Keep **at most N** historical files; delete or overwrite oldest.
- Independent of live file — gives **time depth** if `latest.json` is corrupted or overwritten.

### Manual export/import

- Keep current UX as the ultimate escape hatch (especially before uninstall).

---

## Directory & sync folder

- User picks a folder once (IDEAL: sync‑enabled folder such as Dropbox). Extension stores **`FileSystemDirectoryHandle`** in IndexedDB where supported.
- **Dropbox/iCloud** are implementation‑transparent: we write normal files; the OS client syncs them. No Dropbox API in this phase.
- **Caveats (explicit):** sync delay, conflict copies, offline divergence — user accepts imperfect cross‑machine “latest” unless they run explicit **Import** on the other machine.

---

## Abstraction: swappable backup / sync targets

Introduce a small internal layer so file backup is **one implementation**, not scattered `exportDB` + write calls.

### Concepts

| Piece | Responsibility |
|-------|----------------|
| **`BackupCoordinator`** (or similar) | Owns scheduling: debounce hook, alarm registration, calls into configured sink(s). Single entry from app after mutations. |
| **`BackupSink` interface** | `push(payload: string, meta: { kind: 'live' \| 'scheduled'; revision?: number }) => Promise<Result>` — receives **already serialized** JSON; optional `configure()` / `dispose()`. |
| **`FileSystemBackupSink`** | Implements writes using stored directory handle + naming/rotation policy for this phase. |
| **Future:** `HttpBackupSink` (POST to user URL), `NoOpBackupSink`, etc. — same coordinator, different sink. |

### Rules

- **All** automated backup goes: `serialize()` → **one function** wrapping `exportDB()` → coordinator → sink(s).
- **Do not** duplicate export logic inside React components; subscribe coordinator from a narrow place (e.g. after successful `loadData` mutations or thin wrappers in `db.ts` — decide during implementation).
- Settings shape should allow **`provider: 'file' | 'none' | 'http'`** later without rewriting coordinator semantics.

---

## Future extensions (out of scope until chosen)

- HTTP / BYO server: same JSON blob, `fetch` with optional auth headers.
- Pull / restore automation (compare revision, prompt user) — optional v2.
- Per‑user filenames when multi‑user mode exists (`workbench-{profileId}-latest.json`).

---

## Related code (today)

- `src/lib/db.ts` — `exportDB`, `importDB`, `verifyBackup`
- `src/lib/backup.ts` — backup verification helpers
- `src/App.tsx` — manual export/import handlers

---

## References

- [`BACKLOG.md`](BACKLOG.md) — implementation tasks
- [`OVERVIEW.md`](OVERVIEW.md) — product snapshot

---

*Last updated: 2026-05-02*
