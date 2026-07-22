import React, { useState } from 'react';
import { FolderPlus } from 'lucide-react';
import type { Collection, Item, Project, UpdateItemOptions } from '../../lib/db';
import { DialogShell } from './DialogShell';
import { ItemOrganizationEditor } from './ItemOrganizationEditor';

interface ItemOrganizationDialogProps {
  item: Item;
  projects: Project[];
  collections: Collection[];
  onUpdateItem: (
    id: string,
    updates: Partial<Omit<Item, 'id' | 'created_at'>>,
    options?: UpdateItemOptions
  ) => Promise<void>;
  onCreateProject?: (data: { name: string; description?: string }) => Promise<string | void>;
  onCreateCollection?: (data: { name: string; projectId: string }) => Promise<string | void>;
}

/** Compact entry point for permanently filing an item without leaving its current browse surface. */
export const ItemOrganizationDialog: React.FC<ItemOrganizationDialogProps> = ({
  item,
  projects,
  collections,
  onUpdateItem,
  onCreateProject,
  onCreateCollection,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="ui-button ui-button--secondary ui-button--compact"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        title="Add to a project or collection"
      >
        <FolderPlus size={12} aria-hidden="true" /> Organize…
      </button>
      {open ? (
        <DialogShell
          title="Add to project or collection"
          description={<>Choose permanent library locations for <strong>{item.title || 'Untitled'}</strong>. Workspaces remain separate.</>}
          onClose={() => setOpen(false)}
          maxWidth={560}
          footer={(
            <button className="ui-button ui-button--primary" type="button" onClick={() => setOpen(false)}>
              Done
            </button>
          )}
        >
          <ItemOrganizationEditor
            item={item}
            projects={projects}
            collections={collections}
            compact
            showTags={false}
            onCreateProject={onCreateProject}
            onCreateCollection={onCreateCollection}
            onUpdate={(patch) => onUpdateItem(item.id, { ...patch, updated_at: Date.now() })}
          />
        </DialogShell>
      ) : null}
    </>
  );
};
