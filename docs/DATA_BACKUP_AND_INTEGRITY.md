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

1. **IndexedDB remains the runtime source of truth** while the extension is installed and loaded.
2. **Canonical snapshot format** is the existing JSON from `exportDB()` / consumed by `importDB()` + `verifyBackup()` — one pipeline for manual export, auto backup, and any future provider.
3. **Backup is snapshot export**, not a live second database. Cross‑machine consistency via shared folders (e.g. Dropbox) is **transport + redundancy**, not ACID sync — **accepted limitation** to avoid heavy merge logic now.
4. **Defense in depth:** manual export (existing) + live backup + scheduled rotated backups + import verification.

---

## Current implementation status

### Shipped

1. **Live backup (debounced auto-save)**
   - DB write paths emit `notifyDataChanged(...)` from `db.ts`.
   - `BackupCoordinator` listens and writes debounced live snapshots to `latest.json` (current debounce: ~1.5s).
   - Writes are coalesced while in-flight to avoid concurrent file writes.

2. **Manual backup**
   - "Backup now" writes `manual-YYYY-MM-DD_HHMMSS.json`.
   - Manual backup also refreshes `latest.json`.

3. **Envelope metadata for sync decisions**
   - `latest.json` now uses a backup envelope:
     - `format`, `schemaVersion`, `exportedAt`, `revision`, `deviceId`, `writerKind`, `data`.
   - Existing legacy flat JSON backups are still readable; parser is backward-compatible.
   - Time uses UTC milliseconds (`Date.now()`). We assume host clocks are reasonably accurate.

4. **Cross-device conflict detection + write pause**
   - Startup/folder-check reads remote `latest.json` envelope and compares it with local revision/device state.
   - If remote is newer from another device (or both sides diverged), auto-writes are paused and user must resolve.
   - Resolution actions in UI:
     - **Load remote** (safe path): writes `safety-before-import-...json` to the same folder first, then imports remote.
     - **Keep local**: force-pushes local state to `latest.json`.

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

5. **Export / live-backup scale (end of V2 — important)**
   - **Today:** every `notifyDataChanged` debounce runs **`exportDB()`** and rewrites **`latest.json`** with the **full** database snapshot (pretty-printed JSON: items, enrichment, AI stores, embeddings in `ai_item_signals`, etc.).
   - **Works well** for personal-scale libraries (roughly hundreds of items; on the order of tens of MB per file with pipeline data).
   - **Does not scale** cleanly to very large libraries (thousands+ items, large embedding payloads): long writes, sync-folder churn, memory spikes, conflict recovery cost.
   - **Tracked as D-35** — decision + implementation scheduled **by end of V2 iteration** (before treating V2 as “closed”). See [`temp/V2-DEFERRED-TRACKER.md`](temp/V2-DEFERRED-TRACKER.md) and backlog *Very large bookmark libraries*.
   - **Direction (TBD after spike):** compact JSON, incremental/delta export, chunked or streaming writes, optional separation of heavy blobs from main JSON, export duration/size surfaced in Settings.

---

## End of V2 — backup / export scale

**Priority:** Important — not optional polish.

| Question | Current answer |
|----------|----------------|
| What syncs on pin/fav/trash/import/pipeline? | Same path as all DB writes: `notifyDataChanged` → debounced full export → `latest.json`. New `Item` fields (`pinnedAt`, `favoriteAt`, `deletedAt`) are included automatically. |
| What does *not* sync? | Ephemeral UI: open tabs, shell/home split prefs, font scale, search history (localStorage). |
| What must improve before V2 close? | **Avoid rewriting the entire pretty JSON file on every small edit** once libraries or embedding payload size grow. Spike real export size/time on a representative library; pick one MVP improvement (e.g. compact JSON + size warning, or delta layer). |

**ID:** **D-35** in deferred tracker. Aligns with backlog reliability item *Very large bookmark libraries*.

---

## Backup modes (target shape)

### 1) Live backup (auto-save on change)

- Local writes trigger debounced export.
- Current target file is `latest.json` in the selected folder.
- Debouncing avoids hammering disk/sync when many edits arrive quickly.

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
- **Caveats (explicit):**
  - Sync delay and OS-level conflict copies can occur (Dropbox/iCloud behavior).
  - No automatic merge across divergent edits.
  - If remote is newer from another device, writes are paused and user must resolve to avoid silent overwrite.

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

- HTTP / BYO server: same JSON blob, `fetch` with optional auth headers.
- More automatic pull/re-check policies while app is open.
- Per‑user filenames when multi‑user mode exists (`workbench-{profileId}-latest.json`).

---

## Related code (today)

- `src/lib/db.ts` — core data API + export/import/verification + mutation notifications.
- `src/lib/dataChangeNotifier.ts` — pub/sub for DB change events.
- `src/lib/revisionTracker.ts` — device/revision/last-seen-remote bookkeeping.
- `src/lib/backupEnvelope.ts` — envelope schema + legacy-compatible parser.
- `src/lib/backupCoordinator.ts` — debounced live/manual orchestration + conflict checks/resolution helpers.
- `src/lib/backupSinks.ts` — sink interface + file-system sink.
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

*Last updated: 2026-05-03 — backup UI moved to Settings view*
