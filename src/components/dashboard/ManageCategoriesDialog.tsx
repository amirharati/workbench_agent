import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Pencil, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import {
  createManualCategory,
  deleteManualCategory,
  findSimilarCategories,
  getCategoryManagementSnapshot,
  manageItemCategory,
  proposeCategoryStructure,
  updateManualCategory,
  type CategoryDraft,
  type CategoryManagementSnapshot,
  type CategorySimilarityMatch,
  type CategorySimilarityResult,
} from '../../lib/categorization/categoryManagement';
import { normalizeCategoryName, rankCategoryNames } from '../../lib/categorization/categorySimilarity';
import type { AiCategory } from '../../lib/categorization/types';
import { isManageableTopicCategory } from '../../lib/search/categorySearchProfiles';
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
  return rankCategoryNames(intent, '', categories, 16)
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
  const [creationOpen, setCreationOpen] = useState(false);
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const similaritySeq = useRef(0);
  const proposalSeq = useRef(0);
  const similarityCache = useRef(new Map<string, CategorySimilarityResult>());
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
    setSimilar(null);
    if (normalizeCategoryName(intent).length < 3 || !categories.length) return;
    const cached = similarityCache.current.get(draftKey);
    if (cached) {
      setSimilar(cached);
      return;
    }
    const seq = ++similaritySeq.current;
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
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draftKey, categories]);

  const intentMatches = (similar?.matches?.length ? similar.matches : localMatches).slice(0, 12);
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

  const runItemAction = async (
    categoryId: string,
    action: 'add' | 'accept' | 'reject' | 'remove' | 'primary'
  ) => {
    if (!itemId) return;
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
    } catch (error) {
      addToast({ type: 'error', message: `Could not update category: ${String(error)}` });
    } finally {
      setBusyKey(null);
    }
  };

  const chooseNewChild = (parentId?: string) => {
    const seq = ++proposalSeq.current;
    const parent = parentId ? categoryById.get(parentId) : undefined;
    setDraft({ name: intent.trim(), description: '', kind: 'leaf', parentId, canonicalTags: [] });
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
    setDraft({
      name: intent.trim(),
      description: '',
      kind: 'parent',
      canonicalTags: [],
      child: { name: '', description: '', canonicalTags: [] },
    });
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
      const result = await createManualCategory(draft, { itemId, makePrimary });
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
    } catch (error) {
      addToast({ type: 'error', message: `Could not create category: ${String(error)}` });
    } finally {
      setBusyKey(null);
    }
  };

  const exactDuplicate = categories.find(
    (category) => normalizeCategoryName(category.name) === normalizeCategoryName(draft.name)
  );
  const childExactDuplicate = draft.child?.name
    ? categories.find(
        (category) => normalizeCategoryName(category.name) === normalizeCategoryName(draft.child!.name)
      )
    : undefined;
  const canCreate =
    Boolean(draft.name.trim()) &&
    !exactDuplicate &&
    !childExactDuplicate &&
    (draft.kind !== 'parent' || Boolean(draft.child?.name.trim())) &&
    (draft.kind !== 'parent' || normalizeCategoryName(draft.name) !== normalizeCategoryName(draft.child?.name ?? '')) &&
    (draft.kind === 'parent' || Boolean(draft.parentId)) &&
    busyKey == null &&
    !proposalLoading;
  const hasIntent = normalizeCategoryName(intent).length >= 2;
  const proposedDraft = snapshot?.signal?.llmReview?.novelTopicSuggestion;
  const editingCategory = editingCategoryId ? categoryById.get(editingCategoryId) : undefined;
  const editingChildren = editingCategory?.kind === 'parent'
    ? categories.filter((category) => category.parentId === editingCategory.id)
    : [];

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
                          <strong>{categoryPath(category)}</strong>
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
                    <h3 className="ui-dialog__section-title">Existing matches</h3>
                    <p>Parents and children are searched together.</p>
                  </div>
                  {checkingSimilar ? <span>Checking meaning…</span> : null}
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
                              <strong>{categoryPath(category)}</strong>
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
                      <label className="ui-form__group">
                        <span className="ui-form__label">Parent</span>
                        <select className="ui-field" disabled={proposalLoading} value={draft.parentId ?? ''} onChange={(event) => setDraft((value) => ({ ...value, parentId: event.target.value || undefined }))}>
                          <option value="">Choose a parent…</option>
                          {[...parents].sort((left, right) => left.name.localeCompare(right.name)).map((parent) => <option value={parent.id} key={parent.id}>{parent.name}</option>)}
                        </select>
                      </label>
                      <label className="ui-form__group">
                        <span className="ui-form__label">Child category name</span>
                        <input className="ui-field" disabled={proposalLoading} value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} placeholder="Child category name" />
                      </label>
                      <label className="ui-form__group">
                        <span className="ui-form__label">Child description <span className="ui-form__optional">optional</span></span>
                        <textarea className="ui-field ui-category-manager__description" disabled={proposalLoading} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} placeholder="What belongs in this child category?" />
                      </label>
                    </>
                  ) : (
                    <>
                      <div className="ui-form__grid">
                        <label className="ui-form__group">
                          <span className="ui-form__label">Parent category name</span>
                          <input className="ui-field" disabled={proposalLoading} value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} placeholder="Broad parent name" />
                        </label>
                        <label className="ui-form__group">
                          <span className="ui-form__label">Child category name</span>
                          <input className="ui-field" disabled={proposalLoading} value={draft.child?.name ?? ''} onChange={(event) => setDraft((value) => ({ ...value, child: { ...(value.child ?? { description: '' }), name: event.target.value } }))} placeholder="Specific child name" />
                        </label>
                      </div>
                      <div className="ui-form__grid">
                        <label className="ui-form__group">
                          <span className="ui-form__label">Parent description <span className="ui-form__optional">optional</span></span>
                          <textarea className="ui-field ui-category-manager__description" disabled={proposalLoading} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} placeholder="What broad domain belongs here?" />
                        </label>
                        <label className="ui-form__group">
                          <span className="ui-form__label">Child description <span className="ui-form__optional">optional</span></span>
                          <textarea className="ui-field ui-category-manager__description" disabled={proposalLoading} value={draft.child?.description ?? ''} onChange={(event) => setDraft((value) => ({ ...value, child: { ...(value.child ?? { name: '' }), description: event.target.value } }))} placeholder="What narrower topic belongs here?" />
                        </label>
                      </div>
                      <div className="ui-category-manager__notice">
                        <span>Homebase will also add the standard “Other ({draft.name || 'parent'})” fallback. {itemId ? 'This bookmark will be assigned to the named child above.' : ''}</span>
                      </div>
                    </>
                  )}
                  {exactDuplicate ? (
                    <div className="ui-category-manager__duplicate"><strong>Already exists:</strong> {categoryPath(exactDuplicate)}. Use the existing category above.</div>
                  ) : null}
                  {childExactDuplicate ? (
                    <div className="ui-category-manager__duplicate"><strong>Child already exists:</strong> {categoryPath(childExactDuplicate)}. Use the existing category above.</div>
                  ) : null}
                  {draft.kind === 'parent' && draft.child?.name && normalizeCategoryName(draft.name) === normalizeCategoryName(draft.child.name) ? (
                    <div className="ui-category-manager__duplicate">Parent and child need different names.</div>
                  ) : null}
                  {similar?.semanticWarning ? <p className="ui-category-manager__warning">{similar.semanticWarning}</p> : null}
                  {itemId && draft.kind === 'leaf' ? (
                    <label className="ui-category-manager__checkbox"><input type="checkbox" checked={makePrimary} onChange={(event) => setMakePrimary(event.target.checked)} /> Make this the primary category</label>
                  ) : null}
                  <div className="ui-category-manager__create-actions">
                    <button className="ui-button ui-button--primary" type="button" disabled={!canCreate} onClick={() => void create()}><Plus size={14} /> {busyKey === 'create' ? 'Creating…' : draft.kind === 'parent' ? 'Create parent + child' : itemId ? 'Create and add child' : 'Create child'}</button>
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
