# TASK-V2.3 — Quick wins (non-pipeline)

**Status:** ✅ **Tier 1 closed** — 2026-05-30 (Tier 2+ optional)  
**Last updated:** 2026-05-30  
**Parent:** [`TASK-V2-POST-ROADMAP.md`](TASK-V2-POST-ROADMAP.md)  
**Rule:** If it changes **enrich/classify/discover batch** or **PipelineProgressProvider** → **V3**, not here.

**Multi-device sync is V4** (not V2.4) — see [`TASK-V4-sync-replicas.md`](TASK-V4-sync-replicas.md). V2.x = storage (V2.2) + quick wins (V2.3) only.

---

## Tier 1 — closed

| ID | Task | Status |
|----|------|--------|
| **D-41** | Search result click → Inspector vs tab | ✅ 2026-05-30 |
| **D-41b** | Search query persists across refresh / tab switch | ✅ 2026-05-30 |
| **Shell** | Right panel collapse persisted | ✅ already via `shellLayoutState` (`workbench-shell-layout`) |
| **Hygiene** | Toasts for import / backup / loadData failures | ✅ 2026-05-30 — `userNotify` + Import Studio commit + App startup paths |
| **05.C** | `verifyBackup` forward-compat warnings | ✅ 2026-05-30 — `backupVerify.ts`, console + restore info toast |
| **SQL** | Index / hot query pass | ⏸ deferred — perf-only; do in V3+ or ad hoc |

---

## Tier 2 — still open (optional)

| ID | Task | Effort |
|----|------|--------|
| **D-38** | Import Studio: invalid row preview + skip count | M |
| **D-43** | AI Ask: clearer “no selection” empty state | S |
| **IDE** | Scope chip polish (05.7 partial) | M |
| **05.B** | Trash 30-day auto-purge | M |
| **05.8** | Move dev hub entry to Settings > Advanced | S |

---

## Explicitly in V3 (do not do in V2.3)

- D-42 Enrichment Hub finish, Home → hub links  
- D-25 fetch review actions  
- D-26 / D-27 / W6 category + queue policy  
- D-44 `runPipelineDigest` / batch orchestrator  
- Batch error toasts for **classify/discover/enrich batch**  
- Classify mid-batch cancel  
- Bulk “re-digest also classifies”  
- Auto-embed after enrich (D-11) — pipeline policy  

---

## Task return — Tier 1 wrap-up (2026-05-30)

| Field | Value |
|-------|-------|
| **Tier 1** | Closed (SQL indexes deferred) |
| **Hygiene** | `userNotify.ts` registered from `ToastProvider`; App: worker start, backup bootstrap, conflict check, onboarding, `loadData`; Import Studio: commit failure toast |
| **05.C** | `collectBackupVerifyWarnings()`; `verifyBackup` returns `warnings[]`; Settings restore shows first warning as info toast |
| **Shell** | No code change — `rightPanelCollapsed` already in `patchShellLayout` → localStorage |

### Files (Tier 1 wrap-up session)

| Area | Files |
|------|--------|
| Verify | `backupVerify.ts`, `db.ts`, `dbCore.ts`, `backupCoordinator.ts` |
| Toasts | `userNotify.ts`, `ToastContainer.tsx`, `App.tsx`, `ImportStudioView.tsx`, `SettingsView.tsx` |

---

## Task return — D-41 + search persistence (2026-05-30)

| Field | Value |
|-------|-------|
| **Items shipped** | **D-41** interaction polish · **D-41b** query restore on refresh / tab switch |
| **Product decision** | **Single click** → select + Inspector. **Double-click / Enter / Open tab** → item tab. Search chrome **pinned at top** of Inspector on search surfaces. |
| **Persistence model** | Tab title: `globalTabState` search tab `query` (localStorage). Input + results: `useLibrarySearch` (in-memory). Last successful query: `workbench-search-last-query`. Sync on tab activate + Tools → Search entry. |
| **Root cause (D-41b)** | Tab query restored from `workbench-global-tabs` on refresh; `librarySearch.state.query` always started `''`. One-shot mount hydration missed the common case (another tab active on load → user clicks search tab → title showed query, bar empty). |
| **Not changed** | Pipeline batch/classify, search ranking, Cmd+K palette, Ask tab grounding |

### Files touched (D-41)

| Area | Files |
|------|--------|
| D-41 UX | `InspectorTab.tsx`, `ProductSearchView.tsx`, `RightPanel.tsx`, `DashboardLayout.tsx` |
| D-41b persistence | `useLibrarySearch.ts`, `GlobalTabSystem.tsx`, `DashboardLayout.tsx`, `MainContent.tsx` |

---

## Next milestone

**V3** — [`TASK-V3-pipeline-workflow.md`](TASK-V3-pipeline-workflow.md) (P0 batch reliability).  
Optional: pick **one Tier 2** item here before V3 if you want more polish.

---

## Worker prompt (Tier 2 or V3)

> **V3:** Start [`TASK-V3-pipeline-workflow.md`](TASK-V3-pipeline-workflow.md) P0 — batch reliability. Do not edit pipeline unless on V3 brief.  
> **V2.3 Tier 2:** Pick one row from Tier 2 table above; update this file only.
