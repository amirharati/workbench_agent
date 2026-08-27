import { useEffect, useMemo, useState } from 'react';

interface LoadedVisual {
  src: string;
  width: number | null;
  height: number | null;
}

const visualCache = new Map<string, Promise<LoadedVisual | null>>();
const MAX_IMAGE_BYTES = 1_000_000;
const MIN_PREVIEW_WIDTH = 240;
const MIN_PREVIEW_HEIGHT = 120;

function validHttpUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function faviconFor(url?: string): string | null {
  const page = validHttpUrl(url);
  if (!page) return null;
  const parsed = new URL(page);
  return `${parsed.origin}/favicon.ico`;
}

function siteLabel(url?: string, title?: string): string {
  try {
    return new URL(url || '').hostname.replace(/^www\./, '') || title?.trim() || 'Link';
  } catch {
    return title?.trim() || 'Link';
  }
}

function hue(value: string): number {
  let hash = 0;
  for (const character of value) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}

async function readDimensions(src: string): Promise<{ width: number; height: number } | null> {
  if (typeof Image === 'undefined') return null;
  return await new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function loadImage(url: string): Promise<LoadedVisual | null> {
  if (url.startsWith('data:image/')) {
    return readDimensions(url).then((dimensions) => ({
      src: url,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    }));
  }
  const existing = visualCache.get(url);
  if (existing) return existing;
  const task = fetch(url, { credentials: 'omit', cache: 'force-cache' })
    .then(async (response) => {
      const type = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!response.ok || !type.startsWith('image/')) return null;
      const blob = await response.blob();
      if (!blob.size || blob.size > MAX_IMAGE_BYTES) return null;
      const src = URL.createObjectURL(blob);
      const dimensions = await readDimensions(src);
      return {
        src,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
      };
    })
    .catch(() => null);
  visualCache.set(url, task);
  return task;
}

function suitablePreview(visual: LoadedVisual): boolean {
  return visual.width !== null
    && visual.height !== null
    && visual.width >= MIN_PREVIEW_WIDTH
    && visual.height >= MIN_PREVIEW_HEIGHT;
}

export function LinkVisual({
  url,
  title,
  favicon,
  previewImage,
  variant = 'icon',
}: {
  url?: string;
  title?: string;
  favicon?: string;
  previewImage?: string;
  variant?: 'icon' | 'thumbnail';
}) {
  const label = useMemo(() => siteLabel(url, title), [title, url]);
  const candidates = useMemo(() => {
    const image = validHttpUrl(previewImage);
    const icon = favicon?.startsWith('data:image/') ? favicon : validHttpUrl(favicon);
    return [...new Set(variant === 'thumbnail' ? [image] : [icon, faviconFor(url)])].filter((value): value is string => Boolean(value));
  }, [favicon, previewImage, url, variant]);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    void (async () => {
      for (const candidate of candidates) {
        const loaded = await loadImage(candidate);
        if (loaded && (variant !== 'thumbnail' || suitablePreview(loaded))) {
          if (!cancelled) setSrc(loaded.src);
          return;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [candidates, variant]);

  if (src) {
    return <img src={src} alt="" loading="lazy" decoding="async" className={variant === 'thumbnail' ? 'ui-link-visual ui-link-visual--thumbnail' : 'ui-link-visual'} />;
  }
  if (variant === 'thumbnail') {
    return <span className="ui-link-visual ui-link-visual--thumbnail ui-link-visual--empty" aria-hidden="true" />;
  }
  return <span className="ui-link-visual ui-link-visual--fallback" style={{ background: `hsl(${hue(label)} 48% 38%)` }} aria-hidden="true">{label.slice(0, 1).toUpperCase()}</span>;
}

export function GeneratedLinkCover({
  url,
  title,
}: {
  url?: string;
  title?: string;
}) {
  const label = siteLabel(url, url ? undefined : 'Note');
  const coverTitle = title?.trim() || label;
  const baseHue = hue(label || coverTitle);
  return (
    <span
      className="ui-generated-link-cover"
      style={{
        background: `linear-gradient(145deg, hsl(${baseHue} 46% 31%), hsl(${(baseHue + 34) % 360} 38% 19%))`,
      }}
      aria-hidden="true"
    >
      <span className="ui-generated-link-cover__mark">{label.slice(0, 1).toUpperCase()}</span>
      <span className="ui-generated-link-cover__copy">
        <strong>{coverTitle}</strong>
        <small>{label}</small>
      </span>
    </span>
  );
}
