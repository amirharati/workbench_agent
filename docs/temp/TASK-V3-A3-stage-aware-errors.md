# TASK-V3-A3 — Stage-aware error labels & UI Consistency

**Status:** **Phase 1 done · Phase 2 in progress — worker session closed 2026-06-02**  
**Handoff:** Session 2026-06-02 shipped in commit after `cd4d0e3` (see program index). Master dogfood before **closed**.  
**Parent:** [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md)  
**Backlog:** D-25 lite, 05.C pipeline toasts, failure labels  
**Method:** **App-first (UI/UX)** — fix the lying toasts and unify the pipeline dictionary.  
**Worker:** Update **only this file** (+ code). No backlog/roadmap edits.

## Goal
The new pipeline orchestrator currently lies in its summary toasts (e.g., "357 fetched, 46 failed" when classification was actually skipped). The UI is also inconsistent with colors and naming across the Hub, Import Studio, and Inspector. 

We need a unified dictionary and honest reporting before we debug the backend further.

## The Standard Pipeline Dictionary
*   **Stages:** `Fetch`, `Extract` (or combine as `Enrich`), `Classify`, `Discover`.
*   **States:** 
    *   🟢 **Success:** (e.g., "Enriched", "Classified")
    *   🟡 **Skipped:** (e.g., "Skipped - Already enriched", "Skipped - No taxonomy")
    *   🔴 **Failed:** (e.g., "Failed - Rate limited", "Failed - Blocked by bot protection")
    *   🔵 **Pending:** (e.g., "Pending classify")

## Checklist

### Phase 1: Code Updates
- [x] **Fix Lying Toasts:** Update `itemPipeline.ts` / `PipelineProgressProvider.tsx` summary logic. Explicitly separate "Skipped" from "Failed". If classification skips due to empty taxonomy, say so.
- [x] **Unify Labels:** Update `singleLinkDigestLabels.ts` and `PipelineHubView.tsx` to strictly use the Dictionary above.
- [x] **Unify Colors:** Ensure consistent colors (Green=Success, Yellow/Gray=Skipped, Red=Failed, Blue=Pending) across all pipeline UI surfaces.

### Phase 2: Interactive Testing
- [x] **User feedback (2026-06-02):** Hub missing partial outcomes; import toast red despite mostly success.
- [x] **Iterate (2026-06-02):** Hub dynamic outcome chips; partial-success toast tone.
- [x] **Import bad-file UX (2026-06-02):** Unsupported JSON/CSV/HTML fails fast with schema text — no silent hang, no fake success (see `bookmarkFileImport.ts`).
- [ ] **Continue dogfood:** Confirm chips + green toast on next import batch; verify import **valid** large file still shows honest post-commit pipeline toast.

## Phase 1 implementation notes (2026-06-02)

**New:** `src/lib/pipeline/pipelineDictionary.ts` — stage labels, outcome colors, `isPipelineSkipMessage`, `resolvePipelineSummaryTone`, classify skip breakdown helpers.

**`buildPipelineMessage` (`itemPipeline.ts`):**
- Fetch stage: `N enriched` / `N skipped (fetch)` / `N failed (fetch)` — skipped no longer omitted.
- Classify stage: `N classified`, `N skipped (classify: …)`, `N failed (classify)`, `pending discover`; whole-run skip (`classification skipped (import taxonomy…)`) uses skip wording, not "failed".
- Embed/discover lines preserved when present.

**Tone (no red toast when only classify skipped):**
- `PipelineProgressProvider` batch modal + **Import Studio** toasts use `resolvePipelineSummaryTone` (skips / empty taxonomy ≠ error if fetch failures are zero).

**Hub / digest labels:**
- Summary chips + failure-stage filters use dictionary colors (green / yellow / red / blue).
- `singleLinkDigestLabels.ts` + `formatDigestProgressLabel` prefix stage names (`Fetch`, `Enrich`, `Classify`, …).

**Phase 2 follow-up (2026-06-02):**
- Hub summary row: **dynamic chips** for every `statusBadge` in scope (`buildHubOutcomeChips`) — includes `Summarized · no category`, `Pending classify`, failure labels, etc. Click chip → filter table by that exact label.
- Row badges now use **`resolvePipelineBadge`** (same as list/inspector logic) so chip labels match table.
- **`isPartialPipelineSuccess`**: import/batch toast is **green** when most work succeeded (e.g. 8 fetch failures vs 235+457 successes), not red ✗.

**Still optional:** `PipelineBatchReportPanel` color map, Home queue chips.

## Task return

| Phase | Done | App dogfood | Notes | Primary files | Next |
|-------|------|-------------|-------|---------------|------|
| **1** | **Yes** | User + worker | Dictionary, lying toasts, Hub chips, partial-success tone | `pipelineDictionary.ts`, `itemPipeline.ts`, `PipelineProgressProvider.tsx`, `PipelineHubView.tsx`, `singleLinkDigestLabels.ts` | — |
| **2** | **Partial** | **Master** | Import bad-file UX; Inspector digest → shared modal; chips/toast iterated 2026-06-02 | + `bookmarkFileImport.ts`, `ItemDigestQuickActions.tsx`, `ImportStudioView.tsx` | Batch report panel + Home chips; close task after dogfood |
| **Close?** | **No** | — | Phase 2 checklist has one open dogfood line | — | Master sets **closed** when satisfied |

**Suggested backlog line (master only):** *V3-A3: unified pipeline outcomes (toast/modal/chips); import unsupported-file errors honest.*

## Worker prompt
> **V3-A3** per this file. Execute Phase 1 (fix lying toasts and unify dictionary), then **pause** and ask me to test the app. Update **only this file**.

## Dogfood prompts (Phase 2)

Please try these and note **exact toast/modal text** + whether tone (green/red) felt right:

1. **Import Studio** — commit ~50 links with taxonomy **not** loaded: expect fetch/enrich counts, `classification skipped (import taxonomy in Settings)`, **not** a red toast if fetch failures are 0.
2. **Import Studio** — same with taxonomy loaded: expect separate classified / skipped (classify) / failed (fetch) counts.
3. **Hub** — bulk Re-digest selection: modal summary should match per-row report; skipped unchanged hashes should not inflate "failed".
4. **Hub** — Classify pending (small batch): classify-only summary with skip breakdown.
5. **Inspector** — single Re-digest: progress labels show stage names (`Fetch`, `Enrich`, …).

---

## Worker session handoff (2026-06-02)

**Branch:** `main` — builds on `cd4d0e3` orchestrator commit; session work committed 2026-06-02 (pipeline UI + import/trash + hub).  
**Master:** dogfood § Dogfood prompts → set **closed** when satisfied; optional follow-up: batch report panel, Home chips.

### Session intent

Dogfood-ready **bulk trash**, **import/trash reliability**, **extension UI noise**, **import file safety**, and **quick digest actions** in Inspector / side panel — mostly **Pillar A execution** + **C2 UX**, without starting **A5b import scale** or full **B4** queue refactors.

### Shipped in code (uncommitted unless noted)

#### A. Bulk trash & hub responsiveness (→ **V3-A4** partial)

| Change | Files (primary) |
|--------|------------------|
| `batchMutate` on remote store / worker RPC | `src/lib/db.ts`, `src/lib/storage/dbClient/remoteStore.ts`, `src/lib/storage/dbWorker/worker.ts` |
| `moveItemsToTrash` uses batch mutations + optional `knownItems` | `src/lib/itemQuickAccess.ts` |
| Hub: optimistic row removal, background trash, skip reload race | `src/components/dashboard/PipelineHubView.tsx` |
| Debounced `loadData` on `item.trash.bulk` | `src/App.tsx`, `src/lib/dataChangeNotifier.ts` |
| Dedicated trash UI surface | `src/components/dashboard/TrashView.tsx`, `LeftSidebar.tsx`, `TrashTab.tsx` |

#### B. Classify / digest scope on small Hub selections (→ **V3-B4** partial)

| Change | Files |
|--------|--------|
| `drainPendingClassifyQueue` default **false**; Hub passes scoped batch | `src/lib/pipeline/itemPipeline.ts`, `PipelineHubView.tsx` |
| Batch report built from selection `itemIds`, not only enrich map | `itemPipeline.ts`, `pipelineBatchReport.ts` |

#### C. Import + trash semantics (**A5b** scale still open)

| Change | Files |
|--------|--------|
| Re-import with skip **off** restores soft-trashed rows: clear `deletedAt`, `deleteTrashEntry`, `restoredFromTrash` | `src/lib/dbCore.ts`, `src/lib/db.ts` |
| Import summary / report outcome `'restored'` | `ImportStudioView.tsx`, `src/lib/pipeline/importReport.ts` |
| **Import file parsing** extracted + hardened | `src/lib/import/bookmarkFileImport.ts`, `ImportStudioView.tsx` |
| Valid exports: **no file/row caps**; full CSV/JSON/HTML walk with UI yields | `bookmarkFileImport.ts` |
| Bad exports: **schema probe** (~128 KB) fast-fail + clear multi-line errors + format help | same |

**Trash policy (confirmed in chat):**

| Action | Import skip ON | Import skip OFF |
|--------|----------------|-----------------|
| Soft trash → re-import | Withheld | Restore same row + **keep AI** |
| Permanent delete → import | Withheld | New rows, **no old AI** |

#### D. Extension console / CSP / preload noise

| Change | Files |
|--------|--------|
| `ExtensionPageUrlLink` / `BookmarkUrlLink` — `chrome.tabs.create`, no external `href` on extension pages | `BookmarkUrlLink.tsx` + dashboard consumers |
| Speculation-rules CSP experiments | Reverted / not shipped |

**Limitation:** `chrome://extensions` Errors cannot be cleared in code; preload during digest may still appear.

#### E. Inspector / side panel digest shortcuts (→ **V3-C2** partial)

| Change | Files |
|--------|--------|
| `ItemDigestQuickActions`: Re-digest, Embed, Classify, Embed+classify, Fetch in browser | `ItemDigestQuickActions.tsx` |
| Inspector + side panel wired; side panel in `PipelineProgressProvider` | `InspectorTab.tsx`, `SidePanelDigestPanel.tsx`, `App.tsx`, `SidePanelView.tsx` |

#### F. Pipeline / hub (A3 + same branch)

- `pipelineDictionary.ts`, `pipelineBadge.ts`, `pipelineHubQueries.ts`, `itemPipeline.ts`, `PipelineProgressProvider.tsx`, `PipelineHubView.tsx`, `ImportStudioView.tsx`
- **Committed earlier:** `cd4d0e3` — orchestrator refactor, import auto-start, debug UI

### A3-only slice (this task)

| Item | Where |
|------|--------|
| Dictionary + honest toasts/chips (Phase 1) | `pipelineDictionary.ts`, `itemPipeline.ts`, `PipelineHubView.tsx`, … |
| Import bad-file + success tone (Phase 2) | `bookmarkFileImport.ts`, `ImportStudioView.tsx` |
| Inspector digest → shared modal/tone | `ItemDigestQuickActions.tsx` |

### Beyond original scope

1. **BookmarkUrlLink** rollout across many dashboard surfaces  
2. Full **import parser** module + schema UI  
3. **TrashView** + sidebar  
4. Side panel **PipelineProgressProvider** wrap  
5. Import: no size caps on valid files (memory risk on multi‑GB — acceptable)

### Deferred → master session review

| Item | Task / note |
|------|-------------|
| Import scale 10k+ (waves, checkpoint) | [`TASK-V3-A5b-import-scale.md`](TASK-V3-A5b-import-scale.md) |
| Classify queue D-27 (staged consumer) | [`TASK-V3-B4-classify-queue-d27.md`](TASK-V3-B4-classify-queue-d27.md) — scoped drain only |
| Staged pipeline queues | Discussion only |
| Rate limit / retry | **V3-A2** |
| **A3 close-out** | Batch report panel, Home chips, import report vocabulary, tests |
| Bulk action semantics | **V3-A4** — trash batch only |
| Inspector shortcuts | **V3-C2** — `ItemDigestQuickActions` partial |
| Tests (import restore, parser, tone) | None added |
| **Commit** | Done 2026-06-02 (with program index sync) |
| Doc hygiene | A5 → A5b in program index |
| Huge invalid JSON passing probe | Still pays `JSON.parse` |

### Key files & smoke

```text
src/lib/import/bookmarkFileImport.ts
src/lib/itemQuickAccess.ts
src/lib/dbCore.ts / src/lib/db.ts
src/components/dashboard/PipelineHubView.tsx
src/components/dashboard/ImportStudioView.tsx
src/components/dashboard/ItemDigestQuickActions.tsx
src/components/dashboard/BookmarkUrlLink.tsx
src/components/dashboard/TrashView.tsx
```

- [ ] Import: valid large file → all rows; honest post-commit toast  
- [ ] Import: random json/csv → fast error, responsive  
- [ ] Soft trash → re-import skip off → visible + AI kept  
- [ ] Permanent delete + skip on/off  
- [ ] Hub: bulk trash fast; classify does not drain global queue  
- [ ] Inspector: Re-digest / Embed+classify  
- [ ] Extension: less CSP/preload noise on dashboard links  

### Suggested master actions

1. Review & **commit** (or split) uncommitted work.  
2. Update [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md) index (A3 partial, A4/C2/B4 partial, A5b queued).  
3. Task returns: **C2**, **A4**; close A3 when dogfood done.  
4. `backlog.md` / `OVERVIEW.md` one-liners if needed.

### Worker prompt (next session)

> Pick **one** queued brief (`V3-A5b`, `V3-B4`, `V3-A2`, …). Update **only that task file** + code. Do not edit backlog unless asked.

*Session closed by worker. Master owns roadmap truth.*
