import React, { useMemo, useState } from 'react';
import { Check, Folder, Layers3, Monitor, Plus, Search } from 'lucide-react';
import type { Item } from '../../lib/db';
import { DialogShell } from './DialogShell';
import type { WorkspaceDestination } from './workspaceDestinations';

interface WorkspaceDestinationPickerProps {
  item?: Item;
  subjectTitle?: string;
  destinations: WorkspaceDestination[];
  recentDestinationKeys?: readonly string[];
  isAdded: (destination: WorkspaceDestination) => boolean;
  onAdd: (destination: WorkspaceDestination) => void;
  onView?: (destination: WorkspaceDestination) => void;
}

export const WorkspaceDestinationPicker: React.FC<WorkspaceDestinationPickerProps> = ({
  item,
  subjectTitle,
  destinations,
  recentDestinationKeys = [],
  isAdded,
  onAdd,
  onView,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [lastAddedPath, setLastAddedPath] = useState('');
  const [displayedRecentKeys, setDisplayedRecentKeys] = useState<readonly string[]>(recentDestinationKeys);
  const displayTitle = subjectTitle?.trim() || item?.title?.trim() || 'Untitled';
  const currentDestination = destinations.find((destination) => destination.isCurrent)
    ?? destinations[0];
  const [selectedDestinationKey, setSelectedDestinationKey] = useState(currentDestination?.key ?? '');
  const selectedDestination = destinations.find((destination) => destination.key === selectedDestinationKey)
    ?? currentDestination;
  const recentDestinations = displayedRecentKeys
    .map((key) => destinations.find((destination) => destination.key === key))
    .filter((destination): destination is WorkspaceDestination => destination != null)
    .filter((destination) => destination.key !== currentDestination?.key);
  const featuredKeys = new Set([
    ...(currentDestination ? [currentDestination.key] : []),
    ...recentDestinations.map((destination) => destination.key),
  ]);
  const remainingDestinations = destinations.filter((destination) => !featuredKeys.has(destination.key));
  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = normalizedQuery
    ? destinations.filter((destination) => destination.path.toLowerCase().includes(normalizedQuery))
    : [];
  const groupedDestinations = useMemo(() => {
    const groups = new Map<string, WorkspaceDestination[]>();
    for (const destination of remainingDestinations) {
      const group = groups.get(destination.projectName) ?? [];
      group.push(destination);
      groups.set(destination.projectName, group);
    }
    return [...groups.entries()];
  }, [remainingDestinations]);
  const addedCount = destinations.filter(isAdded).length;

  const addToDestination = (destination: WorkspaceDestination) => {
    if (isAdded(destination)) return;
    onAdd(destination);
    setLastAddedPath(destination.path);
  };
  const viewDestination = (destination: WorkspaceDestination) => {
    onView?.(destination);
    setOpen(false);
  };

  return (
    <>
      <button
        className="ui-button ui-button--primary ui-workspace-picker-trigger"
        type="button"
        onClick={() => {
          setQuery('');
          setLastAddedPath('');
          setDisplayedRecentKeys(recentDestinationKeys);
          setSelectedDestinationKey(currentDestination?.key ?? destinations[0]?.key ?? '');
          setOpen(true);
        }}
        title={addedCount > 0 ? `Add to workspace; already in ${addedCount}` : 'Add to workspace'}
      >
        <Plus size={12} />
        Add to workspace…
      </button>
      {open ? (
        <DialogShell
          title="Add to workspace"
          description={<>Choose a destination for <strong>{displayTitle}</strong>. The active workspace is selected by default, but nothing is added until you confirm. Project membership is unchanged.</>}
          onClose={() => setOpen(false)}
          maxWidth={540}
          maxHeight="min(82vh, 680px)"
          bodyClassName="ui-workspace-picker"
          footer={selectedDestination ? (
            <div className="ui-workspace-picker__footer">
              <span className="ui-workspace-picker__selection" title={selectedDestination.path}>
                Selected: <strong>{selectedDestination.path}</strong>
              </span>
              <div className="ui-workspace-picker__footer-actions">
                {onView ? (
                  <button className="ui-button ui-button--secondary" type="button" onClick={() => viewDestination(selectedDestination)}>
                    View workspace
                  </button>
                ) : null}
                <button
                  className="ui-button ui-button--primary"
                  type="button"
                  disabled={isAdded(selectedDestination)}
                  onClick={() => addToDestination(selectedDestination)}
                >
                  {isAdded(selectedDestination) ? <><Check size={13} /> Already added</> : <><Plus size={13} /> Add to workspace</>}
                </button>
              </div>
            </div>
          ) : undefined}
        >
          <label className="ui-workspace-picker__search">
            <Search size={14} aria-hidden="true" />
            <input
              className="ui-field"
              data-dialog-initial-focus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search project or workspace"
              aria-label="Search project or workspace"
            />
          </label>

          {lastAddedPath ? <div className="ui-status" data-tone="success" role="status">Added to {lastAddedPath}</div> : null}

          {normalizedQuery ? (
            <DestinationSection title="Search results">
              {searchResults.length > 0 ? searchResults.map((destination) => (
                <DestinationRow key={destination.key} destination={destination} added={isAdded(destination)} selected={destination.key === selectedDestination?.key} onSelect={() => setSelectedDestinationKey(destination.key)} />
              )) : <div className="ui-workspace-picker__empty">No matching workspace.</div>}
            </DestinationSection>
          ) : (
            <>
              {currentDestination ? (
                <DestinationSection title="Active workspace">
                  <DestinationRow destination={currentDestination} added={isAdded(currentDestination)} selected={currentDestination.key === selectedDestination?.key} onSelect={() => setSelectedDestinationKey(currentDestination.key)} />
                </DestinationSection>
              ) : null}
              {recentDestinations.length > 0 ? (
                <DestinationSection title="Recent">
                  {recentDestinations.map((destination) => (
                    <DestinationRow key={destination.key} destination={destination} added={isAdded(destination)} selected={destination.key === selectedDestination?.key} onSelect={() => setSelectedDestinationKey(destination.key)} />
                  ))}
                </DestinationSection>
              ) : null}
              {groupedDestinations.map(([projectName, projectDestinations]) => (
                <DestinationSection key={projectName} title={projectName}>
                  {projectDestinations.map((destination) => (
                    <DestinationRow key={destination.key} destination={destination} added={isAdded(destination)} selected={destination.key === selectedDestination?.key} onSelect={() => setSelectedDestinationKey(destination.key)} />
                  ))}
                </DestinationSection>
              ))}
            </>
          )}
        </DialogShell>
      ) : null}
    </>
  );
};

const DestinationSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="ui-workspace-picker__section">
    <h3>{title}</h3>
    <div className="ui-workspace-picker__list">{children}</div>
  </section>
);

const DestinationRow: React.FC<{ destination: WorkspaceDestination; added: boolean; selected: boolean; onSelect: () => void }> = ({ destination, added, selected, onSelect }) => {
  const Icon = destination.kind === 'browser' ? Monitor : destination.kind === 'global' ? Layers3 : Folder;
  return (
    <button
      type="button"
      className="ui-workspace-picker__row"
      data-added={added ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="ui-workspace-picker__icon"><Icon size={14} aria-hidden="true" /></span>
      <span className="ui-workspace-picker__copy">
        <strong>{destination.path}</strong>
        <span>{destination.kind === 'browser' ? 'Browser snapshot' : destination.kind === 'saved' ? 'Named workspace' : destination.kind === 'live' ? 'Project General workspace' : 'Shared global workspace'}</span>
      </span>
      <span className="ui-workspace-picker__status">
        {added ? <><Check size={13} /> Added</> : selected ? 'Selected' : null}
      </span>
    </button>
  );
};
