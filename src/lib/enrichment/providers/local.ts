import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { classifySourceKind } from '../eligibility';
import { stripProviderWrapper } from '../fetchQuality';
import type { FetchProvider } from './types';
import { browserFetchHeaders, fetchXStatusFromTwitterCdn } from './xCdn';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

function htmlToMarkdown(html: string, url: string): { title?: string; markdown: string } | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.createElement('base');
  base.href = url;
  doc.head.appendChild(base);

  const article = new Readability(doc).parse();
  if (!article?.content?.trim()) return null;

  const markdown = turndown.turndown(article.content).trim();
  if (!markdown) return null;

  return {
    title: article.title?.trim() || undefined,
    markdown,
  };
}

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

      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        redirect: 'follow',
        signal,
        headers: browserFetchHeaders(),
      });

      if (!res.ok) {
        return { ok: false, errorCode: res.status === 429 ? 'rate_limited' : 'provider_error' };
      }

      const html = await res.text();
      const parsed = htmlToMarkdown(html, url);
      if (!parsed) {
        return { ok: false, errorCode: 'parse_empty' };
      }

      const markdown = stripProviderWrapper(parsed.markdown);
      return {
        ok: true,
        markdown,
        title: parsed.title,
        rawBytesApprox: new TextEncoder().encode(markdown).length,
        fetchSourceId: 'local',
      };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return { ok: false, errorCode: 'timeout' };
      }
      return { ok: false, errorCode: 'network' };
    }
  },
};
