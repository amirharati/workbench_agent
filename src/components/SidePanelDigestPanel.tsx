import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useItemPipelineContext } from '../hooks/useItemPipelineContext';
import { resolvePipelineBadge } from '../lib/pipeline';
import {
  formatPipelineStageHint,
  hasPartialPipelineData,
} from '../lib/pipeline/itemPipelineContext';
import { ItemDigestQuickActions } from './dashboard/ItemDigestQuickActions';
import { EnrichmentContent, ItemPipelineBadge } from './dashboard/PipelineDisplayBlocks';
import {
  CategoryChip,
  SuggestedCategoryRow,
  type CategoryReviewFeedback,
} from './shared/CategoryReviewRows';
import { Panel } from '../styles/primitives';

interface SidePanelDigestPanelProps {
  itemId: string;
  statusLabel?: string;
  onOpenInApp?: () => void;
}

export const SidePanelDigestPanel: React.FC<SidePanelDigestPanelProps> = ({
  itemId,
  statusLabel,
  onOpenInApp,
}) => {
  const { context, loading, reload } = useItemPipelineContext(itemId);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null
  );

  const onFeedback: CategoryReviewFeedback = (message, type) => {
    setFeedback({ message, type });
  };

  const badge = context ? resolvePipelineBadge(context) : null;
  const hasData = hasPartialPipelineData(context);
  const stageHint = context ? formatPipelineStageHint(context) : undefined;
  const snippet =
    context?.enrichment?.snippet?.trim() &&
    !context.summary &&
    context.keyPoints.length === 0
      ? context.enrichment.snippet.trim().slice(0, 400)
      : undefined;

  const handleDigestDone = () => {
    reload();
  };

  return (
    <Panel
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '0.55rem',
        maxHeight: 'min(42vh, 320px)',
        minHeight: 0,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          AI digest
        </div>
        {badge ? <ItemPipelineBadge badge={badge} /> : null}
      </div>

      <ItemDigestQuickActions
        itemId={itemId}
        itemUrl={context?.item.url}
        context={context}
        badge={badge}
        enrichment={context?.enrichment}
        onDone={handleDigestDone}
      />

      {statusLabel ? (
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text)',
            lineHeight: 1.45,
            flexShrink: 0,
          }}
        >
          {statusLabel}
        </div>
      ) : null}

      {feedback ? (
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: feedback.type === 'error' ? '#ef4444' : 'var(--accent)',
            flexShrink: 0,
          }}
        >
          {feedback.message}
        </div>
      ) : null}

      {stageHint && !statusLabel?.includes(stageHint) ? (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', flexShrink: 0 }}>
          {stageHint}
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>
        {loading && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>Loading digest…</div>
        )}

        {!loading && !context && (
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
            Could not load bookmark data.
          </p>
        )}

        {!loading && context && (
          <>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginBottom: 6,
              }}
              title={context.item.title || 'Untitled'}
            >
              {context.item.title || 'Untitled'}
            </div>

            {!hasData ? (
              <p style={{ margin: '0 0 8px', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.45 }}>
                No AI data yet for this bookmark. Use Run digest to fetch and summarize the page.
              </p>
            ) : (
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
                    marginBottom: 4,
                  }}
                >
                  {summaryOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  Summary
                </button>
                {summaryOpen && (
                  <>
                    <EnrichmentContent
                      summary={context.summary}
                      keyPoints={context.keyPoints}
                      references={context.references}
                      compact
                      emptyMessage={
                        snippet
                          ? undefined
                          : 'No summary yet. Use Refresh digest to fetch or retry AI.'
                      }
                    />
                    {snippet ? (
                      <div style={{ marginTop: 6 }}>
                        <div
                          style={{
                            fontSize: 'var(--text-xs)',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            marginBottom: 4,
                          }}
                        >
                          Fetched excerpt
                        </div>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-faint)',
                            lineHeight: 1.45,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {snippet}
                          {context.enrichment!.snippet!.length > 400 ? '…' : ''}
                        </p>
                      </div>
                    ) : null}
                  </>
                )}

                <section style={{ marginTop: 8 }}>
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
                      margin: '0 0 6px',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-faint)',
                      lineHeight: 1.4,
                    }}
                  >
                    AI categories ≠ Collections.
                  </p>
                  {context.primaryCategoryName &&
                  context.acceptedLinks.length === 0 &&
                  context.suggestedLinks.length === 0 ? (
                    <CategoryChip label={context.primaryCategoryName} />
                  ) : null}
                  {context.acceptedLinks.length === 0 && context.suggestedLinks.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                      {statusLabel?.toLowerCase().includes('classif')
                        ? 'Classifying…'
                        : context.classifyState === 'manual_review'
                          ? 'In manual review — open the app or run Classify now.'
                          : 'Not yet classified.'}
                    </p>
                  ) : (
                    <>
                      {context.acceptedLinks.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                          {context.acceptedLinks.map((l) => (
                            <CategoryChip key={`a-${l.categoryId}`} label={l.name} />
                          ))}
                        </div>
                      )}
                      {context.suggestedLinks.map((l) => (
                        <SuggestedCategoryRow
                          key={`s-${l.categoryId}`}
                          itemId={context.item.id}
                          link={l}
                          onDone={reload}
                          onEdit={onOpenInApp}
                          feedback={onFeedback}
                        />
                      ))}
                    </>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </Panel>
  );
};
