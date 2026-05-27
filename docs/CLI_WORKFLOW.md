# CLI Workflow (Parallel R&D Loop)

Practical step-by-step workflow for running a **parallel CLI track** beside in-app development.  
This is how Tasks 01, 01.5, and 02 were executed and how to continue for Task 02.1 / V2 experiments.

---

## Why this exists

The app needs stable UX and data migrations, but model/fetch/categorization quality needs fast iteration.

Use this split:

- **CLI track** = experiment quickly (prompts, routing, thresholds, taxonomy quality, evaluation).
- **App track** = wire only the proven pipeline into IndexedDB/UI with minimal risk.

Keep both tracks using the same core logic whenever possible.

---

## Standard loop (master + implementation sessions)

1. In the **master session**, define or update a `docs/temp/TASK-*.md` brief.
2. Start a **clean implementation session** with that single task brief.
3. Build/test in CLI first (or enrich CLI + app in parallel, depending on task).
4. Return with metrics, changed files, tradeoffs, and next recommendations.
5. Master session updates `backlog.md` + `OVERVIEW.md` and prepares the next task.

Use `docs/temp/README.md` as queue/status source of truth.

---

## Folder conventions

- CLI scripts:
  - `scripts/enrich-fetch/` (fetch/enrichment experiments)
  - `scripts/categorize/` (taxonomy/categorization experiments)
  - `scripts/search/` (hybrid search eval — **imports `src/lib/search/*` via tsx**, no forked mirror)
- Experiment outputs (gitignored large artifacts):
  - `data/experiments/enrich-fetch/...`
  - `data/experiments/categorize/...`
  - `data/experiments/search/...` (eval + embed backfill runs)
- Task specs and handoff docs:
  - `docs/temp/TASK-*.md`

---

## Environment setup (shared)

1. Copy `.env.example` -> `.env`.
2. Set required keys (e.g. OpenRouter for extraction/categorization prompts).
3. Ensure local dependencies are installed.
4. Use the same model config in CLI and app when validating parity.

---

## CLI-first execution pattern (per task)

### A) Define corpus

- Prefer real saved corpus from prior task outputs (e.g. fetched bodies, AI eval outputs).
- Keep a reproducible file path in the task brief.
- Record corpus size and source mix (article/x/video/etc.).

### B) Run baseline + candidate(s)

- Run baseline mode first.
- Run candidate mode(s) with one variable changed at a time.
- Save machine-readable outputs (`jsonl`) and human summaries (`SUMMARY.md` / `COMPARE.md`).

### C) Measure and decide

Typical metrics:

- parse/JSON validity rate
- success/ok rate
- missing critical field rate
- assignment/coverage rates
- error buckets
- source-kind breakdown

Then do a small human spot-check set (10-20 items).

### D) Promote winner

- Make the winning logic/prompt/model the default in shared code.
- Keep baseline option for regression checks only.
- Document exact decision and rationale in task return.

### E) Wire app minimally

- Add or update app entrypoints to call the same core service.
- Keep dev UX lightweight (buttons/panel) until product UX is decided.

---

## App integration rules

1. **Do not fork logic**: app should call the same service modules used by CLI where practical.
2. **Persist minimal required state**: enough for resumability, skip logic, and backups.
3. **Expensive blobs**: keep off main DB JSON (disk/cache + refs).
4. **No UX overbuild during R&D**: dev controls are acceptable while validating behavior.

---

## Handoff checklist (implementation -> master)

Every return should include:

- what shipped
- key files touched
- corpus size and metrics
- known failure modes
- deviations from original task brief
- backlog/doc updates suggested
- explicit yes/no if next task is unblocked

Use the return template embedded in each `TASK-*.md`.

---

## AI pipeline order (app + CLI)

End-to-end dev pipeline as of Task 04:

```text
import / items
  → fetch (Task 01)           scripts/enrich-fetch/
  → AI extract (Task 01.5)    item_enrichment (summary, tags, …)
  → doc embed (Task 04)       ai_item_signals.embedding  ← shared step
  → classify / discover (02–03)  ai_item_category_links, taxonomy
  → search / similar (04)     hybrid retrieval + discovery
```

**Doc embedding** is a **first-class stage** (not only a side effect of classify). Same logic in app and CLI — do not fork.

| Stage | Shared modules | App (dev) | CLI |
|-------|----------------|-----------|-----|
| Embed queue | `embedBackfillPlan.ts`, `searchEmbedText.ts` | `embedItemSignal.ts`, `EmbedBackfillBlock` | `npm run embed-incremental` |
| Search | `src/lib/search/*` | Search (dev) tab in `PipelineDevView` | `npm run search-eval`, `search-similar` |

**Prerequisite for hybrid search eval:** items need `ai_item_signals.embedding` (run embed backfill on backup or app first). Corpus-only classify experiments often have **0 embeddings** — eval falls back to lexical + category only.

**Return later (V2+):** auto-embed after extract; unify embed text with `buildItemText` for categorize shortlist/centroids; Web Worker batches; ANN index. See `docs/backlog.md` → **AI — V2+**.

---

## Current chain (as of Task 04)

- **Task 01**: fetch enrichment service + storage split + hybrid fetch
- **Task 01.5**: AI extraction prompt tuning + eval harness + AI-only rerun
- **Task 02**: AI categorization V1 (seed/discover/classify, app + CLI)
- **Task 03**: V1.1 pipeline hardening — incremental classify, quality gate, run stats, discover CLI loop, **Enrichment dev hub** (Results / Categories), queue reconcilers, `pending_discover` for no-topic outcomes
- **Task 04 (closed)**: V1.5 search foundation + **shared doc-embed step** — hybrid retrieval, discovery (similar/related), dev Search tab. **CLI = app core:** `search-eval`, `embed-incremental`, `search-similar` via **tsx** → `src/lib/search/*` + `src/lib/enrichment/embedBackfillPlan.ts`.
- **V2 (active):** product UX/UI first ([`TASK-05-v2-product-ux.md`](temp/TASK-05-v2-product-ux.md)); V1 backend refinement (fetch, tuning, embed unify) in **V2-C**; scale AI in **V3**.

See:

- `docs/temp/TASK-01-fetch-enrichment-v1.md`
- `docs/temp/TASK-01.5-ai-extraction-tuning.md`
- `docs/temp/TASK-02-ai-categorization-v1.md`
- `docs/temp/TASK-02-app-implementation-plan.md`
- `docs/temp/TASK-03-v1.1-pipeline-hardening.md`
- `docs/temp/TASK-04-search-foundation-v1.5.md`

## Doc embedding step (shared pipeline)

**Input:** `items` + `item_enrichment` where `aiStatus === 'ok'`, text from `buildSearchEmbedText(item, enrichment)` (title + summary, min length 24).

**Output:** `ai_item_signals` with `embedding`, `embeddingModel`, `textHash` (skip re-embed when hash unchanged).

**API:** OpenRouter embeddings (`src/lib/ai/openrouterEmbeddings.ts`), model `DEFAULT_EMBEDDING_MODEL` from categorization service.

### Embed CLI

```bash
# Plan only (counts pending / skipped)
npm run embed-incremental -- --backup ~/Documents/testing/latest.json --dry-run

# Backfill (writes updated backup + run-stats under data/experiments/search/embed-*)
npm run embed-incremental -- --backup ~/Documents/testing/latest.json --run-embed --max 100
```

Options: `--backup`, `--out`, `--max`, `--dry-run`, `--run-embed`. Requires `.env` with embedding API key (same as app AI settings pattern in CLI).

**Consumers today:** hybrid search candidate path, `findSimilarItems`, search-related links, query embedding at search time.

**Consumers later (V2+ backlog):** category shortlist, centroid refresh, duplicate-category merge — reuse same vectors once embed/classify text is unified.

---

### Search CLI (Task 04 — same core as app)

| Command | Purpose |
|---------|---------|
| `npm run embed-incremental -- --backup <path> [--run-embed] [--max N]` | **Run first** when backup lacks vectors; shared embed queue |
| `npm run search-eval -- --backup <path> [--run-embed] [--with-related]` | Hybrid vs lexical eval; outputs under `data/experiments/search/eval-*` |
| `npm run search-similar -- --backup <path> --item-id <id>` | Similar-items for one bookmark (`findSimilar.ts`) |

**Parity rule:** embed queue in `src/lib/enrichment/embedBackfillPlan.ts` (+ `embedItemSignal.ts` for app writes). Search ranking in `src/lib/search/*` only. CLI scripts are thin IO + env wrappers (`tsx`).

---

## V2-C / V3 (backlog pointers)

**V2-C** = V1 backend refinement (CLI still valid). **V3** = scale AI. Track in `docs/backlog.md`:

| ID / theme | What to revisit |
|------------|-----------------|
| `04-defer-1` … `04-defer-3` | Re-run `search-eval` after corpus has embeddings; weight tuning; spot-check doc |
| `04-defer-4` | Product `SearchTab` / item UX (not dev hub) |
| Embed unify | One embed text + queue for search **and** categorize (today: `buildSearchEmbedText` vs `buildItemText`) |
| Auto-embed | Queue embed after successful AI extract / import |
| Centroids / ANN | Category centroids from shared vectors; WASM ANN when brute-force too slow |
| Chunk RAG | Chunk store + two-stage retrieval (coarse doc → fine chunk) |
| Pluggable `Embedder` | Local vs cloud swap without app rewire |

Always validate in CLI first, then migrate only stable behavior into app code.

