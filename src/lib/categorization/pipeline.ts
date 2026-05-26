import { assignToCategories } from './assign';
import { bootstrapCategories, recomputeCentroids } from './bootstrap';
import { llmRenameCategories } from './llmNaming';
import { mergeSimilarCategories } from './merge';
import { cosineSimilarity, l2Normalize } from './math';
import { deriveTagsAfterAssignment } from './tags';
import type { CategoryNameMember } from './tags';
import { hashText } from './textHash';
import type { AISettings } from '../ai/types';
import type {
  AiCategory,
  CategorizationRunResult,
  CategorizationRunSummary,
  CategorizationThresholds,
  PipelineItemInput,
  PipelineItemResult,
} from './types';
import { DEFAULT_THRESHOLDS } from './types';

export interface EmbedFn {
  (texts: string[]): Promise<number[][]>;
}

export interface RunPipelineOptions {
  items: PipelineItemInput[];
  categories: AiCategory[];
  embeddingModel: string;
  embed: EmbedFn;
  thresholds?: CategorizationThresholds;
  /** When true and categories empty, k-means bootstrap from this batch. */
  bootstrapIfEmpty?: boolean;
  /** After bootstrap, merge near-duplicate centroids (default true). */
  mergeAfterBootstrap?: boolean;
  /** LLM display names for categories (requires aiSettings). */
  llmRenameCategories?: boolean;
  aiSettings?: AISettings;
  existingHashes?: Map<string, string>;
  existingEmbeddings?: Map<string, number[]>;
}

export async function runCategorizationPipeline(
  opts: RunPipelineOptions
): Promise<CategorizationRunResult> {
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
  let categories = [...opts.categories];
  const summary: CategorizationRunSummary = {
    processed: 0,
    embedded: 0,
    skippedInsufficient: 0,
    embedFailed: 0,
    assignedPrimary: 0,
    assignedSecondary: 0,
    novelty: 0,
    categoriesCount: categories.length,
    bootstrapCreated: 0,
    categoriesMerged: 0,
    skippedInsufficientEnrichment: 0,
  };

  const itemResults: PipelineItemResult[] = [];
  const toEmbed: { item: PipelineItemInput; index: number }[] = [];
  const prepared: Array<{
    item: PipelineItemInput;
    textHash: string;
    embedding?: number[];
    signalStatus: PipelineItemResult['signalStatus'];
    skipReason?: string;
  }> = [];

  for (const item of opts.items) {
    summary.processed++;
    const text = item.text.trim();

    if (item.categorizationEligible === false) {
      summary.skippedInsufficientEnrichment++;
      const textHash = await hashText(text || item.itemId);
      prepared.push({
        item,
        textHash,
        signalStatus: 'insufficient_enrichment',
        skipReason: item.eligibilityReason ?? 'insufficient enrichment for categorization',
      });
      continue;
    }

    const semantic =
      item.semanticLength ??
      item.substantiveLength ??
      substantiveTextLengthFromPipeline(item);
    if (semantic < thresholds.minSemanticSubstance && text.length < thresholds.minTextLength) {
      summary.skippedInsufficientEnrichment++;
      const textHash = await hashText(text || item.itemId);
      prepared.push({
        item,
        textHash,
        signalStatus: 'insufficient_enrichment',
        skipReason: `semantic ${semantic} < ${thresholds.minSemanticSubstance}`,
      });
      continue;
    }

    const substantive = item.substantiveLength ?? substantiveTextLengthFromPipeline(item);
    if (substantive < thresholds.minTextLength && text.length < thresholds.minTextLength) {
      summary.skippedInsufficient++;
      const textHash = await hashText(text || item.itemId);
      prepared.push({
        item,
        textHash,
        signalStatus: 'insufficient_text',
        skipReason: `substantive ${substantive} < ${thresholds.minTextLength}`,
      });
      continue;
    }

    const textHash = await hashText(text);
    const prevHash = opts.existingHashes?.get(item.itemId);
    const prevEmb = opts.existingEmbeddings?.get(item.itemId);
    if (prevHash === textHash && prevEmb?.length) {
      prepared.push({ item, textHash, embedding: l2Normalize(prevEmb), signalStatus: 'ok' });
    } else {
      const idx = prepared.length;
      prepared.push({ item, textHash, signalStatus: 'ok' });
      toEmbed.push({ item, index: idx });
    }
  }

  if (toEmbed.length) {
    try {
      const vectors = await opts.embed(toEmbed.map((t) => t.item.text));
      summary.embedded += vectors.length;
      for (let i = 0; i < toEmbed.length; i++) {
        const { index } = toEmbed[i];
        prepared[index].embedding = l2Normalize(vectors[i]);
      }
    } catch {
      summary.embedFailed += toEmbed.length;
      for (const { index } of toEmbed) {
        prepared[index].signalStatus = 'embed_failed';
        prepared[index].skipReason = 'embedding request failed';
      }
    }
  }

  const embeddedForBootstrap = prepared
    .filter((p) => p.embedding && p.signalStatus === 'ok')
    .map((p) => ({
      itemId: p.item.itemId,
      embedding: p.embedding!,
      text: p.item.text,
      title: p.item.title,
      aiTags: p.item.enrichmentAiTags,
    }));

  if (opts.bootstrapIfEmpty && !categories.length && embeddedForBootstrap.length >= 6) {
    categories = bootstrapCategories(embeddedForBootstrap, thresholds);
    summary.bootstrapCreated = categories.length;
    summary.categoriesCount = categories.length;

    if (opts.mergeAfterBootstrap !== false && categories.length > 1) {
      const { categories: merged, mergedCount } = mergeSimilarCategories(
        categories,
        thresholds.mergeCentroidMin
      );
      categories = merged;
      summary.categoriesMerged = mergedCount;
      summary.categoriesCount = categories.length;
    }

    if (opts.llmRenameCategories && opts.aiSettings && categories.length) {
      const membersById = new Map<string, CategoryNameMember[]>();
      for (const row of embeddedForBootstrap) {
        const cluster = categories.find(
          (c) => cosineNearestCluster(row.embedding, categories) === c.id
        );
        if (!cluster) continue;
        const list = membersById.get(cluster.id) ?? [];
        list.push({ title: row.title, aiTags: row.aiTags, text: row.text?.slice(0, 400) });
        membersById.set(cluster.id, list);
      }
      categories = await llmRenameCategories(opts.aiSettings, categories, membersById);
    }
  }

  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const membersByCategory = new Map<string, number[][]>();

  for (const p of prepared) {
    if (!p.embedding || p.signalStatus !== 'ok') {
      itemResults.push({
        itemId: p.item.itemId,
        textHash: p.textHash,
        embedding: p.embedding ?? [],
        signalStatus: p.signalStatus,
        assignments: [],
        derivedTags: [],
        isNovelty: false,
        skipReason: p.skipReason,
      });
      continue;
    }

    const { assignments, isNovelty } = assignToCategories(p.embedding, categories, thresholds);
    if (isNovelty || !assignments.length) summary.novelty++;
    else {
      if (assignments.some((a) => a.isPrimary)) summary.assignedPrimary++;
      summary.assignedSecondary += assignments.filter((a) => !a.isPrimary).length;
    }

    for (const a of assignments) {
      const list = membersByCategory.get(a.categoryId) ?? [];
      list.push(p.embedding);
      membersByCategory.set(a.categoryId, list);
    }

    const derivedTags = deriveTagsAfterAssignment(
      p.item.text,
      assignments,
      categoriesById,
      p.item.enrichmentAiTags,
      thresholds.tagCap
    );

    itemResults.push({
      itemId: p.item.itemId,
      textHash: p.textHash,
      embedding: p.embedding,
      signalStatus: 'ok',
      assignments,
      derivedTags,
      isNovelty: isNovelty || assignments.length === 0,
    });
  }

  categories = recomputeCentroids(categories, membersByCategory);

  return {
    summary,
    categories,
    itemResults,
    embeddingModel: opts.embeddingModel,
  };
}

function substantiveTextLengthFromPipeline(item: PipelineItemInput): number {
  if (item.substantiveLength != null) return item.substantiveLength;
  return item.text.replace(/\s+/g, ' ').trim().length;
}

function cosineNearestCluster(embedding: number[], categories: AiCategory[]): string | null {
  let bestId: string | null = null;
  let best = -Infinity;
  for (const c of categories) {
    if (!c.centroid?.length) continue;
    const s = cosineSimilarity(embedding, c.centroid);
    if (s > best) {
      best = s;
      bestId = c.id;
    }
  }
  return bestId;
}
