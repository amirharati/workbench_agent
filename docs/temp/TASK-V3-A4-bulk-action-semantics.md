# TASK-V3-A4 — Bulk action semantics (enrich vs digest vs classify)

**Status:** **partial** (2026-06-02) — bulk trash + scoped Hub classify; full action split not done  
**Parent:** [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md)  
**Method:** **App-first** (UI/flags); optional CLI check that classify-only scripts do not chain enrich  
**Worker:** Update **only this file** (+ code). No backlog/roadmap edits.

## Goal
Split **Re-enrich only** vs **Full re-digest** vs **Classify only** vs **Discover** — Hub + Home same names.

## Checklist
- [x] Hub bulk trash fast (`batchMutate`, optimistic row removal, `TrashView`)
- [x] Hub classify/digest scoped to selection (`drainPendingClassifyQueue` default false)
- [ ] Hub bulk flags (`forceReclassify` surprise fixed) — naming/copy only partially aligned
- [ ] Home digest buttons aligned
- [ ] Confirm copy when chaining stages

## Task return (2026-06-02)

| Shipped | Notes |
|---------|--------|
| `moveItemsToTrash` + `batchMutate` RPC | `db.ts`, `remoteStore.ts`, `itemQuickAccess.ts` |
| Hub optimistic trash + debounced reload | `PipelineHubView.tsx`, `dataChangeNotifier.ts` |
| Scoped classify batch report | `itemPipeline.ts`, `pipelineBatchReport.ts` |
| `TrashView` + sidebar entry | `TrashView.tsx`, `LeftSidebar.tsx`, `TrashTab.tsx` |

| Deferred | Task |
|----------|------|
| Explicit Re-enrich-only vs Full re-digest vs Classify-only buttons | This file |
| Home button parity | B3 / C2 |

## Worker prompt
> **V3-A4** per this file. **App-first** (Hub/Home flags). Update **only this file**.
