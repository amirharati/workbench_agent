# TASK-V3-B1 — Discover fair-game & signal matrix (research)

**Status:** **ready for worker**  
**Phase:** spike / spec (minimal code — policy alignment only)  
**Parent:** [`TASK-V3-program-breakdown.md`](TASK-V3-program-breakdown.md) · Pillar **B**  
**Backlog:** **D-27**, **D-26**, **W6**

**Worker:** Update **only this file** + code only if aligning existing policy constants. Do **not** edit `backlog.md`, tracker, or roadmap.

---

## Goal

Before more discover UI: document **who enters the discover pool** and **who is excluded** — user signals + automatic signals (TBD validated with user).

---

## Signal matrix (draft — validate, do not guess product)

| Signal | Include in discover pool? | Include in classify? | Notes / code today |
|--------|---------------------------|----------------------|-------------------|
| Never classified / no accepted link | TBD | | |
| Only `general` / fallback leaf | TBD | | |
| `pending_discover` from classify | TBD | | |
| User rejected all suggestions | TBD | | **W6** |
| User set primary manually | TBD | | **D-26** |
| Enrich failed / no usable text | TBD | | |
| Just bulk-imported | TBD | | **D-27** cap? |
| In trash / ineligible | TBD | | |

---

## Fair-game rules (fill in)

| Rule | Value (draft) |
|------|----------------|
| Max items per discover run | |
| Max LLM batches per run | |
| Cooldown after bulk import | |
| Scope: selection vs project vs library | |

---

## Checklist

- [ ] Read `categorizationFairGame.ts`, `discoverPolicy.ts`, `discoverTaxonomy.ts`, hub Categories lane
- [ ] Fill signal matrix with **actual** behavior today vs intended
- [ ] List **open questions** for user approval (bullet list)
- [ ] Propose 1-page fair-game spec (markdown in task return)
- [ ] Optional: tiny diff only if constant rename/clarify (no UX redesign — **B2**)

---

## Out of scope

- Categories lane UI redesign (→ **V3-B2**)
- Home copy (→ **V3-B4**)
- User-signal actions (→ **V3-B5**)

---

## Task return

| Field | Value |
|-------|-------|
| Phase | spike |
| Spec location | (section below or link) |
| Open questions for user | |
| Mismatches vs code today | |
| Recommended next | B2 / B4 |
| Files touched | |

---

## Approved spec (master fills after review)

*(empty — user pastes decisions here)*

---

## Worker prompt

> Run **V3-B1** per [`TASK-V3-B1-discover-fair-game.md`](TASK-V3-B1-discover-fair-game.md). Research/spec only; no hub UI overhaul. Update **only this file** when done.
