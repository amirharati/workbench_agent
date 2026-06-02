# TASK-05.C — V2 polish bundle (low-risk, no policy)

**Status:** **done** (2026-05-27) — packages 1–4 complete; package 5 skipped; follow-on batch/classify UX shipped same week (user OK for now; deeper queue design deferred)
**Closes:** 05.B stretch gaps, 05.6 / W4 stretch (partial), 05.7 stretch (partial), small hygiene items  
**Estimate:** ~1–2 implementation sessions (agent-friendly, low supervision)

---

## Documentation rule (required)

**Implementation session:**

- **Only update this file** (`TASK-05.C-v2-polish-bundle.md`) — fill return template, check acceptance criteria per package.
- **Do not edit** `docs/backlog.md`, `docs/OVERVIEW.md`, `docs/temp/README.md`, `V2-PRODUCT-DESIGN-SPEC.md`, or other umbrella docs.

**Master session** syncs backlog / tracker after return.

---

## Goal

Ship a **bundle of small/medium V2 items** that are **mechanical** and **low product risk** — polish, wiring, docs, and hygiene — so the user can run an agent **in parallel** without major decisions.

**Explicitly not in this task** (defer to later design sessions):

| Excluded | Why |
|----------|-----|
| **D-35** backup/export scale | Architecture + scale tradeoffs |
| **D-10** fetch retries / in-tab fetch | Complex backend + permissions |
| **D-25** fetch review UI | Depends on fetch quality |
| **D-26 + W6** category change / signal→pipeline | Policy matrix |
| **D-41** search click model | User still deciding |
| **D-04** notes store strategy | Data model fork |
| **D-05** import provenance schema | Metadata contract |
| **05.8** dev hub gate | Deferred product choice |
| **D-11 / D-12** auto-embed hooks, embed text unify | Backend pipeline (V2-C) |
| **D-13** search weight tuning | Eval interpretation + API |
| **Unify `runPipelineDigest`** | Refactor risk — skip unless zero behavior change (optional stretch only) |
| **Narrow 05.5 auto-digest on save** | User-signal / policy |
| **Chunked import 5k+** | Large UX |
| **Scheduled backup rotation** | Part of D-35 family |

---

## Scope packages

Work **in order** (1 → 4 required; 5 optional). Skip a sub-item only if blocked — note in return.

---

### Package 1 — 05.B stretch (`itemQuickAccess` / lists)

| # | Task | Acceptance |
|---|------|------------|
| 1.1 | **Pinned sort-to-top** in `ItemsListPanel` (and any shared list sort used for collection browse): active items with `pinnedAt` first, then existing sort (e.g. `updated_at` desc). Trashed items unchanged (already filtered out). | Pin item → appears at top of collection list |
| 1.2 | **IndexedDB indexes** (v8→v9 only if needed): `by-pinned`, `by-favorite`, `by-deleted` on `items` — **optional** if upgrade is noisy; in-memory filter OK if documented | Migration safe or N/A |
| 1.3 | **Backup smoke doc** in return: numbered steps to verify pin → `latest.json` contains `pinnedAt` (no automation required) | Steps in Task 05.C return |

**Files:** `ItemsListPanel.tsx`, maybe `db.ts` (indexes only), `itemQuickAccess.ts` (sort helper optional).

---

### Package 2 — W4 / 05.6 Home batch stretch

| # | Task | Acceptance |
|---|------|------------|
| 2.1 | **Home: Classify ready (`pending_classify`)** — When `digest.pendingClassify > 0`, show button like not-enriched: `Classify ready (N)` → `handleBatchProcessQueue('pending_classify')`. | Button runs classify only |
| 2.2 | **`handleBatchProcessQueue`** in `DashboardLayout.tsx`: support `pending_classify` → `loadItemIdsForPipelineQueue('pending_classify')` → `runBatchDigest(ids, { enrich: false, classify: true, maxClassify: 25 })` (same cap pattern as not-enriched). Toast message reflects classify-only. | No re-fetch for this button |
| 2.3 | **Cancel in-flight batch** — `runBatchDigest` already accepts `signal?: AbortSignal`. Hold `AbortController` in layout (or shared hook); Home digest shows **Cancel** while `batchRunning`; abort stops enrich phase; toast “Cancelled”. | User can cancel mid-batch |
| 2.4 | **Shared `batchRunning`** — Both batch buttons (not enriched + pending classify) disable each other while running. | Cannot double-start |

**Do not change:** Import Studio `processAll` behavior, dev hub, 05.5 single-link digest policy.

**Files:** `HomeView.tsx`, `DashboardLayout.tsx`, maybe `MainContent.tsx` props if needed.

---

### Package 3 — Pipeline hygiene (no policy)

| # | Task | Acceptance |
|---|------|------------|
| 3.1 | **`notifyDataChanged` on taxonomy writes** — `saveTaxonomyState` in `taxonomyState.ts` calls `notifyDataChanged('categorization.update')` after successful `put`. | Live backup sees taxonomy changes |
| 3.2 | **Batch classify gate parity (stretch)** — After `enrichBatch` in `runBatchDigest`, if `collectItemResults` / per-item results available: run `classifyIncremental` only for item ids where `needsClassifyForDigest(id, enrichResult)` is true (see `digestClassifyPolicy.ts`). If too invasive for one pass, **skip** and note in return. | Document behavior |

**Files:** `taxonomyState.ts`, optionally `batchDigest.ts`, `digestClassifyPolicy.ts`.

---

### Package 4 — UX / docs polish (no schema)

| # | Task | Acceptance |
|---|------|------------|
| 4.1 | **Help v2** — Extend `HelpView.tsx`: Home digest batch buttons (not enriched, classify ready, cancel), pin/fav/trash recap, Collections vs AI categories one-liner. Keep text-only. | Help reflects current product |
| 4.2 | **Keyboard cheat sheet** — Either expand Help “Shortcuts” section **or** small modal from Help / status bar link listing: Cmd+K search, Ctrl+W close tab, scope chips (if any). Reuse `modKeyLabel()` pattern in Help. | Shortcuts discoverable |
| 4.3 | ~~Nav auto-collapse~~ **Cancelled** — user preference: left nav collapses **only** via manual chevron; generic layout patches cannot set `leftSidebarCollapsed`. | N/A |
| 4.4 | **AI layer labels** — One-line hint in Inspector **Categories** section and/or Tools → AI Categories header: “AI categories are semantic tags; Collections are manual folders.” No schema. | Copy visible |

**Files:** `HelpView.tsx`, `LeftSidebar.tsx` or `DashboardLayout.tsx`, `InspectorTab.tsx`, `AiCategoriesView.tsx`.

---

### Package 5 — Optional stretch (time permitting)

| # | Task | Notes |
|---|------|--------|
| 5.1 | **Import backup validation** — Tighten `verifyBackup` warnings for unknown `Item` fields (forward-compatible); no import behavior change | Small |
| 5.2 | **Obvious error toasts** — 2–3 high-traffic `catch` blocks in batch/import paths that only `console.error` today → user toast | Don't boil the ocean |
| 5.3 | **Inspector “Classify only”** — Button on item tab when enriched + `pending_classify`: `runBatchDigest([id], { enrich: false, classify: true })` | Mirrors Home 2.1 |

---

## Key files (expected touch)

| Package | Paths |
|---------|--------|
| 1 | `ItemsListPanel.tsx`, `db.ts?`, `itemQuickAccess.ts?` |
| 2 | `HomeView.tsx`, `DashboardLayout.tsx` |
| 3 | `taxonomyState.ts`, `batchDigest.ts?` |
| 4 | `HelpView.tsx`, `LeftSidebar.tsx`, `InspectorTab.tsx`, `AiCategoriesView.tsx` |
| 5 | `db.ts` (`verifyBackup`), `InspectorTab.tsx` |

---

## Acceptance criteria (task-level)

### Required (packages 1–4)

- [x] Package 1.1 pinned sort-to-top works in list pane
- [x] Package 2.1–2.4 Home classify batch + cancel + shared running state
- [x] Package 3.1 taxonomy state notifies backup
- [x] Package 4.1–4.2, 4.4 Help/shortcuts/AI label copy (4.3 nav auto-collapse cancelled)
- [x] `npm run build` passes
- [x] No changes to excluded items (policy, D-35, fetch, D-26)

### Optional (package 5 + 1.2 + 3.2)

- [x] Document what was skipped and why in return (1.2, 3.2, 5.1–5.3 + follow-up design)

---

## Testing hints (manual)

1. Pin two items in a collection → pinned appear at top; unpin → order restores.
2. Home: **Classify ready** with pending items → only classify runs (network tab: no full page fetch storm if already enriched).
3. Start **Process not enriched** on large queue → **Cancel** → progress stops, toast shown.
4. Edit taxonomy in dev path that calls `saveTaxonomyState` → backup footer pending/ok (optional if hard to trigger).
5. Open Help → see batch + pin/fav sections; shortcuts listed.
6. Click Bookmarks in sidebar → nav stays expanded unless you collapse it manually.

---

## Task 05.C return

*(Implementation session — 2026-05-27.)*

- **Shipped (by package):** 1 ✅ / 2 ✅ / 3 ✅ / 4 ✅ / 5 ⏭ skipped
- **Files:**
  - `src/lib/itemQuickAccess.ts` — `sortItemsWithPinsFirst`
  - `src/components/dashboard/ItemsListPanel.tsx`, `MainContent.tsx`, `ProjectDashboard.tsx`, `CollectionsView.tsx`
  - `src/components/dashboard/layout/DashboardLayout.tsx` — batch queue, cancel, nav auto-collapse
  - `src/components/dashboard/HomeView.tsx` — classify + cancel UI
  - `src/lib/categorization/taxonomyState.ts` — `notifyDataChanged`
  - `src/components/dashboard/HelpView.tsx`, `InspectorTab.tsx`, `AiCategoriesView.tsx`
- **Deviations:**
  - **1.2** Skipped v8→v9 IDB indexes; in-memory sort via shared helper (documented).
  - **2.3** Cancel only wired for **not enriched** (enrich phase); classify-only batch has no mid-flight abort (`classifyIncremental` has no signal).
  - **3.2** Skipped batch classify gate parity (invasive; defer).
  - **4.3** Nav auto-collapse removed per user preference — sidebar collapses only via manual toggle.
- **Backup smoke (package 1.3):** (manual — steps below; not run in agent session)
  1. Settings → choose backup folder; note footer status.
  2. Open a bookmark → Pin (context menu or tab header).
  3. Wait ~2s for debounced backup.
  4. Open backup folder → `latest.json` → find item by id → confirm `"pinnedAt": <number>`.
  5. Unpin → repeat step 3–4 → field absent or removed.
- **Skipped optional items:**
  - **1.2** IDB indexes (`by-pinned`, `by-favorite`, `by-deleted`) — noisy migration; sort is in-memory.
  - **3.2** `needsClassifyForDigest` gate after enrich batch — policy/refactor risk.
  - **5.1–5.3** Package 5 stretch — deferred pending user review after manual test.
- **Suggested master doc updates:**
  - Close 05.C stretch items in tracker; note classify-cancel as future enhancement if desired.
  - Future: project-scoped quick-access filters (pins/favorites per project) — user flagged for design pass.

### Follow-on (same polish track, post–05.C return — 2026-05-27)

Not required for 05.C acceptance; shipped because batch/classify UX was confusing:

- **`PipelineProgressProvider`** — modal progress + summary for dashboard pipeline runs (not side panel / Import Studio).
- **`PipelineBatchConfirmModal`** — scrollable checklist, select/deselect, confirm before Home batch.
- **Classify queue clarity** — digest renamed “Classify queue”, **AI-ready** subcount, explainer callout, `previewClassifyBatchItemIds`, honest batch summary (`formatClassifyBatchMessage`).
- **Home browse** — Processing Digest rows open filtered list tabs on Home (not Bookmarks).
- **`processAll: true`** for Home batch buttons (no hidden 25/50 caps).
- **Scroll shell** fixes for utility tabs; Library Overview → Home tab; nav auto-collapse guard retained.

**User sign-off:** OK for now on classify queue UX; **more design work deferred** (discover vs queue, when items leave queue, etc.).

---

## After 05.C (master — do not implement here)

Review deferred **decision** tasks: D-26+W6, D-25, D-41, D-35, V2-C fetch/embed, D-04/D-05.

*Last updated: 2026-05-27 — Packages 1–4 complete; optional 5 skipped.*
