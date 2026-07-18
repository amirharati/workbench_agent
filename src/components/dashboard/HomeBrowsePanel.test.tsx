// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomeBrowsePanel } from './HomeBrowsePanel';

describe('HomeBrowsePanel', () => {
  it('consolidates library browsing and keeps utilities secondary', () => {
    const markup = renderToStaticMarkup(
      <HomeBrowsePanel
        projects={[{
          project: { id: 'project_default', name: 'Inbox', isDefault: true, created_at: 1, updated_at: 1 },
          collectionCount: 1,
          itemCount: 3,
        }]}
        recentItems={[]}
        favoriteItems={[]}
        totalItems={3}
        onOpenProject={vi.fn()}
        onSelectItem={vi.fn()}
        onItemContextMenu={vi.fn()}
        onOpenTrash={vi.fn()}
        onOpenPipeline={vi.fn()}
      />
    );

    expect(markup).toContain('Browse library');
    expect(markup).toContain('Projects');
    expect(markup).toContain('Recent');
    expect(markup).toContain('Favorites');
    expect(markup).toContain('Inbox');
    expect(markup).toContain('Processing');
    expect(markup).toContain('Trash');
    expect(markup).not.toContain('Processing Digest');
    expect(markup).not.toContain('Library Overview');
  });
});
