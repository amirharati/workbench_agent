import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  BookMarked, 
  Layers,
  Settings, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  Folder,
  Terminal,
  Upload,
  Plus,
  Trash2,
  Home,
  HelpCircle,
  Workflow,
} from 'lucide-react';
import type { DashboardView } from './DashboardLayout';
import type { Collection, Item, Project } from '../../../lib/db';
import { DialogShell } from '../DialogShell';
import { ButtonDanger, ButtonGhost, ButtonPrimary, Input } from '../../../styles/primitives';
import { useItemDragDrop } from '../ItemDragDropProvider';

interface LeftSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  activeView: DashboardView;
  onSelectView: (view: DashboardView) => void;
  projects: Project[];
  collections: Collection[];
  items: Item[];
  scopeProjectId: string | 'all';
  scopeCollectionId: string | 'all';
  onSelectProjectScope: (projectId: string | 'all') => void;
  onSelectCollectionScope: (collectionId: string, projectId?: string) => void;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onDeleteProject?: (projectId: string) => Promise<boolean | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  onDeleteCollection?: (collectionId: string) => Promise<boolean | void>;
}

type SidebarDialog =
  | { type: 'create-project' }
  | { type: 'create-collection'; projectId: string }
  | { type: 'delete-project'; projectId: string; projectName: string }
  | { type: 'delete-collection'; collectionId: string; collectionName: string };

export const LeftSidebar: React.FC<LeftSidebarProps> = ({ 
  isCollapsed, 
  onToggle,
  activeView,
  onSelectView,
  projects,
  collections,
  items,
  scopeProjectId,
  scopeCollectionId,
  onSelectProjectScope,
  onSelectCollectionScope,
  onCreateProject,
  onDeleteProject,
  onCreateCollection,
  onDeleteCollection,
}) => {
  const { getDropTargetProps } = useItemDragDrop();
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [dialog, setDialog] = useState<SidebarDialog | null>(null);
  const [dialogName, setDialogName] = useState('');
  const [dialogError, setDialogError] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
    };
    if (projectDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [projectDropdownOpen]);

  type NavItem = {
    icon: React.ComponentType<any>;
    label: string;
    id: DashboardView;
  };

  const navSections: { title: string; items: NavItem[] }[] = [
    {
      title: 'Content',
      items: [
        { icon: BookMarked, label: 'Library', id: 'bookmarks' },
        { icon: Layers, label: 'Workspaces', id: 'workspaces' },
      ],
    },
    {
      title: 'Tools',
      items: [
        { icon: Workflow, label: 'Enrichment Hub', id: 'pipeline' },
        { icon: Upload, label: 'Import Studio', id: 'import-studio' },
        { icon: Terminal, label: 'Tab Commander', id: 'tab-commander' },
      ],
    },
  ];

  const isBookmarkItem = (item: Item) => !!item.url && item.url.trim().length > 0;

  const trashedCount = items.filter((i) => i.deletedAt != null).length;

  const collectionItemCounts = useMemo(() => {
    const counts = new Map<string, { bookmarks: number; notes: number }>();
    for (const item of items) {
      const rawCollectionIds = (item as unknown as { collectionIds?: unknown }).collectionIds;
      const collectionIds = Array.isArray(rawCollectionIds)
        ? rawCollectionIds.filter((id): id is string => typeof id === 'string')
        : typeof rawCollectionIds === 'string'
          ? [rawCollectionIds]
          : [];
      for (const collectionId of collectionIds) {
        const current = counts.get(collectionId) ?? { bookmarks: 0, notes: 0 };
        if (isBookmarkItem(item)) current.bookmarks += 1;
        else current.notes += 1;
        counts.set(collectionId, current);
      }
    }
    return counts;
  }, [items]);

  const selectedProject = scopeProjectId === 'all' 
    ? null 
    : projects.find(p => p.id === scopeProjectId);

  const projectCollections = scopeProjectId === 'all'
    ? []
    : collections.filter(
        (c) =>
          c.primaryProjectId === scopeProjectId ||
          (Array.isArray(c.projectIds) && c.projectIds.includes(scopeProjectId))
      );
  const scopeProjectIsInbox = projects.find((project) => project.id === scopeProjectId)?.isDefault === true;
  const inboxCollection = scopeProjectIsInbox
    ? projectCollections.find((collection) => collection.isDefault) ?? projectCollections[0]
    : undefined;

  const handleAddProject = async (name: string) => {
    if (!onCreateProject) return;
    const createdId = await onCreateProject({ name: name.trim() });
    if (typeof createdId === 'string') {
      onSelectProjectScope(createdId);
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    if (!onDeleteProject) return;
    const project = projects.find((p) => p.id === projectId);
    if (project?.isDefault) {
      setDialogError('Inbox cannot be removed.');
      return;
    }
    const deleted = await onDeleteProject(projectId);
    if (deleted !== false && scopeProjectId === projectId) {
      onSelectProjectScope('all');
    }
  };

  const handleAddCollection = async (name: string, projectId: string) => {
    if (!onCreateCollection) return;
    if (projects.find((project) => project.id === projectId)?.isDefault) {
      setDialogError('Inbox uses its single Incoming collection.');
      return;
    }
    const createdId = await onCreateCollection({ name: name.trim(), projectId });
    if (typeof createdId === 'string') {
      onSelectCollectionScope(createdId, projectId);
    }
  };

  const handleRemoveCollection = async (collectionId: string) => {
    if (!onDeleteCollection) return;
    const collection = collections.find((c) => c.id === collectionId);
    if (collection?.isDefault) {
      setDialogError('System collections cannot be removed.');
      return;
    }
    const deleted = await onDeleteCollection(collectionId);
    if (deleted !== false && scopeCollectionId === collectionId) {
      onSelectCollectionScope('all', scopeProjectId === 'all' ? undefined : scopeProjectId);
    }
  };

  const submitDialog = async () => {
    if (!dialog) return;
    setDialogError('');
    if (dialog.type === 'create-project') {
      const name = dialogName.trim();
      if (!name) {
        setDialogError('Project name is required.');
        return;
      }
      const exists = projects.some((p) => p.name.trim().toLowerCase() === name.toLowerCase());
      if (exists) {
        setDialogError('A project with this name already exists.');
        return;
      }
      await handleAddProject(name);
    } else if (dialog.type === 'create-collection') {
      if (projects.find((project) => project.id === dialog.projectId)?.isDefault) {
        setDialogError('Inbox uses its single Incoming collection.');
        return;
      }
      const name = dialogName.trim();
      if (!name) {
        setDialogError('Collection name is required.');
        return;
      }
      const existingCollectionsForProject = collections.filter(
        (c) =>
          c.primaryProjectId === dialog.projectId ||
          (Array.isArray(c.projectIds) && c.projectIds.includes(dialog.projectId))
      );
      const exists = existingCollectionsForProject.some(
        (c) => c.name.trim().toLowerCase() === name.toLowerCase()
      );
      if (exists) {
        setDialogError('A collection with this name already exists in this project.');
        return;
      }
      await handleAddCollection(name, dialog.projectId);
    } else if (dialog.type === 'delete-project') {
      const project = projects.find((p) => p.id === dialog.projectId);
      if (project?.isDefault) {
        setDialogError('Inbox cannot be removed.');
        return;
      }
      await handleRemoveProject(dialog.projectId);
    } else if (dialog.type === 'delete-collection') {
      const collection = collections.find((c) => c.id === dialog.collectionId);
      if (collection?.isDefault) {
        setDialogError('System collections cannot be removed.');
        return;
      }
      await handleRemoveCollection(dialog.collectionId);
    }
    setDialog(null);
    setDialogName('');
    setDialogError('');
  };

  const closeDialog = () => {
    setDialog(null);
    setDialogName('');
    setDialogError('');
  };

  const dialogTitle = dialog?.type === 'create-project'
    ? 'Create project'
    : dialog?.type === 'create-collection'
      ? 'Create collection'
      : dialog?.type === 'delete-project'
        ? 'Delete project'
        : 'Delete collection';
  const isCreateDialog = dialog?.type === 'create-project' || dialog?.type === 'create-collection';
  const isDeleteDialog = dialog?.type === 'delete-project' || dialog?.type === 'delete-collection';
  const existingNames = dialog?.type === 'create-project'
    ? projects.map((project) => project.name)
    : dialog?.type === 'create-collection'
      ? collections
          .filter(
            (collection) =>
              collection.primaryProjectId === dialog.projectId ||
              (Array.isArray(collection.projectIds) && collection.projectIds.includes(dialog.projectId))
          )
          .map((collection) => collection.name)
      : [];
  const normalizedDialogName = dialogName.trim().toLowerCase();

  return (
    <div className="ui-sidebar" data-collapsed={isCollapsed ? 'true' : 'false'}>
      {/* Header */}
      <div className="ui-sidebar__header">
        {!isCollapsed && (
          <span className="ui-sidebar__brand">
            Homebase
          </span>
        )}
        <button
          type="button"
          className="ui-sidebar__icon-button"
          onClick={onToggle}
          title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Main nav area */}
      <nav className="ui-sidebar__nav scrollbar ui-scroll-footer-safe" aria-label="Primary navigation">
        {/* 1. PROJECT SELECTOR - Simple dropdown */}
        {!isCollapsed && (
          <div ref={dropdownRef} className="ui-sidebar__scope">
            <div className="ui-sidebar__scope-controls">
              <button
                type="button"
                className="ui-sidebar__project-trigger"
                onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                aria-haspopup="listbox"
                aria-expanded={projectDropdownOpen}
              >
                <span className="ui-sidebar__project-label">
                  <Folder size={14} />
                  <span className="ui-sidebar__truncate">
                    {selectedProject ? selectedProject.name : 'All Projects'}
                  </span>
                </span>
                <ChevronDown className="ui-sidebar__project-chevron" size={14} />
              </button>
              {onCreateProject && (
                <button
                  type="button"
                  className="ui-sidebar__scope-action"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDialogName('');
                    setDialogError('');
                    setDialog({ type: 'create-project' });
                  }}
                  title="Add project"
                  aria-label="Add project"
                >
                  <Plus size={14} />
                </button>
              )}
              {onDeleteProject && selectedProject && !selectedProject.isDefault && (
                <button
                  type="button"
                  className="ui-sidebar__scope-action ui-sidebar__scope-action--danger"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDialogError('');
                    setDialog({
                      type: 'delete-project',
                      projectId: selectedProject.id,
                      projectName: selectedProject.name,
                    });
                  }}
                  title="Delete selected project"
                  aria-label={`Delete ${selectedProject.name}`}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            {projectDropdownOpen && (
              <div
                className="ui-sidebar__project-menu scrollbar"
                role="listbox"
                aria-label="Choose project"
              >
                <button
                  type="button"
                  className="ui-sidebar__project-option"
                  data-active={scopeProjectId === 'all' ? 'true' : 'false'}
                  role="option"
                  aria-selected={scopeProjectId === 'all'}
                  onClick={() => {
                    onSelectProjectScope('all');
                    setProjectDropdownOpen(false);
                  }}
                >
                  All Projects
                </button>
                {projects.map((project) => (
                  <div key={project.id} className="ui-sidebar__project-option-row">
                    <button
                      type="button"
                      className="ui-sidebar__project-option"
                      data-active={scopeProjectId === project.id ? 'true' : 'false'}
                      role="option"
                      aria-selected={scopeProjectId === project.id}
                      onClick={() => {
                        onSelectProjectScope(project.id);
                        setProjectDropdownOpen(false);
                      }}
                    >
                      {project.name}
                    </button>
                    {onDeleteProject && !project.isDefault && (
                      <button
                        type="button"
                        className="ui-sidebar__row-action ui-sidebar__row-action--danger"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDialogError('');
                          setDialog({
                            type: 'delete-project',
                            projectId: project.id,
                            projectName: project.name,
                          });
                        }}
                        title={`Delete ${project.name}`}
                        aria-label={`Delete ${project.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. COLLECTIONS - Persistent organization destinations across content views */}
        {!isCollapsed && (
          <section className="ui-sidebar__section" aria-labelledby="sidebar-collections-heading">
            <div className="ui-sidebar__section-heading" id="sidebar-collections-heading">
              <span>Collections</span>
              {onCreateCollection && scopeProjectId !== 'all' && !scopeProjectIsInbox && (
                <button
                  type="button"
                  className="ui-sidebar__section-action"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (scopeProjectId === 'all') return;
                    setDialogName('');
                    setDialogError('');
                    setDialog({ type: 'create-collection', projectId: scopeProjectId });
                  }}
                  title="Add collection"
                  aria-label="Add collection"
                >
                  <Plus size={12} />
                </button>
              )}
            </div>
            <div className="ui-sidebar__link-list">
              {scopeProjectId === 'all' ? (
                projects.map((project) => {
                  const groupedCollections = collections.filter(
                    (collection) =>
                      collection.primaryProjectId === project.id ||
                      (Array.isArray(collection.projectIds) && collection.projectIds.includes(project.id))
                  );
                  if (groupedCollections.length === 0) return null;
                  return (
                    <div className="ui-sidebar__collection-group" key={project.id}>
                      <button
                        type="button"
                        className="ui-sidebar__collection-group-label"
                        onClick={() => onSelectProjectScope(project.id)}
                        title={`Use ${project.name} as the current scope`}
                      >
                        {project.name}
                      </button>
                      {groupedCollections.map((collection) => {
                        const counts = collectionItemCounts.get(collection.id) ?? { bookmarks: 0, notes: 0 };
                        return (
                          <button
                            key={`${project.id}:${collection.id}`}
                            type="button"
                            className="ui-sidebar__nav-item ui-sidebar__nav-item--nested"
                            {...getDropTargetProps({
                              kind: 'collection',
                              containerId: collection.id,
                              containerLabel: `${project.name} · ${collection.name}`,
                              projectId: project.id,
                            })}
                            onClick={() => onSelectCollectionScope(collection.id, project.id)}
                          >
                            <span className="ui-sidebar__nav-label">{project.isDefault ? 'Incoming' : collection.name}</span>
                            <span className="ui-sidebar__count">{counts.bookmarks + counts.notes}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              ) : scopeProjectIsInbox ? (
                <button
                  type="button"
                  className="ui-sidebar__nav-item"
                  {...(inboxCollection ? getDropTargetProps({
                    kind: 'collection',
                    containerId: inboxCollection.id,
                    containerLabel: `${selectedProject?.name ?? 'Inbox'} · ${inboxCollection.name}`,
                    projectId: scopeProjectId,
                  }) : {})}
                  data-active="true"
                  aria-current="page"
                  onClick={() => onSelectCollectionScope('all', scopeProjectId)}
                >
                  <span className="ui-sidebar__nav-label">Incoming</span>
                  {inboxCollection ? (
                    <span className="ui-sidebar__count">
                      {(collectionItemCounts.get(inboxCollection.id)?.bookmarks ?? 0) +
                        (collectionItemCounts.get(inboxCollection.id)?.notes ?? 0)}
                    </span>
                  ) : null}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="ui-sidebar__nav-item"
                    data-active={scopeCollectionId === 'all' ? 'true' : 'false'}
                    aria-current={scopeCollectionId === 'all' ? 'page' : undefined}
                    onClick={() => onSelectCollectionScope('all', scopeProjectId)}
                  >
                    All
                  </button>
                  {projectCollections.map((collection) => {
                const counts = collectionItemCounts.get(collection.id) ?? { bookmarks: 0, notes: 0 };
                const isSelected = scopeCollectionId === collection.id;
                return (
                  <div key={collection.id} className="ui-sidebar__nav-row">
                    <button
                      type="button"
                      className="ui-sidebar__nav-item"
                      {...getDropTargetProps({
                        kind: 'collection',
                        containerId: collection.id,
                        containerLabel: `${selectedProject?.name ?? 'Project'} · ${collection.name}`,
                        projectId: scopeProjectId,
                      })}
                      data-active={isSelected ? 'true' : 'false'}
                      aria-current={isSelected ? 'page' : undefined}
                      onClick={() => onSelectCollectionScope(collection.id, scopeProjectId)}
                  >
                    <span className="ui-sidebar__nav-label">
                      {collection.name}
                    </span>
                    <span className="ui-sidebar__count">
                      {counts.bookmarks + counts.notes}
                    </span>
                    </button>
                    {onDeleteCollection && !collection.isDefault && (
                      <button
                        type="button"
                        className="ui-sidebar__row-action ui-sidebar__row-action--danger"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDialogError('');
                          setDialog({
                            type: 'delete-collection',
                            collectionId: collection.id,
                            collectionName: collection.name,
                          });
                        }}
                        title="Delete collection"
                        aria-label={`Delete ${collection.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
                  })}
                </>
              )}
            </div>
          </section>
        )}

        {/* Divider before nav sections */}
        {!isCollapsed && <div className="ui-sidebar__divider" />}

        {/* Home is one primary destination; its Overview/Search views live in the page title row. */}
        {(() => {
          const isActive = activeView === 'home';
          return (
            <button
              type="button"
              className="ui-sidebar__nav-item"
              data-active={isActive ? 'true' : 'false'}
              data-collapsed={isCollapsed ? 'true' : 'false'}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectView('home')}
              title="Home"
            >
              <Home size={16} strokeWidth={isActive ? 2 : 1.5} style={{ flexShrink: 0 }} />
              {!isCollapsed && <span className="ui-sidebar__nav-label">Home</span>}
            </button>
          );
        })()}

        {/* 3. CONTENT & TOOLS NAV */}
        {navSections.map((section) => (
          <section className="ui-sidebar__section" key={section.title} aria-label={section.title}>
            {!isCollapsed && (
              <div className="ui-sidebar__section-heading">
                {section.title}
              </div>
            )}
            <div className="ui-sidebar__link-list">
              {section.items.map((item) => {
                const isActive = activeView === item.id || (item.id === 'bookmarks' && activeView === 'notes');
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="ui-sidebar__nav-item"
                    data-active={isActive ? 'true' : 'false'}
                    data-collapsed={isCollapsed ? 'true' : 'false'}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => onSelectView(item.id)}
                    title={item.label}
                  >
                    <item.icon size={16} strokeWidth={isActive ? 2 : 1.5} style={{ flexShrink: 0 }} />
                    {!isCollapsed && (
                      <span className="ui-sidebar__nav-label">
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      {/* Settings, Trash, Help — pinned bottom */}
      <div className="ui-sidebar__footer">
        {(
          [
            { id: 'settings' as DashboardView, label: 'Settings', Icon: Settings },
            { id: 'trash' as DashboardView, label: 'Trash', Icon: Trash2, badge: trashedCount },
            { id: 'help' as DashboardView, label: 'Help', Icon: HelpCircle },
          ] as Array<{ id: DashboardView; label: string; Icon: NavItem['icon']; badge?: number }>
        ).map(({ id, label, Icon, badge }) => {
          const isActive = activeView === id;
          return (
            <button
              key={id}
              type="button"
              className="ui-sidebar__nav-item"
              data-active={isActive ? 'true' : 'false'}
              data-collapsed={isCollapsed ? 'true' : 'false'}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectView(id)}
              title={label}
            >
              <Icon
                size={16}
                strokeWidth={isActive ? 2 : 1.5}
                style={{
                  flexShrink: 0,
                  color: id === 'trash' && trashedCount > 0 ? 'var(--danger)' : undefined,
                }}
              />
              {!isCollapsed && (
                <>
                  <span
                    className="ui-sidebar__nav-label"
                  >
                    {label}
                  </span>
                  {badge != null && badge > 0 ? (
                    <span
                      className="ui-sidebar__badge ui-sidebar__badge--danger"
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  ) : null}
                </>
              )}
            </button>
          );
        })}
      </div>

      {dialog && (
        <DialogShell
          title={dialogTitle}
          description={
            dialog.type === 'create-project'
              ? 'Projects keep collections, saved workspaces, and working context together.'
              : dialog.type === 'create-collection'
                ? 'Collections organize material inside the selected project.'
                : 'This action cannot be undone.'
          }
          onClose={closeDialog}
          maxWidth={400}
          footer={(
            <>
              <ButtonGhost type="button" onClick={closeDialog}>Cancel</ButtonGhost>
              {isDeleteDialog ? (
                <ButtonDanger type="button" onClick={() => void submitDialog()}>Delete</ButtonDanger>
              ) : (
                <ButtonPrimary
                  type="button"
                  onClick={() => void submitDialog()}
                  disabled={!dialogName.trim()}
                >
                  Create
                </ButtonPrimary>
              )}
            </>
          )}
        >
          {isCreateDialog ? (
            <div className="ui-form__group">
              <label className="ui-form__label" htmlFor="sidebar-dialog-name">
                {dialog.type === 'create-project' ? 'Project name' : 'Collection name'}
              </label>
              <Input
                id="sidebar-dialog-name"
                autoFocus
                type="text"
                value={dialogName}
                onChange={(event) => {
                  setDialogName(event.target.value);
                  if (dialogError) setDialogError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && dialogName.trim()) void submitDialog();
                }}
                placeholder={dialog.type === 'create-project' ? 'Project name' : 'Collection name'}
              />
              <div className="ui-sidebar__existing-heading">Existing · {existingNames.length}</div>
              <div className="ui-sidebar__existing-list scrollbar">
                {existingNames.length === 0 ? (
                  <div className="ui-sidebar__existing-empty">No existing names.</div>
                ) : existingNames.map((name) => {
                  const duplicate = normalizedDialogName.length > 0 && name.trim().toLowerCase() === normalizedDialogName;
                  return (
                    <div key={name} className="ui-sidebar__existing-name" data-duplicate={duplicate ? 'true' : 'false'}>
                      {name}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="ui-status" data-tone="warning">
              {dialog.type === 'delete-project'
                ? `Delete project “${dialog.projectName}”? Its collections will move to Inbox and library items will remain saved.`
                : `Delete collection “${dialog.collectionName}”? Items will remain saved and move to Incoming if this was their only collection.`}
            </div>
          )}
          {dialogError ? <div className="ui-status" data-tone="error">{dialogError}</div> : null}
        </DialogShell>
      )}
    </div>
  );
};
