# Home Scope and Workspace Roadmap

Status: accepted product direction; checkpoints A-D and the All Library workspace lens implemented and ready for product review; Inbox migration deferred to its own reviewed checkpoint.

## Product model

Homebase keeps four concepts distinct:

- **All Library** is the aggregate view of every stored item in every project, collection, and Inbox. It is not a project and is not limited to open or recent projects.
- **Inbox** is the system-owned destination for items captured without an intentional project. It replaces the user-facing concept of `Default project`.
- **Project / collection** are durable organization. A collection narrows its parent project; it does not create a separate workspace.
- **Workspace** is the temporary working set for the current scope. **Focus** is the full-tab presentation of that workspace, not another content scope.

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

## Inbox placement policy

Target rules for the separate migration checkpoint:

- Unscoped capture goes to Inbox.
- Project-scoped capture goes to that project's system `Unsorted` collection.
- Collection-scoped capture goes to that collection.
- Every active item has at least one placement.
- Inbox has exactly one system collection and exposes no collection-management UI.
- `Move to project` removes the Inbox placement by default.
- `Add to project` preserves Inbox and adds another placement.

The existing `project_default` and its system collection provide a compatible technical base, but renaming, UI behavior, import/restore paths, deletion fallbacks, and existing-data migration must be verified together.

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

### F. Inbox migration (separate review boundary)

Implementation: deliberately not started pending review of A-E.

- Rename the default project/collection in all current and restore/import paths.
- Add Inbox as a fixed system scope rather than a recent-project shortcut.
- Implement Move versus Add placement semantics.
- Migrate existing default-project data idempotently.
- Test deletion fallbacks, imports, backup restore, side-panel capture, and item creation in every scope.

Acceptance:

- No item becomes unplaced or duplicated by migration.
- Existing backups remain restorable.
- Inbox contains only material that is intentionally still unorganized.

## Review boundary

Checkpoints A-E are interaction/state changes and should be reviewed together in the extension before visual-system refinement. Checkpoint F changes durable data semantics and must be implemented, tested, and reviewed separately.
