import React, { useEffect, useMemo, useState } from 'react';
import type { Collection, Item, Project } from '../lib/db';
import { DialogShell } from './dashboard/DialogShell';

export interface DeleteConfirmResult {
  action: 'cancel' | 'remove-from-collection' | 'delete-everywhere';
  /** Active collection placements selected in the dialog. */
  collectionIds?: string[];
}

interface DeleteConfirmDialogProps {
  item: Item;
  /** Current scoped collection, preselected when this came from a collection view. */
  collectionId?: string;
  collectionName?: string;
  collections?: Collection[];
  projects?: Project[];
  onResult: (result: DeleteConfirmResult) => void;
}

/** One removal decision for every Library surface. */
export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  item,
  collectionId,
  collections = [],
  projects = [],
  onResult,
}) => {
  const activeIds = useMemo(() => [...new Set((item.collectionIds || []).filter(Boolean))], [item.collectionIds]);
  const initialIds = useMemo(
    () => (collectionId && activeIds.includes(collectionId) ? [collectionId] : activeIds),
    [collectionId, activeIds]
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  useEffect(() => setSelectedIds(initialIds), [item.id, collectionId, initialIds]);

  const collectionById = useMemo(() => new Map(collections.map((c) => [c.id, c])), [collections]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const groups = useMemo(() => {
    const grouped = new Map<string, { projectName: string; entries: Array<{ id: string; name: string }> }>();
    for (const id of activeIds) {
      const collection = collectionById.get(id);
      const projectId = collection?.primaryProjectId || '__unassigned__';
      const projectName = projectById.get(projectId)?.name || (collection ? 'Unassigned project' : 'Unavailable collection');
      const group = grouped.get(projectId) || { projectName, entries: [] };
      group.entries.push({ id, name: collection?.name || id });
      grouped.set(projectId, group);
    }
    return [...grouped.entries()].map(([id, group]) => ({ id, ...group }));
  }, [activeIds, collectionById, projectById]);

  const selected = new Set(selectedIds);
  const allSelected = activeIds.length > 0 && activeIds.every((id) => selected.has(id));
  const toggle = (id: string) => setSelectedIds((current) =>
    current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
  );
  const submit = () => {
    if (!selectedIds.length) return;
    onResult({ action: allSelected ? 'delete-everywhere' : 'remove-from-collection', collectionIds: selectedIds });
  };

  return (
    <DialogShell
      title={`Remove “${item.title || 'Untitled'}” from Library?`}
      description="Choose which saved locations to remove. Your item and its enrichment remain restorable until Trash is emptied."
      onClose={() => onResult({ action: 'cancel' })}
      maxWidth={540}
      raised
      footer={
        <>
          <button className="ui-button ui-button--secondary" type="button" onClick={() => onResult({ action: 'cancel' })}>Cancel</button>
          <button className="ui-button ui-button--danger" type="button" disabled={!selectedIds.length} onClick={submit}>
            {allSelected ? 'Move to Trash' : `Remove from ${selectedIds.length} location${selectedIds.length === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {groups.map((group) => (
          <div key={group.id} style={{ borderBottom: '1px solid var(--border)' }}>
            <div style={{ padding: '7px 10px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-glass)' }}>
              {group.projectName}
            </div>
            {group.entries.map((entry) => (
              <label key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', cursor: 'pointer', color: 'var(--text)', fontSize: 'var(--text-sm)' }}>
                <input type="checkbox" checked={selected.has(entry.id)} onChange={() => toggle(entry.id)} />
                <span>{entry.name}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      <p style={{ margin: '14px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.45 }}>
        Workspace entries are references only; removing one does not affect whether this Library item is kept.
      </p>
    </DialogShell>
  );
};
