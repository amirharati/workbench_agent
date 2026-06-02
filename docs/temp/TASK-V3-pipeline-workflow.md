# TASK-V3 — Pipeline workflow & reliability (umbrella)

**Status:** **active** — **primary product focus** after V2.3 Tier 1  
**Last updated:** 2026-06-02  
**Latest session:** [`TASK-V3-B4-classify-queue-d27.md`](TASK-V3-B4-classify-queue-d27.md#session-status--2026-06-02-end-of-worker-session) — test4 repro, shipped fixes, **open:** discover/parents, UI copy, rerun signals, robustness  
**Session breakdown:** [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md) ← **pick tasks here**  
**Parent:** [`TASK-V2-POST-ROADMAP.md`](TASK-V2-POST-ROADMAP.md)  
**Hub UI detail:** [`TASK-V2-pipeline-hub.md`](TASK-V2-pipeline-hub.md)  
**Prerequisite:** V2.1 + V2.1.1 + V2.2 storage (done)

---

## Why V3 (not more V2.x patches)

Two **dogfood pillars** (2026-05-30):

| Pillar | Symptom | Impact |
|--------|---------|--------|
| **A — Execution** | Bulk import + batch **unreliable** (rate limit, slow, retry works 1-by-1); vague error labels; unclear stage (fetch vs LLM vs classify) | Users distrust bulk; wasted API spend |
| **B — Discovery loop** | Discovery **complex/vague**; hard to find new categories without over-LLM; signals unclear (user vs auto: unclassified, generic, …) | Taxonomy drifts; wrong pools |

Also: bulk re-digest **also classifies**; Home vs Hub scatter; **D-26 / D-27 / W6 / D-25** undecided.

**Decision:** V3 = **research + iterative tasks** per [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md) — reliability first (A1–A5), discovery spec/UX (B1–B5), hub weave (C*).

**Branch A method:** **CLI first → app validate** — repro/fix classify/discover via `npm run classify-incremental` / `discover-incremental`; then confirm import/Hub/worker in app. See [`CLI_WORKFLOW.md`](../CLI_WORKFLOW.md).

**Not in this V3 program:** backlog “AI — V3” scale (chunk RAG, ANN, DAG) — see tracker § park.

---

## V3 scope map

| Track | IDs / areas | Doc / code |
|-------|-------------|------------|
| **P0 — Reliability** | Batch errors, partial failure, retry semantics, RPC/txn edge cases | `PipelineProgressProvider`, `batchDigest.ts`, `singleLinkDigest`, worker RPC |
| **P1 — Hub & navigation** | D-42 slices 1–4, Home → hub, Inspector “open in pipeline” | `PipelineHubView`, `pipelineHubQueries.ts` |
| **P2 — Policies & review** | D-26, D-27, W6, D-25 lite | `classifyPolicy`, `digestClassifyPolicy`, Inspector |
| **P3 — Orchestrator** | D-44 unified digest, gate parity, classify cancel | refactor after P0 stable |
| **P4 — Backend perf** | D-11 auto-embed, D-14 workers, catalog shortlist, fetch parallelism | optional within V3 |

---

## P0 — Batch reliability (start here)

**Investigate and fix** (document root cause in task return):

- [ ] Reproduce: Home batch N, Hub bulk, Categories classify/discover — capture errors vs one-off `enrichOne` / `classifyIncremental` maxItems=1
- [ ] Check: worker RPC timeout, transaction size, concurrent tab RPC, abort mid-flight, error propagation to UI
- [ ] Ensure failed items surface in **batch report** with actionable message (not silent skip)
- [ ] Split bulk actions: **Re-enrich only** vs **Re-digest + classify** (hub + Home)

**Acceptance:** Batch of 10 known-failing URLs either completes with clear per-item errors or documented platform limit — not “failed then works one-by-one” without explanation.

**Key files:**

- `src/components/dashboard/PipelineProgressProvider.tsx`
- `src/lib/pipeline/batchDigest.ts`
- `src/lib/pipeline/singleLinkDigest.ts`
- `src/lib/categorization/classifyTopicExtract.ts`
- `src/lib/storage/dbClient.ts` (RPC)

---

## P1 — Hub & entry points

From [`TASK-V2-pipeline-hub.md`](TASK-V2-pipeline-hub.md):

- [ ] Finish Enrichment Hub (D-25 actions, enrich-only bulk)
- [ ] Home digest cards → hub filters (not Bookmarks-only browse)
- [ ] Categories lane dogfood OR explicit defer with copy
- [ ] Inspector shortcut

---

## P2 — Tier A decisions (write one-liners before coding)

| ID | Decision needed |
|----|-----------------|
| **D-26** | User edit → auto enqueue what? |
| **D-27** | Queue semantics / Home copy |
| **W6** | Category change / un-accept / primary |
| **D-25** | Fetch review: accept prior vs force |

---

## P3 — D-44 orchestrator (later in V3)

- Unified `runPipelineDigest` for single + batch  
- `needsClassifyForDigest` parity everywhere  
- Classify mid-batch `AbortSignal`  

---

## Out of V3 (other milestones)

| Item | Milestone |
|------|-----------|
| `.sqlite` import UI, mirror atomicity | V2.2 |
| D-41 search clicks | V2.3 |
| Multi-device sync | V4 |
| Chunk RAG, ANN, DAG | V3+ park (old scale AI) |

---

## Suggested V3 sessions

See [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md) for full list. **Start:**

| # | Task ID | Focus |
|---|---------|--------|
| 1 | **V3-A1** | Repro + failure taxonomy (import + batch + discover) |
| 2 | **V3-A2** | Rate limit / retry / backoff policy |
| 3 | **V3-B1** | Discover fair-game + signal matrix (spec) |
| 4 | **V3-A3** | Stage-aware error labels + batch report |
| 5 | **V3-B2** | Simple discover loop UI |
| 6 | **V3-A4** | Bulk action split (enrich vs digest vs classify) |

---

## Worker prompt (copy-paste)

> **V3 P0 only:** per [`TASK-V3-pipeline-workflow.md`](TASK-V3-pipeline-workflow.md), diagnose **batch pipeline failures** where single-item retry succeeds. Reproduce, fix root cause, improve batch report errors. Optionally split enrich-only vs enrich+classify bulk. **Do not** start V2.2 storage or V4 sync. Log findings in task return.

---

## Task return

| Field | Value |
|-------|-------|
| Root cause | |
| Fix | |
| Files | |
| Remaining P0 | |

---

## Related

- [`V2-DEFERRED-TRACKER.md`](V2-DEFERRED-TRACKER.md) — ID index  
- [`D10-FETCH-FINDINGS-REPORT.md`](D10-FETCH-FINDINGS-REPORT.md) — fetch failures (separate from batch orchestration)  
