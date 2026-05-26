# Enrichment fetch CLI

Compare **all** fetch providers side-by-side before changing extension code.

## Quick start

```bash
# Default: local + tab (Playwright) + jina + markdown-new + syndication (X)
npm run fetch-test -- "https://react.dev/learn"

# Skip slow browser step
npm run fetch-test -- --no-tab "https://..."

# Logged-in sites — persistent profile (log in once in headed mode)
npm run fetch-test -- --tab-profile ./.fetch-test-browser --tab-headed "https://medium.com/..."
# next runs reuse cookies:
npm run fetch-test -- --tab-profile ./.fetch-test-browser "https://medium.com/..."

# Tab provider only
npm run fetch-test -- --provider tab --tab-headed "https://..."
```

First-time setup for tab provider:

```bash
npm install
npx playwright install chromium
```

## Batch experiment (compare all providers)

```bash
# Seed URLs (15 diverse sites, ~3 min with tab)
npm run fetch-experiment -- scripts/enrich-fetch/seeds/diverse-urls.txt

# Your bookmarks — export latest.json from Settings, then:
npm run fetch-experiment -- --from-backup /path/to/latest.json

# Faster: skip Playwright tab step
npm run fetch-experiment -- --no-tab seeds/diverse-urls.txt
```

Output: `data/experiments/enrich-fetch/<timestamp>/`
- `results.jsonl` — one JSON row per URL with all provider outcomes
- `ANALYSIS.md` — success rates, per-host table, boilerplate hits, patterns

Pick URLs only:

```bash
node scripts/enrich-fetch/pick-urls.mjs /path/to/latest.json --max 24 --per-host 2
```

## Providers

| Provider | What it does |
|----------|----------------|
| `local` | HTTP fetch + Readability. X status: Twitter embed CDN |
| **`tab`** | **Playwright opens a real browser tab, runs JS, Readability on rendered DOM** (extension stand-in) |
| `jina` | r.jina.ai |
| `markdown-new` | markdown.new fallback |
| `syndication` | fxtwitter API (X only) |
| `all` | **Default** — every provider above |
| `hybrid` | Extension-style chain with early exit (`local → tab → …`) |

## Tab provider flags

| Flag | Purpose |
|------|---------|
| `--no-tab` | Skip Playwright (faster default runs) |
| `--tab-headed` | Show browser window (debug login) |
| `--tab-profile DIR` | Persistent profile dir — **keeps cookies between runs** |

## Logged-in pages

1. Create a profile dir: `mkdir -p .fetch-test-browser`
2. Run once with `--tab-profile .fetch-test-browser --tab-headed` and log in manually
3. Future headless runs use those cookies

This mirrors what the Chrome extension will do with open/background tabs + content scripts.

## Other flags

- `--quiet` — summary only
- `--notes "text"` — simulate bookmark notes
- `--json` / `--raw` / `--provider <name>`
