# TASK-V3 — Program breakdown (high level)

**Status:** **active planning** — use for worker/session picking  
**Last updated:** 2026-05-30  
**Umbrella:** [`TASK-V3-pipeline-workflow.md`](TASK-V3-pipeline-workflow.md)  
**Hub UI detail:** [`TASK-V2-pipeline-hub.md`](TASK-V2-pipeline-hub.md)  
**Backlog index:** [`V2-DEFERRED-TRACKER.md`](V2-DEFERRED-TRACKER.md) · [`backlog.md`](../backlog.md)

---

## Two pillars (your dogfood framing)

| Pillar | Problem today | V3 outcome |
|--------|---------------|------------|
| **A — Execution reliability** | Bulk import + batch pipeline **unreliable**: errors (incl. **rate limit / retry**), slow, often **works if you retry one-by-one**; error labels vague; hard to know which **stage** failed (fetch vs LLM vs classify) | Predictable batch behavior, honest retries/backoff, **stage-aware** messages users can act on |
| **B — Discovery loop & UX** | **Discovery phase feels complex and vague**; hard to run a **tight loop** for new categories without over-calling LLM; signals unclear (user vs automatic: unclassified, generic, stale, etc.) | **Simple discover workflow** with explicit **fair-game rules**, caps, and copy — research + iterate per slice |

**Not V3:** V4 multi-device sync, V3-scale AI (chunk RAG / ANN / DAG — backlog “AI — V3” park).

**Method per task:** **Spike / repro → hypothesis → small fix → dogfood → task return** (expect 1–3 sessions per task, not one-shot).

---

## Doc workflow (same as V2.2 / V2.3)

| Layer | Who updates | Files |
|-------|-------------|--------|
| **Per-task brief** | **Worker only** | `TASK-V3-A1-…md`, `TASK-V3-B1-…md`, etc. — checklist, task return, findings |
| **Program index** | **You (review)** | This file — status column, session order, deferrals |
| **Umbrella + roadmap** | **You (review)** | `TASK-V3-pipeline-workflow.md`, `TASK-V2-POST-ROADMAP.md`, `TASK-POST-V2.md` |
| **Backlog / tracker** | **You (review)** | `backlog.md`, `V2-DEFERRED-TRACKER.md`, `OVERVIEW.md` — one-line when a task **closes** |

**Worker rules:**

1. Open **one** task file from the table below (not the breakdown body).
2. **Branch A (`V3-A*`):** repro/fix in **CLI first** where applicable, then **validate in app** — see § Branch A method.
3. Ship code + fill **Task return** in that file only (note CLI artifact paths + app dogfood).
4. Do **not** edit `backlog.md`, `OVERVIEW.md`, or tracker unless the user explicitly asks.
5. At end: set task **Status** to `in progress` / `closed` in the task file.

**Your rules after review:**

1. Read task return → accept or redirect.
2. Tick task row in **Task file index** (below) + adjust sequencing here if needed.
3. Mirror **closed** items to backlog/tracker in one line each (no duplicate specs).

---

## Task file index

| ID | Status | Task file |
|----|--------|-----------|
| **V3-A1** | ready | [`TASK-V3-A1-repro-failure-taxonomy.md`](TASK-V3-A1-repro-failure-taxonomy.md) |
| **V3-A2** | queued | [`TASK-V3-A2-rate-limit-retry-policy.md`](TASK-V3-A2-rate-limit-retry-policy.md) |
| **V3-A3** | queued | [`TASK-V3-A3-stage-aware-errors.md`](TASK-V3-A3-stage-aware-errors.md) |
| **V3-A4** | queued | [`TASK-V3-A4-bulk-action-semantics.md`](TASK-V3-A4-bulk-action-semantics.md) |
| **V3-A5** | queued | [`TASK-V3-A5-import-pipeline-reliability.md`](TASK-V3-A5-import-pipeline-reliability.md) |
| **V3-A6** | queued | [`TASK-V3-A6-orchestrator-d44.md`](TASK-V3-A6-orchestrator-d44.md) |
| **V3-B1** | ready | [`TASK-V3-B1-discover-fair-game.md`](TASK-V3-B1-discover-fair-game.md) |
| **V3-B2** | queued | [`TASK-V3-B2-discover-ux-loop.md`](TASK-V3-B2-discover-ux-loop.md) |
| **V3-B3** | queued | [`TASK-V3-B3-home-to-hub.md`](TASK-V3-B3-home-to-hub.md) |
| **V3-B4** | queued | [`TASK-V3-B4-classify-queue-d27.md`](TASK-V3-B4-classify-queue-d27.md) |
| **V3-B5** | queued | [`TASK-V3-B5-user-signals-d26-w6.md`](TASK-V3-B5-user-signals-d26-w6.md) |
| **V3-B6** | queued | [`TASK-V3-B6-discover-perf.md`](TASK-V3-B6-discover-perf.md) |
| **V3-C1** | queued | [`TASK-V3-C1-hub-d25-d42.md`](TASK-V3-C1-hub-d25-d42.md) |
| **V3-C2** | queued | [`TASK-V3-C2-inspector-hub-shortcuts.md`](TASK-V3-C2-inspector-hub-shortcuts.md) |
| **V3-C3** | queued | [`TASK-V3-C3-retire-dev-modals.md`](TASK-V3-C3-retire-dev-modals.md) |

---

## Pillar A — Execution reliability

### Branch A method: **CLI first → app validate**

Pipeline backend issues are easier to repro in **CLI**; **app** confirms worker RPC, UI, and paths CLI does not cover.

| Step | Where | What |
|------|--------|------|
| **1 — CLI** | `npm run classify-incremental`, `npm run discover-incremental`, fetch experiments as needed | Batch vs `--max 1`, rate limits, save artifacts under `data/experiments/categorize/` |
| **2 — App** | Extension: Import post-commit, Home batch, Hub bulk, Categories lane | Same failure modes? worker/RPC-only? UI labels wrong? |
| **3 — Fix** | Prefer **`src/lib`** (shared with app); extend CLI only for regression harness | Re-run CLI, then app dogfood before closing task |

**CLI cannot replace app for:** `batchDigest`, `PipelineProgressProvider`, `bulkImportBookmarks` post-commit, OPFS/worker RPC.

**Reference:** [`CLI_WORKFLOW.md`](../CLI_WORKFLOW.md) — CLI track for fast iteration; app for integration truth.

**B branch (discovery):** mostly **app + spec**; optional `discover-incremental` CLI to validate fair-game counts (not required for B1).

---

### Known issues (docs + dogfood, not exhaustive)

| Symptom | Likely areas | Backlog / IDs |
|---------|--------------|---------------|
| Batch fails; single-item retry works | `batchDigest`, `PipelineProgressProvider`, worker RPC, txn size | P0, **D-44** |
| Rate limit errors in batch; unclear retry | `llmBatchRetry`, OpenRouter client, concurrency | D-10 follow-up, hub deferred parallelism |
| Import commit → post-process pipeline flaky | `ImportStudioView`, `bulkImportBookmarks`, post-import confirm | **D-38**, W3 |
| “Re-digest” also classifies | `PipelineHubView` bulk flags | Hub issues |
| Generic / wrong failure labels | `failureLabels`, `errorMessages`, enrichment vs classify paths | **D-25**, Tier F hygiene |
| Slow batch; feels stuck | Concurrency, catalog size, embed/classify batching | D-14 workers (optional) |
| Partial failure silent or “Skipped” unclear | Batch report, `importReport`, queue outcome panels | 05.6 leftovers |

---

### V3-A1 — Repro & failure taxonomy (research)

**Task file:** [`TASK-V3-A1-repro-failure-taxonomy.md`](TASK-V3-A1-repro-failure-taxonomy.md)  
**Order:** **CLI repro first** → **app validate** → merged taxonomy in task return.

---

### V3-A2 — Rate limit, retry, and backoff policy (research → policy)

**Goal:** Batch paths behave like “retry with backoff” instead of “fail the run, user retries manually.”

| Questions to answer |
|---------------------|
| When do we **re-batch** vs **sequential** vs **pause**? (see existing `llmBatchRetry`) |
| Per-provider limits (OpenRouter): max in-flight, batch size, cooldown after 429 |
| User-visible: “Rate limited — retrying in 30s (attempt 2/5)” vs opaque error |
| Import post-commit: same policy as Hub? |

**Deliverables:** Written policy (1 page); minimal code change for highest repro (likely 429).  
**Backlog:** Parallel LLM batches deferred in hub; OpenRouter caching optional later.

---

### V3-A3 — Stage-aware error labels & batch report (iterative)

**Goal:** User sees **which stage failed** and a **plain-language** next step (not raw API text).

| Slice | Examples |
|-------|----------|
| Map errors to stage | Use enrichment `failureCategory`, classify `pending_discover` / `manual_review`, LLM parse errors |
| Batch report rows | Title, stage badge, short label, “Retry fetch” / “Retry classify” action hint |
| Import pipeline report | Same labels on Import Studio post-commit panel |
| LLM-stage pickup | When classify/discover LLM returns structured error / skip, surface in UI (not only `console`) |

**Backlog:** D-25 lite (fetch review), 05.C batch error toasts (pipeline-only), package 5 hygiene  
**Touches:** `failureLabels.ts`, `errorMessages.ts`, `QueueOutcomePanel`, Hub batch report, `ImportStudioView`

---

### V3-A4 — Bulk action semantics (enrich vs digest vs classify)

**Goal:** No surprise “I only wanted enrich” → also reclassified.

| Deliverable |
|-------------|
| Split actions: **Re-fetch / Re-enrich only** vs **Full re-digest** vs **Classify only** vs **Discover gap-fill** |
| Confirm copy when action chains stages |
| Hub + Home buttons use same names |

**Backlog:** Hub issue “Bulk Re-digest also classifies”; Inspector classify-only (05.C); **D-44** gate parity later

---

### V3-A5 — Import → pipeline reliability (iterative)

**Goal:** After **Commit to DB**, optional process-N flow is as reliable as Hub bulk.

| Step |
|------|
| Repro import → pipeline confirm → batch (same taxonomy as A1) |
| Progress + cancel for large N (ties **D-38** 5k) |
| Per-row outcomes in import report |

**Backlog:** **D-38**, W3, chunked import progress  
**Touches:** `ImportStudioView`, `bulkImportBookmarks`, `batchDigest` / `PipelineProgressProvider`

---

### V3-A6 — Orchestrator & cancel (after A1–A3 stable)

**Goal:** One mental model for single + batch; classify mid-batch cancel.

**Backlog:** **D-44**, classify `AbortSignal`, `needsClassifyForDigest` parity, narrow 05.5 auto-digest (**D-26**)

**Defer until:** A2/A3 dogfood clean — refactor without new mystery bugs.

---

## Pillar B — Discovery loop & UX

### Known issues (docs + dogfood)

| Symptom | Notes |
|---------|--------|
| Discover vs classify scope confusing | Counts, “who got processed”, fair-game — partial fixes in hub |
| Too complex to run “just find new categories” | Categories lane + dev hub overlap |
| Unclear **who** should enter discover pool | unclassified, generic leaf, rejected, user-edited — **TBD** |
| Slow / heavy (full catalog every call) | Backend; shortlist deferred |
| D-26 / D-27 / W6 undecided | Blocks consistent Home + hub copy |

---

### V3-B1 — Signal matrix & fair-game spec (research — do first in pillar B)

**Goal:** Written rules before more UI — what auto-qualifies for discover vs classify vs skip.

| Signal (draft — validate in dogfood) | Typical use |
|--------------------------------------|-------------|
| Never classified / no accepted link | Discover pool candidate |
| Only `general` / fallback leaf | Discover or re-classify |
| User rejected all suggestions | Discover? re-run? (**W6**) |
| User changed category manually | **D-26** — re-enqueue? |
| Enrich failed / no text | Exclude from discover LLM |
| Bulk import just landed | **D-27** — cap + cooldown |
| `pending_discover` from classify | Classify → discover handoff |

**Deliverables:**

1. One-page **fair-game** table (include / exclude / cap per run)  
2. Align with `categorizationFairGame.ts`, `discoverPolicy`, queue reconcilers  
3. Open questions list for you to approve  

**Backlog:** **D-27**, **D-26**, **W6**, classify queue semantics

---

### V3-B2 — Discover run UX — “simple loop” (iterative)

**Goal:** One obvious flow: *select scope → see pool size → run discover → see what changed*.

| UI slice | Intent |
|----------|--------|
| Pre-flight panel | “**N items** in discover pool” + why (expandable signal breakdown) |
| Run | Single primary button; max items / max batches visible |
| Result | New leaves proposed + items assigned; clear **skipped** reasons |
| Next step | CTA: “Classify remaining” / “Review suggestions” — not 4 equal buttons |

**Backlog:** Categories lane polish, D-42 slice 2, hub issues (scope/count copy)  
**Touches:** `PipelineHubCategoriesLane`, `discoverTaxonomy`, `pipelineHubQueries`

---

### V3-B3 — Home digest + entry points (thin dashboard)

**Goal:** Home stays **thin**; deep work in hub with filters.

| Deliverable |
|-------------|
| Digest cards → **Hub** with filter (not Bookmarks-only browse) |
| Copy aligned with B1 fair-game (“N ready for discover”) |
| Remove duplicate/confusing batch if hub is canonical |

**Backlog:** Slice 3 entry points, **D-42**, W4 open items

---

### V3-B4 — Classify queue semantics & copy (D-27)

**Goal:** User understands **pending_classify** vs **discover** vs **classify ready**.

| Step |
|------|
| Document state machine (1 diagram or table) |
| Home + hub strings from B1/B2 |
| Optional: reconcile caps vs `processAll` |

**Depends on:** B1 approved  
**Backlog:** **D-27**, Tier A

---

### V3-B5 — User-signal policy (D-26 + W6)

**Goal:** Category edits and rejections have predictable pipeline effects.

| Decisions |
|-----------|
| User sets primary category → enqueue classify? embed? |
| Un-accept / reject all → rediscover? |
| Change category on accepted link → ? |

**Deliverables:** Policy one-liners + minimal Inspector/hub actions  
**Backlog:** **D-26**, **W6**, narrow 05.5 auto-digest

---

### V3-B6 — Discover/classify performance (optional, after B2)

**Goal:** Faster runs without accuracy regression.

| Ideas (research) |
|------------------|
| Catalog shortlist / top-K leaves for LLM |
| Embedding ordering for shortlist (**D-11**, V3-scale AI overlap) |
| Prompt caching (hub deferred) |

**Backlog:** Classify catalog slimming, 04-defer, D-14 workers

---

## Pillar C — Hub & cross-cutting (weave through A/B)

Not a third problem — **container** for work that lands in Tools → Pipeline.

| Task | When |
|------|------|
| **V3-C1** — Enrichment hub finish (**D-42**, **D-25** Accept prior / Force re-fetch) | After A3 labels; parallel with A4 |
| **V3-C2** — Inspector ↔ hub shortcuts | After B3 entry points |
| **V3-C3** — Replace dev Enrich/Results modals with hub paths | Late V3 |

---

## Suggested session order

```text
A1 repro taxonomy ──► A2 rate limit policy ──► A3 error labels
        │                                      │
        └──────────────► A4 bulk semantics ──► A5 import pipeline
                                      │
B1 signal matrix ──► B2 discover UX loop ──► B3 Home → hub
        │                    │
        └──── B4 D-27 copy ──┴── B5 D-26/W6
                                      │
                              A6 D-44 orchestrator (late)
                              B6 perf (optional)
```

**Practical start:** **V3-A1** (CLI → app) then A2→A3; **V3-B1** can run in parallel (app/spec, not CLI-gated).

---

## Backlog ID → V3 task map

| ID | V3 task(s) |
|----|------------|
| **D-44** | A6 |
| **D-27** | B1, B4 |
| **D-26** | B1, B5 |
| **W6** | B5 |
| **D-25** | A3, C1 |
| **D-42** | C1, B2, B3 |
| **D-38** | A5 |
| **D-11** | B6 (optional) |
| **D-14** | A2/A6 (optional) |
| **05.C** batch toasts / classify-only | A3, A4 |
| **D-10** fetch / rate limits | A2, A3 |
| Failure stats UI | A3 |
| **04-defer** search tuning | Out of V3 pipeline program |

---

## Worker prompt template (per task)

> Open the task file from **Task file index** (e.g. [`TASK-V3-A1-repro-failure-taxonomy.md`](TASK-V3-A1-repro-failure-taxonomy.md)).  
> Follow the **Worker prompt** at the bottom of **that file only**.  
> Do **not** edit this breakdown, `backlog.md`, or tracker.

---

## Task return block (copy per session)

| Field | Value |
|-------|-------|
| Task ID | e.g. V3-A2 |
| Phase | spike \| fix |
| Repro steps | |
| Root cause / policy decision | |
| Shipped | |
| Deferred | |
| Next task | |

---

*Parent checklist remains in [`TASK-V3-pipeline-workflow.md`](TASK-V3-pipeline-workflow.md); this file is the session-level breakdown.*
