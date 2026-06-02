# D10 Fetch Findings Report (master reference)

**Status:** living document — update after each D10 subtask run  
**Created:** 2026-05-28  
**Parent:** [`TASK-V2C-D10-fetch-improvement.md`](TASK-V2C-D10-fetch-improvement.md)  
**Sources:** D10.1 baseline + 500-URL corpus + D10.2 LLM judge

Use this doc for decision-making across D10.3–D10.6. Subtask briefs link here instead of duplicating stats.

---

## Executive summary

We ran a **500-URL mixed corpus** (random bookmarks + Reddit/Medium/X/GitHub/t.co quotas) through headless fetch providers, then **LLM-judged every URL** against bookmark intent.

| Metric | Mechanical (regex) | LLM judge |
|--------|-------------------|-----------|
| **Usable for enrichment (D10.2 baseline)** | 404/500 (**80.8%**) | **312/500 (62.4%)** |
| **After D10.4 slice 1 (full 500)** | 399/500 (**79.8%**) | **315/500 (63.0%)** |
| **After D10.6 X thread expand (full 500)** | 409/500 (**81.8%**) | **345/500 (69.0%)** |
| **Overstated by (baseline)** | — | **~18.4 points (92 URLs)** |
| **Overstated by (D10.6)** | — | **~12.8 points (64 URLs)** |

**Bottom line:** D10.6 X `/2/thread` expand lifted judge-ok **63.0% → 69.0% (+6 pp)**. `thin_content` **24 → 9**. X judge-ok **138 → 150**; syndication best provider **69** URLs (was 4).

**Recommended build order (evidence-backed):**

1. **D10.4 slice 1** ✅ — `fetchQuality` FP fixes, t.co unroll, Reddit **fail-fast**
2. **D10.6 core** ✅ — X `/2/thread` expand
3. **D10.3** ✅ — tab-profile eval (2/22 rescue — weak; real Chrome tab is product path)
4. **D10.5** 🟡 — extension tab session **partial** (open-tab inject before headless; no Inspector button / auto-open tab)
5. **D10.4 slice 2** — GitHub blobs, pick-best, Reddit alt probes, provider_gap (**optional**)
6. **D10.6b** — link-in-tweet → article follow (depth 1) (**optional**)

---

## Artifacts (reproducible)

| Artifact | Path |
|----------|------|
| **Corpus URL list** | `data/experiments/enrich-fetch/urls-corpus-500.txt` |
| **Fetch experiment** | `data/experiments/enrich-fetch/2026-05-28T15-35-48/` |
| **Mechanical analysis** | `…/ANALYSIS.md`, `…/results.jsonl`, `…/bodies/` |
| **LLM judge run (D10.2)** | `data/experiments/enrich-fetch/judge-2026-05-28T15-35-48-2026-05-28T17-49-15/` |
| **D10.4 slice 1 fetch** | `data/experiments/enrich-fetch/2026-05-28T18-21-08/` |
| **D10.4 slice 1 judge** | `data/experiments/enrich-fetch/judge-2026-05-28T18-21-08-2026-05-28T19-17-43/` (500/500) |
| **D10.6 fetch** | `data/experiments/enrich-fetch/2026-05-28T19-52-58/` |
| **D10.6 judge** | `data/experiments/enrich-fetch/judge-2026-05-28T19-52-58-2026-05-28T20-43-41/` (500/500) |
| **Judge results** | `…/judge-results.jsonl`, `…/JUDGE.md` |
| **40-URL pilot** | `data/experiments/enrich-fetch/2026-05-28T15-25-28/` |

### Replay commands

```bash
# Corpus
node scripts/enrich-fetch/pick-corpus.mjs ~/Documents/testing/latest.json \
  --total 500 --seed 42 \
  --out data/experiments/enrich-fetch/urls-corpus-500.txt

# Fetch (headless, with X syndication)
npm run fetch-experiment -- --no-tab --with-syndication --max 500 \
  data/experiments/enrich-fetch/urls-corpus-500.txt

# LLM judge (URL-level — default)
npm run fetch-judge -- --experiment data/experiments/enrich-fetch/2026-05-28T15-35-48
```

**Backup:** `~/Documents/testing/latest.json` (9,119 http(s) bookmarks)  
**Judge model:** `openai/gpt-4o-mini` via OpenRouter  
**Tab provider:** excluded (`--no-tab`) — tab lift not measured in this run

---

## Corpus composition (500 URLs)

| Segment | Count | Purpose |
|---------|-------|---------|
| Random (per-host 2) | 251 | General web mix |
| x.com — thread-hint | 50 | 🧵 / thread titles |
| x.com — link-in-text | 40 | Tweets with URLs |
| x.com — single | 40 | Plain status URLs |
| github.com | 40 | Repos, blobs, wikis |
| t.co | 25 | Short-link bookmarks |
| reddit.com | 19 | Known hard host |
| youtube.com | 15 | Video pages |
| medium.com | 12 | Paywall-prone |
| linkedin.com | 6 | Auth-heavy |
| Seeds (HN, Bloomberg) | 4 | Fixed problem URLs |

**Source kinds:** article 355 · x 130 · video 15

---

## Layer 1 — Mechanical fetch results

Providers: `local`, `jina`, `markdown-new`, `syndication` (X only)

| Provider | Usable | Rate | Notes |
|----------|--------|------|-------|
| local | 312/500 | 62.4% | Strong on GitHub, Medium, X CDN |
| jina | 357/500 | 71.4% | Wins raw count; many X login-wall blocks in failures |
| markdown-new | 0/500 | 0% | Not configured — exclude from future baselines |
| syndication | 105/130 X | 80.8% | Single-tweet only; avg ~78 bytes |

**None-usable (all core providers):** 96/500 (19.2%) mechanical

**Agreement:** 0 URLs where all core providers usable · 404 split · 96 none

**Mechanical winner (largest snippet):** jina 308 · local 79 · syndication 17

### Mechanical failure themes (by provider)

| Provider | Top failure modes |
|----------|-------------------|
| local | parse_empty (75), provider_error (48), network (34) |
| jina | X login-wall pattern (49), provider_error (39), Cloudflare (19+11) |
| syndication | too_short (20) — single tweet bytes |

---

## Layer 2 — LLM judge (URL-level)

**Method:** For each URL, judge infers **expected content** from URL, compares **all provider bodies**, returns `usableForEnrichment`, `whatWentWrong`, `bestProvider`, per-provider verdicts.

| Metric | Value |
|--------|-------|
| URLs judged | 500/500 |
| Judge usable | **312 (62.4%)** |
| Regex usable (any provider) | 404 (80.8%) |
| **False positives** | **92** (regex ok → judge rejects) |
| Judge not usable | 188 |

### D10.4 slice 1 — after headless fixes (2026-05-28)

Experiment `2026-05-28T18-21-08` · judge `judge-2026-05-28T18-21-08-2026-05-28T19-09-09`

| Metric | D10.2 baseline | D10.4 slice 1 | Δ |
|--------|----------------|---------------|---|
| Judge ok (500 URLs) | **312 (62.4%)** | **315 (63.0%)** | **+0.6 pp** |
| Regex any-usable | 404 (80.8%) | 399 (79.8%) | stricter gates |
| Judge false positives | 92 | **84** | **−8** |
| t.co judge ok | 12/58 | **33/58** | **+21** |
| reddit jina burn (19 URLs) | ~51 s | **0 ms** | fail-fast |

**Shipped:** `fetchQuality` host gates (GitHub nav, login chrome, YouTube short-chrome), t.co manual unroll, Reddit `bot_blocked` fail-fast, `bot_blocked` in `EnrichmentErrorCode`.

### Judge failure buckets

| Bucket | Count | % of 500 | Primary fix |
|--------|-------|----------|-------------|
| **ok** | 312 | 62.4% | — |
| **provider_gap** | 94 | 18.8% | D10.4 research + host rules |
| **auth_required** | 35 | 7.0% | D10.3 tab-profile → D10.5 extension |
| **thin_content** | 25 | 5.0% | **D10.6** X thread expand |
| **bot_blocked** | 24 | 4.8% | D10.4 fail-fast (Reddit) |
| **parse_empty** | 10 | 2.0% | D10.4 provider tuning |

### False positive breakdown (92 URLs)

Regex marked usable; judge rejected:

| Bucket | FP count | Typical cause |
|--------|----------|---------------|
| provider_gap | 40 | GitHub feature nav not file content; dead pages; t.co |
| thin_content | 25 | X thread hook only; GitHub thin nav |
| auth_required | 14 | Medium/LinkedIn/login chrome marked usable |
| parse_empty | 10 | YouTube jina chrome; empty local |
| bot_blocked | 3 | Partial bot wall still passed regex |

### Best provider (judge pick, when usable)

| Provider | Count | Share of judge-ok |
|----------|-------|-------------------|
| **local** | 239 | 76.6% |
| **jina** | 114 | 36.5% |
| **syndication** | 2 | 0.6% |

Judge prefers **local 2:1** when content is genuinely good — opposite of mechanical byte-count winner (jina). **Do not use early-exit jina-first for all articles.**

---

## Platform scorecard

Mechanical vs judge side-by-side:

| Platform | n | local mech | jina mech | judge ok | Verdict |
|----------|---|------------|-----------|----------|---------|
| **reddit.com** | 19 | 0% | 0% | **0%** | Fail-fast ✅ — skip jina burn; tab deferred |
| **t.co** | 26 | 0% | 19% | **57%** | Unroll ✅ — judge ok 12→33 |
| **medium.com** | 12 | 92% | 17% | **83%** | Local wins; 1 auth edge case |
| **x.com** | 130 | 88% | 78% | **87%** | Looks good mechanically but **11+ thin** on judge; thread expand needed |
| **youtube.com** | 15 | 0% | 100% | **80%** | Jina required; ~3 judge rejects (chrome/no transcript) |
| **github.com** | 41 | 100% | 100% | **71%** | **29% false positive** — blob/wiki URLs get nav not content |
| **linkedin.com** | 6 | 100% | 0% | **67%** | Local misleading; auth on some posts |

### Reddit (19/19 failed — all providers)

- Mechanical: 0/19 usable
- Judge: 0/19 usable, all `bot_blocked`
- **Action (D10.4):** Fail-fast immediately; **explore alternatives in scratch** (old.reddit, `.json`, tab probe) — see [`TASK-V2C-D10.4-headless-proven-fixes.md`](TASK-V2C-D10.4-headless-proven-fixes.md) Reddit matrix. If scratch finds no headless winner, **defer to tab** (D10.3/D10.5); do not fake success.

### t.co (26 URLs — redirect gap)

- Mechanical none-usable: 21/26
- Judge ok: 4/26
- **Action:** Resolve t.co → canonical URL before provider chain (D10.4)

### X / Twitter (130 URLs)

- Mechanical: 114 local, 101 jina, 105 syndication usable
- Judge ok: 113/130 (87%)
- Judge `thin_content`: 11+ (thread hooks, “good book”, partial threads)
- Examples: `@quant_arb` thread hooks, `@_nickanthony` “good thread” with no body
- **Action:** Always call FxTwitter `/2/thread/{id}` (D10.6) — see [`TASK-V2C-D10.6-recursive-follow.md`](TASK-V2C-D10.6-recursive-follow.md)

### GitHub (41 URLs — hidden false positives)

- Mechanical: 41/41 both local and jina “usable”
- Judge: **29/41** (71%) — **12 false positives**
- Pattern: blob URLs (`…/blob/master/…`), wikis, raw files → fetch returns **GitHub marketing nav**, not file/README content
- **Action:** D10.4 — raw.githubusercontent.com or GitHub API for blobs; README for repo root

### YouTube (15 URLs)

- Mechanical: jina 15/15, local 0/15
- Judge: 12/15 — 3 rejected (parse_empty / chrome only)
- **Action:** Keep jina for video; add boilerplate scoring on jina YouTube template

### Medium (12 URLs)

- Mechanical: local 11/12
- Judge: 10/12 — login interstitial on 1–2
- **Action:** Local-first chain ok; tab for auth failures

### LinkedIn (6 URLs)

- Mechanical: local 6/6 (misleading)
- Judge: 4/6 — auth walls on posts
- **Action:** D10.3 tab-profile or flag `auth_required` without treating local bytes as success

---

## Auth-required inventory (judge)

**35 URLs** — candidates for D10.3 tab-profile rescue (sample hosts):

| Host type | Examples |
|-----------|----------|
| SaaS / docs | `docs.google.com`, `ais.usvisa-info.com` |
| Social | `linkedin.com`, some `x.com` (jina login wall) |
| Medium edge | login interstitial URLs |
| Bloomberg | paywall / nav-only jina |

Run D10.3 filtered:

```bash
# Extract auth_required URLs from judge-results.jsonl
node -e "
const j=require('./data/experiments/enrich-fetch/judge-.../judge-results.jsonl'.replace('...','2026-05-28T15-35-48-2026-05-28T17-49-15'));
" 
```

(Full list in `judge-results.jsonl` where `failureBucket === 'auth_required'`.)

---

## Thin content / X thread (judge)

**25 URLs** flagged `thin_content` — primary D10.6 target.

Common patterns:

- Tweet is thread hook (“good book”, “new article”, “holy duo”) without payload
- Syndication/local return single status; jina returns partial or chrome
- `@quant_arb`, `@_nickanthony`, `@hamptonism` recur in corpus

**Fix:** FxTwitter `GET /2/thread/{statusId}` on every X status URL (free, 1000 req/min). Non-threads return `length === 1` — safe default.

---

## Provider gap hosts (judge)

**94 URLs** — all providers failed or returned non-content.

| Category | Examples |
|----------|----------|
| Dead / 404 | `scotch.io`, some `microsoft.com` |
| t.co unresolved | 21 mechanical failures |
| GitHub wrong page | blob URLs with nav only |
| Bloomberg | jina nav, local fail |
| Random long-tail | `fmovies.to`, `eng.jclawoffice.com`, etc. |

Use for D10.4 host denylist research — not all are fixable headless.

---

## Architecture implications

### Hybrid chain (extension + CLI)

Current mental model vs evidence:

| Source kind | Current chain | Evidence-based target |
|-------------|---------------|----------------------|
| **X** | local → syndication | **thread expand** → local CDN fallback |
| **Article** | local → jina | **pick-best** by quality score, not early exit |
| **Video** | jina | jina (keep) + YouTube boilerplate gate |
| **GitHub** | local → jina | raw/API path for blobs; README for roots |
| **Reddit** | local → jina | **fail-fast** `bot_blocked` |
| **t.co** | (broken) | **unroll first** |

### Two fetch modes (unchanged)

| Mode | When | D10 subtask |
|------|------|-------------|
| **A — Headless** | Default batch/CLI | D10.4, D10.6 |
| **B — User session tab** | auth_required, private | D10.3 lab → D10.5 product |

### Quality gates

Mechanical gates **must** add:

- Boilerplate ratio (cookie/consent/nav dominance)
- GitHub blob detection → alternate fetch path
- X minimum substance OR thread-expanded body
- Host-specific fail-fast (reddit.com, t.co without unroll)

LLM judge stays **dev-only** — use findings to tune regex/scores, not runtime LLM gating.

---

## Subtask checklist (traceability)

| Subtask | Status | Finding that motivates it |
|---------|--------|---------------------------|
| **D10.1** baseline | ✅ Done | 500-URL corpus + mechanical stats |
| **D10.2** LLM judge | ✅ Done | 62.4% true rate; 92 FP catalog |
| **D10.4 slice 1** | ✅ Done | fetchQuality FP fixes, t.co unroll, Reddit fail-fast |
| **D10.6 core** | ✅ Done | judge 69.0%; thin_content 24→9 |
| **D10.3** tab-profile | ✅ Eval done | 2/22 tab rescue — Playwright ≠ Chrome; defer further CLI tab work |
| **D10.5** extension tab | ✅ Done | Tab-first, ephemeral tab, Inspector **Fetch in browser** |
| **D10.4 slice 2** | Later (optional) | GitHub blobs, pick-best, Reddit scratch alts, provider_gap |
| **D10.6b** link follow | ✅ Done | `xLinkFollow` in thread fetch |
| **D-45** local folder library | ⏸ Tracked | Bulk folder scan → `file://` items — [`TASK-V2C-D45-local-folder-library.md`](TASK-V2C-D45-local-folder-library.md) |

---

## Product session work (2026-05-28 — not in CLI judge corpus)

Shipped in extension alongside D10.5; improves digest for **all** fetch modes (headless + tab):

| Area | What | Key paths |
|------|------|-----------|
| **Listing / portal pages** | Multi-item collection extract before Readability (subreddit feeds, forums, hubs) | `listingExtract.ts`, `htmlExtract.ts`, `tab-page-extract.js`, CLI `listingExtract.mjs` |
| **Tab session (Mode B)** | Inject on matching open tab before headless; retry after fail; side panel + digest parity | `tabSessionExtract.ts`, `fetchService.ts`, `tab-page-extract.js` |
| **URL fidelity** | Dedup normalization separate from stored URL; Gmail hash from live tab | `db.ts`, `tabUrlCapture.ts` |
| **Title upgrade** | Replace weak titles after digest | `eligibility.ts`, `fetchService.ts` |
| **Platform tags** | Auto `x`, `reddit`, `youtube`, etc. | `platformTags.ts` |
| **Failure labels** | `failureStage` + `failureCategory` on failed enrichments (label only, no auto-delete) | `failureLabels.ts`, `fetchService.ts` |

**Not re-measured:** listing extract and tab-session lift on the 500-URL judge corpus.

---

## Local files → D-45 (tracked, not D10)

| Shipped in D10 | Deferred to **D-45** |
|----------------|----------------------|
| Single `file://` bookmark from open tab | Recursive **folder scan** (PDFs/papers tree) |
| Tab extract (title/filename; weak PDF body) | **pdf.js** or full PDF text pipeline |
| `file:///*/*` manifest + user file-URL permission | Directory picker + preview map + batch import |
| Platform tag `local-file` | Folder → collection mapping; path repair on re-scan |

**Brief:** [`TASK-V2C-D45-local-folder-library.md`](TASK-V2C-D45-local-folder-library.md) · Tracker **D-45**

---

## Open questions / next measurements

- [x] **Extension tab session** — shipped (D10.5); user-validated Reddit/Gmail/local file
- [ ] **Tab provider run** on same 500 URLs — measure JS-render lift (Medium, GitHub, SPAs) in **real Chrome**
- [x] **D10.6 A/B** — full 500 corpus; thin_content **24 → 9**
- [x] **D10.3 rescue rate** — 2/22 on Playwright profile; Reddit blocked by automation, not login
- [ ] **Pick-best chain** simulation on existing bodies (no re-fetch) — D10.4b
- [ ] Re-judge after D10.4b + D10.6b — stretch target **judge ok ≥ 75%** headless-only

---

## Related docs

| Doc | Role |
|-----|------|
| [`TASK-V2C-D10-fetch-improvement.md`](TASK-V2C-D10-fetch-improvement.md) | Umbrella architecture |
| [`TASK-V2C-D10.1-baseline-experiment.md`](TASK-V2C-D10.1-baseline-experiment.md) | D10.1 task return |
| [`TASK-V2C-D10.2-fetch-judge.md`](TASK-V2C-D10.2-fetch-judge.md) | D10.2 task return |
| [`TASK-V2C-D10.6-recursive-follow.md`](TASK-V2C-D10.6-recursive-follow.md) | X thread API spec |
| [`V2-DEFERRED-TRACKER.md`](V2-DEFERRED-TRACKER.md) | Tracker D-10, **D-45** |
| [`TASK-V2C-D45-local-folder-library.md`](TASK-V2C-D45-local-folder-library.md) | Local folder library (post-D10) |

---

*Last updated: 2026-05-28 — D10 closed; **D-45** tracked for folder library.*
