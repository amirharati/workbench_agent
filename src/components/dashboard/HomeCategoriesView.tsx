import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, FileText, Search, Tags, X } from 'lucide-react';
import type { Item } from '../../lib/db';
import { subscribeToDataChanges } from '../../lib/dataChangeNotifier';
import {
  buildCategoryBrowseGroups,
  loadCategoryBrowseSnapshot,
  type CategoryBrowseSnapshot,
} from '../../lib/categorization/categoryBrowse';
import { ContentBrowser, useContentBrowseMode, type ContentBrowseEntry } from './ContentBrowser';
import { LinkVisual } from './LinkVisual';
import { isLinkQualityTaxonomyParent } from '../../lib/categorization/classificationPresentation';

const RELOAD_REASONS = new Set([
  'item.add',
  'item.update',
  'item.trash.bulk',
  'item.delete',
  'collection.update',
  'import.replace',
  'import.bulk',
  'categorization.update',
  'categorization.review',
  'pipeline.complete',
  'pipeline.clear',
]);

function loadSelectedCategories(storageKey: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function saveSelectedCategories(storageKey: string, categoryIds: string[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(categoryIds));
  } catch {
    // This is resumable page context, never canonical category data.
  }
}

function categorySourceLabel(source?: string): string {
  if (source === 'seed') return 'Seed';
  if (source === 'discovered') return 'Discovered';
  if (source === 'manual') return 'Manual';
  if (source === 'bootstrap') return 'Bootstrap';
  return 'Existing';
}

export function HomeCategoriesView({
  items,
  scopeLabel,
  scopeKey,
  focusedCategory,
  onExitFocusedCategory,
  onSelectedItemChange,
}: {
  items: Item[];
  scopeLabel: string;
  scopeKey: string;
  focusedCategory?: { categoryId: string; name: string } | null;
  onExitFocusedCategory?: () => void;
  onSelectedItemChange?: (item: Item | null) => void;
}) {
  const selectionStorageKey = `workbench-home-category-selection:${scopeKey}`;
  const [snapshot, setSnapshot] = useState<CategoryBrowseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(() =>
    loadSelectedCategories(selectionStorageKey)
  );
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [browseMode, setBrowseMode] = useContentBrowseMode(
    `workbench-home-category-results-view:${scopeKey}`
  );
  const requestSeqRef = useRef(0);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);

  const reload = useCallback(async (silent = false) => {
    const requestSeq = ++requestSeqRef.current;
    if (!silent || !snapshotRef.current) setLoading(true);
    else setRefreshing(true);
    try {
      const next = await loadCategoryBrowseSnapshot(itemIds);
      if (requestSeq !== requestSeqRef.current) return;
      setSnapshot(next);
      setError(null);
    } catch (cause) {
      if (requestSeq !== requestSeqRef.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [itemIds]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => subscribeToDataChanges((event) => {
    if (RELOAD_REASONS.has(event.reason)) void reload(true);
  }), [reload]);

  useEffect(() => {
    saveSelectedCategories(selectionStorageKey, selectedCategoryIds);
  }, [selectedCategoryIds, selectionStorageKey]);

  const groups = useMemo(
    () => snapshot ? buildCategoryBrowseGroups(snapshot) : [],
    [snapshot]
  );
  const availableCategoryIds = useMemo(
    () => new Set(groups.flatMap((group) => group.leaves.map((leaf) => leaf.category.id))),
    [groups]
  );

  useEffect(() => {
    setExpandedGroupIds((current) => current.length > 0
      ? current.filter((id) => groups.some((group) => group.id === id))
      : groups.map((group) => group.id)
    );
  }, [groups]);

  useEffect(() => {
    if (!snapshot) return;
    setSelectedCategoryIds((current) => {
      const next = current.filter((id) => availableCategoryIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [availableCategoryIds, snapshot]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => groups
    .map((group) => {
      const parentMatches = group.name.toLowerCase().includes(normalizedQuery);
      const leaves = group.leaves.filter((leaf) => {
        return !normalizedQuery || parentMatches ||
          leaf.category.name.toLowerCase().includes(normalizedQuery) ||
          leaf.category.description?.toLowerCase().includes(normalizedQuery) ||
          leaf.category.source?.toLowerCase().includes(normalizedQuery);
      });
      return { ...group, leaves };
    })
    .filter((group) => group.leaves.length > 0), [groups, normalizedQuery]);

  const topicGroups = useMemo(
    () => visibleGroups.filter((group) => !isLinkQualityTaxonomyParent(group.id)),
    [visibleGroups]
  );
  const statusGroups = useMemo(
    () => visibleGroups.filter((group) => isLinkQualityTaxonomyParent(group.id)),
    [visibleGroups]
  );

  const selectedCategorySet = useMemo(
    () => new Set(selectedCategoryIds),
    [selectedCategoryIds]
  );
  const focusedCategoryRow = useMemo(
    () => focusedCategory && snapshot
      ? snapshot.categories.find((category) => category.id === focusedCategory.categoryId) ?? null
      : null,
    [focusedCategory, snapshot]
  );
  const focusedParent = useMemo(() => {
    if (!focusedCategoryRow?.parentId || !snapshot) return null;
    return snapshot.categories.find((category) => category.id === focusedCategoryRow.parentId) ?? null;
  }, [focusedCategoryRow, snapshot]);
  const focusedCategoryIds = useMemo(() => {
    if (!focusedCategory) return null;
    if (focusedCategoryRow?.kind === 'parent') {
      return new Set(
        groups.find((group) => group.id === focusedCategory.categoryId)?.leaves
          .map((leaf) => leaf.category.id) ?? []
      );
    }
    return new Set([focusedCategory.categoryId]);
  }, [focusedCategory, focusedCategoryRow, groups]);
  const resultCategorySet = focusedCategoryIds ?? selectedCategorySet;
  const expandedGroupSet = useMemo(() => new Set(expandedGroupIds), [expandedGroupIds]);
  const selectedItemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of groups) {
      for (const leaf of group.leaves) {
        if (!resultCategorySet.has(leaf.category.id)) continue;
        for (const itemId of leaf.itemIds) ids.add(itemId);
      }
    }
    return ids;
  }, [groups, resultCategorySet]);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const categoryNamesByItem = useMemo(() => {
    const names = new Map<string, string[]>();
    for (const group of groups) {
      for (const leaf of group.leaves) {
        if (!resultCategorySet.has(leaf.category.id)) continue;
        for (const itemId of leaf.itemIds) {
          const current = names.get(itemId) ?? [];
          current.push(leaf.category.name);
          names.set(itemId, current);
        }
      }
    }
    return names;
  }, [groups, resultCategorySet]);
  const resultItems = useMemo(() => [...selectedItemIds]
    .map((id) => itemsById.get(id))
    .filter((item): item is Item => Boolean(item))
    .sort((left, right) => right.updated_at - left.updated_at), [itemsById, selectedItemIds]);

  useEffect(() => {
    if (!selectedItemId || selectedItemIds.has(selectedItemId)) return;
    setSelectedItemId(null);
    onSelectedItemChange?.(null);
  }, [onSelectedItemChange, selectedItemId, selectedItemIds]);

  useEffect(() => {
    setSelectedItemId(null);
    onSelectedItemChange?.(null);
  }, [focusedCategory?.categoryId, onSelectedItemChange]);

  const entries = useMemo<ContentBrowseEntry[]>(() => resultItems.map((item) => ({
    id: item.id,
    title: item.title || 'Untitled',
    icon: item.url
      ? <LinkVisual url={item.url} title={item.title} favicon={item.favicon} />
      : <FileText size={14} aria-hidden="true" />,
    subtitle: item.url || item.notes?.trim() || 'Note',
    meta: (categoryNamesByItem.get(item.id) ?? []).join(' · '),
    searchText: [item.url, item.notes, ...(item.tags ?? []), ...(categoryNamesByItem.get(item.id) ?? [])]
      .filter(Boolean)
      .join(' '),
    dragSource: { kind: 'reference', label: `${scopeLabel} categories` },
    dragItem: item,
  })), [categoryNamesByItem, resultItems, scopeLabel]);

  const toggleCategory = (categoryId: string) => {
    setSelectedCategoryIds((current) => current.includes(categoryId)
      ? current.filter((id) => id !== categoryId)
      : [...current, categoryId]
    );
  };

  const categorizedItemCount = useMemo(() => new Set(
    groups.flatMap((group) => group.leaves.flatMap((leaf) => leaf.itemIds))
  ).size, [groups]);

  return (
    <div className="ui-home-categories">
      {focusedCategory ? (
        <aside className="ui-home-categories__taxonomy" aria-label={`Focused category ${focusedCategory.name}`}>
          <div className="ui-home-categories__taxonomy-header ui-home-categories__taxonomy-header--focus">
            <div>
              <strong>{focusedCategoryRow?.name ?? focusedCategory.name}</strong>
              <span>
                {focusedParent?.name
                  ? `Under ${focusedParent.name}`
                  : focusedCategoryRow?.kind === 'parent'
                    ? 'Parent category and its children'
                    : 'Exact category membership'}
              </span>
            </div>
            <button type="button" onClick={onExitFocusedCategory} title="Back to all categories">
              <ArrowLeft size={12} /> All categories
            </button>
          </div>
          <div className="scrollbar ui-home-categories__groups ui-home-categories__focus">
            <div className="ui-home-categories__section-label">Focused category</div>
            {loading && !snapshot ? (
              <div className="ui-home-categories__status">Loading category…</div>
            ) : error && !snapshot ? (
              <div className="ui-home-categories__status" data-error="true">Could not load category: {error}</div>
            ) : (
              <div className="ui-home-categories__focus-details">
                <strong>{focusedCategoryRow?.name ?? focusedCategory.name}</strong>
                {focusedParent?.name ? <span>{focusedParent.name}</span> : null}
                {focusedCategoryRow?.description ? <p>{focusedCategoryRow.description}</p> : null}
                <small>{categorySourceLabel(focusedCategoryRow?.source)} category</small>
              </div>
            )}
          </div>
          <div className="ui-home-categories__selection-summary">
            {refreshing ? 'Refreshing… · ' : ''}
            {selectedItemIds.size} {selectedItemIds.size === 1 ? 'item' : 'items'} in {scopeLabel}
          </div>
        </aside>
      ) : (
      <aside className="ui-home-categories__taxonomy" aria-label={`${scopeLabel} categories`}>
        <div className="ui-home-categories__taxonomy-header">
          <div>
            <strong>{scopeLabel} categories</strong>
            <span>{groups.length} parents · {groups.reduce((count, group) => count + group.leaves.length, 0)} children · {categorizedItemCount} categorized items</span>
          </div>
          {selectedCategoryIds.length > 0 ? (
            <button type="button" onClick={() => setSelectedCategoryIds([])} title="Clear selected categories">
              <X size={12} /> Clear
            </button>
          ) : null}
        </div>
        <label className="ui-home-categories__filter">
          <Search size={13} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter categories…"
            aria-label="Filter categories"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear category filter">
              <X size={11} />
            </button>
          ) : null}
        </label>
        <div className="scrollbar ui-home-categories__groups">
          {loading && !snapshot ? (
            <div className="ui-home-categories__status">Loading categories…</div>
          ) : error && !snapshot ? (
            <div className="ui-home-categories__status" data-error="true">Could not load categories: {error}</div>
          ) : visibleGroups.length === 0 ? (
            <div className="ui-home-categories__status">No categories match this view.</div>
          ) : (
            <>
              {topicGroups.length > 0 ? <div className="ui-home-categories__section-label">Topic hierarchy</div> : null}
              {topicGroups.map((group) => renderCategoryGroup(group))}
              {statusGroups.length > 0 ? (
                <div className="ui-home-categories__section-label ui-home-categories__section-label--status">
                  Page status &amp; errors
                </div>
              ) : null}
              {statusGroups.map((group) => renderCategoryGroup(group, true))}
            </>
          )}
        </div>
        <div className="ui-home-categories__selection-summary">
          {refreshing ? 'Refreshing… · ' : ''}
          {selectedCategoryIds.length > 0
            ? `${selectedCategoryIds.length} selected · showing items in any selected category`
            : 'Select one or more child categories to browse their items'}
        </div>
      </aside>
      )}

      <main className="ui-home-categories__results">
        <ContentBrowser
          title={focusedCategory
            ? focusedCategoryRow?.name ?? focusedCategory.name
            : selectedCategoryIds.length > 0 ? 'Category results' : 'Select categories'}
          entries={entries}
          selectedId={selectedItemId}
          onSelect={(itemId) => {
            const item = itemsById.get(itemId) ?? null;
            setSelectedItemId(item?.id ?? null);
            onSelectedItemChange?.(item);
          }}
          mode={browseMode}
          onModeChange={setBrowseMode}
          emptyMessage={focusedCategory
            ? 'No items belong to this category in All Library.'
            : selectedCategoryIds.length > 0
              ? 'No items belong to the selected categories in this scope.'
              : 'Select one or more categories from the list.'}
          ariaLabel={`${scopeLabel} category results`}
          headerActions={focusedCategory || selectedCategoryIds.length > 0 ? (
            <span className="ui-home-categories__result-rule">
              <Tags size={12} /> {focusedCategory ? 'Exact category membership' : 'Any selected category'}
            </span>
          ) : undefined}
        />
      </main>
    </div>
  );

  function renderCategoryGroup(group: (typeof visibleGroups)[number], status = false) {
            const groupItemCount = new Set(group.leaves.flatMap((leaf) => leaf.itemIds)).size;
            const selectedCount = group.leaves.filter((leaf) => selectedCategorySet.has(leaf.category.id)).length;
            return (
              <details
                key={group.id}
                data-status-group={status ? 'true' : 'false'}
                open={Boolean(normalizedQuery || selectedCount || expandedGroupSet.has(group.id))}
                onToggle={(event) => {
                  if (normalizedQuery || selectedCount) return;
                  const isOpen = event.currentTarget.open;
                  setExpandedGroupIds((current) => isOpen
                    ? current.includes(group.id) ? current : [...current, group.id]
                    : current.filter((id) => id !== group.id)
                  );
                }}
              >
                <summary>
                  <ChevronDown size={12} aria-hidden="true" />
                  <span className="ui-home-categories__group-name">
                    <strong>{group.name}</strong>
                    <em data-source={group.category?.source ?? 'existing'}>
                      {categorySourceLabel(group.category?.source)}
                    </em>
                  </span>
                  <small>{groupItemCount}</small>
                </summary>
                <div className="ui-home-categories__leaves">
                  {group.leaves.map((leaf) => (
                    <label key={leaf.category.id} data-selected={selectedCategorySet.has(leaf.category.id) ? 'true' : 'false'}>
                      <input
                        type="checkbox"
                        checked={selectedCategorySet.has(leaf.category.id)}
                        onChange={() => toggleCategory(leaf.category.id)}
                      />
                      <span title={leaf.category.description || leaf.category.name}>
                        <strong>{leaf.category.name}</strong>
                        <em data-source={leaf.category.source ?? 'existing'}>
                          {categorySourceLabel(leaf.category.source)}
                        </em>
                      </span>
                      <small>{leaf.itemIds.length}</small>
                    </label>
                  ))}
                </div>
              </details>
            );
  }
}
