import { effectiveBootstrapK, kMeans, meanVector } from './math';
import { nameCategoryFromMembers, slugFromTerms } from './tags';
import type { AiCategory, CategorizationThresholds, PipelineItemInput } from './types';
import { DEFAULT_THRESHOLDS } from './types';

export interface BootstrapInput {
  itemId: string;
  embedding: number[];
  text: string;
  title?: string;
  aiTags?: string[];
}

export function bootstrapCategories(
  inputs: BootstrapInput[],
  thresholds: CategorizationThresholds = DEFAULT_THRESHOLDS,
  now = Date.now()
): AiCategory[] {
  if (inputs.length < 3) return [];

  const vectors = inputs.map((i) => i.embedding);
  const k = effectiveBootstrapK(inputs.length, thresholds.bootstrapK);
  const { assignments, centroids } = kMeans(vectors, k);

  const categories: AiCategory[] = [];
  const clusterIds = [...new Set(assignments)];

  for (const clusterIdx of clusterIds) {
    const members = inputs.filter((_, i) => assignments[i] === clusterIdx);
    const { name, canonicalTags } = nameCategoryFromMembers(
      members.map((x) => ({
        title: x.title,
        aiTags: x.aiTags,
        text: x.text,
      }))
    );
    const slug = slugFromTerms(canonicalTags);
    const id = `ai_proposed_${slug}_${clusterIdx}`;

    categories.push({
      id,
      name,
      kind: 'leaf',
      assignable: true,
      status: 'ai_proposed',
      source: 'bootstrap',
      centroid: centroids[clusterIdx] ?? meanVector(members.map((x) => x.embedding)),
      canonicalTags,
      created_at: now,
      updated_at: now,
    });
  }

  return categories;
}

export function clusterNoveltyIntoCategories(
  novelty: BootstrapInput[],
  thresholds: CategorizationThresholds = DEFAULT_THRESHOLDS,
  now = Date.now()
): AiCategory[] {
  if (novelty.length < 5) return [];
  return bootstrapCategories(novelty, thresholds, now);
}

export function recomputeCentroids(
  categories: AiCategory[],
  membersByCategory: Map<string, number[][]>,
  now = Date.now()
): AiCategory[] {
  return categories.map((cat) => {
    const members = membersByCategory.get(cat.id);
    if (!members?.length) return cat;
    return {
      ...cat,
      centroid: meanVector(members),
      updated_at: now,
    };
  });
}

export function pipelineInputsFromBootstrap(
  items: PipelineItemInput[],
  embeddings: Map<string, number[]>
): BootstrapInput[] {
  return items
    .filter((i) => embeddings.has(i.itemId))
    .map((i) => ({
      itemId: i.itemId,
      embedding: embeddings.get(i.itemId)!,
      text: i.text,
      title: i.title,
      aiTags: i.enrichmentAiTags,
    }));
}
