// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidePanelDigestPanel } from './SidePanelDigestPanel';

vi.mock('../hooks/useItemPipelineContext', () => ({
  useItemPipelineContext: () => ({
    context: {
      item: {
        id: 'item-1',
        url: 'https://example.com',
        title: 'Example item',
        tags: ['manual tag'],
      },
      enrichment: {
        snippet: 'Fetched excerpt',
        aiTags: ['AI tag'],
      },
      summary: 'A complete summary that belongs in the bounded content area.',
      keyPoints: ['First point', 'Second point'],
      references: [],
      acceptedLinks: [],
      suggestedLinks: [],
      primaryCategoryName: null,
      signal: {
        llmReview: {
          novelTopicSuggestion: {
            name: 'Habit tracking',
            description: 'Tools and templates for monitoring personal habits.',
          },
        },
      },
      classifyState: 'pending_discover',
    },
    loading: false,
    reload: vi.fn(),
  }),
}));

vi.mock('../lib/pipeline', () => ({ resolvePipelineBadge: () => null }));
vi.mock('../lib/pipeline/itemPipelineContext', () => ({
  formatPipelineStageHint: () => undefined,
  hasPartialPipelineData: () => true,
}));
vi.mock('./dashboard/ItemDigestQuickActions', () => ({
  ItemDigestQuickActions: () => <div>Actions</div>,
}));
vi.mock('./dashboard/PipelineDisplayBlocks', () => ({
  ItemPipelineBadge: () => null,
  EnrichmentContent: ({ summary, tags = [] }: { summary?: string; tags?: string[] }) => (
    <div data-testid="digest-copy">
      {summary}
      <span data-testid="digest-tags">{tags.join('|')}</span>
    </div>
  ),
}));
vi.mock('./shared/CategoryReviewRows', () => ({
  CategoryChip: ({ label }: { label: string }) => <span>{label}</span>,
  SuggestedCategoryRow: () => null,
  UnmatchedTopicSuggestion: ({ name, onReview }: { name: string; onReview: () => void }) => (
    <div><span>{name}</span><button type="button" onClick={onReview}>Review categories</button></div>
  ),
}));

describe('SidePanelDigestPanel information layout', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('bounds the full digest and keeps categories after its content', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<SidePanelDigestPanel itemId="item-1" />));

    const expand = [...host.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Show full digest'));
    expect(expand).toBeDefined();
    await act(async () => expand!.click());

    const content = host.querySelector('.side-panel-digest-content');
    const categories = host.querySelector('.side-panel-digest-categories');
    expect(content).not.toBeNull();
    expect(categories).not.toBeNull();
    expect(content!.compareDocumentPosition(categories!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(content?.classList.contains('scrollbar')).toBe(true);
    expect(content?.getAttribute('aria-label')).toBe('AI digest content');
    expect(content?.getAttribute('tabindex')).toBe('0');
    expect(host.querySelector('[data-testid="digest-copy"]')?.textContent)
      .toContain('A complete summary that belongs in the bounded content area.');
    expect(host.querySelector('[data-testid="digest-tags"]')?.textContent)
      .toBe('AI tag|manual tag');
    expect(categories?.textContent).toContain('Habit tracking');
    expect(categories?.textContent).toContain('No existing category matched');

    await act(async () => root.unmount());
  });

  it('shows the unmatched topic and requests the dashboard category manager', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onManageCategories = vi.fn();
    await act(async () => root.render(
      <SidePanelDigestPanel itemId="item-1" onManageCategories={onManageCategories} />
    ));

    expect(host.textContent).toContain('Habit tracking');
    const review = [...host.querySelectorAll('button')]
      .find((button) => button.textContent === 'Review categories');
    expect(review).toBeDefined();
    await act(async () => review!.click());
    expect(onManageCategories).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });
});
