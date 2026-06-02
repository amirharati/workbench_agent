# TASK-05.5 — Single-link digest UX (W2)

**Status:** **done** — worker verification + Q2/Q3 2026-05-27; post-ship side panel + hash-aware digest 2026-05-27  
**Depends on:** [TASK-05.3](TASK-05.3-processing-enrichment-ui.md), [TASK-05.4](TASK-05.4-category-review.md)  
**Design:** [V2-PRODUCT-DESIGN-SPEC.md](V2-PRODUCT-DESIGN-SPEC.md) § W2, §15 (05.5)  
**Policy:** [V2-DEFERRED-TRACKER.md](V2-DEFERRED-TRACKER.md) — no schema; dev hub unchanged

---

## Documentation rule (required)

**Worker session:**

- **Only update this file** (`TASK-05.5-single-link-digest.md`) — acceptance checks, return template, known gaps.
- **Do not edit** `docs/backlog.md`, `docs/OVERVIEW.md`, `docs/temp/README.md`, umbrella `TASK-05-v2-product-ux.md`, or design spec.

**Master session** updates higher-level docs after your return.

---

## Goal

After saving an HTTP bookmark (side panel or product add-item), automatically run the V1 pipeline for **that item**: **fetch + AI extract** → **embed** → **topic classify**. User sees progress (status line / toasts) and can **retry** from Inspector when failed or not processed.

**Not in scope:** 05.6 batch import, D-40 presentation polish, D-41 search clicks, schema, dev hub changes.

---

## Current state (master session — already in repo)

Do **not** re-implement from scratch unless verification fails. Start by reading and testing what exists.

| Piece | Status | Location |
|-------|--------|----------|
| Orchestrator | **Landed** | `src/lib/pipeline/singleLinkDigest.ts` — `runSingleLinkDigest`, in-flight guard, `buildUserMessage` |
| Export | **Landed** | `src/lib/pipeline/index.ts` |
| Side panel auto-digest | **Landed** | `App.tsx` — `startSingleLinkDigest` after `addItemWithMerge` for http(s): tab save, add bookmark, create item |
| Full app add-item | **Landed** | `ProjectDashboard.tsx` + `DashboardLayout` digest with completion toast |
| Inspector actions | **Landed** | `InspectorTab.tsx` — Run / Retry / Classify now / **Re-digest** (Ready) |
| Build | **Pass** | `npm run build` (worker 2026-05-27) |

### Pipeline behavior (as implemented)

1. `enrichOne(itemId, { force? })` — fetch + AI extract; eligibility uses `textHash` (title/notes) and `contentHash` (fetched page body).
2. After fetch: if `contentHash` unchanged and `aiStatus === 'ok'` → skip AI extract (`content_unchanged`); sync `textHash` only.
3. If page unchanged but AI missing/failed → re-extract only (no redundant classify when categories already settled).
4. `runSingleLinkDigest` → `needsClassifyForDigest` skips classify when page unchanged and categories accepted/suggested/classified.
5. No API key → classify skipped with user-facing message (no throw).
6. Second digest while in-flight → friendly “already running” message.
7. Progress labels: compare fetch, page unchanged, skip classify, etc. (`resolveEnrichProgressLabel`, `formatPipelineStageHint`).

### Post-ship (2026-05-27 — side panel + smart digest)

| Piece | Status | Location |
|-------|--------|----------|
| Content-hash compare | **Landed** | `fetchService.ts` — skip AI when `contentHash` matches prior ok enrichment |
| Classify skip policy | **Landed** | `digestClassifyPolicy.ts` + `singleLinkDigest.ts` |
| Eligibility fix | **Landed** | `eligibility.ts` — do not `skipFetch` local-notes over prior `contentHash` |
| Side panel digest panel | **Landed** | `SidePanelDigestPanel.tsx` — scrollable AI block when URL matches saved item |
| Partial data on open | **Landed** | `hasPartialPipelineData`, snippet excerpt, stage hints, accept/reject |
| Refresh actions | **Landed** | Run digest / Refresh / Re-fetch page → `onRunDigest` → `startSingleLinkDigest` |
| Shared category rows | **Landed** | `CategoryReviewRows.tsx` (Inspector + side panel) |
| Update → digest | **Landed** | `App.handleUpdateBookmark` triggers digest for http(s) |
| Home Recently Added | **Landed** | `HomeView.tsx` — sort by `updated_at` then `created_at` (matches Recent tab) |
| Auth / login-wall fetch | **Deferred** | Known issue: fetch can return login walls on auth pages; do not downgrade good enrichment yet — see § Known gaps |

---

## Worker scope

### Required (close the task)

1. **Manual test** all acceptance criteria below; fix only bugs found (minimal diff).
2. Confirm **cross-page refresh**: side panel digest updates badges/Home when full app is open (`notifyDataChanged` / `subscribeToDataChanges`).
3. Fill **Task 05.5 return** at bottom; check acceptance boxes honestly.
4. **Ask user** the questions in § Open questions before changing UX scope.

### Optional (only if user confirms in worker chat)

- Toast on digest complete when item opened from `ProjectDashboard` — **done (Q2)**.
- Item-tab or list-row “Digesting…” indicator during background run — **deferred**.
- Wire digest after **Open Windows** quick-save — **N/A** (see Q5).

### Explicitly out of scope

- Favorites/pins, D-40, D-41, 05.6, dev hub UI changes, new DB fields.

---

## Open questions (ask user in worker session)

1. **“Already saved in this collection”** — should we still run digest every time (current: yes), or only when enrichment is missing/stale/failed?
2. **Full app add-item** — is silent background digest + badge update enough, or should we show a **toast** (“Digest complete”) like Inspector?
3. **Inspector button visibility** — show **Run digest** only on failed/not-processed (current), or also on **Ready** items for manual re-run?
4. **Classify failures** — if taxonomy missing / LLM error, is the current message enough or should we link user to Settings / dev taxonomy import?
5. **Open Windows save** — does saving from the windows list need the same auto-digest hook? (Investigate; implement only if user wants.)

### User answers (2026-05-27)

| # | Answer | Worker action |
|---|--------|----------------|
| **Q1** | Prefer hash-aware refresh: fetch and re-AI only when content hash differs; allow manual refresh (button / on open). | **Done (2026-05-27)** — `contentHash` compare; classify skip when page unchanged; side panel Refresh / Re-fetch. **Still open:** login-wall downgrade protection (Q3). |
| **Q2** | Toast on digest complete in full app. | **Done** — `DashboardLayout.handleAddBookmarkWithToast` + `ProjectDashboard.handleCreateItem`. |
| **Q3** | Allow re-digest on Ready; hash compare; **do not** replace better enrichment with worse login-page fetch. | **Done** — Inspector **Re-digest** on Ready (`forceEnrich` only on failed). Login-wall protection = **follow-up** in `enrichOne` / fetch quality. |
| **Q4** | Not sure. | Keep current messages; optional Settings hint later. |
| **Q5** | What is Open Windows? | **Unused UI** — `OpenWindowsSection.tsx` is not mounted anywhere today. Side panel saves **current tab** only. No action unless that component is wired back. |

---

## App context

- Chrome MV3 — React 18 + TS + Vite; `DashboardLayout` shell; side panel = separate `App.tsx` branch with `SidePanelView`.
- Toasts: `ToastProvider` in full app (`DashboardLayout`); side panel uses **status string** only (`showStatus` in `App.tsx`).
- Pipeline read UI: `useItemPipelineContext`, `resolvePipelineBadge`, Home digest queues (05.4).
- Existing writes: `enrichOne` (`fetchService.ts`), `classifyIncremental` (`classifyTopicExtract.ts`).

---

## Key files

| Action | Path |
|--------|------|
| Read/test | `src/lib/pipeline/singleLinkDigest.ts` |
| Read/test | `src/App.tsx` (`startSingleLinkDigest`, save handlers) |
| Read/test | `src/components/dashboard/InspectorTab.tsx` |
| Read/test | `src/components/dashboard/ProjectDashboard.tsx` |
| Read/test | `src/components/dashboard/layout/DashboardLayout.tsx` |
| Read/test | `src/components/SidePanelView.tsx`, `SidePanelDigestPanel.tsx` |
| Read/test | `src/lib/pipeline/digestClassifyPolicy.ts`, `itemPipelineContext.ts` (`hasPartialPipelineData`) |
| Read/test | `src/components/shared/CategoryReviewRows.tsx` |
| Reference only | `src/components/OpenWindowsSection.tsx` (not wired) |
| Do not | Dev hub (`PipelineDevView`, `EnrichmentPanel`, …) |

---

## Acceptance criteria

### Required (worker verifies)

- [x] Side panel **Save This Tab** → digest runs; status line shows phases; final message sensible
- [x] Side panel **Add bookmark** (new URL) → digest runs
- [x] Side panel **Update bookmark** → digest runs (hash-aware; no redundant classify when page unchanged)
- [x] Side panel opens on saved URL → **AI digest** panel shows existing partial/full data + Refresh
- [x] Home **Recently Added** reflects saves/updates (`updated_at`)
- [x] Full app **ProjectDashboard** add URL → digest runs; Inspector/badge updates without manual refresh
- [x] Inspector **Retry digest** on fetch failed; **Run digest** on not processed; **Classify now** when pending classify
- [x] No AI key: save still works; classify skipped with clear message (no crash)
- [x] `npm run build` passes
- [x] Dev hub unchanged

### Stretch

- [x] Toast on digest complete from full-app add (Q2)
- [ ] List/tab “Digesting…” indicator during background run — deferred
- [ ] Open Windows quick-save triggers digest — N/A (component unused)

---

## Testing hints (manual)

1. Side panel: save current tab → watch status (“Digesting… fetching page” → “classifying” → outcome).
2. Open full app → select item → Inspector badge moves toward Enriched/Ready; summary appears when AI ok.
3. Full app: add bookmark via modal → “Bookmark saved” toast then digest outcome toast.
4. Settings: remove API key temporarily → save new URL → classify message mentions key.
5. Inspector: **Fetch failed** → **Retry digest**; **Ready** → **Re-digest** (should skip fetch if hash unchanged).
6. Double-click save quickly → in-flight guard (“Digest already running”).
7. Export backup → `item_enrichment` / `ai_item_category_links` updated after digest.
8. Side panel: open on tab with **existing** bookmark → digest panel visible without re-saving; summary/categories if any; **Refresh** works.
9. Update same page twice after accept → second run shows **compare fetch** then **page unchanged** (no Classifying flash).
10. Full app Home → item moves to top of **Recently Added** after side panel save/update.

---

## Task 05.5 return

- **Verified / fixed:** Pre-landed core verified (code review + build). **Worker changes (session 1):** (1) Full-app digest completion **toast** — digest moved from `App.handleAddBookmark` to `DashboardLayout.handleAddBookmarkWithToast` + toast from `runSingleLinkDigest` result; `ProjectDashboard` add URL same. (2) Inspector **Re-digest** on **Ready** items (Q3). Cross-page refresh confirmed: `enrichment.update` + `categorization.update` from enrich/classify; hooks subscribe in 05.4.
- **Post-ship (session 2 — 2026-05-27):** (1) **contentHash** compare after fetch — skip AI when page body unchanged; update `textHash` when only notes/title changed. (2) **needsClassifyForDigest** — no re-classify on notes-only update after accept. (3) **SidePanelDigestPanel** — show on open when URL matches bookmark; partial summary/snippet/categories; Accept/Reject; Refresh / Re-fetch. (4) **Home Recently Added** uses `updated_at`. (5) **handleUpdateBookmark** triggers digest.
- **Deviations from master landing:** `App.handleAddBookmark` no longer runs digest (full app only); returns `itemId`. Side panel uses `pipelineItemId` (digest target or first URL match), not only post-save `digestItemId`.
- **Files touched (all worker sessions):** `App.tsx`, `DashboardLayout.tsx`, `ProjectDashboard.tsx`, `InspectorTab.tsx`, `SidePanelView.tsx`, `SidePanelDigestPanel.tsx`, `CategoryReviewRows.tsx`, `HomeView.tsx`, `PipelineDisplayBlocks.tsx`, `singleLinkDigest.ts`, `digestClassifyPolicy.ts`, `fetchService.ts`, `eligibility.ts`, `itemPipelineContext.ts`, `docs/temp/TASK-05.5-single-link-digest.md`
- **User answers to open questions:** See table in § User answers. Q1 hash-aware refresh **done**; Q2/Q3 **done** (login-wall protection still open); Q4 TBD; Q5 N/A.
- **Suggested master doc updates:** Mark 05.5 **closed**; W2 done in product UI; update `docs/temp/README.md`, `V2-DEFERRED-TRACKER.md` D-20; umbrella 05 status.
- **Known gaps / follow-ups:**
  - **Auth pages / login-wall fetch (priority later):** Jina/provider fetch sometimes returns login or cookie-wall HTML on authenticated sites. V1 detects `auth_required` / `parse_empty` but may still **overwrite** a prior good enrichment on re-digest. **Do not implement in 05.5** — track as fetch-quality follow-up (Q3 remainder); consider: compare enrichment quality before replace, tab-session fetch, user “Use browser tab” fallback.
  - Q4 — optional Settings link on classify errors.
  - List/tab “Digesting…” indicator — deferred.
  - 05.6 batch import; D-40 presentation; D-41 search clicks.

---

*Last updated: 2026-05-27 — Done. Core + post-ship: hash-aware digest, side panel AI panel on open, Home recent by updated_at; auth-page fetch deferred.*
