import { classifySourceKind } from '../eligibility';
import { buildRedirectContext, probeRedirectFinalUrl } from '../fetchRedirect';
import { explainHardFetchFailure, isFetchBodyUsable, type FetchQualityContext } from '../fetchQuality';
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
  if (explainHardFetchFailure(result.markdown, ctx)) return false;
  return isFetchBodyUsable(result.markdown, undefined, ctx);
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
    const ctx: FetchQualityContext = { url: resolvedUrl };

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

    const resolvedInput = {
      ...input,
      url: resolvedUrl,
      hints: { ...input.hints, requestedUrl },
    };
    let last: FetchProviderResult = { ok: false, errorCode: 'provider_error' };
    const failures: FetchProviderResult[] = [];

    for (const provider of chainForUrl(resolvedUrl)) {
      const result = await provider.fetchUrl(resolvedInput);
      last = attachProbeRedirect(
        {
          ...result,
          fetchSourceId: result.fetchSourceId ?? provider.id,
        },
        requestedUrl,
        probe
      );
      if (resultUsable(result, ctx)) {
        return last;
      }
      if (!result.ok) failures.push(last);
    }

    const withDetail = failures.find((f) => f.error?.trim()) ?? last;
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
