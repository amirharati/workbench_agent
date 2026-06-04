# TASK-V3-B1 — Discover fair-game & signal matrix (research)

**Status:** **partial** — **1a algorithm caps/rules documented** here; **implementation + eval → B4 only**  
**Phase:** Long-lived fair-game / signal matrix (not the implementation log)  
**Do not use for worker sessions that change discover code** — open **B4** instead.  
**Parent:** [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md) · Pillar **B**  
**Backlog:** **D-27**, **D-26**, **W6**

**Worker:** Update **only this file** + code only if aligning existing policy constants. Do **not** edit `backlog.md`, tracker, or roadmap.

---

## Goal

Before more discover UI: document **who enters the discover pool** and **who is excluded** — user signals + automatic signals (TBD validated with user).

**Staging policy (master 2026-06-03):** Pipeline stages are **not** auto-run by default; app **stages** eligible items and **hints** (“Run discover”, “N ready to classify”). See program breakdown § Product policy — staged AI. Spec should say what gets **staged** vs what requires explicit Hub/Import action.

**Project/collection:** **TBD** with user — do not assume auto-discover on assign; note in open questions.

---

## Signal matrix (draft — validate, do not guess product)

| Signal | Include in discover pool? | Include in classify? | Notes / code today |
|--------|---------------------------|----------------------|-------------------|
| Never classified / no accepted link | TBD | | |
| Only `general` / fallback leaf | TBD | | |
| `pending_discover` from classify | TBD | | |
| User rejected all suggestions | TBD | | **W6** |
| User set primary manually | TBD | | **D-26** |
| Enrich failed / no usable text | TBD | | |
| Just bulk-imported | TBD | | **D-27** cap? Stage only until user runs? |
| Project/collection assigned | TBD | TBD | Organizational — **master TBD** |
| User tags / notes changed | TBD | TBD | → **B5**; semantic vs organizational |
| In trash / ineligible | TBD | | |

---

## Fair-game rules (session 1a — algorithm)

| Rule | Value |
|------|--------|
| Max items per discover run | Caller `maxItems` + fair-game filter (CLI corpus `--max`, default 124) |
| Max LLM **map** batches per run | **ceil(pool / 32)** — full pool by default; optional cap via `--max-batches` |
| Map batch size (items / call) | **32** (aligned with `DEFAULT_DISCOVER_BATCH_SIZE` / legacy baseline) |
| Reduce LLM calls | **1** parent reduce + **N** per-parent leaf reduces (parallel ×5) |
| Max net new parents after reduce | **5** |
| Max net new leaves after reduce | **36** (app `maxNewLeavesPerDiscover` matches) |
| Map propose caps (recall) | **6** parents + **28** leaves per map batch |
| MAP catalog | Parent + up to **14** leaf names per parent; item summary **1200** chars |
| Token budgets | MAP **6500** · reduce-parents **5500** · reduce-leaves **5000** |
| Cooldown after bulk import | Unchanged (`bulkDiscoverRuns` / `maxBulkDiscoverRuns`) — workflow in **B2** |
| Scope | `discoverBatch({ itemIds })` in app; CLI = full eligible corpus |

---

## Checklist

- [ ] Read `categorizationFairGame.ts`, `discoverPolicy.ts`, `discoverTaxonomy.ts`, hub Categories lane
- [ ] Fill signal matrix with **actual** behavior today vs intended
- [ ] List **open questions** for user approval (bullet list)
- [ ] Propose 1-page fair-game spec (markdown in task return)
- [ ] Optional: tiny diff only if constant rename/clarify (no UX redesign — **B2**)

---

## Session 1a deliverable (algorithm spec only)

Fill matrix rows for **automatic / queue** signals only. Cap table for **LLM discover** (max items, batches, scope of itemIds in one run, empty taxonomy behavior).

**Map → reduce + multi-call (master):** See **B4** § Target algorithm. Spec should set:

| Knob | Session 1a value |
|------|------------------|
| Map batch size | **32** items (same as baseline discover batch) |
| Map calls per user run | **All items** in discover pool (batched by 32) unless `maxBatches` set |
| Reduce | **Parents** then **per-parent leaves** (full leaf list per parent) |
| Catalog in map | Parents + leaf **names** under each parent |
| Reduce input | Proposals only; leaf reduce sees **all** leaves for that parent |
| Mechanical | Name dedupe pre-reduce; `mergeDiscovery*` + orphan `parentId` fix; `taxonomyMerge` keyword absorb + audit log |

### Reduce rules (when to keep new parent vs leaf)

| Situation | Action |
|-----------|--------|
| Proposal matches existing parent name / domain (ML, infra, dev, …) | **merge_into_existing** — no new parent |
| Sub-specialisation (deep learning, NLP, cloud, …) with seed parent present | New **leaf** under seed parent, not new parent |
| Genuinely new top-level domain (e.g. sports, law) with no seed match | **keep_new** parent (+ general leaf via merge) |
| Leaf name duplicates existing under same parent | **drop** or merge_into_existing leaf |
| Leaf `parentId` unknown | Mechanical `resolvePartialParentId` before drop; log warning |
| Post-ingest discovered parent overlaps seed keywords | `taxonomyMerge` absorbs → audit `canonical ← absorbed` |

**Open questions (algorithm — for user)**

1. Should app `maxNewParentsPerDiscover` (currently **2**) align with reduce net cap **5** for bulk pre-classify discover?
2. Stratified sampling across 10k imports (map batches) — fixed 4 batches vs proportional to pool size?
3. Cold start: allow more than 5 parents on **first** library discover only?
4. Project/collection scoped discover pool — **B2/B5**, not 1a.

## Out of scope (session 1b / other tasks)

- **When to show “Run discover”** to user (backfill, new link, import staged) → **V3-B2**
- Categories lane / Hub copy / CTAs → **V3-B2**
- User edit → staged queue → **V3-B5**
- Hub queue state machine copy → **V3-B4** (workflow section) only if documenting `pending_*` names

---

## Task return

| Field | Value |
|-------|-------|
| Phase | spike (algorithm slice) |
| Spec location | § Fair-game rules · § Reduce rules · `src/lib/categorization/discoverMapReduce.ts` |
| Open questions for user | See § Open questions above (4 bullets) |
| Mismatches vs code today | App settings still default `maxNewParentsPerDiscover: 2` while reduce allows 5; CLI `--all-eligible` not same as app `stuckOnly` default |
| Recommended next | **B2** workflow; fill signal matrix when doing **B5** |
| Files touched | B1 (spec); all 1a code in **B4** task return |
| 1a session | **Closed in B4** — master synced 2026-06-03 |

---

## Approved spec (master fills after review)

*(empty — user pastes decisions here)*

---

## Worker prompt

> Run **V3-B1** per [`TASK-V3-B1-discover-fair-game.md`](TASK-V3-B1-discover-fair-game.md). Research/spec only; no hub UI overhaul. Update **only this file** when done.
