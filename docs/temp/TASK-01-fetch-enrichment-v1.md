# TASK-01 — Fetch enrichment v1 (plug-and-play service)

**Status:** **CLOSED (2026-05-20).** Service + hybrid pipeline shipped; CLI experiments complete; extension validated via dev UI (re-fetch / review). **Product enrichment UX not designed** — current Enrich/Results modals are dev-only.  
**Last touched:** 2026-05-20 (close-out + handoff to master session)  
**Backlog:** `docs/backlog.md` → follow-ups below (UX, hardening, prompt tuning, deep fetch)  
**Unblocks:** **Task 02** — categorization via `buildItemText(item, enrichment)`  
**Out of scope (was):** embeddings, AI categories DB, clustering UI, Ask AI changes, tab provider in extension (CLI only)

---

## Handoff for master session

**Task 01 delivered:** a **plug-and-play enrichment service** — not a finished user-facing feature.

| Layer | Done? | Notes |
|-------|-------|-------|
| CLI experiments | ✅ | 100 random + 50 platform URLs; routing decisions documented |
| `hybridProvider` (experiment → code) | ✅ | X: CDN→syndication; video: jina; article: local→jina |
| `fetchService` orchestrator | ✅ | `enrichOne`, `enrichBatch` (smart/full), eligibility, backoff |
| Storage (IDB + disk + tier-2 Item) | ✅ | `item_enrichment`, `{backupFolder}/enrichment-cache/` |
| AI extract (OpenRouter) | ✅ | summary/title/tags; `aiStatus`/`aiError` |
| `buildItemText()` | ✅ | Downstream contract for Task 02 |
| Dev UI (Enrich / Results modals) | ✅ | Temporary harness — **not product workflow** |
| Product UX / workflow | ❌ | **TBD** — when to enrich, where to show results, import hook, list badges |
| Hardening (run stats, failure aggregates) | ❌ | Backlog |
| Prompt tuning / deep fetch / tab in extension | ❌ | Backlog |

**Suggested next tasks for master session:**

1. **Task 02 — categorization** — consume `buildItemText`; can proceed without new enrich UI.
2. **Enrichment UX design** (new task?) — replace dev modals with real workflow; see [Product UX — not decided](#product-ux--not-decided-dev-ui-only-today).
3. **Enrichment hardening v1.5** — failure buckets, last-run stats (optional parallel slice).

**How to exercise the pipeline today (dev):** Dashboard → Bookmarks / Settings / Import → **Enrich** | **Results** → re-fetch in Review modal. Requires Settings → backup folder + OpenRouter API key for AI.

**Key paths:** `src/lib/enrichment/` · `scripts/enrich-fetch/` · `EnrichmentPanel.tsx` (comment: temporary testing UI)

---

## Phase 1 Implementation Summary (Completed)
- **Providers:** `FetchProvider` interface; default is now **`hybridProvider`** (was Jina-only).
- **Storage:** 
  - **Tier 1 (IDB):** `item_enrichment` store for status, snippet, hashes, and parsed fields (e.g. `quotedText`, `channel`, `aiTags`, `fetchSourceId`).
  - **Tier 2 (Item):** Conditionally updates `Item.title` and `metadata.platform` if local data is weak; AI can suggest improved title/tags.
  - **Tier 3 (Disk):** Full markdown dumps saved to `{userBackupFolder}/enrichment-cache/{itemId}.md`.
- **UI:** 
  - **Dev-only (temporary):** `EnrichmentPanel` → `EnrichmentTestModal` (batch picker) + `EnrichmentReviewModal` (debug/review, re-fetch). Wired on Bookmarks toolbar, Settings, Import Studio. **Not the product workflow** — see [Product UX](#product-ux--not-decided-dev-ui-only-today).
- **Parsing:** Mechanical extraction of Twitter quotes, YouTube channels/descriptions, and article bodies (`parse.ts`).

---

## Phase 2 Implementation Summary (Completed — V1 best-effort)

### Hybrid fetch pipeline (`src/lib/enrichment/providers/hybrid.ts`)

URL-type routing (first usable wins; no markdown.new):

| Source kind | Chain | Notes |
|-------------|-------|-------|
| **X** (`x.com`, `twitter.com`, `t.co`) | `local` (Twitter CDN) → `syndication` (fxtwitter) | Tab/jina worse on X (cookies / noise) |
| **Video** (YouTube, etc.) | `jina` | Local parse_empty on watch pages; tab helps in CLI only |
| **Article** (default) | `local` (Readability + fetch) → `jina` | Medium/GitHub often succeed on local |

**Dropped:** `markdown-new` (0% success in experiments).

**Not in extension yet:** `tab` provider (Playwright in CLI `scripts/enrich-fetch/`; extension would need content-script / open-tab fetch). Experiments show tab rescues ~16–19 JS-heavy URLs when local fails — future Phase 2b.

### Quality gates (`fetchQuality.ts`)

- Block patterns: Cloudflare, Reddit network security, X cookie modals, paywalls.
- Boilerplate: snippets **< 500 chars** with cookie/login/guest-mode keywords → `auth_required`.
- Min useful body: 80 chars (`minUsefulSnippetChars`).
- Weak titles (`X`, `Medium`, etc.) rejected.

### AI extraction (`aiExtract.ts`)

- After mechanical fetch succeeds → OpenRouter LLM → `{ summary, improvedTitle, tags }` JSON.
- LLM does **not** gate fetch success; only enriches usable snippets.
- Typical input: ~8k chars (~1.5–2k tokens) per bookmark.
- **`summary`** on `item_enrichment` = **AI summary only** (mechanical body stays in `snippet`).
- **`aiTags`** may merge onto `Item.tags`; summary does **not** copy to `Item`.
- **`aiStatus` / `aiError` / `aiAt`** persisted when fetch ok: `ok | not_configured | content_too_short | parse_failed | empty_response | api_error`.
- Review modal shows **AI summary** section + AI status line (missing key, API errors, etc.).
- Validated in extension via dev UI (batch enrich + re-fetch on reviewed items) — **good enough for v1 first round**.

### Tracking (`item_enrichment`)

- `fetchedAt`, `fetchSourceId`, `providerId`, `attempts`, `lastErrorCode`, `nextRetryAt`, `contentHash` / `textHash`.
- `force: true` on re-fetch; batch **Re-fetch all** in review modal uses `enrichBatch({ force: true })`.
- Sequential batch with concurrency 2 (non-blocking UI).

---

## Experiment tooling (CLI — `scripts/enrich-fetch/`)

Used to tune V1 before shipping to extension:

| Script | Purpose |
|--------|---------|
| `npm run fetch-test -- <url>` | Single URL, all providers, debug dumps |
| `npm run fetch-experiment -- --from-backup path.json --max N` | Batch → `data/experiments/enrich-fetch/<ts>/results.jsonl`, `ANALYSIS.md`, `bodies/` |
| `pick-urls.mjs` | Random diverse URLs from backup (`--max`, `--per-host`, `--hosts`, `--seed`) |

**Key experiment results (May 2026):**

- **100 random bookmarks:** jina 79–83%, tab 76–78%, local 63–64%, markdown-new 0%. ~90% had ≥1 usable provider; ~10–12% total failure (Reddit, dead links, strict auth).
- **50 platform URLs** (X, t.co, Medium, Reddit, YouTube, GitHub, LinkedIn): GitHub/Medium/X local works; YouTube needs jina; Reddit fails all providers; t.co needs redirect unroll (now in `X_HOSTS`).
- **Pick best provider** when multiple succeed (jina often longest snippet) — V1 still uses first-usable chain; upgrade later.
- **Do not LLM-gate every fetch** — mechanical routing + scoring first.

Artifacts: `data/experiments/enrich-fetch/2026-05-21T02-02-56/` (100 URL), `2026-05-21T03-03-24/` (50 platform).

**Experiment → pipeline mapping (shipped in `hybrid.ts`):**

| Experiment outcome | Extension behavior |
|--------------------|-------------------|
| markdown-new 0% success | Dropped entirely |
| X: local CDN best | `local` → `syndication` chain |
| YouTube: local parse_empty | jina only |
| Articles: local often sufficient | `local` → `jina` fallback |
| Tab rescues JS SPAs (~16–19 URLs) | CLI only; not in extension |
| First-usable chain good enough | No pick-best yet (backlog) |

**Experiments:** complete — no further CLI runs required for Task 01.

---

## Phase 2 Plan (original — superseded by shipped V1 above)

Based on testing, `r.jina.ai` alone struggles with paywalls, Cloudflare blocks, and heavy SPAs. **V1 shipped** a hybrid pipeline (local → jina; X via CDN/syndication). Original plan below kept for history.

### 1. Multi-Layer Fetching (The "Hybrid" Approach) — **DONE (partial)**
Upgrade the fetch pipeline to a resilient, multi-tier flow:
- **Tier 1: Client-Side Local Fetch (New)**
  - **How:** Inject a content script (or use `fetch` with `credentials: 'include'`) and run Mozilla's `Readability.js` + `Turndown` directly in the browser.
  - **Why:** Instant, free, and bypasses paywalls/Cloudflare/login screens by using the user's authenticated browser session.
- **Tier 2: Jina AI (Existing, Improved)**
  - **How:** Fallback to `r.jina.ai` if Tier 1 fails (e.g., saved bookmark not currently open, or heavy SPA).
  - **Improvement:** Update `detectAuthOrEmpty` to aggressively catch Jina's failure states (e.g., "Pardon the interruption", "Are you a robot?", "Target URL returned error 403").
- **Tier 3: Specialized / Heavy Fallback (Future/Optional)**
  - **How:** Fallback to a heavy browser-based service like Firecrawl if Jina hits a captcha (requires user API key).

### 2. Extraction & Cleanup Pipeline (Mechanical + AI) — **DONE**
Clean the raw Markdown dump and map it to the data model:
- **Step A: Mechanical Parsing (Existing)**
  - Keep current logic in `parse.ts` (fast, $0 cost).
- **Step B: AI Summarization & Extraction (New)**
  - Pass the cleaned Markdown (capped at ~10k chars) to a Cloud LLM (e.g., GPT-4o-mini).
  - **Prompt:** Request strict JSON containing:
    - `summary`: High-quality, 2-sentence summary.
    - `improvedTitle`: Clean, readable title (removing boilerplate like "- Bloomberg").
    - `tags`: 3-5 relevant tags based on content.

### 3. Data Mapping & Storage Updates — **DONE**
Map the AI JSON output back to the database:
- **Tier 1 (IDB):** Save AI `summary`, `tags`, and `status` to `item_enrichment`.
- **Tier 2 (Item):** Conditionally overwrite `Item.title` (if AI's is better) and append new `tags` to `Item.tags` or `placements[].tags`.
- **Tier 3 (Disk):** Continue saving the full raw Markdown dump. (Optional: save a structured `.json` containing both raw text and AI metadata).

---

## Goal

Build an **independent fetch/enrichment service** the rest of the app calls through one stable API. Default provider: **`hybrid`** (local → jina; X: CDN → syndication). Enrichment is **best-effort and non-blocking** — downstream work (later: categorization) must always proceed with whatever text already exists on the item.

**Plug-and-play:** swapping or adding providers must not require edits across dashboard/import/AI code — only adapter registration + config.

---

## Product principles (from design discussion)

1. **Live / ongoing process** — enrichment is not one-shot-only. Items can move `pending → ok → stale → refetch` as imports, edits, or user actions change `itemText`.
2. **Enough vs thin local data** — skip or shorten fetch when title/notes/import body already give strong signal; fetch when thin or user explicitly requests.
3. **Content-shaped behavior (lightweight)** — same pipeline, different **eligibility / extract / store** hints by URL class (see scenarios below). Avoid a large per-site crawler framework in v1.
4. **Inconclusive is OK** — store `parse_empty`, `auth_required`, `timeout`, etc.; allow **retry later** with backoff (do not block the app).
5. **Storage split (agreed)** — **main fields filled for fast access** (IndexedDB + small Item updates when missing); **full fetch dump on disk** with **`rawRef`** link. Normal flows never load disk. Fetch is not free — **persist results**, don’t re-fetch blindly.
6. **No AI mapping step** — fetch → parse → store is **deterministic**; later categorization reads `buildItemText(item, enrichment)` (Task 02).
7. **User folder for disk (agreed)** — enrichment cache lives in the **same user-chosen backup area** as `latest.json` (not extension-internal storage). Easier backup/copy/restore alongside DB exports.

---

## Scenarios (v1 behavior matrix)

Use **deterministic URL/import signals first** (host, path, `item.source`, import metadata when present). No extra LLM in this task.

| Scenario | Typical signal | Fetch? | What to persist (minimum) |
|----------|----------------|--------|---------------------------|
| **A. Rich local** | Long notes/description from import; title ≠ URL | Often **skip** (or user “refresh”) | Mark `status: skipped_sufficient_local` + `textHash` of local bundle |
| **B. Thin local** | Title + URL only, short or empty notes | **Yes** | Snippet/summary (capped), optional title improvement, `fetchedAt` |
| **C. X / Twitter** | `x.com`, `twitter.com`, X export fields already on item | **Often yes** for live bookmarks — import text may be only the quoter’s line; fetch fills context | Keep `platform: x`; persist **quoted tweet text at minimum** when present; full thread is bonus (see below) |
| **D. Video hosts** | youtube.com, vimeo.com, etc. | **Yes** (best-effort), **metadata-first** | Title, channel, description, duration if parseable — enough for classification; **no transcript requirement in v1** |
| **E. Simple article** | generic https article | **Yes** | Main text excerpt (cap tokens/chars), title, maybe og-like hints from markdown |
| **F. Non-http / blocked** | `file:`, localhost, denylist | **No** | `status: excluded` + reason code |
| **G. Auth / paywall** | fetch returns login wall / empty | **Try once**, then **backoff** | `auth_required` or `parse_empty`; keep local text |
| **H. Failed transient** | timeout, 429, network | Retry with backoff | `lastErrorCode`, `nextRetryAt` |

**“Inconclusive”** = `parse_empty`, low extracted char count, or `auth_required` → item stays usable; show in UI/report list for refetch.

### X / Twitter — quote tweets (high value)

Common case: user bookmarks a **quote tweet**; the saved title/notes often contain only the quoter’s line, not the **original quoted post**.

**Enrichment priority for X URLs (v1, best-effort):**

1. **Quoted tweet body** — if the page exposes it, extract and store in enrichment snippet/structured fields (e.g. `quotedText`, `quotedAuthor` if parseable). **This is the minimum useful outcome** for quote bookmarks.
2. **Full thread** — include when fetch returns it; do **not** block or fail the job if only the quote is recovered.
3. **Local import text** — keep as primary when X export already has `full_text` / description; fetch **augments** when local text is thin or missing the quoted part.

**Success bar for X:** `ok` if we got quoter + quoted content OR a clearly richer combined snippet than local-only; `parse_empty` / inconclusive if we only repeat the quoter line.

**v1 implementation note:** no custom X API required — use reader markdown + light post-parse heuristics (quote blocks, “Quote” sections, nested status links). If provider output is inconclusive, mark for **refetch**; do not over-build a dedicated crawler.

### Video hosts — metadata only (v1)

**Goal:** enough signal for categorization (title, channel, description, platform), not full content understanding.

- Use same fetch provider; extract what the watch page exposes in markdown/HTML.
- Do **not** depend on transcripts in v1; store `transcriptStatus: not_requested` (or omit).
- **Later (personal / OSS-friendly):** optional paths when worth it — caption APIs where allowed, local Whisper, or user-triggered “deep enrich” with explicit budget. As an open-source personal tool, prefer **proper public APIs + opt-in** over scraping; design enrichment records so transcript can be added without schema break.

---

## Architecture

### Module layout (suggested)

```
src/lib/enrichment/
  types.ts           # EnrichmentRequest, EnrichmentResult, status enums, reason codes
  eligibility.ts     # preflight: fetchable now vs excluded (+ reasons)
  fetchService.ts    # orchestrator: budgets, batching, persistence hooks
  providers/
    types.ts         # FetchProvider interface
    hybrid.ts        # URL-routed chain (default)
    local.ts         # Readability + turndown; X via xCdn
    jina.ts          # r.jina.ai
    syndication.ts   # fxtwitter (X fallback)
    noop.ts          # tests / offline
  storage.ts         # IndexedDB: item_enrichment records (status, snippet, rawRef, hashes)
  rawBodyStore.ts    # disk: read/write full dump via backup folder handle → enrichment-cache/
  itemText.ts        # buildItemText(item, enrichment) for downstream AI (no LLM)
```

### `FetchProvider` interface (minimum)

```ts
fetchUrl(input: { url: string; normalizedUrl: string; hints?: ContentHints }): Promise<{
  ok: boolean;
  markdown?: string;
  title?: string;
  errorCode?: EnrichmentErrorCode;
  rawBytesApprox?: number;
}>;
```

- Provider handles HTTP to `https://r.jina.ai/<url>` (or documented header options later).
- Timeouts and max response size enforced in **service**, not only in provider.

### Public service API (what UI / jobs call)

- `checkEligibility(item | url) → { eligible: boolean; reason?: string }`
- `enrichOne(itemId, options?) → EnrichmentResult`
- `enrichBatch(itemIds | filter, mode: 'smart' | 'full', options?) → { runId, processed, skipped, failed }`
- `getEnrichmentState(itemId) → state`
- `listNeedsAttention(filter?) → items` (failed / inconclusive / stale)

**Smart mode:** cap N items; prefer thin-local + never-fetched + stale; skip rich-local unless forced.  
**Full mode:** same pipeline, higher cap / explicit scope (collection, import batch, all).

### Storage model (agreed — implementer documents paths in PR)

**Principle:** After fetch+parse, **deterministically fill “main” fields** the UI and AI read without opening disk. **Everything else** from the provider response goes to **disk** and is linked by **`rawRef`**. Do not put large bodies in `Item.metadata` or `exportDB` JSON.

**Three tiers:**

| Tier | Where | What |
|------|--------|------|
| **1. IndexedDB** | New store `item_enrichment` keyed by `itemId` | **Main operational + AI-prep fields** — always loaded for lists, enrich status, `buildItemText` |
| **2. Item (small only)** | `Item.title`, `Item.favicon?`, tiny `Item.metadata` | **Fill only when missing or clearly weak** (deterministic rules below); never multi‑KB text |
| **3. Disk** | User backup folder → `enrichment-cache/` | **Full provider dump** (markdown/HTML); linked via `rawRef`; load only on demand |

#### Disk root (agreed)

Use the **same `FileSystemDirectoryHandle` as Settings → backup folder** (`getBackupDirectoryHandle()` in `backupFolder.ts`). This is the user’s real data folder (Dropbox, Documents, etc.) — not extension-local storage.

**Layout (v1):**

```
{userBackupFolder}/          ← already chosen in Settings
  latest.json
  manual-*.json
  enrichment-cache/          ← created on first enrich write
    {itemId}.md              ← rawRef = relative path from cache root
```

- **`rawRef`**: stable relative key, e.g. `{itemId}.md` (resolved under `enrichment-cache/`).
- **Requires backup folder configured** — if no folder / no permission, enrichment may still run but **cannot persist raw** → store IDB fields only, set `hasRawBody: false`, surface “configure backup folder for full cache” in UI (do not fail the batch).
- **Delete on item delete (v1):** remove `{itemId}.md` when item is deleted everywhere.
- **Backup / copy:** user copies the whole backup folder → JSON backups + `enrichment-cache/` travel together.

#### Main fields — deterministic fill (agreed)

**Always write to `item_enrichment` (Tier 1)** when fetch succeeds or is inconclusive with partial parse:

| Field | Rule |
|-------|------|
| `status`, `providerId`, `fetchedAt`, `attempts`, errors, hashes | Standard orchestrator |
| `snippet` / `summary` | Capped excerpt (8–16k chars) from parsed main text — **primary fast-access body** |
| `sourceKind` | From URL/host + import signals (`article \| x \| video \| generic`) |
| `quotedText`, `quotedAuthor` | X: when parse finds quote block |
| `channel`, `description` | Video: metadata-only from parse |
| `rawRef`, `hasRawBody`, `rawBytes` | Set when disk file written |

**Conditionally update `Item` (Tier 2)** — only when local value is missing or weak; **never overwrite** user `notes` / `placements[].notes`:

| Item field | Fill when |
|------------|-----------|
| `title` | Empty, or title ≈ URL/host only, or fetch parse has a **clearly better** title (longer, not URL, differs from normalized URL) |
| `favicon` | Missing and parse exposes icon URL (rule-based, optional v1) |
| `metadata.platform` | X/video URL and not already set (e.g. `x`, `youtube`) |

**Always write disk (Tier 3)** when provider returns a body:

- Write **full markdown** to `enrichment-cache/{itemId}.md` (even if small — keeps one code path).
- IDB holds **snippet + structured fields only**, not the full dump.
- **`loadRawBody(rawRef)`** for debug, re-parse, or explicit `buildItemText({ loadRaw: true })` only.

**Do not** duplicate full body into `Item.notes` or `metadata` — user/import text stays in notes; enrichment augments via Tier 1 + `buildItemText`.

#### Tier 1 — `item_enrichment` (IndexedDB) — required fields

- `itemId`, `normalizedUrl`
- `status`: `none | pending | ok | skipped | failed | stale`
- `providerId`, `fetchedAt`, `attempts`, `lastErrorCode`, `nextRetryAt`
- `contentHash` / `textHash` — skip re-fetch when unchanged
- **`snippet`** / **`summary`** — **capped** (e.g. 8–16k chars); default input for categorization / search prep
- `sourceKind`: `article | x | video | generic`
- **X (when parsed):** `quotedText`, `quotedAuthor?` (short strings in IDB)
- **Video (v1):** `channel?`, `description?` (metadata-only; no transcript)
- **`rawRef`** — stable file key/path relative to cache root (see Tier 3)
- `rawBytes?`, `hasRawBody: boolean` — optional bookkeeping

#### Tier 2 — `Item.metadata` (optional, small)

Use for fields the **bookmark UI** may show without loading disk:

- `metadata.enrichmentSummary` — **avoid** duplicating full snippet if already in `item_enrichment`; prefer single source of truth in `item_enrichment` and read via service API
- `metadata.cover` / image URL (align with import polish backlog)
- `metadata.import` — provenance from Import Studio when committed

**Do not** copy full fetch body into `Item.notes` — `notes` / `placements[].notes` remain **user + import** text; fetch **augments** via `buildItemText`.

#### Tier 3 — disk `rawRef` (full dump)

- **Always** write provider body to disk when backup folder is writable (see layout above).
- **`loadRawBody(rawRef) → string | null`** — async; not used in default UI/AI paths.
- On restore/import: if `rawRef` file missing → mark enrichment `stale`, allow refetch; **snippet in IDB still usable**.

#### Backup / export

- **`exportDB` JSON:** include **`item_enrichment`** rows (structured + snippet + `rawRef`), **exclude** disk bytes.
- **Disk cache:** lives under the same user backup folder as `latest.json`; copying that folder includes `enrichment-cache/`.
- On restore: if `rawRef` file missing, mark `stale` and allow refetch.

#### Downstream contract (no LLM)

```ts
buildItemText(item: Item, enrichment?: ItemEnrichment): string
// = title + url/host hints + notes (local) + enrichment.snippet + quotedText + video description
// Does NOT load disk raw unless options.loadRaw === true
```

Task 02 (categorization) depends on this helper — implement in Task 01.

---

## Non-goals (this task)

- Chunking, embeddings, ANN, categorization
- Video **transcripts** / audio pipelines (deferred; metadata-only in v1)
- Cookie/session auth fetch from user’s logged-in browser
- Import Studio UI overhaul (wire **one** hook: post-import optional “enrich imported” is enough)
- Scheduled `chrome.alarms` global re-enrich (nice follow-up, not required)

---

## UI / integration (minimum)

**Task 01 shipped dev harness only.** Original minimum UI spec partially met via test modals; **product integration deferred.**

1. ~~Settings or Bookmarks tool surface~~ → **Dev:** Enrich/Results buttons (temporary).
2. **Per-item indicator** — not shipped (backlog).
3. **Import hook** “Enrich imported (smart)” — service callable; no product prompt (backlog).

---

## Product UX — not decided (dev UI only today)

Current UI is explicitly **temporary testing** (`EnrichmentPanel` comment in code). Open product questions for a future task:

| Question | Options (not chosen) |
|----------|----------------------|
| **When** does enrich run? | Manual only · on import · on save · background smart batch · scheduled |
| **Where** do results appear? | Bookmark detail tab · list subtitle/badge · nowhere until categorization |
| **User actions** | Retry failed only · enrich thin items · cancel/progress toast |
| **AI visibility** | Show summary in item view · tags only · hidden until Task 02 |
| **Dev modals** | Hide behind flag · remove · keep for admin/debug |

Until decided, **call `enrichBatch` / `enrichOne` from code**; do not assume Enrich/Results modals are the long-term UX.

---

## Budgets & safety

- Default caps: max items per run, concurrent requests (e.g. 2–3), per-request timeout (e.g. 15–30s), max snippet chars stored (e.g. 8–16k).
- Exponential backoff for retries; max attempts per item.
- Never throw from batch loop — record failure per item.
- CORS: extension `host_permissions` only if needed for `r.jina.ai`; document in manifest comment.

---

## Acceptance criteria

- [x] `src/lib/enrichment/` exists with **provider interface** + **hybrid default** + orchestrator.
- [x] Eligibility pass returns **fetchable** vs **excluded** with reason codes aligned to backlog.
- [x] **smart** and **full** batch modes share one code path.
- [x] Per-item state persisted in **`item_enrichment`** and readable after reload.
- [x] **Main fields** filled in **`item_enrichment`** (+ weak `Item.title` when rules match); **full dump** on disk under **`{userBackupFolder}/enrichment-cache/`** with **`rawRef`**; IDB never stores full markdown.
- [x] Enrichment disk writes use **backup folder handle** (same user folder as `latest.json`); graceful degrade if folder not configured.
- [x] `loadRawBody(rawRef)` works; `buildItemText()` uses snippet by default without loading disk.
- [x] User **`notes`** not overwritten by fetch; rule-based title/favicon improve only when appropriate.
- [x] Rich-local items can be **skipped** without network call.
- [x] X/thin-local scenarios behave per matrix (X CDN + syndication; skip when import text sufficient).
- [x] Failures (`timeout`, `auth_required`, `parse_empty`, etc.) do not crash UI; visible in run summary + review modal.
- [x] Another provider can be added by implementing `FetchProvider` + registration — **no** changes outside enrichment module + wiring.
- [x] Manual validation in extension — dev UI re-fetch on reviewed items; first round acceptable (2026-05-20).
- [x] AI extraction (summary/title/tags) after successful fetch.
- [x] AI failure visibility per item (`aiStatus`, `aiError`, Review modal summary section).
- [x] Review UI: **Re-fetch all** + per-item re-fetch (dev harness).

---

## Validation notes (2026-05-20)

Informal smoke via dev UI — not a formal checklist pass, but sufficient to close Task 01:

| # | Case | Pass? | Notes |
|---|------|-------|-------|
| 1 | Article fetch + parse | ✅ | Re-fetch on reviewed items |
| 2 | X / t.co | ✅ | CDN/syndication chain |
| 3 | YouTube / video | ✅ | jina path |
| 4 | Fetch failures (auth/empty) | ✅ | Visible in Review; no crash |
| 5 | AI with API key | ✅ | Tags/summary; aiStatus ok or partial |
| 6 | AI errors / missing key | ✅ | aiStatus + message in Review |
| 7 | Disk cache | ✅ | When backup folder set |
| 8 | Rich local skip | ~ | Not formally re-tested; eligibility code shipped |

---

## Hardening & observability (simple system — not Task 01, plan next)

Per-item state exists (`status`, `lastErrorCode`, `aiStatus`, `aiError`, `attempts`, `nextRetryAt`). **Missing:** run-level and aggregate visibility so failures don’t require opening each item in Review.

**Minimal v1.5 proposal (add to backlog soon):**

| Layer | What | Where / how |
|-------|------|-------------|
| **Run summary** | Last batch: processed / skipped / failed / AI ok / AI failed counts | Persist last `EnrichBatchResult` + timestamp in `chrome.storage.local`; show in Enrichment panel or Test modal footer |
| **Failure buckets** | Count by `lastErrorCode` and `aiStatus` across `item_enrichment` | Small helper `getEnrichmentStats()` → `{ fetchFailed: { auth_required: N, … }, aiFailed: { not_configured: N, api_error: N, … } }` |
| **Needs attention list** | Extend `listNeedsAttention()` — failed fetch, stale raw, **AI failed on ok fetch** | Filter in Review modal sidebar or dedicated “Failures” chip |
| **Export for debug** | JSONL or CSV of failures (itemId, url, fetch code, ai status) | One button in Review modal — no new infra |
| **Retry queue** | Items with `nextRetryAt <= now` | Optional smart batch mode later |

**Principle:** record failures on the item record (already done); add **cheap aggregates + last-run banner** before building a full telemetry system.

---

## Backlog follow-ups (post Task 01)

Copy/pick from here when planning next tasks — **not** Task 01 scope.

### Product / UX

| Item | Priority | Notes |
|------|----------|-------|
| **Enrichment product UX** | **High** | Replace dev modals; decide when/where/how (see [Product UX](#product-ux--not-decided-dev-ui-only-today)) |
| **Per-item enrich indicator** on bookmark list | Medium | ok / failed / skipped badge |
| **Import hook** “Enrich imported (smart)” | Medium | After `bulkImportBookmarks` |

### Fetch pipeline

| Item | Priority | Notes |
|------|----------|-------|
| **Tab provider in extension** | Medium | CLI proves ~16–19 SPA rescues; needs content script or background tab |
| **Deep fetch** | Medium | Configurable depth: follow outbound links, quote context, thread continuation (see backlog “Bookmark enrichment X-first”) |
| **Pick-best provider** | Low | When multiple providers succeed, prefer longest usable snippet (experiments: 88–90% disagree) |
| **t.co redirect unroll** | Medium | HEAD/follow to final URL before X chain |
| **Reddit / strict auth** | Low | Accept `auth_required` in V1; logged-in tab fetch later |
| **Import hook** “Enrich imported (smart)” | Low | `bulkImportBookmarks` → optional prompt |
| **Per-item enrich indicator** on bookmark list | Nice | ok / failed / skipped badge |

### AI quality

| Item | Priority | Notes |
|------|----------|-------|
| **Enrichment prompt tuning** | **High (soon)** | Current prompt is generic JSON extract; tune per `sourceKind` (X vs article vs video); eval set from `data/experiments/enrich-fetch/` bodies |
| **Separate summarize vs tag prompts** | Medium | Use `taskModels.summarize` / `tag` routing; different temperature caps |
| **AI-only re-run** | Medium | Run LLM on existing `snippet` without re-fetch (save API/quota on failed AI-only) |
| **Prompt eval harness** | Medium | CLI script: feed saved `bodies/` → compare prompt versions → score JSON validity + human spot-check |
| **Copy summary to Item** | Low | Optional tier-2 field e.g. `metadata.enrichmentSummary` if UI needs it outside Review |

### Observability (tie to Hardening section)

| Item | Priority | Notes |
|------|----------|-------|
| **Last run stats + failure buckets** | Medium | See [Hardening](#hardening--observability-simple-system-not-task-01-but-plan-next) |
| **Review modal “Failures only” filter** | Low | Filter by `lastErrorCode` / `aiStatus != ok` |
| **Scheduled re-enrich stale/failed** | Low | `chrome.alarms` — deferred in original task non-goals |

### Next product task

| Item | Priority | Notes |
|------|----------|-------|
| **Task 02 — categorization** | **Next** | Consumes `buildItemText(item, enrichment)` — **unblocked** |

---

## Remaining / deferred (quick reference)

| Item | Priority |
|------|----------|
| **Enrichment product UX** | High |
| Task 02 categorization | Next |
| Enrichment AI prompt tuning | High |
| Hardening: run stats + failure aggregates | Medium |
| Tab provider in extension, deep fetch | Medium |
| t.co unroll, pick-best, list indicator | Low–Medium |

**Verdict:** Task 01 **closed**. Service + experiment-driven pipeline shipped. Product UX and polish live in backlog.

---

## Return to master session

```markdown
## Task 01 return — CLOSED 2026-05-20

### Achieved
- Independent enrichment service: `enrichOne`, `enrichBatch` (smart/full), `checkEligibility`, `buildItemText`
- Hybrid fetch pipeline from CLI experiments: X (CDN→syndication), video (jina), article (local→jina); markdown-new dropped
- Storage: IDB `item_enrichment` + disk `{backupFolder}/enrichment-cache/{itemId}.md` + tier-2 Item updates (title/tags/platform)
- AI: OpenRouter extract (summary, improvedTitle, tags); aiStatus/aiError; does not gate fetch success
- Dev UI: EnrichmentPanel → Test modal + Review modal (re-fetch all/one) — **temporary, not product workflow**
- CLI: `scripts/enrich-fetch/` — 100 + 50 URL experiments complete; artifacts under `data/experiments/enrich-fetch/2026-05-21-*`

### Validated
- Extension dev UI: batch enrich + re-fetch on reviewed bookmarks — first round acceptable

### Not in Task 01 (backlog / next tasks)
- **Product enrichment UX** — when to run, where to show results (modals are dev-only)
- Task 02 categorization (ready to start — uses `buildItemText`)
- Hardening: run-level stats, failure aggregates
- AI prompt tuning per sourceKind; deep fetch; tab provider in extension

### Key files
- `src/lib/enrichment/*` (orchestrator, hybrid, aiExtract, types, itemText)
- `src/components/dashboard/EnrichmentPanel.tsx`, `EnrichmentTestModal.tsx`, `EnrichmentReviewModal.tsx`
- `scripts/enrich-fetch/`
- Spec: `docs/temp/TASK-01-fetch-enrichment-v1.md`

### Ready for Task 02
**Yes** — enrichment service is plug-and-play; categorization should call `buildItemText(item, enrichment)` without new fetch UI.
```

---

## References

- Backlog bullet: **Phase B — Fetch enrichment v1**
- Import already parses X fields in `ImportStudioView.tsx` — enrichment should **reuse**, not duplicate, that text when present
- `normalizeBookmarkUrl` in `src/lib/db.ts` for URL keys
