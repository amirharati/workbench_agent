import { classifySourceKind } from '../eligibility';
import { describeHttpFetchError, httpStatusToErrorCode } from '../errorMessages';
import { buildRedirectContext } from '../fetchRedirect';
import { htmlToMarkdown } from '../htmlExtract';
import { isFileUrl, isShortLinkHost, tcoUnresolvedError } from '../urlPolicy';
import { stripProviderWrapper } from '../fetchQuality';
import type { FetchProvider, FetchProviderResult } from './types';
import { browserFetchHeaders, fetchXStatusFromTwitterCdn } from './xCdn';

function withRedirect(
  result: FetchProviderResult,
  requestedUrl: string,
  finalUrl: string
): FetchProviderResult {
  return {
    ...result,
    requestedUrl,
    finalUrl,
    redirectContext: buildRedirectContext(requestedUrl, finalUrl),
  };
}

export const localProvider: FetchProvider = {
  id: 'local',
  async fetchUrl({ url, signal, hints }) {
    const requestedUrl = hints?.requestedUrl ?? url;
    try {
      if (classifySourceKind(url) === 'x') {
        const cdn = await fetchXStatusFromTwitterCdn(url, signal);
        if (cdn) {
          const markdown = stripProviderWrapper(cdn.markdown);
          return withRedirect(
            {
              ok: true,
              markdown,
              title: cdn.title,
              rawBytesApprox: new TextEncoder().encode(markdown).length,
              fetchSourceId: 'local',
            },
            requestedUrl,
            url
          );
        }
      }

      if (isShortLinkHost(url)) {
        return withRedirect(
          {
            ok: false,
            errorCode: 'parse_empty',
            error: tcoUnresolvedError(url),
          },
          requestedUrl,
          url
        );
      }

      if (isFileUrl(url)) {
        if (/\.pdf$/i.test(url)) {
          return withRedirect(
            {
              ok: false,
              errorCode: 'auth_required',
              error: 'Local PDF — open in Chrome tab for extraction',
            },
            requestedUrl,
            url
          );
        }
      }

      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        redirect: 'follow',
        signal,
        headers: browserFetchHeaders(),
      });
      const finalUrl = res.url?.trim() || url;

      if (!res.ok) {
        const errorCode = httpStatusToErrorCode(res.status);
        return withRedirect(
          {
            ok: false,
            errorCode,
            error: describeHttpFetchError(res.status, 'local'),
          },
          requestedUrl,
          finalUrl
        );
      }

      // PDFs (any host) can't be parsed as HTML here — let the chain fall to Jina's reader.
      const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
      if (contentType.includes('application/pdf')) {
        return withRedirect(
          {
            ok: false,
            errorCode: 'parse_empty',
            error: 'PDF document — extracting via reader',
          },
          requestedUrl,
          finalUrl
        );
      }

      const html = await res.text();
      if (html.slice(0, 1024).includes('%PDF-')) {
        return withRedirect(
          {
            ok: false,
            errorCode: 'parse_empty',
            error: 'PDF document — extracting via reader',
          },
          requestedUrl,
          finalUrl
        );
      }
      const parsed = htmlToMarkdown(html, url);
      if (!parsed) {
        return withRedirect(
          {
            ok: false,
            errorCode: 'parse_empty',
            error: 'Page HTML contained too little readable text to summarize',
          },
          requestedUrl,
          finalUrl
        );
      }

      const markdown = stripProviderWrapper(parsed.markdown);
      return withRedirect(
        {
          ok: true,
          markdown,
          title: parsed.title,
          previewImage: parsed.previewImage,
          rawBytesApprox: new TextEncoder().encode(markdown).length,
          fetchSourceId: parsed.mode === 'page' ? 'local-page' : 'local',
        },
        requestedUrl,
        finalUrl
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return withRedirect(
          { ok: false, errorCode: 'timeout', error: 'Local fetch timed out' },
          requestedUrl,
          url
        );
      }
      const msg = e instanceof Error ? e.message : String(e);
      return withRedirect(
        { ok: false, errorCode: 'network', error: msg || 'Network error during local fetch' },
        requestedUrl,
        url
      );
    }
  },
};
