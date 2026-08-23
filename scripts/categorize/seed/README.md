# Seed taxonomy (A₀ → A₁ …)

The app starts from a broad stable parent scaffold plus durable starter leaves,
then **Discover** extends leaves (and genuinely missing parents) from the user's corpus before **Classify**.

## 1. Discover taxonomy (recommended)

```bash
npm run discover-taxonomy -- \
  --ai-eval data/experiments/enrich-fetch/ai-eval-2026-05-25T01-53-38/results-v2.jsonl
```

- Filters ineligible / low-info pages
- Diverse ordering (embedding dedupe ~0.92)
- Batched LLM with **categoriesSoFar** (grouped parent → leaves with `path` / `pathIds`)
- The app's canonical seed is `src/lib/categorization/data/categories.seed.json`; this folder keeps an identical eval copy.
- `categories.seed.manual-v0.json` is historical only and must not be used as the product seed.
- First batch without initial seed uses **BOOTSTRAP** mode (up to 14 new leaves)
- Each parent gets a `*-general` fallback leaf on load if missing (`ensureGeneralFallbackLeaves`)

## 2. Classify bookmarks

```bash
npm run categorize -- \
  --ai-eval data/experiments/enrich-fetch/ai-eval-2026-05-25T01-53-38/results-v2.jsonl
```

Default classify: **topic extraction** — grouped catalog, 0–3 `topicIds` (or `topicPaths`), few-shot examples. Legacy: `--legacy-shortlist`.

**Assignment rules:** pick specific leaves first; use `{parentId}-general` only when no sibling leaf fits; never general + specific under the same parent. **Adult/erotic valid pages** → `adult-erotic-content` or `sexuality-sexual-health` — never skip as inappropriate.

## Files

- `categories.seed.json` — eval mirror of the product's broad parent/starter-leaf scaffold
- `categories.seed.manual-v0.json` — historical pre-V3 seed, retained only for provenance
- `../lib/taxonomyCatalog.mjs` — grouped catalog, path labels, general leaves, resolve rules
- `data/experiments/categorize/discover-<ts>/` — discovery logs
- `data/experiments/categorize/cat-<ts>/` — classify outputs

```bash
npm run categorize -- --no-seed   # legacy k-means bootstrap
```
