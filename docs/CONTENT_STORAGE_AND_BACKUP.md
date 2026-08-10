# Content Storage and Backup

> Status — 2026-08-09: checkpoint 2 storage smoke test accepted. The earlier implementation used an OPFS content database plus
> a selected-folder snapshot, creating two durable copies and an unnecessary replication lifecycle. That
> implementation is being replaced by the folder-owned design below. The core database design is unchanged.

## Decision

Homebase has two SQLite files with deliberately different ownership and lifecycles:

| Store | Contents | Exclusive owner | Durable location |
|---|---|---|---|
| `workbench.sqlite` | Library, user decisions, derived metadata, and durable pipeline jobs/tasks | Core DB worker | OPFS runtime database plus the existing selected-folder recovery mirror |
| `workbench-content.sqlite` | Compressed fetched and review bodies | Content-store worker | Exactly one current file in the user-selected folder |

`workbench-content.sqlite` is not replicated into OPFS. The content worker may hold an in-memory SQLite
connection while the extension is running, but that memory is a volatile working copy, not a second durable
store. On startup or folder relink, the worker loads the selected-folder file before serving content requests.

The pipeline coordinator is a third authority. It owns fetch, AI extraction, embedding, classification,
scheduling, and cancellation. It does not own either database and never reads or writes SQLite directly:
it calls the core DB and content-store APIs.

## Required interfaces

Callers see an opaque key/value store, not SQLite rows or archive coordinates:

```ts
contentStore.put(contentKey, body, metadata)
contentStore.get(contentKey)
contentStore.delete(contentKey)
contentStore.flush() // explicit durability boundary; never hidden inside job completion
```

The core database stores only an opaque logical key such as:

```text
content:v1:raw:<item-id>:<content-hash>
```

It never stores a folder filename, byte offset, compressed-block location, or SQLite row ID. The content
worker is free to change the physical schema without migrating core-library relationships.

## Authority boundaries

```text
Dashboard / Import / Enrichment Hub / side panel
                    |
                    | submit, cancel, observe
                    v
        one offscreen pipeline coordinator
          fetch / AI / embed / classify only
                    |
          +---------+----------+
          |                    |
          v                    v
   core DB API          content-store API
   core DB worker       content worker
          |                    |
          v                    v
   OPFS workbench.sqlite   volatile SQLite connection
          |                    |
          v                    v
   folder recovery mirror  selected folder/
                           workbench-content.sqlite
                           (only durable content copy)
```

Invariants:

- UI documents submit and observe jobs; they never execute URL processing or own database connections.
- The core DB worker alone owns `workbench.sqlite` and durable job/task state.
- The content worker alone owns content compression, lookup, integrity checks, serialization, and flushing.
- The pipeline coordinator alone executes processing stages, initially in one serialized lane.
- Folder I/O is never a prerequisite for dashboard navigation, progress rendering, cancellation, or core DB
  availability.

## Data tiers

### Tier 1 — Critical core data

Stored in `workbench.sqlite`:

- URLs, notes, projects, collections, placements, and workspaces
- Favorite, Pin, accepted organization, deletion, and other user decisions
- summaries, key points, tags, enrichment status, and the opaque content key
- search/categorization signals
- pipeline jobs, tasks, leases, cancellation state, and committed stage progress

The existing OPFS runtime database and bounded folder recovery policy remain unchanged.

### Tier 2 — Valuable, rebuildable content

Stored only in the folder's `workbench-content.sqlite`:

- fetched Markdown/raw bodies
- pending-review raw bodies
- content identity and integrity metadata
- later, content chunks or other large rebuildable inputs if justified

The worker stores bodies as independently compressed values so one key can be read without decompressing
the entire database.

### Tier 3 — Disposable diagnostics

High-volume pipeline diagnostics stay bounded in database state or are exported explicitly. Normal
processing must not create `enrichment-cache/<item>.md` or automatic `pipeline-runs/*` trees.

## Content identity and schema

The current logical identity is `(item_id, kind, content_hash)`, encoded into an opaque `content:v1:` key.
Rows are immutable for that identity. A repeated put is idempotent.

Minimum physical fields:

- `item_id`
- `kind` (`raw` or `review`)
- `content_hash` and independently verified `body_hash`
- `codec`
- compressed `body`
- `raw_bytes` and `stored_bytes`
- `fetched_at` and `created_at`

The core enrichment row may use content only when its opaque reference resolves and the expected hash
matches. Missing or corrupt content is reported as unavailable; it never causes the wrong body to be shown.

## Cross-database commit protocol

The two files cannot share a transaction. The durable coordinator therefore uses content first:

1. Fetch computes the body and stable content hash.
2. The content worker idempotently inserts the compressed value and returns its opaque key.
3. The core worker conditionally commits enrichment metadata plus that key and completes the task, fenced by
   the current job/task lease epoch.
4. A later asynchronous content flush publishes accumulated content changes to the one folder file.

A crash before step 3 can leave an unreferenced content row, never a core row that points to a different
body. Garbage collection may later remove unreferenced immutable rows.

Step 4 is deliberately not part of job completion. The core task records whether its content revision is
still pending flush so the UI can distinguish "processed" from "content file is current" without blocking
the pipeline.

## Folder-only persistence policy

Browser SQLite cannot directly mount a user-selected `FileSystemFileHandle` with the supported OPFS VFS.
The first implementation therefore uses a worker-owned in-memory SQLite connection and atomically replaces
the selected-folder file with serialized database bytes.

To prevent a continuously running import from postponing persistence forever:

- the first dirty write starts a fixed maximum-latency flush timer;
- later writes coalesce into that flush but do not restart the timer;
- an explicit **Backup now** or destructive clear forces a flush;
- pipeline completion, cancellation, progress, and navigation never await an ordinary background flush;
- only `workbench-content.sqlite` is retained—no rotated history and no OPFS replica.

This trades a bounded recent-content loss window for one-copy storage and browser-only operation. Requiring
zero-loss durability after every fetched item at large scale would require a custom SQLite VFS/native helper
or relaxing the one-file/one-copy constraint; repeated full-file replacement after every item is not an
acceptable large-import design.

## Startup, permission, and failure behavior

- Core DB startup never waits for content startup.
- Content RPCs wait until the content worker has either loaded the selected-folder file or established a new
  empty database for a writable selected folder.
- If Chrome has paused folder permission, core/library features remain available but content reads and writes
  report that content storage is unavailable until a user gesture restores permission.
- Missing file with a writable linked folder creates one valid empty `workbench-content.sqlite`.
- Corrupt file is not silently replaced; preserve it and require an explicit rebuild/replacement decision.
- Failed background flush leaves the previous valid file intact and reports a pending durability error.
- Failed content insertion fails that item's content-store stage before paid extraction.
- Missing content never triggers automatic refetch or AI spend.

## Implementation checkpoints

1. **Accepted — content-store ownership:** remove the OPFS content database, keep one dedicated worker and the opaque-key
   API, load from the folder before serving calls, and use a fixed maximum-latency background flush.
2. **One-link vertical slice:** route one Enrichment Hub link through the shared coordinator and explicit
   `fetch -> content_store -> extract -> core commit` stages.
3. **Durable jobs/cancellation:** add core-owned jobs/tasks, leases, fenced commits, and durable cancel.
4. **Surface migration:** move Import, sidebar, Inspector, and maintenance actions onto the same job API.
5. **Lifecycle and scale:** navigation, dashboard closure, multiple tabs, sleep/wake, then a large batch.

## Acceptance criteria

- The selected folder contains exactly one current `workbench-content.sqlite` and no per-item content files.
- The content file is the only durable copy of fetched bodies; no content database exists in OPFS.
- A body is addressable through one opaque key and survives dashboard reload and Chrome restart.
- A clean reinstall can reload matching bodies after the user reselects the folder.
- Continuous processing cannot defer the first pending flush indefinitely.
- Core/library startup succeeds when content storage is unavailable.
- Re-enrichment does not increase the selected-folder file count.
- Ordinary job completion, cancellation, navigation, and progress never wait for a whole-file content flush.
- One-link, five-link, cancel, navigation/refresh, closing dashboards, sleep/wake, and large-batch gates pass in
  that order before concurrency is increased.
