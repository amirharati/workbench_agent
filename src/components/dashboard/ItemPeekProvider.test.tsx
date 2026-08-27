// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '../../lib/db';

vi.mock('../../lib/enrichment/rawBodyStore', () => ({
  loadRawBody: vi.fn().mockResolvedValue(
    '<!-- enrichment-meta\n{"providerId":"hybrid"}\n-->\n\n# Raw reconstructed page\n\nNavigation noise'
  ),
}));

vi.mock('../../hooks/useInspectorItemData', () => ({
  useInspectorItemData: (itemId?: string) => ({
    context: itemId === 'link-1' ? {
      item: {
        id: 'link-1',
        title: 'Saved article',
        url: 'https://example.com/article',
        notes: 'Remember this for the housing review.',
        collectionIds: [],
        tags: ['manual tag'],
        source: 'manual',
        created_at: 3,
        updated_at: 3,
      },
      enrichment: { rawRef: 'raw/link-1', aiTags: ['AI tag'] },
      summary: 'A concise explanation of the saved article.',
      keyPoints: ['First useful point'],
      references: [{ url: 'https://example.com/source', label: 'Supporting source', followed: true }],
      acceptedLinks: [{ categoryId: 'housing', name: 'Housing', parentName: 'Places', isPrimary: true }],
      suggestedLinks: [{ categoryId: 'rentals', name: 'Rentals', parentName: 'Travel', isPrimary: false, score: 0.76 }],
    } : null,
    contextLoading: false,
    similar: null,
    similarLoading: false,
    contextError: null,
    similarError: null,
    reload: vi.fn(),
  }),
}));

import { cleanStoredPreviewMarkdown, ItemPeekProvider, useItemPeek } from './ItemPeekProvider';

const items: Item[] = [
  { id: 'note-1', title: 'First note', url: '', notes: '# First body\n\n[Reference](https://example.com)', collectionIds: [], tags: [], source: 'manual', created_at: 1, updated_at: 1 },
  { id: 'note-2', title: 'Second note', url: '', notes: 'Second body', collectionIds: [], tags: [], source: 'manual', created_at: 2, updated_at: 2 },
  { id: 'link-1', title: 'Saved article', url: 'https://example.com/article', notes: 'Remember this for the housing review.', collectionIds: [], tags: ['manual tag'], source: 'manual', created_at: 3, updated_at: 3 },
];

function Surface() {
  const { openPeek } = useItemPeek();
  return (
    <>
      <button type="button" onClick={() => openPeek('note-1', { itemIds: ['note-1', 'note-2'], sourceLabel: 'Test list' })}>Open note preview</button>
      <button type="button" onClick={() => openPeek('link-1', { sourceLabel: 'Test list' })}>Open link preview</button>
    </>
  );
}

describe('ItemPeekProvider', () => {
  const roots: Array<{ root: ReturnType<typeof createRoot>; host: HTMLElement }> = [];
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(async () => {
    for (const { root, host } of roots.splice(0)) {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  async function renderProvider() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push({ root, host });
    await act(async () => {
      root.render(
        <ItemPeekProvider
          items={items}
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
          activeWorkspaceKey="workspace:global"
          isItemInWorkspace={() => false}
          onAddItemToWorkspace={vi.fn()}
          onViewItemInWorkspace={vi.fn()}
        >
          <Surface />
        </ItemPeekProvider>
      );
    });
    return { host };
  }

  it('previews an item without replacing the underlying surface', async () => {
    const { host } = await renderProvider();
    await act(async () => host.querySelector<HTMLButtonElement>('button')?.click());
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('First note');
    expect(dialog?.textContent).toContain('First body');
    expect(dialog?.querySelector('.ui-item-peek__markdown h1')?.textContent).toBe('First body');
    const reference = dialog?.querySelector<HTMLAnchorElement>('.ui-item-peek__markdown a');
    expect(reference?.href).toBe('https://example.com/');
    expect(reference?.target).toBe('_blank');
    expect(dialog?.textContent).toContain('Opened from Test list');
    expect(host.textContent).toContain('Open note preview');

    const close = dialog?.querySelector<HTMLButtonElement>('[aria-label="Close Preview"]');
    await act(async () => close?.click());
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain('Open note preview');
  });

  it('moves through the originating result order', async () => {
    const { host } = await renderProvider();
    await act(async () => host.querySelector<HTMLButtonElement>('button')?.click());
    const next = [...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find((button) => button.textContent?.includes('Next'));
    await act(async () => next?.click());
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Second note');
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('2 of 2');
  });

  it('browses the originating result order as a visual gallery', async () => {
    const { host } = await renderProvider();
    await act(async () => host.querySelector<HTMLButtonElement>('button')?.click());

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.querySelector('[aria-label="Preview gallery"]')).not.toBeNull();
    expect(dialog?.textContent).toContain('First note');
    expect(dialog?.textContent).toContain('Second note');
    expect(dialog?.textContent).toContain('First body');
    expect(dialog?.querySelector('.ui-item-peek__gallery-card[aria-current="true"] strong')?.textContent).toBe('First note');

    const second = dialog?.querySelector<HTMLButtonElement>('[aria-label="See full preview for Second note"]');
    await act(async () => second?.click());
    expect(dialog?.querySelector('[aria-label="Preview gallery"]')).not.toBeNull();
    expect(dialog?.textContent).toContain('Second body');
    expect(dialog?.textContent).toContain('2 of 2');
    expect(dialog?.querySelector('.ui-item-peek__gallery-card[aria-current="true"] strong')?.textContent).toBe('Second note');
  });

  it('removes the private enrichment header before rendering stored Markdown', () => {
    const stored = '<!-- enrichment-meta\n{"providerId":"hybrid"}\n-->\n\n# Visible article';
    expect(cleanStoredPreviewMarkdown(stored)).toBe('# Visible article');
  });

  it('shows structured saved information and keeps the raw fetch dump secondary', async () => {
    const { host } = await renderProvider();
    const openLink = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Open link preview');
    await act(async () => openLink?.click());

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Saved article');
    expect(dialog?.textContent).toContain('https://example.com/article');
    expect(dialog?.textContent).toContain('A concise explanation of the saved article.');
    expect(dialog?.textContent).toContain('First useful point');
    expect(dialog?.textContent).toContain('AI tag');
    expect(dialog?.textContent).toContain('manual tag');
    expect(dialog?.textContent).toContain('Remember this for the housing review.');
    expect(dialog?.textContent).toContain('Housing');
    expect(dialog?.textContent).toContain('Rentals');
    expect(dialog?.textContent).not.toContain('Raw reconstructed page');

    const showSource = [...(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
      .find((button) => button.textContent?.includes('View stored source'));
    await act(async () => {
      showSource?.click();
      await Promise.resolve();
    });

    expect(dialog?.querySelector('.ui-item-peek__source pre')?.textContent).toContain('# Raw reconstructed page');
    expect(dialog?.querySelector('.ui-item-peek__source pre')?.textContent).not.toContain('enrichment-meta');
    expect(dialog?.querySelector('.ui-item-peek__source h1')).toBeNull();
  });
});
