// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GeneratedLinkCover, LinkVisual } from './LinkVisual';

describe('LinkVisual', () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('builds a deterministic title cover when no usable preview exists', () => {
    const markup = renderToStaticMarkup(
      <GeneratedLinkCover
        url="https://example.com/articles/useful"
        title="A useful saved article"
      />
    );

    expect(markup).toContain('ui-generated-link-cover');
    expect(markup).toContain('A useful saved article');
    expect(markup).toContain('example.com');
  });

  it('never promotes a favicon into the thumbnail role', async () => {
    const fetchImage = vi.fn();
    vi.stubGlobal('fetch', fetchImage);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <LinkVisual
          url="https://example.com/article"
          favicon="https://example.com/favicon.ico"
          variant="thumbnail"
        />
      );
    });

    expect(fetchImage).not.toHaveBeenCalled();
    expect(host.querySelector('.ui-link-visual--empty')).not.toBeNull();
    expect(host.querySelector('img')).toBeNull();
    await act(async () => root.unmount());
  });

  it('rejects a tiny preview image instead of scaling it up', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      blob: async () => new Blob(['tiny'], { type: 'image/png' }),
    }));
    const NativeURL = URL;
    vi.stubGlobal('URL', class extends NativeURL {
      static createObjectURL() { return 'blob:tiny-preview'; }
    });
    vi.stubGlobal('Image', class {
      naturalWidth = 16;
      naturalHeight = 16;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<LinkVisual previewImage="https://example.com/tiny.png" variant="thumbnail" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.querySelector('.ui-link-visual--empty')).not.toBeNull();
    expect(host.querySelector('img')).toBeNull();
    await act(async () => root.unmount());
  });

  it('renders a sufficiently large preview without cropping its role into an icon', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      blob: async () => new Blob(['preview'], { type: 'image/jpeg' }),
    }));
    const NativeURL = URL;
    vi.stubGlobal('URL', class extends NativeURL {
      static createObjectURL() { return 'blob:large-preview'; }
    });
    vi.stubGlobal('Image', class {
      naturalWidth = 1200;
      naturalHeight = 630;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<LinkVisual previewImage="https://example.com/large.jpg" variant="thumbnail" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:large-preview');
    expect(host.querySelector('.ui-link-visual--empty')).toBeNull();
    await act(async () => root.unmount());
  });
});
