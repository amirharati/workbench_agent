import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  BookMarked, 
  Layers,
  Settings, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  Check,
  Folder,
  Search,
  Terminal,
  Upload,
  Plus,
  Trash2,
  Home,
  HelpCircle,
  Workflow,
} from 'lucide-react';
import type { DashboardView } from './DashboardLayout';
import type { Collection, ContainerDeletionMode, DeleteCollectionOptions, DeleteCollectionResult, DeleteProjectOptions, DeleteProjectResult, Item, Project } from '../../../lib/db';
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
  recentCollectionIdsByProject?: Record<string, string[]>;
  scopeProjectId: string | 'all';
  scopeCollectionId: string | 'all';
  onSelectProjectScope: (projectId: string | 'all') => void;
  onSelectCollectionScope: (collectionId: string, projectId?: string) => void;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onDeleteProject?: (projectId: string, options?: DeleteProjectOptions) => Promise<DeleteProjectResult | false | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
  onDeleteCollection?: (collectionId: string, options?: DeleteCollectionOptions) => Promise<DeleteCollectionResult | false | void>;
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
  recentCollectionIdsByProject = {},
  scopeProjectId,
  scopeCollectionId,
  onSelectProjectScope,
  onSelectCollectionScope,
  onCreateProject,
  onDeleteProject,
  onCreateCollection,
  onDeleteCollection,
}) => {
  const { activePayload, getDropTargetProps } = useItemDragDrop();
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [collectionDropdownOpen, setCollectionDropdownOpen] = useState(false);
  const [collectionQuery, setCollectionQuery] = useState('');
  const [dialog, setDialog] = useState<SidebarDialog | null>(null);
  const [dialogName, setDialogName] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [deleteMode, setDeleteMode] = useState<ContainerDeletionMode>('move');
  const [deleteDestinationId, setDeleteDestinationId] = useState('');
  const scopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (scopeRef.current && !scopeRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
        setCollectionDropdownOpen(false);
        setCollectionQuery('');
      }
    };
    if (projectDropdownOpen || collectionDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [collectionDropdownOpen, projectDropdownOpen]);

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
  const selectedCollection = scopeCollectionId === 'all'
    ? undefined
    : collections.find((collection) => collection.id === scopeCollectionId);
  const normalizedCollectionQuery = collectionQuery.trim().toLowerCase();
  const visibleCollectionGroups = useMemo(() => {
    const projectsInScope = scopeProjectId === 'all'
      ? projects
      : projects.filter((project) => project.id === scopeProjectId);
    return projectsInScope
      .map((project) => ({
        project,
        collections: collections
          .filter((collection) =>
            (collection.primaryProjectId === project.id || collection.projectIds?.includes(project.id)) &&
            (!normalizedCollectionQuery || `${collection.name} ${project.name}`.toLowerCase().includes(normalizedCollectionQuery))
          )
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((group) => group.collections.length > 0);
  }, [collections, normalizedCollectionQuery, projects, scopeProjectId]);
  const recentCollectionOptions = useMemo(() => {
    if (normalizedCollectionQuery) return [];
    const projectsInScope = scopeProjectId === 'all'
      ? projects
      : projects.filter((project) => project.id === scopeProjectId);
    return projectsInScope.flatMap((project) =>
      (recentCollectionIdsByProject[project.id] ?? []).flatMap((collectionId) => {
        const collection = collections.find((candidate) =>
          candidate.id === collectionId &&
          (candidate.primaryProjectId === project.id || candidate.projectIds?.includes(project.id))
        );
        return collection ? [{ project, collection }] : [];
      })
    ).slice(0, 5);
  }, [collections, normalizedCollectionQuery, projects, recentCollectionIdsByProject, scopeProjectId]);
  const recentCollectionKeys = new Set(
    recentCollectionOptions.map(({ project, collection }) => `${project.id}:${collection.id}`)
  );
  const remainingCollectionGroups = normalizedCollectionQuery
    ? visibleCollectionGroups
    : visibleCollectionGroups
        .map((group) => ({
          ...group,
          collections: group.collections.filter(
            (collection) => !recentCollectionKeys.has(`${group.project.id}:${collection.id}`)
          ),
        }))
        .filter((group) => group.collections.length > 0);
  const selectedCollectionCount = selectedCollection
    ? collectionItemCounts.get(selectedCollection.id)
    : inboxCollection
      ? collectionItemCounts.get(inboxCollection.id)
      : undefined;
  const selectedScopeItemCount = selectedCollectionCount
    ? selectedCollectionCount.bookmarks + selectedCollectionCount.notes
    : scopeProjectId === 'all'
      ? items.length
      : items.filter((item) => (item.collectionIds ?? []).some((collectionId) =>
          projectCollections.some((collection) => collection.id === collectionId)
        )).length;
  const collectionScopeLabel = scopeProjectIsInbox
    ? 'Incoming'
    : selectedCollection?.name
      ?? (scopeProjectId === 'all' ? 'All library' : 'All project items');

  const closeCollectionMenu = () => {
    setCollectionDropdownOpen(false);
    setCollectionQuery('');
  };

  const selectCollection = (collection: Collection, projectId: string) => {
    onSelectCollectionScope(collection.id, projectId);
    closeCollectionMenu();
  };

  const selectAllCollections = () => {
    onSelectCollectionScope('all', scopeProjectId === 'all' ? undefined : scopeProjectId);
    closeCollectionMenu();
  };

  const renderCollectionOption = (project: Project, collection: Collection) => {
    const counts = collectionItemCounts.get(collection.id) ?? { bookmarks: 0, notes: 0 };
    const isSelected = scopeCollectionId === collection.id &&
      (scopeProjectId === 'all' || scopeProjectId === project.id);
    return (
      <div className="ui-sidebar__collection-option-row" key={`${project.id}:${collection.id}`}>
        <button
          type="button"
          className="ui-sidebar__collection-option"
          {...getDropTargetProps({
            kind: 'collection',
            containerId: collection.id,
            containerLabel: `${project.name} · ${collection.name}`,
            projectId: project.id,
          })}
          data-active={isSelected ? 'true' : 'false'}
          role="option"
          aria-selected={isSelected}
          onClick={() => selectCollection(collection, project.id)}
        >
          <span className="ui-sidebar__collection-option-copy">
            <strong>{project.isDefault ? 'Incoming' : collection.name}</strong>
            {scopeProjectId === 'all' ? <small>{project.name}</small> : null}
          </span>
          <span className="ui-sidebar__count">{counts.bookmarks + counts.notes}</span>
          {isSelected ? <Check size={13} /> : null}
        </button>
        {onDeleteCollection && !collection.isDefault ? (
          <button
            type="button"
            className="ui-sidebar__row-action ui-sidebar__row-action--danger"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              closeCollectionMenu();
              setDialogError('');
              setDialog({
                type: 'delete-collection',
                collectionId: collection.id,
                collectionName: collection.name,
              });
            }}
            title={`Delete ${collection.name}`}
            aria-label={`Delete ${collection.name}`}
          >
            <Trash2 size={12} />
          </button>
        ) : null}
      </div>
    );
  };

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
    const deleted = await onDeleteProject(projectId, {
      mode: deleteMode,
      destinationProjectId: selectedDeleteDestination || undefined,
    });
    if (typeof deleted === 'object' && deleted.deleted && scopeProjectId === projectId) {
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
    const deleted = await onDeleteCollection(collectionId, {
      mode: deleteMode,
      destinationCollectionId: selectedDeleteDestination || undefined,
    });
    if (typeof deleted === 'object' && deleted.deleted && scopeCollectionId === collectionId) {
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
    setDeleteMode('move');
    setDeleteDestinationId('');
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
  const deleteProjectDestinations = projects.filter((project) => project.id !== (dialog?.type === 'delete-project' ? dialog.projectId : ''));
  const deleteCollectionDestinations = collections.filter((collection) => collection.id !== (dialog?.type === 'delete-collection' ? dialog.collectionId : ''));
  const selectedDeleteDestination = deleteDestinationId || (
    dialog?.type === 'delete-project'
      ? deleteProjectDestinations.find((project) => project.isDefault)?.id || deleteProjectDestinations[0]?.id || ''
      : dialog?.type === 'delete-collection'
        ? deleteCollectionDestinations.find((collection) => collection.isDefault && collection.primaryProjectId === collections.find((candidate) => candidate.id === dialog.collectionId)?.primaryProjectId)?.id
          || deleteCollectionDestinations[0]?.id || ''
        : ''
  );

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
          <div ref={scopeRef} className="ui-sidebar__scope">
            <div className="ui-sidebar__scope-controls">
              <button
                type="button"
                className="ui-sidebar__project-trigger"
                onClick={() => {
                  setProjectDropdownOpen(!projectDropdownOpen);
                  closeCollectionMenu();
                }}
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
                    setCollectionQuery('');
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
                        setCollectionQuery('');
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

            <div
              className="ui-sidebar__scope-controls"
              onDragEnter={(event) => {
                if (!activePayload || scopeProjectIsInbox) return;
                event.preventDefault();
                setProjectDropdownOpen(false);
                setCollectionDropdownOpen(true);
              }}
            >
              <button
                type="button"
                className="ui-sidebar__collection-trigger"
                onClick={() => {
                  if (scopeProjectIsInbox) {
                    onSelectCollectionScope('all', scopeProjectId);
                    return;
                  }
                  setProjectDropdownOpen(false);
                  setCollectionDropdownOpen((open) => !open);
                  if (collectionDropdownOpen) setCollectionQuery('');
                }}
                aria-haspopup={scopeProjectIsInbox ? undefined : 'listbox'}
                aria-expanded={scopeProjectIsInbox ? undefined : collectionDropdownOpen}
                title={scopeProjectIsInbox ? 'Incoming' : 'Choose collection'}
              >
                <span className="ui-sidebar__project-label">
                  <BookMarked size={14} />
                  <span className="ui-sidebar__truncate">{collectionScopeLabel}</span>
                </span>
                <span className="ui-sidebar__collection-trigger-meta">
                  <span className="ui-sidebar__count">{selectedScopeItemCount}</span>
                  {!scopeProjectIsInbox ? <ChevronDown className="ui-sidebar__project-chevron" size={14} /> : null}
                </span>
              </button>
              {onCreateCollection && scopeProjectId !== 'all' && !scopeProjectIsInbox ? (
                <button
                  type="button"
                  className="ui-sidebar__scope-action"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    closeCollectionMenu();
                    setDialogName('');
                    setDialogError('');
                    setDialog({ type: 'create-collection', projectId: scopeProjectId });
                  }}
                  title="Add collection"
                  aria-label="Add collection"
                >
                  <Plus size={14} />
                </button>
              ) : null}
            </div>

            {collectionDropdownOpen && !scopeProjectIsInbox ? (
              <div className="ui-sidebar__collection-menu" aria-label="Choose collection">
                <label className="ui-sidebar__collection-search">
                  <Search size={13} aria-hidden="true" />
                  <input
                    type="search"
                    value={collectionQuery}
                    onChange={(event) => setCollectionQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') closeCollectionMenu();
                    }}
                    placeholder="Find a collection…"
                    aria-label="Find a collection"
                  />
                </label>
                <div className="ui-sidebar__collection-options scrollbar" role="listbox" aria-label="Collections">
                  <button
                    type="button"
                    className="ui-sidebar__collection-option"
                    data-active={scopeCollectionId === 'all' ? 'true' : 'false'}
                    role="option"
                    aria-selected={scopeCollectionId === 'all'}
                    onClick={selectAllCollections}
                  >
                    <span className="ui-sidebar__collection-option-copy">
                      <strong>{scopeProjectId === 'all' ? 'All library' : 'All project items'}</strong>
                      <small>{scopeProjectId === 'all' ? 'Every project and collection' : selectedProject?.name}</small>
                    </span>
                    {scopeCollectionId === 'all' ? <Check size={13} /> : null}
                  </button>
                  {recentCollectionOptions.length > 0 ? (
                    <div className="ui-sidebar__collection-group">
                      <div className="ui-sidebar__collection-group-heading">Recent</div>
                      {recentCollectionOptions.map(({ project, collection }) =>
                        renderCollectionOption(project, collection)
                      )}
                    </div>
                  ) : null}
                  {remainingCollectionGroups.length === 0 && recentCollectionOptions.length === 0 ? (
                    <div className="ui-sidebar__collection-empty">No collections match “{collectionQuery.trim()}”.</div>
                  ) : remainingCollectionGroups.map(({ project, collections: groupCollections }) => (
                    <div className="ui-sidebar__collection-group" key={project.id}>
                      {scopeProjectId === 'all' ? (
                        <div className="ui-sidebar__collection-group-heading">{project.name}</div>
                      ) : null}
                      {groupCollections.map((collection) => renderCollectionOption(project, collection))}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
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
                : 'Choose whether to move this container’s links, or only trash links that would otherwise have no saved location. You can Undo this deletion for a short time.'
          }
          onClose={closeDialog}
          maxWidth={400}
          footer={(
            <>
              <ButtonGhost type="button" onClick={closeDialog}>Cancel</ButtonGhost>
              {isDeleteDialog ? (
                <ButtonDanger type="button" onClick={() => void submitDialog()} disabled={!selectedDeleteDestination}>Delete</ButtonDanger>
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
            <div className="ui-form__group" style={{ gap: 12 }}>
              <div className="ui-status" data-tone="warning">
                {dialog.type === 'delete-project'
                  ? `Delete project “${dialog.projectName}”. Saved workspaces and browser snapshots are rehomed with the project.`
                  : `Delete collection “${dialog.collectionName}”. Workspace entries are references and are not removed.`}
              </div>
              <label className="ui-form__label" htmlFor="container-delete-destination">
                {dialog.type === 'delete-project' ? 'Move project structure to' : 'Move last-location links to'}
              </label>
              <select
                id="container-delete-destination"
                className="ui-input"
                value={selectedDeleteDestination}
                onChange={(event) => setDeleteDestinationId(event.target.value)}
              >
                {dialog.type === 'delete-project'
                  ? deleteProjectDestinations.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)
                  : deleteCollectionDestinations.map((collection) => {
                    const owner = projects.find((project) => project.id === collection.primaryProjectId);
                    return <option key={collection.id} value={collection.id}>{owner ? `${owner.name} · ` : ''}{collection.name}</option>;
                  })}
              </select>
              <label className="ui-choice-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                <input type="radio" name="container-delete-mode" checked={deleteMode === 'move'} onChange={() => setDeleteMode('move')} />
                <span><strong>Move links and keep them saved</strong><br /><small>Every link remains active and is moved to the destination if this was its only location.</small></span>
              </label>
              <label className="ui-choice-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                <input type="radio" name="container-delete-mode" checked={deleteMode === 'trash-unplaced'} onChange={() => setDeleteMode('trash-unplaced')} />
                <span><strong>Remove this location; trash only unplaced links</strong><br /><small>Links saved elsewhere stay there. Links with no other active location go to Trash and remain recoverable.</small></span>
              </label>
            </div>
          )}
          {dialogError ? <div className="ui-status" data-tone="error">{dialogError}</div> : null}
        </DialogShell>
      )}
    </div>
  );
};
