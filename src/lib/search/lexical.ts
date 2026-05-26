import type { SearchDocument } from './types';
import { tokenize } from './tokenize';

const FIELD_WEIGHTS = {
  title: 3,
  tags: 2,
  summary: 1.5,
  keyPoints: 1.5,
  notes: 1,
  url: 0.8,
  domain: 1,
} as const;

export interface LexicalScoreResult {
  score: number;
  matchedTerms: string[];
  phraseMatch: boolean;
}

function fieldTokens(text: string): string[] {
  return tokenize(text, { dropStopWords: false });
}

export function scoreLexical(
  query: string,
  doc: SearchDocument,
  queryTokens: string[]
): LexicalScoreResult {
  if (!queryTokens.length) return { score: 0, matchedTerms: [], phraseMatch: false };

  const qLower = query.toLowerCase();
  const titleLower = doc.title.toLowerCase();
  const phraseMatch = titleLower.includes(qLower) || qLower.includes(titleLower);

  const fields: Array<{ weight: number; tokens: string[] }> = [
    { weight: FIELD_WEIGHTS.title, tokens: fieldTokens(doc.title) },
    { weight: FIELD_WEIGHTS.tags, tokens: doc.tags.flatMap((t) => fieldTokens(t)) },
    { weight: FIELD_WEIGHTS.summary, tokens: fieldTokens(doc.summary) },
    {
      weight: FIELD_WEIGHTS.keyPoints,
      tokens: doc.keyPoints.flatMap((p) => fieldTokens(p)),
    },
    { weight: FIELD_WEIGHTS.notes, tokens: fieldTokens(doc.notes) },
    { weight: FIELD_WEIGHTS.url, tokens: fieldTokens(doc.url) },
    { weight: FIELD_WEIGHTS.domain, tokens: fieldTokens(doc.domain) },
  ];

  const matched = new Set<string>();
  let weightedHits = 0;
  let maxPossible = 0;

  for (const token of queryTokens) {
    maxPossible += 1;
    let bestFieldWeight = 0;
    for (const field of fields) {
      const tokenSet = new Set(field.tokens);
      if (tokenSet.has(token)) {
        bestFieldWeight = Math.max(bestFieldWeight, field.weight);
      }
    }
    if (bestFieldWeight > 0) {
      matched.add(token);
      weightedHits += bestFieldWeight;
    }
  }

  const maxWeighted = queryTokens.length * FIELD_WEIGHTS.title;
  let score = maxWeighted > 0 ? weightedHits / maxWeighted : 0;
  if (phraseMatch) score = Math.min(1, score + 0.35);

  return {
    score: Math.min(1, score),
    matchedTerms: [...matched],
    phraseMatch,
  };
}

export function rankLexicalCandidates(
  query: string,
  documents: SearchDocument[],
  limit: number
): Array<{ doc: SearchDocument; score: number; matchedTerms: string[] }> {
  const queryTokens = tokenize(query);
  const scored = documents.map((doc) => {
    const r = scoreLexical(query, doc, queryTokens);
    return { doc, score: r.score, matchedTerms: r.matchedTerms };
  });
  scored.sort((a, b) => b.score - a.score || b.doc.updatedAt - a.doc.updatedAt);
  return scored.filter((s) => s.score > 0).slice(0, limit);
}
