import { classifySourceKind } from '../eligibility';
import { describeHttpFetchError, httpStatusToErrorCode } from '../errorMessages';
import { buildRedirectContext } from '../fetchRedirect';
import { htmlToMarkdown } from '../htmlExtract';
import { isFileUrl, isShortLinkHost, tcoUnresolvedError } from '../urlPolicy';
import { rewriteDocumentFetchUrl, stripProviderWrapper } from '../fetchQuality';
import { fetchPdfThroughBrowserService } from '../tabSessionExtract';
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

export function looksLikeRemotePdf(url: string): boolean {
  return /\.pdf(?:$|[?#])/i.test(url) || rewriteDocumentFetchUrl(url) !== url;
}

function authenticatedPdfTargets(url: string): Array<{ url: string; sessionUrl: string }> {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const openReviewFileId = host === 'openreview.net'
      ? parsed.pathname.match(/^\/pdf\/([a-f0-9]{40})(?:\.pdf)?$/i)?.[1]
      : undefined;
    if (openReviewFileId) {
      return [
        { url, sessionUrl: `${parsed.origin}/` },
        {
          url: `https://api2.openreview.net/pdf/${openReviewFileId}.pdf`,
          sessionUrl: 'https://api2.openreview.net/notes?limit=1',
        },
        {
          // Some API deployments normalize the stored file id without the
          // suffix even though Note content stores `/pdf/<id>.pdf`.
          url: `https://api2.openreview.net/pdf/${openReviewFileId}`,
          sessionUrl: 'https://api2.openreview.net/notes?limit=1',
        },
      ];
    }
    const representation = rewriteDocumentFetchUrl(url);
    return [{
      url,
      sessionUrl: representation !== url ? representation : `${parsed.origin}/`,
    }];
  } catch {
    return [{ url, sessionUrl: url }];
  }
}

async function extractPdfResult(
  bytes: Uint8Array,
  finalUrl: string,
  signal: AbortSignal | undefined,
  fetchSourceId: 'local-pdf' | 'tab-session-pdf'
): Promise<FetchProviderResult> {
  try {
    const { extractPdfText } = await import('../pdfTextExtract');
    const extracted = await extractPdfText(bytes, { signal, url: finalUrl });
    if (!extracted.markdown.trim()) {
      return {
        ok: false,
        errorCode: 'parse_empty',
        error: 'PDF contains no extractable text (it may be scanned or image-only)',
        fetchSourceId,
      };
    }
    return {
      ok: true,
      markdown: extracted.markdown,
      title: extracted.title,
      rawBytesApprox: bytes.byteLength,
      fetchSourceId,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return {
      ok: false,
      errorCode: 'parse_empty',
      error: `PDF text extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      fetchSourceId,
    };
  }
}

export async function fetchAuthenticatedPdf(
  url: string,
  options?: {
    requestedUrl?: string;
    tabId?: number;
    windowId?: number;
    signal?: AbortSignal;
  }
): Promise<FetchProviderResult | null> {
  if (!looksLikeRemotePdf(url)) return null;
  let lastFailure: FetchProviderResult | null = null;
  for (const target of authenticatedPdfTargets(url)) {
    const browserPdf = await fetchPdfThroughBrowserService(target.url, {
      tabId: options?.tabId,
      windowId: options?.windowId,
      sessionUrl: target.sessionUrl,
      allowEphemeral: true,
      signal: options?.signal,
    });
    if (!browserPdf.ok || !browserPdf.bytes) {
      lastFailure = {
        ok: false,
        errorCode: browserPdf.errorCode,
        error: browserPdf.error,
        fetchSourceId: 'tab-session-pdf',
      };
      continue;
    }
    const extracted = await extractPdfResult(
      browserPdf.bytes,
      browserPdf.finalUrl?.trim() || target.url,
      options?.signal,
      'tab-session-pdf'
    );
    if (!extracted.ok) {
      lastFailure = extracted;
      continue;
    }
    // API/landing targets are intentional representations of the saved PDF,
    // not redirects that should change bookmark identity.
    return withRedirect(extracted, options?.requestedUrl ?? url, url);
  }
  return lastFailure;
}

export const localProvider: FetchProvider = {
  id: 'local',
  async fetchUrl({ url, signal, hints }) {
    const requestedUrl = hints?.requestedUrl ?? url;
    const tryAuthenticatedPdf = async (): Promise<FetchProviderResult | null> => {
      return fetchAuthenticatedPdf(url, {
        requestedUrl,
        tabId: hints?.browserTabId,
        windowId: hints?.browserWindowId,
        signal,
      });
    };
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
        if (!hints?.browserSessionAttempted) {
          const browserPdf = await tryAuthenticatedPdf();
          if (browserPdf) return browserPdf;
        }
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

      const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
      const bytes = new Uint8Array(await res.arrayBuffer());
      const isPdf =
        contentType.includes('application/pdf') ||
        new TextDecoder('latin1').decode(bytes.slice(0, 1024)).includes('%PDF-');
      if (isPdf) {
        return withRedirect(
          await extractPdfResult(bytes, finalUrl, signal, 'local-pdf'),
          requestedUrl,
          finalUrl
        );
      }

      const html = new TextDecoder().decode(bytes);
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
      if (!hints?.browserSessionAttempted) {
        const browserPdf = await tryAuthenticatedPdf();
        if (browserPdf) return browserPdf;
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
