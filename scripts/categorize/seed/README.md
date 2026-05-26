# Seed taxonomy (A₀ → A₁ …)

**Discover** leaves from the corpus (batched LLM on title+summary), then **classify** with topic-extract.

## 1. Discover taxonomy (recommended)

```bash
npm run discover-taxonomy -- \
  --ai-eval scripts/enrich-fetch/experiments/ai-eval-2026-05-25T01-53-38/results-v2.jsonl
```

- Filters ineligible / low-info pages
- Diverse ordering (embedding dedupe ~0.92)
- Batched LLM with **categoriesSoFar** (grouped parent → leaves with `path` / `pathIds`)
- Writes `categories.seed.json` (backs up prior to `categories.seed.manual-v0.json`)
- **Default:** extends `categories.seed.manual-v0.json` if present (`--no-initial-seed` for cold bootstrap only)
- First batch without initial seed uses **BOOTSTRAP** mode (up to 14 new leaves)
- Each parent gets a `*-general` fallback leaf on load if missing (`ensureGeneralFallbackLeaves`)

## 2. Classify bookmarks

```bash
npm run categorize -- \
  --ai-eval scripts/enrich-fetch/experiments/ai-eval-2026-05-25T01-53-38/results-v2.jsonl
```

Default classify: **topic extraction** — grouped catalog, 0–3 `topicIds` (or `topicPaths`), few-shot examples. Legacy: `--legacy-shortlist`.

**Assignment rules:** pick specific leaves first; use `{parentId}-general` only when no sibling leaf fits; never general + specific under the same parent. **Adult/erotic valid pages** → `adult-erotic-content` or `sexuality-wellness-education` — never skip as inappropriate.

## Files

- `categories.seed.json` — parents (fixed) + leaves (including `*-general` per parent)
- `categories.seed.manual-v0.json` — backup of hand-written seed
- `../lib/taxonomyCatalog.mjs` — grouped catalog, path labels, general leaves, resolve rules
- `experiments/discover-<ts>/` — discovery logs
- `experiments/cat-<ts>/` — classify outputs

```bash
npm run categorize -- --no-seed   # legacy k-means bootstrap
```
