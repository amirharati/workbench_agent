# TASK-04 — V1.5 Search foundation (hybrid retrieval, CLI-first)

**Status:** **closed (2026-05-26)** — implementation complete; quality good enough for R&D/dev use. Formal tuning and product UX deferred (see **Master backlog handoff** below).  
**Backlog linkage:** `docs/backlog.md` → **AI — V1** (`V1.5 / Task 04`) and prep for **AI — V2**  
**Depends on:** Tasks 01 + 01.5 + 02 + 03 (fetch/enrichment/categorization/hardening)  
**Objective:** deliver practical, high-signal search now using hybrid retrieval, while deferring major UX redesign and chunk/ANN scale to V2.

---

## Why this task now

Core AI pipeline is stable enough (fetch -> extraction -> categorization).  
Next user value is **finding relevant items quickly**, including non-exact semantic matches.

This task should produce a usable search baseline without overbuilding:

- lexical precision
- category-aware semantic recall
- doc-level embedding similarity
- explainable ranking

---

## Context snapshot (for independent session)

### Already shipped
- Fetch enrichment (Task 01/01.5): `src/lib/enrichment/*` (provides `summary`, `keyPoints`, `tags`)
- Categorization V1/V1.1 (Task 02/03): `src/lib/categorization/*` (provides doc embeddings, `ai_categories`, `ai_item_category_links`)
- Dev Hub: `src/components/dashboard/EnrichmentReviewModal.tsx` and `PipelineDevView.tsx`

### Core docs to read first
1. `docs/CLI_WORKFLOW.md` (parallel CLI + app method)
2. `docs/temp/TASK-03-v1.1-pipeline-hardening.md` (return notes on current data state)

### Key code areas likely touched
- `src/lib/search/*` (New module for hybrid search logic)
- `scripts/search/*` (New CLI harness)
- `src/components/dashboard/PipelineDevView.tsx` (Add dev search tab)
- `src/lib/ai/openrouterEmbeddings.ts` (Reuse for query embedding)

### Corpus + backup paths (pinned defaults)

**CLI eval (repo `data/` — reuse existing experiment artifacts):**

| Role | Default path |
|------|----------------|
| Fetch corpora | `data/experiments/enrich-fetch/2026-05-21T02-02-56`, `.../2026-05-21T03-03-24` (same defaults as categorize scripts) |
| AI extraction eval | `data/experiments/enrich-fetch/ai-eval-2026-05-25T01-53-38/results-v2.jsonl` |
| Classify state | `data/experiments/categorize/classify-after-discover-2026-05-26/classify-state.jsonl` |
| Taxonomy (if needed) | `data/experiments/categorize/discover-inc-2026-05-26-llm-v2/taxonomy-out.json` |
| Corpus loader | Reuse `scripts/categorize/lib/corpus.mjs` (`loadPipelineCorpus`) |
| Search eval outputs | `data/experiments/search/<run-id>/` |

CLI harness should accept overrides: `--corpus`, `--ai-eval`, `--state-in`, `--taxonomy`, `--backup`.

**Note:** classify-state jsonl has labels/eligibility but **not** doc embeddings. For hybrid eval with embedding path, either:
- load embeddings from app backup (below), or
- compute query/doc embeddings on the fly during eval (OpenRouter).

**App dev / full pipeline backup (live IndexedDB equivalent):**

| Role | Default path |
|------|----------------|
| Latest backup | `~/Documents/testing/latest.json` |
| Manual snapshot | `~/Documents/testing/manual-2026-05-25_232703.json` |

Envelope format (`workbench-backup` → `data.*`). Recent counts in `latest.json` `_pipelineExportCounts`:
~1018 `item_enrichment`, ~584 `ai_item_signals` (doc embeddings), ~598 `ai_item_category_links`, ~182 `ai_categories`.

Use this backup for app import smoke tests and CLI `--backup` runs when you need full hybrid retrieval (lexical + category + embedding) on real corpus scale. Product `SearchTab` stays unchanged — dev search lives only in `PipelineDevView`.

---

## Scope

### In scope

1. **Hybrid candidate generation**
   - lexical/text search (title, URL/domain, notes, AI summary, keyPoints, tags)
   - category-aware expansion (include items in matched/related AI categories)
   - optional filter-aware candidate trimming (project/domain/date/sourceKind)

2. **Hybrid ranking**
   - blended score with documented weights:
     - lexical score
     - embedding similarity
     - category affinity
     - freshness/quality boost
   - deterministic score breakdown for debugging.

3. **CLI-first evaluation harness**
   - run search scenarios over real corpus
   - compare weighted variants and output metrics/artifacts
   - include qualitative sample set.

4. **App dev integration**
   - dev-only search surface/trigger
   - top results + score breakdown for debugging
   - no major UX redesign.

### Out of scope (V2)

- chunk/paragraph embeddings
- ANN index
- final product UX / IA redesign
- cloud search offload
- answer-generation RAG UI

---

## Retrieval design (baseline)

### Stage A — Candidate generation

Collect candidate IDs from three parallel paths:

1. **Lexical hit set** (e.g., top 200): Token overlap + phrase boost on title, URL, notes, AI summary, keyPoints, and tags.
2. **Embedding nearest set** (e.g., top 200): Embed query via OpenRouter -> brute-force cosine similarity against all `ai_item_signals.embedding`. (If offline/no API key, skip this path).
3. **Category expansion set** (e.g., top 200): 
   - Embed query -> find top-**5** nearest `ai_categories` centroids (configurable).
   - Lexical match query against category names.
   - Add items linked to these matched categories (`ai_item_category_links`).

Union + dedupe -> `candidateSet`.

### Stage B — Hybrid rerank

For each candidate, compute:

- `lexicalScore` (normalized)
- `embeddingScore` (cosine normalized)
- `categoryScore` (exact/related category affinity)
- `boostsAndPenalties` (freshness, quality, domain, general-category penalty)

**Initial default formula:**

`baseScore = (0.40 * lexical) + (0.40 * embedding) + (0.20 * category)`
`finalScore = baseScore + qualityBoost + freshnessBoost + domainBoost - generalPenalty - manualReviewPenalty`

Tune via CLI eval; keep weights configurable.

### Stage C — Optional explainability payload

Return per result:

- top contributing factors
- matched terms/categories
- score components

This is for dev visibility and trust/debugging.

---

## Shared doc-embedding stage (reusable beyond search)

Task 04 introduced an explicit pipeline stage **after AI extract**, before relying on hybrid search:

| Piece | Role |
|-------|------|
| `buildSearchEmbedText` | Canonical embed input today: **title + AI summary** |
| `embedBackfillPlan.collectPendingEmbedRows` | Pure queue: eligible enrichments, `textHash` skip |
| `embedItemSignal.embedIncrementalBatch` | App IndexedDB writes |
| `npm run embed-incremental` | CLI backup backfill (same plan) |
| Storage | `ai_item_signals.embedding`, `embeddingModel`, `textHash` |

**Consumers (V1.5):** hybrid search, `findSimilarItems`, search-related links, on-demand query embed.

**Return later (V2+ backlog):** auto-embed after extract; unify embed text with classify `buildItemText`; category shortlist + centroid maintenance from same vectors; Web Worker + `Embedder` interface. See `docs/backlog.md` → **AI — V2+** and `docs/CLI_WORKFLOW.md` → **Doc embedding step**.

---

## Data + storage expectations

- Reuse existing stores:
  - `items`
  - `item_enrichment`
  - `ai_item_signals` (doc embeddings, tags)
  - `ai_item_category_links` / `ai_categories`
- No new heavy storage formats required for V1.5.
- No chunk store in this task.

---

## Implementation slices (recommended order)

1. **Search core module (`src/lib/search/`)**
   - query normalization/tokenization
   - lexical scorer (token overlap + exact phrase boost)
   - embedding scorer (doc-level cosine)
   - category affinity scorer (query embed -> centroid -> item links)
   - blended ranker + explanation struct

2. **CLI harness (`scripts/search/`)**
   - `npm run search-eval` -> `scripts/search/run-search-eval.mjs`
   - **Default corpus:** `loadPipelineCorpus` over `data/experiments/enrich-fetch/` corpora + `ai-eval-2026-05-25T01-53-38/results-v2.jsonl` + classify state under `data/experiments/categorize/` (see pinned paths above).
   - **Full hybrid mode:** `--backup ~/Documents/testing/latest.json` for doc embeddings + category links at app scale.
   - **Query set:** Create `data/experiments/search/queries-v1.json` with 10–20 hand-written scenarios (exact, semantic, category-intent, domain-intent).
   - **Shared logic:** CLI wraps `src/lib/search/*` via **tsx** (no forked `searchCore.mjs` mirror). Embed queue uses `src/lib/enrichment/embedBackfillPlan.ts`.
   - outputs: jsonl + summary md + comparison md

**CLI commands (aligned with app):**

| npm script | Core module |
|------------|-------------|
| `search-eval` | `hybridSearch`, `extractSearchRelated` (`--with-related`) |
| `search-similar` | `findSimilarItems` |
| `embed-incremental` | `collectPendingEmbedRows` / `buildEmbeddedSignal` |

3. **Weight tuning**
   - try a few weight sets
   - pick baseline based on corpus + qualitative checks

4. **App dev integration (`PipelineDevView.tsx`)**
   - Add a new "Search (dev)" tab to the existing Enrichment dev hub.
   - Input for query, list of top results with score breakdown.
   - **Performance note:** Brute-force cosine scan is OK for this dev UI (with caps), but do not run it on every keystroke (require explicit "Search" button click).

5. **Discovery layer (4.1 — pre-V2, shipped in dev)**
   - **`findSimilarItems(itemId)`** — k-NN by stored doc embedding + same-category siblings + tag Jaccard; optional domain overlay filter.
   - **`extractSearchRelated()`** — after a search: topic chips (query-matched + result categories), tag chips from top results, **related links** (embedding/category candidates excluding top hits).
   - **`runAppFindSimilar` / `runAppHybridSearchWithRelated`** — IndexedDB entry points; anchor without stored vector falls back to one-shot embed of title+summary.
   - **UI:** Search (dev) → "Also explore" panel + per-result **Similar** button; Enrichment item detail → **Similar bookmarks** block.

---

## Ranking/quality details (must define)

### Required ranking behaviors

- exact title/phrase boost should outrank weak semantic matches
- semantic-only matches should still appear when lexical misses
- category-consistent items should rise even with sparse text
- stale/low-quality/noisy items should not dominate top results
- items without `ai_item_signals` (unclassified/ineligible) should still be retrievable via lexical path (embedding score = 0).

### Penalties/boosts (minimum)

- `generalPenalty`: penalty if item's primary category is `*-general` and specific alternatives exist.
- `manualReviewPenalty`: small penalty for uncertain categorization states (`classifyState === 'manual_review'`).
- `qualityBoost`: boost when enrichment `summary` or `keyPoints` are present.
- `domainBoost`: boost when query clearly mentions domain/site (e.g., "from github").

---

## CLI evaluation requirements

Use a query set that includes:

1. exact keyword lookups
2. fuzzy semantic intent queries
3. category-intent queries (e.g., "things like RL infra")
4. domain-specific queries (e.g., "from X / github / youtube")

Metrics (minimum):

- top-k relevance spot-checks
- lexical-only vs hybrid comparison
- coverage: percent of queries with at least one useful hit in top N
- noise rate in top N (manual sample)

---

## Acceptance criteria

- [x] Hybrid search module (`src/lib/search`) implemented with blended scoring and configurable weights.
- [x] Candidate generation uses lexical + category (centroid/name match) + doc-embedding paths.
- [x] CLI eval harness (`scripts/search`) exists with reproducible outputs and a defined `queries-v1.json` set.
- [x] Baseline weight profile in code (`DEFAULT_SEARCH_WEIGHTS`: 0.40 / 0.40 / 0.20) — **formal tuning pass deferred** (see handoff).
- [x] App dev surface (tab in `PipelineDevView`) can run query on button click and display result score breakdown.
- [x] Discovery: similar-items (`findSimilarItems`) + search-related facets (topics, tags, related links) in dev UI.
- [x] Embed step as separate pipeline stage (title + summary → `ai_item_signals.embedding`) + in-app backfill block.
- [x] No regression to enrichment/categorization flows (`npm run build` ✓).
- [x] V2 boundaries respected (no chunk/ANN/product UX scope creep).

---

## Task 04 return

- **Shipped:** Hybrid search (lexical + doc embedding + category expansion + explainable rerank); CLI eval (`npm run search-eval`); Search (dev) tab with score breakdown; embed backfill in dev UI; discovery layer (similar bookmarks, topics/tags chips, related links beyond top hits); enrichment item detail shows similar bookmarks.
- **Files:** `src/lib/search/*`, `src/lib/enrichment/searchEmbedText.ts`, `embedItemSignal.ts`, `scripts/search/*`, `SearchDevPanel.tsx`, `SearchDiscoveryBlocks.tsx`, `PipelineDevView.tsx`, `EnrichmentReviewModal.tsx`, `data/experiments/search/queries-v1.json`.
- **Candidate generation strategy:** Union top-200 per path (lexical, embedding k-NN, category expansion from query-matched centroids/names) → blended rerank with boosts/penalties.
- **Final ranking formula + weights:** `baseScore = 0.40·lexical + 0.40·embedding + 0.20·category`; `finalScore = baseScore + quality + freshness + domain − general − manualReview`. Similar-items uses 0.55/0.30/0.15 (embed/cat/tags). **Not formally tuned** — defaults feel usable in dev.
- **CLI corpus + query set:** `queries-v1.json` (18 scenarios); eval against `~/Documents/testing/latest.json`. Early eval had 0 doc embeddings; app backfill fixes live path — **re-run eval deferred**.
- **Before/after (lexical-only vs hybrid):** Hybrid adds semantic + category recall when embeddings present; unenriched majority still lexical-only. User spot-check: “okish / good enough” for dev — not production-polished.
- **Known weak query classes:** Broad semantic intent without category overlap; items without AI summary/embeddings; general-category dominance on some queries; category centroid quality depends on classified subset.
- **Suggested backlog/doc updates:** Mark Task 04 done; defer search tuning until **fetch pipeline** improves (current major bottleneck — more/better enriched corpus → better search). See handoff below.
- **Ready for next step (V2 prep or UX decision):** **Yes for R&D baseline** — dev search + discovery sufficient to inform V2. **No for product search** — keep dev-only until fetch improves + optional 4.2 tuning pass.

---

## Master backlog handoff (deferred — not blockers for closing Task 04)

**Priority note (agreed):** Search is doing a good job already for dev/R&D. **Do not chase perfection or weight tuning now.** The current major pipeline bottleneck is **fetch/enrichment coverage and quality** — better fetched + AI-extracted text → better embeddings, categories, and search. Pick these up **after fetch improvement**, unless search regressions appear.

| ID | Item | When | Notes |
|----|------|------|-------|
| **04-defer-1** | **Re-run CLI eval post-embedding backfill** | After fetch push | `npm run search-eval -- --backup ~/Documents/testing/latest.json`; compare lexical-only vs hybrid with non-zero doc vectors. |
| **04-defer-2** | **Search weight / ranking tuning mini-task (4.2)** | After fetch push | Try alternate weight sets; document chosen profile; address general-category noise, semantic-only false positives. Optional: sibling-leaf expansion in similar-items. |
| **04-defer-3** | **Search quality spot-check doc** | With 04-defer-2 or V2 prep | 10–20 hand-picked queries + expected hits; track weak classes as corpus grows. |
| **04-defer-4** | **Product search UX** | V2 | Move Search (dev) patterns into product `SearchTab` / item views — part of V2 IA redesign, not V1.5. |
| **04-defer-5** | **Chunk/ANN scale** | V2 | Already out of scope; unchanged. |

**Master session actions:** *(completed 2026-05-26)*
1. [x] Task 04 marked **done** in `docs/backlog.md` and `docs/temp/README.md`.
2. [x] **04-defer-1 … 04-defer-3** added under AI — V1 (after fetch bottleneck).
3. [x] `docs/OVERVIEW.md` updated (What's working + Gaps + footer). `docs/CLI_WORKFLOW.md` already documents search CLI.

---

## Baseline sign-off

**Agreed:** Task 04 implementation is complete for the V1.5 goal — hybrid retrieval + dev discovery surfaces are shippable and useful. Formal eval/tuning and product UX are explicitly deferred. **Next pipeline priority: improve fetching** (coverage, reliability, throughput) so more of the library gets quality summaries, embeddings, and categories — which will lift search more than incremental ranker tweaks today.

---

## Suggested next step after Task 04

Choose one based on results:

1. **If search quality is strong:** start V2 planning (chunk/ANN + UX redesign).
2. **If quality still weak:** do a focused retrieval refinement mini-task (weights/features only), still pre-V2 UX.

