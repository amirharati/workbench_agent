# TASK-02 — AI categorization V1

**Status:** **Done (V1)** — app + CLI both on **LLM-first** taxonomy (topic-extract classify + gap-fill discover). Embeddings are supporting signals only.  
**Backlog linkage:** `docs/backlog.md` → **AI — V1**  
**Depends on:** Task 01 + Task 01.5 (`buildItemText`, enrichment store, tuned extraction)  
**Objective:** first usable semantic categorization loop without chunk-level RAG.

> **Approach change (master session):** Original plan was **embedding-first** (doc vectors → centroid assign → k-means bootstrap). We **shipped LLM-first** instead: batched **Discover** grows the catalog; **Classify** (topic-extract) assigns from title + AI summary + grouped leaf catalog. Doc embeddings remain in `ai_item_signals` for hash/skip and optional legacy shortlist — not the primary judge of topic fit.

---

## Design decisions (locked — updated 2026-05-25)

| Topic | Decision |
|-------|----------|
| **Primary judge** | LLM topic-extract (classify) + LLM discover (taxonomy gaps) |
| **Embeddings** | OpenRouter `text-embedding-3-small`; stored on `ai_item_signals`; used for `textHash`, discovery batch diversity, legacy `--legacy-shortlist` only |
| **Taxonomy shape** | 8 fixed parents + discovered leaves + one `*-general` per parent |
| **Multi-topic** | Up to 3 concurrent `topicIds` from LLM; primary = first |
| **Fair game** | AI-ready items that are unassigned, `pending_*`, or primary on `*-general` / Other — **not** failed fetch / no summary |
| **Discover** | Full fair-game corpus in batches of **32**; **gap-fill** prompt when extending seed; merge `newLeaves` + `assign_new` from `itemResults` |
| **Classify** | `promoteProposedLeaf` on `new_category` when `parentId` valid; re-classify general/Other |
| **Tags** | After assignment on signals; enrichment `aiTags` hints only |
| **Links** | `status: suggested` until accept UX |
| **Backup** | `exportDB` includes AI stores + `_pipelineExportCounts`; pipeline calls `notifyDataChanged` after classify/discover/enrich |

---

## Goal

Implement a local-first categorization pipeline that:

1. builds one **document-level embedding** per bookmark from `buildItemText(...)`,
2. assigns bookmarks to **AI categories** using centroid similarity,
3. stores assignments and per-item AI signals in new DB stores,
4. supports novelty handling (unmatched items) and bootstrap from near-empty categories,
5. keeps manual project/collection model unchanged.

This is the baseline for later hybrid search and optional cloud upgrades.

---

## Execution mode (agreed for this task)

1. **CLI-first (primary):** build and validate categorization pipeline in `scripts/` first, similar to Task 01/01.5 workflow.
2. **App integration (secondary):** once CLI output quality/stability is acceptable, wire into app services and a **dev-only** UI trigger/review surface.
3. **Product UX (later):** final user workflow placement stays out of this task; dev controls are acceptable.

This keeps iteration fast and avoids locking storage/UX decisions too early.

---

## Product boundaries (important)

- **In scope (V1):**
  - Doc-level embeddings only.
  - Category assignment + basic secondary support (hard cap).
  - Tags generated **after** category assignment.
  - Deterministic pipeline; no heavy LLM clustering loop.

- **Out of scope (V1):**
  - Chunk/paragraph embeddings (V2).
  - ANN index (V2 if brute-force is too slow).
  - Full product UX polish for enrichment/categorization.
  - Taxonomy DAG (`parentIds[]`) data model (deferred V2 item in backlog).

---

## Data model (required)

Add DB stores (version bump in `db.ts`) aligned to backlog:

1. `ai_categories`
   - `id`, `name`, `status` (`ai_proposed|approved|manual`)
   - `centroid` (vector or reference)
   - optional: canonical category tags
   - `created_at`, `updated_at`

2. `ai_item_category_links`
   - `itemId`, `categoryId`
   - `score`
   - `isPrimary`
   - `source` (`manual|ai`)
   - `status` (`suggested|accepted|rejected`)
   - timestamps
   - enforce/guard max secondary links (e.g. 1–2)

3. `ai_item_signals`
   - `itemId`
   - `textHash`
   - `embeddingModel`
   - `embedding` (doc vector)
   - derived tags/keywords + confidence
   - `lastProcessedAt`

**Backup:** extend export/import/verify for these stores (raw fetch bodies remain outside main JSON as already decided).

### Storage strategy for embeddings (phase this, do not over-optimize upfront)

- **CLI runs:** persist intermediate vectors/results on disk under `data/experiments/...` (JSONL/NDJSON + optional binary dumps; ignored by git).
- **App V1:** store **doc-level embeddings** in IndexedDB (`ai_item_signals`) first.
- **Disk/off-DB embedding storage:** defer until measured need (size/perf thresholds). If introduced, keep a pointer/ref field pattern similar to enrichment `rawRef`.
- **Chunk/paragraph embeddings:** explicitly V2 (not part of this task).

---

## Pipeline (required)

For each candidate item:

1. Load item + enrichment; build text with `buildItemText(item, enrichment)`.
2. Skip if text empty/insufficient; mark signal status.
3. Compute doc embedding (worker/background path preferred).
4. Compare to category centroids:
   - assign primary if above threshold,
   - optional secondary if near-tie and within cap,
   - else send to novelty pool.
5. Generate tags **after assignment** from:
   - category canonical tags + item text
   - normalize/dedupe/cap.
6. Persist `ai_item_signals` + link rows atomically where practical.

---

## Bootstrap + novelty handling

- If categories are missing/sparse:
  - create initial `ai_proposed_*` categories from largest stable groups.
- Novelty pool:
  - hold low-confidence items for periodic batch grouping (embedding math only).
- Keep this lightweight in V1:
  - no full DAG, no LLM-heavy recluster every run.

---

## Performance + UX constraints

- Keep embedding and scoring off main UI thread where possible.
- Batch processing with caps (e.g. max items per run).
- Avoid full-corpus expensive loops on each UI action.
- Provide at least minimal run summary:
  - processed, assigned primary, assigned secondary, novelty, failed.

---

## Suggested implementation slices

1. **CLI pipeline first**
   - corpus loader from current app DB/export and/or saved experiment artifacts
   - doc embedding generation
   - centroid assignment + novelty output
   - report metrics + sample dumps for review

2. **Schema + storage layer (app)**
   - add stores/types/helpers
   - export/import integration (structured AI fields)

3. **Embedding adapter**
   - local model path first (or current configured provider path if already available)
   - deterministic `textHash` skip logic

4. **Assignment engine**
   - centroid similarity
   - threshold config
   - primary/secondary rules

5. **Tag post-processor**
   - normalize aliases (`cpp` <-> `c++`, lowercase policy)
   - cap count and remove duplicates

6. **Entry point**
   - run on selected scope (e.g. imported set / selection / project / all)
   - return structured run result
   - include a dev-only in-app trigger/review path

---

## Acceptance criteria

- [x] DB stores: `ai_categories`, `ai_item_category_links`, `ai_item_signals` (v6+)
- [x] Export/import includes AI stores + pipeline counts
- [x] CLI: `discover-taxonomy`, `categorize` (topic-extract default), seed taxonomy
- [x] App: Settings → Categorization panel (Import seed, Classify, Discover, backup note)
- [x] LLM classify + discover aligned app ↔ CLI (gap-fill discover, `leafProposalsFromItemResults`, immediate leaf promote on classify `new_category`, 90s batch timeout)
- [x] Real-library validation (~278 AI-ready, backup ~15 MB JSON)
- [ ] Product accept/reject UX for suggested links (deferred)
- [ ] Incremental-only at scale (`textHash` skip classify when unchanged — partial)

---

## Evaluation checklist (quick)

- Scope tested: imported batch + mixed legacy items.
- Assignment sanity: spot-check 20 items across article/x/video.
- Noise check: tag quality (too generic/too many) and secondary-link overuse.
- Stability check: rerun on unchanged corpus should produce mostly stable categories/links.

---

## Task 02 return (filled 2026-05-25)

- **Shipped:**
  - **Approach pivot:** embedding-first → **LLM-first** (discover taxonomy + topic-extract classify).
  - App pipeline: `src/lib/categorization/*` — `classifyTopicExtract`, `discoverTaxonomy`, fair-game helpers, seed import, grouped catalog, `CategorizationPanel`.
  - Discover fixes: scan **all** fair-game items (not 50-cap); gap-fill prompting; batch **32**; merge leaves from `itemResults.assign_new`; 90s AI timeout.
  - Classify fixes: re-run on `*-general`/Other; `promoteProposedLeaf` on valid `new_category`; fair-game gating.
  - Backup: `notifyDataChanged` after enrich/classify/discover so auto-export stays current.
  - CLI re-aligned to app (markdown discover prompt, gap-fill, `leafProposalsFromItemResults`, immediate promote, 90s timeout).
- **Files (main):** `src/lib/categorization/`, `src/components/dashboard/CategorizationPanel.tsx`, `src/lib/db.ts`, `src/lib/enrichment/`, `scripts/categorize/`, `vite.config.ts` (extension build).
- **DB:** v6+ — `ai_categories`, `ai_item_category_links`, `ai_item_signals`.
- **Models:** OpenRouter chat (`OPENROUTER_MODEL`, default gpt-4o-mini); embeddings `openai/text-embedding-3-small`.
- **Validated corpus (user backup `~/Documents/testing/latest.json`, 2026-05-25 ~23:27):**
  - 76 leaves, 24 parents, taxonomy v9
  - 278 AI-ready, 255 primary links, 236 classified, 19 `classified_general`, 23 skipped
  - Classify → Discover loop adds leaves; earlier “Discover +0” was prompt/catalog gap (seed already had ~40 leaves), not sampling.
- **Quality notes:**
  - Good: specific leaves for RL, quant, adult policy aligned, multi-label.
  - Weak: many items still on `*-general` or unassigned until more Discover+Classify loops; **enrichment quality** (Task 01) is the main bottleneck, not categorization math.
  - Backup ~15 MB JSON; raw fetch bodies stay in `enrichment-cache` (~25 MB), not in JSON export.
- **Backlog suggested:** mark TASK-02 done; v1.1 = accept UX + incremental classify skip; v2 = chunks/ANN/DAG.
- **Ready for next task:** **yes** (categorization v1); continue enrichment (TASK-01) for better summaries.

---

## Key integration points

- `src/lib/enrichment/itemText.ts` (input contract from Task 01/01.5)
- `src/lib/db.ts` (schema + migration + export/import)
- `src/lib/categorization/*` + `src/lib/ai/openrouterEmbeddings.ts`
- `scripts/categorize/run-categorize.mjs` — `npm run categorize`
- `docs/backlog.md` AI — V1 section

---

## CLI usage

```bash
# 1) Discover / extend taxonomy from corpus (LLM batches on title+summary)
npm run discover-taxonomy -- \
  --ai-eval data/experiments/enrich-fetch/ai-eval-2026-05-25T01-53-38/results-v2.jsonl

# 2) Classify (default: topic-extract LLM + seed catalog)
npm run categorize -- \
  --ai-eval data/experiments/enrich-fetch/ai-eval-2026-05-25T01-53-38/results-v2.jsonl

# Promote proposed new leaves from classify run
npm run categorize -- --llm-promote-threshold 1 --ai-eval <results-v2.jsonl>

# Legacy paths
npm run categorize -- --no-seed              # k-means bootstrap (embed clustering)
npm run categorize -- --legacy-shortlist     # embed top-K shortlist + LLM (V1.1)
```

Outputs:

- Enrichment eval: `data/experiments/enrich-fetch/ai-eval-<timestamp>/`
- Discover: `data/experiments/categorize/discover-<timestamp>/`
- Classify: `data/experiments/categorize/cat-<timestamp>/{categories-lean.json,results-lean.jsonl,SUMMARY-lean.md,review-results-lean.jsonl}`

See `scripts/categorize/seed/README.md`.

---

## V1 status (2026-05-25) — **complete**

| Layer | State |
|-------|--------|
| **App** | LLM classify + discover in Settings; seed import; fair-game; backup counts |
| **CLI** | Same defaults; aligned discover/classify behavior (see below) |
| **Legacy** | `--no-seed` k-means, `--legacy-shortlist` embed+LLM — kept for experiments only |

**Recommended workflow (app):** Import seed → Enrich → **Classify pending** → **Discover** → **Classify pending** (repeat) → Backup (verify `_pipelineExportCounts`).

**Known gaps (post-v1):** accept/reject links UX; incremental classify when `textHash` unchanged; faster/cheaper model tuning; borderline assignment review.

---

## CLI evolution summary (2026-05-25) — **current approach**

We moved from **embedding-first clustering** to **LLM-first taxonomy + classification** on title/summary. Embeddings remain for doc signals, optional shortlist at scale, and discovery batch ordering — not as the primary judge of topic fit.

| Phase | Taxonomy (clustering) | Assignment (classification) | Typical result (124 corpus) |
|-------|------------------------|------------------------------|-----------------------------|
| **V1** | k-means on item embeddings → mashup cluster names | Centroid similarity + thresholds | ~7 broad categories; many wrong merges |
| **V1.1** | Hand seed A₀ (+ optional `discover-taxonomy`) | Embed shortlist top-K → LLM pick + strict confidence/centroid veto | 49 assigned, 62 unassigned |
| **V1.2 (CLI default)** | Batched LLM on title+summary (`discover-taxonomy`) | **Topic-extract** LLM: few-shot + full catalog, 0–3 concurrent `topicIds` | **83 assigned, 17 multi-label, 28 unassigned** |

### Principle (updated)

- **LLM for taxonomy:** `npm run discover-taxonomy` — filtered corpus, diverse batches, cumulative `categoriesSoFar`; atomic leaves under fixed parents; dedupe by name (no arbitrary per-batch cap; bootstrap can propose many leaves).
- **LLM for classification:** `npm run categorize` — default `classifyMode: topic-extract` (`lib/topicExtract.mjs`): every eligible item gets title+summary + full `topicCatalog` + in-prompt examples; supports multi-topic, `skip`, `new_category`.
- **Embeddings supporting role:** still embed each bookmark for `ai_item_signals` / `textHash`; embed seed leaves for legacy `--legacy-shortlist`; embed only for **diverse batch ordering** in discovery — **not** centroid veto on LLM picks in topic-extract mode.
- **Prefer unassigned over wrong:** keep `assessCategorizationEligibility` (13 skipped on junk/failed AI); LLM `skip` for weak pages — but drop post-LLM confidence/centroid rejection when topic-extract is used.
- **App:** `src/lib/categorization/*` wired to same V1.2 path as CLI (production UI in Settings).

### App production model (incremental by default at scale)

**CLI** = tune algo (full corpus reruns, experiments). **App** = incremental on real library.

| Library size | App behavior |
|--------------|--------------|
| **Small** (e.g. &lt;500–1k) | Occasional **full** topic-extract + optional discover refresh (cheap enough) |
| **Growing** | **Incremental only:** new/changed items via `textHash`; skip LLM if hash + assignment unchanged |
| **Discover** | Not every import — run when **pending queue ≥ N** new unclassified links (or monthly), using existing `categoriesSoFar` |

**Monthly cost** ≈ f(**new links that month** + rare full refresh), not f(total library size). `service.ts` already skips re-embed when `textHash` matches `ai_item_signals`; still to wire: skip topic-extract when classified + unchanged, and batched discover on pending queue only.

### Key CLI files (V1.2)

| File | Role |
|------|------|
| `scripts/categorize/seed/categories.seed.json` | A₀…Aₙ leaf taxonomy |
| `scripts/categorize/discover-taxonomy.mjs` | LLM discovery batches |
| `scripts/categorize/lib/taxonomyCatalog.mjs` | Grouped catalog, `path`/`pathIds`, `*-general` leaves, resolve rules |
| `scripts/categorize/lib/topicExtract.mjs` | Few-shot concurrent topic extraction |
| `scripts/categorize/lib/llmReview.mjs` | Batched classify; `classifyMode: topic-extract` default |
| `scripts/categorize/run-categorize.mjs` | End-to-end run |

### Validated run

- Experiment: `data/experiments/categorize/cat-2026-05-25T04-13-29/`
- Seed: 29 leaves (`categories.seed.json`, extends manual-v0 + discovery)
- AI eval input: `data/experiments/enrich-fetch/ai-eval-2026-05-25T01-53-38/results-v2.jsonl`

---

## Next iteration — incremental LLM refine (TASK-02.1 / V1.1) — **superseded in CLI by V1.2**

Original plan: math-first, LLM second pass on borderline only. **CLI V1.2 replaces that** with LLM on all eligible items for classify; keep this section as history.

### Original principle (2026-05-24)

- **Math first:** embeddings + k-means + centroid assign (cheap, stable IDs).
- **LLM second:** polish labels and doubtful items only — **minimal payloads** (title, tags, short summary), never full corpus dump for clustering.
- **Scale:** corpus grows to **1000s** over time; refine runs **incrementally** (per run, per batch, per new/changed item), not one giant prompt.

### What to send the LLM (compact)

| Unit | Input (short) | Output | When |
|------|----------------|--------|------|
| Category | 5–8 sample titles + tags per cluster | `name`, `canonicalTags`, optional blurb | After bootstrap or when cluster members change |
| Borderline item | title + summary + tags + **list of category names** | `categoryId` or `none` | score in doubt band (e.g. 0.42–0.55) |
| Oversized cluster | 10–12 samples from catch-all | split suggestion or `misc` flag | optional, rare |

No: “here are 1000 bookmarks, cluster them.”  
Yes: many small calls, batched where possible (e.g. 20 borderline items per JSON request).

### Incremental strategy (1000s over time)

1. **On categorize run:** only **new/changed** items (via `textHash`) get embed + assign.
2. **LLM refine queue:** items/categories touched this run + backlog of unreviewed borderline.
3. **Per-item refine:** store `llmRefineStatus` / `lastRefinedAt` on signal or link — skip if unchanged.
4. **Stronger model** only for refine step (task route e.g. `categorize-refine`); keep naming on fast model.
5. **Overrides stay `suggested`** until accept UX — LLM does not rewrite centroids without re-embed policy.

### Implementation slices (ordered)

1. Enrichment gate (`insufficient_enrichment` — no snippet fallback on failed AI).
2. Pipeline flag `--llm-refine` / Settings default-on rename after bootstrap.
3. Batched borderline assignment review (1–2 calls per run, not per item).
4. Incremental refine queue + cursor for large libraries.
5. Oversized-cluster split proposal (optional).

### Cost model (agreed)

- Embeddings: O(all items) — necessary.
- LLM refine: O(categories) + O(borderline per run) ≪ O(all items × full doc).
- Over months, **every item may eventually** get a short LLM touch once when first assigned or when score is weak — still not “send everything at once.”

### Out of scope for 02.1

- Full LLM re-cluster of library.
- Chunk embeddings / ANN index (remain V2 backlog).

---

## Seed taxonomy + topic-extract (A₀…Aₙ, CLI only)

| Step | Mechanism | Embeddings? |
|------|-----------|-------------|
| **A₀** | Manual and/or `discover-taxonomy` (LLM batches, `categoriesSoFar`) | Batch ordering only |
| **Discover** | `discover-taxonomy`: batched LLM invents/reuses **leaves** into `categories.seed.json` | Batch ordering only |
| **Classify** | `topic-extract`: few-shot + grouped `topicCatalog`, 0–3 `topicIds` / optional `topicPaths` | Item embed still stored; no veto on LLM pick |
| **A₁+** | Merge `new_category` proposals into `categories.seed.json`, bump `taxonomyVersion` | Optional leaf re-embed |

**Two LLM steps (easy to confuse):** Discover **creates** the catalog; classify **assigns** bookmarks to it. Early discover runs skipped adult items as `inappropriate content`, so those leaves were **never invented** — we added `adult-erotic-content` / `sexuality-wellness-education` manually to seed (v3). Discover prompts now aligned with classify (same adult policy).

**Legacy classify (`--legacy-shortlist`):** embed leaves + items → top-K shortlist → LLM; confidence/centroid gates — superseded by topic-extract for quality.

**Growth loop:** discover → classify → promote proposals → re-classify. Backup: `categories.seed.manual-v0.json`.

### Taxonomy shape (agreed 2026-05-25 — CLI + app plan)

- **2 levels:** fixed **parents** (8) + **leaves** (discovered + one `*-general` fallback per parent).
- **Assignments:** leaf ids only; parent implied via `leaf.parentId` for UI and rollup counts.
- **Coarse gap:** use `{parentId}-general` leaf (e.g. `quant-finance-general`) when in-domain but no specific sibling fits — not assignable parent rows.
- **LLM catalog:** grouped by parent; each leaf shows `path`, `pathIds`, `isGeneralFallback` (`lib/taxonomyCatalog.mjs`).
- **Rules:** specific leaf first; never `*-general` + another leaf under same parent; optional `topicPaths` for disambiguation.
- **Discover:** `categoriesSoFar` grouped the same way; do not propose duplicate General/Other leaves.

**CLI module:** `scripts/categorize/lib/taxonomyCatalog.mjs` — `ensureGeneralFallbackLeaves`, `buildGroupedLeafCatalog`, `formatGroupedCatalogMarkdown`, `resolveTopicAssignments`, `enforceGeneralSiblingRules`.

**LLM prompt shape (2026-05-25):** catalog as **Markdown paths** (English-readable); items + response schema as JSON. Avoids one giant JSON blob where nested `topicCatalog` is easy to skim past. Batches shrink when leaf count > 28; missing `itemId` rows are retried one-by-one.

**Product policy (2026-05-25):**

- **Skip:** login/placeholder/personal noise only — **not** adult content (valid adult links get a leaf; extension/auth refetch TBD).
- **Buckets:** specific leaf | `*-general` | unassigned | skipped | ineligible.
- **Multi-label:** V1 as-is; second pass with embed/user/project/tags signals → **V2 TBD**.

**CLI baseline:** `data/experiments/categorize/cat-2026-05-25T15-48-36/` (taxonomy v3, adult leaves + prompt). Prior: `cat-2026-05-25T15-34-36/`.

**App plan:** [`TASK-02-app-implementation-plan.md`](TASK-02-app-implementation-plan.md) (implemented; kept for history).

---

## App ↔ CLI parity (2026-05-25)

| Behavior | App | CLI |
|----------|-----|-----|
| Classify mode | `topic-extract` | `topic-extract` (default) |
| Discover batch size | 32 | 32 |
| Discover gap-fill prompt | yes (when extending) | yes (`gapFillMode` when not bootstrap) |
| `leafProposalsFromItemResults` | yes | yes |
| Classify `new_category` + `parentId` | immediate `promoteProposedLeaf` | immediate `mergeNewLeaves` |
| Batch AI timeout | 90s (`aiSettingsForBatchJob`) | 90s (`classifySettingsFromEnv`) |
| Fair-game / stuckKind on discover | yes (from signals) | gap-fill prompt; no `stuckKind` without signal export |
| Auto backup after pipeline | `notifyDataChanged` | N/A (manual export) |

---

