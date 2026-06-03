# TASK-V3-A5b — Import Scale (10k+ links)

**Status:** **queued** (replaces `TASK-V3-A5-import-pipeline-reliability.md`)  
**Parent:** [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md)  
**Backlog:** **D-38**, W3  
**Worker:** Update **only this file** (+ code). No backlog/roadmap edits.

## Goal
The new auto-start import pipeline will crash the browser if given 10,000 links because it tries to load everything into one tab at once. We need wave/chunk processing.

## Already landed (2026-06-02, not scale)

- [x] `bookmarkFileImport.ts` — schema probe, fast-fail bad JSON/CSV/HTML
- [x] Re-import restores soft-trashed rows when skip-off (`dbCore`, `importReport`)

## Checklist (scale — still open)

- [ ] Wave/chunk processing (e.g., 50-200 ids per wave)
- [ ] Persist run checkpoint (`importRunId`, last offset, stage)
- [ ] Background processing UI (don't block Import Studio)

## Task return
| Shipped | | App repro | | Next | |

## Worker prompt
> **V3-A5b** per this file. Update **only this file**.