# TASK-V3-C2 — Inspector ↔ hub shortcuts

**Status:** **partial** (2026-06-02)  
**Parent:** [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md)  
**Worker:** Update **only this file** (+ code). No backlog/roadmap edits.

## Goal
Inspector and side panel expose the same digest actions as Hub without opening dev modals.

## Checklist
- [x] `ItemDigestQuickActions`: Re-digest, Embed, Classify, Embed+classify, Fetch in browser
- [x] Wired in Inspector + side panel; side panel wrapped in `PipelineProgressProvider`
- [ ] Parity with Hub bulk action names (depends on **V3-A4**)
- [ ] Deep links from Home digest cards (depends on **V3-B3**)

## Task return (2026-06-02)

| Shipped | Files |
|---------|--------|
| Shared quick actions component | `ItemDigestQuickActions.tsx` |
| Inspector tab | `InspectorTab.tsx` |
| Side panel digest | `SidePanelDigestPanel.tsx`, `SidePanelView.tsx`, `App.tsx` |

## Worker prompt
> **V3-C2** per this file. Update **only this file**.
