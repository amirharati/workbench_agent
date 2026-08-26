import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Pencil, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import {
  createManualCategory,
  deleteManualCategory,
  findSimilarCategories,
  getCategoryManagementSnapshot,
  manageItemCategory,
  proposeCategoryDescription,
  proposeCategoryStructure,
  queueNovelTopicProposalForReclassify,
  updateManualCategory,
  type CategoryDraft,
  type CategoryManagementSnapshot,
  type CategorySimilarityMatch,
  type CategorySimilarityResult,
} from '../../lib/categorization/categoryManagement';
import { normalizeCategoryName, rankCategoryNames } from '../../lib/categorization/categorySimilarity';
import type { AiCategory } from '../../lib/categorization/types';
import { isManageableTopicCategory } from '../../lib/search/categorySearchProfiles';
import { categoryColorStyle } from '../shared/categoryColor';
import { useToast } from '../ToastContainer';
import { DialogShell } from './DialogShell';

type ManageCategoriesDialogProps = {
  itemId?: string;
  itemTitle?: string;
  onClose: () => void;
  onChanged?: () => void;
};

function categoryPath(category: AiCategory): string {
  return category.kind === 'leaf' && category.parentName
    ? `${category.parentName} › ${category.name}`
    : category.name;
}

function CategoryNameWithParent({ category }: { category: AiCategory }) {
  const parentName = category.kind === 'leaf' && category.parentName?.trim() !== category.name.trim()
    ? category.parentName?.trim()
    : undefined;
  return (
    <>
      <strong
        className="ui-category-name"
        style={categoryColorStyle({
          categoryId: category.id,
          label: category.name,
          parentLabel: category.parentName ?? undefined,
        })}
      >
        {category.name}
      </strong>
      {parentName ? (
        <small className="ui-category-manager__category-parent">{parentName}</small>
      ) : null}
    </>
  );
}

function isUserEditableCategory(category: AiCategory): boolean {
  return (category.source === 'manual' || category.status === 'manual') && !category.isGeneralFallback;
}

function initialDraft(snapshot: CategoryManagementSnapshot | null): CategoryDraft {
  const proposed = snapshot?.signal?.llmReview?.novelTopicSuggestion;
  return {
    name: proposed?.name ?? '',
    description: proposed?.description ?? '',
    kind: 'leaf',
    parentId: proposed?.parentId,
    canonicalTags: proposed?.canonicalTags ?? [],
  };
}

function localIntentMatches(
  intent: string,
  categories: AiCategory[]
): CategorySimilarityMatch[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  return rankCategoryNames(intent, '', categories, 24)
    .map((match) => {
      const category = byId.get(match.categoryId);
      return category
        ? {
            category,
            score: match.score,
            lexicalScore: match.score,
            semanticScore: 0,
            exact: match.exact,
          }
        : null;
    })
    .filter((match): match is CategorySimilarityMatch => match != null);
}

export const ManageCategoriesDialog: React.FC<ManageCategoriesDialogProps> = ({
  itemId,
  itemTitle,
  onClose,
  onChanged,
}) => {
  const { addToast } = useToast();
  const [snapshot, setSnapshot] = useState<CategoryManagementSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<CategoryDraft>({
    name: '',
    description: '',
    kind: 'leaf',
    canonicalTags: [],
  });
  const [intent, setIntent] = useState('');
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalWarning, setProposalWarning] = useState<string | null>(null);
  const [makePrimary, setMakePrimary] = useState(true);
  const [similar, setSimilar] = useState<CategorySimilarityResult | null>(null);
  const [checkingSimilar, setCheckingSimilar] = useState(false);
  const [parentQuery, setParentQuery] = useState('');
  const [parentSimilar, setParentSimilar] = useState<CategorySimilarityResult | null>(null);
  const [checkingParents, setCheckingParents] = useState(false);
  const [childSimilar, setChildSimilar] = useState<CategorySimilarityResult | null>(null);
  const [checkingChildren, setCheckingChildren] = useState(false);
  const [descriptionBusy, setDescriptionBusy] = useState<'parent' | 'child' | null>(null);
  const [browseAllParents, setBrowseAllParents] = useState(false);
  const [selectedExistingParentId, setSelectedExistingParentId] = useState<string | null>(null);
  const [creationOpen, setCreationOpen] = useState(false);
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const similaritySeq = useRef(0);
  const parentSimilaritySeq = useRef(0);
  const childSimilaritySeq = useRef(0);
  const descriptionSeq = useRef(0);
  const proposalSeq = useRef(0);
  const similarityCache = useRef(new Map<string, CategorySimilarityResult>());
  const parentSimilarityCache = useRef(new Map<string, CategorySimilarityResult>());
  const childSimilarityCache = useRef(new Map<string, CategorySimilarityResult>());
  const creationSectionRef = useRef<HTMLElement>(null);
  const editingSectionRef = useRef<HTMLElement>(null);
  const deleteConfirmRef = useRef<HTMLDivElement>(null);
  const revealTimerRef = useRef<number | null>(null);

  const revealAfterClick = (ref: React.RefObject<HTMLElement | null>) => {
    if (revealTimerRef.current != null) window.clearTimeout(revealTimerRef.current);
    revealTimerRef.current = window.setTimeout(() => {
      ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      revealTimerRef.current = null;
    }, 0);
  };

  useEffect(() => () => {
    if (revealTimerRef.current != null) window.clearTimeout(revealTimerRef.current);
  }, []);

  const reload = async (preserveDraft = true) => {
    const next = await getCategoryManagementSnapshot(itemId);
    setSnapshot(next);
    if (!preserveDraft) setDraft(initialDraft(next));
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getCategoryManagementSnapshot(itemId).then((next) => {
      if (!active) return;
      const nextDraft = initialDraft(next);
      setSnapshot(next);
      setDraft(nextDraft);
      setIntent(nextDraft.name);
      setParentQuery(
        next.categories.find((category) => category.id === nextDraft.parentId)?.name ?? nextDraft.name
      );
      setCreationOpen(Boolean(next.signal?.llmReview?.novelTopicSuggestion));
      setLoading(false);
    }).catch((error) => {
      if (!active) return;
      setLoading(false);
      addToast({ type: 'error', message: `Could not load categories: ${String(error)}` });
    });
    return () => { active = false; };
  }, [itemId]);

  const categories = useMemo(
    () => (snapshot?.categories ?? []).filter(isManageableTopicCategory),
    [snapshot]
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const activeLinks = useMemo(
    () => (snapshot?.links ?? []).filter((link) => link.status !== 'rejected'),
    [snapshot]
  );
  const activeCategoryIds = useMemo(
    () => new Set(activeLinks.map((link) => link.categoryId)),
    [activeLinks]
  );
  const parents = useMemo(
    () => categories.filter((category) => category.kind === 'parent'),
    [categories]
  );
  const leaves = useMemo(
    () => categories.filter((category) => category.kind === 'leaf' && category.assignable !== false),
    [categories]
  );

  const draftKey = normalizeCategoryName(intent);
  const localMatches = useMemo(
    () => localIntentMatches(intent, categories),
    [draftKey, categories]
  );
  useEffect(() => {
    const seq = ++similaritySeq.current;
    setSimilar(null);
    setCheckingSimilar(false);
    if (normalizeCategoryName(intent).length < 2 || !categories.length) return;
    const cached = similarityCache.current.get(draftKey);
    if (cached) {
      setSimilar(cached);
      return;
    }
    const timer = window.setTimeout(() => {
      setCheckingSimilar(true);
      void findSimilarCategories({ ...draft, name: intent, description: '' }, categories)
        .then((result) => {
          similarityCache.current.set(draftKey, result);
          if (seq === similaritySeq.current) setSimilar(result);
        })
        .catch((error) => {
          if (seq === similaritySeq.current) {
            setSimilar({
              matches: localMatches,
              semanticAvailable: false,
              semanticWarning: String(error),
            });
          }
        })
        .finally(() => {
          if (seq === similaritySeq.current) setCheckingSimilar(false);
        });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draftKey, categories]);

  const intentMatches = (similar?.matches?.length ? similar.matches : localMatches).slice(0, 20);
  const matchedParents = intentMatches
    .filter((match) => match.category.kind === 'parent')
    .slice(0, 4);
  const expandedChildren = expandedParentId
    ? leaves
        .filter((category) => category.parentId === expandedParentId)
        .sort((left, right) => {
          const leftGeneral = /\bgeneral\b|\bother\b/i.test(left.name);
          const rightGeneral = /\bgeneral\b|\bother\b/i.test(right.name);
          return Number(rightGeneral) - Number(leftGeneral) || left.name.localeCompare(right.name);
        })
    : [];

  const parentIntent = draft.kind === 'parent' ? draft.name : parentQuery;
  const parentIntentKey = normalizeCategoryName(parentIntent);
  const localParentFieldMatches = useMemo(
    () => localIntentMatches(parentIntent, categories),
    [parentIntentKey, categories]
  );
  useEffect(() => {
    const seq = ++parentSimilaritySeq.current;
    setParentSimilar(null);
    setCheckingParents(false);
    if (parentIntentKey.length < 2 || !categories.length || !creationOpen) return;
    const cached = parentSimilarityCache.current.get(parentIntentKey);
    if (cached) {
      setParentSimilar(cached);
      return;
    }
    const timer = window.setTimeout(() => {
      setCheckingParents(true);
      void findSimilarCategories(
        { name: parentIntent, description: '', kind: 'parent', canonicalTags: [] },
        categories
      ).then((result) => {
        parentSimilarityCache.current.set(parentIntentKey, result);
        if (seq === parentSimilaritySeq.current) setParentSimilar(result);
      }).catch((error) => {
        if (seq === parentSimilaritySeq.current) {
          setParentSimilar({
            matches: localParentFieldMatches,
            semanticAvailable: false,
            semanticWarning: String(error),
          });
        }
      }).finally(() => {
        if (seq === parentSimilaritySeq.current) setCheckingParents(false);
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [parentIntentKey, categories, creationOpen]);

  const parentFieldMatches = (
    parentSimilar?.matches?.length ? parentSimilar.matches : localParentFieldMatches
  )
    .filter((match) => match.category.kind === 'parent')
    .slice(0, 10);

  const childIntent = draft.kind === 'parent' ? draft.child?.name ?? '' : draft.name;
  const childIntentKey = normalizeCategoryName(childIntent);
  const localChildMatches = useMemo(
    () => localIntentMatches(childIntent, categories),
    [childIntentKey, categories]
  );
  useEffect(() => {
    const seq = ++childSimilaritySeq.current;
    setChildSimilar(null);
    setCheckingChildren(false);
    if (childIntentKey.length < 2 || !categories.length || !creationOpen) return;
    const cached = childSimilarityCache.current.get(childIntentKey);
    if (cached) {
      setChildSimilar(cached);
      return;
    }
    const timer = window.setTimeout(() => {
      setCheckingChildren(true);
      void findSimilarCategories(
        { name: childIntent, description: '', kind: 'leaf', canonicalTags: [] },
        categories
      ).then((result) => {
        childSimilarityCache.current.set(childIntentKey, result);
        if (seq === childSimilaritySeq.current) setChildSimilar(result);
      }).catch((error) => {
        if (seq === childSimilaritySeq.current) {
          setChildSimilar({
            matches: localChildMatches,
            semanticAvailable: false,
            semanticWarning: String(error),
          });
        }
      }).finally(() => {
        if (seq === childSimilaritySeq.current) setCheckingChildren(false);
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [childIntentKey, categories, creationOpen]);

  const childMatchesByName = new Map<string, CategorySimilarityMatch>();
  for (const match of childSimilar?.matches?.length ? childSimilar.matches : localChildMatches) {
    if (match.category.kind !== 'leaf') continue;
    const key = normalizeCategoryName(match.category.name);
    if (!childMatchesByName.has(key)) childMatchesByName.set(key, match);
  }
  const childMatches = [...childMatchesByName.values()].slice(0, 10);

  const runItemAction = async (
    categoryId: string,
    action: 'add' | 'accept' | 'reject' | 'remove' | 'primary'
  ): Promise<boolean> => {
    if (!itemId) return false;
    setBusyKey(`${action}:${categoryId}`);
    try {
      await manageItemCategory(itemId, categoryId, action);
      await reload();
      onChanged?.();
      addToast({
        type: 'success',
        message:
          action === 'remove' || action === 'reject'
            ? 'Category removed from this bookmark'
            : action === 'primary'
              ? 'Primary category updated'
              : 'Category added',
      });
      return true;
    } catch (error) {
      addToast({ type: 'error', message: `Could not update category: ${String(error)}` });
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const chooseNewChild = (parentId?: string) => {
    const seq = ++proposalSeq.current;
    descriptionSeq.current += 1;
    setDescriptionBusy(null);
    setSelectedExistingParentId(null);
    const parent = parentId ? categoryById.get(parentId) : undefined;
    setDraft({ name: intent.trim(), description: '', kind: 'leaf', parentId, canonicalTags: [] });
    setParentQuery(parent?.name ?? intent.trim());
    setBrowseAllParents(false);
    setCreationOpen(true);
    setProposalLoading(true);
    setProposalWarning(null);
    revealAfterClick(creationSectionRef);
    void proposeCategoryStructure({
      intent,
      mode: 'child',
      existingParent: parent,
      nearbyCategories: intentMatches.map((match) => match.category),
    }).then((proposal) => {
      if (seq !== proposalSeq.current) return;
      setDraft({
        name: proposal.childName,
        description: proposal.childDescription ?? '',
        kind: 'leaf',
        parentId,
        canonicalTags: [],
      });
      setProposalWarning(proposal.warning ?? null);
    }).catch((error) => {
      if (seq !== proposalSeq.current) return;
      setProposalWarning(String(error));
    }).finally(() => {
      if (seq === proposalSeq.current) setProposalLoading(false);
    });
  };

  const chooseNewParent = () => {
    const seq = ++proposalSeq.current;
    descriptionSeq.current += 1;
    setDescriptionBusy(null);
    setSelectedExistingParentId(null);
    setDraft({
      name: intent.trim(),
      description: '',
      kind: 'parent',
      canonicalTags: [],
      child: { name: '', description: '', canonicalTags: [] },
    });
    setParentQuery(intent.trim());
    setBrowseAllParents(false);
    setCreationOpen(true);
    setProposalLoading(true);
    setProposalWarning(null);
    revealAfterClick(creationSectionRef);
    void proposeCategoryStructure({
      intent,
      mode: 'parent_child',
      nearbyCategories: intentMatches.map((match) => match.category),
    }).then((proposal) => {
      if (seq !== proposalSeq.current) return;
      setDraft({
        name: proposal.parentName ?? intent.trim(),
        description: proposal.parentDescription ?? '',
        kind: 'parent',
        canonicalTags: [],
        child: {
          name: proposal.childName,
          description: proposal.childDescription ?? '',
          canonicalTags: [],
        },
      });
      setProposalWarning(proposal.warning ?? null);
    }).catch((error) => {
      if (seq !== proposalSeq.current) return;
      setProposalWarning(String(error));
    }).finally(() => {
      if (seq === proposalSeq.current) setProposalLoading(false);
    });
  };

  const generateChildDescription = async (
    name: string,
    parent: Pick<AiCategory, 'name' | 'description'> | undefined
  ) => {
    if (name.trim().length < 2 || !parent) return;
    const seq = ++descriptionSeq.current;
    setDescriptionBusy('child');
    setDraft((value) => value.kind === 'parent'
      ? {
          ...value,
          child: {
            ...(value.child ?? { name: name.trim() }),
            description: '',
          },
        }
      : { ...value, description: '' });
    try {
      const result = await proposeCategoryDescription({
        name: name.trim(),
        kind: 'leaf',
        parent,
      });
      if (seq !== descriptionSeq.current) return;
      setDraft((value) => value.kind === 'parent'
        ? {
            ...value,
            child: {
              ...(value.child ?? { name: name.trim() }),
              description: result.description,
            },
          }
        : { ...value, description: result.description });
      setProposalWarning(result.warning ?? null);
    } catch (error) {
      if (seq === descriptionSeq.current) setProposalWarning(String(error));
    } finally {
      if (seq === descriptionSeq.current) setDescriptionBusy(null);
    }
  };

  const selectParent = (parent: AiCategory) => {
    setDraft((value) => ({ ...value, parentId: parent.id }));
    setParentQuery(parent.name);
    setBrowseAllParents(false);
    const childName = draft.kind === 'parent' ? draft.child?.name ?? '' : draft.name;
    if (childName.trim()) void generateChildDescription(childName, parent);
  };

  const useExistingParentForDraft = (parent: AiCategory) => {
    if (draft.kind !== 'parent') {
      selectParent(parent);
      return;
    }
    setSelectedExistingParentId(parent.id);
    setParentQuery(parent.name);
    setBrowseAllParents(false);
    setProposalWarning(null);
    const childName = draft.child?.name ?? '';
    if (childName.trim()) void generateChildDescription(childName, parent);
  };

  const draftForSubmission = (): CategoryDraft => {
    if (draft.kind !== 'parent' || !selectedExistingParentId) return draft;
    return {
      name: draft.child?.name?.trim() || intent.trim(),
      description: draft.child?.description ?? '',
      kind: 'leaf',
      parentId: selectedExistingParentId,
      canonicalTags: draft.child?.canonicalTags ?? [],
    };
  };

  const reuseChildName = (category: AiCategory) => {
    if (category.kind !== 'leaf') return;
    const parent = draft.kind === 'parent'
      ? categoryById.get(selectedExistingParentId ?? '') ?? {
          name: draft.name,
          description: draft.description,
        }
      : categoryById.get(draft.parentId ?? '');
    if (draft.kind === 'parent') {
      setDraft((value) => ({
        ...value,
        child: {
          name: category.name,
          description: '',
          canonicalTags: category.canonicalTags ?? [],
        },
      }));
    } else {
      setDraft((value) => ({
        ...value,
        name: category.name,
        description: '',
        canonicalTags: category.canonicalTags ?? [],
      }));
    }
    void generateChildDescription(category.name, parent);
  };

  const refreshDraftDescription = async (field: 'parent' | 'child') => {
    const name = field === 'parent'
      ? draft.name.trim()
      : draft.kind === 'parent'
        ? draft.child?.name?.trim() ?? ''
        : draft.name.trim();
    if (name.length < 2) return;
    const seq = ++descriptionSeq.current;
    setDescriptionBusy(field);
    const parentContext = field === 'child'
      ? draft.kind === 'parent'
        ? categoryById.get(selectedExistingParentId ?? '') ?? {
            name: draft.name,
            description: draft.description,
          }
        : selectedParent
      : undefined;
    try {
      const result = await proposeCategoryDescription({
        name,
        kind: field === 'parent' ? 'parent' : 'leaf',
        parent: parentContext,
      });
      if (seq !== descriptionSeq.current) return;
      if (result.description) {
        setDraft((value) => field === 'parent'
          ? { ...value, description: result.description }
          : value.kind === 'parent'
            ? {
                ...value,
                child: {
                  ...(value.child ?? { name }),
                  description: result.description,
                },
              }
            : { ...value, description: result.description });
      }
      setProposalWarning(result.warning ?? null);
      if (field === 'parent' && draft.kind === 'parent' && draft.child?.name.trim()) {
        void generateChildDescription(draft.child.name, {
          name,
          description: result.description,
        });
      }
    } catch (error) {
      if (seq === descriptionSeq.current) setProposalWarning(String(error));
    } finally {
      if (seq === descriptionSeq.current) setDescriptionBusy(null);
    }
  };

  const beginEdit = (category: AiCategory) => {
    setEditingCategoryId(category.id);
    setEditName(category.name);
    setEditDescription(category.description ?? '');
    setDeleteConfirmOpen(false);
    revealAfterClick(editingSectionRef);
  };

  const showDeleteConfirmation = () => {
    setDeleteConfirmOpen(true);
    revealAfterClick(deleteConfirmRef);
  };

  const closeEdit = () => {
    setEditingCategoryId(null);
    setEditName('');
    setEditDescription('');
    setDeleteConfirmOpen(false);
  };

  const saveEdit = async () => {
    if (!editingCategoryId) return;
    setBusyKey(`edit:${editingCategoryId}`);
    try {
      await updateManualCategory(editingCategoryId, {
        name: editName,
        description: editDescription,
      });
      await reload();
      onChanged?.();
      addToast({ type: 'success', message: 'Category updated' });
      closeEdit();
    } catch (error) {
      addToast({ type: 'error', message: `Could not update category: ${String(error)}` });
    } finally {
      setBusyKey(null);
    }
  };

  const deleteEditedCategory = async () => {
    if (!editingCategoryId) return;
    setBusyKey(`delete:${editingCategoryId}`);
    try {
      await deleteManualCategory(editingCategoryId);
      await reload();
      onChanged?.();
      addToast({ type: 'success', message: 'Category removed; bookmarks were not deleted' });
      closeEdit();
    } catch (error) {
      addToast({ type: 'error', message: `Could not delete category: ${String(error)}` });
    } finally {
      setBusyKey(null);
    }
  };

  const create = async () => {
    setBusyKey('create');
    try {
      const result = await createManualCategory(draftForSubmission(), { itemId, makePrimary });
      if (itemId) {
        const attached = result.links?.find(
          (link) =>
            (link.status === 'accepted' || link.status === 'suggested') &&
            (
              link.categoryId === result.attachedCategoryId ||
              (!result.attachedCategoryId &&
                link.source === 'manual' &&
                !activeCategoryIds.has(link.categoryId))
            )
        );
        if (!attached) {
          throw new Error('The category was not attached to the current bookmark');
        }
      }
      await reload();
      onChanged?.();
      addToast({
        type: 'success',
        message: itemId ? 'Category created and added' : 'Category created',
      });
      setDraft({ name: '', description: '', kind: 'leaf', canonicalTags: [] });
      setIntent('');
      setSimilar(null);
      setCreationOpen(false);
      setProposalWarning(null);
      setExpandedParentId(null);
      setParentQuery('');
      setParentSimilar(null);
      setChildSimilar(null);
      setBrowseAllParents(false);
      setSelectedExistingParentId(null);
      descriptionSeq.current += 1;
      setDescriptionBusy(null);
    } catch (error) {
      addToast({ type: 'error', message: `Could not create category: ${String(error)}` });
    } finally {
      setBusyKey(null);
    }
  };

  const submissionDraft = draftForSubmission();
  const exactDuplicate = categories.find(
    (category) =>
      category.kind === submissionDraft.kind &&
      (submissionDraft.kind === 'parent' || category.parentId === submissionDraft.parentId) &&
      normalizeCategoryName(category.name) === normalizeCategoryName(submissionDraft.name)
  );
  const canCreate =
    Boolean(submissionDraft.name.trim()) &&
    !exactDuplicate &&
    (submissionDraft.kind !== 'parent' || Boolean(submissionDraft.child?.name.trim())) &&
    (submissionDraft.kind !== 'parent' || normalizeCategoryName(submissionDraft.name) !== normalizeCategoryName(submissionDraft.child?.name ?? '')) &&
    (submissionDraft.kind === 'parent' || Boolean(submissionDraft.parentId)) &&
    busyKey == null &&
    !proposalLoading &&
    descriptionBusy == null;
  const canAddExistingChild = Boolean(
    itemId &&
    exactDuplicate?.kind === 'leaf' &&
    !activeCategoryIds.has(exactDuplicate.id) &&
    busyKey == null &&
    !proposalLoading
  );
  const submitCreation = async () => {
    if (canAddExistingChild && exactDuplicate) {
      const added = await runItemAction(exactDuplicate.id, 'add');
      if (added) {
        setCreationOpen(false);
        setSelectedExistingParentId(null);
      }
      return;
    }
    await create();
  };
  const hasIntent = normalizeCategoryName(intent).length >= 2;
  const proposedDraft = snapshot?.signal?.llmReview?.novelTopicSuggestion;
  const novelTopicProposals = snapshot?.novelTopicProposals ?? [];
  const editingCategory = editingCategoryId ? categoryById.get(editingCategoryId) : undefined;
  const editingChildren = editingCategory?.kind === 'parent'
    ? categories.filter((category) => category.parentId === editingCategory.id)
    : [];
  const selectedParent = draft.parentId ? categoryById.get(draft.parentId) : undefined;
  const selectedStructureParent = selectedExistingParentId
    ? categoryById.get(selectedExistingParentId)
    : undefined;

  const reviewNovelTopicProposal = (group: CategoryManagementSnapshot['novelTopicProposals'][number]) => {
    const proposal = group.proposal;
    setIntent(proposal.name);
    setDraft({
      name: proposal.name,
      description: proposal.description ?? '',
      kind: 'leaf',
      parentId: proposal.parentId,
      canonicalTags: proposal.canonicalTags ?? [],
    });
    setParentQuery(
      categoryById.get(proposal.parentId ?? '')?.name ?? proposal.name
    );
    setCreationOpen(false);
    setProposalWarning(null);
    setSelectedExistingParentId(null);
  };

  const queueNovelTopicProposal = async (
    group: CategoryManagementSnapshot['novelTopicProposals'][number]
  ) => {
    setBusyKey(`proposal:${group.key}`);
    try {
      const result = await queueNovelTopicProposalForReclassify(group.key);
      await reload();
      onChanged?.();
      addToast({
        type: result.queuedCount ? 'success' : 'info',
        message: result.queuedCount
          ? `${result.queuedCount} bookmark${result.queuedCount === 1 ? '' : 's'} added to the Classify queue`
          : 'These bookmarks are already queued or now have a category',
      });
    } catch (error) {
      addToast({ type: 'error', message: `Could not queue bookmarks: ${String(error)}` });
    } finally {
      setBusyKey(null);
    }
  };

  const renderChildMatches = (bounded = false) => childIntentKey.length >= 2 ? (
    <div className={`ui-category-manager__parent-results ui-category-manager__field-matches${bounded ? ' ui-category-manager__field-matches--bounded' : ''}`}>
      <div className="ui-category-manager__parent-results-heading">
        <span>Existing matches for this child</span>
        <span>
          {checkingChildren
            ? 'Searching meaning…'
            : childSimilar?.semanticAvailable
              ? 'Semantic + name search'
              : 'Name search'}
          </span>
      </div>
      <div className={bounded ? 'ui-category-manager__match-scroll' : undefined}>
        {childMatches.length ? childMatches.slice(0, 8).map((match) => {
          const category = match.category;
          return (
            <div className="ui-category-manager__parent-result" key={category.id}>
              <div>
                <CategoryNameWithParent category={category} />
                <span>
                  {Math.round(match.score * 100)}% match
                  {category.description ? ` · ${category.description}` : ''}
                </span>
              </div>
              <button
                className="ui-button ui-button--compact ui-button--secondary"
                type="button"
                onClick={() => reuseChildName(category)}
              >
                Use child
              </button>
            </div>
          );
        }) : !checkingChildren ? (
          <p className="ui-category-manager__muted">No similar existing category found.</p>
        ) : null}
        {childSimilar?.semanticWarning ? (
          <p className="ui-category-manager__warning">{childSimilar.semanticWarning}</p>
        ) : null}
      </div>
    </div>
  ) : null;

  const renderProposedParentMatches = () => parentIntentKey.length >= 2 ? (
    <div className="ui-category-manager__parent-results ui-category-manager__field-matches ui-category-manager__field-matches--bounded ui-category-manager__parent-results--duplicate-check">
      <div className="ui-category-manager__parent-results-heading">
        <span>Existing matches for this parent</span>
        <span>
          {checkingParents
            ? 'Searching meaning…'
            : parentSimilar?.semanticAvailable
              ? 'Semantic + name search'
              : 'Name search'}
        </span>
      </div>
      <div className="ui-category-manager__match-scroll">
        {parentFieldMatches.length ? parentFieldMatches.slice(0, 8).map((match) => (
          <div className="ui-category-manager__parent-result" key={match.category.id}>
            <div>
              <strong>{match.category.name}</strong>
              <span>
                {Math.round(match.score * 100)}% match
                {match.category.description ? ` · ${match.category.description}` : ''}
              </span>
            </div>
            <button
              className={`ui-button ui-button--compact ${selectedExistingParentId === match.category.id ? 'ui-button--primary' : 'ui-button--secondary'}`}
              type="button"
              disabled={proposalLoading || selectedExistingParentId === match.category.id}
              onClick={() => useExistingParentForDraft(match.category)}
            >
              {selectedExistingParentId === match.category.id ? 'Selected' : 'Use parent'}
            </button>
          </div>
        )) : !checkingParents ? (
          <p className="ui-category-manager__muted">No similar existing parent found.</p>
        ) : null}
      </div>
    </div>
  ) : null;

  const renderParentFinder = () => (
    <div className="ui-category-manager__parent-finder">
      <label className="ui-form__group">
        <span className="ui-form__label">Find a parent</span>
        <span className="ui-category-manager__search ui-category-manager__search--parent">
          <Search size={15} />
          <input
            className="ui-field"
            disabled={proposalLoading}
            value={parentQuery}
            onChange={(event) => {
              const value = event.target.value;
              setParentQuery(value);
              if (
                selectedParent &&
                normalizeCategoryName(value) !== normalizeCategoryName(selectedParent.name)
              ) {
                setDraft((current) => ({ ...current, parentId: undefined }));
              }
            }}
            placeholder="Search by name or meaning, e.g. AI"
          />
        </span>
        <span className="ui-form__help">
          Search checks parent names, descriptions, tags, and semantic meaning.
        </span>
      </label>

      {selectedParent ? (
        <div className="ui-category-manager__selected-parent">
          <div>
            <span>Selected parent</span>
            <strong>{selectedParent.name}</strong>
            {selectedParent.description ? <small>{selectedParent.description}</small> : null}
          </div>
          <Check size={15} />
        </div>
      ) : null}

      {parentIntentKey.length >= 2 ? (
        <div className="ui-category-manager__parent-results">
          <div className="ui-category-manager__parent-results-heading">
            <span>Best matching parents</span>
            <span>
              {checkingParents
                ? 'Searching meaning…'
                : parentSimilar?.semanticAvailable
                  ? 'Semantic + name search'
                  : 'Name search'}
            </span>
          </div>
          {parentFieldMatches.length ? parentFieldMatches.slice(0, 10).map((match) => (
            <div className="ui-category-manager__parent-result" key={match.category.id}>
              <div>
                <strong>{match.category.name}</strong>
                <span>
                  {Math.round(match.score * 100)}% match
                  {match.category.description ? ` · ${match.category.description}` : ''}
                </span>
              </div>
              <button
                className="ui-button ui-button--compact ui-button--secondary"
                type="button"
                disabled={proposalLoading || draft.parentId === match.category.id}
                onClick={() => selectParent(match.category)}
              >
                {draft.parentId === match.category.id ? 'Selected' : 'Use parent'}
              </button>
            </div>
          )) : !checkingParents ? (
            <p className="ui-category-manager__muted">No matching parent yet. Try a broader idea.</p>
          ) : null}
        </div>
      ) : null}

      <button
        className="ui-button ui-button--compact ui-button--ghost ui-category-manager__browse-all"
        type="button"
        onClick={() => setBrowseAllParents((value) => !value)}
      >
        {browseAllParents ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        Browse all parents instead
      </button>
      {browseAllParents ? (
        <label className="ui-form__group ui-category-manager__parent-fallback">
          <span className="ui-form__label">All parents</span>
          <select
            className="ui-field"
            aria-label="Browse all parents"
            disabled={proposalLoading}
            value={draft.parentId ?? ''}
            onChange={(event) => {
              const parent = categoryById.get(event.target.value);
              if (parent) selectParent(parent);
            }}
          >
            <option value="">Choose a parent…</option>
            {[...parents]
              .sort((left, right) => left.name.localeCompare(right.name))
              .map((parent) => <option value={parent.id} key={parent.id}>{parent.name}</option>)}
          </select>
        </label>
      ) : null}
      {parentSimilar?.semanticWarning ? (
        <p className="ui-category-manager__warning">{parentSimilar.semanticWarning}</p>
      ) : null}
    </div>
  );

  const renderEditAction = (category: AiCategory) => isUserEditableCategory(category) ? (
    <button
      className="ui-button ui-button--compact ui-button--secondary"
      type="button"
      disabled={busyKey != null}
      onClick={() => beginEdit(category)}
    >
      <Pencil size={12} /> Edit
    </button>
  ) : null;

  const renderLeafAction = (category: AiCategory) => {
    if (!itemId) return (
      <div className="ui-category-manager__actions">
        <span className="ui-category-manager__existing-label">Existing child</span>
        {renderEditAction(category)}
      </div>
    );
    const active = activeCategoryIds.has(category.id);
    return (
      <div className="ui-category-manager__actions">
        <button
          className="ui-button ui-button--compact ui-button--secondary"
          type="button"
          disabled={active || busyKey != null}
          onClick={() => void runItemAction(category.id, 'add')}
        >
          {active ? 'Added' : 'Use this'}
        </button>
        {renderEditAction(category)}
      </div>
    );
  };

  return (
    <DialogShell
      title={itemId ? 'Manage categories' : 'Find or create a category'}
      description={
        itemId
          ? <>Name the category you want for <strong>{itemTitle || 'this bookmark'}</strong>. Homebase will search the full taxonomy before offering new structure.</>
          : 'Enter a category name or idea. Homebase will search existing parents and children before offering new structure.'
      }
      onClose={onClose}
      maxWidth={1040}
      maxHeight="calc(100dvh - 24px)"
      closeDisabled={busyKey != null}
    >
      {loading ? <p className="ui-category-manager__muted">Loading categories…</p> : null}
      {!loading ? (
        <div className="ui-category-manager">
          {itemId ? (
            <section className="ui-dialog__section">
              <h3 className="ui-dialog__section-title">Current categories</h3>
              {!activeLinks.length ? (
                <p className="ui-category-manager__muted">No categories are attached yet.</p>
              ) : (
                <div className="ui-category-manager__current">
                  {activeLinks.map((link) => {
                    const category = categoryById.get(link.categoryId);
                    if (!category) return null;
                    return (
                      <div className="ui-category-manager__row" key={link.id}>
                        <div>
                          <CategoryNameWithParent category={category} />
                          <span>{link.status === 'suggested' ? 'AI suggestion' : link.source === 'manual' ? 'Added by you' : 'Accepted AI suggestion'}{link.isPrimary ? ' · Primary' : ''}</span>
                        </div>
                        <div className="ui-category-manager__actions">
                          {link.status === 'suggested' ? (
                            <>
                              <button className="ui-button ui-button--compact ui-button--primary" type="button" disabled={busyKey != null} onClick={() => void runItemAction(category.id, 'accept')}><Check size={12} /> Accept</button>
                              <button className="ui-button ui-button--compact ui-button--secondary" type="button" disabled={busyKey != null} onClick={() => void runItemAction(category.id, 'reject')}><X size={12} /> Reject</button>
                            </>
                          ) : (
                            <>
                              {!link.isPrimary ? <button className="ui-button ui-button--compact ui-button--secondary" type="button" disabled={busyKey != null} onClick={() => void runItemAction(category.id, 'primary')}>Make primary</button> : null}
                              <button className="ui-button ui-button--compact ui-button--secondary" type="button" disabled={busyKey != null} onClick={() => void runItemAction(category.id, 'remove')}>Remove from bookmark</button>
                            </>
                          )}
                          {renderEditAction(category)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}

          {proposedDraft ? (
            <div className="ui-category-manager__notice">
              <Sparkles size={14} />
              <span>The classifier suggested this concept, but nothing will be created automatically. Existing matches are checked first.</span>
            </div>
          ) : null}

          {novelTopicProposals.length ? (
            <section className="ui-dialog__section ui-category-manager__novel-topics">
              <div className="ui-category-manager__section-heading">
                <div>
                  <h3 className="ui-dialog__section-title">Unmatched topic suggestions</h3>
                  <p>
                    These are durable classifier proposals, not active categories. Review one against the taxonomy,
                    then reclassify its bookmarks after you create or merge a fitting category.
                  </p>
                </div>
                <span>{novelTopicProposals.length} suggestion{novelTopicProposals.length === 1 ? '' : 's'}</span>
              </div>
              <div className="ui-category-manager__novel-topic-list">
                {novelTopicProposals.map((group) => {
                  const allQueued = group.pendingReclassifyCount >= group.itemCount;
                  const parent = group.proposal.parentId
                    ? categoryById.get(group.proposal.parentId)
                    : undefined;
                  return (
                    <article className="ui-category-manager__novel-topic" key={group.key}>
                      <div className="ui-category-manager__novel-topic-copy">
                        <strong>{group.proposal.name}</strong>
                        {parent ? <small>Suggested parent: {parent.name}</small> : null}
                        {group.proposal.description ? <span>{group.proposal.description}</span> : null}
                        <small>
                          {group.itemCount} supporting bookmark{group.itemCount === 1 ? '' : 's'}
                          {group.sampleItems.length
                            ? ` · ${group.sampleItems.map((item) => item.title).join(' · ')}`
                            : ''}
                        </small>
                      </div>
                      <div className="ui-category-manager__actions">
                        <button
                          className="ui-button ui-button--compact ui-button--secondary"
                          type="button"
                          disabled={busyKey != null}
                          onClick={() => reviewNovelTopicProposal(group)}
                        >
                          Review suggestion
                        </button>
                        <button
                          className="ui-button ui-button--compact ui-button--primary"
                          type="button"
                          disabled={busyKey != null || allQueued}
                          onClick={() => void queueNovelTopicProposal(group)}
                        >
                          {busyKey === `proposal:${group.key}`
                            ? 'Queueing…'
                            : allQueued
                              ? 'Queued for classification'
                              : `Reclassify ${group.itemCount}`}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className={`ui-category-manager__context ${itemId ? 'ui-category-manager__context--item' : 'ui-category-manager__context--taxonomy'}`}>
            {itemId ? (
              <><strong>Adding to this bookmark:</strong> {itemTitle || itemId}. The final child you save will be attached immediately.</>
            ) : (
              <><strong>Taxonomy only:</strong> categories created here are not attached to a bookmark. To attach one, open Manage categories from that bookmark’s Inspector.</>
            )}
          </div>

          {editingCategory ? (
            <section ref={editingSectionRef} className="ui-category-manager__creation ui-category-manager__editing">
              <div className="ui-category-manager__section-heading">
                <div>
                  <h3 className="ui-dialog__section-title">Edit your category</h3>
                  <p>{editingCategory.kind === 'parent' ? 'Parent category' : categoryPath(editingCategory)}</p>
                </div>
                <button type="button" className="ui-button ui-button--compact ui-button--secondary" disabled={busyKey != null} onClick={closeEdit}>Cancel</button>
              </div>
              <label className="ui-form__group">
                <span className="ui-form__label">Category name</span>
                <input className="ui-field" value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus />
              </label>
              <label className="ui-form__group">
                <span className="ui-form__label">Description <span className="ui-form__optional">optional</span></span>
                <textarea className="ui-field ui-category-manager__description" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} placeholder="What belongs in this category?" />
              </label>
              <div className="ui-category-manager__edit-actions">
                <button className="ui-button ui-button--primary" type="button" disabled={!editName.trim() || busyKey != null} onClick={() => void saveEdit()}>
                  {busyKey?.startsWith('edit:') ? 'Saving…' : 'Save changes'}
                </button>
                <button className="ui-button ui-button--danger" type="button" disabled={busyKey != null} onClick={showDeleteConfirmation}><Trash2 size={13} /> Delete category</button>
              </div>
              {deleteConfirmOpen ? (
                <div ref={deleteConfirmRef} className="ui-category-manager__delete-confirm">
                  <strong>Delete “{editingCategory.name}”?</strong>
                  <span>
                    {editingCategory.kind === 'parent'
                      ? `Its ${editingChildren.length} child ${editingChildren.length === 1 ? 'category' : 'categories'} will also be removed. `
                      : ''}
                    Category assignments will be removed, but bookmarks and their enrichment data will remain.
                  </span>
                  <div className="ui-category-manager__actions">
                    <button className="ui-button ui-button--secondary" type="button" disabled={busyKey != null} onClick={() => setDeleteConfirmOpen(false)}>Keep category</button>
                    <button className="ui-button ui-button--danger" type="button" disabled={busyKey != null} onClick={() => void deleteEditedCategory()}>{busyKey?.startsWith('delete:') ? 'Deleting…' : 'Delete category'}</button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="ui-category-manager__intent">
            <label className="ui-form__group">
              <span className="ui-form__label">Category name or idea</span>
              <span className="ui-category-manager__search ui-category-manager__search--intent">
                <Search size={16} />
                <input
                  className="ui-field"
                  value={intent}
                  onChange={(event) => setIntent(event.target.value)}
                  placeholder="For example: Machine learning deployment"
                  autoFocus
                />
              </span>
              <span className="ui-form__help">Start with the name you would use. You do not need to know whether it should be a parent or child.</span>
            </label>
          </section>

          {hasIntent ? (
            <>
              <section className="ui-dialog__section">
                <div className="ui-category-manager__section-heading">
                  <div>
                    <h3 className="ui-dialog__section-title">Best existing matches</h3>
                    <p>Parents and children are ranked by name, description, tags, and semantic meaning.</p>
                  </div>
                  <span>
                    {checkingSimilar
                      ? 'Searching meaning…'
                      : similar?.semanticAvailable
                        ? 'Semantic + name search'
                        : 'Name search'}
                  </span>
                </div>
                {!intentMatches.length && !checkingSimilar ? (
                  <p className="ui-category-manager__muted">No close existing category found yet.</p>
                ) : (
                  <div className="ui-category-manager__picker">
                    {intentMatches.map((match) => {
                      const category = match.category;
                      const isParent = category.kind === 'parent';
                      return (
                        <React.Fragment key={category.id}>
                          <div className="ui-category-manager__row">
                            <div>
                              <span className="ui-category-manager__kind">{isParent ? 'Parent' : 'Child'}</span>
                              <CategoryNameWithParent category={category} />
                              <span>{Math.round(match.score * 100)}% match{category.description ? ` · ${category.description}` : ''}</span>
                            </div>
                            {isParent ? (
                              <div className="ui-category-manager__actions">
                                <button className="ui-button ui-button--compact ui-button--secondary" type="button" onClick={() => setExpandedParentId((value) => value === category.id ? null : category.id)}>
                                  {expandedParentId === category.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Children
                                </button>
                                <button className="ui-button ui-button--compact ui-button--secondary" type="button" onClick={() => chooseNewChild(category.id)}><Plus size={12} /> New child here</button>
                                {renderEditAction(category)}
                              </div>
                            ) : renderLeafAction(category)}
                          </div>
                          {isParent && expandedParentId === category.id ? (
                            <div className="ui-category-manager__children">
                              {expandedChildren.map((child) => (
                                <div className="ui-category-manager__row" key={child.id}>
                                  <div><span className="ui-category-manager__kind">Child</span><strong>{child.name}</strong>{child.description ? <span>{child.description}</span> : null}</div>
                                  {renderLeafAction(child)}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
                {similar?.semanticWarning ? (
                  <p className="ui-category-manager__warning">{similar.semanticWarning}</p>
                ) : null}
              </section>

              <section className="ui-dialog__section ui-category-manager__new-options">
                <div className="ui-category-manager__section-heading">
                  <div>
                    <h3 className="ui-dialog__section-title">If none of those fit</h3>
                    <p>Choose a suggested structure; you can review it before saving.</p>
                  </div>
                </div>
                <div className="ui-category-manager__suggestions">
                  {matchedParents.map((match) => (
                    <button type="button" className="ui-button ui-button--secondary" disabled={proposalLoading} key={match.category.id} onClick={() => chooseNewChild(match.category.id)}>
                      <Plus size={13} /> New child under {match.category.name}
                    </button>
                  ))}
                  <button type="button" className="ui-button ui-button--secondary" disabled={proposalLoading} onClick={() => chooseNewChild()}>
                    <Plus size={13} /> New child under another parent
                  </button>
                  <button type="button" className="ui-button ui-button--secondary" disabled={proposalLoading} onClick={chooseNewParent}>
                    <Plus size={13} /> {itemId ? 'New parent + child' : 'New parent structure'}
                  </button>
                </div>
              </section>

              {creationOpen ? (
                <section ref={creationSectionRef} className="ui-category-manager__creation">
                  <div className="ui-category-manager__section-heading">
                    <div>
                      <h3 className="ui-dialog__section-title">Review final {draft.kind === 'parent' ? 'parent and child' : 'child'}</h3>
                      <p>The names below are a proposal. Edit anything before saving.</p>
                    </div>
                    <button type="button" className="ui-button ui-button--compact ui-button--secondary" disabled={proposalLoading} onClick={() => setCreationOpen(false)}>Cancel new category</button>
                  </div>
                  {proposalLoading ? (
                    <div className="ui-category-manager__notice"><Sparkles size={14} /><span>Generating concise taxonomy names from your idea…</span></div>
                  ) : null}
                  {proposalWarning ? <p className="ui-category-manager__warning">{proposalWarning}</p> : null}
                  {draft.kind === 'leaf' ? (
                    <>
                      {renderParentFinder()}
                      <label className="ui-form__group">
                        <span className="ui-form__label">Child category name</span>
                        <input
                          className="ui-field"
                          disabled={proposalLoading}
                          value={draft.name}
                          onChange={(event) => {
                            descriptionSeq.current += 1;
                            setDescriptionBusy(null);
                            setDraft((value) => ({
                              ...value,
                              name: event.target.value,
                              description: '',
                            }));
                          }}
                          onBlur={() => void refreshDraftDescription('child')}
                          placeholder="Child category name"
                        />
                      </label>
                      {renderChildMatches()}
                      <label className="ui-form__group">
                        <span className="ui-form__label">Child description <span className="ui-form__optional">{descriptionBusy === 'child' ? 'updating from name…' : 'optional'}</span></span>
                        <textarea
                          className="ui-field ui-category-manager__description"
                          disabled={proposalLoading}
                          value={draft.description}
                          onChange={(event) => {
                            descriptionSeq.current += 1;
                            setDescriptionBusy(null);
                            setDraft((value) => ({ ...value, description: event.target.value }));
                          }}
                          placeholder="What belongs in this child category?"
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <div className="ui-category-manager__structure-grid">
                        <section className="ui-category-manager__structure-column" aria-label="Parent category proposal">
                          <label className="ui-form__group">
                            <span className="ui-form__label">Parent category name</span>
                            <input
                              className="ui-field"
                              disabled={proposalLoading}
                              value={draft.name}
                              onChange={(event) => {
                                descriptionSeq.current += 1;
                                setDescriptionBusy(null);
                                setSelectedExistingParentId(null);
                                setDraft((value) => ({
                                  ...value,
                                  name: event.target.value,
                                  description: '',
                                  child: value.child
                                    ? { ...value.child, description: '' }
                                    : value.child,
                                }));
                              }}
                              onBlur={() => void refreshDraftDescription('parent')}
                              placeholder="Broad parent name"
                            />
                          </label>
                          {selectedStructureParent ? (
                            <div className="ui-category-manager__selected-parent">
                              <div>
                                <span>Selected existing parent</span>
                                <strong>{selectedStructureParent.name}</strong>
                                {selectedStructureParent.description ? <small>{selectedStructureParent.description}</small> : null}
                              </div>
                              <Check size={15} />
                            </div>
                          ) : null}
                          {renderProposedParentMatches()}
                          <label className="ui-form__group ui-category-manager__structure-description">
                            <span className="ui-form__label">Parent description <span className="ui-form__optional">{descriptionBusy === 'parent' ? 'updating from name…' : 'optional'}</span></span>
                            <textarea
                              className="ui-field ui-category-manager__description"
                              disabled={proposalLoading}
                              value={draft.description}
                              onChange={(event) => {
                                descriptionSeq.current += 1;
                                setDescriptionBusy(null);
                                setDraft((value) => ({ ...value, description: event.target.value }));
                              }}
                              onBlur={() => {
                                if (draft.child?.name.trim()) {
                                  void generateChildDescription(
                                    draft.child.name,
                                    categoryById.get(selectedExistingParentId ?? '') ?? {
                                      name: draft.name,
                                      description: draft.description,
                                    }
                                  );
                                }
                              }}
                              placeholder="What broad domain belongs here?"
                            />
                          </label>
                        </section>
                        <section className="ui-category-manager__structure-column" aria-label="Child category proposal">
                          <label className="ui-form__group">
                            <span className="ui-form__label">Child category name</span>
                            <input
                              className="ui-field"
                              disabled={proposalLoading}
                              value={draft.child?.name ?? ''}
                              onChange={(event) => {
                                descriptionSeq.current += 1;
                                setDescriptionBusy(null);
                                setDraft((value) => ({
                                  ...value,
                                  child: {
                                    ...(value.child ?? {}),
                                    name: event.target.value,
                                    description: '',
                                  },
                                }));
                              }}
                              onBlur={() => void refreshDraftDescription('child')}
                              placeholder="Specific child name"
                            />
                          </label>
                          {renderChildMatches(true)}
                          <label className="ui-form__group ui-category-manager__structure-description">
                            <span className="ui-form__label">Child description <span className="ui-form__optional">{descriptionBusy === 'child' ? 'updating from name…' : 'optional'}</span></span>
                            <textarea
                              className="ui-field ui-category-manager__description"
                              disabled={proposalLoading}
                              value={draft.child?.description ?? ''}
                              onChange={(event) => {
                                descriptionSeq.current += 1;
                                setDescriptionBusy(null);
                                setDraft((value) => ({
                                  ...value,
                                  child: {
                                    ...(value.child ?? { name: '' }),
                                    description: event.target.value,
                                  },
                                }));
                              }}
                              placeholder="What narrower topic belongs here?"
                            />
                          </label>
                        </section>
                      </div>
                      <div className="ui-category-manager__notice">
                        <span>
                          {selectedStructureParent
                            ? `The child above will be created under ${selectedStructureParent.name}. Choosing or editing a child does not change this parent.`
                            : `Homebase will also add the standard “Other (${draft.name || 'parent'})” fallback. ${itemId ? 'This bookmark will be assigned to the named child above.' : ''}`}
                        </span>
                      </div>
                    </>
                  )}
                  {exactDuplicate ? (
                    <div className={canAddExistingChild ? 'ui-category-manager__notice' : 'ui-category-manager__duplicate'}>
                      <strong>{activeCategoryIds.has(exactDuplicate.id) ? 'Already added:' : 'Already exists:'}</strong>{' '}
                      {categoryPath(exactDuplicate)}.
                      {canAddExistingChild ? ' Confirm below to add the existing child.' : ''}
                    </div>
                  ) : null}
                  {submissionDraft.kind === 'parent' && submissionDraft.child?.name && normalizeCategoryName(submissionDraft.name) === normalizeCategoryName(submissionDraft.child.name) ? (
                    <div className="ui-category-manager__duplicate">Parent and child need different names.</div>
                  ) : null}
                  {itemId && submissionDraft.kind === 'leaf' ? (
                    <label className="ui-category-manager__checkbox"><input type="checkbox" checked={makePrimary} onChange={(event) => setMakePrimary(event.target.checked)} /> Make this the primary category</label>
                  ) : null}
                  <div className="ui-category-manager__create-actions">
                    <button className="ui-button ui-button--primary" type="button" disabled={!canCreate && !canAddExistingChild} onClick={() => void submitCreation()}><Plus size={14} /> {busyKey ? 'Saving…' : canAddExistingChild ? 'Add existing child' : submissionDraft.kind === 'parent' ? 'Create parent + child' : itemId ? 'Create and add child' : 'Create child'}</button>
                  </div>
                </section>
              ) : null}
            </>
          ) : (
            <p className="ui-category-manager__muted">Start typing to search all existing parents and children and see possible new structures.</p>
          )}
        </div>
      ) : null}
    </DialogShell>
  );
};
