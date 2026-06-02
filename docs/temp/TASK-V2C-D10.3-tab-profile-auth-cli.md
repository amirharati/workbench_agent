# TASK-V2C-D10.3 — Tab-profile auth eval (CLI)

**Status:** **eval done** (2026-05-28) — tab rescue weak on Reddit/Medium; LinkedIn profile works  
**Parent:** [`TASK-V2C-D10-fetch-improvement.md`](TASK-V2C-D10-fetch-improvement.md) · **D-10.3**  
**Depends on:** D10.1 **auth-candidate URL list**  
**Blocks:** D10.5 (proves Mode B before extension)

---

## Documentation rule

Update **only this file** + `scripts/enrich-fetch/README.md` (profile workflow). **No `src/`.** Profile dir **not** committed (gitignore).

---

## Goal

Prove **Mode B in CLI**: logged-in Playwright profile rescues paywall/auth URLs that headless cannot. Measure **tab rescue rate**.

---

## Scope

### In scope

- [x] Document `--tab-profile` + `--tab-headed` login workflow in README
- [x] Create local profile `./.fetch-test-browser` (Medium, LinkedIn, Reddit logged in)
- [x] Rerun auth-candidate URLs with `--tab-profile` + `--providers tab` (22-URL subset)
- [x] Compare: headless none-usable → tab-profile usable count
- [x] Note: Playwright profile ≠ Chrome extension profile (lab only)

### Out of scope

- Extension tab provider (→ D10.5)
- New providers for `provider_gap` non-auth hosts (→ D10.4)
- Committing profile directory

---

## Acceptance

- [x] Task return: **tab rescue rate** on auth subset (N/M URLs)
- [x] Per-host notes (which sites rescued, which still fail)
- [x] Repro commands documented
- [x] No `src/` changes (CLI-only: `tabBrowser.mjs` uses `channel: 'chrome'` for persistent profile)

---

## Task return

- **Profile dir name (not contents):** `./.fetch-test-browser` (gitignored)
- **Sites logged in:** Medium, LinkedIn, Reddit (user session; Chrome channel for login + fetch)
- **Experiment:** `data/experiments/enrich-fetch/d10.3-tab-rescue-2026-05-28/` — 22 URLs from D10.6 judge auth/bot bucket (19 Reddit, 1 Medium, 2 LinkedIn)

### Rescue rate

| Metric | Result |
|--------|--------|
| Tab mechanical **usable** | **2/22** (9%) |
| Headless-fail → tab-usable | **0/20** (Reddit 19 + LinkedIn post 1; Medium already headless-ok) |
| True content rescue (snippet >500, not chrome) | **0/20** |

### Per-host

| Host | Headless (D10.6) | Tab + profile | Notes |
|------|------------------|---------------|-------|
| **Reddit** (19) | `bot_blocked` fail-fast | **0/19** — “You've been blocked by network security” (automation/IP, not login wall) |
| **Medium** (1) | **local usable** (member-only teaser) | **fail** — Cloudflare “Performing security verification” in **headless** Chrome profile |
| **LinkedIn** homepage | local usable (logged-out landing) | **usable** — logged-in feed (~8.7k snippet); quality upgrade, not auth rescue |
| **LinkedIn** post | local auth wall; **jina ok** | “usable” but **246b ad-dismiss modal** — false positive, not real rescue |

### Repro

```bash
# Login once (headed Chrome + persistent profile)
npm run fetch-test -- --tab-profile ./.fetch-test-browser --tab-headed "https://www.reddit.com/"

# Tab-only rescue eval
npm run fetch-experiment -- data/experiments/enrich-fetch/urls-d103-medium-linkedin-reddit.txt \
  --providers tab --tab-profile ./.fetch-test-browser --max 22 \
  --out data/experiments/enrich-fetch/d10.3-tab-rescue-2026-05-28
```

### Still-failing auth URLs

All 19 Reddit URLs in the subset; Medium flutter article (Cloudflare in headless tab); LinkedIn post (modal junk even when “usable”).

### Conclusions

1. **Logged-in profile helps LinkedIn feed** but does not fix LinkedIn post extraction (Readability hits UI chrome).
2. **Reddit tab rescue blocked** at network-security layer — login cookies insufficient; likely needs non-headless human browser, old.reddit, or Reddit JSON API — defer to D10.4/D10.5.
3. **Medium tab worse than headless local** for the test URL when tab runs headless (Cloudflare bot check). Try `--tab-headed` locally for Medium-only URLs.
4. **Mode B validated narrowly** — profile plumbing works; **rescue rate on auth-candidate corpus is ~0%** for URLs headless cannot already get via jina/local.

### Suggested master updates

- D10-FETCH-FINDINGS-REPORT: add D10.3 row — tab profile 2/22 mechanical, 0/20 true rescue on auth subset
- V2-DEFERRED-TRACKER: Reddit tab = blocked by network security even with session; consider old.reddit or API provider
- D10.5: extension tab may fare better (real Chrome, non-headless) — CLI lab understates rescue for Medium/Reddit
