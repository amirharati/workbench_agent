// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '../../lib/db';
import { InspectorTab } from './InspectorTab';

vi.mock('../../hooks/useInspectorItemData', () => ({
  useInspectorItemData: () => ({
    context: {
      summary: 'A long summary that belongs in the bounded content area.',
      keyPoints: ['First point', 'Second point'],
      references: [],
      enrichment: { aiTags: ['machine learning', 'deployment'] },
      item: { tags: ['Deployment', 'manual tag'] },
      acceptedLinks: [{ categoryId: 'topic', name: 'Model deployment' }],
      suggestedLinks: [],
    },
    similar: [],
    contextLoading: false,
    similarLoading: false,
    similarError: null,
    reload: vi.fn(),
  }),
}));

vi.mock('../../lib/pipeline', () => ({ resolvePipelineBadge: () => null }));
vi.mock('../../lib/pipeline/itemPipelineContext', () => ({ formatPipelineStageHint: () => undefined }));
vi.mock('../../lib/enrichment/failureLabels', () => ({ resolveEnrichmentFailureLabel: () => null }));
vi.mock('./PipelineDisplayBlocks', () => ({
  ItemPipelineBadge: () => null,
  EnrichmentContent: ({ summary, tags = [] }: { summary?: string; tags?: string[] }) => (
    <div data-testid="summary-copy">
      {summary}
      <span data-testid="summary-tags">{tags.join('|')}</span>
    </div>
  ),
}));
vi.mock('./SearchDiscoveryBlocks', () => ({ ItemSimilarSectionView: () => <div>Similar</div> }));
vi.mock('./ItemDigestQuickActions', () => ({ ItemDigestQuickActions: () => <div>Actions</div> }));
vi.mock('../shared/CategoryReviewRows', () => ({
  CategoryChip: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{label}</button>
  ),
  SuggestedCategoryRow: () => null,
}));
vi.mock('./BookmarkUrlLink', () => ({ ExtensionPageUrlLink: () => <span>URL</span> }));
vi.mock('./LinkVisual', () => ({ LinkVisual: () => <span>Icon</span> }));
vi.mock('./ManageCategoriesDialog', () => ({ ManageCategoriesDialog: () => null }));

const item = {
  id: 'item-1',
  url: 'https://example.com',
  title: 'Example item',
  created_at: 1,
  updated_at: 1,
} as Item;

describe('InspectorTab information order', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('places categories before a bounded, independently scrollable summary area', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<InspectorTab activeItem={item} />));

    const categories = host.querySelector('.ui-inspector__categories');
    const summary = host.querySelector('.ui-inspector__summary');
    const content = host.querySelector('.ui-inspector__summary-content');
    expect(categories).not.toBeNull();
    expect(summary).not.toBeNull();
    expect(categories!.compareDocumentPosition(summary!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(content?.classList.contains('scrollbar')).toBe(true);
    expect(content?.getAttribute('aria-label')).toBe('AI summary content');
    expect(content?.getAttribute('tabindex')).toBe('0');
    expect(host.querySelector('[data-testid="summary-copy"]')?.textContent)
      .toContain('A long summary that belongs in the bounded content area.');
    expect(host.querySelector('[data-testid="summary-tags"]')?.textContent)
      .toBe('machine learning|deployment|Deployment|manual tag');

    await act(async () => root.unmount());
  });

  it('keeps the full Inspector summary open even when the item tab also shows enrichment', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(
      <InspectorTab activeItem={item} enrichmentPrimaryInItemTab />
    ));

    expect(host.querySelector('.ui-inspector__summary-content')).not.toBeNull();
    expect(host.querySelector('[data-testid="summary-copy"]')?.textContent)
      .toContain('A long summary that belongs in the bounded content area.');
    expect(host.textContent).not.toContain('Full summary and key points are in the item tab');

    await act(async () => root.unmount());
  });

  it('opens the accepted category result view from its Inspector chip', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onBrowseCategory = vi.fn();
    await act(async () => root.render(
      <InspectorTab activeItem={item} onBrowseCategory={onBrowseCategory} />
    ));

    const category = [...host.querySelectorAll('button')]
      .find((button) => button.textContent === 'Model deployment');
    expect(category).toBeDefined();
    await act(async () => category!.click());
    expect(onBrowseCategory).toHaveBeenCalledWith('topic', 'Model deployment');

    await act(async () => root.unmount());
  });
});
