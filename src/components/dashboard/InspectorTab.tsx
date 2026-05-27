import React, { useState } from 'react';
import { Clock, ChevronDown, ChevronRight } from 'lucide-react';
import type { Item } from '../../lib/db';
import { useItemPipelineContext } from '../../hooks/useItemPipelineContext';
import { resolvePipelineBadge, runSingleLinkDigest, type PipelineBadge } from '../../lib/pipeline';
import { ItemPipelineBadge, EnrichmentContent } from './PipelineDisplayBlocks';
import { ItemSimilarSection } from './SearchDiscoveryBlocks';
import { useToast } from '../ToastContainer';
import { CategoryChip, SuggestedCategoryRow } from '../shared/CategoryReviewRows';

interface InspectorTabProps {
  activeItem: Item | null;
  isSearchSurface?: boolean;
  currentQuery?: string;
  recentQueries?: string[];
  onRerunSearch?: (query: string) => void;
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

function InspectorDigestAction({
  itemId,
  badge,
  onDone,
}: {
  itemId: string;
  badge: PipelineBadge | null;
  onDone: () => void;
}) {
  const { addToast } = useToast();
  const [running, setRunning] = useState(false);

  const show =
    badge &&
    (badge.kind === 'failed' ||
      badge.kind === 'not_processed' ||
      badge.label === 'Pending classify' ||
      badge.kind === 'ready');

  if (!show) return null;

  const label =
    badge?.kind === 'failed'
      ? 'Retry digest'
      : badge?.label === 'Pending classify'
        ? 'Classify now'
        : badge?.kind === 'ready'
          ? 'Re-digest'
          : 'Run digest';

  const run = async () => {
    setRunning(true);
    try {
      const result = await runSingleLinkDigest(itemId, {
        forceEnrich: badge?.kind === 'failed',
      });
      addToast({
        type: result.enrich.status === 'failed' ? 'error' : 'success',
        message: result.message,
      });
      onDone();
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'Digest failed';
      addToast({ type: 'error', message: reason });
    } finally {
      setRunning(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={running}
      style={{
        alignSelf: 'flex-start',
        padding: '4px 10px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        background: 'var(--bg-glass)',
        color: 'var(--text)',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        cursor: running ? 'wait' : 'pointer',
        opacity: running ? 0.7 : 1,
      }}
    >
      {running ? 'Digesting…' : label}
    </button>
  );
}

function ItemInspectorBody({
  item,
  isSearchSurface,
  recentQueries,
  currentQuery,
  onRerunSearch,
}: {
  item: Item;
  isSearchSurface: boolean;
  recentQueries: string[];
  currentQuery?: string;
  onRerunSearch?: (query: string) => void;
}) {
  const { context, loading, reload } = useItemPipelineContext(item.id);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const badge = context ? resolvePipelineBadge(context) : null;

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
      className="scrollbar"
    >
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
          <InspectorDigestAction
            itemId={item.id}
            badge={badge}
            onDone={() => void reload()}
          />
        )}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-faint)',
              textDecoration: 'none',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.url}
          </a>
        )}
      </div>

      {loading && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>Loading…</div>
      )}

      {!loading && context && (
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
          {summaryOpen && (
            <EnrichmentContent summary={context.summary} keyPoints={context.keyPoints} compact />
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
              AI categories are separate from Collections.
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

          {item.url && <ItemSimilarSection itemId={item.id} />}
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

      {isSearchSurface && (
        <>
          <div style={{ borderTop: '1px solid var(--border)' }} />
          <SearchHistorySection
            recentQueries={recentQueries}
            currentQuery={currentQuery}
            onRerunSearch={onRerunSearch}
            compact
          />
        </>
      )}
    </div>
  );
}

export const InspectorTab: React.FC<InspectorTabProps> = ({
  activeItem,
  isSearchSurface = false,
  currentQuery,
  recentQueries = [],
  onRerunSearch,
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
        Select an item or search result to see details.
      </div>
    );
  }

  if (!activeItem && isSearchSurface) {
    return (
      <div
        className="scrollbar"
        style={{
          padding: '10px 12px',
          overflowY: 'auto',
          height: '100%',
        }}
      >
        <SearchHistorySection
          recentQueries={recentQueries}
          currentQuery={currentQuery}
          onRerunSearch={onRerunSearch}
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
    />
  );
};
