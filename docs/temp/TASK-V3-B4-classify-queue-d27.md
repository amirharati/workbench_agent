# TASK-V3-B4 — Discover + Taxonomy Fragmentation Fix

**Status:** **1a complete — pending master accept** (workflow → **B2**; optional cold-classify audit in this file)  
**Last session:** 2026-06-03 (map→reduce + eval) — see [**Task return — session 1a**](#task-return--session-1a-2026-06-03)  
**Implementation brief:** This file is the **single source of truth** for discover algorithm work; do not open a second task file for B4 code.  
**Policy:** Staged AI runs — see program breakdown § Product policy (import auto-run is debt → **A5b**).  

### Session 1a scope (this file — algorithm)

| In scope | Out of scope (→ **B2** / **B5**) |
|----------|-----------------------------------|
| `discoverTaxonomy` prompt + JSON contract | Hub “N ready to discover” banners |
| `mergeDiscoveryParents` / `mergeDiscoveryLeaves` | Triggers for **old library** backfill vs **new link** |
| Empty / seed taxonomy bootstrap | Import post-commit staging UX |
| Bulk discover caps, sampling, pre-classify discover pass | Single-item Inspector discover CTA |
| Orphan `parent_id`, parent explosion | User-edited category → re-run discover |
| Post-batch `taxonomyMerge` | Fair-game **UI** breakdown panel |

**Validate 1a with:** CLI `discover-incremental` and/or Hub **manual** discover on fixed `itemIds` — not new product flows.

---

## Next session kickoff (master — session 1a)

**Big goal:** Build a **map → reduce** discover pipeline (several **short LLM sub-calls**, counts TBD in **B1**) that:

1. **Map** — From item samples, create **candidate clusters** as proposed **parents** and **leaves** (allow reasonable freedom within caps; optimize for recall).
2. **Reduce** — **Prune / merge** candidates against **existing taxonomy** (seed + prior discovered) **and** other candidates from **this run**, with explicit rules for when to keep a **new parent**, keep a **new leaf**, or fold into an existing node.
3. **Mechanical** — Code dedupe, link rewrite, keyword safety net (`taxonomyMerge`); audit log of merges.

**Not this session:** Hub staging, import triggers, user-signal wiring (**B2** / **B5**).

**Pair with:** Short **B1** spec (caps, pool, merge rules table) before or in parallel with B4 code.

### CLI-first eval — 2×2 matrix (master)

**Pipeline each cell:** `discover` → `taxonomy-out.json` → `classify` (same classify script; measures whether discovered leaves are **assignable**).

**Run all four** (cheap at ~124 items × 4 discover + 4 classify — adjust `--max` / `--max-batches`):

|  | **Baseline** (current discover CLI) | **Candidate** (map→reduce) |
|--|-------------------------------------|----------------------------|
| **Cold** (`--no-seed`) | `eval-<id>/baseline-cold/` | `eval-<id>/candidate-cold/` |
| **Warm** (`--seed-in` seed JSON) | `eval-<id>/baseline-warm/` | `eval-<id>/candidate-warm/` |

**Helper (baseline pair only):**

```bash
chmod +x scripts/categorize/run-discover-eval-baseline.sh
./scripts/categorize/run-discover-eval-baseline.sh eval-2026-06-03 124 4
```

After map→reduce: copy script pattern or re-run with `--out eval-<id>/candidate-cold` / `candidate-warm` (same flags).

**Isolated:** fresh taxonomy per cell; same corpus + `--max` + `--max-batches` for all four.

#### Metrics — discover (primary)

| Metric | Where |
|--------|--------|
| `proposedParentsRaw` / `proposedLeavesRaw` | `discover/.../run-stats.json` |
| `newParents` / `newLeaves` (after code merge) | same |
| Parent count in `taxonomy-out.json` | `parents.length` |
| Leaf count / orphan `parentId` | `taxonomy-out.json` leaves |
| `llmErrors`, failure buckets | run-stats |

#### Metrics — classify (secondary)

| Metric | Where |
|--------|--------|
| `classifiedSpecific` | classify `run-stats` / SUMMARY |
| `pending_discover`, `classified_general`, `pending_classify` | classify state / SUMMARY |
| Assignment rate | specific ÷ eligible |

#### Compare artifact

Write `eval-<id>/COMPARE.md` — table of four cells × discover + classify metrics; note regressions.

**CLI note:** Baseline uses `taxonomyDiscover.mjs` mirror. Candidate must **sync mirror** or tsx-import `src/lib` after implementing map→reduce in app code.

**App validate (after CLI):** Hub manual discover + classify on same N; optional fifth row in COMPARE.

---

## Target algorithm — map → reduce (multi-call) (master 2026-06-03)

**Philosophy (not Hadoop):** two phases with **separate LLM jobs**, not one prompt that must invent *and* tidy taxonomy.

| Phase | Purpose | Call shape | Context budget |
|-------|---------|------------|----------------|
| **Map** | Find clusters in this sample; propose parents/leaves (recall OK) | **Several short calls** — small item batches (e.g. 8–15 items), one task: “what topics appear?” | Items + **compact** parent list (id, name); avoid full leaf catalog every time |
| **Reduce** | Merge proposals into existing + each other; broaden coverage | **One or few short calls** on **proposal list only** (names, descriptions, parentId hints) — no item bodies | Candidates from this run + shortlist of existing nodes (seed + relevant discovered) |
| **Mechanical** | Safety net | Code: name dedupe, `taxonomyMerge` keywords, link rewrite | No LLM |

**Why several shorter calls (vs one big discover batch):**

| | One big call | Map + reduce, short calls |
|--|--------------|---------------------------|
| **Quality** | Model mixes discover + reuse + merge; catalog noise | Each call has **one job**; better JSON adherence |
| **Cost** | Huge prompt every time (full catalog + many items) | Lower **if** map calls are slim and reduce omits item text; can be worse if every map call repeats full catalog — **avoid that** |
| **Time** | Single wall-clock wait; failure loses batch | Map chunks can run **sequentially** (extension tab); partial progress; reduce is fast |
| **Scale** | Context limits cap batch size | Same total items, more calls, each under token ceiling |

**Acceptance (1a):** measure `proposedParentsRaw` vs parents **after reduce**; target ≤ ~5 net new parents per ~400-link wave (program breakdown / B4 criteria).

**Code (session 1a+):** `runDiscoverMapReduce` — **MAP 32×4** (baseline-aligned sample), rich catalog (parents + leaf names, 1200-char summaries) → **reduce-parents** → **reduce-leaves per parent** (parallel ×5). Net caps **5** parents / **36** leaves; generous token budgets (MAP 6500, reduce 5–5.5k). CLI: `discover-incremental`; eval arms `baseline-*`, `candidate-v3-*` (see B1).

**Related:** [`TASK-V3-A5b-import-scale.md`](TASK-V3-A5b-import-scale.md), [`TASK-V3-B2-discover-ux-loop.md`](TASK-V3-B2-discover-ux-loop.md), [`TASK-V3-A3-stage-aware-errors.md`](TASK-V3-A3-stage-aware-errors.md), [`TASK-V3-pipeline-workflow.md`](TASK-V3-pipeline-workflow.md)

---

## Session status — 2026-06-02 (end of worker session)

### What broke in the last real run (~/Documents/test4)

Debug artifact `pipeline-run-latest.json` (405 items, `full_digest`):

| Metric | Value |
|--------|--------|
| Enriched | 357 |
| Failed fetch/AI | 46 |
| **Classified** | **0** |
| All items `classifyState` | `pending_classify` |
| Batch message | `357 fetched · classification skipped (import taxonomy in Settings) · 46 failed` |

**Root cause:** `classifyIncremental` threw `No taxonomy loaded` when `getAssignableLeaves()` was empty. `itemPipeline` caught it and treated classify as **skipped** (not failed), so enrich looked successful while every link stayed uncategorized.

Secondary risk: `prepBatchPipelineItems` still calls `reconcileOrphanClassifiedSignals()` at pipeline **start** — can reset items if prior run left `classified` signals without links (see robustness below).

### Shipped this session (code)

| Area | Change |
|------|--------|
| **Import → pipeline** | Import Studio **auto-starts** `runBatchDigest` on commit (`processAll: true`) — no “select links → Run pipeline” gate. |
| **Startup taxonomy** | `ensureSeedTaxonomy()` on app load with **retry**; errors logged, not swallowed. |
| **Classify gate** | Removed hard throw on empty leaves; auto `importSeedTaxonomy` + proceed; discover can bootstrap if still empty. |
| **Pipeline order** | Removed “warm-up” discover (capped 1 parent / 6 leaves). **Plain `discoverBatch`** before classify for multi-item runs (no batch-size ≥10 gate, no artificial caps on that pre-pass). |
| **Earlier (still in tree)** | Phased `persistClassifyResults` + verify; per-LLM-batch DB flush; orphan reconcile removed from mid-classify; post-merge always flush; Settings clear DB + re-seed; Hub banner if `leafCount === 0`. |

**Not re-validated end-to-end** after the above on a fresh 400-link import — user reports classify behavior “seems better” but discover/parents/UI still wrong.

### Open issues — next session (priority)

#### 1. Discover algorithm (highest product risk)

- **Symptom:** Discover “never finds parents” (or parents don’t match intent); taxonomy still fragments or stays flat.
- **Unclear:** End-to-end contract — when does discover propose `newParents[]` vs only `newLeaves[]` under seed? How does prompt + merge interact with empty vs seed-loaded DB?
- **Needs:** Written flow diagram (sample → LLM JSON → `mergeDiscoveryParents` / `mergeDiscoveryLeaves` → SQLite); logging of dropped proposals (orphan `parentId`); validate B1/B2 prompt changes actually reduced redundant parents on a 400-link run.
- **Track:** Tasks A–B below (partially done); may need **new** task for parent-matching heuristics beyond exact name dedup.

#### 2. Workflows & UI (feels broken even when pipeline succeeds)

- **Symptom:** Summary toasts/reports read like **everything failed** while most items enriched OK (test4 message is a prime example).
- **Inconsistent:** Colors, phase labels, success vs skip vs fail — Import Studio vs Hub vs `PipelineProgressProvider` modal vs import report vs Inspector.
- **Needs:** Success-first copy; separate **enrich OK / classify OK / discover OK / failed** counts; never label whole run “skipped” when only one stage skipped; align with A3 stage-aware error taxonomy.
- **Tracks:** A3, A5, B2, `PipelineHubView`, `formatBatchDigestProgress` / `buildImportReport`.

#### 3. When to rerun discover / reclassify (signals)

- **Symptom:** Unclear when app should suggest “run discover again” vs “reclassify only” vs full digest; Hub/Home chips vs actual fair-game queues don’t always match user mental model.
- **Needs:** Single policy doc: queues (`pending_classify`, `pending_discover`, `classified` + no link, `*-general` only); which Hub actions map to which pipeline flags (`skipDiscover`, `forceClassify`, enrich-only).
- **Tracks:** B5 (user signals), D-27, `categorizationFairGame.ts`, `discoverPolicy.ts`, Hub maintenance actions.

#### 4. Overall pipeline robustness (still fragile)

- **Symptom:** Multi-day struggle: classify counts vs SQLite links diverge; refresh worker cache vs tab cache; large `batchMutate` + FK failures; orphan reconcile wiping hundreds after a “successful” classify.
- **Still watch:** `reconcileOrphanClassifiedSignals` in `prepBatchPipelineItems` at **batch start**; `refreshPipelineCacheFromWorker` after partial writes; classify running while taxonomy empty before fixes.
- **Needs:** A5 acceptance run on 400 links with post-run SQL/check script or debug export; invariant: `assignedPrimary` in run summary == count of primary links in DB.
- **Tracks:** A1, A5, A6 (orchestrator), persistence section in classifyTopicExtract.

#### 5. Scale — bulk import **10k+** is normal (not designed yet)

**Product expectation:** A single Import Studio commit can be **10,000 links or more**. The pipeline must be designed for that, not for ~400-item lab runs only.

**What the code does today (problematic at 10k):**

| Stage | Current behavior | Risk at 10k+ |
|-------|------------------|--------------|
| **Import commit** | All `affectedItems` passed to one `runBatchDigest` with `processAll: true` | One browser tab holds the entire run; no import-level checkpoint/resume |
| **Enrich** | `enrichBatch` with `maxItems = N`, concurrency **2** | Wall-clock hours; tab sleep/close loses in-flight work unless user retries from Hub |
| **Pre-classify discover** | `discoverBatch({ itemIds: all N, enforceBulkRunCap: false })` — can run **unbounded** sample chunks over the scoped pool | Many LLM calls; loads **all** `items` + enrichments from DB per discover pass |
| **Classify** | `runClassifyWithDiscover` merges **full** `pending_classify` queue + batch ids | Queue can be entire library, not just this import wave |
| **Merge** | `runTaxonomyMerge` when `uniqueIds.length >= 10` | Full-taxonomy scan — OK once, but coupled to one giant run |
| **UI** | Single progress string + one `pipeline-run-latest.json` | Hard to see partial progress; debug artifact huge |

**Design direction (next sessions — likely A5 + A6):**

- **Wave / chunk processing:** e.g. enrich 50–200 ids per wave, flush + optional cache refresh, persist run checkpoint (`importRunId`, last offset, stage).
- **Discover at scale:** Pre-classify discover should **sample** across the batch (fixed `maxBatches` / stratified sample), not imply one LLM pass per 10k item; taxonomy bootstrap once per import wave, not per item.
- **Classify at scale:** Classify in LLM batch chunks (already partially there); cap **merged** queue per wave so one import doesn’t pull 50k pending items from prior runs unless user opts in.
- **Defer or background:** After commit, show “Import saved — processing 10,234 links in background” with Hub queue; don’t block Import Studio until wave 1 completes.
- **Acceptance:** 10k import completes incrementally (or resumes after refresh); no OOM; user sees wave N/M and per-stage counts.

**Tracks:** A5 (import reliability), A6 (orchestrator), B6 (discover perf), `itemPipeline.ts`, `ImportStudioView.tsx`.

### Implementation checklist (tasks A–E)

| Task | Status | Notes |
|------|--------|--------|
| **A** Orphan leaf guard | **Done** | Log + partial parentId recovery in `discoverTaxonomy.ts` |
| **B** Prompt + caps | **Done** | Full catalog with IDs; tighter rules; lower caps at discover call sites |
| **C** Discover before classify | **Done (revised)** | Was “warm-up” (≥10 items, 1 parent / 6 leaves). **Now:** plain `discoverBatch` before classify for `uniqueIds.length > 1`, no warm-up caps. Section C below is **superseded** — keep for history. |
| **D** End discover for `*-general` | **Done** | `listItemIdsWithGeneralCategory` + gap-fill discover + reclassify |
| **E** Post-batch merge | **Done** | `taxonomyMerge.ts` at end of batch pipeline |

### Acceptance criteria (still not met)

- [ ] ~400-link import: most enriched items get a **non–pending_classify** primary category (or explicit `pending_discover` with reason).
- [ ] ≤ ~5 new discovered **parent** domains per batch (not 30+).
- [ ] No `parent_id IS NULL` leaves after run.
- [ ] UI summary matches DB counts; user does not read run as total failure when classify ran.
- [ ] **10k import:** commit returns quickly; processing continues in **waves** with resume; discover/classify make bounded LLM use per wave; user sees progress N/M (not one 10k-blocking modal).

---

## Problem Summary

The discover phase currently produces a severely fragmented taxonomy. A single batch of ~400
bookmarks created **37 new parent domains** alongside the 9 seed parents (e.g. `deep-learning-education`,
`data-science-tutorials`, `cloud-computing-resources` as parents — all should be leaves under the
existing `machine-learning` or `infra-hosting` seed parents). Additionally **21 discovered leaves**
ended up with `parent_id = NULL` in SQLite because their proposed `parentId` didn't match any known
parent when the leaf was written.

Root causes:
1. The prompt shows the catalog but the LLM still creates new parents for things that clearly belong to
   existing ones (misreads "Machine learning & AI research" as not covering deep learning, data science,
   NLP, etc.).
2. `mergeDiscoveryParents` only dedups by exact normalised name — it doesn't catch semantic overlap
   with seed parents.
3. Classify runs first against the seed-only taxonomy; most items fail and go `pending_discover`. Then
   discover creates new parents instead of filling leaves under existing ones.
4. There is no post-batch cleanup to merge redundant categories already in the DB.

---

## Tasks (in implementation order)

### A · Fix orphan leaf writes — immediate data-integrity guard

**Files:** `src/lib/categorization/discoverTaxonomy.ts`

**What:** Leaves whose `parentId` is not found in the current `parentIds` set are silently dropped by
`mergeDiscoveryLeaves`. The items that triggered those proposals remain unassigned. This needs two
sub-fixes:

1. **Hard reject with clear log** — when `!parentIds.has(p.parentId)` log a warning
   `[discoverTaxonomy] leaf "${p.name}" dropped — unknown parentId "${p.parentId}"` so the issue is
   visible in debug runs.
2. **Recovery**: if the proposal's `parentId` is a known leaf or a partial-match slug (e.g. `"ml"`,
   `"deep-learning"`) try to resolve it to the closest seed parent before dropping.  
   Matching logic: strip trailing `-resources`, `-education`, `-tutorials` suffixes, then test if
   the result is a `parentIds` member. If found, rewrite `p.parentId` to the resolved id.

**No DB changes needed** — the bug is in the in-memory merge step.

---

### B · Tighten the discover prompt to stop redundant parent creation

**Files:** `src/lib/categorization/discoverTaxonomy.ts`

This is the highest-leverage fix. Two parts:

#### B1 · Show the full catalog (all existing leaves, not just grouped)

The current `buildDiscoveryPrompt` passes `leavesSoFar` through `buildGroupedLeafCatalog` +
`formatGroupedCatalogMarkdown`. The formatted output looks clean but the LLM loses the exact IDs and
misses how broad each parent already is.

Change the catalog section to list every existing parent with **its exact `id`** and a bullet list of
leaf names (not IDs) under it — so the model can see "machine-learning already covers: NLP &
transformers, ML inference infrastructure, ML theory & tutorials, Other (Machine learning & AI
research)…" and knows to add a leaf there rather than a new parent.

Format (condensed, but IDs must be verbatim):

```
## Existing taxonomy — reuse these exact parentIds in newLeaves

**machine-learning** (Machine learning & AI research)
  • NLP & transformers
  • ML inference infrastructure
  • ML theory & tutorials
  • Diffusion & generative models
  • Other (Machine learning & AI research)  ← general fallback

**infra-hosting** (Infrastructure & hosting)
  • Cloud & VPS hosting
  • ML inference infrastructure
  …
```

#### B2 · Rewrite the rules to block premature new parents

Replace `DISCOVER_CATALOG_RULES` entries 1-3 with:

```
- Use exact parentId strings from the taxonomy above. Never invent a parentId not listed above 
  unless you also define that parent in newParents[].
- Only add newParents[] when the batch contains a cluster that belongs to a top-level domain 
  with NO close match above (e.g. cooking, law, sports). Deep learning, NLP, data science, 
  cloud infra, etc. all fit existing parents — do NOT create new parents for specialisations.
- Prefer adding a new leaf under an existing parent over creating a new parent. Ask: "does this 
  content broadly fit any existing parent's description?" If yes, add a leaf there.
- Each new leaf must be atomic (2-5 words), genuinely distinct from every existing leaf name 
  listed above, and placed under the most specific matching existing parent.
- Require at least 2 items in the batch to justify any single new leaf. 
  Do not create leaves for singletons.
```

#### B3 · Lower the caps

Change the call-site parameters in `discoverBatch`:
- `maxNewParents`: 5 → **2** (per batch call)
- `maxNewLeaves`: 20 → **8** (per batch call)
- `sampleBatchSize`: 16 → **24** (larger sample = better clustering before proposing)

These live in `src/lib/categorization/classifyTopicExtract.ts` or wherever `discoverBatch` is called
from `itemPipeline.ts` — check exact call site.

---

### C · Discover-first pass for batch imports (≥ 10 items)

**Files:** `src/lib/pipeline/itemPipeline.ts`

**What:** For batch imports the seed taxonomy is often too narrow for the user's actual content. Running
a lightweight discover pass *before* the main classify pass lets the model see the real distribution of
the batch and add leaves under existing parents before classify runs.

**How:**
1. In `runItemPipeline`, after the enrich phase completes and before calling
   `runClassifyWithDiscover`, check `uniqueIds.length >= 10`.
2. If so, call `discoverBatch` with:
   - `itemIds`: up to 32 items sampled from the enriched batch (prefer recently fetched)
   - `sampleBatchSize: 24`
   - `maxNewParents: 1` (almost no new parents in this warm-up pass)
   - `maxNewLeaves: 6`
   - `gapFillMode: false`
   - No `stuckOnly` filter — we want a broad sample of what the batch looks like
3. After the discover-first call, flush writes and refresh the cache.
4. Then proceed to `runClassifyWithDiscover` as normal.

The discover-first pass is intentionally conservative (`maxNewParents: 1`, `maxNewLeaves: 6`) — its
only purpose is to give classify a few domain-relevant leaves to work with. The main discover pass
(post-classify) still runs for stragglers and can be more expansive.

**Progress reporting:** report phase `'discover'` with label `"Warming up taxonomy…"`.

---

### D · End-of-pipeline discover pass for still-unassigned items

**Files:** `src/lib/pipeline/itemPipeline.ts`

**What:** After classify → discover → reclassify → `assignGeneralLeafFallback`, items that only
received a `*-general` leaf (classified_general) should get one more discover shot in `gapFillMode`.
The user confirmed: "we can also run another discover at end if something is not assigned."

Currently `assignGeneralLeafFallback` handles the completely unassigned case. This task adds a step
for items that got a general leaf but would benefit from a specific one.

**How:**
1. After the existing discover + reclassify block, before `assignGeneralLeafFallback`, check:
   ```
   const generalOnlyIds = await listItemIdsWithGeneralCategory(itemIds);
   ```
   (`listItemIdsWithGeneralCategory` returns items whose primary link points to a `*-general` leaf)
2. If `generalOnlyIds.length > 0` and `!skipDiscover`:
   - Run `discoverBatch` with `gapFillMode: true`, `sampleBatchSize: 24`, `maxNewParents: 1`,
     `maxNewLeaves: 6`, `stuckOnly: false`, passing `generalOnlyIds`.
   - After flush + cache refresh, re-run `classifyIncremental` on those ids with `forceReclassify: true`.
3. `assignGeneralLeafFallback` remains as the final safety net after this.

**New helper needed:** `listItemIdsWithGeneralCategory(itemIds)` — query `ai_item_category_links`
joined with `ai_categories` where `is_general_fallback = 1 AND score = (max score for item)`.
Add to `src/lib/pipeline/pipelineHubQueries.ts` alongside the existing `listItemIdsWithoutCategory`.

---

### E · Post-batch category merge (consolidate duplicates)

**Files:** new `src/lib/categorization/taxonomyMerge.ts`, called from `src/lib/pipeline/itemPipeline.ts`

This cleans up the fragmentation already in the DB and prevents accumulation over time. Run once at
the **end** of every batch pipeline run (after step D).

#### E1 · Parent deduplication

A discovered parent is a candidate for merging into a seed parent when:
- Its `source = 'discovered'` and `kind = 'parent'`
- Its normalised name is a **subset phrase** of a seed parent's name, OR
- Its name contains any of the seed parent's canonical domain keywords (defined as a static map)

Example merge map for the seed parents:

```typescript
const SEED_PARENT_ABSORBS: Record<string, string[]> = {
  'machine-learning': [
    'deep learning', 'neural network', 'data science', 'nlp', 'natural language',
    'tensorflow', 'pytorch', 'computer vision', 'speech recognition',
    'reinforcement learning', 'data analytics',
  ],
  'infra-hosting': [
    'cloud computing', 'cloud training', 'cloud pricing', 'gpu cloud',
    'server hosting', 'cloud resources',
  ],
  'software-dev': [
    'software engineering', 'open source', 'developer tools', 'ide',
  ],
  'ai-productivity': [
    'ai tools', 'llm tools', 'ai assistant',
  ],
};
```

For each discovered parent whose name matches an absorb keyword, the merge does:
1. Move all its leaves to the seed parent (update `parentId` + `parentName` on each leaf)
2. Update all `ai_item_category_links` referencing those leaves (no change needed — leaf ids are kept)
3. Delete the discovered parent and its auto-generated `*-general` leaf (or reassign its links to
   the seed parent's general leaf first)

#### E2 · Leaf deduplication

Two leaves are merge candidates when:
- Both have the same `parentId` (or one is being absorbed into the other's parent per E1)
- Their normalised names match exactly, OR one name is a strict suffix/prefix of the other
  (e.g. "Deep Learning Resources" ≈ "Deep Learning" within same parent)

Merge: keep the leaf with more `primary_item_count`; redirect all links from the other to the
canonical one; delete the duplicate.

#### E3 · Link rewrite

```sql
UPDATE ai_item_category_links SET category_id = :canonicalId WHERE category_id = :mergedId;
```

Run inside a transaction. After all merges, recalculate `item_count` / `primary_item_count` on
affected categories.

#### E4 · Calling convention

```typescript
// At the end of runItemPipeline, after the discover/classify passes:
if (uniqueIds.length >= 10) {
  report(opts, 'classify', 'Merging duplicate topics…', 0, 1);
  const { runTaxonomyMerge } = await import('../categorization/taxonomyMerge');
  await runTaxonomyMerge({ signal: opts.signal });
  await flushWrites(opts, 'Saving merged taxonomy…');
}
```

`runTaxonomyMerge` returns `{ mergedParents: number; mergedLeaves: number }` for debug logging.

---

## Implementation Order

```
A  (orphan guard)         ← no dependencies, fix first, avoids future orphans
B  (prompt + caps)        ← makes all future discover calls cleaner
C  (discover-first)       ← depends on B being in place (uses the tightened prompt)
D  (end-of-pipeline discover for general-only items)  ← new helper needed
E  (post-batch merge)     ← depends on nothing, cleans up past + ongoing runs
```

Tasks A and B can be done in one commit. C, D, E each in their own commit.

---

## Acceptance Criteria

- After a fresh batch import of ~400 mixed-domain bookmarks, the taxonomy should have ≤ 5 new
  discovered parent domains total (the seed already covers the common ones).
- No leaves with `parent_id IS NULL` in `ai_categories` after a batch run.
- The post-batch merge step reduces the parent count from ~46 (current) to ≤ 20 for a tech-heavy
  library.
- Items classified as `*-general` on the first pass should get a specific leaf after the
  end-of-pipeline discover, or remain `*-general` only if no cluster of 2+ matching items exists.

---

## Task return — session 1a (2026-06-03)

| Field | Value |
|-------|-------|
| Status | **1a complete — pending master accept** (cold classify regression optional follow-up) |
| Master accept | [ ] Review COMPARE + test4 dogfood · [ ] Commit map→reduce code |
| Artifacts | `data/experiments/categorize/eval-eval-2026-06-03/COMPARE.md` · `merge-audit.json` per discover run |
| COMPARE (discover) | Cold: **14→5** parents raw→net; warm: **4→0** parents, **+23** leaves; orphans **0** |
| COMPARE (classify) | Warm **78** specific (baseline 71); cold **19** vs **40** (sample 48 vs 111 + dropped leaf parentIds) |
| Code | `src/lib/categorization/discoverMapReduce.ts`, `discoverTaxonomy.ts`, `taxonomyMerge.ts` (`applyTaxonomyMergeInMemory`), `classifyTopicExtract.ts` (`discoverBatch`), `scripts/categorize/run-discover-incremental-app.mts`, `run-discover-eval-candidate.sh` |
| CLI | `npm run discover-incremental` → app map→reduce; `discover-incremental-legacy` for baseline |
| Left for **1b (B2)** | Hub staging, when to show Run discover, import/backfill triggers, fair-game **UI**, user signals (**B5**) |

### Implementation checklist (1a)

| Item | Status |
|------|--------|
| Map batches (compact parent catalog) | **Done** |
| Reduce LLM on proposals | **Done** |
| Mechanical dedupe + orphan parentId | **Done** (existing + merge) |
| `taxonomyMerge` safety net + audit log | **Done** (`merge-audit.json` CLI; console in app) |
| CLI eval 2×2 | **Done** — see COMPARE.md |
| Acceptance ≤5 parents | **Met** on candidate-cold (14 raw → 5 net) |
