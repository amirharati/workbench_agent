# TASK-05 — V2 Product UX/UI (review, brainstorm, then subtasks)

**Status:** **V2-A core shipped** — 05.1–05.7 + D-40. **05.8** dev gate and **D-41** search clicks **deferred** (low priority / user thinking). **Top priorities:** see master queue below.  
**Backlog linkage:** `docs/backlog.md` → **V2 — Product** (V2-A / V2-B / V2-C)  
**Depends on:** V1 closed (Tasks 01–04)  
**Does not depend on:** chunk RAG, ANN, concept DAG (→ **V3**)

---

## Phase decision (agreed)

| Order | Track | Goal |
|-------|--------|------|
| **1 — V2-A** | UX / UI | Clean **product** UI for normal use; **dev UI stays in parallel** (later → Debug / Advanced) |
| **2 — V2-B** | Data model cleanup | Align UI with `db.ts` after UX decisions |
| **3 — V2-C** | V1 backend refinement | Fetch, tuning, automation — after product shell is defined |
| **Later — V3** | Scale AI | Chunk, ANN, DAG |

**Principle:** V2-A is **one umbrella + subtasks**. **05.0** output lives in [`V2-PRODUCT-DESIGN-SPEC.md`](V2-PRODUCT-DESIGN-SPEC.md) (locked 2026-05-26).

**Execution policy (2026-05-29):** **V2 closed** — [`TASK-V2-CLOSE.md`](TASK-V2-CLOSE.md). **Storage shipped:** V2.1 + V2.1.1. Active: [`TASK-POST-V2.md`](TASK-POST-V2.md). Tracker: [`V2-DEFERRED-TRACKER.md`](V2-DEFERRED-TRACKER.md).

---

## Design north star

> **Clean, focused UI for everyday use — with power available when you need it, not on every screen.**

| Layer | Audience | Role |
|-------|----------|------|
| **Product UI** | Normal / daily use | Browse, search, read enrichment, light actions, clear status |
| **Dev / Debug UI** | You, power users, R&D | Queues, raw scores, batch runners, taxonomy trees — **keep in parallel for V2**; later gate behind **Advanced** or **Developer mode** |

Do **not** delete dev surfaces during V2-A; **hide from primary nav** and link from Advanced when product paths exist. (this si already in  setting  so i think we just keep it there as is and maybe we update it if necessary during our work)

---

## Why now

- V1 backend is **good enough to test** (fetch → extract → embed → classify → search).
- Dev hub works but is **not** the app you want to live in daily.
- Without an **A→Z UX review**, implementation will fork (duplicate buttons, unclear pipeline vs library).

---

## TASK-05.0 — UX/UI review & brainstorm (do this first)

**Type:** Master-session / planning only (minimal or no code).  
**Goal:** Review and brainstorm UX/UI **from A to Z**; produce artifacts that unblock subtasks.

### Workflow areas to examine

For each area: **user goal**, **happy path**, **edge cases**, **what data exists (V1)**, **what UI exists today**, **gaps**, **product vs dev**.

| # | Workflow | Assumptions / notes |
|---|----------|---------------------|
| **W1** | **Daily library use** | Corpus **already digested** (enriched, embedded, classified enough). Browse by project/collection, AI category, domain; open item; notes; Ask AI on scope. |
| **W2** | **Single-link digest** | User saves **one** bookmark (side panel or Add Item) → optional **digest pipeline** (fetch → extract → embed → classify) with clear progress and failure. |
| **W3** | **Batch import** | Import Studio → preview → commit → **post-import processing** (what runs automatically vs user-triggered batch). |
| **W4** | **Post-processing / maintenance** | Later updates: re-fetch, re-run AI extract, re-embed, re-classify, discover; per-item vs batch; idempotent/skip rules surfaced in UI. |
| **W5** | **Search & discovery** | Product search (hybrid), filters, similar items, related links/topics — lift from Task 04 dev, not reinvent. |
| **W6** | **Improvement from user signals** | Accept/reject AI category, corrections, pins/favorites (if in scope), “wrong category” feedback, future ranking hints — what V2 ships vs stubs. |
| **W7** | **Shell & focus** | IDE layout ([`UI_IDE_REDESIGN.md`](../UI_IDE_REDESIGN.md)): left = scope/nav, middle = work, right = assistant/inspector; avoid pipeline tables in left nav. |
| **W8** | **Settings & trust** | AI keys, models, backup, privacy (what leaves device), pipeline budgets. |

Cross-cutting questions:

- Where does **pipeline status** live (global badge vs Library panel vs item badge)?
- How do we label **manual** (projects/collections) vs **AI** (categories, tags, summary)?
- What is **one primary action** per screen vs overflow menu?
- What requires **confirmation** vs background job?

### 05.0 deliverables (acceptance)

- [x] **Workflow matrix** — [`V2-PRODUCT-DESIGN-SPEC.md`](V2-PRODUCT-DESIGN-SPEC.md) §13 (W1–W8)
- [x] **IA map** — spec §1–2
- [x] **Product vs Dev map** — spec §14
- [x] **Subtask queue** — spec §15 (authoritative order)
- [x] **Non-goals** — spec §18
- [x] **Open decisions** — spec §17

### Suggested 05.0 session agenda (~1–2h brainstorm)

1. Walk **W1 daily use** (most important — assume digested data).
2. Contrast **W2 single** vs **W3 batch** (different mental models).
3. **W4 maintenance** — when does user care vs “set and forget”?
4. **W5 search** — merge with W1 or separate top-level?
5. **W6 signals** — minimum viable feedback loop in V2.
6. **Dual UI** — draw line: product shell + Advanced drawer for dev hub.
7. Prioritize **first implementation subtask** (likely W1 + W5 slice).

---

## Implementation subtasks (authoritative: spec §15)

| ID | Subtask | Status | Brief |
|----|---------|--------|-------|
| **05.0** | Brainstorm + design spec | **done** | [`V2-PRODUCT-DESIGN-SPEC.md`](V2-PRODUCT-DESIGN-SPEC.md) |
| **05.1** | Home + right panel + status | **closed (iter 1)** | [`TASK-05.1-home-right-panel.md`](TASK-05.1-home-right-panel.md) |
| **05.2** | Product library search | **shipped** | [`TASK-05.2-product-search.md`](TASK-05.2-product-search.md) |
| **05.3** | Processing status + enrichment in UI | **shipped** | [`TASK-05.3-processing-enrichment-ui.md`](TASK-05.3-processing-enrichment-ui.md) — follow-up: **D-40** presentation polish |
| **05.4** | Category review + digest queues + AI Categories tool | **closed** | [`TASK-05.4-category-review.md`](TASK-05.4-category-review.md) |
| **05.5** | Single-link digest | **closed** | [`TASK-05.5-single-link-digest.md`](TASK-05.5-single-link-digest.md) |
| **05.6** | Import + batch maintenance | **closed** | [`TASK-05.6-import-batch-maintenance.md`](TASK-05.6-import-batch-maintenance.md) |
| **05.7** | Shell polish (Phase 2) | **closed** | [`TASK-05.7-shell-polish.md`](TASK-05.7-shell-polish.md) |
| **05.8** | Advanced / Dev gate | **deferred** | W8 — dev hub stays as-is on Bookmarks |
| **05.B** | Pins / fav / trash | **closed** | [`TASK-05.B-pins-favorites-trash.md`](TASK-05.B-pins-favorites-trash.md) |
| **05.C** | V2 polish bundle | **closed** | [`TASK-05.C-v2-polish-bundle.md`](TASK-05.C-v2-polish-bundle.md) |

---

## Context snapshot (V1 backend — reference only)

| Capability | Module | Product UI today | Dev UI today |
|------------|--------|------------------|--------------|
| Fetch + extract | `src/lib/enrichment/*` | Side panel save; modals | Enrich / Results modals |
| Doc embed | `embedBackfillPlan`, `embedItemSignal` | — | `EmbedBackfillBlock`, Search dev |
| Classify / discover | `src/lib/categorization/*` | — | `PipelineDevView`, Categories |
| Search | `src/lib/search/*` | Substring `SearchTab` | `SearchDevPanel` |
| Import | Import Studio | Preview + commit | — |
| Backup | coordinator + Settings | Partial | — |

### Core docs

1. **[`V2-PRODUCT-DESIGN-SPEC.md`](V2-PRODUCT-DESIGN-SPEC.md)** — locked design (source of truth for V2-A)
2. [`TASK-05.1-home-right-panel.md`](TASK-05.1-home-right-panel.md) · [`TASK-05.2-product-search.md`](TASK-05.2-product-search.md) · [`TASK-05.3-processing-enrichment-ui.md`](TASK-05.3-processing-enrichment-ui.md)
3. [`docs/UI_IDE_REDESIGN.md`](../UI_IDE_REDESIGN.md) · [`docs/backlog.md`](../backlog.md)

---

## V2-B — Data model cleanup (after UX)

Lock in 05.0 / 05.B brief:

- Notes: `notes` store vs URL-empty `items`
- AI vs manual containers (no forced DAG in V2)
- Import provenance, backup shapes

---

## V2-C — V1 backend refinement (after product baseline)

- Fetch coverage/quality, import hooks
- `04-defer-*` search tuning
- Auto-embed, embed/classify text unify, Web Worker

CLI unchanged: [`CLI_WORKFLOW.md`](../CLI_WORKFLOW.md).

---

## Out of scope (entire V2 umbrella)

- Chunk RAG, ANN, concept DAG (V3)
- Removing dev UI entirely (only re-home it)
- Perfect pipeline quality before any product UI

---

## Return templates

### 05.0 (brainstorm)

```markdown
## Task 05.0 return
- Workflow matrix: (link or pasted summary)
- IA map:
- Product vs Dev map:
- Subtask queue (ordered):
- Decisions made:
- Decisions deferred:
- First implementation subtask recommended:
```

### 05.x (implementation subtask)

```markdown
## Task 05.x return
- Workflow covered:
- Shipped:
- Files:
- Dev UI impact: (unchanged / gated / linked)
- Suggested backlog edits:
```

---

## Master session next step

### Priority queue (master — 2026-05-27)

**Done:** **05.B**, **05.C**, **D-10**, **V2 milestone** ([`TASK-V2-CLOSE.md`](TASK-V2-CLOSE.md)). **Next:** [`TASK-POST-V2.md`](TASK-POST-V2.md).

| Priority | ID | Why |
|----------|-----|-----|
| **1** | **V2 close** | Pipeline UX + search + dogfood; Tier A decisions documented |
| **2** | **D-35** | **Post-V2 #1** — storage/backup **big change** (not V2 gate) |
| **3** | **D-45 / D-38** | Optional during or after V2 |
| **4** | **D-27, D-25, D-26+W6, D-41** | Defer or thin slice per close checklist |

**Dogfood:** V2-A + 05.B + 05.C + D-10 usable; **D-35 not required** to mark V2 closed.

Track deferred in [`V2-DEFERRED-TRACKER.md`](V2-DEFERRED-TRACKER.md).
