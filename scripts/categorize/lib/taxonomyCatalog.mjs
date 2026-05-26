/**
 * Taxonomy presentation for LLM classify/discover: 2-level parent → leaf paths,
 * per-parent general fallback leaves, grouped catalogs.
 */

export const GENERAL_LEAF_SUFFIX = '-general';

export function generalLeafId(parentId) {
  return `${parentId}${GENERAL_LEAF_SUFFIX}`;
}

export function isGeneralLeafId(id) {
  return typeof id === 'string' && id.endsWith(GENERAL_LEAF_SUFFIX);
}

export function buildGeneralLeafDefinition(parent) {
  const pid = parent.id;
  return {
    id: generalLeafId(pid),
    parentId: pid,
    name: `Other (${parent.name})`,
    description: `Bookmarks clearly in “${parent.name}” when no more specific sibling leaf applies. Do not use if a specific leaf under this parent fits.`,
    canonicalTags: [pid.split('-')[0] || 'general', 'other'],
    isGeneralFallback: true,
    fromInitialSeed: true,
  };
}

export function buildLeafPathLabel(parentName, leafName) {
  return `${parentName} › ${leafName}`;
}

/** Pipeline/seed row → catalog leaf entry with full identity. */
export function leafToCatalogEntry(leaf, parentById, { idPrefix = '' } = {}) {
  const rawId = leaf.id?.startsWith('seed_') ? leaf.id.slice(5) : leaf.id;
  const leafId = idPrefix && !leaf.id?.startsWith('seed_') ? `${idPrefix}${rawId}` : leaf.id ?? rawId;
  const parentId = leaf.parentId ?? null;
  const parent = parentId ? parentById.get(parentId) : null;
  const parentName = leaf.parentName ?? parent?.name ?? parentId ?? '';
  const name = leaf.name ?? '';
  return {
    leafId,
    parentId,
    parentName,
    name,
    path: buildLeafPathLabel(parentName, name),
    pathIds: parentId ? [parentId, leafId] : [leafId],
    description: (leaf.description || '').slice(0, 200),
    isGeneralFallback: leaf.isGeneralFallback === true || isGeneralLeafId(rawId) || isGeneralLeafId(leafId),
  };
}

/** Group assignable categories by parent for topic-extract / discover prompts. */
export function buildGroupedLeafCatalog(categories, parents = []) {
  const parentById = new Map(parents.map((p) => [p.id, p]));
  for (const c of categories) {
    if (c.parentId && !parentById.has(c.parentId)) {
      parentById.set(c.parentId, { id: c.parentId, name: c.parentName ?? c.parentId });
    }
  }

  const byParent = new Map();
  for (const c of categories) {
    if (c.assignable === false || c.kind === 'parent') continue;
    const pid = c.parentId ?? '_ungrouped';
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(leafToCatalogEntry(c, parentById));
  }

  const order = parents.length ? parents.map((p) => p.id) : [...byParent.keys()];
  const seen = new Set(order);
  for (const k of byParent.keys()) {
    if (!seen.has(k)) order.push(k);
  }

  return order
    .filter((pid) => byParent.has(pid))
    .map((parentId) => {
      const parent = parentById.get(parentId);
      const leaves = byParent.get(parentId) ?? [];
      leaves.sort((a, b) => {
        if (a.isGeneralFallback !== b.isGeneralFallback) return a.isGeneralFallback ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
      return {
        parentId,
        parentName: parent?.name ?? parentId,
        parentDescription: (parent?.description || '').slice(0, 160),
        leaves,
      };
    });
}

/** Parent already has a *-general (or legacy misnamed) fallback leaf. */
export function parentHasGeneralLeaf(parentId, leaves) {
  return leaves.some(
    (l) =>
      l.parentId === parentId &&
      (l.isGeneralFallback === true || isGeneralLeafId(l.id))
  );
}

/** Ensure each parent has exactly one *-general fallback leaf (mutates leaves array). */
export function ensureGeneralFallbackLeaves(parents, leaves) {
  const existing = new Set(leaves.map((l) => l.id));
  const added = [];
  for (const parent of parents) {
    if (parentHasGeneralLeaf(parent.id, leaves)) continue;
    const id = generalLeafId(parent.id);
    if (existing.has(id)) continue;
    const leaf = buildGeneralLeafDefinition(parent);
    leaves.push(leaf);
    existing.add(id);
    added.push(leaf);
  }
  return added;
}

/**
 * Readable catalog for LLM (paths as English lines; ids explicit for output).
 * JSON-only catalogs with 37 nested leaves are harder to scan and correlate with items.
 */
export function formatGroupedCatalogMarkdown(groupedCatalog) {
  const lines = ['## Topic catalog (assign leafId only; parentId is for disambiguation)', ''];
  for (const group of groupedCatalog) {
    lines.push(`### ${group.parentName} (\`${group.parentId}\`)`);
    if (group.parentDescription) lines.push(`_${group.parentDescription}_`);
    for (const leaf of group.leaves) {
      const fb = leaf.isGeneralFallback ? ' **[fallback — use only if no sibling fits]**' : '';
      lines.push(
        `- **\`${leaf.leafId}\`** — ${leaf.name}${fb}`,
        `  Path: ${leaf.path}`,
        `  ${leaf.description || '(no description)'}`
      );
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

/**
 * Resolve topicPaths [[parentId, leafId], ...] or topicIds to canonical leaf ids.
 */
export function resolveTopicAssignments(raw, categoryIds, leafById) {
  const fromPaths = [];
  if (Array.isArray(raw.topicPaths)) {
    for (const path of raw.topicPaths) {
      if (!Array.isArray(path) || path.length < 2) continue;
      const parentId = String(path[0]).trim();
      const leafId = String(path[path.length - 1]).trim();
      const leaf = leafById.get(leafId) ?? leafById.get(`seed_${leafId}`);
      if (leaf && leaf.parentId === parentId && categoryIds.has(leaf.id ?? leafId)) {
        fromPaths.push(leaf.id ?? leafId);
      } else if (categoryIds.has(leafId)) {
        fromPaths.push(leafId);
      }
    }
  }

  const rawIds = fromPaths.length
    ? fromPaths
    : Array.isArray(raw.topicIds)
      ? raw.topicIds
      : Array.isArray(raw.categoryIds)
        ? raw.categoryIds
        : [];

  const resolved = [];
  for (let id of rawIds) {
    if (typeof id !== 'string') continue;
    id = id.trim();
    if (categoryIds.has(id)) {
      resolved.push(id);
      continue;
    }
    const withSeed = id.startsWith('seed_') ? id : `seed_${id}`;
    if (categoryIds.has(withSeed)) resolved.push(withSeed);
  }
  return enforceGeneralSiblingRules([...new Set(resolved)].slice(0, 3), leafById);
}

/** Drop *-general if another leaf under the same parent is also assigned. */
export function enforceGeneralSiblingRules(topicIds, leafById) {
  const byParent = new Map();
  for (const id of topicIds) {
    const leaf = leafById.get(id);
    const pid = leaf?.parentId;
    if (!pid) continue;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(id);
  }
  const out = [];
  for (const id of topicIds) {
    const leaf = leafById.get(id);
    const pid = leaf?.parentId;
    if (!pid) {
      out.push(id);
      continue;
    }
    const group = byParent.get(pid) ?? [];
    const hasSpecific = group.some((gid) => !isGeneralLeafId(gid));
    if (isGeneralLeafId(id) && hasSpecific) continue;
    out.push(id);
  }
  return out;
}

export const TOPIC_CATALOG_RULES = [
  'Taxonomy is 2 levels: parent (grouping only) → leaf (assignable). Use leafId from topicCatalog only.',
  'Each leaf shows path and pathIds — use topicIds (leaf id) or topicPaths [parentId, leafId] when disambiguating similar names.',
  'Pick the most specific leaf first. Use the *-general leaf under a parent only when no sibling leaf fits.',
  'Never assign both a *-general leaf and another leaf under the same parent in one result.',
  'topicIds: 0-3 leaf ids (first = primary). Multiple ids only for distinct topics (often different parents).',
  'skip: true only for empty/login/placeholder pages with no real topic — NEVER skip solely because content is adult/erotic/pornographic.',
  'Adult: explicit video/tube/fetish pages → adult-erotic-content. Sexuality wellness articles (dreams, education) → sexuality-wellness-education or health-nutrition — not skip.',
  'proposed: at most 1 new specific leaf when topic is clear but missing (include parentId). Do not propose a second *-general.',
];

export const DISCOVER_CATALOG_RULES = [
  'You MAY propose newParents (broad domains) when items do not fit ANY existing parent — not only newLeaves.',
  'newLeaves.parentId must be an existing parent id or an id from newParents in the same response.',
  'Each existing leaf includes path and pathIds. itemResults must use leaf id from categoriesSoFar, never a parent id.',
  'Reuse *-general leaves for in-domain items when no specific leaf fits; do not add duplicate General/Other leaves.',
  'NEVER skip or omit items solely because they are adult/erotic/pornographic — propose leaves under health-lifestyle (e.g. adult-erotic-content, sexuality-wellness-education) or assign_existing.',
  'Explicit adult video/tube → propose or assign adult-erotic-content. Sexuality wellness articles → sexuality-wellness-education.',
];

export const DISCOVER_SKIP_RULES =
  'Mark action=skip only for login shells, empty/placeholder pages, or no clear topic — NEVER skip as inappropriate because content is adult.';
