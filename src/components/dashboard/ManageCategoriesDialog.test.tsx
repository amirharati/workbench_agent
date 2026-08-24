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
  proposeDescription: vi.fn(),
  queueProposal: vi.fn(),
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
  proposeCategoryDescription: service.proposeDescription,
  queueNovelTopicProposalForReclassify: service.queueProposal,
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
    service.proposeDescription.mockReset().mockResolvedValue({
      description: 'Updated description for the edited category name.',
      generated: true,
    });
    service.queueProposal.mockReset().mockResolvedValue({ queuedCount: 2, revision: 3 });
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
    expect(name?.value).toBe('Model serving');
    expect(document.body.textContent).toContain('Selected parentTechnology');
    expect(document.body.querySelector<HTMLSelectElement>('select')).toBeNull();
    expect(document.body.textContent).toContain('classifier suggested this concept');
    expect(document.body.textContent).not.toContain('Create new');

    const browseAll = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Browse all parents instead'));
    await act(async () => browseAll?.click());
    expect(document.body.querySelector<HTMLSelectElement>('select[aria-label="Browse all parents"]')?.value)
      .toBe('technology');

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(name, 'Machine learning');
      name?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.body.textContent).toContain('Machine learningTechnology');
    expect(document.querySelector('.ui-category-manager__category-parent')?.textContent)
      .toBe('Technology');
    const add = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Use this');
    await act(async () => add?.click());
    expect(service.manage).toHaveBeenCalledWith('item-1', 'ml', 'add');

    await act(async () => root.unmount());
  });

  it('runs semantic matching for a short broad idea such as AI', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(
      <ManageCategoriesDialog itemId="item-1" itemTitle="Example" onClose={() => {}} />
    ));

    const name = document.body.querySelector<HTMLInputElement>('input[placeholder^="For example:"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(name, 'AI');
      name?.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    });

    expect(service.findSimilar).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'AI' }),
      expect.any(Array)
    );
    expect(document.body.textContent).toContain('Best existing matches');

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

  it('shows durable unmatched-topic proposals without treating them as categories', async () => {
    service.getSnapshot.mockResolvedValue({
      categories: [parent, existing],
      links: [],
      novelTopicProposals: [{
        key: '::habit tracking',
        proposal: {
          name: 'Habit tracking',
          description: 'Tools and practices for monitoring personal habits.',
          canonicalTags: ['habits', 'routines'],
        },
        itemCount: 2,
        pendingReclassifyCount: 0,
        sampleItems: [
          { itemId: 'habit-1', title: 'Q4 habit tracker' },
          { itemId: 'habit-2', title: 'Weekly routines' },
        ],
        latestAt: 20,
      }],
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<ManageCategoriesDialog onClose={() => {}} />));

    expect(document.body.textContent).toContain('Unmatched topic suggestions');
    expect(document.body.textContent).toContain('Habit tracking');
    expect(document.body.textContent).toContain('2 supporting bookmarks');
    expect(document.body.textContent).toContain('not active categories');

    const review = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Review suggestion');
    await act(async () => review?.click());
    expect(document.body.querySelector<HTMLInputElement>('input[placeholder^="For example:"]')?.value)
      .toBe('Habit tracking');

    const reclassify = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Reclassify 2');
    await act(async () => reclassify?.click());
    expect(service.queueProposal).toHaveBeenCalledWith('::habit tracking');

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
    const structure = document.body.querySelector('.ui-category-manager__structure-grid');
    expect(structure?.querySelectorAll('.ui-category-manager__structure-column')).toHaveLength(2);
    expect(structure?.querySelectorAll('.ui-category-manager__match-scroll')).toHaveLength(2);

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

  it('shows similar parents beside a new parent name and can reuse one without browsing', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(
      <ManageCategoriesDialog itemId="item-1" itemTitle="Example" onClose={() => {}} />
    ));

    const parentChild = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'New parent + child');
    await act(async () => parentChild?.click());

    const parentName = document.body.querySelector<HTMLInputElement>('input[placeholder="Broad parent name"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(parentName, 'Technology');
      parentName?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(document.body.textContent).toContain('Existing matches for this parent');
    const parentMatches = document.body.querySelector<HTMLElement>(
      '.ui-category-manager__structure-column[aria-label="Parent category proposal"] .ui-category-manager__match-scroll'
    );
    expect(parentMatches?.textContent).toContain('Technology');
    expect(parentMatches?.textContent).not.toContain('Machine learning');
    expect(parentMatches?.textContent).not.toContain('Child');
    parentMatches!.scrollTop = 37;
    const reuse = [...parentMatches!.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Use parent');
    await act(async () => reuse?.click());

    const structure = document.body.querySelector('.ui-category-manager__structure-grid');
    expect(structure?.querySelectorAll('.ui-category-manager__structure-column')).toHaveLength(2);
    expect(document.body.textContent).toContain('Selected existing parentTechnology');
    expect(document.body.textContent).not.toContain('Find a parent');
    expect(document.body.querySelector<HTMLInputElement>('input[placeholder="Specific child name"]')?.value)
      .toBe('Model deployment');
    expect(document.body.querySelector(
      '.ui-category-manager__structure-column[aria-label="Parent category proposal"] .ui-category-manager__match-scroll'
    )).toBe(parentMatches);
    expect(parentMatches?.scrollTop).toBe(37);
    expect(document.body.querySelector<HTMLSelectElement>('select')).toBeNull();
    expect(service.proposeDescription).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Model deployment',
      kind: 'leaf',
      parent: expect.objectContaining({ name: 'Technology' }),
    }));
    expect(document.body.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder="What narrower topic belongs here?"]'
    )?.value).toBe('Updated description for the edited category name.');

    const create = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Create and add child');
    expect(create?.disabled).toBe(false);
    await act(async () => create?.click());
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Model deployment',
      kind: 'leaf',
      parentId: 'technology',
    }), { itemId: 'item-1', makePrimary: true });

    await act(async () => root.unmount());
  });

  it('keeps parent search parent-only and can reuse a child name under the selected parent', async () => {
    const finance = {
      id: 'finance', name: 'Finance', kind: 'parent' as const, status: 'approved' as const,
      source: 'seed' as const, assignable: false, created_at: 1, updated_at: 1,
    };
    const traders = {
      id: 'technology-traders', name: 'Traders', kind: 'leaf' as const,
      status: 'approved' as const, source: 'seed' as const, assignable: true,
      parentId: 'technology', parentName: 'Technology',
      description: 'Trading tools and communities.', created_at: 1, updated_at: 1,
    };
    const investing = {
      id: 'investing', name: 'Investing', kind: 'parent' as const, status: 'approved' as const,
      source: 'seed' as const, assignable: false, created_at: 1, updated_at: 1,
    };
    const otherTraders = {
      ...traders,
      id: 'investing-traders',
      parentId: 'investing',
      parentName: 'Investing',
    };
    service.getSnapshot.mockResolvedValue({
      categories: [parent, finance, investing, existing, traders, otherTraders],
      links: [],
      signal: {
        itemId: 'item-1', textHash: '', embeddingModel: 'model', embedding: [], derivedTags: [],
        signalStatus: 'ok', lastProcessedAt: 1,
        llmReview: {
          novelTopicSuggestion: {
            name: 'Model serving', description: 'Operating deployed models.',
            parentId: 'technology', canonicalTags: [],
          },
        },
      },
    });
    service.proposeDescription.mockImplementation(async (input: {
      name: string;
      parent?: { name?: string };
    }) => ({
      description: `${input.name} within ${input.parent?.name ?? 'the selected parent'}.`,
      generated: true,
    }));
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(
      <ManageCategoriesDialog itemId="item-1" itemTitle="Example" onClose={() => {}} />
    ));

    const parentSearch = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="Search by name or meaning, e.g. AI"]'
    );
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(parentSearch, 'Finance');
      parentSearch?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const parentResults = document.body.querySelector<HTMLElement>(
      '.ui-category-manager__parent-finder .ui-category-manager__parent-results'
    );
    expect(parentResults?.textContent).toContain('Best matching parents');
    expect(parentResults?.textContent).not.toContain('Technology › Traders');
    expect(parentResults?.textContent).not.toContain('Reuse child name');
    const useFinance = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Use parent');
    await act(async () => useFinance?.click());

    const childName = document.body.querySelector<HTMLInputElement>('input[placeholder="Child category name"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(childName, 'Traders');
      childName?.dispatchEvent(new Event('input', { bubbles: true }));
      childName?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      await Promise.resolve();
    });

    const childResults = document.body.querySelector<HTMLElement>(
      '.ui-category-manager__field-matches .ui-category-manager__parent-result'
    )?.closest('.ui-category-manager__field-matches');
    expect(childResults?.textContent).toContain('Traders');
    expect(childResults?.textContent).not.toContain('Technology › Traders');
    expect([...childResults!.querySelectorAll('strong')]
      .filter((label) => label.textContent === 'Traders')).toHaveLength(1);
    expect(childResults?.textContent).toContain('Use child');
    expect(childResults?.textContent).not.toContain('Use as parent');
    expect(service.proposeDescription).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Traders',
      kind: 'leaf',
      parent: expect.objectContaining({ name: 'Finance' }),
    }));
    expect(document.body.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder="What belongs in this child category?"]'
    )?.value).toBe('Traders within Finance.');

    const useChild = [...childResults!.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Use child');
    await act(async () => useChild?.click());
    expect(document.body.textContent).toContain('Selected parentFinance');
    expect(childName?.value).toBe('Traders');
    expect(document.body.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder="What belongs in this child category?"]'
    )?.value).toBe('Traders within Finance.');

    const create = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Create and add child');
    expect(create?.disabled).toBe(false);

    await act(async () => root.unmount());
  });
});
