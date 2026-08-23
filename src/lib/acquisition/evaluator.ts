import { isFetchBodySubstantive } from '../enrichment/fetchQuality';
import type { AcquisitionCandidateResult } from './types';

const SOURCE_BONUS: Record<string, number> = {
  'browser-transcript': 240,
  'x-syndication': 220,
  defuddle: 180,
  readability: 150,
  'browser-visible': 110,
  'direct-http': 80,
  jina: 60,
  pdfjs: 200,
};

function contentScore(markdown: string): number {
  const normalized = markdown.replace(/\s+/g, ' ').trim();
  const length = Math.min(normalized.length, 40_000);
  const headings = (markdown.match(/^#{1,4}\s+/gm) ?? []).length;
  const paragraphs = markdown.split(/\n\s*\n/).filter((part) => part.trim().length >= 40).length;
  return Math.round(Math.log2(Math.max(length, 1)) * 35 + Math.min(headings, 20) * 4 + Math.min(paragraphs, 40) * 3);
}

export function evaluateCandidates(
  candidates: AcquisitionCandidateResult[],
  url: string
): { candidates: AcquisitionCandidateResult[]; winner?: AcquisitionCandidateResult } {
  const evaluated = candidates.map((candidate) => {
    if (!candidate.applicable || !candidate.ok || !candidate.markdown?.trim()) {
      return {
        ...candidate,
        qualityScore: -1,
        rejectionReason: candidate.rejectionReason ?? candidate.error ?? 'no_content',
      };
    }
    const substantive = isFetchBodySubstantive(candidate.markdown, {
      url,
      title: candidate.title,
    });
    const score = contentScore(candidate.markdown) + (SOURCE_BONUS[candidate.id] ?? 0);
    return {
      ...candidate,
      qualityScore: substantive ? score : Math.min(score, 90),
      rejectionReason: substantive ? undefined : 'content_quality_gate',
    };
  });
  const winner = evaluated
    .filter((candidate) => candidate.ok && candidate.markdown?.trim() && candidate.qualityScore! > 90)
    .sort((left, right) =>
      (right.qualityScore ?? -1) - (left.qualityScore ?? -1) ||
      left.durationMs - right.durationMs ||
      left.id.localeCompare(right.id)
    )[0];
  return { candidates: evaluated, winner };
}
