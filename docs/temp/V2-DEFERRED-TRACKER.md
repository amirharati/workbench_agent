# V2 deferred tracker (open work index)

**Purpose:** Open-work index **after V2** (V2 closed 2026-05-29 — [`TASK-V2-CLOSE.md`](TASK-V2-CLOSE.md)). [`backlog.md`](../backlog.md) stays exhaustive history. **Active queue:** [`TASK-POST-V2.md`](TASK-POST-V2.md).

**Last shipped:** **V2.2 storage polish** (2026-05-30) — restore UX, atomic mirror, startup/restore hardening. Prior: **V2.1 + V2.1.1** (2026-05-29), D10 (2026-05-28), V2 product UX closed same day.

**Active priorities:** [`TASK-V2-POST-ROADMAP.md`](TASK-V2-POST-ROADMAP.md) — **V2.3** quick wins → **V3** pipeline (main) → **V4** sync later.

---

## Quick index — all open V2-related IDs

| Tier | IDs | Count |
|------|-----|------:|
| **A — Decisions first** | D-26, W6, D-25, D-41, D-04, D-05, **D-27** | 7 |
| **B — Backend / pipeline** | D-11…D-15, 04-defer, D-38, D-39, D-42, D-43, 05.6 leftovers | many |
| **C — Data model** | D-04, D-05, validation, merge review | few |
| **D — Product UX / shell** | D-41, D-38, D-39, **D-45**, IDE phases, 05.8, pin/trash polish | many |
| **E — Backup** | **D-35** local ✅; **V2.2** polish ✅; **D-36** ops (slice D deferred) | 3 |
| **F — Hygiene** | errors, DB, validation, HttpBackup | several |
| **V3 — Park** | D-30…D-34, agentic, hosted dashboard | — |

---

## Shipped (reference — do not re-open)

| Block | IDs / tasks |
|-------|-------------|
| V2-A core | 05.1–05.7, 05.40 (D-40), 05.2–05.6 workflows |
| V2-B quick access | D-01, D-02, D-03 — **05.B** |
| V2 polish | **05.C** — pin sort, classify batch UI, Help, hygiene |
| W2/W3/W4/W5 (MVP) | 05.5 digest, 05.6 import+batch, 05.2 search, 05.4 accept/reject |
| V2-C fetch | **D10.1–2, D10.4 slice 1, D10.6, D10.3, D10.5** — 69% headless judge; tab session + extras in extension |
| **V2.1 storage** | SQLite WASM + schema v1 + JSON bridge — [`TASK-V2.1-sqlite-wasm-storage.md`](TASK-V2.1-sqlite-wasm-storage.md) |
| **V2.1.1 storage** | OPFS single DB worker + folder mirror — [`TASK-V2.1.1-opfs-db-worker.md`](TASK-V2.1.1-opfs-db-worker.md) |
| **V2.2 storage polish** | Restore `.sqlite`/`.json`, atomic mirror, Settings copy, import hardening — [`TASK-V2.2-storage-polish.md`](TASK-V2.2-storage-polish.md) |
| Pipeline hub (partial) | **D-42** Enrichment Hub ~85%; Categories lane built but parked |

---

## Milestone routing (2026-05-29)

| Bucket | Milestone | Doc |
|--------|-----------|-----|
| Storage polish, `.sqlite` import, mirror atomicity | **V2.2** ✅ | [`TASK-V2.2-storage-polish.md`](TASK-V2.2-storage-polish.md) |
| D-36 scheduled snapshots | backlog | was V2.2 slice D |
| D-41 search, generic toasts, shell, SQL indexes | **V2.3** | [`TASK-V2.3-quick-wins.md`](TASK-V2.3-quick-wins.md) |
| **Batch reliability, hub, Home/Inspector pipeline, D-26/27/W6/25, D-44** | **V3** | [`TASK-V3-pipeline-workflow.md`](TASK-V3-pipeline-workflow.md) |
| Multi-device sync | **V4** | [`TASK-V4-sync-replicas.md`](TASK-V4-sync-replicas.md) |

## Pipeline / D-42 → V3 (not V2.2)

**Docs:** [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md) · [`TASK-V3-pipeline-workflow.md`](TASK-V3-pipeline-workflow.md) · [`TASK-V2-pipeline-hub.md`](TASK-V2-pipeline-hub.md)

| Pillar | Symptom | V3 tasks |
|--------|---------|----------|
| **A — Execution** | Batch/import unreliable, rate limits, vague errors | **A1–A6** |
| **B — Discovery** | Complex discover UX, unclear signals | **B1–B6** |
| **C — Hub** | D-42, D-25, entry points | **C1–C3** |

| Backlog ID | Tasks |
|------------|-------|
| D-44 | A6 |
| D-27, D-26, W6 | B1, B4, B5 |
| D-25, D-42 | A3, C1, B2 |
| D-38 | A5 |

---

## Tier A — Needs thinking / decisions (tomorrow AM)

| ID | Item | Questions to answer | Blocks |
|----|------|---------------------|--------|
| **D-26** | **User-signal → pipeline policy** | Which edits auto enqueue enrich / classify / embed? | W6 UI, auto-digest, side panel saves |
| **W6** | Category follow-up (with D-26) | Change category, un-accept, primary on accept; rediscover when all rejected? | Inspector UX |
| **D-10** | **Fetch strategy (V2-C bundle)** | **Umbrella closed** 2026-05-28 — [`TASK-V2C-D10-fetch-improvement.md`](TASK-V2C-D10-fetch-improvement.md) · D10.5 ✅ · optional D10.4b |
| **D-25** | **Fetch review UI** | Two-quality compare when `pendingFetchReview` — after D-10 | Product trust on re-fetch |
| **D-41** | **Search result interaction** | Click → Home tab vs Bookmarks vs Inspector; selection model | W1 search UX |
| **D-04** | **Notes store strategy** | `notes` store vs URL-empty `items`; one UI path; migration | Notes UX, export rules |
| **D-05** | **Import provenance** | What lives on `Item.metadata` (source, folder, cover)? | D-38 import polish |
| **D-27** | **Classify queue semantics** | When items enter/leave queue; discover vs classify; caps vs `processAll`; AI-ready vs pending (post-05.C) | Home digest, batch copy |

*05.8 dev hub gate — low priority decision: keep on Bookmarks vs Settings > Advanced (D-34).*

---

## Tier B — V2-C backend / pipeline (implement after Tier A)

| ID | Item | Source | Notes |
|----|------|--------|-------|
| **D-10** | Fetch coverage, retries, in-tab fetch | V2-C, Task 01 follow-ups | See Tier A |
| **D-11** | Auto-embed after extract | V2-C | `embedBackfillPlan` exists |
| **D-12** | Unify `buildSearchEmbedText` vs `buildItemText` | V2-C | Refactor |
| **D-13** | Search tuning | Task 04 **04-defer-2** | Weights / ranking |
| **04-defer-1** | Re-run `search-eval` post-embed corpus | Task 04 | CLI |
| **04-defer-3** | Search quality spot-check doc | Task 04 | 10–20 queries |
| **D-14** | Web Worker embed/classify batches | V1→V2-C | Responsiveness |
| **D-15** | Pluggable `Embedder` / `Retriever` / `Indexer` | V2-C | When automating |
| **D-25** | Suspicious-fetch review/accept UI | 05.6, D-10 | Fields exist on `ItemEnrichment` |

### 05.6 / pipeline leftovers (no separate ID yet — bundle as **D-44** or V2-C task)

| Item | Notes |
|------|--------|
| Unified `runPipelineDigest` (single + batch orchestrator) | Refactor; behavior parity |
| Classify **mid-batch cancel** | `classifyIncremental` has no `AbortSignal` |
| Batch `needsClassifyForDigest` gate after enrich | Skipped in 05.C — policy/refactor |
| Narrow 05.5 **auto-digest on save** | **Policy — needs D-26** |
| Classify gate parity everywhere | `digestClassifyPolicy` vs batch paths |
| **Inspector classify-only** (no re-fetch) | 05.C package 5 — optional |
| Chunked import progress **5k+** | Import Studio — ties D-38 |
| Import report / pipeline edge cases | Failure stats aggregates (Task 01) |

### Task 01 enrichment follow-ups (V2-C / D-10)

| Item | Notes |
|------|--------|
| Deep fetch, t.co unroll, pick-best provider | From Task 01 handoff |
| Tab provider in extension | In-tab fetch family |
| Failure stats / aggregates in product UI | Not only dev hub |
| Replace dev Enrich/Results modals with product UX | **D-42** → [`TASK-V2-pipeline-hub.md`](TASK-V2-pipeline-hub.md) |

---

## Tier C — Data model (V2-B remainder)

| ID | Item | Notes |
|----|------|--------|
| **D-04** | Notes strategy | Tier A |
| **D-05** | Import provenance | Tier A |
| — | AI layer documentation + UI labels (beyond 05.C one-liner) | `projects`/`collections` vs `ai_categories` |
| — | Legacy backup shape validation on import | `verifyBackup` forward-compat |
| — | Multi-collection merge / note-link consistency review | Before merge restore mode |

---

## Tier D — Product UX & shell (mostly UI, some decisions)

| ID | Item | Source | Notes |
|----|------|--------|-------|
| **D-41** | Search click / selection consistency | Tier A | |
| **D-34 / 05.8** | Dev hub → Settings > Advanced gate | Deferred low | Bookmarks toolbar today |
| **D-38** | **Import polish bundle** | Backlog | Cover/favicon on metadata; folder→collection CSV; invalid rows UI; 5k progress+cancel; **→ D-45 local folder scan** |
| **D-39** | **Collections & sharing UI** | Backlog | Detach collection from project; share across `projectIds` |
| **D-42 / D-23** | **Product enrichment UX** | Backlog, 02.1 | **Enrichment Hub ~85%** — D-25 lite + Home entry open; dev modals partially replaced |
| **D-43** | **AI Ask bookmarks polish** | Backlog Phase B | Explicit selection, citations, context size |
| **D-27** | Classify queue / discover UX | 05.C follow-on | Tier A |
| **04-defer-4** | Product search UX gaps | Task 04 | Partially 05.2 — score breakdown still dev? |
| — | Home Library Overview → parent tiles | 05.4 return | Optional |
| — | Right panel collapse **persisted** | 05.1 deferred | W7 |
| — | Project-scoped pin/fav filters | 05.B return | Design |
| — | Trash 30-day auto-purge | 05.B stretch | |
| — | IDB indexes pin/fav/deleted | 05.C skipped | Optional perf |
| **D-45** | **Local folder library** — scan folder → preview map → import `file://` items (+ optional batch digest) | D10 closed 2026-05-28 | [`TASK-V2C-D45-local-folder-library.md`](TASK-V2C-D45-local-folder-library.md) — **tracked**, MVP scoped in brief; blocks on master priority vs D-35 |

### IDE shell — [`UI_IDE_REDESIGN.md`](../UI_IDE_REDESIGN.md) (partially 05.7)

| Phase | Item | Status |
|-------|------|--------|
| 2 | Shared split primitives / resizer consistency | Open |
| 2 | Virtual scope chips beyond dropdown (if desired) | Partial — 05.7 shipped chips |
| 3 | Right pane contract polish (pin/collapse/context) | Open |
| 3 | Tab/scope interaction polish | Partial — 05.7 OOS badges |
| 4 | Decompose `MainContent` + layout mega-files | Open |
| 4 | Keyboard navigation + more persisted UI state | Partial — Help shortcuts |

---

## Tier E — Backup & reliability (V2 close)

| ID | Item | Notes |
|----|------|--------|
| **D-35 / V2.1 + V2.1.1** | **SQLite WASM + OPFS worker + folder mirror** | **shipped** 2026-05-29 — [`TASK-V2.1-sqlite-wasm-storage.md`](TASK-V2.1-sqlite-wasm-storage.md), [`TASK-V2.1.1-opfs-db-worker.md`](TASK-V2.1.1-opfs-db-worker.md) |
| **D-35 / V4** | Per-device replicas + sync layer | **deferred** — ref [`TASK-V4-sync-replicas.md`](TASK-V4-sync-replicas.md) |
| **D-36** | **Backup ops (not scale architecture)** | `chrome.alarms` scheduled rotation; max N files; runtime conflict re-check on focus; user settings for debounce/retention; `alarms` permission; import **merge** mode; optional `.workbench` config dir spike |
| — | Very large libraries (broader than D-35) | List virtualization, paged reads, bulk import memory — 5k–50k |

*Pin/fav/trash **do** sync via `notifyDataChanged` today; D-35 is **how** backup scales, not whether flags sync.*

---

## Tier F — Hygiene (V2 or parallel; often agent-friendly)

| Item | Source |
|------|--------|
| Error handling pass (visible toasts vs `console.error`) | Backlog reliability |
| DB transaction review (multi-step deletes) | Backlog |
| Input validation centralization | Backlog |
| `HttpBackupSink` / BYO server | Backlog deferred |
| Chrome native AI compatibility hints + telemetry | Backlog Phase A |
| Markdown notes editor | Backlog deferred |

---

## 05.C — still open (mechanical)

| Item | Agent-friendly? |
|------|-----------------|
| Package 5: verifyBackup tighten, batch error toasts, Inspector classify-only | Yes |
| Classify mid-batch cancel | Medium |
| SQL index / query tuning (was IDB indexes) | Yes — on v1 schema |
| Manual backup smoke (documented steps) | You — 5 min |

---

## Workflow checklist (what “done” still needs)

| Workflow | Status | Still open |
|----------|--------|------------|
| W5 Search | Done (05.2) | 04-defer tuning; D-41 clicks |
| W1 Daily library | Done core | D-41; W6; D-25 |
| W6 User signals | MVP only | **D-26 + W6** |
| W7 Shell | Done phase 2 | IDE phases 3–4; persisted right panel |
| W8 Settings | Partial | Font scale only; backup policy UI; 05.8 gate |
| W2 Single digest | Done | D-10 closed; D-26 auto-digest |
| W3 Import | Done MVP | **D-38**, **D-45** local folder, D-05, 5k progress |
| W4 Post-processing | Done MVP+05.C | Orchestrator; classify cancel; D-27 semantics |

---

## V3 planning — **done (2026-05-29)**

Routed in [`TASK-V2-POST-ROADMAP.md`](TASK-V2-POST-ROADMAP.md) + [`TASK-V3-pipeline-workflow.md`](TASK-V3-pipeline-workflow.md):

- **V2.2** — storage polish ✅ (2026-05-30)  
- **V2.3** — quick wins (non-pipeline) — **next**  
- **V3** — pipeline reliability + hub + Tier A pipeline IDs  
- **V4** — multi-device sync later  

---

## V3 — explicitly not V2 (park here so we don’t lose them)

| ID | Item |
|----|------|
| D-30 | Chunk RAG, ANN index |
| D-31 | Concept DAG taxonomy |
| D-32 | Cloud embedder offload |
| D-33 | Multiple saved-search tabs |
| D-34 | 05.8 dev gate (if still deferred) |
| — | Phase C/D agentic chat, web search tools |
| — | Security OAuth spike |
| — | Hosted dashboard (chrome-free NTP) — OVERVIEW |

---

## How to use this file

1. **Roadmap:** [`TASK-V2-POST-ROADMAP.md`](TASK-V2-POST-ROADMAP.md).  
2. **Next workers:** V2.3 → V3 (pipeline).  
3. **Storage shipped:** V2.1 + V2.1.1 + V2.2 docs.  
4. **Sync later:** V4.  
5. Ship → move to **Shipped**; mirror in `backlog.md`.

---

*Last updated: 2026-05-29 — Pipeline hub session wrap-up; enrichment focus; D-35 noted unrelated to hub.*

*Update this file when moving items from deferred → active or when closing a subtask.*
