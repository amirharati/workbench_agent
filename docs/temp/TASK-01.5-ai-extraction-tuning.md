# TASK-01.5 — AI extraction tuning + eval harness

**Status:** **closed** (2026-05-24; chrome filters 2026-05-25)  
**Backlog linkage:** `docs/backlog.md` → Phase B Fetch enrichment follow-up ("AI prompt tuning"), AI V1 quality pre-step  
**Depends on:** Task 01 closed (`src/lib/enrichment/*` + CLI experiments available)  
**Unblocks:** Task 02 (categorization quality baseline)

> **Master session:** fold this return into `docs/backlog.md` — mark **AI prompt tuning** done under Phase B follow-ups; set Task 01.5 **closed** in [`README.md`](README.md) Active queue; create Task 02 brief when ready.

---

## Goal

Improve enrichment AI output quality before categorization by:

1. tuning extraction prompts by `sourceKind` (`x`, `video`, `article`, `generic`),
2. adding a repeatable CLI evaluation harness over existing saved bodies (`data/experiments/enrich-fetch/*/bodies`),
3. supporting "AI-only rerun" (re-extract from saved snippet/raw body without re-fetching URL).

This task is about quality/reliability of extracted fields, not embeddings or clustering.

---

## Design decisions (locked 2026-05-24)

- **Pipeline works on today's fetch data** — sparse X bodies, no quote/thread crawl in V1. When fetch V2 adds richer bodies, same AI path benefits automatically.
- **`buildItemText`** — mechanical fields first; add `Summary:` + `Key points:` when `aiStatus === 'ok'`.
- **Eval corpus** — 124 usable items from `2026-05-21T02-02-56` + `2026-05-21T03-03-24` (of 150 fetched; rest skipped for no usable hybrid body or snippet < 80 chars). Body pick follows hybrid provider order via `attempts.json`.
- **X acceptance** — sparse-body quality (summary/tags on short tweets), not quote-tweet capture rate.
- **Default prompt** — `v2` sourceKind-aware; `v1` kept as baseline for eval comparison.
- **Adult content (2026-05-25)** — enrichment must summarize valid adult/erotic bookmarks like any other page; never empty/refuse solely for sexual content (aligned with categorization policy). Corpus check: `pornid`, `dipseastories`, `flo.health` sex-dream articles → `status: ok` on canonical eval.

---

## Shipped

| Deliverable | Location |
|-------------|----------|
| Prompt package v2 (+ v2.1 rich summary / keyPoints) | `src/lib/enrichment/prompts.ts` |
| Chrome pre/post filters (login/cookie/404) | `src/lib/enrichment/extractFilters.ts`, `scripts/enrich-fetch/lib/extractFilters.mjs` |
| SourceKind + hints + JSON parse in extract | `src/lib/enrichment/aiExtract.ts` |
| `buildItemText` AI summary + key points | `src/lib/enrichment/itemText.ts` |
| `reextractAI()` + `aiKeyPoints` persistence | `src/lib/enrichment/fetchService.ts`, `types.ts`, `fieldInventory.ts` |
| CLI eval harness | `npm run fetch-ai-eval` → `scripts/enrich-fetch/run-ai-eval.mjs` |
| Dev UI trigger | Enrichment review modal → **Re-run AI** |
| Vite dev fix (exclude `temp/` samples from dep scan) | `vite.config.ts` |

---

## CLI eval usage

```bash
# v2 only (default), full corpus
OPENROUTER_API_KEY=... npm run fetch-ai-eval

# Compare v1 vs v2
OPENROUTER_API_KEY=... npm run fetch-ai-eval -- --compare

# Quick smoke (20 items)
OPENROUTER_API_KEY=... npm run fetch-ai-eval -- --max 20
```

Outputs: `data/experiments/enrich-fetch/ai-eval-<ts>/results-{v1,v2}.jsonl`, `SUMMARY-*.md`, optional `COMPARE.md`.

**Note:** CLI prompts mirror `prompts.ts` in `scripts/enrich-fetch/lib/aiPrompts.mjs` — keep in sync when editing prompts.

**Canonical eval run:** `data/experiments/enrich-fetch/ai-eval-2026-05-24T21-53-00/`
**Compare run:** `data/experiments/enrich-fetch/ai-eval-2026-05-24T21-38-06/COMPARE.md`

---

## Quality bar (acceptance criteria)

- [x] Source-specific prompts implemented and used in extraction path (default v2).
- [x] CLI eval runs on >=100 saved bodies and outputs machine-readable + summary report.
- [x] JSON validity >= baseline; fewer parse failures than baseline (v2 **96.0%** ok vs v1 **86.3%**).
- [x] Missing critical fields reduced vs baseline (summary/title/tags all improved; keyPoints on 91% of corpus).
- [x] Sparse X / short-body handling in prompts (no quote/thread dependency).
- [x] AI-only rerun works without network fetch (`reextractAI` + Review modal).
- [x] No regression to Task 01 fetch success flow (AI remains non-blocking).
- [x] In-app validation — re-fetch / re-run AI on bookmarks; `aiKeyPoints` persists after fresh dev build + extension reload.

---

## Task 01.5 return

### Shipped

- SourceKind-aware **v2** extraction prompts (article / x / video / generic) with tuned hints and min output tokens.
- **v2.1** schema: `summary` (4–6 sentences), `keyPoints`, `improvedTitle`, `tags`.
- CLI eval harness over saved experiment bodies with v1/v2 compare and summary reports.
- `reextractAI()` — AI-only rerun from cached snippet/raw body (no network fetch).
- `buildItemText` supplements mechanical fields with `Summary:` and `Key points:` when AI ok.
- Review modal **Re-run AI** button for dev validation.

### Files

| Area | Path |
|------|------|
| Prompts | `src/lib/enrichment/prompts.ts` |
| Extract | `src/lib/enrichment/aiExtract.ts` |
| Item text | `src/lib/enrichment/itemText.ts` |
| Fetch / persist | `src/lib/enrichment/fetchService.ts`, `types.ts`, `fieldInventory.ts` |
| CLI eval | `scripts/enrich-fetch/run-ai-eval.mjs`, `lib/aiPrompts.mjs`, `lib/aiEvalCorpus.mjs` |
| UI | `src/components/dashboard/EnrichmentReviewModal.tsx` |
| Dev infra | `vite.config.ts`, `.env.example`, `package.json` (`fetch-ai-eval`) |

### Prompt variants tested

- **v1** — single generic prompt (baseline).
- **v2** — sourceKind-aware prompts; article prompt revised after first compare (too conservative).
- **v2.1** — richer summaries + `keyPoints` array (default in app and CLI).

### Corpus / eval size

- **124** usable items (from runs `2026-05-21T02-02-56` + `2026-05-21T03-03-24`).

### Winning prompt choice

**v2.1 (sourceKind-aware v2 + keyPoints)** — best ok rate, richer summaries for categorization/search, no regressions vs v1 on compare run after article prompt fix.

### Metrics (before / after)

| Metric | v1 | v2 / v2.1 |
|--------|----|----|
| ok rate | 86.3% | **96.0%** (119/124) |
| summary rate | 86.3% | **96.0%** |
| title rate | 83.9% | **95.2%** |
| has keyPoints | — | **91.1%** (113/124) |
| avg summary len (ok) | — | **495** chars |
| avg keyPoint count (ok) | — | **4.37** |
| avg tags (ok) | 4.37 | **5.52** |

By source kind (v2.1): article 104/108 ok; video 7/8; x **8/8**.

### Known failure modes

- **empty_response** (5/124) — thin or ambiguous input; not fixed by prompt alone.
- **X thread replies / thanks-only** — sparse bookmark body; needs fetch V2 for thread context.
- **Reddit / login walls** — `auth_required` (expected).
- **t.co shorteners** — `parse_empty` (expected until unroll/deep fetch).

### Backlog updates suggested (for master session)

1. Mark Phase B follow-up **"AI prompt tuning"** as **done** (Task 01.5 closed 2026-05-24).
2. Note default extraction prompt is **v2.1 sourceKind-aware**; CLI mirror in `scripts/enrich-fetch/lib/aiPrompts.mjs`.
3. Unblock **Task 02 — AI categorization V1**; create `TASK-02-*.md` brief.
4. Remaining Phase B follow-ups unchanged: product UX (replace dev modals), deep fetch, tab provider, failure stats, t.co unroll, pick-best provider, import enrich hook.

### Ready for Task 02 categorization

**Yes** — enriched items expose AI summary, keyPoints, tags, and `buildItemText` for categorization input.

---

## Key files

- `src/lib/enrichment/prompts.ts`
- `src/lib/enrichment/aiExtract.ts`
- `src/lib/enrichment/itemText.ts`
- `src/lib/enrichment/fetchService.ts`
- `scripts/enrich-fetch/run-ai-eval.mjs`
- `scripts/enrich-fetch/lib/aiPrompts.mjs`
- `scripts/enrich-fetch/lib/aiEvalCorpus.mjs`
- `src/components/dashboard/EnrichmentReviewModal.tsx`
