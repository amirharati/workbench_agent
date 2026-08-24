// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManageCategoriesDialog } from './ManageCategoriesDialog';

const service = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  findSimilar: vi.fn(),
  create: vi.fn(),
  manage: vi.fn(),
  propose: vi.fn(),
  update: vi.fn(),
  deleteCategory: vi.fn(),
}));

vi.mock('../../lib/categorization/categoryManagement', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/categorization/categoryManagement')>()),
  getCategoryManagementSnapshot: service.getSnapshot,
  findSimilarCategories: service.findSimilar,
  createManualCategory: service.create,
  manageItemCategory: service.manage,
  proposeCategoryStructure: service.propose,
  updateManualCategory: service.update,
  deleteManualCategory: service.deleteCategory,
}));

const parent = {
  id: 'technology', name: 'Technology', kind: 'parent' as const, status: 'approved' as const,
  source: 'seed' as const, assignable: false, created_at: 1, updated_at: 1,
};
const existing = {
  id: 'ml', name: 'Machine learning', kind: 'leaf' as const, status: 'approved' as const,
  source: 'seed' as const, assignable: true, parentId: 'technology', parentName: 'Technology',
  created_at: 1, updated_at: 1,
};

describe('ManageCategoriesDialog', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    service.getSnapshot.mockReset().mockResolvedValue({
      categories: [parent, existing],
      links: [],
      signal: {
        itemId: 'item-1', textHash: '', embeddingModel: 'model', embedding: [], derivedTags: [],
        signalStatus: 'ok', lastProcessedAt: 1,
        llmReview: {
          novelTopicSuggestion: {
            name: 'Model serving', description: 'Operating deployed models.',
            parentId: 'technology', canonicalTags: ['serving'],
          },
        },
      },
    });
    service.findSimilar.mockReset().mockResolvedValue({
      matches: [{ category: existing, score: 0.74, lexicalScore: 0.2, semanticScore: 0.8, exact: false }],
      semanticAvailable: true,
    });
    service.create.mockReset().mockResolvedValue({
      revision: 2,
      attachedCategoryId: 'manual_model-deployment',
      links: [{
        id: 'link-item-1-model-deployment', itemId: 'item-1',
        categoryId: 'manual_model-deployment', score: 1, isPrimary: true,
        source: 'manual', status: 'accepted', created_at: 2, updated_at: 2,
      }],
    });
    service.manage.mockReset().mockResolvedValue({ revision: 2 });
    service.propose.mockReset().mockResolvedValue({
      parentName: 'Machine learning operations',
      parentDescription: '',
      childName: 'Model deployment',
      childDescription: '',
      generated: true,
    });
    service.update.mockReset().mockResolvedValue({ revision: 2 });
    service.deleteCategory.mockReset().mockResolvedValue({ revision: 2 });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('supports existing-category assignment and pre-fills a novel AI draft without replacing anything', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => root.render(
      <ManageCategoriesDialog itemId="item-1" itemTitle="Example" onClose={() => {}} />
    ));

    expect(document.body.textContent).toContain('No categories are attached yet');
    expect(document.body.textContent).toContain('Adding to this bookmark: Example');
    const name = document.body.querySelector<HTMLInputElement>('input[placeholder^="For example:"]');
    const parentSelect = document.body.querySelector<HTMLSelectElement>('select');
    expect(name?.value).toBe('Model serving');
    expect(parentSelect?.value).toBe('technology');
    expect(document.body.textContent).toContain('classifier suggested this concept');
    expect(document.body.textContent).not.toContain('Create new');

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(name, 'Machine learning');
      name?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.body.textContent).toContain('Technology › Machine learning');
    const add = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Use this');
    await act(async () => add?.click());
    expect(service.manage).toHaveBeenCalledWith('item-1', 'ml', 'add');

    await act(async () => root.unmount());
  });

  it('uses an explicit name field and exposes rename and guarded deletion for user categories', async () => {
    const manual = {
      id: 'manual_model-serving', name: 'Model serving', kind: 'leaf' as const,
      status: 'manual' as const, source: 'manual' as const, assignable: true,
      parentId: 'technology', parentName: 'Technology', created_at: 2, updated_at: 2,
    };
    service.getSnapshot.mockResolvedValue({
      categories: [parent, existing, manual],
      links: [{
        id: 'link-1', itemId: 'item-1', categoryId: manual.id, score: 1,
        isPrimary: true, source: 'manual', status: 'accepted', created_at: 2, updated_at: 2,
      }],
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => root.render(
      <ManageCategoriesDialog itemId="item-1" itemTitle="Example" onClose={() => {}} />
    ));
    expect(document.body.textContent).toContain('Category name or idea');
    const edit = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Edit');
    await act(async () => edit?.click());
    expect(document.body.textContent).toContain('Edit your category');
    expect(document.body.textContent).toContain('Description optional');
    expect(document.body.querySelector<HTMLInputElement>('.ui-category-manager__editing input')?.value)
      .toBe('Model serving');

    const deleteButton = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Delete category');
    await act(async () => deleteButton?.click());
    expect(document.body.textContent).toContain('Category assignments will be removed, but bookmarks');

    await act(async () => root.unmount());
  });

  it('labels taxonomy-only creation when no bookmark context is supplied', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(
      <ManageCategoriesDialog onClose={() => {}} />
    ));
    expect(document.body.textContent).toContain('Taxonomy only:');
    expect(document.body.textContent).toContain('not attached to a bookmark');
    await act(async () => root.unmount());
  });

  it('turns one idea into editable parent and child names and allows empty descriptions', async () => {
    // A worker that was already alive before the response-contract bump can
    // return the accepted link without attachedCategoryId. The UI must verify
    // that link rather than report a false attachment failure.
    service.create.mockResolvedValueOnce({
      revision: 2,
      links: [{
        id: 'link-item-1-model-deployment', itemId: 'item-1',
        categoryId: 'manual_model-deployment', score: 1, isPrimary: true,
        source: 'manual', status: 'accepted', created_at: 2, updated_at: 2,
      }],
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(
      <ManageCategoriesDialog itemId="item-1" itemTitle="Example" onClose={() => {}} />
    ));

    const parentChild = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'New parent + child');
    await act(async () => parentChild?.click());

    expect(service.propose).toHaveBeenCalledWith(expect.objectContaining({
      intent: 'Model serving',
      mode: 'parent_child',
    }));
    expect(document.body.querySelector<HTMLInputElement>('input[placeholder="Broad parent name"]')?.value)
      .toBe('Machine learning operations');
    expect(document.body.querySelector<HTMLInputElement>('input[placeholder="Specific child name"]')?.value)
      .toBe('Model deployment');
    expect(document.body.textContent).toContain('Parent description optional');
    expect(document.body.textContent).toContain('Child description optional');

    const create = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Create parent + child');
    expect(create?.disabled).toBe(false);
    await act(async () => create?.click());
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Machine learning operations',
      description: '',
      kind: 'parent',
      child: expect.objectContaining({ name: 'Model deployment', description: '' }),
    }), { itemId: 'item-1', makePrimary: true });

    await act(async () => root.unmount());
  });
});
