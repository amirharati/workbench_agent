# Home Scope and Workspace Roadmap

Status: historical implementation roadmap. Its scoped-tab and per-project active-workspace rules are superseded by [`PROJECT_SESSIONS_AND_WORKSPACES.md`](PROJECT_SESSIONS_AND_WORKSPACES.md). The Inbox and permanent organization rules remain applicable.

## Product model

Homebase keeps four concepts distinct:

- **All Library** is the aggregate view of every stored item in every project, collection, and Inbox. It is not a project and is not limited to open or recent projects.
- **Inbox** is the system-owned destination for items captured without an intentional project. It replaces the user-facing concept of `Default project`.
- **Project / collection** are durable organization. A collection narrows its parent project; it does not create a separate workspace.
- **Workspace** is a persistent set selected independently from page/project navigation. See the canonical workspace model linked above.

Open projects in the quick switcher are navigation shortcuts only. Closing a shortcut never changes stored content or All Library search coverage.

## Canonical Home grammar

Every Home scope follows the same interaction contract:

1. Choose a scope: All Library, Inbox, project, or collection.
2. Choose Browse or Search.
3. Single-select content to update Preview / Inspector without navigation.
4. Add an item or frozen search snapshot to the current workspace without leaving the page.
5. Enter Focus explicitly when the workspace should be presented as tabs.
6. Open the actual website only from its URL control.

The shell and action meanings stay consistent; the Browse content changes by scope:

- All Library: orientation, projects, Inbox status, favorites, recent material, cross-project signals.
- Inbox: unorganized captures and organization actions.
- Project: workspaces, collections, project pins, item list, and preview.
- Collection: the same project page narrowed to one collection; it keeps the parent project workspace.

## Workspace visibility

- All Library owns one global active workspace.
- Inbox owns an Inbox workspace.
- Each project owns one active workspace at a time; all its collections share it.
- Global workspace entries are hidden inside projects by default.
- A project may temporarily `Include global work`; this changes visibility only.
- Entries can be copied or moved between workspaces without changing item organization.
- Permanent project/collection membership changes only through explicit organization actions.

## Search scope

Search defaults to the current content scope:

- All Library searches every stored item.
- Inbox searches Inbox.
- Project searches that project.
- Collection searches that collection.

Search may be deliberately broadened. A saved workspace search always snapshots its query, filters, mode, and scope. Moving or copying a global search into a project must not silently narrow it; global searches retain an `All Library` scope label.

## Clean-install placement policy

Canonical rules for a fresh development installation:

- Unscoped capture goes to Inbox.
- Project-scoped capture goes to that project's system `Unfiled` collection.
- Collection-scoped capture goes to that collection.
- Every active item has at least one placement.
- Inbox has exactly one system collection named `Incoming` and exposes no collection-management UI.
- Every normal project has a system collection named `Unfiled` for project-scoped captures without an explicit collection.
- `Move to project` removes the Inbox placement by default.
- `Add to project` preserves Inbox and adds another placement.

Internal compatibility identifiers may retain their historical names, but fresh data presents only the Inbox, Incoming, and Unfiled product language. No legacy-data migration is planned before release; development data is reset after the model changes.

## Delivery checkpoints

### A. Global Home alignment

Implementation: complete for review.

- Add the active global workspace card to All Library Browse and Search.
- Make All Library single-click selection update Inspector without entering Focus.
- Replace Home `Open in tab` actions with non-navigating `Add to workspace` actions.
- Keep Focus as the only Home transition to the full tab canvas.

Acceptance:

- Adding an item/search visibly updates the global workspace while Home stays mounted.
- Re-adding an identical search snapshot selects the existing entry.
- All Library remains an aggregate content scope, while its workspace contains only explicitly added entries.

### B. Project/global workspace visibility

Implementation: complete for review.

- Keep project work project-scoped by default.
- Add `Include global work` to project Browse/Search/Focus.
- Do not expose other projects' work through this control.
- Preserve an explicit advanced `Show all` path when cross-project tab inspection is needed.

Acceptance:

- Entering a project shows project work only.
- Including global work adds only global entries and does not mutate them.
- Switching projects never moves, duplicates, or deletes workspace entries.

### C. Search-scope clarity

Implementation: complete for review.

- Show the effective scope on Search and saved workspace search entries.
- Default filters from the current All Library/project/collection scope.
- Provide an explicit scope control for deliberate broadening/narrowing.
- Restore frozen search scope when selecting a workspace search.

Acceptance:

- A user can predict which content will be searched before running it.
- A global saved search remains global when viewed from a project.
- Later Home searches cannot mutate saved workspace searches.

### D. Action-language normalization

Implementation: complete for review.

- Use `Select`, `Add to workspace`, `Remove from workspace`, `Focus`, and `Open website` consistently.
- Reserve `Move` and `Add to project` for durable organization.
- Keep inline Preview content-focused and Inspector metadata/processing-focused.

### E. All Library workspace lens and Preview

Implementation: complete for review.

- Add a stable Preview beside active work in All Library Browse.
- Allow switching between the global workspace, an individual active project workspace, and a grouped `All active workspaces` view.
- Treat the combined view as a visibility lens only; it never merges, moves, or changes ownership of workspace entries.
- Keep project groups labelled by their source project and active workspace.
- Make selecting an entry update Preview and Inspector; require an explicit action to view search results or enter Focus.

Acceptance:

- A user can inspect current work across projects without navigating away from All Library.
- Selecting an entry in `All active workspaces` does not mutate any workspace.
- Focus enters the source workspace rather than creating a combined workspace.
- Favorites and recent material share the same All Library Preview.

### F. Clean Home and development data baseline

Implementation: complete for fresh-install testing.

- Organize All Library Home into three priorities: Find, Continue working, and Browse library.
- Replace scattered project, recent, favorite, trash, processing, and analytics cards with one reusable Browse panel.
- Keep Processing and Trash as secondary utilities rather than primary Home content.
- Move recent search discovery into Search's empty state.
- Use `Inbox / Incoming` for unscoped captures and `Unfiled` for project-scoped captures without a chosen collection.
- Reset development data through uninstall/reinstall and a new backup folder after this checkpoint rather than maintaining a pre-release migration path.

Acceptance:

- Home has one primary search action, one current-work area, and one library-browsing area.
- A clean installation creates Inbox and Incoming automatically.
- Creating a normal project creates its Unfiled collection automatically.
- Unscoped and project-scoped capture paths never produce unplaced items.

## Review boundary

Checkpoints A-F now form the clean development baseline. After reinstalling with a new backup folder, use realistic daily workflows to identify interaction problems before refining the visual system or applying these patterns to other pages.
