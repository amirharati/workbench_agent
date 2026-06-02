# Post-V2 roadmap (V2.2 → V2.3 → V3)

**Status:** **active** — master sequencing after V2.1 storage  
**Last updated:** 2026-05-30  
**Parent:** [`TASK-POST-V2.md`](TASK-POST-V2.md) · Index: [`V2-DEFERRED-TRACKER.md`](V2-DEFERRED-TRACKER.md)

---

## Milestone map

| Milestone | Focus | Status |
|-----------|--------|--------|
| **V2** | Product shell, search, import MVP, D-10 fetch | ✅ Closed |
| **V2.1 + V2.1.1** | SQLite WASM, OPFS worker, folder mirror | ✅ Shipped |
| **V2.2** | Storage polish + backup UX (single-device) | ✅ Shipped 2026-05-30 |
| **V2.3** | Non-pipeline quick wins — **Tier 1 closed** | Tier 2 optional → **V3** |
| **V3** | **Pipeline workflow + reliability + hub UX** | **main product focus** |
| **V4** | Multi-device sync replicas | deferred |

```text
V2.1 shipped → V2.2 ✅ → V2.3 quick wins → V3 pipeline (big) → V4 sync (later)
```

---

## What goes where (master rule)

| If it touches… | Milestone |
|----------------|-----------|
| Batch enrich / classify / discover, Home digest queues, Inspector pipeline actions, hub, D-26/D-27/W6/D-25, D-44 orchestrator | **V3** |
| `workbench.sqlite` import, mirror atomicity, Settings backup copy | **V2.2** ✅ |
| D-36 scheduled rotation (`chrome.alarms`) | backlog (was V2.2 slice D) |
| Search clicks (D-41), generic toasts, persisted UI, small import UX, SQL indexes | **V2.3** |
| Dropbox two-laptop live DB | **V4** |

---

## V2.2 — Storage & backup polish ✅

**Doc:** [`TASK-V2.2-storage-polish.md`](TASK-V2.2-storage-polish.md) — **closed 2026-05-30**

Shipped: `.sqlite`/`.json` restore, atomic mirror, Settings hygiene, restore hardening (flush-before-import, live-newer guard, startup/mirror fixes). **Deferred:** Slice D daily snapshots.

---

## V2.3 — Quick wins (non-pipeline)

**Doc:** [`TASK-V2.3-quick-wins.md`](TASK-V2.3-quick-wins.md)

Straightforward items from the deferred tracker — **avoid** batch/classify/discover/orchestration.

---

## V3 — Pipeline workflow (primary focus)

**Doc:** [`TASK-V3-pipeline-workflow.md`](TASK-V3-pipeline-workflow.md) · Hub detail: [`TASK-V2-pipeline-hub.md`](TASK-V2-pipeline-hub.md)

**Why V3:** Pipeline is **unreliable in practice** — batch errors, succeeds one-by-one, confusing bulk vs classify, scattered UX (Home, hub, Inspector). Needs a **coherent pass**, not more V2.2-sized patches.

**P0 symptoms (dogfood 2026-05-29):**

- Batch processing fails or partial-fails; **retrying single items often works**
- Unclear what bulk actions do (e.g. re-digest also classifies)
- Hub / Home / Inspector not one workflow

---

## V4 — Multi-device sync

**Doc:** [`TASK-V4-sync-replicas.md`](TASK-V4-sync-replicas.md) (was briefly V2.2 / V2.4 — now **V4**)

Only when product needs laptop + second device. Not blocking V3.

---

## Suggested worker order

| # | Session | Brief |
|---|---------|--------|
| ~~1–2~~ | ~~V2.2~~ | ✅ shipped — see [`TASK-V2.2-storage-polish.md`](TASK-V2.2-storage-polish.md) |
| ~~1~~ | ~~V2.3 Tier 1~~ | ✅ D-41, hygiene toasts, verifyBackup, shell (already persisted) |
| 1 | **V3** or V2.3 Tier 2 | **V3 P0** batch reliability **or** one Tier 2 polish item |
| — | backlog | V2.2 slice D (D-36 rotation) when backup depth matters |

---

## Related

- [`TASK-POST-V2.md`](TASK-POST-V2.md) — active queue + current stack  
- [`TASK-V2-CLOSE.md`](TASK-V2-CLOSE.md) — V2 record  
