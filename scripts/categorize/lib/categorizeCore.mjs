import { createHash } from 'crypto';
import { l2Normalize, cosineSimilarity, meanVector, kMeans, effectiveBootstrapK } from './math.mjs';
import { nameCategoryFromMembers, slugFromTerms, normalizeTag, tokenizeForTags } from './naming.mjs';
import { mergeSimilarCategories } from './merge.mjs';

export const DEFAULT_THRESHOLDS = {
  primaryMin: 0.38,
  secondaryMin: 0.34,
  secondaryMaxGapFromPrimary: 0.05,
  maxSecondaries: 2,
  noveltyMaxPrimary: 0.48,
  minTextLength: 40,
  minSemanticSubstance: 100,
  bootstrapK: 8,
  mergeCentroidMin: 0.88,
  tagCap: 5,
};

export function hashText(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function deriveTags(text, assignments, categoriesById, enrichmentAiTags, cap) {
  const scores = new Map();
  const bump = (tag, weight) => {
    const n = normalizeTag(tag);
    if (!n) return;
    scores.set(n, (scores.get(n) ?? 0) + weight);
  };

  for (const a of assignments) {
    const cat = categoriesById.get(a.categoryId);
    if (!cat) continue;
    const w = a.isPrimary ? 3 : 1.5;
    for (const t of cat.canonicalTags ?? []) bump(t, w);
    bump(cat.name.replace(/^ai_proposed_/, '').replace(/-/g, ' '), w * 0.5);
  }
  for (const t of enrichmentAiTags ?? []) bump(t, 0.75);

  const freq = new Map();
  for (const w of tokenizeForTags(text.slice(0, 800))) freq.set(w, (freq.get(w) ?? 0) + 1);
  for (const [w, c] of freq) {
    if (c >= 2) bump(w, 1);
    else if (c === 1 && w.length >= 6) bump(w, 0.5);
  }

  return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, cap).map(([t]) => t);
}

export function assignToCategories(embedding, categories, thresholds = DEFAULT_THRESHOLDS) {
  if (!categories.length) return { assignments: [], isNovelty: true };

  const ranked = categories
    .map((c) => ({ categoryId: c.id, score: cosineSimilarity(embedding, c.centroid) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const primaryFloor = Math.max(thresholds.primaryMin, thresholds.noveltyMaxPrimary);
  if (!best || best.score < primaryFloor) {
    return { assignments: [], isNovelty: true };
  }

  const assignments = [{ categoryId: best.categoryId, score: best.score, isPrimary: true }];
  let secondaries = 0;
  for (let i = 1; i < ranked.length && secondaries < thresholds.maxSecondaries; i++) {
    const r = ranked[i];
    if (r.score < thresholds.secondaryMin) break;
    if (best.score - r.score > thresholds.secondaryMaxGapFromPrimary) break;
    assignments.push({ categoryId: r.categoryId, score: r.score, isPrimary: false });
    secondaries++;
  }
  return { assignments, isNovelty: false };
}

export function bootstrapCategories(inputs, thresholds = DEFAULT_THRESHOLDS, now = Date.now()) {
  const empty = { categories: [], membersByCategoryId: new Map() };
  if (inputs.length < 3) return empty;

  const vectors = inputs.map((i) => i.embedding);
  const k = effectiveBootstrapK(inputs.length, thresholds.bootstrapK);
  const { assignments, centroids } = kMeans(vectors, k);
  const clusterIds = [...new Set(assignments)];
  const categories = [];
  const membersByCategoryId = new Map();

  for (const clusterIdx of clusterIds) {
    const members = inputs
      .filter((_, i) => assignments[i] === clusterIdx)
      .map((x) => ({
        ...x,
        score: cosineSimilarity(x.embedding, centroids[clusterIdx]),
      }))
      .sort((a, b) => b.score - a.score);

    const { name, canonicalTags } = nameCategoryFromMembers(
      members.map((x) => ({
        title: x.title,
        aiTags: x.aiTags,
        text: x.aiSummary || x.clusterText || '',
      }))
    );
    const slug = slugFromTerms(canonicalTags.length ? canonicalTags : [`cluster${clusterIdx}`]);
    const id = `ai_proposed_${slug}_${clusterIdx}`;
    categories.push({
      id,
      name,
      status: 'ai_proposed',
      centroid: centroids[clusterIdx] ?? meanVector(members.map((x) => x.embedding)),
      canonicalTags,
      created_at: now,
      updated_at: now,
    });
    membersByCategoryId.set(
      id,
      members.slice(0, 8).map((m) => ({
        itemId: m.itemId,
        title: m.title,
        aiSummary: m.aiSummary,
        aiTags: m.aiTags,
        score: m.score,
      }))
    );
  }
  return { categories, membersByCategoryId };
}

function recomputeCentroids(categories, membersByCategory, now) {
  return categories.map((cat) => {
    const members = membersByCategory.get(cat.id);
    if (!members?.length) return cat;
    return { ...cat, centroid: meanVector(members), updated_at: now };
  });
}

export async function runPipeline({
  items,
  categories: initialCategories,
  embeddingModel,
  embed,
  thresholds = DEFAULT_THRESHOLDS,
  bootstrapIfEmpty = true,
  mergeAfterBootstrap = true,
  existingHashes,
  existingEmbeddings,
}) {
  let categories = [...initialCategories];
  const summary = {
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

  const prepared = [];
  const toEmbed = [];

  for (const item of items) {
    summary.processed++;
    const clusterText = (item.clusterText ?? item.text ?? '').trim();
    const classifyText = (item.classifyText ?? item.text ?? '').trim();

    if (item.categorizationEligible === false) {
      summary.skippedInsufficientEnrichment++;
      prepared.push({
        item,
        textHash: hashText(clusterText || item.itemId),
        signalStatus: 'insufficient_enrichment',
        skipReason: item.eligibilityReason ?? 'insufficient enrichment',
      });
      continue;
    }

    const semantic = item.semanticLength ?? item.substantiveLength ?? classifyText.length;
    if (semantic < thresholds.minSemanticSubstance && classifyText.length < thresholds.minTextLength) {
      summary.skippedInsufficientEnrichment++;
      prepared.push({
        item,
        textHash: hashText(clusterText || item.itemId),
        signalStatus: 'insufficient_enrichment',
        skipReason: `semantic ${semantic} < ${thresholds.minSemanticSubstance}`,
      });
      continue;
    }

    const clusterSubstantive = item.clusterSubstantiveLength ?? clusterText.length;
    if (clusterSubstantive < thresholds.minTextLength && clusterText.length < thresholds.minTextLength) {
      summary.skippedInsufficient++;
      prepared.push({
        item,
        textHash: hashText(clusterText || item.itemId),
        signalStatus: 'insufficient_text',
        skipReason: `cluster substantive ${clusterSubstantive}`,
      });
      continue;
    }

    const textHash = hashText(clusterText);
    const prevHash = existingHashes?.get(item.itemId);
    const prevEmb = existingEmbeddings?.get(item.itemId);
    if (prevHash === textHash && prevEmb?.length) {
      prepared.push({ item, textHash, embedding: l2Normalize(prevEmb), signalStatus: 'ok' });
    } else {
      prepared.push({ item, textHash, signalStatus: 'ok', needsEmbed: true });
      toEmbed.push(prepared.length - 1);
    }
  }

  if (toEmbed.length) {
    try {
      const texts = toEmbed.map((idx) => prepared[idx].item.clusterText ?? prepared[idx].item.text);
      const vectors = await embed(texts);
      summary.embedded = vectors.length;
      for (let i = 0; i < toEmbed.length; i++) {
        const idx = toEmbed[i];
        prepared[idx].embedding = l2Normalize(vectors[i]);
        prepared[idx].needsEmbed = false;
      }
    } catch (e) {
      summary.embedFailed += toEmbed.length;
      summary.embedError = e instanceof Error ? e.message : String(e);
      for (const idx of toEmbed) {
        prepared[idx].signalStatus = 'embed_failed';
        prepared[idx].skipReason = summary.embedError;
      }
    }
  }

  const forBootstrap = prepared
    .filter((p) => p.embedding && p.signalStatus === 'ok')
    .map((p) => ({
      itemId: p.item.itemId,
      embedding: p.embedding,
      clusterText: p.item.clusterText ?? p.item.text,
      aiSummary: p.item.aiSummary,
      title: p.item.title,
      aiTags: p.item.enrichmentAiTags,
    }));

  let membersByCategoryId = new Map();

  if (bootstrapIfEmpty && !categories.length && forBootstrap.length >= 6) {
    const boot = bootstrapCategories(forBootstrap, thresholds);
    categories = boot.categories;
    membersByCategoryId = boot.membersByCategoryId;
    summary.bootstrapCreated = categories.length;
    summary.categoriesCount = categories.length;

    if (mergeAfterBootstrap && categories.length > 1) {
      const { categories: merged, mergedCount, idRemap } = mergeSimilarCategories(
        categories,
        thresholds.mergeCentroidMin,
        membersByCategoryId
      );
      categories = merged;
      membersByCategoryId = idRemap ?? membersByCategoryId;
      summary.categoriesMerged = mergedCount;
      summary.categoriesCount = categories.length;
    }
  }

  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const membersByCategory = new Map();
  const itemResults = [];

  for (const p of prepared) {
    if (!p.embedding || p.signalStatus !== 'ok') {
      itemResults.push({
        itemId: p.item.itemId,
        title: p.item.title,
        url: p.item.url,
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
    if (!assignments.length) summary.novelty++;
    else {
      if (assignments.some((a) => a.isPrimary)) summary.assignedPrimary++;
      summary.assignedSecondary += assignments.filter((a) => !a.isPrimary).length;
    }

    for (const a of assignments) {
      const list = membersByCategory.get(a.categoryId) ?? [];
      list.push(p.embedding);
      membersByCategory.set(a.categoryId, list);
    }

    itemResults.push({
      itemId: p.item.itemId,
      title: p.item.title,
      url: p.item.url,
      textHash: p.textHash,
      embedding: p.embedding,
      signalStatus: 'ok',
      assignments,
      derivedTags: deriveTags(
        p.item.classifyText ?? p.item.text,
        assignments,
        categoriesById,
        p.item.enrichmentAiTags,
        thresholds.tagCap
      ),
      isNovelty: !assignments.length,
    });
  }

  categories = recomputeCentroids(categories, membersByCategory, Date.now());

  return { summary, categories, itemResults, embeddingModel, membersByCategoryId };
}
