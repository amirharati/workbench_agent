# TASK-V2C-D45 — Local folder library (PDFs / papers / books)

**Status:** ⏸ **tracked** — brief ready; **not implemented**; master picks priority vs **D-35**  
**ID:** **D-45** (permanent tracker id — do not renumber)  
**Parent:** V2-C import + fetch · ties **D-38** (Import Studio) · **D-10** closed (`file://` single-file foundation)  
**Tracker:** [V2-DEFERRED-TRACKER.md](V2-DEFERRED-TRACKER.md) Tier D · [backlog.md](../backlog.md) Deferred  
**Session origin:** D10 fetch session (2026-05-28) — single `file://` bookmark + tab digest shipped; **bulk folder scan = this task**

---

## Problem

Users keep papers, books, and reference PDFs in local folders (Dropbox, `~/Documents`, Zotero export dirs, etc.). Today they can bookmark **one open local file** via the side panel, but building a **library from a folder tree** is manual and slow.

---

## Idea (product)

**Scan a folder → map of books/papers → workbench library**

| Step | Behavior |
|------|----------|
| **Pick root** | User selects a folder (File System Access API `showDirectoryPicker`, or CLI path for dev) |
| **Scan** | Recursive walk; filter by extension (`.pdf`, `.epub`?, `.md`, `.html`); optional max depth / exclude patterns |
| **Preview map** | Tree or flat list: path, filename, inferred title, size, mtime; folder → collection mapping proposal |
| **Import** | Create `Item` rows with `url: file:///…` (exact path), dedupe by normalized path; optional collection per subfolder |
| **Digest batch** | Queue enrich for new rows (tab-session or future PDF text extract); progress + report like Import Studio |

**Outcome:** A searchable, categorized local corpus alongside web bookmarks — “my papers”, “my books”, course folders, etc.

---

## Foundation already shipped (2026-05-28)

- `file://` accepted as bookmark URL (`isValidBookmarkUrl`, dedup in `db.ts`)
- Manifest `file:///*/*` + user enables **Allow access to file URLs** on extension
- Side panel save + digest from open local tab (`tabSessionExtract`, `tab-page-extract.js` local-file branch)
- Platform tag `local-file`; hybrid skips headless → tab-first for `file://`
- **Gap:** PDF full-text still weak (Chrome viewer DOM); hosted PDF via Jina works better

---

## Open design questions (master session)

1. **Chrome vs CLI:** Extension directory picker only (no arbitrary path without user gesture) vs companion CLI scan → JSON import?
2. **Path stability:** `file://` breaks when files move — store `metadata.localPath` + optional re-scan “repair links”?
3. **PDF text:** Add `pdf.js` (or native) in extension for `file://` + batch digest, or require tab-open per file for v1?
4. **Folder → collection:** Auto-create collections from top-level subfolders? Map to existing project?
5. **Relation to Import Studio:** New tab “Local folder” vs extend existing import adapters?
6. **Privacy / backup:** Local paths in backup JSON — OK for personal use; any redaction for share?

---

## Suggested MVP slice (when picked up)

1. **Import Studio → Local folder** — directory picker, `.pdf` only, flat preview, commit as `file://` items into chosen collection
2. **No batch digest in v1** — user runs Home batch digest after commit (reuse 05.6)
3. **Follow-up:** PDF text extract + folder→collection mapping + re-scan repair

---

## Dependencies / blocks

| Dep | Notes |
|-----|--------|
| D-10 | `file://` fetch path — **partial done**; PDF extract still optional |
| D-38 | Import Studio UX patterns (preview, commit, report) |
| D-35 | Large folder (1000+ PDFs) may stress backup — decide before big imports |

---

## Return template (implementation session)

- What shipped (picker, scan rules, import path, digest policy)
- Chrome permission UX documented
- Limits (extensions, path drift, PDF quality)
- Backlog / tracker updates
