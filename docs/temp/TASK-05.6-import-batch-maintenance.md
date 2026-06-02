# TASK-05.6 — Import post-processing + batch maintenance (W3 / W4)

**Status:** **done** — MVP shipped 2026-05-27 (master docs synced)  
**Depends on:** [TASK-05.5](TASK-05.5-single-link-digest.md) (`runSingleLinkDigest`, `enrichBatch`, hash-aware skip)  
**Design:** [V2-PRODUCT-DESIGN-SPEC.md](V2-PRODUCT-DESIGN-SPEC.md) § W3, W4, §15 (05.6)  
**Policy:** [V2-DEFERRED-TRACKER.md](V2-DEFERRED-TRACKER.md) — no new `Item` fields (favorites/pins/trash/provenance → D-01…D-05, V2-B)

---

## Documentation rule (required)

**Worker session:**

- **Only update this file** (`TASK-05.6-import-batch-maintenance.md`) — acceptance checks, return template, decisions.
- **Do not edit** `docs/backlog.md`, `docs/OVERVIEW.md`, `docs/temp/README.md`, umbrella `TASK-05-v2-product-ux.md`, or design spec.

**Master session** updates higher-level docs after your return.

---

## Goal

Close **W3** and **W4** product gaps using **existing V1 pipeline** (no dev-hub requirement for normal users):

| Workflow | User story |
|----------|------------|
| **W3** | After Import Studio **Commit to DB**, user can optionally **process imports** (enrich → classify) with visible progress, confirmation, report, and Home digest reflecting pending work. |
| **W4** | User can **re-run pipeline in batch** on a scoped set (e.g. “not enriched”) from product UI—not only per-item digest (05.5) or dev modals. |

**Reuse 05.5:** Core fetch in `enrichOne`; batch via `runBatchDigest` → `enrichBatch` + `classifyIncremental`. Single-item via `runSingleLinkDigest` → `enrichOne` + classify.

---

## Product policy — explicit pipeline vs “user signals” (read before coding)

**05.6 is about two explicit paths, not a general “re-run on every post-update” engine:**

| Path | Meaning |
|------|---------|
| **Raw import** | Import Studio commit writes **bookmarks only** (URL, title, placement). Rows exist in DB; enrichment/classify may be **none** until user opts in. |
| **Fetch + AI workflow** | Separate, **user-initiated** step: post-commit checkbox + confirm panel and/or Home batch button and/or Inspector **Run digest** (05.5). Hash-aware skip; saved snapshots re-fetch + compare. |

**Out of scope for 05.6 (needs design pass — do not implement ad hoc):**

A future **signal → pipeline** map: which user actions should enqueue enrich/classify/embed, and which should **not**. Follow-up ID: **D-26**.

**Worker rule (honored):** No new auto-digest hooks on `updateItem`, collection membership, or category accept/reject. `App.handleUpdateBookmark` / add-bookmark auto-digest (05.5) unchanged—not extended.

---

## What exists now (post-05.6)

| Area | Shipped |
|------|---------|
| Import Studio | Tools nav **Import Studio** + Bookmarks Import button; **Offer pipeline after commit** (default **on**); post-commit **confirm panel** (all links selected, filter, deselect); **import report overlay**; keep-tab-open during run |
| Bulk import DB | `bulkImportBookmarks` → `{ created, merged, skipped, createdItemIds, affectedItemIds, affectedItems }` |
| Batch runner | `runBatchDigest` in `batchDigest.ts`; `buildImportReport` + `ImportReportOverlay` |
| Home digest | **Process not enriched (N)** → `runBatchDigest` (50 enrich / 25 classify cap) |
| Fetch core | `enrichOne`: global **re-fetch + contentHash compare** when prior snapshot exists; **preserve prior on suspicious fetch** + `pendingFetchReview` + optional `review-pending.md` |
| Inspector | 05.5 Run digest / Retry (unchanged) |
| Dev hub | EnrichmentPanel on Import Studio unchanged (05.8 gate later) |

---

## Open questions — final answers

| # | Question | **Decision** |
|---|----------|--------------|
| **Q1** | Pipeline checkbox default **on** or **off**? | **On** (changed during session from task default off) |
| **Q2** | Process **created only** or **created + merged**? | **Created + merged** (`affectedItemIds` / `affectedItems`) |
| **Q3** | First Home batch button queue? | **not_enriched** only |
| **Q4** | Max items per Home batch click? | **50** enrich / **25** classify |
| **Q5** | Inspector **Classify only**? | **No** — rely on Run digest |
| **Q6** | Import batch: enrich then classify? | **Yes** — one flow |
| **Q7** | Keep dev **EnrichmentPanel** on Import Studio? | **Yes** |
| **Q8** | Auto-digest on every bookmark update? | **Deferred** — 05.5 behavior unchanged |

**Import UX decisions (session):**

- Post-commit: **confirm panel** before pipeline (not immediate run); user can deselect/filter links.
- During pipeline: **keep tab open** warning + `beforeunload`; Back disabled while running.
- After job: **import report overlay** (stats + scrollable per-link results + one-by-one review); clears preview session on Done.

---

## Architecture notes (for master / follow-ups)

### Shared fetch core (yes)

All paths use **`enrichOne`** + **`checkEligibility`** for fetch, hash compare, suspicious-fetch protection. No duplicated fetch logic.

### Orchestration (two wrappers — not fully unified)

| Entry | Runner |
|-------|--------|
| Inspector, add bookmark, App save | `runSingleLinkDigest` → `enrichOne` + gated classify |
| Import Studio, Home batch | `runBatchDigest` → `enrichBatch` → `enrichOne` + batch classify |
| Dev hub | `enrichBatch` / `enrichOne` direct (enrich-focused) |

**Known gap:** single digest uses `needsClassifyForDigest` before classify; batch uses `classifyIncremental` skip rules only. **Follow-up:** optional `runPipelineDigest(itemIds)` unification (not done in 05.6).

### Enrichment record additions (not `Item` schema)

`ItemEnrichment`: `pendingFetchReview`, `pendingFetchReviewReason`, `reviewRawRef` — for suspicious re-fetch while keeping prior summary. Accept/reject UI → **D-25**.

---

## Acceptance criteria

### Required — all met

- [x] Import Studio: optional **offer pipeline after commit** (uses **`affectedItemIds`** — new + merged)
- [x] Confirm step: user can **unselect/filter** links before run (default all selected)
- [x] User sees **progress + completion** (inline + toasts + **import report overlay**)
- [x] Home: **Process not enriched (N)** runs real pipeline
- [x] Batch **cap** on Home; import uses `processAll` for confirmed set
- [x] Home digest refreshes after batch (`notifyDataChanged` / hooks)
- [x] Import Studio reachable from **Tools → Import Studio**
- [x] Re-import merged links: **re-fetch + compare**; suspicious fetch **keeps prior** data
- [x] `npm run build` passes
- [x] Dev hub behavior unchanged

### Stretch — deferred

- [x] Second Home queue batch button (`pending_classify`) — **05.C**
- [ ] Inspector classify-only without re-fetch — optional package 5 / future
- [x] Cancel in-flight product batch (abort UI) — **05.C** (enrich phase only)
- [ ] Unified `runPipelineDigest` (single + batch one orchestrator)
- [ ] Suspicious-fetch **review/accept UI** (D-25)
- [ ] Chunked import progress for 5k+ rows

---

## Key files (actual touch list)

| Action | Path |
|--------|------|
| **Create** | `src/lib/pipeline/batchDigest.ts` |
| **Create** | `src/lib/pipeline/importReport.ts` |
| **Create** | `src/components/dashboard/ImportReportOverlay.tsx` |
| **Edit** | `src/lib/pipeline/index.ts` |
| **Edit** | `src/lib/db.ts` (`BulkImportAffectedItem`, `affectedItemIds`, `affectedItems`) |
| **Edit** | `src/lib/enrichment/eligibility.ts` (prior-fetch re-compare) |
| **Edit** | `src/lib/enrichment/fetchService.ts` (`preservePriorOnSuspiciousFetch`) |
| **Edit** | `src/lib/enrichment/rawBodyStore.ts` (`writeReviewRawBody`) |
| **Edit** | `src/lib/enrichment/types.ts` (batch + review fields) |
| **Edit** | `src/components/dashboard/ImportStudioView.tsx` |
| **Edit** | `src/components/dashboard/HomeView.tsx` |
| **Edit** | `src/components/dashboard/layout/DashboardLayout.tsx` |
| **Edit** | `src/components/dashboard/layout/MainContent.tsx` |
| **Edit** | `src/components/dashboard/layout/LeftSidebar.tsx` (Tools nav) |
| **Unchanged** | `PipelineDevView`, `EnrichmentTestModal` (except shared `enrichOne` behavior) |

---

## Testing hints (manual)

1. Import 5 **new** URLs → commit, pipeline **on** → confirm panel → Run → report shows per-link status.
2. Re-import same file (**merged only**) → confirm still lists links → pipeline re-fetches + compare (unchanged vs enriched).
3. Re-fetch while logged out on URL that had good summary → report **Review needed**; prior summary kept.
4. Home **Process not enriched (N)** with N > 50 → cap + “more remain” in message.
5. No API key → import + report work; classify skipped with clear message.
6. Inspector single-item digest still works (05.5 regression).
7. **Tools → Import Studio** opens same flow as Bookmarks → Import.

---

## Task 05.6 return

- **Shipped (W3):** Import Studio **Offer pipeline after commit** (default **on**). Commit saves first; if opted in, **confirm panel** on all **`affectedItems`** (new + merged) with filter/select; **Run pipeline (N)** → `runBatchDigest(processAll)` with progress + keep-tab-open UX; **import report overlay** with stats, filters, per-link status, Prev/Next review. Import also under **Tools → Import Studio**.
- **Shipped (W4):** Home **Process not enriched (N)** → `runBatchDigest` (50/25 cap, toasts, refresh).
- **Shipped (pipeline hardening):** Global in `enrichOne`: prior snapshot **re-fetch + contentHash compare**; **preserve prior enrichment** on suspicious fetch (login wall, errors) with `pendingFetchReview` + optional review raw file; import report **Review needed** status.
- **User answers (Q1–Q8):** Q1 **on**; Q2 **created + merged**; Q3 not_enriched; Q4 50/25; Q5 no classify-only; Q6 enrich→classify; Q7 keep dev panel; Q8 defer auto-digest policy.
- **Files touched:** See key files table above.
- **Deviations / deferred:** Stretch items (second queue button, batch cancel, unified orchestrator, D-25 review UI). Orchestration still split `runSingleLinkDigest` vs `runBatchDigest` (shared `enrichOne` only). `ItemEnrichment` review fields added (not `Item` schema).
- **Suggested master doc updates:** Mark 05.6 **done** in `TASK-05-v2-product-ux.md`, `docs/temp/README.md`, backlog D-21; note D-26, D-25 follow-ups; document Tools nav + import report in OVERVIEW if desired.
- **Known gaps / follow-ups:** D-25 suspicious-fetch review UI; D-26 signal→pipeline matrix; unify `runPipelineDigest`; batch classify gate parity with `needsClassifyForDigest`; narrow 05.5 auto-digest on save; pending_classify Home batch button; batch abort UI.

---

## After 05.6 (master planning — do not implement here)

| ID | What |
|----|------|
| **05.7** | Shell polish (W7) — scope chips, persisted splits |
| **05.8** | Advanced / dev gate (W8) |
| **D-25** | Auth/suspicious fetch quality + review/accept UI |
| **D-26** | User-signal → pipeline policy matrix |
| **D-40** | Presentation polish (can run anytime) |
| **D-41** | Search result clicks |
| **05.B / D-01…D-05** | Schema: favorites, provenance |

---

*Last updated: 2026-05-27 — MVP complete; master sync pending.*
