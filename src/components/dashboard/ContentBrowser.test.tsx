import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ContentBrowser } from './ContentBrowser';

describe('ContentBrowser', () => {
  it('renders the same content as a selectable gallery', () => {
    const markup = renderToStaticMarkup(
      <ContentBrowser
        title="Project material"
        entries={[{ id: 'note-a', title: 'Draft note', icon: 'N', subtitle: 'Working copy' }]}
        selectedId="note-a"
        onSelect={vi.fn()}
        mode="gallery"
        onModeChange={vi.fn()}
        emptyMessage="Nothing here"
      />
    );

    expect(markup).toContain('data-content-view="gallery"');
    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain('Draft note');
    expect(markup).toContain('Working copy');
    expect(markup).toContain('aria-label="List view"');
  });
});
