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

  it('allows a status badge in the leading slot to take its full width', () => {
    const markup = renderToStaticMarkup(
      <ContentBrowser
        title="Library"
        entries={[{ id: 'link-a', title: 'A useful article', icon: <span>Enriched</span> }]}
        selectedId={null}
        onSelect={vi.fn()}
        mode="list"
        onModeChange={vi.fn()}
        emptyMessage="Nothing here"
      />
    );

    expect(markup).toContain('data-content-leading="true"');
    expect(markup).toContain('ui-content-browser__leading');
    expect(markup).toContain('Enriched');
    expect(markup).toContain('A useful article');
  });

  it('mounts a bounded first batch for large libraries', () => {
    const markup = renderToStaticMarkup(
      <ContentBrowser
        title="Library"
        entries={Array.from({ length: 100 }, (_, index) => ({
          id: `item-${index}`,
          title: `Library item ${index}`,
          icon: 'L',
        }))}
        selectedId={null}
        onSelect={vi.fn()}
        mode="list"
        onModeChange={vi.fn()}
        emptyMessage="Nothing here"
      />
    );

    expect(markup).toContain('Library item 59');
    expect(markup).not.toContain('Library item 60');
    expect(markup).toContain('Loading more… 60 of 100');
  });
});
