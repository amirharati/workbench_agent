import { classifySourceKind } from '../eligibility';
import { detectFetchFailure, isFetchBodyUsable, titleFromBlockedPage } from '../fetchQuality';
import { jinaProvider } from './jina';
import { localProvider } from './local';
import { syndicationProvider } from './syndication';
import type { FetchProvider, FetchProviderInput, FetchProviderResult } from './types';

const ARTICLE_CHAIN = [localProvider, jinaProvider] as const;
const VIDEO_CHAIN = [jinaProvider] as const;
const X_CHAIN = [localProvider, syndicationProvider] as const;

function resultUsable(result: FetchProviderResult): boolean {
  if (!result.ok || !result.markdown?.trim()) return false;
  if (titleFromBlockedPage(result.title)) return false;
  if (detectFetchFailure(result.markdown)) return false;
  return isFetchBodyUsable(result.markdown);
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
 * X: local (Twitter CDN) → syndication
 */
export const hybridProvider: FetchProvider = {
  id: 'hybrid',
  async fetchUrl(input: FetchProviderInput) {
    let last: FetchProviderResult = { ok: false, errorCode: 'provider_error' };

    for (const provider of chainForUrl(input.url)) {
      const result = await provider.fetchUrl(input);
      last = {
        ...result,
        fetchSourceId: result.fetchSourceId ?? provider.id,
      };
      if (resultUsable(result)) {
        return {
          ...result,
          fetchSourceId: result.fetchSourceId ?? provider.id,
        };
      }
    }

    return last;
  },
};
