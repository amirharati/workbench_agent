import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

/** Readability + Turndown on HTML string (post-JS-rendered or raw fetch). */
export function htmlToMarkdown(html, url) {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
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
