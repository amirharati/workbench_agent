import { useEffect, useMemo, useState } from 'react';

const visualCache = new Map<string, Promise<string | null>>();
const MAX_IMAGE_BYTES = 1_000_000;

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

function loadImage(url: string): Promise<string | null> {
  if (url.startsWith('data:image/')) return Promise.resolve(url);
  const existing = visualCache.get(url);
  if (existing) return existing;
  const task = fetch(url, { credentials: 'omit', cache: 'force-cache' })
    .then(async (response) => {
      const type = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!response.ok || !type.startsWith('image/')) return null;
      const blob = await response.blob();
      if (!blob.size || blob.size > MAX_IMAGE_BYTES) return null;
      return URL.createObjectURL(blob);
    })
    .catch(() => null);
  visualCache.set(url, task);
  return task;
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
    return [...new Set(variant === 'thumbnail' ? [image, icon, faviconFor(url)] : [icon, faviconFor(url)])].filter((value): value is string => Boolean(value));
  }, [favicon, previewImage, url, variant]);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    void (async () => {
      for (const candidate of candidates) {
        const loaded = await loadImage(candidate);
        if (loaded) {
          if (!cancelled) setSrc(loaded);
          return;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [candidates]);

  if (src) {
    return <img src={src} alt="" loading="lazy" decoding="async" className={variant === 'thumbnail' ? 'ui-link-visual ui-link-visual--thumbnail' : 'ui-link-visual'} />;
  }
  return <span className={variant === 'thumbnail' ? 'ui-link-visual ui-link-visual--thumbnail ui-link-visual--fallback' : 'ui-link-visual ui-link-visual--fallback'} style={{ background: `hsl(${hue(label)} 48% 38%)` }} aria-hidden="true">{label.slice(0, 1).toUpperCase()}</span>;
}
