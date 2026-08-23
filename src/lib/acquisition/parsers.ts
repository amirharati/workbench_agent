import Defuddle from 'defuddle';
import TurndownService from 'turndown';
import { htmlToArticleMarkdown } from '../enrichment/htmlExtract';
import { cleanLiveDocumentTitle, shouldUpgradeBookmarkTitle } from '../enrichment/eligibility';
import type {
  AcquisitionCandidateResult,
  BrowserEvidenceV2,
  PageFrameEvidenceV2,
} from './types';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

export function resolvedFrameTitle(frame: PageFrameEvidenceV2): string | undefined {
  let title = cleanLiveDocumentTitle(frame.title || '') || undefined;
  for (const next of [
    frame.metadata.headingTitle,
    frame.metadata.structuredTitle,
    frame.metadata.title,
  ]) {
    if (shouldUpgradeBookmarkTitle(title, next, frame.url)) title = next?.trim();
  }
  return title;
}

function documentFromHtml(html: string, url: string): Document {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.createElement('base');
  base.href = url;
  doc.head.appendChild(base);
  return doc;
}

function candidate(
  id: string,
  startedAt: number,
  values: Partial<AcquisitionCandidateResult>
): AcquisitionCandidateResult {
  const markdown = values.markdown?.trim();
  return {
    id,
    provider: values.provider ?? id,
    external: values.external ?? false,
    applicable: values.applicable ?? true,
    ok: values.ok ?? Boolean(markdown),
    ...values,
    markdown: markdown || undefined,
    durationMs: Math.max(0, Date.now() - startedAt),
    rawBytesApprox: markdown ? new TextEncoder().encode(markdown).length : undefined,
  };
}

function metadataHeader(frame: PageFrameEvidenceV2): string[] {
  const title = resolvedFrameTitle(frame);
  const lines: string[] = [];
  if (title) lines.push(`# ${title}`);
  if (frame.metadata.author) lines.push(`Author: ${frame.metadata.author}`);
  if (frame.metadata.published) lines.push(`Published: ${frame.metadata.published}`);
  if (frame.metadata.description) lines.push('', frame.metadata.description);
  return lines;
}

function parseDefuddle(frame: PageFrameEvidenceV2): AcquisitionCandidateResult {
  const startedAt = Date.now();
  try {
    const doc = documentFromHtml(frame.html, frame.url);
    const parsed = new Defuddle(doc, {
      url: frame.url,
      markdown: true,
      separateMarkdown: true,
      useAsync: false,
      includeReplies: 'extractors',
    }).parse();
    let markdown = parsed.contentMarkdown?.trim() || parsed.content?.trim() || '';
    if (/^\s*</.test(markdown)) markdown = turndown.turndown(markdown).trim();
    if (parsed.title && markdown && !markdown.startsWith('# ')) {
      markdown = `# ${parsed.title.trim()}\n\n${markdown}`;
    }
    return candidate(frame.frameId === 0 ? 'defuddle' : `defuddle-frame-${frame.frameId}`, startedAt, {
      provider: 'authenticated-chrome+defuddle',
      markdown,
      title: parsed.title?.trim() || resolvedFrameTitle(frame),
      previewImage: parsed.image?.trim() || frame.metadata.previewImage,
      diagnostics: {
        frameId: frame.frameId,
        extractorType: parsed.extractorType,
        wordCount: parsed.wordCount,
      },
    });
  } catch (error) {
    return candidate(frame.frameId === 0 ? 'defuddle' : `defuddle-frame-${frame.frameId}`, startedAt, {
      provider: 'authenticated-chrome+defuddle',
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function parseReadability(frame: PageFrameEvidenceV2): AcquisitionCandidateResult {
  const startedAt = Date.now();
  try {
    const parsed = htmlToArticleMarkdown(frame.html, frame.url);
    return candidate(frame.frameId === 0 ? 'readability' : `readability-frame-${frame.frameId}`, startedAt, {
      provider: 'authenticated-chrome+readability',
      markdown: parsed?.markdown,
      title: parsed?.title || resolvedFrameTitle(frame),
      previewImage: parsed?.previewImage || frame.metadata.previewImage,
      error: parsed ? undefined : 'Readability found no article content',
    });
  } catch (error) {
    return candidate(frame.frameId === 0 ? 'readability' : `readability-frame-${frame.frameId}`, startedAt, {
      provider: 'authenticated-chrome+readability',
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function visibleCandidate(evidence: BrowserEvidenceV2): AcquisitionCandidateResult {
  const startedAt = Date.now();
  const main = evidence.frames.find((frame) => frame.frameId === 0) ?? evidence.frames[0];
  if (!main) return candidate('browser-visible', startedAt, { ok: false, error: 'No readable frames' });
  const parts = metadataHeader(main);
  for (const frame of evidence.frames) {
    const text = (frame.semanticText || frame.visibleText).trim();
    if (!text) continue;
    if (frame.frameId !== 0) parts.push('', `## Embedded frame`, '', text);
    else parts.push('', text);
  }
  return candidate('browser-visible', startedAt, {
    provider: 'authenticated-chrome',
    markdown: parts.join('\n').trim(),
    title: resolvedFrameTitle(main),
    previewImage: main.metadata.previewImage,
    finalUrl: evidence.finalUrl,
    diagnostics: { frameCount: evidence.frames.length, usedExistingTab: evidence.usedExistingTab },
  });
}

function transcriptCandidate(evidence: BrowserEvidenceV2): AcquisitionCandidateResult | null {
  const startedAt = Date.now();
  const frames = evidence.frames.filter((frame) => frame.transcript?.trim());
  if (!frames.length) return null;
  const main = evidence.frames.find((frame) => frame.frameId === 0) ?? frames[0];
  const header = metadataHeader(main);
  const transcript = frames.map((frame) => frame.transcript!.trim()).join('\n\n');
  return candidate('browser-transcript', startedAt, {
    provider: 'authenticated-chrome-transcript',
    markdown: [...header, '', '## Transcript', '', transcript].join('\n').trim(),
    title: resolvedFrameTitle(main),
    previewImage: main.metadata.previewImage,
    finalUrl: evidence.finalUrl,
    transcriptState: 'available',
  });
}

export function candidatesFromBrowserEvidence(
  evidence: BrowserEvidenceV2
): AcquisitionCandidateResult[] {
  const candidates: AcquisitionCandidateResult[] = [visibleCandidate(evidence)];
  const transcript = transcriptCandidate(evidence);
  if (transcript) candidates.push(transcript);
  for (const frame of evidence.frames) {
    if (!frame.html.trim()) continue;
    candidates.push(parseDefuddle(frame), parseReadability(frame));
  }
  return candidates;
}
