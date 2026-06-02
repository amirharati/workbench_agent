# TASK-V3-A2 — Rate limit, retry & backoff policy

**Status:** **queued** — after **V3-A1**  
**Parent:** [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md)  
**Depends on:** V3-A1 taxonomy  
**Method:** **CLI first → app validate** (Branch A)  
**Worker:** Update **only this file** (+ code). No backlog/roadmap edits.

## Goal
Written retry/backoff policy for batch + LLM paths; implement highest-impact fix (often 429).

## Checklist
- [ ] Policy doc in task return
- [ ] **CLI:** prove fix with `classify-incremental` / `discover-incremental` (same repro as A1)
- [ ] **App:** validate Hub/Home batch after CLI passes
- [ ] Align `src/lib/llmBatchRetry.ts` + OpenRouter client (CLI uses shared categorization libs)
- [ ] User-visible retry messaging (draft for A3)

## Task return
| Phase | | CLI validated | | App validated | | Shipped | | Next | |

## Worker prompt
> **V3-A2** per this file. Implement in **`src/lib`**; **test CLI first**, then **validate in app**. Update **only this file**.
