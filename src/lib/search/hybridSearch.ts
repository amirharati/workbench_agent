import { extractDomainHint, normalizeQuery, tokenize } from './tokenize';
import { applySearchFilters } from './filters';
import { rankLexicalCandidates, scoreLexical } from './lexical';
import {
  computeBoostsAndPenalties,
  computeFinalScore,
  expandCategoryCandidates,
  mergeWeights,
  rankEmbeddingCandidates,
  resolveMatchedCategories,
  scoreCategoryAffinity,
  scoreEmbedding,
} from './ranking';
import type {
  HybridSearchOptions,
  HybridSearchResult,
  SearchIndex,
  SearchResult,
  ScoreBreakdown,
} from './types';

export function hybridSearch(
  index: SearchIndex,
  options: HybridSearchOptions
): HybridSearchResult {
  const query = normalizeQuery(options.query);
  const limit = options.limit ?? 20;
  const candidateLimit = options.candidateLimit ?? 200;
  const categoryTopK = options.categoryTopK ?? 5;
  const weights = mergeWeights(options.weights);
  const mode = options.mode ?? 'hybrid';
  const domainHint = extractDomainHint(query);

  const scopedDocs = applySearchFilters(index.documents, options.filters);
  const scopedIndex: SearchIndex = { ...index, documents: scopedDocs };

  const matchedCategories = resolveMatchedCategories(
    query,
    mode === 'hybrid' ? options.queryEmbedding : undefined,
    scopedIndex,
    categoryTopK
  );

  const candidateMap = new Map<
    string,
    { doc: (typeof scopedDocs)[0]; sources: Set<'lexical' | 'embedding' | 'category'> }
  >();

  const lexicalHits = rankLexicalCandidates(query, scopedDocs, candidateLimit);
  for (const hit of lexicalHits) {
    const entry = candidateMap.get(hit.doc.itemId) ?? {
      doc: hit.doc,
      sources: new Set<'lexical' | 'embedding' | 'category'>(),
    };
    entry.sources.add('lexical');
    candidateMap.set(hit.doc.itemId, entry);
  }

  if (mode === 'hybrid' && options.queryEmbedding?.length) {
    const embHits = rankEmbeddingCandidates(
      options.queryEmbedding,
      scopedDocs,
      candidateLimit
    );
    for (const hit of embHits) {
      const entry = candidateMap.get(hit.doc.itemId) ?? {
        doc: hit.doc,
        sources: new Set<'lexical' | 'embedding' | 'category'>(),
      };
      entry.sources.add('embedding');
      candidateMap.set(hit.doc.itemId, entry);
    }
  }

  if (matchedCategories.ids.size) {
    const catHits = expandCategoryCandidates(
      scopedIndex,
      matchedCategories.ids,
      candidateLimit
    );
    for (const hit of catHits) {
      const entry = candidateMap.get(hit.doc.itemId) ?? {
        doc: hit.doc,
        sources: new Set<'lexical' | 'embedding' | 'category'>(),
      };
      entry.sources.add('category');
      candidateMap.set(hit.doc.itemId, entry);
    }
  }

  const queryTokens = tokenize(query);
  const results: SearchResult[] = [];

  for (const { doc, sources } of candidateMap.values()) {
    const lex = scoreLexical(query, doc, queryTokens);
    const embedding =
      mode === 'hybrid' && options.queryEmbedding?.length
        ? scoreEmbedding(options.queryEmbedding, doc)
        : 0;
    const cat = scoreCategoryAffinity(doc, matchedCategories.ids, index.categoryById);
    const boosts = computeBoostsAndPenalties(
      doc,
      domainHint,
      weights,
      scopedIndex
    );
    const { baseScore, finalScore } = computeFinalScore(
      lex.score,
      embedding,
      cat.score,
      boosts,
      weights,
      lex.phraseMatch
    );

    const breakdown: ScoreBreakdown = {
      lexical: lex.score,
      embedding,
      category: cat.score,
      ...boosts,
      baseScore,
      finalScore,
      matchedTerms: lex.matchedTerms,
      matchedCategories: cat.matched.map(
        (id) => index.categoryById.get(id)?.name ?? id
      ),
      candidateSources: [...sources],
    };

    results.push({
      itemId: doc.itemId,
      title: doc.title,
      url: doc.url,
      domain: doc.domain,
      primaryCategoryId: doc.primaryCategoryId,
      primaryCategoryName: doc.primaryCategoryId
        ? index.categoryById.get(doc.primaryCategoryId)?.name
        : undefined,
      breakdown,
    });
  }

  results.sort(
    (a, b) =>
      b.breakdown.finalScore - a.breakdown.finalScore ||
      b.breakdown.lexical - a.breakdown.lexical
  );

  return {
    query,
    mode,
    results: results.slice(0, limit),
    totalCandidates: results.length,
    matchedCategoryIds: [...matchedCategories.ids],
    embeddingPathUsed: mode === 'hybrid' && Boolean(options.queryEmbedding?.length),
  };
}
