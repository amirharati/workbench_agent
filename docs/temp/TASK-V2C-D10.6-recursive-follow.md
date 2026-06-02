# TASK-V2C-D10.6 — X thread expand + link follow fetch

**Status:** **core done** (2026-05-28) — `/2/thread` + **case C link follow** shipped (product + CLI); quote threads in thread API  
**Parent:** [`TASK-V2C-D10-fetch-improvement.md`](TASK-V2C-D10-fetch-improvement.md) · **D-10.6**  
**Depends on:** D10.1 baseline (X thin-body signal); D10.4 headless chain stable before extension port  
**Master findings:** [`D10-FETCH-FINDINGS-REPORT.md`](D10-FETCH-FINDINGS-REPORT.md) (25 thin_content URLs → primary motivation)  
**Informed by:** D10.1 corpus + product discussion on X threads (2026-05-28)

---

## Problem

Today every X bookmark URL fetches **one status ID** only:

| Provider | Endpoint | Returns |
|----------|----------|---------|
| `local` | `cdn.syndication.twimg.com/tweet-result?id=` | 1 tweet + optional quoted tweet |
| `syndication` (v1) | `api.fxtwitter.com/:user/status/:id` | 1 tweet + optional quote |

**User-visible failure:** bookmark saves tweet 1 of a 🧵 (“good book…”) but enrichment never sees tweets 2–N with the actual content. This is **not** mainly an auth problem — we never call a thread API.

**Library scale:** ~5.2k X status URLs in backup; ~102 titles with explicit thread hints (🧵 / “thread” / “(n)”).

---

## Content types (separate cases)

| Case | Example | Fix | Default? |
|------|---------|-----|----------|
| **A — Author self-reply 🧵** | Same user posts 1/n, 2/n, 3/n | FxTwitter `/2/thread/{id}` | **Yes — every X status** |
| **B — Quote tweet (QT)** | Comment + embedded tweet | Already in single-tweet fetch (`quote` / `quoted_tweet`) | ✅ done |
| **C — Link in tweet text** | Tweet points to Medium/article | **Follow-fetch** child URL (depth 1) | Yes when http(s) in body |
| **D — Mid-thread bookmark** | User saved tweet 5 of 10 | Walk **up** via `replying_to_status` to root, then `/2/thread/{rootId}` | v1.1 |
| **E — Other people’s replies** | “Great thread!” from strangers | `/2/conversation/{id}` + pagination, or tab scrape | **No** — opt-in only |
| **F — Private / deleted** | Protected account | Tab session (D10.5) or tombstone | Fallback |

**Do not conflate:** author 🧵 (case A) ≠ public reply tree (case E). Bookmarks almost always want A (+ B, C); E is noise for enrichment.

---

## Recommended API (free, headless)

**FxTwitter / FxEmbed v2** — same family as existing `syndication` provider; no API key.

| Endpoint | Purpose |
|----------|---------|
| `GET https://api.fxtwitter.com/2/thread/{statusId}` | **Primary** — author self-reply chain from any status in chain |
| `GET https://api.fxtwitter.com/2/status/{statusId}` | Metadata (`replying_to_status`, `replying_to`) for root walk |
| `GET https://api.fxtwitter.com/2/conversation/{statusId}` | Public reply tree — **not** default; paginated, noisy |

**Docs:** [FxEmbed API overview](https://docs.fxembed.com/api/introduction/)  
**Rate limit:** 1000 req/min per IP (self-host FxEmbed if needed).

**Verified (2026-05-28):**

- Single tweet → `thread.length === 1` (safe to call always)
- Author 🧵 → `thread.length > 1`, same `@author` on each part
- `/2/conversation` on a tweet with `replies: 2` did **not** return stranger replies in `thread[]` — only focal + limited author continuation

**Cost:** ~1 extra request per X URL vs today; can **replace** redundant CDN + v1 syndication double-fetch for X.

---

## Design decision: treat every X status as a thread

**Default rule:** for all `sourceKind === 'x'` status URLs:

1. Call `/2/thread/{statusId}` (after optional root walk in v1.1).
2. Merge `thread[]` into one markdown body with separators, e.g. `---\n` between parts.
3. Preserve quote blocks from individual tweets if present.
4. If `thread.length === 1`, body equals today’s single-tweet result — no regression.

**Skip heuristics** (🧵 in title, thin body) for v1 — always expand; detection only for case D/E/F fallbacks.

**Merge format (sketch):**

```markdown
# @author — thread (3 parts)

## 1/3
First tweet text…

---

## 2/3
Second tweet text…
```

Store `fetchSourceId: 'syndication-thread'` (or extend `syndication` with `expanded: true`).

---

## Link follow (case C) — same task, second hook

After X body merged (or any fetch):

1. Extract http(s) URLs from markdown (exclude t.co pic/media-only if no unroll).
2. Unroll t.co → canonical URL (existing X_HOSTS / redirect logic).
3. Fetch up to **N** child URLs (e.g. 3) with normal article hybrid chain.
4. Append with separator: `---\n## Linked: {host}\n{child markdown}`.
5. Max depth **1**; dedupe; no crawl.

**Triggers:**

| When | Hook |
|------|------|
| **Preemptive** | `sourceKind === 'x'` and body contains external http(s) |
| **Reactive** | Thin body after thread expand, or AI `needsExpansion` (later) |

---

## Implementation plan

### Phase 1 — CLI throwaway (measure lift on D10.1 corpus)

- [x] `fetchXThreadFromFx(statusId)` in `scripts/enrich-fetch/lib/xThread.mjs`
- [x] Extend `fetchSyndication` calling `/2/thread/{id}`; `fetchSourceId: syndication-thread` when >1 part
- [ ] `fetch-test --thread-expand URL` for spot checks (spot-tested via fetchSyndication)
- [ ] `fetch-experiment` full 500 corpus — **done** `2026-05-28T19-52-58`
- [x] Compare vs D10.4: judge ok 315→345, thin_content 24→9, X ok 138→150

### Phase 2 — Extension port

- [x] Mirror in `src/lib/enrichment/providers/xThread.ts` + `syndication.ts`
- [x] Update `hybridProvider` X chain: **syndication first** → fallback local CDN
- [x] Link follow (case C) — `xLinkFollow.ts` / `xLinkFollow.mjs` via `appendXLinkFollowBodies` in thread fetch
- [ ] Persist merged body in enrichment cache; bump hash when thread parts added

### Phase 3 — Edge cases

- [ ] Root walk: if `replying_to_status` set and same author, recurse up before `/2/thread`
- [ ] Flag `needsPublicReplies` — off by default; conversation API or tab (case E)
- [ ] Tab fallback when API returns tombstone / private (case F)

---

## Files

| Area | Paths |
|------|--------|
| CLI (new) | `scripts/enrich-fetch/lib/xThread.mjs` |
| CLI providers | `scripts/enrich-fetch/lib/providers.mjs` |
| Extension | `src/lib/enrichment/providers/syndication.ts`, `hybrid.ts` |
| Orchestrator | `src/lib/enrichment/fetchService.ts` |
| Parse / merge | `src/lib/enrichment/parse.ts`, `itemText.ts` |

---

## Acceptance

- [ ] Every X status URL returns merged thread when author posted 2+ self-replies
- [ ] Single tweets unchanged (`thread.length === 1`)
- [ ] Quote tweets still include quoted block
- [ ] CLI A/B on ≥50 `x:thread-hint` URLs shows measurable byte/snippet lift
- [ ] No auth required for case A; rate limit respected (backoff on 429)
- [ ] Link follow (case C) optional flag; max 3 children, depth 1

---

## Out of scope

- Public reply trees by default (case E)
- Depth > 1 link crawl
- Official paid X API
- Full conversation pagination unless explicitly flagged

---

## Task return

- **A/B experiment path:** `data/experiments/enrich-fetch/2026-05-28T19-52-58/` · judge `judge-2026-05-28T19-52-58-2026-05-28T20-43-41/`
- **Lift (500 URL corpus):**

| Metric | D10.2 baseline | D10.4 | D10.6 | Δ (D10.4→D10.6) |
|--------|----------------|-------|-------|-----------------|
| Judge ok | 312 (62.4%) | 315 (63.0%) | **345 (69.0%)** | **+6.0 pp** |
| thin_content | 25 | 24 | **9** | **−15** |
| X judge ok | 113 | 138 | **150** | **+12** |
| Judge FP | 92 | 84 | **64** | −20 |
| Syndication best | 4 | 4 | **69** | +65 |

- **Root-walk needed:** not implemented (v1.1); mid-thread bookmarks still get full author chain from any status ID via `/2/thread`
- **Link follow (case C):** not implemented — see **D10.6b** in umbrella wrap-up
- **Files:** `xThread.mjs`, `xThread.ts`, `syndication.ts`, `providers.mjs`, `hybrid.ts`
- **Suggested master updates:** findings report ✅
