import React, { useMemo, useState } from 'react';
import { Check, Folder, Layers3, Monitor, Plus, Search } from 'lucide-react';
import type { Item } from '../../lib/db';
import { DialogShell } from './DialogShell';
import type { WorkspaceDestination } from './workspaceDestinations';

interface WorkspaceDestinationPickerProps {
  item: Item;
  destinations: WorkspaceDestination[];
  recentDestinationKeys?: readonly string[];
  isAdded: (destination: WorkspaceDestination) => boolean;
  onAdd: (destination: WorkspaceDestination) => void;
}

export const WorkspaceDestinationPicker: React.FC<WorkspaceDestinationPickerProps> = ({
  item,
  destinations,
  recentDestinationKeys = [],
  isAdded,
  onAdd,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [lastAddedPath, setLastAddedPath] = useState('');
  const [displayedRecentKeys, setDisplayedRecentKeys] = useState<readonly string[]>(recentDestinationKeys);
  const currentDestination = destinations.find((destination) => destination.isCurrent)
    ?? destinations[0];
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

  const addToDestination = (destination: WorkspaceDestination) => {
    if (isAdded(destination)) return;
    onAdd(destination);
    setLastAddedPath(destination.path);
  };

  return (
    <>
      <button
        className="ui-button ui-button--primary ui-workspace-picker-trigger"
        type="button"
        onClick={() => { setQuery(''); setLastAddedPath(''); setDisplayedRecentKeys(recentDestinationKeys); setOpen(true); }}
        title={currentDestination ? `Current context: ${currentDestination.path}` : 'Add to workspace'}
      >
        <Plus size={12} /> Add to workspace…
      </button>
      {open ? (
        <DialogShell
          title="Add to workspace"
          description={<>Choose one or more working sets for <strong>{item.title || 'Untitled'}</strong>. Project membership is unchanged.</>}
          onClose={() => setOpen(false)}
          maxWidth={540}
          maxHeight="min(82vh, 680px)"
          bodyClassName="ui-workspace-picker"
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
                <DestinationRow key={destination.key} destination={destination} added={isAdded(destination)} onAdd={() => addToDestination(destination)} />
              )) : <div className="ui-workspace-picker__empty">No matching workspace.</div>}
            </DestinationSection>
          ) : (
            <>
              {currentDestination ? (
                <DestinationSection title="Current context">
                  <DestinationRow destination={currentDestination} added={isAdded(currentDestination)} onAdd={() => addToDestination(currentDestination)} />
                </DestinationSection>
              ) : null}
              {recentDestinations.length > 0 ? (
                <DestinationSection title="Recent">
                  {recentDestinations.map((destination) => (
                    <DestinationRow key={destination.key} destination={destination} added={isAdded(destination)} onAdd={() => addToDestination(destination)} />
                  ))}
                </DestinationSection>
              ) : null}
              {groupedDestinations.map(([projectName, projectDestinations]) => (
                <DestinationSection key={projectName} title={projectName}>
                  {projectDestinations.map((destination) => (
                    <DestinationRow key={destination.key} destination={destination} added={isAdded(destination)} onAdd={() => addToDestination(destination)} />
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

const DestinationRow: React.FC<{ destination: WorkspaceDestination; added: boolean; onAdd: () => void }> = ({ destination, added, onAdd }) => {
  const Icon = destination.kind === 'browser' ? Monitor : destination.kind === 'global' ? Layers3 : Folder;
  return (
    <button
      className="ui-workspace-picker__row"
      type="button"
      data-added={added ? 'true' : 'false'}
      onClick={onAdd}
      disabled={added}
      aria-label={added ? `Already added to ${destination.path}` : `Add to ${destination.path}`}
    >
      <span className="ui-workspace-picker__icon"><Icon size={14} aria-hidden="true" /></span>
      <span className="ui-workspace-picker__copy">
        <strong>{destination.path}</strong>
        <span>{destination.kind === 'browser' ? 'Browser working copy' : destination.kind === 'saved' ? 'Named workspace' : destination.kind === 'live' ? 'Live session' : 'Cross-project workspace'}</span>
      </span>
      <span className="ui-workspace-picker__state">{added ? <><Check size={13} /> Added</> : <><Plus size={13} /> Add</>}</span>
    </button>
  );
};
