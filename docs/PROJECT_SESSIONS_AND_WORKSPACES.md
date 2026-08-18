# Homebase Workspace Model

Status: accepted V3 design decision. This document supersedes the earlier project-session, scoped-tab, and Focus-workspace model.

## Product model

Homebase has one workspace system shared by every dashboard surface.

- A **workspace** is a persistent set of working entries.
- A **workspace entry** may reference a library item, note, frozen search, list, or direct URL.
- Workspace entries are presented as an entry list, row, or compact workspace browser. Homebase does not present them as internal tabs.
- A **project** and **collection** provide permanent library organization. Workspace membership never changes that organization.
- A **browser snapshot** is a captured Chrome window/tab arrangement. It can seed a Homebase workspace, but it is not itself a Homebase workspace.

There are three workspace levels:

1. Exactly one shared **Global workspace**.
2. Exactly one automatic **General workspace** for every project, including Inbox.
3. Zero or more user-created **named workspaces** within a project.

Global and project General workspaces are system-owned: they cannot be deleted and do not require database rows to be manually created by the user. Named workspaces can be created, renamed, duplicated, or deleted.

Every workspace persists automatically. `Current workspace` and `saved workspace` are not workspace types. Exactly one workspace is **active** at a time, and exactly one entry within it may be active.

## Activation and navigation

The active workspace is an application-level state, independent of page and project navigation.

- Choosing **View workspace** explicitly makes it active and shows its entries in the normal workspace list/detail canvas.
- Navigating to Home, Library, Search, Enrichment, a project, or a collection does not silently change the active workspace.
- Entering a project may prioritize that project's General and named workspaces in destination controls, but it does not activate one automatically.
- The active workspace name and a workspace switcher must remain discoverable wherever workspace entries are exposed.
- Adding an entry never changes the active page, workspace, selection, or view.
- **View workspace** is the explicit navigation action. When invoked from an item picker, it adds the item if needed, opens that workspace's normal canvas, and selects the item there.
- Workspace Focus is not a product mode. A future distraction-free layout may temporarily hide surrounding chrome, but it must not change navigation or workspace state.

This explicit activation rule replaces the former per-project hidden tab sets and `Include global work`/`Show all tabs` visibility rules.

## Shared actions

Every originating surface—Home, Library, Search, Inspector, item details, Enrichment, and future surfaces—uses the same workspace actions:

- **Add to workspace…**: always open the shared destination picker. The active workspace is preselected for convenience, but opening the picker never changes membership; the user must explicitly confirm **Add to workspace**. A confirmed add does not change the active workspace, page, or selection.
- **View workspace**: an explicit secondary action inside the picker; add the entry if needed, activate the selected workspace, navigate to its normal list/detail canvas, and select the entry there.
- **Move to workspace…**: add the entry to the destination and remove its source membership as one durable operation.
- **Copy to workspace…**: keep the source membership and add the destination membership.
- **Remove from workspace**: remove only that membership.
- **Open website**: open the external URL in Chrome; it does not affect workspace membership.

There is no internal `Open in tab` action or internal tab strip. Chrome tabs remain an external browser concept and are labelled as browser tabs.

## Activity, organization scope, and Peek

Current activity, organization scope, active workspace, and temporary preview are independent UI
states:

- Opening Search, Enrichment, Library, Notes, or another activity does not clear the selected
  project/collection scope or activate a different workspace.
- The persistent sidebar exposes the current organization destinations. At All Library scope,
  collections remain available under their projects instead of disappearing.
- Changing the active workspace from the sidebar changes only that durable workspace choice.
  **View workspace** remains a separate explicit navigation action.
- **Preview** opens one app-wide in-dashboard Peek overlay. It does not add an internal tab, alter
  workspace membership, navigate to Home, replace the underlying activity, or clear its query,
  filters, scroll position, selection, or Inspector state.
- Peek uses the stored fetched body when available and falls back to the item's note or enrichment
  summary. Previous/Next follows the originating visible result order. Collection/tag edits and
  workspace additions are explicit; only **View workspace** may close Peek and navigate.
- Opening the original URL remains an explicit Chrome action and is never implied by Preview.

## Membership and data safety

- A workspace contains references, not copies of library records.
- The same entry may belong to several workspaces.
- The same entry cannot appear twice within one workspace.
- Moving an entry commits the destination before removing the source.
- Closing or removing a workspace entry never deletes the underlying library item.
- Deleting a named workspace never deletes its referenced items, notes, searches, or URLs.
- Adding, copying, moving, or removing workspace entries never changes project/collection placement.
- Organizing a library item never silently adds, moves, or removes workspace membership.

## Universal item drag and drop

URLs and notes use the same transferable `item` contract. Where an item is displayed determines
the allowed operation; its content type does not.

- Search, Similar, All Library, favorites, recent material, and Enrichment are reference/result
  views. They do not own membership, so dragging from them can only add/copy into a destination.
- Workspace-to-Workspace offers an explicit Copy/Move choice. Global workspace follows exactly
  the same rule as every project General or named workspace.
- Collection-to-Collection offers an explicit Copy/Move choice, whether the collections belong to
  the same project or different projects. Projects group collections; item membership is always
  stored on the destination collection rather than directly on a project.
- A project's **All items** view is a routing drop surface, not a membership container. If the
  project has one collection the drop resolves there directly; if it has several, the user must
  choose the exact collection before any membership changes.
- Workspace-to-Collection and Collection-to-Workspace always copy because the container types
  have different semantics.
- Moving commits the destination before removing the exact recorded source membership. Collection
  moves carry placement notes/tags and merge distinct destination data instead of overwriting it.
- Reordering inside a Workspace changes only its ordered entry list. Collections do not invent a
  separate item order where none exists in the data model.
- All Library is never a destination. Visible Workspace/Collection containers, the Project All
  items routing surface, and a global
  destination tray accept drops; successful transfers show feedback and Undo. Existing click and
  keyboard organization controls remain available.

## Persistence model

The workspace domain owns:

- workspace identity, name, kind, and optional project owner;
- ordered workspace entries;
- the globally active workspace;
- the active entry remembered for each workspace;
- recent destination choices and presentation preferences.

The Global workspace and every project's General workspace use deterministic identities. Named workspaces have generated identities. Browser snapshots keep their separate captured-window schema and require an explicit conversion/add action before their URLs become Homebase workspace entries.

Workspace labels include their project scope everywhere ambiguity is possible: for example, `Research — General` and `Research — Reading plan`. The shared workspace is labelled `Global workspace`.

Legacy `GlobalTab`, `project session`, `live session`, `saved workspace session`, project-scoped tab visibility, and automatic project workspace switching are implementation concepts to remove. Existing development state may be migrated once into the new workspace shape; because V3 is pre-release, no long-lived compatibility UI is required.

## Delivery order

1. Introduce the canonical workspace-entry state and migrate legacy local state.
2. Replace project-scoped tab ownership with explicit workspace membership and one active workspace.
3. Derive the Global and project General workspaces automatically; keep named workspaces under their project.
4. Separate browser snapshots from Homebase workspace destinations.
5. Replace `Open in tab` language and divergent handlers with the shared workspace actions.
6. Only after the model is stable, review how the active workspace and its entries should appear on Home versus Library, Search, Enrichment, and other task pages.
7. Use one versioned item drag payload and one transfer coordinator across every item/result surface; remove page-local guesses about source collection membership.

## Acceptance before UI redesign

- Global workspace exists without a project.
- Every project exposes exactly one automatic General workspace.
- Named workspaces remain associated with exactly one project.
- Project navigation never changes the active workspace.
- The same link can be added from Inspector, Search, detail pages, and Library through the same destination semantics.
- Copy, move, and remove affect only workspace membership and survive reload.
- No active user-facing control says `Open in tab`.
- Homebase workspace entries are not exposed as an ARIA or visual tab strip.
- Homebase has no workspace Focus takeover layer.
- Search, Similar, Library, Project, Notes, and Enrichment items can open the same app-wide Peek
  without changing the underlying activity or workspace.
- Closing Peek restores the still-mounted underlying activity exactly where the user left it.
- An item action shows whether the item already belongs to one or more workspaces before opening the destination picker.
- Browser snapshots are labelled and handled separately.
