/**
 * In-memory taxonomy merge (no DB) — shared by discover map-reduce and runTaxonomyMerge.
 */
import { isGeneralLeafId } from './taxonomyCatalog';
import type { AiCategory } from './types';

const SEED_PARENT_ABSORBS: Record<string, string[]> = {
  'machine-learning': [
    'deep learning', 'neural network', 'nlp',
    'natural language', 'tensorflow', 'pytorch', 'computer vision',
    'speech recognition', 'reinforcement learning', 'machine learning', 'ml research',
    'generative model', 'model evaluation',
  ],
  'data-analytics': [
    'data science', 'data analytics', 'data engineering', 'data analysis',
    'database', 'business intelligence', 'big data', 'pandas', 'numpy',
  ],
  'science-math': [
    'mathematics', 'math resource', 'statistics', 'statistical science',
    'physics', 'biology', 'scientific research',
  ],
  'environment-nature': [
    'environment', 'climate', 'sustainability', 'ecology', 'conservation',
    'agriculture', 'farming', 'horticulture', 'gardening', 'animal care', 'pet care',
  ],
  'education-careers': [
    'education', 'course resource', 'academic integrity', 'stem education',
    'career resource', 'job search', 'interview preparation',
  ],
  'infra-hosting': [
    'cloud computing', 'cloud training', 'cloud pricing', 'gpu cloud',
    'server hosting', 'cloud resources', 'operating system',
    'linux ', 'linux backup', 'backup restoration', 'devops', 'container',
    'site reliability', 'observability',
  ],
  'security-privacy': [
    'cybersecurity', 'information security', 'application security',
    'privacy', 'cryptography', 'identity management', 'malware',
  ],
  hardware: [
    'computer hardware', 'electronics', 'embedded system', 'workstation',
    'microcontroller', 'network hardware', 'smart device',
  ],
  'software-dev': [
    'software engineering', 'open source', 'developer tools', 'ide ',
    'programming', 'algorithm', 'data structure', 'web development',
  ],
  'ai-productivity': [
    'ai tools', 'llm tools', 'ai assistant', 'knowledge management',
    'research assistant', 'workflow automation',
  ],
  'personal-finance': [
    'tax ', 'tax resource', 'personal finance', 'investing',
  ],
  'quant-finance': [
    'quantitative finance', 'algorithmic trading', 'market data', 'trading strategy',
  ],
  'business-product-marketing': [
    'business', 'product management', 'marketing', 'sales enablement',
    'startup', 'entrepreneurship', 'customer success',
  ],
  'health-medicine': [
    'mental health', 'health resource', 'wellness', 'medicine', 'healthcare',
    'nutrition', 'sleep health',
  ],
  'sports-fitness': [
    'sports', 'fitness', 'exercise', 'athletic training', 'outdoor recreation',
  ],
  'relationships-sexuality': [
    'relationship', 'sexuality', 'sexual health', 'adult content', 'family life',
  ],
  'society-government-law': [
    'government', 'immigration', 'law ', 'legal resource', 'politics',
    'public policy', 'social issue',
  ],
  'arts-media-entertainment': [
    'movie', 'television', 'streaming', 'music', 'literature', 'visual art',
    'game ', 'entertainment',
  ],
  'travel-places-housing': [
    'travel', 'tourism', 'real estate', 'housing', 'rental', 'transportation',
  ],
  'food-home-lifestyle': [
    'food', 'cooking', 'home improvement', 'lifestyle',
  ],
  'language-writing': [
    'writing', 'grammar', 'language learning', 'publishing', 'communication',
  ],
  'history-philosophy-religion': [
    'history', 'archaeology', 'philosophy', 'ethics', 'religion',
    'spirituality', 'humanities', 'cultural studies',
  ],
  'shopping-consumer': [
    'shopping', 'consumer product', 'product review', 'buying guide', 'retail',
  ],
};

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function findAbsorbingSeedParent(
  discoveredParent: AiCategory,
  seedParentIds: Set<string>
): string | null {
  const nameKey = normalizeKey(discoveredParent.name);
  for (const [seedId, keywords] of Object.entries(SEED_PARENT_ABSORBS)) {
    if (!seedParentIds.has(seedId)) continue;
    for (const kw of keywords) {
      if (nameKey.includes(kw)) return seedId;
    }
  }
  return null;
}

export interface TaxonomyMergeAuditEntry {
  kind: 'parent' | 'leaf';
  absorbed: string;
  canonical: string;
  source: 'llm_reduce' | 'keyword_merge';
  reason?: string;
}

export interface TaxonomyMergePlan {
  categories: AiCategory[];
  canonicalFor: Map<string, string>;
  mergedParents: number;
  mergedLeaves: number;
  audit: TaxonomyMergeAuditEntry[];
}

export function planTaxonomyMerge(categories: AiCategory[]): TaxonomyMergePlan {
  const seedParents = new Set(
    categories.filter((c) => c.kind === 'parent' && c.source === 'seed').map((c) => c.id)
  );
  const canonicalFor = new Map<string, string>();
  const toDelete = new Set<string>();
  const toUpdate = new Map<string, AiCategory>();
  const audit: TaxonomyMergeAuditEntry[] = [];
  let mergedParents = 0;
  let mergedLeaves = 0;

  const discoveredParents = categories.filter(
    (c) => c.kind === 'parent' && c.source === 'discovered'
  );

  for (const dp of discoveredParents) {
    const absorbTo = findAbsorbingSeedParent(dp, seedParents);
    if (!absorbTo) continue;

    const seedParent = categories.find((c) => c.id === absorbTo);
    const seedParentName = seedParent?.name ?? absorbTo;
    const dpLeaves = categories.filter((c) => c.kind === 'leaf' && c.parentId === dp.id);
    const seedGeneralLeaf = categories.find(
      (c) => c.kind === 'leaf' && c.parentId === absorbTo && isGeneralLeafId(c.id)
    );

    audit.push({
      kind: 'parent',
      absorbed: dp.id,
      canonical: absorbTo,
      source: 'keyword_merge',
      reason: `absorbed discovered parent "${dp.name}" into seed`,
    });

    for (const leaf of dpLeaves) {
      if (isGeneralLeafId(leaf.id)) {
        if (seedGeneralLeaf) canonicalFor.set(leaf.id, seedGeneralLeaf.id);
        toDelete.add(leaf.id);
        continue;
      }
      const nameKey = normalizeKey(leaf.name);
      const existingSeedLeaf = categories.find(
        (c) =>
          c.kind === 'leaf' &&
          c.parentId === absorbTo &&
          !isGeneralLeafId(c.id) &&
          normalizeKey(c.name) === nameKey
      );
      if (existingSeedLeaf) {
        canonicalFor.set(leaf.id, existingSeedLeaf.id);
        toDelete.add(leaf.id);
        mergedLeaves++;
        audit.push({
          kind: 'leaf',
          absorbed: leaf.id,
          canonical: existingSeedLeaf.id,
          source: 'keyword_merge',
          reason: `duplicate leaf name under ${absorbTo}`,
        });
      } else {
        toUpdate.set(leaf.id, {
          ...leaf,
          parentId: absorbTo,
          parentName: seedParentName,
          updated_at: Date.now(),
        });
      }
    }
    toDelete.add(dp.id);
    mergedParents++;
  }

  const allLeaves = categories.filter(
    (c) => c.kind === 'leaf' && !toDelete.has(c.id) && !isGeneralLeafId(c.id)
  );
  const byParentAndName = new Map<string, AiCategory[]>();
  for (const leaf of allLeaves) {
    const updated = toUpdate.get(leaf.id) ?? leaf;
    const key = `${updated.parentId ?? '_'}::${normalizeKey(updated.name)}`;
    if (!byParentAndName.has(key)) byParentAndName.set(key, []);
    byParentAndName.get(key)!.push(updated);
  }
  for (const group of byParentAndName.values()) {
    if (group.length <= 1) continue;
    group.sort((a, b) => (b.primaryItemCount ?? 0) - (a.primaryItemCount ?? 0));
    const canonical = group[0]!;
    for (const dup of group.slice(1)) {
      canonicalFor.set(dup.id, canonical.id);
      toDelete.add(dup.id);
      mergedLeaves++;
      audit.push({
        kind: 'leaf',
        absorbed: dup.id,
        canonical: canonical.id,
        source: 'keyword_merge',
        reason: 'duplicate leaf name within parent',
      });
    }
  }

  const next: AiCategory[] = [];
  for (const cat of categories) {
    if (toDelete.has(cat.id)) continue;
    const updated = toUpdate.get(cat.id);
    next.push(updated ?? cat);
  }

  return { categories: next, canonicalFor, mergedParents, mergedLeaves, audit };
}

export function applyTaxonomyMergeInMemory(categories: AiCategory[]): TaxonomyMergePlan {
  const plan = planTaxonomyMerge([...categories]);
  if (plan.mergedParents || plan.mergedLeaves) {
    console.info(
      `[taxonomyMerge] in-memory: merged ${plan.mergedParents} parents, ${plan.mergedLeaves} leaves`
    );
  }
  return plan;
}
