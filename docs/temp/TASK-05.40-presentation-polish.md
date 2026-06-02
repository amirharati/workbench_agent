# TASK-05.40 (D-40) — AI / pipeline presentation polish (W1)

**Status:** **done** — 2026-05-27 (Tier A + Tier B)  
**Tracker ID:** **D-40** in [`V2-DEFERRED-TRACKER.md`](V2-DEFERRED-TRACKER.md)  
**Depends on:** [TASK-05.3](TASK-05.3-processing-enrichment-ui.md) (data wired), [TASK-05.4](TASK-05.4-category-review.md), [TASK-05.5](TASK-05.5-single-link-digest.md), [TASK-05.6](TASK-05.6-import-batch-maintenance.md)  
**Design:** [V2-PRODUCT-DESIGN-SPEC.md](V2-PRODUCT-DESIGN-SPEC.md) §11 (status tiers), § W1  
**Policy:** **UI only** — no schema, no new pipeline logic, no dev hub removal

**Note:** Next *numbered* umbrella subtask is **05.7** (shell). This brief is the recommended **polish slice** before 05.7. **D-41** (search clicks) is a separate brief if needed.

---

## Documentation rule (required)

**Worker session:**

- **Only update this file** (`TASK-05.40-presentation-polish.md`).
- **Do not edit** `backlog.md`, `OVERVIEW.md`, `README.md`, umbrella `TASK-05-v2-product-ux.md`, or design spec.

**Master session** syncs higher-level docs after your return.

---

## Goal

Make the **product shell** feel intentional, not “dev data with badges everywhere.” All pipeline **data and actions** already exist (05.3–05.6); this task improves **density, hierarchy, copy, deduplication, and consistency** across surfaces.

**Success:** A user browsing Bookmarks, Search, Home, and item tabs understands status at a glance without badge fatigue; enrichment is readable in **one primary place** per screen.

---

## Non-goals (do not implement here)

- New pipeline triggers, batch runners, or import flows (**05.6** done)
- Search click/keyboard model (**D-41** — separate task)
- Shell layout phase 2: scope chips, persisted splits, keyboard nav (**05.7**)
- Favorites/pins/trash (**D-01…D-03**)
- Suspicious-fetch review UI (**D-25**)
- User-signal → pipeline policy (**D-26**)
- Dev hub changes (**05.8**)

---

## Source of truth for gaps

Primary list: [`TASK-05.3-processing-enrichment-ui.md`](TASK-05.3-processing-enrichment-ui.md) § **Known gaps (defer)**.  
Cross-ref: [`TASK-05.2-product-search.md`](TASK-05.2-product-search.md) § Known gaps (search + pipeline visuals only).

---

## Recommended scope (phased — pick slices with user)

### Tier A — High impact (target for closing D-40)

| # | Gap | Surfaces | Direction |
|---|-----|----------|-----------|
| A1 | **Badge noise on lists** | Bookmarks list, split pane, `ProductSearchView` results | Show badge only when **actionable**: `failed`, `needs_review` (manual review, AI categories). **Ready** / **Not processed** → omit or compact dot + legend in list header. Use `resolvePipelineBadge` + `PipelineBadgeKind` in `pipelineBadge.ts`. |
| A2 | **Shared row treatment** | `MainContent` bookmark rows, search rows | Extract or extend **`PipelineDisplayBlocks`** / small `BookmarkRowStatus` so list + search use same rules (avoid Bookmarks-only badge map). |
| A3 | **Home Processing Digest** | `HomeView.tsx` | Clearer labels (match queue names in `itemPipelineContext.ts`); visual hierarchy; de-emphasize **not enriched** when 0 or low-signal; keep clickable browse + batch button from 05.6. |
| A4 | **Empty / dev messaging** | Item tab, Inspector, enrichment empty states | Replace “run from dev hub” with product copy: e.g. **Run digest** in Inspector, **Process not enriched** on Home, Settings → Advanced (placeholder until 05.8). |
| A5 | **Dedupe enrichment copy** | Item tab body vs Inspector vs search snippet | **Item tab** = primary reading (summary + key points). **Inspector** = categories, similar, actions, compact summary or collapsed. **Search** = snippet + one status indicator, not full key points block. |

### Tier B — If time (document deferral if skipped)

| # | Gap | Notes |
|---|-----|--------|
| B1 | **Search metadata row** | One line: status + category + match reason — reduce chip/badge stacking |
| B2 | **Category browse chip** | Bookmarks filter chip: clearer label when `categoryBrowse` / `pipelineBrowse` active |
| B3 | **Library Overview tiles** | Home category tiles: spacing, empty state, deprecated categories |
| B4 | **ItemsListPanel** | Wire `usePipelineBadgeMap` or shared row in collection/project item lists if used in product paths |
| B5 | **Stats semantics** | Align digest line tooltips with badge kinds (optional copy pass only) |

### Explicitly separate task

| ID | Item |
|----|------|
| **D-41** | Unify search result click / double-click / Enter → Inspector vs item tab ([`TASK-05.2`](TASK-05.2-product-search.md)) |

---

## What exists today (read first)

| Piece | Location |
|-------|----------|
| Badge resolution | `src/lib/pipeline/pipelineBadge.ts` — `PipelineBadgeKind`: `not_processed`, `ready`, `needs_review`, `failed` |
| Badge UI | `src/components/dashboard/PipelineDisplayBlocks.tsx` — `ItemPipelineBadge` |
| Badge map hook | `src/hooks/usePipelineBadgeMap.ts` |
| Pipeline context | `src/hooks/useItemPipelineContext.ts`, `src/lib/pipeline/itemPipelineContext.ts` |
| Home digest | `src/components/dashboard/HomeView.tsx` — queues + `onPipelineBrowse` + batch (05.6) |
| Search results | `src/components/dashboard/ProductSearchView.tsx` |
| Item tab | `src/components/dashboard/GlobalTabSystem.tsx` |
| Inspector | `src/components/dashboard/InspectorTab.tsx` |
| Status component | `src/components/StatusBadge.tsx` (generic; pipeline uses `ItemPipelineBadge`) |

**Rule:** Prefer adjusting **when** badges render and **layout/copy**, not changing eligibility or DB writes.

---

## Open questions (ask user before large refactors)

| # | Question | Default if no answer |
|---|----------|----------------------|
| **Q1** | Hide **Ready** badges on list rows entirely? | **Yes** — show only failed + needs_review |
| **Q2** | **Not processed** on lists: hidden vs small gray dot? | **Hidden** on rows; show count on Home digest only |
| **Q3** | Inspector summary: **collapsed by default** when item tab open? | **Yes** if item tab visible; full when Inspector-only (search) |
| **Q4** | Include **Tier B** in this session or ship Tier A only? | **Tier A only** |
| **Q5** | Touch **Side panel** digest panel styling? | **Light touch only** (same badge rules) |

---

## Implementation hints

1. Add helper e.g. `shouldShowListPipelineBadge(badge: PipelineBadge): boolean` in `pipelineBadge.ts` (single place for A1/A2).
2. Avoid N+1: keep `usePipelineBadgeMap` batching; don’t per-row `loadItemPipelineContext` in lists.
3. Use existing CSS variables / `var(--text-muted)` — no new design system.
4. Manual regression: 05.5 digest, 05.6 import report, 05.4 accept/reject, 05.2 search still work.
5. `npm run build` required.

---

## Key files (expected touch)

| Action | Path |
|--------|------|
| **Edit** | `src/lib/pipeline/pipelineBadge.ts` |
| **Edit** | `src/components/dashboard/PipelineDisplayBlocks.tsx` |
| **Edit** | `src/components/dashboard/HomeView.tsx` |
| **Edit** | `src/components/dashboard/ProductSearchView.tsx` |
| **Edit** | `src/components/dashboard/GlobalTabSystem.tsx` |
| **Edit** | `src/components/dashboard/InspectorTab.tsx` |
| **Edit** | `src/components/dashboard/layout/MainContent.tsx` |
| **Maybe** | `src/components/SidePanelDigestPanel.tsx` |
| **Maybe** | `src/styles/global.css` (spacing only) |
| **Read** | `TASK-05.3` known gaps table |
| **Do not** | `fetchService.ts`, `batchDigest.ts`, `db.ts`, dev hub modals |

---

## Acceptance criteria

### Required (Tier A)

- [x] Bookmark list rows: badges only for **failed** and **needs_review** (per Q1/Q2 defaults or user answer)
- [x] Search result rows: same badge rules as bookmark list (shared helper)
- [x] Home Processing Digest: clearer copy/hierarchy; 05.6 batch button still works
- [x] Item tab vs Inspector: reduced duplicate summary/key-points (per Q3)
- [x] No “dev hub only” empty states in primary product paths (soft product CTAs)
- [x] `npm run build` passes
- [x] No changes to pipeline **behavior** (enrich/classify/import)

### Stretch (Tier B)

- [x] ItemsListPanel / collection lists use shared badge rules
- [x] Library Overview visual pass
- [x] Digest tooltips aligned with badge terminology

### Out of scope

- [ ] D-41 search interaction unification

---

## Testing hints (manual)

1. Library with mix of Ready / Not processed / Failed → list shows badges only on actionable rows.
2. Open item tab + Inspector → summary not duplicated wall-of-text.
3. Home digest: click queue → Bookmarks filter; **Process not enriched** still runs.
4. Product Search: result row status readable; hybrid search unchanged.
5. Inspector accept/reject still updates badges after action.

---

## Task 05.40 return

- **Tier A shipped:**
  - `shouldShowListPipelineBadge` + `ListPipelineBadge` — list/search rows show badges only for **failed** and **needs_review**
  - Shared rules wired in `MainContent` (list, grid, split pane), `ProductSearchView`, `ItemsListPanel`
  - Home Processing Digest uses `PIPELINE_QUEUE_LABELS` / `PIPELINE_QUEUE_HINTS`; actionable queues first; **Not enriched** de-emphasized when other queues have counts; batch button retained
  - Product empty copy in `EnrichmentContent` / item tab (no dev-hub messaging)
  - Inspector summary collapsed by default when item tab is open for same item; key points hidden in Inspector when item tab is primary
- **Tier B shipped / deferred:**
  - **B1 shipped:** Search metadata row — status badge moved off title into one metadata line; category as plain text (no chip)
  - **B2 shipped:** Pipeline browse chip prefixed with `Queue:`
  - **B3 shipped (light):** Library Overview tile spacing tweak
  - **B4 shipped:** `ItemsListPanel` uses `ListPipelineBadge`
  - **B5 shipped:** Digest line tooltips via `PIPELINE_QUEUE_HINTS`
- **User answers (Q1–Q5):** Defaults used (Q1–Q3 yes/hidden; Q4 Tier A + Tier B where straightforward; Q5 side panel unchanged — extension panel already had product copy)
- **Badge rules summary (when we show / hide):**
  - **List/search rows:** `failed`, `needs_review` only
  - **Item tab, Inspector, side panel header:** all kinds (full status)
- **Files touched:**
  - `src/lib/pipeline/pipelineBadge.ts`
  - `src/lib/pipeline/itemPipelineContext.ts`
  - `src/components/dashboard/PipelineDisplayBlocks.tsx`
  - `src/components/dashboard/HomeView.tsx`
  - `src/components/dashboard/ProductSearchView.tsx`
  - `src/components/dashboard/GlobalTabSystem.tsx`
  - `src/components/dashboard/InspectorTab.tsx`
  - `src/components/dashboard/ItemsListPanel.tsx`
  - `src/components/dashboard/layout/MainContent.tsx`
  - `src/components/dashboard/layout/DashboardLayout.tsx`
  - `src/components/dashboard/layout/RightPanel.tsx`
- **Suggested master doc updates:** Mark D-40 done in `V2-DEFERRED-TRACKER.md`; note W1 presentation pass closed
- **Known gaps / follow-ups (D-41, 05.7, …):** D-41 search click unification; 05.7 shell polish; 05.8 Advanced gate for batch tools mention in empty copy


---

## After D-40 (master planning)

| ID | What |
|----|------|
| **D-41** | Search result click consistency — optional `TASK-05.41-search-interaction.md` |
| **05.7** | Shell polish (W7) |
| **05.8** | Advanced / dev gate |
| **D-25** | Fetch review UI |
| **D-26** | User-signal policy |

---

*Last updated: 2026-05-27 — Done. W1 presentation pass closed; D-41 still open.*
