import type { AICallAuditContext } from '../ai/callAudit';
import { runAICompletion } from '../ai/client';
import { loadAISettings } from '../ai/settings';
import type { AISettings, AIMessageContentPart } from '../ai/types';
import type { SourceKind } from './types';
import { prefilterExtractBody, substantiveBodyLength } from './extractFilters';

const MAX_VISION_IMAGES = 2;
const VISION_TEXT_SUBSTANTIVE_MAX = 80;

const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi;
const HTML_IMG_SRC_RE = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi;
const IMAGE_LINE_RE = /^\s*Image:\s*(https?:\/\/\S+)/gim;
const BARE_IMAGE_URL_RE =
  /https?:\/\/[^\s)\]>"']+\.(?:jpe?g|png|webp|gif)(?:\?[^\s)\]>"']*)?/gi;
const PBS_MEDIA_RE = /https?:\/\/pbs\.twimg\.com\/media\/[^\s)\]>]+/gi;

/** Paths/names that are icons/avatars — not worth a vision call. */
const SKIP_IMAGE_URL_RE: RegExp[] = [
  /favicon/i,
  /\/avatar[s]?\//i,
  /profile_images/i,
  /_normal\.(jpe?g|png|webp)/i,
  /\/pixel\.gif/i,
  /\b1x1\b/i,
  /spacer/i,
  /\.svg(\?|$)/i,
  /emoji/i,
  /sprite/i,
  /badge.*\.(png|gif)/i,
];

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif)(\?|$)/i;

function normalizeImageUrl(raw: string): string {
  return raw.replace(/[.,;:!?)]+$/, '').trim();
}

/** Whether a public image URL is worth sending to a vision model. */
export function isVisionCandidateImageUrl(url: string): boolean {
  const u = normalizeImageUrl(url);
  if (!u || !/^https:\/\//i.test(u)) return false;
  if (SKIP_IMAGE_URL_RE.some((re) => re.test(u))) return false;
  if (IMAGE_EXT_RE.test(u)) return true;
  if (/pbs\.twimg\.com\/media\//i.test(u)) return true;
  if (/i\.imgur\.com\//i.test(u)) return true;
  return false;
}

/** Extract image URLs from any fetched markdown/HTML snippet. */
export function extractVisionImageUrls(markdown: string, max = MAX_VISION_IMAGES): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (raw: string) => {
    const url = normalizeImageUrl(raw);
    if (!url || seen.has(url) || !isVisionCandidateImageUrl(url)) return;
    seen.add(url);
    out.push(url);
  };

  const patterns = [IMAGE_LINE_RE, MARKDOWN_IMAGE_RE, HTML_IMG_SRC_RE, PBS_MEDIA_RE, BARE_IMAGE_URL_RE];
  for (const re of patterns) {
    for (const match of markdown.matchAll(re)) {
      add(match[1] ?? match[0]);
      if (out.length >= max) return out;
    }
  }
  return out;
}

function lineIsImageReference(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^\s*Image:\s*https?:/i.test(t)) return true;
  if (/^!\[.*\]\(https?:/i.test(t)) return true;
  if (/^<img\b/i.test(t)) return true;
  if (/^https?:\/\/\S+\.(jpe?g|png|webp|gif)/i.test(t) && t.length < 220) return true;
  if (/photo\(s\)\s+attached|media item\(s\) attached/i.test(t)) return true;
  return false;
}

/** Substantive text after dropping image-only lines and chrome. */
export function substantiveLengthExcludingImageRefs(markdown: string): number {
  const filtered = prefilterExtractBody(markdown);
  const textOnly = filtered
    .split('\n')
    .filter((line) => !lineIsImageReference(line))
    .join('\n');
  return substantiveBodyLength(textOnly);
}

/** Thin page text + extractable images → run vision before summarize. */
export function needsImageVisionEnrichment(
  markdown: string,
  sourceKind?: SourceKind
): boolean {
  const imageUrls = extractVisionImageUrls(markdown);
  if (!imageUrls.length) return false;
  const threshold =
    sourceKind === 'article' || sourceKind === 'generic' ? 120 : VISION_TEXT_SUBSTANTIVE_MAX;
  return substantiveLengthExcludingImageRefs(markdown) < threshold;
}

const VISION_SYSTEM = `You describe images found on a bookmarked web page for search and summarization.
Be specific: visible text (OCR), chart labels, book titles, UI names, diagrams, subjects.
If unreadable, say what you can infer from layout only. Plain prose, no JSON.`;

export async function describeImages(
  imageUrls: string[],
  options: {
    settings?: AISettings;
    signal?: AbortSignal;
    audit?: AICallAuditContext;
    pageContext?: string;
  } = {}
): Promise<string | null> {
  if (!imageUrls.length) return null;

  const settings = options.settings ?? (await loadAISettings());
  if (settings.provider === 'chrome-native') return null;
  if (!settings.apiKey.trim()) return null;

  const parts: AIMessageContentPart[] = [
    {
      type: 'text',
      text: [
        options.pageContext?.trim()
          ? `Page context:\n${options.pageContext.trim().slice(0, 1500)}`
          : 'Describe the image(s) from this bookmarked page.',
        'Focus on content useful for a bookmark summary (text in image, product name, chart topic, etc.).',
      ].join('\n\n'),
    },
  ];

  for (const url of imageUrls.slice(0, MAX_VISION_IMAGES)) {
    parts.push({ type: 'image_url', image_url: { url } });
  }

  try {
    const response = await runAICompletion(settings, {
      taskType: 'vision',
      signal: options.signal,
      audit: options.audit,
      messages: [
        { role: 'system', content: VISION_SYSTEM },
        { role: 'user', content: parts },
      ],
    });
    return response.text?.trim() || null;
  } catch {
    return null;
  }
}

/** Append ## Image content from vision when body is thin but images exist. */
export async function enrichMarkdownWithVision(
  markdown: string,
  options: {
    sourceKind?: SourceKind;
    settings?: AISettings;
    signal?: AbortSignal;
    audit?: AICallAuditContext;
  } = {}
): Promise<string> {
  const base = markdown.trim();
  if (!base || !needsImageVisionEnrichment(base, options.sourceKind)) return markdown;
  if (/^##\s+Image content\b/im.test(base)) return markdown;

  const imageUrls = extractVisionImageUrls(base);
  const description = await describeImages(imageUrls, {
    settings: options.settings,
    signal: options.signal,
    audit: options.audit,
    pageContext: base,
  });
  if (!description?.trim()) return markdown;

  return `${base}\n\n---\n\n## Image content\n\n${description.trim()}`;
}

/** @deprecated Use extractVisionImageUrls */
export const extractXImageUrls = extractVisionImageUrls;

/** @deprecated Use needsImageVisionEnrichment */
export function needsXImageVision(markdown: string): boolean {
  return needsImageVisionEnrichment(markdown, 'x');
}

/** @deprecated Use enrichMarkdownWithVision */
export async function enrichXMarkdownWithVision(
  markdown: string,
  options: {
    settings?: AISettings;
    signal?: AbortSignal;
    audit?: AICallAuditContext;
  } = {}
): Promise<string> {
  return enrichMarkdownWithVision(markdown, { ...options, sourceKind: 'x' });
}

/** @deprecated Use describeImages */
export const describeXImages = describeImages;
