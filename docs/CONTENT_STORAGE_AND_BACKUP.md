# Content Storage and Backup

> Status — 2026-08-09: this is the approved target design. The first implementation attempt is
> preserved only on a safety branch and is intentionally not active on `design/ui-redesign`.
> The rebuild must give this database its own content worker rather than sharing the core DB worker.

## Decision

Homebase uses one user-selected folder as a provider-neutral recovery target. The folder may be
inside Dropbox, Google Drive, OneDrive, a local disk, or any other writable filesystem location;
Homebase does not integrate with or configure the sync provider.

Two SQLite databases have different durability and update policies:

| Store | Purpose | Runtime truth | Folder recovery policy |
|---|---|---|---|
| `workbench.sqlite` | Irreplaceable library and user decisions | OPFS, owned by the core DB worker | Current mirror plus bounded recovery snapshots |
| `workbench-content.sqlite` | Expensive but rebuildable fetched/derived content | OPFS, owned by a separate content worker | One current atomically replaced snapshot; no history rotation |

The dashboard remains light because UI tabs receive projections and paged metadata from the worker;
neither raw bodies nor embedding vectors are bulk-hydrated into a tab.

## Data tiers

### Tier 1 — Critical

Stored in `workbench.sqlite`:

- URLs, notes, projects, collections, placements, and workspaces
- user decisions such as Favorite, Pin, accepted organization, and deletion
- enrichment status, summary, key points, tags, content hash, and content availability metadata
- item-level search/categorization signals
- pipeline recovery state required to resume safely

Tier 1 receives the existing live mirror and recovery rotation.

### Tier 2 — Valuable and rebuildable

Stored in `workbench-content.sqlite`:

- fetched Markdown/raw bodies
- pending-review raw bodies
- content identity and integrity metadata
- later, RAG chunks, full-text indexes, and chunk embeddings if needed

This data can theoretically be fetched or derived again, but rebuilding may cost time, network
access, AI spend, or fail because a source disappeared. It therefore receives one durable folder
copy, without historical rotations.

### Tier 3 — Disposable diagnostics

High-volume pipeline diagnostics remain in local database state or are exported explicitly as one
user-requested artifact. Normal enrichment must not create an unbounded `pipeline-runs/` folder tree.

## Runtime and recovery flow

```text
UI tab caches
     |
     v
offscreen owner
     |-- core DB worker: OPFS workbench.sqlite ------> chosen folder/workbench.sqlite
     |                                      frequent bounded mirror
     |
     `-- content worker: OPFS workbench-content.sqlite -> chosen folder/workbench-content.sqlite
                                            coarse checkpoint / one current copy
```

Normal reads and writes never use the chosen folder as a live database. The folder contains recovery
snapshots. On a clean installation, Homebase restores folder files into OPFS and then serves reads
from the local workers.

The core database restores first. Missing, stale, or corrupt content storage must never prevent the
library from opening.

## Content schema and integrity

The content database stores independently compressed records so one body can be read without
decompressing the complete archive.

Minimum document fields:

- `item_id` — primary lookup key
- `kind` — current body or pending-review body
- `content_hash` — identity shared with the main enrichment row
- `codec` — explicit compression format
- `body` — compressed bytes
- `raw_bytes` and `stored_bytes`
- `fetched_at` and `updated_at`

A body is usable only when its item ID, kind, and expected content hash match. A mismatch is treated as
unavailable content, never as a reason to show the wrong source body.

SQLite transactions protect local row updates. Before publishing a folder snapshot, Homebase checks
SQLite integrity plus basic size and row-count expectations.

## Snapshot policy

Content writes commit immediately to OPFS. Folder publication is deliberately coarse:

- after a bounded time/volume checkpoint while content is dirty
- when the user explicitly requests Backup now

Pipeline completion, pause, cancellation, and recovery never wait for this publication.

Publication writes `workbench-content.sqlite.tmp`, validates it, and only then replaces
`workbench-content.sqlite`. The old good file remains until the new snapshot is complete. The temporary
file is staging, not backup history.

`workbench.meta.json` remains the conflict envelope for the core database. The content database keeps
its own revision and last-export facts in `content_meta`, so publishing content never races with or
rewrites core conflict metadata. A core snapshot may be newer than the content snapshot. This is valid:
affected raw bodies are shown as not yet backed up rather than blocking normal use.

## Availability and failure behavior

- Missing content DB: open the library normally; mark raw bodies unavailable.
- Stale content snapshot: restore all matching rows and report incomplete coverage.
- Corrupt content snapshot: keep core data available, preserve the suspect file, and offer an explicit
  rebuild or replacement path.
- Failed content mirror: retain the previous valid folder snapshot and report content backup pending.
- Missing individual body: allow a deliberate selected-item or batch rebuild; never spend network or AI
  budget automatically.
- Main/content mismatch: content hash wins as the guard; do not attach stale content to an item.

## Scale and provider neutrality

Ten thousand URLs produce database rows, not ten thousand files in the selected folder. The folder has
a small bounded file set, and Homebase requires no ignore rules, provider client, OAuth setup, or sync
configuration.

SQLite is the active indexed archive. A `tar.gz` containing Markdown plus `manifest.tsv` may be offered
later as an explicit portable export, but it is not the runtime store or automatic backup format.

## Clean-install boundary

This change is implemented before release and intentionally has no migration from legacy
`enrichment-cache/*.md` or accumulated `pipeline-runs/` artifacts. Testing starts from a fresh extension
installation and a clean selected folder. Existing legacy content files can be discarded.

## Acceptance criteria

- Enriching 10,000 items does not create per-item files in the selected folder.
- Full raw content remains readable after dashboard reload and Chrome restart.
- A fresh extension installation can restore the core DB and the one content snapshot without
  re-downloading matching bodies.
- Core restore succeeds when the content snapshot is absent or invalid.
- Re-enrichment replaces the indexed body without increasing folder file count.
- Deleting/resetting content removes the corresponding sidecar rows without risking Tier 1 data.
- Content snapshots are not written per URL and never accumulate historical copies automatically.
- Automatic pipeline diagnostics do not create an unbounded folder tree.
