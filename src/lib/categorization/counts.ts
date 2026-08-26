import type { AiCategory, AiItemCategoryLink } from './types';
import {
  classifyStateForLinkQualityLeaf,
  isLinkQualityLeafId,
  isLinkQualityRedirectMismatchLeafId,
} from './linkQuality';
import { isGeneralLeafId } from './taxonomyCatalog';

const COUNTABLE_STATUSES = new Set(['suggested', 'accepted']);

export function linkCountsForCategories(
  categories: AiCategory[],
  links: AiItemCategoryLink[]
): Map<string, { itemCount: number; primaryItemCount: number; secondaryItemCount: number }> {
  const leafIds = new Set(
    categories.filter((c) => c.kind === 'leaf' && c.assignable !== false).map((c) => c.id)
  );
  const childrenByParent = new Map<string, string[]>();
  for (const c of categories) {
    if (c.kind !== 'leaf' || !c.parentId) continue;
    if (!childrenByParent.has(c.parentId)) childrenByParent.set(c.parentId, []);
    childrenByParent.get(c.parentId)!.push(c.id);
  }

  const primaryItemsByLeaf = new Map<string, Set<string>>();
  const secondaryItemsByLeaf = new Map<string, Set<string>>();
  const anyItemsByLeaf = new Map<string, Set<string>>();

  for (const link of links) {
    if (!COUNTABLE_STATUSES.has(link.status)) continue;
    if (!leafIds.has(link.categoryId)) continue;
    if (link.isPrimary) {
      if (!primaryItemsByLeaf.has(link.categoryId)) primaryItemsByLeaf.set(link.categoryId, new Set());
      primaryItemsByLeaf.get(link.categoryId)!.add(link.itemId);
    } else {
      if (!secondaryItemsByLeaf.has(link.categoryId)) secondaryItemsByLeaf.set(link.categoryId, new Set());
      secondaryItemsByLeaf.get(link.categoryId)!.add(link.itemId);
    }
    if (!anyItemsByLeaf.has(link.categoryId)) anyItemsByLeaf.set(link.categoryId, new Set());
    anyItemsByLeaf.get(link.categoryId)!.add(link.itemId);
  }

  const counts = new Map<string, { itemCount: number; primaryItemCount: number; secondaryItemCount: number }>();

  for (const c of categories) {
    if (c.kind === 'leaf') {
      counts.set(c.id, {
        itemCount: anyItemsByLeaf.get(c.id)?.size ?? 0,
        primaryItemCount: primaryItemsByLeaf.get(c.id)?.size ?? 0,
        secondaryItemCount: secondaryItemsByLeaf.get(c.id)?.size ?? 0,
      });
      continue;
    }
    if (c.kind === 'parent') {
      const childIds = childrenByParent.get(c.id) ?? [];
      const itemIds = new Set<string>();
      const primaryIds = new Set<string>();
      const secondaryIds = new Set<string>();
      for (const lid of childIds) {
        for (const id of anyItemsByLeaf.get(lid) ?? []) itemIds.add(id);
        for (const id of primaryItemsByLeaf.get(lid) ?? []) primaryIds.add(id);
        for (const id of secondaryItemsByLeaf.get(lid) ?? []) secondaryIds.add(id);
      }
      counts.set(c.id, {
        itemCount: itemIds.size,
        primaryItemCount: primaryIds.size,
        secondaryItemCount: secondaryIds.size,
      });
    }
  }

  return counts;
}

export function applyCountsToCategories(
  categories: AiCategory[],
  counts: Map<string, { itemCount: number; primaryItemCount: number; secondaryItemCount: number }>,
  now = Date.now()
): AiCategory[] {
  return categories.map((c) => {
    const n = counts.get(c.id);
    const childLeafCount =
      c.kind === 'parent'
        ? categories.filter((x) => x.kind === 'leaf' && x.parentId === c.id && x.status !== 'deprecated')
            .length
        : c.childLeafCount;
    return {
      ...c,
      itemCount: n?.itemCount ?? 0,
      primaryItemCount: n?.primaryItemCount ?? 0,
      secondaryItemCount: n?.secondaryItemCount ?? 0,
      childLeafCount,
      updated_at: now,
    };
  });
}

export function primaryLeafIdFromLinks(links: AiItemCategoryLink[]): string | null {
  const primary = links.find(
    (l) =>
      l.isPrimary &&
      COUNTABLE_STATUSES.has(l.status) &&
      !isLinkQualityRedirectMismatchLeafId(l.categoryId)
  );
  if (primary) return primary.categoryId;
  const fallback = links
    .filter(
      (link) =>
        COUNTABLE_STATUSES.has(link.status) &&
        !isLinkQualityRedirectMismatchLeafId(link.categoryId)
    )
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'accepted' ? -1 : 1;
      return b.score - a.score || b.updated_at - a.updated_at;
    })[0];
  return fallback?.categoryId ?? null;
}

/** User-confirmed primary category (accepted only — not AI suggestions). */
export function verifiedPrimaryLeafIdFromLinks(links: AiItemCategoryLink[]): string | null {
  const primary = links.find(
    (link) =>
      link.isPrimary &&
      link.status === 'accepted' &&
      !isLinkQualityRedirectMismatchLeafId(link.categoryId)
  );
  if (primary) return primary.categoryId;
  return links
    .filter(
      (link) =>
        link.status === 'accepted' &&
        !isLinkQualityRedirectMismatchLeafId(link.categoryId)
    )
    .sort((a, b) => b.score - a.score || b.updated_at - a.updated_at)[0]?.categoryId ?? null;
}

export function classifyStateFromPrimary(leafId: string | null, eligible: boolean): import('./types').ClassifyState {
  if (!eligible) return 'ineligible';
  if (!leafId) return 'pending_classify';
  if (isLinkQualityLeafId(leafId)) return classifyStateForLinkQualityLeaf(leafId);
  if (isGeneralLeafId(leafId)) return 'classified_general';
  return 'classified';
}

/** Derive display/queue bucket; a claimed classification needs durable link evidence. */
export function resolveEffectiveClassifyState(input: {
  signalState?: import('./types').ClassifyState;
  primaryCategoryId?: string | null;
  /** @deprecated eligibility is applied when classify runs, not before a signal exists */
  eligible?: boolean;
}): import('./types').ClassifyState {
  const pid = input.primaryCategoryId ?? null;
  if (
    input.signalState &&
    (
      input.signalState === 'classified' ||
      input.signalState === 'classified_general' ||
      input.signalState === 'classified_removal' ||
      input.signalState === 'classified_attention'
    ) &&
    !pid
  ) {
    return 'pending_classify';
  }
  if (input.signalState) return input.signalState;
  if (pid && isLinkQualityLeafId(pid)) return classifyStateForLinkQualityLeaf(pid);
  if (pid && !isGeneralLeafId(pid)) return 'classified';
  if (pid && isGeneralLeafId(pid)) return 'classified_general';
  // AI-ready but no topic stored yet → pending until classify gate runs
  return 'pending_classify';
}
