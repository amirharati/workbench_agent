# TASK-V2 — Pipeline Hub (processing control plane)

**Status:** **V3 sub-doc** — partial UI in tree (~85%); **do not start until V2.2/V2.3 polish or as V3 P0 reliability**  
**Last updated:** 2026-05-29  
**Umbrella:** [`TASK-V3-pipeline-workflow.md`](TASK-V3-pipeline-workflow.md) · **Roadmap:** [`TASK-V2-POST-ROADMAP.md`](TASK-V2-POST-ROADMAP.md)  
**Prerequisite:** ✅ V2.1 + V2.1.1 shipped  
**Tracker:** **D-42**, **D-25**, **D-27**, **D-26/W6**, **D-44**

**Master note:** Pipeline is **unreliable** (batch fails, one-by-one often works; confusing bulk actions). **All pipeline work → V3.** This file holds **hub UI slices + issue list**; reliability P0 is in V3 umbrella.

**Dogfood P0 (2026-05-29):** Batch errors; single-item retry succeeds — fix under V3 P0 before more hub polish.

---

## Current status (2026-05-29)

| Lane / slice | ~Done | Notes |
|--------------|------:|-------|
| **Slice 1 — Enrichment Hub** | **~85%** | Shippable for experiments; gaps below |
| Slice 2 — Categories lane | ~70% | Built (`PipelineHubCategoriesLane`) but glitchy; **not current focus** |
| Slice 3 — Entry points | ~20% | `handleOpenPipelineHub` exists; Home digest still opens Bookmarks tabs |
| Slice 4 — Edits + D-25 lite | ~10% | Fetch review filter exists; **Accept prior** UI missing |

**Nav today:** Tools → **Enrichment Hub** (`PipelineHubView`, view id `pipeline`).

**Key files:** `PipelineHubView.tsx`, `pipelineHubQueries.ts`, `PipelineItemInspectorPanel.tsx`, `PipelineProgressProvider.tsx`.

---

## Issues found (dogfood + build sessions)

### Enrichment Hub — open

| Issue | Severity | Notes |
|-------|----------|-------|
| **D-25 fetch review actions missing** | High | `pendingFetchReview` filter + next-step text work; **no Accept prior / Force re-fetch** in Inspector (help text references them) |
| **Bulk “Re-digest” also classifies** | Medium | `runBatch` uses `forceEnrich` + `forceReclassify` — surprising when user only wanted enrich retry |
| **Home digest → Bookmarks tab** | Medium | `HomeView.openPipelineBrowseTab` — not Enrichment Hub with filter (Slice 3) |
| **No embed-only bulk** | Low | `embed_failed` filter exists; bulk is full re-digest only |
| **Load perf at ~9k items** | Low | Full items + enrichments scan on hub open; acceptable for now |
| **Per-row actions only in Inspector** | Low | No inline re-fetch / re-AI buttons on table row (Slice 1 allowed Inspector path) |

### Categories lane — open (parked)

| Issue | Severity | Notes |
|-------|----------|-------|
| Scope / count confusion (discover vs classify) | Medium | Partially fixed; needs more dogfood |
| Report outcome labels (“Skipped” vs general/other) | Low | Copy clarity |
| Classify feels slow (full catalog every LLM call) | Medium | Backend; not enrichment-hub scope |
| D-26 user-signal policy incomplete | Medium | Blocks “full operation” for category edits, not enrich lane |

### Fixed this session (Categories + shared — reference)

- Discover scope: classify only items processed in discover run (not full queue)
- Progress: item counts vs batch-only wording; cancel / `AbortSignal` on LLM batches
- Batch report: bookmark titles + topic names (not raw UUIDs)
- Hub load: `pipelineCatalog` cache; throttled `ensurePendingClassifySignals`
- Classify/discover **retry**: re-batch failures instead of N sequential one-item calls (`llmBatchRetry.ts`)

---

## Deferred (explicit — not blocking Enrichment Hub)

| Item | Why deferred | When |
|------|--------------|------|
| **D-35 SQLite / OPFS** | Storage/backup architecture; **unrelated to fetch/enrich hub** | Post-V2.1 |
| Fetch parallelism (`concurrency` > 2) | D-10 follow-up; enrich experiments | After enrich hub stable |
| Classify catalog slimming / shortlist / top-K leaves | Accuracy risk; needs eval | Categories lane session |
| OpenRouter prompt caching (`cache_control`, `session_id`) | Cost/latency win; optional | After batch retry proven |
| Parallel LLM classify batches (2 in-flight) | Rate-limit / complexity | Categories lane session |
| D-26 / W6 full user-signal policy | Tier A decision | Before category edits in hub |
| D-10.4b fetch research | Optional backend | V2-C optional |
| `runPipelineDigest` orchestrator refactor (D-44) | Behavior parity refactor | Post hub MVP |
| Persist queue stats in DB for instant hub counts | Perf optimization | Post hub MVP |

---


## Vision

One **Tools → Pipeline** full-page hub: a **processing control plane** for the library—not only a “failed items” list.

Every bookmark/link can be inspected and acted on at any stage:

| Stage | User actions (target) |
|-------|------------------------|
| **Fetch** | Re-fetch (force), fetch in browser (tab session), accept/reject when `pendingFetchReview` (D-25) |
| **AI summary** | Re-run AI (`force`), view errors, open Inspector detail |
| **Embed** | Re-embed / backfill (policy-gated), view embed status |
| **Classify** | Run classify, force reclassify, discover gap-fill, skip, manual review queue |
| **Categories** | Change assignment, accept/reject suggestions, add manual category / taxonomy edits (W6) |

**Bulk:** same actions on filtered selection (with caps + progress + cancel where supported).

**Entry points stay thin:** Home digest cards, Inspector footer, side panel, Import post-commit → **deep link** into hub with filter pre-applied; optional “open Inspector” from hub row.

---

## Relationship to Home digest (important)

**Home digest is not the hub.** It is a **small dashboard strip** — counts + one-click batch for the noisiest queues. The Pipeline Hub is a **much larger expansion** of that idea: same mental model (“what’s done vs what needs work”), but **every state**, **every item**, **proper filters**, and **bulk/row actions**.

| | **Home digest** (`ProcessingDigest` + queue cards) | **Pipeline Hub** |
|---|---------------------------------------------------|------------------|
| **Purpose** | At-a-glance health + quick batch | Full library processing workbench |
| **Visibility** | ~5 aggregate buckets + top category tiles | All stages: done, failed, queued, needs review, skipped, ineligible, … |
| **Detail** | Counts only; browse opens filtered **Bookmarks** tab | Filterable **table** of matching items in-place |
| **Filters** | Fixed queue kinds (`not_enriched`, `enrich_failed`, `pending_classify`, …) | Multi-axis: enrichment status, `failureCategory`, classify state, embed, `pendingFetchReview`, search, scope |
| **Actions** | 1–2 batch buttons (process not enriched, classify ready) | Per-row + bulk: refetch, re-AI, re-embed, classify, category edits, open Inspector |
| **“Done” / healthy** | `healthy` boolean + implicit (everything not in a bucket) | Explicit filters: enriched ok, classified, embedded, accepted categories — browsable, not hidden |

### Home digest today (reference — keep thin)

From `loadProcessingDigest()` / `HomeView` queue cards:

- `notEnriched`, `enrichFailed` (+ category breakdown string), `pendingClassify`, `manualReview`, `suggestedCategories`
- Batch: **Process not enriched**, **Classify ready** (runnable subset)
- Click card → often opens **Bookmarks** with `PipelineBrowseFilter` (list only, limited actions)

### Hub must add (beyond digest)

| Dimension | Examples |
|-----------|----------|
| **Success / complete** | Enrichment ok, AI summary present, embed indexed, primary category set |
| **Review** | `pendingFetchReview`, suggested categories awaiting accept, `manual_review` |
| **Classify depth** | `pending_reclassify`, `pending_discover`, `needs_attention`, `classified_general`, `no_signal`, `skipped`, `ineligible` (align with `PipelineDevView` / `devQueries`) |
| **Failure depth** | `failureStage` fetch / ai / embed; `failureCategory` chips (auth, bot, empty, …) |
| **Embed lane** | Needs embed, stale embed, embed failed |
| **Discovery** | All bookmarks, recently processed, by platform tag (optional later) |

**Product rule:** Home **never** grows into the hub. Home keeps summary cards that **link** to hub with `?filter=…`. Optional: retire Home → Bookmarks browse for pipeline queues once hub Slice 3 ships.

---

## Next-run intent labels (deferred work — not just pass/fail)

Home digest shows **bucket counts**. The hub must also show **why an item is queued for the next run** — the labels the backend already writes when policy decides “not done yet” or “user/system signal changed something.”

Think of two layers per row:

| Layer | Meaning | Examples in codebase |
|-------|---------|----------------------|
| **Queue state** | Which pipeline step should run next | `classifyState`: `pending_classify`, `pending_reclassify`, `pending_discover`, `manual_review`; enrich `status` / `pendingFetchReview`; `discoverState: pending` |
| **Intent reason** | Human-readable *why* it was labeled | `lastClassifySkipReason`, `eligibilityReason`, `llmReview.reason`, `failureCategory`; enrich review reason |

### Classify / category (already persisted on `AiItemSignal`)

| Label / state | Typical trigger | Next run |
|---------------|-----------------|----------|
| `pending_classify` | New enrich, import, fair-game | Classify batch |
| `pending_reclassify` | Text hash changed after `classified`; discover sampled item; LLM `needsReclassify` | Classify (often `forceReclassify`) |
| `pending_discover` | Unassigned after classify | Discover gap-fill |
| `classified_general` | Stuck on general/Other | Discover or manual |
| `manual_review` | `classifyRetryCount` ≥ cap | Manual / `retry_manual` |
| `skipped` + reason | LLM confident no topic (`llm_skip_confident`) | Optional force reclassify |
| `ineligible` | Quality gate (`eligibilityReason`, `inputQualityTier`) | Re-fetch / re-AI first |
| **Low confidence** | `llmReview.confidence` below threshold (when stored) | Re-classify or review suggestion |
| **Suggested links** | `AiItemCategoryLink` status `suggested` | User accept/reject (W6 / D-26) |

**UI reuse:** `describeClassifyQueueStatus()` + `ClassifyQueueReasonBlock` (per-row expand or column **Queue reason**). Home does **not** show these strings — hub does.

### Enrichment (next fetch / AI / embed)

| Label | Meaning | Next run |
|-------|---------|----------|
| `notEnriched` | No digest yet | Full digest |
| `enrich_failed` + `failureStage` / `failureCategory` | Fetch, AI, or embed failed | Stage-specific retry |
| `pendingFetchReview` | Re-fetch suspicious vs prior (D-25) | User accept prior or force re-fetch |
| Embed gap | Index stale / missing vector (`embedBackfillPlan`) | Re-embed |

### User signals → labels (D-26 / W6 — policy TBD, data often already there)

When the user edits something, backend may **label for a later run** without running immediately:

- Change primary category / un-accept / reject all suggestions → may enqueue **reclassify** or **discover** (decision doc D-26).
- Edit bookmark text / notes → **text hash** change → `pending_reclassify` + reason *“Bookmark text changed — queued for reclassify”*.
- Accept category with weak LLM confidence → still may show in hub under **needs review** filter.

**Hub filters (target):**

- **Scheduled for:** classify · reclassify · discover · enrich · embed · fetch review · category review  
- **Because:** dropdown of common `lastClassifySkipReason` / `failureCategory` codes  
- **Confidence:** low LLM confidence / suggested-not-accepted (when field present)

**Product rule:** Digest cards count *buckets*; hub table shows **state + reason + suggested action** (same info devs see in `ClassifyQueueReasonBlock`, product-styled).

---

## Why hub-first

Backend and policies are largely in place; UX is **scattered** (`EnrichmentReviewModal`, `PipelineDevView`, `EnrichmentPanel`, Home batch, Inspector one-offs). Consolidating avoids re-building filters and bulk actions in four places.

---

## Reuse (do not reimplement orchestration)

| Capability | Today | Hub surfaces |
|------------|-------|----------------|
| Batch digest | `PipelineProgressProvider`, Home `onBatchProcessQueue` | Bulk enrich / classify from filter |
| Per-item enrich | `enrichOne`, `singleLinkDigest`, `force` / `preferTabSession` | Row + bulk re-fetch / re-digest |
| AI re-run | `EnrichmentReviewModal` | Row action |
| Failure labels | `failureLabels.ts`, `failureStage` / `failureCategory` | Filters + badges |
| Classify queues | `PipelineDevView`, `devQueries`, `ClassifyQueueReasonBlock` | Categories lane |
| Classify batch | `classifyIncremental`, `CategorizationPanel` modes | Bulk classify / force reclassify |
| Discover | `CategorizationPanel` discover | Bulk discover (scoped) |
| Category accept/reject | Inspector / W4 | Row + Inspector drawer |
| Embed backfill | `embedBackfillPlan`, `EmbedBackfillBlock` | Filter “needs embed” + bulk |
| Taxonomy | `CategorizationPanel`, taxonomy tree | Tab or sub-panel “Manage categories” |

**Retire over time:** dev-only modal as primary workflow; Settings/Import panels can link to hub.

---

## Information architecture

### Nav

- **Tools → Pipeline** (or “Library maintenance”) — full page (`FULL_PAGE_VIEWS`).
- Subtitle: *Failed items, queues, and bulk actions.*

### Layout (v1)

```
┌─────────────────────────────────────────────────────────┐
│ Summary row: digest counts + extended hub-only buckets   │
│ (click → apply filter; superset of Home, not identical)  │
├─────────────────────────────────────────────────────────┤
│ Lane: [ Enrichment ] [ Categories ] [ Search index? ]   │  ← Search index optional v2
├─────────────────────────────────────────────────────────┤
│ Filter chips + search + scope (project/collection)       │
├─────────────────────────────────────────────────────────┤
│ Table: title, url, stage badges, **next-run / queue reason**, updated │
│ ☐ select · row actions · Open Inspector (reason block on expand)      │
├─────────────────────────────────────────────────────────┤
│ Bulk bar: N selected · [Re-digest] [Re-fetch] [Classify]… │
└─────────────────────────────────────────────────────────┘
```

### Deep links (v1.3)

Query params for cross-surface navigation:

- `lane=enrichment|categories`
- `filter=fetch_failed|ai_failed|not_enriched|pending_fetch_review|pending_classify|…`
- `ids=id1,id2` (optional, from Inspector selection)

---

## Implementation slices

### Slice 1 — Hub shell + enrichment lane (MVP) — **active**

- [x] Register `pipeline` in `DashboardView` + `LeftSidebar` Tools (label: **Enrichment Hub**).
- [x] Full-page `PipelineHubView`; summary chips (ok, failed, not enriched, fetch review, embed failed, trash hints).
- [x] Enrichment table: all enrichment states including ok and `pendingFetchReview`; filter by `failureCategory` + failure stage.
- [x] Row meta: status badge + **next step** (`pipelineHubQueries.buildRowMetaFixed`).
- [x] Filters + text search + scope; Inspector drawer on row.
- [x] Bulk: re-digest selection via `PipelineProgressProvider.runBatch`.
- [x] Per-item: re-fetch / re-AI via **`PipelineItemInspectorPanel`** (not inline row buttons).
- [ ] **D-25 lite:** Accept prior + Force re-fetch when `pendingFetchReview` (Inspector).
- [ ] Optional: **Enrich-only** bulk (split from classify in re-digest).
- [ ] Optional: embed-only bulk for `embed_failed` filter.

**Acceptance:** User can see **done vs needs work** in one table with real filters—not just Home’s five counters—and clear fetch failures without dev modal. **Mostly met**; D-25 actions remain.

### Slice 2 — Categories lane — **built, parked**

- [x] `PipelineHubCategoriesLane` — queue filters from `devQueries` (product styling).
- [x] Intent filters: `pending_reclassify`, `pending_discover`, `manual_review`, etc.
- [x] `ClassifyQueueReasonBlock` on rows; discover modal + maintenance strip.
- [x] Bulk discover + classify via `PipelineProgressProvider`.
- [ ] Dogfood pass; fix remaining scope/count glitches.
- [ ] Home digest cards → **Categories** hub filter (Slice 3 overlap).

**Acceptance:** Batch classify/discover on filtered N. **Functional but not focus** until Slice 1 + entry points done.

### Slice 3 — Entry points + deep links

- [ ] Home **enrichment** digest cards → Enrichment Hub with filter (replace `openPipelineBrowseTab` Bookmarks list).
- [ ] Home classify cards → Categories hub with filter.
- [x] Partial: `DashboardLayout.handleOpenPipelineHub({ filter })` + nav state `pipelineHub.*`.
- [ ] Inspector: “View in Pipeline” (current item or selection).
- [ ] Import Studio post-run: “Review failures in Pipeline”.

**Acceptance:** No duplicate filter UI needed on Home beyond counts + link.

### Slice 4 — Edits + D-25 lite

- [ ] Row/Inspector: change category, accept/reject (W6 rules) — **Categories lane**.
- [ ] Manual category assign + taxonomy tab (partial via `AiCategoriesView` in hub).
- [ ] **`pendingFetchReview`:** Accept prior + Force re-fetch — **Enrichment lane (priority)**.

**Acceptance:** User can resolve fetch review and misclassification without dev modal.

---

## Explicit non-goals (hub v1)

| Item | Where |
|------|--------|
| D-26 auto policy on every edit | Document; manual bulk first; **Categories lane** |
| D-10.4b fetch research | Backend optional |
| Full two-pane fetch compare (D-25 full) | Slice 4 lite only |
| **SQLite / backup (D-35)** | **Post-V2 — not enrichment hub scope** |
| New orchestrator (`runPipelineDigest` refactor) | D-44; call existing APIs |
| Classify catalog shortlist / prompt caching | Deferred — see **Deferred** section |

---

## Decisions to document (Tier A)

| ID | Hub impact |
|----|------------|
| **D-27** | Filter labels copy for classify queues |
| **D-26** | Which user edits auto-label vs auto-run (reclassify, re-embed); hub shows resulting **intent labels** either way |
| **W6** | Category change / un-accept / primary on accept in hub vs Inspector only |
| **D-25** | Accept prior vs force re-fetch UX |

Write one-liners in [`TASK-POST-V2.md`](TASK-POST-V2.md) Tier A when slicing.

---

## Slice 1 — worker implementation notes

**Gate:** Tier A decisions (D-26, D-27, W6, D-25) **do not block** Slice 1 — use existing behavior from `EnrichmentReviewModal` / `DashboardLayout` batch.

### Files to touch (Slice 1)

| File | Change |
|------|--------|
| `src/components/dashboard/layout/DashboardLayout.tsx` | Add `'pipeline'` to `DashboardView` + `FULL_PAGE_VIEWS` |
| `src/components/dashboard/layout/LeftSidebar.tsx` | Tools nav: Pipeline (icon e.g. `Workflow` / `Wrench`) |
| `src/components/dashboard/layout/MainContent.tsx` | `case 'pipeline':` → `<PipelineHubView … />`; exclude from bookmarks grid guard list |
| `src/components/dashboard/PipelineHubView.tsx` | **New** — Slice 1 enrichment lane only (no classify lane yet) |
| Optional `src/lib/pipeline/pipelineHubQueries.ts` | Row loader + filter types if not inlined in view |

### Row data (enrichment lane)

- Pattern: **`EnrichmentReviewModal`** — `getAllItems()` + `getAllEnrichments()`, URL bookmarks only, client filter.
- Filters (Slice 1 minimum): `all` \| `ok` \| `failed` \| `not_enriched` \| `pending_fetch_review` \| `skipped`; plus `failureCategory` chips from `resolveEnrichmentFailureLabel` / `FAILURE_CATEGORY_LABELS`.
- Row labels: `failureStage`, `pendingFetchReview`, `formatEnrichmentFailureMessage` — not classify queue reason yet (Slice 2).

### Actions (reuse)

| Action | API / pattern |
|--------|----------------|
| Bulk re-digest | `DashboardLayout` `onBatchProcessQueue` / `PipelineProgressProvider` — pass filtered item ids or subset |
| Per-row re-fetch | `enrichOne(id, { force: true })` — see `EnrichmentReviewModal` |
| Per-row re-AI | `reextractAI` — see modal |
| Open item | `onOpenItem` / `handleOpenItemTab` from `MainContent` props (same as Search/Home) |

### UI conventions

- Match **full-page** density of `ImportStudioView` / `AiCategoriesView` — not dev modal chrome.
- Summary row: `loadProcessingDigest()` chips → set active filter on click.
- **Lane tabs:** Enrichment + Categories both exist; **worker focus** = Enrichment until Slice 1 gaps closed.

### Verify before done

```bash
npm run build
# or project typecheck script if different
```

Manual: Tools → Pipeline → filter failed → bulk/row re-fetch → open Inspector on one row.

---

## Worker prompt — ~~Slice 1 bootstrap~~ (superseded)

Slice 1 shell is **shipped**. Use **Next worker prompt** below.

---

## Session map (revised 2026-05-29)

| Session | Focus | Outcome |
|---------|-------|---------|
| **Done** | Slice 1 + 2 (initial) | Enrichment + Categories lanes exist; shared progress/report |
| **Done** | Categories hardening | Scope, cancel, report hydration, batch retry, catalog cache |
| **Next** | **Slice 1 finish** | D-25 Accept prior / Force re-fetch; optional enrich-only bulk |
| **Then** | Slice 3 (enrichment entry) | Home failed / not enriched → Enrichment Hub filter |
| **Later** | Slice 2 polish | Categories lane dogfood + D-27 / D-26 decisions |
| **Later** | Slice 4 | W6 category edits in hub |

### Next worker prompt (Enrichment Hub only)

> Finish **Enrichment Hub** per this doc: **D-25 lite** in `PipelineItemInspectorPanel` (Accept prior + Force re-fetch when `enrichment.pendingFetchReview`). Optionally split bulk into **Re-enrich only** vs **Re-digest + classify**. Wire Home **not enriched / enrich failed** cards to `handleOpenPipelineHub` with enrichment filter — not Bookmarks list tab. **Do not** work Categories lane, classify catalog, SQLite, or fetch parallelism unless Slice 1 items are done.

---

## Related docs

- [`TASK-V2-CLOSE.md`](TASK-V2-CLOSE.md) — V2 closed · [`TASK-POST-V2.md`](TASK-POST-V2.md) — active queue · V2.1 storage shipped  
- [`V2-DEFERRED-TRACKER.md`](V2-DEFERRED-TRACKER.md) — D-42, D-27, D-25, D-44  
- [`TASK-05.C-v2-polish-bundle.md`](TASK-05.C-v2-polish-bundle.md) — Home digest / batch UI  
- [`D10-FETCH-FINDINGS-REPORT.md`](D10-FETCH-FINDINGS-REPORT.md) — fetch failure taxonomy  
