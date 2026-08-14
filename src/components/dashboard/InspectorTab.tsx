import React, { useEffect, useState } from 'react';
import { Clock, ChevronDown, ChevronRight } from 'lucide-react';
import type { Item } from '../../lib/db';
import { useItemPipelineContext } from '../../hooks/useItemPipelineContext';
import { resolveEnrichmentFailureLabel } from '../../lib/enrichment/failureLabels';
import { resolvePipelineBadge } from '../../lib/pipeline';
import { formatPipelineStageHint } from '../../lib/pipeline/itemPipelineContext';
import { ItemPipelineBadge, EnrichmentContent } from './PipelineDisplayBlocks';
import { ItemSimilarSection } from './SearchDiscoveryBlocks';
import { ItemDigestQuickActions } from './ItemDigestQuickActions';
import { CategoryChip, SuggestedCategoryRow } from '../shared/CategoryReviewRows';
import { ExtensionPageUrlLink } from './BookmarkUrlLink';

interface InspectorTabProps {
  activeItem: Item | null;
  activeItemLoading?: boolean;
  isSearchSurface?: boolean;
  enrichmentPrimaryInItemTab?: boolean;
  currentQuery?: string;
  recentQueries?: string[];
  onRerunSearch?: (query: string) => void;
  onOpenItemInTab?: (item: Item) => void;
  /** Open a related/similar bookmark by id (workspace tab). */
  onOpenItemIdInTab?: (itemId: string) => void;
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
  activeItem,
  onOpenItemInTab,
  compact,
}: {
  recentQueries: string[];
  currentQuery?: string;
  onRerunSearch?: (query: string) => void;
  activeItem?: Item | null;
  onOpenItemInTab?: (item: Item) => void;
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

      {activeItem && onOpenItemInTab ? (
        <button
          type="button"
          onClick={() => onOpenItemInTab(activeItem)}
          style={{
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: 'var(--bg-glass)',
            color: 'var(--text)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          Add to workspace
        </button>
      ) : null}

      <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Click a result to inspect here. Add it when it becomes part of your active work.
      </p>
    </section>
  );
}

function ItemInspectorBody({
  item,
  isSearchSurface,
  enrichmentPrimaryInItemTab = false,
  recentQueries,
  currentQuery,
  onRerunSearch,
  onOpenItemInTab,
  onOpenItemIdInTab,
}: {
  item: Item;
  isSearchSurface: boolean;
  enrichmentPrimaryInItemTab?: boolean;
  recentQueries: string[];
  currentQuery?: string;
  onRerunSearch?: (query: string) => void;
  onOpenItemInTab?: (item: Item) => void;
  onOpenItemIdInTab?: (itemId: string) => void;
}) {
  const { context, loading, reload } = useItemPipelineContext(item.id);
  const [summaryOpen, setSummaryOpen] = useState(!enrichmentPrimaryInItemTab);
  const badge = context ? resolvePipelineBadge(context) : null;
  const failureLabel = context?.enrichment
    ? resolveEnrichmentFailureLabel(context.enrichment)
    : null;
  const stageHint = context ? formatPipelineStageHint(context) : undefined;

  useEffect(() => {
    setSummaryOpen(!enrichmentPrimaryInItemTab);
  }, [item.id, enrichmentPrimaryInItemTab]);

  const hasEnrichment = Boolean(context?.summary || (context?.keyPoints.length ?? 0) > 0);

  return (
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
          activeItem={item}
          onOpenItemInTab={onOpenItemInTab}
          compact
        />
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
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
        {!isSearchSurface && onOpenItemInTab && (
          <button
            type="button"
            onClick={() => onOpenItemInTab(item)}
            style={{ marginTop: 8, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-glass)', color: 'var(--text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}
          >
            Add to workspace
          </button>
        )}
      </div>

      {loading && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>Loading…</div>
      )}

      {!loading && context && (
        <>
          {hasEnrichment && (
            <>
              <button
                type="button"
                onClick={() => setSummaryOpen((v) => !v)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                {summaryOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                AI summary
              </button>
              {!summaryOpen && enrichmentPrimaryInItemTab && (
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5 }}>
                  Full summary and key points are in the item tab.
                </p>
              )}
              {summaryOpen && (
                <EnrichmentContent
                  summary={context.summary}
                  keyPoints={context.keyPoints}
                  references={context.references}
                  compact
                  showKeyPoints={!enrichmentPrimaryInItemTab}
                />
              )}
            </>
          )}

          {!hasEnrichment && (
            <EnrichmentContent
              summary={context.summary}
              keyPoints={context.keyPoints}
              references={context.references}
              compact
            />
          )}

          <section>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
                marginBottom: 4,
              }}
            >
              Categories
            </div>
            <p
              style={{
                margin: '0 0 8px',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-faint)',
                lineHeight: 1.45,
              }}
            >
              AI categories are semantic tags; Collections are manual folders.
            </p>
            {context.acceptedLinks.length === 0 && context.suggestedLinks.length === 0 ? (
              <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                Not yet classified…
              </p>
            ) : (
              <>
                {context.acceptedLinks.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                    {context.acceptedLinks.map((l) => (
                      <CategoryChip key={`a-${l.categoryId}`} label={l.name} />
                    ))}
                  </div>
                )}
                {context.suggestedLinks.length > 0 && (
                  <div>
                    {context.suggestedLinks.map((l) => (
                      <SuggestedCategoryRow
                        key={`s-${l.categoryId}`}
                        itemId={item.id}
                        link={l}
                        onDone={reload}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {item.url && (
            <ItemSimilarSection itemId={item.id} onOpenInTab={onOpenItemIdInTab} />
          )}
        </>
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
  );
}

export const InspectorTab: React.FC<InspectorTabProps> = ({
  activeItem,
  activeItemLoading = false,
  isSearchSurface = false,
  enrichmentPrimaryInItemTab = false,
  currentQuery,
  recentQueries = [],
  onRerunSearch,
  onOpenItemInTab,
  onOpenItemIdInTab,
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
          onOpenItemInTab={undefined}
        />
      </div>
    );
  }

  return (
    <ItemInspectorBody
      item={activeItem!}
      isSearchSurface={isSearchSurface}
      enrichmentPrimaryInItemTab={enrichmentPrimaryInItemTab}
      recentQueries={recentQueries}
      currentQuery={currentQuery}
      onRerunSearch={onRerunSearch}
      onOpenItemInTab={onOpenItemInTab}
      onOpenItemIdInTab={onOpenItemIdInTab}
    />
  );
};
