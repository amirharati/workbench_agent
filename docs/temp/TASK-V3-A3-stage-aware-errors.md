# TASK-V3-A3 — Stage-aware error labels & batch report

**Status:** **queued** — after **V3-A1** (A2 helpful)  
**Parent:** [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md)  
**Backlog:** D-25 lite, 05.C pipeline toasts, failure labels  
**Method:** **CLI first → app validate** (labels in `src/lib`; spot-check CLI stderr/SUMMARY, then app reports)  
**Worker:** Update **only this file** (+ code). No backlog/roadmap edits.

## Goal
Users see **stage** (fetch/extract/classify/discover) + plain label + next action in batch/import reports.

## Checklist
- [ ] Map errors in **`src/lib`** (`failureLabels`, enrichment, classify paths)
- [ ] **CLI:** classify/discover run output uses taxonomy labels (or SUMMARY.md sample)
- [ ] **App:** Hub batch report + Import post-commit report
- [ ] LLM-stage errors surfaced in app (not console-only)

## Task return
| Phase | | CLI sample | | App dogfood | | Files | | Next | |

## Worker prompt
> **V3-A3** per this file. **`src/lib`** first; verify labels via **CLI run**, then **app** batch/import UI. Update **only this file**.
