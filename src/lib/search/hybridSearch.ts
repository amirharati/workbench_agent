import { extractDomainHint, normalizeQuery, tokenize } from './tokenize';
import { applySearchFilters } from './filters';
import { scoreLexical } from './lexical';
import { matchesParsedSearchQuery, parseSearchQuery } from './queryLanguage';
import {
  computeBoostsAndPenalties,
  computeFinalScore,
  mergeWeights,
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
  const parsedQuery = parseSearchQuery(query);
  const scoringQuery = parsedQuery.semanticText;
  const limit = options.limit ?? 20;
  const categoryTopK = options.categoryTopK ?? 5;
  const weights = mergeWeights(options.weights);
  const mode = options.mode ?? 'hybrid';
  const domainHint = extractDomainHint(scoringQuery);

  const organizationScopedDocs = applySearchFilters(index.documents, options.filters);
  const organizationScopedIndex: SearchIndex = { ...index, documents: organizationScopedDocs };
  const scopedDocs = organizationScopedDocs.filter((doc) =>
    matchesParsedSearchQuery(doc, parsedQuery, organizationScopedIndex)
  );
  const scopedIndex: SearchIndex = { ...index, documents: scopedDocs };

  const matchedCategories = resolveMatchedCategories(
    scoringQuery,
    mode === 'hybrid' ? options.queryEmbedding : undefined,
    scopedIndex,
    categoryTopK,
    mode === 'hybrid' ? options.categoryEmbeddingScores : undefined
  );

  const candidateMap = new Map<
    string,
    { doc: (typeof scopedDocs)[0]; sources: Set<'lexical' | 'embedding' | 'category'> }
  >();

  // Every deterministic match is a candidate. Candidate caps must not make an
  // AND/phrase query appear to lose valid matches; semantic/category signals
  // rank this exact set and are presented separately beyond it.
  for (const doc of scopedDocs) {
    candidateMap.set(doc.itemId, {
      doc,
      sources: new Set<'lexical' | 'embedding' | 'category'>(),
    });
  }

  const queryTokens = tokenize(scoringQuery);
  const results: SearchResult[] = [];

  for (const { doc, sources } of candidateMap.values()) {
    const lex = scoreLexical(scoringQuery, doc, queryTokens);
    const embedding =
      mode === 'hybrid'
        ? options.embeddingScores?.[doc.itemId] ?? (
            options.queryEmbedding?.length ? scoreEmbedding(options.queryEmbedding, doc) : 0
          )
        : 0;
    const cat = scoreCategoryAffinity(
      doc,
      matchedCategories.ids,
      index.categoryById,
      matchedCategories.scores
    );
    if (lex.score > 0) sources.add('lexical');
    if (embedding > 0) sources.add('embedding');
    if (cat.matched.length > 0) sources.add('category');
    if (sources.size === 0) sources.add('lexical');
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
    totalCandidates: scopedDocs.length,
    matchedCategoryIds: [...matchedCategories.ids],
    categoryResults: matchedCategories.matches.map((match) => {
      const category = index.categoryById.get(match.categoryId);
      return {
        categoryId: match.categoryId,
        name: match.name,
        parentName: category?.parentName ?? undefined,
        description: category?.description,
        itemCount: index.itemsByCategory.get(match.categoryId)?.length ?? 0,
        score: match.score,
        nameScore: match.nameScore,
        semanticScore: match.semanticScore,
        sources: [
          ...(match.nameScore > 0 ? ['name' as const] : []),
          ...(match.semanticScore > 0 ? ['semantic' as const] : []),
        ],
      };
    }),
    embeddingPathUsed:
      mode === 'hybrid' && Boolean(
        options.queryEmbedding?.length &&
        (
          Object.keys(options.embeddingScores ?? {}).length > 0 ||
          Object.keys(options.categoryEmbeddingScores ?? {}).length > 0 ||
          scopedDocs.some((doc) => doc.embedding?.length)
        )
      ),
  };
}
