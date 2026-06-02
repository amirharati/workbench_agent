# TASK-V2C-D10.1 — Fetch baseline experiment + failure buckets

**Status:** **done** (2026-05-28)  
**Parent:** [`TASK-V2C-D10-fetch-improvement.md`](TASK-V2C-D10-fetch-improvement.md) (umbrella) · Tracker **D-10.1**  
**Master findings:** [`D10-FETCH-FINDINGS-REPORT.md`](D10-FETCH-FINDINGS-REPORT.md)  
**Depends on:** Task 01 closed (`scripts/enrich-fetch/`)  
**Blocks:** D10.2, D10.3, D10.4

---

## Documentation rule

**Implementation session:** update **only this file** + experiment artifacts under `data/experiments/enrich-fetch/`. **No `src/` changes.**

---

## Goal

Run a **reproducible baseline** on a real bookmark sample; produce stats and a **host → failure bucket** table. Understand *why* pages fail before any provider or app changes.

---

## Scope

### In scope

- [x] `pick-urls.mjs` sample from user backup (`--from-backup`, `--max`, `--per-host`)
- [x] `npm run fetch-experiment` (recommend `--no-tab` first for fast map; optional second run with tab, no profile)
- [x] Save `data/experiments/enrich-fetch/<timestamp>/` — `results.jsonl`, `ANALYSIS.md`, `bodies/`
- [x] Summarize in task return:
  - % usable per provider
  - **none-usable** count
  - failure reasons per provider (from ANALYSIS)
  - hosts where **all** providers fail → `provider_gap` list
- [x] Manual bucket tags for top failures: `auth_required` | `bot_blocked` | `parse_empty` | `rate_limited` | `provider_gap` (table in task return)

### Out of scope

- LLM judge (→ D10.2)
- `--tab-profile` auth rerun (→ D10.3)
- `providers.mjs` / `fetchQuality` code changes (→ D10.4)
- Extension (→ D10.5)

---

## Commands (template)

```bash
node scripts/enrich-fetch/pick-urls.mjs /path/to/latest.json --max 40 --per-host 3 --seed 42 --out /tmp/fetch-urls-d10.1.txt
npm run fetch-experiment -- --no-tab --max 40 /tmp/fetch-urls-d10.1.txt
```

Record experiment path in task return.

---

## Acceptance

- [x] Experiment dir committed or path documented (data may stay local if large — path + command required)
- [x] Task return has host/bucket table + none-usable %
- [x] `provider_gap` hosts listed for D10.3/D10.4
- [x] No changes under `src/`

---

## Task return

### Experiment path

`data/experiments/enrich-fetch/2026-05-28T15-25-28/`  
(gitignored locally; reproducible via commands below)

### Commands

```bash
node scripts/enrich-fetch/pick-urls.mjs \
  ~/Documents/testing/latest.json \
  --max 40 --per-host 3 --seed 42 \
  --out /tmp/fetch-urls-d10.1.txt

npm run fetch-experiment -- --no-tab --max 40 /tmp/fetch-urls-d10.1.txt
```

- Backup: `~/Documents/testing/latest.json` (9,119 http(s) bookmarks)
- Providers: `local`, `jina`, `markdown-new` (tab excluded via `--no-tab`)
- Duration: ~5 min for 40 URLs

### Stats table

| Metric | local | jina | markdown-new |
|--------|-------|------|--------------|
| **Usable** | 19/40 (**47.5%**) | 26/40 (**65.0%**) | 0/40 (**0%**) |
| HTTP ok | 20/40 | 33/40 | 0/40 |
| Avg bytes (usable) | ~10.6k | ~23.4k | — |
| Avg ms | 1,126 | 6,342 | 60 |

**Agreement:** 0 all-usable · 29 split · **11 none-usable (27.5%)**

**Winner (largest snippet):** jina 21 URLs, local 8 URLs

**Failure reasons (from ANALYSIS):**

| Provider | Top reasons |
|----------|-------------|
| local | provider_error (11), parse_empty (5), network (4), login keywords (1) |
| jina | provider_error (7), empty body (3), auth/security block (3), too_short (1) |
| markdown-new | provider_error (40) — not configured / no API in this run |

**Thin-but-usable jina rescues** (edge cases for D10.2 judge): `cobusgreyling.me` (120b), `soul-herbs.com` (128b), `scribehow.com` (592b), `capacities.io` (4392b vs local 458b).

### Host → failure bucket (none-usable + notable partials)

| Host | Bucket | Notes |
|------|--------|-------|
| onedrive.live.com | `auth_required` | Excel viewer; login/session shell only |
| us2.make.com | `auth_required` | SaaS dashboard + Cloudflare “Performing security verification” |
| app.doubleword.ai | `auth_required` | App login wall / Cloudflare |
| groups.google.com | `auth_required` | Google Groups forum shell, no public content |
| classroom.udacity.com | `auth_required` | *Partial* — local blocked; jina OK (5314b) |
| exoscale.com | `bot_blocked` | *Partial* — local OK; jina hit security verification |
| linkedin.com | `auth_required` | *Partial* — local OK (2782b); jina provider_error |
| eng.jclawoffice.com | `provider_gap` | local network fail; jina provider_error (site likely dead/unreachable) |
| nuxified.org | `provider_gap` | local network fail; jina provider_error |
| libgen.rs | `bot_blocked` | local network fail; jina provider_error (blocked/shadow library) |
| jvz16.com | `provider_gap` | local network fail; dead streaming mirror |
| tensorflowbook.com | `provider_gap` | local provider_error; jina empty body (domain stale) |
| onradpad.com | `provider_gap` | all providers provider_error (JS-heavy rental search?) |
| pcmag.com | `bot_blocked` | all providers provider_error fast-fail (~56–71ms) — classic bot wall |

No `rate_limited` hits in this sample.

### Auth-candidate URLs (for D10.3)

Run `--tab-profile` rescue on these first:

1. `https://onedrive.live.com/view.aspx?...` (onedrive.live.com)
2. `https://us2.make.com/organization/2835281/dashboard`
3. `https://app.doubleword.ai/models`
4. `https://groups.google.com/forum`
5. `https://classroom.udacity.com/courses/ud513` (partial — baseline jina works; tab may improve local path)

### Provider-gap hosts (for D10.4)

All three headless providers failed:

- eng.jclawoffice.com
- nuxified.org
- libgen.rs
- jvz16.com
- tensorflowbook.com
- onradpad.com
- pcmag.com

Plus auth-walled hosts above if tab-profile also fails in D10.3.

### Suggested master updates

1. **Pin D10.1 corpus:** `2026-05-28T15-25-28` replaces May-21 runs for downstream eval (categorize/search can pass `--corpus` when wired).
2. **markdown-new:** 0% usable — confirm env/API before including in future baselines; extension hybrid does not use it today.
3. **Headless chain:** jina rescue rate ~10 URLs where local failed (matches Task 01 pattern); local-only wins on 3 URLs.
4. **Next parallel:** D10.2 judge on thin jina snippets + split URLs; D10.3 tab-profile on auth-candidate list.
5. **Optional second run:** `npm run fetch-experiment -- --max 40 urls.txt` (with tab, no profile) to measure JS-render lift — deferred; `--no-tab` baseline sufficient for bucket map.

---

## Large corpus (500 URL) — in progress

**Goal:** clearer stats + problem-platform coverage + X stratification.

**Corpus builder:** `scripts/enrich-fetch/pick-corpus.mjs`

```bash
node scripts/enrich-fetch/pick-corpus.mjs \
  ~/Documents/testing/latest.json \
  --total 500 --seed 42 \
  --out data/experiments/enrich-fetch/urls-corpus-500.txt

npm run fetch-experiment -- \
  --no-tab --with-syndication --max 500 \
  data/experiments/enrich-fetch/urls-corpus-500.txt
```

**Mix (500 URLs):** 251 random · 130 x.com (50 thread-hint, 40 link-in-text, 40 single) · 41 github · 26 t.co · 19 reddit · 15 youtube · 12 medium · 6 linkedin · seeds (HN, Bloomberg).

**X thread / quote / links (current CLI vs planned — see D10.6):**

| Need | Today | Planned fix |
|------|-------|-------------|
| Single tweet text | ✅ CDN + fxtwitter v1 | Keep as fallback |
| Author 🧵 (self-replies) | ❌ one status ID only | **D10.6:** FxTwitter `/2/thread/{id}` on **every** X URL |
| Quote tweet (QT) | ✅ quoted block in fetch | No change |
| Link in tweet → article | ⚠️ URL string only | **D10.6:** depth-1 link follow |
| Strangers’ replies | ❌ | Opt-in only (not default) |

**Design note (2026-05-28):** thin X bodies are usually missing author thread parts, not auth hiding. [`TASK-V2C-D10.6-recursive-follow.md`](TASK-V2C-D10.6-recursive-follow.md) has API spec + cases A–F.

Status URL today fetches **one tweet**; `x:thread-hint` corpus tags measure how much lift thread expand would give.

**Experiment path (running):** `data/experiments/enrich-fetch/2026-05-28T15-35-48/`

### 500-URL run results (complete)

**Path:** `data/experiments/enrich-fetch/2026-05-28T15-35-48/`  
**Providers:** local, jina, markdown-new, syndication (`--no-tab`)

| Provider | Usable | Rate |
|----------|--------|------|
| local | 312/500 | 62.4% |
| jina | 357/500 | 71.4% |
| markdown-new | 0/500 | 0% (not configured) |
| syndication | 105/130 X | 80.8% of X URLs |

**None-usable:** 96/500 (**19.2%**)

**Platform breakdown:**

| Host | n | None-usable | Notes |
|------|---|-------------|-------|
| reddit.com | 19 | **19/19** | All providers fail → fail-fast + tab-only |
| t.co | 26 | **21/26** | Need redirect unroll (D10.4) |
| x.com | 130 | 3/130 | Local 114, syndication 105; **40 syndication thin (<200b)** |
| medium.com | 12 | 1/12 | Local 11/12 — local wins |
| youtube.com | 15 | 0/15 | Jina 15/15 |
| github.com | 41 | 0/41 | Both 100% |
| linkedin.com | 6 | 0/6 | Local only |

**X thin bodies (thread-expand candidates):**

| Corpus tag | n | local thin (<280b) | avg local bytes |
|------------|---|-------------------|-----------------|
| x:link-in-text | 40 | **31** | 143 |
| x:thread-hint | 50 | **21** | 253 |
| x:single | 40 | 19 | 271 |

**Suggested next steps (priority):**

1. **D10.6** — X `/2/thread` expand (CLI A/B on X subset; ~52 thin + link tags)
2. **D10.4** — t.co unroll before fetch; Reddit fail-fast (skip jina)
3. **D10.3** — tab-profile on auth none-usable hosts (marketwatch, leetcode, …)
4. **D10.2** — judge thin X + jina YouTube boilerplate
5. Drop **markdown-new** from default experiment providers until configured
