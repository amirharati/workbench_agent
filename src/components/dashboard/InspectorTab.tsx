import React, { useEffect, useState } from 'react';
import { Clock, ChevronDown, ChevronRight, Tags } from 'lucide-react';
import type { Item } from '../../lib/db';
import { useInspectorItemData } from '../../hooks/useInspectorItemData';
import { resolveEnrichmentFailureLabel } from '../../lib/enrichment/failureLabels';
import { resolvePipelineBadge } from '../../lib/pipeline';
import { formatPipelineStageHint } from '../../lib/pipeline/itemPipelineContext';
import { ItemPipelineBadge, EnrichmentContent } from './PipelineDisplayBlocks';
import { ItemSimilarSectionView } from './SearchDiscoveryBlocks';
import { ItemDigestQuickActions } from './ItemDigestQuickActions';
import {
  CategoryChip,
  CategoryOverflowToggle,
  COMPACT_CATEGORY_LIMIT,
  SuggestedCategoryRow,
  UnmatchedTopicSuggestion,
} from '../shared/CategoryReviewRows';
import { ExtensionPageUrlLink } from './BookmarkUrlLink';
import { LinkVisual } from './LinkVisual';
import { ManageCategoriesDialog } from './ManageCategoriesDialog';

interface InspectorTabProps {
  activeItem: Item | null;
  activeItemLoading?: boolean;
  isSearchSurface?: boolean;
  enrichmentPrimaryInItemTab?: boolean;
  currentQuery?: string;
  recentQueries?: string[];
  onRerunSearch?: (query: string) => void;
  onBrowseCategory?: (categoryId: string, name: string) => void;
  onOpenItemInTab?: (item: Item) => void;
  workspaceAction?: React.ReactNode;
  renderWorkspaceActionForItem?: (itemId: string, title: string) => React.ReactNode;
}

function SearchHistorySection({
  recentQueries,
  currentQuery,
  onRerunSearch,
  compact,
}: {
  recentQueries: string[];
  currentQuery?: string;
  onRerunSearch?: (query: string) => void;
  compact?: boolean;
}) {
  const normalizedCurrent = currentQuery?.trim().toLowerCase() ?? '';

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        <Clock size={12} />
        Recent searches
      </div>

      {recentQueries.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5 }}>
          Past queries will appear here after you search.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {recentQueries.map((q) => {
            const isCurrent = normalizedCurrent.length > 0 && q.toLowerCase() === normalizedCurrent;
            return (
              <button
                key={q}
                type="button"
                onClick={() => onRerunSearch?.(q)}
                title={q}
                style={{
                  all: 'unset',
                  cursor: onRerunSearch ? 'pointer' : 'default',
                  padding: compact ? '4px 6px' : '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: isCurrent ? 'var(--accent-weak)' : 'transparent',
                  border: isCurrent ? '1px solid var(--accent)' : '1px solid transparent',
                  fontSize: 'var(--text-xs)',
                  color: isCurrent ? 'var(--text)' : 'var(--text-muted)',
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  if (!onRerunSearch || isCurrent) return;
                  e.currentTarget.style.background = 'var(--bg-hover)';
                  e.currentTarget.style.color = 'var(--text)';
                }}
                onMouseLeave={(e) => {
                  if (isCurrent) return;
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-muted)';
                }}
              >
                {q.length > 56 ? `${q.slice(0, 56)}…` : q}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SearchInspectorChrome({
  recentQueries,
  currentQuery,
  onRerunSearch,
  workspaceAction,
  compact,
}: {
  recentQueries: string[];
  currentQuery?: string;
  onRerunSearch?: (query: string) => void;
  workspaceAction?: React.ReactNode;
  compact?: boolean;
}) {
  const trimmedQuery = currentQuery?.trim() ?? '';

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 8 : 10,
        paddingBottom: compact ? 8 : 10,
        borderBottom: '1px solid var(--border)',
      }}
    >
      {trimmedQuery ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            Active search
          </div>
          <button
            type="button"
            onClick={() => onRerunSearch?.(trimmedQuery)}
            title={`Rerun: ${trimmedQuery}`}
            style={{
              all: 'unset',
              cursor: onRerunSearch ? 'pointer' : 'default',
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-weak)',
              border: '1px solid var(--accent)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text)',
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {trimmedQuery.length > 56 ? `${trimmedQuery.slice(0, 56)}…` : trimmedQuery}
          </button>
        </div>
      ) : null}

      <SearchHistorySection
        recentQueries={recentQueries}
        currentQuery={currentQuery}
        onRerunSearch={onRerunSearch}
        compact={compact}
      />

      {workspaceAction}

      <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Click a result to inspect here. Add it when it becomes part of your active work.
      </p>
    </section>
  );
}

function ItemInspectorBody({
  item,
  isSearchSurface,
  recentQueries,
  currentQuery,
  onRerunSearch,
  onBrowseCategory,
  workspaceAction,
  renderWorkspaceActionForItem,
}: {
  item: Item;
  isSearchSurface: boolean;
  recentQueries: string[];
  currentQuery?: string;
  onRerunSearch?: (query: string) => void;
  onBrowseCategory?: (categoryId: string, name: string) => void;
  workspaceAction?: React.ReactNode;
  renderWorkspaceActionForItem?: (itemId: string, title: string) => React.ReactNode;
}) {
  const {
    context,
    similar,
    contextLoading: loading,
    similarLoading,
    similarError,
    reload,
  } = useInspectorItemData(item.id);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const badge = context ? resolvePipelineBadge(context) : null;
  const failureLabel = context?.enrichment
    ? resolveEnrichmentFailureLabel(context.enrichment)
    : null;
  const stageHint = context ? formatPipelineStageHint(context) : undefined;
  const unmatchedTopic = context?.acceptedLinks.length === 0 && context.suggestedLinks.length === 0
    ? context.signal?.llmReview?.novelTopicSuggestion
    : undefined;
  const visibleAcceptedLinks = context
    ? categoriesExpanded
      ? context.acceptedLinks
      : context.acceptedLinks.slice(0, COMPACT_CATEGORY_LIMIT)
    : [];
  const suggestedSlots = Math.max(0, COMPACT_CATEGORY_LIMIT - visibleAcceptedLinks.length);
  const visibleSuggestedLinks = context
    ? categoriesExpanded
      ? context.suggestedLinks
      : context.suggestedLinks.slice(0, suggestedSlots)
    : [];
  const categoryOverflowCount = context
    ? Math.max(0, context.acceptedLinks.length + context.suggestedLinks.length - COMPACT_CATEGORY_LIMIT)
    : 0;

  useEffect(() => {
    setSummaryOpen(true);
    setManageCategoriesOpen(false);
    setCategoriesExpanded(false);
  }, [item.id]);

  const enrichmentTags = context
    ? [...(context.enrichment?.aiTags ?? []), ...(context.item.tags ?? [])]
    : [];
  const hasEnrichment = Boolean(
    context?.summary ||
    enrichmentTags.length > 0 ||
    (context?.keyPoints.length ?? 0) > 0 ||
    (context?.references.length ?? 0) > 0
  );

  return (
    <>
    <div
      style={{
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        overflowY: 'auto',
        height: '100%',
      }}
      className="scrollbar ui-scroll-footer-safe"
    >
      {isSearchSurface && (
        <SearchInspectorChrome
          recentQueries={recentQueries}
          currentQuery={currentQuery}
          onRerunSearch={onRerunSearch}
          workspaceAction={workspaceAction}
          compact
        />
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
          {item.url ? <LinkVisual url={item.url} title={item.title} favicon={item.favicon} /> : null}
          <div
            style={{
              flex: 1,
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              color: 'var(--text)',
              lineHeight: 1.4,
              wordBreak: 'break-word',
            }}
          >
            {item.title || 'Untitled'}
          </div>
          {badge && <ItemPipelineBadge badge={badge} />}
        </div>
        {item.url && (
          <ItemDigestQuickActions
            itemId={item.id}
            itemUrl={item.url}
            context={context}
            badge={badge}
            enrichment={context?.enrichment}
            onDone={() => void reload()}
          />
        )}
        {stageHint ? (
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-faint)',
              lineHeight: 1.45,
            }}
          >
            {stageHint}
            {failureLabel?.reviewHint ? ` — ${failureLabel.reviewHint}` : ''}
          </p>
        ) : null}
        {item.url && (
          <ExtensionPageUrlLink
            url={item.url}
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-faint)',
              textDecoration: 'none',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          />
        )}
        {!isSearchSurface ? workspaceAction : null}
      </div>

      {loading && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>Loading…</div>
      )}

      {!loading && context && (
        <>
          <section className="ui-inspector__categories">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 5,
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: 0.3,
                marginBottom: 3,
              }}
            >
              <span>Categories</span>
              <button
                type="button"
                className="ui-button ui-button--compact ui-button--secondary"
                onClick={() => setManageCategoriesOpen(true)}
                style={{ minHeight: 22, padding: '1px 5px', fontSize: 9, textTransform: 'none', letterSpacing: 0 }}
              >
                <Tags size={10} /> Manage
              </button>
            </div>
            <p
              style={{
                margin: '0 0 5px',
                fontSize: '9px',
                color: 'var(--text-faint)',
                lineHeight: 1.3,
              }}
            >
              AI categories are semantic tags; Collections are manual folders.
            </p>
            {unmatchedTopic ? (
              <UnmatchedTopicSuggestion
                name={unmatchedTopic.name}
                description={unmatchedTopic.description}
                onReview={() => setManageCategoriesOpen(true)}
              />
            ) : null}
            {context.acceptedLinks.length === 0 && context.suggestedLinks.length === 0 ? (
              <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                {unmatchedTopic
                  ? 'No existing category was a defensible match. The topic suggestion is ready for review.'
                  : 'Not yet classified…'}
              </p>
            ) : (
              <>
                <div
                  className="scrollbar ui-compact-category-list"
                  data-expanded={categoriesExpanded ? 'true' : 'false'}
                >
                  {visibleAcceptedLinks.length > 0 && (
                    <div className="ui-compact-category-list__chips">
                      {visibleAcceptedLinks.map((l) => (
                        <CategoryChip
                          key={`a-${l.categoryId}`}
                          label={l.name}
                          parentLabel={l.parentName}
                          categoryId={l.categoryId}
                          onClick={onBrowseCategory
                            ? () => onBrowseCategory(l.categoryId, l.name)
                            : undefined}
                        />
                      ))}
                    </div>
                  )}
                  {visibleSuggestedLinks.map((l) => (
                    <SuggestedCategoryRow
                      key={`s-${l.categoryId}`}
                      itemId={item.id}
                      link={l}
                      onDone={reload}
                      onEdit={() => setManageCategoriesOpen(true)}
                    />
                  ))}
                </div>
                <CategoryOverflowToggle
                  hiddenCount={categoryOverflowCount}
                  expanded={categoriesExpanded}
                  onToggle={() => setCategoriesExpanded((value) => !value)}
                />
              </>
            )}
          </section>

          {hasEnrichment ? (
            <section className="ui-inspector__summary">
              <button
                type="button"
                className="ui-inspector__summary-toggle"
                aria-expanded={summaryOpen}
                onClick={() => setSummaryOpen((v) => !v)}
              >
                <span>
                  {summaryOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  AI summary
                </span>
                {summaryOpen ? <small>Scrollable</small> : null}
              </button>
              {summaryOpen ? (
                <div className="scrollbar ui-inspector__summary-content" tabIndex={0} aria-label="AI summary content">
                  <EnrichmentContent
                    summary={context.summary}
                    tags={enrichmentTags}
                    keyPoints={context.keyPoints}
                    references={context.references}
                    compact
                    showKeyPoints
                  />
                </div>
              ) : null}
            </section>
          ) : (
            <section className="ui-inspector__summary ui-inspector__summary--empty">
              <div className="ui-inspector__summary-heading">AI summary</div>
              <div className="scrollbar ui-inspector__summary-content" tabIndex={0} aria-label="AI summary content">
                <EnrichmentContent
                  summary={context.summary}
                  tags={enrichmentTags}
                  keyPoints={context.keyPoints}
                  references={context.references}
                  compact
                />
              </div>
            </section>
          )}

        </>
      )}

      {item.url && (
        <ItemSimilarSectionView
          similar={similar}
          loading={similarLoading}
          error={similarError}
          renderWorkspaceAction={renderWorkspaceActionForItem}
        />
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          borderTop: '1px solid var(--border)',
          paddingTop: 8,
        }}
      >
        <span>Added: {new Date(item.created_at).toLocaleDateString()}</span>
        <span>Updated: {new Date(item.updated_at).toLocaleDateString()}</span>
      </div>
      </div>
      {manageCategoriesOpen ? (
        <ManageCategoriesDialog
          itemId={item.id}
          itemTitle={item.title}
          onClose={() => setManageCategoriesOpen(false)}
          onChanged={() => void reload()}
        />
      ) : null}
    </>
  );
}

export const InspectorTab: React.FC<InspectorTabProps> = ({
  activeItem,
  activeItemLoading = false,
  isSearchSurface = false,
  currentQuery,
  recentQueries = [],
  onRerunSearch,
  onBrowseCategory,
  workspaceAction,
  renderWorkspaceActionForItem,
}) => {
  if (!activeItem && !isSearchSurface) {
    return (
      <div
        style={{
          padding: '24px 12px',
          textAlign: 'center',
          color: 'var(--text-faint)',
          fontSize: 'var(--text-xs)',
          lineHeight: 1.6,
        }}
      >
        {activeItemLoading
          ? 'Loading selected item…'
          : 'Select an item or search result to see details.'}
      </div>
    );
  }

  if (!activeItem && isSearchSurface) {
    return (
      <div
        className="scrollbar ui-scroll-footer-safe"
        style={{
          padding: '10px 12px',
          overflowY: 'auto',
          height: '100%',
        }}
      >
        <SearchInspectorChrome
          recentQueries={recentQueries}
          currentQuery={currentQuery}
          onRerunSearch={onRerunSearch}
          workspaceAction={undefined}
        />
      </div>
    );
  }

  return (
    <ItemInspectorBody
      item={activeItem!}
      isSearchSurface={isSearchSurface}
      recentQueries={recentQueries}
      currentQuery={currentQuery}
      onRerunSearch={onRerunSearch}
      onBrowseCategory={onBrowseCategory}
      workspaceAction={workspaceAction}
      renderWorkspaceActionForItem={renderWorkspaceActionForItem}
    />
  );
};
