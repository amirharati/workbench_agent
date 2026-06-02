# TASK-POST-V2 — Storage, backup & sync (umbrella)

**Status:** **V2.1 + V2.1.1 + V2.2 shipped** — single-device storage ready for V3; **V4** sync deferred  
**ID:** **D-35** (umbrella)  
**Tracker:** [V2-DEFERRED-TRACKER.md](V2-DEFERRED-TRACKER.md) Tier E  
**V2:** closed 2026-05-29 ([`TASK-V2-CLOSE.md`](TASK-V2-CLOSE.md)). **Post-V2:** [`TASK-POST-V2.md`](TASK-POST-V2.md)

---

## Roadmap (master — 2026-05-30)

```text
V2           IndexedDB + latest.json — superseded for domain data
     ↓
V2.1         SQLite WASM + schema + JSON bridge — shipped
     ↓
V2.1.1       OPFS single DB worker + folder mirror — shipped (dogfood 2026-05-29)
     ↓
V2.2         Storage & backup polish — shipped (2026-05-30)
     ↓
V2.3         Quick wins (non-pipeline) — next
     ↓
V3           Pipeline workflow (main product)
     ↓
V4           Multi-device sync — deferred
```

| Phase | Brief | Status |
|-------|--------|--------|
| **V2.1** | [`TASK-V2.1-sqlite-wasm-storage.md`](TASK-V2.1-sqlite-wasm-storage.md) | **shipped** |
| **V2.1.1** | [`TASK-V2.1.1-opfs-db-worker.md`](TASK-V2.1.1-opfs-db-worker.md) | **shipped** |
| **V2.2** | [`TASK-V2.2-storage-polish.md`](TASK-V2.2-storage-polish.md) | **shipped** 2026-05-30 |
| **V4** | [`TASK-V4-sync-replicas.md`](TASK-V4-sync-replicas.md) | **deferred** |

---

## End state vision

| Capability | Local (default — shipped) | Optional later (V4+) |
|------------|---------------------------|-------------------------|
| Primary store | SQLite WASM + OPFS in one worker | Same |
| Backup file | `.sqlite` mirror + `workbench.meta.json` | Per-device replica in sync root |
| Cross-device | Manual export/import; same folder = risky | Sync layer + per-device replicas |
| Backend | User-chosen local folder | Dropbox / iCloud / Turso blobs / HTTP BYO |
| Multi-app | — | User brings own account; no Workbench backend |

---

## Single-device model (shipped)

- **Live truth:** OPFS in DB worker (offscreen + dedicated worker)  
- **Portable copy:** `{backupFolder}/workbench.sqlite` + `workbench.meta.json` (debounced mirror)  
- **All tabs:** RPC to single worker — no per-tab SQLite  
- **Uninstall:** OPFS cleared; folder replica restores on reinstall + same folder pick  

See [`DATA_BACKUP_AND_INTEGRITY.md`](../DATA_BACKUP_AND_INTEGRITY.md) for truth-direction table.

---

## Multi-device model (deferred — not V3/V4)

**Decision (2026-05-29):** V3 and V4 stay **single-device**. Folder mirror + manual export is sufficient. Multi-device sync is documented for later only.

**Do not** have two machines write one shared `workbench.sqlite`.

Instead:

```text
{sync-root}/devices/{deviceId}/workbench.sqlite   # each machine writes only its replica
```

Sync layer (app code, not OS Dropbox merge):

1. Upload this device's replica  
2. Download other devices' replicas  
3. Merge (single-user rules — union by id, LWW on fields)  
4. Import into local OPFS  
5. Mirror back this device's file only  

Same model for **Dropbox folder, Dropbox API, Turso blob store, HTTP BYO, future mobile app**.

**Not doing:** one shared cloud SQL DB all clients write to live.

Detail: [`TASK-V4-sync-replicas.md`](TASK-V4-sync-replicas.md). **Roadmap:** [`TASK-V2-POST-ROADMAP.md`](TASK-V2-POST-ROADMAP.md).

---

## V4+ backend candidates (planning — deferred)

| Feature | Notes |
|---------|--------|
| **Sync folder** (Dropbox/iCloud/Drive) | Per-device subfolders; OS syncs files |
| **Dropbox API** | Upload/download per-device snapshots |
| **Turso / HTTP BYO** | Blob + metadata store — not live shared SQL |
| **Scheduled rotation** | D-36 — timestamped backups |
| **D-45 folder import** | Local `file://` paths in DB |

---

## V2.1 spike — resolved

1. WASM package: `@sqlite.org/sqlite-wasm` v3.53.0-build1 + OPFS SAH pool VFS  
2. Migration: fresh start + JSON import; no IDB migration required  
3. Embeddings: BLOB in schema v1  
4. BackupCoordinator + worker mirror; JSON live backup disabled  
5. `verifyBackup` / import versioning unchanged  

---

## Related docs

- [`DATA_BACKUP_AND_INTEGRITY.md`](../DATA_BACKUP_AND_INTEGRITY.md)
- [`TASK-V2.1-sqlite-wasm-storage.md`](TASK-V2.1-sqlite-wasm-storage.md)
- [`TASK-V2.1.1-opfs-db-worker.md`](TASK-V2.1.1-opfs-db-worker.md)
- [`TASK-V2.2-storage-polish.md`](TASK-V2.2-storage-polish.md)
- [`TASK-V4-sync-replicas.md`](TASK-V4-sync-replicas.md)
- [`TASK-V2-POST-ROADMAP.md`](TASK-V2-POST-ROADMAP.md)

---

*Last updated: 2026-05-30 — V2.2 polish shipped; multi-device sync = **V4**.*
