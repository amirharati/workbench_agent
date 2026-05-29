import {
  isRedditHost,
  isXHost,
  normalizeHost,
} from './urlPolicy';

export type PlatformHint = {
  /** Stored on item.metadata.platform */
  platform: string;
  /** Merged onto item.tags when absent */
  tag: string;
};

const TAG_ALIASES: Record<string, readonly string[]> = {
  x: ['x', 'twitter'],
  twitter: ['x', 'twitter'],
  youtube: ['youtube'],
  reddit: ['reddit'],
  github: ['github'],
  medium: ['medium'],
  linkedin: ['linkedin'],
  substack: ['substack'],
  gmail: ['gmail'],
  'google-docs': ['google-docs', 'google docs', 'gdocs'],
  'google-drive': ['google-drive', 'google drive', 'gdrive'],
  notion: ['notion'],
  hackernews: ['hackernews', 'hacker news', 'hn'],
  vimeo: ['vimeo'],
  twitch: ['twitch'],
};

function hostIncludes(host: string, fragment: string): boolean {
  return host === fragment || host.endsWith(`.${fragment}`);
}

/** Known platform id + default tag from bookmark URL. */
export function platformHintFromUrl(url: string): PlatformHint | null {
  if (!url?.trim()) return null;
  const host = normalizeHost(url);
  if (!host) return null;

  if (isXHost(url)) return { platform: 'x', tag: 'x' };
  if (isRedditHost(url)) return { platform: 'reddit', tag: 'reddit' };
  if (hostIncludes(host, 'youtube.com') || host === 'youtu.be') {
    return { platform: 'youtube', tag: 'youtube' };
  }
  if (hostIncludes(host, 'vimeo.com')) return { platform: 'vimeo', tag: 'vimeo' };
  if (hostIncludes(host, 'twitch.tv')) return { platform: 'twitch', tag: 'twitch' };
  if (host === 'github.com' || host.endsWith('.github.io')) {
    return { platform: 'github', tag: 'github' };
  }
  if (hostIncludes(host, 'medium.com')) return { platform: 'medium', tag: 'medium' };
  if (hostIncludes(host, 'linkedin.com')) return { platform: 'linkedin', tag: 'linkedin' };
  if (hostIncludes(host, 'substack.com')) return { platform: 'substack', tag: 'substack' };
  if (host === 'mail.google.com') return { platform: 'gmail', tag: 'gmail' };
  if (host === 'docs.google.com') return { platform: 'google-docs', tag: 'google-docs' };
  if (host === 'drive.google.com') return { platform: 'google-drive', tag: 'google-drive' };
  if (host === 'notion.so' || host.endsWith('.notion.site')) {
    return { platform: 'notion', tag: 'notion' };
  }
  if (host === 'news.ycombinator.com') return { platform: 'hackernews', tag: 'hackernews' };

  return null;
}

export function hasPlatformTag(tags: readonly string[] | undefined, platformTag: string): boolean {
  const aliases = TAG_ALIASES[platformTag] ?? [platformTag];
  const seen = new Set((tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean));
  return aliases.some((alias) => seen.has(alias));
}

/** Append platform tag when URL host is known and tag not already present. */
export function mergePlatformTag(
  existingTags: readonly string[] | undefined,
  url: string,
  extraTags?: readonly string[]
): { tags: string[]; platform?: string; added: boolean } {
  const hint = platformHintFromUrl(url);
  if (!hint) {
    return { tags: [...(existingTags ?? [])], added: false };
  }

  const pool = [...(existingTags ?? []), ...(extraTags ?? [])];
  if (hasPlatformTag(pool, hint.tag)) {
    return { tags: [...(existingTags ?? [])], platform: hint.platform, added: false };
  }

  return {
    tags: [...(existingTags ?? []), hint.tag],
    platform: hint.platform,
    added: true,
  };
}

export function ensurePlatformTagOnExtract<T extends { tags?: string[] }>(
  extract: T | undefined,
  url: string
): T | undefined {
  const hint = platformHintFromUrl(url);
  if (!hint) return extract;
  if (hasPlatformTag(extract?.tags, hint.tag)) return extract;
  return {
    ...(extract ?? ({} as T)),
    tags: [...(extract?.tags ?? []), hint.tag],
  };
}
