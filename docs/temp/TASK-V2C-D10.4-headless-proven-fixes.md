# TASK-V2C-D10.4 — Headless fixes (prove then code)

**Status:** **Slice 1 done** (2026-05-28) · **Slice 3 gate policy** done (2026-05-28)  
**Parent:** [`TASK-V2C-D10-fetch-improvement.md`](TASK-V2C-D10-fetch-improvement.md) · **D-10.4**  
**Depends on:** D10.1 ✅ D10.2 ✅ — read [`D10-FETCH-FINDINGS-REPORT.md`](D10-FETCH-FINDINGS-REPORT.md)  
**Blocks:** D10.5 · D10.4 slice 2 (Reddit alts, full provider_gap)

---

## Documentation rule

Update **only this file** + `scripts/enrich-fetch/` + `src/lib/enrichment/` (fetchQuality, providers, hybrid). **Every code change** must cite before/after experiment on affected URLs.

**Master findings:** [`D10-FETCH-FINDINGS-REPORT.md`](D10-FETCH-FINDINGS-REPORT.md) (Reddit 0/19 — bot_blocked)

---

## Goal

Fix **proven** headless issues: false positives (login-wall as success), pick-best routing, promoted providers from throwaway tests. **Explore** alternative providers for hard hosts (Reddit, t.co, GitHub blobs) in scratch first. Defer unresolved `provider_gap` hosts explicitly.

---

## Slice 1 — **done** (2026-05-28)

**Baseline:** `data/experiments/enrich-fetch/2026-05-28T15-35-48/` · judge `judge-2026-05-28T15-35-48-2026-05-28T17-49-15/`  
**After:** `data/experiments/enrich-fetch/2026-05-28T18-21-08/` · judge `judge-2026-05-28T18-21-08-2026-05-28T19-17-43/` (500/500)

### In scope (slice 1 only)

- [x] **`fetchQuality` hardening** — align `fetchQuality.mjs` ↔ `fetchQuality.ts` using judge FP patterns (GitHub nav, login/cookie chrome, YouTube jina template); login-wall must not yield enrich success
- [x] **t.co unroll** — resolve short link → canonical URL before hybrid chain (see findings: 21/26 mechanical failures)
- [x] **Reddit fail-fast** — `reddit.com` → skip jina/local chain, `bot_blocked` (no full Reddit provider solve in slice 1)
- [x] **Before/after** — re-run `fetch-judge` on same 500 corpus OR documented subset; update task return + [`D10-FETCH-FINDINGS-REPORT.md`](D10-FETCH-FINDINGS-REPORT.md) with new judge-ok %
- [x] `npm run build` passes

### Out of scope (slice 2 — defer)

- Reddit B–G scratch matrix (except fail-fast in slice 1)
- GitHub blob/raw/API path
- Pick-best hybrid simulation
- Full provider_gap research

---

## Slice 3 — **gate relaxation** (2026-05-28)

**Policy:** Mechanical fetch gates = **high-precision hard blocks only**. Ambiguous bodies → **AI extraction** adjudicates (`prepareExtractInput`, `hasSubstantiveExtract`). Prefer false accepts → AI over false rejects at fetch stage.

### Shipped

- [x] `explainHardFetchFailure` vs `explainSoftFetchSuspect` in `fetchQuality.ts` ↔ `fetchQuality.mjs`
- [x] **Hard only:** empty/tiny body, Reddit network-security wall, block patterns on short pages (&lt;450 chars)
- [x] **Soft (AI decides):** GitHub nav shell, YouTube jina chrome, login/consent dominant, weak title, block patterns in long bodies
- [x] `fetchService`: run AI unless hard block; `status: failed` when AI returns `empty_response` / `content_too_short`
- [x] Hybrid provider routing uses hard blocks only (soft still acceptable for chain pick)
- [x] CLI `diagnoseResult` exposes `suspect` / `tier: soft` for experiment runs

### Worker prompt (copy-paste)

> Implement **D10.4 Slice 1 only** per [`TASK-V2C-D10.4-headless-proven-fixes.md`](TASK-V2C-D10.4-headless-proven-fixes.md). Read [`D10-FETCH-FINDINGS-REPORT.md`](D10-FETCH-FINDINGS-REPORT.md). Ship: fetchQuality FP fixes, t.co unroll, Reddit fail-fast. Re-judge corpus; report before/after judge-ok. **Do not** implement Reddit alt providers, GitHub raw path, D10.6, or extension tab. Update only this task file + code + findings report stats section.

---

## Scope (full D10.4 — includes slice 2)

### In scope

- [ ] Throwaway probes in `scripts/enrich-fetch/scratch/` for top `provider_gap` / `bot_blocked` hosts (delete or keep as recipes)
- [ ] **Reddit alternatives matrix** — probe options below; only promote winner with experiment proof
- [ ] Promote to `providers.mjs` / hybrid **only** with experiment proof (link run id in return)
- [ ] Align `fetchQuality.mjs` ↔ `fetchQuality.ts` (taxonomy: `auth_required`, `bot_blocked`, `parse_empty`, …)
- [ ] Pick-best or scoring when multiple providers succeed (per D10.1/D10.2 stats)
- [ ] Rerun experiment subset showing improvement (same URLs as baseline)

### Reddit — explore in D10.4 (not D10.6 / not tab product yet)

Baseline: **19/19 failed** all providers (local, jina, markdown-new). Judge: all `bot_blocked`. Do **not** keep burning Jina on reddit.com.

| Option | Headless? | Probe in scratch | Notes |
|--------|-----------|------------------|-------|
| **A — Fail-fast** | ✅ | Yes (ship even if nothing else works) | Detect reddit host → skip jina chain, clear `bot_blocked` code |
| **B — `old.reddit.com` rewrite** | Maybe | `scratch/reddit-old.mjs` | Same URL → old subdomain; sometimes less JS; still may block datacenter |
| **C — Append `.json`** | Maybe | `scratch/reddit-json.mjs` | `…/comments/{id}.json` — often returns HTML challenge from CLI (verified 2026-05-28); retry with browser UA + cookies |
| **D — Playwright tab (no profile)** | Partial | reuse `tabBrowser.mjs` | Real browser context; may pass bot check without login |
| **E — Tab + user profile** | ✅ | → D10.3/D10.5 | Best reliability if user logged into Reddit |
| **F — Third-party reader API** | Research | `scratch/reddit-alt-*.mjs` | e.g. archive mirrors, embed services — check ToS + longevity before promote |
| **G — Official Reddit API** | OAuth | Out of scope v1 | App registration, rate limits, not batch-enrich friendly |

**D10.4 rule for Reddit:** run A (fail-fast) immediately; parallel scratch probes for B–D on 5–10 URLs from corpus; if none beat 0%, **defer** to tab (D10.5) and list in deferred hosts — do not fake success.

### Other D10.4 probe targets (from findings report)

| Host / pattern | Probe idea |
|----------------|------------|
| **t.co** | Unroll redirect → canonical URL before hybrid chain |
| **GitHub blob/wiki** | `raw.githubusercontent.com`, repo README API, not marketing nav page |
| **YouTube jina chrome** | Boilerplate ratio gate on jina template |
| **Bloomberg / paywall** | fail-fast or tab-only |

### Out of scope

- Extension tab session (→ D10.5)
- D-25 review UI
- Recursive follow (→ D10.6)
- Speculative providers without experiment row

---

## Rule

**No merge** without: failing URL → throwaway fix works → `fetch-experiment` row shows lift → then shared code.

---

## Acceptance

- [ ] Before/after stats on same URL set (document experiment paths)
- [ ] Deferred hosts listed (do not fake success)
- [ ] `npm run build` passes
- [ ] Headless public URLs still work (smoke: 3–5 known-good URLs)

---

## Task return

### Fixes shipped (experiment `2026-05-28T18-21-08`)

| Fix | Evidence |
|-----|----------|
| **fetchQuality hardening** | GitHub nav shell, login/cookie chrome, YouTube short-chrome gate; mechanical FP −46 attempts on baseline bodies (404→375 URL-any); paired judge FP 65→57 on 378 judged URLs |
| **t.co unroll** | Manual redirect + Safari UA; mechanical any-usable 17→37 on t.co URLs; **judge ok 7→27** (paired t.co subset) |
| **Reddit fail-fast** | 19/19 → `bot_blocked` in 0 ms; **~51 s Jina burn eliminated** per corpus |

### Before/after (500-URL corpus)

| Metric | D10.2 baseline | D10.4 slice 1 | Notes |
|--------|----------------|---------------|-------|
| **Judge ok (full 500)** | **312 (62.4%)** | **315 (63.0%)** | **+0.6 pp** |
| Regex any-usable | 404 (80.8%) | 399 (79.8%) | stricter gates |
| Judge false positives | 92 | **84** | −8 |
| t.co judge ok | 12/58 | **33/58** | +21 |
| reddit jina ms (19 URLs) | 51,391 | 0 | fail-fast |

### Deferred hosts (slice 2 / tab)

- **reddit.com** — headless still 0%; tab session (D10.3/D10.5)
- **GitHub blob/wiki** — raw/API path (slice 2)
- **provider_gap** — dead pages, SPAs (slice 2 research)

### Files

- `scripts/enrich-fetch/lib/urlPolicy.mjs` — t.co unroll, Reddit detect
- `scripts/enrich-fetch/lib/fetchQuality.mjs` — host-aware FP gates
- `scripts/enrich-fetch/lib/providers.mjs` — wire resolve + fail-fast + ctx diagnose
- `scripts/enrich-fetch/run-experiment.mjs` — resolve before providers
- `src/lib/enrichment/urlPolicy.ts`
- `src/lib/enrichment/fetchQuality.ts`
- `src/lib/enrichment/providers/hybrid.ts`
- `src/lib/enrichment/types.ts` — add `bot_blocked`
- `src/lib/enrichment/fetchService.ts` — pass url to quality gate

### Suggested master updates

- Findings report stats section updated
- Re-run judge on remaining 122 URLs when OpenRouter credits restored — **done** (`judge-…-19-17-43`)
- Next: **D10.6** X thread OR **D10.4 slice 2**
