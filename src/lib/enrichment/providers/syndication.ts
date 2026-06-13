import { classifySourceKind } from '../eligibility';
import { stripProviderWrapper } from '../fetchQuality';
import { isShortLinkHost, resolveFetchUrl, tcoUnresolvedError } from '../urlPolicy';
import type { FetchProvider } from './types';
import { fetchXThreadFromFx, parseXStatusUser } from './xThread';

/** Public syndication API for X/Twitter — FxTwitter /2/thread (author self-reply chain). */
export const syndicationProvider: FetchProvider = {
  id: 'syndication',
  async fetchUrl({ url, signal }) {
    if (classifySourceKind(url) !== 'x') {
      return { ok: false, errorCode: 'excluded' };
    }

    let targetUrl = url;
    let ids = parseXStatusUser(targetUrl);
    if (!ids && isShortLinkHost(url)) {
      const resolved = await resolveFetchUrl(url, signal);
      targetUrl = resolved.url;
      ids = parseXStatusUser(targetUrl);
    }

    if (!ids) {
      return {
        ok: false,
        errorCode: 'parse_empty',
        error: isShortLinkHost(url)
          ? tcoUnresolvedError(url)
          : 'URL is not a recognizable X/Twitter status link',
      };
    }

    const result = await fetchXThreadFromFx(ids.statusId, {
      signal,
      fallbackUser: ids.user,
      bookmarkUrl: url,
      linkFollow: true,
    });

    if (!result.ok) {
      return {
        ok: false,
        errorCode: result.errorCode,
        error: result.unavailable ? 'tweet_unavailable' : undefined,
      };
    }

    const markdown = stripProviderWrapper(result.markdown);
    return {
      ok: true,
      markdown,
      title: result.title,
      rawBytesApprox: result.rawBytesApprox,
      fetchSourceId: result.fetchSourceId,
    };
  },
};
