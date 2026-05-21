import { classifySourceKind } from '../eligibility';
import { stripProviderWrapper } from '../fetchQuality';
import type { FetchProvider } from './types';

const FX_API = 'https://api.fxtwitter.com';

function parseStatusUrl(url: string): { user: string; statusId: string } | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const statusIdx = parts.findIndex((p) => p === 'status');
    if (statusIdx < 0 || !parts[statusIdx + 1]) return null;
    return {
      user: parts[statusIdx - 1] || 'i',
      statusId: parts[statusIdx + 1],
    };
  } catch {
    return null;
  }
}

/** Public syndication API for X/Twitter status URLs (no cookies). */
export const syndicationProvider: FetchProvider = {
  id: 'syndication',
  async fetchUrl({ url, signal }) {
    if (classifySourceKind(url) !== 'x') {
      return { ok: false, errorCode: 'excluded' };
    }

    const ids = parseStatusUrl(url);
    if (!ids) return { ok: false, errorCode: 'parse_empty' };

    try {
      const res = await fetch(`${FX_API}/${ids.user}/status/${ids.statusId}`, {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return { ok: false, errorCode: 'provider_error' };

      const payload = (await res.json()) as {
        tweet?: {
          text?: string;
          author?: { screen_name?: string };
          quote?: { text?: string; author?: { screen_name?: string } };
          media?: { photos?: unknown[] };
        };
      };

      const tweet = payload.tweet;
      if (!tweet?.text?.trim()) return { ok: false, errorCode: 'parse_empty' };

      const author = tweet.author?.screen_name || ids.user;
      const lines = [`# @${author}`, '', tweet.text.trim()];
      if (tweet.quote?.text?.trim()) {
        lines.push(
          '',
          `> Quote from @${tweet.quote.author?.screen_name || 'unknown'}:`,
          `> ${tweet.quote.text.trim()}`
        );
      }
      if (Array.isArray(tweet.media?.photos) && tweet.media.photos.length) {
        lines.push('', `(${tweet.media.photos.length} photo(s) attached)`);
      }

      const markdown = stripProviderWrapper(lines.join('\n'));
      return {
        ok: true,
        markdown,
        title: `@${author}: ${tweet.text.trim().slice(0, 80)}`,
        rawBytesApprox: new TextEncoder().encode(markdown).length,
        fetchSourceId: 'syndication',
      };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return { ok: false, errorCode: 'timeout' };
      }
      return { ok: false, errorCode: 'network' };
    }
  },
};
