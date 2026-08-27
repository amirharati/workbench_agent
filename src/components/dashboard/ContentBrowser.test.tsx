// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentBrowser } from './ContentBrowser';
import { ListPipelineBadge } from './PipelineDisplayBlocks';

describe('ContentBrowser', () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    document.body.innerHTML = '';
  });

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

  it('renders a social preview only for the gallery surface', () => {
    const markup = renderToStaticMarkup(
      <ContentBrowser title="Library" entries={[{ id: 'link-a', title: 'Article', icon: 'A', preview: <img alt="" src="card" /> }]} selectedId={null} onSelect={vi.fn()} mode="gallery" onModeChange={vi.fn()} emptyMessage="Nothing here" />
    );
    expect(markup).toContain('ui-content-browser__preview');
    expect(markup).toContain('data-has-preview="true"');
  });

  it('builds a consistent gallery visual for saved links and notes', () => {
    const markup = renderToStaticMarkup(
      <ContentBrowser
        title="Library"
        entries={[
          {
            id: 'link-a',
            title: 'Visual article',
            icon: 'A',
            subtitle: 'https://example.com/article',
            dragItem: {
              id: 'link-a',
              title: 'Visual article',
              url: 'https://example.com/article',
              favicon: 'https://example.com/favicon.ico',
              metadata: { previewImage: 'https://example.com/card.jpg' },
            },
          },
          { id: 'note-a', title: 'Planning note', icon: 'N', subtitle: 'Working copy' },
        ]}
        selectedId={null}
        onSelect={vi.fn()}
        mode="gallery"
        onModeChange={vi.fn()}
        emptyMessage="Nothing here"
      />
    );

    const host = document.createElement('div');
    host.innerHTML = markup;
    expect(host.querySelectorAll('[data-has-preview="true"]')).toHaveLength(2);
    expect(host.querySelector('.ui-link-visual--thumbnail')).not.toBeNull();
    expect(host.querySelector('.ui-content-browser__preview-note')).not.toBeNull();
    expect(host.querySelectorAll('.ui-generated-link-cover')).toHaveLength(2);
  });

  it('uses the complete row as the shared drag surface', () => {
    const markup = renderToStaticMarkup(
      <ContentBrowser
        title="Library"
        entries={[{
          id: 'link-a',
          title: 'A useful article',
          icon: 'L',
          dragSource: { kind: 'reference', label: 'Library' },
        }]}
        selectedId={null}
        onSelect={vi.fn()}
        mode="list"
        onModeChange={vi.fn()}
        emptyMessage="Nothing here"
      />
    );

    expect(markup).toContain('data-item-result-row="true"');
    expect(markup).toContain('data-item-drag-source="true"');
    expect(markup).not.toContain('data-content-drag-handle');
    expect(markup).toContain('draggable="true"');
    expect(markup).toContain('ui-content-browser__drag-grip');
    expect(markup).toContain('Drag to a workspace or collection');
  });

  it('selects a draggable entry on click without changing its drag source', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onSelect = vi.fn();

    await act(async () => {
      root.render(
        <ContentBrowser
          title="Library"
          entries={[{
            id: 'link-a',
            title: 'A useful article',
            icon: 'L',
            dragSource: { kind: 'reference', label: 'Library' },
          }]}
          selectedId={null}
          onSelect={onSelect}
          mode="list"
          onModeChange={vi.fn()}
          emptyMessage="Nothing here"
        />
      );
    });

    const entry = host.querySelector<HTMLElement>('[data-content-entry]');
    expect(entry).not.toBeNull();
    await act(async () => {
      entry?.click();
    });

    expect(onSelect).toHaveBeenCalledWith('link-a');
    await act(async () => root.unmount());
  });

  it('keeps gallery actions in one control row separate from metadata and long copy', () => {
    const markup = renderToStaticMarkup(
      <ContentBrowser
        title="Library"
        entries={[{
          id: 'link-a',
          title: 'A useful article with a longer title',
          icon: 'L',
          subtitle: <span>https://example.com/a/very/long/path/that/must/not/paint/under/the/card/actions</span>,
          meta: 'Jul 22',
          actions: <button type="button">Open</button>,
        }]}
        selectedId={null}
        onSelect={vi.fn()}
        mode="gallery"
        onModeChange={vi.fn()}
        emptyMessage="Nothing here"
      />
    );

    const host = document.createElement('div');
    host.innerHTML = markup;
    expect(host.querySelector('.ui-content-browser__footer')?.textContent).toBe('Jul 22');
    expect(host.querySelector('.ui-content-browser__controls')?.textContent).toBe('Open');
    expect(host.querySelector('.ui-content-browser__subtitle')?.getAttribute('data-url')).toBe('true');
    expect(host.querySelector('.ui-content-browser__subtitle')?.getAttribute('title')).toBe(
      'https://example.com/a/very/long/path/that/must/not/paint/under/the/card/actions'
    );
  });

  it('keeps list URLs in the compact text column after the leading icon', () => {
    const markup = renderToStaticMarkup(
      <ContentBrowser
        title="Library"
        entries={[{
          id: 'link-a',
          title: 'A useful article',
          icon: (
            <span className="ui-content-browser__item-kind">
              <span>Site icon</span>
              <ListPipelineBadge badge={{ kind: 'ready', variant: 'success', label: 'Enriched' }} />
            </span>
          ),
          subtitle: <span>https://example.com/a/very/long/path/that/should/truncate/to/the/available/list/width</span>,
          actions: <button type="button">Open</button>,
        }]}
        selectedId={null}
        onSelect={vi.fn()}
        mode="list"
        onModeChange={vi.fn()}
        emptyMessage="Nothing here"
      />
    );

    const host = document.createElement('div');
    host.innerHTML = markup;
    const entry = host.querySelector('[data-content-entry]');
    const leading = entry?.querySelector('[data-content-leading]');
    const copy = entry?.querySelector('.ui-content-browser__copy');
    const controls = entry?.querySelector('.ui-content-browser__controls');
    const subtitle = entry?.querySelector('.ui-content-browser__subtitle');
    expect(leading?.nextElementSibling).toBe(copy);
    expect(copy?.nextElementSibling).toBe(controls);
    expect(leading?.querySelector('.ui-list-pipeline-badge')?.getAttribute('title')).toBe('Enriched');
    expect(leading?.querySelector('.ui-status-badge__label')?.textContent).toBe('Enriched');
    expect(subtitle?.getAttribute('data-url')).toBe('true');
    expect(subtitle?.getAttribute('title')).toContain('/available/list/width');
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

  it('quick-filters on hidden item information and reports the scoped count', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <ContentBrowser
          title="Collection"
          entries={[
            { id: 'alpha', title: 'Architecture article', icon: 'L', searchText: 'classified systems Research project' },
            { id: 'beta', title: 'Cooking article', icon: 'L', searchText: 'recipes Personal project' },
          ]}
          selectedId={null}
          onSelect={vi.fn()}
          mode="list"
          onModeChange={vi.fn()}
          emptyMessage="Nothing here"
        />
      );
    });

    const input = host.querySelector<HTMLInputElement>('[aria-label="Filter Collection"]');
    expect(input).not.toBeNull();
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, 'classified research');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(host.textContent).toContain('1 of 2');
    expect(host.textContent).toContain('Architecture article');
    expect(host.textContent).not.toContain('Cooking article');
    expect(host.querySelector('[aria-label="Clear Collection filter"]')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('selects all filtered items without selecting hidden results', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const entries = [
      { id: 'alpha', title: 'Architecture article', icon: 'L', dragSource: { kind: 'reference' as const, label: 'Library' } },
      { id: 'beta', title: 'Cooking article', icon: 'L', dragSource: { kind: 'reference' as const, label: 'Library' } },
    ];

    await act(async () => {
      root.render(
        <ContentBrowser
          title="Library"
          entries={entries}
          selectedId={null}
          onSelect={vi.fn()}
          mode="list"
          onModeChange={vi.fn()}
          emptyMessage="Nothing here"
        />
      );
    });

    expect(host.textContent).not.toContain('Done');
    expect(host.textContent).toContain('0 selected');
    expect(host.querySelector<HTMLInputElement>('[aria-label="Select Architecture article"]')).not.toBeNull();
    const organize = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Organize selected'));
    expect(organize?.disabled).toBe(true);
    const input = host.querySelector<HTMLInputElement>('[aria-label="Filter Library"]');
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, 'cooking');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const selectFiltered = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Select all filtered'));
    await act(async () => selectFiltered?.click());

    expect(host.textContent).toContain('1 selected');
    expect(host.querySelector<HTMLInputElement>('[aria-label="Select Cooking article"]')?.checked).toBe(true);
    expect(host.querySelector('[aria-label="Select Architecture article"]')).toBeNull();
    expect(organize?.disabled).toBe(false);

    const clear = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Clear');
    await act(async () => clear?.click());
    expect(host.textContent).toContain('0 selected');
    expect(host.querySelector<HTMLInputElement>('[aria-label="Select Cooking article"]')?.checked).toBe(false);
    expect(organize?.disabled).toBe(true);
    await act(async () => root.unmount());
  });
});
