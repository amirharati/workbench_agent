// @vitest-environment jsdom
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '../../lib/db';
import { ToastProvider } from '../ToastContainer';
import { ItemDragDropProvider, chooseItemDropTraySide, useItemDragDrop } from './ItemDragDropProvider';
import type { ItemDragSource, ItemDropTarget, ProjectCollectionDropTarget } from './itemDragDrop';

const savedItem: Item = {
  id: 'item-1',
  title: 'One',
  url: 'https://example.com',
  collectionIds: [],
  tags: [],
  source: 'manual',
  created_at: 1,
  updated_at: 1,
};

function mockDataTransfer(): DataTransfer {
  const values = new Map<string, string>();
  return {
    effectAllowed: 'uninitialized',
    dropEffect: 'none',
    get types() { return [...values.keys()]; },
    setData: (type: string, value: string) => { values.set(type, value); },
    getData: (type: string) => values.get(type) ?? '',
  } as unknown as DataTransfer;
}

function dispatchDrag(element: Element, type: string, dataTransfer: DataTransfer): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  element.dispatchEvent(event);
}

function TestSurface({ source, target }: { source: ItemDragSource; target: ItemDropTarget }) {
  const { getDragProps, getDropTargetProps } = useItemDragDrop();
  return <>
    <div data-testid="source" {...getDragProps(savedItem, source)}>Source</div>
    <div data-testid="target" {...getDropTargetProps(target)}>Target</div>
  </>;
}

function ProjectTestSurface({
  source,
  target,
}: {
  source: ItemDragSource;
  target: ProjectCollectionDropTarget;
}) {
  const { getDragProps, getProjectCollectionDropTargetProps } = useItemDragDrop();
  return <>
    <div data-testid="source" {...getDragProps(savedItem, source)}>Source</div>
    <div data-testid="target" {...getProjectCollectionDropTargetProps(target)}>All items</div>
  </>;
}

function BulkTestSurface() {
  const { beginItemTransfer } = useItemDragDrop();
  return (
    <button
      type="button"
      onClick={() => beginItemTransfer(
        [{ id: 'item-1', title: 'One' }, { id: 'item-2', title: 'Two' }],
        { kind: 'reference', label: 'Search results' }
      )}
    >
      Organize two
    </button>
  );
}

describe('ItemDragDropProvider', () => {
  const roots: Array<{ root: ReturnType<typeof createRoot>; host: HTMLElement }> = [];
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(async () => {
    for (const { root, host } of roots.splice(0)) {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('places the destination tray away from the drag source', () => {
    expect(chooseItemDropTraySide({ left: 900, right: 1180, viewportWidth: 1200 })).toBe('left');
    expect(chooseItemDropTraySide({ left: 20, right: 320, viewportWidth: 1200 })).toBe('right');
  });

  async function renderSurface(source: ItemDragSource, onTransfer = vi.fn()) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push({ root, host });
    const target: ItemDropTarget = {
      kind: 'workspace',
      containerId: 'workspace-b',
      containerLabel: 'Workspace B',
      projectId: 'project-a',
    };
    await act(async () => {
      root.render(
        <ToastProvider>
          <ItemDragDropProvider
            projects={[]}
            collections={[]}
            workspaceDestinations={[]}
            isInTarget={() => false}
            onTransfer={onTransfer}
            onReorderWorkspaceItem={vi.fn()}
          >
            <TestSurface source={source} target={target} />
          </ItemDragDropProvider>
        </ToastProvider>
      );
    });
    return { host, onTransfer };
  }

  async function renderProjectSurface(collectionNames: string[], onTransfer = vi.fn()) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push({ root, host });
    const target: ProjectCollectionDropTarget = {
      kind: 'project-collections',
      projectId: 'project-a',
      projectLabel: 'Project A',
      collections: collectionNames.map((name, index) => ({
        kind: 'collection',
        containerId: `collection-${index}`,
        containerLabel: name,
        projectId: 'project-a',
      })),
    };
    await act(async () => {
      root.render(
        <ToastProvider>
          <ItemDragDropProvider
            projects={[]}
            collections={[]}
            workspaceDestinations={[]}
            isInTarget={() => false}
            onTransfer={onTransfer}
            onReorderWorkspaceItem={vi.fn()}
          >
            <ProjectTestSurface source={{ kind: 'reference', label: 'Search' }} target={target} />
          </ItemDragDropProvider>
        </ToastProvider>
      );
    });
    return { host, onTransfer };
  }

  it('keeps the drag tray to open projects and reveals destinations on hover', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push({ root, host });
    await act(async () => {
      root.render(
        <ToastProvider>
          <ItemDragDropProvider
            projects={[
              { id: 'project-a', name: 'Open project', isDefault: false, created_at: 1, updated_at: 1 },
              { id: 'project-b', name: 'Closed project', isDefault: false, created_at: 1, updated_at: 1 },
            ]}
            collections={[
              { id: 'collection-a', name: 'Reading', isDefault: false, created_at: 1, updated_at: 1, primaryProjectId: 'project-a', projectIds: ['project-a'] },
              { id: 'collection-b', name: 'Hidden collection', isDefault: false, created_at: 1, updated_at: 1, primaryProjectId: 'project-b', projectIds: ['project-b'] },
            ]}
            workspaceDestinations={[
              { key: 'workspace:global', projectId: 'all', projectName: 'Global', workspaceName: 'Global workspace', path: 'Global workspace', kind: 'global', isCurrent: false },
              { key: 'workspace:project-a:general', projectId: 'project-a', projectName: 'Open project', workspaceName: 'General', path: 'Open project — General', kind: 'live', isCurrent: true },
              { key: 'workspace:project-b:general', projectId: 'project-b', projectName: 'Closed project', workspaceName: 'Hidden workspace', path: 'Closed project — Hidden workspace', kind: 'saved', isCurrent: false },
            ]}
            openProjectIds={['project-a']}
            isInTarget={() => false}
            onTransfer={vi.fn()}
            onReorderWorkspaceItem={vi.fn()}
          >
            <TestSurface source={{ kind: 'reference', label: 'Search' }} target={{ kind: 'workspace', containerId: 'other', containerLabel: 'Other', projectId: 'project-a' }} />
          </ItemDragDropProvider>
        </ToastProvider>
      );
    });

    const dataTransfer = mockDataTransfer();
    await act(async () => {
      dispatchDrag(host.querySelector('[data-testid="source"]')!, 'dragstart', dataTransfer);
    });
    const tray = host.querySelector<HTMLElement>('[aria-label="Destinations for One"]')!;
    expect(tray.textContent).toContain('Global workspace');
    expect(tray.textContent).toContain('Open project');
    expect(tray.textContent).not.toContain('Closed project');
    expect(tray.textContent).not.toContain('Hidden collection');

    await act(async () => {
      dispatchDrag(host.querySelector('[data-project-id="project-a"]')!, 'dragenter', dataTransfer);
    });
    expect(tray.textContent).toContain('General');
    expect(tray.textContent).toContain('Reading');
    expect(tray.textContent).not.toContain('Hidden workspace');
  });

  it('keeps the current project expanded ahead of recent open projects', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push({ root, host });
    await act(async () => {
      root.render(
        <ToastProvider>
          <ItemDragDropProvider
            projects={[
              { id: 'project-a', name: 'Recent project', isDefault: false, created_at: 1, updated_at: 1 },
              { id: 'project-b', name: 'Current project', isDefault: false, created_at: 1, updated_at: 1 },
            ]}
            collections={[
              { id: 'collection-a', name: 'Recent collection', isDefault: false, created_at: 1, updated_at: 1, primaryProjectId: 'project-a', projectIds: ['project-a'] },
              { id: 'collection-b', name: 'Current collection', isDefault: false, created_at: 1, updated_at: 1, primaryProjectId: 'project-b', projectIds: ['project-b'] },
            ]}
            workspaceDestinations={[
              { key: 'workspace:global', projectId: 'all', projectName: 'Global', workspaceName: 'Global workspace', path: 'Global workspace', kind: 'global', isCurrent: false },
              { key: 'workspace:project-a:general', projectId: 'project-a', projectName: 'Recent project', workspaceName: 'General', path: 'Recent project — General', kind: 'live', isCurrent: false },
              { key: 'workspace:project-b:general', projectId: 'project-b', projectName: 'Current project', workspaceName: 'General', path: 'Current project — General', kind: 'live', isCurrent: true },
            ]}
            currentProjectId="project-b"
            openProjectIds={['project-a', 'project-b']}
            isInTarget={() => false}
            onTransfer={vi.fn()}
            onReorderWorkspaceItem={vi.fn()}
          >
            <TestSurface source={{ kind: 'reference', label: 'Search' }} target={{ kind: 'workspace', containerId: 'other', containerLabel: 'Other', projectId: 'project-b' }} />
          </ItemDragDropProvider>
        </ToastProvider>
      );
    });

    const dataTransfer = mockDataTransfer();
    await act(async () => {
      dispatchDrag(host.querySelector('[data-testid="source"]')!, 'dragstart', dataTransfer);
    });

    const tray = host.querySelector<HTMLElement>('[aria-label="Destinations for One"]')!;
    const headings = [...tray.querySelectorAll('h3')].map((heading) => heading.textContent?.trim());
    expect(headings).toContain('Current project');
    expect(headings).toContain('Recent open projects');
    expect(headings.indexOf('Current project')).toBeLessThan(headings.indexOf('Quick destinations'));
    expect(tray.querySelector('[data-project-id="project-b"]')?.getAttribute('data-current')).toBe('true');
    expect(tray.querySelector('[data-project-id="project-b"]')?.textContent).toContain('Current collection');
    expect(tray.querySelector('[data-project-id="project-a"]')?.getAttribute('data-current')).toBe('false');
    expect(tray.querySelector('[data-project-id="project-a"]')?.textContent).not.toContain('Recent collection');
  });

  it('copies immediately from a reference result', async () => {
    const { host, onTransfer } = await renderSurface({ kind: 'reference', label: 'Search' });
    const dataTransfer = mockDataTransfer();
    await act(async () => {
      dispatchDrag(host.querySelector('[data-testid="source"]')!, 'dragstart', dataTransfer);
      dispatchDrag(host.querySelector('[data-testid="target"]')!, 'drop', dataTransfer);
    });
    expect(onTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item-1' }),
      expect.objectContaining({ containerId: 'workspace-b' }),
      'copy'
    );
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('asks before moving between workspaces', async () => {
    const { host, onTransfer } = await renderSurface({
      kind: 'workspace',
      containerId: 'workspace-a',
      containerLabel: 'Workspace A',
      projectId: 'project-a',
    });
    const dataTransfer = mockDataTransfer();
    await act(async () => {
      dispatchDrag(host.querySelector('[data-testid="source"]')!, 'dragstart', dataTransfer);
      dispatchDrag(host.querySelector('[data-testid="target"]')!, 'drop', dataTransfer);
    });
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Copy or move this item?');
    const moveButton = [...(dialog?.querySelectorAll('button') ?? [])]
      .find((button) => button.textContent?.includes('Move to Workspace B'));
    await act(async () => moveButton?.click());
    expect(onTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item-1' }),
      expect.objectContaining({ containerId: 'workspace-b' }),
      'move'
    );
  });

  it('adds directly when a project has one collection', async () => {
    const { host, onTransfer } = await renderProjectSurface(['Reading']);
    const dataTransfer = mockDataTransfer();
    await act(async () => {
      dispatchDrag(host.querySelector('[data-testid="source"]')!, 'dragstart', dataTransfer);
      dispatchDrag(host.querySelector('[data-testid="target"]')!, 'drop', dataTransfer);
    });
    expect(onTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item-1' }),
      expect.objectContaining({ containerId: 'collection-0', containerLabel: 'Reading' }),
      'copy'
    );
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('asks which collection when a project has several', async () => {
    const { host, onTransfer } = await renderProjectSurface(['Reading', 'Research']);
    const dataTransfer = mockDataTransfer();
    await act(async () => {
      dispatchDrag(host.querySelector('[data-testid="source"]')!, 'dragstart', dataTransfer);
      dispatchDrag(host.querySelector('[data-testid="target"]')!, 'drop', dataTransfer);
    });
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Choose a collection');
    expect(dialog?.textContent).toContain('Project A');
    const researchButton = [...(dialog?.querySelectorAll('button') ?? [])]
      .find((button) => button.textContent?.includes('Research'));
    await act(async () => researchButton?.click());
    expect(onTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item-1' }),
      expect.objectContaining({ containerId: 'collection-1', containerLabel: 'Research' }),
      'copy'
    );
  });

  it('opens one destination chooser for a multi-item selection', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push({ root, host });
    const onTransfer = vi.fn().mockResolvedValue({ message: 'Added 2 items' });
    await act(async () => {
      root.render(
        <ToastProvider>
          <ItemDragDropProvider
            projects={[]}
            collections={[]}
            workspaceDestinations={[{
              key: 'workspace:global',
              projectId: 'all',
              projectName: 'Global',
              workspaceName: 'Global workspace',
              path: 'Global workspace',
              kind: 'global',
              isCurrent: true,
            }]}
            isInTarget={() => false}
            onTransfer={onTransfer}
            onReorderWorkspaceItem={vi.fn()}
          >
            <BulkTestSurface />
          </ItemDragDropProvider>
        </ToastProvider>
      );
    });

    await act(async () => host.querySelector<HTMLButtonElement>('button')?.click());
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Organize 2 items');
    const destination = [...(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
      .find((button) => button.textContent?.includes('Global workspace'));
    await act(async () => destination?.click());

    expect(onTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ itemIds: ['item-1', 'item-2'] }),
      expect.objectContaining({ containerId: 'workspace:global' }),
      'copy'
    );
  });
});
