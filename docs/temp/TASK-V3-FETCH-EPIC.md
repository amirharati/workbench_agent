# TASK-V3-FETCH-EPIC — Fetch layer honesty

> **You receive:** **this file only.**  
> **Read-only context:** `TASK-V3-dogfood-waves-master.md` · `TASK-V3-dogfood-fix-list.md` § Fetch epic  
> **You may edit:** **this file only** — especially § Epic return at the end.  
> **Do not:** git commit; edit master plan, fix-list, or other specs; create child task spec files.

---

## Epic goal

The pipeline must not report **Enriched** when the fetched body does not match what the user saved. Ship the **remaining** fetch epic work in one worker session if possible; **report back here** when done (or `partial` with clear blockers). Master reviews diff and commits.

| Issue | Topic | Status |
|-------|--------|--------|
| **#31** | Tab-session vs dashboard | **Done** `c361f61` |
| **#35** | HTTP redirect / stale URL | **Done (FETCH-2)** — policy v2: capture → AI adjudicate → escalate (see § Epic return) |
| **#26** | X thread / quote / media | **Done (FETCH-3)** — Gates 1–4 closed 2026-06-13 (see § Epic return) |

**Out of epic:** discover (#13…), extension lifecycle (#19 — see § Unrelated below), auto-updating bookmark URLs, pre-save digest (#6).

---

## Exit criteria

| # | Done when |
|---|-----------|
| E1 | #35: redirect detected → annotated + AI verdict + attention bucket when mismatch (**not** silent Enriched on wrong body) |
| E2 | #26: repro matrix in Epic return + P0 X cases fixed |
| E3 | `npm run build` + new unit tests green |
| E4 | Epic manual matrix (§ below) passed or gaps documented |
| E5 | Redirect + summary AI calls auditable in `pipeline_debug.aiCalls` (raw `responseText`, `taskType: redirect_verdict`) |

---

## Shared code map

| Area | Files |
|------|--------|
| Orchestration | `fetchService.ts` — `resolveItemFetch`, `enrichOne` |
| Providers | `hybrid.ts`, `local.ts`, `jina.ts`, `syndication.ts` |
| URL policy | `urlPolicy.ts` — `resolveFetchUrl`, short links |
| Tab session | `tabSessionExtract.ts`, `tabSessionMatch.ts` |
| Quality | `fetchQuality.ts`, `failureLabels.ts`, `errorMessages.ts` |
| UI | `pipelineBadge.ts`, `pipelineHubQueries.ts` |
| X | `xThread.ts`, `xLinkFollow.ts`, `parse.ts` |

**Prefer wiring at `enrichOne` / `resolveItemFetch`** so Hub, bulk, and side panel inherit fixes.

---

## Execution order (within this epic)

```
#31  ✓
  ↓
FETCH-2  #35  redirect honesty   ✓
  ↓
FETCH-3  #26  X/Twitter P0       ✓
  ↓
Close-out gates 1–4                ✓ (2026-06-13)
```

If time runs out: ship FETCH-2 complete, FETCH-3 partial with repro matrix + policy — mark Epic return `partial`.

---

## Close-out plan (agreed 2026-06-11)

> **Principle:** User runs tests first; we close each item when verified. **Side-panel fetch** and **bulk import** are **last** — not before per-item matrix is green.

### Gate 1 — Per-item verification (user tests, then mark closed)

**Status: done (2026-06-13)** — dogfood `~/Documents/test4/`; B12 Inspector Re-fetch verified (philfung + tom_doerr, fresh `aiCalls`).

Re-fetch or re-import each row; record pass/gap in § Epic return repro matrix. Close the bug row when verified on **current build**.

| ID | Verify | Close when |
|----|--------|------------|
| B12 | Inspector Re-fetch on enriched item → fresh summary, `fetchSourceId`, `pipeline_debug.aiCalls` | pass logged |
| B7 | [hamptonism/1893590972627407115](https://x.com/hamptonism/status/1893590972627407115) — vision on cover, no invented filler | pass logged |
| B9 | [PtrPomorski/1859876976011641276](https://x.com/PtrPomorski/status/1859876976011641276) — no `%PDF` in body | pass logged |
| B10 | [marcb_xyz/1875536122652324094](https://x.com/marcb_xyz/status/1875536122652324094) — no 404 blob for 51x.ai | pass logged |
| B1 | [EastlondonDev/1892636611936190701](https://x.com/EastlondonDev/status/1892636611936190701) — no self-quote thread blob in `quoted_text` | pass logged |
| B5 | deleted tweet (GenReasoning) → `tweet_unavailable` | pass logged |
| B5b | failed fetch + import notes → no topic classify | pass logged |
| B3 | philfung (track A), video-only (track B) | pass logged |
| B4 | Jafar 12-link thread — `references[]` complete | pass logged |
| B11 | tom_doerr media t.co stripped from import title | pass logged |
| B6 | tom_doerr B6 — **Hub** re-digest → syndication + GitHub | pass logged |

**10-row smoke matrix** (§ below): run as batch checklist; all rows pass or documented gap.

**Gate 1 exit:** Every FETCH-3 bug row either **done** or **documented gap** (no silent “coded but untested”).

### Gate 2 — Sweep: all items closed

**Status: done (2026-06-13)** — § Bug backlog closed; § Epic return filled.

### Gate 3 — Side-panel fetch (**done 2026-06-13**)

> **Shipped:** `preferTabSessionForDigest` — X status URLs skip tab on side-panel save; `enrichOne` no longer auto-resolves host tab for X unless explicit `preferTabSession: true`. **Bonus:** separate **Add external link** collapsible section (`SidePanelExternalSection.tsx`) — main form is current-tab only (read-only URL); pasted links digest in isolated session cards.

| # | Action | Result |
|---|--------|--------|
| SP-1 | [philfung/1892291566737260629](https://x.com/philfung/status/1892291566737260629) — side panel save | **pass** — `syndication-expanded` |
| SP-2 | [tom_doerr/1892676953456382249](https://x.com/tom_doerr/status/1892676953456382249) — side panel save | **pass** — GitHub in body/refs |
| SP-3 | [HangukQuant/1889039264891224402](https://x.com/HangukQuant/status/1889039264891224402) — image-only | **pass** — vision / syndication path |
| SP-4 | Login-walled article while signed in (Medium, Seeking Alpha, etc.) | **pass** — `tab-session` + real content |
| SP-5 | Save while another tab focused | **pass** — correct tab URL saved |
| EXT | External link paste from article (separate section) | **pass** — `source: manual`, digest isolated from tab |
| TRASH | Delete bookmark → re-save same tab | **pass** — `addItemWithMerge` clears `deletedAt` |

**Gate 3 exit:** **B13** = **done** (side panel + Hub).

### Gate 4 — Fresh bulk import + final log analysis (**done 2026-06-13**)

| Step | Owner | Result |
|------|--------|--------|
| 4a | User | **Fresh** import → `~/Documents/test5/` — **5,646** items committed |
| 4b | User + worker | DB analysis on **3,043** enriched rows (import pipeline still running wave 27; sample exceeds ≥2k gate) |
| 4c | Worker | § Epic return filled — **Status: done** |
| 4d | Master | Review diff; commit |

**Gate 4 metrics (`test5/workbench.sqlite`, snapshot 2026-06-13):**

| Metric | Value |
|--------|------:|
| Items | 5,646 |
| Enriched (processed) | 3,043 |
| ok / failed | 2,957 / 86 (**97.2%** success) |
| Summaries present | 2,955 / 2,957 |
| `pending_fetch_review` | 76 (**2.6%** of ok — redirect attention) |
| X ok `syndication-expanded` | 2,588 |
| X ok `tab-session` | 8 (**0.31%** of ok X) |
| X failed | 32 (mostly `auth_required`) |
| YouTube ok via `jina` | 5; 0 failures |
| `%PDF` in ok snippets | **0** (B9) |
| `404` in ok snippets | 3 (**0.1%**, B10 edge) |
| `@unknown` in ok snippets | 9 (**0.3%**, legacy tab chrome) |
| Cache PDF leak (800-file sample) | **0** |

**Failure codes (86):** `auth_required` 29 · `network` 25 · `parse_empty` 21 · `timeout` 9 · `provider_error` 2 — expected for real bookmark dump.

**Gate 4 exit:** No P0 fetch regressions at scale. Epic **closed**.

---

# FETCH-2 — Redirect / stale URL (#35)

> **Shipped policy (v2, 2026-06):** Prefer **escalate over remove**. Mechanical redirect hints annotate only; a dedicated **redirect AI verdict** runs on suspicious/resource-mismatch redirects; main summary uses a **different prompt** when verdict is present (`prior_verdict`). **Login/auth** is separate from stale-URL mismatch. Attention leaf: `url-redirect-mismatch` (strict: `pendingFetchReview` + `url_redirect` + fetch ok). Original spec **hard-fail on material redirect** was replaced after dogfood — wrong-topic removal is worse than false-positive attention.

## Problem

Saved URL **A** redirects to **B**. Fetch returns markdown that looks OK but describes the **wrong page**. Classify may catch it later — fetch layer should fail honestly.

### Primary repro

`https://seekingalpha.com/article/3963244-magic-formula-depth-look-mechanics-potential-improvement`

Compare: saved URL vs final URL, body, hub badge, `fetchSourceId`, pipeline debug JSON.

### Secondary repros

| Case | Expected |
|------|----------|
| http→https, www strip, trailing slash | **Benign** — continue |
| Cross-host redirect | **Material** — fail |
| `/article/x` → `/` or `/login` | **Material** |
| Tab-session: bookmark old URL, tab on final | Compare `location.href` |

## Policy v2 (shipped)

| Stage | Rule | Outcome |
|-------|------|---------|
| **Probe** | `fetchRedirect.ts` — `none` / `benign` / `suspicious`, `resourceMismatch` | Record `requestedUrl`, `finalUrl`, hops in providers + debug |
| **Pre-summary AI** | `runRedirectAiVerdict` when suspicious or resourceMismatch | Separate HTTP call; `taskType: redirect_verdict`; logged in `pipeline_debug.aiCalls` |
| **Summary AI** | `prior_verdict` / `redirect_fields` / `benign_hint` prompt modes | `pageMatchesBookmark`, `redirectNote` on extract JSON |
| **Review flag** | `shouldFlagRedirectReview` — only on explicit AI mismatch | `pendingFetchReview` + `url_redirect`; login → annotate only |
| **Classify** | `detectUrlRedirectMismatchAttention` → `seed_url-redirect-mismatch` | Does **not** block topic classify (`classifyQueueBlocker`) |
| URL update | — | **Do not** auto-change `items.url` |

## Policy v1 (superseded — reference only)

| Class | Rule | Outcome |
|-------|------|---------|
| **None** | Normalized URLs equal | Proceed |
| **Benign** | Same host + same resource path (normalized) | Proceed; record `finalUrl` in debug |
| **Material** | Cross-host, different resource path, or landing/login | ~~**Fail fetch**~~ → **v2: AI adjudicate + attention bucket** |
| URL update | — | **Do not** auto-change `items.url` |

**Errors:** add `url_redirect` to `EnrichmentErrorCode` (or `provider_error` + fixed detail); `lastErrorDetail`: `Saved URL redirected to <finalUrl>`; badge **Fetch · redirect**; trash suggestion via existing fetch-failed path.

## Root cause today

- `local`: `redirect: 'follow'` but `res.url` discarded
- `jina`: opaque redirect via `r.jina.ai/{url}`
- `hybrid`: `resolveFetchUrl` only short links + X canonicalize
- `tab-session`: no compare bookmark vs live href
- `enrichOne`: body-quality only — wrong page with plausible text slips through

## Implementation (shipped)

| # | Area | Files |
|---|------|--------|
| 1 | Redirect probe + classify | `fetchRedirect.ts`, `fetchRedirect.test.ts`, CLI mirror `scripts/enrich-fetch/lib/fetchRedirect.mjs` |
| 2 | Pre-summary redirect judge | `redirectAiVerdict.ts`, CLI mirror `redirectAiVerdict.mjs` |
| 3 | Orchestration + review flag | `fetchService.ts`, `prompts.ts`, `aiExtract.ts` |
| 4 | AI call audit (proof) | `ai/callAudit.ts`, `ai/client.ts` — `pipeline_debug.aiCalls[]`, enrichment-cache meta |
| 5 | Link-quality + classify | `linkQuality.ts`, `classifyTopicExtract.ts`, `classifyQueueBlocker.ts`, seed `url-redirect-mismatch` |
| 6 | Pipeline debug export | `pipelineDebug.ts`, `pipelineRunAnalysis.ts`, `analyze-app-run.mjs` |
| 7 | Batch experiment CLI | `run-batch-pipeline.mts`, `npm run fetch-batch-pipeline` |
| 8 | Extension parity | `hybrid.ts`, `local.ts`, `tabSessionExtract.ts` — `pageUrl` / redirect context |

### Dogfood validation (403 URLs, post-cleanup run)

| Metric | Result |
|--------|--------|
| `redirect_verdict` AI calls logged | 90 / 93 eligible |
| `verdict ok` without `aiCalls` | 0 |
| `pendingFetchReview` | 73 (70 with redirect HTTP proof) |
| Login verdicts → no review | 7 |

## Implementation (original spec — partial mapping)

### 1 — `fetchRedirect.ts` + tests ✓

**New:** `src/lib/enrichment/fetchRedirect.ts`, `fetchRedirect.test.ts`

```ts
export type RedirectClass = 'none' | 'benign' | 'suspicious'; // v2: not 'material' hard-fail
export function classifyRedirect(...): RedirectClass;
export function buildRedirectContext(...): RedirectContext;
export function shouldRunRedirectAiVerdict(ctx): boolean;
export function shouldFlagRedirectReview(ctx, ai): RedirectReviewDecision;
```

Unit tests: benign (www, https, slash); suspicious (SA path change, cross-host, login path). Pure only — no Chrome/DB in tests.

### 2 — Providers record `finalUrl` ✓

Extend `FetchProviderResult`: `requestedUrl?`, `finalUrl?`, `redirectClass?`.

- **local:** `finalUrl: res.url` after fetch
- **hybrid:** probe before chain when appropriate
- **tab-session:** final from live tab href
- **jina:** pre-probe saved URL; fail early on material redirect if probe works

### 3 — Gate in `enrichOne` ✓ (v2 behavior)

Before / during AI: suspicious redirect → **redirect AI verdict** → summary with aligned prompt → optional `pendingFetchReview` + `lastErrorDetail` annotate. **Does not** hard-fail fetch on material redirect.

### 4 — Labels ✓

`types.ts` (`url_redirect`), `errorMessages.ts`, `failureLabels.ts`, link-quality leaf `url-redirect-mismatch`, taxonomy UI shows all link-quality leaves.

### FETCH-2 manual tests

| # | Pass when | Status |
|---|-----------|--------|
| 1 | Seeking Alpha repro → attention / mismatch label (not silent OK) | dogfood ✓ |
| 2 | Public article www/https → still OK | dogfood ✓ |
| 3 | Inspector / debug shows redirect + `aiCalls` | ✓ |
| 4 | Trash suggestions include fetch-failed (not redirect attention) | partial — redirect items kept for review |

---

# FETCH-3 — X / Twitter fetch (#26)

## Problem

X bookmarks sometimes enrich **quoted video thumbnail**, **embedded media URL**, or **external link** instead of main tweet / thread text.

## Deliverables (required)

1. **Repro matrix** in Epic return (URL type × before × after × expected)
2. **Policy note** (1 paragraph): thread vs quote vs external follow
3. **Code:** P0 cases only; list P1 deferrals in Epic return
4. **Thin-body pipeline:** after thread + link follow + reference index — if word count still low, **enrich summarize input** (vision on attached images; see § below)

## P0 repro types

| Type | Expected primary content |
|------|---------------------------|
| Single status | `x.com/.../status/123` → tweet text |
| Thread entry | status in thread → entry tweet or thread text (document choice) |
| Quote tweet + video | tweet text first; not thumbnail-only |
| t.co → status | expanded status text |
| **Media-primary tweet** | headline + photo/video is the payload → vision/OCR blurb before summarize (B7) |
| **Image-only tweet** | empty/`t.co→photo` text, image is entire post → vision mandatory (B8) |
| Author reply w/ link | thread part 2 has GitHub/external URL (B6) |

## Likely files

`xThread.ts`, `xLinkFollow.ts`, `urlPolicy.ts`, `fetchService.ts`, `fetchQuality.ts`, `aiExtract.ts`, `prompts.ts`, X import adapter.

## Out of scope v1

Full thread pagination, quote media download, non-X fetch items.

### Reference index policy (cross-cutting — dogfood 2026-06)

> Applies to **X, articles, login walls, hubs** — not only outbound external links. Extends FETCH-3; may be its own small schema slice (`references[]` on enrichment).

**Principle:** Separate **index all links** (cheap, always) from **deep-fetch some** (capped, selective). Summary + Resources should list every materially mentioned link — followed or not — with at least URL, label, and one-line “what it is”.

#### Two layers

| Layer | Scope | Today | Target |
|-------|--------|-------|--------|
| **Reference index** | All outbound + **same-site internal** links in fetched body | URLs only in raw snippet; AI may omit | Mechanical extract → `references[]` always |
| **Link follow** | Subset judged high-value | External only; max 3; **same host skipped** (`xLinkFollow.ts`) | Merge into `references[]` with `followed: true` + blurb from fetch |

#### External links (e.g. Jafar thread)

- Index **all** URLs in tweet/article (10 job sites) even when only 3 get `## Linked:` body fetch.
- Each entry: `{ url, label, scope: 'external', followed?, description }`.
- Label from: anchor text, numbered list context (“1. Toptal”), or hostname.
- AI summary/keyPoints should not drop unfollowed links — pass indexed list in extract prompt.

#### Internal / same-site links (login, landing, hubs)

When primary page is **low-information** (login, cookie gate, thin hub, generic homepage):

- **Still index** same-host links: `/pricing`, `/docs`, `/product`, “Learn more”, footer nav — with label + path.
- **Optionally follow** 1–2 internal targets when body is thin and link looks like the real resource (landing, docs intro, product page) — **distinct from redirect mismatch** (FETCH-2 login/auth is separate bucket).
- Examples:
  - Saved `/login` → index links to `/`, `/signup`, `/features`; optional follow `/` or marketing landing for product blurb.
  - Saved article stub / category hub → index + summarize listed items; follow none or top item.
  - Saved wrong-page redirect to site home → references show what else exists on site even if we don’t fetch all.

**Do not** treat internal follow as “the bookmark moved” — saved URL stays canonical; internal refs are **context/recovery**, same as external refs.

#### Media / non-HTTP references

- Video/image/card in quote or tweet: reference entry with `kind: video|image|card`, label, `description: not transcribed` when body unavailable.
- t.co / short links: resolve when cheap; always list in index even if unresolved.
- **Distinguish facet types:** `t.co` → `/photo/1` is **media**, not an external link — do not summarize as “link to resource” (B7).
- Persist image URLs from FxTwitter/CDN (`pbs.twimg.com/…`) in reference index even when not vision-scanned.

#### Thin-body content enrichment (pre-summarize) — P1

> Run **after** normal fetch pipeline: syndication/thread → quote expand → link follow → reference index. **Then** measure substantive word count on merged markdown. If still thin, **add content to summarize input** before `extractEnrichmentWithAI` — do not rely on summarize alone to invent detail.

**Trigger (all source kinds; X especially):**

```
substantiveWordCount(body) < THIN_THRESHOLD   // e.g. ~40–80 words after chrome strip
OR substantiveWordCount(body) === 0 AND mediaUrls.length > 0   // image-only tweet (B8)
AND (
  attached media URLs available (FxTwitter media.photos, CDN mediaDetails)
  OR media-primary tweet (headline + t.co → /photo/N only, or empty text + photo)
  OR fetch ok but keyPoints would be empty
)
```

**Actions (in order):**

1. **Reference index** — already listed links/media (cheap).
2. **Link follow** — externals + optional same-site internal (if thin login/hub page).
   - **PDF / binary URLs:** never append raw bytes to markdown (B9). Detect `Content-Type: application/pdf` or `%PDF-` header; prefer abstract/HTML URL (e.g. arxiv `/abs/` not `/pdf/`), Jina reader, or reference-index only with title from tweet.
3. **Vision pass (conditional)** — up to 2 **https** image URLs when text still thin (any source kind):
   - Extract from: `Image: url`, `![alt](url)`, `<img src>`, bare `.jpg/.png/…`, `pbs.twimg.com/media/`
   - Skip: favicons, avatars, `profile_images`, sprites, `.svg`
   - Module: `imageVision.ts` (`enrichMarkdownWithVision`)
4. **Summarize** — prompt receives enriched body + reference list; rule: **do not invent** when body still thin after vision — say “image-only post” or use vision text only.

**Not in scope v1:** vision on every X tweet; full video transcription; OCR on non-X unless same thin-body gate applies.

**Files:** `fetchService.ts` (post-fetch gate), `xThread.ts` (expose media URLs), `aiExtract.ts` / new `enrichThinBody.ts`, `prompts.ts` (anti-hallucination when thin).

#### Schema sketch (P1)

```ts
type EnrichmentReference = {
  url: string;
  label: string;
  scope: 'external' | 'internal';
  kind?: 'article' | 'video' | 'repo' | 'social' | 'short' | 'image' | 'unknown';
  followed?: boolean;
  description?: string; // from follow-up fetch OR inline context OR AI
};
```

Persist on `ItemEnrichment.references`; show in Inspector as **Resources**; feed categorization/search.

#### FETCH-3 dogfood bugs (X session)

| # | Issue |
|---|--------|
| B1 | Quote expand duplicates own thread in `quoted_text` |
| B2 | `quoted_author` = first `@mention` in body |
| B3 | Video in quoted tweet / embedded X video | **done** — Track A: video metadata under quotes; Track B: `media-not-transcribed` attention (see § B3) |
| B4 | List threads: 3/10 externals followed — index should list all 10 |
| B5 | Deleted tweet → explicit `tweet_unavailable` label | **pass** (dogfood 2026-06-13) |
| B5b | Failed fetch + X-import notes → topic classify (ML/general) | **pass** — `fetchFailedWithoutUsableBody` + link-quality; commit `7d91548` |
| B6 | **tom_doerr/1892676953456382249** — tab-session chrome beats syndication; author reply + GitHub link lost | Best-of tab vs headless; syndication-first; X tab chrome gate | **pass** (Hub batch; side panel see B13) |
| B7 | **hamptonism/1893590972627407115** — media-primary tweet; `local`/CDN text-only; t.co → photo not external; AI invents “strategic interactions” | Thin-body gate → vision on attached image before summarize |
| B8 | **HangukQuant/1889039264891224402** — zero tweet text, image-only; tab chrome; AI empty but t.co title fallback; other users’ replies visible on X only | Syndication-first + vision mandatory; tab must not win |
| B9 | **PtrPomorski/1859876976011641276** — tweet OK (`syndication-expanded`); link-follow fetched arxiv **PDF as binary** (`%PDF-1.5…`) into `## Linked:` — ~8k prompt tokens waste; summary luckily from tweet text | PDF→text/abs URL; reject binary bodies; reference index for paper |
| B10 | **marcb_xyz/1875536122652324094** — thread OK; link-follow appended **404 body** for dead promo `51x.ai` (author tweet 4/4, not replies) | Reject 404/error pages in link-follow; index-only for newsletter CTAs (optional) |
| B11 | **tom_doerr/1892318062075854982** — import title has media `t.co/p1Pn6sJokT` → `/photo/1`; **not** t.co bookmark redirect | Strip media t.co from import title/description |
| B12 | **Inspector Re-fetch** on already-enriched items does not fully refresh — stale summary/AI/debug; steps skipped as if cached | Force full pipeline on explicit Re-fetch (see § B12) |
| B13 | **tab-session still wins on X** — Hub re-digest + **side panel save**; fake `# @unknown` / `## 1/2` | **Hub pass** `4ad0d04`; **side panel open** — Gate 3 (§ Close-out plan) |

#### B3 — embedded X video (policy v1, keep simple)

> **Goal:** Filter for user review — not full understanding. User can always open the link manually; value is **not mis-classifying** and **not trashing** media bookmarks.

**Two tracks (same fetch metadata; different classify):**

| Track | When | Fetch | Summarize | Classify |
|-------|------|-------|-----------|----------|
| **A — quote + text** | OP/quote has substantive text (e.g. philfung → @sdrzn) | Add video line under quote: status `/video/1` URL, thumbnail URL, duration — `references[]` `kind: video` | Normal cheap summarize on **text** | Normal topic classify |
| **B — video/image-primary, thin body** | Substantive words ≈ 0 after chrome strip; alive `media.videos` or image-only | Same metadata annotation; confirm not `tweet_unavailable` | Mechanical one-liner + import title hint only — **no inventing** | **Skip topic LLM** → link-quality **attention** leaf `media-not-transcribed` (`classified_attention`) |

**Explicitly out of scope v1:** MP4 to LLM, transcription, thumbnail vision, extra models for quote subsections.

**External YouTube etc.** in tweet body — unchanged (link index / video `sourceKind` path).

**Implementation (shipped):** `xMedia.ts`, `xThread.ts` quote/tweet `media.videos`, seed `media-not-transcribed`, eligibility + link-quality gate, mechanical summary (no LLM/video upload). Repro: philfung (track A), HangukQuant (track B).

#### Repro: tab-session routing (B13) — Hub **pass**; side panel **Gate 3**

> **Hub (2026-06-13):** `4ad0d04` — X URLs skip tab-first when only `preferTabSession`; `isXTabFetchAcceptable` rejects `# @unknown` / thin openers. Retest: Jafar `syndication-expanded` (12 refs), EastlondonDev `syndication-expanded`, philfung syndication + quote/video metadata.

**Side panel save (close in Gate 3 — before bulk import):**

- **Code:** `SidePanelConnected.tsx` — `runDigestWithModal({ preferTabSession: true, tabId })` on tab save and manual bookmark add.
- **Effect:** `resolveItemFetch` runs **tab-first** (`tabFirst` path) → open tab extract **before** FxTwitter headless → syndication-first policy **skipped** for side-panel digest.
- **Symptom:** X bookmarks saved from side panel often land `fetchSourceId: tab-session` even when FxTwitter would return full thread / vision path.
- **Contrast:** Hub import batch uses syndication-first (no `preferTabSession`) — B6–B8 pass there; side-panel saves may not.
- **Product question:** Side panel should use tab for **auth/login** pages only, or always syndication-first for `x.com/status/` URLs?

**Likely root causes (ranked):**

1. **`preferTabSession: true`** on side-panel digest (tab-first path).
2. **FxTwitter headless fails** in extension (`provider_error` / timeout) → `tab_retry` still returns partial DOM scrape.
3. **Tab DOM mimics syndication** — `# @unknown — thread (2 parts)` + `## 1/2` passes `looksLikeSyndicationXMarkdown` heuristics.
4. **Incomplete guard** — tab retry not fully disabled on all X headless failure codes.

**Fix plan (when resumed):**

- Side panel: `preferTabSession` only for non-`x` status URLs, or never for `x.com/.../status/`.
- X: **no tab fallback** when headless fails (any error code) except `auth_required` / `bot_blocked`.
- Tighten syndication detector: require real `@handle` (not `unknown`) for thread-shaped tab bodies.
- Optional: side-panel “digest later” / queue without immediate tab-first fetch.

**Files:** `fetchService.ts` (`resolveItemFetch`, `shouldRetryWithBrowserTab`), `xFetchHeuristics.ts`, `SidePanelConnected.tsx`.

**Test:** Side panel save + digest on B6 URL → expect `syndication-expanded`, not `tab-session`; Hub re-digest on Jafar/EastlondonDev/philfung same.


- **URL:** `https://x.com/marcb_xyz/status/1875536122652324094`
- **Thread:** parts 1–2 text; part 3 `kaggle.com/whitepaper-agents` ✓; part 4 newsletter CTA `http://www.51x.ai` (both apex/www **404** today)
- **Link follow:** kaggle OK; 51x.ai → `## Linked: 404 - Page not found` merged into body (passes length check)
- **Not from:** other users’ replies on X — author self-thread only
- **Fix:** `explainHardFetchFailure` / link-follow skip for 404 shells; optional deprioritize promo links vs content links

#### Repro: tom_doerr import media t.co in title (B11)

- **URL:** `https://x.com/tom_doerr/status/1892318062075854982`
- **Export `full_text`:** `Self-hostable bookmark and content organizer https://t.co/p1Pn6sJokT`
- **JSON `extended_media`:** `t.co/p1Pn6sJokT` → `/photo/1`, image `pbs.twimg.com/media/GkLdOQYWEAADX5z.png`
- **Import title:** `tom_doerr: … https://t.co/p1Pn6sJokT` — cosmetic; bookmark URL is already `x.com/status/…`
- **Fetch issue (separate):** `tab-session` chrome — fixed by phase 1 syndication-first
- **Not FETCH-2 redirect:** `redirect: null`

#### Repro: tom_doerr side-project directory (B6)

- **URL:** `https://x.com/tom_doerr/status/1892676953456382249`
- **Saved title:** includes `t.co/X5qIoSa2Y5` (photo card)
- **Live structure:** OP “Directory for promoting side projects” + **author reply** with `https://github.com/soGeneri/awesome-launch` + link card embed + 1 commenter
- **FxTwitter `/2/thread`:** 2 parts — part 2 is the GitHub URL (real payload)
- **We stored:** `fetchSourceId: tab-session`, snippet = X UI chrome (`Subscribe`, `Post your reply`, views) — **213 chars**, no GitHub, no reply
- **AI:** paraphrased headline only (“encouraging users to explore…”) — **empty keyPoints**, no link in summary
- **Root cause:** `tab_retry` returned ok (≥80 chars) and **replaced** headless syndication; tab extract does not read reply thread or card embeds; no quality compare between routes
- **Expected:** syndication-thread (2 parts) + reference index `{ github.com/soGeneri/awesome-launch, label: awesome-launch }` + optional link-follow + photo annotated

#### Repro: hamptonism Game Theory book cover (B7)

- **URL:** `https://x.com/hamptonism/status/1893590972627407115`
- **Live:** tweet text is only `Introduction to Game Theory:` — **book cover image is the content**
- **t.co/iBGpWKfWkd** → `/photo/1` (media facet), **not** an external book URL
- **FxTwitter:** photo at `pbs.twimg.com/media/Gkdi85KXQAAdJgq.jpg`
- **We stored:** `fetchSourceId: local` (Twitter CDN embed), snippet 93 chars + `(1 media item(s) attached)` — **no image URL used**
- **AI:** vague summary + invented filler; keyPoint “Link to resource provided” is **wrong** (link is photo)
- **Expected:** after thread/link/index passes, thin-body gate fires → vision describes cover (title/author/subject) → summarize from that; reference `{ kind: image, … }`; no hallucinated prose

#### Repro: HangukQuant image-only + tab chrome (B8)

- **URL:** `https://x.com/HangukQuant/status/1889039264891224402`
- **Live:** OP is **image-only** — no caption text; embedded chart/handout image; `View quotes` (1 quote of this tweet elsewhere)
- **Conversation on X UI:** @zupollask asks about subscription; @HangukQuant replies “market notes… handouts… old posts” — these are **other users’ replies**, not author self-thread
- **FxTwitter `/2/status`:** `text: ""`, `raw_text` = `https://t.co/gS6bgRzbux` only; facet type **media** → `/photo/1`; image `pbs.twimg.com/media/Gjc3McubsAAMBhb.jpg`
- **We stored:** `fetchSourceId: tab-session`, snippet = X chrome only (149 chars); `ai_status: empty_response` (correct); UI may still show title fallback `HangukQuant: https://t.co/gS6bgRzbux`
- **Root cause:** tab won over syndication; tab never sees image bytes; syndication has photo URL but **zero words** → must trigger vision; reply thread not in author `/2/thread` model
- **Expected:** syndication (not tab) → thin-body gate (word count 0 + media) → vision on image → summary describes handout/chart content; reference `{ kind: image, url: pbs… }`; **do not** treat other users’ replies as bookmark content unless product adds optional “conversation context” (P2)
- **Related:** B6 tab routing, B7 media-primary / vision gate

#### Repro: PtrPomorski arxiv PDF link-follow (B9)

- **URL:** `https://x.com/PtrPomorski/status/1859876976011641276`
- **Tweet (good):** Citadel / learning-to-rank / asset allocation; paper title in quotes; `https://arxiv.org/pdf/2012.07149`; 1 photo attached
- **Fetch route:** `syndication-expanded` ✓ — tweet text captured correctly
- **Link follow (bad):** `appendXLinkFollowBodies` fetched `/pdf/2012.07149` via `localProvider` → raw PDF bytes decoded as Latin-1 text → `## Linked: arxiv.org` full of `%PDF-1.5` garbage (~10k chars capped)
- **AI:** `inputTokens: 8136` — model **ignored** PDF noise and summarized tweet + paper **title** (lucky); did not extract paper abstract/content
- **Root cause:** `localProvider` only rejects PDF when bookmark URL is `.pdf`; link-follow uses same fetch path with no content-type check; `isFetchBodyUsable` passes `%PDF` string by length
- **Expected:**
  - Reference index: `{ url: arxiv.org/abs/2012.07149, label: paper title, kind: article, followed: false|true }`
  - Link follow: rewrite `arxiv.org/pdf/` → `/abs/` or use Jina; or PDF text extract; **never** append binary to summarize input
  - Optional P2: dedicated arxiv abstract fetch for enrich depth
- **Note:** Summarize model is **text-only** today — cannot “read” PDF bytes; vision path is for **images**, not PDF streams

#### Repro: Inspector Re-fetch does not fully update (B12)

- **Observed (dogfood 2026-06):** Item already has `status: ok`, summary, `pipeline_debug`, vision/AI from a prior run. User clicks **Re-fetch** in Pipeline Inspector after fetch-layer fixes (e.g. syndication-first, image vision). UI / stored fields **look unchanged** for some steps — summary, keyPoints, `aiCalls`, embed, or `fetchSourceId` may not reflect the new route.
- **Expected:** Explicit **Re-fetch** = **full refresh** — network fetch, vision, AI extract, redirect verdict when eligible, raw dump rewrite, `pipeline_debug` rewrite, embed backfill — **regardless** of prior `contentHash` / `aiStatus`.
- **Root causes (code):**
  1. **Inspector Re-fetch passes `skipAi: true`** (`PipelineItemInspectorPanel.runFetch` → `pipeline.runSingle` / `runBatch`) — fetch + vision run but **summary, tags, keyPoints, redirect verdict, embed** are preserved from prior run.
  2. **`content_unchanged` early return** (`fetchService.enrichOne`) when `contentHash` matches and `aiStatus === 'ok'` — skips AI and returns `skipped: true` (bypassed when `force: true`, but Inspector still skips AI via `skipAi`).
  3. **`preservePriorOnSuspiciousFetch`** — on failed/empty/suspicious new fetch, keeps prior enrichment + `pendingFetchReview` even when user explicitly re-fetched (`force` not consulted).
  4. **`reextractAI`** re-runs AI from **cached `snippet` only** — no network; useless if Re-fetch did not update snippet or user never runs **Re-run AI** separately.
  5. **Hub bulk Re-fetch** same pattern (`skipAi: true`, `forceEnrich: true`) — fetch-only by design; **Full digest** is separate button.
- **Contrast:** `EnrichmentReviewModal.handleRefetch` calls `enrichOne({ force: true })` **without** `skipAi` — closer to desired behavior.
- **Fix plan (P0 — end of FETCH-3 session):**
  - ~~Add `refetchFull?: boolean`~~ **Shipped (partial):** Inspector Re-fetch no longer passes `skipAi: true` — runs fetch + vision + AI + embed; `force: true` bypasses `preservePriorOnSuspiciousFetch`.
  - Remaining: bulk Inspector multi-select Re-fetch same path; confirm `pipeline_debug` always rewrites on force; optional classify on Re-fetch vs separate Full digest.
- **Files:** `PipelineItemInspectorPanel.tsx`, `PipelineProgressProvider.tsx`, `itemPipeline.ts`, `fetchService.ts` (`enrichOne`, `preservePriorOnSuspiciousFetch`), `HubBulkStagedActions.tsx`.
- **Test:** Re-fetch tom_doerr B6 after phase 1 — expect `fetchSourceId: syndication-expanded`, updated snippet with GitHub, **new** summary/keyPoints and fresh `pipeline_debug.aiCalls`.

#### Reply bookmark policy (open)

- **Today:** author self-reply root walk → full author thread; stop at other-author parent → single tweet only.
- **Product choice:** reply-under-others-thread — saved reply only vs reply + parent OP context (`## Context` block).

### FETCH-3 manual tests

| # | Pass when |
|---|-----------|
| 1 | Single tweet → summary is tweet text |
| 2 | QT w/ video (if in library) → not thumbnail-only |
| 3 | Media-primary tweet (B7) → vision blurb in summarize input, no invented filler |
| 4 | Image-only tweet (B8) → vision required; no t.co-only fallback summary |
| 5 | No regression on non-X URLs |

---

## Epic manual matrix (before close)

| # | Issue | Test |
|---|-------|------|
| 1 | #31 | Udemy + Hub digest with open tab — still OK (regression) |
| 2 | #35 | Seeking Alpha repro |
| 3 | #35 | Benign https/www article |
| 4 | #26 | Single tweet |
| 5 | #26 | Quote-tweet w/ media (if available) |
| 6 | All | Side panel save + digest |
| 7 | All | Hub bulk mixed — debug per item |

---

## Verification

```bash
npx tsx src/lib/enrichment/fetchRedirect.test.ts
# add x tests if you create them
npm run build
```

---

## Model

**Composer 2.5** for full epic. Escalate only if enrichment schema migration needed.

---

## Epic progress

| Work | Issue | Status | Commit |
|------|-------|--------|--------|
| Tab-session parity | #31 | done | `c361f61` |
| Redirect honesty (v2) | #35 | done | `09fa1e2` |
| X syndication-first + vision + link-follow | #26 | **done** | `4ad0d04` … `a839e14` |
| X import B11 | — | **done** (title hygiene) | `73215ba` |
| Quote bugs B1/B2 + B5 unavailable | — | **done** | `6e70be4`, `7d91548` |
| Inspector Re-fetch full refresh | B12 | **done** (Gate 1) | `4ad0d04`, `a839e14` |
| **tab-session / side panel** | B13 | **done** (Gate 3) | `5f3bff5`, `dbd3140` |
| Reference index `references[]` | B4 | **done** | `4ad0d04` |
| Classify: failed fetch + import notes | B5b | **done** | `7d91548` |
| QT video / media filter | B3 | **done** | `8883929`, `aabd7bd` |
| AI call audit for redirect | E5 | done | `09fa1e2` |
| Taxonomy: url-redirect-mismatch + UI | — | done | `09fa1e2` |
| **X reply → full conversation chain** | bonus | **done** | `a839e14` |
| **Generic video fetch (YouTube/Vimeo/Twitch)** | bonus | **done** | `a839e14` |
| **PDF detect → Jina fallback** | bonus | **done** | `a839e14` |
| **Side panel trash restore on re-save** | bonus | **done** | `a839e14` |
| **Pipeline hydrate before enrichment read** | bonus | **done** | `a839e14` |
| **External link side-panel UX** | bonus | **done** | `dbd3140` |
| **AI JSON LaTeX escape repair** | bonus | **done** | `a839e14` |

### Post-epic follow-ups (not blocking)

| Priority | Item | Notes |
|----------|------|--------|
| P1 | LinkedIn bot-hub heuristic | tab-session often OK; occasional thin hub |
| P1 | `pipeline-runs/` export on scoped import | ops — Gate 4 used sqlite analysis |
| P2 | 8 X `tab-session` ok rows in bulk (0.31%) | login redirect + syndication fallback edge cases |
| P2 | 3 ok rows with `404` snippet (B10 tail) | rare promo/dead link-follow |
| P2 | Classify wave retry | old `scoped-pipeline-run-latest.json` paused on 8 category assignments — separate from fetch |
| P2 | Finish enrich on remaining ~2.6k `test5` items | import job was still running at epic close |
| P2 | Reply-under-others `## Context` policy | product choice |
| P2 | Backfill `references[]` on pre-B4 items | taxonomy/search, not fetch |

---

## Epic return (worker fills; master commits)

| Field | Value |
|-------|--------|
| **Status** | **done** — Gates 1–4 closed 2026-06-13 |
| **FETCH-2 (#35)** | **done** (v2 escalate policy; not original hard-fail) |
| **FETCH-3 (#26)** | **done** — X syndication-first at scale; side panel + bulk validated |
| **Commits (epic + close-out)** | `4ad0d04` · `6e70be4` · `7d91548` · `8883929` · `aabd7bd` · `5f3bff5` · `a839e14` · `dbd3140` |
| **Dogfood folders** | `~/Documents/test4/` (Gate 1 smoke + side-panel case-by-case) · `~/Documents/test5/` (Gate 4 fresh import) |
| **Tests run** | Unit tests below + `npm run build` + manual SP/EXT matrix + ~3k bulk sqlite analysis |
| **Blockers** | None for fetch epic. Post-epic: classify wave retry, LinkedIn heuristic, finish remaining enrich waves on `test5`. |

### Summary (for master)

**FETCH-2** shipped as **redirect capture → pre-summary AI verdict → summary with `prior_verdict` prompt → attention bucket** (`url-redirect-mismatch`). Conservative gates: login/auth never in redirect mismatch bucket. **AI call audit** (`aiCalls[]`, `taskType: redirect_verdict`) in `pipeline_debug`. Prior dogfood (`test4`): 403 URLs, 90 redirect verdict proofs, 73 review flags.

**FETCH-3** shipped X **syndication-first** for Hub, bulk, and side panel (`preferTabSessionForDigest`, `xFetchHeuristics`, tab-chrome gate). P0 bugs B1–B13 verified. **Gate 4** fresh import (`test5`, 5,646 items): **2,957 ok / 86 failed** on first **3,043** enriched — **97.2%** success; **2,588** X rows `syndication-expanded` vs **8** `tab-session` (0.31%); no PDF-in-body regression.

**Bonus work (same worker sessions, not in original epic scope):**

1. **X reply bookmarks → full conversation chain** — `xThread.ts`: fxtwitter v2 `replying_to` object walk; `buildFullThread()` merges OP thread + cross-author ancestors; always `syndication-expanded`. Repro: [arckollect/2064823512104390983](https://x.com/arckollect/status/2064823512104390983).
2. **Generic video fetch** — `videoExtract.ts` (renamed from youtube-only); `fetchService` skips tab-quick for `video`; Jina `normalizeVideoMarkdown`; `tab-page-extract.js` `extractVideoPage()` for YouTube/Vimeo/Twitch. Repro: [Nbq5eyVk-0w](https://www.youtube.com/watch?v=Nbq5eyVk-0w), Vimeo, Twitch.
3. **PDF local detect → Jina fallback** — `local.ts` Content-Type / `%PDF-` magic → `parse_empty` → Jina (generic, not arXiv-specific). Repro: [arxiv.org/pdf/2405.12286](https://arxiv.org/pdf/2405.12286), [pdfobject.com/pdf/sample.pdf](https://pdfobject.com/pdf/sample.pdf).
4. **Side panel save reliability** — `db.ts` `addItemWithMerge` restores trashed rows (`deletedAt` cleared); `forceEnrich: true` on side-panel digest; `ensurePipelineHydrated()` before enrichment reads (reload no longer “loses” AI data).
5. **External link UX** — `SidePanelExternalSection.tsx`: collapsible “Add external link”; main form = current tab only (read-only URL); session digest cards hidden when collapsed; `source: manual` never uses tab session.
6. **AI JSON repair** — `aiExtract.ts` / `redirectAiVerdict.ts`: `repairInvalidJsonEscapes` for LaTeX backslashes in arXiv summaries.

### FETCH-2 repro (Seeking Alpha)

| | Requested | Final | Before | After |
|---|-----------|-------|--------|-------|
| SA article | `/article/3963244-...` | homepage or hub | Silent enrich | Mismatch verdict + `pendingFetchReview` or attention leaf |

Bulk CLI: `npm run fetch-batch-pipeline -- --from-experiment … --max 100`

### FETCH-3 repro matrix

| URL type | Before behavior | After behavior | Pass? |
|----------|-----------------|----------------|-------|
| Single X status | tab-session chrome or thin scrape | `syndication-expanded`, tweet text | **yes** (bulk + SP-1) |
| Reply in others’ thread | bookmarked reply only | full conversation chain in body | **yes** (arckollect) |
| Quote + video (philfung) | thumbnail-only risk | text + video metadata in refs | **yes** (B3 track A) |
| Image-only (HangukQuant) | tab chrome, empty AI | vision + syndication | **yes** (SP-3, B8) |
| Media-primary (hamptonism) | invented filler | vision on cover image | **yes** (B7) |
| Author reply + GitHub (tom_doerr B6) | tab beats syndication | GitHub in body/refs | **yes** (SP-2) |
| arxiv PDF in link-follow (PtrPomorski) | `%PDF` binary in `## Linked:` | Jina/abs; no PDF in body | **yes** (B9) |
| Dead promo 404 (marcb B10) | 404 body merged | rare tail (3/2957 ok rows) | **mostly** |
| 4-part thread + kaggle (marcb) | partial link-follow | thread + refs | **yes** (Gate 1) |
| Deleted tweet (GenReasoning) | generic fail | `tweet_unavailable` / `auth_required` | **yes** (B5) |
| Side panel X save | `tab-session` always | `syndication*` unless login wall | **yes** (B13) |
| YouTube watch page | listing scrape “24 items” | Jina description/metadata | **yes** (bonus) |
| Login-walled article (signed in) | empty or wrong | `tab-session` + content | **yes** (SP-4) |
| External link from side panel | mixed with tab URL | isolated section + manual fetch | **yes** (EXT) |

### FETCH-3 policy note

**Thread vs quote vs external follow:** Primary bookmark URL stays canonical. For `x.com/.../status/` URLs, **always try FxTwitter syndication first** (headless in extension); tab-session only when syndication fails with `auth_required` / `bot_blocked` or for non-X URLs that need login. **Reply bookmarks** walk ancestor chain (`replying_to` v1/v2) and merge conversation into markdown — not only same-author self-thread. **Quote tweets** expand quoted text/media metadata but do not duplicate own thread into `quoted_text` (B1). **Link follow** (max 3) fetches high-value externals; all links indexed in `references[]` even when not followed. **Thin-body gate** runs vision on attached images before summarize; media-primary tweets skip topic LLM → `media-not-transcribed` attention (B3 track B). **PDF/binary** never appended to markdown — detect locally, fall back to Jina or reference-only.

### Tests run

| Command | Result |
|---------|--------|
| `npx tsx src/lib/enrichment/fetchRedirect.test.ts` | pass |
| `npx tsx src/lib/enrichment/prompts.test.ts` | pass |
| `npx tsx src/lib/categorization/linkQuality.redirect.test.ts` | pass |
| `npx tsx src/lib/enrichment/categorizationEligibility.test.ts` | pass |
| `npx tsx src/lib/categorization/linkQuality.fetchFailed.test.ts` | pass |
| `npx tsx src/lib/enrichment/videoExtract.test.ts` | pass |
| `npx tsx src/lib/enrichment/xFetchRouting.test.ts` | pass |
| `npm run build` | pass |

### Manual test

| Gate | Result |
|------|--------|
| **1** Per-item + 10-row smoke | **pass** (`test4` dogfood + user re-fetch) |
| **2** Backlog sweep | **pass** — all B-rows done or documented gap |
| **3** Side-panel SP-1…SP-5 + EXT + TRASH | **pass** |
| **4** Fresh import ≥2k + log analysis | **pass** (`test5`, 3,043 enriched / 2,957 ok) |

### Files touched (close-out commits)

| Area | Files |
|------|--------|
| X thread / conversation | `providers/xThread.ts`, `xFetchHeuristics.ts`, `xQuoteExpand.ts` |
| Video / PDF | `videoExtract.ts`, `fetchService.ts`, `fetchQuality.ts`, `providers/jina.ts`, `providers/local.ts`, `public/tab-page-extract.js` |
| Side panel | `SidePanelConnected.tsx`, `SidePanelView.tsx`, `SidePanelExternalSection.tsx` |
| Save / hydrate | `db.ts`, `storage.ts`, `itemPipelineContext.ts` |
| AI JSON | `aiExtract.ts`, `redirectAiVerdict.ts` |
| Prior epic core | `fetchRedirect.ts`, `redirectAiVerdict.ts`, `fetchService.ts`, `linkQuality.ts`, `xMedia.ts`, `referenceIndex.ts`, … |

### Out of scope noticed

- LinkedIn/headless bot “content hub” vs real article in browser — may get fetch review or thin summary, not always redirect bucket
- `content_unchanged` skip skips AI on batch smart enrich (expected); side panel uses `forceEnrich: true`
- `pipeline-runs/` folder not written on scoped import waves (Gate 4 analysis from `workbench.sqlite` + `import-pipeline-job.json`)
- **#19 extension vanish** from Dropbox-synced `dist/` — see § Unrelated; recommend local `dist/` copy for long imports
- t.co primary bookmark (#10) — still backlog
- Other users’ replies visible on X but not in syndication body — product choice (P2)

---

## Unrelated — extension lifecycle (#19)

> **Not FETCH epic work.** Dogfood observation + investigation during FETCH-2 sessions. Report to master for backlog / later slice.

### Observed (2026-06)

- Unpacked extension **vanished from `chrome://extensions`** while using dev mode; load path unchanged (same folder, not moved).
- After **Load unpacked** again from the same path:
  - App **remembered backup folder** (`~/Documents/test4`) and **skipped onboarding**.
  - Data intact — not a full uninstall wipe.

### Interpretation (code + discussion)

| Signal | Meaning |
|--------|---------|
| Skipped onboarding | `hasWritableBackupFolder()` returned true — `FileSystemDirectoryHandle` still in IndexedDB (`workbench-agent-meta`) + permission still granted (`backupFolder.ts`, `App.tsx` startup gate). |
| Same extension ID | Unpacked ID is derived from absolute load path; same path → same profile storage survives. |
| Not digest failures | Per-URL enrich failures (`status: failed`, tab scripting catches) are in-app data quality; **Chrome does not auto-remove** extensions for those. |
| Partial detach | Extension **registration** glitched; **profile storage** did not — consistent with disable/reload glitch, not true Remove. |

**No in-repo cause** for disappearing: no self-uninstall, no `chrome.management` usage. Red **Errors** badge on `chrome://extensions` is separate (SW/offscreen noise during long batch runs) — annoying but not an uninstall trigger.

### Likely contributors (ranked)

1. **Load unpacked from Dropbox-synced `dist/`** — repo lives in Dropbox; Chrome reads manifest/SW/chunks while sync may partial-write, lock, or conflict during `npm run build`. Repo already notes this pattern elsewhere (`test_metamask_example/README.md`: copy out of Dropbox before load).
2. **MV3 async startup chain** — SW → offscreen doc → DB worker bootstrap → folder mirror; cold Chrome boot + race can produce transient Errors (`db-owner-lost`, `receiving end does not exist`) without wiping storage.
3. **Developer mode toggle / Chrome update restart** — unpacked entry can disappear from list; storage survives if same path reloaded.
4. **Not:** bulk digest item failures, redirect AI errors, or per-bookmark `console.error` in UI context.

### Recommended follow-ups (later)

| Priority | Action |
|----------|--------|
| P1 | **Split paths:** keep **backup folder** in Dropbox (by design); load extension from **local non-sync copy** of `dist/` (e.g. `rsync` to `~/local/workbench-agent-dist/` after build). |
| P2 | Optional `npm run build:local` script or README note — never Load unpacked directly from Dropbox `dist/`. |
| P2 | Lifecycle breadcrumbs: log `onInstalled` reason + SW/offscreen startup timestamp to `chrome.storage.local` for next vanish diagnosis. |
| P3 | Reduce SW Errors noise during long imports (classify offscreen bootstrap / focus-tab failures so they don’t pollute extension Errors badge). |
| Later | Real use: Chrome Web Store (even unlisted) or fixed local install path; Dropbox only for data. |

### Code refs (investigation)

- Onboarding gate: `src/App.tsx` (`hasWritableBackupFolder`), `src/lib/backupOnboarding.ts`
- Handle persistence: `src/lib/metaDb.ts`, `src/lib/backupFolder.ts`
- SW lifecycle: `public/service-worker.js` (`onInstalled`, offscreen + db-rpc)
- Startup races: `src/lib/storage/dbClient/index.ts` (`db-owner-lost`, transient RPC retry)

---

## Remaining work

> **Epic closed 2026-06-13.** Implementation phases below are **shipped and verified** unless noted as post-epic follow-up (§ Epic progress).

### Implementation phases (reference — shipped)

| Phase | Scope | Status |
|-------|--------|--------|
| **1** | X syndication-first, tab-chrome gate | **done** — Gate 3 + Gate 4 |
| **1.5** | Thin-body + image vision | **done** — B7, B8 |
| **2** | Import hygiene (B11) | **done** ✓ |
| **3** | Link-follow PDF/404 (B9, B10) | **done** — B10 rare tail documented |
| **4** | Quote / parse (B1, B2) | **done** ✓ |
| **5** | Thin-body + vision (B7, B8) | **done** ✓ |
| **6** | Reference index (B4) | **done** ✓ |
| **7** | Inspector Re-fetch (B12) | **done** ✓ |
| **bonus** | Video/PDF/side panel/external links | **done** — `a839e14`, `dbd3140` |

**10-row X smoke matrix:** Gate 1 checklist (Hub import path).

### 10-row smoke matrix (URLs)

| # | URL / id | Stress |
|---|----------|--------|
| 1 | `marcb_xyz/1875536122652324094` | 4-part thread + kaggle link-follow |
| 2 | `tom_doerr/1892318062075854982` | image + text; tab chrome failure |
| 3 | `tom_doerr/1892676953456382249` | author reply + GitHub (B6) |
| 4 | `PtrPomorski/1859876976011641276` | arxiv PDF link-follow (B9) |
| 5 | `hamptonism/1893590972627407115` | media-primary (B7) |
| 6 | `HangukQuant/1889039264891224402` | image-only (B8) |
| 7 | philfung quote+video | quote media |
| 8 | EastlondonDev thread+quote | quote metadata bugs |
| 9 | deleted tweet (GenReasoning) | clean fail |
| 10 | one primary `t.co` bookmark (backlog) | t.co→status expansion |

### Bug backlog (FETCH-3) — **closed**

| ID | Item | Gate | Status |
|----|------|------|--------|
| B1 | Quote expand duplicates own thread | 1 | **done** `6e70be4` |
| B2 | `quoted_author` = first `@mention` | 1 | **done** |
| B3 | Video / embedded X media | 1 | **done** `8883929` |
| B4 | Index all externals in list thread | 1 | **done** `4ad0d04` |
| B5 | Deleted tweet → `tweet_unavailable` | 1 | **done** |
| B5b | Failed fetch + notes → no classify | 1 | **done** `7d91548` |
| B6 | tab beats syndication; reply lost | 1 / 3 | **done** Hub + side panel |
| B7 | media-primary; vision needed | 1 | **done** |
| B8 | image-only; tab chrome | 1 / 3 | **done** Hub + side panel |
| B9 | PDF binary in link-follow | 1 | **done** |
| B10 | 51x.ai 404 in link-follow body | 1 | **mostly** — 3/2957 ok tail |
| B11 | import title media `t.co` | 1 | **done** ✓ |
| B12 | Inspector Re-fetch full refresh | 1 | **done** |
| **B13** | **Side-panel + tab_retry on X** | **3** | **done** `5f3bff5`, `dbd3140` |

### Deferred (not blocking epic close)

| Priority | Item | Notes |
|----------|------|--------|
| P1 | **Reference index** (`references[]`) | Phase 6 |
| P1 | LinkedIn / social bot-hub heuristic | tab often OK |
| P1 | `pipeline-runs/` export on scoped import | ops |
| P2 | Self-hosted PullMD for Reddit | optional |
| P2 | Per-task model routing for `redirect_verdict` | |
| P2 | Force-re-enrich helper | superseded by B12 phase 7 |
| P2 | X conversation context (other users’ replies) | product choice |
