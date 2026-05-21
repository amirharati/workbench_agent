import type { EnrichmentErrorCode } from '../types';
import { classifySourceKind } from '../eligibility';
import { cleanXMarkdown, detectFetchFailure, stripProviderWrapper } from '../fetchQuality';
import type { FetchProvider } from './types';

const JINA_BASE = 'https://r.jina.ai/';

export const jinaProvider: FetchProvider = {
  id: 'jina',
  async fetchUrl({ url, signal }) {
    const target = `${JINA_BASE}${url}`;
    try {
      const res = await fetch(target, {
        method: 'GET',
        headers: { Accept: 'text/markdown, text/plain, */*' },
        signal,
      });

      if (res.status === 429) {
        return { ok: false, errorCode: 'rate_limited' };
      }
      if (!res.ok) {
        return { ok: false, errorCode: 'provider_error' };
      }

      let text = stripProviderWrapper(await res.text());
      if (classifySourceKind(url) === 'x') {
        text = cleanXMarkdown(text);
      }
      const title = extractTitleFromMarkdown(text);
      return {
        ok: true,
        markdown: text,
        title,
        rawBytesApprox: new TextEncoder().encode(text).length,
        fetchSourceId: 'jina',
      };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return { ok: false, errorCode: 'timeout' };
      }
      const msg = String(e);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        return { ok: false, errorCode: 'network' };
      }
      return { ok: false, errorCode: 'network' };
    }
  },
};

function extractTitleFromMarkdown(md: string): string | undefined {
  const line = md.split('\n').find((l) => /^#\s+/.test(l.trim()));
  if (!line) return undefined;
  return line.replace(/^#\s+/, '').trim().slice(0, 300) || undefined;
}

/** @deprecated use detectFetchFailure from fetchQuality */
export function detectAuthOrEmpty(markdown: string): EnrichmentErrorCode | undefined {
  return detectFetchFailure(markdown);
}
