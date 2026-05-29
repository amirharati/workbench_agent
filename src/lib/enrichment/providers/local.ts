import { classifySourceKind } from '../eligibility';
import { describeHttpFetchError, httpStatusToErrorCode } from '../errorMessages';
import { htmlToMarkdown } from '../htmlExtract';
import { isShortLinkHost, tcoUnresolvedError } from '../urlPolicy';
import { stripProviderWrapper } from '../fetchQuality';
import type { FetchProvider } from './types';
import { browserFetchHeaders, fetchXStatusFromTwitterCdn } from './xCdn';

export const localProvider: FetchProvider = {
  id: 'local',
  async fetchUrl({ url, signal }) {
    try {
      if (classifySourceKind(url) === 'x') {
        const cdn = await fetchXStatusFromTwitterCdn(url, signal);
        if (cdn) {
          const markdown = stripProviderWrapper(cdn.markdown);
          return {
            ok: true,
            markdown,
            title: cdn.title,
            rawBytesApprox: new TextEncoder().encode(markdown).length,
            fetchSourceId: 'local',
          };
        }
      }

      if (isShortLinkHost(url)) {
        return {
          ok: false,
          errorCode: 'parse_empty',
          error: tcoUnresolvedError(url),
        };
      }

      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        redirect: 'follow',
        signal,
        headers: browserFetchHeaders(),
      });

      if (!res.ok) {
        const errorCode = httpStatusToErrorCode(res.status);
        return {
          ok: false,
          errorCode,
          error: describeHttpFetchError(res.status, 'local'),
        };
      }

      const html = await res.text();
      const parsed = htmlToMarkdown(html, url);
      if (!parsed) {
        return {
          ok: false,
          errorCode: 'parse_empty',
          error: 'Page HTML contained too little readable text to summarize',
        };
      }

      const markdown = stripProviderWrapper(parsed.markdown);
      return {
        ok: true,
        markdown,
        title: parsed.title,
        rawBytesApprox: new TextEncoder().encode(markdown).length,
        fetchSourceId: parsed.mode === 'page' ? 'local-page' : 'local',
      };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return { ok: false, errorCode: 'timeout', error: 'Local fetch timed out' };
      }
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, errorCode: 'network', error: msg || 'Network error during local fetch' };
    }
  },
};
