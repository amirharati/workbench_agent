import { isGeneralLeafId } from './taxonomyCatalog';

export const CATEGORY_METRIC_PROFILE_CANDIDATE_LIMIT = 16;
export const CATEGORY_METRIC_NEIGHBOR_LIMIT = 48;
export const CATEGORY_METRIC_EXAMPLES_PER_CATEGORY = 32;
export const CATEGORY_METRIC_RESULT_LIMIT = 3;

export interface CategoryMetricProfileEvidence {
  categoryId: string;
  profileScore: number;
  definitionScore: number;
  aggregateScore: number;
  memberCount: number;
  acceptedNeighborScores?: number[];
}

export interface CategoryMetricCandidate extends CategoryMetricProfileEvidence {
  exampleScore: number;
  exampleCount: number;
  score: number;
  reason: string;
}

export interface ItemCategoryMetricEvidenceResult {
  itemId: string;
  embeddingAvailable: boolean;
  candidates: CategoryMetricCandidate[];
  rejectedCategoryIds: string[];
  profileCount: number;
  acceptedExampleCount: number;
  indexSize?: number;
  neighborQueryMs?: number;
  error?: string;
}

export interface CategoryClassificationEnsemble {
  categoryIds: string[];
  primaryCategoryId?: string;
  llmCategoryIds: string[];
  metricCategoryIds: string[];
  agreements: string[];
  reason: string;
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

function meanTop(scores: number[] | undefined, limit = 3): { score: number; count: number } {
  const ranked = (scores ?? [])
    .map(clampScore)
    .filter((score) => score > 0)
    .sort((left, right) => right - left)
    .slice(0, limit);
  if (!ranked.length) return { score: 0, count: 0 };
  return {
    score: ranked.reduce((sum, score) => sum + score, 0) / ranked.length,
    count: ranked.length,
  };
}

/**
 * Conservative, exact metric classification. Scores stay decomposed so the
 * acceptance corpus can tune policy without changing storage or retrieval.
 */
export function rankCategoryMetricCandidates(
  evidence: CategoryMetricProfileEvidence[],
  rejectedCategoryIds: ReadonlySet<string> = new Set(),
  limit = CATEGORY_METRIC_RESULT_LIMIT
): CategoryMetricCandidate[] {
  const candidates: CategoryMetricCandidate[] = [];
  for (const row of evidence) {
    if (!row.categoryId || rejectedCategoryIds.has(row.categoryId)) continue;
    const profileScore = clampScore(row.profileScore);
    const definitionScore = clampScore(row.definitionScore);
    const aggregateScore = clampScore(row.aggregateScore);
    const example = meanTop(row.acceptedNeighborScores);

    // A close accepted example is intentionally independent from the category
    // centroid: it preserves narrow modes that a broad centroid can blur.
    const exampleBlend = example.count
      ? Math.max(
          definitionScore * 0.45 + example.score * 0.55,
          aggregateScore * 0.35 + example.score * 0.65
        )
      : 0;
    const score = Math.max(profileScore, exampleBlend);

    const qualifies =
      profileScore >= 0.58 ||
      example.score >= 0.62 ||
      (definitionScore >= 0.36 && example.score >= 0.56) ||
      (row.memberCount >= 3 && aggregateScore >= 0.58);
    if (!qualifies) continue;

    const evidenceKinds = [
      profileScore >= 0.58 ? 'category profile' : '',
      aggregateScore >= 0.58 ? `${row.memberCount} member${row.memberCount === 1 ? '' : 's'}` : '',
      example.count ? `${example.count} accepted neighbor${example.count === 1 ? '' : 's'}` : '',
    ].filter(Boolean);
    candidates.push({
      ...row,
      profileScore,
      definitionScore,
      aggregateScore,
      exampleScore: example.score,
      exampleCount: example.count,
      score,
      reason: evidenceKinds.join(' + ') || 'embedding similarity',
    });
  }

  return candidates
    .sort((left, right) =>
      right.score - left.score ||
      right.exampleScore - left.exampleScore ||
      right.definitionScore - left.definitionScore ||
      left.categoryId.localeCompare(right.categoryId)
    )
    .slice(0, Math.max(0, Math.floor(limit)));
}

/** Merge independent LLM and metric outputs without letting either erase the other. */
export function resolveCategoryClassificationEnsemble(input: {
  llmCategoryIds?: string[];
  metricCandidates?: CategoryMetricCandidate[];
  rejectedCategoryIds?: ReadonlySet<string>;
  limit?: number;
}): CategoryClassificationEnsemble {
  const rejected = input.rejectedCategoryIds ?? new Set<string>();
  const max = Math.max(1, Math.floor(input.limit ?? CATEGORY_METRIC_RESULT_LIMIT));
  const llmCategoryIds = [...new Set(input.llmCategoryIds ?? [])].filter(
    (categoryId) => categoryId && !rejected.has(categoryId)
  );
  const metricCategoryIds = [...new Set(
    (input.metricCandidates ?? [])
      .map((candidate) => candidate.categoryId)
      .filter((categoryId) => categoryId && !rejected.has(categoryId))
  )];
  const agreements = llmCategoryIds.filter((categoryId) => metricCategoryIds.includes(categoryId));

  const categoryIds = [...llmCategoryIds];
  for (const categoryId of metricCategoryIds) {
    if (!categoryIds.includes(categoryId)) categoryIds.push(categoryId);
  }

  // A metric-specific leaf should repair an LLM General fallback, while a
  // normal specific LLM primary stays stable and the metric label is additive.
  if (categoryIds[0] && isGeneralLeafId(categoryIds[0])) {
    const metricSpecific = metricCategoryIds.find((categoryId) => !isGeneralLeafId(categoryId));
    if (metricSpecific) {
      categoryIds.splice(categoryIds.indexOf(metricSpecific), 1);
      categoryIds.unshift(metricSpecific);
    }
  }

  const bounded = categoryIds.slice(0, max);
  return {
    categoryIds: bounded,
    primaryCategoryId: bounded[0],
    llmCategoryIds,
    metricCategoryIds,
    agreements,
    reason: agreements.length
      ? `LLM and embedding agree on ${agreements.join(', ')}`
      : llmCategoryIds.length && metricCategoryIds.length
        ? 'Combined independent LLM and embedding suggestions'
        : llmCategoryIds.length
          ? 'LLM classification; no strong embedding addition'
          : metricCategoryIds.length
            ? 'Embedding classification; LLM returned no category'
            : 'No classifier produced a category',
  };
}
