# TASK-V3 — Program breakdown (high level)

**Status:** **active** — orchestrator + UI reliability wave shipped 2026-06-02  
**Last updated:** 2026-06-03 (master sync — discover 1a done, code uncommitted)  
**Commits:** `cd4d0e3` (orchestrator) · `5426d0c` (pipeline UI) · `de7e81a` (temp cleanup) · *map→reduce discover code in working tree, not yet committed*  
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

## Product policy — staged AI (master, 2026-06-03)

**Default:** Do **not** run LLM pipeline stages automatically after user actions (import, project assign, edits, etc.). **Stage** work and show **hints** (“N ready to enrich / discover / classify”) so the user explicitly starts a run.

| Why | Implication |
|-----|-------------|
| **Cost** | No surprise OpenRouter spend |
| **Extension** | User must keep tab open; auto batch on import fights that model |

| Topic | Decision |
|-------|----------|
| **Project / collection assign** | **Discuss later** — likely **organizational only**, not a discover trigger; scoped runs (“discover within project”) TBD |
| **User category / tag / note edits** | **B5** — define what gets **staged** vs what user must **Run** from Hub |
| **Import post-commit** | **Today:** Import Studio **auto-starts** `runBatchDigest` (A6). **Target:** commit saves rows → **staged** counts + CTA; waves in **A5b** — not silent full pipeline |

Workers: treat staging + explicit run as the **north star**; shrinking auto-run is acceptable incremental work in **A5b** / **B5**, not a one-shot rewrite.

---

## Master session order (2026-06-03)

Goal: cover discovery → signals → robustness/scale → UX polish — **discover need not be “done”** before moving on.

| Phase | Focus | Tasks | Done when |
|-------|--------|-------|-----------|
| **1a** | **Discover — algorithm** | **B4** (+ B1 caps table) | **Done 2026-06-03** — map→reduce shipped; CLI 2×2 COMPARE; dogfood promising; cold-classify audit optional |
| **1b** | **Discover — workflow** (later session) | **B2** + **B5** triggers | Staged hints; when to offer discover for **backfill**, **new links**, **single-item** updates; explicit Run — not auto |
| **2** | **User signals** (semantic edits; may overlap 1b) | **B5** | Category/tag/note edits stage the right queue |
| **3** | **Robustness + large batch** | **A5b** · **A2** · B4 DB invariants | Waves, preflight, counts match DB |
| **4** | **General UX/UI** | **A3** close · **A4** · **B3** · **C1/C2/C3** | Polish + dogfood gaps outside discover loop |

**Parallel / anytime:** Close **A3** after dogfood (small).

**Next worker session (master):** **1b** — open **only** [`TASK-V3-B2-discover-ux-loop.md`](TASK-V3-B2-discover-ux-loop.md). Bugfix discover algorithm → **B4** only. **One task file per session** (no parallel B1+B4 edits).

### Discovery split (algorithm vs workflow)

| Track | Question it answers | Task files | Typical validation |
|-------|---------------------|------------|-------------------|
| **Algorithm** | What does discover **produce** and how does **merge** land in SQLite? **Map → reduce** via **several short LLM calls** (slim context each), not one oversized discover prompt. | **B1** (pool + caps) · **B4** | Raw vs post-reduce parent counts; B4 acceptance rows |
| **Workflow** | **When** does the app **stage** discover and **invite** the user to run it? | **B2** · **B5** (with signals) | New import, old unclassified library, one link added, user edited taxonomy — each shows correct staged count + CTA |

**Dependency:** **1b** after **1a** (or after 1a has a clear “remaining algorithm” list). Workflow must not paper over bad merge output.

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
5. At end: set task **Status** in **that one file** only (`in progress` / `closed`).
6. **One session = one task `.md`** — do not split returns across B1+B4; implementation → **B4**, long-lived fair-game matrix → **B1**.

**Your rules after review:**

1. Read task return → accept or redirect.
2. Tick task row in **Task file index** (below) + adjust sequencing here if needed.
3. Mirror **closed** items to backlog/tracker in one line each (no duplicate specs).

---

## Task file index

| ID | Status | Task file |
|----|--------|-----------|
| **V3-A1** | done | [`TASK-V3-A1-repro-failure-taxonomy.md`](TASK-V3-A1-repro-failure-taxonomy.md) |
| **V3-A2** | queued | [`TASK-V3-A2-rate-limit-retry-policy.md`](TASK-V3-A2-rate-limit-retry-policy.md) |
| **V3-A3** | **in progress** (Phase 1 done; close after dogfood) | [`TASK-V3-A3-stage-aware-errors.md`](TASK-V3-A3-stage-aware-errors.md) |
| **V3-A4** | **partial** (bulk trash + scoped classify; not full action split) | [`TASK-V3-A4-bulk-action-semantics.md`](TASK-V3-A4-bulk-action-semantics.md) |
| **V3-A5b** | queued | [`TASK-V3-A5b-import-scale.md`](TASK-V3-A5b-import-scale.md) |
| **V3-A6** | done | [`TASK-V3-A6-orchestrator-d44.md`](TASK-V3-A6-orchestrator-d44.md) |
| **V3-B1** | **partial** (1a caps/rules done; signal matrix → B2/B5) | [`TASK-V3-B1-discover-fair-game.md`](TASK-V3-B1-discover-fair-game.md) |
| **V3-B2** | **ready** (next — discover workflow / staging) | [`TASK-V3-B2-discover-ux-loop.md`](TASK-V3-B2-discover-ux-loop.md) |
| **V3-B3** | queued | [`TASK-V3-B3-home-to-hub.md`](TASK-V3-B3-home-to-hub.md) |
| **V3-B4** | **1a complete** (pending master accept; 1b/bugs in same file) | [`TASK-V3-B4-classify-queue-d27.md`](TASK-V3-B4-classify-queue-d27.md) |
| **V3-B5** | queued | [`TASK-V3-B5-user-signals-d26-w6.md`](TASK-V3-B5-user-signals-d26-w6.md) |
| **V3-B6** | queued | [`TASK-V3-B6-discover-perf.md`](TASK-V3-B6-discover-perf.md) |
| **V3-C1** | queued | [`TASK-V3-C1-hub-d25-d42.md`](TASK-V3-C1-hub-d25-d42.md) |
| **V3-C2** | **partial** (`ItemDigestQuickActions` in Inspector + side panel) | [`TASK-V3-C2-inspector-hub-shortcuts.md`](TASK-V3-C2-inspector-hub-shortcuts.md) |
| **V3-C3** | queued | [`TASK-V3-C3-retire-dev-modals.md`](TASK-V3-C3-retire-dev-modals.md) |

### Session snapshot (2026-06-02)

| Shipped (committed) | Task |
|---------------------|------|
| `pipelineDictionary.ts`, honest toasts/chips | **A3** |
| Import parser, bulk trash, `TrashView` | **A3** / **A4** partial |

### Session snapshot (2026-06-03) — discover 1a (uncommitted code)

| Shipped (working tree) | Task |
|------------------------|------|
| `discoverMapReduce.ts`, map→reduce in `discoverBatch` | **B4** 1a |
| `linkQuality.ts`, classify few-shots / seed patches | **B4** spillover (classify hygiene) |
| CLI eval scripts, `eval-*/COMPARE.md` | **B4** 1a |
| Dogfood ~405 links (test4) — promising | **B4** validate |

**Next pick (master):** **B2** (1b workflow) · parallel optional **A3** close · then **B5** / **A5b** / **A2**.

---

## Remaining V3 tasks (master, 2026-06-03)

| ID | Status | One line |
|----|--------|----------|
| **A1** | done | Repro / failure taxonomy |
| **A6** | done | Orchestrator refactor |
| **A3** | in progress | Honest pipeline UI; close after dogfood; enrich/`page-not-found` labels |
| **A4** | partial | Bulk trash + scoped classify; action split + Home parity open |
| **A2** | queued | Rate limit / retry policy |
| **A5b** | queued | Import waves, preflight, staged import (no auto full pipeline) |
| **B4** | **1a done** | Map→reduce discover; optional cold-classify audit; full B4 task not closed |
| **B1** | partial | Caps/rules in B1+B4; **signal matrix** → B2/B5 |
| **B2** | **next** | Staged discover UX, backfill, new link triggers |
| **B5** | queued | User signals (category/tag/note → staged queues) |
| **B3** | queued | Home → Hub entry points |
| **B6** | optional | Discover perf / catalog shortlist |
| **C1** | queued | Hub D-25 / D-42 finish |
| **C2** | partial | Inspector digest shortcuts |
| **C3** | queued | Retire dev modals |

**Parked / follow-ups:** cold classify regression (CLI COMPARE); `maxNewParentsPerDiscover` 2 vs reduce cap 5; commit map→reduce + eval code.

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
| UI toasts misread skip as fail (mostly fixed) | `pipelineDictionary.ts`, `PipelineProgressProvider` | **V3-A3** (close-out: batch report panel, Home chips) |
| 10k Import Scale Risk (loads all into one tab) | `ImportStudioView`, `itemPipeline` | **V3-A5b** |
| Rate limit errors in batch; unclear retry | `llmBatchRetry`, OpenRouter client, concurrency | D-10 follow-up |
| “Re-digest” also classifies | `PipelineHubView` bulk flags | Hub issues |
| Generic / wrong failure labels | `failureLabels`, `errorMessages`, enrichment vs classify paths | **D-25**, Tier F hygiene |
| Partial failure silent or “Skipped” unclear | Batch report, `importReport`, queue outcome panels | 05.6 leftovers |

---

### V3-A1 — Repro & failure taxonomy (research)

**Task file:** [`TASK-V3-A1-repro-failure-taxonomy.md`](TASK-V3-A1-repro-failure-taxonomy.md)  
**Status:** **done** (We found the silent classify failure was due to an empty taxonomy throwing an error that got swallowed).

---

### V3-A6 — Orchestrator (D-44)

**Task file:** [`TASK-V3-A6-orchestrator-d44.md`](TASK-V3-A6-orchestrator-d44.md)  
**Status:** **done** (Worker refactored orchestrator into `itemPipeline.ts`, `pipelineRunStore.ts`, etc. Import Studio now auto-starts pipeline).

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

**Task file:** [`TASK-V3-A3-stage-aware-errors.md`](TASK-V3-A3-stage-aware-errors.md)  
**Status:** **in progress** — Phase 1 done (`pipelineDictionary`, honest summaries, Hub outcome chips, partial-success toast tone). Phase 2: import bad-file UX shipped; optional batch report / Home chips; master dogfood before **closed**.

**Goal:** User sees **which stage failed** and a **plain-language** next step (not raw API text). Skipped stages (e.g. classify with no taxonomy) must not read as total failure.

| Slice | Examples |
|-------|----------|
| Fix Lying Toasts | Ensure `PipelineProgressProvider` and `itemPipeline` accurately reflect skipped vs failed stages. |
| Map errors to stage | Use enrichment `failureCategory`, classify `pending_discover` / `manual_review`, LLM parse errors |
| Batch report rows | Title, stage badge, short label, “Retry fetch” / “Retry classify” action hint |
| Import pipeline report | Same labels on Import Studio post-commit panel |
| LLM-stage pickup | When classify/discover LLM returns structured error / skip, surface in UI (not only `console`) |

**Backlog:** D-25 lite (fetch review), 05.C batch error toasts (pipeline-only), package 5 hygiene  
**Touches:** `failureLabels.ts`, `errorMessages.ts`, `QueueOutcomePanel`, Hub batch report, `ImportStudioView`, `singleLinkDigestLabels.ts`

---

### V3-A4 — Bulk action semantics (enrich vs digest vs classify)

**Task file:** [`TASK-V3-A4-bulk-action-semantics.md`](TASK-V3-A4-bulk-action-semantics.md)  
**Status:** **partial** — bulk trash + fast Hub removal (`batchMutate`); Hub classify/digest scoped to selection. **Not done:** explicit Re-enrich-only vs Full re-digest vs Classify-only split on Home.

**Goal:** No surprise “I only wanted enrich” → also reclassified.

| Deliverable |
|-------------|
| Split actions: **Re-fetch / Re-enrich only** vs **Full re-digest** vs **Classify only** vs **Discover gap-fill** |
| Confirm copy when action chains stages |
| Hub + Home buttons use same names |

**Backlog:** Hub issue “Bulk Re-digest also classifies”; Inspector classify-only (05.C); **D-44** gate parity later

---

### V3-A5b — Import Scale (10k+ links)

**Task file:** [`TASK-V3-A5b-import-scale.md`](TASK-V3-A5b-import-scale.md)  
**Status:** **queued** (replaces retired `TASK-V3-A5-import-pipeline-reliability.md`). Parser hardening + re-import restore landed 2026-06-02; **waves/checkpoints not started**.

**Goal:** The new auto-start import pipeline will crash the browser if given 10,000 links because it tries to load everything into one tab at once. We need wave/chunk processing.

| Deliverable |
|-------------|
| Wave/chunk processing (e.g., 50-200 ids per wave) |
| Persist run checkpoint (`importRunId`, last offset, stage) |
| Background processing UI (don't block Import Studio) |

**Backlog:** **D-38**, W3  
**Touches:** `itemPipeline.ts`, `ImportStudioView.tsx`

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

**Task file:** [`TASK-V3-B4-classify-queue-d27.md`](TASK-V3-B4-classify-queue-d27.md)  
**Status:** **in progress** — taxonomy seed, classify gate, discover-before-classify revisions; fragmentation + acceptance run still open. See task file § Session status 2026-06-02.

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
DONE:     A1 · A6 · A3 phase 1 · partial A4/C2
DONE 1a:  B4 map→reduce discover (2026-06-03)
NEXT 1b: B2 discover workflow (one file only)
THEN:     B5 signals · A5b scale · A2 retry · A3 close · A4 · B3 · C*
```

**Practical next:** **B2** only for discover workflow. Commit map→reduce code when master accepts 1a.

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
| **D-38** | A5b |
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
