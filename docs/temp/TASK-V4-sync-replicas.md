# TASK-V4 — Per-device replicas + sync layer (planning)

**Status:** **deferred** — after V3 pipeline stable; not required for single-device daily use  
**Last updated:** 2026-05-30  
**Milestone:** **V4** (multi-device) — not V2.x; avoids clash with V2.2 storage / V2.3 quick wins  
**Parent:** [`TASK-POST-V2-D35-storage-backup.md`](TASK-POST-V2-D35-storage-backup.md)  
**Depends on:** V2.1 + V2.1.1 shipped; **V3** pipeline recommended first  
**Roadmap:** [`TASK-V2-POST-ROADMAP.md`](TASK-V2-POST-ROADMAP.md)

**Scope:** Multi-device only. **V2.2 / V2.3** = single-device polish; **V3** = pipeline workflow; **V4** = sync.

---

## Problem

V2.1.1 is **single-device correct**: OPFS is live truth; the user folder gets a debounced mirror of **one** `workbench.sqlite`.

It is **not** safe for two machines to write the **same** shared `workbench.sqlite` in Dropbox/iCloud — SQLite is not a multi-writer sync target.

---

## Direction (locked 2026-05-29)

| Decision | Choice |
|----------|--------|
| **Live truth (each device)** | OPFS in the single DB worker (unchanged) |
| **Portable replica (each device)** | One snapshot per `deviceId` |
| **Shared backend** | Transport only (Dropbox, API, Turso blob, HTTP BYO) |
| **Merge** | App-level sync layer — single-user, few devices (2–4 machines) |

**Principle:** Each machine **only writes its own replica**. Sync coordinator merges → import into local OPFS → mirror this device's file only.

---

## Target layout (sync root)

```text
{sync-root}/
  devices/
    {deviceId-A}/
      workbench.sqlite
      workbench.meta.json
      enrichment-cache/…   # policy TBD
```

**Today:** flat `{backupFolder}/workbench.sqlite` — fine until V4.

---

## Open questions (spike when scheduled)

1. Merge policy per entity (bookmarks, enrichment, taxonomy)  
2. Migration flat file → `devices/{deviceId}/`  
3. `enrichment-cache/` per-device vs merged  
4. First backend: sync folder vs API vs Turso blobs  
5. UI: sync status, diverged devices  

---

## Related

- [`backlog.md`](../backlog.md) § Multi-device sync  
- [`DATA_BACKUP_AND_INTEGRITY.md`](../DATA_BACKUP_AND_INTEGRITY.md)  
- Restore **merge** mode (deferred from V2.2) → same merge engine as V4  
