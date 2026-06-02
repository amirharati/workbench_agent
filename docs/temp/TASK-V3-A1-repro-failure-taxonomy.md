# TASK-V3-A1 — Repro & failure taxonomy (research)

**Status:** **done** (2026-05-30, fetch/pipeline extension)  
**Phase:** spike (no large refactor unless repro is trivial)  
**Parent:** [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md) · Pillar **A**  
**Backlog:** P0, failure stats (Task 01 follow-up)  
**Method:** **CLI first → app validate** (see program breakdown § Branch A)

**Worker:** Update **only this file** + code. Do **not** edit `backlog.md`, tracker, or roadmap.

---

## Goal

Build a **shared failure taxonomy** for pipeline batch failures — so A2/A3 have a common vocabulary.

**Order is mandatory:**ichemnt hub  shows  status enriched even  when we have not run  classify or  embedding,   it  
1. **CLI** — classify/discover **and fetch/enrich** batch vs single-item.  
2. **App** — import, Home, Hub, worker/RPC paths CLI cannot hit.  
3. **Merge** — one taxonomy table + **past vs current** comparison in task return.

---

## Phase 1 — CLI repro (classify / discover)

Use existing scripts; save outputs under `data/experiments/categorize/<run-id>/`.

| Command | Purpose |
|---------|---------|
| `npm run classify-incremental -- --dry-run` | Baseline counts |
| `npm run classify-incremental -- --run-llm --max N` | Batch classify repro |
| `npm run classify-incremental -- --run-llm --max 1` | Single-item parity |
| `npm run discover-incremental -- …` | Batch discover repro (mirror classify pattern) |

### Classify / discover repro matrix

| CLI path | N | Batch result | `--max 1` / single | Error text (snippet) | Artifact dir |
|----------|---|--------------|-------------------|----------------------|--------------|
| classify-incremental `--dry-run` | 124 corpus | 111 eligible, 13 ineligible (`AI extraction failed`) | — | — | `classify-inc-2026-05-30T21-06-24` |
| classify-incremental `--run-llm` | 40 (37 LLM) | **OK** — 4×12 batches, 0 `llmErrors` | **OK** — 1 item, 1 batch, `classifiedSpecific=1` | — | batch: `…-batch40` · single: `…-single1` |
| classify-incremental `--run-llm` | 111 (98 LLM) | **OK** — 9×12 batches, 0 `llmErrors` | (single covered above) | — | `…-batch111` |
| discover-incremental `--run-llm` | batch=10 | **OK** — +5 parents, +5 leaves | — | — | `discover-inc-2026-05-30T21-06-24-batch10` |
| discover-incremental `--run-llm` | batch=32 | **Batch fail → singles OK** | singles via `runOneBatch` fallback | `Failed to parse JSON from model` | `discover-inc-2026-05-30T21-06-24-repro32` |
| discover-incremental (historical) | batch=32 | **Total fail** (May 26) | no recovery logged | `Failed to parse JSON from model` | `discover-inc-2026-05-26-llm` |

**CLI retry behavior (classify / discover)**

| Script | On batch LLM failure | Retry policy |
|--------|---------------------|--------------|
| `run-classify-incremental.mjs` | Marks **entire batch** `llm_error`; no re-chunk, no singles | **None** |
| `run-discover-incremental.mjs` | Logs batch error; **`runOneBatch` retries each item as size-1** | Singles only |
| App `classifyIncremental` | Re-chunk + singles via `resolveTopicExtractBatchWithRetry` | 2 batch rounds + up to 3 single fallbacks |
| App `discoverBatch` | Re-chunk + singles via `callDiscoveryBatchWithRetry` | Same constants as classify |

---

## Phase 1b — Fetch & enrich pipeline (CLI)

| Command | Purpose |
|---------|---------|
| `npm run fetch-experiment -- urls-corpus-500.txt --max N --no-tab` | Fetch stage — provider failures |
| `npm run fetch-ai-eval -- --max N --concurrency 3` | AI extract — parallel (batch-like load) |
| `npm run fetch-ai-eval -- --max N --concurrency 1` | AI extract — serial parity |
| classify + discover `--dry-run` | Downstream pipeline queue snapshot |

**Note:** First fetch attempt (`a1-2026-05-30T21-21-28-fetch`) ran in a **network sandbox** — all `network` failures in ~1 ms; **ignore**. Valid run: `…-fetch-v2`.

### Fetch repro matrix (current)

| Run | N | local usable | jina usable | Top failures | Rate limit | Artifact |
|-----|---|--------------|-------------|--------------|------------|----------|
| **A1 full** (2026-05-30) | **400** | **296/400 (74%)** | **327/400 (82%)** | local: `provider_error` 36, `network` 20, `bot_blocked` 19 · jina: `provider_error` 22, X chrome | **2 local**, 0 jina | `enrich-fetch/a1-2026-05-30T22-fetch-400` |
| **A1 slice** (2026-05-30) | 30 | 9/30 (30%) | 3/30 (10%) | reddit-heavy head | **1** local (HN) | `…-fetch-v2` |
| **D10 baseline** (2026-05-28) | 500 | 312/500 (62%) | 357/500 (71%) | `parse_empty`, `provider_error`, X chrome | local **2**, jina **4** | `enrich-fetch/2026-05-28T15-35-48` |
| **D10 v2** (2026-05-28) | 500 | 324/500 (65%) | 357/500 (71%) | same family | local **2**, jina **0** | `enrich-fetch/2026-05-28T18-21-08` |

**400-URL run** (~36 min, `--no-tab`): mix **230 article / 155 x / 15 video**; **348/400** provider-split URLs; **52/400** none usable. Rate limits: **gabymora.com.au**, **immigrationnewscanada.ca** (local only — jina rescues gabymora). **0.17%** of 1200 provider attempts.

**Fetch patterns (400 vs May 28)**

| Failure kind | May 28 (500) | A1 full (400) | Notes |
|--------------|--------------|---------------|-------|
| `bot_blocked` | common | **19** (reddit) | Policy |
| `rate_limited` | local 2, jina 4 | **local 2**, jina **0** | Rare; host-specific |
| `provider_error` | common | local 36, jina 22 | Top bucket |
| `auth_required` | common | jina 18, local 6 | Medium/login |
| Usable rate | ~62–71% | **74–82%** | Comparable corpus |

### AI extract repro matrix (extract stage)

| Run | N | concurrency | ok | empty_response | api_error / 429 | Artifact |
|-----|---|-------------|-----|----------------|-----------------|----------|
| **A1 stress** | **111** | **8** | **99** (89.2%) | **12** | **0** | `enrich-fetch/a1-2026-05-30T22-ai-eval-c8-n111` |
| A1 c3 | 30 | 3 | 28 (93.3%) | 2 | 0 | `…-ai-eval-c3` |
| A1 c1 | 30 | 1 | 28 (93.3%) | 2 | 0 | `…-ai-eval-c1` |

**empty_response:** Chrome-filter / thin fetch body — **12/111** at full corpus load (linkedin, login walls, weak snippets). **Not** OpenRouter 429.

**Concurrency stress (111 items, c=8):** No `api_error`, no HTTP 429. OpenRouter quota **not** exhausted at this load. Failures remain **input quality**, same family as fetch-stage auth/parse issues.

### Pipeline queue snapshot (downstream — 2026-05-30)

| Stage | Metric | Value | Artifact |
|-------|--------|-------|----------|
| Classify dry-run | eligible / ineligible | 111 / 13 (`AI extraction failed`) | `classify-inc-2026-05-30T22-pipeline-dry` |
| Discover dry-run | stuck pool | 35 → 32 sampled | `discover-inc-2026-05-30T22-pipeline-dry` |

---

## Phase 2 — App validate (after CLI)

*Classify/discover: shared `src/lib` code paths. Fetch/enrich: validated via CLI parity with `enrichBatch` / `failureLabels.ts` (same error codes). No live extension session.*

| App path | N | First failure | Retry 1-by-1? | Same as CLI? | Notes |
|----------|---|---------------|---------------|--------------|-------|
| Import Studio → post-commit pipeline | all selected | **fetch** (reddit bot, medium auth) then **extract** | enrich per-item; classify app retry | **Yes** for fetch codes | `runBatchDigest` |
| Home → Process not enriched | cap 50 | fetch: bot/auth/rate_limit | per-item | **Yes** | `enrichBatch` |
| Home → Classify ready batch | cap 25 | classify parse (if any) | app retry | CLI classify worse | `resolveTopicExtractBatchWithRetry` |
| Hub → bulk re-digest | selected | fetch then classify | yes | Partial | shared `runBatchDigest` |
| Categories → discover | stuck pool | discover JSON parse @32 | app retry + batch 16 | CLI 32 + singles only | `discoverBatch` |

**App-only:** DB worker RPC, import report UI, cancel mid-run.

---

## Taxonomy (merged CLI + app + historical)

**Stage:** `fetch` | `extract` | `embed` | `classify` | `discover` | `rpc` | `import`

**Kind:** `rate_limit` | `timeout` | `abort` | `validation` | `provider_error` | `unknown`

| Stage | Kind | User-visible label (draft) | Observed? | Past (May 28) | Current (May 30) | Code path |
|-------|------|---------------------------|-----------|---------------|------------------|-----------|
| fetch | rate_limit | Fetch · rate limited | ✓ rare | local 2, jina 4 / 500 | **local 2 / 400** (gabymora, immigrationnewscanada); jina 0 | `jina.ts`, `failureLabels.ts` |
| fetch | validation | Fetch · bot blocked | ✓ common | reddit, X patterns | **19/30** reddit slice | `redditBlockedResult`, diagnose |
| fetch | validation | Fetch · auth / paywall | ✓ common | medium, login walls | jina `auth_required` on medium | `errorMessages.ts` |
| fetch | validation | Fetch · no content / parse empty | ✓ common | youtube local, thin | HN jina empty | `parse.mjs`, `diagnoseResult` |
| fetch | provider_error | Fetch · provider error | ✓ common | markdown-new, hosts | markdown-new 11/30 | hybrid provider chain |
| extract | validation | AI · no substantive content | ✓ | chrome filter | **2/30** linkedin, leverageedu | `runOpenRouterExtract` chrome filter |
| extract | provider_error | AI · API error | possible | corpus-dependent | **0/30** today | `openrouter.ts` |
| extract | rate_limit | AI extract · rate limit | possible | not seen | **0/111** at c=8 | OpenRouter 429 — **A2** (backoff still needed for heavier import batches) |
| discover | validation | Discover · bad JSON | ✓ | May 26 batch fail | batch-32 repro | `discoverTaxonomy.ts` |
| classify | validation | Classify · unparseable | possible | — | 0 in LLM runs | `parseReviewJson` |
| classify | validation | Ineligible · AI extraction failed | ✓ | 13 corpus | 13 unchanged | eligibility gate |
| classify | provider_error | LLM batch error (CLI no retry) | ✓ gap | — | CLI marks whole batch | `run-classify-incremental.mjs` |
| embed | rate_limit | Embed failed (429) | possible | — | not run | `openrouterEmbeddings.ts` |
| rpc | provider_error | DB worker bootstrap failed | app-only | — | code-traced | `dbClient/index.ts` |
| * | abort | Cancelled mid-run | app-only | — | — | `PipelineProgressProvider` |

---

## Past vs current — executive comparison

| Layer | May 26–28 (historical) | May 30 A1 (fresh) | Trend / note |
|-------|------------------------|-------------------|--------------|
| **Fetch usable rate** | ~62–71% / 500 URLs | **74% local / 82% jina / 400 URLs** | Aligned with D10 mixed corpus |
| **Fetch rate limits** | ~6 / ~1500 attempts (500×3) | **2 / 1200** (400×3), **local only** | Still **&lt;0.2%** — host-specific, not sustained Jina throttle |
| **Fetch dominant errors** | auth, bot, parse, provider | **provider_error**, **network**, **bot** (reddit), X chrome | Same families; rate limit **not** top bucket |
| **AI extract** | ~93% ok on samples | **99/111 ok** at **c=8**; 12 chrome-filter | **No 429** even under parallel load |
| **Classify LLM** | — | 0 errors batch 40/111 | No rate limit observed |
| **Discover LLM** | batch-32 parse fail, no recovery | batch-32 → singles OK | JSON parse &gt; quota as batch failure mode |
| **Bulk pipeline takeaway** | — | Failures are **bot/auth/parse/provider**, not quota — except discover batch JSON | **A2** backoff for edge cases + classify retry unification |

---

## Checklist

- [x] Phase 1: CLI classify batch + single-item
- [x] Phase 1: CLI discover batch + single-item
- [x] **Phase 1b: Fetch experiment 400 URLs (compare May 28)**
- [x] **Phase 1b: AI extract stress 111×c8**
- [x] **Phase 1b: Pipeline queue dry-run (classify + discover)**
- [x] Phase 2: App repro matrix (≥3 paths)
- [x] Past vs current comparison table
- [x] Map 5+ real failures to stage × kind
- [x] Top 3 hypotheses for “batch fails, 1-by-1 works”
- [x] Task return complete

---

## Top 3 hypotheses — “batch fails, 1-by-1 works”

1. **JSON output truncation** — discover/classify batch JSON exceeds `max_tokens` → parse fail; singles succeed (`repro32`).
2. **Missing per-item rows** — partial `results[]`; app re-chunk absorbs; CLI classify does not.
3. **Prompt overload** — large batch + catalog; app uses discover batch 16 vs CLI 32.

*(Fetch/extract do **not** show batch-vs-single rate-limit split at N=30 — failures are host-specific bot/auth/chrome, not quota.)*

---

## Key files

| Track | Files |
|-------|--------|
| **Fetch CLI** | `scripts/enrich-fetch/run-experiment.mjs`, `run-ai-eval.mjs`, `analyze-experiment.mjs` |
| **Classify CLI** | `scripts/categorize/run-classify-incremental.mjs`, `run-discover-incremental.mjs` |
| **Shared / app** | `src/lib/enrichment/*`, `failureLabels.ts`, `batchDigest.ts`, `categorization/*` |

---

## Out of scope

- Retry/backoff policy (→ **V3-A2**)
- Stage-aware error UI (→ **V3-A3**)

---

## Task return

| Field | Value |
|-------|-------|
| Phase | spike (+ fetch/pipeline extension) |
| CLI runs | **Fetch 400:** `a1-2026-05-30T22-fetch-400`. **AI extract:** `…-ai-eval-c8-n111` (111×c8), `…-c3`, `…-c1`. **Classify/discover:** May 30 LLM runs + pipeline dry-run. **Historical:** `2026-05-28T15-35-48`, `discover-inc-2026-05-26-llm`. |
| App runs | Code-path validation; fetch codes match CLI `diagnoseResult` ↔ `failureLabels.ts`. |
| CLI vs app parity | Fetch/extract: **same error vocabulary**. Classify: app retries, CLI does not. Discover: app batch 16 + full retry vs CLI 32 + singles. |
| Top repro | (1) Discover batch-32 JSON parse → singles OK. (2) Reddit headless `bot_blocked`. (3) AI extract chrome-filter `empty_response` on thin pages. |
| Rate limit behavior | **Fetch:** 2/1200 local attempts (0.17%) at N=400 — host-specific (gabymora, immigrationnewscanada). **Jina 0** at 400 (was 4/500 May 28). **Extract:** 0/111 at c=8. **Classify/discover:** 0 observed. Rate limits **real but not bulk-dominant** → A2 backoff for edge cases. |
| Taxonomy table | 15 rows — dominant failures are bot/auth/provider/parse, not quota. |
| Past vs current | **400-URL run matches May 28 failure families**; rate limits remain rare; discover JSON parse is the main **batch** failure mode for LLM stages. |
| Recommended next | **A2** — 429 backoff; wire CLI classify to shared retry; align discover batch size. **A3** — stage badges using this taxonomy. |
| Files touched | `docs/temp/TASK-V3-A1-repro-failure-taxonomy.md` only |

---

## Worker prompt

> **V3-A1:** Per this file. CLI classify/discover + **fetch + ai-eval + pipeline snapshot**; compare to May 28 artifacts; merge taxonomy. Update **only this file**.
