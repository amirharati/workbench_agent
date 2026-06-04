# Temp task briefs (implementation sessions)

**Master session:** use the main chat that owns roadmap/backlog review. Each feature gets a **clean implementation session** driven by one file here.

## Workflow

1. Pick next task from [`../backlog.md`](../backlog.md) (or from **Active** below).
2. Open / copy the matching `TASK-*.md` brief into the implementation session.
3. Implement; run/build as needed.
4. Return to master session with: **what shipped**, **files touched**, **gaps**, **suggested backlog edits**.
5. Master session updates `backlog.md` / `OVERVIEW.md` and marks task **done** or **revise**.

## Active queue

| # | Task | Brief | Status |
|---|------|-------|--------|
| 01 | Fetch enrichment v1 (plug-and-play service) | [`TASK-01-fetch-enrichment-v1.md`](TASK-01-fetch-enrichment-v1.md) | **closed** |
| 01.5 | AI extraction tuning + eval harness | [`TASK-01.5-ai-extraction-tuning.md`](TASK-01.5-ai-extraction-tuning.md) | **closed** |
| 02 | AI categorization V1 (schema + pipeline) | [`TASK-02-ai-categorization-v1.md`](TASK-02-ai-categorization-v1.md) | **closed (V1 shipped)** |
| 02-app | App wire-up plan (CLI V1.2 → IndexedDB) | [`TASK-02-app-implementation-plan.md`](TASK-02-app-implementation-plan.md) | **implemented (history/reference)** |
| 03 | V1.1 pipeline hardening (incremental + quality gate + run stats + dev hub) | [`TASK-03-v1.1-pipeline-hardening.md`](TASK-03-v1.1-pipeline-hardening.md) | **closed** |
| 04 | V1.5 search foundation (hybrid retrieval, CLI-first) | [`TASK-04-search-foundation-v1.5.md`](TASK-04-search-foundation-v1.5.md) | **closed** |
| — | V2 design spec (05.0 output) | [`V2-PRODUCT-DESIGN-SPEC.md`](V2-PRODUCT-DESIGN-SPEC.md) | **locked** |
| 05 | V2 product UX/UI (umbrella) | [`TASK-05-v2-product-ux.md`](TASK-05-v2-product-ux.md) | **active** |
| 05.1 | Home + right panel + status system | [`TASK-05.1-home-right-panel.md`](TASK-05.1-home-right-panel.md) | **closed (iter 1)** |
| 05.2 | Product library search (Tools nav, Cmd+K, hybrid) | [`TASK-05.2-product-search.md`](TASK-05.2-product-search.md) | **closed** |
| — | V2 deferred tracker (schema/backend later) | [`V2-DEFERRED-TRACKER.md`](V2-DEFERRED-TRACKER.md) | **living doc** |
| 05.3 | Processing status + enrichment display (UI-only) | [`TASK-05.3-processing-enrichment-ui.md`](TASK-05.3-processing-enrichment-ui.md) | **closed** |
| 05.4 | Category accept/reject + digest queues + AI Categories tool | [`TASK-05.4-category-review.md`](TASK-05.4-category-review.md) | **closed** |
| 05.5 | Single-link digest (W2) | [`TASK-05.5-single-link-digest.md`](TASK-05.5-single-link-digest.md) | **closed** |
| 05.6 | Import + batch maintenance (W3, W4) | [`TASK-05.6-import-batch-maintenance.md`](TASK-05.6-import-batch-maintenance.md) | **closed** |
| 05.40 (D-40) | AI / pipeline presentation polish (W1) | [`TASK-05.40-presentation-polish.md`](TASK-05.40-presentation-polish.md) | **closed** |
| 05.7 | Shell polish phase 2 (W7) | [`TASK-05.7-shell-polish.md`](TASK-05.7-shell-polish.md) | **closed** |
| **05.B** | Pins, favorites, trash + backup sync (V2-B D-01–03) | [`TASK-05.B-pins-favorites-trash.md`](TASK-05.B-pins-favorites-trash.md) | **closed** |
| **05.C** | V2 polish bundle (low-risk; no policy/fetch/backup-scale) | [`TASK-05.C-v2-polish-bundle.md`](TASK-05.C-v2-polish-bundle.md) | **closed** |
| **V2C-D10** | Fetch improvement (umbrella) | [`TASK-V2C-D10-fetch-improvement.md`](TASK-V2C-D10-fetch-improvement.md) · [`D10-FETCH-FINDINGS-REPORT.md`](D10-FETCH-FINDINGS-REPORT.md) | **closed** 2026-05-28 |
| **D10.1** | Fetch baseline experiment + buckets | [`TASK-V2C-D10.1-baseline-experiment.md`](TASK-V2C-D10.1-baseline-experiment.md) | **done** (2026-05-28) |
| **D10.2** | LLM fetch judge (dev CLI) | [`TASK-V2C-D10.2-fetch-judge.md`](TASK-V2C-D10.2-fetch-judge.md) | **done** (2026-05-28) |
| **D10.4 slice 1** | Headless fixes (quality gates, t.co, Reddit fail-fast) | [`TASK-V2C-D10.4-headless-proven-fixes.md`](TASK-V2C-D10.4-headless-proven-fixes.md) | **done** (2026-05-28) |
| **D10.6 core** | X thread expand (`/2/thread`) | [`TASK-V2C-D10.6-recursive-follow.md`](TASK-V2C-D10.6-recursive-follow.md) | **done** (2026-05-28) |
| **D10.3** | Tab-profile auth eval (CLI) | [`TASK-V2C-D10.3-tab-profile-auth-cli.md`](TASK-V2C-D10.3-tab-profile-auth-cli.md) | **done** — weak rescue; real Chrome is product path |
| **D10.5** | Extension tab-session fetch | [`TASK-V2C-D10.5-extension-tab-fetch.md`](TASK-V2C-D10.5-extension-tab-fetch.md) | **done** (2026-05-28) |
| **V2** | Milestone record (closed 2026-05-29) | [`TASK-V2-CLOSE.md`](TASK-V2-CLOSE.md) | **closed** |
| **Roadmap** | V2.2 → V2.3 → V3 → V4 | [`TASK-V2-POST-ROADMAP.md`](TASK-V2-POST-ROADMAP.md) | **active** |
| **Post-V2** | Queue + stack | [`TASK-POST-V2.md`](TASK-POST-V2.md) | **active** |
| **V2.1 / V2.1.1** | SQLite + OPFS worker | shipped docs | **shipped** |
| **V2.2** | Storage & backup polish | [`TASK-V2.2-storage-polish.md`](TASK-V2.2-storage-polish.md) | **closed** 2026-05-30 |
| **V2.3** | Quick wins (non-pipeline) | [`TASK-V2.3-quick-wins.md`](TASK-V2.3-quick-wins.md) | **next** |
| **V3** | Pipeline program | [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md) | **in progress** — discover **1a done** (code uncommitted) · **next: B2** |
| **V3 tasks** | Per-session briefs | `TASK-V3-*.md` | **one task file per worker session**; discover algo = **B4** only |
| **V3 handoff** | 2026-06-02 session | [`TASK-V3-A3-stage-aware-errors.md`](TASK-V3-A3-stage-aware-errors.md) § Worker session handoff | committed with pipeline UI wave |
| **D-42** | Hub UI detail (V3 sub) | [`TASK-V2-pipeline-hub.md`](TASK-V2-pipeline-hub.md) | V3 |
| **V4** | Multi-device sync | [`TASK-V4-sync-replicas.md`](TASK-V4-sync-replicas.md) | deferred |
| **V2.2+ D-35** | Multi-device sync (deferred) | [`TASK-POST-V2-D35-storage-backup.md`](TASK-POST-V2-D35-storage-backup.md) | master design in [`backlog.md`](../backlog.md) |
| **D-45** | Local folder library | [`TASK-V2C-D45-local-folder-library.md`](TASK-V2C-D45-local-folder-library.md) | tracked — after V2 or parallel |
| **D10.4b** | Headless slice 2 (GitHub blobs, pick-best, Reddit alts) | same brief | optional |
| **D10.6b** | Link-in-tweet → article follow | same brief | optional |
| 05.41 (D-41) | Search result interaction | — | **deferred** (user thinking) |
| 05.8 | Advanced / dev gate (W8) | — | **deferred** (dev hub stays on Bookmarks) |

## Rules for temp files

- **Disposable spec**, not long-term docs — fold outcomes into `backlog.md` when done.
- Keep scope **one vertical slice** per task.
- Do not duplicate full architecture essays; link to backlog sections instead.
