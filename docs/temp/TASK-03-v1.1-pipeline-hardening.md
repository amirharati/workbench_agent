# TASK-03 — V1.1 pipeline hardening (incremental classify + quality gate + run stats)

**Status:** **Done (V1.1 hardening + dev UI pass)** — incremental skip, quality gate, retry/manual-review, run stats, dev hub, queue policy fixes (CLI + app).  
**UX polish:** deferred — baseline works; step clarity / layout glitches tracked for a later pass.
**Backlog linkage:** `docs/backlog.md` -> **AI — V1** (`V1.1 / Task 02.1`)  
**Depends on:** Task 01, 01.5, 02 shipped  
**Unblocks:** search foundation work (V1.5) with cleaner/stabler categorization signals

---

## Why this task now

Task 02 shipped categorization V1 (LLM-first classify/discover), but the next immediate value is **stability and trust**, not major UX.

This task is a **small hardening pass** before search:

1. classify only new/changed items (incremental by hash),
2. tighten enrichment quality gate for low-signal pages,
3. improve handling of `*-general` / unassigned outcomes,
4. produce run-level stats + failure buckets for iteration.

**Important:** keep dev UI/dev controls acceptable; product UX redesign is deferred.

---

## Context snapshot (for independent session)

### Already shipped

- Fetch enrichment + storage split (Task 01): `src/lib/enrichment/*`
- AI extraction tuning (Task 01.5): sourceKind prompts + eval harness
- Categorization V1 (Task 02): `src/lib/categorization/*`, app panel + CLI parity

### Core docs to read first

1. `docs/temp/TASK-02-ai-categorization-v1.md` (status + return + known gaps)
2. `docs/temp/TASK-02-app-implementation-plan.md` (data/state model details)
3. `docs/CLI_WORKFLOW.md` (parallel CLI + app method)
4. `docs/backlog.md` (AI — V1 / V1.1 wording)

### Key code areas likely touched

- `src/lib/categorization/service.ts`
- `src/lib/categorization/pipeline.ts`
- `src/lib/categorization/categorizationEligibility.ts`
- `src/lib/categorization/topicExtract.ts` / classify orchestration
- `src/lib/db.ts` (if adding minimal counters/state fields)
- `src/components/dashboard/CategorizationPanel.tsx` (dev stats visibility only)
- `scripts/categorize/*` (CLI parity / eval reports)

---

## Goal

Ship a robust V1.1 loop where reruns are cheap, low-quality input is gated, and outcomes are observable:

- **incremental classify default**
- **quality gate stricter and explicit**
- **general/unassigned behavior improved**
- **run summary + failure buckets persisted/reportable**

No major UX redesign, no chunk embeddings/ANN, no DAG.

---

## Scope

### In scope

1. **Incremental classify by hashes**
   - Skip LLM classify when item is unchanged and already in stable classified state.
   - Reclassify only when relevant text/hash changed or item is in retryable bucket.

2. **Quality gate tightening**
   - Strengthen eligibility for classify based on enrichment quality.
   - Keep deterministic reason codes for why an item is skipped/ineligible.

3. **`*-general` / unassigned handling**
   - Add explicit follow-up behavior for low-confidence/general assignments.
   - Improve requeue logic into discover/reclassify where appropriate.

4. **Run-level observability**
   - Report counts and buckets from classify/discover runs (processed/skipped/ineligible/unassigned/general/specific/failures).
   - Persist enough state for comparing runs over time.

5. **CLI parity**
   - Keep CLI and app behavior aligned for this hardening logic.
   - Provide one reproducible corpus run with summary output.

### Out of scope

- Product accept/reject UX redesign (defer to V2 UX phase)
- Chunk/paragraph embeddings
- ANN/vector index
- Taxonomy DAG or deep taxonomy redesign
- Cloud offload architecture

---

## Implementation requirements

### A) Incremental classify policy (required)

Define and implement clear skip/reclass rules, e.g.:

- Skip classify if:
  - `classifyTextHash` unchanged
  - has primary AI link in stable state
  - not explicitly marked retry/reclassify
- Force reclassify if:
  - text hash changed
  - previous state in `pending_*` / `classified_general` / `unassigned`
  - manual re-run flag enabled

Document the final rule table in this task return.

### B) Quality gate policy (required)

Use deterministic input quality checks from enrichment signals (summary/snippet availability, known failure states, etc.).

Persist explicit `classifyState`/reason transitions (or equivalent existing fields), so "why skipped" is visible and testable.

### C) General/unassigned queue behavior (required)

Implement one clear policy for items that repeatedly fall into `*-general` or unassigned:

- requeue to discover after threshold, or
- bounded retry strategy, or
- explicit terminal state + manual-review bucket.

Pick one and document it.

### D) Run stats (required)

At minimum, output these per run:

- total considered
- classified specific
- classified general
- unassigned
- ineligible/quality-gated
- skipped unchanged
- failures (by error bucket)

Store where practical (DB state + CLI summary artifacts).

---

## CLI-first execution plan

1. Choose corpus (same style as prior runs; note exact path in return).
2. Run baseline with current logic.
3. Implement hardening changes.
4. Re-run and compare before/after.
5. Export summary (`SUMMARY*.md` + machine-readable JSON/JSONL).

If helpful, add a focused script/flag for incremental-skip diagnostics.

---

## Acceptance criteria

- [x] Incremental skip-by-hash logic is active and validated.
- [x] Quality gate is stricter and reason-coded.
- [x] `*-general` / unassigned follow-up behavior is implemented and documented.
- [x] Run stats are visible in both CLI output and app dev surface/logs.
- [x] No regression to Task 02 classify/discover core flow.
- [x] CLI/app behavior remains aligned for key hardening decisions.
- [x] One before/after run comparison is included in return (Task 03.1 discover loop).
- [x] Dev UI: queue inspection, taxonomy counts, classify filters, per-item reclassify (Task 03.2).

---

## Deliverables

1. Code changes in categorization service/pipeline + any minimal state fields.
2. CLI comparison artifacts for at least one meaningful corpus.
3. Updated task return section in this file (or separate return block pasted to master session).
4. Suggested backlog wording updates (if behavior changed materially).

---

## Return template

```markdown
## Task 03 return
- Shipped:
- Files:
- Incremental classify rule table:
- Quality gate rules:
- General/unassigned follow-up policy:
- Corpus + commands:
- Before/after metrics:
- Known remaining gaps:
- Suggested backlog/doc updates:
- Ready for next step (search foundation): yes/no
```

---

## Suggested next step after Task 03

If Task 03 passes acceptance:

- Start **search foundation** task (hybrid lexical + doc-level semantic retrieval), still with dev UX.
- Keep major end-user UX redesign for V2 phase.

---

## Task 03 return

- **Shipped:**
  - Incremental classify skip-by-hash with explicit counters (`skippedHash`, `skippedManualReview`)
  - Balanced quality gate with `inputQualityTier` (high/medium/low) + persisted `ineligible` + reason codes
  - General/unassigned bounded retry (`MAX_CLASSIFY_RETRIES=2`) → `manual_review` terminal bucket; CLI `--retry-stuck` for controlled re-run (app: use Re-classify all / force)
  - Run stats persisted on `ai_taxonomy_state.lastClassifyRun` + dev panel summary
  - CLI script `npm run classify-incremental` with `--dry-run` / `--run-llm` / `--state-in` / `--retry-stuck`

- **Files:**
  - `src/lib/categorization/classifyPolicy.ts` (new)
  - `src/lib/categorization/classifyTopicExtract.ts`
  - `src/lib/categorization/categorizationFairGame.ts`
  - `src/lib/categorization/types.ts`
  - `src/lib/enrichment/categorizationEligibility.ts`
  - `src/components/dashboard/CategorizationPanel.tsx`
  - `scripts/categorize/run-classify-incremental.mjs` (new)
  - `scripts/categorize/lib/classifyPolicy.mjs` (new)
  - `scripts/categorize/lib/eligibility.mjs`
  - `package.json`

- **Incremental classify rule table:**

  | Condition | Action |
  |-----------|--------|
  | Not eligible (quality gate) | Persist `classifyState=ineligible` + `eligibilityReason`; skip LLM |
  | Hash match + specific primary + `classified` | Skip LLM (`skippedHash`) |
  | Hash match + `skipped` | Skip LLM |
  | `manual_review` (default) | Skip LLM (`skippedManualReview`) |
  | Hash changed + was `classified` specific | Mark `pending_reclassify`, run LLM |
  | `pending_*`, `classified_general`, `pending_discover`, unassigned | Run LLM |
  | `forceReclassify` or CLI `--retry-stuck` | Run LLM (includes manual_review) |

- **Quality gate rules:**
  - **high:** AI summary ok (≥50 chars)
  - **medium:** notes ok OR semantic substance ≥100
  - **low:** borderline substance (80–99) + valid snippet + non-generic title (balanced extra path)
  - **ineligible:** failed AI + thin text, generic title without summary, substance &lt;80 without fallback

- **General/unassigned follow-up policy:**
  - Each general/unassigned/error outcome increments `classifyRetryCount`
  - After **2** attempts → `manual_review` (terminal; no auto LLM)
  - Valid links: retry manually via CLI `--retry-stuck --run-llm` or app **Re-classify all** / per-item **Force re-classify**
  - **LLM no matching topic** → `pending_discover` (not terminal `skipped`); discover pool includes **unassigned** (no primary) + general/other
  - Legacy `skipped` reconciled to `pending_discover` on app load

- **Corpus + commands:**
  ```bash
  # Dry-run gate/skip stats (no LLM spend)
  npm run classify-incremental -- --dry-run --max 200

  # First LLM pass → writes classify-state.jsonl
  npm run classify-incremental -- --run-llm --max 40

  # Second pass — expect skippedHash > 0
  npm run classify-incremental -- --dry-run --state-in data/experiments/categorize/classify-inc-*/classify-state.jsonl

  # Retry manual-review bucket (controlled)
  npm run classify-incremental -- --retry-stuck --run-llm --state-in .../classify-state.jsonl
  ```
  - Default corpus paths match Task 02 (`2026-05-21T02-02-56`, `2026-05-21T03-03-24` + ai-eval jsonl)

- **Before/after metrics:**
  - Build verified (`npm run build` ✓)
  - CLI dry-run executed; local corpus dirs empty in this workspace (0 items) — re-run on saved corpus for full before/after artifact
  - Expected after 2nd dry-run on same state: `skippedHash` ≈ prior `classifiedSpecific + classifiedGeneral`

- **Known remaining gaps:**
  - CLI/app shared policy duplicated in `.mjs` mirror (same as eligibility today)
  - No historical run log store beyond `lastClassifyRun` / `lastDiscoverRun` snapshots
  - Dev UI/UX clarity deferred (see Task 03.2)

- **Suggested backlog/doc updates:**
  - V1.1: mark incremental hardening + dev hub **done**; note `manual_review`, `pending_discover`, reconcilers
  - V2 UX: accept/reject + guided pipeline steps + simpler dev hub

- **Ready for next step (search foundation):** yes — with caveat that dev UX should be simplified in parallel or before wider use

---

## Task 03.1 — Discover CLI hardening (2026-05-26)

- **Shipped (CLI):**
  - `scripts/categorize/lib/discoverPolicy.mjs` — stuck pool selection, stats, gap-fill fair-game
  - `npm run discover-incremental` — `--dry-run` / `--run-llm`, requires `--state-in` classify-state.jsonl
  - Batch retry on JSON parse failure (falls back to single-item calls)
  - Outputs: `run-stats.json`, `taxonomy-out.json`, `classify-state-after-discover.jsonl`, `discover-pool.jsonl`
  - Reclassify only marks items when discover LLM batch succeeded (not on failure)

- **Corpus loop (real run):**
  1. Classify: 63 specific · 25 general · 10 unassigned
  2. Discover (2×16 batch): **+5 parents · +28 leaves** (40→73 leaves), 32 stuck sampled
  3. Reclassify after discover (48 LLM): **31 specific · 11 general · 6 unassigned** (+63 unchanged skipped)

---

## App alignment (2026-05-26)

- **Shipped in app + dev UI:**
  - `src/lib/categorization/discoverPolicy.ts` — stuck pool, batch retry, reclassify guard
  - `discoverBatch()` — gap-fill on stuck only (default), `maxBatches`, `sampleBatchSize`, persists `lastDiscoverRun`
  - Auto-discover after classify uses stuck-only + batch size 16
  - `getDiscoverPoolStats()` for dev preview without LLM
  - `CategorizationPanel`: pipeline stats box, discover pool breakdown, last classify/discover runs
  - **Discover stuck (N)** button with batch count control; **Retry manual (N)** for `manual_review`
  - **auto-discover after classify** checkbox
  - Build verified (`npm run build` ✓)

- **App alignment checklist:**
  - [x] Port `discoverPolicy` to TypeScript
  - [x] `lastDiscoverRun` persisted + shown in UI
  - [x] Don't mark reclassify on failed discover batches
  - [x] Dev panel: discover pool + stuck breakdown + run summaries
  - [x] `maxBatches` cap in discover UI (default 2)
  - [x] Retry manual review button (`retryManualReview: true`)

---

## Task 03.2 — Dev UI + queue policy alignment (2026-05-26)

### Shipped (app dev UX)

- **Unified enrichment dev hub** on Bookmarks toolbar: **Results** | **Enrich** | **Categories**
  - **Results** and **Categories** open the same **Enrichment dev** modal with tabs: **Results** | **Queue & taxonomy**
  - Removed standalone **Pipeline dev** sidebar entry (tools consolidated, not removed)
- **`PipelineDevView`** embedded in Queue & taxonomy tab: classify queue filters + table + **Taxonomy** tree with counts
- **`devQueries.ts`**: `listPipelineQueueItems`, `getPipelineQueueFilterCounts`, `getTaxonomyTreeWithCounts`
- **`CategorizationPanel`**: collapsible by default in Results; pipeline stats, discover pool, scoped classify/discover
- **`ClassifyQueueReasonBlock`**: human-readable gate/skip reasons; **Force re-classify** / **Run Classify pending** as clickable per-item actions
- **Enrichment Results filters:** Fetch, Topic (has/no topic), Classify (**ready** / **need discover** / needs attn / ineligible / manual)
- **Typography:** `.dev-pipeline-ui` scale (14–20px) for dev surfaces
- **Layout:** side-by-side queue table + detail; scroll min-heights; collapsed pipeline panel so bookmark list stays visible

### Shipped (queue / discover policy fixes)

| Issue | Fix |
|-------|-----|
| LLM “no topic” → terminal `skipped` | Route to **`pending_discover`** (or `manual_review` after 2 retries); never terminal skip for AI-ready items |
| Discover pool only “Other/general” | **`isDiscoverFairGame`** now includes **`unassigned`** (no primary link, eligible) |
| Legacy `skipped` / stale `pending_classify` | **`reconcileSkippedToPendingDiscover()`**, **`reconcileUnassignedAfterClassify()`** on load via `ensurePendingClassifySignals()` |
| Skip reason showed bookmark title | **`classifyQueueReason`**: filter title echoes; store skip **code** on classify; show “LLM confidently returned no topic” |
| “Pending” count ≠ classify button | **ready** filter uses `getScopedCategorizationStats().readyItemIds` (same as Classify pending button) |
| `needs attn` inflated vs `no topic` | Align with pipeline dev: no **specific** topic yet (not `!primaryName` OR needsClassify double-count) |

### Key files (Task 03.2)

- `src/components/dashboard/EnrichmentPanel.tsx` — toolbar entry points
- `src/components/dashboard/EnrichmentReviewModal.tsx` — dev tabs + filters
- `src/components/dashboard/PipelineDevView.tsx` — queue + taxonomy (embedded mode)
- `src/components/dashboard/CategorizationPanel.tsx`, `ClassifyQueueReasonBlock.tsx`
- `src/lib/categorization/classifyQueueReason.ts`, `devQueries.ts`
- `src/lib/categorization/discoverPolicy.ts` — `unassigned` in discover fair-game
- `src/lib/categorization/classifyTopicExtract.ts` — reconcilers + no-topic → `pending_discover`
- `src/lib/categorization/topicExtract.ts` — prompt: propose leaf instead of skip for substantive pages
- `src/styles/global.css` — `.dev-pipeline-ui`
- `scripts/categorize/lib/discoverPolicy.mjs` — CLI mirror (`unassigned`)

### Recommended dev workflow (until UX redesign)

1. **Enrich** — select bookmarks → fetch + AI  
2. **Results** — check ok / no topic / **ready** / **need discover**  
3. Expand **Show pipeline** → **Classify pending** (scoped to AI-ready in list)  
4. **Discover stuck** if **need discover** or stuck on Other/general  
5. **Classify pending** again after new taxonomy leaves  
6. Per-item **Force re-classify** on skipped/manual/disagreements  
7. **Categories** tab — inspect queue buckets + taxonomy counts

### Known remaining gaps (defer to UX pass)

- Dev UI is dense; easy to get lost between tabs, filters, and collapsed panels
- Some scroll/layout glitches on small viewports
- Step order not guided in-product (workflow above is doc-only)
- CLI/app policy still duplicated in `.mjs` mirrors
- No historical run log beyond `lastClassifyRun` / `lastDiscoverRun`
- Accept/reject product UX still V2

### Baseline sign-off

**Agreed:** pipeline baseline is working for R&D — fetch → AI → classify → discover loop with observable queue states. Next priority is **UX clarity** (or search foundation per roadmap), not more core pipeline logic unless regressions appear.

