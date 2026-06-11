import { needsLiveTabHref } from '../tabUrlCapture';
import { canonicalizeXStatusUrl, isRedditHost } from './urlPolicy';

const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'msclkid',
  'zanpid',
  '_ga',
  '_gl',
  'yclid',
  'dclid',
];

function normalizeBookmarkUrlForMatch(url: string): string {
  const raw = url.trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.replace(/^www\./, '').toLowerCase();
    if (u.pathname !== '/') {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    for (const param of TRACKING_PARAMS) {
      u.searchParams.delete(param);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

function redditPathKey(url: string): string | null {
  try {
    if (!isRedditHost(url)) return null;
    return new URL(url).pathname.replace(/\/+$/, '').toLowerCase() || '/';
  } catch {
    return null;
  }
}

function googleWorkspaceResourceKey(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'docs.google.com') {
      const doc = u.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
      if (doc) return `gdoc:${doc[1]}`;
      const sheet = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (sheet) return `gsheet:${sheet[1]}`;
      const slides = u.pathname.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
      if (slides) return `gslides:${slides[1]}`;
      return `gdocs-path:${u.pathname.replace(/\/+$/, '')}`;
    }

    if (host === 'drive.google.com') {
      const file = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (file) return `gdrive:${file[1]}`;
      const folder = u.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (folder) return `gfolder:${folder[1]}`;
      return `gdrive-path:${u.pathname.replace(/\/+$/, '')}`;
    }

    if (/^mail\.google\.com$/i.test(host) || /outlook\.(live|office)\.com$/i.test(host)) {
      return `mail:${normalizeBookmarkUrlForMatch(u.href)}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function sameAuthWorkspaceHost(tabUrl: string, bookmarkUrl: string): boolean {
  try {
    const tabHost = new URL(tabUrl).hostname.replace(/^www\./, '').toLowerCase();
    const bookmarkHost = new URL(bookmarkUrl).hostname.replace(/^www\./, '').toLowerCase();
    return tabHost === bookmarkHost;
  } catch {
    return false;
  }
}

function normalizePathForPrefix(pathname: string): string {
  const clean = pathname.replace(/\/+/g, '/').replace(/\/+$/, '');
  return clean || '/';
}

function pathSegments(pathname: string): string[] {
  return normalizePathForPrefix(pathname).split('/').filter(Boolean);
}

function extractTierBSessionPrefix(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const segments = pathSegments(url.pathname);

  if (host.endsWith('udemy.com')) {
    const idx = segments.indexOf('course');
    if (idx >= 0 && segments[idx + 1]) {
      return `/course/${segments[idx + 1].toLowerCase()}/`;
    }
    return null;
  }

  if (host.endsWith('coursera.org')) {
    const idx = segments.indexOf('learn');
    if (idx >= 0 && segments[idx + 1]) {
      return `/learn/${segments[idx + 1].toLowerCase()}/`;
    }
    return null;
  }

  if (host.endsWith('linkedin.com')) {
    if (segments[0] === 'learning' && segments[1]) {
      return `/learning/${segments[1].toLowerCase()}/`;
    }
    return null;
  }

  if (host.endsWith('medium.com')) {
    if (segments[0]?.startsWith('@')) {
      return `/${segments[0].toLowerCase()}/`;
    }
    if (segments[0] === 'p' && segments[1]) {
      return `/p/${segments[1].toLowerCase()}`;
    }
    return null;
  }

  if (host.endsWith('substack.com')) {
    if (segments[0] === 'p' && segments[1]) {
      return `/p/${segments[1].toLowerCase()}`;
    }
    return null;
  }

  return null;
}

export function sharedAuthSessionPathPrefix(tabUrl: string, bookmarkUrl: string): boolean {
  try {
    const tab = new URL(tabUrl.trim());
    const bookmark = new URL(bookmarkUrl.trim());
    if (tab.protocol !== bookmark.protocol) return false;
    if (!sameAuthWorkspaceHost(tab.href, bookmark.href)) return false;
    const tabPrefix = extractTierBSessionPrefix(tab);
    const bookmarkPrefix = extractTierBSessionPrefix(bookmark);
    if (!tabPrefix || !bookmarkPrefix) return false;
    return tabPrefix === bookmarkPrefix;
  } catch {
    return false;
  }
}

function hostsLooselyMatchForTabSession(tabUrl: string, bookmarkUrl: string): boolean {
  try {
    const tab = new URL(tabUrl.trim());
    const bookmark = new URL(bookmarkUrl.trim());

    if (tab.protocol === 'file:' || bookmark.protocol === 'file:') {
      return (
        normalizeBookmarkUrlForMatch(tab.href) === normalizeBookmarkUrlForMatch(bookmark.href)
      );
    }

    const tabReddit = redditPathKey(tab.href);
    const bookmarkReddit = redditPathKey(bookmark.href);
    if (tabReddit && bookmarkReddit) return tabReddit === bookmarkReddit;

    const tabHost = tab.hostname.replace(/^www\./, '').toLowerCase();
    const bookmarkHost = bookmark.hostname.replace(/^www\./, '').toLowerCase();
    if (tabHost !== bookmarkHost) return false;

    if (needsLiveTabHref(bookmarkUrl) || needsLiveTabHref(tabUrl)) {
      const tabKey = googleWorkspaceResourceKey(tabUrl);
      const bookmarkKey = googleWorkspaceResourceKey(bookmarkUrl);
      if (tabKey && bookmarkKey) return tabKey === bookmarkKey;
      return (
        normalizeBookmarkUrlForMatch(tabUrl) === normalizeBookmarkUrlForMatch(bookmarkUrl)
      );
    }

    return false;
  } catch {
    return false;
  }
}

export function urlsMatchForTabSession(a: string, b: string): boolean {
  try {
    const left = normalizeBookmarkUrlForMatch(canonicalizeXStatusUrl(a.trim()));
    const right = normalizeBookmarkUrlForMatch(canonicalizeXStatusUrl(b.trim()));
    if (left === right) return true;
    return hostsLooselyMatchForTabSession(left, right);
  } catch {
    return false;
  }
}
