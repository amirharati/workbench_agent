// @vitest-environment jsdom
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '../../lib/db';
import { ToastProvider } from '../ToastContainer';
import { ItemDragDropProvider, useItemDragDrop } from './ItemDragDropProvider';
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

describe('ItemDragDropProvider', () => {
  const roots: Array<{ root: ReturnType<typeof createRoot>; host: HTMLElement }> = [];
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(async () => {
    for (const { root, host } of roots.splice(0)) {
      await act(async () => root.unmount());
      host.remove();
    }
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
});
