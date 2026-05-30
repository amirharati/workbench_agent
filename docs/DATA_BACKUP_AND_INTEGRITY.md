# Data integrity & backup design

Living design for how Workbench protects user data and mirrors it outside IndexedDB. This now includes a shipped file-based backup core (live + manual + sync conflict guard), with scheduled rotation and a few hardening steps still pending (see [`BACKLOG.md`](BACKLOG.md)).

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

1. **V2 (superseded for domain data):** IndexedDB was runtime source of truth; live backup debounced full JSON → `latest.json`.
2. **V2.1 + V2.1.1 (shipped — [`temp/TASK-V2.1-sqlite-wasm-storage.md`](temp/TASK-V2.1-sqlite-wasm-storage.md), [`temp/TASK-V2.1.1-opfs-db-worker.md`](temp/TASK-V2.1.1-opfs-db-worker.md)):** **SQLite WASM on OPFS** in a **single DB worker** (offscreen document). **Mandatory backup folder.** **Live truth = OPFS**; **`workbench.sqlite`** in the user folder is a **debounced mirror** (3s after last edit, max once per 60s unless forced). **`workbench.meta.json`** sidecar carries revision/deviceId. **JSON export/import retained.** **Fetch raw bodies** unchanged in `enrichment-cache/`.
3. **Canonical interchange format (V2 + V2.1):** JSON from `exportDB()` / `importDB()` + `verifyBackup()` — for manual export, migration, and cross-version import.
4. **Backup is snapshot export**, not a live second database. Cross‑machine consistency via shared folders (e.g. Dropbox) is **transport + redundancy** on a **single device** — **not** multi-writer sync. **V2.2:** per-device replicas + app sync layer ([`temp/TASK-V2.2-sync-replicas.md`](temp/TASK-V2.2-sync-replicas.md)).
5. **Defense in depth:** manual export + occasional **`manual-*.sqlite` / `manual-*.json`** snapshots + scheduled rotation (pending) + import verification. No full JSON rewrite on every edit when folder live mode is active.

---

## Current implementation status

### Shipped

0. **V2.1.1 runtime storage (2026-05-29)**
   - Domain data in **SQLite WASM on OPFS** inside one **DB worker** (`src/lib/storage/dbWorker/`, `src/offscreen/offscreen.ts`).
   - **All UI tabs** use RPC (`dbClient` → service worker → offscreen → worker). Tab-side `RemoteIdbCompatStore` is a read cache only.
   - **Backup folder required:** blocking onboarding until chosen.
   - **Bootstrap:** if OPFS empty and folder has `workbench.sqlite` → import into OPFS once.
   - **Mirror:** worker `mirrorToFolder.ts` — 3s debounce, 60s min interval; scheduled after mutating RPCs.
   - Meta in IDB: `metaDb.ts` (folder handle, revision kv). Legacy domain IDB/localStorage purged on startup.

1. **Live persistence (folder mirror)**
   - Mutations commit to OPFS immediately in worker.
   - Debounced export → **`workbench.sqlite`** + **`workbench.meta.json`** (offscreen writes bytes from worker).
   - Legacy **`latest.sqlite`** / **`latest.json`** read for migration only — not rewritten on every edit.
   - Live JSON backup **disabled**; manual snapshots on demand.

2. **Manual backup**
   - "Backup now" writes `manual-YYYY-MM-DD_HHMMSS.json` **and** matching `manual-*.sqlite` via `ManualFolderBackupSink`.
   - Does **not** replace the live `workbench.sqlite` except via explicit conflict resolution.

3. **Envelope metadata for sync decisions**
   - **`workbench.meta.json`** (or legacy `latest.json`) uses a backup envelope:
     - `format`, `schemaVersion`, `exportedAt`, `revision`, `deviceId`, `writerKind`, `data`.
   - Existing legacy flat JSON backups are still readable; parser is backward-compatible.
   - Time uses UTC milliseconds (`Date.now()`). We assume host clocks are reasonably accurate.

4. **Cross-device conflict detection + write pause**
   - Startup/folder-check reads remote **`workbench.meta.json`** (fallback: legacy `latest.json`) and compares with local revision/device state.
   - If remote is newer from another device (or both sides diverged), auto-writes are paused and user must resolve.
   - Resolution actions in UI:
     - **Load remote** (safe path): writes `safety-before-import-...` snapshot first, then reloads **`workbench.sqlite`**.
     - **Keep local**: force-flushes local state to **`workbench.sqlite`**.

5. **Swappable architecture in place**
   - `BackupCoordinator` + `BackupSink` + `FileSystemBackupSink` implemented.
   - Meta bookkeeping isolated in a dedicated meta DB (`deviceId`, `localRevision`, `lastSeenRemote`).

### Not shipped yet

1. **Scheduled rotation backups**
   - `chrome.alarms` integration not implemented yet.
   - Rotation policy (period + max N retained files) still pending.

2. **Runtime remote polling/re-check**
   - Conflict check runs at startup and folder change.
   - Continuous checks while app stays open (focus/visibility or timer-based) are still pending.

3. **User settings for backup policy**
   - Debounce interval, schedule period, retention count, provider selection are not exposed in settings yet.

4. **Import merge mode**
   - Replace mode works; merge remains disabled placeholder.

5. **Export / live-backup scale (end of V2 — largely addressed in folder mode)**
   - **Folder mode:** mutations flush **SQLite bytes only** (~800ms debounce) — no full JSON rewrite per edit. Manual JSON/SQL snapshots are on demand.
   - **No-folder path removed** — folder is required at app start.

---

## End of V2 — backup / export scale

**Priority:** Important — not optional polish.

| Question | Current answer |
|----------|----------------|
| What syncs on pin/fav/trash/import/pipeline? | Worker commit to OPFS → debounced **`workbench.sqlite`** mirror (folder required). |
| What does *not* sync? | Ephemeral UI: open tabs, shell/home split prefs, font scale, search history (localStorage). |
| What must improve before V2 close? | **Nothing** — V2 closes with current backup at today's scale. **Post-V2:** big storage/backup epic (SQLite and/or multi-file dump — not small patches). |

**ID:** **D-35** in deferred tracker. Aligns with backlog reliability item *Very large bookmark libraries*.

---

## Backup modes (target shape)

### 1) Live persistence (auto-save on change)

- Worker commits to OPFS on each mutation; schedules folder mirror (3s debounce, 60s min interval).
- **`workbench.meta.json`** holds revision metadata only (not full data).
- **`mirrorNow(true)`** bypasses debounce (folder pick, conflict resolution, manual trigger from code).

**Truth direction (single device):**

| Situation | Direction |
|-----------|-----------|
| Normal edits | OPFS → folder mirror |
| Startup, empty OPFS | folder → OPFS bootstrap |
| Conflict “Load remote” | folder → `forceImportFromFolderBytes` → OPFS |
| Uninstall extension | OPFS lost; folder replica is recovery |

### 2) Scheduled backup (rotation) — pending

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
- **Single device:** flat `workbench.sqlite` in that folder is correct.
- **Multi-device (V2.2):** each machine must write **its own replica** (`devices/{deviceId}/…`); sync layer merges — see [`temp/TASK-V2.2-sync-replicas.md`](temp/TASK-V2.2-sync-replicas.md).
- **Caveats (explicit):**
  - Sync delay and OS-level conflict copies can occur (Dropbox/iCloud behavior).
  - No automatic merge across divergent edits on one shared sqlite file.
  - If remote meta is newer, startup conflict UI applies; remote-newer loads folder into OPFS.

---

## Abstraction: swappable backup / sync targets

Introduce a small internal layer so file backup is **one implementation**, not scattered `exportDB` + write calls.

### Concepts

| Piece | Responsibility |
|-------|----------------|
| **`BackupCoordinator`** (or similar) | Owns scheduling: debounce hook, alarm registration, calls into configured sink(s). Single entry from app after mutations. |
| **`BackupSink` interface** | Receives already-serialized payload and writes to a destination (`writeLatest`, `writeNamed`). |
| **`FileSystemBackupSink`** | Implements writes using stored directory handle + naming/rotation policy for this phase. |
| **Future:** `HttpBackupSink` (POST to user URL), `NoOpBackupSink`, etc. — same coordinator, different sink. |

### Rules

- **All** automated backup goes: `exportDB()` → envelope wrap → coordinator → sink(s).
- **Do not** duplicate export logic inside React components; subscribe coordinator from a narrow place (e.g. after successful `loadData` mutations or thin wrappers in `db.ts` — decide during implementation).
- Settings shape should allow **`provider: 'file' | 'none' | 'http'`** later without rewriting coordinator semantics.

---

## Future extensions (out of scope until chosen)

### Multi-device sync — master design (deferred)

**Not V3/V4** — single-device folder mirror is sufficient for near-term product work. When multi-device is needed later:

- **Do not** share one live `workbench.sqlite` across machines.
- **Do** use **one replica per `deviceId`** under a sync root; app-level merge; same pattern for Dropbox, Turso blobs, HTTP, mobile.
- Full brief: [`temp/TASK-V2.2-sync-replicas.md`](temp/TASK-V2.2-sync-replicas.md). Backlog: [`backlog.md`](backlog.md) § Multi-device sync.

- **V2.2 sync layer** — per-device replicas, merge, backends ([`temp/TASK-V2.2-sync-replicas.md`](temp/TASK-V2.2-sync-replicas.md)).
- HTTP / BYO server: same snapshot blob, `fetch` with optional auth headers.
- More automatic pull/re-check policies while app is open.
- Mirror tmp+replace; Settings mirror status UI.

---

## Related code (today)

- `src/lib/db.ts` — core data API + export/import/verification + mutation notifications.
- `src/lib/dataChangeNotifier.ts` — pub/sub for DB change events.
- `src/lib/revisionTracker.ts` — device/revision/last-seen-remote bookkeeping.
- `src/lib/backupEnvelope.ts` — envelope schema + legacy-compatible parser.
- `src/lib/backupCoordinator.ts` — debounced live/manual orchestration + conflict checks/resolution helpers.
- `src/lib/backupSinks.ts` — sink interface + `FileSystemSqliteBackupSink` (json + sqlite bytes).
- `src/lib/storage/dbWorker/` — worker, `mirrorToFolder.ts`, OPFS connection.
- `src/lib/storage/dbClient/` — tab RPC client, `RemoteIdbCompatStore`.
- `src/offscreen/offscreen.ts` — DB owner, bootstrap from folder, mirror write.
- `src/lib/backupFolder.ts` — folder handle persistence + read/write helpers.
- `src/lib/metaDb.ts` — meta DB (`handles` + `kv` stores).
- `src/App.tsx` — startup conflict checks, backup sink registration, handlers.
- `src/components/dashboard/SettingsView.tsx` — backup folder UI, status, manual backup, restore file, conflict banner.
- `src/components/dashboard/HomeView.tsx` — placeholder (no backup UI).

---

## References

- [`BACKLOG.md`](BACKLOG.md) — implementation tasks
- [`OVERVIEW.md`](OVERVIEW.md) — product snapshot

---

*Last updated: 2026-05-29 — V2.1.1 OPFS worker + folder mirror; V2.2 per-device sync direction*
