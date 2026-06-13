import { substantiveBodyLength } from './extractFilters';

export type FxPhoto = { url?: string; type?: string };
export type FxVideo = {
  url?: string;
  thumbnail_url?: string;
  duration?: number;
  width?: number;
  height?: number;
  type?: string;
  format?: string;
};

export type FxMedia = {
  photos?: FxPhoto[];
  videos?: FxVideo[];
  all?: FxVideo[];
};

/** Max substantive chars (excluding media chrome) before we treat X post as topic-classifiable. */
export const MEDIA_PRIMARY_MAX_SUBSTANTIVE = 80;

const MEDIA_ANNOTATION_LINE =
  /^(?:Video|Thumbnail|Image):\s*https?:\/\//i;
const MEDIA_COUNT_LINE = /^(?:\d+\s+)?(?:video|photo|image)\(s\)\s+attached/i;
const NOT_TRANSCRIBED_LINE = /not transcribed/i;

export function formatDuration(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  if (minutes <= 0) return `${total}s`;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function videoEntries(media?: FxMedia | null): FxVideo[] {
  if (!media) return [];
  if (Array.isArray(media.videos) && media.videos.length) return media.videos;
  if (Array.isArray(media.all)) {
    return media.all.filter(
      (entry) =>
        entry?.type === 'video' ||
        (typeof entry?.format === 'string' && entry.format.includes('video'))
    );
  }
  return [];
}

export function photoEntries(media?: FxMedia | null): FxPhoto[] {
  if (!media) return [];
  if (Array.isArray(media.photos) && media.photos.length) return media.photos;
  return [];
}

export function formatVideoAnnotationLines(
  videos: FxVideo[],
  options?: { statusUrl?: string }
): string[] {
  if (!videos.length) return [];
  const lines: string[] = [];
  const statusUrl = options?.statusUrl?.trim();

  for (const video of videos) {
    const link = statusUrl || video.url?.trim();
    if (link) lines.push('', `Video: ${link}`);
    const thumb = video.thumbnail_url?.trim();
    if (thumb) lines.push(`Thumbnail: ${thumb}`);
    const duration = formatDuration(video.duration);
    const resolution =
      video.width && video.height ? `${video.width}×${video.height}` : '';
    const meta = [duration, resolution].filter(Boolean).join(', ');
    lines.push(`(${meta ? `${meta} — not transcribed` : 'not transcribed'})`);
  }

  if (videos.length > 1) {
    lines.push('', `(${videos.length} video(s) attached)`);
  }
  return lines;
}

export function xStatusVideoUrl(author: string | undefined, statusId: string | undefined): string | undefined {
  const user = author?.replace(/^@/, '').trim();
  const id = statusId?.trim();
  if (!user || !id) return undefined;
  return `https://x.com/${user}/status/${id}/video/1`;
}

/** Strip media annotation lines before measuring substantive text. */
export function stripXMediaAnnotationLines(body: string): string {
  const kept: string[] = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) {
      kept.push('');
      continue;
    }
    if (MEDIA_ANNOTATION_LINE.test(t)) continue;
    if (MEDIA_COUNT_LINE.test(t)) continue;
    if (NOT_TRANSCRIBED_LINE.test(t) && t.length < 80) continue;
    kept.push(line);
  }
  return kept.join('\n').trim();
}

export function substantiveXContentLength(body: string): number {
  return substantiveBodyLength(stripXMediaAnnotationLines(body));
}

export function hasEmbeddedVideoInXContent(body: string): boolean {
  const raw = body.trim();
  if (!raw) return false;
  return (
    /^\s*Video:\s*https?:\/\//im.test(raw) ||
    /\bvideo\(s\)\s+attached\b/i.test(raw)
  );
}

export function hasEmbeddedMediaInXContent(body: string): boolean {
  const raw = body.trim();
  if (!raw) return false;
  return (
    hasEmbeddedVideoInXContent(raw) ||
    /^\s*Image:\s*https?:\/\//im.test(raw) ||
    /\bphoto\(s\)\s+attached\b/i.test(raw) ||
    /\bimage\(s\)\s+attached\b/i.test(raw)
  );
}

/** Track B — thin body with embedded **video** only (images use vision + normal classify). */
export function isMediaPrimaryXContent(body: string): boolean {
  if (!hasEmbeddedVideoInXContent(body)) return false;
  return substantiveXContentLength(body) < MEDIA_PRIMARY_MAX_SUBSTANTIVE;
}

/** @deprecated alias */
export const isVideoPrimaryXContent = isMediaPrimaryXContent;

export function buildMediaPrimaryMechanicalSummary(
  body: string,
  title?: string,
  url?: string
): { summary: string; keyPoints: string[]; tags: string[] } {
  const author = body.match(/^#\s*@([A-Za-z0-9_]+)/m)?.[1];
  const duration = body.match(/\((\d+:\d{2}|\d+s)\s*[—-]/i)?.[1];
  const videoLine = body.match(/^Video:\s*(https?:\/\/\S+)/im)?.[1];

  const parts: string[] = [];
  if (author) parts.push(`@${author}`);
  parts.push(
    duration ? `posted an embedded video (${duration})` : 'posted an embedded video'
  );
  parts.push('not transcribed — review manually');

  const titleHint = title?.trim();
  if (titleHint && titleHint.length > 12) {
    parts.push(`Bookmark title: ${titleHint.slice(0, 200)}`);
  }

  const summary = parts.join('. ').replace(/\.\s*\./g, '.') + '.';
  const keyPoints = [
    'Embedded X video (not transcribed)',
    'Queued for manual review',
  ];
  if (videoLine) keyPoints.push(videoLine);
  else if (url?.trim()) keyPoints.push(url.trim());

  return {
    summary: summary.slice(0, 2000),
    keyPoints: keyPoints.slice(0, 6),
    tags: ['x', 'video', 'media-not-transcribed'],
  };
}
