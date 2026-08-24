import { categorySlug, normalizeCategoryName } from '../../categorization/categorySimilarity';
import { buildGeneralLeafDefinition, generalLeafId } from '../../categorization/taxonomyCatalog';
import type {
  AiCategory,
  AiCategoryKind,
  AiItemCategoryLink,
  AiItemSignal,
} from '../../categorization/types';
import { isManageableTopicCategory } from '../../search/categorySearchProfiles';

export type ManualCategoryDraftInput = {
  name: string;
  description?: string;
  kind: AiCategoryKind;
  parentId?: string;
  canonicalTags?: string[];
  /** Optional meaningful first child when creating a parent structure. */
  child?: {
    name: string;
    description?: string;
    canonicalTags?: string[];
  };
};

export type ManualCategoryStore = {
  getAllCategories(): AiCategory[];
  getCategory(id: string): AiCategory | undefined;
  getItem(id: string): unknown | undefined;
  getLinksByItem(itemId: string): AiItemCategoryLink[];
  getLinksByCategory(categoryId: string): AiItemCategoryLink[];
  getSignal(itemId: string): AiItemSignal | undefined;
  putCategory(category: AiCategory): void;
  deleteCategory(id: string): void;
  deleteCategorySearchProfile(categoryId: string): void;
  putLink(link: AiItemCategoryLink): void;
  putSignal(signal: AiItemSignal): void;
  withTransaction<T>(fn: () => T): T;
};

export type ManualCategoryStoreResult = {
  category?: AiCategory;
  links?: AiItemCategoryLink[];
  attachedCategoryId?: string;
  deletedCategoryIds?: string[];
  affectedItemIds?: string[];
};

const COUNTABLE = new Set(['suggested', 'accepted']);

function isUserCategory(category: AiCategory | undefined): category is AiCategory {
  return Boolean(category && (category.source === 'manual' || category.status === 'manual'));
}

function activeLinks(store: ManualCategoryStore, itemId: string): AiItemCategoryLink[] {
  return store.getLinksByItem(itemId).filter((link) => COUNTABLE.has(link.status));
}

function putManualSignal(
  store: ManualCategoryStore,
  itemId: string,
  links: AiItemCategoryLink[],
  now: number
): void {
  const previous = store.getSignal(itemId);
  const primary = links.find((link) => link.isPrimary) ?? links[0];
  const hasAccepted = links.some((link) => link.status === 'accepted');
  store.putSignal({
    itemId,
    textHash: previous?.textHash ?? '',
    classifyTextHash: previous?.classifyTextHash,
    embeddingModel: previous?.embeddingModel ?? 'openai/text-embedding-3-small',
    embedding: previous?.embedding ?? [],
    derivedTags: previous?.derivedTags ?? [],
    tagConfidence: previous?.tagConfidence,
    signalStatus: previous?.signalStatus ?? 'skipped',
    classifyState: hasAccepted ? 'manual_only' : primary ? 'classified' : 'pending_classify',
    discoverState: primary ? 'none' : 'pending',
    isNovelty: !primary,
    classifyRetryCount: primary ? 0 : previous?.classifyRetryCount,
    lastClassifySkipReason: previous?.lastClassifySkipReason,
    eligibilityReason: previous?.eligibilityReason,
    inputQualityTier: previous?.inputQualityTier,
    lastProcessedAt: now,
    lastClassifiedAt: previous?.lastClassifiedAt,
    llmReview: previous?.llmReview,
  });
}

function validateDraft(store: ManualCategoryStore, draft: ManualCategoryDraftInput): {
  name: string;
  description: string;
  kind: AiCategoryKind;
  parent?: AiCategory;
  canonicalTags: string[];
} {
  const name = draft.name?.trim() ?? '';
  const description = draft.description?.trim() ?? '';
  if (!name) throw new Error('Category name is required');
  if (name.length > 120) throw new Error('Category name must be 120 characters or fewer');
  if (description.length > 1200) {
    throw new Error('Category description must be 1,200 characters or fewer');
  }
  if (draft.kind !== 'leaf' && draft.kind !== 'parent') {
    throw new Error('Category kind must be parent or child');
  }
  const normalizedName = normalizeCategoryName(name);
  const duplicate = store
    .getAllCategories()
    .find(
      (category) =>
        category.status !== 'deprecated' &&
        normalizeCategoryName(category.name) === normalizedName
    );
  if (duplicate) throw new Error(`A category named “${duplicate.name}” already exists`);

  const parent = draft.kind === 'leaf' && draft.parentId
    ? store.getCategory(draft.parentId)
    : undefined;
  if (
    draft.kind === 'leaf' &&
    (!parent || parent.kind !== 'parent' || !isManageableTopicCategory(parent))
  ) {
    throw new Error('Choose an active topic parent');
  }
  const canonicalTags = [...new Set((draft.canonicalTags ?? []).map((tag) => tag.trim()).filter(Boolean))]
    .slice(0, 20);
  return { name, description, kind: draft.kind, parent, canonicalTags };
}

function validateCategoryName(
  store: ManualCategoryStore,
  nameInput: string,
  excludeIds: Set<string> = new Set()
): string {
  const name = nameInput?.trim() ?? '';
  if (!name) throw new Error('Category name is required');
  if (name.length > 120) throw new Error('Category name must be 120 characters or fewer');
  const normalizedName = normalizeCategoryName(name);
  const duplicate = store.getAllCategories().find(
    (candidate) =>
      !excludeIds.has(candidate.id) &&
      candidate.status !== 'deprecated' &&
      normalizeCategoryName(candidate.name) === normalizedName
  );
  if (duplicate) throw new Error(`A category named “${duplicate.name}” already exists`);
  return name;
}

function validateDescription(descriptionInput?: string): string {
  const description = descriptionInput?.trim() ?? '';
  if (description.length > 1200) {
    throw new Error('Category description must be 1,200 characters or fewer');
  }
  return description;
}

export function createManualCategoryInStore(
  store: ManualCategoryStore,
  draft: ManualCategoryDraftInput,
  options: { itemId?: string; makePrimary?: boolean } = {},
  now = Date.now()
): ManualCategoryStoreResult {
  const valid = validateDraft(store, draft);
  const itemId = options.itemId?.trim() ?? '';
  if (itemId && !store.getItem(itemId)) throw new Error('Bookmark not found');
  const namedChildInput = valid.kind === 'parent' && draft.child?.name?.trim()
    ? {
        name: validateCategoryName(store, draft.child.name),
        description: validateDescription(draft.child.description),
        canonicalTags: [...new Set(
          (draft.child.canonicalTags ?? []).map((tag) => tag.trim()).filter(Boolean)
        )].slice(0, 20),
      }
    : null;
  if (
    namedChildInput &&
    normalizeCategoryName(namedChildInput.name) === normalizeCategoryName(valid.name)
  ) {
    throw new Error('Parent and child need different names');
  }

  const idBase = `manual_${categorySlug(valid.name)}`;
  let categoryId = idBase;
  let suffix = 2;
  while (
    store.getCategory(categoryId) ||
    (valid.kind === 'parent' && store.getCategory(generalLeafId(categoryId)))
  ) {
    categoryId = `${idBase}-${suffix++}`;
  }
  const category: AiCategory = {
    id: categoryId,
    name: valid.name,
    description: valid.description || undefined,
    kind: valid.kind,
    status: 'manual',
    source: 'manual',
    assignable: valid.kind === 'leaf',
    parentId: valid.kind === 'leaf' ? valid.parent!.id : null,
    parentName: valid.kind === 'leaf' ? valid.parent!.name : null,
    canonicalTags: valid.canonicalTags,
    itemCount: 0,
    primaryItemCount: 0,
    secondaryItemCount: 0,
    childLeafCount: valid.kind === 'parent' ? (namedChildInput ? 2 : 1) : undefined,
    created_at: now,
    updated_at: now,
  };
  const fallbackDefinition = valid.kind === 'parent'
    ? buildGeneralLeafDefinition(category)
    : null;
  const fallbackCategory: AiCategory | null = fallbackDefinition
    ? {
        id: fallbackDefinition.id,
        name: fallbackDefinition.name,
        description: fallbackDefinition.description,
        kind: 'leaf',
        status: 'manual',
        source: 'manual',
        assignable: true,
        parentId: category.id,
        parentName: category.name,
        canonicalTags: fallbackDefinition.canonicalTags,
        isGeneralFallback: true,
        itemCount: 0,
        primaryItemCount: 0,
        secondaryItemCount: 0,
        created_at: now,
        updated_at: now,
      }
    : null;
  let namedChildCategory: AiCategory | null = null;
  if (namedChildInput) {
    const childIdBase = `manual_${categorySlug(namedChildInput.name)}`;
    let childId = childIdBase;
    let childSuffix = 2;
    while (
      store.getCategory(childId) ||
      childId === category.id ||
      childId === fallbackCategory?.id
    ) {
      childId = `${childIdBase}-${childSuffix++}`;
    }
    namedChildCategory = {
      id: childId,
      name: namedChildInput.name,
      description: namedChildInput.description || undefined,
      kind: 'leaf',
      status: 'manual',
      source: 'manual',
      assignable: true,
      parentId: category.id,
      parentName: category.name,
      canonicalTags: namedChildInput.canonicalTags,
      itemCount: 0,
      primaryItemCount: 0,
      secondaryItemCount: 0,
      created_at: now,
      updated_at: now,
    };
  }

  const attachedCategory = valid.kind === 'leaf'
    ? category
    : namedChildCategory ?? fallbackCategory!;

  store.withTransaction(() => {
    store.putCategory(category);
    if (fallbackCategory) store.putCategory(fallbackCategory);
    if (namedChildCategory) store.putCategory(namedChildCategory);
    if (!itemId) return;
    const active = activeLinks(store, itemId);
    const shouldBePrimary = options.makePrimary !== false || !active.some((link) => link.isPrimary);
    if (shouldBePrimary) {
      for (const link of active) {
        if (link.isPrimary) store.putLink({ ...link, isPrimary: false, updated_at: now });
      }
    }
    store.putLink({
      id: `link_${itemId}_${attachedCategory.id}`,
      itemId,
      categoryId: attachedCategory.id,
      score: 1,
      isPrimary: shouldBePrimary,
      source: 'manual',
      status: 'accepted',
      created_at: now,
      updated_at: now,
    });
    putManualSignal(store, itemId, activeLinks(store, itemId), now);
  });

  return {
    category,
    attachedCategoryId: itemId ? attachedCategory.id : undefined,
    links: itemId ? store.getLinksByItem(itemId) : [],
  };
}

export function updateManualCategoryInStore(
  store: ManualCategoryStore,
  categoryIdInput: string,
  input: { name: string; description?: string },
  now = Date.now()
): ManualCategoryStoreResult {
  const categoryId = categoryIdInput.trim();
  const category = store.getCategory(categoryId);
  if (!isUserCategory(category)) throw new Error('Only categories created by you can be edited');

  const children = category.kind === 'parent'
    ? store.getAllCategories().filter((candidate) => candidate.parentId === category.id)
    : [];
  const fallback = children.find((candidate) => candidate.isGeneralFallback);
  const excludedIds = new Set([category.id, ...(fallback ? [fallback.id] : [])]);
  const name = validateCategoryName(store, input.name, excludedIds);
  const description = validateDescription(input.description);
  const updatedCategory: AiCategory = {
    ...category,
    name,
    description: description || undefined,
    updated_at: now,
  };
  const fallbackDefinition = fallback ? buildGeneralLeafDefinition(updatedCategory) : null;
  if (fallbackDefinition) validateCategoryName(store, fallbackDefinition.name, excludedIds);

  store.withTransaction(() => {
    store.putCategory(updatedCategory);
    store.deleteCategorySearchProfile(updatedCategory.id);
    for (const child of children) {
      const updatedChild: AiCategory = child.id === fallback?.id && fallbackDefinition
        ? {
            ...child,
            name: fallbackDefinition.name,
            description: fallbackDefinition.description,
            canonicalTags: fallbackDefinition.canonicalTags,
            parentName: name,
            updated_at: now,
          }
        : { ...child, parentName: name, updated_at: now };
      store.putCategory(updatedChild);
      store.deleteCategorySearchProfile(updatedChild.id);
    }
  });

  return { category: updatedCategory };
}

export function deleteManualCategoryInStore(
  store: ManualCategoryStore,
  categoryIdInput: string,
  now = Date.now()
): ManualCategoryStoreResult {
  const categoryId = categoryIdInput.trim();
  const category = store.getCategory(categoryId);
  if (!isUserCategory(category)) throw new Error('Only categories created by you can be deleted');
  if (category.isGeneralFallback) {
    throw new Error('The automatic fallback belongs to its parent; edit or delete the parent instead');
  }

  const children = category.kind === 'parent'
    ? store.getAllCategories().filter((candidate) => candidate.parentId === category.id)
    : [];
  const targets = [...children, category];
  const affectedItemIds = [...new Set(
    targets.flatMap((target) => store.getLinksByCategory(target.id).map((link) => link.itemId))
  )];

  store.withTransaction(() => {
    // Children must be removed explicitly: the schema intentionally uses
    // ON DELETE SET NULL for ordinary hierarchy edits.
    for (const target of targets) {
      store.deleteCategorySearchProfile(target.id);
      store.deleteCategory(target.id);
    }
    for (const itemId of affectedItemIds) {
      let links = activeLinks(store, itemId);
      if (links.length && !links.some((link) => link.isPrimary)) {
        const nextPrimary = [...links].sort(
          (left, right) =>
            Number(right.status === 'accepted') - Number(left.status === 'accepted') ||
            right.score - left.score ||
            left.created_at - right.created_at
        )[0];
        store.putLink({ ...nextPrimary, isPrimary: true, updated_at: now });
        links = activeLinks(store, itemId);
      }
      putManualSignal(store, itemId, links, now);
    }
  });

  return {
    deletedCategoryIds: targets.map((target) => target.id),
    affectedItemIds,
  };
}

export type ManualCategoryAction = 'add' | 'accept' | 'reject' | 'remove' | 'primary';

export function manageItemCategoryInStore(
  store: ManualCategoryStore,
  itemId: string,
  categoryId: string,
  action: ManualCategoryAction,
  now = Date.now()
): ManualCategoryStoreResult {
  if (!itemId.trim() || !categoryId.trim()) throw new Error('Bookmark and category are required');
  if (!store.getItem(itemId)) throw new Error('Bookmark not found');
  const category = store.getCategory(categoryId);
  if (
    !category ||
    category.kind !== 'leaf' ||
    category.assignable === false ||
    !isManageableTopicCategory(category)
  ) {
    throw new Error('Choose an active child category');
  }

  store.withTransaction(() => {
    let links = store.getLinksByItem(itemId);
    const existing = links.find((link) => link.categoryId === categoryId);
    if ((action === 'reject' || action === 'remove' || action === 'primary') && !existing) {
      throw new Error('This bookmark is not linked to that category');
    }

    if (action === 'add' || action === 'accept') {
      const active = links.filter((link) => COUNTABLE.has(link.status));
      const shouldBePrimary = existing?.isPrimary || !active.some((link) => link.isPrimary);
      store.putLink({
        id: existing?.id ?? `link_${itemId}_${categoryId}`,
        itemId,
        categoryId,
        score: Math.max(existing?.score ?? 0, action === 'add' ? 1 : 0.5),
        isPrimary: Boolean(shouldBePrimary),
        source: action === 'add' ? 'manual' : existing?.source ?? 'ai',
        status: 'accepted',
        created_at: existing?.created_at ?? now,
        updated_at: now,
      });
    } else if (action === 'reject' || action === 'remove') {
      store.putLink({ ...existing!, isPrimary: false, status: 'rejected', updated_at: now });
    } else {
      if (!COUNTABLE.has(existing!.status)) {
        throw new Error('Restore this category before making it primary');
      }
      for (const link of links) {
        if (link.categoryId !== categoryId && link.isPrimary && COUNTABLE.has(link.status)) {
          store.putLink({ ...link, isPrimary: false, updated_at: now });
        }
      }
      store.putLink({ ...existing!, isPrimary: true, status: 'accepted', updated_at: now });
    }

    links = activeLinks(store, itemId);
    if (links.length && !links.some((link) => link.isPrimary)) {
      const nextPrimary = [...links].sort(
        (left, right) =>
          Number(right.status === 'accepted') - Number(left.status === 'accepted') ||
          right.score - left.score ||
          left.created_at - right.created_at
      )[0];
      store.putLink({ ...nextPrimary, isPrimary: true, updated_at: now });
      links = activeLinks(store, itemId);
    }
    putManualSignal(store, itemId, links, now);
  });

  return { links: store.getLinksByItem(itemId) };
}
