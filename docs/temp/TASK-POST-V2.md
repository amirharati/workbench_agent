# TASK-POST-V2 — Active work after V2 milestone

**Status:** **active**  
**Last updated:** 2026-05-30  
**V2 closed:** [`TASK-V2-CLOSE.md`](TASK-V2-CLOSE.md)  
**Storage shipped:** V2.1 + V2.1.1 (2026-05-29), **V2.2 polish (2026-05-30)**  
**Roadmap:** [`TASK-V2-POST-ROADMAP.md`](TASK-V2-POST-ROADMAP.md) ← **start here**

---

## Sequencing (locked 2026-05-29)

```text
V2.1 ✅ → V2.2 ✅ → V2.3 quick wins → V3 pipeline (main) → V4 multi-device sync (later)
```

| Milestone | Doc | Focus |
|-----------|-----|--------|
| **V2.2** | [`TASK-V2.2-storage-polish.md`](TASK-V2.2-storage-polish.md) | ✅ closed 2026-05-30 |
| **V2.3** | [`TASK-V2.3-quick-wins.md`](TASK-V2.3-quick-wins.md) | ✅ Tier 1 closed — **next: V3** (Tier 2 optional) |
| **V3** | [`TASK-V3-pipeline-workflow.md`](TASK-V3-pipeline-workflow.md) · [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md) | **Pillar A reliability + Pillar B discover loop + hub** |
| **V4** | [`TASK-V4-sync-replicas.md`](TASK-V4-sync-replicas.md) | Multi-device (deferred) |

**Pipeline rule:** Anything involving enrich/classify/discover **batch**, hub workflow, or Home digest queues → **V3**, not V2.2/V2.3.

---

## Current stack (code — 2026-05-30)

| Piece | Location |
|-------|----------|
| **DB facade** | `src/lib/db.ts` — SQLite via RPC |
| **DB worker** | `src/lib/storage/dbWorker/worker.ts`, `connectionOpfs.ts` |
| **Schema** | `src/lib/storage/schema/v1.sql` |
| **Folder mirror** | `workbench.sqlite` + `workbench.meta.json` (atomic tmp+replace) |
| **Restore** | Settings replace from `.sqlite` or `.json`; safety snapshot + live-newer guard |
| **Fetch dumps** | `{backupFolder}/enrichment-cache/*.md` |

---

## Shipped post-V2

| Epic | Doc |
|------|-----|
| V2.1 SQLite + JSON bridge | [`TASK-V2.1-sqlite-wasm-storage.md`](TASK-V2.1-sqlite-wasm-storage.md) |
| V2.1.1 OPFS worker + mirror | [`TASK-V2.1.1-opfs-db-worker.md`](TASK-V2.1.1-opfs-db-worker.md) |
| V2.2 storage & backup polish | [`TASK-V2.2-storage-polish.md`](TASK-V2.2-storage-polish.md) |

---

## Hub detail (subset of V3)

[`TASK-V2-pipeline-hub.md`](TASK-V2-pipeline-hub.md) — UI slices + issue list; umbrella = [`TASK-V3-pipeline-workflow.md`](TASK-V3-pipeline-workflow.md).

---

## Related

- [`V2-DEFERRED-TRACKER.md`](V2-DEFERRED-TRACKER.md)  
- [`backlog.md`](../backlog.md)  
- [`OVERVIEW.md`](../OVERVIEW.md)  
