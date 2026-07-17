# Project Sessions and Workspaces

Status: accepted first-version design for the Home UI redesign.

## Product model

Homebase separates durable library organization from the tabs used during a working session:

- A **project** is a long-lived knowledge and activity scope.
- A **collection** is a long-lived subdivision inside a project.
- The **project page** is the place to browse, organize, search, pin, and preview project material.
- An **active workspace** is the mutable working set currently shown on a project page.
- A **saved workspace** is a named, reusable set of browser tabs associated with a project that can become active.

Each project has one active workspace at a time. `Project session` is its default local workspace; any saved project workspace can be activated in its place. All Library keeps a separate global session. Active and inactive live workspace state is automatically persisted locally so switching workspaces or closing Homebase does not discard in-progress tab changes.

"Saved" describes user intent, not absolute permanence. Named workspaces are stored in the main database and may be updated or deleted. While a named workspace is active, its evolving Homebase working set is auto-saved locally. Switching away preserves that live version, and activating it later restores the live version instead of rebuilding it from the older database snapshot.

## Navigation model

The project page is Browse mode. Selecting an item updates one inline preview without changing the active workspace. `Add to workspace` adds the item to the visible working list and stays on the project page. Selecting a working-list entry navigates its preview in place.

Focus mode is an optional full-canvas presentation of the same active-workspace list. `Focus` opens one selected entry; `Focus workspace` opens the complete list as tabs. Its single navigation row contains an explicit return action and only the active project's workspace tabs by default. Returning to the project restores its workspace selection, collection, selected preview, filters, and scroll state. Clicking an already-selected project in the project switcher is not a hidden return action.

Closing the last Focus tab returns to the project page. Switching projects opens the selected project's project page. There is no Resume action because the active workspace is already visible and navigable on that page.

The existing reusable tab implementation remains available to Bookmarks and other non-Home sections. This redesign changes how Home and project pages present the tabs; it does not remove the underlying tab system.

## Workspace behavior

The project page presents:

1. A compact workspace switcher containing `Project session` and the project's named saved workspaces.
2. The **active workspace list**, with in-page selection, Focus, and Remove actions.
3. A `Focus workspace` action that presents that same list as tabs.

Activating another workspace automatically snapshots the workspace being left, then replaces the visible working list with the target workspace's latest live snapshot. A workspace activated for the first time is initialized from its database-backed Tab Commander URLs with duplicates removed. Activation stays on the project page and never enters Focus mode.

Saved workspace URLs that match library items become normal item entries. Other valid URLs remain usable as lightweight URL entries with an explicit browser-open action. This allows an existing Tab Commander workspace to become active even when not every browser tab has been saved to the library.

## First-version boundaries

- Active workspaces are represented by the existing locally persisted, project-scoped tab state; inactive live workspace versions are stored as local session snapshots.
- Saved workspaces continue using the existing database model and Tab Commander creation/update flow.
- Activating a workspace switches working sets after automatically preserving the one being left. Adding an individual item is non-navigating and affects only the active workspace.
- Saved workspaces currently preserve browser URL tabs. Extending them to snapshot Homebase-only state such as note edits or promoted-search filters is a later design decision.
- A project can have multiple saved workspaces, but only one active workspace at a time.
