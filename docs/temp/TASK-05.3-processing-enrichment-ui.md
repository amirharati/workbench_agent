# TASK-05.3 — Processing status + enrichment display (W1, UI-first)

**Status:** **Shipped** (2026-05-27)
**Depends on:** [TASK-05.1](TASK-05.1-home-right-panel.md), [TASK-05.2](TASK-05.2-product-search.md), [V2-PRODUCT-DESIGN-SPEC.md](V2-PRODUCT-DESIGN-SPEC.md) §3–4, §11  
**Policy:** [**V2-DEFERRED-TRACKER.md**](V2-DEFERRED-TRACKER.md) — **no new DB fields**; favorites/pins/trash stay placeholders  
**Workflows:** W1 (finish daily “read digested corpus”); touches W4 display only (no rerun actions yet)

---

## Goal

User can **see** enrichment and pipeline state in product UI using **existing stores** — without dev hub, without schema migrations.

**Not in scope:** pin/favorite/trash, import hooks, batch rerun, accept/reject writes (→ **05.4**), new IndexedDB version.

---

## In scope

### 1. Data loading (read-only helpers)

Add a small hook or loader (e.g. `useItemPipelineContext(itemId)`) that reads from IndexedDB:

| Store | Use |
|-------|-----|
| `item_enrichment` | `summary`, `keyPoints`, `aiStatus`, `tags` |
| `ai_item_signals` | `classifyState`, `signalStatus`, embedding presence |
| `ai_item_category_links` + `ai_categories` | Primary + suggested category labels |
| `items` | title, url, notes, placements |

Reuse patterns from `EnrichmentReviewModal` / `PipelineDevView` row builders — **do not fork** eligibility logic; import from `src/lib/enrichment`, `src/lib/categorization` where possible.

### 2. `StatusBadge` wiring

Component exists: `src/components/StatusBadge.tsx`.

Map pipeline state → badge variant (spec §11):

| State | When |
|-------|------|
| Not processed | No enrichment or not eligible |
| Processing | Optional: only if you have in-flight flag; else skip |
| Ready | `aiStatus === 'ok'` + classified or embed ok |
| Needs review | `classifyState === 'manual_review'` or suggested links |
| Failed | `aiStatus` failed / `embed_failed` / etc. |

**Place badges on:**

- Bookmark list rows (`ItemsListPanel` or shared row component)
- `ProductSearchView` result cards
- Inspector header (compact)

### 3. Item tab body (primary reading surface)

Per spec decision #4 — in `GlobalTabSystem` item detail (`.reading-content`):

- AI **summary** (if `item_enrichment.aiStatus === 'ok'`)
- **Key points** bullet list
- Empty state: “Not enriched yet” + link text pointing to dev hub or future pipeline panel (no new runner in 05.3)

Keep title, URL, notes edit as today.

### 4. `InspectorTab` (replace placeholder)

Populate sections from spec §4 (read-only for 05.3):

- Processing status badges
- AI summary + key points (collapsible)
- Categories: show **accepted** + **suggested** labels (read-only; actions in 05.4)
- **Similar items:** `runAppFindSimilar` / `findSimilarItems` (already in app search lib)
- Related topics/links: reuse `SearchDiscoveryBlocks` or thin wrapper when item is context

Keep search-history block when `isSearchSurface`.

### 5. Home cards (real data where stores exist)

| Card | 05.3 behavior |
|------|----------------|
| **Recently Added** | Already works — keep |
| **Processing Digest** | Real counts: e.g. needs review, enrich failed, unclassified — query `ai_item_signals` / links / enrichment (same aggregates as dev queue, simplified copy) |
| **Library Overview** | Top N `ai_categories` (leaf) with counts → click opens Bookmarks with filter or aggregate tab (simplest: navigate Bookmarks + pass filter in state) |
| **Favorites** | **Placeholder only** — “Coming soon” (see deferred tracker D-01/D-02) |

### 6. Optional small polish

- Unify search result click → Inspector (from 05.2 known gap) if quick
- Bookmarks list: optional filter chip “AI category” if filter state is easy without new API

---

## Out of scope (explicit)

- `pinned` / `favorite` / `deletedAt` fields (D-01…D-03)
- Accept / reject / change category (**05.4**)
- Trigger enrich/classify/embed from product UI — **05.5 shipped** (single-link); batch → **05.6** / D-20
- Home Favorites real data
- StatusBar auto-wiring from pipeline (optional nice-to-have; not required)
- New CLI or backup format changes

---

## Key files (likely)

| Area | Files |
|------|--------|
| Loader | new `src/hooks/useItemPipelineContext.ts` or `src/lib/pipeline/itemPipelineContext.ts` |
| Inspector | `InspectorTab.tsx` |
| Item detail | `GlobalTabSystem.tsx` |
| Lists / search | `ItemsListPanel.tsx`, `ProductSearchView.tsx` |
| Home | `HomeView.tsx` |
| Similar | `src/lib/search/appSearch.ts` (`runAppFindSimilar`) |

---

## Acceptance criteria

- [x] Opening a bookmark with enrichment shows **summary + key points** in item tab without dev hub
- [x] Inspector shows summary, categories (read-only), similar items for enriched item
- [x] List + search result rows show **StatusBadge** for common states
- [x] Home **Processing Digest** shows real counts (or hides when healthy)
- [x] Home **Library Overview** shows real category tiles with counts; click navigates to filtered browse
- [x] Home **Favorites** remains placeholder (no fake data)
- [x] Dev hub unchanged; `npm run build` passes

---

## Return template

```markdown
## Task 05.3 return
- Shipped: Read-only pipeline/enrichment display across item tabs, Inspector, bookmark lists, search results, and Home digest/overview cards; category browse filter on Bookmarks.
- Files: `src/lib/pipeline/*`, `src/hooks/useItemPipelineContext.ts`, `usePipelineBadgeMap.ts`, `useHomePipelineStats.ts`, `PipelineDisplayBlocks.tsx`, `InspectorTab.tsx`, `GlobalTabSystem.tsx`, `ProductSearchView.tsx`, `HomeView.tsx`, `MainContent.tsx`, `DashboardLayout.tsx`
- Badge mapping table used: Failed (fetch/AI/embed errors) → error; Needs review (`manual_review` or suggested links) → warning; Ready/Enriched (`aiStatus === ok` + classify/embed) → success; Not processed → info
- Home digest queries: `loadProcessingDigest()` (enrichment failures + `getCategorizationQueueStats`); overview via `loadLibraryCategoryOverview(8)` + `loadItemIdsForCategory` on tile click
- Deferred to 05.4 / tracker: accept/reject category writes, pipeline triggers from product UI, Favorites real data, search result open/selection polish (05.2 gap), `ItemsListPanel` badges, **AI display presentation pass** (see Known gaps below)
```

---

## Known gaps (defer — not blocking 05.3 close)

**Intent:** Data is wired read-only across the product shell. Presentation is a **good first pass**; expect a dedicated UX polish pass before calling W1 “done.” Track here and in [`V2-DEFERRED-TRACKER.md`](V2-DEFERRED-TRACKER.md) § D-40….

| Gap | Where today | Notes / desired direction |
|-----|-------------|---------------------------|
| **AI signal density on lists** | Bookmark list (full + split pane), search result cards | `StatusBadge` on most bookmark rows can feel noisy (many “Not processed”). Later: show badge only when actionable (failed / needs review), hover/tooltip for rest, or compact dot + legend. |
| **Badge placement & alignment** | List rows, grid cards, search titles | Badges sit inline with title/tags; may need consistent column, smaller compact variant, or hide in grid until hover. |
| **Duplicate enrichment surfaces** | Item tab body + Inspector + search snippet | Summary/key points appear in multiple places with similar copy. Later: single **primary reading** surface (item tab) + Inspector as metadata/actions; trim repetition. |
| **Home Processing Digest copy/layout** | `HomeView` card | Counts are real but raw (needs review, enrich failed, pending classify, not enriched). Later: clearer hierarchy, clickable rows → filtered Bookmarks, hide “not enriched” when low-signal, align labels with dev queue terminology. |
| **Home Library Overview** | Category tiles | Top-N leaf categories + count works; later: parent grouping, empty/deprecated handling, visual tiles vs text list, breadcrumb when filtered. |
| **Category browse filter** | Bookmarks header chip | Functional filter from overview click; later: persist filter in URL/state, show in sidebar scope, combine with collection/project filters without confusion. |
| **Empty / dev-hub messaging** | Item tab, Inspector | “Run fetch enrichment from dev hub” is accurate but not product-polished. Later: softer empty state + link to Settings → Dev tools (or future W4 panel). |
| **Stats semantics** | `loadProcessingDigest` | `notEnriched` vs `pendingClassify` can overlap conceptually for users. Later: reconcile counts with badge states and dev queue for one mental model. |
| **Collections / Projects lists** | `ItemsListPanel` | Badges not wired outside Bookmarks main view. Later: shared row component or pass `badgeMap` everywhere items appear. |
| **Search + pipeline together** | Search results + Inspector | Category chips + StatusBadge + match reason compete visually. Later: one-line metadata row, spec §11 styling pass. |
| **Result open/selection** | From 05.2 | Still inconsistent (click → Inspector vs open tab). Track in 05.2 known gaps; unify in a small **05.2.x / 05.7** interaction pass. |

**Suggested tracking ID:** `D-40` — AI/pipeline **presentation polish** (UI only, no schema). Optional slice: **05.3.x** or fold into **05.7** shell polish.

---

## After 05.3

| Next | Closes |
|------|--------|
| **05.4** | W6 — accept/reject (writes to existing `ai_item_category_links.status`) |
| **05.5** | W2 single-link digest — **done** |
| **05.6+** | W3/W4 batch import + maintenance (see tracker D-21…) |
| **05.3.x / D-40** | How AI badges, digest stats, and enrichment blocks **look** — presentation pass only |
| **Deferred pass** | D-01…D-05 schema, then favorites UI |

*Last updated: 2026-05-27 — Shipped; presentation polish tracked in Known gaps (D-40).*
