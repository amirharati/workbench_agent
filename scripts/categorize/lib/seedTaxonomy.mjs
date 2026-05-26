import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { l2Normalize, cosineSimilarity } from './math.mjs';
import { ensureGeneralFallbackLeaves } from './taxonomyCatalog.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_SEED_PATH = join(__dir, '..', 'seed', 'categories.seed.json');

export const DEFAULT_SHORTLIST = {
  topK: 10,
  minScore: 0.28,
  minCandidates: 3,
  parentTopK: 2,
};

/**
 * Text embedded for each seed leaf (and parent for optional parent gate).
 */
export function buildSeedEmbedText(node) {
  const parts = [node.name?.trim() || '', node.description?.trim() || ''];
  const tags = node.canonicalTags?.filter(Boolean) ?? [];
  if (tags.length) parts.push(`Tags: ${tags.join(', ')}`);
  return parts.filter(Boolean).join('\n');
}

export function loadSeedTaxonomy(path = DEFAULT_SEED_PATH) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const parents = raw.parents ?? [];
  const leaves = raw.leaves ?? [];
  ensureGeneralFallbackLeaves(parents, leaves);
  const parentById = new Map(parents.map((p) => [p.id, p]));
  return {
    version: raw.version ?? 1,
    taxonomyVersion: raw.taxonomyVersion ?? 0,
    description: raw.description ?? '',
    parents,
    leaves,
    parentById,
    path,
  };
}

/**
 * Convert embedded seed leaves into pipeline category rows (centroid = seed embedding).
 */
export function seedLeavesToCategories(seed, leafEmbeddings, now = Date.now()) {
  const leaves = seed.leaves ?? [];
  if (leafEmbeddings.length !== leaves.length) {
    throw new Error(`seedLeavesToCategories: expected ${leaves.length} embeddings, got ${leafEmbeddings.length}`);
  }
  return leaves.map((leaf, i) => ({
    id: `seed_${leaf.id}`,
    name: leaf.name,
    description: leaf.description ?? '',
    canonicalTags: leaf.canonicalTags ?? [],
    parentId: leaf.parentId ?? null,
    parentName: seed.parentById.get(leaf.parentId)?.name ?? null,
    status: 'seed',
    source: 'seed',
    centroid: l2Normalize(leafEmbeddings[i]),
    created_at: now,
    updated_at: now,
  }));
}

function rankLeaves(embedding, leafCategories) {
  return leafCategories
    .map((c) => ({
      categoryId: c.id,
      score: cosineSimilarity(embedding, c.centroid),
      category: c,
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Top-K leaf shortlist for one item embedding. Optionally narrow via parent scores.
 */
export function shortlistForItem(embedding, leafCategories, seed, opts = {}) {
  const { topK, minScore, minCandidates, parentTopK } = { ...DEFAULT_SHORTLIST, ...opts };
  if (!embedding?.length || !leafCategories.length) {
    return { candidates: [], ranked: [], maxScore: -1, parentIds: [] };
  }

  const ranked = rankLeaves(embedding, leafCategories);
  const maxScore = ranked[0]?.score ?? -1;

  let pool = ranked;
  if (parentTopK > 0 && seed?.parentById?.size) {
    const byParent = new Map();
    for (const r of ranked) {
      const pid = r.category.parentId;
      if (!pid) continue;
      const prev = byParent.get(pid);
      if (!prev || r.score > prev.score) byParent.set(pid, r);
    }
    const parentRanked = [...byParent.entries()]
      .map(([parentId, best]) => ({ parentId, score: best.score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, parentTopK);
    const parentIds = new Set(parentRanked.map((p) => p.parentId));
    const gated = ranked.filter((r) => !r.category.parentId || parentIds.has(r.category.parentId));
    if (gated.length >= minCandidates) pool = gated;
  }

  const aboveMin = pool.filter((r) => r.score >= minScore);
  let picked = aboveMin.slice(0, topK);
  if (picked.length < minCandidates) {
    picked = pool.slice(0, Math.max(minCandidates, Math.min(topK, pool.length)));
  }

  const candidates = picked.map((r) => ({
    id: r.category.id,
    name: r.category.name,
    description: r.category.description || '',
    canonicalTags: r.category.canonicalTags ?? [],
    parentId: r.category.parentId,
    parentName: r.category.parentName,
    similarityScore: Math.round(r.score * 1000) / 1000,
  }));

  return {
    candidates,
    ranked: ranked.slice(0, topK),
    maxScore,
    parentIds: [...new Set(picked.map((c) => c.parentId).filter(Boolean))],
  };
}

export function buildShortlistMap(itemResults, leafCategories, seed, opts = {}) {
  const map = new Map();
  let totalCandidates = 0;
  let lowMaxScore = 0;

  for (const r of itemResults) {
    if (r.signalStatus !== 'ok' || !r.embedding?.length) continue;
    const sl = shortlistForItem(r.embedding, leafCategories, seed, opts);
    map.set(r.itemId, sl);
    totalCandidates += sl.candidates.length;
    if (sl.maxScore < (opts.minScore ?? DEFAULT_SHORTLIST.minScore)) lowMaxScore++;
  }

  const count = map.size || 1;
  return {
    byItemId: map,
    stats: {
      shortlistItems: map.size,
      shortlistAvgCandidates: Math.round((totalCandidates / count) * 10) / 10,
      shortlistLowMaxScore: lowMaxScore,
    },
  };
}

export async function loadAndEmbedSeedTaxonomy(path, embedFn) {
  const seed = loadSeedTaxonomy(path);
  const leafTexts = seed.leaves.map((l) => buildSeedEmbedText(l));
  const leafVectors = await embedFn(leafTexts);
  const categories = seedLeavesToCategories(seed, leafVectors);
  return { seed, categories, leafCount: seed.leaves.length };
}
