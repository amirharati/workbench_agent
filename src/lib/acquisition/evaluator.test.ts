import { describe, expect, it } from 'vitest';
import { evaluateCandidates } from './evaluator';
import type { AcquisitionCandidateResult } from './types';

function candidate(
  id: string,
  markdown: string,
  durationMs = 5
): AcquisitionCandidateResult {
  return {
    id,
    provider: id,
    external: false,
    applicable: true,
    ok: true,
    markdown,
    durationMs,
  };
}

describe('acquisition candidate evaluation', () => {
  const article = `# Useful article\n\n${'Detailed content about a real subject with useful evidence and explanation. '.repeat(18)}`;

  it('rejects page shells and selects substantive local content deterministically', () => {
    const result = evaluateCandidates([
      candidate('browser-visible', 'Home Sign in Cookie settings'),
      candidate('readability', article),
      candidate('jina', `${article}\n\nAdditional details`),
    ], 'https://example.com/article');

    expect(result.winner?.id).toBe('readability');
    expect(result.candidates.find((row) => row.id === 'browser-visible')?.rejectionReason)
      .toBe('content_quality_gate');
  });

  it('uses stable duration and id tie breakers', () => {
    const first = candidate('custom-b', article, 10);
    const second = candidate('custom-a', article, 10);
    expect(evaluateCandidates([first, second], 'https://example.com').winner?.id).toBe('custom-a');
  });
});
