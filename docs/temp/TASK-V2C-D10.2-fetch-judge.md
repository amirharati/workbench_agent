# TASK-V2C-D10.2 — LLM fetch judge (dev CLI)

**Status:** **done** (2026-05-28)  
**Parent:** [`TASK-V2C-D10-fetch-improvement.md`](TASK-V2C-D10-fetch-improvement.md) · **D-10.2**  
**Master findings:** [`D10-FETCH-FINDINGS-REPORT.md`](D10-FETCH-FINDINGS-REPORT.md)  
**Depends on:** D10.1 experiment dir with `bodies/*/*.md`  
**Blocks:** D10.4 (informs fixes, not required for D10.3)

---

## Documentation rule

Update **only this file** + `scripts/enrich-fetch/` (judge script + optional `lib/fetchJudge*.mjs`). **No `src/`.**

---

## Goal

**Dev-only** LLM judge on D10.1 500-URL corpus — compare **URL intent** (what user bookmarked) vs **actual fetch bodies** across providers. Catch false positives (cookie/login chrome marked usable). Not production gating.

---

## Scope

### In scope

- [x] `scripts/enrich-fetch/run-fetch-judge.mjs`
- [x] `lib/fetchJudgePrompts.mjs` + `lib/fetchJudge.mjs`
- [x] **`--scope url` (default)** — one judgment per URL: `expectedContent`, `fetchWorked`, `whatWentWrong`, `bestProvider`, per-provider verdicts
- [x] `--scope attempt` — per-provider deep dive (optional)
- [x] OpenRouter (`OPENROUTER_API_KEY`, `gpt-4o-mini`)
- [x] `judge-results.jsonl` + `JUDGE.md` under `data/experiments/enrich-fetch/judge-<exp>-<ts>/`
- [x] `npm run fetch-judge` in `package.json`
- [x] Full 500-URL run complete + task return filled

### Out of scope

- Wiring judge into extension `fetchQuality` or `enrichOne`
- Provider chain changes (→ D10.4)

---

## Commands

```bash
# URL-level (recommended) — 500 calls, ~30–45 min
npm run fetch-judge -- --experiment data/experiments/enrich-fetch/2026-05-28T15-35-48

# Smoke test
npm run fetch-judge -- --experiment ... --scope url --max 10
```

---

## Judge output schema (URL scope)

| Field | Meaning |
|-------|---------|
| `expectedContent` | What URL implies user saved |
| `fetchWorked` | Any provider got real content |
| `usableForEnrichment` | Good enough for AI (not cookie/login/thin) |
| `bestProvider` | Judge pick |
| `whatWentWrong` | Diagnosis if failed |
| `failureBucket` | ok / auth_required / bot_blocked / cookie_noise / thin_content / provider_gap / … |
| `providerVerdicts` | Per-provider gotExpectedContent + issue |

---

## Acceptance

- [x] Script runs on D10.1 experiment
- [x] `JUDGE.md` on full 500-URL run
- [x] Documented in `scripts/enrich-fetch/README.md`

---

## Task return

- **Script path:** `scripts/enrich-fetch/run-fetch-judge.mjs`
- **Output:** `data/experiments/enrich-fetch/judge-2026-05-28T15-35-48-2026-05-28T17-49-15/`
- **Command:**
  ```bash
  npm run fetch-judge -- --experiment data/experiments/enrich-fetch/2026-05-28T15-35-48 --scope url --concurrency 8
  ```

### Regex vs judge (URL-level)

| | Count | Rate |
|--|-------|------|
| Regex (any provider usable) | 404/500 | 80.8% |
| **Judge usable** | **312/500** | **62.4%** |
| Disagreements (regex ok, judge rejects) | **92** | 18.4% |

Your skepticism was warranted — mechanical usable **overstates success by ~18 points**.

### Judge failure buckets (500 URLs)

| Bucket | Count |
|--------|-------|
| ok | 312 |
| provider_gap | 94 |
| auth_required | 35 |
| thin_content | 25 |
| bot_blocked | 24 |
| parse_empty | 10 |

### Best provider (judge pick)

- local: 239 · jina: 114 · syndication: 2

### Top findings for D10.4 / D10.6 / D10.3

1. **92 false positives** — tighten `fetchQuality`; don't trust bytes alone
2. **thin_content (25)** → D10.6 X thread expand
3. **auth_required (35)** → D10.3 tab-profile rescue list
4. **bot_blocked (24) + provider_gap (94)** → D10.4 fail-fast (Reddit, t.co unroll)
5. **jina** wins raw count but judge prefers **local** 2:1 when content is real

### Suggested next steps

See **[`D10-FETCH-FINDINGS-REPORT.md`](D10-FETCH-FINDINGS-REPORT.md)** for full analysis and build order.

1. **D10.6** — X thread expand (thin_content + false-positive X)
2. **D10.4** — t.co unroll, Reddit fail-fast, fetchQuality hardening from judge FP patterns
3. **D10.3** — tab-profile on auth_required subset from `judge-results.jsonl`
