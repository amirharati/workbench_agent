import { classifySourceKind } from '../eligibility';
import { buildRedirectContext, probeRedirectFinalUrl } from '../fetchRedirect';
import {
  isFetchBodySubstantive,
  rewriteDocumentFetchUrl,
  type FetchQualityContext,
} from '../fetchQuality';
import { isFileUrl, isRedditHost, isShortLinkHost, resolveFetchUrl, tcoUnresolvedError } from '../urlPolicy';
import { jinaProvider } from './jina';
import { localProvider } from './local';
import { syndicationProvider } from './syndication';
import type { FetchProvider, FetchProviderInput, FetchProviderResult } from './types';

const ARTICLE_CHAIN = [localProvider, jinaProvider] as const;
const VIDEO_CHAIN = [jinaProvider] as const;
const X_CHAIN = [syndicationProvider, localProvider] as const;

function resultUsable(result: FetchProviderResult, ctx: FetchQualityContext): boolean {
  if (!result.ok || !result.markdown?.trim()) return false;
  return isFetchBodySubstantive(result.markdown, { ...ctx, title: result.title ?? ctx.title });
}

function chainForUrl(url: string): FetchProvider[] {
  const kind = classifySourceKind(url);
  if (kind === 'x') return [...X_CHAIN];
  if (kind === 'video') return [...VIDEO_CHAIN];
  return [...ARTICLE_CHAIN];
}

/** 
 * Articles: local → Jina
 * Video (YouTube): Jina
 * X: syndication (/2/thread) → local (Twitter CDN)
 */
function attachProbeRedirect(
  result: FetchProviderResult,
  requestedUrl: string,
  probe: { finalUrl: string; hops: string[] }
): FetchProviderResult {
  const redirectContext = buildRedirectContext(requestedUrl, probe.finalUrl, probe.hops);
  return {
    ...result,
    requestedUrl,
    finalUrl: result.finalUrl ?? probe.finalUrl,
    redirectContext: result.redirectContext ?? redirectContext,
  };
}

export const hybridProvider: FetchProvider = {
  id: 'hybrid',
  async fetchUrl(input: FetchProviderInput) {
    const requestedUrl = input.hints?.requestedUrl ?? input.url;
    const probe = await probeRedirectFinalUrl(requestedUrl, input.signal);
    const { url: resolvedUrl } = await resolveFetchUrl(input.url, input.signal);
    const contentUrl = rewriteDocumentFetchUrl(resolvedUrl);

    if (isShortLinkHost(input.url) && isShortLinkHost(resolvedUrl)) {
      return attachProbeRedirect(
        {
          ok: false,
          errorCode: 'provider_error',
          error: tcoUnresolvedError(input.url),
          fetchSourceId: 'hybrid',
        },
        requestedUrl,
        probe
      );
    }

    if (isFileUrl(resolvedUrl)) {
      return attachProbeRedirect(
        {
          ok: false,
          errorCode: 'auth_required',
          error: 'Local file — reading from your open browser tab',
          fetchSourceId: 'hybrid',
        },
        requestedUrl,
        probe
      );
    }

    if (isRedditHost(resolvedUrl)) {
      return attachProbeRedirect(
        {
          ok: false,
          errorCode: 'bot_blocked',
          error:
            'reddit.com blocked for headless fetch — opening in your browser tab',
          fetchSourceId: 'hybrid',
        },
        requestedUrl,
        probe
      );
    }

    let last: FetchProviderResult = { ok: false, errorCode: 'provider_error' };
    const failures: FetchProviderResult[] = [];
    const representations =
      contentUrl === resolvedUrl ? [resolvedUrl] : [resolvedUrl, contentUrl];

    for (const representationUrl of representations) {
      const representationInput = {
        ...input,
        url: representationUrl,
        hints: { ...input.hints, requestedUrl: representationUrl },
      };
      const ctx: FetchQualityContext = { url: representationUrl };

      for (const provider of chainForUrl(resolvedUrl)) {
        const result = await provider.fetchUrl(representationInput);
        last = attachProbeRedirect(
          {
            ...result,
            ...(representationUrl !== resolvedUrl
              ? {
                  // A scholarly landing page is an intentional representation,
                  // not a redirect away from the saved PDF bookmark.
                  finalUrl: probe.finalUrl,
                  redirectContext: buildRedirectContext(requestedUrl, probe.finalUrl, probe.hops),
                }
              : {}),
            fetchSourceId: result.fetchSourceId ?? provider.id,
          },
          requestedUrl,
          probe
        );
        if (resultUsable(result, ctx)) {
          return last;
        }
        if (result.ok) {
          last = {
            ...last,
            ok: false,
            errorCode: 'parse_empty',
            error:
              provider.id === 'jina'
                ? 'Reader returned no usable article text'
                : 'Page contained too little readable article text',
          };
        }
        failures.push(last);
      }
    }

    const withDetail = [...failures].reverse().find((f) => f.error?.trim()) ?? last;
    return attachProbeRedirect(
      {
        ...last,
        error: withDetail.error ?? last.error,
        errorCode: withDetail.errorCode ?? last.errorCode,
      },
      requestedUrl,
      probe
    );
  },
};
