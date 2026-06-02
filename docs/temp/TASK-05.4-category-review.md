# TASK-05.4 — Category review + user signals (W1 / W6 slice)

**Status:** **done** — implementation session 2026-05-27 (includes post-ship digest + taxonomy UX)  
**Depends on:** [TASK-05.3](TASK-05.3-processing-enrichment-ui.md) (read-only enrichment + categories in Inspector)  
**Policy:** [V2-DEFERRED-TRACKER.md](V2-DEFERRED-TRACKER.md) — **no new DB fields**; favorites/pins unchanged  
**Workflows:** **W6** (accept/reject AI category links); completes core **W1** “act on digested corpus” (read was 05.3)

---

## Documentation rule (required)

**Implementation session:**

- **Only update this file** (`TASK-05.4-category-review.md`) — fill return template, check acceptance criteria, add “Known gaps” if needed.
- **Do not edit** `docs/backlog.md`, `docs/OVERVIEW.md`, `docs/temp/README.md`, `V2-PRODUCT-DESIGN-SPEC.md`, or other umbrella docs.

**Master session** updates higher-level docs after your return.

---

## Goal

User can **accept or reject** AI-suggested category links from the **product Inspector** (and see updates reflected in badges, Home digest, and browse filters). Uses existing `ai_item_category_links.status` — no schema migration.

**Stretch (same task if time):** Home Processing Digest actionable lines open Bookmarks filtered by queue (`manual_review`, suggested AI links, etc.). Originally a single **Review** button; shipped as **separate queues** (see Post-ship).

**Not in scope:** Re-run classify, new categories, concept DAG, favorites/pins, presentation-only pass (**D-40**), search click polish (**D-41**).

---

## App context (fresh session)

Chrome MV3 extension — React 18 + TypeScript + Vite. State-driven `DashboardLayout` (no React Router). Styling: CSS variables + inline styles.

### Shipped (05.1–05.3)

| Area | Key files |
|------|-----------|
| Shell | `DashboardLayout.tsx`, `HomeView.tsx`, `RightPanel.tsx`, `InspectorTab.tsx` |
| Pipeline read | `src/lib/pipeline/itemPipelineContext.ts`, `useItemPipelineContext.ts`, `PipelineDisplayBlocks.tsx`, `pipelineBadge.ts` |
| Search | `ProductSearchView.tsx`, `useLibrarySearch.ts` |
| Categories read | Inspector shows `acceptedLinks` + `suggestedLinks` as chips (read-only) |

### Data model (already in DB + backup)

```typescript
// src/lib/categorization/types.ts
export type AiLinkStatus = 'suggested' | 'accepted' | 'rejected';

export interface AiItemCategoryLink {
  id: string;
  itemId: string;
  categoryId: string;
  score: number;
  isPrimary: boolean;
  source: AiLinkSource;  // 'ai' | 'manual' etc.
  status: AiLinkStatus;
  created_at: number;
  updated_at: number;
}
```

**Countable for search/browse today:** `suggested` + `accepted` (see `COUNTABLE_LINK_STATUSES` in `itemPipelineContext.ts`, `counts.ts`, `devQueries.ts`). **`rejected`** links should **not** count as primary/browse unless you explicitly decide otherwise — document choice in return.

**Link id helper:** `aiLinkId(itemId, categoryId)` in `src/lib/categorization/service.ts`.

**Existing reads:** `getAiLinksForItem(itemId)` in `service.ts`.

**No existing product writes** for accept/reject — you add them.

---

## Design spec references

| Topic | Section |
|-------|---------|
| Inspector category actions | [V2-PRODUCT-DESIGN-SPEC.md](V2-PRODUCT-DESIGN-SPEC.md) §4 (Categories: Accept / Reject / Change) |
| W6 workflow | Spec §13 (W6 — Improvement from user signals) |
| Product vs dev | Spec §14 — dev taxonomy tree unchanged |

---

## Implementation plan

### 1. Category link mutations (shared lib)

Add functions in **`src/lib/categorization/`** (new `categoryReview.ts` or extend `service.ts` — prefer small dedicated module exported from `categorization/index.ts`):

| Function | Behavior |
|----------|----------|
| `acceptAiCategoryLink(linkId)` | Load link by id; if `status !== 'suggested'` no-op or error; set `status: 'accepted'`, `updated_at: now`; `put` in transaction |
| `rejectAiCategoryLink(linkId)` | Set `status: 'rejected'`, `updated_at: now` |
| Optional: `acceptAiCategoryLinkByIds(itemId, categoryId)` | Resolve via `aiLinkId` |

**Rules:**

- Only mutate links where `source === 'ai'` (do not overwrite manual links).
- After write: call `notifyDataChanged('categorization.review')` from `src/lib/dataChangeNotifier.ts` (add reason string if needed).
- Do **not** re-run LLM classify in this task.
- **Primary flag:** On accept of a suggested link that has `isPrimary: true`, keep `isPrimary`; if accepting a non-primary suggestion as new primary, **optional MVP:** only accept status, do not reassign primary (document in return). Full primary swap → defer.

**Change category (dropdown):** **Optional for 05.4.** If omitted, show disabled “Change…” with tooltip “Coming soon” or hide. Accept + Reject is minimum bar.

### 2. Inspector UI (`InspectorTab.tsx`)

Replace read-only suggested chips with **action rows** per suggested link:

```text
[suggested chip]  score optional
[Accept ✓]  [Reject ✗]
```

- On success: refresh context (`useItemPipelineContext` should re-fetch — add `reload` counter param or call `loadItemPipelineContext` again).
- Toast on success/error (use existing `ToastProvider` / patterns from `DashboardLayout`).
- **Accepted** links: show as chips (no reject required for 05.4 unless spec wants un-accept — defer).
- Empty state: keep “Not yet classified…” when no links.

### 3. Badge + digest refresh

After accept/reject:

- Inspector badge should update (`resolvePipelineBadge` uses `hasSuggestedLinks`, `classifyState`).
- If parent passes `onPipelineChange` from `DashboardLayout`, bump `usePipelineBadgeMap` / `useHomePipelineStats` reload (simplest: `window` event, callback prop, or increment refresh key in layout).

**Minimum:** Re-open Inspector or navigate away/back shows correct state. **Better:** Lists and Home digest update without full page reload.

### 4. Home digest “Review” (stretch)

In `HomeView.tsx` Processing Digest card:

- When `digest.needsReview > 0`, **Review** button navigates to Bookmarks with filter for items in `manual_review` or with `suggested` AI links.
- Reuse pattern from 05.3 category browse: `onBrowseCategory` / new `onReviewQueue` callback on `DashboardLayout` → set filter state in `MainContent` (e.g. `pipelineFilter: 'needs_review'`).

If too heavy for one session, document as deferred in return — **Accept/Reject in Inspector is still required for close.**

### 5. Dev hub

**No changes** to `PipelineDevView` / `CategorizationPanel` required. Product path is the deliverable.

---

## Post-ship additions (same session, beyond brief)

User feedback and inspection needs — still no schema changes.

### A. Split Processing Digest queues

Replaced one combined “Needs review” count/filter with **five independent queues** (each line hidden when count = 0; click opens Bookmarks filter):

| Digest line | `PipelineQueueKind` | Item set |
|-------------|---------------------|----------|
| AI categories | `suggested_categories` | Items with AI link `status === 'suggested'` |
| Manual review | `manual_review` | Signal `classifyState === 'manual_review'` |
| Enrich failed | `enrich_failed` | Fetch/AI/embed failures |
| Pending classify | `pending_classify` | `pending_classify` + unassigned eligible (queue parity) |
| Not enriched | `not_enriched` | No enrichment row / `status === 'none'` |

- Shared loader: `computePipelineQueues()` / `loadItemIdsForPipelineQueue(kind)` in `itemPipelineContext.ts`
- `ProcessingDigest` fields: `manualReview`, `suggestedCategories`, `enrichFailed`, `notEnriched`, `pendingClassify` (removed combined `needsReview`)
- `PipelineBrowseFilter` replaces `ReviewBrowseFilter`; filter chip in bookmark list pane
- **Badge labels** aligned: “Manual review”, “AI categories”, “Pending classify” (`pipelineBadge.ts`)
- Navigating away from Bookmarks clears pipeline/category browse filters

**Bugfix:** Digest initially counted only `queue.manualReview` while badges used manual ∪ suggested — counts now match per-queue definitions.

### B. Tools → AI Categories (taxonomy inspector)

Read-only product page for full taxonomy inspection (not Home, not dev hub):

- **Nav:** Tools → **AI Categories** (`DashboardView`: `ai-categories`, full-page like Settings)
- **UI:** `AiCategoriesView.tsx` — parents expandable, leaves with primary/total counts, orphan leaves, search filter, Refresh
- **Browse:** per parent or leaf → Bookmarks (`getTaxonomyTreeWithCounts` from `devQueries.ts`)
- **Browse fix:** `loadItemIdsForCategory(parentId)` aggregates all child leaf link ids (parent browse was broken for leaf-only filter)

**Home Library Overview** unchanged (top **leaf** categories by count); full tree lives under Tools.

---

## UX copy (product)

| Action | Label |
|--------|--------|
| Accept | Accept |
| Reject | Reject |
| Success toast | Category accepted / Category rejected |
| Error | Could not update category (show short reason) |

Clarify in UI: **AI categories** are not the same as **Collections** (one line hint in Categories section header is enough).

---

## Key files (expected touch)

| Action | Path |
|--------|------|
| **Create** | `src/lib/categorization/categoryReview.ts` (or equivalent) |
| **Edit** | `src/lib/categorization/index.ts` (exports) |
| **Edit** | `src/components/dashboard/InspectorTab.tsx` |
| **Edit** | `src/hooks/useItemPipelineContext.ts` (reload after mutation) |
| **Maybe** | `DashboardLayout.tsx`, `HomeView.tsx`, `MainContent.tsx` (digest queues + filter) |
| **Post-ship create** | `src/components/dashboard/AiCategoriesView.tsx` |
| **Post-ship edit** | `src/lib/pipeline/pipelineBadge.ts`, `src/components/dashboard/layout/LeftSidebar.tsx` |
| **Do not** | `db.ts` schema version bump unless unavoidable (should not be) |

---

## Acceptance criteria

### Required

- [x] User can **Accept** a suggested AI category link from Inspector; link `status` becomes `accepted` in IndexedDB
- [x] User can **Reject** a suggested link; `status` becomes `rejected`
- [x] Suggested links no longer show Accept/Reject after action; accepted show as accepted chips
- [x] Mutations call `notifyDataChanged` so backup coordinator can debounce export
- [x] `npm run build` passes
- [x] Dev hub behavior unchanged

### Stretch

- [x] Home digest actionable lines open filtered bookmark lists per queue (exceeds single “Review” button)
- [x] Badge map / digest counts update without manual refresh (describe mechanism in return)

### Post-ship (same session)

- [x] Separate digest lines + filters: AI categories, manual review, enrich failed, pending classify, not enriched
- [x] Badge labels distinguish manual review vs AI categories vs pending classify
- [x] Tools → AI Categories full-page taxonomy inspector with browse
- [x] Parent category browse aggregates child leaf items

### Explicitly out of scope

- [ ] Favorites / pins / trash (D-01…D-03)
- [ ] New `Item` fields or IndexedDB v8 migration
- [ ] D-40 presentation polish (badge density, dedupe summary blocks)
- [ ] D-41 search result click consistency
- [ ] Trigger classify / enrich / embed from product UI (05.5+)
- [ ] Editing `docs/backlog.md` / `OVERVIEW.md` / `README.md` (master only)

---

## Testing hints (manual)

1. Pick item with **suggested** category in dev data (Inspector shows “(suggested)”).
2. Accept → reload Inspector → chip shows accepted; search/browse still sane.
3. Reject another suggestion → status rejected; not offered as primary in `loadItemPipelineContext` accepted list.
4. Export backup JSON → confirm `ai_item_category_links[].status` updated.
5. Home digest **AI categories** count decreases after accept/reject; badge label clears when no suggested links remain.
6. Click digest **Manual review** vs **AI categories** — each opens a different filtered bookmark set.
7. Tools → AI Categories — expand parent, browse leaf/parent, counts match dev taxonomy.
8. Export backup JSON → confirm `ai_item_category_links[].status` updated.

---

## Task 05.4 return

- **Shipped (core):** Accept/Reject for AI `suggested` links in Inspector; `categoryReview.ts` + `notifyDataChanged('categorization.review')`; auto-refresh via `subscribeToDataChanges` on Inspector context, bookmark badges, Home digest, AI Categories page.
- **Shipped (post-ship):** Processing Digest split into five clickable queues (`PipelineQueueKind`, `PipelineBrowseFilter`); distinct list badges; Tools → **AI Categories** read-only taxonomy page; parent-aware `loadItemIdsForCategory`.
- **Files:** `categoryReview.ts`, `categorization/index.ts`, `dataChangeNotifier.ts`, `itemPipelineContext.ts`, `pipelineBadge.ts`, `useItemPipelineContext.ts`, `useHomePipelineStats.ts`, `usePipelineBadgeMap.ts`, `InspectorTab.tsx`, `HomeView.tsx`, `AiCategoriesView.tsx`, `DashboardLayout.tsx`, `MainContent.tsx`, `LeftSidebar.tsx`
- **Primary / rejected semantics:** Rejected links excluded from `COUNTABLE_LINK_STATUSES` (`suggested` + `accepted` only) — not in browse/tiles/`primaryLeafIdFromLinks`. Accept keeps existing `isPrimary`; no primary swap on accept (MVP).
- **Refresh strategy:** `notifyDataChanged('categorization.review')` (and related reasons) → `subscribeToDataChanges` in hooks + `AiCategoriesView`; Inspector calls `reload()` after accept/reject.
- **Digest / filters:** Per-queue counts from `loadPipelineQueueData()`; click digest line → `onPipelineBrowse(kind)` → Bookmarks with `pipelineBrowse` chip. **AI categories** queue = suggested links only; **Manual review** = classify queue only (no longer lumped).
- **Library Overview vs Tools:** Home card still shows top **leaf** categories by count (unchanged). Full parent/leaf tree + counts → Tools → AI Categories.
- **Deviations from brief:** “Change category” not implemented (optional). Single digest **Review** button superseded by per-queue lines (better UX). Combined `needsReview` digest field removed.
- **Suggested master doc updates:** Mark 05.4 done; W6 accept/reject in Inspector; product digest queues + AI Categories tool page; D-40/D-41 still open.
- **Known gaps / follow-ups:** Change category dropdown; un-accept accepted links; primary reassignment on accept; Home Library Overview could switch to parent tiles later; D-40 presentation polish. Pipeline triggers → **05.5** (done).

---

## After 05.4 (master planning — do not implement here)

| ID | What |
|----|------|
| **D-40** | W1 presentation polish (badges, digest copy, dedupe surfaces) |
| **D-41** | Search result interaction consistency |
| **05.5+** | W2 single-link digest product UX (pipeline triggers) |
| **05.B** | Schema: favorites/pins when ready |

*Last updated: 2026-05-27 — Done. Core: W6 accept/reject. Post-ship: split digest queues, AI Categories tool page, badge/digest alignment.*
