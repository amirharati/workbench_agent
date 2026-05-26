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

## Current chain (as of Task 03)

- **Task 01**: fetch enrichment service + storage split + hybrid fetch
- **Task 01.5**: AI extraction prompt tuning + eval harness + AI-only rerun
- **Task 02**: AI categorization V1 (seed/discover/classify, app + CLI)
- **Task 03**: V1.1 pipeline hardening — incremental classify, quality gate, run stats, discover CLI loop, **Enrichment dev hub** (Results / Categories), queue reconcilers, `pending_discover` for no-topic outcomes
- **Task 04 (closed)**: V1.5 search foundation — hybrid retrieval, discovery (similar/related), dev Search tab. **CLI = app core:** `npm run search-eval`, `embed-incremental`, `search-similar` run via **tsx** and import `src/lib/search/*` + `embedBackfillPlan.ts` directly.
- **Next:** fetch/enrichment improvement (pipeline bottleneck); search tuning deferred (`04-defer-*` in task return).

See:

- `docs/temp/TASK-01-fetch-enrichment-v1.md`
- `docs/temp/TASK-01.5-ai-extraction-tuning.md`
- `docs/temp/TASK-02-ai-categorization-v1.md`
- `docs/temp/TASK-02-app-implementation-plan.md`
- `docs/temp/TASK-03-v1.1-pipeline-hardening.md`
- `docs/temp/TASK-04-search-foundation-v1.5.md`

### Search CLI (Task 04 — same core as app)

| Command | Purpose |
|---------|---------|
| `npm run search-eval -- --backup ~/Documents/testing/latest.json [--run-embed] [--with-related]` | Hybrid vs lexical eval; outputs under `data/experiments/search/` |
| `npm run embed-incremental -- --backup <path> [--run-embed]` | Backfill vectors into backup (uses `embedBackfillPlan.ts`) |
| `npm run search-similar -- --backup <path> --item-id <id>` | Similar-items for one bookmark (uses `findSimilar.ts`) |

**Parity rule:** search ranking, similar-items, embed queue logic live in `src/lib/search/` and `src/lib/enrichment/embedBackfillPlan.ts` only. CLI scripts are thin IO + env wrappers (`tsx`).

---

## V2 / future use

This workflow remains the default for:

- retrieval quality experiments (hybrid search tuning)
- ANN threshold and index experiments
- chunking strategy tests
- cloud/offload A/B tests

Always validate in CLI first, then migrate only stable behavior into app code.

