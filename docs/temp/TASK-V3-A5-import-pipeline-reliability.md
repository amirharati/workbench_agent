# TASK-V3-A5 — Import → pipeline reliability

**Status:** **in progress** — auto-pipeline on commit shipped; full 400-link acceptance not done  
**Parent:** [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md)  
**Backlog:** **D-38**, W3  
**Session notes:** [`TASK-V3-B4-classify-queue-d27.md`](TASK-V3-B4-classify-queue-d27.md#session-status--2026-06-02-end-of-worker-session) (test4 repro + open UI/robustness items)  
**Method:** **App-first** (no CLI for `batchDigest` / import post-commit); use A1 taxonomy from CLI classify/discover for error **labels** only  
**Worker:** Update **only this file** (+ code). No backlog/roadmap edits.

## Goal
Post-commit “process N imports” as reliable as Hub bulk; progress + per-row outcomes.

**Scale note:** Imports are often **10k+ links**, not hundreds. Current auto-pipeline runs the **entire** commit in one tab session (`processAll: true`, pre-discover on full `itemIds`, enrich concurrency 2). That is acceptable for dev (~400) but **not** a product design for 10k — see [B4 §5 scale](TASK-V3-B4-classify-queue-d27.md#5-scale--bulk-import-10k-is-normal-not-designed-yet).

## Checklist
- [x] Import Studio runs pipeline **automatically** after commit (no confirm modal) — 2026-06-02
- [ ] Repro in **app**: 400 links → enrich + discover + classify; verify DB links match summary
- [ ] Align failure labels with A1/A3 taxonomy (fix “everything failed” tone when classify skipped)
- [ ] Import report / outcomes consistent with `pipeline-run-latest.json`
- [ ] Cancel/progress for large N (stretch)

## Task return
| Shipped | Auto pipeline on import; taxonomy gate fixes (see B4 session) | App repro | test4: 0 classified before fixes; re-run needed | Next | A3 messages, A5 acceptance, discover parents (B4) |

## Worker prompt
> **V3-A5** per this file. **App-only** path; use A1 taxonomy for labels. Update **only this file**.
